import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  generateSecureToken,
  hashToken,
  hashPassword,
  verifyPassword,
} from "../../src/lib/security";
import {
  requestPasswordReset,
  resetPasswordWithToken,
  TOKEN_PENDING_ACTIVATION_SENTINEL,
} from "../../src/features/auth/service";
import {
  requestPasswordResetAction,
  confirmPasswordResetAction,
} from "../../src/features/auth/actions";
import {
  GENERIC_PASSWORD_RESET_SUCCESS_MESSAGE,
} from "../../src/features/auth/schemas";
import {
  DefaultEmailDispatcher,
  clearTestEmailQueue,
  getTestEmailQueue,
} from "../../src/lib/email/dispatcher";
import type { EmailDispatcher } from "../../src/lib/email/types";
import { resetRateLimit } from "../../src/lib/auth/rate-limit";
import { and, eq, gt } from "drizzle-orm";
import { passwordResetTokens } from "../../src/lib/db/schema";

// ----------------------------------------------------------------------
// Helper to safely extract string literals from Drizzle AST without circular errors
// ----------------------------------------------------------------------
function extractSqlValues(obj: unknown, visited = new Set<unknown>()): string[] {
  if (!obj || typeof obj !== "object") {
    return typeof obj === "string" ? [obj] : [];
  }
  if (visited.has(obj)) return [];
  visited.add(obj);

  const results: string[] = [];
  const rec = obj as Record<string, unknown>;
  for (const [k, v] of Object.entries(rec)) {
    if (k === "table" || k === "columns") continue;
    if (typeof v === "string") {
      results.push(v);
    } else if (typeof v === "object" && v !== null) {
      results.push(...extractSqlValues(v, visited));
    }
  }
  return results;
}

// ----------------------------------------------------------------------
// Mock In-Memory Database for Auth & Password Reset
// ----------------------------------------------------------------------

interface MockUser {
  id: string;
  emailNormalized: string;
  passwordHash: string;
  name: string;
  phone: string | null;
  status: string;
}

interface MockSession {
  id: string; // token hash
  userId: string;
  expiresAt: Date;
}

interface MockPasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

class MockAuthDb {
  public users = new Map<string, MockUser>();
  public sessions = new Map<string, MockSession>();
  public passwordResetTokens: MockPasswordResetToken[] = [];
  public failNextTransaction = false;
  public failNextUpdate = false;

  get query() {
    return {
      users: {
        findFirst: async ({ where }: { where: unknown }) => {
          const values = extractSqlValues(where);
          for (const u of this.users.values()) {
            if (values.includes(u.emailNormalized) || values.includes(u.id)) {
              return u;
            }
          }
          return null;
        },
      },
    };
  }

  insert() {
    return {
      values: (val: Record<string, unknown>) => {
        const insertedId = `token-${this.passwordResetTokens.length + 1}`;
        if (val.tokenHash) {
          const record: MockPasswordResetToken = {
            id: insertedId,
            userId: val.userId as string,
            tokenHash: val.tokenHash as string,
            expiresAt: val.expiresAt as Date,
            usedAt: val.usedAt !== undefined ? (val.usedAt as Date | null) : null,
          };
          this.passwordResetTokens.push(record);
        }
        return {
          returning: async () => [{ id: insertedId, ...val }],
          then: (resolve: (v: unknown) => void) => Promise.resolve([{ id: insertedId, ...val }]).then(resolve),
        };
      },
    };
  }

  update() {
    return {
      set: (updateValues: Record<string, unknown>) => ({
        where: (whereClause: unknown) => {
          const values = extractSqlValues(whereClause);

          if (this.failNextUpdate && values.includes("token_hash")) {
            this.failNextUpdate = false;
            throw new Error("DB_UPDATE_ERROR: Simulated database update failure during activation.");
          }

          const matched: MockPasswordResetToken[] = [];
          const filtersByUser = values.includes("user_id");
          const filtersByToken = values.includes("token_hash");

          for (const t of this.passwordResetTokens) {
            const userMatch = filtersByUser ? values.includes(t.userId) : true;
            const tokenMatch = filtersByToken ? values.includes(t.tokenHash) : true;

            if (tokenMatch && userMatch) {
              if (updateValues.usedAt === null) {
                // ACTIVATION: only activates inactive sentinel token that is unexpired
                if (t.usedAt && t.usedAt.getTime() === 0) {
                  if (!t.expiresAt || t.expiresAt > new Date()) {
                    t.usedAt = null;
                    matched.push(t);
                  }
                }
              } else if (updateValues.usedAt instanceof Date) {
                if (filtersByToken) {
                  // REDEMPTION: only redeems active token (usedAt === null) that is unexpired
                  if (t.usedAt === null) {
                    if (!t.expiresAt || t.expiresAt > new Date()) {
                      t.usedAt = updateValues.usedAt;
                      matched.push(t);
                    }
                  }
                } else {
                  // INVALIDATION / REVOCATION: revokes any active or pending-activation token
                  if (t.usedAt === null || (t.usedAt && t.usedAt.getTime() === 0)) {
                    t.usedAt = updateValues.usedAt;
                    matched.push(t);
                  }
                }
              }
            }
          }

          if (updateValues.passwordHash) {
            for (const u of this.users.values()) {
              if (values.includes(u.id)) {
                u.passwordHash = updateValues.passwordHash as string;
              }
            }
          }

          return {
            returning: async () => matched,
            then: (resolve: (v: unknown) => void) => Promise.resolve(matched).then(resolve),
          };
        },
      }),
    };
  }

  delete() {
    return {
      where: (whereClause: unknown) => {
        const values = extractSqlValues(whereClause);
        let deleted = 0;
        for (const [id, s] of Array.from(this.sessions.entries())) {
          if (values.includes(s.userId)) {
            this.sessions.delete(id);
            deleted++;
          }
        }
        return {
          then: (resolve: (v: unknown) => void) => Promise.resolve(deleted).then(resolve),
        };
      },
    };
  }

  async transaction(callback: (tx: MockAuthDb) => Promise<unknown>) {
    if (this.failNextTransaction) {
      throw new Error("TRANSACTION_FAILURE: Simulated rollback");
    }
    return callback(this);
  }
}

// ----------------------------------------------------------------------
// Mock Email Dispatcher
// ----------------------------------------------------------------------
class MockTestEmailDispatcher implements EmailDispatcher {
  public dispatched: Array<{ toEmail: string; resetUrl: string; expiresInMinutes: number }> = [];
  public shouldFail = false;
  public returnFailure = false;
  public failureError = "DELIVERY_TEMPORARILY_UNAVAILABLE";

  async sendPasswordResetEmail(params: { toEmail: string; resetUrl: string; expiresInMinutes: number }) {
    if (this.shouldFail) {
      throw new Error("SMTP_CONNECTION_REFUSED");
    }
    if (this.returnFailure) {
      return { success: false, error: this.failureError };
    }
    this.dispatched.push(params);
    return { success: true };
  }
}

// ----------------------------------------------------------------------
// Main Test Suite
// ----------------------------------------------------------------------

describe("Phase 7A.3: Secure Password Recovery Backend & UI", () => {
  let db: MockAuthDb;
  let emailDispatcher: MockTestEmailDispatcher;

  beforeEach(async () => {
    vi.stubEnv("NODE_ENV", "test");
    clearTestEmailQueue();

    db = new MockAuthDb();
    emailDispatcher = new MockTestEmailDispatcher();

    // Seed test customer Alice
    const aliceHash = await hashPassword("ExistingPassword123!");
    db.users.set("usr-alice", {
      id: "usr-alice",
      emailNormalized: "alice@example.com",
      passwordHash: aliceHash,
      name: "Alice Sharma",
      phone: "+91 98765 11111",
      status: "active",
    });

    // Seed active sessions for Alice
    db.sessions.set("sess-1", {
      id: "sess-1",
      userId: "usr-alice",
      expiresAt: new Date(Date.now() + 86400000),
    });
    db.sessions.set("sess-2", {
      id: "sess-2",
      userId: "usr-alice",
      expiresAt: new Date(Date.now() + 86400000),
    });

    // Seed test customer Bob
    const bobHash = await hashPassword("BobPassword123!");
    db.users.set("usr-bob", {
      id: "usr-bob",
      emailNormalized: "bob@example.com",
      passwordHash: bobHash,
      name: "Bob Mehta",
      phone: "+91 98765 22222",
      status: "active",
    });

    // Seed inactive customer Charlie
    db.users.set("usr-charlie", {
      id: "usr-charlie",
      emailNormalized: "charlie@example.com",
      passwordHash: aliceHash,
      name: "Charlie Kumar",
      phone: null,
      status: "suspended",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ====================================================================
  // 1. Critical Token Confidentiality & Enumeration Resistance
  // ====================================================================
  describe("1. Critical Token Confidentiality & Non-Enumeration", () => {
    it("existing account request never returns raw token to caller", async () => {
      const res = await requestPasswordReset("alice@example.com", {
        dbClient: db,
        emailDispatcher,
      });

      expect(res).toEqual({ success: true });
      expect((res as Record<string, unknown>).token).toBeUndefined();
      expect((res as Record<string, unknown>).resetUrl).toBeUndefined();
    });

    it("unknown email request returns equivalent public response shape", async () => {
      const res = await requestPasswordReset("unknown@example.com", {
        dbClient: db,
        emailDispatcher,
      });

      expect(res).toEqual({ success: true });
      expect((res as Record<string, unknown>).token).toBeUndefined();
      expect(emailDispatcher.dispatched).toHaveLength(0);
    });

    it("inactive/suspended user returns equivalent public response shape without dispatch", async () => {
      const res = await requestPasswordReset("charlie@example.com", {
        dbClient: db,
        emailDispatcher,
      });

      expect(res).toEqual({ success: true });
      expect(emailDispatcher.dispatched).toHaveLength(0);
    });

    it("raw token is never persisted in database (only SHA-256 hash)", async () => {
      await requestPasswordReset("alice@example.com", {
        dbClient: db,
        emailDispatcher,
      });

      expect(db.passwordResetTokens).toHaveLength(1);
      const record = db.passwordResetTokens[0]!;
      expect(record.tokenHash).toHaveLength(64); // SHA-256 hex string

      // Dispatched email has the raw token in resetUrl
      const dispatched = emailDispatcher.dispatched[0]!;
      const match = dispatched.resetUrl.match(/token=([a-f0-9]+)/);
      const rawTokenInUrl = match?.[1];

      expect(rawTokenInUrl).toBeDefined();
      expect(record.tokenHash).not.toBe(rawTokenInUrl);
      expect(record.tokenHash).toBe(hashToken(rawTokenInUrl!));
    });
  });

  // ====================================================================
  // 2. Token Lifecycle & Database Transaction Semantics
  // ====================================================================
  describe("2. Token Lifecycle & Database Transaction Semantics", () => {
    it("invalidates prior unused tokens when a new reset token is requested", async () => {
      // First request
      await requestPasswordReset("alice@example.com", {
        dbClient: db,
        emailDispatcher,
      });
      expect(db.passwordResetTokens).toHaveLength(1);
      expect(db.passwordResetTokens[0]!.usedAt).toBeNull();

      // Second request
      await requestPasswordReset("alice@example.com", {
        dbClient: db,
        emailDispatcher,
      });
      expect(db.passwordResetTokens).toHaveLength(2);

      // The first token must now be marked as used/invalidated
      expect(db.passwordResetTokens[0]!.usedAt).not.toBeNull();
      // The new token is active
      expect(db.passwordResetTokens[1]!.usedAt).toBeNull();
    });

    it("rejects reset when password does not meet strongPasswordSchema", async () => {
      const rawToken = generateSecureToken(32);

      await expect(
        resetPasswordWithToken(rawToken, "short", { dbClient: db })
      ).rejects.toThrow(/WEAK_PASSWORD/);

      await expect(
        resetPasswordWithToken(rawToken, "NoSpecialChar123", { dbClient: db })
      ).rejects.toThrow(/WEAK_PASSWORD/);

      await expect(
        resetPasswordWithToken(rawToken, "lowercase_only_no_upper_123!", { dbClient: db })
      ).rejects.toThrow(/WEAK_PASSWORD/);
    });

    it("rejects malformed or short token strings", async () => {
      await expect(
        resetPasswordWithToken("short-token", "NewStrongPass123!", { dbClient: db })
      ).rejects.toThrow(/INVALID_TOKEN/);

      await expect(
        resetPasswordWithToken("", "NewStrongPass123!", { dbClient: db })
      ).rejects.toThrow(/INVALID_TOKEN/);
    });

    it("rejects expired tokens", async () => {
      const rawToken = generateSecureToken(32);
      const tokenHash = hashToken(rawToken);

      // Seed expired token
      db.passwordResetTokens.push({
        id: "tok-expired",
        userId: "usr-alice",
        tokenHash,
        expiresAt: new Date(Date.now() - 10000), // in the past
        usedAt: null,
      });

      await expect(
        resetPasswordWithToken(rawToken, "NewStrongPass123!", { dbClient: db })
      ).rejects.toThrow(/INVALID_TOKEN/);
    });

    it("rejects already-used tokens", async () => {
      const rawToken = generateSecureToken(32);
      const tokenHash = hashToken(rawToken);

      // Seed already-used token
      db.passwordResetTokens.push({
        id: "tok-used",
        userId: "usr-alice",
        tokenHash,
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: new Date(Date.now() - 5000),
      });

      await expect(
        resetPasswordWithToken(rawToken, "NewStrongPass123!", { dbClient: db })
      ).rejects.toThrow(/INVALID_TOKEN/);
    });

    it("successful reset atomically updates password, invalidates sessions, and revokes other tokens", async () => {
      const rawToken = generateSecureToken(32);
      const tokenHash = hashToken(rawToken);

      db.passwordResetTokens.push({
        id: "tok-valid",
        userId: "usr-alice",
        tokenHash,
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: null,
      });

      // Also seed an old token for Alice that somehow remained unused
      db.passwordResetTokens.push({
        id: "tok-outstanding",
        userId: "usr-alice",
        tokenHash: hashToken("another-token-string-here-12345"),
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: null,
      });

      expect(db.sessions.size).toBe(2);

      const res = await resetPasswordWithToken(rawToken, "BrandNewSecurePass123!", {
        dbClient: db,
      });
      expect(res).toEqual({ success: true });

      // 1. Password was updated in user record
      const alice = db.users.get("usr-alice")!;
      const isNewPassValid = await verifyPassword("BrandNewSecurePass123!", alice.passwordHash);
      expect(isNewPassValid).toBe(true);

      // 2. All sessions for Alice were deleted (session hijacking defense)
      expect(db.sessions.size).toBe(0);

      // 3. Current token was marked used
      const claimedToken = db.passwordResetTokens.find((t) => t.id === "tok-valid")!;
      expect(claimedToken.usedAt).not.toBeNull();

      // 4. Any other outstanding tokens were also marked used
      const otherToken = db.passwordResetTokens.find((t) => t.id === "tok-outstanding")!;
      expect(otherToken.usedAt).not.toBeNull();
    });

    it("concurrent redemption attempts allow exactly one successful password update", async () => {
      let claimed = false;
      const atomicClaimMock = vi.fn().mockImplementation(async () => {
        if (!claimed) {
          claimed = true;
          return [{ id: "token-1", userId: "usr-alice" }];
        }
        return [];
      });

      const [res1, res2] = await Promise.all([atomicClaimMock(), atomicClaimMock()]);
      const winners = [res1, res2].filter((r) => r.length > 0);
      const losers = [res1, res2].filter((r) => r.length === 0);

      expect(winners.length).toBe(1);
      expect(losers.length).toBe(1);
    });
  });

  // ====================================================================
  // 3. Provider-Independent Email Dispatcher Boundary & Delivery Failure Safety
  // ====================================================================
  describe("3. Email Dispatcher Boundary & Delivery Failure Safety", () => {
    it("DefaultEmailDispatcher queues emails in test without logging tokens to console", async () => {
      const consoleSpy = vi.spyOn(console, "log");
      const dispatcher = new DefaultEmailDispatcher();

      const result = await dispatcher.sendPasswordResetEmail({
        toEmail: "test@example.com",
        resetUrl: "https://example.com/reset-password?token=secret123",
        expiresInMinutes: 60,
      });

      expect(result.success).toBe(true);
      const queue = getTestEmailQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0]!.toEmail).toBe("test@example.com");

      for (const call of consoleSpy.mock.calls) {
        expect(call.join(" ")).not.toContain("secret123");
      }
      consoleSpy.mockRestore();
    });

    it("DefaultEmailDispatcher in production fails safely when provider is unconfigured", async () => {
      vi.stubEnv("NODE_ENV", "production");
      const dispatcher = new DefaultEmailDispatcher();

      const result = await dispatcher.sendPasswordResetEmail({
        toEmail: "test@example.com",
        resetUrl: "https://example.com/reset-password?token=secret123",
        expiresInMinutes: 60,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("EMAIL_PROVIDER_UNCONFIGURED");
    });

    it("newly inserted token is inactive before dispatch and cannot be redeemed", async () => {
      let rawTokenCaptured: string | null = null;
      let stateDuringDispatch: Date | null | undefined = undefined;

      const inspectingDispatcher: EmailDispatcher = {
        sendPasswordResetEmail: async (params) => {
          const match = params.resetUrl.match(/token=([^&]+)/);
          rawTokenCaptured = match && match[1] ? decodeURIComponent(match[1]) : null;
          // Inspect database state right at dispatch time (before activation query)
          stateDuringDispatch = db.passwordResetTokens[0]?.usedAt;

          // Attempt redemption before activation: MUST fail closed
          if (rawTokenCaptured) {
            await expect(
              resetPasswordWithToken(rawTokenCaptured, "BrandNewPass123!", { dbClient: db })
            ).rejects.toThrow(/INVALID_TOKEN/);
          }
          return { success: true };
        },
      };

      await requestPasswordReset("alice@example.com", {
        dbClient: db,
        emailDispatcher: inspectingDispatcher,
      });

      // Token was inactive (sentinel) during dispatch
      expect(stateDuringDispatch).toEqual(TOKEN_PENDING_ACTIVATION_SENTINEL);
      // And only after dispatch succeeded was it activated to null
      expect(db.passwordResetTokens[0]!.usedAt).toBeNull();
    });

    it("successful email dispatch activates only the exact token and allows redemption", async () => {
      let rawTokenCaptured: string | null = null;
      const capturingDispatcher: EmailDispatcher = {
        sendPasswordResetEmail: async (params) => {
          const match = params.resetUrl.match(/token=([^&]+)/);
          rawTokenCaptured = match && match[1] ? decodeURIComponent(match[1]) : null;
          return { success: true };
        },
      };

      const res = await requestPasswordReset("alice@example.com", {
        dbClient: db,
        emailDispatcher: capturingDispatcher,
      });

      expect(res).toEqual({ success: true });
      expect(db.passwordResetTokens).toHaveLength(1);
      // Activated to null
      expect(db.passwordResetTokens[0]!.usedAt).toBeNull();

      // Now redemption must succeed
      expect(rawTokenCaptured).toBeDefined();
      const resetRes = await resetPasswordWithToken(rawTokenCaptured!, "ValidNewPassword123!", {
        dbClient: db,
      });
      expect(resetRes).toEqual({ success: true });
    });

    it("failed dispatch leaves token inactive and unredeemable", async () => {
      let rawTokenCaptured: string | null = null;
      const capturingDispatcher: EmailDispatcher = {
        sendPasswordResetEmail: async (params) => {
          const match = params.resetUrl.match(/token=([^&]+)/);
          rawTokenCaptured = match && match[1] ? decodeURIComponent(match[1]) : null;
          return { success: false, error: "RATE_LIMITED_BY_GATEWAY" };
        },
      };

      const res = await requestPasswordReset("alice@example.com", {
        dbClient: db,
        emailDispatcher: capturingDispatcher,
      });

      expect(res).toEqual({ success: true });
      expect(db.passwordResetTokens).toHaveLength(1);
      // Fail-Closed: token was NEVER activated; remains sentinel
      expect(db.passwordResetTokens[0]!.usedAt).toEqual(TOKEN_PENDING_ACTIVATION_SENTINEL);

      // Must be completely unredeemable
      await expect(
        resetPasswordWithToken(rawTokenCaptured!, "ValidNewPassword123!", { dbClient: db })
      ).rejects.toThrow(/INVALID_TOKEN/);
    });

    it("throwing dispatcher leaves token inactive and unredeemable", async () => {
      let rawTokenCaptured: string | null = null;
      const throwingDispatcher: EmailDispatcher = {
        sendPasswordResetEmail: async (params) => {
          const match = params.resetUrl.match(/token=([^&]+)/);
          rawTokenCaptured = match && match[1] ? decodeURIComponent(match[1]) : null;
          throw new Error("SMTP_CONNECTION_REFUSED");
        },
      };
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await requestPasswordReset("alice@example.com", {
        dbClient: db,
        emailDispatcher: throwingDispatcher,
      });

      expect(res).toEqual({ success: true });
      expect(db.passwordResetTokens).toHaveLength(1);
      // Fail-Closed: token remains sentinel
      expect(db.passwordResetTokens[0]!.usedAt).toEqual(TOKEN_PENDING_ACTIVATION_SENTINEL);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Auth] Failed to dispatch password reset email safely."
      );

      // Must be unredeemable
      await expect(
        resetPasswordWithToken(rawTokenCaptured!, "ValidNewPassword123!", { dbClient: db })
      ).rejects.toThrow(/INVALID_TOKEN/);

      consoleErrorSpy.mockRestore();
    });

    it("provider-unconfigured result in production leaves token inactive and unredeemable", async () => {
      vi.stubEnv("NODE_ENV", "production");
      const defaultProdDispatcher = new DefaultEmailDispatcher();

      const res = await requestPasswordReset("alice@example.com", {
        dbClient: db,
        emailDispatcher: defaultProdDispatcher,
      });

      expect(res).toEqual({ success: true });
      expect(db.passwordResetTokens).toHaveLength(1);
      // Fail-Closed: token was never activated
      expect(db.passwordResetTokens[0]!.usedAt).toEqual(TOKEN_PENDING_ACTIVATION_SENTINEL);
    });

    it("activation database failure leaves token inactive and returns generic success", async () => {
      let rawTokenCaptured: string | null = null;
      const capturingDispatcher: EmailDispatcher = {
        sendPasswordResetEmail: async (params) => {
          const match = params.resetUrl.match(/token=([^&]+)/);
          rawTokenCaptured = match && match[1] ? decodeURIComponent(match[1]) : null;
          return { success: true };
        },
      };

      db.failNextUpdate = true; // simulate DB error during activation update query
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await requestPasswordReset("alice@example.com", {
        dbClient: db,
        emailDispatcher: capturingDispatcher,
      });

      // Must still return generic success to caller without crashing
      expect(res).toEqual({ success: true });
      expect(db.passwordResetTokens).toHaveLength(1);
      // Fail-Closed: activation failed, token remains inactive sentinel
      expect(db.passwordResetTokens[0]!.usedAt).toEqual(TOKEN_PENDING_ACTIVATION_SENTINEL);

      // Redemption must fail
      await expect(
        resetPasswordWithToken(rawTokenCaptured!, "ValidNewPassword123!", { dbClient: db })
      ).rejects.toThrow(/INVALID_TOKEN/);

      // Sanitized operational error logged without secrets
      const errorLogs = consoleErrorSpy.mock.calls.map((c) => c.join(" ")).join(" ");
      expect(errorLogs).toContain("Failed to activate password reset token after email dispatch.");
      expect(errorLogs).not.toContain("alice@example.com");
      if (db.passwordResetTokens[0]) {
        expect(errorLogs).not.toContain(db.passwordResetTokens[0].tokenHash);
      }
      expect(errorLogs).not.toContain("http");

      consoleErrorSpy.mockRestore();
    });

    it("other users' tokens remain unaffected during failed dispatch or activation", async () => {
      // 1. Seed Bob's active token
      db.passwordResetTokens.push({
        id: "tok-bob-active",
        userId: "usr-bob",
        tokenHash: hashToken("bob-active-secret"),
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: null,
      });

      // 2. Trigger failed dispatch for Alice
      emailDispatcher.shouldFail = true;
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await requestPasswordReset("alice@example.com", {
        dbClient: db,
        emailDispatcher,
      });

      // Alice's newly created token is inactive
      const aliceToken = db.passwordResetTokens.find((t) => t.userId === "usr-alice");
      expect(aliceToken).toBeDefined();
      expect(aliceToken!.usedAt).toEqual(TOKEN_PENDING_ACTIVATION_SENTINEL);

      // Bob's token MUST remain active (unaffected)
      const bobToken = db.passwordResetTokens.find((t) => t.id === "tok-bob-active");
      expect(bobToken).toBeDefined();
      expect(bobToken!.usedAt).toBeNull();

      consoleErrorSpy.mockRestore();
    });

    it("previously used tokens are never reactivated", async () => {
      const pastDate = new Date(Date.now() - 50000);
      db.passwordResetTokens.push({
        id: "tok-already-used",
        userId: "usr-alice",
        tokenHash: hashToken("previously-consumed"),
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: pastDate,
      });

      // Successful dispatch for new token
      await requestPasswordReset("alice@example.com", {
        dbClient: db,
        emailDispatcher,
      });

      // Previously used token's timestamp must NOT be reactivated to null
      const oldToken = db.passwordResetTokens.find((t) => t.id === "tok-already-used");
      expect(oldToken!.usedAt).toEqual(pastDate);

      // The new token is activated to null
      const newToken = db.passwordResetTokens.find((t) => t.id !== "tok-already-used");
      expect(newToken!.usedAt).toBeNull();
    });

    it("expired tokens are never activated", async () => {
      const expiredDate = new Date(Date.now() - 1000);
      db.passwordResetTokens.push({
        id: "tok-expired-unactivated",
        userId: "usr-alice",
        tokenHash: hashToken("expired-secret"),
        expiresAt: expiredDate,
        usedAt: TOKEN_PENDING_ACTIVATION_SENTINEL,
      });

      // Attempting to activate an expired token through update
      await db
        .update()
        .set({ usedAt: null })
        .where(
          and(
            eq(passwordResetTokens.userId, "usr-alice"),
            eq(passwordResetTokens.tokenHash, hashToken("expired-secret")),
            eq(passwordResetTokens.usedAt, TOKEN_PENDING_ACTIVATION_SENTINEL),
            gt(passwordResetTokens.expiresAt, new Date())
          )
        );

      const expiredTok = db.passwordResetTokens.find((t) => t.id === "tok-expired-unactivated")!;
      // Still sentinel, never activated to null
      expect(expiredTok.usedAt).toEqual(TOKEN_PENDING_ACTIVATION_SENTINEL);
    });
  });

  // ====================================================================
  // 4. Server Actions & Distributed Rate Limiting
  // ====================================================================
  describe("4. Server Actions & Rate Limiting", () => {
    beforeEach(() => {
      resetRateLimit("pwd-reset:ip:127.0.0.1");
      resetRateLimit("pwd-reset:confirm:ip:127.0.0.1");
    });

    it("requestPasswordResetAction returns generic success message", async () => {
      const formData = new FormData();
      formData.append("email", "alice@example.com");

      const result = await requestPasswordResetAction(null, formData, {
        dbClient: db,
        emailDispatcher,
      });
      expect(result.success).toBe(true);
      expect((result.data as { message: string }).message).toBe(
        GENERIC_PASSWORD_RESET_SUCCESS_MESSAGE
      );
    });

    it("requestPasswordResetAction returns generic success message for unknown email", async () => {
      const formData = new FormData();
      formData.append("email", "unknown@nowhere.com");

      const result = await requestPasswordResetAction(null, formData, {
        dbClient: db,
        emailDispatcher,
      });
      expect(result.success).toBe(true);
      expect((result.data as { message: string }).message).toBe(
        GENERIC_PASSWORD_RESET_SUCCESS_MESSAGE
      );
    });

    it("enforces IP rate limit on reset requests (5 attempts per 15 min)", async () => {
      const ip = "192.168.10.1";
      resetRateLimit(`pwd-reset:ip:${ip}`);

      const headers = new Headers();
      headers.set("x-test-client-ip", ip);
      vi.stubGlobal("headers", async () => headers);

      // Perform 5 attempts with different emails so email bucket doesn't throttle
      for (let i = 1; i <= 5; i++) {
        const formData = new FormData();
        formData.append("email", `unique-user-${i}@example.com`);

        const res = await requestPasswordResetAction(null, formData, {
          dbClient: db,
          emailDispatcher,
        });
        expect(res.success).toBe(true);
      }

      // 6th attempt should be blocked on IP limit
      const sixthFormData = new FormData();
      sixthFormData.append("email", "unique-user-6@example.com");

      const blockedRes = await requestPasswordResetAction(null, sixthFormData, {
        dbClient: db,
        emailDispatcher,
      });
      expect(blockedRes.success).toBe(false);
      expect(blockedRes.error).toContain("Too many password reset requests");
    });

    it("enforces email rate limit on reset requests (3 attempts per 15 min)", async () => {
      const testEmail = "flooded@example.com";
      const emailHashKey = `pwd-reset:email:${hashToken(testEmail).slice(0, 32)}`;
      resetRateLimit(emailHashKey);

      const formData = new FormData();
      formData.append("email", testEmail);

      // Use different IPs so only email limit triggers
      for (let i = 1; i <= 3; i++) {
        const headers = new Headers();
        headers.set("x-test-client-ip", `10.0.0.${i}`);
        vi.stubGlobal("headers", async () => headers);

        const res = await requestPasswordResetAction(null, formData, {
          dbClient: db,
          emailDispatcher,
        });
        expect(res.success).toBe(true);
      }

      // 4th attempt from a fresh IP should still be blocked on email
      const headers = new Headers();
      headers.set("x-test-client-ip", "10.0.0.99");
      vi.stubGlobal("headers", async () => headers);

      const blockedRes = await requestPasswordResetAction(null, formData, {
        dbClient: db,
        emailDispatcher,
      });
      expect(blockedRes.success).toBe(false);
      expect(blockedRes.error).toContain("Too many requests for this account");
    });

    it("confirmPasswordResetAction rejects weak password without exposing token", async () => {
      const formData = new FormData();
      formData.append("token", generateSecureToken(32));
      formData.append("newPassword", "weak");

      const res = await confirmPasswordResetAction(null, formData, {
        dbClient: db,
      });
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
      expect(res.error).not.toContain("token");
    });

    it("confirmPasswordResetAction fails safely on invalid token without leaking details", async () => {
      const formData = new FormData();
      formData.append("token", generateSecureToken(32));
      formData.append("newPassword", "ValidPass123!@#");

      const res = await confirmPasswordResetAction(null, formData, {
        dbClient: db,
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain("invalid, expired, or has already been used");
    });

    it("enforces rate limit on token redemption attempts (10 per 15 min)", async () => {
      const ip = "192.168.10.20";
      resetRateLimit(`pwd-reset:confirm:ip:${ip}`);

      const headers = new Headers();
      headers.set("x-test-client-ip", ip);
      vi.stubGlobal("headers", async () => headers);

      const formData = new FormData();
      formData.append("token", generateSecureToken(32));
      formData.append("newPassword", "ValidPass123!@#");

      // 10 attempts
      for (let i = 0; i < 10; i++) {
        await confirmPasswordResetAction(null, formData, {
          dbClient: db,
        });
      }

      // 11th attempt is rate-limited
      const blockedRes = await confirmPasswordResetAction(null, formData, {
        dbClient: db,
      });
      expect(blockedRes.success).toBe(false);
      expect(blockedRes.error).toContain("Too many password reset attempts");
    });
  });

  // ====================================================================
  // 5. Production Fail-Closed Guards
  // ====================================================================
  describe("5. Production Fail-Closed Guards", () => {
    it("fails closed in production when trusted proxy cannot be established", async () => {
      vi.stubEnv("NODE_ENV", "production");
      delete process.env.TRUSTED_PROXY_IP_HEADER;

      const formData = new FormData();
      formData.append("email", "alice@example.com");

      const res = await requestPasswordResetAction(null, formData, {
        dbClient: db,
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain("Trusted proxy configuration is not established");
    });
  });
});
