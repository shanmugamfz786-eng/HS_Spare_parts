import "server-only";

export const ROLES = {
  GUEST: "guest",
  CUSTOMER: "customer",
  SUPPORT_STAFF: "support_staff",
  CATALOGUE_MANAGER: "catalogue_manager",
  ORDER_MANAGER: "order_manager",
  ADMINISTRATOR: "administrator",
  SUPER_ADMINISTRATOR: "super_administrator",
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

export const PERMISSIONS = {
  // Storefront & Customer permissions
  STORE_BROWSE: "store:browse",
  CUSTOMER_READ_OWN: "customer:read_own",
  CUSTOMER_WRITE_OWN: "customer:write_own",
  ORDERS_READ_OWN: "orders:read_own",
  ORDERS_CREATE: "orders:create",

  // Support staff permissions
  SUPPORT_READ: "support:read",
  SUPPORT_WRITE: "support:write",

  // Catalogue management permissions
  CATALOGUE_READ: "catalogue:read",
  CATALOGUE_WRITE: "catalogue:write",
  CATALOGUE_DELETE: "catalogue:delete",
  FITMENT_WRITE: "fitment:write",
  INVENTORY_ADJUST: "inventory:adjust",

  // Order management permissions
  ORDERS_MANAGE: "orders:manage",
  ORDERS_FULFILL: "orders:fulfill",
  ORDERS_REFUND: "orders:refund",

  // Marketing & Reviews
  COUPONS_MANAGE: "coupons:manage",
  REVIEWS_MODERATE: "reviews:moderate",

  // High-level administration
  ADMIN_ACCESS: "admin:access",
  USERS_MANAGE_ROLES: "users:manage_roles",
  SETTINGS_MANAGE: "settings:manage",
  AUDIT_READ: "audit:read",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Built-in role to permissions mapping matrix.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  [ROLES.GUEST]: [PERMISSIONS.STORE_BROWSE],
  [ROLES.CUSTOMER]: [
    PERMISSIONS.STORE_BROWSE,
    PERMISSIONS.CUSTOMER_READ_OWN,
    PERMISSIONS.CUSTOMER_WRITE_OWN,
    PERMISSIONS.ORDERS_READ_OWN,
    PERMISSIONS.ORDERS_CREATE,
  ],
  [ROLES.SUPPORT_STAFF]: [
    PERMISSIONS.ADMIN_ACCESS,
    PERMISSIONS.SUPPORT_READ,
    PERMISSIONS.SUPPORT_WRITE,
    PERMISSIONS.CATALOGUE_READ,
  ],
  [ROLES.CATALOGUE_MANAGER]: [
    PERMISSIONS.ADMIN_ACCESS,
    PERMISSIONS.CATALOGUE_READ,
    PERMISSIONS.CATALOGUE_WRITE,
    PERMISSIONS.CATALOGUE_DELETE,
    PERMISSIONS.FITMENT_WRITE,
    PERMISSIONS.INVENTORY_ADJUST,
    PERMISSIONS.REVIEWS_MODERATE,
  ],
  [ROLES.ORDER_MANAGER]: [
    PERMISSIONS.ADMIN_ACCESS,
    PERMISSIONS.ORDERS_MANAGE,
    PERMISSIONS.ORDERS_FULFILL,
    PERMISSIONS.ORDERS_REFUND,
    PERMISSIONS.INVENTORY_ADJUST,
  ],
  [ROLES.ADMINISTRATOR]: [
    PERMISSIONS.ADMIN_ACCESS,
    PERMISSIONS.CATALOGUE_READ,
    PERMISSIONS.CATALOGUE_WRITE,
    PERMISSIONS.CATALOGUE_DELETE,
    PERMISSIONS.FITMENT_WRITE,
    PERMISSIONS.INVENTORY_ADJUST,
    PERMISSIONS.ORDERS_MANAGE,
    PERMISSIONS.ORDERS_FULFILL,
    PERMISSIONS.ORDERS_REFUND,
    PERMISSIONS.COUPONS_MANAGE,
    PERMISSIONS.REVIEWS_MODERATE,
    PERMISSIONS.SETTINGS_MANAGE,
    PERMISSIONS.AUDIT_READ,
  ],
  [ROLES.SUPER_ADMINISTRATOR]: Object.values(PERMISSIONS) as PermissionKey[],
};

/**
 * Evaluates whether a set of user role keys satisfies required roles.
 */
export function hasRole(userRoles: string[], allowedRoles: string[]): boolean {
  if (userRoles.includes(ROLES.SUPER_ADMINISTRATOR)) {
    return true; // Super administrator has unrestricted access
  }
  return userRoles.some((role) => allowedRoles.includes(role));
}

/**
 * Evaluates whether a user's combined permissions satisfy a required permission.
 */
export function hasPermission(userPermissions: string[], requiredPermission: string): boolean {
  return userPermissions.includes(requiredPermission);
}

export class AuthenticationError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  constructor(message = "Access denied: insufficient permissions") {
    super(message);
    this.name = "AuthorizationError";
  }
}
