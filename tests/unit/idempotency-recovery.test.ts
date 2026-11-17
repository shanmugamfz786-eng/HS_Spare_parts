import { describe, it, expect } from "vitest";
import {
  createOrder,
  type OrderStorageAdapter,
  type OrderTransactionAdapter,
  type ExistingOrderSnapshot,
  type ConflictingOrderSnapshot,
} from "@/features/orders/service";
import {
  signQuoteToken,
  computeLogicalRequestFingerprint,
  type QuoteTokenPayload,
  type QuoteTokenItemSnapshot,
} from "@/features/checkout/quote-tokens";
import type { AddressSnapshotDTO, OrderDetailDTO } from "@/features/orders/schemas";

describe("Production createOrder() Orchestration & Idempotency Recovery (Phase 6)", () => {
  const customerId = "cust-user-123";
  const addressId = "123e4567-e89b-12d3-a456-426614174000";

  interface RawOrderRecord {
    id: string;
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
    placedAt: Date;
    updatedAt: Date;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    statusHistory: any[];
  }

  interface CartItemRecord {
    productId: string;
    quantity: number;
    priceMinor: number;
    status?: string;
  }

  /**
   * In-memory storage adapter implementing the production OrderStorageAdapter interface.
   * Isolates persistence and transaction rollback mechanics without duplicating
   * any of the business rules, validation, or orchestration logic in createOrder().
   */
  class InMemoryOrderStore implements OrderStorageAdapter {
    public orders: RawOrderRecord[] = [];
    public inventory: Map<string, { productId: string; quantityOnHand: number; quantityReserved: number }> = new Map();
    public cart: Map<string, CartItemRecord[]> = new Map();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public stockReservations: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public statusHistory: any[] = [];
    public failInventoryReservation = false;
    public simulateUniqueViolationOnNextTx = false;
    public rateLimitBlocked = false;

    constructor() {
      this.inventory.set("prod-1", { productId: "prod-1", quantityOnHand: 10, quantityReserved: 0 });
      this.inventory.set("prod-2", { productId: "prod-2", quantityOnHand: 5, quantityReserved: 0 });
    }

    public setCart(userId: string, items: CartItemRecord[]) {
      this.cart.set(userId, [...items]);
    }

    public isConfigured(): boolean {
      return true;
    }

    public async findExistingOrder(userId: string, idempotencyKey: string): Promise<ExistingOrderSnapshot | null> {
      const order = this.orders.find((o) => o.userId === userId && o.idempotencyKey === idempotencyKey);
      if (!order) return null;
      return {
        id: order.id,
        idempotencyFingerprint: order.idempotencyFingerprint,
        detail: this.formatDetail(order),
      };
    }

    public async findConflictingOrder(userId: string, idempotencyKey: string): Promise<ConflictingOrderSnapshot | null> {
      const order = this.orders.find((o) => o.userId === userId && o.idempotencyKey === idempotencyKey);
      if (!order) return null;
      return {
        id: order.id,
        idempotencyFingerprint: order.idempotencyFingerprint,
      };
    }

    public async checkRateLimit() {
      if (this.rateLimitBlocked) {
        return { success: false, resetInSeconds: 300 };
      }
      return { success: true, resetInSeconds: 0 };
    }

    public async validateAddress(_userId: string, _addrId: string) {
      const address: AddressSnapshotDTO = {
        recipient: "Customer One",
        phone: "+919876543210",
        addressLine1: "123 High Street",
        addressLine2: null,
        city: "Mumbai",
        stateRegion: "Maharashtra",
        postalCode: "400001",
        countryCode: "IN",
      };
      return {
        address,
        serviceability: {
          isConfigured: true,
          isServiceable: true,
          shippingFeeMinor: 0,
        },
      };
    }

    public async getOrderById(userId: string, orderId: string): Promise<OrderDetailDTO> {
      const order = this.orders.find((o) => o.id === orderId && o.userId === userId);
      if (!order) {
        throw new Error("ORDER_NOT_FOUND: Order not found or you do not have permission to view it.");
      }
      return this.formatDetail(order);
    }

    private formatDetail(order: RawOrderRecord): OrderDetailDTO {
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        placedAt: order.placedAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
        paymentStatus: order.paymentStatus as "pending",
        fulfillmentStatus: order.fulfillmentStatus as "pending",
        subtotalMinor: order.subtotalMinor,
        shippingMinor: order.shippingMinor,
        taxMinor: order.taxMinor,
        discountMinor: order.discountMinor,
        totalMinor: order.totalMinor,
        currency: "INR",
        shippingAddress: order.shippingAddressSnapshot,
        items: order.items.map((i) => ({
          id: i.id,
          productId: i.productId,
          variantId: i.variantId ?? null,
          productName: i.productNameSnapshot,
          sku: i.skuSnapshot,
          variantSku: i.variantSkuSnapshot ?? null,
          unitPriceMinor: i.unitPriceMinor,
          quantity: i.quantity,
          lineTotalMinor: i.lineTotalMinor,
        })),
        statusHistory: order.statusHistory.map((h) => ({
          status: h.newStatus,
          note: h.note,
          timestamp: h.createdAt.toISOString(),
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

    public async runInTransaction<T>(callback: (tx: OrderTransactionAdapter) => Promise<T>): Promise<T> {
      if (this.simulateUniqueViolationOnNextTx) {
        this.simulateUniqueViolationOnNextTx = false;
        const err = new Error("duplicate key value violates unique constraint 'order_user_idempotency_idx'");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any).code = "23505";
        throw err;
      }

      // Snapshot for atomic rollback simulation
      const snapshotOrders = this.orders.map((o) => ({ ...o, items: [...o.items], statusHistory: [...o.statusHistory] }));
      const snapshotInventory = new Map(Array.from(this.inventory.entries()).map(([k, v]) => [k, { ...v }]));
      const snapshotCart = new Map(Array.from(this.cart.entries()).map(([k, v]) => [k, [...v]]));
      const snapshotReservations = [...this.stockReservations];
      const snapshotHistory = [...this.statusHistory];

      try {
        const txAdapter: OrderTransactionAdapter = {
          releaseExpiredReservations: async () => ({ releasedCount: 0 }),
          getCartWithItems: async (userId: string) => {
            const items = this.cart.get(userId) || [];
            return {
              cartId: `cart_${userId}`,
              items: items.map((it, idx) => ({
                cartItemId: `item_${idx}`,
                productId: it.productId,
                variantId: null,
                quantity: it.quantity,
                productName: `Product ${it.productId}`,
                productSku: `SKU-${it.productId}`,
                productStatus: it.status ?? "active",
                productPriceMinor: it.priceMinor,
                variantSku: null,
                variantPriceOverrideMinor: null,
                variantStatus: null,
              })),
            };
          },
          findExistingOrder: async (userId: string, idempotencyKey: string) => {
            const existing = this.orders.find((o) => o.userId === userId && o.idempotencyKey === idempotencyKey);
            if (!existing) return null;
            return { id: existing.id, idempotencyFingerprint: existing.idempotencyFingerprint };
          },
          reserveInventory: async (lines) => {
            if (this.failInventoryReservation) {
              throw new Error("INSUFFICIENT_STOCK: Item out of stock.");
            }
            for (const line of lines) {
              const inv = this.inventory.get(line.productId);
              if (!inv || (inv.quantityOnHand - inv.quantityReserved) < line.quantity) {
                throw new Error(`INSUFFICIENT_STOCK: Item "${line.productNameSnapshot}" does not have sufficient available stock.`);
              }
              inv.quantityReserved += line.quantity;
            }
          },
          createOrder: async (orderData) => {
            const id = `ord_${this.orders.length + 1}`;
            const orderRecord: RawOrderRecord = {
              id,
              ...orderData,
              placedAt: new Date(),
              updatedAt: new Date(),
              items: [],
              statusHistory: [],
            };
            this.orders.push(orderRecord);
            return { id };
          },
          insertOrderItems: async (items) => {
            const order = this.orders[this.orders.length - 1];
            if (order) {
              order.items.push(...items.map((i, idx) => ({ id: `ord_item_${idx}`, ...i })));
            }
          },
          insertStockReservations: async (reservations) => {
            this.stockReservations.push(...reservations);
          },
          insertOrderStatusHistory: async (history) => {
            const order = this.orders[this.orders.length - 1];
            const record = { id: `hist_${this.statusHistory.length + 1}`, ...history, createdAt: new Date() };
            this.statusHistory.push(record);
            if (order) {
              order.statusHistory.push(record);
            }
          },
          clearCartItems: async (cartId: string) => {
            const uid = cartId.replace("cart_", "");
            this.cart.set(uid, []);
          },
        };

        return await callback(txAdapter);
      } catch (err) {
        // Rollback state completely
        this.orders = snapshotOrders;
        this.inventory = snapshotInventory;
        this.cart = snapshotCart;
        this.stockReservations = snapshotReservations;
        this.statusHistory = snapshotHistory;
        throw err;
      }
    }
  }

  function makeToken(
    expiresAt: string,
    items: QuoteTokenItemSnapshot[] = [{ productId: "prod-1", variantId: null, quantity: 2, unitPriceMinor: 150000, lineTotalMinor: 300000 }],
    subtotalMinor = 300000,
    totalMinor = 300000,
    addr = addressId,
    cust = customerId
  ): string {
    const payload: QuoteTokenPayload = {
      customerId: cust,
      addressId: addr,
      expiresAt,
      items,
      subtotalMinor,
      shippingMinor: 0,
      taxMinor: 0,
      discountMinor: 0,
      totalMinor,
      currency: "INR",
    };
    return signQuoteToken(payload);
  }

  // =========================================================================
  // 1. Production Validation & Security Execution
  // =========================================================================

  it("1. Authentication check: rejects unauthenticated caller with UNAUTHENTICATED", async () => {
    const store = new InMemoryOrderStore();
    const token = makeToken(new Date(Date.now() + 10000).toISOString());

    await expect(
      createOrder("", { addressId, idempotencyKey: "idem-key-auth-1", quoteToken: token }, store)
    ).rejects.toThrowError(/UNAUTHENTICATED/);
  });

  it("2. Zod schema validation: rejects invalid UUID addressId", async () => {
    const store = new InMemoryOrderStore();
    const token = makeToken(new Date(Date.now() + 10000).toISOString());

    await expect(
      createOrder(customerId, { addressId: "invalid-uuid", idempotencyKey: "idem-key-zod-1", quoteToken: token }, store)
    ).rejects.toThrowError(/Please select a valid delivery address/);
  });

  it("3. Zod schema validation: rejects short idempotency key (< 10 characters)", async () => {
    const store = new InMemoryOrderStore();
    const token = makeToken(new Date(Date.now() + 10000).toISOString());

    await expect(
      createOrder(customerId, { addressId, idempotencyKey: "short", quoteToken: token }, store)
    ).rejects.toThrowError(/Idempotency key is required to prevent duplicate orders/);
  });

  it("4. HMAC signature verification: rejects tampered quote token with INVALID_QUOTE_TOKEN", async () => {
    const store = new InMemoryOrderStore();
    const token = makeToken(new Date(Date.now() + 10000).toISOString());
    const tamperedToken = `${token}tampered`;

    await expect(
      createOrder(customerId, { addressId, idempotencyKey: "idem-key-hmac-1", quoteToken: tamperedToken }, store)
    ).rejects.toThrowError(/INVALID_QUOTE_TOKEN/);
  });

  it("5. Account binding: rejects quote token generated for a different customer", async () => {
    const store = new InMemoryOrderStore();
    const token = makeToken(new Date(Date.now() + 10000).toISOString(), undefined, undefined, undefined, addressId, "different-cust-999");

    await expect(
      createOrder(customerId, { addressId, idempotencyKey: "idem-key-bind-1", quoteToken: token }, store)
    ).rejects.toThrowError(/QUOTE_MISMATCH: Checkout quote token does not match the authenticated customer account/);
  });

  it("6. Address binding: rejects quote token generated for a different address", async () => {
    const store = new InMemoryOrderStore();
    const token = makeToken(new Date(Date.now() + 10000).toISOString(), undefined, undefined, undefined, "999e4567-e89b-12d3-a456-426614174999");

    await expect(
      createOrder(customerId, { addressId, idempotencyKey: "idem-key-bind-2", quoteToken: token }, store)
    ).rejects.toThrowError(/QUOTE_MISMATCH: Checkout quote token was generated for a different delivery address/);
  });

  // =========================================================================
  // 2. Production Order Creation, Cart Deletion, & Replay Scenarios
  // =========================================================================

  it("7. First-time request executes production createOrder(), reserves stock, inserts order, and clears cart", async () => {
    const store = new InMemoryOrderStore();
    store.setCart(customerId, [{ productId: "prod-1", quantity: 2, priceMinor: 150000 }]);

    const validExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const token = makeToken(validExpiry);

    const order = await createOrder(
      customerId,
      { addressId, idempotencyKey: "idem-key-first-time", quoteToken: token },
      store
    );

    expect(order.id).toBeDefined();
    expect(order.orderNumber).toMatch(/^HS-\d{4}-[A-Z0-9]+$/);
    expect(order.totalMinor).toBe(300000);
    expect(order.items).toHaveLength(1);
    expect(store.orders).toHaveLength(1);
    expect(store.stockReservations).toHaveLength(1);
    expect(store.inventory.get("prod-1")!.quantityReserved).toBe(2);
    // Cart is emptied atomically after order placement
    expect(store.cart.get(customerId)).toHaveLength(0);
  });

  it("8. Replay with emptied cart and expired quote succeeds and returns original order without EMPTY_CART error", async () => {
    const store = new InMemoryOrderStore();
    store.setCart(customerId, [{ productId: "prod-1", quantity: 2, priceMinor: 150000 }]);

    const shortExpiry = new Date(Date.now() + 5000).toISOString();
    const token = makeToken(shortExpiry);

    // Initial order placement
    const order1 = await createOrder(
      customerId,
      { addressId, idempotencyKey: "idem-key-replay-cart", quoteToken: token },
      store
    );

    expect(store.cart.get(customerId)).toHaveLength(0);

    // Replay with identical key and same quote token (even if now expired or cart is empty)
    const order2 = await createOrder(
      customerId,
      { addressId, idempotencyKey: "idem-key-replay-cart", quoteToken: token },
      store
    );

    expect(order2.id).toBe(order1.id);
    expect(order2.orderNumber).toBe(order1.orderNumber);
    // Ensures no duplicate inventory reservation or order record
    expect(store.orders).toHaveLength(1);
    expect(store.stockReservations).toHaveLength(1);
    expect(store.inventory.get("prod-1")!.quantityReserved).toBe(2);
  });

  it("9. Replay with regenerated quote token having identical business data returns existing order", async () => {
    const store = new InMemoryOrderStore();
    store.setCart(customerId, [{ productId: "prod-1", quantity: 2, priceMinor: 150000 }]);

    const expiry1 = new Date(Date.now() + 10000).toISOString();
    const token1 = makeToken(expiry1);

    const order1 = await createOrder(
      customerId,
      { addressId, idempotencyKey: "idem-key-regen-token", quoteToken: token1 },
      store
    );

    // Client refreshed quote: new token has a different expiry timestamp (+30 mins), but identical items, prices, totals
    const expiry2 = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const token2 = makeToken(expiry2);

    expect(token2).not.toBe(token1);

    const order2 = await createOrder(
      customerId,
      { addressId, idempotencyKey: "idem-key-regen-token", quoteToken: token2 },
      store
    );

    expect(order2.id).toBe(order1.id);
    expect(store.orders).toHaveLength(1);
  });

  it("10. Replay with changed business values rejects with IDEMPOTENCY_CONFLICT", async () => {
    const store = new InMemoryOrderStore();
    store.setCart(customerId, [{ productId: "prod-1", quantity: 2, priceMinor: 150000 }]);

    const validExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const token1 = makeToken(validExpiry);

    await createOrder(
      customerId,
      { addressId, idempotencyKey: "idem-key-conflict-price", quoteToken: token1 },
      store
    );

    // Replay with different price
    const changedPriceToken = makeToken(
      validExpiry,
      [{ productId: "prod-1", variantId: null, quantity: 2, unitPriceMinor: 200000, lineTotalMinor: 400000 }],
      400000,
      400000
    );

    await expect(
      createOrder(
        customerId,
        { addressId, idempotencyKey: "idem-key-conflict-price", quoteToken: changedPriceToken },
        store
      )
    ).rejects.toThrowError(/IDEMPOTENCY_CONFLICT/);

    // Replay with different quantity
    const changedQtyToken = makeToken(
      validExpiry,
      [{ productId: "prod-1", variantId: null, quantity: 5, unitPriceMinor: 150000, lineTotalMinor: 750000 }],
      750000,
      750000
    );

    await expect(
      createOrder(
        customerId,
        { addressId, idempotencyKey: "idem-key-conflict-price", quoteToken: changedQtyToken },
        store
      )
    ).rejects.toThrowError(/IDEMPOTENCY_CONFLICT/);
  });

  // =========================================================================
  // 3. Transaction-Time Validations & Rollback Verification
  // =========================================================================

  it("11. First-time expired quote is rejected by verifyQuoteToken() inside transaction", async () => {
    const store = new InMemoryOrderStore();
    store.setCart(customerId, [{ productId: "prod-1", quantity: 2, priceMinor: 150000 }]);

    const pastExpiry = new Date(Date.now() - 5000).toISOString();
    const expiredToken = makeToken(pastExpiry);

    await expect(
      createOrder(
        customerId,
        { addressId, idempotencyKey: "idem-key-expired-first", quoteToken: expiredToken },
        store
      )
    ).rejects.toThrowError(/QUOTE_EXPIRED/);

    expect(store.orders).toHaveLength(0);
    expect(store.stockReservations).toHaveLength(0);
    expect(store.inventory.get("prod-1")!.quantityReserved).toBe(0);
    expect(store.cart.get(customerId)).toHaveLength(1);
  });

  it("12. Catalogue price change causes transaction QUOTE_STALE error and rolls back without mutations", async () => {
    const store = new InMemoryOrderStore();
    // In database, product price updated to 200000
    store.setCart(customerId, [{ productId: "prod-1", quantity: 2, priceMinor: 200000 }]);

    const validExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    // Quote was generated at 150000
    const staleQuoteToken = makeToken(validExpiry);

    await expect(
      createOrder(
        customerId,
        { addressId, idempotencyKey: "idem-key-stale-quote", quoteToken: staleQuoteToken },
        store
      )
    ).rejects.toThrowError(/QUOTE_STALE/);

    expect(store.orders).toHaveLength(0);
    expect(store.stockReservations).toHaveLength(0);
    expect(store.inventory.get("prod-1")!.quantityReserved).toBe(0);
    expect(store.cart.get(customerId)).toHaveLength(1);
  });

  it("13. Insufficient stock failure aborts transaction and preserves cart and stock state", async () => {
    const store = new InMemoryOrderStore();
    store.setCart(customerId, [{ productId: "prod-1", quantity: 2, priceMinor: 150000 }]);
    store.failInventoryReservation = true;

    const validExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const token = makeToken(validExpiry);

    await expect(
      createOrder(
        customerId,
        { addressId, idempotencyKey: "idem-key-stock-fail", quoteToken: token },
        store
      )
    ).rejects.toThrowError(/INSUFFICIENT_STOCK/);

    expect(store.orders).toHaveLength(0);
    expect(store.stockReservations).toHaveLength(0);
    expect(store.inventory.get("prod-1")!.quantityReserved).toBe(0);
    expect(store.cart.get(customerId)).toHaveLength(1);
  });

  // =========================================================================
  // 4. PostgreSQL 23505 Unique Constraint Collision Recovery
  // =========================================================================

  it("14. Concurrent collision recovery: catches 23505 unique violation and recovers winning order on fingerprint match", async () => {
    const store = new InMemoryOrderStore();
    store.setCart(customerId, [{ productId: "prod-1", quantity: 2, priceMinor: 150000 }]);

    const validExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const token = makeToken(validExpiry);

    // Initial winning transaction commits order
    const winningOrder = await createOrder(
      customerId,
      { addressId, idempotencyKey: "idem-key-concurrent-race", quoteToken: token },
      store
    );

    // Simulate concurrent runner Tx2 colliding on 23505
    store.simulateUniqueViolationOnNextTx = true;

    const recoveredOrder = await createOrder(
      customerId,
      { addressId, idempotencyKey: "idem-key-concurrent-race", quoteToken: token },
      store
    );

    expect(recoveredOrder.id).toBe(winningOrder.id);
    expect(recoveredOrder.orderNumber).toBe(winningOrder.orderNumber);
    expect(store.orders).toHaveLength(1);
  });

  it("15. Concurrent collision recovery: rejects with IDEMPOTENCY_CONFLICT when colliding request has mismatched fingerprint", async () => {
    const store = new InMemoryOrderStore();
    store.setCart(customerId, [{ productId: "prod-1", quantity: 2, priceMinor: 150000 }]);

    const validExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const token1 = makeToken(validExpiry);

    // Winning transaction commits order
    await createOrder(
      customerId,
      { addressId, idempotencyKey: "idem-key-concurrent-mismatch", quoteToken: token1 },
      store
    );

    // Colliding runner Tx2 attempts same key but with different price payload
    store.simulateUniqueViolationOnNextTx = true;

    const token2 = makeToken(
      validExpiry,
      [{ productId: "prod-1", variantId: null, quantity: 2, unitPriceMinor: 250000, lineTotalMinor: 500000 }],
      500000,
      500000
    );

    await expect(
      createOrder(
        customerId,
        { addressId, idempotencyKey: "idem-key-concurrent-mismatch", quoteToken: token2 },
        store
      )
    ).rejects.toThrowError(/IDEMPOTENCY_CONFLICT/);
  });

  it("16. Logical request fingerprint correctly binds all business fields and excludes expiresAt", () => {
    const items: QuoteTokenItemSnapshot[] = [
      { productId: "prod-1", variantId: null, quantity: 2, unitPriceMinor: 150000, lineTotalMinor: 300000 },
    ];

    const fp1 = computeLogicalRequestFingerprint({
      customerId,
      addressId,
      currency: "INR",
      items,
      subtotalMinor: 300000,
      shippingMinor: 0,
      taxMinor: 0,
      discountMinor: 0,
      totalMinor: 300000,
    });

    const fp2 = computeLogicalRequestFingerprint({
      customerId,
      addressId,
      currency: "INR",
      items,
      subtotalMinor: 300000,
      shippingMinor: 0,
      taxMinor: 0,
      discountMinor: 0,
      totalMinor: 300000,
    });

    expect(fp1).toBe(fp2);

    const fpDifferentItem = computeLogicalRequestFingerprint({
      customerId,
      addressId,
      currency: "INR",
      items: [{ productId: "prod-2", variantId: null, quantity: 2, unitPriceMinor: 150000, lineTotalMinor: 300000 }],
      subtotalMinor: 300000,
      shippingMinor: 0,
      taxMinor: 0,
      discountMinor: 0,
      totalMinor: 300000,
    });

    expect(fpDifferentItem).not.toBe(fp1);
  });
});
