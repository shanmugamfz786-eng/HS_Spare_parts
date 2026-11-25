export interface CloudinarySignedUploadParams {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder: string;
  publicId: string;
  uploadPreset: string;
  uploadUrl: string;
  allowedFormats: string[];
  maxFileSize: number;
  sessionId: string;
  uploadReceipt?: string;
}

export interface CloudinaryAssetMetadata {
  publicId: string;
  secureUrl: string;
  format: string;
  resourceType: string;
  width?: number;
  height?: number;
  bytes?: number;
  altText?: string;
  isPrimary?: boolean;
  sortOrder?: number;
  uploadReceipt?: string;
}

export const CLOUDINARY_FOLDERS = {
  products: "hs-spare-parts/products",
  categories: "hs-spare-parts/categories",
  brands: "hs-spare-parts/brands",
  banners: "hs-spare-parts/banners",
} as const;

export type CloudinaryFolder = (typeof CLOUDINARY_FOLDERS)[keyof typeof CLOUDINARY_FOLDERS];

export const CLOUDINARY_CONFIG = {
  uploadPreset: "hs-spare-parts-admin",
  folder: "hs-spare-parts/products",
  folders: CLOUDINARY_FOLDERS,
  allowedFormats: ["jpg", "jpeg", "png", "webp"] as const,
  maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
  maxImagesPerProduct: 8,
};

/**
 * Validates that a Cloudinary public ID belongs to an authorized folder
 * and does not contain directory traversal sequences.
 */
export function isValidAssetPublicId(publicId: unknown, expectedFolder?: string): publicId is string {
  if (typeof publicId !== "string" || publicId.trim().length === 0) {
    return false;
  }
  if (publicId.includes("..") || publicId.includes("//")) {
    return false;
  }
  if (expectedFolder) {
    return publicId.startsWith(`${expectedFolder}/`);
  }
  return Object.values(CLOUDINARY_FOLDERS).some((f) => publicId.startsWith(`${f}/`));
}

/**
 * Validates that a Cloudinary public ID belongs to the authorized products folder
 * and does not contain directory traversal sequences.
 */
export function isValidProductAssetPublicId(publicId: unknown): publicId is string {
  return isValidAssetPublicId(publicId, CLOUDINARY_FOLDERS.products);
}

export function isValidCategoryAssetPublicId(publicId: unknown): publicId is string {
  return isValidAssetPublicId(publicId, CLOUDINARY_FOLDERS.categories);
}

export function isValidBrandAssetPublicId(publicId: unknown): publicId is string {
  return isValidAssetPublicId(publicId, CLOUDINARY_FOLDERS.brands);
}

export function isValidBannerAssetPublicId(publicId: unknown): publicId is string {
  return isValidAssetPublicId(publicId, CLOUDINARY_FOLDERS.banners);
}

/**
 * Extracts a Cloudinary public ID / storage key from a full secure URL.
 */
export function extractCloudinaryStorageKey(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const match = url.match(
    /res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:.*\/)?(hs-spare-parts\/[^.?#]+)/
  );
  return match && match[1] ? match[1] : null;
}

/**
 * Validates Cloudinary upload response metadata before trusting or saving to database.
 * Protects against SVG injection, non-image files, oversized assets, and foreign URLs.
 * Safe for use in both server and client contexts.
 */
export function validateCloudinaryAssetMetadata(
  asset: unknown,
  expectedFolder?: string
): { valid: boolean; data?: CloudinaryAssetMetadata; error?: string } {
  if (!asset || typeof asset !== "object") {
    return { valid: false, error: "Invalid asset payload: expected object." };
  }

  const a = asset as Record<string, unknown>;

  // 1. Public ID check: must start with the dedicated folder prefix
  const targetFolder = expectedFolder || CLOUDINARY_CONFIG.folder;
  if (
    typeof a.publicId !== "string" ||
    (targetFolder !== "any"
      ? !a.publicId.startsWith(`${targetFolder}/`)
      : !isValidAssetPublicId(a.publicId))
  ) {
    return {
      valid: false,
      error: `Asset public ID must start with '${targetFolder}/'. Got: ${String(a.publicId)}`,
    };
  }

  // 2. Secure URL check: must be HTTPS on res.cloudinary.com
  if (
    typeof a.secureUrl !== "string" ||
    !a.secureUrl.startsWith("https://res.cloudinary.com/")
  ) {
    return {
      valid: false,
      error: "Asset URL must be a valid HTTPS Cloudinary secure URL (https://res.cloudinary.com/).",
    };
  }

  // 3. Resource type check: strictly image only
  if (a.resourceType !== "image") {
    return {
      valid: false,
      error: `Invalid resource type: expected 'image', got '${String(a.resourceType)}'.`,
    };
  }

  // 4. Format whitelist: JPEG, PNG, WebP only. SVG, PDF, EXE, HTML are strictly rejected.
  const format = typeof a.format === "string" ? a.format.toLowerCase() : "";
  const allowed = CLOUDINARY_CONFIG.allowedFormats as readonly string[];
  if (!allowed.includes(format)) {
    return {
      valid: false,
      error: `Unsupported image format '${format}'. Only JPEG, PNG, and WebP are accepted. SVG is prohibited.`,
    };
  }

  // 5. Size check
  if (
    a.bytes !== undefined &&
    (typeof a.bytes !== "number" || a.bytes <= 0 || a.bytes > CLOUDINARY_CONFIG.maxFileSizeBytes)
  ) {
    return {
      valid: false,
      error: `Image file size exceeds the allowed limit of ${CLOUDINARY_CONFIG.maxFileSizeBytes / (1024 * 1024)}MB.`,
    };
  }

  return {
    valid: true,
    data: {
      publicId: a.publicId,
      secureUrl: a.secureUrl,
      format,
      resourceType: "image",
      width: typeof a.width === "number" ? a.width : undefined,
      height: typeof a.height === "number" ? a.height : undefined,
      bytes: typeof a.bytes === "number" ? a.bytes : undefined,
      altText: typeof a.altText === "string" ? a.altText.slice(0, 255) : undefined,
      isPrimary: Boolean(a.isPrimary),
      sortOrder: typeof a.sortOrder === "number" ? a.sortOrder : 0,
    },
  };
}

// ==============================================================================
// Storefront Cloudinary Image Delivery & URL Optimization (Phase C4)
// ==============================================================================

export interface CloudinaryTransformOptions {
  width?: number;
  height?: number;
  crop?: "limit" | "fill" | "fit" | "scale" | "thumb" | "pad";
  quality?: "auto" | "auto:best" | "auto:good" | "auto:eco" | "auto:low" | number;
  format?: "auto" | "webp" | "avif" | "jpg" | "png";
  dpr?: "auto" | number;
  gravity?: string;
}

export type CloudinaryImagePreset =
  | "productThumbnail"
  | "productGallery"
  | "categoryCard"
  | "brandLogo"
  | "bannerDesktop"
  | "bannerMobile";

export const CLOUDINARY_IMAGE_PRESETS: Record<CloudinaryImagePreset, CloudinaryTransformOptions> = {
  productThumbnail: {
    width: 400,
    crop: "limit",
    quality: "auto",
    format: "auto",
  },
  productGallery: {
    width: 800,
    crop: "limit",
    quality: "auto",
    format: "auto",
  },
  categoryCard: {
    width: 600,
    crop: "limit",
    quality: "auto",
    format: "auto",
  },
  brandLogo: {
    width: 200,
    height: 200,
    crop: "fit",
    quality: "auto",
    format: "auto",
  },
  bannerDesktop: {
    width: 1400,
    crop: "limit",
    quality: "auto",
    format: "auto",
  },
  bannerMobile: {
    width: 750,
    crop: "limit",
    quality: "auto",
    format: "auto",
  },
};

/**
 * Validates whether a URL segment consists strictly of Cloudinary transformation parameters.
 */
function isCloudinaryTransformSegment(segment?: string): boolean {
  if (!segment || segment.length === 0) return false;
  const parts = segment.split(",");
  return (
    parts.length > 0 &&
    parts.every((part) =>
      /^(?:a|ar|b|bo|c|co|dpr|e|f|fl|fn|fps|g|h|ki|l|o|p|pg|q|r|so|t|u|vc|w|x|y|z)_[a-zA-Z0-9:._-]+$/i.test(
        part
      )
    )
  );
}

/**
 * Builds a Cloudinary transformation string from options.
 * Defaults to format: 'auto' and quality: 'auto' for modern WebP/AVIF delivery and compression.
 */
export function buildCloudinaryTransformString(
  options: CloudinaryTransformOptions = {}
): string {
  const parts: string[] = [];

  // Default format and quality to auto unless explicitly disabled
  const format = options.format !== undefined ? options.format : "auto";
  if (format) parts.push(`f_${format}`);

  const quality = options.quality !== undefined ? options.quality : "auto";
  if (quality) parts.push(`q_${quality}`);

  if (options.width && options.width > 0) {
    parts.push(`w_${Math.round(options.width)}`);
  }
  if (options.height && options.height > 0) {
    parts.push(`h_${Math.round(options.height)}`);
  }
  if (options.crop) {
    parts.push(`c_${options.crop}`);
  }
  if (options.dpr !== undefined) {
    parts.push(`dpr_${options.dpr}`);
  }
  if (options.gravity) {
    parts.push(`g_${options.gravity}`);
  }

  return parts.join(",");
}

export type CloudinaryTransformInput =
  | CloudinaryImagePreset
  | (CloudinaryTransformOptions & { preset?: CloudinaryImagePreset });

/**
 * Generates an optimized Cloudinary delivery URL with f_auto, q_auto, and responsive dimensions.
 *
 * Safety & Invariants:
 * - If the URL is null, empty, or non-Cloudinary (e.g. local `/images/brakes.jpg`), it returns the input safely.
 * - If the URL is already transformed, it cleanly replaces the transformation segment instead of stacking duplicate transforms.
 * - Preserves original public IDs, versions, and file extensions.
 * - Does not alter stored database records or upload receipts.
 */
export function getOptimizedCloudinaryUrl(
  url: string | null | undefined,
  input: CloudinaryTransformInput = "productThumbnail"
): string | null {
  if (!url || typeof url !== "string") {
    return null;
  }

  // Non-Cloudinary URLs (e.g. static local assets or third-party links) pass through untouched
  if (!url.startsWith("https://res.cloudinary.com/")) {
    return url;
  }

  // Resolve options from preset or custom input
  let options: CloudinaryTransformOptions;
  if (typeof input === "string") {
    options = CLOUDINARY_IMAGE_PRESETS[input] || CLOUDINARY_IMAGE_PRESETS.productThumbnail;
  } else if (input.preset) {
    const base = CLOUDINARY_IMAGE_PRESETS[input.preset] || {};
    options = { ...base, ...input };
  } else {
    options = input;
  }

  const match = url.match(
    /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/
  );
  if (!match || !match[1] || !match[2]) {
    return url;
  }

  const baseUrl = match[1];
  const pathRemainder = match[2];
  let segments = pathRemainder.split("/");

  // Check if segment 0 is an existing transformation segment
  const firstSegment = segments[0];
  let existingTransform: string | null = null;
  if (firstSegment && isCloudinaryTransformSegment(firstSegment)) {
    existingTransform = firstSegment;
    segments = segments.slice(1);
  }

  // Check if next segment is a version (v\d+)
  const versionSegment = segments[0];
  let version: string | null = null;
  if (versionSegment && /^v\d+$/.test(versionSegment)) {
    version = versionSegment;
    segments = segments.slice(1);
  }

  const publicIdWithExt = segments.join("/");
  if (!publicIdWithExt) {
    return url;
  }

  const newTransform = buildCloudinaryTransformString(options);

  // If already transformed with the exact requested transformations, avoid re-processing
  if (existingTransform === newTransform) {
    return url;
  }

  const resultSegments: string[] = [baseUrl.replace(/\/$/, "")];
  if (newTransform) {
    resultSegments.push(newTransform);
  }
  if (version) {
    resultSegments.push(version);
  }
  resultSegments.push(publicIdWithExt);

  return resultSegments.join("/");
}

/**
 * Builds a responsive `srcset` attribute for a Cloudinary image URL across multiple viewport widths.
 */
export function buildCloudinarySrcSet(
  url: string | null | undefined,
  widths: number[] = [320, 640, 768, 1024, 1280],
  baseOptions: CloudinaryTransformOptions = {}
): string | null {
  if (!url || typeof url !== "string" || !url.startsWith("https://res.cloudinary.com/")) {
    return null;
  }

  const entries: string[] = [];
  for (const w of widths) {
    const optimized = getOptimizedCloudinaryUrl(url, { ...baseOptions, width: w });
    if (optimized) {
      entries.push(`${optimized} ${w}w`);
    }
  }

  return entries.length > 0 ? entries.join(", ") : null;
}

/**
 * Next.js custom image loader compatible with Next.js <Image loader={cloudinaryImageLoader} ... />
 */
export function cloudinaryImageLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  if (!src.startsWith("https://res.cloudinary.com/")) {
    return src;
  }
  return (
    getOptimizedCloudinaryUrl(src, {
      width,
      quality: quality ? quality : "auto",
      crop: "limit",
    }) || src
  );
}
