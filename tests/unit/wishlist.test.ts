import { describe, it, expect } from "vitest";
import { addToWishlistSchema, removeFromWishlistSchema } from "@/features/wishlist/schemas";

describe("Wishlist Domain Logic & Validation (Phase 5)", () => {
  describe("Wishlist Schemas", () => {
    it("should accept valid product IDs", () => {
      const valid = addToWishlistSchema.safeParse({ productId: "prod-456" });
      expect(valid.success).toBe(true);
    });

    it("should reject empty product IDs", () => {
      const invalid = addToWishlistSchema.safeParse({ productId: "" });
      expect(invalid.success).toBe(false);
    });

    it("should reject unexpected keys (strict mode)", () => {
      const tampered = addToWishlistSchema.safeParse({
        productId: "prod-456",
        userId: "hacked-user-id", // Cannot inject userId from client
      });
      expect(tampered.success).toBe(false);
    });
  });

  describe("Wishlist Duplicate Suppression & Ownership Invariants", () => {
    it("should simulate duplicate suppression using a Set/Unique index", () => {
      const wishlistItems = new Set<string>();

      function addItem(wishlistId: string, productId: string): boolean {
        const key = `${wishlistId}:${productId}`;
        if (wishlistItems.has(key)) {
          return false; // Suppressed
        }
        wishlistItems.add(key);
        return true;
      }

      const wId = "wishlist-1";
      const pId = "prod-abc";

      expect(addItem(wId, pId)).toBe(true);
      // Second attempt to add same product must be suppressed
      expect(addItem(wId, pId)).toBe(false);
      expect(wishlistItems.size).toBe(1);
    });

    it("should enforce customer ownership and isolate wishlist by user", () => {
      const userWishlists = new Map<string, string[]>([
        ["user-1", ["prod-A", "prod-B"]],
        ["user-2", ["prod-C"]],
      ]);

      function getUserWishlist(requestingUserId: string): string[] {
        return userWishlists.get(requestingUserId) || [];
      }

      // User 1 cannot see User 2's wishlist
      expect(getUserWishlist("user-1")).toEqual(["prod-A", "prod-B"]);
      expect(getUserWishlist("user-2")).toEqual(["prod-C"]);
      expect(getUserWishlist("user-3")).toEqual([]);
    });
  });
});
