import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getStorefrontCategories,
  getStorefrontBrands,
  getStorefrontBanners,
} from "@/server/catalogue/storefront-service";
import {
  setInMemoryCategory,
  setInMemoryBrand,
  setInMemoryBanners,
  resetInMemoryDemoState,
  getInMemoryCategoryById,
  getInMemoryBrandById,
} from "@/server/catalogue/demo-state";

// Mock the database layer to test database failure, mock rows, and production invariants
let mockDbInstance: unknown = null;
vi.mock("@/lib/db", () => ({
  getDb: () => mockDbInstance,
}));

describe("Cloudinary Phase C3.1: Storefront Data-Wiring & Safe Fallback Invariants", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetInMemoryDemoState();
    mockDbInstance = null;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetInMemoryDemoState();
  });

  // ============================================================================
  // 1. Storefront Categories Retrieval
  // ============================================================================
  describe("getStorefrontCategories", () => {
    it("returns public category fields (name, slug, imageUrl) and excludes admin metadata", async () => {
      const cats = await getStorefrontCategories();
      expect(cats.length).toBeGreaterThan(0);
      const cat = cats[0]!;
      expect(cat).toHaveProperty("name");
      expect(cat).toHaveProperty("slug");
      expect(cat).toHaveProperty("imageUrl");
      expect(cat).not.toHaveProperty("storageKey");
      expect(cat).not.toHaveProperty("uploadReceipt");
      expect(cat).not.toHaveProperty("status");
    });

    it("reflects custom configured Cloudinary image URLs from persistence state", async () => {
      const existing = getInMemoryCategoryById("cat-1");
      if (existing) {
        setInMemoryCategory("cat-1", {
          ...existing,
          imageUrl: "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/categories/cat_suspension_test.webp",
          storageKey: "hs-spare-parts/categories/cat_suspension_test",
        });
      }

      const cats = await getStorefrontCategories();
      const updatedCat = cats.find((c) => c.slug === "suspension-steering");
      expect(updatedCat).toBeDefined();
      expect(updatedCat?.imageUrl).toBe(
        "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/categories/cat_suspension_test.webp"
      );
    });

    it("preserves null imageUrl when category image is unconfigured", async () => {
      const cats = await getStorefrontCategories();
      const brakeCat = cats.find((c) => c.slug === "brake-system" || c.slug === "brake");
      expect(brakeCat).toBeDefined();
      expect(brakeCat?.imageUrl).toBeNull();
    });
  });

  // ============================================================================
  // 2. Storefront Brands Retrieval
  // ============================================================================
  describe("getStorefrontBrands", () => {
    it("returns public brand fields (name, queryParam, logoUrl)", async () => {
      const brands = await getStorefrontBrands();
      expect(brands.length).toBeGreaterThan(0);
      const brand = brands[0]!;
      expect(brand).toHaveProperty("name");
      expect(brand).toHaveProperty("queryParam");
      expect(brand).toHaveProperty("logoUrl");
      expect(brand).not.toHaveProperty("storageKey");
      expect(brand).not.toHaveProperty("status");
    });

    it("reflects custom configured Cloudinary brand logos from persistence state", async () => {
      const existing = getInMemoryBrandById("brand-1");
      if (existing) {
        setInMemoryBrand("brand-1", {
          ...existing,
          logoUrl: "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/brands/brand_maruti_test.png",
          storageKey: "hs-spare-parts/brands/brand_maruti_test",
        });
      }

      const brands = await getStorefrontBrands();
      const maruti = brands.find((b) => b.name.includes("Maruti"));
      expect(maruti).toBeDefined();
      expect(maruti?.logoUrl).toBe(
        "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/brands/brand_maruti_test.png"
      );
    });

    it("preserves null logoUrl when brand logo is unconfigured", async () => {
      const brands = await getStorefrontBrands();
      const hyundai = brands.find((b) => b.name.includes("Hyundai") || b.name === "Bosch");
      expect(hyundai).toBeDefined();
      expect(hyundai?.logoUrl).toBeNull();
    });
  });

  // ============================================================================
  // 3. Storefront Banners Retrieval, Active Filter & Normalization
  // ============================================================================
  describe("getStorefrontBanners", () => {
    it("strictly filters out inactive banners (isActive === false)", async () => {
      setInMemoryBanners([
        {
          id: "banner-active-1",
          title: "Active Campaign Banner",
          subtitle: "Discount on brakes",
          desktopImageUrl: "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/banners/banner_active.webp",
          desktopStorageKey: "hs-spare-parts/banners/banner_active",
          mobileImageUrl: null,
          mobileStorageKey: null,
          altText: "Active campaign banner alt text",
          linkUrl: "/categories/brake",
          sortOrder: 1,
          isActive: true,
        },
        {
          id: "banner-inactive-2",
          title: "Inactive Winter Draft Campaign",
          subtitle: "Secret preview",
          desktopImageUrl: "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/banners/banner_inactive.webp",
          desktopStorageKey: "hs-spare-parts/banners/banner_inactive",
          mobileImageUrl: null,
          mobileStorageKey: null,
          altText: "Inactive banner alt text",
          linkUrl: "/categories",
          sortOrder: 2,
          isActive: false, // Inactive! MUST NOT appear publicly
        },
      ]);

      const publicBanners = await getStorefrontBanners();
      expect(publicBanners).toHaveLength(1);
      expect(publicBanners[0]!.id).toBe("banner-active-1");
      expect(publicBanners.some((b) => b.id === "banner-inactive-2")).toBe(false);
    });

    it("sorts active banners by sortOrder ascending", async () => {
      setInMemoryBanners([
        {
          id: "banner-second",
          title: "Second Banner",
          desktopImageUrl: "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/banners/b2.webp",
          altText: "Second banner",
          sortOrder: 20,
          isActive: true,
        },
        {
          id: "banner-first",
          title: "First Banner",
          desktopImageUrl: "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/banners/b1.webp",
          altText: "First banner",
          sortOrder: 5,
          isActive: true,
        },
      ]);

      const publicBanners = await getStorefrontBanners();
      expect(publicBanners).toHaveLength(2);
      expect(publicBanners[0]!.id).toBe("banner-first");
      expect(publicBanners[1]!.id).toBe("banner-second");
    });

    it("safely ignores malformed banner JSON items and recovers valid ones", async () => {
      vi.stubEnv("DATABASE_URL", "postgres://mockuser:mockpass@localhost:5432/mockdb");

      // Mock database returning row with one valid banner and one malformed item (missing required url/altText)
      mockDbInstance = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            value: [
              {
                id: "valid-1",
                title: "Valid Banner",
                desktopImageUrl: "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/banners/valid.webp",
                altText: "Valid alt text",
                sortOrder: 1,
                isActive: true,
              },
              {
                id: "malformed-corrupt",
                title: "Corrupt banner without desktop image",
                // missing desktopImageUrl and altText!
                sortOrder: 2,
                isActive: true,
              },
              null,
              "invalid-string-item",
            ],
          },
        ]),
      };

      const publicBanners = await getStorefrontBanners();
      expect(publicBanners).toHaveLength(1);
      expect(publicBanners[0]!.id).toBe("valid-1");
    });

    it("returns empty array when banner setting in database is missing or non-array", async () => {
      vi.stubEnv("DATABASE_URL", "postgres://mockuser:mockpass@localhost:5432/mockdb");

      mockDbInstance = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]), // No row found
      };

      const publicBanners = await getStorefrontBanners();
      expect(publicBanners).toEqual([]);
    });
  });

  // ============================================================================
  // 4. Database Failure & Production Guard Invariants
  // ============================================================================
  describe("Production Database Guard Invariants", () => {
    it("fails closed and never serves demo categories when DATABASE_URL is configured but query fails", async () => {
      vi.stubEnv("DATABASE_URL", "postgres://mockuser:mockpass@localhost:5432/mockdb");
      vi.stubEnv("NODE_ENV", "production");

      mockDbInstance = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockRejectedValue(new Error("Connection refused")),
      };

      const categories = await getStorefrontCategories();
      expect(categories).toEqual([]);
    });

    it("fails closed and never serves demo brands when DATABASE_URL is configured but query fails", async () => {
      vi.stubEnv("DATABASE_URL", "postgres://mockuser:mockpass@localhost:5432/mockdb");
      vi.stubEnv("NODE_ENV", "production");

      mockDbInstance = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockRejectedValue(new Error("Database pool timeout")),
      };

      const brands = await getStorefrontBrands();
      expect(brands).toEqual([]);
    });

    it("fails closed and never serves demo banners when DATABASE_URL is configured but query fails", async () => {
      vi.stubEnv("DATABASE_URL", "postgres://mockuser:mockpass@localhost:5432/mockdb");
      vi.stubEnv("NODE_ENV", "production");

      mockDbInstance = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockRejectedValue(new Error("Neon connection failed")),
      };

      const banners = await getStorefrontBanners();
      expect(banners).toEqual([]);
    });

    it("never serves demo data in production when DATABASE_URL is completely unconfigured", async () => {
      vi.stubEnv("DATABASE_URL", "");
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_ENABLE_DEMO_CATALOG", "false");

      const categories = await getStorefrontCategories();
      const brands = await getStorefrontBrands();
      const banners = await getStorefrontBanners();

      expect(categories).toEqual([]);
      expect(brands).toEqual([]);
      expect(banners).toEqual([]);
    });
  });

  // ============================================================================
  // 5. Storefront Data Wiring & Component Prop Format Contract
  // ============================================================================
  describe("Storefront Component Data Contract", () => {
    it("provides categories in the exact format required by FeaturedCategories props", async () => {
      const existingCat = getInMemoryCategoryById("cat-1");
      if (existingCat) {
        setInMemoryCategory("cat-1", {
          ...existingCat,
          imageUrl: "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/categories/cat_wired_1.webp",
        });
      }

      const categories = await getStorefrontCategories();
      expect(Array.isArray(categories)).toBe(true);
      const target = categories.find((c) => c.slug === "suspension-steering");
      expect(target).toBeDefined();
      expect(target?.name).toBe("Suspension & Steering");
      expect(target?.imageUrl).toContain("cat_wired_1.webp");

      // Verify that passing this to FeaturedCategories component contract resolves correctly
      const customMatch = categories.find((c) => c.slug === "suspension-steering");
      const displayImage = customMatch?.imageUrl || "/images/suspension.jpg";
      expect(displayImage).toBe("https://res.cloudinary.com/demo/image/upload/hs-spare-parts/categories/cat_wired_1.webp");
    });

    it("provides brands in the exact format required by ShopByBrand props", async () => {
      const existingBrand = getInMemoryBrandById("brand-1");
      if (existingBrand) {
        setInMemoryBrand("brand-1", {
          ...existingBrand,
          logoUrl: "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/brands/brand_wired_1.png",
        });
      }

      const brands = await getStorefrontBrands();
      expect(Array.isArray(brands)).toBe(true);
      const maruti = brands.find((b) => b.name.includes("Maruti"));
      expect(maruti).toBeDefined();
      expect(maruti?.queryParam).toBe(maruti?.name);
      expect(maruti?.logoUrl).toContain("brand_wired_1.png");

      // Verify that passing this to ShopByBrand component contract resolves correctly
      const customMatch = brands.find((b) => b.name.toLowerCase().includes("maruti"));
      const displayLogo = customMatch?.logoUrl;
      expect(displayLogo).toBe("https://res.cloudinary.com/demo/image/upload/hs-spare-parts/brands/brand_wired_1.png");
    });

    it("provides banners in the exact format required by PromotionalBanner props", async () => {
      setInMemoryBanners([
        {
          id: "banner-wired-1",
          title: "Wired Promotional Banner",
          subtitle: "Clearance discount",
          desktopImageUrl: "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/banners/desk_wired.webp",
          mobileImageUrl: "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/banners/mob_wired.webp",
          altText: "Wired campaign banner",
          linkUrl: "/categories",
          sortOrder: 1,
          isActive: true,
        },
      ]);

      const banners = await getStorefrontBanners();
      expect(banners).toHaveLength(1);
      const b = banners[0]!;
      expect(b.title).toBe("Wired Promotional Banner");
      expect(b.desktopImageUrl).toContain("desk_wired.webp");
      expect(b.mobileImageUrl).toContain("mob_wired.webp");
      expect(b.altText).toBe("Wired campaign banner");
      expect(b.linkUrl).toBe("/categories");
      expect(b.isActive).toBe(true);

      // Verify that PromotionalBanner contract filters for active banners
      const activeCustomBanners = banners.filter((item) => item.isActive !== false);
      expect(activeCustomBanners).toHaveLength(1);
    });
  });
});
