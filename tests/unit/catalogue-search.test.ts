import { describe, it, expect } from "vitest";
import {
  productSearchQuerySchema,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "@/features/catalogue/schemas";
import {
  searchProducts,
  getProductByIdOrSlug,
  checkProductFitment,
} from "@/server/catalogue/catalogue-service";

describe("Catalogue & Search System (Phase 4)", () => {
  // ---------------------------------------------------------------------------
  // 1. Search Validation & Parameter Normalization
  // ---------------------------------------------------------------------------
  describe("Search Query Validation (Zod)", () => {
    it("should sanitize and trim search query strings", () => {
      const parsed = productSearchQuerySchema.parse({
        q: "   brake pads \0\x1F  ",
      });
      expect(parsed.q).toBe("brake pads");
    });

    it("should reject search queries exceeding 100 characters", () => {
      const longQuery = "a".repeat(101);
      expect(() =>
        productSearchQuerySchema.parse({ q: longQuery })
      ).toThrow();
    });

    it("should gracefully handle empty or undefined query parameters", () => {
      const parsed = productSearchQuerySchema.parse({});
      expect(parsed.q).toBeUndefined();
      expect(parsed.page).toBe(1);
      expect(parsed.pageSize).toBe(DEFAULT_PAGE_SIZE);
      expect(parsed.sort).toBe("relevance");
    });

    it("should parse and split comma-separated brand lists into arrays", () => {
      const parsed = productSearchQuerySchema.parse({
        brand: "Bosch, Brembo , Valeo",
      });
      expect(parsed.brand).toEqual(["Bosch", "Brembo", "Valeo"]);
    });

    it("should normalize price inputs and discard negative prices", () => {
      const parsed = productSearchQuerySchema.parse({
        minPrice: "1500",
        maxPrice: "-100",
      });
      expect(parsed.minPrice).toBe(1500);
      expect(parsed.maxPrice).toBeUndefined();
    });

    it("should fallback to default sort when an unrecognized sort option is supplied", () => {
      const parsed = productSearchQuerySchema.parse({
        sort: "invalid_sort_key",
      });
      expect(parsed.sort).toBe("relevance");
    });

    it("should enforce pagination limits: page >= 1 and pageSize <= MAX_PAGE_SIZE", () => {
      const parsed = productSearchQuerySchema.parse({
        page: "0",
        pageSize: "150",
      });
      expect(parsed.page).toBe(1);
      expect(parsed.pageSize).toBe(MAX_PAGE_SIZE);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Search Query Behavior
  // ---------------------------------------------------------------------------
  describe("Search Query Execution", () => {
    it("should find products matching name keyword", async () => {
      const result = await searchProducts({ q: "Brake" });
      expect(result.products.length).toBeGreaterThan(0);
      result.products.forEach((p) => {
        const matches =
          p.name.toLowerCase().includes("brake") ||
          p.categoryName.toLowerCase().includes("brake");
        expect(matches).toBe(true);
      });
    });

    it("should find products by SKU code", async () => {
      const result = await searchProducts({ q: "DEMO-BP-8492" });
      expect(result.products.length).toBe(1);
      expect(result.products[0]?.sku).toBe("DEMO-BP-8492");
    });

    it("should find products by OEM cross-reference", async () => {
      const result = await searchProducts({ q: "55810M68P00" });
      expect(result.products.length).toBeGreaterThan(0);
      expect(result.products[0]?.oemReference).toContain("55810M68P00");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Category & Subcategory Filtering
  // ---------------------------------------------------------------------------
  describe("Category & Subcategory Filtering", () => {
    it("should filter products strictly by category slug", async () => {
      const result = await searchProducts({ category: "brake" });
      expect(result.products.length).toBeGreaterThan(0);
      result.products.forEach((p) => {
        expect(p.categorySlug.toLowerCase()).toContain("brake");
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Brand Filtering
  // ---------------------------------------------------------------------------
  describe("Brand Filtering", () => {
    it("should filter products by a single brand", async () => {
      const result = await searchProducts({ brand: "Bosch" });
      expect(result.products.length).toBeGreaterThan(0);
      result.products.forEach((p) => {
        expect(p.brandName.toLowerCase()).toBe("bosch");
      });
    });

    it("should filter products by multiple brands", async () => {
      const result = await searchProducts({ brand: ["Bosch", "Brembo"] });
      expect(result.products.length).toBeGreaterThan(0);
      result.products.forEach((p) => {
        expect(["bosch", "brembo"]).toContain(p.brandName.toLowerCase());
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Price Filtering
  // ---------------------------------------------------------------------------
  describe("Price Range Filtering", () => {
    it("should filter products by minimum and maximum price bounds in Rupees", async () => {
      const minRupees = 1000;
      const maxRupees = 2500;
      const result = await searchProducts({
        minPrice: minRupees,
        maxPrice: maxRupees,
      });

      expect(result.products.length).toBeGreaterThan(0);
      result.products.forEach((p) => {
        expect(p.priceMinor).toBeGreaterThanOrEqual(minRupees * 100);
        expect(p.priceMinor).toBeLessThanOrEqual(maxRupees * 100);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Combined Filters
  // ---------------------------------------------------------------------------
  describe("Combined Multi-Faceted Filters", () => {
    it("should correctly combine category, brand, and price filters", async () => {
      const result = await searchProducts({
        category: "brake",
        brand: "Brembo",
        minPrice: 2000,
        maxPrice: 3500,
      });

      expect(result.products.length).toBeGreaterThan(0);
      result.products.forEach((p) => {
        expect(p.categorySlug).toBe("brake");
        expect(p.brandName).toBe("Brembo");
        expect(p.priceMinor).toBeGreaterThanOrEqual(2000 * 100);
        expect(p.priceMinor).toBeLessThanOrEqual(3500 * 100);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Vehicle Fitment Matching & Invariants
  // ---------------------------------------------------------------------------
  describe("Vehicle Fitment Matching & Invariants", () => {
    it("should filter products compatible with a specific vehicle make and model", async () => {
      const result = await searchProducts({
        make: "maruti-suzuki",
        model: "swift",
      });

      expect(result.products.length).toBeGreaterThan(0);
      result.products.forEach((p) => {
        const hint = (p.fitmentHint || "").toLowerCase();
        expect(hint.includes("maruti") || hint.includes("swift")).toBe(true);
      });
    });

    it("should never claim compatibility when no fitment record exists", async () => {
      // In the absence of an active database record, checkProductFitment must return incompatible
      const check = await checkProductFitment(
        "non-existent-product-id",
        "non-existent-variant-id"
      );
      expect(check.isCompatible).toBe(false);
      expect(check.status).toBe("incompatible");
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Sorting
  // ---------------------------------------------------------------------------
  describe("Product Sorting", () => {
    it("should sort products by price: low to high", async () => {
      const result = await searchProducts({ sort: "price_asc" });
      expect(result.products.length).toBeGreaterThan(1);
      for (let i = 1; i < result.products.length; i++) {
        const prev = result.products[i - 1]?.priceMinor ?? 0;
        const curr = result.products[i]?.priceMinor ?? 0;
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    });

    it("should sort products by price: high to low", async () => {
      const result = await searchProducts({ sort: "price_desc" });
      expect(result.products.length).toBeGreaterThan(1);
      for (let i = 1; i < result.products.length; i++) {
        const prev = result.products[i - 1]?.priceMinor ?? 0;
        const curr = result.products[i]?.priceMinor ?? 0;
        expect(curr).toBeLessThanOrEqual(prev);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Pagination Boundaries
  // ---------------------------------------------------------------------------
  describe("Pagination Boundaries", () => {
    it("should return the requested page size and calculate page count accurately", async () => {
      const pageSize = 2;
      const result = await searchProducts({ page: 1, pageSize });

      expect(result.products.length).toBe(pageSize);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(pageSize);
      expect(result.totalPages).toBe(Math.ceil(result.totalCount / pageSize));
      expect(result.hasNextPage).toBe(true);
      expect(result.hasPreviousPage).toBe(false);
    });

    it("should return empty products when requested page exceeds totalPages", async () => {
      const result = await searchProducts({ page: 9999, pageSize: 12 });
      expect(result.products.length).toBe(0);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPreviousPage).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Empty Results Handling
  // ---------------------------------------------------------------------------
  describe("Empty Results State", () => {
    it("should return clean empty response for non-matching search term", async () => {
      const result = await searchProducts({
        q: "XYZCompletelyNonExistentPartQuery9999",
      });
      expect(result.products.length).toBe(0);
      expect(result.totalCount).toBe(0);
      expect(result.totalPages).toBe(1);
      expect(result.hasNextPage).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 11. Product Detail Lookup
  // ---------------------------------------------------------------------------
  describe("Product Detail Lookup", () => {
    it("should fetch complete product detail with specifications and fitments by SKU", async () => {
      const product = await getProductByIdOrSlug("DEMO-BP-8492");
      expect(product).not.toBeNull();
      expect(product?.sku).toBe("DEMO-BP-8492");
      expect(product?.specifications.length).toBeGreaterThan(0);
      expect(product?.fitments.length).toBeGreaterThan(0);
    });

    it("should return null for non-existent product", async () => {
      const product = await getProductByIdOrSlug("UNKNOWN-NONEXISTENT-SKU-000");
      expect(product).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 12. Demo Data Labeling Invariants
  // ---------------------------------------------------------------------------
  describe("Demo vs Real Data Labeling Invariant", () => {
    it("should explicitly mark demo catalogue data with isDemo: true", async () => {
      const result = await searchProducts({});
      expect(result.isDemoSource).toBe(true);
      result.products.forEach((p) => {
        expect(p.isDemo).toBe(true);
        expect(p.availableStock).toBeUndefined();
        expect(p.inStock).toBeUndefined();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 13. Database Fallback & Production Guard Invariants
  // ---------------------------------------------------------------------------
  describe("Database Fallback & Production Guards", () => {
    it("should fail closed and not fall back to demo products when DATABASE_URL is configured but connection fails", async () => {
      // Simulate configured DATABASE_URL with failing connection
      const { vi } = await import("vitest");
      vi.stubEnv("DATABASE_URL", "postgres://mockuser:mockpass@localhost:5432/mockdb");

      const result = await searchProducts({});
      expect(result.isDatabaseUnavailable).toBe(true);
      expect(result.products).toHaveLength(0);
      expect(result.isDemoSource).toBe(false);

      vi.unstubAllEnvs();
    });

    it("should never serve demo products in production when database is unconfigured", async () => {
      const { vi } = await import("vitest");
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DATABASE_URL", "");

      const result = await searchProducts({});
      expect(result.products).toHaveLength(0);
      expect(result.isDatabaseUnavailable).toBe(true);
      expect(result.isDemoSource).toBe(false);

      const product = await getProductByIdOrSlug("DEMO-BP-8492");
      expect(product).toBeNull();

      vi.unstubAllEnvs();
    });
  });
});
