import { describe, it, expect } from "vitest";
import {
  getOptimizedCloudinaryUrl,
  buildCloudinaryTransformString,
  buildCloudinarySrcSet,
  cloudinaryImageLoader,
  CLOUDINARY_IMAGE_PRESETS,
  validateCloudinaryAssetMetadata,
  isValidProductAssetPublicId,
  isValidCategoryAssetPublicId,
  isValidBrandAssetPublicId,
  isValidBannerAssetPublicId,
  extractCloudinaryStorageKey,
} from "@/lib/cloudinary-shared";

describe("Cloudinary Phase C4: Storefront Image Optimization", () => {
  const SAMPLE_BASE_URL =
    "https://res.cloudinary.com/hs-spare-parts-demo/image/upload/v1732000000/hs-spare-parts/products/sample_part.webp";
  const SAMPLE_NO_VERSION_URL =
    "https://res.cloudinary.com/hs-spare-parts-demo/image/upload/hs-spare-parts/products/sample_part.webp";

  // ============================================================================
  // 1. Transformation Generation & Presets
  // ============================================================================
  describe("1. Cloudinary Transformation Generation & Preset Dimensions", () => {
    it("exports standard image presets matching storefront design specifications", () => {
      expect(CLOUDINARY_IMAGE_PRESETS.productThumbnail.width).toBe(400);
      expect(CLOUDINARY_IMAGE_PRESETS.productGallery.width).toBe(800);
      expect(CLOUDINARY_IMAGE_PRESETS.categoryCard.width).toBe(600);
      expect(CLOUDINARY_IMAGE_PRESETS.brandLogo.width).toBe(200);
      expect(CLOUDINARY_IMAGE_PRESETS.bannerDesktop.width).toBe(1400);
      expect(CLOUDINARY_IMAGE_PRESETS.bannerMobile.width).toBe(750);
    });

    it("builds transformation strings directly via buildCloudinaryTransformString", () => {
      const transform = buildCloudinaryTransformString({
        width: 500,
        height: 300,
        crop: "fill",
        format: "webp",
        quality: 85,
      });
      expect(transform).toBe("f_webp,q_85,w_500,h_300,c_fill");
    });
    it("generates default f_auto and q_auto parameters for product thumbnails", () => {
      const optimized = getOptimizedCloudinaryUrl(SAMPLE_BASE_URL, "productThumbnail");
      expect(optimized).toBeDefined();
      expect(optimized).toContain("f_auto");
      expect(optimized).toContain("q_auto");
      expect(optimized).toContain("w_400");
      expect(optimized).toContain("c_limit");
      expect(optimized).toMatch(
        /image\/upload\/f_auto,q_auto,w_400,c_limit\/v1732000000\/hs-spare-parts\/products\/sample_part\.webp/
      );
    });

    it("generates correct dimensions for product detail/gallery images (w: 800)", () => {
      const optimized = getOptimizedCloudinaryUrl(SAMPLE_BASE_URL, "productGallery");
      expect(optimized).toContain("w_800");
      expect(optimized).toContain("c_limit");
      expect(optimized).toContain("f_auto,q_auto");
    });

    it("generates correct dimensions for category cards (w: 600)", () => {
      const categoryUrl =
        "https://res.cloudinary.com/hs-spare-parts-demo/image/upload/v1732000000/hs-spare-parts/categories/brakes.webp";
      const optimized = getOptimizedCloudinaryUrl(categoryUrl, "categoryCard");
      expect(optimized).toContain("w_600");
      expect(optimized).toContain("c_limit");
      expect(optimized).toContain("hs-spare-parts/categories/brakes.webp");
    });

    it("generates square fitted dimensions for brand logos (w: 200, h: 200, c: fit)", () => {
      const brandUrl =
        "https://res.cloudinary.com/hs-spare-parts-demo/image/upload/v1732000000/hs-spare-parts/brands/maruti.png";
      const optimized = getOptimizedCloudinaryUrl(brandUrl, "brandLogo");
      expect(optimized).toContain("w_200");
      expect(optimized).toContain("h_200");
      expect(optimized).toContain("c_fit");
      expect(optimized).toContain("hs-spare-parts/brands/maruti.png");
    });

    it("generates wide responsive dimensions for desktop promotional banners (w: 1400)", () => {
      const bannerUrl =
        "https://res.cloudinary.com/hs-spare-parts-demo/image/upload/v1732000000/hs-spare-parts/banners/hero_desktop.webp";
      const optimized = getOptimizedCloudinaryUrl(bannerUrl, "bannerDesktop");
      expect(optimized).toContain("w_1400");
      expect(optimized).toContain("c_limit");
      expect(optimized).toContain("hs-spare-parts/banners/hero_desktop.webp");
    });

    it("generates optimized mobile dimensions for mobile promotional banners (w: 750)", () => {
      const bannerUrl =
        "https://res.cloudinary.com/hs-spare-parts-demo/image/upload/v1732000000/hs-spare-parts/banners/hero_mobile.webp";
      const optimized = getOptimizedCloudinaryUrl(bannerUrl, "bannerMobile");
      expect(optimized).toContain("w_750");
      expect(optimized).toContain("c_limit");
      expect(optimized).toContain("hs-spare-parts/banners/hero_mobile.webp");
    });

    it("supports custom width, height, crop, dpr, and gravity overrides", () => {
      const custom = getOptimizedCloudinaryUrl(SAMPLE_BASE_URL, {
        width: 320,
        height: 240,
        crop: "fill",
        dpr: 2,
        gravity: "auto",
        quality: "auto:eco",
        format: "avif",
      });
      expect(custom).toContain("f_avif");
      expect(custom).toContain("q_auto:eco");
      expect(custom).toContain("w_320");
      expect(custom).toContain("h_240");
      expect(custom).toContain("c_fill");
      expect(custom).toContain("dpr_2");
      expect(custom).toContain("g_auto");
    });

    it("handles URLs without version segments correctly", () => {
      const optimized = getOptimizedCloudinaryUrl(SAMPLE_NO_VERSION_URL, "productThumbnail");
      expect(optimized).toBe(
        "https://res.cloudinary.com/hs-spare-parts-demo/image/upload/f_auto,q_auto,w_400,c_limit/hs-spare-parts/products/sample_part.webp"
      );
    });
  });

  // ============================================================================
  // 2. Already-Transformed URL Handling & Idempotency
  // ============================================================================
  describe("2. Already-Transformed URL Handling (Prevent Duplicate Transformations)", () => {
    it("does not stack transformations when called on an already optimized URL", () => {
      const step1 = getOptimizedCloudinaryUrl(SAMPLE_BASE_URL, "productThumbnail");
      expect(step1).toContain("f_auto,q_auto,w_400,c_limit");

      const step2 = getOptimizedCloudinaryUrl(step1, "productThumbnail");
      expect(step2).toBe(step1);
      expect(step2).not.toContain("w_400/w_400");
      expect(step2).not.toContain("f_auto,q_auto/f_auto,q_auto");

      const step3 = getOptimizedCloudinaryUrl(step2, "productThumbnail");
      expect(step3).toBe(step1);
    });

    it("cleanly replaces existing transformations instead of nesting when switching presets", () => {
      const thumbnail = getOptimizedCloudinaryUrl(SAMPLE_BASE_URL, "productThumbnail");
      expect(thumbnail).toContain("w_400");

      // Now upgrade thumbnail URL to gallery size
      const gallery = getOptimizedCloudinaryUrl(thumbnail, "productGallery");
      expect(gallery).toContain("w_800");
      expect(gallery).not.toContain("w_400");
      expect(gallery).not.toContain("/f_auto,q_auto/f_auto,q_auto/");
      expect(gallery).toMatch(
        /image\/upload\/f_auto,q_auto,w_800,c_limit\/v1732000000\/hs-spare-parts\/products\/sample_part\.webp/
      );
    });

    it("correctly identifies existing legacy Cloudinary transform segments", () => {
      const legacyUrl =
        "https://res.cloudinary.com/hs-spare-parts-demo/image/upload/c_scale,w_500/v1732000000/hs-spare-parts/products/sample_part.webp";
      const optimized = getOptimizedCloudinaryUrl(legacyUrl, "productThumbnail");
      expect(optimized).not.toContain("c_scale,w_500");
      expect(optimized).toContain("f_auto,q_auto,w_400,c_limit");
    });
  });

  // ============================================================================
  // 3. Fallback, Missing & Invalid URL Safety
  // ============================================================================
  describe("3. Missing, Non-Cloudinary & Fallback URL Resilience", () => {
    it("safely returns null when input URL is null, undefined, or empty", () => {
      expect(getOptimizedCloudinaryUrl(null)).toBeNull();
      expect(getOptimizedCloudinaryUrl(undefined)).toBeNull();
      expect(getOptimizedCloudinaryUrl("")).toBeNull();
      // @ts-expect-error test non-string type guard
      expect(getOptimizedCloudinaryUrl(12345)).toBeNull();
    });

    it("passes through local static asset paths untouched without corruption", () => {
      expect(getOptimizedCloudinaryUrl("/images/brakes.jpg")).toBe("/images/brakes.jpg");
      expect(getOptimizedCloudinaryUrl("/images/suspension.jpg", "categoryCard")).toBe(
        "/images/suspension.jpg"
      );
      expect(getOptimizedCloudinaryUrl("/images/hero-car.jpg")).toBe("/images/hero-car.jpg");
    });

    it("passes through external non-Cloudinary URLs untouched", () => {
      const externalUrl = "https://images.unsplash.com/photo-12345";
      expect(getOptimizedCloudinaryUrl(externalUrl)).toBe(externalUrl);
    });

    it("preserves original public IDs and storage key extraction capability", () => {
      const originalKey = extractCloudinaryStorageKey(SAMPLE_BASE_URL);
      expect(originalKey).toBe("hs-spare-parts/products/sample_part");

      const optimized = getOptimizedCloudinaryUrl(SAMPLE_BASE_URL, "productThumbnail");
      const keyFromOptimized = extractCloudinaryStorageKey(optimized);
      expect(keyFromOptimized).toBe(originalKey);
    });
  });

  // ============================================================================
  // 4. Responsive SrcSet & Next.js Image Loader
  // ============================================================================
  describe("4. Responsive SrcSet Builder & Next.js Loader Integration", () => {
    it("builds a multi-resolution srcset with progressive widths", () => {
      const srcset = buildCloudinarySrcSet(SAMPLE_BASE_URL, [320, 640, 1024]);
      expect(srcset).toBeDefined();
      expect(srcset).toContain("w_320");
      expect(srcset).toContain("320w");
      expect(srcset).toContain("w_640");
      expect(srcset).toContain("640w");
      expect(srcset).toContain("w_1024");
      expect(srcset).toContain("1024w");
      expect(srcset?.split(", ").length).toBe(3);
    });

    it("returns null for non-Cloudinary URLs in buildCloudinarySrcSet", () => {
      expect(buildCloudinarySrcSet("/images/brakes.jpg")).toBeNull();
      expect(buildCloudinarySrcSet(null)).toBeNull();
    });

    it("powers Next.js custom image loader seamlessly", () => {
      const loaded = cloudinaryImageLoader({
        src: SAMPLE_BASE_URL,
        width: 640,
        quality: 80,
      });
      expect(loaded).toContain("w_640");
      expect(loaded).toContain("q_80");
      expect(loaded).toContain("f_auto");
    });

    it("loader leaves non-Cloudinary images untouched", () => {
      const local = cloudinaryImageLoader({
        src: "/images/hero-car.jpg",
        width: 800,
      });
      expect(local).toBe("/images/hero-car.jpg");
    });
  });

  // ============================================================================
  // 5. Existing Cloudinary Lifecycle & Security Regression
  // ============================================================================
  describe("5. Security & Lifecycle Regression Defense", () => {
    it("maintains folder isolation across product, category, brand, and banner domains", () => {
      expect(isValidProductAssetPublicId("hs-spare-parts/products/p1")).toBe(true);
      expect(isValidProductAssetPublicId("hs-spare-parts/categories/c1")).toBe(false);

      expect(isValidCategoryAssetPublicId("hs-spare-parts/categories/c1")).toBe(true);
      expect(isValidCategoryAssetPublicId("hs-spare-parts/products/p1")).toBe(false);

      expect(isValidBrandAssetPublicId("hs-spare-parts/brands/b1")).toBe(true);
      expect(isValidBrandAssetPublicId("hs-spare-parts/products/p1")).toBe(false);

      expect(isValidBannerAssetPublicId("hs-spare-parts/banners/ban1")).toBe(true);
      expect(isValidBannerAssetPublicId("hs-spare-parts/categories/c1")).toBe(false);
    });

    it("strictly blocks path traversal in asset public IDs", () => {
      expect(isValidProductAssetPublicId("hs-spare-parts/products/../evil")).toBe(false);
      expect(isValidCategoryAssetPublicId("hs-spare-parts/categories//root")).toBe(false);
    });

    it("validates metadata schema strictly and rejects dangerous mime types", () => {
      const valid = validateCloudinaryAssetMetadata(
        {
          publicId: "hs-spare-parts/products/prod_123",
          secureUrl: "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/products/prod_123.jpg",
          format: "jpg",
          resourceType: "image",
          width: 800,
          height: 600,
        },
        "hs-spare-parts/products"
      );
      expect(valid.valid).toBe(true);

      const invalidSvg = validateCloudinaryAssetMetadata(
        {
          publicId: "hs-spare-parts/products/prod_123",
          secureUrl: "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/products/prod_123.svg",
          format: "svg",
          resourceType: "image",
        },
        "hs-spare-parts/products"
      );
      expect(invalidSvg.valid).toBe(false);
      expect(invalidSvg.error).toContain("SVG is prohibited");
    });
  });
});
