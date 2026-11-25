import { z } from "zod";

/**
 * HS Spare Parts — Catalogue & Search Validation Schemas & DTOs
 */

// Allowlisted sort orders
export const SORT_OPTIONS = ["relevance", "price_asc", "price_desc", "newest"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

// Product conditions supported by admin-managed catalog
export const PRODUCT_CONDITIONS = ["new", "used"] as const;
export type ProductConditionFilter = (typeof PRODUCT_CONDITIONS)[number];
export type ProductCondition = "new" | "used" | "unclassified";

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 48;

/**
 * Sanitizes raw string input against null bytes and control characters.
 */
function sanitizeSearchQuery(input?: string): string | undefined {
  if (!input) return undefined;
  // Strip null bytes and control characters, trim whitespace
  const sanitized = input.replace(/[\x00-\x1F\x7F]/g, "").trim();
  return sanitized.length > 0 ? sanitized : undefined;
}

/**
 * Search & Filter Query Parameters Schema
 * Validates and normalizes all incoming URL query parameters.
 */
export const productSearchQuerySchema = z.object({
  // Search query (keyword, SKU, or part number)
  q: z
    .string()
    .max(100, "Search query cannot exceed 100 characters")
    .optional()
    .transform(sanitizeSearchQuery),

  // Direct part / OEM number
  partNumber: z
    .string()
    .max(100)
    .optional()
    .transform(sanitizeSearchQuery),

  // Sourcing origin filter: Genuine OEM vs Branded Aftermarket
  origin: z
    .enum(["genuine_oem", "branded_aftermarket"])
    .optional(),

  // Category & Subcategory filters
  category: z
    .string()
    .max(100)
    .optional()
    .transform(sanitizeSearchQuery),

  subcategory: z
    .string()
    .max(100)
    .optional()
    .transform(sanitizeSearchQuery),

  // Brand filter (single or comma-separated/array)
  brand: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      if (Array.isArray(val)) {
        return val.map((b) => b.trim()).filter(Boolean);
      }
      return val
        .split(",")
        .map((b) => b.trim())
        .filter(Boolean);
    }),

  // Price range filters (in INR Rupees, converted or kept as integers)
  minPrice: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === null || val === "") return undefined;
      const num = typeof val === "number" ? val : parseFloat(val);
      if (isNaN(num) || num < 0) return undefined;
      return Math.floor(num);
    }),

  maxPrice: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === null || val === "") return undefined;
      const num = typeof val === "number" ? val : parseFloat(val);
      if (isNaN(num) || num < 0) return undefined;
      return Math.floor(num);
    }),

  // Vehicle fitment filters
  make: z
    .string()
    .max(100)
    .optional()
    .transform(sanitizeSearchQuery),

  model: z
    .string()
    .max(100)
    .optional()
    .transform(sanitizeSearchQuery),

  year: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === null || val === "") return undefined;
      const num = typeof val === "number" ? val : parseInt(val, 10);
      if (isNaN(num) || num < 1970 || num > 2035) return undefined;
      return num;
    }),

  variant: z
    .string()
    .max(150)
    .optional()
    .transform(sanitizeSearchQuery),

  // Stock availability filter
  inStockOnly: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((val) => {
      if (typeof val === "boolean") return val;
      if (val === "true" || val === "1") return true;
      if (val === "false" || val === "0") return false;
      return undefined;
    }),

  // Product condition filter (new vs used/pre-owned)
  condition: z
    .enum(PRODUCT_CONDITIONS)
    .optional(),

  // Sorting
  sort: z
    .enum(SORT_OPTIONS)
    .catch("relevance")
    .default("relevance"),

  // Pagination
  page: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === null || val === "") return 1;
      const num = typeof val === "number" ? val : parseInt(val, 10);
      return isNaN(num) || num < 1 ? 1 : num;
    })
    .default(1),

  pageSize: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === null || val === "") return DEFAULT_PAGE_SIZE;
      const num = typeof val === "number" ? val : parseInt(val, 10);
      if (isNaN(num) || num < 1) return DEFAULT_PAGE_SIZE;
      return Math.min(num, MAX_PAGE_SIZE);
    })
    .default(DEFAULT_PAGE_SIZE),
});

export type RawProductSearchParams = z.input<typeof productSearchQuerySchema>;
export type ValidatedProductSearchParams = z.output<typeof productSearchQuerySchema>;

// -----------------------------------------------------------------------------
// Data Transfer Objects (DTOs)
// -----------------------------------------------------------------------------

export interface ProductImageDTO {
  id: string;
  url: string;
  altText: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface ProductVariantDTO {
  id: string;
  sku: string;
  attributes: Record<string, string | number | boolean>;
  priceOverrideMinor: number | null;
  status: string;
  inventoryOnHand?: number;
  inventoryReserved?: number;
}

export interface ProductSpecificationDTO {
  name: string;
  value: string;
  sortOrder: number;
}

export interface VehicleFitmentDTO {
  id: string;
  makeName: string;
  makeSlug: string;
  modelName: string;
  modelSlug: string;
  variantGeneration: string | null;
  variantEngine: string | null;
  variantFuel: string | null;
  yearStart: number;
  yearEnd: number | null;
  notes: string | null;
  verifiedStatus: "verified" | "unverified" | "oem_cross_ref";
}

export interface ProductCardDTO {
  id: string;
  sku: string;
  slug: string;
  name: string;
  brandName: string;
  brandSlug: string;
  categoryName: string;
  categorySlug: string;
  priceMinor: number;
  compareAtPriceMinor: number | null;
  primaryImageUrl: string | null;
  fitmentHint: string | null;
  oemReference: string | null;
  condition: ProductCondition;
  origin?: "genuine_oem" | "branded_aftermarket";
  partNumber?: string | null;
  oemNumber?: string | null;
  isDemo: boolean;
  isOem: boolean;
  availableStock?: number;
  inStock?: boolean;
}

export interface ProductDetailDTO extends ProductCardDTO {
  shortDescription: string | null;
  description: string | null;
  weightGrams: number | null;
  subcategoryId?: string | null;
  subcategoryName?: string | null;
  conditionGrade?: string | null;
  conditionNotes?: string | null;
  visibleWearOrDefects?: string | null;
  testedStatus?: string | null;
  inspectionStatus?: "pending" | "inspected" | "failed" | null;
  warrantyDetails?: string | null;
  images: ProductImageDTO[];
  variants: ProductVariantDTO[];
  specifications: ProductSpecificationDTO[];
  fitments: VehicleFitmentDTO[];
}

export interface FacetItemDTO {
  label: string;
  value: string;
  count: number;
  isSelected?: boolean;
}

export interface FilterFacetsDTO {
  categories: FacetItemDTO[];
  brands: FacetItemDTO[];
  vehicleMakes: FacetItemDTO[];
  conditions: FacetItemDTO[];
  origins?: FacetItemDTO[];
  priceRange: {
    min: number;
    max: number;
  };
}

export interface CatalogueSearchResponseDTO {
  products: ProductCardDTO[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  activeFilters: {
    query?: string;
    category?: string;
    subcategory?: string;
    brand?: string[];
    condition?: ProductConditionFilter;
    origin?: "genuine_oem" | "branded_aftermarket";
    minPrice?: number;
    maxPrice?: number;
    make?: string;
    model?: string;
    year?: number;
    variant?: string;
    inStockOnly?: boolean;
    sort: SortOption;
  };
  facets: FilterFacetsDTO;
  isDemoSource: boolean;
  isDatabaseUnavailable?: boolean;
}

// ==============================================================================
// Storefront Public Media & Promotional DTOs (Phase C3.1)
// ==============================================================================

export interface StorefrontCategoryDTO {
  name: string;
  slug: string;
  imageUrl: string | null;
}

export interface StorefrontBrandDTO {
  name: string;
  queryParam: string;
  logoUrl: string | null;
}

export interface StorefrontBannerDTO {
  id: string;
  title: string;
  subtitle: string | null;
  desktopImageUrl: string;
  mobileImageUrl: string | null;
  altText: string;
  linkUrl: string | null;
  sortOrder: number;
  isActive: boolean;
}

export const storefrontBannerSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  subtitle: z.string().max(500).nullable().optional(),
  desktopImageUrl: z.string().url(),
  mobileImageUrl: z.string().url().nullable().optional(),
  altText: z.string().min(1).max(255),
  linkUrl: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});
