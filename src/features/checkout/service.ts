import "server-only";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { carts, cartItems, products, productVariants, inventory, addresses } from "@/lib/db/schema";
import { checkSharedRateLimit } from "@/lib/auth/rate-limit";
import { hashToken } from "@/lib/security";
import { releaseExpiredReservations } from "@/features/orders/reservations";
import {
  computeCartFingerprint,
  signQuoteToken,
  verifyQuoteToken,
  sortQuoteItems,
  decodeAndVerifyQuoteTokenSignature,
  computeLogicalRequestFingerprint,
  type CartItemFingerprintSource,
  type QuoteTokenPayload,
  type QuoteTokenItemSnapshot,
  type AuthoritativeQuoteComparison,
} from "./quote-tokens";
import type { CheckoutQuoteDTO, CheckoutQuoteItemDTO, DeliveryServiceabilityDTO } from "./schemas";

export {
  computeCartFingerprint,
  signQuoteToken,
  verifyQuoteToken,
  sortQuoteItems,
  decodeAndVerifyQuoteTokenSignature,
  computeLogicalRequestFingerprint,
};
export type { CartItemFingerprintSource, QuoteTokenPayload, QuoteTokenItemSnapshot, AuthoritativeQuoteComparison };

export const QUOTE_EXPIRY_MINUTES = 15;

function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

function calculateAvailableStock(quantityOnHand: number | null, quantityReserved: number | null): number {
  const onHand = quantityOnHand ?? 0;
  const reserved = quantityReserved ?? 0;
  return Math.max(0, onHand - reserved);
}

/**
 * Validates delivery serviceability for a customer-owned address.
 * Phase 6 invariant: If no shipping partner integration exists, returns an honest unconfigured state.
 */
export async function validateCheckoutAddressServiceability(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  txOrDb: any,
  customerId: string,
  addressId: string
): Promise<{ address: typeof addresses.$inferSelect; serviceability: DeliveryServiceabilityDTO }> {
  const address = await txOrDb.query.addresses.findFirst({
    where: and(eq(addresses.id, addressId), eq(addresses.userId, customerId)),
  });

  if (!address) {
    throw new Error("ADDRESS_NOT_FOUND: Selected address does not exist or does not belong to your account.");
  }

  // Validate Indian PIN code format: 6 digits, first digit 1-9
  const pinCodeRegex = /^[1-9][0-9]{5}$/;
  if (!pinCodeRegex.test(address.postalCode)) {
    throw new Error("INVALID_POSTAL_CODE: Address has an invalid 6-digit Indian PIN code.");
  }

  // In production, online ordering and courier dispatch remain paused until live integrations are enabled.
  const isDevOrTest = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  const isPromoEnabled = isDevOrTest && process.env.ALLOW_FREE_SHIPPING_PROMO === "true";
  const serviceability: DeliveryServiceabilityDTO = isPromoEnabled
    ? {
        isConfigured: true,
        isServiceable: true,
        carrier: "Standard Surface Delivery (Complimentary)",
        estimatedDays: 4,
        shippingFeeMinor: 0,
        message: "Standard surface road delivery across India.",
      }
    : {
        isConfigured: false,
        isServiceable: false,
        carrier: null,
        estimatedDays: null,
        shippingFeeMinor: 0,
        message:
          "Online ordering is currently being prepared. You can continue browsing products and adding items to your cart.",
      };

  return { address, serviceability };
}

/**
 * Generates an authoritative server-side checkout quote for the customer's persisted cart.
 */
export async function generateCheckoutQuote(customerId: string, addressId?: string): Promise<CheckoutQuoteDTO> {
  if (!customerId) {
    throw new Error("UNAUTHENTICATED: Please sign in to proceed to checkout.");
  }

  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_UNAVAILABLE: Checkout requires an active database connection.");
  }

  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
  }

  // Rate limiting: 30 quotes per 10 minutes
  const rateLimitKey = `quote:${customerId}`;
  const rateLimitResult = await checkSharedRateLimit(db, rateLimitKey, {
    maxAttempts: 30,
    windowSeconds: 600,
  });

  if (!rateLimitResult.success) {
    if (rateLimitResult.isServiceUnavailable) {
      throw new Error("SERVICE_UNAVAILABLE: Checkout service is temporarily unavailable. Please try again shortly.");
    }
    throw new Error(
      `RATE_LIMITED: Too many quote requests. Please wait ${rateLimitResult.resetInSeconds} seconds before trying again.`
    );
  }

  // Lazily release any expired reservations before evaluating available stock
  await releaseExpiredReservations(db);

  // Fetch active customer cart
  const customerCart = await db.query.carts.findFirst({
    where: eq(carts.userId, customerId),
  });

  if (!customerCart) {
    throw new Error("EMPTY_CART: Your cart is empty. Add items before proceeding to checkout.");
  }

  // Query live cart items joined with live product and inventory records
  const rawItems = await db
    .select({
      cartItemId: cartItems.id,
      productId: cartItems.productId,
      variantId: cartItems.variantId,
      quantity: cartItems.quantity,
      productName: products.name,
      productSku: products.sku,
      productStatus: products.status,
      productPriceMinor: products.priceMinor,
      variantSku: productVariants.sku,
      variantPriceOverrideMinor: productVariants.priceOverrideMinor,
      variantStatus: productVariants.status,
      quantityOnHand: inventory.quantityOnHand,
      quantityReserved: inventory.quantityReserved,
    })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .leftJoin(productVariants, eq(cartItems.variantId, productVariants.id))
    .leftJoin(inventory, eq(products.id, inventory.productId))
    .where(eq(cartItems.cartId, customerCart.id));

  if (rawItems.length === 0) {
    throw new Error("EMPTY_CART: Your cart is empty. Add items before proceeding to checkout.");
  }

  const items: CheckoutQuoteItemDTO[] = [];
  const warnings: string[] = [];

  for (const row of rawItems) {
    const isVariant = Boolean(row.variantId && row.variantSku);
    const name = isVariant ? `${row.productName} (${row.variantSku})` : row.productName;
    const sku = isVariant && row.variantSku ? row.variantSku : row.productSku;
    const status = isVariant && row.variantStatus ? row.variantStatus : row.productStatus;

    if (status !== "active") {
      throw new Error(`PRODUCT_INACTIVE: "${name}" is no longer active in our catalogue and cannot be purchased.`);
    }

    // Authoritative unit price in minor paise (variant override takes precedence if present)
    const unitPriceMinor =
      isVariant && row.variantPriceOverrideMinor != null ? row.variantPriceOverrideMinor : row.productPriceMinor;
    const quantity = Math.min(10, Math.max(1, row.quantity));
    const lineTotalMinor = unitPriceMinor * quantity;

    // Available stock evaluation (quantityOnHand - quantityReserved)
    const availableStock = calculateAvailableStock(row.quantityOnHand, row.quantityReserved);
    const inStock = availableStock >= quantity;
    const hasStockWarning = availableStock < quantity;

    if (!inStock) {
      if (availableStock <= 0) {
        warnings.push(`"${name}" is currently out of stock.`);
      } else {
        warnings.push(`"${name}": only ${availableStock} units available (requested ${quantity}).`);
      }
    }

    items.push({
      cartItemId: row.cartItemId,
      productId: row.productId,
      variantId: row.variantId,
      productName: name,
      sku,
      variantSku: row.variantSku,
      unitPriceMinor,
      quantity,
      lineTotalMinor,
      availableStock,
      inStock,
      hasStockWarning,
    });
  }

  const subtotalMinor = items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  // Address and serviceability
  let serviceability: DeliveryServiceabilityDTO = {
    isConfigured: false,
    isServiceable: true,
    carrier: null,
    estimatedDays: null,
    shippingFeeMinor: 0,
    message: "Select a delivery address to verify serviceability.",
  };

  if (addressId) {
    const validated = await validateCheckoutAddressServiceability(db, customerId, addressId);
    serviceability = validated.serviceability;
  }

  const shippingMinor = serviceability.shippingFeeMinor;
  const taxMinor = 0; // Tax included in Indian OES retail price or calculated in Phase 7
  const discountMinor = 0;
  const totalMinor = subtotalMinor + shippingMinor + taxMinor - discountMinor;

  const expiresAt = new Date(Date.now() + QUOTE_EXPIRY_MINUTES * 60 * 1000).toISOString();

  const quoteItems: QuoteTokenItemSnapshot[] = items.map((i) => ({
    productId: i.productId,
    variantId: i.variantId ?? null,
    quantity: i.quantity,
    unitPriceMinor: i.unitPriceMinor,
    lineTotalMinor: i.lineTotalMinor,
  }));

  const quoteToken = signQuoteToken({
    customerId,
    addressId: addressId ?? null,
    expiresAt,
    items: quoteItems,
    subtotalMinor,
    shippingMinor,
    taxMinor,
    discountMinor,
    totalMinor,
    currency: "INR",
  });

  const quoteTokenSource = `${customerId}:${customerCart.id}:${subtotalMinor}:${expiresAt}`;
  const quoteId = `quote_${hashToken(quoteTokenSource).substring(0, 16)}`;

  return {
    quoteId,
    quoteToken,
    expiresAt,
    items,
    itemCount: items.length,
    totalQuantity,
    subtotalMinor,
    shippingMinor,
    taxMinor,
    discountMinor,
    totalMinor,
    currency: "INR",
    selectedAddressId: addressId ?? null,
    serviceability,
    warnings,
  };
}
