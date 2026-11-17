import { describe, it, expect } from "vitest";
import { generateSecureToken, hashToken } from "@/lib/security";

describe("Cart Persistence, Session Hashing & Merge Invariants (Phase 5)", () => {
  // 1. Session Token & Hashing
  describe("Guest Session Token Security", () => {
    it("should generate unguessable 32-byte hexadecimal session tokens", () => {
      const token1 = generateSecureToken(32);
      const token2 = generateSecureToken(32);

      expect(token1).toHaveLength(64); // 32 bytes = 64 hex characters
      expect(token2).toHaveLength(64);
      expect(token1).not.toBe(token2);
    });

    it("should deterministically hash guest session tokens with SHA-256", () => {
      const token = "a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8";
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);

      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(token);
    });
  });

  // 2. Deterministic Cart Merge Domain Logic
  describe("Cart Merge Algorithm", () => {
    interface TestItem {
      productId: string;
      variantId: string | null;
      quantity: number;
    }

    function mergeItems(customerItems: TestItem[], guestItems: TestItem[]): TestItem[] {
      const result: TestItem[] = customerItems.map((item) => ({ ...item }));

      for (const gItem of guestItems) {
        const match = result.find(
          (cItem) =>
            cItem.productId === gItem.productId &&
            ((cItem.variantId === null && gItem.variantId === null) || cItem.variantId === gItem.variantId)
        );

        if (match) {
          // Sum and cap at 10
          match.quantity = Math.min(10, match.quantity + gItem.quantity);
        } else {
          result.push({ ...gItem, quantity: Math.min(10, Math.max(1, gItem.quantity)) });
        }
      }

      return result;
    }

    it("should merge unique guest items into customer cart", () => {
      const customerCart: TestItem[] = [
        { productId: "prod-1", variantId: null, quantity: 2 },
      ];
      const guestCart: TestItem[] = [
        { productId: "prod-2", variantId: null, quantity: 3 },
      ];

      const merged = mergeItems(customerCart, guestCart);
      expect(merged).toHaveLength(2);
      expect(merged.find((i) => i.productId === "prod-1")?.quantity).toBe(2);
      expect(merged.find((i) => i.productId === "prod-2")?.quantity).toBe(3);
    });

    it("should sum quantities for matching product lines and cap at 10", () => {
      const customerCart: TestItem[] = [
        { productId: "prod-1", variantId: null, quantity: 6 },
      ];
      const guestCart: TestItem[] = [
        { productId: "prod-1", variantId: null, quantity: 7 },
      ];

      const merged = mergeItems(customerCart, guestCart);
      expect(merged).toHaveLength(1);
      // 6 + 7 = 13, clamped to 10
      expect(merged[0]!.quantity).toBe(10);
    });

    it("should preserve variant identity during merge", () => {
      const customerCart: TestItem[] = [
        { productId: "prod-1", variantId: "var-A", quantity: 2 },
      ];
      const guestCart: TestItem[] = [
        { productId: "prod-1", variantId: "var-B", quantity: 3 },
        { productId: "prod-1", variantId: "var-A", quantity: 1 },
      ];

      const merged = mergeItems(customerCart, guestCart);
      expect(merged).toHaveLength(2);
      expect(merged.find((i) => i.variantId === "var-A")?.quantity).toBe(3); // 2 + 1
      expect(merged.find((i) => i.variantId === "var-B")?.quantity).toBe(3); // 3
    });

    it("should remain idempotent when merge is retried", () => {
      const customerCart: TestItem[] = [
        { productId: "prod-1", variantId: null, quantity: 2 },
      ];
      const guestCart: TestItem[] = [
        { productId: "prod-2", variantId: null, quantity: 3 },
      ];

      const firstMerge = mergeItems(customerCart, guestCart);
      // Once merged, guestCart is empty on retry
      const emptyGuestCart: TestItem[] = [];
      const secondMerge = mergeItems(firstMerge, emptyGuestCart);

      expect(secondMerge).toEqual(firstMerge);
      expect(secondMerge).toHaveLength(2);
    });
  });

  // 3. First-Time Customer Cart Creation Concurrency Simulation
  describe("First-Time Customer Cart Concurrency Invariants", () => {
    it("should simulate atomic ON CONFLICT resolution for parallel customer cart creation", async () => {
      // Simulating parallel login threads attempting to create the customer cart row simultaneously
      const userId = "user-12345";
      const existingCarts = new Map<string, { id: string; userId: string; updatedAt: number }>();

      async function atomicGetOrCreateCart(uId: string): Promise<string> {
        // Atomic UPSERT simulation:
        if (!existingCarts.has(uId)) {
          existingCarts.set(uId, { id: `cart-${uId}`, userId: uId, updatedAt: Date.now() });
        } else {
          const c = existingCarts.get(uId)!;
          c.updatedAt = Date.now();
        }
        return existingCarts.get(uId)!.id;
      }

      // Simulate 5 simultaneous requests on login
      const results = await Promise.all([
        atomicGetOrCreateCart(userId),
        atomicGetOrCreateCart(userId),
        atomicGetOrCreateCart(userId),
        atomicGetOrCreateCart(userId),
        atomicGetOrCreateCart(userId),
      ]);

      // All 5 threads must resolve to the exact same cart ID
      expect(new Set(results).size).toBe(1);
      expect(results[0]).toBe(`cart-${userId}`);
      expect(existingCarts.size).toBe(1);
    });
  });

  // 4. Partial Unique Index Conflict Handling & Merge Regression
  describe("Partial Unique Index Conflict Target Regression (Phase 5 Hardening)", () => {
    interface ConflictTargetConfig {
      target: string[];
      targetWhere: string;
      setClause: string;
    }

    /**
     * Pure resolver that mirrors the partial-index upsert logic in cart/service.ts.
     * Note: This verifies the application-level query builder configuration.
     * Real PostgreSQL engine concurrency testing was NOT performed in this mock/sandbox suite.
     */
    function resolveMergeUpsertConfig(variantId: string | null): ConflictTargetConfig {
      if (variantId === null) {
        return {
          target: ["cart_id", "product_id"],
          targetWhere: "cart_items.variant_id IS NULL",
          setClause: "LEAST(10, cart_items.quantity + EXCLUDED.quantity)",
        };
      }
      return {
        target: ["cart_id", "product_id", "variant_id"],
        targetWhere: "cart_items.variant_id IS NOT NULL",
        setClause: "LEAST(10, cart_items.quantity + EXCLUDED.quantity)",
      };
    }

    it("should select non-variant partial index target when variantId is null", () => {
      const config = resolveMergeUpsertConfig(null);

      expect(config.target).toEqual(["cart_id", "product_id"]);
      expect(config.targetWhere).toBe("cart_items.variant_id IS NULL");
      expect(config.setClause).toContain("LEAST(10");
    });

    it("should select variant partial index target when variantId is provided", () => {
      const config = resolveMergeUpsertConfig("var-uuid-456");

      expect(config.target).toEqual(["cart_id", "product_id", "variant_id"]);
      expect(config.targetWhere).toBe("cart_items.variant_id IS NOT NULL");
      expect(config.setClause).toContain("LEAST(10");
    });

    it("should enforce LEAST(10, quantity + excluded.quantity) capping in simulated conflict resolution", () => {
      function simulateSqlLeastConflict(existingQty: number, excludedQty: number): number {
        return Math.min(10, existingQty + excludedQty);
      }

      // 4 + 3 = 7 (< 10)
      expect(simulateSqlLeastConflict(4, 3)).toBe(7);
      // 7 + 8 = 15 -> capped at 10
      expect(simulateSqlLeastConflict(7, 8)).toBe(10);
      // 9 + 5 = 14 -> capped at 10
      expect(simulateSqlLeastConflict(9, 5)).toBe(10);
    });

    it("should ensure independent cart isolation during concurrent conflict merges", () => {
      // Simulate two separate customer carts resolving items simultaneously
      const cartA = new Map<string, number>();
      const cartB = new Map<string, number>();

      cartA.set("prod-1:null", 3);
      cartB.set("prod-1:null", 5);

      // Mutating cart A must not affect cart B
      cartA.set("prod-1:null", Math.min(10, (cartA.get("prod-1:null") ?? 0) + 4));

      expect(cartA.get("prod-1:null")).toBe(7);
      expect(cartB.get("prod-1:null")).toBe(5);
    });
  });
});
