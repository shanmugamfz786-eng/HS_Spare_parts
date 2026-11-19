import "server-only";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  orders,
  orderItems,
  payments,
  paymentWebhookEvents,
  stockReservations,
  orderStatusHistory,
  inventory,
} from "@/lib/db/schema";
import { hashToken } from "@/lib/security";
import type {
  PaymentGatewayAdapter,
  PaymentIntentParams,
  PaymentIntentResult,
  PaymentStatus,
} from "./types";
import { isValidPaymentTransition } from "./types";

// ----------------------------------------------------------------------
// Custom Domain Errors
// ----------------------------------------------------------------------

export class PaymentError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "PaymentError";
  }
}

export class WebhookSignatureVerificationError extends PaymentError {
  constructor(message = "Invalid or unverified webhook signature.") {
    super(message, "INVALID_WEBHOOK_SIGNATURE");
    this.name = "WebhookSignatureVerificationError";
  }
}

export class OrderNotFoundError extends PaymentError {
  constructor(message = "Order could not be found.") {
    super(message, "ORDER_NOT_FOUND");
    this.name = "OrderNotFoundError";
  }
}

export class PaymentAmountMismatchError extends PaymentError {
  constructor(message = "Payment amount or currency does not match order total.") {
    super(message, "PAYMENT_AMOUNT_MISMATCH");
    this.name = "PaymentAmountMismatchError";
  }
}

export class InvalidStateTransitionError extends PaymentError {
  constructor(message = "Invalid payment state transition.") {
    super(message, "INVALID_STATE_TRANSITION");
    this.name = "InvalidStateTransitionError";
  }
}

// ----------------------------------------------------------------------
// Storage Record Interfaces
// ----------------------------------------------------------------------

export interface OrderPaymentRecord {
  id: string;
  orderNumber: string;
  userId: string | null;
  totalMinor: number;
  currency: string;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: string;
  guestEmail?: string | null;
  guestPhone?: string | null;
}

export interface OrderItemRecord {
  productId: string | null;
  variantId: string | null;
  quantity: number;
}

export interface PaymentRowRecord {
  id: string;
  orderId: string;
  provider: string;
  providerPaymentId: string | null;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  idempotencyKey: string;
  verifiedAt: Date | null;
  createdAt: Date;
}

export interface WebhookEventRecord {
  id: string;
  providerEventId: string;
  eventType: string;
  payloadDigest: string;
  processingStatus: string;
  processedAt: Date;
}

export interface StockReservationRecord {
  id: string;
  orderId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  status: "active" | "committed" | "released" | "expired";
  expiresAt: Date;
}

export interface PaymentCommitInput {
  orderId: string;
  provider: string;
  providerPaymentId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  verifiedAt: Date;
  stockAction: "commit" | "recommit" | "under_review";
  orderItems: OrderItemRecord[];
  webhookEvent: {
    providerEventId: string;
    eventType: string;
    payloadDigest: string;
  };
  note?: string;
}

export interface PaymentFailureInput {
  orderId: string;
  provider: string;
  providerPaymentId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  failureReason: string;
  webhookEvent: {
    providerEventId: string;
    eventType: string;
    payloadDigest: string;
  };
}

export interface PaymentStorageAdapter {
  isConfigured(): boolean;
  findOrderById(orderId: string): Promise<OrderPaymentRecord | null>;
  findOrderByNumber(orderNumber: string): Promise<OrderPaymentRecord | null>;
  getOrderItems(orderId: string): Promise<OrderItemRecord[]>;
  findPaymentByOrderId(orderId: string): Promise<PaymentRowRecord | null>;
  findPaymentByIdempotencyKey(key: string): Promise<PaymentRowRecord | null>;
  findWebhookEvent(providerEventId: string): Promise<WebhookEventRecord | null>;
  findWebhookEventByDigest(payloadDigest: string): Promise<WebhookEventRecord | null>;
  getActiveStockReservations(orderId: string): Promise<StockReservationRecord[]>;
  checkInventoryAvailability(
    items: OrderItemRecord[]
  ): Promise<{ available: boolean; unavailableProductId?: string }>;
  recordPaymentIntent(data: {
    orderId: string;
    provider: string;
    providerPaymentId?: string;
    amountMinor: number;
    currency: string;
    idempotencyKey: string;
    status: PaymentStatus;
  }): Promise<PaymentRowRecord>;
  commitPaymentSuccess(data: PaymentCommitInput): Promise<void>;
  recordPaymentFailure(data: PaymentFailureInput): Promise<void>;
}

// ----------------------------------------------------------------------
// Production Drizzle Storage Adapter
// ----------------------------------------------------------------------

function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

export const defaultDrizzlePaymentStore: PaymentStorageAdapter = {
  isConfigured(): boolean {
    return isDatabaseConfigured() && Boolean(getDb());
  },

  async findOrderById(orderId: string): Promise<OrderPaymentRecord | null> {
    const db = getDb();
    if (!db) throw new PaymentError("Database unavailable", "DATABASE_UNAVAILABLE");
    const row = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });
    if (!row) return null;
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      userId: row.userId,
      totalMinor: row.totalMinor,
      currency: row.currency,
      paymentStatus: row.paymentStatus as PaymentStatus,
      fulfillmentStatus: row.fulfillmentStatus,
      guestEmail: row.guestEmail,
      guestPhone: row.guestPhone,
    };
  },

  async findOrderByNumber(orderNumber: string): Promise<OrderPaymentRecord | null> {
    const db = getDb();
    if (!db) throw new PaymentError("Database unavailable", "DATABASE_UNAVAILABLE");
    const row = await db.query.orders.findFirst({
      where: eq(orders.orderNumber, orderNumber),
    });
    if (!row) return null;
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      userId: row.userId,
      totalMinor: row.totalMinor,
      currency: row.currency,
      paymentStatus: row.paymentStatus as PaymentStatus,
      fulfillmentStatus: row.fulfillmentStatus,
      guestEmail: row.guestEmail,
      guestPhone: row.guestPhone,
    };
  },

  async getOrderItems(orderId: string): Promise<OrderItemRecord[]> {
    const db = getDb();
    if (!db) throw new PaymentError("Database unavailable", "DATABASE_UNAVAILABLE");
    const items = await db.query.orderItems.findMany({
      where: eq(orderItems.orderId, orderId),
    });
    return items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      quantity: i.quantity,
    }));
  },

  async findPaymentByOrderId(orderId: string): Promise<PaymentRowRecord | null> {
    const db = getDb();
    if (!db) throw new PaymentError("Database unavailable", "DATABASE_UNAVAILABLE");
    const row = await db.query.payments.findFirst({
      where: eq(payments.orderId, orderId),
      orderBy: desc(payments.createdAt),
    });
    if (!row) return null;
    return {
      id: row.id,
      orderId: row.orderId,
      provider: row.provider,
      providerPaymentId: row.providerPaymentId,
      amountMinor: row.amountMinor,
      currency: row.currency,
      status: row.status as PaymentStatus,
      idempotencyKey: row.idempotencyKey,
      verifiedAt: row.verifiedAt,
      createdAt: row.createdAt,
    };
  },

  async findPaymentByIdempotencyKey(key: string): Promise<PaymentRowRecord | null> {
    const db = getDb();
    if (!db) throw new PaymentError("Database unavailable", "DATABASE_UNAVAILABLE");
    const row = await db.query.payments.findFirst({
      where: eq(payments.idempotencyKey, key),
    });
    if (!row) return null;
    return {
      id: row.id,
      orderId: row.orderId,
      provider: row.provider,
      providerPaymentId: row.providerPaymentId,
      amountMinor: row.amountMinor,
      currency: row.currency,
      status: row.status as PaymentStatus,
      idempotencyKey: row.idempotencyKey,
      verifiedAt: row.verifiedAt,
      createdAt: row.createdAt,
    };
  },

  async findWebhookEvent(providerEventId: string): Promise<WebhookEventRecord | null> {
    const db = getDb();
    if (!db) throw new PaymentError("Database unavailable", "DATABASE_UNAVAILABLE");
    const row = await db.query.paymentWebhookEvents.findFirst({
      where: eq(paymentWebhookEvents.providerEventId, providerEventId),
    });
    if (!row) return null;
    return {
      id: row.id,
      providerEventId: row.providerEventId,
      eventType: row.eventType,
      payloadDigest: row.payloadDigest,
      processingStatus: row.processingStatus,
      processedAt: row.processedAt,
    };
  },

  async findWebhookEventByDigest(payloadDigest: string): Promise<WebhookEventRecord | null> {
    const db = getDb();
    if (!db) throw new PaymentError("Database unavailable", "DATABASE_UNAVAILABLE");
    const row = await db.query.paymentWebhookEvents.findFirst({
      where: eq(paymentWebhookEvents.payloadDigest, payloadDigest),
    });
    if (!row) return null;
    return {
      id: row.id,
      providerEventId: row.providerEventId,
      eventType: row.eventType,
      payloadDigest: row.payloadDigest,
      processingStatus: row.processingStatus,
      processedAt: row.processedAt,
    };
  },

  async getActiveStockReservations(orderId: string): Promise<StockReservationRecord[]> {
    const db = getDb();
    if (!db) throw new PaymentError("Database unavailable", "DATABASE_UNAVAILABLE");
    const now = new Date();
    const rows = await db.query.stockReservations.findMany({
      where: and(
        eq(stockReservations.orderId, orderId),
        eq(stockReservations.status, "active"),
        sql`${stockReservations.expiresAt} > ${now}`
      ),
    });
    return rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      productId: r.productId,
      variantId: r.variantId,
      quantity: r.quantity,
      status: r.status as StockReservationRecord["status"],
      expiresAt: r.expiresAt,
    }));
  },

  async checkInventoryAvailability(
    items: OrderItemRecord[]
  ): Promise<{ available: boolean; unavailableProductId?: string }> {
    const db = getDb();
    if (!db) throw new PaymentError("Database unavailable", "DATABASE_UNAVAILABLE");
    for (const item of items) {
      if (!item.productId) continue;
      const inv = await db.query.inventory.findFirst({
        where: eq(inventory.productId, item.productId),
      });
      if (!inv) return { available: false, unavailableProductId: item.productId };
      const netAvailable = inv.quantityOnHand - inv.quantityReserved;
      if (netAvailable < item.quantity) {
        return { available: false, unavailableProductId: item.productId };
      }
    }
    return { available: true };
  },

  async recordPaymentIntent(data: {
    orderId: string;
    provider: string;
    providerPaymentId?: string;
    amountMinor: number;
    currency: string;
    idempotencyKey: string;
    status: PaymentStatus;
  }): Promise<PaymentRowRecord> {
    const db = getDb();
    if (!db) throw new PaymentError("Database unavailable", "DATABASE_UNAVAILABLE");

    const [row] = await db
      .insert(payments)
      .values({
        orderId: data.orderId,
        provider: data.provider,
        providerPaymentId: data.providerPaymentId || null,
        amountMinor: data.amountMinor,
        currency: data.currency,
        status: data.status,
        idempotencyKey: data.idempotencyKey,
      })
      .returning();

    if (!row) {
      throw new PaymentError("Failed to insert payment record.", "DATABASE_ERROR");
    }

    return {
      id: row.id,
      orderId: row.orderId,
      provider: row.provider,
      providerPaymentId: row.providerPaymentId,
      amountMinor: row.amountMinor,
      currency: row.currency,
      status: row.status as PaymentStatus,
      idempotencyKey: row.idempotencyKey,
      verifiedAt: row.verifiedAt,
      createdAt: row.createdAt,
    };
  },

  async commitPaymentSuccess(data: PaymentCommitInput): Promise<void> {
    const db = getDb();
    if (!db) throw new PaymentError("Database unavailable", "DATABASE_UNAVAILABLE");

    await db.transaction(async (tx) => {
      // 1. Record webhook deduplication
      await tx.insert(paymentWebhookEvents).values({
        providerEventId: data.webhookEvent.providerEventId,
        eventType: data.webhookEvent.eventType,
        payloadDigest: data.webhookEvent.payloadDigest,
        processingStatus: "success",
      });

      // 2. Determine target status
      const targetPaymentStatus: PaymentStatus =
        data.stockAction === "under_review" ? "pending" : "succeeded";
      const targetFulfillmentStatus =
        data.stockAction === "under_review" ? "pending" : "confirmed";

      // 3. Update or Insert payment record
      const existingPayment = await tx.query.payments.findFirst({
        where: eq(payments.orderId, data.orderId),
      });

      if (existingPayment) {
        await tx
          .update(payments)
          .set({
            status: targetPaymentStatus,
            providerPaymentId: data.providerPaymentId,
            verifiedAt: data.verifiedAt,
          })
          .where(eq(payments.id, existingPayment.id));
      } else {
        await tx.insert(payments).values({
          orderId: data.orderId,
          provider: data.provider,
          providerPaymentId: data.providerPaymentId,
          amountMinor: data.amountMinor,
          currency: data.currency,
          status: targetPaymentStatus,
          idempotencyKey: data.idempotencyKey,
          verifiedAt: data.verifiedAt,
        });
      }

      // 4. Update order payment & fulfillment status
      await tx
        .update(orders)
        .set({
          paymentStatus: targetPaymentStatus,
          fulfillmentStatus: targetFulfillmentStatus,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, data.orderId));

      // 5. Handle stock reservations
      if (data.stockAction === "commit") {
        // Commit existing active reservations
        await tx
          .update(stockReservations)
          .set({ status: "committed" })
          .where(
            and(
              eq(stockReservations.orderId, data.orderId),
              eq(stockReservations.status, "active")
            )
          );

        // Deduct from on-hand inventory
        for (const item of data.orderItems) {
          if (!item.productId) continue;
          await tx
            .update(inventory)
            .set({
              quantityOnHand: sql`${inventory.quantityOnHand} - ${item.quantity}`,
              quantityReserved: sql`GREATEST(0, ${inventory.quantityReserved} - ${item.quantity})`,
              updatedAt: new Date(),
            })
            .where(eq(inventory.productId, item.productId));
        }
      } else if (data.stockAction === "recommit") {
        // Late payment where stock was re-validated and available
        for (const item of data.orderItems) {
          if (!item.productId) continue;
          await tx.insert(stockReservations).values({
            orderId: data.orderId,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            expiresAt: new Date(Date.now() + 86400000), // committed indefinitely for order
            status: "committed",
          });
          await tx
            .update(inventory)
            .set({
              quantityOnHand: sql`${inventory.quantityOnHand} - ${item.quantity}`,
              updatedAt: new Date(),
            })
            .where(eq(inventory.productId, item.productId));
        }
      }

      // 6. Append audit history
      await tx.insert(orderStatusHistory).values({
        orderId: data.orderId,
        oldStatus: "pending",
        newStatus: targetPaymentStatus,
        note:
          data.note ||
          (data.stockAction === "under_review"
            ? "Payment verified after reservation expiry, but inventory is insufficient. Flagged for review."
            : "Payment verified successfully via webhook and stock committed."),
      });
    });
  },

  async recordPaymentFailure(data: PaymentFailureInput): Promise<void> {
    const db = getDb();
    if (!db) throw new PaymentError("Database unavailable", "DATABASE_UNAVAILABLE");

    await db.transaction(async (tx) => {
      // 1. Record webhook deduplication
      await tx.insert(paymentWebhookEvents).values({
        providerEventId: data.webhookEvent.providerEventId,
        eventType: data.webhookEvent.eventType,
        payloadDigest: data.webhookEvent.payloadDigest,
        processingStatus: "failed",
      });

      // 2. Update payment status
      await tx
        .update(payments)
        .set({ status: "failed" })
        .where(eq(payments.orderId, data.orderId));

      // 3. Update order payment status
      await tx
        .update(orders)
        .set({ paymentStatus: "failed", updatedAt: new Date() })
        .where(eq(orders.id, data.orderId));

      // 4. Release any active stock reservations
      await tx
        .update(stockReservations)
        .set({ status: "released" })
        .where(
          and(
            eq(stockReservations.orderId, data.orderId),
            eq(stockReservations.status, "active")
          )
        );

      // 5. Append audit history
      await tx.insert(orderStatusHistory).values({
        orderId: data.orderId,
        oldStatus: "pending",
        newStatus: "failed",
        note: `Payment failed via webhook. Reason: ${data.failureReason}`,
      });
    });
  },
};

// ----------------------------------------------------------------------
// Orchestration Functions
// ----------------------------------------------------------------------

export interface InitiatePaymentInput {
  orderId: string;
  customerEmail: string;
  customerPhone?: string | null;
  idempotencyKey: string;
}

/**
 * Initiates payment with the selected provider adapter.
 */
export async function initiateOrderPayment(
  input: InitiatePaymentInput,
  adapter: PaymentGatewayAdapter,
  storage: PaymentStorageAdapter = defaultDrizzlePaymentStore
): Promise<PaymentIntentResult> {
  const order = await storage.findOrderById(input.orderId);
  if (!order) {
    throw new OrderNotFoundError(`Order with ID ${input.orderId} does not exist.`);
  }

  // If already succeeded, cannot re-initiate payment
  if (order.paymentStatus === "succeeded") {
    throw new PaymentError("Order has already been paid successfully.", "ORDER_ALREADY_PAID");
  }

  // Idempotency: check if payment record already exists for this idempotency key
  const existingPayment = await storage.findPaymentByIdempotencyKey(input.idempotencyKey);
  if (existingPayment) {
    return {
      providerPaymentId: existingPayment.providerPaymentId || "pending_intent",
      status: existingPayment.status,
      metadata: { reused: true },
    };
  }

  const intentParams: PaymentIntentParams = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    amountMinor: order.totalMinor,
    currency: order.currency,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    idempotencyKey: input.idempotencyKey,
  };

  const intentResult = await adapter.createPaymentIntent(intentParams);

  // Record initial payment record
  await storage.recordPaymentIntent({
    orderId: order.id,
    provider: adapter.providerName,
    providerPaymentId: intentResult.providerPaymentId,
    amountMinor: order.totalMinor,
    currency: order.currency,
    idempotencyKey: input.idempotencyKey,
    status: intentResult.status,
  });

  return intentResult;
}

export interface WebhookProcessingResult {
  processed: boolean;
  duplicate: boolean;
  providerEventId: string;
  eventType: string;
  orderId?: string;
  paymentStatus: PaymentStatus;
  message: string;
}

/**
 * Validates, deduplicates, and processes an incoming payment webhook.
 */
export async function processPaymentWebhook(
  rawBody: string | Buffer,
  headers: Record<string, string | string[] | undefined>,
  adapter: PaymentGatewayAdapter,
  storage: PaymentStorageAdapter = defaultDrizzlePaymentStore
): Promise<WebhookProcessingResult> {
  // 1. Signature Verification
  const isSignatureValid = await adapter.verifyWebhookSignature({
    rawBody,
    headers,
  });

  if (!isSignatureValid) {
    throw new WebhookSignatureVerificationError(
      "Webhook signature validation failed. Possible tampering or unauthorized caller."
    );
  }

  // 2. Parse Event DTO
  const eventDTO = await adapter.parseWebhookEvent(rawBody, headers);

  // 3. Compute SHA-256 payload digest for replay protection
  const bodyString = typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8");
  const payloadDigest = hashToken(bodyString);

  // 4. Deduplication Check
  const existingEvent =
    (await storage.findWebhookEvent(eventDTO.providerEventId)) ||
    (await storage.findWebhookEventByDigest(payloadDigest));

  if (existingEvent && existingEvent.processingStatus === "success") {
    return {
      processed: true,
      duplicate: true,
      providerEventId: eventDTO.providerEventId,
      eventType: eventDTO.eventType,
      orderId: eventDTO.orderId,
      paymentStatus: "succeeded",
      message: "Webhook event was already processed previously (idempotent no-op).",
    };
  }

  // 5. Order Lookup
  let order: OrderPaymentRecord | null = null;
  if (eventDTO.orderId) {
    order = await storage.findOrderById(eventDTO.orderId);
  } else if (eventDTO.orderNumber) {
    order = await storage.findOrderByNumber(eventDTO.orderNumber);
  }

  if (!order) {
    throw new OrderNotFoundError(
      `Order reference (${eventDTO.orderId || eventDTO.orderNumber || "unknown"}) in webhook not found.`
    );
  }

  // 6. Amount & Currency Validation
  if (eventDTO.currency.toUpperCase() !== order.currency.toUpperCase()) {
    throw new PaymentAmountMismatchError(
      `Currency mismatch: Webhook specifies ${eventDTO.currency}, but order expects ${order.currency}.`
    );
  }

  if (eventDTO.amountMinor !== order.totalMinor) {
    throw new PaymentAmountMismatchError(
      `Amount mismatch: Webhook specifies ${eventDTO.amountMinor} minor units, but order requires ${order.totalMinor}.`
    );
  }

  // 7. State Transition Check
  const currentStatus = order.paymentStatus;
  const targetStatus = eventDTO.status;

  if (currentStatus === "succeeded" && targetStatus === "succeeded") {
    // Already marked succeeded; idempotent success
    return {
      processed: true,
      duplicate: true,
      providerEventId: eventDTO.providerEventId,
      eventType: eventDTO.eventType,
      orderId: order.id,
      paymentStatus: "succeeded",
      message: "Order was already marked succeeded. Webhook acknowledged idempotently.",
    };
  }

  if (!isValidPaymentTransition(currentStatus, targetStatus)) {
    throw new InvalidStateTransitionError(
      `Illegal payment transition from '${currentStatus}' to '${targetStatus}'.`
    );
  }

  // 8. Atomic Processing & Reservation Safety
  const orderItemsList = await storage.getOrderItems(order.id);

  if (targetStatus === "succeeded") {
    // Check reservations
    const activeReservations = await storage.getActiveStockReservations(order.id);

    let stockAction: "commit" | "recommit" | "under_review" = "commit";

    if (activeReservations.length === 0) {
      // Late payment arrived after reservation expired or was released
      const availability = await storage.checkInventoryAvailability(orderItemsList);
      if (availability.available) {
        stockAction = "recommit";
      } else {
        stockAction = "under_review";
      }
    }

    await storage.commitPaymentSuccess({
      orderId: order.id,
      provider: adapter.providerName,
      providerPaymentId: eventDTO.providerPaymentId,
      amountMinor: eventDTO.amountMinor,
      currency: eventDTO.currency,
      idempotencyKey: `webhook-${eventDTO.providerEventId}`,
      verifiedAt: eventDTO.timestamp || new Date(),
      stockAction,
      orderItems: orderItemsList,
      webhookEvent: {
        providerEventId: eventDTO.providerEventId,
        eventType: eventDTO.eventType,
        payloadDigest,
      },
    });

    return {
      processed: true,
      duplicate: false,
      providerEventId: eventDTO.providerEventId,
      eventType: eventDTO.eventType,
      orderId: order.id,
      paymentStatus: stockAction === "under_review" ? "pending" : "succeeded",
      message:
        stockAction === "under_review"
          ? "Payment received after reservation expired. Stock insufficient; flagged for review."
          : "Payment verified successfully and order updated.",
    };
  }

  if (targetStatus === "failed" || targetStatus === "cancelled") {
    await storage.recordPaymentFailure({
      orderId: order.id,
      provider: adapter.providerName,
      providerPaymentId: eventDTO.providerPaymentId,
      amountMinor: eventDTO.amountMinor,
      currency: eventDTO.currency,
      idempotencyKey: `webhook-${eventDTO.providerEventId}`,
      failureReason: `Webhook event received status: ${targetStatus}`,
      webhookEvent: {
        providerEventId: eventDTO.providerEventId,
        eventType: eventDTO.eventType,
        payloadDigest,
      },
    });

    return {
      processed: true,
      duplicate: false,
      providerEventId: eventDTO.providerEventId,
      eventType: eventDTO.eventType,
      orderId: order.id,
      paymentStatus: targetStatus,
      message: `Payment marked as ${targetStatus}.`,
    };
  }

  return {
    processed: true,
    duplicate: false,
    providerEventId: eventDTO.providerEventId,
    eventType: eventDTO.eventType,
    orderId: order.id,
    paymentStatus: targetStatus,
    message: `Event ${eventDTO.eventType} processed.`,
  };
}
