import { describe, it, expect } from "vitest";
import {
  ROLES,
  PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  hasRole,
  hasPermission,
} from "../../src/lib/auth/rbac";

describe("Role-Based Access Control (RBAC)", () => {
  it("should prevent regular customers from accessing admin permissions", () => {
    const customerRoles = [ROLES.CUSTOMER];
    const customerPerms = DEFAULT_ROLE_PERMISSIONS[ROLES.CUSTOMER];

    // Customer should have storefront & self permissions
    expect(hasPermission(customerPerms, PERMISSIONS.STORE_BROWSE)).toBe(true);
    expect(hasPermission(customerPerms, PERMISSIONS.CUSTOMER_READ_OWN)).toBe(true);
    expect(hasPermission(customerPerms, PERMISSIONS.ORDERS_CREATE)).toBe(true);

    // Customer must NEVER have admin permissions
    expect(hasPermission(customerPerms, PERMISSIONS.ADMIN_ACCESS)).toBe(false);
    expect(hasPermission(customerPerms, PERMISSIONS.CATALOGUE_WRITE)).toBe(false);
    expect(hasPermission(customerPerms, PERMISSIONS.ORDERS_REFUND)).toBe(false);
    expect(hasPermission(customerPerms, PERMISSIONS.SETTINGS_MANAGE)).toBe(false);

    expect(hasRole(customerRoles, [ROLES.ADMINISTRATOR])).toBe(false);
  });

  it("should permit administrators access to management features", () => {
    const adminRoles = [ROLES.ADMINISTRATOR];
    const adminPerms = DEFAULT_ROLE_PERMISSIONS[ROLES.ADMINISTRATOR];

    expect(hasRole(adminRoles, [ROLES.ADMINISTRATOR])).toBe(true);
    expect(hasPermission(adminPerms, PERMISSIONS.ADMIN_ACCESS)).toBe(true);
    expect(hasPermission(adminPerms, PERMISSIONS.CATALOGUE_WRITE)).toBe(true);
    expect(hasPermission(adminPerms, PERMISSIONS.ORDERS_REFUND)).toBe(true);
    expect(hasPermission(adminPerms, PERMISSIONS.AUDIT_READ)).toBe(true);
  });

  it("should allow super administrator unrestricted access across all roles", () => {
    const superAdminRoles = [ROLES.SUPER_ADMINISTRATOR];
    const superAdminPerms = DEFAULT_ROLE_PERMISSIONS[ROLES.SUPER_ADMINISTRATOR];

    expect(hasRole(superAdminRoles, [ROLES.CATALOGUE_MANAGER])).toBe(true);
    expect(hasRole(superAdminRoles, [ROLES.ORDER_MANAGER])).toBe(true);
    expect(hasPermission(superAdminPerms, PERMISSIONS.USERS_MANAGE_ROLES)).toBe(true);
  });

  it("should properly isolate catalogue managers from order refunds", () => {
    const catManagerPerms = DEFAULT_ROLE_PERMISSIONS[ROLES.CATALOGUE_MANAGER];

    expect(hasPermission(catManagerPerms, PERMISSIONS.CATALOGUE_WRITE)).toBe(true);
    expect(hasPermission(catManagerPerms, PERMISSIONS.FITMENT_WRITE)).toBe(true);
    // Catalogue managers cannot issue refunds or manage user roles
    expect(hasPermission(catManagerPerms, PERMISSIONS.ORDERS_REFUND)).toBe(false);
    expect(hasPermission(catManagerPerms, PERMISSIONS.USERS_MANAGE_ROLES)).toBe(false);
  });
});
