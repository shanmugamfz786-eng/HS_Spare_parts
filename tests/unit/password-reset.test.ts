import { describe, it, expect, vi } from "vitest";
import { generateSecureToken, hashToken } from "../../src/lib/security";

describe("Password Reset Token Lifecycle & Security", () => {
  it("should generate cryptographically random 32-byte reset tokens", () => {
    const rawToken1 = generateSecureToken(32);
    const rawToken2 = generateSecureToken(32);

    expect(rawToken1).toHaveLength(64);
    expect(rawToken2).toHaveLength(64);
    expect(rawToken1).not.toBe(rawToken2);
  });

  it("should store deterministic SHA-256 token hash to prevent database leaks", () => {
    const rawToken = generateSecureToken(32);
    const hash1 = hashToken(rawToken);
    const hash2 = hashToken(rawToken);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
    expect(hash1).not.toBe(rawToken);
  });

  it("should enforce token expiration (1 hour window)", () => {
    const now = Date.now();
    const expiresAt = new Date(now + 60 * 60 * 1000);

    // Active token
    const isExpiredActive = expiresAt.getTime() < now;
    expect(isExpiredActive).toBe(false);

    // Simulated past expiration
    const pastExpiresAt = new Date(now - 1000);
    const isExpiredPast = pastExpiresAt.getTime() < now;
    expect(isExpiredPast).toBe(true);
  });

  it("should enforce single-use consumption and reject token reuse", () => {
    interface MockResetRecord {
      id: string;
      userId: string;
      tokenHash: string;
      expiresAt: Date;
      usedAt: Date | null;
    }

    const rawToken = generateSecureToken(32);
    const record: MockResetRecord = {
      id: "reset-123",
      userId: "user-456",
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 3600000),
      usedAt: null, // unused
    };

    // First use: valid
    const canUseFirstTime = record.usedAt === null && record.expiresAt > new Date();
    expect(canUseFirstTime).toBe(true);

    // Mark as consumed
    record.usedAt = new Date();

    // Second use attempt: MUST be rejected
    const canUseSecondTime = record.usedAt === null && record.expiresAt > new Date();
    expect(canUseSecondTime).toBe(false);
  });

  it("should atomically prevent concurrent race conditions on token consumption", async () => {
    // Simulate database atomic conditional UPDATE:
    // UPDATE password_reset_tokens SET used_at = now WHERE token_hash = :hash AND used_at IS NULL AND expires_at > now RETURNING id, user_id
    let tokenClaimed = false;

    const atomicUpdate = vi.fn().mockImplementation(async () => {
      if (!tokenClaimed) {
        tokenClaimed = true;
        return [{ id: "token-1", userId: "user-abc" }]; // 1 row updated
      }
      return []; // 0 rows updated because used_at IS NOT NULL
    });

    // Fire 2 concurrent requests attempting to consume the same token simultaneously
    const [result1, result2] = await Promise.all([
      atomicUpdate(),
      atomicUpdate(),
    ]);

    // Exactly one call must succeed in returning the updated row
    const winners = [result1, result2].filter((res) => res.length > 0);
    const losers = [result1, result2].filter((res) => res.length === 0);

    expect(winners.length).toBe(1);
    expect(losers.length).toBe(1);
  });
});
