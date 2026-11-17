import { describe, it, expect, vi } from "vitest";
import {
  isStockAvailable,
  getAvailableStock,
  simulateAtomicReservation,
  simulateAtomicRelease,
  simulateAtomicCommit,
  type InventoryState,
} from "../../src/lib/inventory";
import {
  reserveStock,
  releaseReservedStock,
  commitReservedStock,
  InsufficientStockError,
} from "../../src/server/services/inventory-service";

describe("Inventory Concurrency & Oversell Protection", () => {
  describe("Pure Domain Inventory Logic", () => {
    it("should calculate available stock correctly", () => {
      const inventory: InventoryState = { quantityOnHand: 10, quantityReserved: 3 };
      expect(getAvailableStock(inventory)).toBe(7);
      expect(isStockAvailable(inventory, 7)).toBe(true);
      expect(isStockAvailable(inventory, 8)).toBe(false);
    });

    it("should atomically reserve stock and prevent overselling", () => {
      let state: InventoryState = { quantityOnHand: 5, quantityReserved: 0 };

      // Buyer 1 reserves 3 units
      state = simulateAtomicReservation(state, 3);
      expect(state.quantityReserved).toBe(3);
      expect(getAvailableStock(state)).toBe(2);

      // Buyer 2 attempts to reserve 3 units (only 2 left) -> must fail!
      expect(() => simulateAtomicReservation(state, 3)).toThrow("INSUFFICIENT_STOCK");

      // Buyer 3 reserves remaining 2 units -> succeeds
      state = simulateAtomicReservation(state, 2);
      expect(state.quantityReserved).toBe(5);
      expect(getAvailableStock(state)).toBe(0);

      // Any further reservation must fail
      expect(() => simulateAtomicReservation(state, 1)).toThrow("INSUFFICIENT_STOCK");
    });

    it("should release expired reservations back into available inventory", () => {
      let state: InventoryState = { quantityOnHand: 5, quantityReserved: 5 };
      expect(getAvailableStock(state)).toBe(0);

      // Reservation expires or is cancelled
      state = simulateAtomicRelease(state, 2);
      expect(state.quantityReserved).toBe(3);
      expect(getAvailableStock(state)).toBe(2);

      // Remaining 3 reserved units can now be reserved by another buyer
      expect(isStockAvailable(state, 2)).toBe(true);
    });

    it("should commit stock upon successful order placement", () => {
      let state: InventoryState = { quantityOnHand: 10, quantityReserved: 4 };

      // Order fulfilled: 4 units committed
      state = simulateAtomicCommit(state, 4);
      expect(state.quantityOnHand).toBe(6);
      expect(state.quantityReserved).toBe(0);
      expect(getAvailableStock(state)).toBe(6);
    });

    it("should prevent concurrent over-allocation across parallel buyers", () => {
      let inventory: InventoryState = { quantityOnHand: 100, quantityReserved: 0 };
      const orderSizes = [25, 40, 30, 15, 10]; // Sum = 120 (exceeds 100 available)

      const successfulOrders: number[] = [];
      const failedOrders: number[] = [];

      for (const size of orderSizes) {
        try {
          inventory = simulateAtomicReservation(inventory, size);
          successfulOrders.push(size);
        } catch {
          failedOrders.push(size);
        }
      }

      // 25 + 40 + 30 = 95 units reserved. 15 exceeds remaining 5 -> rejected. 10 exceeds remaining 5 -> rejected.
      expect(successfulOrders).toEqual([25, 40, 30]);
      expect(failedOrders).toEqual([15, 10]);
      expect(inventory.quantityReserved).toBe(95);
      expect(inventory.quantityOnHand).toBe(100);
      expect(getAvailableStock(inventory)).toBe(5);
    });
  });

  describe("Server-Side Database Inventory Service (reserveStock, releaseReservedStock, commitReservedStock)", () => {
    it("should execute atomic conditional update and succeed when stock is available", async () => {
      const mockTx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                { id: "inv-1", quantityOnHand: 10, quantityReserved: 3 },
              ]),
            }),
          }),
        }),
      };

      await expect(
        reserveStock(mockTx, {
          productId: "prod-1",
          quantity: 3,
        })
      ).resolves.toBeUndefined();

      expect(mockTx.update).toHaveBeenCalled();
    });

    it("should throw InsufficientStockError when atomic conditional WHERE matches 0 rows", async () => {
      // When (quantity_on_hand - quantity_reserved) < requested_quantity, PostgreSQL updates 0 rows
      const mockTx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]), // 0 rows updated!
            }),
          }),
        }),
      };

      await expect(
        reserveStock(mockTx, {
          productId: "prod-1",
          variantId: "var-1",
          quantity: 5,
        })
      ).rejects.toThrow(InsufficientStockError);
    });

    it("should reject negative or zero reservation quantities", async () => {
      const mockTx = { update: vi.fn() };
      await expect(
        reserveStock(mockTx, {
          productId: "prod-1",
          quantity: 0,
        })
      ).rejects.toThrow("INVALID_QUANTITY");
    });

    it("should commit reserved stock and throw when on-hand inventory is insufficient", async () => {
      const mockTx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]), // 0 rows updated
            }),
          }),
        }),
      };

      await expect(
        commitReservedStock(mockTx, {
          productId: "prod-1",
          quantity: 5,
        })
      ).rejects.toThrow(InsufficientStockError);
    });

    it("should release reserved stock gracefully", async () => {
      const mockTx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };

      await expect(
        releaseReservedStock(mockTx, {
          productId: "prod-1",
          quantity: 2,
        })
      ).resolves.toBeUndefined();
      expect(mockTx.update).toHaveBeenCalled();
    });
  });
});
