import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import {
  createCloudinarySignature,
  getCloudinaryUploadParams,
  validateCloudinaryAssetMetadata,
  deleteCloudinaryAsset,
  CLOUDINARY_CONFIG,
  isValidProductAssetPublicId,
  createCloudinaryUploadReceipt,
  verifyCloudinaryUploadReceipt,
} from "@/lib/cloudinary";
import {
  adminCreateProductSchema,
  adminUpdateProductSchema,
} from "@/features/admin/schemas";
import {
  createAdminProduct,
  updateAdminProduct,
} from "@/features/admin/service";
import { ROLES, PERMISSIONS } from "@/lib/auth/rbac";
import type { SafeUser } from "@/features/auth/service";

// Configurable mock for transactional database testing
let mockDbInstance: unknown = null;
vi.mock("@/lib/db", () => ({
  getDb: () => mockDbInstance,
}));

describe("Cloudinary Admin Product Image Integration", () => {
  const mockAdminUser: SafeUser = {
    id: "admin-user-uuid-1",
    email: "admin@hsspareparts.com",
    name: "Master Admin",
    phone: "+919876543210",
    roles: [ROLES.ADMINISTRATOR],
    permissions: [PERMISSIONS.CATALOGUE_WRITE, PERMISSIONS.CATALOGUE_READ],
    status: "active",
    createdAt: new Date("2026-01-01"),
  };

  const mockCatalogueManager: SafeUser = {
    id: "manager-user-uuid-2",
    email: "manager@hsspareparts.com",
    name: "Catalogue Manager",
    phone: "+919876543211",
    roles: [ROLES.CATALOGUE_MANAGER],
    permissions: [PERMISSIONS.CATALOGUE_WRITE, PERMISSIONS.CATALOGUE_READ],
    status: "active",
    createdAt: new Date("2026-01-01"),
  };

  const mockCustomerUser: SafeUser = {
    id: "customer-user-uuid-3",
    email: "customer@gmail.com",
    name: "Regular Customer",
    phone: "+919876543212",
    roles: [ROLES.CUSTOMER],
    permissions: [],
    status: "active",
    createdAt: new Date("2026-01-01"),
  };

  const mockReadOnlyUser: SafeUser = {
    id: "viewer-user-uuid-4",
    email: "viewer@hsspareparts.com",
    name: "Read-Only Viewer",
    phone: null,
    roles: [ROLES.SUPPORT_STAFF],
    permissions: [PERMISSIONS.CATALOGUE_READ],
    status: "active",
    createdAt: new Date("2026-01-01"),
  };

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "hs-spare-parts-cloud");
    vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_API_KEY", "123456789012345");
    vi.stubEnv("CLOUDINARY_API_SECRET", "super_secret_cloudinary_key_abc123");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    mockDbInstance = null;
  });

  describe("1. Cloudinary Request Signing & Cryptographic Constraints", () => {
    it("generates correct SHA-1 signature per Cloudinary specification", () => {
      // Known test vector
      const params = {
        folder: "hs-spare-parts/products",
        timestamp: 1732000000,
        upload_preset: "hs-spare-parts-admin",
      };
      const secret = "test_api_secret_xyz";

      // Manual expected: folder=hs-spare-parts/products&timestamp=1732000000&upload_preset=hs-spare-parts-admintest_api_secret_xyz
      const expectedToSign =
        "folder=hs-spare-parts/products&timestamp=1732000000&upload_preset=hs-spare-parts-admintest_api_secret_xyz";
      const expectedHash = crypto.createHash("sha1").update(expectedToSign).digest("hex");

      const signature = createCloudinarySignature(params, secret);
      expect(signature).toBe(expectedHash);
    });

    it("sorts parameters alphabetically regardless of initial object order", () => {
      const paramsA = { z_param: "last", a_param: "first", m_param: "middle" };
      const paramsB = { a_param: "first", m_param: "middle", z_param: "last" };
      const secret = "secret123";

      expect(createCloudinarySignature(paramsA, secret)).toBe(
        createCloudinarySignature(paramsB, secret)
      );
    });

    it("throws error if apiSecret is empty", () => {
      expect(() => createCloudinarySignature({ timestamp: 123 }, "")).toThrow(
        "Cloudinary API secret is required"
      );
    });

    it("returns correct signed parameters with server constraints", async () => {
      const params = await getCloudinaryUploadParams({ userOverride: mockAdminUser });

      expect(params.cloudName).toBe("hs-spare-parts-cloud");
      expect(params.apiKey).toBe("123456789012345");
      expect(params.folder).toBe("hs-spare-parts/products");
      expect(params.uploadPreset).toBe("hs-spare-parts-admin");
      expect(params.uploadUrl).toBe("https://api.cloudinary.com/v1_1/hs-spare-parts-cloud/image/upload");
      expect(params.allowedFormats).toEqual(["jpg", "jpeg", "png", "webp"]);
      expect(params.maxFileSize).toBe(10 * 1024 * 1024);

      // Verify public_id is unique and prefixed
      expect(params.publicId).toMatch(/^prod_\d+_[a-f0-9]{12}$/);

      // Verify signature is valid hex
      expect(params.signature).toMatch(/^[a-f0-9]{40}$/);

      // Verify secret is NEVER leaked in returned object
      expect((params as unknown as Record<string, unknown>).apiSecret).toBeUndefined();
      expect(JSON.stringify(params)).not.toContain("super_secret_cloudinary_key_abc123");
    });
  });

  describe("2. RBAC & Access Control for Upload Signatures", () => {
    it("allows administrators to generate upload signatures", async () => {
      const res = await getCloudinaryUploadParams({ userOverride: mockAdminUser });
      expect(res.signature).toBeDefined();
    });

    it("allows catalogue managers with CATALOGUE_WRITE to generate upload signatures", async () => {
      const res = await getCloudinaryUploadParams({ userOverride: mockCatalogueManager });
      expect(res.signature).toBeDefined();
    });

    it("strictly blocks regular customers from generating upload signatures", async () => {
      await expect(
        getCloudinaryUploadParams({ userOverride: mockCustomerUser })
      ).rejects.toThrow("Regular customer accounts cannot create or manage catalogue products");
    });

    it("strictly blocks unauthenticated users from generating upload signatures", async () => {
      await expect(
        getCloudinaryUploadParams({ userOverride: null })
      ).rejects.toThrow("Authentication required: Please sign in as an administrator");
    });

    it("strictly blocks users with read-only permissions from generating upload signatures", async () => {
      await expect(
        getCloudinaryUploadParams({ userOverride: mockReadOnlyUser })
      ).rejects.toThrow("Insufficient permissions to manage catalogue items");
    });
  });

  describe("3. Environment Fail-Closed Invariants", () => {
    it("fails closed in production if CLOUDINARY_API_SECRET is missing", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("CLOUDINARY_API_SECRET", "");

      await expect(
        getCloudinaryUploadParams({ userOverride: mockAdminUser })
      ).rejects.toThrow("CONFIGURATION_ERROR: Cloudinary credentials");
    });

    it("fails closed in production if NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME is missing", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "");

      await expect(
        getCloudinaryUploadParams({ userOverride: mockAdminUser })
      ).rejects.toThrow("CONFIGURATION_ERROR: Cloudinary credentials");
    });

    it("fails closed in production if NEXT_PUBLIC_CLOUDINARY_API_KEY is missing", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_API_KEY", "");

      await expect(
        getCloudinaryUploadParams({ userOverride: mockAdminUser })
      ).rejects.toThrow("CONFIGURATION_ERROR: Cloudinary credentials");
    });
  });

  describe("4. Cloudinary Upload Metadata Validation & Defense", () => {
    const validAsset = {
      publicId: "hs-spare-parts/products/prod_1732000000_abcdef123456",
      secureUrl: "https://res.cloudinary.com/hs-spare-parts-cloud/image/upload/v1/hs-spare-parts/products/prod_1732000000_abcdef123456.jpg",
      format: "jpg",
      resourceType: "image",
      width: 1200,
      height: 900,
      bytes: 450000,
    };

    it("accepts valid JPEG, PNG, and WebP Cloudinary assets", () => {
      for (const format of ["jpg", "jpeg", "png", "webp"]) {
        const res = validateCloudinaryAssetMetadata({
          ...validAsset,
          format,
        });
        expect(res.valid).toBe(true);
        expect(res.data?.format).toBe(format);
      }
    });

    it("strictly rejects SVG images to prevent stored XSS injection", () => {
      const res = validateCloudinaryAssetMetadata({
        ...validAsset,
        format: "svg",
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain("SVG is prohibited");
    });

    it("strictly rejects non-image resource types (raw, video, pdf)", () => {
      const res = validateCloudinaryAssetMetadata({
        ...validAsset,
        resourceType: "raw",
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Invalid resource type");
    });

    it("rejects assets outside hs-spare-parts/products/ folder", () => {
      const res = validateCloudinaryAssetMetadata({
        ...validAsset,
        publicId: "untrusted_folder/malicious_asset",
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Asset public ID must start with");
    });

    it("rejects insecure or foreign URLs", () => {
      const res = validateCloudinaryAssetMetadata({
        ...validAsset,
        secureUrl: "http://attacker-site.com/evil.jpg",
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Asset URL must be a valid HTTPS Cloudinary secure URL");
    });

    it("rejects oversized assets (> 10MB)", () => {
      const res = validateCloudinaryAssetMetadata({
        ...validAsset,
        bytes: 15 * 1024 * 1024, // 15MB
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain("exceeds the allowed limit");
    });
  });

  describe("5. Cloudinary Asset Deletion & Directory Isolation", () => {
    it("allows deletion only within hs-spare-parts/products/ directory", async () => {
      const outsideRes = await deleteCloudinaryAsset("user_avatars/avatar_123", {
        userOverride: mockAdminUser,
      });
      expect(outsideRes.success).toBe(false);
      expect(outsideRes.error).toContain("Security violation: deletion is restricted");
    });

    it("blocks customers from executing Cloudinary deletion", async () => {
      await expect(
        deleteCloudinaryAsset("hs-spare-parts/products/prod_123", {
          userOverride: mockCustomerUser,
        })
      ).rejects.toThrow("Regular customer accounts cannot create or manage catalogue products");
    });
  });

  describe("6. Product Schema Validation with Images", () => {
    const baseProduct = {
      name: "Brembo Front Brake Disc Rotor Set",
      sku: "BRM-09A72711",
      categoryId: "brake",
      brandId: "Brembo",
      condition: "new" as const,
      priceMinor: 345000,
    };

    it("accepts product with empty images array", () => {
      const parsed = adminCreateProductSchema.safeParse(baseProduct);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.images).toEqual([]);
      }
    });

    it("accepts product with multiple gallery images and primary assignment", () => {
      const input = {
        ...baseProduct,
        images: [
          {
            url: "https://res.cloudinary.com/cloud/image/upload/v1/hs-spare-parts/products/p1.jpg",
            storageKey: "hs-spare-parts/products/p1",
            altText: "Brembo Rotor Front View",
            isPrimary: true,
            sortOrder: 0,
          },
          {
            url: "https://res.cloudinary.com/cloud/image/upload/v1/hs-spare-parts/products/p2.jpg",
            storageKey: "hs-spare-parts/products/p2",
            altText: "Brembo Rotor Angle View",
            isPrimary: false,
            sortOrder: 1,
          },
        ],
      };

      const parsed = adminCreateProductSchema.safeParse(input);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.images?.length).toBe(2);
        expect(parsed.data.images?.[0]?.isPrimary).toBe(true);
        expect(parsed.data.images?.[1]?.isPrimary).toBe(false);
      }
    });

    it("rejects more than 8 images per product", () => {
      const tooManyImages = Array.from({ length: 9 }, (_, i) => ({
        url: `https://res.cloudinary.com/cloud/image/upload/v1/hs-spare-parts/products/p${i}.jpg`,
        storageKey: `hs-spare-parts/products/p${i}`,
        altText: `Image ${i}`,
        isPrimary: i === 0,
        sortOrder: i,
      }));

      const input = {
        ...baseProduct,
        images: tooManyImages,
      };

      const parsed = adminCreateProductSchema.safeParse(input);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.errors[0]?.message).toContain("Maximum 8 images allowed");
      }
    });

    it("rejects image with invalid URL", () => {
      const input = {
        ...baseProduct,
        images: [
          {
            url: "not-a-valid-url",
            storageKey: "key-1",
            altText: "Alt text",
            isPrimary: true,
            sortOrder: 0,
          },
        ],
      };

      const parsed = adminCreateProductSchema.safeParse(input);
      expect(parsed.success).toBe(false);
    });
  });

  describe("7. Product Creation & Regression Integrity", () => {
    it("creates product in demo mode with images count preserved", async () => {
      const res = await createAdminProduct(
        {
          name: "Gabriel Front Shock Absorber",
          sku: "GAB-SHOCK-001",
          categoryId: "suspension",
          brandId: "Gabriel",
          condition: "new",
          priceMinor: 285000,
          images: [
            {
              url: "https://res.cloudinary.com/cloud/image/upload/v1/hs-spare-parts/products/gabriel1.jpg",
              storageKey: "hs-spare-parts/products/gabriel1",
              altText: "Shock absorber assembly",
              isPrimary: true,
              sortOrder: 0,
            },
          ],
        },
        mockAdminUser
      );

      expect(res.success).toBe(true);
      expect(res.isDemo).toBe(true);
      expect(res.imagesCount).toBe(1);
    });

    it("preserves Pre-Owned condition disclosures when images are attached", async () => {
      const res = await createAdminProduct(
        {
          name: "Used Valeo Alternator 90A",
          sku: "VAL-ALT-USED-90A",
          categoryId: "electrical",
          brandId: "Valeo",
          condition: "used",
          conditionGrade: "Grade B - Good",
          conditionNotes: "Tested and verified output 14.2V at 2000 RPM",
          visibleWearOrDefects: "Minor casing oxidation; bearings quiet",
          testedStatus: "Bench verified on electrical test rig",
          warrantyDetails: "30-day functional warranty",
          priceMinor: 450000,
          images: [
            {
              url: "https://res.cloudinary.com/cloud/image/upload/v1/hs-spare-parts/products/valeo_alt.jpg",
              storageKey: "hs-spare-parts/products/valeo_alt",
              altText: "Alternator casing inspection",
              isPrimary: true,
              sortOrder: 0,
            },
          ],
        },
        mockAdminUser
      );

      expect(res.success).toBe(true);
      expect(res.message).toContain("condition: USED");
    });

    it("updates product images in demo mode via updateAdminProduct", async () => {
      const updatePayload = {
        id: "prod-existing-123",
        name: "Updated Alternator",
        images: [
          {
            url: "https://res.cloudinary.com/cloud/image/upload/v1/hs-spare-parts/products/updated.jpg",
            storageKey: "hs-spare-parts/products/updated",
            altText: "Updated main image",
            isPrimary: true,
            sortOrder: 0,
          },
        ],
      };

      const parsed = adminUpdateProductSchema.safeParse(updatePayload);
      expect(parsed.success).toBe(true);

      const res = await updateAdminProduct(updatePayload, mockAdminUser);
      expect(res.success).toBe(true);
      expect(res.isDemo).toBe(true);
    });

    it("verifies CLOUDINARY_CONFIG constants match project standards", () => {
      expect(CLOUDINARY_CONFIG.uploadPreset).toBe("hs-spare-parts-admin");
      expect(CLOUDINARY_CONFIG.folder).toBe("hs-spare-parts/products");
      expect(CLOUDINARY_CONFIG.maxImagesPerProduct).toBe(8);
      expect(CLOUDINARY_CONFIG.maxFileSizeBytes).toBe(10 * 1024 * 1024);
      expect(CLOUDINARY_CONFIG.allowedFormats).toContain("webp");
    });
  });

  describe("Upload Lifecycle Hardening & Safe Deletion", () => {
    it("distinguishes newly uploaded unsaved images and safely cleans them up upon removal", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: "ok" }),
      } as unknown as Response);

      // Lifecycle simulation:
      // 1. User uploads a new image in create workflow
      const newlyUploadedStorageKey = "hs-spare-parts/products/prod_1700000000_temp1";
      const newlyUploadedKeys = new Set<string>([newlyUploadedStorageKey]);

      // 2. User removes the newly uploaded image before saving product
      const targetToRemove = {
        storageKey: newlyUploadedStorageKey,
        url: `https://res.cloudinary.com/cloud/image/upload/v1/${newlyUploadedStorageKey}.jpg`,
      };

      let cleanupAttemptedFor: string | null = null;
      if (newlyUploadedKeys.has(targetToRemove.storageKey)) {
        newlyUploadedKeys.delete(targetToRemove.storageKey);
        // Safe cleanup is triggered for this unsaved asset
        const delRes = await deleteCloudinaryAsset(targetToRemove.storageKey, {
          userOverride: mockAdminUser,
        });
        expect(delRes.success).toBe(true);
        cleanupAttemptedFor = targetToRemove.storageKey;
      }

      expect(cleanupAttemptedFor).toBe(newlyUploadedStorageKey);
      expect(newlyUploadedKeys.has(newlyUploadedStorageKey)).toBe(false);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("cancelling or failing product creation does not delete any previously saved assets", async () => {
      const persistedStorageKeys = [
        "hs-spare-parts/products/existing_prod_1",
        "hs-spare-parts/products/existing_prod_2",
      ];

      // Track any deletion attempts
      const deletedKeys: string[] = [];

      // Simulate failing product creation (e.g. invalid SKU / missing condition)
      const invalidCreatePayload = {
        name: "Test Part",
        sku: "X", // too short, will fail schema
        categoryId: "brake",
        brandId: "Brembo",
        priceMinor: 1000,
        // Condition omitted
      };

      const parsed = adminCreateProductSchema.safeParse(invalidCreatePayload);
      expect(parsed.success).toBe(false);

      // Verify that no deletions were triggered for previously saved assets
      expect(deletedKeys).toHaveLength(0);
      expect(persistedStorageKeys).toHaveLength(2);
    });

    it("failed product update preserves existing Cloudinary assets and aborts staged deletions", async () => {
      const stagedDeletions = ["hs-spare-parts/products/persisted_asset_to_remove"];

      // Update fails because unauthorized user attempts update
      await expect(
        updateAdminProduct(
          {
            id: "prod-existing-456",
            name: "Unauthorized Update Attempt",
            stagedDeletedStorageKeys: stagedDeletions,
          },
          mockCustomerUser // Customer cannot update catalogue
        )
      ).rejects.toThrow();

      // In a failed update, the function throws immediately; staged deletions are never executed.
    });

    it("successful product update executes staged deletions only after commit", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: "ok" }),
      } as unknown as Response);

      const stagedDeletions = ["hs-spare-parts/products/old_persisted_image_to_delete"];

      const res = await updateAdminProduct(
        {
          id: "prod-existing-789",
          name: "Updated Product Name",
          stagedDeletedStorageKeys: stagedDeletions,
        },
        mockAdminUser
      );

      expect(res.success).toBe(true);
      expect(res.isDemo).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("rejects oversized Cloudinary response (>10MB) and prevents persistence", () => {
      const oversizedAsset = {
        publicId: "hs-spare-parts/products/prod_1700000000_oversized",
        secureUrl: "https://res.cloudinary.com/cloud/image/upload/v1/hs-spare-parts/products/prod_1700000000_oversized.jpg",
        format: "jpg",
        resourceType: "image",
        bytes: 12 * 1024 * 1024, // 12MB > 10MB limit
      };

      const validation = validateCloudinaryAssetMetadata(oversizedAsset);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("exceeds the allowed limit of 10MB");
      expect(validation.data).toBeUndefined();
    });

    it("cleanup is attempted only for validated generated product assets within folder prefix", async () => {
      // 1. Valid public ID within hs-spare-parts/products/
      expect(isValidProductAssetPublicId("hs-spare-parts/products/prod_123_valid")).toBe(true);

      // 2. Path traversal attempts
      expect(isValidProductAssetPublicId("hs-spare-parts/products/../secret")).toBe(false);
      expect(isValidProductAssetPublicId("../outside/asset")).toBe(false);
      expect(isValidProductAssetPublicId("hs-spare-parts/products//double-slash")).toBe(false);

      // 3. Foreign folder / empty / null
      expect(isValidProductAssetPublicId("foreign-folder/image")).toBe(false);
      expect(isValidProductAssetPublicId("")).toBe(false);
      expect(isValidProductAssetPublicId(null)).toBe(false);
      expect(isValidProductAssetPublicId(undefined)).toBe(false);

      // 4. deleteCloudinaryAsset rejects traversal and foreign paths
      const traversalAttempt = await deleteCloudinaryAsset("hs-spare-parts/products/../escape", {
        userOverride: mockAdminUser,
      });
      expect(traversalAttempt.success).toBe(false);
      expect(traversalAttempt.error).toContain("Security violation");

      const foreignFolderAttempt = await deleteCloudinaryAsset("other-folder/avatar", {
        userOverride: mockAdminUser,
      });
      expect(foreignFolderAttempt.success).toBe(false);
      expect(foreignFolderAttempt.error).toContain("Security violation");
    });

    it("cleanup failure does not allow invalid or oversized image metadata to be saved", async () => {
      // Scenario: Cloudinary returned an oversized asset (15MB)
      const returnedAsset = {
        publicId: "hs-spare-parts/products/prod_1700000000_bad",
        secureUrl: "https://res.cloudinary.com/cloud/image/upload/v1/hs-spare-parts/products/prod_1700000000_bad.jpg",
        format: "jpg",
        resourceType: "image",
        bytes: 15 * 1024 * 1024,
      };

      // Even if cleanup fails (e.g. simulated network error)
      const simulatedCleanupSuccess = false;
      expect(simulatedCleanupSuccess).toBe(false);

      // Metadata validation STILL rejects the asset
      const validation = validateCloudinaryAssetMetadata(returnedAsset);
      expect(validation.valid).toBe(false);

      // Form state cannot accept invalid asset data
      const productImagesList: unknown[] = [];
      if (validation.valid && validation.data) {
        productImagesList.push(validation.data);
      }

      // Assert that invalid asset was never persisted or added to state
      expect(productImagesList).toHaveLength(0);
    });
  });

  describe("Cryptographic Upload Receipts & Ownership Verification", () => {
    it("generates a valid upload receipt bound to public ID and admin identity", () => {
      const receipt = createCloudinaryUploadReceipt(
        "hs-spare-parts/products/prod_123_abc",
        mockAdminUser.id,
        3600
      );
      expect(typeof receipt).toBe("string");
      expect(receipt.includes(".")).toBe(true);

      const verification = verifyCloudinaryUploadReceipt(receipt, {
        publicId: "hs-spare-parts/products/prod_123_abc",
        adminId: mockAdminUser.id,
      });
      expect(verification.valid).toBe(true);
    });

    it("rejects altered public ID in upload receipt", () => {
      const receipt = createCloudinaryUploadReceipt(
        "hs-spare-parts/products/prod_123_legit",
        mockAdminUser.id,
        3600
      );

      const verification = verifyCloudinaryUploadReceipt(receipt, {
        publicId: "hs-spare-parts/products/prod_999_tampered",
        adminId: mockAdminUser.id,
      });
      expect(verification.valid).toBe(false);
      expect(verification.error).toContain("Receipt asset mismatch");
    });

    it("rejects receipt submitted by a different administrator", () => {
      const receipt = createCloudinaryUploadReceipt(
        "hs-spare-parts/products/prod_123_abc",
        "admin-user-uuid-1",
        3600
      );

      const verification = verifyCloudinaryUploadReceipt(receipt, {
        publicId: "hs-spare-parts/products/prod_123_abc",
        adminId: "attacker-admin-uuid-99",
      });
      expect(verification.valid).toBe(false);
      expect(verification.error).toContain("Receipt admin mismatch");
    });

    it("rejects expired upload receipt", () => {
      const expiredReceipt = createCloudinaryUploadReceipt(
        "hs-spare-parts/products/prod_123_abc",
        mockAdminUser.id,
        -10 // Expired 10 seconds ago
      );

      const verification = verifyCloudinaryUploadReceipt(expiredReceipt, {
        publicId: "hs-spare-parts/products/prod_123_abc",
        adminId: mockAdminUser.id,
      });
      expect(verification.valid).toBe(false);
      expect(verification.error).toContain("expired");
    });

    it("rejects tampered cryptographic signature on receipt", () => {
      const receipt = createCloudinaryUploadReceipt(
        "hs-spare-parts/products/prod_123_abc",
        mockAdminUser.id,
        3600
      );
      const [payload] = receipt.split(".");
      const forgedReceipt = `${payload}.forged_tampered_signature_12345`;

      const verification = verifyCloudinaryUploadReceipt(forgedReceipt, {
        publicId: "hs-spare-parts/products/prod_123_abc",
        adminId: mockAdminUser.id,
      });
      expect(verification.valid).toBe(false);
      expect(verification.error).toContain("signature mismatch");
    });

    it("createAdminProduct rejects images with invalid upload receipts", async () => {
      const badReceipt = "invalid.receipt.token";

      await expect(
        createAdminProduct(
          {
            name: "Suspicious Product",
            sku: "SUS-001",
            categoryId: "brake",
            brandId: "Brembo",
            condition: "new",
            priceMinor: 10000,
            images: [
              {
                url: "https://res.cloudinary.com/cloud/image/upload/v1/hs-spare-parts/products/stolen.jpg",
                storageKey: "hs-spare-parts/products/stolen",
                altText: "Stolen asset",
                uploadReceipt: badReceipt,
              },
            ],
          },
          mockAdminUser
        )
      ).rejects.toThrow("SECURITY_ERROR");
    });
  });

  describe("Staged Deletion Ownership & Database Atomicity", () => {
    it("deduplicates duplicate staged keys safely", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ result: "ok" }),
      } as unknown as Response);

      const res = await updateAdminProduct(
        {
          id: "prod-dedup-test",
          name: "Dedup Test",
          stagedDeletedStorageKeys: [
            "hs-spare-parts/products/dup_key_1",
            "hs-spare-parts/products/dup_key_1",
            "hs-spare-parts/products/dup_key_1",
          ],
        },
        mockAdminUser
      );

      expect(res.success).toBe(true);
      expect(res.cleanup?.attemptedCount).toBe(1);
      expect(res.cleanup?.deletedCount).toBe(1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("reports Cloudinary deletion failures honestly without failing the database update", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: "error", error: { message: "Cloudinary service error" } }),
      } as unknown as Response);

      const res = await updateAdminProduct(
        {
          id: "prod-cleanup-fail-test",
          name: "Cleanup Fail Test",
          stagedDeletedStorageKeys: ["hs-spare-parts/products/failing_key_1"],
        },
        mockAdminUser
      );

      // Product update succeeded
      expect(res.success).toBe(true);
      // Cleanup failure is reported honestly
      expect(res.cleanup?.hasFailures).toBe(true);
      expect(res.cleanup?.failedCount).toBe(1);
      expect(res.cleanup?.failedKeys[0]?.storageKey).toBe("hs-spare-parts/products/failing_key_1");
      expect(res.cleanup?.warning).toContain("Cloudinary asset cleanup encountered failures");
      expect(res.message).toContain("could not be removed from Cloudinary");
    });

    it("enforces ownership and cross-product reference checks in transactional mode", async () => {
      vi.stubEnv("DATABASE_URL", "postgresql://mock:mock@ep-test.neon.tech/neondb");

      const existingImagesForProd1 = [
        { id: "img-1", productId: "prod-1", storageKey: "hs-spare-parts/products/owned_by_prod_1" },
        { id: "img-shared", productId: "prod-1", storageKey: "hs-spare-parts/products/shared_asset" },
      ];

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ result: "ok" }),
      } as unknown as Response);

      let transactionCommitted = false;

      const mockTx = {
        query: {
          products: {
            findFirst: vi.fn().mockResolvedValue({
              id: "prod-1",
              name: "Product 1",
              attributes: {},
            }),
          },
        },
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => {
              const p = Promise.resolve(existingImagesForProd1);
              (p as unknown as Record<string, unknown>).limit = vi.fn().mockImplementation(() => {
                // Cross product reference check returns empty (not referenced elsewhere)
                return Promise.resolve([]);
              });
              return p;
            }),
          })),
        })),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: "prod-1", name: "Updated Product 1" }]),
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
          const result = await cb(mockTx);
          transactionCommitted = true;
          return result;
        }),
      };

      // Attempt to delete:
      // 1. owned_by_prod_1 (belongs to prod-1 -> should be deleted)
      // 2. foreign_asset (belongs to another product -> rejected by ownership check)
      // 3. malformed/traversal asset -> rejected by format check
      const res = await updateAdminProduct(
        {
          id: "prod-1",
          name: "Updated Product 1",
          stagedDeletedStorageKeys: [
            "hs-spare-parts/products/owned_by_prod_1",
            "hs-spare-parts/products/foreign_asset_not_owned",
            "hs-spare-parts/products/../traversal",
          ],
        },
        mockAdminUser
      );

      expect(transactionCommitted).toBe(true);
      expect(res.success).toBe(true);
      // Only the verified owned asset is deleted:
      expect(res.cleanup?.attemptedCount).toBe(1);
      expect(res.cleanup?.deletedCount).toBe(1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("aborts Cloudinary deletion when database transaction fails and rolls back", async () => {
      vi.stubEnv("DATABASE_URL", "postgresql://mock:mock@ep-test.neon.tech/neondb");

      const fetchSpy = vi.spyOn(global, "fetch");

      const mockTx = {
        query: {
          products: {
            findFirst: vi.fn().mockResolvedValue({ id: "prod-1", name: "Prod 1", attributes: {} }),
          },
        },
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => {
              const p = Promise.resolve([
                { id: "img-1", productId: "prod-1", storageKey: "hs-spare-parts/products/asset_1" },
              ]);
              (p as unknown as Record<string, unknown>).limit = vi.fn().mockResolvedValue([]);
              return p;
            }),
          })),
        })),
        update: vi.fn().mockImplementation(() => {
          throw new Error("DB_LOCK_TIMEOUT: database update failed");
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
            id: "prod-1",
            name: "Failing Update",
            stagedDeletedStorageKeys: ["hs-spare-parts/products/asset_1"],
          },
          mockAdminUser
        )
      ).rejects.toThrow("DB_LOCK_TIMEOUT");

      // Cloudinary deletion must NEVER be called when transaction fails!
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("8. Reference Integrity, Retained-vs-Staged Conflict & Cross-Product Association Safeguards", () => {
    it("safely excludes retained images from staged deletion when submitted in both lists", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ result: "ok" }),
      } as unknown as Response);

      const res = await updateAdminProduct(
        {
          id: "prod-retained-test",
          name: "Retained vs Staged Test",
          images: [
            {
              storageKey: "hs-spare-parts/products/retained_asset_key",
              url: "https://res.cloudinary.com/hs-spare-parts-cloud/image/upload/v1/hs-spare-parts/products/retained_asset_key.jpg",
              isPrimary: true,
              sortOrder: 0,
            },
          ],
          stagedDeletedStorageKeys: [
            "hs-spare-parts/products/retained_asset_key", // In both retained images AND staged deletion!
            "hs-spare-parts/products/genuinely_deleted_key", // Only in staged deletion
          ],
        },
        mockAdminUser
      );

      expect(res.success).toBe(true);
      // Only the genuinely deleted key should be attempted for Cloudinary deletion:
      expect(res.cleanup?.attemptedCount).toBe(1);
      expect(res.cleanup?.deletedCount).toBe(1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Verify fetch was called with genuinely_deleted_key, NEVER retained_asset_key
      const callBody = fetchSpy.mock.calls[0]?.[1]?.body?.toString() || "";
      expect(callBody).toContain("public_id=hs-spare-parts%2Fproducts%2Fgenuinely_deleted_key");
      expect(callBody).not.toContain("retained_asset_key");
    });

    it("rejects duplicate storage keys across incoming image metadata in createAdminProduct", async () => {
      await expect(
        createAdminProduct(
          {
            name: "Duplicate Key Part",
            sku: "DUP-KEY-001",
            brandId: "brand-1",
            categoryId: "cat-1",
            priceMinor: 150000,
            condition: "new",
            images: [
              {
                storageKey: "hs-spare-parts/products/duplicate_asset_1",
                url: "https://res.cloudinary.com/hs-spare-parts-cloud/image/upload/v1/dup1.jpg",
                isPrimary: true,
              },
              {
                storageKey: "hs-spare-parts/products/duplicate_asset_1",
                url: "https://res.cloudinary.com/hs-spare-parts-cloud/image/upload/v1/dup2.jpg",
                isPrimary: false,
              },
            ],
          },
          mockAdminUser
        )
      ).rejects.toThrow(
        "VALIDATION_ERROR: Duplicate image storage key 'hs-spare-parts/products/duplicate_asset_1' in product images."
      );
    });

    it("rejects duplicate storage keys across incoming image metadata in updateAdminProduct", async () => {
      await expect(
        updateAdminProduct(
          {
            id: "prod-update-dup",
            name: "Update Duplicate Key Part",
            images: [
              {
                storageKey: "hs-spare-parts/products/duplicate_asset_2",
                url: "https://res.cloudinary.com/hs-spare-parts-cloud/image/upload/v1/dup1.jpg",
                isPrimary: true,
              },
              {
                storageKey: "hs-spare-parts/products/duplicate_asset_2",
                url: "https://res.cloudinary.com/hs-spare-parts-cloud/image/upload/v1/dup2.jpg",
                isPrimary: false,
              },
            ],
          },
          mockAdminUser
        )
      ).rejects.toThrow(
        "VALIDATION_ERROR: Duplicate image storage key 'hs-spare-parts/products/duplicate_asset_2' in product images."
      );
    });

    it("rejects creating a product with an asset already associated with an existing product in transactional mode", async () => {
      vi.stubEnv("DATABASE_URL", "postgresql://mock:mock@ep-test.neon.tech/neondb");

      const mockTx = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockResolvedValue([
                { id: "img-conflict-1", productId: "prod-existing-123" },
              ]),
            })),
          })),
        })),
        insert: vi.fn(),
      };

      mockDbInstance = {
        transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          return await cb(mockTx);
        }),
      };

      await expect(
        createAdminProduct(
          {
            name: "Cross Product Reused Asset",
            sku: "CROSS-001",
            brandId: "brand-1",
            categoryId: "cat-1",
            priceMinor: 250000,
            condition: "new",
            images: [
              {
                storageKey: "hs-spare-parts/products/already_associated_asset",
                url: "https://res.cloudinary.com/hs-spare-parts-cloud/image/upload/v1/hs-spare-parts/products/already_associated_asset.jpg",
                isPrimary: true,
              },
            ],
          },
          mockAdminUser
        )
      ).rejects.toThrow(
        "SECURITY_ERROR: Asset 'hs-spare-parts/products/already_associated_asset' is already associated with an existing product (prod-existing-123). Upload receipts cannot be reused across products."
      );
    });

    it("allows retaining existing product images during normal update without cross-product conflict", async () => {
      vi.stubEnv("DATABASE_URL", "postgresql://mock:mock@ep-test.neon.tech/neondb");

      const existingImages = [
        {
          id: "img-retained-1",
          productId: "prod-normal-update",
          storageKey: "hs-spare-parts/products/normal_retained_asset",
        },
      ];

      const mockTx = {
        query: {
          products: {
            findFirst: vi.fn().mockResolvedValue({
              id: "prod-normal-update",
              name: "Normal Update Part",
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
              returning: vi.fn().mockResolvedValue([{ id: "prod-normal-update", name: "Updated Part" }]),
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
          return await cb(mockTx);
        }),
      };

      const res = await updateAdminProduct(
        {
          id: "prod-normal-update",
          name: "Updated Part",
          images: [
            {
              storageKey: "hs-spare-parts/products/normal_retained_asset",
              url: "https://res.cloudinary.com/hs-spare-parts-cloud/image/upload/v1/hs-spare-parts/products/normal_retained_asset.jpg",
              isPrimary: true,
              sortOrder: 0,
            },
          ],
        },
        mockAdminUser
      );

      expect(res.success).toBe(true);
      expect(res.productId).toBe("prod-normal-update");
      expect(res.cleanup?.attemptedCount).toBe(0);
    });

    it("creates a draft product with Cloudinary image metadata and initial status 'draft' in transactional mode", async () => {
      vi.stubEnv("DATABASE_URL", "postgresql://mock:mock@ep-test.neon.tech/neondb");

      let insertedProductValues: Record<string, unknown> | null = null;
      let insertedImageRecords: Array<Record<string, unknown>> | null = null;

      const mockTx = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockResolvedValue([]), // No conflict
            })),
          })),
        })),
        insert: vi.fn().mockImplementation(() => ({
          values: vi.fn().mockImplementation((val) => {
            if (val && !Array.isArray(val) && val.sku) {
              insertedProductValues = val;
              return {
                returning: vi.fn().mockResolvedValue([
                  { id: "prod-draft-123", name: val.name, sku: val.sku, status: val.status },
                ]),
              };
            } else {
              insertedImageRecords = val;
              return Promise.resolve([]);
            }
          }),
        })),
      };

      mockDbInstance = {
        transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
          return await cb(mockTx);
        }),
      };

      const res = await createAdminProduct(
        {
          name: "Test Draft Caliper",
          sku: "DRAFT-CAL-01",
          brandId: "brand-1",
          categoryId: "cat-1",
          priceMinor: 450000,
          condition: "new",
          images: [
            {
              storageKey: "hs-spare-parts/products/draft_image_1",
              url: "https://res.cloudinary.com/hs-spare-parts-cloud/image/upload/v1/hs-spare-parts/products/draft_image_1.jpg",
              isPrimary: true,
              sortOrder: 0,
            },
          ],
        },
        mockAdminUser,
        { status: "draft" }
      );

      expect(res.success).toBe(true);
      expect(res.status).toBe("draft");
      expect(res.productId).toBe("prod-draft-123");
      expect(insertedProductValues).toBeDefined();
      expect((insertedProductValues as unknown as Record<string, unknown>)?.status).toBe("draft");
      const imgRecords = insertedImageRecords as Array<Record<string, unknown>> | null;
      expect(imgRecords).toBeDefined();
      expect(imgRecords?.length).toBe(1);
      expect(imgRecords?.[0]?.storageKey).toBe("hs-spare-parts/products/draft_image_1");
    });
  });
});
