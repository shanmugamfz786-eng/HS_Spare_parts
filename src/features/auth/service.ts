import "server-only";
import { eq, and, gt, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, sessions, roles, userRoles, rolePermissions, permissions, passwordResetTokens } from "@/lib/db/schema";
import { hashPassword, verifyPassword, generateSecureToken, hashToken } from "@/lib/security";
import { SESSION_MAX_AGE_SECONDS, getSessionToken, deleteSessionCookie } from "@/lib/auth/session";
import { ROLES, DEFAULT_ROLE_PERMISSIONS, RoleKey, PermissionKey } from "@/lib/auth/rbac";
import type { RegisterInput } from "./schemas";

export interface SafeUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  status: string;
  roles: RoleKey[];
  permissions: PermissionKey[];
  createdAt: Date;
}

/**
 * Registers a new customer account with default customer role.
 */
export async function registerCustomer(input: RegisterInput): Promise<{ user: SafeUser; sessionToken: string }> {
  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection is not configured.");
  }

  const normalizedEmail = input.email.trim().toLowerCase();

  // Check existing user
  const existing = await db.query.users.findFirst({
    where: eq(users.emailNormalized, normalizedEmail),
  });

  if (existing) {
    throw new Error("EMAIL_EXISTS: An account with this email address already exists.");
  }

  const passwordHash = await hashPassword(input.password);

  // Transactionally create user and assign default customer role
  return await db.transaction(async (tx) => {
    const [newUser] = await tx
      .insert(users)
      .values({
        emailNormalized: normalizedEmail,
        passwordHash,
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
        status: "active",
      })
      .returning();

    if (!newUser) {
      throw new Error("Failed to create user record.");
    }

    // Ensure customer role exists
    let customerRole = await tx.query.roles.findFirst({
      where: eq(roles.key, ROLES.CUSTOMER),
    });

    if (!customerRole) {
      const [createdRole] = await tx
        .insert(roles)
        .values({
          key: ROLES.CUSTOMER,
          description: "Standard customer account with storefront access",
        })
        .returning();
      customerRole = createdRole;
    }

    if (customerRole) {
      await tx.insert(userRoles).values({
        userId: newUser.id,
        roleId: customerRole.id,
      });
    }

    // Create session
    const rawToken = generateSecureToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

    await tx.insert(sessions).values({
      id: tokenHash,
      userId: newUser.id,
      expiresAt,
    });

    const safeUser: SafeUser = {
      id: newUser.id,
      email: newUser.emailNormalized,
      name: newUser.name,
      phone: newUser.phone,
      status: newUser.status,
      roles: [ROLES.CUSTOMER],
      permissions: DEFAULT_ROLE_PERMISSIONS[ROLES.CUSTOMER],
      createdAt: newUser.createdAt,
    };

    return { user: safeUser, sessionToken: rawToken };
  });
}

/**
 * Verifies email and password credentials, rotating session token on success.
 */
export async function authenticateCustomer(
  email: string,
  plaintextPass: string
): Promise<{ user: SafeUser; sessionToken: string }> {
  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection is not configured.");
  }

  const normalizedEmail = email.trim().toLowerCase();

  const user = await db.query.users.findFirst({
    where: eq(users.emailNormalized, normalizedEmail),
  });

  if (!user || user.status !== "active") {
    // Return generic error message to prevent user enumeration
    throw new Error("INVALID_CREDENTIALS: Invalid email address or password.");
  }

  const passwordValid = await verifyPassword(plaintextPass, user.passwordHash);
  if (!passwordValid) {
    throw new Error("INVALID_CREDENTIALS: Invalid email address or password.");
  }

  // Create new rotated session
  const rawToken = generateSecureToken(32);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await db.insert(sessions).values({
    id: tokenHash,
    userId: user.id,
    expiresAt,
  });

  const userRolesList = await getUserRolesAndPermissions(user.id);

  const safeUser: SafeUser = {
    id: user.id,
    email: user.emailNormalized,
    name: user.name,
    phone: user.phone,
    status: user.status,
    roles: userRolesList.roles,
    permissions: userRolesList.permissions,
    createdAt: user.createdAt,
  };

  return { user: safeUser, sessionToken: rawToken };
}

/**
 * Validates a raw session token, checks expiration, and retrieves user profile with roles.
 */
export async function validateSessionToken(rawToken: string): Promise<SafeUser | null> {
  const db = getDb();
  if (!db) return null;

  const tokenHash = hashToken(rawToken);

  const activeSession = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, tokenHash), gt(sessions.expiresAt, new Date())),
    with: {
      user: true,
    },
  });

  if (!activeSession || !activeSession.user || activeSession.user.status !== "active") {
    return null;
  }

  const rolesAndPerms = await getUserRolesAndPermissions(activeSession.user.id);

  return {
    id: activeSession.user.id,
    email: activeSession.user.emailNormalized,
    name: activeSession.user.name,
    phone: activeSession.user.phone,
    status: activeSession.user.status,
    roles: rolesAndPerms.roles,
    permissions: rolesAndPerms.permissions,
    createdAt: activeSession.user.createdAt,
  };
}

/**
 * Resolves all roles and compiled permissions for a given user ID.
 */
export async function getUserRolesAndPermissions(
  userId: string
): Promise<{ roles: RoleKey[]; permissions: PermissionKey[] }> {
  const db = getDb();
  if (!db) return { roles: [], permissions: [] };

  const userRoleRows = await db
    .select({
      roleKey: roles.key,
      roleId: roles.id,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));

  const roleKeys = userRoleRows.map((r) => r.roleKey as RoleKey);

  // Compile permissions from roles
  const permsSet = new Set<PermissionKey>();
  for (const rKey of roleKeys) {
    const defaultPerms = DEFAULT_ROLE_PERMISSIONS[rKey] || [];
    for (const p of defaultPerms) {
      permsSet.add(p);
    }
  }

  // Also query any custom role_permissions attached in DB
  const roleIds = userRoleRows.map((r) => r.roleId);
  if (roleIds.length > 0) {
    const customPermRows = await db
      .select({
        permKey: permissions.key,
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id));

    for (const cp of customPermRows) {
      permsSet.add(cp.permKey as PermissionKey);
    }
  }

  return {
    roles: roleKeys.length > 0 ? roleKeys : [ROLES.CUSTOMER],
    permissions: Array.from(permsSet),
  };
}

/**
 * Invalidates the current session token in database and clears the session cookie.
 */
export async function signOutUser(): Promise<void> {
  const token = await getSessionToken();
  if (token) {
    const db = getDb();
    if (db) {
      const tokenHash = hashToken(token);
      await db.delete(sessions).where(eq(sessions.id, tokenHash));
    }
    await deleteSessionCookie();
  }
}

/**
 * Fast server helper to fetch the currently authenticated user from cookies.
 */
export async function getCurrentUser(): Promise<SafeUser | null> {
  const token = await getSessionToken();
  if (!token) return null;
  return validateSessionToken(token);
}

/**
 * Server guard: throws an AuthenticationError if user is not authenticated.
 */
export async function requireUser(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHENTICATED: Authentication required to perform this action.");
  }
  return user;
}

/**
 * Creates a single-use, time-limited password reset token.
 * Returns generic success even if user is not found to prevent account enumeration.
 */
export async function requestPasswordReset(email: string): Promise<{ success: boolean; token?: string }> {
  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection is not configured.");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await db.query.users.findFirst({
    where: eq(users.emailNormalized, normalizedEmail),
  });

  // Non-enumerating response
  if (!user || user.status !== "active") {
    return { success: true };
  }

  const rawToken = generateSecureToken(32);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour validity

  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  return { success: true, token: rawToken };
}

/**
 * Resets user password using a verified, unused, unexpired reset token.
 * Enforces atomic single-use consumption in a single transaction:
 * UPDATE password_reset_tokens SET used_at = now WHERE token_hash = :hash AND used_at IS NULL AND expires_at > now
 * If 0 rows match (e.g. concurrent attempt or expired), rejects immediately.
 * Automatically invalidates all existing sessions for the user upon completion.
 */
export async function resetPasswordWithToken(
  rawToken: string,
  newPlaintextPass: string
): Promise<{ success: boolean }> {
  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection is not configured.");
  }

  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const passwordHash = await hashPassword(newPlaintextPass);

  return await db.transaction(async (tx) => {
    // 1. Atomic token consumption: only succeeds if usedAt IS NULL and expiresAt > now
    const consumed = await tx
      .update(passwordResetTokens)
      .set({
        usedAt: now,
      })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, now)
        )
      )
      .returning({
        id: passwordResetTokens.id,
        userId: passwordResetTokens.userId,
      });

    const targetRecord = consumed?.[0];
    if (!targetRecord) {
      throw new Error("INVALID_TOKEN: Password reset token is invalid, expired, or already used.");
    }

    const targetUserId = targetRecord.userId;

    // 2. Update user password
    await tx
      .update(users)
      .set({
        passwordHash,
        updatedAt: now,
      })
      .where(eq(users.id, targetUserId));

    // 3. Invalidate ALL active sessions for this user (session hijacking defense)
    await tx.delete(sessions).where(eq(sessions.userId, targetUserId));

    return { success: true };
  });
}
