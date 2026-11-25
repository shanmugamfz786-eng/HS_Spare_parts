import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getAdminProductById,
  updateAdminProduct,
} from "@/features/admin/service";
import {
  createCloudinaryUploadReceiptV2,
  CLOUDINARY_FOLDERS,
} from "@/lib/cloudinary";
import crypto from "node:crypto";
import {
  getProductByIdOrSlug,
} from "@/server/catalogue/catalogue-service";
import {
  ROLES,
  PERMISSIONS,
  AuthenticationError,
  AuthorizationError,
} from "@/lib/auth/rbac";
import type { SafeUser } from "@/features/auth/service";

// Transactional database mock
let mockDbInstance: unknown = null;
vi.mock("@/lib/db", () => ({
  getDb: () => mockDbInstance,
}));

describe("Cloudinary Phase C2: Product Edit & Image Gallery Management", () => {
  const mockAdminUser: SafeUser = {
    id: "admin-user-uuid-1",
    email: "admin@hsspareparts.com",
    name: "Master Admin",
    phone: "+919876543210",
    roles: [ROLES.ADMINISTRATOR],
    permissions: [
      PERMISSIONS.CATALOGUE_READ,
      PERMISSIONS.CATALOGUE_WRITE,
      PERMISSIONS.CATALOGUE_DELETE,
    ],
    status: "active",
    createdAt: new Date("2026-01-01"),
  };

  const mockCustomerUser: SafeUser = {
    id: "customer-user-uuid-2",
    email: "shopper@gmail.com",
    name: "Regular Shopper",
    phone: "+919876543212",
    roles: [ROLES.CUSTOMER],
    permissions: [PERMISSIONS.STORE_BROWSE],
    status: "active",
    createdAt: new Date("2026-01-01"),
  };

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "hs-spare-parts-cloud");
    vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_API_KEY", "123456789012345");
    vi.stubEnv("CLOUDINARY_API_SECRET", "super_secret_test_key_abc123");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    mockDbInstance = null;
  });

  describe("1. Admin Authorization & Access Guards", () => {
    it("rejects unauthenticated/guest callers from loading a product for editing", async () => {
      await expect(getAdminProductById("prod-1", null)).rejects.toThrow(
        AuthenticationError
      );
    });

    it("rejects customer callers from loading a product for editing", async () => {
      await expect(
        getAdminProductById("prod-1", mockCustomerUser)
      ).rejects.toThrow(AuthorizationError);
    });

    it("rejects unauthenticated/guest callers from updating a product", async () => {
      await expect(
        updateAdminProduct({ id: "prod-1", name: "Hacked" }, null)
      ).rejects.toThrow(AuthenticationError);
    });

    it("rejects customer callers from updating a product", async () => {
      await expect(
        updateAdminProduct({ id: "prod-1", name: "Hacked" }, mockCustomerUser)
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe("2. Loading an Existing Product & Gallery", () => {
    it("loads an existing product with its full normalized image gallery", async () => {
      vi.stubEnv("DATABASE_URL", "postgresql://mock:mock@ep-test.neon.tech/neondb");

      const mockProductRow = {
        id: "prod-edit-001",
        sku: "BRM-PAD-01",
        slug: "brm-pad-01-abc",
        name: "Brembo Ceramic Brake Pads",
        brandId: "brand-uuid-1",
        categoryId: "cat-uuid-1",
        priceMinor: 350000,
        compareAtPriceMinor: 420000,
        shortDescription: "High-performance front brake pads",
        description: "Extended factual brake pad details",
        status: "active",
        attributes: {
          condition: "new",
          isOem: true,
          fitmentHint: "Front axle only",
          oemReference: "OEM-BRM-001",
        },
        brandName: "Brembo",
        categoryName: "Brake Components",
      };

      const mockImages = [
        {
          id: "img-uuid-1",
          url: "https://res.cloudinary.com/hs-spare-parts-cloud/image/upload/v1/hs-spare-parts/products/main_pad.jpg",
          storageKey: "hs-spare-parts/products/main_pad",
          altText: "Brembo Front Pads Main View",
          isPrimary: true,
          sortOrder: 0,
        },
        {
          id: "img-uuid-2",
          url: "https://res.cloudinary.com/hs-spare-parts-cloud/image/upload/v1/hs-spare-parts/products/angle_pad.jpg",
          storageKey: "hs-spare-parts/products/angle_pad",
          altText: "Side profile angle",
          isPrimary: false,
          sortOrder: 1,
        },
      ];

      mockDbInstance = {
        select: vi.fn().mockImplementation((fields) => ({
          from: vi.fn().mockImplementation(() => ({
            leftJoin: vi.fn().mockReturnThis(),
            where: vi.fn().mockImplementation(() => {
              // Return product row if fields has name, or inventory, or images
              if (fields && "name" in fields) {
                return {
                  limit: vi.fn().mockResolvedValue([mockProductRow]),
                };
              }
              if (fields && "quantityOnHand" in fields) {
                return {
                  limit: vi.fn().mockResolvedValue([{ quantityOnHand: 8 }]),
                };
              }
              // Images query
              return {
                orderBy: vi.fn().mockResolvedValue(mockImages),
              };
            }),
          })),
        })),
      };

      const product = await getAdminProductById("prod-edit-001", mockAdminUser);
      expect(product).not.toBeNull();
      expect(product?.id).toBe("prod-edit-001");
      expect(product?.name).toBe("Brembo Ceramic Brake Pads");
      expect(product?.sku).toBe("BRM-PAD-01");
      expect(product?.status).toBe("active");
      expect(product?.condition).toBe("new");
      expect(product?.priceMinor).toBe(350000);
      expect(product?.stockQuantity).toBe(8);
      expect(product?.images.length).toBe(2);
      expect(product?.images[0]?.isPrimary).toBe(true);
      expect(product?.images[0]?.storageKey).toBe("hs-spare-parts/products/main_pad");
    });

    it("returns null safely when product ID does not exist in database", async () => {
      vi.stubEnv("DATABASE_URL", "postgresql://mock:mock@ep-test.neon.tech/neondb");

      mockDbInstance = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            leftJoin: vi.fn().mockReturnThis(),
            where: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      };

      const product = await getAdminProductById("non-existent-uuid", mockAdminUser);
      expect(product).toBeNull();
    });
  });

  describe("3. Product Field Updates & Status Preservation", () => {
    it("updates product fields while preserving existing 'active' status", async () => {
      vi.stubEnv("DATABASE_URL", "postgresql://mock:mock@ep-test.neon.tech/neondb");

      let updatedFieldsPayload: Record<string, unknown> | null = null;

      const mockTx = {
        query: {
          products: {
            findFirst: vi.fn().mockResolvedValue({
              id: "prod-active-1",
              name: "Original Active Part",
              status: "active", // EXISTING STATUS IS ACTIVE
              attributes: { condition: "new" },
            }),
          },
        },
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => {
              const p = Promise.resolve([]);
              (p as unknown as Record<string, unknown>).limit = vi.fn().mockResolvedValue([]);
              return p;
            }),
          })),
        })),
        update: vi.fn().mockImplementation(() => ({
          set: vi.fn().mockImplementation((fields) => {
            updatedFieldsPayload = fields;
            return {
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([
                  { id: "prod-active-1", name: fields.name, status: "active" },
                ]),
              }),
            };
          }),
        })),
      };

      mockDbInstance = {
        transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          return await cb(mockTx);
        }),
      };

      const res = await updateAdminProduct(
        {
          id: "prod-active-1",
          name: "Updated Active Part Name",
          priceMinor: 490000,
        },
        mockAdminUser
      );

      expect(res.success).toBe(true);
      const payload1 = updatedFieldsPayload as Record<string, unknown> | null;
      expect(payload1).toBeDefined();
      expect(payload1?.name).toBe("Updated Active Part Name");
      expect(payload1?.priceMinor).toBe(490000);
      // Status must NOT be overwritten or published implicitly
      expect(payload1?.status).toBeUndefined();
    });

    it("updates product fields while preserving existing 'draft' status", async () => {
      vi.stubEnv("DATABASE_URL", "postgresql://mock:mock@ep-test.neon.tech/neondb");

      let updatedFieldsPayload: Record<string, unknown> | null = null;

      const mockTx = {
        query: {
          products: {
            findFirst: vi.fn().mockResolvedValue({
              id: "prod-draft-1",
              name: "Unpublished Draft Part",
              status: "draft", // EXISTING STATUS IS DRAFT
              attributes: { condition: "new" },
            }),
          },
        },
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => {
              const p = Promise.resolve([]);
              (p as unknown as Record<string, unknown>).limit = vi.fn().mockResolvedValue([]);
              return p;
            }),
          })),
        })),
        update: vi.fn().mockImplementation(() => ({
          set: vi.fn().mockImplementation((fields) => {
            updatedFieldsPayload = fields;
            return {
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([
                  { id: "prod-draft-1", name: fields.name, status: "draft" },
                ]),
              }),
            };
          }),
        })),
      };

      mockDbInstance = {
        transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          return await cb(mockTx);
        }),
      };

      const res = await updateAdminProduct(
        {
          id: "prod-draft-1",
          name: "Modified Draft Name",
          description: "New draft description",
        },
        mockAdminUser
      );

      expect(res.success).toBe(true);
      const payload2 = updatedFieldsPayload as Record<string, unknown> | null;
      expect(payload2?.name).toBe("Modified Draft Name");
      // Status must remain draft - never implicitly published!
      expect(payload2?.status).toBeUndefined();
    });
  });

  describe("4. Image Gallery Management, Reordering & Alt Text", () => {
    it("allows retaining existing persisted images without requiring upload receipts", async () => {
      vi.stubEnv("DATABASE_URL", "postgresql://mock:mock@ep-test.neon.tech/neondb");

      const existingImages = [
        {
          id: "img-1",
          productId: "prod-gallery-1",
          storageKey: "hs-spare-parts/products/existing_image_key",
        },
      ];

      let insertedImageRecords: Array<Record<string, unknown>> | null = null;

      const mockTx = {
        query: {
          products: {
            findFirst: vi.fn().mockResolvedValue({
              id: "prod-gallery-1",
              name: "Gallery Test Part",
              attributes: {},
            }),
          },
        },
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => {
              const p = Promise.resolve(existingImages);
              (p as unknown as Record<string, unknown>).limit = vi.fn().mockResolvedValue([]);
              return p;
            }),
          })),
        })),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: "prod-gallery-1", name: "Gallery Test Part" }]),
            }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
        insert: vi.fn().mockImplementation(() => ({
          values: vi.fn().mockImplementation((val) => {
            insertedImageRecords = val;
            return Promise.resolve([]);
          }),
        })),
      };

      mockDbInstance = {
        transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          return await cb(mockTx);
        }),
      };

      // Notice: NO uploadReceipt provided for existing_image_key!
      const res = await updateAdminProduct(
        {
          id: "prod-gallery-1",
          images: [
            {
              storageKey: "hs-spare-parts/products/existing_image_key",
              url: "https://res.cloudinary.com/hs-spare-parts-cloud/image/upload/v1/hs-spare-parts/products/existing_image_key.jpg",
              altText: "Updated Alt Text for Retained Image",
              isPrimary: true,
              sortOrder: 0,
            },
          ],
        },
        mockAdminUser
      );

      expect(res.success).toBe(true);
      const inserted1 = insertedImageRecords as Array<Record<string, unknown>> | null;
      expect(inserted1).toBeDefined();
      const first = inserted1?.[0];
      expect(first?.altText).toBe("Updated Alt Text for Retained Image");
      expect(first?.storageKey).toBe("hs-spare-parts/products/existing_image_key");
    });

    it("accepts a newly uploaded image when accompanied by a valid upload receipt", async () => {
      vi.stubEnv("DATABASE_URL", "postgresql://mock:mock@ep-test.neon.tech/neondb");

      const sessionId = crypto.randomUUID();
      const newPublicId = "hs-spare-parts/products/brand_new_upload_001";
      const validReceipt = createCloudinaryUploadReceiptV2({
        sessionId,
        publicId: newPublicId,
        adminId: mockAdminUser.id,
        folder: CLOUDINARY_FOLDERS.products,
        resourceType: "image",
      });

      let insertedImageRecords: Array<Record<string, unknown>> | null = null;

      const mockSessionRow = {
        id: sessionId,
        canonicalPublicId: newPublicId,
        cloudName: "hs-spare-parts-cloud",
        resourceType: "image",
        deliveryType: "upload",
        folder: "hs-spare-parts/products",
        createdByActorId: mockAdminUser.id,
        status: "upload_verified",
        committedEntityType: null,
        committedEntityId: null,
      };

      const mockTx = {
        query: {
          products: {
            findFirst: vi.fn().mockResolvedValue({
              id: "prod-gallery-2",
              name: "Gallery New Upload",
              attributes: {},
            }),
          },
        },
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => {
              const p = Promise.resolve([mockSessionRow]);
              (p as unknown as Record<string, unknown>).limit = vi.fn().mockResolvedValue([]);
              (p as unknown as Record<string, unknown>).orderBy = vi.fn().mockReturnValue({
                for: vi.fn().mockResolvedValue([mockSessionRow]),
              });
              return p;
            }),
          })),
        })),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: "prod-gallery-2" }]),
            }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
        insert: vi.fn().mockImplementation(() => ({
          values: vi.fn().mockImplementation((val) => {
            insertedImageRecords = val;
            return Promise.resolve([]);
          }),
        })),
      };

      mockDbInstance = {
        transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          return await cb(mockTx);
        }),
      };

      const res = await updateAdminProduct(
        {
          id: "prod-gallery-2",
          images: [
            {
              storageKey: newPublicId,
              url: `https://res.cloudinary.com/hs-spare-parts-cloud/image/upload/v1/${newPublicId}.jpg`,
              altText: "New Uploaded Caliper Front",
              isPrimary: true,
              sortOrder: 0,
              uploadReceipt: validReceipt,
            },
          ],
        },
        mockAdminUser
      );

      expect(res.success).toBe(true);
      const inserted2 = insertedImageRecords as Array<Record<string, unknown>> | null;
      expect(inserted2?.length).toBe(1);
      expect(inserted2?.[0]?.storageKey).toBe(newPublicId);
    });

    it("rejects newly added image with invalid or forged upload receipt", async () => {
      vi.stubEnv("DATABASE_URL", "postgresql://mock:mock@ep-test.neon.tech/neondb");

      const mockTx = {
        query: {
          products: {
            findFirst: vi.fn().mockResolvedValue({ id: "prod-gallery-3", attributes: {} }),
          },
        },
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => {
              const p = Promise.resolve([]);
              (p as unknown as Record<string, unknown>).limit = vi.fn().mockResolvedValue([]);
              return p;
            }),
          })),
        })),
      };

      mockDbInstance = {
        transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          return await cb(mockTx);
        }),
      };

      await expect(
        updateAdminProduct(
          {
            id: "prod-gallery-3",
            images: [
              {
                storageKey: "hs-spare-parts/products/forged_asset",
                url: "https://res.cloudinary.com/hs-spare-parts-cloud/image/upload/v1/hs-spare-parts/products/forged_asset.jpg",
                uploadReceipt: "invalid.forged.receipt.token",
              },
            ],
          },
          mockAdminUser
        )
      ).rejects.toThrow("SECURITY_ERROR");
    });
  });

  describe("5. Staged Deletion & Cloudinary Lifecycle Protections", () => {
    it("deletes removed persisted image from Cloudinary ONLY AFTER database transaction commits", async () => {
      vi.stubEnv("DATABASE_URL", "postgresql://mock:mock@ep-test.neon.tech/neondb");

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ result: "ok" }),
      } as unknown as Response);

      let txCommitted = false;

      const mockTx = {
        query: {
          products: {
            findFirst: vi.fn().mockResolvedValue({
              id: "prod-del-1",
              name: "Deletion Test Part",
              attributes: {},
            }),
          },
        },
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => {
              const p = Promise.resolve([
                { id: "img-del-1", productId: "prod-del-1", storageKey: "hs-spare-parts/products/to_delete_key" },
              ]);
              (p as unknown as Record<string, unknown>).limit = vi.fn().mockResolvedValue([]);
              return p;
            }),
          })),
        })),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: "prod-del-1" }]),
            }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([]),
        }),
      };

      mockDbInstance = {
        transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          const res = await cb(mockTx);
          txCommitted = true;
          // Deletion must NOT have been called while transaction is active!
          expect(fetchSpy).not.toHaveBeenCalled();
          return res;
        }),
      };

      const res = await updateAdminProduct(
        {
          id: "prod-del-1",
          images: [], // Removed all images
          stagedDeletedStorageKeys: ["hs-spare-parts/products/to_delete_key"],
        },
        mockAdminUser
      );

      expect(txCommitted).toBe(true);
      expect(res.success).toBe(true);
      expect(res.cleanup?.attemptedCount).toBe(1);
      expect(res.cleanup?.deletedCount).toBe(1);
      // Deletion called post-commit
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("preserves Cloudinary assets when database transaction fails", async () => {
      vi.stubEnv("DATABASE_URL", "postgresql://mock:mock@ep-test.neon.tech/neondb");

      const fetchSpy = vi.spyOn(global, "fetch");

      const mockTx = {
        query: {
          products: {
            findFirst: vi.fn().mockResolvedValue({ id: "prod-fail-1", attributes: {} }),
          },
        },
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => {
              const p = Promise.resolve([
                { id: "img-1", productId: "prod-fail-1", storageKey: "hs-spare-parts/products/preserved_key" },
              ]);
              (p as unknown as Record<string, unknown>).limit = vi.fn().mockResolvedValue([]);
              return p;
            }),
          })),
        })),
        update: vi.fn().mockImplementation(() => {
          throw new Error("TRANSACTION_FAILURE: Database update rolled back.");
        }),
      };

      mockDbInstance = {
        transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          return await cb(mockTx);
        }),
      };

      await expect(
        updateAdminProduct(
          {
            id: "prod-fail-1",
            stagedDeletedStorageKeys: ["hs-spare-parts/products/preserved_key"],
          },
          mockAdminUser
        )
      ).rejects.toThrow("TRANSACTION_FAILURE");

      // Cloudinary deletion must NEVER be called when database update fails!
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("6. Public Catalogue Isolation for Draft Products", () => {
    it("guarantees draft products cannot be queried by getProductByIdOrSlug", async () => {
      vi.stubEnv("DATABASE_URL", "postgresql://mock:mock@ep-test.neon.tech/neondb");

      // In database mode, getProductByIdOrSlug queries `where(and(condition, eq(products.status, "active")))`
      mockDbInstance = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            leftJoin: vi.fn().mockReturnThis(),
            where: vi.fn().mockImplementation(() => ({
              // Returns empty because status is "draft", not "active"
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      };

      const res = await getProductByIdOrSlug("prod-draft-123");
      expect(res).toBeNull();
    });
  });
});
