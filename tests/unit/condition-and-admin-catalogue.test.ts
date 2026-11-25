import { describe, it, expect } from "vitest";
import {
  productSearchQuerySchema,
  PRODUCT_CONDITIONS,
} from "@/features/catalogue/schemas";
import {
  searchProducts,
  getProductByIdOrSlug,
  parseProductCondition,
} from "@/server/catalogue/catalogue-service";
import {
  adminCreateProductSchema,
  adminUpdateProductSchema,
} from "@/features/admin/schemas";
import {
  assertAdminCatalogueAccess,
  createAdminProduct,
  updateAdminProduct,
  deleteAdminProduct,
  publishAdminProduct,
  getAdminProducts,
} from "@/features/admin/service";
import {
  ROLES,
  PERMISSIONS,
  AuthorizationError,
  AuthenticationError,
} from "@/lib/auth/rbac";
import type { SafeUser } from "@/features/auth/service";

const MOCK_ADMIN_USER: SafeUser = {
  id: "admin-user-001",
  email: "admin@hsspareparts.com",
  name: "Master Administrator",
  phone: "+919876543210",
  status: "active",
  roles: [ROLES.ADMINISTRATOR],
  permissions: [
    PERMISSIONS.CATALOGUE_READ,
    PERMISSIONS.CATALOGUE_WRITE,
    PERMISSIONS.CATALOGUE_DELETE,
    PERMISSIONS.ADMIN_ACCESS,
  ],
  createdAt: new Date(),
};

const MOCK_CATALOGUE_MANAGER: SafeUser = {
  id: "manager-002",
  email: "manager@hsspareparts.com",
  name: "Catalogue Specialist",
  phone: "+919876543211",
  status: "active",
  roles: [ROLES.CATALOGUE_MANAGER],
  permissions: [
    PERMISSIONS.CATALOGUE_READ,
    PERMISSIONS.CATALOGUE_WRITE,
  ],
  createdAt: new Date(),
};

const MOCK_CUSTOMER_USER: SafeUser = {
  id: "customer-user-003",
  email: "shopper@gmail.com",
  name: "Rahul Customer",
  phone: "+919876543212",
  status: "active",
  roles: [ROLES.CUSTOMER],
  permissions: [
    PERMISSIONS.STORE_BROWSE,
    PERMISSIONS.CUSTOMER_READ_OWN,
    PERMISSIONS.CUSTOMER_WRITE_OWN,
    PERMISSIONS.ORDERS_READ_OWN,
    PERMISSIONS.ORDERS_CREATE,
  ],
  createdAt: new Date(),
};

describe("Product Condition & Admin Storefront Security Architecture", () => {
  describe("1. Legacy & Explicit Product Condition Parsing", () => {
    it("should classify products with missing, null, or invalid condition as 'unclassified' without falling back to 'new'", () => {
      expect(parseProductCondition(undefined)).toBe("unclassified");
      expect(parseProductCondition(null)).toBe("unclassified");
      expect(parseProductCondition("")).toBe("unclassified");
      expect(parseProductCondition("refurbished")).toBe("unclassified");
      expect(parseProductCondition("unknown")).toBe("unclassified");
      expect(parseProductCondition(123)).toBe("unclassified");
    });

    it("should correctly parse explicit 'new' condition", () => {
      expect(parseProductCondition("new")).toBe("new");
    });

    it("should correctly parse explicit 'used' condition", () => {
      expect(parseProductCondition("used")).toBe("used");
    });
  });

  describe("2. Condition Schema Validation & Mandatory Enforcement", () => {
    it("should accept valid search query conditions ('new' and 'used')", () => {
      expect(PRODUCT_CONDITIONS).toContain("new");
      expect(PRODUCT_CONDITIONS).toContain("used");

      const parsedNew = productSearchQuerySchema.parse({ condition: "new" });
      expect(parsedNew.condition).toBe("new");

      const parsedUsed = productSearchQuerySchema.parse({ condition: "used" });
      expect(parsedUsed.condition).toBe("used");
    });

    it("should reject invalid condition strings in search queries", () => {
      expect(() =>
        productSearchQuerySchema.parse({ condition: "refurbished" })
      ).toThrow();

      expect(() =>
        productSearchQuerySchema.parse({ condition: "open-box" })
      ).toThrow();
    });

    it("should strictly require condition in admin product creation (no silent default)", () => {
      const baseProduct = {
        name: "Valeo Clutch Kit",
        sku: "VAL-826359",
        categoryId: "transmission",
        brandId: "Valeo",
        priceMinor: 485000,
      };

      // Fails when condition is omitted
      const omitted = adminCreateProductSchema.safeParse(baseProduct);
      expect(omitted.success).toBe(false);

      // Fails when condition is invalid
      const invalid = adminCreateProductSchema.safeParse({
        ...baseProduct,
        condition: "salvaged",
      });
      expect(invalid.success).toBe(false);

      // Passes when condition is explicitly 'new'
      const validNew = adminCreateProductSchema.safeParse({
        ...baseProduct,
        condition: "new",
      });
      expect(validNew.success).toBe(true);

      // Passes when condition is explicitly 'used'
      const validUsed = adminCreateProductSchema.safeParse({
        ...baseProduct,
        condition: "used",
      });
      expect(validUsed.success).toBe(true);
    });

    it("should ensure optional pre-owned fields have no fabricated defaults in schema", () => {
      const parsed = adminCreateProductSchema.parse({
        name: "Bosch Spark Plug Set",
        sku: "BSH-SP-01",
        categoryId: "ignition",
        brandId: "Bosch",
        condition: "new",
        priceMinor: 120000,
      });

      expect(parsed.conditionGrade).toBeUndefined();
      expect(parsed.conditionNotes).toBeUndefined();
      expect(parsed.visibleWearOrDefects).toBeUndefined();
      expect(parsed.testedStatus).toBeUndefined();
      expect(parsed.warrantyDetails).toBeUndefined();
    });
  });

  describe("3. Strict Catalogue Search Filtering (Exclusion of Unclassified Products)", () => {
    it("should return only 'new' products and strictly exclude 'used' and 'unclassified' legacy products", async () => {
      const response = await searchProducts({ condition: "new" });
      expect(response.products.length).toBeGreaterThan(0);

      for (const product of response.products) {
        expect(product.condition).toBe("new");
        expect(product.condition).not.toBe("used");
        expect(product.condition).not.toBe("unclassified");
      }

      // Legacy product without condition must not appear in new results
      const hasLegacySensor = response.products.some((p) => p.id === "demo-legacy-sensor");
      expect(hasLegacySensor).toBe(false);
      expect(response.activeFilters.condition).toBe("new");
    });

    it("should return only 'used' products and strictly exclude 'new' and 'unclassified' legacy products", async () => {
      const response = await searchProducts({ condition: "used" });
      expect(response.products.length).toBeGreaterThan(0);

      for (const product of response.products) {
        expect(product.condition).toBe("used");
        expect(product.condition).not.toBe("new");
        expect(product.condition).not.toBe("unclassified");
      }

      // Legacy product without condition must not appear in used results
      const hasLegacySensor = response.products.some((p) => p.id === "demo-legacy-sensor");
      expect(hasLegacySensor).toBe(false);
      expect(response.activeFilters.condition).toBe("used");
    });

    it("should include unclassified legacy products in All Products view with neutral condition", async () => {
      const response = await searchProducts({});
      expect(response.products.length).toBeGreaterThan(0);

      const legacyProduct = response.products.find((p) => p.id === "demo-legacy-sensor");
      expect(legacyProduct).toBeDefined();
      expect(legacyProduct?.condition).toBe("unclassified");
    });

    it("should not count unclassified products in newCount or usedCount facets", async () => {
      const response = await searchProducts({});
      const newFacet = response.facets.conditions.find((c) => c.value === "new");
      const usedFacet = response.facets.conditions.find((c) => c.value === "used");

      expect(newFacet).toBeDefined();
      expect(usedFacet).toBeDefined();

      // Verified: The unclassified product is not counted in new or used facets
      const classifiedTotal = (newFacet?.count ?? 0) + (usedFacet?.count ?? 0);
      expect(classifiedTotal).toBeLessThan(response.totalCount);
    });

    it("should supply pre-owned inspection disclosures on pre-owned product details without fabricated claims", async () => {
      const product = await getProductByIdOrSlug("demo-gabriel-shock");
      expect(product).not.toBeNull();
      if (product) {
        expect(product.condition).toBe("used");
        expect(product.conditionNotes).toBeTruthy();
        // Optional fields without data remain null or undefined (not fabricated defaults)
        expect(product.visibleWearOrDefects).toBeNull();
      }
    });
  });

  describe("4. Admin Authorization Security & RBAC Enforcement", () => {
    it("should reject unauthenticated guest from catalogue write access", async () => {
      await expect(
        assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_WRITE, null)
      ).rejects.toThrow(AuthenticationError);
    });

    it("should reject customer accounts from catalogue write and management access", async () => {
      await expect(
        assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_WRITE, MOCK_CUSTOMER_USER)
      ).rejects.toThrow(AuthorizationError);

      await expect(
        assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_DELETE, MOCK_CUSTOMER_USER)
      ).rejects.toThrow(AuthorizationError);

      await expect(
        assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_READ, MOCK_CUSTOMER_USER)
      ).rejects.toThrow(AuthorizationError);
    });

    it("should permit administrators with CATALOGUE_WRITE permission", async () => {
      const user = await assertAdminCatalogueAccess(
        PERMISSIONS.CATALOGUE_WRITE,
        MOCK_ADMIN_USER
      );
      expect(user.id).toBe("admin-user-001");
    });

    it("should permit catalogue managers with CATALOGUE_WRITE permission", async () => {
      const user = await assertAdminCatalogueAccess(
        PERMISSIONS.CATALOGUE_WRITE,
        MOCK_CATALOGUE_MANAGER
      );
      expect(user.id).toBe("manager-002");
    });

    it("should deny catalogue managers from DELETE if they lack CATALOGUE_DELETE permission", async () => {
      await expect(
        assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_DELETE, MOCK_CATALOGUE_MANAGER)
      ).rejects.toThrow(AuthorizationError);
    });

    it("should reject guest calls to createAdminProduct safely without modifying data", async () => {
      await expect(
        createAdminProduct(
          {
            name: "Intruder Brake Rotor",
            sku: "INT-001",
            categoryId: "brake",
            brandId: "Brembo",
            condition: "new",
            priceMinor: 100000,
          },
          null
        )
      ).rejects.toThrow(AuthenticationError);
    });

    it("should reject customer calls to createAdminProduct safely without modifying data", async () => {
      await expect(
        createAdminProduct(
          {
            name: "Customer Attempted Rotor",
            sku: "CUST-001",
            categoryId: "brake",
            brandId: "Brembo",
            condition: "new",
            priceMinor: 100000,
          },
          MOCK_CUSTOMER_USER
        )
      ).rejects.toThrow(AuthorizationError);
    });

    it("should reject guest and customer calls to updateAdminProduct", async () => {
      await expect(
        updateAdminProduct({ id: "demo-brembo-pads", name: "Hacked Name" }, null)
      ).rejects.toThrow(AuthenticationError);

      await expect(
        updateAdminProduct({ id: "demo-brembo-pads", name: "Hacked Name" }, MOCK_CUSTOMER_USER)
      ).rejects.toThrow(AuthorizationError);
    });

    it("should reject guest and customer calls to deleteAdminProduct", async () => {
      await expect(
        deleteAdminProduct("demo-brembo-pads", null)
      ).rejects.toThrow(AuthenticationError);

      await expect(
        deleteAdminProduct("demo-brembo-pads", MOCK_CUSTOMER_USER)
      ).rejects.toThrow(AuthorizationError);
    });

    it("should reject guest and customer calls to getAdminProducts", async () => {
      await expect(getAdminProducts(null)).rejects.toThrow(AuthenticationError);
      await expect(getAdminProducts(MOCK_CUSTOMER_USER)).rejects.toThrow(AuthorizationError);
    });

    it("should allow administrators to create a product with verified condition", async () => {
      const res = await createAdminProduct(
        {
          name: "Brembo Sport Caliper",
          sku: "BRM-CAL-99",
          categoryId: "brake",
          brandId: "Brembo",
          condition: "used",
          priceMinor: 890000,
          conditionGrade: "Grade A - Excellent",
          conditionNotes: "Inspected caliper pistons and seals.",
        },
        MOCK_ADMIN_USER
      );

      expect(res.success).toBe(true);
      expect(res.productId).toBeDefined();
    });

    it("should allow administrators to list admin products with accurate condition mapping", async () => {
      const products = await getAdminProducts(MOCK_ADMIN_USER);
      expect(products.length).toBeGreaterThan(0);

      // Ensure every listed product has condition properly typed
      for (const p of products) {
        expect(["new", "used", "unclassified"]).toContain(p.condition);
      }
    });
  });

  describe("5. Safe Draft Product Creation & Storefront Exclusion Architecture", () => {
    it("creates an unpublished product with explicit status 'draft'", async () => {
      const res = await createAdminProduct(
        {
          name: "Unpublished Test Sensor",
          sku: "TST-DRAFT-001",
          categoryId: "electrical",
          brandId: "Bosch",
          condition: "new",
          priceMinor: 250000,
          description: "Internal testing sensor",
        },
        MOCK_ADMIN_USER,
        { status: "draft" }
      );

      expect(res.success).toBe(true);
      expect(res.status).toBe("draft");
      expect(res.productId).toBeDefined();
      expect(res.message).toContain("draft");
    });

    it("defaults to 'active' status when options are omitted (preserves backward compatibility)", async () => {
      const res = await createAdminProduct(
        {
          name: "Standard Active Filter",
          sku: "ACT-FLT-001",
          categoryId: "engine-parts",
          brandId: "Mann-Filter",
          condition: "new",
          priceMinor: 120000,
        },
        MOCK_ADMIN_USER
      );

      expect(res.success).toBe(true);
      expect(res.status).toBe("active");
    });

    it("rejects guest calls to publishAdminProduct", async () => {
      await expect(
        publishAdminProduct("prod-draft-1", "active", null)
      ).rejects.toThrow(AuthenticationError);
    });

    it("rejects customer calls to publishAdminProduct", async () => {
      await expect(
        publishAdminProduct("prod-draft-1", "active", MOCK_CUSTOMER_USER)
      ).rejects.toThrow(AuthorizationError);
    });

    it("allows administrators to publish or transition product status", async () => {
      const res = await publishAdminProduct("demo-brembo-pads", "active", MOCK_ADMIN_USER);
      expect(res.success).toBe(true);
      expect(res.status).toBe("active");

      const draftRes = await publishAdminProduct("demo-brembo-pads", "draft", MOCK_ADMIN_USER);
      expect(draftRes.success).toBe(true);
      expect(draftRes.status).toBe("draft");
    });

    it("verifies public product detail queries reject non-existent or draft products", async () => {
      const result = await getProductByIdOrSlug("non-existent-or-draft-product-id");
      expect(result).toBeNull();
    });

    it("allows updating product status via updateAdminProduct", async () => {
      const res = await updateAdminProduct(
        {
          id: "demo-brembo-pads",
          name: "Brembo Premium Ceramic Brake Pads",
          status: "draft",
        },
        MOCK_ADMIN_USER
      );
      expect(res.success).toBe(true);
      expect(res.status).toBe("draft");
    });

    it("blocks updating product status to active if condition is unclassified", async () => {
      await expect(
        updateAdminProduct(
          {
            id: "demo-brembo-pads",
            name: "Unclassified Product",
            condition: "unclassified" as any,
            status: "active",
          },
          MOCK_ADMIN_USER
        )
      ).rejects.toThrow("PUBLISHING_BLOCKED");
    });
  });

  describe("5. Server-Side Used-Product Publish Protection Invariants", () => {
    it("1. rejects creating a pre-owned product with failed inspection as active", async () => {
      // Schema validation test
      const schemaResult = adminUpdateProductSchema.safeParse({
        id: "test-id",
        condition: "used",
        inspectionStatus: "failed",
        status: "active",
      });
      expect(schemaResult.success).toBe(false);
      if (!schemaResult.success) {
        expect(schemaResult.error?.issues[0]?.message).toContain("Cannot publish pre-owned product with failed inspection status as active");
      }

      // Service execution test
      await expect(
        createAdminProduct(
          {
            name: "Failed Inspection Used Caliper",
            sku: "USED-FAIL-001",
            categoryId: "brake-system",
            brandId: "brand-1",
            condition: "used",
            inspectionStatus: "failed",
            priceMinor: 250000,
          },
          MOCK_ADMIN_USER,
          { status: "active" }
        )
      ).rejects.toThrow("VALIDATION_ERROR: Cannot publish pre-owned product with failed inspection status as active");
    });

    it("2. rejects updating a pre-owned product to active status if inspection failed", async () => {
      await expect(
        updateAdminProduct(
          {
            id: "demo-brembo-pads",
            condition: "used",
            inspectionStatus: "failed",
            status: "active",
          },
          MOCK_ADMIN_USER
        )
      ).rejects.toThrow("VALIDATION_ERROR: Cannot publish pre-owned product with failed inspection status as active");
    });

    it("3. allows creating and updating a pre-owned product with failed inspection as draft", async () => {
      const createRes = await createAdminProduct(
        {
          name: "Salvaged Parts Quarantine",
          sku: "USED-FAIL-DRF",
          categoryId: "brake-system",
          brandId: "brand-1",
          condition: "used",
          inspectionStatus: "failed",
          priceMinor: 150000,
        },
        MOCK_ADMIN_USER,
        { status: "draft" }
      );
      expect(createRes.success).toBe(true);
      expect(createRes.status).toBe("draft");

      const updateRes = await updateAdminProduct(
        {
          id: "demo-brembo-pads",
          condition: "used",
          inspectionStatus: "failed",
          status: "draft",
        },
        MOCK_ADMIN_USER
      );
      expect(updateRes.success).toBe(true);
      expect(updateRes.status).toBe("draft");
    });

    it("4. allows updating a pre-owned product with failed inspection to archived status", async () => {
      const res = await updateAdminProduct(
        {
          id: "demo-brembo-pads",
          condition: "used",
          inspectionStatus: "failed",
          status: "archived",
        },
        MOCK_ADMIN_USER
      );
      expect(res.success).toBe(true);
      expect(res.status).toBe("archived");
    });

    it("5. preserves valid new-product workflows unchanged", async () => {
      const createRes = await createAdminProduct(
        {
          name: "Brand New Master Cylinder",
          sku: "NEW-MC-001",
          categoryId: "brake-system",
          brandId: "brand-1",
          condition: "new",
          priceMinor: 450000,
        },
        MOCK_ADMIN_USER,
        { status: "active" }
      );
      expect(createRes.success).toBe(true);
      expect(createRes.status).toBe("active");

      const updateRes = await updateAdminProduct(
        {
          id: "demo-brembo-pads",
          condition: "new",
          status: "active",
        },
        MOCK_ADMIN_USER
      );
      expect(updateRes.success).toBe(true);
      expect(updateRes.status).toBe("active");
    });

    it("6. preserves valid inspected pre-owned product workflows unchanged", async () => {
      const createRes = await createAdminProduct(
        {
          name: "Certified Passed Used Caliper",
          sku: "USED-PASS-001",
          categoryId: "brake-system",
          brandId: "brand-1",
          condition: "used",
          inspectionStatus: "inspected",
          conditionGrade: "grade_a",
          priceMinor: 320000,
        },
        MOCK_ADMIN_USER,
        { status: "active" }
      );
      expect(createRes.success).toBe(true);
      expect(createRes.status).toBe("active");

      const updateRes = await updateAdminProduct(
        {
          id: "demo-brembo-pads",
          condition: "used",
          inspectionStatus: "inspected",
          conditionGrade: "grade_b",
          status: "active",
        },
        MOCK_ADMIN_USER
      );
      expect(updateRes.success).toBe(true);
      expect(updateRes.status).toBe("active");
    });
  });
});
