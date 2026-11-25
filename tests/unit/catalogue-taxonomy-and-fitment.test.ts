import { describe, it, expect } from "vitest";
import {
  APPROVED_CATEGORIES,
  APPROVED_BRANDS,
  APPROVED_VEHICLE_MAKES,
  PRODUCT_ORIGINS,
  PRODUCT_CONDITIONS,
  USED_CONDITION_GRADES,
  INSPECTION_STATUSES,
  getCategoryCode,
  getBrandCode,
  generateStandardSku,
  resolveCanonicalCategorySlug,
} from "@/lib/constants/approved-catalogue";
import {
  adminCreateProductSchema,
  productFitmentInputSchema,
} from "@/features/admin/schemas";
import {
  verifyDatabaseTarget,
  maskHost,
  CategorySeedConflictError,
} from "@/lib/db/seed-categories";

describe("Phase Final: Catalogue Taxonomy & Indian Passenger Car Fitment", () => {
  describe("1. Canonical 12 Categories & 88 Subcategories", () => {
    it("should contain exactly 12 approved categories", () => {
      expect(APPROVED_CATEGORIES).toHaveLength(12);
    });

    it("should have exactly 90 total subcategories across all 12 categories", () => {
      const totalSubcategories = APPROVED_CATEGORIES.reduce(
        (sum, cat) => sum + cat.subcategories.length,
        0
      );
      expect(totalSubcategories).toBe(90);
    });

    it("should have unique 3-letter codes for all 12 categories", () => {
      const codes = APPROVED_CATEGORIES.map((c) => c.code);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(12);
      codes.forEach((code) => {
        expect(code).toMatch(/^[A-Z]{3}$/);
      });
    });

    it("should have unique category slugs", () => {
      const slugs = APPROVED_CATEGORIES.map((c) => c.slug);
      const uniqueSlugs = new Set(slugs);
      expect(uniqueSlugs.size).toBe(12);
    });

    it("should have unique subcategory IDs across all categories", () => {
      const allSubIds = APPROVED_CATEGORIES.flatMap((c) =>
        c.subcategories.map((sub) => sub.id)
      );
      const uniqueSubIds = new Set(allSubIds);
      expect(uniqueSubIds.size).toBe(90);
    });

    it("should correctly resolve legacy slug aliases to canonical category slugs", () => {
      expect(resolveCanonicalCategorySlug("brake")).toBe("brake-system");
      expect(resolveCanonicalCategorySlug("transmission")).toBe("clutch-transmission");
      expect(resolveCanonicalCategorySlug("hvac")).toBe("cooling-system");
      expect(resolveCanonicalCategorySlug("electrical")).toBe("electrical-parts");
      expect(resolveCanonicalCategorySlug("body-parts")).toBe("body-exterior");
      expect(resolveCanonicalCategorySlug("unknown-category")).toBe("unknown-category");
    });
  });

  describe("2. Master Brands & SKU Code Generator", () => {
    it("should include key aftermarket brands and OEM manufacturer brands", () => {
      const brandNames = APPROVED_BRANDS.map((b) => b.name);
      expect(brandNames).toContain("Bosch");
      expect(brandNames).toContain("Brembo");
      expect(brandNames).toContain("Valeo");
      expect(brandNames).toContain("DENSO");
      expect(brandNames).toContain("Maruti Suzuki Genuine");
      expect(brandNames).toContain("Hyundai Mobis");
      expect(brandNames).toContain("Tata Genuine Parts");
    });

    it("should have unique 3-letter brand codes", () => {
      const codes = APPROVED_BRANDS.map((b) => b.code);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(APPROVED_BRANDS.length);
      codes.forEach((c) => expect(c).toMatch(/^[A-Z0-9]{3}$/));
    });

    it("should generate standard SKU in CATEGORY-BRAND-SEQUENCE format", () => {
      const sku1 = generateStandardSku("brake-system", "Bosch", 1);
      expect(sku1).toBe("BRK-BOS-0001");

      const sku2 = generateStandardSku("engine-parts", "Maruti Suzuki Genuine", 42);
      expect(sku2).toBe("ENG-MSZ-0042");

      const sku3 = generateStandardSku("suspension-steering", "KYB", 789);
      expect(sku3).toBe("SUS-KYB-0789");
    });

    it("should handle legacy aliases when generating SKU", () => {
      const sku = generateStandardSku("brake", "Brembo", 5);
      expect(sku).toBe("BRK-BRE-0005");
    });
  });

  describe("3. Indian Passenger Car Vehicle Master", () => {
    it("should cover the 11 major Indian passenger car makes", () => {
      const makes = APPROVED_VEHICLE_MAKES.map((m) => m.name);
      expect(makes).toContain("Maruti Suzuki");
      expect(makes).toContain("Hyundai");
      expect(makes).toContain("Tata");
      expect(makes).toContain("Honda");
      expect(makes).toContain("Toyota");
      expect(makes).toContain("Mahindra");
      expect(makes).toContain("Kia");
      expect(makes).toContain("Renault");
      expect(makes).toContain("Nissan");
      expect(makes).toContain("Volkswagen");
      expect(makes).toContain("Skoda");
    });

    it("should define models and variants with realistic year spans for popular Indian cars", () => {
      const maruti = APPROVED_VEHICLE_MAKES.find((m) => m.name === "Maruti Suzuki");
      expect(maruti).toBeDefined();
      const swift = maruti!.models.find((m) => m.name === "Swift");
      expect(swift).toBeDefined();
      expect(swift!.variants).toContain("VXi");
      expect(swift!.yearStart).toBeLessThanOrEqual(2010);
      expect(swift!.fuelTypes).toContain("Petrol");
    });
  });

  describe("4. Independent Product Classification (Origin + Condition)", () => {
    it("should recognize genuine_oem and branded_aftermarket as valid origins", () => {
      expect(PRODUCT_ORIGINS).toEqual(["genuine_oem", "branded_aftermarket"]);
    });

    it("should recognize new and used as valid conditions", () => {
      expect(PRODUCT_CONDITIONS).toEqual(["new", "used"]);
    });

    it("should validate used condition grades", () => {
      expect(USED_CONDITION_GRADES).toEqual(["excellent", "good", "fair"]);
    });

    it("should validate inspection statuses", () => {
      expect(INSPECTION_STATUSES).toEqual(["pending", "inspected", "failed"]);
    });
  });

  describe("5. Admin Product Creation & Fitment Schema Validation", () => {
    it("should accept valid product input with origin, condition, and vehicle fitment", () => {
      const validPayload = {
        name: "Bosch Front Brake Pads Set",
        sku: "BRK-BOS-0001",
        categoryId: "brake-system",
        subcategoryId: "front-brake-pads",
        brandId: "Bosch",
        origin: "branded_aftermarket" as const,
        condition: "new" as const,
        priceMinor: 245000,
        compareAtPriceMinor: 290000,
        stockQuantity: 10,
        partNumber: "0 986 AB1 234",
        oemNumber: "55810-M68P00",
        fitments: [
          {
            make: "Maruti Suzuki",
            model: "Swift",
            variant: "VXi",
            yearStart: 2018,
            yearEnd: 2023,
            fuelType: "Petrol",
            verifiedStatus: "verified" as const,
          },
        ],
      };

      const result = adminCreateProductSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.origin).toBe("branded_aftermarket");
        expect(result.data.condition).toBe("new");
        expect(result.data.fitments).toHaveLength(1);
        expect(result.data.fitments?.[0]?.make).toBe("Maruti Suzuki");
      }
    });

    it("should validate used product with inspection details", () => {
      const usedPayload = {
        name: "Maruti Swift Alternator (Tested Pre-Owned)",
        sku: "ELE-MSZ-0005",
        categoryId: "electrical-parts",
        subcategoryId: "alternators",
        brandId: "Maruti Suzuki Genuine",
        origin: "genuine_oem" as const,
        condition: "used" as const,
        priceMinor: 450000,
        stockQuantity: 1,
        conditionGrade: "excellent",
        inspectionStatus: "inspected" as const,
        testedStatus: "Bench tested 14.2V output verified",
        conditionNotes: "Removed from low-mileage 2021 Swift. Clean stator and bearings.",
        warrantyDetails: "30-day replacement warranty",
      };

      const result = adminCreateProductSchema.safeParse(usedPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.origin).toBe("genuine_oem");
        expect(result.data.condition).toBe("used");
        expect(result.data.inspectionStatus).toBe("inspected");
      }
    });

    it("should reject fitment record if yearStart is invalid or missing required fields", () => {
      const invalidFitment = {
        make: "",
        model: "Swift",
        yearStart: 1950, // below 1980
      };

      const result = productFitmentInputSchema.safeParse(invalidFitment);
      expect(result.success).toBe(false);
    });
  });

  describe("5. Category Seeder Safety & Target Verification Static Invariants", () => {
    it("should verify exactly 12 canonical parents and 90 subcategories with 102 mutually unique slugs", () => {
      const parentSlugs = APPROVED_CATEGORIES.map((c) => c.slug);
      const subSlugs = APPROVED_CATEGORIES.flatMap((c) => c.subcategories.map((s) => s.slug));

      expect(parentSlugs).toHaveLength(12);
      expect(subSlugs).toHaveLength(90);

      // Mutually unique slugs across all 102 entries
      const allSlugs = [...parentSlugs, ...subSlugs];
      const uniqueSlugs = new Set(allSlugs);
      expect(uniqueSlugs.size).toBe(102);
    });

    it("should mask database hostnames safely without leaking internal hashes", () => {
      expect(maskHost("ep-cool-fog-123456.us-east-2.aws.neon.tech")).toBe(
        "ep-c****456.us-east-2.aws.neon.tech"
      );
      expect(maskHost("localhost")).toBe("loc****ost");
      expect(maskHost("db")).toBe("****");
    });

    it("should fail target verification when DATABASE_URL is missing or invalid", () => {
      const missing = verifyDatabaseTarget(undefined, "ep-test.neon.tech");
      expect(missing.valid).toBe(false);
      expect(missing.error).toContain("missing or empty");

      const malformed = verifyDatabaseTarget("not-a-valid-url", "ep-test.neon.tech");
      expect(malformed.valid).toBe(false);
      expect(malformed.error).toContain("not a valid URL");
    });

    it("should fail target verification when EXPECTED_DATABASE_HOST is missing", () => {
      const res = verifyDatabaseTarget(
        "postgresql://user:pass@ep-cool-fog-123456.us-east-2.aws.neon.tech/neondb?sslmode=require",
        undefined
      );
      expect(res.valid).toBe(false);
      expect(res.error).toContain("EXPECTED_DATABASE_HOST environment variable is required");
    });

    it("should fail target verification when parsed host does not exactly match expected host", () => {
      const res = verifyDatabaseTarget(
        "postgresql://user:pass@ep-cool-fog-123456.us-east-2.aws.neon.tech/neondb?sslmode=require",
        "ep-other-instance-999999.us-east-2.aws.neon.tech"
      );
      expect(res.valid).toBe(false);
      expect(res.error).toContain("TARGET_MISMATCH");

      // Verify loose substring matching is strictly prevented
      const substringAttempt = verifyDatabaseTarget(
        "postgresql://user:pass@ep-cool-fog-123456.us-east-2.aws.neon.tech/neondb?sslmode=require",
        "neon.tech"
      );
      expect(substringAttempt.valid).toBe(false);
      expect(substringAttempt.error).toContain("TARGET_MISMATCH");
    });

    it("should pass target verification on exact match and never leak passwords", () => {
      const targetUrl =
        "postgresql://superadmin:SuperSecretP@ssword!@ep-cool-fog-123456.us-east-2.aws.neon.tech/neondb?sslmode=require";
      const expectedHost = "ep-cool-fog-123456.us-east-2.aws.neon.tech";

      const res = verifyDatabaseTarget(targetUrl, expectedHost);
      expect(res.valid).toBe(true);
      expect(res.parsedHost).toBe("ep-cool-fog-123456.us-east-2.aws.neon.tech");
      expect(res.databaseName).toBe("neondb");
      expect(res.maskedHost).toBe("ep-c****456.us-east-2.aws.neon.tech");

      // Verify no credential leakage in any returned property
      const serialized = JSON.stringify(res);
      expect(serialized).not.toContain("superadmin");
      expect(serialized).not.toContain("SuperSecretP@ssword!");
    });

    it("should construct CategorySeedConflictError with structured details", () => {
      const conflict = {
        slug: "brake-system",
        type: "parent" as const,
        reason: "Parent ID mismatch",
        expected: { parentId: null },
        actual: { parentId: "uuid-123" },
      };
      const err = new CategorySeedConflictError([conflict]);
      expect(err.name).toBe("CategorySeedConflictError");
      expect(err.message).toContain("1 conflicting existing category record(s)");
      expect(err.conflicts).toHaveLength(1);
      expect(err.conflicts[0]?.slug).toBe("brake-system");
    });
  });
});
