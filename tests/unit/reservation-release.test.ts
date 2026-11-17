import { describe, it, expect } from "vitest";

describe("Stock Reservation Expiry & Strict Release Integrity (Phase 6 - Defect A)", () => {
  interface MockReservation {
    id: string;
    orderId: string;
    productId: string;
    variantId: string | null;
    quantity: number;
    expiresAt: Date;
    status: "active" | "committed" | "released" | "expired";
  }

  interface MockInventory {
    productId: string;
    variantId: string | null;
    quantityOnHand: number;
    quantityReserved: number;
  }

  interface MockOrder {
    id: string;
    paymentStatus: string;
    fulfillmentStatus: string;
  }

  interface MockHistory {
    orderId: string;
    oldStatus: string;
    newStatus: string;
    note: string;
  }

  class MockReservationEngine {
    public reservations: MockReservation[] = [];
    public inventory: MockInventory[] = [];
    public orders: MockOrder[] = [];
    public history: MockHistory[] = [];

    public getAvailableStock(productId: string, variantId: string | null = null): number {
      const inv = this.inventory.find(
        (i) => i.productId === productId && (i.variantId ?? null) === (variantId ?? null)
      );
      if (!inv) return 0;
      return Math.max(0, inv.quantityOnHand - inv.quantityReserved);
    }

    public async releaseExpiredReservations(now: Date = new Date()): Promise<{
      releasedCount: number;
      ordersCancelled: number;
    }> {
      // Begin transaction simulation: snapshot state to guarantee full atomic rollback on failure
      const snapshotReservations = this.reservations.map((r) => ({ ...r }));
      const snapshotInventory = this.inventory.map((i) => ({ ...i }));
      const snapshotOrders = this.orders.map((o) => ({ ...o }));
      const snapshotHistory = this.history.map((h) => ({ ...h }));

      try {
        // 1. Find active expired reservations (simulates SELECT ... FOR UPDATE)
        const expired = this.reservations.filter(
          (r) => r.status === "active" && r.expiresAt.getTime() <= now.getTime()
        );

        if (expired.length === 0) {
          return { releasedCount: 0, ordersCancelled: 0 };
        }

        const affectedOrderIds = new Set<string>();

        for (const res of expired) {
          affectedOrderIds.add(res.orderId);

          // 2. Locate exact inventory row using unambiguous product/variant matching
          const matchedInv = this.inventory.filter(
            (i) => i.productId === res.productId && (i.variantId ?? null) === (res.variantId ?? null)
          );

          if (matchedInv.length === 0) {
            throw new Error(
              `INCONSISTENT_INVENTORY: Cannot release reservation ${res.id}. Missing inventory record for product ${res.productId}${res.variantId ? ` (variant: ${res.variantId})` : ""}.`
            );
          }

          if (matchedInv.length > 1) {
            throw new Error(
              `INCONSISTENT_INVENTORY: Cannot release reservation ${res.id}. Multiple inventory records matched product ${res.productId}${res.variantId ? ` (variant: ${res.variantId})` : ""}.`
            );
          }

          const inv = matchedInv[0]!;

          // 3. Strict consistency check: never silently clamp or partially decrement
          if (inv.quantityReserved < res.quantity) {
            throw new Error(
              `INCONSISTENT_INVENTORY: Cannot release reservation ${res.id}. Inventory quantityReserved (${inv.quantityReserved}) is less than reservation quantity (${res.quantity}) for product ${res.productId}.`
            );
          }

          // Exact atomic decrement
          inv.quantityReserved -= res.quantity;

          // Transition reservation status to 'expired' only when decrement succeeds strictly
          res.status = "expired";
        }

        let ordersCancelled = 0;

        // 4. Check affected orders and cancel if unpaid with no active reservations remaining
        for (const orderId of affectedOrderIds) {
          const remainingActive = this.reservations.filter(
            (r) => r.orderId === orderId && r.status === "active"
          );

          if (remainingActive.length === 0) {
            const order = this.orders.find(
              (o) => o.id === orderId && o.paymentStatus === "pending" && o.fulfillmentStatus === "pending"
            );

            if (order) {
              order.fulfillmentStatus = "cancelled";
              ordersCancelled++;
              this.history.push({
                orderId,
                oldStatus: "pending",
                newStatus: "cancelled",
                note: "Order cancelled automatically due to stock reservation expiry without payment.",
              });
            }
          }
        }

        return { releasedCount: expired.length, ordersCancelled };
      } catch (err) {
        // Rollback transaction: restore snapshot completely
        this.reservations = snapshotReservations;
        this.inventory = snapshotInventory;
        this.orders = snapshotOrders;
        this.history = snapshotHistory;
        throw err;
      }
    }
  }

  it("should perform exact decrement and transition reservation to 'expired' on valid expiry", async () => {
    const engine = new MockReservationEngine();
    engine.inventory = [
      { productId: "prod-1", variantId: null, quantityOnHand: 10, quantityReserved: 4 },
    ];
    engine.orders = [{ id: "ord-1", paymentStatus: "pending", fulfillmentStatus: "pending" }];

    const pastDate = new Date(Date.now() - 5 * 60 * 1000);
    engine.reservations = [
      {
        id: "res-1",
        orderId: "ord-1",
        productId: "prod-1",
        variantId: null,
        quantity: 4,
        expiresAt: pastDate,
        status: "active",
      },
    ];

    expect(engine.getAvailableStock("prod-1")).toBe(6);

    const result = await engine.releaseExpiredReservations();

    expect(result.releasedCount).toBe(1);
    expect(result.ordersCancelled).toBe(1);
    expect(engine.inventory[0]!.quantityReserved).toBe(0);
    expect(engine.getAvailableStock("prod-1")).toBe(10);
    expect(engine.reservations[0]!.status).toBe("expired");
    expect(engine.orders[0]!.fulfillmentStatus).toBe("cancelled");
    expect(engine.history).toHaveLength(1);
    expect(engine.history[0]!.newStatus).toBe("cancelled");
  });

  it("should abort transaction and rollback all state when quantityReserved < reservation quantity", async () => {
    const engine = new MockReservationEngine();
    // Inconsistent state: quantityReserved is 2, but reservation quantity is 5
    engine.inventory = [
      { productId: "prod-1", variantId: null, quantityOnHand: 10, quantityReserved: 2 },
    ];
    engine.orders = [{ id: "ord-1", paymentStatus: "pending", fulfillmentStatus: "pending" }];

    const pastDate = new Date(Date.now() - 1000);
    engine.reservations = [
      {
        id: "res-inconsistent",
        orderId: "ord-1",
        productId: "prod-1",
        variantId: null,
        quantity: 5,
        expiresAt: pastDate,
        status: "active",
      },
    ];

    await expect(engine.releaseExpiredReservations()).rejects.toThrowError(
      /INCONSISTENT_INVENTORY.*quantityReserved \(2\) is less than reservation quantity \(5\)/
    );

    // Verify complete rollback: no partial clamping, reservation remains active, order unchanged
    expect(engine.inventory[0]!.quantityReserved).toBe(2);
    expect(engine.reservations[0]!.status).toBe("active");
    expect(engine.orders[0]!.fulfillmentStatus).toBe("pending");
    expect(engine.history).toHaveLength(0);
  });

  it("should abort transaction and rollback when inventory row is missing", async () => {
    const engine = new MockReservationEngine();
    // Inventory table has no row for "prod-missing"
    engine.inventory = [
      { productId: "prod-other", variantId: null, quantityOnHand: 10, quantityReserved: 5 },
    ];
    engine.orders = [{ id: "ord-1", paymentStatus: "pending", fulfillmentStatus: "pending" }];

    const pastDate = new Date(Date.now() - 1000);
    engine.reservations = [
      {
        id: "res-missing-inv",
        orderId: "ord-1",
        productId: "prod-missing",
        variantId: null,
        quantity: 2,
        expiresAt: pastDate,
        status: "active",
      },
    ];

    await expect(engine.releaseExpiredReservations()).rejects.toThrowError(
      /INCONSISTENT_INVENTORY.*Missing inventory record for product prod-missing/
    );

    // Verify complete rollback
    expect(engine.inventory[0]!.quantityReserved).toBe(5);
    expect(engine.reservations[0]!.status).toBe("active");
    expect(engine.orders[0]!.fulfillmentStatus).toBe("pending");
    expect(engine.history).toHaveLength(0);
  });

  it("should prevent double-release on repeated execution", async () => {
    const engine = new MockReservationEngine();
    engine.inventory = [
      { productId: "prod-1", variantId: null, quantityOnHand: 10, quantityReserved: 3 },
    ];
    engine.orders = [{ id: "ord-1", paymentStatus: "pending", fulfillmentStatus: "pending" }];

    const pastDate = new Date(Date.now() - 10000);
    engine.reservations = [
      {
        id: "res-1",
        orderId: "ord-1",
        productId: "prod-1",
        variantId: null,
        quantity: 3,
        expiresAt: pastDate,
        status: "active",
      },
    ];

    // First cleanup run
    const run1 = await engine.releaseExpiredReservations();
    expect(run1.releasedCount).toBe(1);
    expect(engine.inventory[0]!.quantityReserved).toBe(0);

    // Second cleanup run immediately after
    const run2 = await engine.releaseExpiredReservations();
    expect(run2.releasedCount).toBe(0);
    expect(run2.ordersCancelled).toBe(0);
    expect(engine.inventory[0]!.quantityReserved).toBe(0);
  });

  it("should isolate product vs variant inventory reservations", async () => {
    const engine = new MockReservationEngine();
    engine.inventory = [
      { productId: "prod-1", variantId: null, quantityOnHand: 10, quantityReserved: 2 },
      { productId: "prod-1", variantId: "var-heavy-duty", quantityOnHand: 5, quantityReserved: 3 },
    ];
    engine.orders = [{ id: "ord-1", paymentStatus: "pending", fulfillmentStatus: "pending" }];

    const pastDate = new Date(Date.now() - 5000);
    const futureDate = new Date(Date.now() + 60000);

    engine.reservations = [
      {
        id: "res-base",
        orderId: "ord-1",
        productId: "prod-1",
        variantId: null,
        quantity: 2,
        expiresAt: futureDate,
        status: "active",
      },
      {
        id: "res-var",
        orderId: "ord-1",
        productId: "prod-1",
        variantId: "var-heavy-duty",
        quantity: 3,
        expiresAt: pastDate,
        status: "active",
      },
    ];

    const result = await engine.releaseExpiredReservations();

    expect(result.releasedCount).toBe(1);
    // Base product reservation untouched
    expect(engine.inventory[0]!.quantityReserved).toBe(2);
    expect(engine.reservations[0]!.status).toBe("active");
    // Variant reservation released
    expect(engine.inventory[1]!.quantityReserved).toBe(0);
    expect(engine.reservations[1]!.status).toBe("expired");
    // Order not cancelled yet because res-base is still active
    expect(engine.orders[0]!.fulfillmentStatus).toBe("pending");
  });
});
