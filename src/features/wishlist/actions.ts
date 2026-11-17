"use server";

import { revalidatePath } from "next/cache";
import { addToWishlist, removeFromWishlist, getWishlist } from "./service";
import type { AddToWishlistInput, RemoveFromWishlistInput, WishlistDTO } from "./schemas";
import { addToWishlistSchema, removeFromWishlistSchema } from "./schemas";

export interface WishlistActionResult {
  success: boolean;
  wishlist?: WishlistDTO;
  error?: string;
}

export async function getWishlistAction(): Promise<WishlistActionResult> {
  try {
    const wishlist = await getWishlist();
    return { success: true, wishlist };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load wishlist.";
    console.error("[WishlistAction] getWishlist error:", error);
    return { success: false, error: message };
  }
}

export async function addToWishlistAction(rawInput: AddToWishlistInput): Promise<WishlistActionResult> {
  try {
    const parsed = addToWishlistSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0]?.message || "Invalid product." };
    }

    const wishlist = await addToWishlist(parsed.data);
    revalidatePath("/wishlist");
    return { success: true, wishlist };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to add to wishlist.";
    console.error("[WishlistAction] addToWishlist error:", error);
    return { success: false, error: message };
  }
}

export async function removeFromWishlistAction(rawInput: RemoveFromWishlistInput): Promise<WishlistActionResult> {
  try {
    const parsed = removeFromWishlistSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0]?.message || "Invalid product." };
    }

    const wishlist = await removeFromWishlist(parsed.data);
    revalidatePath("/wishlist");
    return { success: true, wishlist };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to remove from wishlist.";
    console.error("[WishlistAction] removeFromWishlist error:", error);
    return { success: false, error: message };
  }
}
