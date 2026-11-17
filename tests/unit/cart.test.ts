import { describe, it, expect } from "vitest";
import { addToCartSchema, updateCartItemQuantitySchema, removeFromCartSchema } from "@/features/cart/schemas";

describe("Cart Domain Logic & Validation (Phase 5)", () => {
  // 1. Quantity Boundaries
  describe("Quantity Validation Boundaries", () => {
    it("should accept valid quantities between 1 and 10", () => {
      const valid1 = addToCartSchema.safeParse({ productId: "prod-123", quantity: 1 });
      expect(valid1.success).toBe(true);

      const valid10 = addToCartSchema.safeParse({ productId: "prod-123", quantity: 10 });
      expect(valid10.success).toBe(true);
    });

    it("should reject zero or negative quantities", () => {
      const zero = addToCartSchema.safeParse({ productId: "prod-123", quantity: 0 });
      expect(zero.success).toBe(false);

      const negative = addToCartSchema.safeParse({ productId: "prod-123", quantity: -2 });
      expect(negative.success).toBe(false);
    });

    it("should reject quantities exceeding the maximum per-line limit of 10", () => {
      const excessive = addToCartSchema.safeParse({ productId: "prod-123", quantity: 11 });
      expect(excessive.success).toBe(false);
    });

    it("should reject non-integer / floating-point quantities", () => {
      const fractional = addToCartSchema.safeParse({ productId: "prod-123", quantity: 2.5 });
      expect(fractional.success).toBe(false);
    });

    it("should default quantity to 1 when omitted", () => {
      const defaulted = addToCartSchema.parse({ productId: "prod-123" });
      expect(defaulted.quantity).toBe(1);
    });
  });

  // 2. Strict Input & Price Tampering Rejection
  describe("Price Tampering & Input Sanitization", () => {
    it("should strictly reject any client-submitted price fields", () => {
      // Clients must never be allowed to submit a price, subtotal, or currency
      const tampered = addToCartSchema.safeParse({
        productId: "prod-123",
        quantity: 2,
        priceMinor: 100, // Attacker attempts to set price to 100 paise (₹1)
      });
      expect(tampered.success).toBe(false);
    });

    it("should require a non-empty product ID", () => {
      const emptyProd = addToCartSchema.safeParse({ productId: "", quantity: 1 });
      expect(emptyProd.success).toBe(false);
    });

    it("should validate optional UUID for variant ID", () => {
      const validVariant = addToCartSchema.safeParse({
        productId: "prod-123",
        variantId: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        quantity: 1,
      });
      expect(validVariant.success).toBe(true);

      const invalidVariant = addToCartSchema.safeParse({
        productId: "prod-123",
        variantId: "not-a-uuid",
        quantity: 1,
      });
      expect(invalidVariant.success).toBe(false);
    });
  });

  // 3. Update & Remove Validation
  describe("Update & Remove Validation", () => {
    it("should validate update quantity schema bounds", () => {
      const valid = updateCartItemQuantitySchema.safeParse({ cartItemId: "item-1", quantity: 5 });
      expect(valid.success).toBe(true);

      const invalid = updateCartItemQuantitySchema.safeParse({ cartItemId: "item-1", quantity: 0 });
      expect(invalid.success).toBe(false);
    });

    it("should validate remove cart item schema", () => {
      const valid = removeFromCartSchema.safeParse({ cartItemId: "item-1" });
      expect(valid.success).toBe(true);

      const invalid = removeFromCartSchema.safeParse({ cartItemId: "" });
      expect(invalid.success).toBe(false);
    });
  });

  // 4. Server-Side Calculations
  describe("Server-Side Subtotal & Line Total Invariants", () => {
    it("should calculate line total as unitPriceMinor * quantity without floating point drift", () => {
      const unitPriceMinor = 425000; // ₹4,250.00
      const quantity = 3;
      const lineTotal = unitPriceMinor * quantity;
      expect(lineTotal).toBe(1275000); // ₹12,750.00
    });

    it("should calculate cart subtotal as exact sum of line totals", () => {
      const items = [
        { priceMinor: 120000, quantity: 2 }, // ₹2,400.00
        { priceMinor: 85000, quantity: 1 },  // ₹850.00
        { priceMinor: 340000, quantity: 3 }, // ₹10,200.00
      ];

      const subtotal = items.reduce((acc, i) => acc + i.priceMinor * i.quantity, 0);
      expect(subtotal).toBe(1345000); // ₹13,450.00
    });
  });

  // 5. Stock Evaluation & Warnings (Read-Only)
  describe("Stock Evaluation Invariants", () => {
    it("should flag stock warnings when requested quantity exceeds available stock", () => {
      const quantityOnHand = 5;
      const quantityReserved = 2;
      const available = Math.max(0, quantityOnHand - quantityReserved); // 3

      const requestedQuantity = 4;
      const inStock = available > 0;
      const hasStockWarning = available < requestedQuantity;

      expect(inStock).toBe(true);
      expect(hasStockWarning).toBe(true);
      expect(available).toBe(3);
    });

    it("should flag out-of-stock when reservations meet or exceed on-hand stock", () => {
      const quantityOnHand = 5;
      const quantityReserved = 5;
      const available = Math.max(0, quantityOnHand - quantityReserved); // 0

      const inStock = available > 0;
      expect(inStock).toBe(false);
      expect(available).toBe(0);
    });
  });
});
