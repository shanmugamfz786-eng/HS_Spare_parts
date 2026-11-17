/**
 * Domain rules and atomic patterns for inventory management.
 * Protects against race conditions, stock overselling, and negative inventory under concurrency.
 */

export interface InventoryState {
  quantityOnHand: number;
  quantityReserved: number;
}

/**
 * Pure domain check: returns true if available stock satisfies the requested quantity.
 */
export function isStockAvailable(
  inventory: InventoryState,
  requestedQuantity: number
): boolean {
  if (requestedQuantity <= 0) return false;
  const available = inventory.quantityOnHand - inventory.quantityReserved;
  return available >= requestedQuantity;
}

/**
 * Calculates current purchasable stock (on-hand minus active reservations).
 */
export function getAvailableStock(inventory: InventoryState): number {
  return Math.max(0, inventory.quantityOnHand - inventory.quantityReserved);
}

/**
 * Simulates atomic reservation logic in memory (used for unit verification).
 * Throws INSUFFICIENT_STOCK if requested quantity exceeds available stock.
 */
export function simulateAtomicReservation(
  currentState: InventoryState,
  quantityToReserve: number
): InventoryState {
  if (quantityToReserve <= 0) {
    throw new Error("INVALID_QUANTITY: Quantity to reserve must be greater than zero.");
  }

  const available = currentState.quantityOnHand - currentState.quantityReserved;
  if (available < quantityToReserve) {
    throw new Error("INSUFFICIENT_STOCK: Requested quantity exceeds currently available inventory.");
  }

  return {
    quantityOnHand: currentState.quantityOnHand,
    quantityReserved: currentState.quantityReserved + quantityToReserve,
  };
}

/**
 * Simulates releasing an expired or cancelled reservation back into purchasable stock.
 */
export function simulateAtomicRelease(
  currentState: InventoryState,
  quantityToRelease: number
): InventoryState {
  if (quantityToRelease <= 0) return currentState;

  return {
    quantityOnHand: currentState.quantityOnHand,
    quantityReserved: Math.max(0, currentState.quantityReserved - quantityToRelease),
  };
}

/**
 * Simulates committing a reserved order (fulfilment / payment confirmed):
 * Decrements quantity_on_hand and releases the corresponding reservation.
 */
export function simulateAtomicCommit(
  currentState: InventoryState,
  quantityToCommit: number
): InventoryState {
  if (quantityToCommit <= 0) return currentState;
  if (currentState.quantityOnHand < quantityToCommit) {
    throw new Error("INSUFFICIENT_STOCK: Cannot commit more stock than on-hand.");
  }

  return {
    quantityOnHand: currentState.quantityOnHand - quantityToCommit,
    quantityReserved: Math.max(0, currentState.quantityReserved - quantityToCommit),
  };
}
