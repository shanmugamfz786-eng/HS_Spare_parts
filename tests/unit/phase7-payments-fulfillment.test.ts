import { describe, it, expect, beforeEach } from "vitest";
import crypto from "crypto";
import { hashToken } from "@/lib/security";
import {
  initiateOrderPayment,
  processPaymentWebhook,
  WebhookSignatureVerificationError,
  PaymentAmountMismatchError,
  InvalidStateTransitionError,
  OrderNotFoundError,
  type PaymentStorageAdapter,
  type OrderPaymentRecord,
  type OrderItemRecord,
  type PaymentRowRecord,
  type WebhookEventRecord,
  type StockReservationRecord,
  type PaymentCommitInput,
  type PaymentFailureInput,
} from "@/features/payments/service";
import type {
  PaymentGatewayAdapter,
  PaymentIntentParams,
  PaymentIntentResult,
  WebhookVerificationParams,
  PaymentWebhookEventDTO,
  PaymentStatus,
} from "@/features/payments/types";
import { isValidPaymentTransition } from "@/features/payments/types";
import {
  dispatchOrder,
  updateShipmentMilestoneStatus,
  getOrderTracking,
  assertDispatchEligibility,
  OrderNotEligibleForDispatchError,
  UnauthorizedTrackingAccessError,
  type FulfillmentStorageAdapter,
  type OrderFulfillmentRecord,
  type ShipmentRecord,
} from "@/features/fulfillment/service";
import type {
  FulfillmentCarrierAdapter,
  ShipmentStatus,
  OrderFulfillmentStatus,
} from "@/features/fulfillment/types";
import {
  runPaymentReconciliation,
  type ReconciliationStorageAdapter,
  type StalePendingPaymentRecord,
} from "@/features/payments/reconciliation";
import { ROLES, PERMISSIONS } from "@/lib/auth/rbac";

// ----------------------------------------------------------------------
// Test-Only Mocks & In-Memory Storage Adapters
// ----------------------------------------------------------------------

class MockTestPaymentGatewayAdapter implements PaymentGatewayAdapter {
  readonly providerName = "mock_test_gateway";
  public signatureValid = true;
  public fetchDetailsResult: {
    providerPaymentId: string;
    amountMinor: number;
    currency: string;
    status: PaymentStatus;
  } | null = null;
  public fetchDetailsThrows = false;

  async createPaymentIntent(params: PaymentIntentParams): Promise<PaymentIntentResult> {
    return {
      providerPaymentId: `pi_mock_${params.orderNumber}`,
      clientSecret: `cs_mock_secret_${params.idempotencyKey}`,
      status: "pending",
    };
  }

  async verifyWebhookSignature(_params: WebhookVerificationParams): Promise<boolean> {
    return this.signatureValid;
  }

  async parseWebhookEvent(
    rawBody: string | Buffer
  ): Promise<PaymentWebhookEventDTO> {
    const parsed = JSON.parse(rawBody.toString("utf-8"));
    return {
      providerEventId: parsed.event_id || "evt_mock_1",
      eventType: parsed.event_type || "payment.succeeded",
      orderId: parsed.order_id,
      orderNumber: parsed.order_number,
      providerPaymentId: parsed.payment_id || "pi_mock_123",
      amountMinor: parsed.amount_minor,
      currency: parsed.currency || "INR",
      status: parsed.status || "succeeded",
      rawPayloadDigest: hashToken(rawBody.toString("utf-8")),
      timestamp: new Date(),
    };
  }

  async fetchPaymentDetails(providerPaymentId: string) {
    if (this.fetchDetailsThrows) {
      throw new Error("Provider API timeout or network failure");
    }
    return (
      this.fetchDetailsResult || {
        providerPaymentId,
        amountMinor: 50000,
        currency: "INR",
        status: "pending" as PaymentStatus,
      }
    );
  }
}

class MockTestCarrierAdapter implements FulfillmentCarrierAdapter {
  readonly carrierName = "mock_carrier";
  public createdShipments: unknown[] = [];

  async createShipment(params: { carrier: string; trackingNumber?: string }) {
    this.createdShipments.push(params);
    return {
      carrier: params.carrier,
      trackingNumber: params.trackingNumber || "MOCK-TRACK-9999",
      trackingUrl: `https://tracking.mockcarrier.test/${params.trackingNumber || "MOCK-TRACK-9999"}`,
      status: "shipped" as ShipmentStatus,
    };
  }
}

class InMemoryPaymentStorage implements PaymentStorageAdapter {
  public orders: Map<string, OrderPaymentRecord> = new Map();
  public orderItems: Map<string, OrderItemRecord[]> = new Map();
  public payments: Map<string, PaymentRowRecord> = new Map();
  public webhookEvents: Map<string, WebhookEventRecord> = new Map();
  public stockReservations: StockReservationRecord[] = [];
  public inventory: Map<string, { quantityOnHand: number; quantityReserved: number }> = new Map();
  public statusHistory: unknown[] = [];

  isConfigured(): boolean {
    return true;
  }

  async findOrderById(orderId: string): Promise<OrderPaymentRecord | null> {
    return this.orders.get(orderId) || null;
  }

  async findOrderByNumber(orderNumber: string): Promise<OrderPaymentRecord | null> {
    for (const ord of this.orders.values()) {
      if (ord.orderNumber === orderNumber) return ord;
    }
    return null;
  }

  async getOrderItems(orderId: string): Promise<OrderItemRecord[]> {
    return this.orderItems.get(orderId) || [];
  }

  async findPaymentByOrderId(orderId: string): Promise<PaymentRowRecord | null> {
    for (const p of this.payments.values()) {
      if (p.orderId === orderId) return p;
    }
    return null;
  }

  async findPaymentByIdempotencyKey(key: string): Promise<PaymentRowRecord | null> {
    return this.payments.get(key) || null;
  }

  async findWebhookEvent(providerEventId: string): Promise<WebhookEventRecord | null> {
    for (const ev of this.webhookEvents.values()) {
      if (ev.providerEventId === providerEventId) return ev;
    }
    return null;
  }

  async findWebhookEventByDigest(payloadDigest: string): Promise<WebhookEventRecord | null> {
    for (const ev of this.webhookEvents.values()) {
      if (ev.payloadDigest === payloadDigest) return ev;
    }
    return null;
  }

  async getActiveStockReservations(orderId: string): Promise<StockReservationRecord[]> {
    const now = new Date();
    return this.stockReservations.filter(
      (r) => r.orderId === orderId && r.status === "active" && r.expiresAt > now
    );
  }

  async checkInventoryAvailability(
    items: OrderItemRecord[]
  ): Promise<{ available: boolean; unavailableProductId?: string }> {
    for (const item of items) {
      if (!item.productId) continue;
      const inv = this.inventory.get(item.productId);
      if (!inv) return { available: false, unavailableProductId: item.productId };
      const net = inv.quantityOnHand - inv.quantityReserved;
      if (net < item.quantity) {
        return { available: false, unavailableProductId: item.productId };
      }
    }
    return { available: true };
  }

  async recordPaymentIntent(data: {
    orderId: string;
    provider: string;
    providerPaymentId?: string;
    amountMinor: number;
    currency: string;
    idempotencyKey: string;
    status: PaymentStatus;
  }): Promise<PaymentRowRecord> {
    const row: PaymentRowRecord = {
      id: `pay_${Date.now()}_${Math.random()}`,
      orderId: data.orderId,
      provider: data.provider,
      providerPaymentId: data.providerPaymentId || null,
      amountMinor: data.amountMinor,
      currency: data.currency,
      status: data.status,
      idempotencyKey: data.idempotencyKey,
      verifiedAt: null,
      createdAt: new Date(),
    };
    this.payments.set(data.idempotencyKey, row);
    return row;
  }

  async commitPaymentSuccess(data: PaymentCommitInput): Promise<void> {
    // Deduplication event
    this.webhookEvents.set(data.webhookEvent.providerEventId, {
      id: `we_${Date.now()}`,
      providerEventId: data.webhookEvent.providerEventId,
      eventType: data.webhookEvent.eventType,
      payloadDigest: data.webhookEvent.payloadDigest,
      processingStatus: "success",
      processedAt: new Date(),
    });

    const targetPaymentStatus: PaymentStatus =
      data.stockAction === "under_review" ? "pending" : "succeeded";
    const targetFulfillmentStatus =
      data.stockAction === "under_review" ? "pending" : "confirmed";

    // Update order
    const order = this.orders.get(data.orderId);
    if (order) {
      order.paymentStatus = targetPaymentStatus;
      order.fulfillmentStatus = targetFulfillmentStatus;
    }

    // Update payment
    const payment = await this.findPaymentByOrderId(data.orderId);
    if (payment) {
      payment.status = targetPaymentStatus;
      payment.providerPaymentId = data.providerPaymentId;
      payment.verifiedAt = data.verifiedAt;
    } else {
      this.payments.set(data.idempotencyKey, {
        id: `pay_${Date.now()}`,
        orderId: data.orderId,
        provider: data.provider,
        providerPaymentId: data.providerPaymentId,
        amountMinor: data.amountMinor,
        currency: data.currency,
        status: targetPaymentStatus,
        idempotencyKey: data.idempotencyKey,
        verifiedAt: data.verifiedAt,
        createdAt: new Date(),
      });
    }

    // Reservations
    if (data.stockAction === "commit") {
      for (const res of this.stockReservations) {
        if (res.orderId === data.orderId && res.status === "active") {
          res.status = "committed";
        }
      }
      for (const item of data.orderItems) {
        if (!item.productId) continue;
        const inv = this.inventory.get(item.productId);
        if (inv) {
          inv.quantityOnHand -= item.quantity;
          inv.quantityReserved = Math.max(0, inv.quantityReserved - item.quantity);
        }
      }
    } else if (data.stockAction === "recommit") {
      for (const item of data.orderItems) {
        if (!item.productId) continue;
        this.stockReservations.push({
          id: `res_recommit_${Date.now()}`,
          orderId: data.orderId,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          status: "committed",
          expiresAt: new Date(Date.now() + 86400000),
        });
        const inv = this.inventory.get(item.productId);
        if (inv) {
          inv.quantityOnHand -= item.quantity;
        }
      }
    }

    this.statusHistory.push({
      orderId: data.orderId,
      oldStatus: "pending",
      newStatus: targetPaymentStatus,
      note: data.note || "Payment committed successfully.",
    });
  }

  async recordPaymentFailure(data: PaymentFailureInput): Promise<void> {
    this.webhookEvents.set(data.webhookEvent.providerEventId, {
      id: `we_${Date.now()}`,
      providerEventId: data.webhookEvent.providerEventId,
      eventType: data.webhookEvent.eventType,
      payloadDigest: data.webhookEvent.payloadDigest,
      processingStatus: "failed",
      processedAt: new Date(),
    });

    const order = this.orders.get(data.orderId);
    if (order) {
      order.paymentStatus = "failed";
    }

    const payment = await this.findPaymentByOrderId(data.orderId);
    if (payment) {
      payment.status = "failed";
    }

    for (const res of this.stockReservations) {
      if (res.orderId === data.orderId && res.status === "active") {
        res.status = "released";
      }
    }

    this.statusHistory.push({
      orderId: data.orderId,
      oldStatus: "pending",
      newStatus: "failed",
      note: `Payment failed: ${data.failureReason}`,
    });
  }
}

class InMemoryFulfillmentStorage implements FulfillmentStorageAdapter {
  public orders: Map<string, OrderFulfillmentRecord> = new Map();
  public shipments: ShipmentRecord[] = [];
  public statusHistory: unknown[] = [];

  isConfigured(): boolean {
    return true;
  }

  async findOrderById(orderId: string): Promise<OrderFulfillmentRecord | null> {
    return this.orders.get(orderId) || null;
  }

  async findShipmentsByOrderId(orderId: string): Promise<ShipmentRecord[]> {
    return this.shipments.filter((s) => s.orderId === orderId);
  }

  async findShipmentByTrackingNumber(trackingNumber: string): Promise<ShipmentRecord | null> {
    return this.shipments.find((s) => s.trackingNumber === trackingNumber) || null;
  }

  async findShipmentById(shipmentId: string): Promise<ShipmentRecord | null> {
    return this.shipments.find((s) => s.id === shipmentId) || null;
  }

  async createShipmentRecord(data: {
    orderId: string;
    carrier: string;
    trackingNumber: string;
    trackingUrl?: string | null;
    status: ShipmentStatus;
    shippedAt?: Date | null;
  }): Promise<ShipmentRecord> {
    const record: ShipmentRecord = {
      id: `ship_${Date.now()}_${Math.random()}`,
      orderId: data.orderId,
      carrier: data.carrier,
      trackingNumber: data.trackingNumber,
      trackingUrl: data.trackingUrl || null,
      status: data.status,
      shippedAt: data.shippedAt || new Date(),
      deliveredAt: null,
      createdAt: new Date(),
    };
    this.shipments.push(record);
    return record;
  }

  async updateShipmentStatus(
    shipmentId: string,
    status: ShipmentStatus,
    timestamps?: { shippedAt?: Date | null; deliveredAt?: Date | null }
  ): Promise<void> {
    const s = this.shipments.find((item) => item.id === shipmentId);
    if (s) {
      s.status = status;
      if (timestamps?.shippedAt !== undefined) s.shippedAt = timestamps.shippedAt;
      if (timestamps?.deliveredAt !== undefined) s.deliveredAt = timestamps.deliveredAt;
    }
  }

  async updateOrderFulfillmentStatus(
    orderId: string,
    status: OrderFulfillmentStatus,
    note: string,
    actorUserId?: string | null
  ): Promise<void> {
    const ord = this.orders.get(orderId);
    if (ord) {
      ord.fulfillmentStatus = status;
    }
    this.statusHistory.push({
      orderId,
      newStatus: status,
      note,
      actorUserId,
    });
  }

  async getOrdersAwaitingFulfillment(): Promise<OrderFulfillmentRecord[]> {
    return Array.from(this.orders.values()).filter(
      (o) =>
        o.paymentStatus === "succeeded" &&
        ["pending", "confirmed", "processing", "packed"].includes(o.fulfillmentStatus)
    );
  }
}

class InMemoryReconciliationStorage implements ReconciliationStorageAdapter {
  public stalePayments: StalePendingPaymentRecord[] = [];
  public cancelledOrders: Array<{ orderId: string; paymentId: string; reason: string }> = [];
  public expiredReservationsCount = 0;

  isConfigured(): boolean {
    return true;
  }

  async findStalePendingPayments(): Promise<StalePendingPaymentRecord[]> {
    return this.stalePayments;
  }

  async releaseExpiredReservations(): Promise<number> {
    const count = this.expiredReservationsCount;
    this.expiredReservationsCount = 0;
    return count;
  }

  async markPaymentCancelled(orderId: string, paymentId: string, reason: string): Promise<void> {
    this.cancelledOrders.push({ orderId, paymentId, reason });
  }
}

// ----------------------------------------------------------------------
// Test Suite: Phase 7 Payments & Fulfillment Foundations
// ----------------------------------------------------------------------

describe("Phase 7A: Provider-Independent Payments & Fulfillment Foundation", () => {
  let paymentStore: InMemoryPaymentStorage;
  let fulfillmentStore: InMemoryFulfillmentStorage;
  let mockGateway: MockTestPaymentGatewayAdapter;
  let mockCarrier: MockTestCarrierAdapter;

  beforeEach(() => {
    paymentStore = new InMemoryPaymentStorage();
    fulfillmentStore = new InMemoryFulfillmentStorage();
    mockGateway = new MockTestPaymentGatewayAdapter();
    mockCarrier = new MockTestCarrierAdapter();
  });

  // ====================================================================
  // 1. Payment Domain & State Machine Tests
  // ====================================================================
  describe("1. Payment State Machine Transitions", () => {
    it("allows standard linear transition flow: created -> pending -> succeeded", () => {
      expect(isValidPaymentTransition("created", "pending")).toBe(true);
      expect(isValidPaymentTransition("pending", "succeeded")).toBe(true);
    });

    it("allows direct transition from created to succeeded (immediate capture)", () => {
      expect(isValidPaymentTransition("created", "succeeded")).toBe(true);
    });

    it("allows cancellation and failure from non-terminal states", () => {
      expect(isValidPaymentTransition("created", "failed")).toBe(true);
      expect(isValidPaymentTransition("created", "cancelled")).toBe(true);
      expect(isValidPaymentTransition("pending", "failed")).toBe(true);
      expect(isValidPaymentTransition("pending", "cancelled")).toBe(true);
    });

    it("rejects illegal backward transitions from succeeded to pending or failed", () => {
      expect(isValidPaymentTransition("succeeded", "pending")).toBe(false);
      expect(isValidPaymentTransition("succeeded", "failed")).toBe(false);
      expect(isValidPaymentTransition("succeeded", "created")).toBe(false);
    });

    it("rejects transitions out of terminal states (succeeded, failed, cancelled)", () => {
      expect(isValidPaymentTransition("failed", "succeeded")).toBe(false);
      expect(isValidPaymentTransition("cancelled", "succeeded")).toBe(false);
      expect(isValidPaymentTransition("succeeded", "pending")).toBe(false);
    });

    it("allows idempotent same-state transitions", () => {
      expect(isValidPaymentTransition("succeeded", "succeeded")).toBe(true);
      expect(isValidPaymentTransition("pending", "pending")).toBe(true);
    });
  });

  // ====================================================================
  // 2. Payment Initiation
  // ====================================================================
  describe("2. Payment Initiation & Idempotency", () => {
    it("successfully creates a payment intent for a pending order", async () => {
      paymentStore.orders.set("ord-1", {
        id: "ord-1",
        orderNumber: "HS-2026-0001",
        userId: "user-1",
        totalMinor: 499900,
        currency: "INR",
        paymentStatus: "pending",
        fulfillmentStatus: "pending",
      });

      const res = await initiateOrderPayment(
        {
          orderId: "ord-1",
          customerEmail: "customer@example.com",
          idempotencyKey: "idem-key-1",
        },
        mockGateway,
        paymentStore
      );

      expect(res.providerPaymentId).toBe("pi_mock_HS-2026-0001");
      expect(res.status).toBe("pending");

      const savedPayment = await paymentStore.findPaymentByIdempotencyKey("idem-key-1");
      expect(savedPayment).not.toBeNull();
      expect(savedPayment?.amountMinor).toBe(499900);
      expect(savedPayment?.currency).toBe("INR");
    });

    it("returns existing payment intent when called idempotently with same key", async () => {
      paymentStore.orders.set("ord-1", {
        id: "ord-1",
        orderNumber: "HS-2026-0001",
        userId: "user-1",
        totalMinor: 499900,
        currency: "INR",
        paymentStatus: "pending",
        fulfillmentStatus: "pending",
      });

      const firstCall = await initiateOrderPayment(
        {
          orderId: "ord-1",
          customerEmail: "customer@example.com",
          idempotencyKey: "idem-key-reuse",
        },
        mockGateway,
        paymentStore
      );

      const secondCall = await initiateOrderPayment(
        {
          orderId: "ord-1",
          customerEmail: "customer@example.com",
          idempotencyKey: "idem-key-reuse",
        },
        mockGateway,
        paymentStore
      );

      expect(secondCall.providerPaymentId).toBe(firstCall.providerPaymentId);
      expect(secondCall.metadata?.reused).toBe(true);
    });

    it("rejects payment initiation for an order that is already paid", async () => {
      paymentStore.orders.set("ord-paid", {
        id: "ord-paid",
        orderNumber: "HS-2026-PAID",
        userId: "user-1",
        totalMinor: 100000,
        currency: "INR",
        paymentStatus: "succeeded",
        fulfillmentStatus: "confirmed",
      });

      await expect(
        initiateOrderPayment(
          {
            orderId: "ord-paid",
            customerEmail: "customer@example.com",
            idempotencyKey: "idem-paid-test",
          },
          mockGateway,
          paymentStore
        )
      ).rejects.toThrow("Order has already been paid successfully.");
    });
  });

  // ====================================================================
  // 3. Webhook Processing & Security
  // ====================================================================
  describe("3. Webhook Processing, Verification & Deduplication", () => {
    it("rejects webhook if signature verification fails", async () => {
      mockGateway.signatureValid = false;

      const rawPayload = JSON.stringify({
        event_id: "evt_tampered",
        order_id: "ord-1",
        amount_minor: 50000,
      });

      await expect(
        processPaymentWebhook(rawPayload, {}, mockGateway, paymentStore)
      ).rejects.toThrow(WebhookSignatureVerificationError);
    });

    it("rejects webhook if order cannot be resolved", async () => {
      mockGateway.signatureValid = true;

      const rawPayload = JSON.stringify({
        event_id: "evt_unknown_ord",
        order_id: "ord-non-existent",
        amount_minor: 50000,
        currency: "INR",
      });

      await expect(
        processPaymentWebhook(rawPayload, {}, mockGateway, paymentStore)
      ).rejects.toThrow(OrderNotFoundError);
    });

    it("rejects webhook if currency does not match order currency", async () => {
      paymentStore.orders.set("ord-curr", {
        id: "ord-curr",
        orderNumber: "HS-2026-CURR",
        userId: "user-1",
        totalMinor: 50000,
        currency: "INR",
        paymentStatus: "pending",
        fulfillmentStatus: "pending",
      });

      const rawPayload = JSON.stringify({
        event_id: "evt_curr_mismatch",
        order_id: "ord-curr",
        amount_minor: 50000,
        currency: "USD", // Mismatched currency
      });

      await expect(
        processPaymentWebhook(rawPayload, {}, mockGateway, paymentStore)
      ).rejects.toThrow(PaymentAmountMismatchError);
    });

    it("rejects webhook if amount does not match order totalMinor", async () => {
      paymentStore.orders.set("ord-amt", {
        id: "ord-amt",
        orderNumber: "HS-2026-AMT",
        userId: "user-1",
        totalMinor: 50000, // Rs 500
        currency: "INR",
        paymentStatus: "pending",
        fulfillmentStatus: "pending",
      });

      const rawPayload = JSON.stringify({
        event_id: "evt_amt_mismatch",
        order_id: "ord-amt",
        amount_minor: 40000, // Rs 400 (underpayment attempt)
        currency: "INR",
      });

      await expect(
        processPaymentWebhook(rawPayload, {}, mockGateway, paymentStore)
      ).rejects.toThrow(PaymentAmountMismatchError);
    });

    it("successfully processes valid payment.succeeded webhook and commits stock", async () => {
      paymentStore.orders.set("ord-success", {
        id: "ord-success",
        orderNumber: "HS-2026-SUCC",
        userId: "user-1",
        totalMinor: 50000,
        currency: "INR",
        paymentStatus: "pending",
        fulfillmentStatus: "pending",
      });

      paymentStore.orderItems.set("ord-success", [
        { productId: "prod-brake-pad", variantId: null, quantity: 2 },
      ]);

      paymentStore.stockReservations.push({
        id: "res-1",
        orderId: "ord-success",
        productId: "prod-brake-pad",
        variantId: null,
        quantity: 2,
        status: "active",
        expiresAt: new Date(Date.now() + 1800000), // 30 mins active
      });

      paymentStore.inventory.set("prod-brake-pad", {
        quantityOnHand: 10,
        quantityReserved: 2,
      });

      const rawPayload = JSON.stringify({
        event_id: "evt_success_1",
        event_type: "payment.succeeded",
        order_id: "ord-success",
        payment_id: "pi_captured_123",
        amount_minor: 50000,
        currency: "INR",
        status: "succeeded",
      });

      const result = await processPaymentWebhook(rawPayload, {}, mockGateway, paymentStore);

      expect(result.processed).toBe(true);
      expect(result.duplicate).toBe(false);
      expect(result.paymentStatus).toBe("succeeded");

      // Verify order and stock mutations
      const updatedOrder = paymentStore.orders.get("ord-success");
      expect(updatedOrder?.paymentStatus).toBe("succeeded");
      expect(updatedOrder?.fulfillmentStatus).toBe("confirmed");

      const reservation = paymentStore.stockReservations[0];
      expect(reservation).toBeDefined();
      expect(reservation!.status).toBe("committed");

      const inv = paymentStore.inventory.get("prod-brake-pad");
      expect(inv?.quantityOnHand).toBe(8); // Deducted 2
      expect(inv?.quantityReserved).toBe(0); // Reserved decremented
    });

    it("deduplicates identical webhook replay without mutating order twice", async () => {
      paymentStore.orders.set("ord-dup", {
        id: "ord-dup",
        orderNumber: "HS-2026-DUP",
        userId: "user-1",
        totalMinor: 30000,
        currency: "INR",
        paymentStatus: "pending",
        fulfillmentStatus: "pending",
      });

      const rawPayload = JSON.stringify({
        event_id: "evt_dup_replay",
        event_type: "payment.succeeded",
        order_id: "ord-dup",
        payment_id: "pi_dup_123",
        amount_minor: 30000,
        currency: "INR",
        status: "succeeded",
      });

      // First run
      const firstRun = await processPaymentWebhook(rawPayload, {}, mockGateway, paymentStore);
      expect(firstRun.processed).toBe(true);
      expect(firstRun.duplicate).toBe(false);

      // Second run (exact replay)
      const secondRun = await processPaymentWebhook(rawPayload, {}, mockGateway, paymentStore);
      expect(secondRun.processed).toBe(true);
      expect(secondRun.duplicate).toBe(true);
    });

    it("rejects illegal state transition if payment tries to regress from succeeded to failed", async () => {
      paymentStore.orders.set("ord-paid-regress", {
        id: "ord-paid-regress",
        orderNumber: "HS-2026-PAID-REG",
        userId: "user-1",
        totalMinor: 30000,
        currency: "INR",
        paymentStatus: "succeeded", // Already succeeded!
        fulfillmentStatus: "confirmed",
      });

      const rawPayload = JSON.stringify({
        event_id: "evt_late_failed_attempt",
        event_type: "payment.failed",
        order_id: "ord-paid-regress",
        payment_id: "pi_123",
        amount_minor: 30000,
        currency: "INR",
        status: "failed", // Attempting to regress succeeded -> failed
      });

      await expect(
        processPaymentWebhook(rawPayload, {}, mockGateway, paymentStore)
      ).rejects.toThrow(InvalidStateTransitionError);
    });
  });

  // ====================================================================
  // 4. Late Payment & Reservation Expiry Safety
  // ====================================================================
  describe("4. Late Payment Handling (Expired Reservations)", () => {
    it("re-commits inventory if payment succeeds after reservation expired and stock is available", async () => {
      paymentStore.orders.set("ord-late-ok", {
        id: "ord-late-ok",
        orderNumber: "HS-2026-LATE-OK",
        userId: "user-1",
        totalMinor: 20000,
        currency: "INR",
        paymentStatus: "pending",
        fulfillmentStatus: "pending",
      });

      paymentStore.orderItems.set("ord-late-ok", [
        { productId: "prod-spark-plug", variantId: null, quantity: 4 },
      ]);

      // No active reservations (expired/released)
      paymentStore.stockReservations = [];

      // Sufficient stock is still on hand
      paymentStore.inventory.set("prod-spark-plug", {
        quantityOnHand: 20,
        quantityReserved: 0,
      });

      const rawPayload = JSON.stringify({
        event_id: "evt_late_ok",
        event_type: "payment.succeeded",
        order_id: "ord-late-ok",
        payment_id: "pi_late_ok",
        amount_minor: 20000,
        currency: "INR",
        status: "succeeded",
      });

      const result = await processPaymentWebhook(rawPayload, {}, mockGateway, paymentStore);
      expect(result.processed).toBe(true);
      expect(result.paymentStatus).toBe("succeeded");

      const ord = paymentStore.orders.get("ord-late-ok");
      expect(ord?.paymentStatus).toBe("succeeded");

      const inv = paymentStore.inventory.get("prod-spark-plug");
      expect(inv?.quantityOnHand).toBe(16); // Deducted 4
    });

    it("flags order for review and does NOT commit phantom inventory if stockout occurred after expiry", async () => {
      paymentStore.orders.set("ord-stockout", {
        id: "ord-stockout",
        orderNumber: "HS-2026-STOCKOUT",
        userId: "user-1",
        totalMinor: 20000,
        currency: "INR",
        paymentStatus: "pending",
        fulfillmentStatus: "pending",
      });

      paymentStore.orderItems.set("ord-stockout", [
        { productId: "prod-rare-part", variantId: null, quantity: 1 },
      ]);

      // Reservation expired
      paymentStore.stockReservations = [];

      // Sold out in the meantime!
      paymentStore.inventory.set("prod-rare-part", {
        quantityOnHand: 0,
        quantityReserved: 0,
      });

      const rawPayload = JSON.stringify({
        event_id: "evt_late_stockout",
        event_type: "payment.succeeded",
        order_id: "ord-stockout",
        payment_id: "pi_late_stockout",
        amount_minor: 20000,
        currency: "INR",
        status: "succeeded",
      });

      const result = await processPaymentWebhook(rawPayload, {}, mockGateway, paymentStore);
      expect(result.processed).toBe(true);
      expect(result.paymentStatus).toBe("pending"); // Under review

      const ord = paymentStore.orders.get("ord-stockout");
      expect(ord?.paymentStatus).toBe("pending");
      expect(ord?.fulfillmentStatus).toBe("pending");

      // Verify no phantom deduction
      const inv = paymentStore.inventory.get("prod-rare-part");
      expect(inv?.quantityOnHand).toBe(0);
    });
  });

  // ====================================================================
  // 5. Fulfillment Domain & Dispatch Rules
  // ====================================================================
  describe("5. Fulfillment Domain & Dispatch Rules", () => {
    it("blocks dispatch of an unpaid order with OrderNotEligibleForDispatchError", async () => {
      const unpaidOrder: OrderFulfillmentRecord = {
        id: "ord-unpaid",
        orderNumber: "HS-2026-UNPAID",
        userId: "user-1",
        paymentStatus: "pending",
        fulfillmentStatus: "pending",
        totalMinor: 50000,
        currency: "INR",
        placedAt: new Date(),
        shippingAddressSnapshot: {},
      };

      expect(() => assertDispatchEligibility(unpaidOrder)).toThrow(
        OrderNotEligibleForDispatchError
      );
    });

    it("blocks dispatch of an already shipped or delivered order", async () => {
      const shippedOrder: OrderFulfillmentRecord = {
        id: "ord-shipped",
        orderNumber: "HS-2026-SHIPPED",
        userId: "user-1",
        paymentStatus: "succeeded",
        fulfillmentStatus: "shipped",
        totalMinor: 50000,
        currency: "INR",
        placedAt: new Date(),
        shippingAddressSnapshot: {},
      };

      expect(() => assertDispatchEligibility(shippedOrder)).toThrow(
        OrderNotEligibleForDispatchError
      );
    });

    it("successfully dispatches an eligible paid order and creates a shipment record", async () => {
      fulfillmentStore.orders.set("ord-fulfill-ok", {
        id: "ord-fulfill-ok",
        orderNumber: "HS-2026-FULFILL-OK",
        userId: "user-1",
        paymentStatus: "succeeded",
        fulfillmentStatus: "confirmed",
        totalMinor: 75000,
        currency: "INR",
        placedAt: new Date(),
        shippingAddressSnapshot: { line1: "123 Main St", pincode: "560001", fullName: "John Doe" },
      });

      const shipment = await dispatchOrder(
        {
          orderId: "ord-fulfill-ok",
          carrier: "Delhivery",
          trackingNumber: "DEL-12345678",
          trackingUrl: "https://delhivery.com/track/DEL-12345678",
          actorUserId: "admin-staff-1",
        },
        mockCarrier,
        fulfillmentStore
      );

      expect(shipment.carrier).toBe("Delhivery");
      expect(shipment.status).toBe("shipped");

      const ord = fulfillmentStore.orders.get("ord-fulfill-ok");
      expect(ord?.fulfillmentStatus).toBe("shipped");
    });

    it("updates shipment milestones and marks order delivered upon final milestone", async () => {
      const shipment = await fulfillmentStore.createShipmentRecord({
        orderId: "ord-milestone",
        carrier: "Blue Dart",
        trackingNumber: "BD-98765432",
        status: "shipped",
      });

      fulfillmentStore.orders.set("ord-milestone", {
        id: "ord-milestone",
        orderNumber: "HS-2026-MILESTONE",
        userId: "user-1",
        paymentStatus: "succeeded",
        fulfillmentStatus: "shipped",
        totalMinor: 80000,
        currency: "INR",
        placedAt: new Date(),
        shippingAddressSnapshot: {},
      });

      // Update to in_transit
      await updateShipmentMilestoneStatus(
        { shipmentId: shipment.id, status: "in_transit" },
        fulfillmentStore
      );
      expect(fulfillmentStore.shipments[0]?.status).toBe("in_transit");

      // Update to delivered
      await updateShipmentMilestoneStatus(
        { shipmentId: shipment.id, status: "delivered" },
        fulfillmentStore
      );
      expect(fulfillmentStore.shipments[0]?.status).toBe("delivered");

      const ord = fulfillmentStore.orders.get("ord-milestone");
      expect(ord?.fulfillmentStatus).toBe("delivered");
    });
  });

  // ====================================================================
  // 6. Customer IDOR Protection on Order Tracking
  // ====================================================================
  describe("6. Customer Tracking Access & IDOR Protection", () => {
    beforeEach(() => {
      fulfillmentStore.orders.set("ord-idor", {
        id: "ord-idor",
        orderNumber: "HS-2026-IDOR",
        userId: "customer-alice",
        paymentStatus: "succeeded",
        fulfillmentStatus: "shipped",
        totalMinor: 40000,
        currency: "INR",
        placedAt: new Date(),
        shippingAddressSnapshot: {},
      });

      fulfillmentStore.shipments.push({
        id: "ship-idor-1",
        orderId: "ord-idor",
        carrier: "Shiprocket",
        trackingNumber: "SR-8888",
        trackingUrl: "https://shiprocket.co/tracking/SR-8888",
        status: "shipped",
        shippedAt: new Date(),
        deliveredAt: null,
        createdAt: new Date(),
      });
    });

    it("permits the order owner to inspect their own tracking details", async () => {
      const tracking = await getOrderTracking(
        "ord-idor",
        { userId: "customer-alice", roles: [ROLES.CUSTOMER], permissions: [] },
        fulfillmentStore
      );

      expect(tracking.orderNumber).toBe("HS-2026-IDOR");
      expect(tracking.trackingNumber).toBe("SR-8888");
      expect(tracking.hasLiveTracking).toBe(true);
    });

    it("strictly blocks another customer from inspecting Alice's order tracking (IDOR prevention)", async () => {
      await expect(
        getOrderTracking(
          "ord-idor",
          { userId: "customer-bob-attacker", roles: [ROLES.CUSTOMER], permissions: [] },
          fulfillmentStore
        )
      ).rejects.toThrow(UnauthorizedTrackingAccessError);
    });

    it("permits an administrator or order manager to inspect tracking for any order", async () => {
      const adminTracking = await getOrderTracking(
        "ord-idor",
        {
          userId: "admin-user",
          roles: [ROLES.ADMINISTRATOR],
          permissions: [PERMISSIONS.ORDERS_MANAGE],
        },
        fulfillmentStore
      );

      expect(adminTracking.orderNumber).toBe("HS-2026-IDOR");
      expect(adminTracking.carrier).toBe("Shiprocket");
    });
  });

  // ====================================================================
  // 7. Reconciliation Worker & Fail-Closed Safety
  // ====================================================================
  describe("7. Reconciliation Worker & Fail-Closed Safety", () => {
    it("fail-closed: missing adapter does not cancel stale pending payments but flags for review", async () => {
      const reconStore = new InMemoryReconciliationStorage();
      reconStore.stalePayments = [
        {
          orderId: "ord-stale-1",
          orderNumber: "HS-2026-STALE1",
          paymentId: "pay-stale-1",
          providerPaymentId: null,
          amountMinor: 50000,
          createdAt: new Date(Date.now() - 3600000), // 1 hour ago
        },
      ];

      const report = await runPaymentReconciliation(undefined, reconStore, {
        staleWindowMinutes: 30,
      });

      expect(report.stalePendingPaymentsChecked).toBe(1);
      expect(report.flaggedForReview).toBe(1);
      expect(report.syncedPayments).toBe(0);
      expect(reconStore.cancelledOrders.length).toBe(0); // NEVER cancelled without verified provider evidence
      expect(report.details[0]).toContain("no active payment provider adapter configured");
    });

    it("fail-closed: missing provider verification capability does not cancel payments", async () => {
      const reconStore = new InMemoryReconciliationStorage();
      reconStore.stalePayments = [
        {
          orderId: "ord-stale-2",
          orderNumber: "HS-2026-STALE2",
          paymentId: "pay-stale-2",
          providerPaymentId: "pi_prov_123",
          amountMinor: 60000,
          createdAt: new Date(Date.now() - 3600000),
        },
      ];

      // Adapter without fetchPaymentDetails
      const basicAdapter: PaymentGatewayAdapter = {
        providerName: "basic_gateway",
        createPaymentIntent: async () => ({ providerPaymentId: "x", status: "pending" }),
        verifyWebhookSignature: async () => true,
        parseWebhookEvent: async () => ({
          providerEventId: "x",
          eventType: "payment.succeeded",
          providerPaymentId: "x",
          amountMinor: 60000,
          currency: "INR",
          status: "succeeded",
          rawPayloadDigest: "x",
          timestamp: new Date(),
        }),
      };

      const report = await runPaymentReconciliation(basicAdapter, reconStore, {
        staleWindowMinutes: 30,
      });

      expect(report.stalePendingPaymentsChecked).toBe(1);
      expect(report.flaggedForReview).toBe(1);
      expect(reconStore.cancelledOrders.length).toBe(0);
      expect(report.details[0]).toContain("lacks fetchPaymentDetails capability");
    });

    it("fail-closed: provider API failure does not cause false payment cancellation", async () => {
      const reconStore = new InMemoryReconciliationStorage();
      reconStore.stalePayments = [
        {
          orderId: "ord-stale-3",
          orderNumber: "HS-2026-STALE3",
          paymentId: "pay-stale-3",
          providerPaymentId: "pi_prov_err",
          amountMinor: 75000,
          createdAt: new Date(Date.now() - 3600000),
        },
      ];

      mockGateway.fetchDetailsThrows = true;

      const report = await runPaymentReconciliation(mockGateway, reconStore, {
        staleWindowMinutes: 30,
      });

      expect(report.stalePendingPaymentsChecked).toBe(1);
      expect(report.flaggedForReview).toBe(1);
      expect(reconStore.cancelledOrders.length).toBe(0); // Not cancelled!
      expect(report.details[0]).toContain("Failed to query upstream provider");
    });

    it("processes cancellation only when authoritative verified provider reports failed or cancelled", async () => {
      const reconStore = new InMemoryReconciliationStorage();
      reconStore.stalePayments = [
        {
          orderId: "ord-stale-4",
          orderNumber: "HS-2026-STALE4",
          paymentId: "pay-stale-4",
          providerPaymentId: "pi_prov_auth_fail",
          amountMinor: 80000,
          createdAt: new Date(Date.now() - 3600000),
        },
      ];

      mockGateway.fetchDetailsThrows = false;
      mockGateway.fetchDetailsResult = {
        providerPaymentId: "pi_prov_auth_fail",
        amountMinor: 80000,
        currency: "INR",
        status: "cancelled",
      };

      const report = await runPaymentReconciliation(mockGateway, reconStore, {
        staleWindowMinutes: 30,
      });

      expect(report.stalePendingPaymentsChecked).toBe(1);
      expect(report.syncedPayments).toBe(1);
      expect(reconStore.cancelledOrders.length).toBe(1);
      expect(reconStore.cancelledOrders[0]?.orderId).toBe("ord-stale-4");
      expect(reconStore.cancelledOrders[0]?.reason).toContain("Upstream gateway reports payment cancelled");
    });

    it("releases expired stock reservations independently without modifying payment status", async () => {
      const reconStore = new InMemoryReconciliationStorage();
      reconStore.stalePayments = [];
      reconStore.expiredReservationsCount = 4;

      const report = await runPaymentReconciliation(undefined, reconStore, {
        staleWindowMinutes: 30,
      });

      expect(report.expiredReservationsReleased).toBe(4);
      expect(reconStore.cancelledOrders.length).toBe(0);
      expect(report.flaggedForReview).toBe(0);
      expect(report.details[0]).toContain("Released 4 expired stock reservations");
    });

    it("reconciliation execution is safe and idempotent across repeated invocations", async () => {
      const reconStore = new InMemoryReconciliationStorage();
      reconStore.stalePayments = [];
      reconStore.expiredReservationsCount = 2;

      // First run
      const firstRun = await runPaymentReconciliation(mockGateway, reconStore);
      expect(firstRun.expiredReservationsReleased).toBe(2);

      // Second run (no-op since already released)
      const secondRun = await runPaymentReconciliation(mockGateway, reconStore);
      expect(secondRun.expiredReservationsReleased).toBe(0);
      expect(secondRun.stalePendingPaymentsChecked).toBe(0);
      expect(secondRun.flaggedForReview).toBe(0);
    });
  });
});
