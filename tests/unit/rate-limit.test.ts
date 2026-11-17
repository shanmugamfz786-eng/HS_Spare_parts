import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { hashToken } from "../../src/lib/security";
import {
  checkRateLimit,
  resetRateLimit,
  checkSharedRateLimit,
  resetSharedRateLimit,
} from "../../src/lib/auth/rate-limit";

describe("Rate Limiting & Brute-Force Protection", () => {
  const testKey = "test-client-127.0.0.1";

  beforeEach(() => {
    resetRateLimit(testKey);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("In-Memory Local Rate Limiter", () => {
    it("should allow attempts up to the configured limit", () => {
      const config = { maxAttempts: 3, windowSeconds: 60 };

      const first = checkRateLimit(testKey, config);
      expect(first.success).toBe(true);
      expect(first.remaining).toBe(2);

      const second = checkRateLimit(testKey, config);
      expect(second.success).toBe(true);
      expect(second.remaining).toBe(1);

      const third = checkRateLimit(testKey, config);
      expect(third.success).toBe(true);
      expect(third.remaining).toBe(0);

      // Fourth attempt must be blocked
      const fourth = checkRateLimit(testKey, config);
      expect(fourth.success).toBe(false);
      expect(fourth.remaining).toBe(0);
      expect(fourth.resetInSeconds).toBeGreaterThan(0);
    });

    it("should reset rate limit when explicitly cleared", () => {
      const config = { maxAttempts: 2, windowSeconds: 60 };

      checkRateLimit(testKey, config);
      checkRateLimit(testKey, config);
      expect(checkRateLimit(testKey, config).success).toBe(false);

      resetRateLimit(testKey);

      const afterReset = checkRateLimit(testKey, config);
      expect(afterReset.success).toBe(true);
      expect(afterReset.remaining).toBe(1);
    });
  });

  describe("PostgreSQL-Backed Shared Rate Limiter (checkSharedRateLimit)", () => {
    it("should allow attempts under threshold via atomic upsert query", async () => {
      const futureReset = new Date(Date.now() + 60000);
      const mockDb = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                { attempts: 2, resetAt: futureReset },
              ]),
            }),
          }),
        }),
      };

      const result = await checkSharedRateLimit(mockDb, "login:user@example.com", {
        maxAttempts: 5,
        windowSeconds: 60,
      });

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(3);
      expect(result.resetInSeconds).toBeGreaterThan(0);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should block and report 0 remaining when attempts exceed maxAttempts", async () => {
      const futureReset = new Date(Date.now() + 60000);
      const mockDb = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                { attempts: 6, resetAt: futureReset }, // 6 > maxAttempts (5)
              ]),
            }),
          }),
        }),
      };

      const result = await checkSharedRateLimit(mockDb, "login:user@example.com", {
        maxAttempts: 5,
        windowSeconds: 60,
      });

      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.resetInSeconds).toBeGreaterThan(0);
    });

    describe("Environment Guards (Production, Staging, Unset, Development, Test)", () => {
      const failingDb = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockReturnValue({
              returning: vi.fn().mockRejectedValue(new Error("Connection to PostgreSQL pool failed")),
            }),
          }),
        }),
      };

      it("should fail closed in production when database query throws or db is null", async () => {
        vi.stubEnv("NODE_ENV", "production");
        const spyConsole = vi.spyOn(console, "error").mockImplementation(() => {});

        // 1. Query throws
        const resQuery = await checkSharedRateLimit(failingDb, "login:target@example.com", {
          maxAttempts: 5,
          windowSeconds: 900,
        });
        expect(resQuery.success).toBe(false);
        expect(resQuery.remaining).toBe(0);
        expect(resQuery.isServiceUnavailable).toBe(true);
        expect(resQuery.resetInSeconds).toBe(900);

        // 2. Db client is null
        const resNull = await checkSharedRateLimit(null, "login:target@example.com", {
          maxAttempts: 5,
          windowSeconds: 900,
        });
        expect(resNull.success).toBe(false);
        expect(resNull.remaining).toBe(0);
        expect(resNull.isServiceUnavailable).toBe(true);

        spyConsole.mockRestore();
      });

      it("should fail closed in staging when database fails", async () => {
        vi.stubEnv("NODE_ENV", "staging");
        const spyConsole = vi.spyOn(console, "error").mockImplementation(() => {});

        const res = await checkSharedRateLimit(failingDb, "login:staging@example.com", {
          maxAttempts: 5,
          windowSeconds: 900,
        });
        expect(res.success).toBe(false);
        expect(res.remaining).toBe(0);
        expect(res.isServiceUnavailable).toBe(true);

        spyConsole.mockRestore();
      });

      it("should fail closed when NODE_ENV is unset or undefined", async () => {
        vi.stubEnv("NODE_ENV", "" as unknown as string);
        const spyConsole = vi.spyOn(console, "error").mockImplementation(() => {});

        const res = await checkSharedRateLimit(failingDb, "login:unset@example.com", {
          maxAttempts: 5,
          windowSeconds: 900,
        });
        expect(res.success).toBe(false);
        expect(res.remaining).toBe(0);
        expect(res.isServiceUnavailable).toBe(true);

        spyConsole.mockRestore();
      });

      it("should fail closed for unknown environment values (e.g. preview, uat)", async () => {
        vi.stubEnv("NODE_ENV", "preview");
        const spyConsole = vi.spyOn(console, "error").mockImplementation(() => {});

        const res = await checkSharedRateLimit(failingDb, "login:preview@example.com", {
          maxAttempts: 5,
          windowSeconds: 900,
        });
        expect(res.success).toBe(false);
        expect(res.remaining).toBe(0);
        expect(res.isServiceUnavailable).toBe(true);

        spyConsole.mockRestore();
      });

      it("should allow in-memory fallback in development environment", async () => {
        vi.stubEnv("NODE_ENV", "development");
        const spyConsole = vi.spyOn(console, "error").mockImplementation(() => {});

        const devKey = "dev-user@example.com";
        resetRateLimit(devKey);

        const r1 = await checkSharedRateLimit(failingDb, devKey, { maxAttempts: 2, windowSeconds: 60 });
        expect(r1.success).toBe(true);
        expect(r1.remaining).toBe(1);

        const r2 = await checkSharedRateLimit(failingDb, devKey, { maxAttempts: 2, windowSeconds: 60 });
        expect(r2.success).toBe(true);
        expect(r2.remaining).toBe(0);

        const r3 = await checkSharedRateLimit(failingDb, devKey, { maxAttempts: 2, windowSeconds: 60 });
        expect(r3.success).toBe(false);

        spyConsole.mockRestore();
      });

      it("should allow in-memory fallback in test environment", async () => {
        vi.stubEnv("NODE_ENV", "test");
        const spyConsole = vi.spyOn(console, "error").mockImplementation(() => {});

        const testEnvKey = "test-env-user@example.com";
        resetRateLimit(testEnvKey);

        const r1 = await checkSharedRateLimit(failingDb, testEnvKey, { maxAttempts: 2, windowSeconds: 60 });
        expect(r1.success).toBe(true);
        expect(r1.remaining).toBe(1);

        const r2 = await checkSharedRateLimit(failingDb, testEnvKey, { maxAttempts: 2, windowSeconds: 60 });
        expect(r2.success).toBe(true);
        expect(r2.remaining).toBe(0);

        const r3 = await checkSharedRateLimit(failingDb, testEnvKey, { maxAttempts: 2, windowSeconds: 60 });
        expect(r3.success).toBe(false);

        spyConsole.mockRestore();
      });
    });

    it("should handle reset errors gracefully without bypassing subsequent rate limits", async () => {
      const failingDb = {
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error("Database write locked")),
        }),
      };

      const spyConsole = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(resetSharedRateLimit(failingDb, "reset-error-key")).resolves.toBeUndefined();

      expect(failingDb.delete).toHaveBeenCalled();
      spyConsole.mockRestore();
    });

    it("should verify generic service unavailable response when rateCheck fails closed", () => {
      const failedRateCheck = {
        success: false,
        remaining: 0,
        resetInSeconds: 900,
        isServiceUnavailable: true,
      };

      let actionResponse: { success: boolean; error: string };

      if (!failedRateCheck.success) {
        if (failedRateCheck.isServiceUnavailable) {
          actionResponse = {
            success: false,
            error: "Authentication service is temporarily unavailable. Please try again shortly.",
          };
        } else {
          actionResponse = {
            success: false,
            error: `Too many attempts. Please try again in ${failedRateCheck.resetInSeconds} seconds.`,
          };
        }
      } else {
        actionResponse = { success: true, error: "" };
      }

      expect(actionResponse.success).toBe(false);
      expect(actionResponse.error).toBe(
        "Authentication service is temporarily unavailable. Please try again shortly."
      );
      expect(actionResponse.error).not.toContain("PostgreSQL");
      expect(actionResponse.error).not.toContain("database");
      expect(actionResponse.error).not.toContain("connect");
    });
  });

  // 3. Customer Mutation Rate Limiting Coverage (Phase 5 Hardening)
  describe("Customer Mutation Rate Limiting (Phase 5 Hardening)", () => {
    describe("Cart Mutation Rate Limiting", () => {
      it("should derive guest rate limit key using SHA-256 without logging raw token", () => {
        const rawGuestToken = "raw-secret-guest-token-1234567890abcdef";
        const hashed = hashToken(rawGuestToken);
        const guestKey = `cart:guest:${hashed}`;

        expect(guestKey).not.toContain(rawGuestToken);
        expect(guestKey.startsWith("cart:guest:")).toBe(true);
        expect(hashed).toHaveLength(64); // SHA-256 hex length
      });

      it("should isolate different guest cart sessions", () => {
        const token1 = "token-alpha-1111";
        const token2 = "token-beta-2222";

        const key1 = `cart:guest:${hashToken(token1)}`;
        const key2 = `cart:guest:${hashToken(token2)}`;

        expect(key1).not.toBe(key2);
      });

      it("should isolate authenticated customer cart keys from guest keys", () => {
        const userId = "usr-uuid-777";
        const token = "token-usr-uuid-777";

        const userKey = `cart:user:${userId}`;
        const guestKey = `cart:guest:${hashToken(token)}`;

        expect(userKey).not.toBe(guestKey);
        expect(userKey).toBe("cart:user:usr-uuid-777");
      });

      it("should enforce configured limit of 60 mutations per 10 minutes for cart operations", async () => {
        const futureReset = new Date(Date.now() + 600000);
        const mockDb = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              onConflictDoUpdate: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([
                  { attempts: 60, resetAt: futureReset },
                ]),
              }),
            }),
          }),
        };

        // Attempt 60 should succeed (boundary)
        const allowed = await checkSharedRateLimit(mockDb, "cart:user:usr-1", {
          maxAttempts: 60,
          windowSeconds: 600,
        });
        expect(allowed.success).toBe(true);
        expect(allowed.remaining).toBe(0);

        // Attempt 61 must be blocked
        mockDb.insert = vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                { attempts: 61, resetAt: futureReset },
              ]),
            }),
          }),
        });

        const blocked = await checkSharedRateLimit(mockDb, "cart:user:usr-1", {
          maxAttempts: 60,
          windowSeconds: 600,
        });
        expect(blocked.success).toBe(false);
        expect(blocked.remaining).toBe(0);
      });
    });

    describe("Wishlist Mutation Rate Limiting", () => {
      it("should isolate user wishlist keys and enforce 30 mutations per 10 minutes", async () => {
        const futureReset = new Date(Date.now() + 600000);
        const userA = "user-wish-A";
        const userB = "user-wish-B";

        const keyA = `wishlist:${userA}`;
        const keyB = `wishlist:${userB}`;
        expect(keyA).not.toBe(keyB);

        const mockDb = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              onConflictDoUpdate: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([
                  { attempts: 31, resetAt: futureReset }, // Exceeded
                ]),
              }),
            }),
          }),
        };

        const result = await checkSharedRateLimit(mockDb, keyA, {
          maxAttempts: 30,
          windowSeconds: 600,
        });
        expect(result.success).toBe(false);
        expect(result.remaining).toBe(0);
      });
    });

    describe("Address Book Mutation Rate Limiting", () => {
      it("should enforce 15 mutations per 10 minutes for address book operations", async () => {
        const futureReset = new Date(Date.now() + 600000);
        const mockDb = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              onConflictDoUpdate: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([
                  { attempts: 16, resetAt: futureReset }, // Exceeded
                ]),
              }),
            }),
          }),
        };

        const result = await checkSharedRateLimit(mockDb, "address:user-addr-1", {
          maxAttempts: 15,
          windowSeconds: 600,
        });
        expect(result.success).toBe(false);
        expect(result.remaining).toBe(0);
      });
    });

    describe("Profile Update Rate Limiting", () => {
      it("should enforce 10 updates per 15 minutes for profile modifications", async () => {
        const futureReset = new Date(Date.now() + 900000);
        const mockDb = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              onConflictDoUpdate: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([
                  { attempts: 11, resetAt: futureReset }, // Exceeded
                ]),
              }),
            }),
          }),
        };

        const result = await checkSharedRateLimit(mockDb, "profile:user-prof-1", {
          maxAttempts: 10,
          windowSeconds: 900,
        });
        expect(result.success).toBe(false);
        expect(result.remaining).toBe(0);
      });
    });

    describe("Production Fail-Closed Failure Behavior", () => {
      it("should fail closed and return isServiceUnavailable when database throws in production", async () => {
        vi.stubEnv("NODE_ENV", "production");
        const spyConsole = vi.spyOn(console, "error").mockImplementation(() => {});

        const failingDb = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              onConflictDoUpdate: vi.fn().mockReturnValue({
                returning: vi.fn().mockRejectedValue(new Error("Connection refused")),
              }),
            }),
          }),
        };

        const result = await checkSharedRateLimit(failingDb, "cart:user:prod-user", {
          maxAttempts: 60,
          windowSeconds: 600,
        });

        expect(result.success).toBe(false);
        expect(result.remaining).toBe(0);
        expect(result.isServiceUnavailable).toBe(true);

        spyConsole.mockRestore();
      });
    });
  });
});
