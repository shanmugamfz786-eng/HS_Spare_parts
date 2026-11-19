import "server-only";
import { eq, and, lt, sql, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  orders,
  payments,
  stockReservations,
  inventory,
  orderStatusHistory,
} from "@/lib/db/schema";
import type { PaymentGatewayAdapter, PaymentDetailsResult } from "./types";

export interface ReconciliationReport {
  timestamp: string;
  stalePendingPaymentsChecked: number;
  expiredReservationsReleased: number;
  syncedPayments: number;
  flaggedForReview: number;
  details: string[];
}

export interface StalePendingPaymentRecord {
  orderId: string;
  orderNumber: string;
  paymentId: string;
  providerPaymentId: string | null;
  amountMinor: number;
  createdAt: Date;
}

export interface ReconciliationStorageAdapter {
  isConfigured(): boolean;
  findStalePendingPayments(olderThanMinutes: number): Promise<StalePendingPaymentRecord[]>;
  releaseExpiredReservations(): Promise<number>;
  markPaymentCancelled(orderId: string, paymentId: string, reason: string): Promise<void>;
}

function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

export const defaultDrizzleReconciliationStore: ReconciliationStorageAdapter = {
  isConfigured(): boolean {
    return isDatabaseConfigured() && Boolean(getDb());
  },

  async findStalePendingPayments(olderThanMinutes: number): Promise<StalePendingPaymentRecord[]> {
    const db = getDb();
    if (!db) return [];

    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

    const rows = await db
      .select({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        paymentId: payments.id,
        providerPaymentId: payments.providerPaymentId,
        amountMinor: payments.amountMinor,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .where(
        and(
          eq(payments.status, "pending"),
          eq(orders.paymentStatus, "pending"),
          lt(payments.createdAt, cutoff)
        )
      );

    return rows;
  },

  async releaseExpiredReservations(): Promise<number> {
    const db = getDb();
    if (!db) return 0;

    const now = new Date();

    return await db.transaction(async (tx) => {
      // Find active reservations that have expired
      const expiredList = await tx.query.stockReservations.findMany({
        where: and(
          eq(stockReservations.status, "active"),
          lt(stockReservations.expiresAt, now)
        ),
      });

      if (expiredList.length === 0) return 0;

      // Mark reservations as expired
      const ids = expiredList.map((r) => r.id);
      await tx
        .update(stockReservations)
        .set({ status: "expired" })
        .where(inArray(stockReservations.id, ids));

      // Decrement quantityReserved on inventory
      for (const res of expiredList) {
        await tx
          .update(inventory)
          .set({
            quantityReserved: sql`GREATEST(0, ${inventory.quantityReserved} - ${res.quantity})`,
            updatedAt: new Date(),
          })
          .where(eq(inventory.productId, res.productId));
      }

      return expiredList.length;
    });
  },

  async markPaymentCancelled(
    orderId: string,
    paymentId: string,
    reason: string
  ): Promise<void> {
    const db = getDb();
    if (!db) return;

    await db.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({ status: "cancelled" })
        .where(eq(payments.id, paymentId));

      await tx
        .update(orders)
        .set({ paymentStatus: "cancelled", fulfillmentStatus: "cancelled", updatedAt: new Date() })
        .where(eq(orders.id, orderId));

      await tx.insert(orderStatusHistory).values({
        orderId,
        oldStatus: "pending",
        newStatus: "cancelled",
        note: `Cancelled by reconciliation worker. Reason: ${reason}`,
      });
    });
  },
};

/**
 * Reconciles pending payments and expired reservations.
 */
export async function runPaymentReconciliation(
  adapter?: PaymentGatewayAdapter,
  storage: ReconciliationStorageAdapter = defaultDrizzleReconciliationStore,
  options?: { staleWindowMinutes?: number }
): Promise<ReconciliationReport> {
  const staleWindowMinutes = options?.staleWindowMinutes ?? 30;
  const details: string[] = [];
  let syncedPayments = 0;
  let flaggedForReview = 0;

  // 1. Release expired inventory reservations
  const expiredReleased = await storage.releaseExpiredReservations();
  if (expiredReleased > 0) {
    details.push(`Released ${expiredReleased} expired stock reservations back to inventory.`);
  }

  // 2. Scan stale pending payments
  const stalePayments = await storage.findStalePendingPayments(staleWindowMinutes);

  for (const item of stalePayments) {
    if (adapter && adapter.fetchPaymentDetails && item.providerPaymentId) {
      try {
        const detailsResult: PaymentDetailsResult = await adapter.fetchPaymentDetails(
          item.providerPaymentId
        );

        if (detailsResult.status === "succeeded") {
          details.push(
            `Order ${item.orderNumber}: Provider reports payment succeeded. Reconciling payment.`
          );
          syncedPayments++;
        } else if (detailsResult.status === "failed" || detailsResult.status === "cancelled") {
          await storage.markPaymentCancelled(
            item.orderId,
            item.paymentId,
            `Upstream gateway reports payment ${detailsResult.status}.`
          );
          details.push(
            `Order ${item.orderNumber}: Marked cancelled following authoritative upstream ${detailsResult.status} confirmation.`
          );
          syncedPayments++;
        } else {
          flaggedForReview++;
          details.push(
            `Order ${item.orderNumber}: Provider reports payment status as '${detailsResult.status}'. Flagged for manual review.`
          );
        }
      } catch (err: unknown) {
        flaggedForReview++;
        const message = err instanceof Error ? err.message : "Unknown error";
        details.push(
          `Order ${item.orderNumber}: Failed to query upstream provider (${message}). Flagged for manual review.`
        );
      }
    } else {
      // Fail-closed: Never declare payment failed or cancelled based solely on elapsed time without verified provider evidence
      flaggedForReview++;
      const reason = !adapter
        ? "no active payment provider adapter configured"
        : !adapter.fetchPaymentDetails
        ? `provider adapter '${adapter.providerName}' lacks fetchPaymentDetails capability`
        : "missing provider payment identifier";
      details.push(
        `Order ${item.orderNumber}: Pending payment timeout exceeded (${staleWindowMinutes}m), but cannot verify status (${reason}). Flagged for manual review.`
      );
    }
  }

  return {
    timestamp: new Date().toISOString(),
    stalePendingPaymentsChecked: stalePayments.length,
    expiredReservationsReleased: expiredReleased,
    syncedPayments,
    flaggedForReview,
    details,
  };
}
