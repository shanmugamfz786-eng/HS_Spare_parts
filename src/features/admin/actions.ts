"use server";

import { revalidatePath } from "next/cache";
import {
  adminCreateProductSchema,
  adminUpdateProductSchema,
  type AdminCreateProductInput,
  type AdminUpdateProductInput,
} from "./schemas";
import {
  createAdminProduct,
  updateAdminProduct,
  publishAdminProduct,
  deleteAdminProduct,
  getAdminProducts,
} from "./service";

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
    message.includes("Insufficient permissions")
  );
}

export async function getAdminProductsAction(): Promise<AdminActionResult> {
  try {
    const products = await getAdminProducts();
    return { success: true, data: products };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load products.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

export async function createAdminProductAction(
  rawInput: AdminCreateProductInput
): Promise<AdminActionResult> {
  try {
    const parsed = adminCreateProductSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message || "Invalid product details.",
      };
    }

    const res = await createAdminProduct(parsed.data);

    revalidatePath("/admin/products");
    revalidatePath("/search");
    revalidatePath("/categories");
    revalidatePath("/");

    return { success: true, data: res };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create product.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

export async function updateAdminProductAction(
  rawInput: AdminUpdateProductInput
): Promise<AdminActionResult> {
  try {
    const parsed = adminUpdateProductSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message || "Invalid update payload.",
      };
    }

    const res = await updateAdminProduct(parsed.data);

    revalidatePath("/admin/products");
    revalidatePath("/search");
    revalidatePath("/categories");
    revalidatePath("/");

    return { success: true, data: res };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update product.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

export async function publishAdminProductAction(
  id: string,
  status: "active" | "draft" | "archived" = "active"
): Promise<AdminActionResult> {
  try {
    if (!id || typeof id !== "string") {
      return { success: false, error: "Product ID is required." };
    }

    const res = await publishAdminProduct(id, status);

    revalidatePath("/admin/products");
    revalidatePath("/search");
    revalidatePath("/categories");
    revalidatePath("/");

    return { success: true, data: res };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to change product status.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

export async function deleteAdminProductAction(
  id: string
): Promise<AdminActionResult> {
  try {
    if (!id || typeof id !== "string") {
      return { success: false, error: "Product ID is required." };
    }

    const res = await deleteAdminProduct(id);

    revalidatePath("/admin/products");
    revalidatePath("/search");
    revalidatePath("/categories");
    revalidatePath("/");

    return { success: true, data: res };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete product.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}
