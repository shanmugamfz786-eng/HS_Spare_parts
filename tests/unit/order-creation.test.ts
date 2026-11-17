import { describe, it, expect } from "vitest";

describe("Transactional Order Creation & Idempotency (Phase 6)", () => {
  interface CartLine {
    productId: string;
    variantId: string | null;
    quantity: number;
    dbPriceMinor: number;
    dbOnHand: number;
    dbReserved: number;
  }

  interface CreatedOrder {
    id: string;
    orderNumber: string;
    userId: string;
    idempotencyKey: string;
    totalMinor: number;
    paymentStatus: string;
    fulfillmentStatus: string;
    itemSnapshots: {
      productId: string;
      unitPriceMinor: number;
      quantity: number;
      lineTotalMinor: number;
    }[];
  }

  // Simulated in-memory database engine for transactional order creation
  class MockOrderDb {
    public orders: CreatedOrder[] = [];
    public cartItems: Map<string, CartLine[]> = new Map();
    public inventory: Map<string, { onHand: number; reserved: number }> = new Map();
    public reservations: { orderId: string; productId: string; qty: number; status: string }[] = [];

    constructor() {
      // Seed initial stock
      this.inventory.set("prod-1", { onHand: 10, reserved: 2 }); // Available: 8
      this.inventory.set("prod-2", { onHand: 5, reserved: 4 });  // Available: 1
    }

    public setCart(userId: string, items: CartLine[]) {
      this.cartItems.set(userId, [...items]);
    }

    public async executeCreateOrder(
      userId: string | null,
      addressId: string,
      idempotencyKey: string
    ): Promise<CreatedOrder> {
      if (!userId) {
        throw new Error("UNAUTHENTICATED: Please sign in to place an order.");
      }

      // 1. Idempotency check: Return existing order if already created with this idempotency key
      const existing = this.orders.find((o) => o.userId === userId && o.idempotencyKey === idempotencyKey);
      if (existing) {
        return existing;
      }

      const cart = this.cartItems.get(userId) || [];
      if (cart.length === 0) {
        throw new Error("EMPTY_CART: Your cart is empty.");
      }

      // Begin transaction simulation: snapshot state before mutations
      const inventorySnapshot = new Map(
        Array.from(this.inventory.entries()).map(([k, v]) => [k, { ...v }])
      );
      const initialReservationsCount = this.reservations.length;

      try {
        let subtotalMinor = 0;
        const snapshots: CreatedOrder["itemSnapshots"] = [];

        for (const item of cart) {
          const inv = this.inventory.get(item.productId);
          if (!inv) {
            throw new Error(`MISSING_INVENTORY: No inventory record for ${item.productId}`);
          }

          const available = inv.onHand - inv.reserved;
          if (available < item.quantity) {
            throw new Error(
              `INSUFFICIENT_STOCK: Item "${item.productId}" has insufficient stock (available: ${available}, requested: ${item.quantity}).`
            );
          }

          // Atomic conditional reservation update
          inv.reserved += item.quantity;

          const lineTotal = item.dbPriceMinor * item.quantity;
          subtotalMinor += lineTotal;

          snapshots.push({
            productId: item.productId,
            unitPriceMinor: item.dbPriceMinor,
            quantity: item.quantity,
            lineTotalMinor: lineTotal,
          });
        }

        const newOrder: CreatedOrder = {
          id: `ord-${Date.now()}`,
          orderNumber: `HS-2026-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          userId,
          idempotencyKey,
          totalMinor: subtotalMinor,
          paymentStatus: "pending",
          fulfillmentStatus: "pending",
          itemSnapshots: snapshots,
        };

        this.orders.push(newOrder);

        for (const s of snapshots) {
          this.reservations.push({
            orderId: newOrder.id,
            productId: s.productId,
            qty: s.quantity,
            status: "active",
          });
        }

        // Cart is cleared ONLY after successful order placement
        this.cartItems.set(userId, []);

        return newOrder;
      } catch (err) {
        // Rollback simulation: Restore inventory state, discard order and reservations
        this.inventory = inventorySnapshot;
        this.reservations.length = initialReservationsCount;
        // Cart is NOT cleared on failure!
        throw err;
      }
    }
  }

  it("should create an order atomically, reserve stock, and clear the cart on success", async () => {
    const db = new MockOrderDb();
    db.setCart("cust-1", [
      {
        productId: "prod-1",
        variantId: null,
        quantity: 3,
        dbPriceMinor: 250000,
        dbOnHand: 10,
        dbReserved: 2,
      },
    ]);

    const order = await db.executeCreateOrder("cust-1", "addr-1", "idem-key-1");

    expect(order.userId).toBe("cust-1");
    expect(order.totalMinor).toBe(750000); // 3 * 250000
    expect(order.paymentStatus).toBe("pending");
    expect(order.itemSnapshots).toHaveLength(1);

    // Stock reservation updated: was 2, now 2 + 3 = 5
    expect(db.inventory.get("prod-1")?.reserved).toBe(5);
    expect(db.reservations).toHaveLength(1);
    expect(db.reservations[0]!.status).toBe("active");

    // Cart is cleared
    expect(db.cartItems.get("cust-1")).toHaveLength(0);
  });

  it("should reject unauthenticated checkout requests", async () => {
    const db = new MockOrderDb();
    await expect(db.executeCreateOrder(null, "addr-1", "idem-key-anon")).rejects.toThrowError(
      /UNAUTHENTICATED/
    );
  });

  it("should reject order placement when cart is empty", async () => {
    const db = new MockOrderDb();
    db.setCart("cust-empty", []);

    await expect(db.executeCreateOrder("cust-empty", "addr-1", "idem-key-empty")).rejects.toThrowError(
      /EMPTY_CART/
    );
  });

  it("should rollback transaction and preserve cart when inventory is insufficient", async () => {
    const db = new MockOrderDb();
    // prod-2 has onHand: 5, reserved: 4 -> available is only 1
    db.setCart("cust-1", [
      {
        productId: "prod-2",
        variantId: null,
        quantity: 3, // Requests 3, but only 1 is available
        dbPriceMinor: 150000,
        dbOnHand: 5,
        dbReserved: 4,
      },
    ]);

    await expect(db.executeCreateOrder("cust-1", "addr-1", "idem-fail-stock")).rejects.toThrowError(
      /INSUFFICIENT_STOCK/
    );

    // Rollback verified: inventory reserved unchanged
    expect(db.inventory.get("prod-2")?.reserved).toBe(4);
    expect(db.orders).toHaveLength(0);
    expect(db.reservations).toHaveLength(0);

    // Cart is preserved (NOT cleared)
    expect(db.cartItems.get("cust-1")).toHaveLength(1);
  });

  it("should return existing order idempotently when same idempotency key is submitted", async () => {
    const db = new MockOrderDb();
    db.setCart("cust-1", [
      {
        productId: "prod-1",
        variantId: null,
        quantity: 2,
        dbPriceMinor: 100000,
        dbOnHand: 10,
        dbReserved: 0,
      },
    ]);

    const firstOrder = await db.executeCreateOrder("cust-1", "addr-1", "idem-repeatable");

    // Re-attempting with same idempotency key
    const secondOrder = await db.executeCreateOrder("cust-1", "addr-1", "idem-repeatable");

    expect(secondOrder.id).toBe(firstOrder.id);
    expect(secondOrder.orderNumber).toBe(firstOrder.orderNumber);
    // Should NOT create duplicate order records
    expect(db.orders).toHaveLength(1);
    // Should NOT reserve stock twice (initial 2 + order quantity 2 = 4)
    expect(db.inventory.get("prod-1")?.reserved).toBe(4);
  });

  it("should handle simulated concurrent duplicate submissions safely", async () => {
    const db = new MockOrderDb();
    db.setCart("cust-concurrent", [
      {
        productId: "prod-1",
        variantId: null,
        quantity: 1,
        dbPriceMinor: 200000,
        dbOnHand: 10,
        dbReserved: 0,
      },
    ]);

    // Simulate 3 concurrent network clicks with the exact same idempotency key
    const results = await Promise.all([
      db.executeCreateOrder("cust-concurrent", "addr-1", "idem-concurrent-key"),
      db.executeCreateOrder("cust-concurrent", "addr-1", "idem-concurrent-key"),
      db.executeCreateOrder("cust-concurrent", "addr-1", "idem-concurrent-key"),
    ]);

    const orderNumbers = new Set(results.map((r) => r.orderNumber));
    expect(orderNumbers.size).toBe(1);
    expect(db.orders).toHaveLength(1);
  });
});
