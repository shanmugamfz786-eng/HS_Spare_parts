"use server";

import { revalidatePath } from "next/cache";
import { addToCart, updateCartItemQuantity, removeFromCart, clearCart, getCart } from "./service";
import type { AddToCartInput, UpdateCartItemQuantityInput, RemoveFromCartInput, CartDTO } from "./schemas";
import { addToCartSchema, updateCartItemQuantitySchema, removeFromCartSchema } from "./schemas";

export interface CartActionResult {
  success: boolean;
  cart?: CartDTO;
  error?: string;
}

export async function getCartAction(): Promise<CartActionResult> {
  try {
    const cart = await getCart();
    return { success: true, cart };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load shopping cart.";
    console.error("[CartAction] getCart error:", error);
    return { success: false, error: message };
  }
}

export async function addToCartAction(rawInput: AddToCartInput): Promise<CartActionResult> {
  try {
    const parsed = addToCartSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0]?.message || "Invalid cart item input." };
    }

    const cart = await addToCart(parsed.data);
    revalidatePath("/cart");
    return { success: true, cart };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to add item to cart.";
    console.error("[CartAction] addToCart error:", error);
    return { success: false, error: message };
  }
}

export async function updateCartItemQuantityAction(rawInput: UpdateCartItemQuantityInput): Promise<CartActionResult> {
  try {
    const parsed = updateCartItemQuantitySchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0]?.message || "Invalid quantity." };
    }

    const cart = await updateCartItemQuantity(parsed.data);
    revalidatePath("/cart");
    return { success: true, cart };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update item quantity.";
    console.error("[CartAction] updateQuantity error:", error);
    return { success: false, error: message };
  }
}

export async function removeFromCartAction(rawInput: RemoveFromCartInput): Promise<CartActionResult> {
  try {
    const parsed = removeFromCartSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0]?.message || "Invalid item identifier." };
    }

    const cart = await removeFromCart(parsed.data);
    revalidatePath("/cart");
    return { success: true, cart };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to remove item from cart.";
    console.error("[CartAction] removeFromCart error:", error);
    return { success: false, error: message };
  }
}

export async function clearCartAction(): Promise<CartActionResult> {
  try {
    const cart = await clearCart();
    revalidatePath("/cart");
    return { success: true, cart };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to clear cart.";
    console.error("[CartAction] clearCart error:", error);
    return { success: false, error: message };
  }
}
