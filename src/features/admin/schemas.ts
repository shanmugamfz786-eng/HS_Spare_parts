import { z } from "zod";

export const PRODUCT_CONDITIONS = ["new", "used"] as const;
export type ProductCondition = (typeof PRODUCT_CONDITIONS)[number] | "unclassified";

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

  // Pre-Owned / Used Specific Fields - strictly optional, no fabricated defaults
  conditionGrade: z.string().max(50).optional().nullable(),
  conditionNotes: z.string().max(1000).optional().nullable(),
  visibleWearOrDefects: z.string().max(1000).optional().nullable(),
  testedStatus: z.string().max(255).optional().nullable(),
  warrantyDetails: z.string().max(255).optional().nullable(),
});

export type AdminCreateProductInput = z.input<typeof adminCreateProductSchema>;

export const adminUpdateProductSchema = adminCreateProductSchema.partial().extend({
  id: z.string().min(1, "Product ID is required"),
});

export type AdminUpdateProductInput = z.input<typeof adminUpdateProductSchema>;
