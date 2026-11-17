import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { inventory } from "@/lib/db/schema/catalogue";

export interface StockOperationParams {
  productId: string;
  variantId?: string | null;
  quantity: number;
}

export class InsufficientStockError extends Error {
  constructor(message = "INSUFFICIENT_STOCK: Requested quantity exceeds currently available inventory.") {
    super(message);
    this.name = "InsufficientStockError";
  }
}

/**
 * Server-side Inventory Service
 * Enforces atomic conditional updates at the PostgreSQL level.
 * Prevents race conditions and negative inventory under concurrent checkouts.
 */

/**
 * Atomically reserves inventory within an active database transaction.
 * Uses an atomic conditional UPDATE:
 * WHERE (quantity_on_hand - quantity_reserved) >= :quantity
 * If available stock is insufficient, 0 rows are updated and an InsufficientStockError is thrown,
 * triggering an immediate transaction rollback.
 */
export async function reserveStock(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  params: StockOperationParams
): Promise<void> {
  const { productId, variantId, quantity } = params;

  if (quantity <= 0) {
    throw new Error("INVALID_QUANTITY: Reservation quantity must be greater than zero.");
  }

  // Exact matching condition to prevent mixing product-level and variant-level inventory
  const variantCondition = variantId
    ? eq(inventory.variantId, variantId)
    : isNull(inventory.variantId);

  const result = await tx
    .update(inventory)
    .set({
      quantityReserved: sql`${inventory.quantityReserved} + ${quantity}`,
      updatedAt: sql`NOW()`,
    })
    .where(
      and(
        eq(inventory.productId, productId),
        variantCondition,
        // Atomic concurrency check: available stock must be >= requested quantity
        sql`(${inventory.quantityOnHand} - ${inventory.quantityReserved}) >= ${quantity}`
      )
    )
    .returning({
      id: inventory.id,
      quantityOnHand: inventory.quantityOnHand,
      quantityReserved: inventory.quantityReserved,
    });

  if (!result || result.length === 0) {
    throw new InsufficientStockError(
      `INSUFFICIENT_STOCK: Item (product: ${productId}, variant: ${variantId || "none"}) does not have ${quantity} available units.`
    );
  }
}

/**
 * Atomically releases reserved inventory (e.g. on payment expiry, payment failure, or cancellation).
 */
export async function releaseReservedStock(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  params: StockOperationParams
): Promise<void> {
  const { productId, variantId, quantity } = params;
  if (quantity <= 0) return;

  const variantCondition = variantId
    ? eq(inventory.variantId, variantId)
    : isNull(inventory.variantId);

  await tx
    .update(inventory)
    .set({
      quantityReserved: sql`GREATEST(0, ${inventory.quantityReserved} - ${quantity})`,
      updatedAt: sql`NOW()`,
    })
    .where(and(eq(inventory.productId, productId), variantCondition));
}

/**
 * Atomically commits reserved stock upon verified payment and order placement.
 * Decrements quantity_on_hand and releases the matching reservation.
 */
export async function commitReservedStock(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  params: StockOperationParams
): Promise<void> {
  const { productId, variantId, quantity } = params;
  if (quantity <= 0) return;

  const variantCondition = variantId
    ? eq(inventory.variantId, variantId)
    : isNull(inventory.variantId);

  const result = await tx
    .update(inventory)
    .set({
      quantityOnHand: sql`${inventory.quantityOnHand} - ${quantity}`,
      quantityReserved: sql`GREATEST(0, ${inventory.quantityReserved} - ${quantity})`,
      updatedAt: sql`NOW()`,
    })
    .where(
      and(
        eq(inventory.productId, productId),
        variantCondition,
        sql`${inventory.quantityOnHand} >= ${quantity}`
      )
    )
    .returning({
      id: inventory.id,
      quantityOnHand: inventory.quantityOnHand,
    });

  if (!result || result.length === 0) {
    throw new InsufficientStockError(
      `INSUFFICIENT_STOCK: Cannot commit ${quantity} units for product ${productId}. On-hand inventory is insufficient.`
    );
  }
}
