/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";
import { eq, and, sql, isNull } from "drizzle-orm";
import { orders, orderStatusHistory, stockReservations, inventory } from "@/lib/db/schema";

export interface ReservationReleaseResult {
  releasedCount: number;
  ordersCancelled: number;
}

/**
 * Transaction-safe cleanup of expired active stock reservations.
 * Atomically reclaims reserved quantities in the inventory table,
 * transitions reservation status to 'expired', and cancels unpaid orders
 * whose reservations have expired.
 */
export async function releaseExpiredReservations(
  txOrDb: any
): Promise<ReservationReleaseResult> {
  const runner =
    typeof txOrDb.transaction === "function"
      ? async (cb: (tx: any) => Promise<ReservationReleaseResult>) => txOrDb.transaction(cb)
      : async (cb: (tx: any) => Promise<ReservationReleaseResult>) => cb(txOrDb);

  return runner(async (tx: any) => {
    // 1. Lock and claim expired active reservations
    const expiredReservations = await tx
      .select()
      .from(stockReservations)
      .where(and(eq(stockReservations.status, "active"), sql`${stockReservations.expiresAt} <= NOW()`))
      .for("update");

    if (!expiredReservations || expiredReservations.length === 0) {
      return { releasedCount: 0, ordersCancelled: 0 };
    }

    const affectedOrderIds = new Set<string>();

    for (const res of expiredReservations) {
      affectedOrderIds.add(res.orderId);

      // 1. Locate and lock the exact inventory row using unambiguous product/variant match
      const invCondition = res.variantId
        ? and(eq(inventory.productId, res.productId), eq(inventory.variantId, res.variantId))
        : and(eq(inventory.productId, res.productId), isNull(inventory.variantId));

      const invRows = await tx
        .select({
          id: inventory.id,
          quantityReserved: inventory.quantityReserved,
          quantityOnHand: inventory.quantityOnHand,
        })
        .from(inventory)
        .where(invCondition)
        .for("update");

      if (!invRows || invRows.length === 0) {
        throw new Error(
          `INCONSISTENT_INVENTORY: Cannot release reservation ${res.id}. Missing inventory record for product ${res.productId}${res.variantId ? ` (variant: ${res.variantId})` : ""}.`
        );
      }

      if (invRows.length > 1) {
        throw new Error(
          `INCONSISTENT_INVENTORY: Cannot release reservation ${res.id}. Multiple inventory records matched product ${res.productId}${res.variantId ? ` (variant: ${res.variantId})` : ""}.`
        );
      }

      const invRecord = invRows[0]!;

      // 2. Strict consistency check: never silently clamp or partially decrement
      if (invRecord.quantityReserved < res.quantity) {
        throw new Error(
          `INCONSISTENT_INVENTORY: Cannot release reservation ${res.id}. Inventory quantityReserved (${invRecord.quantityReserved}) is less than reservation quantity (${res.quantity}) for product ${res.productId}.`
        );
      }

      // 3. Atomically decrement quantityReserved strictly where quantityReserved >= res.quantity
      const updated = await tx
        .update(inventory)
        .set({
          quantityReserved: sql`${inventory.quantityReserved} - ${res.quantity}`,
          updatedAt: sql`NOW()`,
        })
        .where(
          and(
            eq(inventory.id, invRecord.id),
            sql`${inventory.quantityReserved} >= ${res.quantity}`
          )
        )
        .returning({ id: inventory.id });

      if (!updated || updated.length !== 1) {
        throw new Error(
          `INCONSISTENT_INVENTORY: Concurrent mutation or inconsistent quantity when releasing reservation ${res.id}. Expected 1 updated row, got ${updated ? updated.length : 0}.`
        );
      }

      // 4. Transition reservation status to 'expired' only when inventory decrement succeeded strictly
      await tx
        .update(stockReservations)
        .set({
          status: "expired",
        })
        .where(eq(stockReservations.id, res.id));
    }

    let ordersCancelled = 0;

    // 2. Safely cancel unpaid orders whose reservations have all expired
    for (const orderId of affectedOrderIds) {
      const remainingActive = await tx
        .select({ id: stockReservations.id })
        .from(stockReservations)
        .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, "active")));

      if (!remainingActive || remainingActive.length === 0) {
        const cancelled = await tx
          .update(orders)
          .set({
            fulfillmentStatus: "cancelled",
            updatedAt: sql`NOW()`,
          })
          .where(
            and(
              eq(orders.id, orderId),
              eq(orders.paymentStatus, "pending"),
              eq(orders.fulfillmentStatus, "pending")
            )
          )
          .returning({ id: orders.id });

        if (cancelled && cancelled.length > 0) {
          ordersCancelled++;
          await tx.insert(orderStatusHistory).values({
            orderId,
            oldStatus: "pending",
            newStatus: "cancelled",
            actorUserId: null,
            note: "Order cancelled automatically due to stock reservation expiry without payment.",
          });
        }
      }
    }

    return { releasedCount: expiredReservations.length, ordersCancelled };
  });
}
