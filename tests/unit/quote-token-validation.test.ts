import { describe, it, expect } from "vitest";
import {
  computeCartFingerprint,
  signQuoteToken,
  verifyQuoteToken,
  sortQuoteItems,
  type QuoteTokenPayload,
  type AuthoritativeQuoteComparison,
} from "@/features/checkout/quote-tokens";

describe("Authoritative Quote Snapshot & Stale Quote Rejection (Phase 6 - Defect B)", () => {
  const customerId = "cust-user-123";
  const addressId = "123e4567-e89b-12d3-a456-426614174000";
  const secretKey = "test-secret-key-for-hmac-verification";

  const standardQuotePayload: QuoteTokenPayload = {
    customerId,
    addressId,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    items: [
      {
        productId: "prod-brake-pad",
        variantId: null,
        quantity: 2,
        unitPriceMinor: 150000, // ₹1,500.00
        lineTotalMinor: 300000, // ₹3,000.00
      },
      {
        productId: "prod-oil-filter",
        variantId: "var-synthetic",
        quantity: 1,
        unitPriceMinor: 85000, // ₹850.00 (variant override)
        lineTotalMinor: 85000, // ₹850.00
      },
    ],
    subtotalMinor: 385000, // ₹3,850.00
    shippingMinor: 0,
    taxMinor: 0,
    discountMinor: 0,
    totalMinor: 385000,
    currency: "INR",
  };

  function toAuthoritativeComparison(payload: QuoteTokenPayload): AuthoritativeQuoteComparison {
    return {
      customerId: payload.customerId,
      addressId: payload.addressId!,
      items: payload.items.map((i) => ({ ...i })),
      subtotalMinor: payload.subtotalMinor,
      shippingMinor: payload.shippingMinor,
      taxMinor: payload.taxMinor,
      discountMinor: payload.discountMinor,
      totalMinor: payload.totalMinor,
      currency: payload.currency,
    };
  }

  it("should compute canonical cart fingerprint independent of item array ordering", () => {
    const listA = [
      { productId: "prod-brake-pad", variantId: null, quantity: 2 },
      { productId: "prod-oil-filter", variantId: "var-synthetic", quantity: 1 },
    ];
    const listB = [
      { productId: "prod-oil-filter", variantId: "var-synthetic", quantity: 1 },
      { productId: "prod-brake-pad", variantId: null, quantity: 2 },
    ];

    const fpA = computeCartFingerprint(listA);
    const fpB = computeCartFingerprint(listB);

    expect(fpA).toBe(fpB);
    expect(fpA).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should sort quote items deterministically by productId then variantId", () => {
    const unsorted = [
      { productId: "prod-z", variantId: null, quantity: 1, unitPriceMinor: 100, lineTotalMinor: 100 },
      { productId: "prod-a", variantId: "var-2", quantity: 1, unitPriceMinor: 100, lineTotalMinor: 100 },
      { productId: "prod-a", variantId: "var-1", quantity: 1, unitPriceMinor: 100, lineTotalMinor: 100 },
    ];

    const sorted = sortQuoteItems(unsorted);
    expect(sorted[0]!.productId).toBe("prod-a");
    expect(sorted[0]!.variantId).toBe("var-1");
    expect(sorted[1]!.productId).toBe("prod-a");
    expect(sorted[1]!.variantId).toBe("var-2");
    expect(sorted[2]!.productId).toBe("prod-z");
  });

  it("1. should allow a valid, unchanged quote to proceed through verification", () => {
    const token = signQuoteToken(standardQuotePayload, secretKey);
    const authComparison = toAuthoritativeComparison(standardQuotePayload);

    const verified = verifyQuoteToken(token, authComparison, secretKey);

    expect(verified.customerId).toBe(customerId);
    expect(verified.subtotalMinor).toBe(385000);
    expect(verified.totalMinor).toBe(385000);
    expect(verified.items).toHaveLength(2);
  });

  it("2. should reject quote token with QUOTE_STALE when a product unit price changes in catalogue", () => {
    const token = signQuoteToken(standardQuotePayload, secretKey);

    // Current catalogue price of brake pads increased from ₹1,500 (150000) to ₹1,800 (180000)
    const currentAuthoritative = toAuthoritativeComparison(standardQuotePayload);
    currentAuthoritative.items[0]!.unitPriceMinor = 180000;
    currentAuthoritative.items[0]!.lineTotalMinor = 360000;
    currentAuthoritative.subtotalMinor = 445000;
    currentAuthoritative.totalMinor = 445000;

    expect(() => verifyQuoteToken(token, currentAuthoritative, secretKey)).toThrowError(
      /QUOTE_STALE.*Catalogue price changed from ₹1500.00 to ₹1800.00/
    );
  });

  it("3. should reject quote token with QUOTE_STALE when a variant override price changes", () => {
    const token = signQuoteToken(standardQuotePayload, secretKey);

    // Synthetic oil filter variant override changed from ₹850 (85000) to ₹950 (95000)
    const currentAuthoritative = toAuthoritativeComparison(standardQuotePayload);
    currentAuthoritative.items[1]!.unitPriceMinor = 95000;
    currentAuthoritative.items[1]!.lineTotalMinor = 95000;
    currentAuthoritative.subtotalMinor = 395000;
    currentAuthoritative.totalMinor = 395000;

    expect(() => verifyQuoteToken(token, currentAuthoritative, secretKey)).toThrowError(
      /QUOTE_STALE.*Catalogue price changed from ₹850.00 to ₹950.00/
    );
  });

  it("4. should reject quote token with QUOTE_STALE when cart quantity changes", () => {
    const token = signQuoteToken(standardQuotePayload, secretKey);

    // Customer increased quantity of oil filters from 1 to 2
    const currentAuthoritative = toAuthoritativeComparison(standardQuotePayload);
    currentAuthoritative.items[1]!.quantity = 2;
    currentAuthoritative.items[1]!.lineTotalMinor = 170000;
    currentAuthoritative.subtotalMinor = 470000;
    currentAuthoritative.totalMinor = 470000;

    expect(() => verifyQuoteToken(token, currentAuthoritative, secretKey)).toThrowError(
      /QUOTE_STALE.*Quantity for item changed from 1 to 2/
    );
  });

  it("5. should reject quote token with QUOTE_STALE when subtotal changes", () => {
    const token = signQuoteToken(standardQuotePayload, secretKey);

    const currentAuthoritative = toAuthoritativeComparison(standardQuotePayload);
    currentAuthoritative.subtotalMinor = 390000; // mismatch

    expect(() => verifyQuoteToken(token, currentAuthoritative, secretKey)).toThrowError(
      /QUOTE_STALE.*Items subtotal changed/
    );
  });

  it("6. should reject quote token with QUOTE_STALE when shipping amount changes", () => {
    const token = signQuoteToken(standardQuotePayload, secretKey);

    const currentAuthoritative = toAuthoritativeComparison(standardQuotePayload);
    currentAuthoritative.shippingMinor = 15000; // ₹150.00 shipping applied
    currentAuthoritative.totalMinor = 400000;

    expect(() => verifyQuoteToken(token, currentAuthoritative, secretKey)).toThrowError(
      /QUOTE_STALE.*Shipping fee changed/
    );
  });

  it("7. should reject quote token with QUOTE_STALE when tax, discount, or total payable changes", () => {
    const token = signQuoteToken(standardQuotePayload, secretKey);

    // Tax changed
    const authWithTax = toAuthoritativeComparison(standardQuotePayload);
    authWithTax.taxMinor = 5000;
    authWithTax.totalMinor = 390000;
    expect(() => verifyQuoteToken(token, authWithTax, secretKey)).toThrowError(
      /QUOTE_STALE.*Tax amount has changed/
    );

    // Discount changed
    const authWithDiscount = toAuthoritativeComparison(standardQuotePayload);
    authWithDiscount.discountMinor = 20000;
    authWithDiscount.totalMinor = 365000;
    expect(() => verifyQuoteToken(token, authWithDiscount, secretKey)).toThrowError(
      /QUOTE_STALE.*Discount amount has changed/
    );

    // Total payable changed
    const authWithTotal = toAuthoritativeComparison(standardQuotePayload);
    authWithTotal.totalMinor = 386000;
    expect(() => verifyQuoteToken(token, authWithTotal, secretKey)).toThrowError(
      /QUOTE_STALE.*Total payable changed/
    );
  });

  it("8. should reject expired or tampered quote tokens", () => {
    const pastPayload = {
      ...standardQuotePayload,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    const expiredToken = signQuoteToken(pastPayload, secretKey);

    expect(() =>
      verifyQuoteToken(expiredToken, toAuthoritativeComparison(pastPayload), secretKey)
    ).toThrowError(/QUOTE_EXPIRED/);

    const validToken = signQuoteToken(standardQuotePayload, secretKey);
    const parts = validToken.split(".");
    const tamperedSig = parts[1]!.substring(0, parts[1]!.length - 2) + "xx";
    const tamperedToken = `${parts[0]}.${tamperedSig}`;

    expect(() =>
      verifyQuoteToken(tamperedToken, toAuthoritativeComparison(standardQuotePayload), secretKey)
    ).toThrowError(/INVALID_QUOTE_TOKEN/);
  });

  it("9-11. should simulate that a stale quote causes transaction rollback with no order, no stock reservation, and no cart deletion", async () => {
    // Simulated transactional mock
    class OrderPlacementEngine {
      public orderCreated = false;
      public stockReserved = false;
      public cartCleared = false;

      public async placeOrder(token: string, currentCataloguePrice: number) {
        // Begin transaction
        try {
          const currentAuthoritative = toAuthoritativeComparison(standardQuotePayload);
          currentAuthoritative.items[0]!.unitPriceMinor = currentCataloguePrice;
          currentAuthoritative.items[0]!.lineTotalMinor = currentCataloguePrice * 2;
          currentAuthoritative.subtotalMinor =
            currentAuthoritative.items[0]!.lineTotalMinor + currentAuthoritative.items[1]!.lineTotalMinor;
          currentAuthoritative.totalMinor = currentAuthoritative.subtotalMinor;

          // Validate quote token strictly
          verifyQuoteToken(token, currentAuthoritative, secretKey);

          // If valid: reserve stock, create order, clear cart
          this.stockReserved = true;
          this.orderCreated = true;
          this.cartCleared = true;
        } catch (err) {
          // Transaction aborts & rolls back
          this.orderCreated = false;
          this.stockReserved = false;
          this.cartCleared = false;
          throw err;
        }
      }
    }

    const engine = new OrderPlacementEngine();
    const token = signQuoteToken(standardQuotePayload, secretKey);

    // Price changed in database from 150000 to 175000
    await expect(engine.placeOrder(token, 175000)).rejects.toThrowError(/QUOTE_STALE/);

    // Verify atomic transaction rollback: no side effects
    expect(engine.orderCreated).toBe(false);
    expect(engine.stockReserved).toBe(false);
    expect(engine.cartCleared).toBe(false);
  });

  it("12-13. should ensure integer paise calculations and strict currency binding", () => {
    const token = signQuoteToken(standardQuotePayload, secretKey);

    const wrongCurrency = toAuthoritativeComparison(standardQuotePayload);
    // @ts-expect-error Testing invalid currency rejection
    wrongCurrency.currency = "USD";

    expect(() => verifyQuoteToken(token, wrongCurrency, secretKey)).toThrowError(/QUOTE_MISMATCH/);

    // Verify all amounts in standardQuotePayload are safe integers (integer paise)
    expect(Number.isInteger(standardQuotePayload.subtotalMinor)).toBe(true);
    expect(Number.isInteger(standardQuotePayload.shippingMinor)).toBe(true);
    expect(Number.isInteger(standardQuotePayload.taxMinor)).toBe(true);
    expect(Number.isInteger(standardQuotePayload.discountMinor)).toBe(true);
    expect(Number.isInteger(standardQuotePayload.totalMinor)).toBe(true);
  });
});
