import "server-only";
import { eq, and, desc, sql, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  orders,
  orderItems,
  orderStatusHistory,
  stockReservations,
  carts,
  cartItems,
  products,
  productVariants,
  inventory,
} from "@/lib/db/schema";
import { checkSharedRateLimit } from "@/lib/auth/rate-limit";
import { generateSecureToken } from "@/lib/security";
import { releaseExpiredReservations } from "./reservations";
import {
  verifyQuoteToken,
  decodeAndVerifyQuoteTokenSignature,
  computeLogicalRequestFingerprint,
  type QuoteTokenItemSnapshot,
} from "@/features/checkout/quote-tokens";
import { validateCheckoutAddressServiceability } from "@/features/checkout/service";
import type {
  CreateOrderInput,
  OrderDetailDTO,
  OrderSummaryDTO,
  PaginatedOrdersDTO,
  AddressSnapshotDTO,
} from "./schemas";
import { createOrderInputSchema } from "./schemas";

export { releaseExpiredReservations };

function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

/**
 * Generates an unpredictable, human-readable public order reference.
 * Format: HS-YYYY-XXXXXXXX (e.g. HS-2026-F9A2C3E1)
 */
export function generatePublicOrderReference(): string {
  const year = new Date().getFullYear();
  const randomSuffix = generateSecureToken(4).toUpperCase();
  return `HS-${year}-${randomSuffix}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatOrderDetailDTO(orderRecord: any): OrderDetailDTO {
  const address = orderRecord.shippingAddressSnapshot as AddressSnapshotDTO;

  return {
    id: orderRecord.id,
    orderNumber: orderRecord.orderNumber,
    userId: orderRecord.userId,
    placedAt: orderRecord.placedAt instanceof Date ? orderRecord.placedAt.toISOString() : new Date(orderRecord.placedAt).toISOString(),
    updatedAt: orderRecord.updatedAt instanceof Date ? orderRecord.updatedAt.toISOString() : new Date(orderRecord.updatedAt).toISOString(),
    paymentStatus: orderRecord.paymentStatus,
    fulfillmentStatus: orderRecord.fulfillmentStatus,
    subtotalMinor: orderRecord.subtotalMinor,
    shippingMinor: orderRecord.shippingMinor,
    taxMinor: orderRecord.taxMinor,
    discountMinor: orderRecord.discountMinor,
    totalMinor: orderRecord.totalMinor,
    currency: "INR",
    shippingAddress: address,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: (orderRecord.items || []).map((i: any) => ({
      id: i.id,
      productId: i.productId,
      variantId: i.variantId ?? null,
      productName: i.productNameSnapshot || i.productName || "",
      sku: i.skuSnapshot || i.sku || "",
      variantSku: i.variantSkuSnapshot ?? i.variantSku ?? null,
      unitPriceMinor: i.unitPriceMinor,
      quantity: i.quantity,
      lineTotalMinor: i.lineTotalMinor,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    statusHistory: (orderRecord.statusHistory || []).map((h: any) => ({
      status: h.newStatus,
      note: h.note,
      timestamp: h.createdAt instanceof Date ? h.createdAt.toISOString() : new Date(h.createdAt).toISOString(),
    })),
    tracking: {
      hasLiveTracking: false,
      carrier: null,
      trackingNumber: null,
      message:
        "Order created. Shipment carrier dispatch and live waybill tracking integration will be active upon fulfilment partner dispatch in Phase 7.",
    },
  };
}

export interface ExistingOrderSnapshot {
  id: string;
  idempotencyFingerprint: string | null;
  detail: OrderDetailDTO;
}

export interface ConflictingOrderSnapshot {
  id: string;
  idempotencyFingerprint: string | null;
}

export interface CartItemWithProduct {
  cartItemId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  productName: string;
  productSku: string;
  productStatus: string;
  productPriceMinor: number;
  variantSku: string | null;
  variantPriceOverrideMinor: number | null;
  variantStatus: string | null;
}

export interface CartWithItemsSnapshot {
  cartId: string;
  items: CartItemWithProduct[];
}

export interface OrderStorageAdapter {
  isConfigured(): boolean;
  findExistingOrder(customerId: string, idempotencyKey: string): Promise<ExistingOrderSnapshot | null>;
  findConflictingOrder(customerId: string, idempotencyKey: string): Promise<ConflictingOrderSnapshot | null>;
  checkRateLimit(customerId: string): Promise<{ success: boolean; isServiceUnavailable?: boolean; resetInSeconds?: number }>;
  validateAddress(customerId: string, addressId: string): Promise<{
    address: AddressSnapshotDTO;
    serviceability: { isConfigured: boolean; isServiceable: boolean; shippingFeeMinor: number; message?: string };
  }>;
  getOrderById(customerId: string, orderId: string): Promise<OrderDetailDTO>;
  runInTransaction<T>(callback: (tx: OrderTransactionAdapter) => Promise<T>): Promise<T>;
}

export interface OrderTransactionAdapter {
  releaseExpiredReservations(): Promise<{ releasedCount: number }>;
  getCartWithItems(customerId: string): Promise<CartWithItemsSnapshot | null>;
  findExistingOrder(customerId: string, idempotencyKey: string): Promise<{ id: string; idempotencyFingerprint: string | null } | null>;
  reserveInventory(lines: Array<{ productId: string; variantId: string | null; quantity: number; productNameSnapshot: string }>): Promise<void>;
  createOrder(orderData: {
    orderNumber: string;
    userId: string;
    idempotencyKey: string;
    idempotencyFingerprint: string;
    currency: string;
    subtotalMinor: number;
    discountMinor: number;
    shippingMinor: number;
    taxMinor: number;
    totalMinor: number;
    paymentStatus: string;
    fulfillmentStatus: string;
    shippingAddressSnapshot: AddressSnapshotDTO;
    billingAddressSnapshot: AddressSnapshotDTO;
  }): Promise<{ id: string }>;
  insertOrderItems(items: Array<{
    orderId: string;
    productId: string;
    variantId: string | null;
    skuSnapshot: string;
    variantSkuSnapshot: string | null;
    productNameSnapshot: string;
    unitPriceMinor: number;
    quantity: number;
    discountMinor: number;
    taxMinor: number;
    lineTotalMinor: number;
  }>): Promise<void>;
  insertStockReservations(reservations: Array<{
    orderId: string;
    productId: string;
    variantId: string | null;
    quantity: number;
  }>): Promise<void>;
  insertOrderStatusHistory(history: {
    orderId: string;
    oldStatus: string;
    newStatus: string;
    actorUserId: string;
    note: string;
  }): Promise<void>;
  clearCartItems(cartId: string): Promise<void>;
}

export const defaultDrizzleOrderStore: OrderStorageAdapter = {
  isConfigured(): boolean {
    return isDatabaseConfigured() && Boolean(getDb());
  },

  async findExistingOrder(customerId: string, idempotencyKey: string): Promise<ExistingOrderSnapshot | null> {
    const db = getDb();
    if (!db) {
      throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
    }
    const existingOrder = await db.query.orders.findFirst({
      where: and(eq(orders.userId, customerId), eq(orders.idempotencyKey, idempotencyKey)),
      with: {
        items: true,
        statusHistory: {
          orderBy: desc(orderStatusHistory.createdAt),
        },
      },
    });

    if (!existingOrder) {
      return null;
    }

    return {
      id: existingOrder.id,
      idempotencyFingerprint: existingOrder.idempotencyFingerprint,
      detail: formatOrderDetailDTO(existingOrder),
    };
  },

  async findConflictingOrder(customerId: string, idempotencyKey: string): Promise<ConflictingOrderSnapshot | null> {
    const db = getDb();
    if (!db) {
      throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
    }
    const conflictingOrder = await db.query.orders.findFirst({
      where: and(eq(orders.userId, customerId), eq(orders.idempotencyKey, idempotencyKey)),
    });

    if (!conflictingOrder) {
      return null;
    }

    return {
      id: conflictingOrder.id,
      idempotencyFingerprint: conflictingOrder.idempotencyFingerprint,
    };
  },

  async checkRateLimit(customerId: string) {
    const db = getDb();
    if (!db) {
      throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
    }
    const rateLimitKey = `order:${customerId}`;
    return checkSharedRateLimit(db, rateLimitKey, {
      maxAttempts: 5,
      windowSeconds: 600,
    });
  },

  async validateAddress(customerId: string, addressId: string) {
    const db = getDb();
    if (!db) {
      throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
    }
    const { address: deliveryAddress, serviceability } =
      await validateCheckoutAddressServiceability(db, customerId, addressId);

    const addressSnapshot: AddressSnapshotDTO = {
      recipient: deliveryAddress.recipient,
      phone: deliveryAddress.phone,
      addressLine1: deliveryAddress.addressLine1,
      addressLine2: deliveryAddress.addressLine2,
      city: deliveryAddress.city,
      stateRegion: deliveryAddress.stateRegion,
      postalCode: deliveryAddress.postalCode,
      countryCode: deliveryAddress.countryCode,
    };

    return {
      address: addressSnapshot,
      serviceability,
    };
  },

  async getOrderById(customerId: string, orderId: string): Promise<OrderDetailDTO> {
    return getOrderById(customerId, orderId);
  },

  async runInTransaction<T>(callback: (tx: OrderTransactionAdapter) => Promise<T>): Promise<T> {
    const db = getDb();
    if (!db) {
      throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
    }

    return db.transaction(async (tx) => {
      const txAdapter: OrderTransactionAdapter = {
        async releaseExpiredReservations() {
          return releaseExpiredReservations(tx);
        },

        async getCartWithItems(customerId: string) {
          const customerCart = await tx.query.carts.findFirst({
            where: eq(carts.userId, customerId),
          });

          if (!customerCart) {
            return null;
          }

          const rawCartItems = await tx
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
            })
            .from(cartItems)
            .innerJoin(products, eq(cartItems.productId, products.id))
            .leftJoin(productVariants, eq(cartItems.variantId, productVariants.id))
            .where(eq(cartItems.cartId, customerCart.id));

          return {
            cartId: customerCart.id,
            items: rawCartItems,
          };
        },

        async findExistingOrder(customerId: string, idempotencyKey: string) {
          const txExistingOrder = await tx.query.orders.findFirst({
            where: and(eq(orders.userId, customerId), eq(orders.idempotencyKey, idempotencyKey)),
          });

          if (!txExistingOrder) {
            return null;
          }

          return {
            id: txExistingOrder.id,
            idempotencyFingerprint: txExistingOrder.idempotencyFingerprint,
          };
        },

        async reserveInventory(lines) {
          for (const line of lines) {
            const inventoryCondition = line.variantId
              ? and(
                  eq(inventory.productId, line.productId),
                  eq(inventory.variantId, line.variantId),
                  sql`(${inventory.quantityOnHand} - ${inventory.quantityReserved}) >= ${line.quantity}`
                )
              : and(
                  eq(inventory.productId, line.productId),
                  isNull(inventory.variantId),
                  sql`(${inventory.quantityOnHand} - ${inventory.quantityReserved}) >= ${line.quantity}`
                );

            const updatedInventory = await tx
              .update(inventory)
              .set({
                quantityReserved: sql`${inventory.quantityReserved} + ${line.quantity}`,
                updatedAt: sql`NOW()`,
              })
              .where(inventoryCondition)
              .returning({ id: inventory.id });

            if (!updatedInventory || updatedInventory.length === 0) {
              throw new Error(
                `INSUFFICIENT_STOCK: Item "${line.productNameSnapshot}" does not have sufficient available stock to complete this order.`
              );
            }
          }
        },

        async createOrder(orderData) {
          const [newOrder] = await tx
            .insert(orders)
            .values({
              orderNumber: orderData.orderNumber,
              userId: orderData.userId,
              idempotencyKey: orderData.idempotencyKey,
              idempotencyFingerprint: orderData.idempotencyFingerprint,
              currency: orderData.currency,
              subtotalMinor: orderData.subtotalMinor,
              discountMinor: orderData.discountMinor,
              shippingMinor: orderData.shippingMinor,
              taxMinor: orderData.taxMinor,
              totalMinor: orderData.totalMinor,
              paymentStatus: orderData.paymentStatus,
              fulfillmentStatus: orderData.fulfillmentStatus,
              shippingAddressSnapshot: orderData.shippingAddressSnapshot,
              billingAddressSnapshot: orderData.billingAddressSnapshot,
            })
            .returning({ id: orders.id });

          if (!newOrder) {
            throw new Error("ORDER_CREATION_FAILED: Failed to record order.");
          }

          return { id: newOrder.id };
        },

        async insertOrderItems(items) {
          for (const item of items) {
            await tx.insert(orderItems).values(item);
          }
        },

        async insertStockReservations(reservations) {
          for (const res of reservations) {
            await tx.insert(stockReservations).values({
              orderId: res.orderId,
              productId: res.productId,
              variantId: res.variantId,
              quantity: res.quantity,
              expiresAt: sql`NOW() + INTERVAL '30 minutes'`,
              status: "active",
            });
          }
        },

        async insertOrderStatusHistory(history) {
          await tx.insert(orderStatusHistory).values({
            orderId: history.orderId,
            oldStatus: history.oldStatus,
            newStatus: history.newStatus,
            actorUserId: history.actorUserId,
            note: history.note,
          });
        },

        async clearCartItems(cartId: string) {
          await tx.delete(cartItems).where(eq(cartItems.cartId, cartId));
        },
      };

      return callback(txAdapter);
    });
  },
};

/**
 * Creates an order atomically inside a PostgreSQL transaction.
 * Revalidates prices, products, variants, and atomically reserves inventory.
 * Clears the customer's cart only after successful order creation.
 */
export async function createOrder(
  customerId: string,
  rawInput: CreateOrderInput,
  store: OrderStorageAdapter = defaultDrizzleOrderStore
): Promise<OrderDetailDTO> {
  if (!customerId) {
    throw new Error("UNAUTHENTICATED: You must be signed in to place an order.");
  }

  const input = createOrderInputSchema.parse(rawInput);

  if (!store.isConfigured()) {
    throw new Error("DATABASE_UNAVAILABLE: Order placement requires an active database connection.");
  }

  // 1. Verify quote token's cryptographic signature and structure
  // Note: Does not check expiration yet, allowing legitimate network replays of already-committed orders
  const quotePayload = decodeAndVerifyQuoteTokenSignature(input.quoteToken);

  if (quotePayload.customerId !== customerId) {
    throw new Error(
      "QUOTE_MISMATCH: Checkout quote token does not match the authenticated customer account."
    );
  }

  if (quotePayload.addressId !== input.addressId) {
    throw new Error(
      "QUOTE_MISMATCH: Checkout quote token was generated for a different delivery address."
    );
  }

  // 2. Derive canonical logical request fingerprint from immutable business data
  const logicalRequestFingerprint = computeLogicalRequestFingerprint({
    customerId,
    addressId: input.addressId,
    currency: quotePayload.currency,
    items: quotePayload.items,
    subtotalMinor: quotePayload.subtotalMinor,
    shippingMinor: quotePayload.shippingMinor,
    taxMinor: quotePayload.taxMinor,
    discountMinor: quotePayload.discountMinor,
    totalMinor: quotePayload.totalMinor,
  });

  // 3. Existing order lookup by (customerId, idempotencyKey) BEFORE cart checks or rate limits
  const existingOrder = await store.findExistingOrder(customerId, input.idempotencyKey);

  if (existingOrder) {
    if (
      existingOrder.idempotencyFingerprint &&
      existingOrder.idempotencyFingerprint !== logicalRequestFingerprint
    ) {
      throw new Error(
        "IDEMPOTENCY_CONFLICT: Idempotency key cannot be reused with different order parameters or cart items."
      );
    }
    return existingOrder.detail;
  }

  // 4. Rate limiting for new order creations: 5 attempts per 10 minutes per customer
  const rateLimitResult = await store.checkRateLimit(customerId);

  if (!rateLimitResult.success) {
    if (rateLimitResult.isServiceUnavailable) {
      throw new Error("SERVICE_UNAVAILABLE: Order service is temporarily unavailable. Please try again shortly.");
    }
    throw new Error(
      `RATE_LIMITED: You have attempted to place too many orders. Please wait ${rateLimitResult.resetInSeconds} seconds before trying again.`
    );
  }

  // 5. Validate delivery address ownership and serviceability (Fix D)
  const { address: addressSnapshot, serviceability } =
    await store.validateAddress(customerId, input.addressId);

  if (!serviceability.isConfigured || !serviceability.isServiceable) {
    throw new Error(
      `SHIPPING_UNAVAILABLE: ${serviceability.message || "Shipping is unconfigured or unavailable for this address."}`
    );
  }

  const publicOrderNumber = generatePublicOrderReference();
  let createdOrderId: string;

  try {
    // Execute full order creation atomically
    createdOrderId = await store.runInTransaction(async (tx) => {
      // Lazy stock reservation cleanup (Fix A)
      await tx.releaseExpiredReservations();

      // 6. Resolve customer cart
      const customerCart = await tx.getCartWithItems(customerId);

      if (!customerCart || customerCart.items.length === 0) {
        throw new Error("EMPTY_CART: Your cart is empty. Please add items before placing an order.");
      }

      // 8. Revalidate products, variants, and calculate authoritative current prices
      const orderLines: {
        productId: string;
        variantId: string | null;
        productNameSnapshot: string;
        skuSnapshot: string;
        variantSkuSnapshot: string | null;
        unitPriceMinor: number;
        quantity: number;
        lineTotalMinor: number;
      }[] = [];

      let calculatedSubtotalMinor = 0;

      for (const item of customerCart.items) {
        const isVariant = Boolean(item.variantId && item.variantSku);
        const name = isVariant ? `${item.productName} (${item.variantSku})` : item.productName;
        const sku = isVariant && item.variantSku ? item.variantSku : item.productSku;
        const status = isVariant && item.variantStatus ? item.variantStatus : item.productStatus;

        if (status !== "active") {
          throw new Error(`PRODUCT_INACTIVE: "${name}" is no longer active in our catalogue and cannot be ordered.`);
        }

        // Server-authoritative unit price in minor paise (variant override takes precedence if present)
        const unitPriceMinor =
          isVariant && item.variantPriceOverrideMinor != null ? item.variantPriceOverrideMinor : item.productPriceMinor;
        const quantity = Math.min(10, Math.max(1, item.quantity));
        const lineTotalMinor = unitPriceMinor * quantity;
        calculatedSubtotalMinor += lineTotalMinor;

        orderLines.push({
          productId: item.productId,
          variantId: item.variantId,
          productNameSnapshot: name,
          skuSnapshot: sku,
          variantSkuSnapshot: item.variantSku ?? null,
          unitPriceMinor,
          quantity,
          lineTotalMinor,
        });
      }

      const calculatedShippingMinor = serviceability.shippingFeeMinor;
      const calculatedTaxMinor = 0;
      const calculatedDiscountMinor = 0;
      const calculatedTotalMinor = calculatedSubtotalMinor + calculatedShippingMinor + calculatedTaxMinor - calculatedDiscountMinor;

      // 9. Strict verification of signed quote token (enforces expiry and exact price matching for first-time orders)
      const authoritativeItems: QuoteTokenItemSnapshot[] = orderLines.map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        quantity: l.quantity,
        unitPriceMinor: l.unitPriceMinor,
        lineTotalMinor: l.lineTotalMinor,
      }));

      verifyQuoteToken(input.quoteToken, {
        customerId,
        addressId: input.addressId,
        items: authoritativeItems,
        subtotalMinor: calculatedSubtotalMinor,
        shippingMinor: calculatedShippingMinor,
        taxMinor: calculatedTaxMinor,
        discountMinor: calculatedDiscountMinor,
        totalMinor: calculatedTotalMinor,
        currency: "INR",
      });

      // 10. Concurrent race check within transaction
      const txExistingOrder = await tx.findExistingOrder(customerId, input.idempotencyKey);

      if (txExistingOrder) {
        if (
          txExistingOrder.idempotencyFingerprint &&
          txExistingOrder.idempotencyFingerprint !== logicalRequestFingerprint
        ) {
          throw new Error(
            "IDEMPOTENCY_CONFLICT: Idempotency key cannot be reused with different order parameters or cart items."
          );
        }
        return txExistingOrder.id;
      }

      // 11. Atomic conditional inventory reservation update
      // Prevents overselling and race conditions under concurrent checkouts
      await tx.reserveInventory(orderLines);

      // 12. Create Order record with logicalRequestFingerprint
      const newOrder = await tx.createOrder({
        orderNumber: publicOrderNumber,
        userId: customerId,
        idempotencyKey: input.idempotencyKey,
        idempotencyFingerprint: logicalRequestFingerprint,
        currency: "INR",
        subtotalMinor: calculatedSubtotalMinor,
        discountMinor: 0,
        shippingMinor: calculatedShippingMinor,
        taxMinor: 0,
        totalMinor: calculatedTotalMinor,
        paymentStatus: "pending", // Unpaid / awaiting payment initiation
        fulfillmentStatus: "pending",
        shippingAddressSnapshot: addressSnapshot,
        billingAddressSnapshot: addressSnapshot,
      });

      // 13. Insert Order Items snapshots
      await tx.insertOrderItems(
        orderLines.map((line) => ({
          orderId: newOrder.id,
          productId: line.productId,
          variantId: line.variantId,
          skuSnapshot: line.skuSnapshot,
          variantSkuSnapshot: line.variantSkuSnapshot,
          productNameSnapshot: line.productNameSnapshot,
          unitPriceMinor: line.unitPriceMinor,
          quantity: line.quantity,
          discountMinor: 0,
          taxMinor: 0,
          lineTotalMinor: line.lineTotalMinor,
        }))
      );

      // 14. Insert Stock Reservation records (30-minute expiry)
      await tx.insertStockReservations(
        orderLines.map((line) => ({
          orderId: newOrder.id,
          productId: line.productId,
          variantId: line.variantId,
          quantity: line.quantity,
        }))
      );

      // 15. Record audit status history
      await tx.insertOrderStatusHistory({
        orderId: newOrder.id,
        oldStatus: "none",
        newStatus: "pending",
        actorUserId: customerId,
        note: "Order created via online checkout. Awaiting payment authorization.",
      });

      // 16. Clear customer cart items (only after successful order creation in the same transaction)
      await tx.clearCartItems(customerCart.cartId);

      return newOrder.id;
    });
  } catch (error: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = error as any;
    const isUniqueViolation =
      err?.code === "23505" ||
      (typeof err?.message === "string" && err.message.includes("order_user_idempotency_idx"));

    if (isUniqueViolation) {
      // Concurrent transaction committed an order with this idempotency key
      const conflictingOrder = await store.findConflictingOrder(customerId, input.idempotencyKey);

      if (conflictingOrder) {
        if (
          conflictingOrder.idempotencyFingerprint &&
          conflictingOrder.idempotencyFingerprint !== logicalRequestFingerprint
        ) {
          throw new Error(
            "IDEMPOTENCY_CONFLICT: Idempotency key cannot be reused with different order parameters or cart items."
          );
        }
        return store.getOrderById(customerId, conflictingOrder.id);
      }
    }

    throw error;
  }

  return store.getOrderById(customerId, createdOrderId);
}

/**
 * Retrieves a customer-owned order by its internal ID with IDOR protection.
 */
export async function getOrderById(customerId: string, orderId: string): Promise<OrderDetailDTO> {
  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
  }

  const orderRecord = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.userId, customerId)),
    with: {
      items: true,
      statusHistory: {
        orderBy: desc(orderStatusHistory.createdAt),
      },
    },
  });

  if (!orderRecord) {
    throw new Error("ORDER_NOT_FOUND: Order not found or you do not have permission to view it.");
  }

  return formatOrderDetailDTO(orderRecord);
}

/**
 * Retrieves a customer-owned order by its public reference with IDOR protection.
 */
export async function getOrderByReference(customerId: string, orderReference: string): Promise<OrderDetailDTO> {
  if (!customerId) {
    throw new Error("UNAUTHENTICATED: Please sign in to view order details.");
  }

  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
  }

  const orderRecord = await db.query.orders.findFirst({
    where: and(eq(orders.orderNumber, orderReference), eq(orders.userId, customerId)),
    with: {
      items: true,
      statusHistory: {
        orderBy: desc(orderStatusHistory.createdAt),
      },
    },
  });

  if (!orderRecord) {
    throw new Error("ORDER_NOT_FOUND: Order not found or you do not have permission to view it.");
  }

  return formatOrderDetailDTO(orderRecord);
}

/**
 * Retrieves paginated orders for the authenticated customer with deterministic sorting.
 */
export async function getCustomerOrders(
  customerId: string,
  page = 1,
  limit = 10
): Promise<PaginatedOrdersDTO> {
  if (!customerId) {
    throw new Error("UNAUTHENTICATED: Please sign in to view your orders.");
  }

  if (!isDatabaseConfigured()) {
    return { orders: [], total: 0, page: 1, limit: 10, totalPages: 0 };
  }

  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
  }

  const safePage = Math.max(1, page);
  const safeLimit = Math.min(50, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(orders)
    .where(eq(orders.userId, customerId));

  const total = Number(countResult?.count ?? 0);
  const totalPages = Math.ceil(total / safeLimit);

  const orderRows = await db.query.orders.findMany({
    where: eq(orders.userId, customerId),
    orderBy: desc(orders.placedAt),
    limit: safeLimit,
    offset,
    with: {
      items: true,
    },
  });

  const orderSummaries: OrderSummaryDTO[] = orderRows.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    placedAt: o.placedAt.toISOString(),
    paymentStatus: o.paymentStatus,
    fulfillmentStatus: o.fulfillmentStatus,
    itemCount: o.items.length,
    totalMinor: o.totalMinor,
    currency: "INR",
  }));

  return {
    orders: orderSummaries,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages,
  };
}
