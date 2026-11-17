"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/service";
import { createOrder, getCustomerOrders, getOrderByReference } from "./service";
import type { CreateOrderInput, OrderDetailDTO, PaginatedOrdersDTO } from "./schemas";
import { createOrderInputSchema } from "./schemas";

export interface OrderActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  isUnauthenticated?: boolean;
}

export async function createOrderAction(rawInput: CreateOrderInput): Promise<OrderActionResult<OrderDetailDTO>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return {
        success: false,
        error: "Please sign in to complete your order.",
        isUnauthenticated: true,
      };
    }

    const parsed = createOrderInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message || "Invalid order inputs.",
      };
    }

    const order = await createOrder(currentUser.id, parsed.data);
    revalidatePath("/cart");
    revalidatePath("/checkout");
    revalidatePath("/account/orders");

    return { success: true, data: order };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to place order.";
    console.error("[OrderAction] createOrder error:", error);
    return { success: false, error: message };
  }
}

export async function getCustomerOrdersAction(
  page = 1,
  limit = 10
): Promise<OrderActionResult<PaginatedOrdersDTO>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return {
        success: false,
        error: "Please sign in to view your orders.",
        isUnauthenticated: true,
      };
    }

    const orders = await getCustomerOrders(currentUser.id, page, limit);
    return { success: true, data: orders };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load order history.";
    console.error("[OrderAction] getOrders error:", error);
    return { success: false, error: message };
  }
}

export async function getOrderByReferenceAction(
  orderReference: string
): Promise<OrderActionResult<OrderDetailDTO>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return {
        success: false,
        error: "Please sign in to view order details.",
        isUnauthenticated: true,
      };
    }

    const order = await getOrderByReference(currentUser.id, orderReference);
    return { success: true, data: order };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load order.";
    console.error("[OrderAction] getOrderByReference error:", error);
    return { success: false, error: message };
  }
}
