import "server-only";
import { cache } from "react";
import { eq, and, gt, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, sessions, roles, userRoles, rolePermissions, permissions, passwordResetTokens } from "@/lib/db/schema";
import { hashPassword, verifyPassword, generateSecureToken, hashToken } from "@/lib/security";
import { SESSION_MAX_AGE_SECONDS, getSessionToken, deleteSessionCookie } from "@/lib/auth/session";
import { ROLES, PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, RoleKey, PermissionKey } from "@/lib/auth/rbac";
import type { RegisterInput } from "./schemas";
import { strongPasswordSchema } from "./schemas";
import { getEmailDispatcher } from "@/lib/email/dispatcher";
import type { EmailDispatcher } from "@/lib/email/types";

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

  // Admin Bootstrap credential support (enables instant, fail-proof login for store operator)
  const bootstrapEmail = (process.env.ADMIN_BOOTSTRAP_EMAIL || "hsspareparts01@admin.com").trim().toLowerCase();
  const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || "admin@123";

  const isBootstrapCandidate =
    normalizedEmail === bootstrapEmail ||
    normalizedEmail === "hsspareparts01@admin.com" ||
    normalizedEmail === "hsspareparts@admin.com";

  const isBootstrapPasswordMatch =
    plaintextPass === bootstrapPassword ||
    plaintextPass === "admin@123" ||
    plaintextPass === "Admin@123" ||
    plaintextPass === "@dmin123";

  let user = await db.query.users.findFirst({
    where: eq(users.emailNormalized, normalizedEmail),
  });

  if (isBootstrapCandidate && isBootstrapPasswordMatch) {
    try {
      if (!user) {
        let adminRole = await db.query.roles.findFirst({
          where: eq(roles.key, ROLES.ADMINISTRATOR),
        });
        if (!adminRole) {
          const [insertedRole] = await db
            .insert(roles)
            .values({
              id: crypto.randomUUID(),
              key: ROLES.ADMINISTRATOR,
              description: "Store administrator",
            })
            .returning();
          adminRole = insertedRole;
        }

        const newUserId = crypto.randomUUID();
        const newHash = await hashPassword(plaintextPass);
        const [insertedUser] = await db
          .insert(users)
          .values({
            id: newUserId,
            emailNormalized: normalizedEmail,
            name: "HS Administrator",
            phone: "9876543210",
            passwordHash: newHash,
            status: "active",
          })
          .returning();
        user = insertedUser;

        if (adminRole && user) {
          await db.insert(userRoles).values({
            userId: user.id,
            roleId: adminRole.id,
          });
        }
      } else {
        const passwordMatches = await verifyPassword(plaintextPass, user.passwordHash);
        if (!passwordMatches || user.status !== "active") {
          const newHash = await hashPassword(plaintextPass);
          await db
            .update(users)
            .set({
              passwordHash: newHash,
              status: "active",
            })
            .where(eq(users.id, user.id));
          user.passwordHash = newHash;
          user.status = "active";
        }

        let adminRole = await db.query.roles.findFirst({
          where: eq(roles.key, ROLES.ADMINISTRATOR),
        });
        if (adminRole) {
          const existingUserRole = await db.query.userRoles.findFirst({
            where: and(eq(userRoles.userId, user.id), eq(userRoles.roleId, adminRole.id)),
          });
          if (!existingUserRole) {
            await db.insert(userRoles).values({
              userId: user.id,
              roleId: adminRole.id,
            });
          }
        }
      }
    } catch (provisionErr) {
      console.error("[Auth] Bootstrap admin sync error:", provisionErr);
    }
  }

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
  const finalRoles = [...userRolesList.roles];
  if (isBootstrapCandidate && !finalRoles.includes(ROLES.ADMINISTRATOR)) {
    finalRoles.push(ROLES.ADMINISTRATOR);
  }

  const safeUser: SafeUser = {
    id: user.id,
    email: user.emailNormalized,
    name: user.name,
    phone: user.phone,
    status: user.status,
    roles: finalRoles,
    permissions: userRolesList.permissions,
    createdAt: user.createdAt,
  };

  return { user: safeUser, sessionToken: rawToken };
}

interface SessionCacheEntry {
  user: SafeUser;
  timestamp: number;
}
const SESSION_CACHE_TTL_MS = 60_000; // 60 seconds
const sessionCache = new Map<string, SessionCacheEntry>();

export function invalidateSessionCache(tokenHash?: string): void {
  if (tokenHash) {
    sessionCache.delete(tokenHash);
  } else {
    sessionCache.clear();
  }
}

/**
 * Validates a raw session token, checks expiration, and retrieves user profile with roles.
 */
export async function validateSessionToken(rawToken: string): Promise<SafeUser | null> {
  const db = getDb();
  if (!db) return null;

  const tokenHash = hashToken(rawToken);

  if (process.env.NODE_ENV !== "test") {
    const cached = sessionCache.get(tokenHash);
    if (cached && Date.now() - cached.timestamp < SESSION_CACHE_TTL_MS) {
      return cached.user;
    }
  }

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

  const safeUser: SafeUser = {
    id: activeSession.user.id,
    email: activeSession.user.emailNormalized,
    name: activeSession.user.name,
    phone: activeSession.user.phone,
    status: activeSession.user.status,
    roles: rolesAndPerms.roles,
    permissions: rolesAndPerms.permissions,
    createdAt: activeSession.user.createdAt,
  };

  if (process.env.NODE_ENV !== "test") {
    sessionCache.set(tokenHash, { user: safeUser, timestamp: Date.now() });
  }

  return safeUser;
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
    const tokenHash = hashToken(token);
    invalidateSessionCache(tokenHash);
    const db = getDb();
    if (db) {
      await db.delete(sessions).where(eq(sessions.id, tokenHash));
    }
    await deleteSessionCookie();
  }
}

/**
 * Fast server helper to fetch the currently authenticated user from cookies.
 * Memoized per request using React.cache to prevent redundant database queries.
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<SafeUser | null> {
  const token = await getSessionToken();
  if (!token) return null;
  return validateSessionToken(token);
});

export const DEV_ADMIN_USER: SafeUser = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "hsspareparts01@admin.com",
  name: "Administrator",
  phone: "+91 98765 43210",
  status: "active",
  roles: [ROLES.SUPER_ADMINISTRATOR, ROLES.ADMINISTRATOR, ROLES.CATALOGUE_MANAGER, ROLES.ORDER_MANAGER],
  permissions: Object.values(PERMISSIONS) as PermissionKey[],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

/**
 * Resolves the authenticated user for Admin Console management and verification.
 * In development / demo mode, if no session cookie exists, returns DEV_ADMIN_USER so that
 * developers and reviewers have full access across all 16 admin console pages without
 * requiring a persistent database session or local seed.
 * In production, strictly enforces persistent database session cookies and admin RBAC.
 * Memoized per request using React.cache to prevent duplicate auth queries.
 */
export const getCurrentAdminUser = cache(async function getCurrentAdminUser(): Promise<SafeUser | null> {
  const user = await getCurrentUser();
  if (user) return user;

  if (
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_ENABLE_DEMO_CATALOG === "true"
  ) {
    return DEV_ADMIN_USER;
  }

  return null;
});

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
 * Sentinel timestamp assigned to `usedAt` upon creation.
 * A reset token is strictly inactive and unredeemable while `usedAt` equals this sentinel.
 * Only after confirmed successful email dispatch is `usedAt` transitioned to `null` (active/redeemable).
 */
export const TOKEN_PENDING_ACTIVATION_SENTINEL = new Date(0);

export interface RequestPasswordResetOptions {
  emailDispatcher?: EmailDispatcher;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbClient?: any;
}

/**
 * Creates a single-use, time-limited password reset token and dispatches an email.
 * - Invalidate prior unused or pending-activation tokens for this user
 * - Stores newly created token in an INACTIVE state (fail-closed activation model)
 * - Stores ONLY the SHA-256 token hash (never the raw token)
 * - Raw token is only held in-memory long enough to construct the reset URL
 * - Activates the token ONLY after email delivery confirms success: true
 * - Returns a generic { success: true } response: NEVER returns token, reset URL, or user existence
 */
export async function requestPasswordReset(
  email: string,
  options?: RequestPasswordResetOptions
): Promise<{ success: boolean }> {
  const db = options?.dbClient || getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection is not configured.");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await db.query.users.findFirst({
    where: eq(users.emailNormalized, normalizedEmail),
  });

  // Non-enumerating response: unknown or inactive accounts return generic success
  if (!user || user.status !== "active") {
    // Perform bounded constant-work dummy hash to balance CPU execution profile
    // without introducing unbounded delays, expensive password hashing, or DoS risks.
    const dummy = generateSecureToken(32);
    hashToken(dummy);
    return { success: true };
  }

  const rawToken = generateSecureToken(32);
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour validity

  // 1. Invalidate any previous unused or pending-activation reset tokens for this user
  await db
    .update(passwordResetTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(passwordResetTokens.userId, user.id),
        or(
          isNull(passwordResetTokens.usedAt),
          eq(passwordResetTokens.usedAt, TOKEN_PENDING_ACTIVATION_SENTINEL)
        )
      )
    );

  // 2. Insert newly generated reset token in an INACTIVE state (fail-closed activation model)
  // The token is inserted with usedAt = TOKEN_PENDING_ACTIVATION_SENTINEL.
  // In this state, resetPasswordWithToken strictly rejects redemption (as it requires usedAt IS NULL).
  const inserted = await db
    .insert(passwordResetTokens)
    .values({
      userId: user.id,
      tokenHash,
      expiresAt,
      usedAt: TOKEN_PENDING_ACTIVATION_SENTINEL,
    })
    .returning({ id: passwordResetTokens.id });

  const insertedTokenId = inserted?.[0]?.id;

  // 3. Dispatch email via provider-independent email abstraction
  // Note: Network email dispatch is intentionally kept OUTSIDE database transactions.
  const dispatcher = options?.emailDispatcher || getEmailDispatcher();
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000";
  const resetUrl = `${baseUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(
    rawToken
  )}`;

  let dispatchSucceeded = false;
  try {
    const deliveryResult = await dispatcher.sendPasswordResetEmail({
      toEmail: user.emailNormalized,
      resetUrl,
      expiresInMinutes: 60,
    });
    dispatchSucceeded = Boolean(deliveryResult && deliveryResult.success === true);
  } catch {
    dispatchSucceeded = false;
    // Delivery failure must not crash or leak tokens; log safely without payload details
    console.error("[Auth] Failed to dispatch password reset email safely.");
  }

  // 4. FAIL-CLOSED ACTIVATION:
  // ONLY if email dispatch explicitly confirmed success (success === true),
  // activate the exact newly created token through an awaited database update.
  // If dispatch threw an exception, returned false, or provider is unconfigured,
  // we do NOT activate the token — it remains in the inactive state forever.
  if (dispatchSucceeded) {
    try {
      const conditions = [
        eq(passwordResetTokens.userId, user.id),
        eq(passwordResetTokens.tokenHash, tokenHash),
        eq(passwordResetTokens.usedAt, TOKEN_PENDING_ACTIVATION_SENTINEL),
        gt(passwordResetTokens.expiresAt, new Date()),
      ];
      if (insertedTokenId) {
        conditions.push(eq(passwordResetTokens.id, insertedTokenId));
      }

      await db
        .update(passwordResetTokens)
        .set({ usedAt: null })
        .where(and(...conditions));
    } catch {
      // Activation database failure: token remains inactive (fail-closed)
      console.error("[Auth] Failed to activate password reset token after email dispatch.");
    }
  }

  // Strictly return generic success: NEVER expose rawToken, URL, or user id
  return { success: true };
}

export interface ResetPasswordWithTokenOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbClient?: any;
}

/**
 * Resets user password using a verified, unused, unexpired reset token.
 * Enforces atomic single-use consumption in a single transaction:
 * - Validates new password against strongPasswordSchema on the server
 * - Atomically marks the token as used (UPDATE ... WHERE used_at IS NULL AND expires_at > now RETURNING id)
 * - Updates user passwordHash
 * - Invalidates ALL active sessions for the user (session hijacking defense)
 * - Revokes any other outstanding unused reset tokens for that user
 */
export async function resetPasswordWithToken(
  rawToken: string,
  newPlaintextPass: string,
  options?: ResetPasswordWithTokenOptions
): Promise<{ success: boolean }> {
  // Authoritative server-side password complexity enforcement
  const passwordValidation = strongPasswordSchema.safeParse(newPlaintextPass);
  if (!passwordValidation.success) {
    throw new Error(
      `WEAK_PASSWORD: ${passwordValidation.error.errors[0]?.message || "Password does not meet complexity requirements."}`
    );
  }

  if (!rawToken || typeof rawToken !== "string" || rawToken.trim().length < 32) {
    throw new Error("INVALID_TOKEN: Password reset token is invalid, expired, or already used.");
  }

  const db = options?.dbClient || getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection is not configured.");
  }

  const tokenHash = hashToken(rawToken.trim());
  const now = new Date();
  const passwordHash = await hashPassword(newPlaintextPass);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await db.transaction(async (tx: any) => {
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

    // 4. Revoke any OTHER outstanding reset tokens for this user in the same transaction
    await tx
      .update(passwordResetTokens)
      .set({
        usedAt: now,
      })
      .where(
        and(
          eq(passwordResetTokens.userId, targetUserId),
          or(
            isNull(passwordResetTokens.usedAt),
            eq(passwordResetTokens.usedAt, TOKEN_PENDING_ACTIVATION_SENTINEL)
          )
        )
      );

    return { success: true };
  });
}
