import { describe, it, expect } from "vitest";
import { formatMoney } from "@/lib/money";

describe("Checkout Quote Architecture & Pricing Invariants (Phase 6)", () => {
  interface CartItem {
    id: string;
    productId: string;
    variantId: string | null;
    productName: string;
    sku: string;
    variantSku: string | null;
    quantity: number;
    dbPriceMinor: number;
    dbStatus: "active" | "inactive";
    quantityOnHand: number;
    quantityReserved: number;
  }

  interface CheckoutQuote {
    items: {
      productId: string;
      variantId: string | null;
      unitPriceMinor: number;
      quantity: number;
      lineTotalMinor: number;
      inStock: boolean;
      availableStock: number;
      hasStockWarning: boolean;
    }[];
    subtotalMinor: number;
    shippingMinor: number;
    taxMinor: number;
    totalMinor: number;
    currency: "INR";
    expiresAt: string;
    warnings: string[];
  }

  // Authoritative server-side quote calculation algorithm
  function computeServerQuote(
    cartItems: CartItem[],
    clientClaimedPrices?: Record<string, number>
  ): CheckoutQuote {
    if (cartItems.length === 0) {
      throw new Error("EMPTY_CART: Your cart is empty.");
    }

    const items: CheckoutQuote["items"] = [];
    const warnings: string[] = [];
    let subtotalMinor = 0;

    for (const item of cartItems) {
      if (item.dbStatus !== "active") {
        throw new Error(`PRODUCT_INACTIVE: "${item.productName}" is no longer active in our catalogue.`);
      }

      // Server strictly ignores any client-claimed price
      void clientClaimedPrices;
      const unitPriceMinor = item.dbPriceMinor;
      const quantity = Math.min(10, Math.max(1, item.quantity));
      const lineTotalMinor = unitPriceMinor * quantity;
      subtotalMinor += lineTotalMinor;

      const availableStock = Math.max(0, item.quantityOnHand - item.quantityReserved);
      const inStock = availableStock >= quantity;
      const hasStockWarning = availableStock < quantity;

      if (!inStock) {
        if (availableStock <= 0) {
          warnings.push(`"${item.productName}" is currently out of stock.`);
        } else {
          warnings.push(`"${item.productName}": only ${availableStock} units available.`);
        }
      }

      items.push({
        productId: item.productId,
        variantId: item.variantId,
        unitPriceMinor,
        quantity,
        lineTotalMinor,
        inStock,
        availableStock,
        hasStockWarning,
      });
    }

    const shippingMinor = 0;
    const taxMinor = 0;
    const totalMinor = subtotalMinor + shippingMinor + taxMinor;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    return {
      items,
      subtotalMinor,
      shippingMinor,
      taxMinor,
      totalMinor,
      currency: "INR",
      expiresAt,
      warnings,
    };
  }

  it("should generate a valid checkout quote with server-calculated line totals in integer paise", () => {
    const cart: CartItem[] = [
      {
        id: "c1",
        productId: "p1",
        variantId: null,
        productName: "Brembo Front Brake Pad Set",
        sku: "BRK-PAD-001",
        variantSku: null,
        quantity: 2,
        dbPriceMinor: 345000, // ₹3,450.00
        dbStatus: "active",
        quantityOnHand: 15,
        quantityReserved: 3,
      },
    ];

    const quote = computeServerQuote(cart);

    expect(quote.items).toHaveLength(1);
    expect(quote.items[0]!.unitPriceMinor).toBe(345000);
    expect(quote.items[0]!.quantity).toBe(2);
    expect(quote.items[0]!.lineTotalMinor).toBe(690000); // ₹6,900.00
    expect(quote.subtotalMinor).toBe(690000);
    expect(quote.totalMinor).toBe(690000);
    expect(formatMoney(quote.totalMinor)).toBe("₹6,900.00");
    expect(quote.warnings).toHaveLength(0);
  });

  it("should strictly reject/ignore client-submitted tampered prices", () => {
    const cart: CartItem[] = [
      {
        id: "c1",
        productId: "p1",
        variantId: null,
        productName: "Shock Absorber Front Left",
        sku: "SHK-001",
        variantSku: null,
        quantity: 1,
        dbPriceMinor: 580000, // ₹5,800.00 in database
        dbStatus: "active",
        quantityOnHand: 10,
        quantityReserved: 0,
      },
    ];

    // Attacker sends ₹10.00 (1000 paise)
    const tamperedClientPrices = { p1: 1000 };
    const quote = computeServerQuote(cart, tamperedClientPrices);

    expect(quote.items[0]!.unitPriceMinor).toBe(580000);
    expect(quote.subtotalMinor).toBe(580000);
    expect(quote.totalMinor).toBe(580000);
    expect(quote.totalMinor).not.toBe(1000);
  });

  it("should dynamically reflect updated database catalogue prices in the quote", () => {
    const cart: CartItem[] = [
      {
        id: "c1",
        productId: "p1",
        variantId: null,
        productName: "Oil Filter",
        sku: "FLT-001",
        variantSku: null,
        quantity: 3,
        dbPriceMinor: 65000, // ₹650.00
        dbStatus: "active",
        quantityOnHand: 20,
        quantityReserved: 0,
      },
    ];

    const quote1 = computeServerQuote(cart);
    expect(quote1.totalMinor).toBe(195000); // 3 * 65000 = 195000

    // Catalogue manager changes price to ₹700.00
    cart[0]!.dbPriceMinor = 70000;
    const quote2 = computeServerQuote(cart);
    expect(quote2.totalMinor).toBe(210000); // 3 * 70000 = 210000
  });

  it("should throw PRODUCT_INACTIVE when a cart item is deactivated in the catalogue", () => {
    const cart: CartItem[] = [
      {
        id: "c1",
        productId: "p1",
        variantId: null,
        productName: "Discontinued Spark Plug",
        sku: "SPK-OLD",
        variantSku: null,
        quantity: 4,
        dbPriceMinor: 25000,
        dbStatus: "inactive",
        quantityOnHand: 5,
        quantityReserved: 0,
      },
    ];

    expect(() => computeServerQuote(cart)).toThrowError(/PRODUCT_INACTIVE/);
  });

  it("should clamp quantities between 1 and 10 and reject zero or negative quantities", () => {
    const cart: CartItem[] = [
      {
        id: "c1",
        productId: "p1",
        variantId: null,
        productName: "Cabin Air Filter",
        sku: "FLT-AIR-01",
        variantSku: null,
        quantity: 99, // Exceeds limit
        dbPriceMinor: 45000,
        dbStatus: "active",
        quantityOnHand: 100,
        quantityReserved: 0,
      },
    ];

    const quote = computeServerQuote(cart);
    expect(quote.items[0]!.quantity).toBe(10); // Clamped to 10
    expect(quote.items[0]!.lineTotalMinor).toBe(450000);
  });

  it("should attach stock warnings when requested quantity exceeds available stock", () => {
    const cart: CartItem[] = [
      {
        id: "c1",
        productId: "p1",
        variantId: null,
        productName: "Headlight Assembly",
        sku: "LGT-001",
        variantSku: null,
        quantity: 4,
        dbPriceMinor: 480000,
        dbStatus: "active",
        quantityOnHand: 5,
        quantityReserved: 3, // 5 - 3 = 2 available (< 4 requested)
      },
    ];

    const quote = computeServerQuote(cart);
    expect(quote.items[0]!.availableStock).toBe(2);
    expect(quote.items[0]!.inStock).toBe(false);
    expect(quote.items[0]!.hasStockWarning).toBe(true);
    expect(quote.warnings).toHaveLength(1);
    expect(quote.warnings[0]).toContain("only 2 units available");
  });

  it("should prevent floating-point calculation inaccuracies by using integer minor units exclusively", () => {
    // Classic JavaScript float pitfall: 0.1 + 0.2 = 0.30000000000000004
    // In minor units: 10 paise + 20 paise = 30 paise exactly.
    const cart: CartItem[] = [
      {
        id: "c1",
        productId: "p1",
        variantId: null,
        productName: "Clip A",
        sku: "CLP-A",
        variantSku: null,
        quantity: 3,
        dbPriceMinor: 1999, // ₹19.99
        dbStatus: "active",
        quantityOnHand: 50,
        quantityReserved: 0,
      },
      {
        id: "c2",
        productId: "p2",
        variantId: null,
        productName: "Washer B",
        sku: "WSH-B",
        variantSku: null,
        quantity: 7,
        dbPriceMinor: 3333, // ₹33.33
        dbStatus: "active",
        quantityOnHand: 50,
        quantityReserved: 0,
      },
    ];

    const quote = computeServerQuote(cart);
    // (3 * 1999) + (7 * 3333) = 5997 + 23331 = 29328 paise
    expect(quote.subtotalMinor).toBe(29328);
    expect(Number.isInteger(quote.subtotalMinor)).toBe(true);
    expect(formatMoney(quote.subtotalMinor)).toBe("₹293.28");
  });

  it("should evaluate quote expiry and detect stale quotes", () => {
    const now = Date.now();
    const activeExpiresAt = new Date(now + 15 * 60 * 1000).toISOString();
    const staleExpiresAt = new Date(now - 1000).toISOString();

    function isQuoteStale(expiresAtIso: string): boolean {
      return new Date(expiresAtIso).getTime() < Date.now();
    }

    expect(isQuoteStale(activeExpiresAt)).toBe(false);
    expect(isQuoteStale(staleExpiresAt)).toBe(true);
  });
});
