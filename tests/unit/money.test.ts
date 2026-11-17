import { describe, it, expect } from "vitest";
import {
  formatMoney,
  toMinorUnits,
  toMajorUnits,
  calculatePercentageDiscount,
  clampNonNegative,
} from "../../src/lib/money";

describe("Monetary Arithmetic (Minor Units / Paise)", () => {
  it("should convert between major and minor units accurately", () => {
    expect(toMinorUnits(1499.5)).toBe(149950); // ₹1,499.50 -> 149950 paise
    expect(toMajorUnits(149950)).toBe(1499.5);
  });

  it("should format minor currency units into INR display format", () => {
    const formatted = formatMoney(499900, "INR", "en-IN");
    // Should format as ₹4,999.00
    expect(formatted).toContain("4,999.00");
  });

  it("should calculate percentage discount accurately in minor units", () => {
    const subtotal = 100000; // ₹1,000 in paise
    const discount = calculatePercentageDiscount(subtotal, 15); // 15% discount
    expect(discount).toBe(15000); // ₹150 in paise

    // Edge cases: 0% and 100%
    expect(calculatePercentageDiscount(subtotal, 0)).toBe(0);
    expect(calculatePercentageDiscount(subtotal, 100)).toBe(subtotal);
  });

  it("should clamp values to non-negative amounts", () => {
    expect(clampNonNegative(5000)).toBe(5000);
    expect(clampNonNegative(-1500)).toBe(0);
  });
});
