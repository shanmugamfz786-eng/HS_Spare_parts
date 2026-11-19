import { describe, it, expect } from "vitest";
import { NAVBAR_CATEGORIES } from "../../src/lib/constants/navigation";
import { DEMO_FEATURED_PRODUCTS } from "../../src/lib/constants/demo-catalog";
import { formatMoney } from "../../src/lib/money";

describe("Storefront UI & Category Navigation Integrity", () => {
  it("should have exactly 9 top-level items in the mandated order", () => {
    const expectedOrder = [
      "Suspension & Steering",
      "Body Parts",
      "HVAC",
      "Engine Parts",
      "Transmission",
      "Brake",
      "Electrical",
      "Accessories",
      "Stock Clearance",
    ];

    expect(NAVBAR_CATEGORIES).toHaveLength(9);
    NAVBAR_CATEGORIES.forEach((cat, idx) => {
      expect(cat.name).toBe(expectedOrder[idx]);
    });
  });

  it("should enforce that Stock Clearance has no external reference navigation and no dropdown", () => {
    const stockClearance = NAVBAR_CATEGORIES.find((c) => c.slug === "stock-clearance");

    expect(stockClearance).toBeDefined();
    expect(stockClearance?.href).not.toContain("motrparts.com");
    expect(stockClearance?.external).toBe(false);
    expect(stockClearance?.isDirectLink).toBe(true);
    expect(stockClearance?.subcategories).toHaveLength(0);
  });

  it("should NOT contain an 'All Categories' item in the navbar list", () => {
    const allCategoriesItem = NAVBAR_CATEGORIES.find(
      (c) => c.name.toLowerCase().includes("all categories")
    );
    expect(allCategoriesItem).toBeUndefined();
  });

  it("should contain the documented subcategories for the main categories", () => {
    const suspension = NAVBAR_CATEGORIES.find((c) => c.slug === "suspension-steering");
    expect(suspension?.subcategories.length).toBeGreaterThanOrEqual(10);
    expect(
      suspension?.subcategories.some((s) => s.name === "Struts and Shock absorbers")
    ).toBe(true);

    const brake = NAVBAR_CATEGORIES.find((c) => c.slug === "brake");
    expect(brake?.subcategories.length).toBeGreaterThanOrEqual(5);
    expect(brake?.subcategories.some((s) => s.name === "Brake Pads")).toBe(true);

    const engine = NAVBAR_CATEGORIES.find((c) => c.slug === "engine-parts");
    expect(engine?.subcategories.length).toBeGreaterThanOrEqual(10);
    expect(engine?.subcategories.some((s) => s.name === "Filters – Air, Oil, Fuel")).toBe(true);
  });

  it("should properly format monetary amounts for demo products in INR minor units", () => {
    expect(DEMO_FEATURED_PRODUCTS.length).toBeGreaterThanOrEqual(8);

    DEMO_FEATURED_PRODUCTS.forEach((prod) => {
      expect(prod.priceMinor).toBeGreaterThan(0);
      const formatted = formatMoney(prod.priceMinor);
      expect(formatted).toContain("₹");
    });
  });
});
