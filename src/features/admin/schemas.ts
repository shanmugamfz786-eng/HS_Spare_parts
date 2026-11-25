import { z } from "zod";

export const PRODUCT_CONDITIONS = ["new", "used"] as const;
export type ProductCondition = (typeof PRODUCT_CONDITIONS)[number] | "unclassified";

export const PRODUCT_ORIGINS = ["genuine_oem", "branded_aftermarket"] as const;
export type ProductOrigin = (typeof PRODUCT_ORIGINS)[number];

export const productFitmentInputSchema = z.object({
  make: z.string().min(1, "Vehicle make is required"),
  model: z.string().min(1, "Vehicle model is required"),
  variant: z.string().optional().nullable(),
  yearStart: z.number().int().min(1980).max(2035),
  yearEnd: z.number().int().min(1980).max(2035).optional().nullable(),
  engine: z.string().optional().nullable(),
  fuelType: z.string().optional().nullable(),
  transmission: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  verifiedStatus: z.enum(["verified", "unverified", "oem_cross_ref"]).default("unverified"),
});

export type ProductFitmentInput = z.infer<typeof productFitmentInputSchema>;

export const productImageInputSchema = z.object({
  url: z.string().url("Must be a valid image URL"),
  storageKey: z.string().min(1, "Storage key is required").max(255),
  altText: z.string().max(255).default("Automotive spare part"),
  isPrimary: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
  uploadReceipt: z.string().optional(),
});

export type ProductImageInput = z.infer<typeof productImageInputSchema>;

export const adminCreateProductSchema = z.object({
  name: z.string().min(3, "Product name must be at least 3 characters").max(200),
  sku: z.string().min(2, "SKU must be at least 2 characters").max(64),
  categoryId: z.string().min(1, "Please select a category"),
  brandId: z.string().min(1, "Please select a brand"),
  condition: z.enum(PRODUCT_CONDITIONS, {
    errorMap: () => ({ message: "Product condition (New or Pre-Owned) is mandatory." }),
  }),
  priceMinor: z.number().int().min(0, "Price must be positive"),
  compareAtPriceMinor: z.number().int().min(0).optional().nullable(),
  shortDescription: z.string().max(500).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  stockQuantity: z.number().int().min(0).default(0),
  fitmentHint: z.string().max(255).optional().nullable(),
  oemReference: z.string().max(100).optional().nullable(),
  isOem: z.boolean().default(false),
  primaryImageUrl: z.string().url().optional().nullable(),
  images: z.array(productImageInputSchema).max(8, "Maximum 8 images allowed per product").optional().default([]),

  // Independent Sourcing Classification: Genuine OEM vs Branded Aftermarket
  origin: z.enum(PRODUCT_ORIGINS).optional().default("genuine_oem"),

  // Subcategory linkage
  subcategoryId: z.string().optional().nullable(),

  // Part numbers
  partNumber: z.string().max(100).optional().nullable(),
  oemNumber: z.string().max(100).optional().nullable(),

  // Low stock threshold
  lowStockThreshold: z.number().int().min(0).default(5).optional(),

  // Vehicle Compatibility entries
  fitments: z.array(productFitmentInputSchema).optional().default([]),

  // Pre-Owned / Used Specific Fields - strictly optional, no fabricated defaults
  conditionGrade: z.string().max(50).optional().nullable(),
  conditionNotes: z.string().max(1000).optional().nullable(),
  visibleWearOrDefects: z.string().max(1000).optional().nullable(),
  testedStatus: z.string().max(255).optional().nullable(),
  inspectionStatus: z.enum(["pending", "inspected", "failed"]).optional().nullable(),
  warrantyDetails: z.string().max(255).optional().nullable(),
});

export type AdminCreateProductInput = z.input<typeof adminCreateProductSchema>;

export const adminUpdateProductSchema = adminCreateProductSchema
  .partial()
  .extend({
    id: z.string().min(1, "Product ID is required"),
    stagedDeletedStorageKeys: z.array(z.string().min(1)).max(8).optional().default([]),
    status: z.enum(["draft", "active", "archived"]).optional(),
  })
  .refine(
    (data) => {
      // Invariant: Failed inspection on used parts must never permit active publishing
      if (
        data.condition === "used" &&
        data.inspectionStatus === "failed" &&
        data.status === "active"
      ) {
        return false;
      }
      return true;
    },
    {
      message:
        "VALIDATION_ERROR: Cannot publish pre-owned product with failed inspection status as active. Save as draft or archived.",
      path: ["status"],
    }
  );

export type AdminUpdateProductInput = z.input<typeof adminUpdateProductSchema>;

// ==============================================================================
// Phase C3: Category Images, Brand Logos & Storefront Promotional Banners
// ==============================================================================

export const adminUpdateCategoryImageSchema = z.object({
  id: z.string().min(1, "Category ID is required"),
  imageUrl: z.string().url("Must be a valid HTTPS image URL").nullable().optional(),
  storageKey: z.string().nullable().optional(),
  altText: z.string().max(255).optional(),
  uploadReceipt: z.string().nullable().optional(),
  stagedDeletedStorageKeys: z.array(z.string().min(1)).optional().default([]),
});

export type AdminUpdateCategoryImageInput = z.input<typeof adminUpdateCategoryImageSchema>;

export const adminUpdateBrandLogoSchema = z.object({
  id: z.string().min(1, "Brand ID is required"),
  logoUrl: z.string().url("Must be a valid HTTPS logo URL").nullable().optional(),
  storageKey: z.string().nullable().optional(),
  altText: z.string().max(255).optional(),
  uploadReceipt: z.string().nullable().optional(),
  stagedDeletedStorageKeys: z.array(z.string().min(1)).optional().default([]),
});

export type AdminUpdateBrandLogoInput = z.input<typeof adminUpdateBrandLogoSchema>;

export const adminStorefrontBannerSchema = z.object({
  id: z.string().min(1, "Banner ID is required"),
  title: z.string().min(1, "Banner title is required").max(200),
  subtitle: z.string().max(500).nullable().optional(),
  desktopImageUrl: z.string().url("Must be a valid desktop image URL"),
  desktopStorageKey: z.string().nullable().optional(),
  desktopUploadReceipt: z.string().nullable().optional(),
  mobileImageUrl: z.string().url("Must be a valid mobile image URL").nullable().optional(),
  mobileStorageKey: z.string().nullable().optional(),
  mobileUploadReceipt: z.string().nullable().optional(),
  altText: z.string().min(1, "Alt text is required for accessibility").max(255),
  linkUrl: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export type AdminStorefrontBannerInput = z.input<typeof adminStorefrontBannerSchema>;

export const adminUpdateBannersPayloadSchema = z.object({
  banners: z.array(adminStorefrontBannerSchema).max(10, "Maximum 10 banners permitted"),
  stagedDeletedStorageKeys: z.array(z.string().min(1)).optional().default([]),
});

export type AdminUpdateBannersPayload = z.input<typeof adminUpdateBannersPayloadSchema>;
