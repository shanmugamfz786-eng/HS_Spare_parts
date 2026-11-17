import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  hashToken,
  timingSafeCompare,
} from "../../src/lib/security";

describe("Security Utilities", () => {
  it("should hash a password and verify it correctly", async () => {
    const rawPassword = "StrongPassword@2026";
    const hash = await hashPassword(rawPassword);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(rawPassword);
    expect(hash.startsWith("$2")).toBe(true); // bcrypt prefix

    const isValid = await verifyPassword(rawPassword, hash);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword("WrongPassword123!", hash);
    expect(isInvalid).toBe(false);
  });

  it("should generate cryptographically random tokens with correct length", () => {
    const token1 = generateSecureToken(32);
    const token2 = generateSecureToken(32);

    expect(token1).toHaveLength(64); // 32 bytes hex = 64 characters
    expect(token2).toHaveLength(64);
    expect(token1).not.toBe(token2);
  });

  it("should generate deterministic SHA-256 token hashes", () => {
    const rawToken = "test-token-abcdef123456";
    const hash1 = hashToken(rawToken);
    const hash2 = hashToken(rawToken);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex digest length
    expect(hash1).not.toBe(rawToken);
  });

  it("should perform timing-safe string comparison", () => {
    expect(timingSafeCompare("secret123", "secret123")).toBe(true);
    expect(timingSafeCompare("secret123", "secret999")).toBe(false);
    expect(timingSafeCompare("secret123", "short")).toBe(false);
  });
});
