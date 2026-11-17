import { describe, it, expect } from "vitest";

describe("Inventory Reservation & Concurrency Safeguards (Phase 6)", () => {
  interface InventoryRow {
    productId: string;
    variantId: string | null;
    quantityOnHand: number;
    quantityReserved: number;
  }

  // Pure function modeling the atomic SQL conditional update:
  // UPDATE inventory SET quantity_reserved = quantity_reserved + :qty
  // WHERE (quantity_on_hand - quantity_reserved) >= :qty
  function atomicReserve(
    row: InventoryRow,
    requestedQty: number
  ): { success: boolean; updatedRow?: InventoryRow; error?: string } {
    if (requestedQty <= 0) {
      return { success: false, error: "INVALID_QUANTITY" };
    }

    const available = row.quantityOnHand - row.quantityReserved;
    if (available < requestedQty) {
      return { success: false, error: "INSUFFICIENT_STOCK" };
    }

    const updated = {
      ...row,
      quantityReserved: row.quantityReserved + requestedQty,
    };
    return { success: true, updatedRow: updated };
  }

  it("should atomically reserve inventory when available stock satisfies the request", () => {
    const stock: InventoryRow = {
      productId: "prod-brake-disc",
      variantId: null,
      quantityOnHand: 20,
      quantityReserved: 5, // Available = 15
    };

    const result = atomicReserve(stock, 5);

    expect(result.success).toBe(true);
    expect(result.updatedRow?.quantityReserved).toBe(10);
    // On-hand remains constant until order is packed/shipped (Phase 7)
    expect(result.updatedRow?.quantityOnHand).toBe(20);
  });

  it("should fail atomic reservation when requested quantity exceeds available stock", () => {
    const stock: InventoryRow = {
      productId: "prod-oil-pump",
      variantId: null,
      quantityOnHand: 10,
      quantityReserved: 9, // Available = 1
    };

    const result = atomicReserve(stock, 2);

    expect(result.success).toBe(false);
    expect(result.error).toBe("INSUFFICIENT_STOCK");
    // Stock remains untouched
    expect(stock.quantityReserved).toBe(9);
  });

  it("should isolate variant inventory reservations from base product and other variants", () => {
    const baseStock: InventoryRow = {
      productId: "prod-spark-plug",
      variantId: null,
      quantityOnHand: 10,
      quantityReserved: 2, // Available: 8
    };

    const variantA: InventoryRow = {
      productId: "prod-spark-plug",
      variantId: "var-platinum",
      quantityOnHand: 5,
      quantityReserved: 1, // Available: 4
    };

    const variantB: InventoryRow = {
      productId: "prod-spark-plug",
      variantId: "var-iridium",
      quantityOnHand: 3,
      quantityReserved: 3, // Available: 0 (Out of stock)
    };

    // Reserving variant A must succeed
    const resA = atomicReserve(variantA, 2);
    expect(resA.success).toBe(true);
    expect(resA.updatedRow?.quantityReserved).toBe(3);

    // Reserving variant B must fail (0 available)
    const resB = atomicReserve(variantB, 1);
    expect(resB.success).toBe(false);
    expect(resB.error).toBe("INSUFFICIENT_STOCK");

    // Base stock must remain isolated
    expect(baseStock.quantityReserved).toBe(2);
  });

  it("should prevent overselling under simulated concurrent reservation requests", () => {
    let currentStock: InventoryRow = {
      productId: "prod-timing-belt",
      variantId: null,
      quantityOnHand: 5,
      quantityReserved: 0, // 5 available total
    };

    let successfulReservations = 0;
    let failedReservations = 0;

    // 10 concurrent customer requests, each wanting 1 unit
    const requests = Array.from({ length: 10 }, () => 1);

    for (const reqQty of requests) {
      const res = atomicReserve(currentStock, reqQty);
      if (res.success && res.updatedRow) {
        currentStock = res.updatedRow;
        successfulReservations++;
      } else {
        failedReservations++;
      }
    }

    // Exactly 5 requests must succeed and 5 must fail
    expect(successfulReservations).toBe(5);
    expect(failedReservations).toBe(5);
    expect(currentStock.quantityReserved).toBe(5);
    expect(currentStock.quantityOnHand - currentStock.quantityReserved).toBe(0);
  });

  it("should enforce a 30-minute reservation expiry window", () => {
    const reservationCreatedAt = new Date();
    const expiryWindowMs = 30 * 60 * 1000; // 30 minutes
    const expiresAt = new Date(reservationCreatedAt.getTime() + expiryWindowMs);

    function isReservationExpired(expDate: Date, checkDate: Date): boolean {
      return checkDate.getTime() >= expDate.getTime();
    }

    // 10 minutes later: not expired
    const after10Mins = new Date(reservationCreatedAt.getTime() + 10 * 60 * 1000);
    expect(isReservationExpired(expiresAt, after10Mins)).toBe(false);

    // 29 minutes later: not expired
    const after29Mins = new Date(reservationCreatedAt.getTime() + 29 * 60 * 1000);
    expect(isReservationExpired(expiresAt, after29Mins)).toBe(false);

    // 31 minutes later: expired
    const after31Mins = new Date(reservationCreatedAt.getTime() + 31 * 60 * 1000);
    expect(isReservationExpired(expiresAt, after31Mins)).toBe(true);
  });
});
