import { describe, it, expect, beforeEach } from "vitest";
import { hashPassword, verifyPassword } from "../../src/lib/security";
import { loginSchema, strongPasswordSchema } from "../../src/features/auth/schemas";
import {
  ROLES,
  PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  hasRole,
  hasPermission,
  AuthorizationError,
  AuthenticationError,
} from "../../src/lib/auth/rbac";
import { assertAdminCatalogueAccess } from "../../src/features/admin/service";
import { assertAdminFulfillmentAccess } from "../../src/features/fulfillment/admin-actions";
import {
  provisionAdminAccount,
  generateAdminProvisioningSql,
  escapeSqlLiteral,
  BCRYPT_HASH_REGEX,
  EMAIL_REGEX,
} from "../../src/lib/db/provision-admin";
import { getSessionCookieOptions } from "../../src/lib/auth/session";
import type { SafeUser } from "../../src/features/auth/service";

// ==============================================================================
// Mock In-Memory Database for Drizzle Transaction & Rollback Testing
// ==============================================================================

interface MockUser {
  id: string;
  emailNormalized: string;
  passwordHash: string;
  name: string;
  status: string;
}

interface MockRole {
  id: string;
  key: string;
  description: string;
}

interface MockUserRole {
  userId: string;
  roleId: string;
}

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

class MockAdminDb {
  public users: Map<string, MockUser> = new Map();
  public roles: Map<string, MockRole> = new Map();
  public userRoles: Array<MockUserRole> = [];
  public failNextTransaction = false;
  public concurrencyDelayMs = 0;

  constructor() {
    this.roles.set(ROLES.ADMINISTRATOR, {
      id: "role-admin-uuid",
      key: ROLES.ADMINISTRATOR,
      description: "Store administrator",
    });
    this.roles.set(ROLES.CUSTOMER, {
      id: "role-customer-uuid",
      key: ROLES.CUSTOMER,
      description: "Customer account",
    });
  }

  get query() {
    return {
      roles: {
        findFirst: async ({ where }: { where: unknown }) => {
          const vals = extractSqlValues(where);
          for (const role of this.roles.values()) {
            if (vals.includes(role.key) || vals.length === 0) {
              return role;
            }
          }
          return null;
        },
      },
      users: {
        findFirst: async ({ where }: { where: unknown }) => {
          const vals = extractSqlValues(where);
          let found: MockUser | null = null;
          for (const user of this.users.values()) {
            if (vals.includes(user.emailNormalized) || vals.includes(user.id)) {
              found = user;
              break;
            }
          }
          if (this.concurrencyDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, this.concurrencyDelayMs));
          }
          return found;
        },
      },
      userRoles: {
        findFirst: async ({ where }: { where: unknown }) => {
          const vals = extractSqlValues(where);
          for (const ur of this.userRoles) {
            if (vals.includes(ur.userId) && vals.includes(ur.roleId)) {
              return ur;
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
        if (val.emailNormalized) {
          // Enforce unique constraint on emailNormalized
          for (const existing of this.users.values()) {
            if (existing.emailNormalized === val.emailNormalized) {
              throw new Error(
                "UNIQUE_VIOLATION: duplicate key value violates unique constraint 'users_email_normalized_unique'"
              );
            }
          }
          const newId = (val.id as string) || `user-${this.users.size + 1}`;
          const record: MockUser = {
            id: newId,
            emailNormalized: val.emailNormalized as string,
            passwordHash: val.passwordHash as string,
            name: (val.name as string) || "Store Administrator",
            status: (val.status as string) || "active",
          };
          this.users.set(newId, record);
          return {
            returning: async () => [{ id: newId }],
            then: (resolve: (v: unknown) => void) =>
              Promise.resolve([{ id: newId }]).then(resolve),
          };
        }
        if (val.key) {
          const newRoleId = `role-${this.roles.size + 1}`;
          const roleRecord: MockRole = {
            id: newRoleId,
            key: val.key as string,
            description: val.description as string,
          };
          this.roles.set(val.key as string, roleRecord);
          return {
            returning: async () => [{ id: newRoleId }],
            then: (resolve: (v: unknown) => void) =>
              Promise.resolve([{ id: newRoleId }]).then(resolve),
          };
        }
        if (val.userId && val.roleId) {
          this.userRoles.push({
            userId: val.userId as string,
            roleId: val.roleId as string,
          });
          return {
            returning: async () => [val],
            then: (resolve: (v: unknown) => void) => Promise.resolve([val]).then(resolve),
          };
        }
        return {
          returning: async () => [val],
          then: (resolve: (v: unknown) => void) => Promise.resolve([val]).then(resolve),
        };
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async transaction(callback: (tx: any) => Promise<unknown>) {
    if (this.failNextTransaction) {
      throw new Error("TRANSACTION_FAILED: Simulated database transaction abort.");
    }
    const insertedUserIds: string[] = [];
    const insertedRoleKeys: string[] = [];
    const insertedUserRoles: MockUserRole[] = [];

    const txProxy = {
      query: this.query,
      insert: () => ({
        values: (val: Record<string, unknown>) => {
          if (val.emailNormalized) {
            for (const existing of this.users.values()) {
              if (existing.emailNormalized === val.emailNormalized) {
                throw new Error(
                  "UNIQUE_VIOLATION: duplicate key value violates unique constraint 'users_email_normalized_unique'"
                );
              }
            }
            const newId = (val.id as string) || `user-${this.users.size + 1}`;
            const record: MockUser = {
              id: newId,
              emailNormalized: val.emailNormalized as string,
              passwordHash: val.passwordHash as string,
              name: (val.name as string) || "Store Administrator",
              status: (val.status as string) || "active",
            };
            this.users.set(newId, record);
            insertedUserIds.push(newId);
            return {
              returning: async () => [{ id: newId }],
              then: (resolve: (v: unknown) => void) =>
                Promise.resolve([{ id: newId }]).then(resolve),
            };
          }
          if (val.key) {
            const newRoleId = `role-${this.roles.size + 1}`;
            const roleRecord: MockRole = {
              id: newRoleId,
              key: val.key as string,
              description: val.description as string,
            };
            this.roles.set(val.key as string, roleRecord);
            insertedRoleKeys.push(val.key as string);
            return {
              returning: async () => [{ id: newRoleId }],
              then: (resolve: (v: unknown) => void) =>
                Promise.resolve([{ id: newRoleId }]).then(resolve),
            };
          }
          if (val.userId && val.roleId) {
            const urRecord: MockUserRole = {
              userId: val.userId as string,
              roleId: val.roleId as string,
            };
            this.userRoles.push(urRecord);
            insertedUserRoles.push(urRecord);
            return {
              returning: async () => [val],
              then: (resolve: (v: unknown) => void) => Promise.resolve([val]).then(resolve),
            };
          }
          return {
            returning: async () => [val],
            then: (resolve: (v: unknown) => void) => Promise.resolve([val]).then(resolve),
          };
        },
      }),
    };

    try {
      return await callback(txProxy);
    } catch (err) {
      for (const id of insertedUserIds) {
        this.users.delete(id);
      }
      for (const k of insertedRoleKeys) {
        this.roles.delete(k);
      }
      for (const ur of insertedUserRoles) {
        const idx = this.userRoles.indexOf(ur);
        if (idx !== -1) {
          this.userRoles.splice(idx, 1);
        }
      }
      throw err;
    }
  }
}

// ==============================================================================
// Unit Test Suite: Administrator Authentication, RBAC, and Safe Provisioning
// ==============================================================================

describe("Administrator Authentication & Authorization Hardening", () => {
  const configuredAdminEmail = "admin@hsspareparts.com";
  const testPassword = "AdminSecurePassword2026!";
  const dummyHash = "$2b$12$e8Yh3P7e5yT0k8q4V3j2w1Z9x8c7v6b5n4m3a2s1d0f9g8h7j6k5l";
  const altHash = "$2b$12$f9Zi4Q8f6zU1l9r5W4k3x2A0y9d8w7c6o5n4b3t2e1g0h9j8k7l6m";
  const customerHash = "$2b$12$a1Bc2De3Fg4Hi5Jk6Lm7No8Pq9Rs0Tu1Vw2Xy3Za4Bc5De6Fg7Hi8";

  let db: MockAdminDb;

  beforeEach(() => {
    db = new MockAdminDb();
  });

  describe("1. Admin Password Hashing & Authentication Security", () => {
    it("should hash passwords using bcrypt with at least 12 salt rounds", async () => {
      const hash = await hashPassword(testPassword);
      expect(hash).toMatch(/^\$2[aby]\$12\$/);
      expect(BCRYPT_HASH_REGEX.test(hash)).toBe(true);
    });

    it("should successfully verify the correct admin password against the hash", async () => {
      const hash = await hashPassword(testPassword);
      const isValid = await verifyPassword(testPassword, hash);
      expect(isValid).toBe(true);
    });

    it("should reject incorrect passwords with constant-time verification", async () => {
      const hash = await hashPassword(testPassword);
      const isInvalid = await verifyPassword("WrongPassword123!", hash);
      expect(isInvalid).toBe(false);
    });

    it("should validate that the admin email satisfies login schema requirements", () => {
      const parseResult = loginSchema.safeParse({
        email: configuredAdminEmail,
        password: testPassword,
      });
      expect(parseResult.success).toBe(true);
    });

    it("should validate admin credentials against strong password policy", () => {
      const parseResult = strongPasswordSchema.safeParse(testPassword);
      expect(parseResult.success).toBe(true);
    });
  });

  describe("2. RBAC Permissions & Role Invariants", () => {
    const adminUser: SafeUser = {
      id: "admin-uuid-1",
      email: configuredAdminEmail,
      name: "Store Administrator",
      phone: null,
      status: "active",
      roles: [ROLES.ADMINISTRATOR],
      permissions: DEFAULT_ROLE_PERMISSIONS[ROLES.ADMINISTRATOR],
      createdAt: new Date(),
    };

    const customerUser: SafeUser = {
      id: "customer-uuid-1",
      email: "customer@example.com",
      name: "Customer User",
      phone: null,
      status: "active",
      roles: [ROLES.CUSTOMER],
      permissions: DEFAULT_ROLE_PERMISSIONS[ROLES.CUSTOMER],
      createdAt: new Date(),
    };

    it("should assign full administrator permissions in DEFAULT_ROLE_PERMISSIONS", () => {
      const adminPerms = DEFAULT_ROLE_PERMISSIONS[ROLES.ADMINISTRATOR];
      expect(adminPerms).toContain(PERMISSIONS.CATALOGUE_READ);
      expect(adminPerms).toContain(PERMISSIONS.CATALOGUE_WRITE);
      expect(adminPerms).toContain(PERMISSIONS.CATALOGUE_DELETE);
      expect(adminPerms).toContain(PERMISSIONS.ORDERS_MANAGE);
      expect(adminPerms).toContain(PERMISSIONS.ORDERS_FULFILL);
    });

    it("should strictly deny administrative permissions to customer role", () => {
      const customerPerms = DEFAULT_ROLE_PERMISSIONS[ROLES.CUSTOMER];
      expect(customerPerms).not.toContain(PERMISSIONS.CATALOGUE_WRITE);
      expect(customerPerms).not.toContain(PERMISSIONS.CATALOGUE_DELETE);
      expect(customerPerms).not.toContain(PERMISSIONS.ORDERS_MANAGE);
      expect(customerPerms).not.toContain(PERMISSIONS.ORDERS_FULFILL);
    });

    it("should verify admin user has the administrator role", () => {
      expect(hasRole(adminUser.roles, [ROLES.ADMINISTRATOR])).toBe(true);
      expect(hasRole(customerUser.roles, [ROLES.ADMINISTRATOR])).toBe(false);
    });

    it("should verify admin user has catalogue management permissions", () => {
      expect(hasPermission(adminUser.permissions, PERMISSIONS.CATALOGUE_WRITE)).toBe(true);
      expect(hasPermission(adminUser.permissions, PERMISSIONS.CATALOGUE_DELETE)).toBe(true);
    });

    it("should verify customer user lacks catalogue management permissions", () => {
      expect(hasPermission(customerUser.permissions, PERMISSIONS.CATALOGUE_WRITE)).toBe(false);
      expect(hasPermission(customerUser.permissions, PERMISSIONS.CATALOGUE_DELETE)).toBe(false);
    });
  });

  describe("3. Admin Access Boundary Assertions", () => {
    const adminUser: SafeUser = {
      id: "admin-uuid-1",
      email: configuredAdminEmail,
      name: "Store Administrator",
      phone: null,
      status: "active",
      roles: [ROLES.ADMINISTRATOR],
      permissions: DEFAULT_ROLE_PERMISSIONS[ROLES.ADMINISTRATOR],
      createdAt: new Date(),
    };

    const customerUser: SafeUser = {
      id: "customer-uuid-1",
      email: "customer@example.com",
      name: "Customer User",
      phone: null,
      status: "active",
      roles: [ROLES.CUSTOMER],
      permissions: DEFAULT_ROLE_PERMISSIONS[ROLES.CUSTOMER],
      createdAt: new Date(),
    };

    it("should permit assertAdminCatalogueAccess for administrator", async () => {
      await expect(
        assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_WRITE, adminUser)
      ).resolves.not.toThrow();
    });

    it("should throw AuthorizationError for customer in assertAdminCatalogueAccess", async () => {
      await expect(
        assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_WRITE, customerUser)
      ).rejects.toThrow(AuthorizationError);
    });

    it("should throw AuthenticationError for unauthenticated session in assertAdminCatalogueAccess", async () => {
      await expect(
        assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_WRITE, null)
      ).rejects.toThrow(AuthenticationError);
    });

    it("should permit fulfillment action assertion for administrator", async () => {
      await expect(
        assertAdminFulfillmentAccess(PERMISSIONS.ORDERS_FULFILL, adminUser)
      ).resolves.not.toThrow();
    });

    it("should strictly deny fulfillment access to customer", async () => {
      await expect(
        assertAdminFulfillmentAccess(PERMISSIONS.ORDERS_FULFILL, customerUser)
      ).rejects.toThrow(AuthorizationError);
    });

    it("should strictly deny fulfillment access when unauthenticated", async () => {
      await expect(
        assertAdminFulfillmentAccess(PERMISSIONS.ORDERS_FULFILL, null)
      ).rejects.toThrow(AuthenticationError);
    });
  });

  describe("4. Fail-Closed Admin Provisioning Security (Remediation Regressions)", () => {
    it("1. A new email creates the intended administrator account", async () => {
      const result = await provisionAdminAccount(db, {
        email: "brandnewadmin@example.com",
        passwordHash: dummyHash,
        name: "New Admin",
      });

      expect(result.outcome).toBe("created");
      expect(result.isNewUser).toBe(true);
      expect(result.role).toBe(ROLES.ADMINISTRATOR);
      expect(result.status).toBe("active");

      // Verify user inserted into mock DB
      const inserted = db.users.get(result.userId);
      expect(inserted).toBeDefined();
      expect(inserted?.emailNormalized).toBe("brandnewadmin@example.com");
      expect(inserted?.passwordHash).toBe(dummyHash);
      expect(inserted?.status).toBe("active");

      // Verify role assigned
      const mapping = db.userRoles.find(
        (ur) => ur.userId === result.userId && ur.roleId === "role-admin-uuid"
      );
      expect(mapping).toBeDefined();
    });

    it("2. A pre-existing customer with the same email causes a safe conflict", async () => {
      db.users.set("usr-customer-1", {
        id: "usr-customer-1",
        emailNormalized: "customer.alice@example.com",
        passwordHash: customerHash,
        name: "Alice Customer",
        status: "active",
      });
      db.userRoles.push({
        userId: "usr-customer-1",
        roleId: "role-customer-uuid",
      });

      await expect(
        provisionAdminAccount(db, {
          email: "customer.alice@example.com",
          passwordHash: dummyHash,
        })
      ).rejects.toThrow(/PROVISION_CONFLICT/);
    });

    it("3. The existing customer's password hash remains unchanged", async () => {
      db.users.set("usr-customer-1", {
        id: "usr-customer-1",
        emailNormalized: "customer.alice@example.com",
        passwordHash: customerHash,
        name: "Alice Customer",
        status: "active",
      });
      db.userRoles.push({
        userId: "usr-customer-1",
        roleId: "role-customer-uuid",
      });

      try {
        await provisionAdminAccount(db, {
          email: "customer.alice@example.com",
          passwordHash: dummyHash,
        });
      } catch {
        // Expected conflict error
      }

      const user = db.users.get("usr-customer-1");
      expect(user?.passwordHash).toBe(customerHash);
      expect(user?.passwordHash).not.toBe(dummyHash);
    });

    it("4. The existing customer's account status remains unchanged", async () => {
      db.users.set("usr-customer-suspended", {
        id: "usr-customer-suspended",
        emailNormalized: "suspended.user@example.com",
        passwordHash: customerHash,
        name: "Suspended User",
        status: "suspended",
      });
      db.userRoles.push({
        userId: "usr-customer-suspended",
        roleId: "role-customer-uuid",
      });

      try {
        await provisionAdminAccount(db, {
          email: "suspended.user@example.com",
          passwordHash: dummyHash,
        });
      } catch {
        // Expected conflict error
      }

      const user = db.users.get("usr-customer-suspended");
      expect(user?.status).toBe("suspended");
      expect(user?.status).not.toBe("active");
    });

    it("5. The existing customer receives no administrator role", async () => {
      db.users.set("usr-customer-1", {
        id: "usr-customer-1",
        emailNormalized: "customer.alice@example.com",
        passwordHash: customerHash,
        name: "Alice Customer",
        status: "active",
      });
      db.userRoles.push({
        userId: "usr-customer-1",
        roleId: "role-customer-uuid",
      });

      try {
        await provisionAdminAccount(db, {
          email: "customer.alice@example.com",
          passwordHash: dummyHash,
        });
      } catch {
        // Expected conflict error
      }

      const hasAdmin = db.userRoles.some(
        (ur) => ur.userId === "usr-customer-1" && ur.roleId === "role-admin-uuid"
      );
      expect(hasAdmin).toBe(false);
    });

    it("6. A previously provisioned active administrator is recognized safely on repeat execution", async () => {
      const firstResult = await provisionAdminAccount(db, {
        email: "repeatadmin@example.com",
        passwordHash: dummyHash,
        name: "Repeat Admin",
      });
      expect(firstResult.outcome).toBe("created");
      expect(firstResult.isNewUser).toBe(true);

      const secondResult = await provisionAdminAccount(db, {
        email: "repeatadmin@example.com",
        passwordHash: altHash,
        name: "Repeat Admin",
      });
      expect(secondResult.outcome).toBe("already_provisioned");
      expect(secondResult.isNewUser).toBe(false);
      expect(secondResult.userId).toBe(firstResult.userId);
    });

    it("7. Repeat execution does not overwrite an existing administrator password", async () => {
      const firstResult = await provisionAdminAccount(db, {
        email: "secureadmin@example.com",
        passwordHash: dummyHash,
      });

      await provisionAdminAccount(db, {
        email: "secureadmin@example.com",
        passwordHash: altHash,
      });

      const user = db.users.get(firstResult.userId);
      expect(user?.passwordHash).toBe(dummyHash);
      expect(user?.passwordHash).not.toBe(altHash);
    });

    it("8. Role assignment is restricted to the intended account", async () => {
      const result = await provisionAdminAccount(db, {
        email: "isolatedadmin@example.com",
        passwordHash: dummyHash,
      });

      const mappings = db.userRoles.filter((ur) => ur.roleId === "role-admin-uuid");
      expect(mappings.length).toBe(1);
      expect(mappings[0]?.userId).toBe(result.userId);
    });

    it("9. A transaction failure rolls back account and role changes", async () => {
      db.failNextTransaction = true;

      await expect(
        provisionAdminAccount(db, {
          email: "abortedadmin@example.com",
          passwordHash: dummyHash,
        })
      ).rejects.toThrow(/TRANSACTION_FAILED/);

      const usersList = Array.from(db.users.values()).filter(
        (u) => u.emailNormalized === "abortedadmin@example.com"
      );
      expect(usersList.length).toBe(0);
      expect(db.userRoles.length).toBe(0);
    });

    it("10. Repeat sequential execution safely returns already_provisioned without duplicate role mappings", async () => {
      const res1 = await provisionAdminAccount(db, {
        email: "sequential@example.com",
        passwordHash: dummyHash,
      });

      const res2 = await provisionAdminAccount(db, {
        email: "sequential@example.com",
        passwordHash: dummyHash,
      });

      expect(res1.userId).toBe(res2.userId);
      expect(res2.outcome).toBe("already_provisioned");

      const rolesForUser = db.userRoles.filter(
        (ur) => ur.userId === res1.userId && ur.roleId === "role-admin-uuid"
      );
      expect(rolesForUser.length).toBe(1);
    });

    it("11. Genuine concurrent execution with Promise.all triggers unique constraint rollback and fail-closed handling", async () => {
      // Configure in-memory DB to simulate interleaved concurrent execution
      db.concurrencyDelayMs = 10;

      const results = await Promise.allSettled([
        provisionAdminAccount(db, {
          email: "racecondition@example.com",
          passwordHash: dummyHash,
        }),
        provisionAdminAccount(db, {
          email: "racecondition@example.com",
          passwordHash: dummyHash,
        }),
      ]);

      // Exactly one must succeed and one must be rejected with fail-closed PROVISION_CONFLICT
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      if (rejected[0]?.status === "rejected") {
        expect(rejected[0].reason?.message).toContain("PROVISION_CONFLICT");
        expect(rejected[0].reason?.message).toContain("Concurrent provisioning collision");
      }

      // In-memory state must have exactly 1 user and 1 role assignment
      const usersList = Array.from(db.users.values()).filter(
        (u) => u.emailNormalized === "racecondition@example.com"
      );
      expect(usersList.length).toBe(1);

      const rolesForUser = db.userRoles.filter(
        (ur) => ur.userId === usersList[0]?.id && ur.roleId === "role-admin-uuid"
      );
      expect(rolesForUser.length).toBe(1);
    });

    it("12. An existing administrator account with status !== 'active' causes a fail-closed PROVISION_CONFLICT", async () => {
      // Seed pre-existing suspended administrator
      db.users.set("usr-admin-suspended", {
        id: "usr-admin-suspended",
        emailNormalized: "suspendedadmin@example.com",
        passwordHash: dummyHash,
        name: "Suspended Admin",
        status: "suspended",
      });
      db.userRoles.push({
        userId: "usr-admin-suspended",
        roleId: "role-admin-uuid",
      });

      await expect(
        provisionAdminAccount(db, {
          email: "suspendedadmin@example.com",
          passwordHash: dummyHash,
        })
      ).rejects.toThrow(/PROVISION_CONFLICT.*status 'suspended'/);

      // Verify status was not altered
      const user = db.users.get("usr-admin-suspended");
      expect(user?.status).toBe("suspended");
      expect(user?.status).not.toBe("active");
    });

    it("13. Unauthorized or non-administrator role keys are strictly rejected", async () => {
      // In provisionAdminAccount
      await expect(
        provisionAdminAccount(db, {
          email: "customrole@example.com",
          passwordHash: dummyHash,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          roleKey: "customer" as any,
        })
      ).rejects.toThrow(/Unauthorized role keys are prohibited/);

      // In generateAdminProvisioningSql
      expect(() =>
        generateAdminProvisioningSql({
          email: configuredAdminEmail,
          passwordHash: dummyHash,
          roleKey: "customer",
        })
      ).toThrow(/Unauthorized role keys are prohibited/);
    });

    it("14. Input validation strictly rejects invalid emails and malformed password hashes", async () => {
      // Malformed emails
      await expect(
        provisionAdminAccount(db, {
          email: "invalid-email-format",
          passwordHash: dummyHash,
        })
      ).rejects.toThrow(/A valid email address is required/);

      // Malformed password hashes
      await expect(
        provisionAdminAccount(db, {
          email: "valid@example.com",
          passwordHash: "plaintext-password",
        })
      ).rejects.toThrow(/A valid bcrypt password hash is required/);

      // NUL bytes in name
      await expect(
        provisionAdminAccount(db, {
          email: "valid@example.com",
          passwordHash: dummyHash,
          name: "Admin\0Injection",
        })
      ).rejects.toThrow(/cannot contain NUL/);
    });

    it("15. escapeSqlLiteral doubles single quotes, preserves valid text, and rejects NUL bytes", () => {
      expect(escapeSqlLiteral("simple")).toBe("'simple'");
      expect(escapeSqlLiteral("O'Connor")).toBe("'O''Connor'");
      expect(escapeSqlLiteral("'; DROP TABLE users; --")).toBe("'''; DROP TABLE users; --'");
      expect(() => escapeSqlLiteral("bad\0byte")).toThrow(/cannot contain NUL/);
    });

    it("16. SQL generator strictly prevents SQL injection across email, passwordHash, and name inputs", () => {
      // SQL injection in email is blocked by EMAIL_REGEX format validation
      expect(() =>
        generateAdminProvisioningSql({
          email: "admin@test.com' OR '1'='1",
          passwordHash: dummyHash,
        })
      ).toThrow(/A valid email address is required/);

      // SQL injection in passwordHash is blocked by BCRYPT_HASH_REGEX format validation
      expect(() =>
        generateAdminProvisioningSql({
          email: "admin@test.com",
          passwordHash: "' OR 1=1; --",
        })
      ).toThrow(/A valid bcrypt password hash is required/);

      // SQL injection in name is safely escaped in SQL literal
      const sql = generateAdminProvisioningSql({
        email: "admin@test.com",
        passwordHash: dummyHash,
        name: "Admin'; DROP TABLE users; --",
      });
      expect(sql).toContain("'Admin''; DROP TABLE users; --'");
      expect(sql).not.toContain("'Admin'; DROP TABLE users; --'");
    });

    it("17. Generated SQL script contains account status inspection and fail-closed abort for inactive administrators", () => {
      const sql = generateAdminProvisioningSql({
        email: configuredAdminEmail,
        passwordHash: dummyHash,
      });

      expect(sql).toContain("v_user_status text;");
      expect(sql).toContain("SELECT id, status INTO v_user_id, v_user_status");
      expect(sql).toContain("IF v_user_status <> 'active' THEN");
      expect(sql).toContain("RAISE EXCEPTION 'PROVISION_CONFLICT: Administrator account exists with status");
    });

    it("18. Generated SQL does not contain the unsafe password/status-updating user upsert", () => {
      const sql = generateAdminProvisioningSql({
        email: configuredAdminEmail,
        passwordHash: dummyHash,
        name: "Store Administrator",
      });

      expect(sql).not.toContain("ON CONFLICT (\"email_normalized\") DO UPDATE");
      expect(sql).not.toContain("DO UPDATE SET \"password_hash\"");
      expect(sql).not.toContain("DO UPDATE SET \"status\"");
      expect(sql).toContain("DO $$");
      expect(sql).toContain("PROVISION_CONFLICT");
      expect(sql).toContain("RAISE EXCEPTION");
      expect(sql).toContain("RAISE NOTICE");
      expect(sql).toContain(`'${configuredAdminEmail.toLowerCase()}'`);
    });

    it("19. Error messages and logs do not reveal passwords or hashes", async () => {
      const secretCustomerHash = dummyHash;
      const secretAdminHash = altHash;

      db.users.set("usr-conflict", {
        id: "usr-conflict",
        emailNormalized: "conflict@example.com",
        passwordHash: secretCustomerHash,
        name: "Customer",
        status: "active",
      });
      db.userRoles.push({
        userId: "usr-conflict",
        roleId: "role-customer-uuid",
      });

      let capturedError: Error | null = null;
      try {
        await provisionAdminAccount(db, {
          email: "conflict@example.com",
          passwordHash: secretAdminHash,
        });
      } catch (err: unknown) {
        capturedError = err as Error;
      }

      expect(capturedError).not.toBeNull();
      const message = capturedError!.message;
      expect(message).not.toContain(secretCustomerHash);
      expect(message).not.toContain(secretAdminHash);
      expect(message).not.toContain(testPassword);
      expect(message).toContain("PROVISION_CONFLICT");
    });

    it("20. Validates regex patterns: EMAIL_REGEX and BCRYPT_HASH_REGEX", () => {
      expect(EMAIL_REGEX.test("admin@example.com")).toBe(true);
      expect(EMAIL_REGEX.test("not-an-email")).toBe(false);
      expect(EMAIL_REGEX.test("admin@localhost")).toBe(false);

      expect(BCRYPT_HASH_REGEX.test(dummyHash)).toBe(true);
      expect(BCRYPT_HASH_REGEX.test("plaintext")).toBe(false);
      expect(BCRYPT_HASH_REGEX.test("$2b$12$tooshort")).toBe(false);
    });
  });

  describe("5. Session Security Invariants", () => {
    it("should configure strict HttpOnly, Lax, and 30-day maxAge on session cookies", () => {
      const cookieOptions = getSessionCookieOptions();

      expect(cookieOptions.httpOnly).toBe(true);
      expect(cookieOptions.sameSite).toBe("lax");
      expect(cookieOptions.path).toBe("/");
      expect(cookieOptions.maxAge).toBe(30 * 24 * 60 * 60);
    });
  });
});
