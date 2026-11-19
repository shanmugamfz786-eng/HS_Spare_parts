"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, type SafeUser } from "@/features/auth/service";
import {
  ROLES,
  PERMISSIONS,
  hasRole,
  hasPermission,
  AuthenticationError,
  AuthorizationError,
  type PermissionKey,
} from "@/lib/auth/rbac";
import {
  manualDispatchInputSchema,
  updateShipmentStatusInputSchema,
  type ManualDispatchInput,
  type UpdateShipmentStatusActionInput,
} from "./schemas";
import {
  dispatchOrder,
  updateShipmentMilestoneStatus,
  defaultDrizzleFulfillmentStore,
  type FulfillmentStorageAdapter,
  type OrderFulfillmentRecord,
  type ShipmentRecord,
} from "./service";
import type {
  ShipmentStatus,
  AdminOrderListItemDTO,
  AdminOrderDetailDTO,
} from "./types";

export type { ManualDispatchInput, UpdateShipmentStatusActionInput };

export interface AdminActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  isUnauthorized?: boolean;
}

function isAuthErrorMessage(message: string): boolean {
  return (
    message.includes("Access Denied") ||
    message.includes("Authentication required") ||
    message.includes("Insufficient permissions") ||
    message.includes("Access denied")
  );
}

/**
 * Asserts that the authenticated user possesses orders fulfillment/management permissions.
 * Explicitly rejects customer accounts and unauthenticated requests.
 */
export async function assertAdminFulfillmentAccess(
  permission: PermissionKey = PERMISSIONS.ORDERS_FULFILL,
  userOverride?: SafeUser | null
) {
  const currentUser = userOverride !== undefined ? userOverride : await getCurrentUser();

  if (!currentUser) {
    throw new AuthenticationError("Authentication required: Please sign in as an administrator.");
  }

  // Reject customer role explicitly if not combined with administrator/order manager roles
  const isAdminOrManager = hasRole(currentUser.roles, [
    ROLES.ADMINISTRATOR,
    ROLES.SUPER_ADMINISTRATOR,
    ROLES.ORDER_MANAGER,
  ]);

  if (currentUser.roles.includes(ROLES.CUSTOMER) && !isAdminOrManager) {
    throw new AuthorizationError(
      "Access Denied: Regular customer accounts cannot access order fulfillment or management tools."
    );
  }

  const hasAccess = isAdminOrManager || hasPermission(currentUser.permissions, permission);

  if (!hasAccess) {
    throw new AuthorizationError(
      `Access Denied: Insufficient permissions. Required: ${permission}`
    );
  }

  return currentUser;
}

/**
 * Action: Load admin orders list with optional status filtering.
 */
export async function getAdminOrdersAction(
  options?: {
    status?: "all" | "awaiting_dispatch" | "unpaid" | "shipped";
    limit?: number;
    offset?: number;
  },
  userOverride?: SafeUser | null,
  storage: FulfillmentStorageAdapter = defaultDrizzleFulfillmentStore
): Promise<AdminActionResult<AdminOrderListItemDTO[]>> {
  try {
    await assertAdminFulfillmentAccess(PERMISSIONS.ORDERS_MANAGE, userOverride);
    const getOrdersFn = storage.getAdminOrders;
    const ordersList = getOrdersFn
      ? await getOrdersFn(options)
      : await defaultDrizzleFulfillmentStore.getAdminOrders(options);
    return { success: true, data: ordersList };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load orders.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

/**
 * Action: Load admin order detail by ID.
 */
export async function getAdminOrderDetailAction(
  orderId: string,
  userOverride?: SafeUser | null,
  storage: FulfillmentStorageAdapter = defaultDrizzleFulfillmentStore
): Promise<AdminActionResult<AdminOrderDetailDTO>> {
  try {
    await assertAdminFulfillmentAccess(PERMISSIONS.ORDERS_MANAGE, userOverride);

    if (!orderId || !orderId.trim()) {
      return { success: false, error: "Order ID is required." };
    }

    const getDetailFn = storage.getAdminOrderDetail;
    const order = getDetailFn
      ? await getDetailFn(orderId.trim())
      : await defaultDrizzleFulfillmentStore.getAdminOrderDetail(orderId.trim());
    if (!order) {
      return { success: false, error: `Order with reference '${orderId}' not found.` };
    }

    return { success: true, data: order };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load order detail.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

export async function getOrdersAwaitingFulfillmentAction(
  userOverride?: SafeUser | null,
  storage: FulfillmentStorageAdapter = defaultDrizzleFulfillmentStore
): Promise<AdminActionResult<OrderFulfillmentRecord[]>> {
  try {
    await assertAdminFulfillmentAccess(PERMISSIONS.ORDERS_MANAGE, userOverride);
    const ordersList = await storage.getOrdersAwaitingFulfillment();
    return { success: true, data: ordersList };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load orders.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

/**
 * Action: Record manual dispatch with carrier tracking.
 */
export async function recordManualDispatchAction(
  rawInput: unknown,
  userOverride?: SafeUser | null,
  storage: FulfillmentStorageAdapter = defaultDrizzleFulfillmentStore
): Promise<AdminActionResult<ShipmentRecord>> {
  try {
    const user = await assertAdminFulfillmentAccess(PERMISSIONS.ORDERS_FULFILL, userOverride);

    const parsed = manualDispatchInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      const errorMsg = parsed.error.errors.map((e) => e.message).join(" ");
      return { success: false, error: errorMsg };
    }

    const input = parsed.data;

    const shipment = await dispatchOrder(
      {
        orderId: input.orderId,
        carrier: input.carrier,
        trackingNumber: input.trackingNumber,
        trackingUrl: input.trackingUrl || null,
        actorUserId: user.id,
      },
      undefined,
      storage
    );

    try {
      revalidatePath("/admin/orders");
      revalidatePath(`/admin/orders/${input.orderId}`);
    } catch {
      // Ignored outside Next.js request lifecycle
    }

    return { success: true, data: shipment };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to record manual dispatch.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

/**
 * Action: Update shipment milestone status and cascade to order.
 */
export async function updateShipmentStatusAction(
  rawInput: unknown,
  userOverride?: SafeUser | null,
  storage: FulfillmentStorageAdapter = defaultDrizzleFulfillmentStore
): Promise<AdminActionResult<{ updated: boolean }>> {
  try {
    const user = await assertAdminFulfillmentAccess(PERMISSIONS.ORDERS_FULFILL, userOverride);

    const parsed = updateShipmentStatusInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      const errorMsg = parsed.error.errors.map((e) => e.message).join(" ");
      return { success: false, error: errorMsg };
    }

    const input = parsed.data;

    await updateShipmentMilestoneStatus(
      {
        shipmentId: input.shipmentId,
        status: input.status as ShipmentStatus,
        note: input.note || undefined,
        actorUserId: user.id,
      },
      storage
    );

    try {
      revalidatePath("/admin/orders");
    } catch {
      // Ignored outside Next.js request lifecycle
    }

    return { success: true, data: { updated: true } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update shipment status.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}
