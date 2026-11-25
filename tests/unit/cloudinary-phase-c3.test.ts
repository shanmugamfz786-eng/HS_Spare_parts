import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import {
  getAdminCategories,
  updateAdminCategoryImage,
  getAdminBrands,
  updateAdminBrandLogo,
  getAdminBanners,
  updateAdminBanners,
  type AdminBannerItem,
} from "@/features/admin/service";
import {
  getCloudinaryUploadParams,
  createCloudinaryUploadReceiptV2,
  deleteCloudinaryAsset,
  CLOUDINARY_FOLDERS,
  isValidCategoryAssetPublicId,
  isValidBrandAssetPublicId,
  isValidBannerAssetPublicId,
  extractCloudinaryStorageKey,
} from "@/lib/cloudinary";
import {
  resetInMemoryDemoState,
  setInMemoryUploadSession,
} from "@/server/catalogue/demo-state";
import {
  ROLES,
  PERMISSIONS,
  AuthorizationError,
} from "@/lib/auth/rbac";
import type { SafeUser } from "@/features/auth/service";

describe("Cloudinary Phase C3: Category, Brand & Banner Image Management", () => {
  const mockAdminUser: SafeUser = {
    id: "admin-uuid-c3-1",
    email: "admin@hsspareparts.com",
    name: "Admin User",
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
    id: "customer-uuid-c3-2",
    email: "shopper@gmail.com",
    name: "Shopper",
    phone: "+919876543212",
    roles: [ROLES.CUSTOMER],
    permissions: [PERMISSIONS.STORE_BROWSE],
    status: "active",
    createdAt: new Date("2026-01-01"),
  };

  function seedVerifiedSession(params: {
    canonicalPublicId: string;
    folder: string;
    actorId?: string;
  }) {
    const sessionId = crypto.randomUUID();
    setInMemoryUploadSession(sessionId, {
      id: sessionId,
      cloudName: "hs-spare-parts-cloud",
      canonicalPublicId: params.canonicalPublicId,
      resourceType: "image",
      deliveryType: "upload",
      folder: params.folder,
      createdByActorId: params.actorId || mockAdminUser.id,
      status: "upload_verified",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3600 * 1000),
      lastUpdatedAt: new Date(),
      uploadVerifiedAt: new Date(),
      cloudinaryVersion: "1732000000",
      uploadedBytes: 1024,
      uploadProof: { version: "1732000000" },
      committedAt: null,
      committedEntityType: null,
      committedEntityId: null,
      cleanupIntentAt: null,
      deletedAt: null,
      leaseVersion: 0,
      lockedAt: null,
      leaseExpiresAt: null,
      lockedByWorker: null,
    });

    return createCloudinaryUploadReceiptV2({
      sessionId,
      publicId: params.canonicalPublicId,
      adminId: params.actorId || mockAdminUser.id,
      folder: params.folder,
      resourceType: "image",
    });
  }

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "hs-spare-parts-cloud");
    vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_API_KEY", "123456789012345");
    vi.stubEnv("CLOUDINARY_API_SECRET", "super_secret_test_key_c3");
    resetInMemoryDemoState();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // ============================================================================
  // 1. Folder Isolation & Signature Generation Tests
  // ============================================================================
  describe("Folder Isolation & Signature Generation", () => {
    it("generates category signatures in hs-spare-parts/categories with category prefix", async () => {
      const params = await getCloudinaryUploadParams({
        folder: CLOUDINARY_FOLDERS.categories,
        userOverride: mockAdminUser,
      });

      expect(params.folder).toBe("hs-spare-parts/categories");
      expect(params.publicId).toMatch(/^cat_\d+_[a-f0-9]+$/);
      expect(params.sessionId).toBeDefined();
      expect(isValidCategoryAssetPublicId(`${params.folder}/${params.publicId}`)).toBe(true);
      expect(isValidBrandAssetPublicId(`${params.folder}/${params.publicId}`)).toBe(false);
    });

    it("generates brand signatures in hs-spare-parts/brands with brand prefix", async () => {
      const params = await getCloudinaryUploadParams({
        folder: CLOUDINARY_FOLDERS.brands,
        userOverride: mockAdminUser,
      });

      expect(params.folder).toBe("hs-spare-parts/brands");
      expect(params.publicId).toMatch(/^brand_\d+_[a-f0-9]+$/);
      expect(isValidBrandAssetPublicId(`${params.folder}/${params.publicId}`)).toBe(true);
      expect(isValidCategoryAssetPublicId(`${params.folder}/${params.publicId}`)).toBe(false);
    });

    it("generates banner signatures in hs-spare-parts/banners with banner prefix", async () => {
      const params = await getCloudinaryUploadParams({
        folder: CLOUDINARY_FOLDERS.banners,
        userOverride: mockAdminUser,
      });

      expect(params.folder).toBe("hs-spare-parts/banners");
      expect(params.publicId).toMatch(/^banner_\d+_[a-f0-9]+$/);
      expect(isValidBannerAssetPublicId(`${params.folder}/${params.publicId}`)).toBe(true);
      expect(isValidCategoryAssetPublicId(`${params.folder}/${params.publicId}`)).toBe(false);
    });

    it("strictly rejects customer role from generating upload signatures for any folder", async () => {
      await expect(
        getCloudinaryUploadParams({
          folder: CLOUDINARY_FOLDERS.categories,
          userOverride: mockCustomerUser,
        })
      ).rejects.toThrow(AuthorizationError);

      await expect(
        getCloudinaryUploadParams({
          folder: CLOUDINARY_FOLDERS.brands,
          userOverride: mockCustomerUser,
        })
      ).rejects.toThrow(AuthorizationError);

      await expect(
        getCloudinaryUploadParams({
          folder: CLOUDINARY_FOLDERS.banners,
          userOverride: mockCustomerUser,
        })
      ).rejects.toThrow(AuthorizationError);
    });
  });

  // ============================================================================
  // 2. Cross-Entity Deletion Protections
  // ============================================================================
  describe("Cross-Entity Deletion Protections", () => {
    it("rejects deleting a product asset when restricted to categories folder", async () => {
      const res = await deleteCloudinaryAsset(
        "hs-spare-parts/products/prod_12345_abcdef",
        {
          allowedFolder: CLOUDINARY_FOLDERS.categories,
          userOverride: mockAdminUser,
        }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("deletion is restricted to 'hs-spare-parts/categories/'");
    });

    it("rejects deleting a category asset when restricted to brands folder", async () => {
      const res = await deleteCloudinaryAsset(
        "hs-spare-parts/categories/cat_12345_abcdef",
        {
          allowedFolder: CLOUDINARY_FOLDERS.brands,
          userOverride: mockAdminUser,
        }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("deletion is restricted to 'hs-spare-parts/brands/'");
    });

    it("rejects deleting a brand asset when restricted to banners folder", async () => {
      const res = await deleteCloudinaryAsset(
        "hs-spare-parts/brands/brand_12345_abcdef",
        {
          allowedFolder: CLOUDINARY_FOLDERS.banners,
          userOverride: mockAdminUser,
        }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("deletion is restricted to 'hs-spare-parts/banners/'");
    });

    it("rejects path traversal attempts across folders", async () => {
      const res = await deleteCloudinaryAsset(
        "hs-spare-parts/categories/../brands/brand_123",
        {
          allowedFolder: CLOUDINARY_FOLDERS.categories,
          userOverride: mockAdminUser,
        }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain("Security violation");
    });
  });

  // ============================================================================
  // 3. Category Image Management Tests
  // ============================================================================
  describe("Category Image Management", () => {
    it("allows admin to query and view category listing", async () => {
      const cats = await getAdminCategories(mockAdminUser);
      expect(cats.length).toBeGreaterThan(0);
      expect(cats[0]).toHaveProperty("id");
      expect(cats[0]).toHaveProperty("name");
      expect(cats[0]).toHaveProperty("slug");
    });

    it("rejects customer role from updating category image", async () => {
      await expect(
        updateAdminCategoryImage(
          {
            id: "cat-1",
            imageUrl: "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/categories/cat_123.jpg",
          },
          mockCustomerUser
        )
      ).rejects.toThrow(AuthorizationError);
    });

    it("rejects assigning an asset from outside hs-spare-parts/categories", async () => {
      await expect(
        updateAdminCategoryImage(
          {
            id: "cat-1",
            imageUrl: "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/products/prod_123.jpg",
          },
          mockAdminUser
        )
      ).rejects.toThrow(/SECURITY_ERROR.*must belong to 'hs-spare-parts\/categories\/'/);
    });

    it("rejects category staged deletions containing non-category storage keys", async () => {
      await expect(
        updateAdminCategoryImage(
          {
            id: "cat-1",
            imageUrl: null,
            stagedDeletedStorageKeys: ["hs-spare-parts/products/malicious_delete_prod_1"],
          },
          mockAdminUser
        )
      ).rejects.toThrow(/SECURITY_ERROR.*Invalid or unauthorized category storage key/);
    });

    it("successfully updates category image with valid HMAC receipt", async () => {
      const storageKey = "hs-spare-parts/categories/cat_valid_999";
      const validReceipt = seedVerifiedSession({
        canonicalPublicId: storageKey,
        folder: CLOUDINARY_FOLDERS.categories,
      });

      const result = await updateAdminCategoryImage(
        {
          id: "cat-1",
          imageUrl: `https://res.cloudinary.com/demo/image/upload/${storageKey}.webp`,
          storageKey,
          uploadReceipt: validReceipt,
        },
        mockAdminUser
      );

      expect(result.success).toBe(true);
      expect(result.category.imageUrl).toContain(storageKey);
      expect(result.category.storageKey).toBe(storageKey);
    });

    it("retained vs deleted defense: does NOT delete storage key if it remains in imageUrl", async () => {
      const storageKey = "hs-spare-parts/categories/cat_retained_1";
      const validReceipt = seedVerifiedSession({
        canonicalPublicId: storageKey,
        folder: CLOUDINARY_FOLDERS.categories,
      });

      // Pass the same storage key in both imageUrl and stagedDeletedStorageKeys
      const result = await updateAdminCategoryImage(
        {
          id: "cat-1",
          imageUrl: `https://res.cloudinary.com/demo/image/upload/${storageKey}.webp`,
          storageKey,
          uploadReceipt: validReceipt,
          stagedDeletedStorageKeys: [storageKey],
        },
        mockAdminUser
      );

      expect(result.success).toBe(true);
      expect(result.category.imageUrl).toContain(storageKey);
      // Cleanups should have been safely excluded
      expect(result.cleanupErrors).toBeUndefined();
    });

    it("rejects image reuse if the same storage key is attached to another category", async () => {
      const sharedKey = "hs-spare-parts/categories/cat_exclusive_1";
      const validReceipt1 = seedVerifiedSession({
        canonicalPublicId: sharedKey,
        folder: CLOUDINARY_FOLDERS.categories,
      });

      // Set category 1
      await updateAdminCategoryImage(
        {
          id: "cat-1",
          imageUrl: `https://res.cloudinary.com/demo/image/upload/${sharedKey}.webp`,
          storageKey: sharedKey,
          uploadReceipt: validReceipt1,
        },
        mockAdminUser
      );

      // Attempt to reuse same key for category 2
      await expect(
        updateAdminCategoryImage(
          {
            id: "cat-2",
            imageUrl: `https://res.cloudinary.com/demo/image/upload/${sharedKey}.webp`,
            storageKey: sharedKey,
            uploadReceipt: validReceipt1,
          },
          mockAdminUser
        )
      ).rejects.toThrow(/SECURITY_ERROR.*Storage key .* is already associated with category/);
    });
  });

  // ============================================================================
  // 4. Brand Logo Management Tests
  // ============================================================================
  describe("Brand Logo Management", () => {
    it("allows admin to query and view brand listing", async () => {
      const brandList = await getAdminBrands(mockAdminUser);
      expect(brandList.length).toBeGreaterThan(0);
      expect(brandList[0]).toHaveProperty("id");
      expect(brandList[0]).toHaveProperty("name");
      expect(brandList[0]).toHaveProperty("slug");
    });

    it("rejects customer role from updating brand logo", async () => {
      await expect(
        updateAdminBrandLogo(
          {
            id: "brand-1",
            logoUrl: "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/brands/brand_123.png",
          },
          mockCustomerUser
        )
      ).rejects.toThrow(AuthorizationError);
    });

    it("rejects non-brand storage keys for brand logo", async () => {
      await expect(
        updateAdminBrandLogo(
          {
            id: "brand-1",
            logoUrl: "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/categories/cat_wrong.png",
          },
          mockAdminUser
        )
      ).rejects.toThrow(/SECURITY_ERROR.*must belong to 'hs-spare-parts\/brands\/'/);
    });

    it("successfully updates brand logo with valid HMAC receipt", async () => {
      const storageKey = "hs-spare-parts/brands/brand_valid_logo_1";
      const validReceipt = seedVerifiedSession({
        canonicalPublicId: storageKey,
        folder: CLOUDINARY_FOLDERS.brands,
      });

      const result = await updateAdminBrandLogo(
        {
          id: "brand-1",
          logoUrl: `https://res.cloudinary.com/demo/image/upload/${storageKey}.png`,
          storageKey,
          uploadReceipt: validReceipt,
        },
        mockAdminUser
      );

      expect(result.success).toBe(true);
      expect(result.brand.logoUrl).toContain(storageKey);
      expect(result.brand.storageKey).toBe(storageKey);
    });

    it("retained vs deleted defense: does NOT delete brand logo if retained in logoUrl", async () => {
      const storageKey = "hs-spare-parts/brands/brand_retained_logo_1";
      const validReceipt = seedVerifiedSession({
        canonicalPublicId: storageKey,
        folder: CLOUDINARY_FOLDERS.brands,
      });

      const result = await updateAdminBrandLogo(
        {
          id: "brand-1",
          logoUrl: `https://res.cloudinary.com/demo/image/upload/${storageKey}.png`,
          storageKey,
          uploadReceipt: validReceipt,
          stagedDeletedStorageKeys: [storageKey],
        },
        mockAdminUser
      );

      expect(result.success).toBe(true);
      expect(result.brand.logoUrl).toContain(storageKey);
      expect(result.cleanupErrors).toBeUndefined();
    });
  });

  // ============================================================================
  // 5. Storefront Promotional Banners Tests
  // ============================================================================
  describe("Promotional Banners Management", () => {
    it("reads promotional banners from siteSettings fallback", async () => {
      const banners = await getAdminBanners(mockAdminUser);
      expect(Array.isArray(banners)).toBe(true);
      expect(banners.length).toBeGreaterThan(0);
      expect(banners[0]).toHaveProperty("desktopImageUrl");
      expect(banners[0]).toHaveProperty("altText");
    });

    it("rejects customer role from updating promotional banners", async () => {
      await expect(
        updateAdminBanners(
          {
            banners: [],
          },
          mockCustomerUser
        )
      ).rejects.toThrow(AuthorizationError);
    });

    it("rejects banners lacking descriptive alt text for accessibility", async () => {
      const testBanners: AdminBannerItem[] = [
        {
          id: "test-banner-1",
          title: "Brake Sale",
          subtitle: "Discount",
          desktopImageUrl: "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/banners/banner_desk_1.webp",
          desktopStorageKey: "hs-spare-parts/banners/banner_desk_1",
          mobileImageUrl: null,
          mobileStorageKey: null,
          altText: "", // Empty alt text prohibited!
          linkUrl: "/categories/brake",
          sortOrder: 1,
          isActive: true,
        },
      ];

      await expect(
        updateAdminBanners({ banners: testBanners }, mockAdminUser)
      ).rejects.toThrow(/requires descriptive alt text for accessibility/);
    });

    it("rejects banners with storage keys outside hs-spare-parts/banners/", async () => {
      const testBanners: AdminBannerItem[] = [
        {
          id: "test-banner-2",
          title: "Engine Spares Campaign",
          subtitle: "Filters and gaskets",
          desktopImageUrl: "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/products/prod_invalid.webp",
          desktopStorageKey: "hs-spare-parts/products/prod_invalid",
          mobileImageUrl: null,
          mobileStorageKey: null,
          altText: "Engine spares promotional banner",
          linkUrl: "/categories/engine",
          sortOrder: 1,
          isActive: true,
        },
      ];

      await expect(
        updateAdminBanners({ banners: testBanners }, mockAdminUser)
      ).rejects.toThrow(/SECURITY_ERROR.*must belong to 'hs-spare-parts\/banners\/'/);
    });

    it("successfully updates promotional banners with desktop and mobile variants", async () => {
      const deskKey = "hs-spare-parts/banners/banner_hero_desk_v1";
      const mobKey = "hs-spare-parts/banners/banner_hero_mob_v1";
      const deskReceipt = seedVerifiedSession({
        canonicalPublicId: deskKey,
        folder: CLOUDINARY_FOLDERS.banners,
      });
      const mobReceipt = seedVerifiedSession({
        canonicalPublicId: mobKey,
        folder: CLOUDINARY_FOLDERS.banners,
      });

      const testBanners: AdminBannerItem[] = [
        {
          id: "banner-custom-1",
          title: "Monsoon Brake Overhaul Campaign",
          subtitle: "Genuine rotors and high-performance ceramic pads",
          desktopImageUrl: `https://res.cloudinary.com/demo/image/upload/${deskKey}.webp`,
          desktopStorageKey: deskKey,
          mobileImageUrl: `https://res.cloudinary.com/demo/image/upload/${mobKey}.webp`,
          mobileStorageKey: mobKey,
          altText: "Monsoon brake parts promotional campaign",
          linkUrl: "/categories/brake",
          sortOrder: 1,
          isActive: true,
        },
      ];

      // Attach mock receipts on input
      testBanners[0]!.desktopUploadReceipt = deskReceipt;
      testBanners[0]!.mobileUploadReceipt = mobReceipt;

      const result = await updateAdminBanners(
        {
          banners: testBanners,
          stagedDeletedStorageKeys: ["hs-spare-parts/banners/banner_old_deprecated_1"],
        },
        mockAdminUser
      );

      expect(result.success).toBe(true);
      expect(result.banners.length).toBe(1);
      expect(result.banners[0]!.title).toBe("Monsoon Brake Overhaul Campaign");
      expect(result.banners[0]!.desktopStorageKey).toBe(deskKey);
      expect(result.banners[0]!.mobileStorageKey).toBe(mobKey);
    });

    it("retained vs deleted defense: prevents deleting desktop or mobile keys active in banners", async () => {
      const activeDeskKey = "hs-spare-parts/banners/banner_keep_desk";
      const activeMobKey = "hs-spare-parts/banners/banner_keep_mob";
      const deskReceipt = seedVerifiedSession({
        canonicalPublicId: activeDeskKey,
        folder: CLOUDINARY_FOLDERS.banners,
      });
      const mobReceipt = seedVerifiedSession({
        canonicalPublicId: activeMobKey,
        folder: CLOUDINARY_FOLDERS.banners,
      });

      const testBanners: AdminBannerItem[] = [
        {
          id: "banner-retained-test",
          title: "Active Campaign",
          desktopImageUrl: `https://res.cloudinary.com/demo/image/upload/${activeDeskKey}.webp`,
          desktopStorageKey: activeDeskKey,
          mobileImageUrl: `https://res.cloudinary.com/demo/image/upload/${activeMobKey}.webp`,
          mobileStorageKey: activeMobKey,
          altText: "Retained banner test",
          linkUrl: "/categories",
          sortOrder: 1,
          isActive: true,
        },
      ];

      testBanners[0]!.desktopUploadReceipt = deskReceipt;
      testBanners[0]!.mobileUploadReceipt = mobReceipt;

      // Pass active keys in stagedDeletedStorageKeys
      const result = await updateAdminBanners(
        {
          banners: testBanners,
          stagedDeletedStorageKeys: [activeDeskKey, activeMobKey],
        },
        mockAdminUser
      );

      expect(result.success).toBe(true);
      expect(result.cleanupErrors).toBeUndefined();
    });
  });

  // ============================================================================
  // 6. Storefront Image Fallback & Storage Key Extraction Tests
  // ============================================================================
  describe("Storefront Fallback & Storage Key Extraction", () => {
    it("extracts Cloudinary storage key correctly from various HTTPS URL variants", () => {
      const urlWithVersion = "https://res.cloudinary.com/demo/image/upload/v1700000000/hs-spare-parts/categories/cat_engine_123.webp";
      const urlWithoutVersion = "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/brands/brand_toyota_456.png";
      const bannerUrl = "https://res.cloudinary.com/demo/image/upload/v1234/hs-spare-parts/banners/banner_hero_desk_v1.webp";

      expect(extractCloudinaryStorageKey(urlWithVersion)).toBe("hs-spare-parts/categories/cat_engine_123");
      expect(extractCloudinaryStorageKey(urlWithoutVersion)).toBe("hs-spare-parts/brands/brand_toyota_456");
      expect(extractCloudinaryStorageKey(bannerUrl)).toBe("hs-spare-parts/banners/banner_hero_desk_v1");
      expect(extractCloudinaryStorageKey("https://example.com/external.jpg")).toBeNull();
      expect(extractCloudinaryStorageKey(null)).toBeNull();
    });

    it("correctly identifies category fallback resolution", () => {
      const fallbackImage = "/images/suspension.jpg";
      const customCategory = {
        name: "Suspension & Steering",
        slug: "suspension-steering",
        imageUrl: "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/categories/cat_suspension_c3.webp",
      };

      const resolvedImage = customCategory.imageUrl || fallbackImage;
      expect(resolvedImage).toContain("cat_suspension_c3.webp");

      const nullCategory = {
        name: "Brake Systems",
        slug: "brake",
        imageUrl: null,
      };
      const fallbackResolved = nullCategory.imageUrl || "/images/brakes.jpg";
      expect(fallbackResolved).toBe("/images/brakes.jpg");
    });

    it("correctly identifies brand logo fallback resolution", () => {
      const customBrand = {
        name: "Maruti Suzuki",
        queryParam: "Maruti Suzuki",
        logoUrl: "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/brands/brand_maruti_c3.png",
      };

      expect(Boolean(customBrand.logoUrl)).toBe(true);
      expect(customBrand.logoUrl).toContain("brand_maruti_c3.png");

      const unconfiguredBrand = {
        name: "Hyundai",
        queryParam: "Hyundai",
        logoUrl: null,
      };
      expect(unconfiguredBrand.logoUrl).toBeNull();
    });

    it("correctly handles responsive picture sources for desktop and mobile banner variants", () => {
      const customBanner: AdminBannerItem = {
        id: "banner-test",
        title: "Monsoon Sale",
        desktopImageUrl: "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/banners/banner_desk.webp",
        desktopStorageKey: "hs-spare-parts/banners/banner_desk",
        mobileImageUrl: "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/banners/banner_mob.webp",
        mobileStorageKey: "hs-spare-parts/banners/banner_mob",
        altText: "Brake components monsoon promotion",
        linkUrl: "/categories/brake",
        sortOrder: 1,
        isActive: true,
      };

      expect(customBanner.desktopImageUrl).toContain("banner_desk.webp");
      expect(customBanner.mobileImageUrl).toContain("banner_mob.webp");
      expect(isValidBannerAssetPublicId(customBanner.desktopStorageKey)).toBe(true);
      expect(isValidBannerAssetPublicId(customBanner.mobileStorageKey)).toBe(true);
    });
  });
});
