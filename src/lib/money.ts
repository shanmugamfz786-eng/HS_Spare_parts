/**
 * Utility functions for precise monetary calculations.
 * All monetary amounts are handled strictly as integer minor units (e.g. paise in INR, cents in USD)
 * to avoid IEEE 754 floating-point arithmetic errors.
 */

/**
 * Formats integer minor units into a localized currency string.
 * Example: 499900 paise -> "₹4,999.00"
 */
export function formatMoney(
  amountMinor: number,
  currency = "INR",
  locale = "en-IN"
): string {
  const majorUnits = amountMinor / 100;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(majorUnits);
}

/**
 * Converts a major unit (e.g. rupees or dollars) into integer minor units (paise/cents).
 */
export function toMinorUnits(majorAmount: number): number {
  return Math.round(majorAmount * 100);
}

/**
 * Converts integer minor units to floating-point major units for display calculations.
 */
export function toMajorUnits(minorAmount: number): number {
  return minorAmount / 100;
}

/**
 * Calculates a percentage discount on an amount in minor units.
 * Never returns a discount greater than the subtotal.
 */
export function calculatePercentageDiscount(
  subtotalMinor: number,
  percentage: number
): number {
  if (percentage <= 0) return 0;
  if (percentage >= 100) return subtotalMinor;
  return Math.round((subtotalMinor * percentage) / 100);
}

/**
 * Ensures an order or line item total cannot be negative.
 */
export function clampNonNegative(amountMinor: number): number {
  return Math.max(0, Math.round(amountMinor));
}
