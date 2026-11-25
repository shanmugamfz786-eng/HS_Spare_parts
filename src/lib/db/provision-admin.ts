import "server-only";
import { eq, and } from "drizzle-orm";
import { users, roles, userRoles } from "@/lib/db/schema/auth";
import { ROLES, RoleKey } from "@/lib/auth/rbac";

export type AdminProvisionOutcome = "created" | "already_provisioned";

export interface AdminProvisionOptions {
  email: string;
  passwordHash: string;
  name?: string;
  phone?: string | null;
  roleKey?: RoleKey;
}

export interface AdminProvisionResult {
  userId: string;
  email: string;
  role: string;
  status: string;
  outcome: AdminProvisionOutcome;
  isNewUser: boolean;
}

export const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Escapes a literal string for safe interpolation in PostgreSQL scripts.
 * Doubles any single quotes and rejects NUL (\0) characters.
 */
export function escapeSqlLiteral(value: string): string {
  if (value.includes("\0")) {
    throw new Error("INVALID_PROVISION_INPUT: SQL literal cannot contain NUL (\\0) characters.");
  }
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Safely and idempotently provisions an administrator user in the persistent database.
 * 
 * SECURITY INVARIANTS:
 * 1. Strictly restricted to ROLES.ADMINISTRATOR; rejects unauthorized role keys.
 * 2. Strictly validates email and bcrypt password hash formats.
 * 3. Never overwrites the password hash of an existing account.
 * 4. Never automatically alters an existing account's status.
 * 5. If an existing administrator account is inactive or suspended, refuses to reactivate.
 * 6. Never elevates an existing customer account to administrator.
 * 7. If the configured email already belongs to a customer account, aborts with PROVISION_CONFLICT.
 * 8. If the email belongs to an active administrator, recognizes state without mutating password or role.
 * 9. If the email does not exist, creates the administrator account and assigns role atomically.
 * 10. Catches concurrent race conditions (unique violations) and ensures fail-closed rollback.
 */
export async function provisionAdminAccount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  options: AdminProvisionOptions
): Promise<AdminProvisionResult> {
  if (options.roleKey && options.roleKey !== ROLES.ADMINISTRATOR) {
    throw new Error(
      `INVALID_PROVISION_INPUT: Role key must be '${ROLES.ADMINISTRATOR}'. Unauthorized role keys are prohibited.`
    );
  }

  const normalizedEmail = options.email?.trim().toLowerCase();
  if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
    throw new Error("INVALID_PROVISION_INPUT: A valid email address is required.");
  }

  if (!options.passwordHash || !BCRYPT_HASH_REGEX.test(options.passwordHash)) {
    throw new Error("INVALID_PROVISION_INPUT: A valid bcrypt password hash is required.");
  }

  if (options.name && options.name.includes("\0")) {
    throw new Error("INVALID_PROVISION_INPUT: Name cannot contain NUL (\\0) characters.");
  }

  const userName = options.name?.trim() || "Store Administrator";
  const targetRoleKey = ROLES.ADMINISTRATOR;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await db.transaction(async (tx: any) => {
      // 1. Ensure target role exists in `roles`
      let roleRecord = await tx.query.roles.findFirst({
        where: eq(roles.key, targetRoleKey),
      });

      if (!roleRecord) {
        const [insertedRole] = await tx
          .insert(roles)
          .values({
            key: targetRoleKey,
            description: "Store administrator with full catalogue, orders, and system privileges",
          })
          .returning({ id: roles.id });
        roleRecord = insertedRole;
      }

      if (!roleRecord) {
        throw new Error(`PROVISION_FAILED: Failed to resolve role '${targetRoleKey}'.`);
      }

      // 2. Check if an account already exists with this email address
      const existingUser = await tx.query.users.findFirst({
        where: eq(users.emailNormalized, normalizedEmail),
      });

      if (existingUser) {
        // Query if this existing user already holds the target administrator role
        const existingUserRole = await tx.query.userRoles.findFirst({
          where: and(
            eq(userRoles.userId, existingUser.id),
            eq(userRoles.roleId, roleRecord.id)
          ),
        });

        if (existingUserRole) {
          // If the administrator account is not active, do not treat as ready for login
          if (existingUser.status !== "active") {
            throw new Error(
              `PROVISION_CONFLICT: Administrator account exists with status '${existingUser.status}'. Inactive or suspended accounts cannot be provisioned or reactivated automatically.`
            );
          }

          // Safe repeat execution: recognize already-provisioned active administrator without mutating password or role
          return {
            userId: existingUser.id,
            email: normalizedEmail,
            role: targetRoleKey,
            status: existingUser.status,
            outcome: "already_provisioned",
            isNewUser: false,
          };
        }

        // Existing user exists but does NOT possess the administrator role (e.g. customer account).
        // FAIL-CLOSED: Refuse to overwrite password or grant administrator privileges.
        throw new Error(
          `PROVISION_CONFLICT: An account with email '${normalizedEmail}' already exists without administrator privileges. Refusing to overwrite password or elevate account.`
        );
      }

      // 3. User does not exist: create administrator account atomically
      const [insertedUser] = await tx
        .insert(users)
        .values({
          emailNormalized: normalizedEmail,
          passwordHash: options.passwordHash,
          name: userName,
          phone: options.phone || null,
          status: "active",
        })
        .returning({ id: users.id });

      if (!insertedUser) {
        throw new Error("PROVISION_FAILED: Failed to create admin user record.");
      }

      // 4. Assign role atomically in the same transaction
      await tx.insert(userRoles).values({
        userId: insertedUser.id,
        roleId: roleRecord.id,
      });

      return {
        userId: insertedUser.id,
        email: normalizedEmail,
        role: targetRoleKey,
        status: "active",
        outcome: "created",
        isNewUser: true,
      };
    });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (
      err?.code === "23505" ||
      (typeof err?.message === "string" &&
        (err.message.includes("UNIQUE_VIOLATION") ||
          err.message.includes("unique constraint")))
    ) {
      throw new Error(
        `PROVISION_CONFLICT: Concurrent provisioning collision detected for email '${normalizedEmail}'. Transaction rolled back to maintain consistency.`
      );
    }
    throw error;
  }
}

/**
 * Generates an idempotent, fail-closed PostgreSQL SQL script for provisioning
 * the administrator account directly against remote Neon via psql or the Neon SQL Editor.
 * 
 * SECURITY SAFEGUARDS:
 * - Strictly rejects unauthorized role keys (enforces ROLES.ADMINISTRATOR only).
 * - Enforces rigorous format validation on email and password hash.
 * - Escapes all interpolated literals using safe PostgreSQL escaping to eliminate SQL injection.
 * - Uses a PL/pgSQL block with explicit conflict detection.
 * - NEVER uses 'ON CONFLICT ("email_normalized") DO UPDATE' to prevent account hijacking.
 * - If an existing account with the email is already an active administrator, exits cleanly with NO changes.
 * - If an existing account is a suspended/inactive administrator, ABORTS with RAISE EXCEPTION.
 * - If an existing account with the email is NOT an administrator, ABORTS with RAISE EXCEPTION,
 *   rolling back the entire transaction to prevent privilege escalation.
 * - If no account exists, creates user and role binding atomically.
 */
export function generateAdminProvisioningSql(options: {
  email: string;
  passwordHash: string;
  name?: string;
  roleKey?: string;
}): string {
  if (options.roleKey && options.roleKey !== ROLES.ADMINISTRATOR) {
    throw new Error(
      `INVALID_PROVISION_INPUT: Role key must be '${ROLES.ADMINISTRATOR}'. Unauthorized role keys are prohibited.`
    );
  }

  const normalizedEmail = options.email?.trim().toLowerCase();
  if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
    throw new Error("INVALID_PROVISION_INPUT: A valid email address is required.");
  }

  if (!options.passwordHash || !BCRYPT_HASH_REGEX.test(options.passwordHash)) {
    throw new Error("INVALID_PROVISION_INPUT: A valid bcrypt password hash is required.");
  }

  if (options.name && options.name.includes("\0")) {
    throw new Error("INVALID_PROVISION_INPUT: Name cannot contain NUL (\\0) characters.");
  }

  const userName = options.name?.trim() || "Store Administrator";
  const roleKey = ROLES.ADMINISTRATOR;

  const escapedEmail = escapeSqlLiteral(normalizedEmail);
  const escapedPasswordHash = escapeSqlLiteral(options.passwordHash);
  const escapedUserName = escapeSqlLiteral(userName);
  const escapedRoleKey = escapeSqlLiteral(roleKey);
  const escapedRoleDesc = escapeSqlLiteral("Store administrator with full catalogue, orders, and system privileges");

  return `-- ==============================================================================
-- HS SPARE PARTS — FAIL-CLOSED ADMIN ACCOUNT PROVISIONING SCRIPT
-- Execute in Neon SQL Editor or via psql with an authorized connection.
-- ==============================================================================

DO $$
DECLARE
  v_role_id uuid;
  v_user_id uuid;
  v_user_status text;
  v_has_admin_role boolean := false;
BEGIN
  -- 1. Ensure target administrator role exists in 'roles'
  SELECT id INTO v_role_id FROM "roles" WHERE "key" = ${escapedRoleKey};
  IF v_role_id IS NULL THEN
    INSERT INTO "roles" ("id", "key", "description", "created_at")
    VALUES (
      gen_random_uuid(),
      ${escapedRoleKey},
      ${escapedRoleDesc},
      NOW()
    )
    RETURNING id INTO v_role_id;
  END IF;

  -- 2. Check if an account already exists with this email address
  SELECT id, status INTO v_user_id, v_user_status FROM "users" WHERE "email_normalized" = ${escapedEmail};

  IF v_user_id IS NOT NULL THEN
    -- Check if the existing user already holds the target administrator role
    SELECT EXISTS (
      SELECT 1 FROM "user_roles"
      WHERE "user_id" = v_user_id AND "role_id" = v_role_id
    ) INTO v_has_admin_role;

    IF v_has_admin_role THEN
      IF v_user_status <> 'active' THEN
        RAISE EXCEPTION 'PROVISION_CONFLICT: Administrator account exists with status %. Inactive or suspended accounts cannot be provisioned or reactivated automatically.', v_user_status;
      END IF;

      -- Safe repeat execution: preserve existing account without modifying password or privileges
      RAISE NOTICE 'Administrator account (%) already provisioned with role (%). No password or privilege modifications applied.', ${escapedEmail}, ${escapedRoleKey};
      RETURN;
    ELSE
      -- Account exists as customer or another role: fail closed to prevent privilege escalation
      RAISE EXCEPTION 'PROVISION_CONFLICT: An account with email % already exists without administrator privileges. Refusing to overwrite password or elevate account.', ${escapedEmail};
    END IF;
  ELSE
    -- 3. New account: insert user and assign role atomically in the same transaction
    INSERT INTO "users" (
      "id",
      "email_normalized",
      "password_hash",
      "name",
      "status",
      "created_at",
      "updated_at"
    )
    VALUES (
      gen_random_uuid(),
      ${escapedEmail},
      ${escapedPasswordHash},
      ${escapedUserName},
      'active',
      NOW(),
      NOW()
    )
    RETURNING id INTO v_user_id;

    INSERT INTO "user_roles" ("user_id", "role_id", "assigned_at")
    VALUES (v_user_id, v_role_id, NOW());

    RAISE NOTICE 'Administrator account (%) successfully created with role (%).', ${escapedEmail}, ${escapedRoleKey};
  END IF;
END $$;

-- ==============================================================================
-- Verification query (read-only):
-- SELECT u.id, u.email_normalized, u.status, r.key as role
-- FROM users u
-- JOIN user_roles ur ON u.id = ur.user_id
-- JOIN roles r ON ur.role_id = r.id
-- WHERE u.email_normalized = ${escapedEmail};
-- ==============================================================================
`;
}
