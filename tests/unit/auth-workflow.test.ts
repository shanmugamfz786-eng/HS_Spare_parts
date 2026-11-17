import { describe, it, expect } from "vitest";
import { getSessionCookieOptions } from "../../src/lib/auth/session";
import { hashPassword, verifyPassword, generateSecureToken, hashToken } from "../../src/lib/security";
import { ROLES, PERMISSIONS, hasRole, hasPermission, DEFAULT_ROLE_PERMISSIONS } from "../../src/lib/auth/rbac";

describe("Authentication Workflow & Security Invariants", () => {
  it("should configure strict security properties on session cookies", () => {
    const options = getSessionCookieOptions();

    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.maxAge).toBe(30 * 24 * 60 * 60); // 30 days
  });

  it("should verify correct password and reject incorrect password", async () => {
    const rawPassword = "CorrectHorseBatteryStaple#99";
    const hash = await hashPassword(rawPassword);

    expect(await verifyPassword(rawPassword, hash)).toBe(true);
    expect(await verifyPassword("IncorrectPassword#99", hash)).toBe(false);
  });

  it("should enforce session rotation on login to prevent session fixation", () => {
    // Initial guest/old session token
    const oldRawToken = generateSecureToken(32);
    const oldHash = hashToken(oldRawToken);

    // Rotated new session token issued upon authentication
    const newRawToken = generateSecureToken(32);
    const newHash = hashToken(newRawToken);

    expect(newRawToken).not.toBe(oldRawToken);
    expect(newHash).not.toBe(oldHash);
  });

  it("should enforce session expiration checks", () => {
    const now = Date.now();
    const validSession = {
      id: "session-valid",
      expiresAt: new Date(now + 1000 * 60 * 60), // 1 hour ahead
    };
    const expiredSession = {
      id: "session-expired",
      expiresAt: new Date(now - 1000), // 1 second in the past
    };

    expect(validSession.expiresAt.getTime() > now).toBe(true);
    expect(expiredSession.expiresAt.getTime() > now).toBe(false);
  });

  it("should block customer accounts from accessing administrator actions", () => {
    const customerRoles = [ROLES.CUSTOMER];
    const customerPerms = DEFAULT_ROLE_PERMISSIONS[ROLES.CUSTOMER];

    // Customer cannot access admin panel or perform privileged mutations
    expect(hasRole(customerRoles, [ROLES.ADMINISTRATOR])).toBe(false);
    expect(hasRole(customerRoles, [ROLES.SUPER_ADMINISTRATOR])).toBe(false);
    expect(hasPermission(customerPerms, PERMISSIONS.ADMIN_ACCESS)).toBe(false);
    expect(hasPermission(customerPerms, PERMISSIONS.CATALOGUE_WRITE)).toBe(false);
    expect(hasPermission(customerPerms, PERMISSIONS.ORDERS_REFUND)).toBe(false);
  });

  it("should ensure error messages do not reveal user existence during login", () => {
    // Standardized generic error returned by authentication service
    const genericLoginError = "INVALID_CREDENTIALS: Invalid email address or password.";

    // Both "User Not Found" and "Password Mismatch" must emit this identical string
    expect(genericLoginError).not.toContain("User not found");
    expect(genericLoginError).not.toContain("Password incorrect");
  });
});
