import "server-only";
import { eq, desc, and, ne, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { products, brands, categories, productImages, inventory } from "@/lib/db/schema/catalogue";
import { siteSettings } from "@/lib/db/schema/admin";
import { getCurrentUser, getCurrentAdminUser, type SafeUser } from "@/features/auth/service";
import {
  ROLES,
  PERMISSIONS,
  hasRole,
  hasPermission,
  AuthorizationError,
  AuthenticationError,
  type PermissionKey,
} from "@/lib/auth/rbac";
import { DEMO_FEATURED_PRODUCTS } from "@/lib/constants/demo-catalog";
import {
  getInMemoryCreatedProducts,
  addInMemoryCreatedProduct,
  updateInMemoryProduct,
} from "@/server/catalogue/demo-state";
import { parseProductCondition } from "@/server/catalogue/catalogue-service";
import {
  isValidProductAssetPublicId,
  isValidCategoryAssetPublicId,
  isValidBrandAssetPublicId,
  isValidBannerAssetPublicId,
  extractCloudinaryStorageKey,
  CLOUDINARY_FOLDERS,
} from "@/lib/cloudinary-shared";
import {
  verifyAndCommitMediaUploadSessions,
  type EntityMediaAttachment,
} from "@/lib/cloudinary";
import type {
  AdminCreateProductInput,
  AdminUpdateProductInput,
  ProductCondition,
  ProductOrigin,
  AdminUpdateCategoryImageInput,
  AdminUpdateBrandLogoInput,
  AdminUpdateBannersPayload,
} from "./schemas";

function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

function isExplicitDevOrTest(): boolean {
  return (
    process.env.NEXT_PUBLIC_ENABLE_DEMO_CATALOG === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(id: string | null | undefined): boolean {
  if (!id || typeof id !== "string") return false;
  if (process.env.NODE_ENV === "test") return true;
  return UUID_REGEX.test(id);
}

const DEMO_PRODUCT_IMAGE_MAP: Record<string, string> = {
  "demo-brembo-pads": "/images/brakes.jpg",
  "demo-gabriel-shockers": "/images/suspension.jpg",
  "demo-valeo-clutch": "/images/transmission.jpg",
  "demo-bosch-spark-plugs": "/images/electrical.jpg",
  "demo-denso-radiator": "/images/cooling.jpg",
  "demo-lumax-headlight": "/images/body.jpg",
  "demo-mann-filters": "/images/accessories.jpg",
  "demo-bosch-wipers": "/images/accessories.jpg",
};

export interface AdminCacheEntry<T> {
  data: T;
  timestamp: number;
}

const ADMIN_CACHE_TTL_MS = 600_000; // 10 minutes in-memory cache for instant admin navigation
const adminMemoryCache = new Map<string, AdminCacheEntry<unknown>>();

export function getFromAdminCache<T>(key: string): T | null {
  const entry = adminMemoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ADMIN_CACHE_TTL_MS) {
    adminMemoryCache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setAdminCache<T>(key: string, data: T): void {
  adminMemoryCache.set(key, { data, timestamp: Date.now() });
}

export function invalidateAdminCache(pattern?: string): void {
  if (!pattern) {
    adminMemoryCache.clear();
    return;
  }
  for (const key of adminMemoryCache.keys()) {
    if (key.includes(pattern)) {
      adminMemoryCache.delete(key);
    }
  }
}

/**
 * Asserts that the active user possesses catalogue privileges.
 * Strictly blocks regular customer accounts and unauthenticated users.
 * Supports optional userOverride for unit test scenarios.
 */
export async function assertAdminCatalogueAccess(
  permission: PermissionKey = PERMISSIONS.CATALOGUE_WRITE,
  userOverride?: SafeUser | null
) {
  const currentUser = userOverride !== undefined ? userOverride : await getCurrentAdminUser();

  if (!currentUser) {
    throw new AuthenticationError("Authentication required: Please sign in as an administrator.");
  }

  // Reject customer role explicitly
  if (currentUser.roles.includes(ROLES.CUSTOMER) && !currentUser.roles.includes(ROLES.ADMINISTRATOR)) {
    throw new AuthorizationError(
      "Access Denied: Regular customer accounts cannot create or manage catalogue products. This store is administrator-managed."
    );
  }

  const isAdmin = hasRole(currentUser.roles, [
    ROLES.ADMINISTRATOR,
    ROLES.SUPER_ADMINISTRATOR,
  ]);
  const hasAccess = isAdmin || hasPermission(currentUser.permissions, permission);

  if (!hasAccess) {
    throw new AuthorizationError(
      "Access Denied: Insufficient permissions to manage catalogue items."
    );
  }

  return currentUser;
}

export interface AdminProductListItem {
  id: string;
  sku: string;
  name: string;
  brandName: string;
  categoryName: string;
  categorySlug?: string;
  subcategoryId?: string;
  fitmentHint?: string;
  imageUrl?: string;
  priceMinor: number;
  condition: ProductCondition;
  conditionNotes?: string | null;
  status: string;
  isDemo?: boolean;
}

/**
 * Lists products for the admin catalogue dashboard.
 */
export async function getAdminProducts(
  userOverride?: SafeUser | null
): Promise<AdminProductListItem[]> {
  await assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_READ, userOverride);

  const cacheKey = "admin:products";
  if (!userOverride) {
    const cached = getFromAdminCache<AdminProductListItem[]>(cacheKey);
    if (cached) return cached;
  }

  let result: AdminProductListItem[] = [];

  if (isDatabaseConfigured()) {
    const db = getDb();
    if (db) {
      const rows = await db
        .select({
          id: products.id,
          sku: products.sku,
          name: products.name,
          priceMinor: products.priceMinor,
          status: products.status,
          attributes: products.attributes,
          brandName: brands.name,
          categoryName: categories.name,
          categorySlug: categories.slug,
        })
        .from(products)
        .leftJoin(brands, eq(products.brandId, brands.id))
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .orderBy(desc(products.createdAt))
        .limit(100);

      if (rows.length > 0 || !isExplicitDevOrTest()) {
        result = rows.map((r) => {
          const attrs = (r.attributes || {}) as Record<string, unknown>;
          return {
            id: r.id,
            sku: r.sku,
            name: r.name,
            brandName: r.brandName ?? "Generic",
            categoryName: r.categoryName ?? "General",
            categorySlug: r.categorySlug ?? undefined,
            subcategoryId: (attrs.subcategoryId as string) || undefined,
            fitmentHint: (attrs.fitmentHint as string) || undefined,
            priceMinor: r.priceMinor,
            condition: parseProductCondition(attrs.condition),
            conditionNotes: (attrs.conditionNotes as string) || null,
            status: r.status,
            isDemo: false,
          };
        });
        if (!userOverride) setAdminCache(cacheKey, result);
        return result;
      }
    }
  }

  if (isExplicitDevOrTest()) {
    const memoryProducts = getInMemoryCreatedProducts().map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      brandName: p.brandName,
      categoryName: p.categoryName,
      categorySlug: p.categorySlug,
      subcategoryId: p.subcategoryId,
      fitmentHint: p.fitmentHint,
      imageUrl: p.imageUrl,
      priceMinor: p.priceMinor,
      condition: parseProductCondition(p.condition),
      conditionNotes: p.conditionNotes ?? null,
      status: p.status,
      isDemo: true,
    }));

    result = [
      ...memoryProducts,
      ...DEMO_FEATURED_PRODUCTS.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        brandName: p.brand,
        categoryName: p.categoryName,
        categorySlug: p.categorySlug,
        subcategoryId: p.subcategoryId,
        fitmentHint: p.fitmentHint,
        imageUrl: undefined,
        priceMinor: p.priceMinor,
        condition: parseProductCondition(p.condition),
        conditionNotes: p.conditionNotes ?? null,
        status: "active",
        isDemo: true,
      })),
    ];
    if (!userOverride) setAdminCache(cacheKey, result);
    return result;
  }

  return [];
}

export interface AdminProductImageItem {
  id: string;
  url: string;
  storageKey: string | null;
  altText: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface AdminProductDetail {
  id: string;
  sku: string;
  slug: string;
  name: string;
  brandId: string | null;
  brandName: string;
  categoryId: string | null;
  categoryName: string;
  priceMinor: number;
  compareAtPriceMinor: number | null;
  shortDescription: string | null;
  description: string | null;
  stockQuantity: number;
  status: string;
  condition: ProductCondition;
  conditionGrade: string | null;
  conditionNotes: string | null;
  visibleWearOrDefects: string | null;
  testedStatus: string | null;
  warrantyDetails: string | null;
  fitmentHint: string | null;
  oemReference: string | null;
  isOem: boolean;
  origin?: ProductOrigin;
  subcategoryId?: string | null;
  partNumber?: string | null;
  oemNumber?: string | null;
  inspectionStatus?: string | null;
  fitments?: unknown[];
  images: AdminProductImageItem[];
  isDemo: boolean;
}

/**
 * Loads an individual product with its full image gallery for admin inspection and editing.
 */
export async function getAdminProductById(
  id: string,
  userOverride?: SafeUser | null
): Promise<AdminProductDetail | null> {
  await assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_READ, userOverride);

  if (!id || typeof id !== "string") {
    return null;
  }

  // 1. Resolve demo product first in development / demo mode (prevents invalid UUID syntax errors on PostgreSQL)
  if (isExplicitDevOrTest()) {
    const memoryProd = getInMemoryCreatedProducts().find(
      (p) => p.id === id || p.sku.toLowerCase() === id.toLowerCase()
    );
    if (memoryProd) {
      return {
        id: memoryProd.id,
        sku: memoryProd.sku,
        slug: memoryProd.sku.toLowerCase(),
        name: memoryProd.name,
        brandId: memoryProd.brandName.toLowerCase(),
        brandName: memoryProd.brandName,
        categoryId: memoryProd.categorySlug || memoryProd.categoryName,
        categoryName: memoryProd.categoryName,
        priceMinor: memoryProd.priceMinor,
        compareAtPriceMinor: null,
        shortDescription: memoryProd.name,
        description: memoryProd.name,
        stockQuantity: 10,
        status: memoryProd.status,
        condition: parseProductCondition(memoryProd.condition),
        conditionGrade: null,
        conditionNotes: memoryProd.conditionNotes ?? null,
        visibleWearOrDefects: null,
        testedStatus: null,
        warrantyDetails: null,
        fitmentHint: memoryProd.fitmentHint ?? null,
        oemReference: null,
        isOem: true,
        origin: "genuine_oem",
        isDemo: true,
        subcategoryId: memoryProd.subcategoryId || null,
        partNumber: memoryProd.sku,
        oemNumber: null,
        inspectionStatus: "passed",
        fitments: [],
        images: memoryProd.imageUrl
          ? [
              {
                id: `img-${memoryProd.id}`,
                url: memoryProd.imageUrl,
                storageKey: null,
                altText: memoryProd.name,
                isPrimary: true,
                sortOrder: 0,
              },
            ]
          : [],
      };
    }

    const demo = DEMO_FEATURED_PRODUCTS.find(
      (p) => p.id === id || p.sku.toLowerCase() === id.toLowerCase()
    );
    if (demo) {
      return {
        id: demo.id,
        sku: demo.sku,
        slug: demo.sku.toLowerCase(),
        name: demo.name,
        brandId: demo.brand.toLowerCase(),
        brandName: demo.brand,
        categoryId: demo.categorySlug,
        categoryName: demo.categoryName,
        priceMinor: demo.priceMinor,
        compareAtPriceMinor: demo.originalPriceMinor ?? null,
        shortDescription: demo.description,
        description: demo.description,
        stockQuantity: 10,
        status: "active",
        condition: parseProductCondition(demo.condition),
        conditionGrade: demo.conditionGrade ?? null,
        conditionNotes: demo.conditionNotes ?? null,
        visibleWearOrDefects: demo.visibleWearOrDefects ?? null,
        testedStatus: demo.testedStatus ?? null,
        warrantyDetails: demo.warrantyDetails ?? null,
        fitmentHint: demo.fitmentHint ?? null,
        oemReference: demo.oemReference ?? null,
        isOem: true,
        origin: "genuine_oem",
        subcategoryId: null,
        partNumber: demo.sku,
        oemNumber: demo.oemReference ?? null,
        inspectionStatus: "passed",
        fitments: [],
        images: [
          {
            id: `demo-img-${demo.id}`,
            url: DEMO_PRODUCT_IMAGE_MAP[demo.id] || "/images/brakes.jpg",
            storageKey: `hs-spare-parts/products/demo_${demo.id}`,
            altText: demo.name,
            isPrimary: true,
            sortOrder: 0,
          },
        ],
        isDemo: true,
      };
    }
  }

  // 2. Query persisted PostgreSQL database
  if (isDatabaseConfigured()) {
    // If ID is not a valid UUID, do not query PostgreSQL as it will throw 22P02
    if (!isValidUuid(id)) {
      return null;
    }
    const db = getDb();
    if (db) {
      try {
        const rows = await db
          .select({
            id: products.id,
            sku: products.sku,
            slug: products.slug,
            name: products.name,
            brandId: products.brandId,
            categoryId: products.categoryId,
            priceMinor: products.priceMinor,
            compareAtPriceMinor: products.compareAtPriceMinor,
            shortDescription: products.shortDescription,
            description: products.description,
            status: products.status,
            attributes: products.attributes,
            brandName: brands.name,
            categoryName: categories.name,
          })
          .from(products)
          .leftJoin(brands, eq(products.brandId, brands.id))
          .leftJoin(categories, eq(products.categoryId, categories.id))
          .where(eq(products.id, id))
          .limit(1);

        const p = rows[0];
        if (!p) {
          return null;
        }

        // Query normalized images
        const images = await db
          .select({
            id: productImages.id,
            url: productImages.url,
            storageKey: productImages.storageKey,
            altText: productImages.altText,
            isPrimary: productImages.isPrimary,
            sortOrder: productImages.sortOrder,
          })
          .from(productImages)
          .where(eq(productImages.productId, p.id))
          .orderBy(desc(productImages.isPrimary), asc(productImages.sortOrder));

        // Query inventory stock quantity if available
        let stockQuantity = 1;
        try {
          const invRows = await db
            .select({ quantityOnHand: inventory.quantityOnHand })
            .from(inventory)
            .where(eq(inventory.productId, p.id))
            .limit(1);
          if (invRows[0]?.quantityOnHand !== undefined && invRows[0].quantityOnHand !== null) {
            stockQuantity = invRows[0].quantityOnHand;
          }
        } catch {
          // Fallback to default
        }

        const attrs = (p.attributes || {}) as Record<string, unknown>;

        return {
          id: p.id,
          sku: p.sku,
          slug: p.slug,
          name: p.name,
          brandId: p.brandId,
          brandName: p.brandName ?? "Generic",
          categoryId: p.categoryId,
          categoryName: p.categoryName ?? "General",
          priceMinor: p.priceMinor,
          compareAtPriceMinor: p.compareAtPriceMinor,
          shortDescription: p.shortDescription,
          description: p.description,
          stockQuantity,
          status: p.status,
          condition: parseProductCondition(attrs.condition),
          conditionGrade: (attrs.conditionGrade as string) || null,
          conditionNotes: (attrs.conditionNotes as string) || null,
          visibleWearOrDefects: (attrs.visibleWearOrDefects as string) || null,
          testedStatus: (attrs.testedStatus as string) || null,
          warrantyDetails: (attrs.warrantyDetails as string) || null,
          fitmentHint: (attrs.fitmentHint as string) || null,
          oemReference: (attrs.oemReference as string) || null,
          isOem: Boolean(attrs.isOem),
          origin:
            (attrs.origin as ProductOrigin) ||
            (Boolean(attrs.isOem) ? "genuine_oem" : "branded_aftermarket"),
          subcategoryId: (attrs.subcategoryId as string) || null,
          partNumber: (attrs.partNumber as string) || null,
          oemNumber: (attrs.oemNumber as string) || (attrs.oemReference as string) || null,
          inspectionStatus: (attrs.inspectionStatus as string) || null,
          fitments: Array.isArray(attrs.fitments) ? attrs.fitments : [],
          images: images.map((img) => ({
            id: img.id,
            url: img.url,
            storageKey: img.storageKey,
            altText: img.altText,
            isPrimary: img.isPrimary,
            sortOrder: img.sortOrder,
          })),
          isDemo: false,
        };
      } catch (err) {
        console.error("[getAdminProductById] DB query error:", err);
        return null;
      }
    }
  }

  return null;
}

/**
 * Verifies upload receipts for any newly introduced images.
 * Persisted images (already associated with the product in database) do not require new receipts.
 */
export async function verifyProductImageReceipts(
  images: Array<{ storageKey?: string | null; uploadReceipt?: string | null }>,
  adminUser: SafeUser,
  options?: {
    persistedKeys?: Set<string>;
    requireReceipt?: boolean;
  }
): Promise<{ valid: boolean; error?: string }> {
  const { verifyCloudinaryUploadReceipt, inspectCloudinaryUploadReceipt } = await import("@/lib/cloudinary");

  for (const img of images) {
    if (!img.storageKey) continue;

    // Skip verification if this asset is already persisted for this product
    if (options?.persistedKeys && options.persistedKeys.has(img.storageKey)) {
      continue;
    }

    if (!img.uploadReceipt) {
      if (options?.requireReceipt) {
        return {
          valid: false,
          error: `Upload receipt is required for new asset '${img.storageKey}'.`,
        };
      }
      continue;
    }

    // Inspect token: Stage C strictly rejects Receipt v1
    const inspection = inspectCloudinaryUploadReceipt(img.uploadReceipt);
    if (!inspection.valid) {
      return {
        valid: false,
        error: `Invalid upload receipt: ${inspection.error}`,
      };
    }

    if (inspection.version !== 2 || !inspection.payload || !("sid" in inspection.payload)) {
      return {
        valid: false,
        error: "RECEIPT_VERSION_FORBIDDEN: Only Receipt v2 is permitted for entity media attachment. Receipt v1 is strictly rejected.",
      };
    }

    const res = verifyCloudinaryUploadReceipt(img.uploadReceipt, {
      publicId: img.storageKey,
      adminId: adminUser.id,
      sessionId: (inspection.payload as { sid: string }).sid,
      folder: CLOUDINARY_FOLDERS.products,
      resourceType: "image",
    });
    if (!res.valid) {
      return res;
    }
  }
  return { valid: true };
}

/**
 * Creates a new product in the catalogue with condition metadata.
 */
export async function createAdminProduct(
  input: AdminCreateProductInput,
  userOverride?: SafeUser | null,
  options?: { status?: "draft" | "active" }
) {
  const user = await assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_WRITE, userOverride);
  const targetStatus = options?.status === "draft" ? "draft" : "active";

  // Invariant: Failed inspection on used parts must never permit active publishing
  if (
    input.condition === "used" &&
    input.inspectionStatus === "failed" &&
    targetStatus === "active"
  ) {
    throw new Error(
      "VALIDATION_ERROR: Cannot publish pre-owned product with failed inspection status as active. Save as draft or archived."
    );
  }

  // 1. Enforce unique storage keys across incoming image metadata
  if (input.images && input.images.length > 0) {
    const seenStorageKeys = new Set<string>();
    for (const img of input.images) {
      if (img.storageKey) {
        if (seenStorageKeys.has(img.storageKey)) {
          throw new Error(
            `VALIDATION_ERROR: Duplicate image storage key '${img.storageKey}' in product images.`
          );
        }
        seenStorageKeys.add(img.storageKey);
      }
    }
  }

  // 2. Validate receipts on any submitted images if present
  if (input.images && input.images.length > 0) {
    const receiptCheck = await verifyProductImageReceipts(input.images, user);
    if (!receiptCheck.valid) {
      throw new Error(`SECURITY_ERROR: ${receiptCheck.error}`);
    }
  }

  const attributesPayload = {
    origin: input.origin || (input.isOem ? "genuine_oem" : "branded_aftermarket"),
    condition: input.condition,
    conditionGrade: input.conditionGrade || null,
    conditionNotes: input.conditionNotes || null,
    visibleWearOrDefects: input.visibleWearOrDefects || null,
    testedStatus: input.testedStatus || null,
    inspectionStatus: input.inspectionStatus || null,
    warrantyDetails: input.warrantyDetails || null,
    partNumber: input.partNumber || null,
    oemNumber: input.oemNumber || input.oemReference || null,
    subcategoryId: input.subcategoryId || null,
    fitmentHint: input.fitmentHint || null,
    oemReference: input.oemReference || input.oemNumber || null,
    isOem: Boolean(input.isOem || input.origin === "genuine_oem"),
    fitments: input.fitments || [],
  };

  if (isDatabaseConfigured()) {
    const db = getDb();
    if (!db) {
      throw new Error("DATABASE_UNAVAILABLE: Database connection is not available.");
    }

    let createdProduct: typeof products.$inferSelect;

    await db.transaction(async (tx) => {
      // Check whether incoming image storage keys are already associated with any existing product
      if (input.images && input.images.length > 0) {
        for (const img of input.images) {
          if (img.storageKey) {
            const existingAsset = await tx
              .select({ id: productImages.id, productId: productImages.productId })
              .from(productImages)
              .where(eq(productImages.storageKey, img.storageKey))
              .limit(1);

            const firstExisting = existingAsset[0];
            if (firstExisting) {
              throw new Error(
                `SECURITY_ERROR: Asset '${img.storageKey}' is already associated with an existing product (${firstExisting.productId}). Upload receipts cannot be reused across products.`
              );
            }
          }
        }
      }

      const slug = input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      const [created] = await tx
        .insert(products)
        .values({
          sku: input.sku.trim().toUpperCase(),
          slug: `${slug}-${Date.now().toString(36)}`,
          name: input.name.trim(),
          brandId: input.brandId,
          categoryId: input.categoryId,
          priceMinor: input.priceMinor,
          compareAtPriceMinor: input.compareAtPriceMinor,
          shortDescription: input.shortDescription,
          description: input.description,
          status: targetStatus,
          attributes: attributesPayload,
        })
        .returning();

      if (!created) {
        throw new Error("Failed to insert product record into database.");
      }

      createdProduct = created;

      // Persist normalized product images in productImages table
      if (input.images && input.images.length > 0) {
        const imageRecords = input.images.map((img, idx) => ({
          productId: created.id,
          storageKey: img.storageKey || null,
          url: img.url,
          altText: img.altText || input.name || "Automotive spare part",
          sortOrder: typeof img.sortOrder === "number" ? img.sortOrder : idx,
          isPrimary: Boolean(img.isPrimary ?? (idx === 0)),
        }));

        await tx.insert(productImages).values(imageRecords);

        // Stage C: Verify and commit media upload sessions in the same transaction
        const attachments: EntityMediaAttachment[] = input.images
          .filter((img): img is typeof img & { storageKey: string } => Boolean(img.storageKey))
          .map((img) => ({
            storageKey: img.storageKey,
            uploadReceipt: img.uploadReceipt,
            fieldName: "gallery",
          }));

        if (attachments.length > 0) {
          await verifyAndCommitMediaUploadSessions({
            tx,
            attachments,
            entityType: "product",
            entityId: created.id,
            actorId: user.id,
            expectedFolder: CLOUDINARY_FOLDERS.products,
          });
        }
      } else if (input.primaryImageUrl) {
        await tx.insert(productImages).values({
          productId: created.id,
          storageKey: null,
          url: input.primaryImageUrl,
          altText: input.name || "Automotive spare part",
          sortOrder: 0,
          isPrimary: true,
        });
      }
    });

    invalidateAdminCache("products");
    return {
      success: true,
      productId: createdProduct!.id,
      status: targetStatus,
      message:
        targetStatus === "draft"
          ? `Product "${createdProduct!.name}" saved successfully as draft (unpublished).`
          : `Product "${createdProduct!.name}" created successfully with condition: ${input.condition.toUpperCase()}.`,
      imagesCount: input.images?.length || (input.primaryImageUrl ? 1 : 0),
    };
  }

  // Demo fallback
  const demoProductId = `demo-${Date.now()}`;
  const primaryImg = input.images?.[0]?.url || input.primaryImageUrl || undefined;
  addInMemoryCreatedProduct({
    id: demoProductId,
    sku: input.sku.trim().toUpperCase(),
    name: input.name.trim(),
    brandName: input.brandId,
    categoryName: input.categoryId,
    categorySlug: input.categoryId,
    subcategoryId: input.subcategoryId || undefined,
    fitmentHint: input.fitmentHint || undefined,
    imageUrl: primaryImg,
    priceMinor: input.priceMinor,
    condition: input.condition,
    conditionNotes: input.conditionNotes || null,
    status: targetStatus,
    isDemo: true,
  });

  if (input.images && input.images.length > 0) {
    const attachments: EntityMediaAttachment[] = input.images
      .filter((img): img is typeof img & { storageKey: string } => Boolean(img.storageKey))
      .map((img) => ({
        storageKey: img.storageKey,
        uploadReceipt: img.uploadReceipt,
        fieldName: "gallery",
      }));

    if (attachments.length > 0) {
      await verifyAndCommitMediaUploadSessions({
        tx: null,
        attachments,
        entityType: "product",
        entityId: demoProductId,
        actorId: user.id,
        expectedFolder: CLOUDINARY_FOLDERS.products,
      });
    }
  }

  invalidateAdminCache("products");
  return {
    success: true,
    productId: demoProductId,
    status: targetStatus,
    isDemo: true,
    message:
      targetStatus === "draft"
        ? `[Demo Mode] Admin created draft product "${input.name}" (unpublished, simulated).`
        : `[Demo Mode] Admin created product "${input.name}" with condition: ${input.condition.toUpperCase()} (simulated).`,
    imagesCount: input.images?.length || (input.primaryImageUrl ? 1 : 0),
  };
}

/**
 * Updates an existing catalogue product while preserving existing condition and disclosures.
 */
export async function updateAdminProduct(
  input: AdminUpdateProductInput,
  userOverride?: SafeUser | null
) {
  const user = await assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_WRITE, userOverride);

  // 1. Enforce unique storage keys across incoming image metadata
  if (input.images && input.images.length > 0) {
    const seenStorageKeys = new Set<string>();
    for (const img of input.images) {
      if (img.storageKey) {
        if (seenStorageKeys.has(img.storageKey)) {
          throw new Error(
            `VALIDATION_ERROR: Duplicate image storage key '${img.storageKey}' in product images.`
          );
        }
        seenStorageKeys.add(img.storageKey);
      }
    }
  }

  const retainedIncomingKeys = new Set(
    (input.images || [])
      .map((img) => img.storageKey)
      .filter((k): k is string => Boolean(k))
  );

  const isDemoProduct = input.id.startsWith("demo-") || DEMO_FEATURED_PRODUCTS.some((p) => p.id === input.id);

  if (isDatabaseConfigured() && !isDemoProduct && isValidUuid(input.id)) {
    const db = getDb();
    if (!db) {
      throw new Error("DATABASE_UNAVAILABLE: Database connection is not available.");
    }

    let updatedProduct: typeof products.$inferSelect;
    const verifiedKeysToDelete: string[] = [];

    await db.transaction(async (tx) => {
      const existing = await tx.query.products.findFirst({
        where: eq(products.id, input.id),
      });

      if (!existing) {
        throw new Error(`Product not found with ID: ${input.id}`);
      }

      // 1. Fetch current persisted images for this exact product inside transaction
      const currentImages = await tx
        .select()
        .from(productImages)
        .where(eq(productImages.productId, input.id));

      const currentStorageKeys = new Set(
        currentImages
          .map((img) => img.storageKey)
          .filter((k): k is string => Boolean(k))
      );

      // 2. Receipt verification & unauthorized reuse check for newly introduced images
      if (input.images && input.images.length > 0) {
        for (const img of input.images) {
          if (img.storageKey) {
            const conflict = await tx
              .select({ id: productImages.id, productId: productImages.productId })
              .from(productImages)
              .where(
                and(
                  eq(productImages.storageKey, img.storageKey),
                  ne(productImages.productId, input.id)
                )
              )
              .limit(1);

            const firstConflict = conflict[0];
            if (firstConflict) {
              throw new Error(
                `SECURITY_ERROR: Asset '${img.storageKey}' is already associated with another product (${firstConflict.productId}). Upload receipts cannot be reused across products.`
              );
            }
          }
        }

        const receiptCheck = await verifyProductImageReceipts(input.images, user, {
          persistedKeys: currentStorageKeys,
        });
        if (!receiptCheck.valid) {
          throw new Error(`SECURITY_ERROR: ${receiptCheck.error}`);
        }
      }

      // 3. Ownership and cross-product verification for staged deletions
      if (input.stagedDeletedStorageKeys && input.stagedDeletedStorageKeys.length > 0) {
        // Deduplicate requested keys
        const requestedKeys = Array.from(new Set(input.stagedDeletedStorageKeys));

        for (const reqKey of requestedKeys) {
          // Reject if not valid format
          if (!isValidProductAssetPublicId(reqKey)) {
            continue;
          }

          // Rule 1: If key remains in updated image list, it MUST NOT be deleted from Cloudinary
          if (retainedIncomingKeys.has(reqKey)) {
            continue;
          }

          // Rule 2: Reject if not currently associated with this exact product
          if (!currentStorageKeys.has(reqKey)) {
            continue;
          }

          // Rule: Check if key is still referenced by another product
          const otherReferences = await tx
            .select({ id: productImages.id })
            .from(productImages)
            .where(
              and(
                eq(productImages.storageKey, reqKey),
                ne(productImages.productId, input.id)
              )
            )
            .limit(1);

          if (otherReferences.length > 0) {
            // Still referenced by another product: do NOT delete from Cloudinary
            continue;
          }

          verifiedKeysToDelete.push(reqKey);
        }
      }

      const currentAttrs = (existing.attributes || {}) as Record<string, unknown>;

      // Safely merge attributes preserving existing condition/disclosures
      const mergedAttrs = {
        ...currentAttrs,
        ...(input.origin !== undefined ? { origin: input.origin } : {}),
        ...(input.condition !== undefined ? { condition: input.condition } : {}),
        ...(input.conditionGrade !== undefined ? { conditionGrade: input.conditionGrade } : {}),
        ...(input.conditionNotes !== undefined ? { conditionNotes: input.conditionNotes } : {}),
        ...(input.visibleWearOrDefects !== undefined ? { visibleWearOrDefects: input.visibleWearOrDefects } : {}),
        ...(input.testedStatus !== undefined ? { testedStatus: input.testedStatus } : {}),
        ...(input.inspectionStatus !== undefined ? { inspectionStatus: input.inspectionStatus } : {}),
        ...(input.warrantyDetails !== undefined ? { warrantyDetails: input.warrantyDetails } : {}),
        ...(input.partNumber !== undefined ? { partNumber: input.partNumber } : {}),
        ...(input.oemNumber !== undefined ? { oemNumber: input.oemNumber } : {}),
        ...(input.subcategoryId !== undefined ? { subcategoryId: input.subcategoryId } : {}),
        ...(input.fitmentHint !== undefined ? { fitmentHint: input.fitmentHint } : {}),
        ...(input.oemReference !== undefined ? { oemReference: input.oemReference } : {}),
        ...(input.isOem !== undefined ? { isOem: input.isOem } : {}),
        ...(input.fitments !== undefined ? { fitments: input.fitments } : {}),
      };

      const updateFields: Record<string, unknown> = {
        attributes: mergedAttrs,
        updatedAt: new Date(),
      };

      if (input.name !== undefined) updateFields.name = input.name.trim();
      if (input.sku !== undefined) updateFields.sku = input.sku.trim().toUpperCase();
      if (input.categoryId !== undefined) updateFields.categoryId = input.categoryId;
      if (input.brandId !== undefined) updateFields.brandId = input.brandId;
      if (input.priceMinor !== undefined) updateFields.priceMinor = input.priceMinor;
      if (input.compareAtPriceMinor !== undefined) updateFields.compareAtPriceMinor = input.compareAtPriceMinor;
      if (input.shortDescription !== undefined) updateFields.shortDescription = input.shortDescription;
      if (input.description !== undefined) updateFields.description = input.description;
      if (input.status !== undefined) {
        if (input.status === "active") {
          const targetCondition =
            input.condition !== undefined
              ? input.condition
              : parseProductCondition(currentAttrs.condition);
          if (targetCondition === "unclassified" || !targetCondition) {
            throw new Error(
              "PUBLISHING_BLOCKED: Product condition (New or Pre-Owned) is mandatory before publishing."
            );
          }
        }
        updateFields.status = input.status;
      }

      // Invariant: Failed inspection on used parts must never permit active publishing
      const resultingStatus = input.status !== undefined ? input.status : existing.status;
      const resultingCondition =
        input.condition !== undefined
          ? input.condition
          : parseProductCondition(currentAttrs.condition);
      const resultingInspection =
        input.inspectionStatus !== undefined
          ? input.inspectionStatus
          : (currentAttrs.inspectionStatus as string | undefined);

      if (
        resultingStatus === "active" &&
        resultingCondition === "used" &&
        resultingInspection === "failed"
      ) {
        throw new Error(
          "VALIDATION_ERROR: Cannot publish pre-owned product with failed inspection status as active. Save as draft or archived."
        );
      }

      const [updated] = await tx
        .update(products)
        .set(updateFields)
        .where(eq(products.id, input.id))
        .returning();

      if (!updated) {
        throw new Error(`Failed to update product with ID: ${input.id}`);
      }

      updatedProduct = updated;

      // Update normalized images in productImages if provided
      if (input.images !== undefined) {
        await tx.delete(productImages).where(eq(productImages.productId, input.id));

        if (input.images && input.images.length > 0) {
          const imageRecords = input.images.map((img, idx) => ({
            productId: input.id,
            storageKey: img.storageKey || null,
            url: img.url,
            altText: img.altText || updated.name || "Automotive spare part",
            sortOrder: typeof img.sortOrder === "number" ? img.sortOrder : idx,
            isPrimary: Boolean(img.isPrimary ?? (idx === 0)),
          }));
          await tx.insert(productImages).values(imageRecords);

          // Stage C: Verify and commit media upload sessions in the same transaction
          const attachments: EntityMediaAttachment[] = input.images
            .filter((img): img is typeof img & { storageKey: string } => Boolean(img.storageKey))
            .map((img) => ({
              storageKey: img.storageKey,
              uploadReceipt: img.uploadReceipt,
              fieldName: "gallery",
            }));

          if (attachments.length > 0) {
            await verifyAndCommitMediaUploadSessions({
              tx,
              attachments,
              entityType: "product",
              entityId: input.id,
              actorId: user.id,
              expectedFolder: CLOUDINARY_FOLDERS.products,
            });
          }
        }
      }

      // Update inventory stock quantity if provided
      if (input.stockQuantity !== undefined) {
        try {
          const existingInv = await tx
            .select({ id: inventory.id })
            .from(inventory)
            .where(eq(inventory.productId, input.id))
            .limit(1);

          if (existingInv.length > 0) {
            await tx
              .update(inventory)
              .set({ quantityOnHand: input.stockQuantity, updatedAt: new Date() })
              .where(eq(inventory.productId, input.id));
          } else {
            await tx.insert(inventory).values({
              productId: input.id,
              quantityOnHand: input.stockQuantity,
            });
          }
        } catch {
          // Non-blocking in mock/fallback environments
        }
      }
    });

    // Cloudinary deletion runs ONLY AFTER the database transaction has successfully committed
    const failedDeletions: Array<{ storageKey: string; error: string }> = [];
    const successfulDeletions: string[] = [];

    if (verifiedKeysToDelete.length > 0) {
      const { deleteCloudinaryAsset } = await import("@/lib/cloudinary");
      for (const storageKey of verifiedKeysToDelete) {
        try {
          const delRes = await deleteCloudinaryAsset(storageKey, { userOverride });
          if (delRes.success) {
            successfulDeletions.push(storageKey);
          } else {
            const errStr = delRes.error || "Unknown deletion error";
            failedDeletions.push({ storageKey, error: errStr });
            console.warn(
              `[Cloudinary Cleanup] Post-update deletion failed for asset '${storageKey}': ${errStr}`
            );
          }
        } catch (delErr) {
          const errStr = delErr instanceof Error ? delErr.message : "Deletion error";
          failedDeletions.push({ storageKey, error: errStr });
          console.warn(
            `[Cloudinary Cleanup] Post-update deletion exception for asset '${storageKey}': ${errStr}`
          );
        }
      }
    }

    invalidateAdminCache("products");
    const hasCleanupWarnings = failedDeletions.length > 0;
    return {
      success: true,
      productId: updatedProduct!.id,
      status: updatedProduct!.status,
      message: hasCleanupWarnings
        ? `Product "${updatedProduct!.name}" updated successfully. Note: ${failedDeletions.length} unreferenced media asset(s) could not be removed from Cloudinary.`
        : `Product "${updatedProduct!.name}" updated successfully.`,
      cleanup: {
        attemptedCount: verifiedKeysToDelete.length,
        deletedCount: successfulDeletions.length,
        failedCount: failedDeletions.length,
        failedKeys: failedDeletions,
        hasFailures: hasCleanupWarnings,
        warning: hasCleanupWarnings
          ? `Database update succeeded, but Cloudinary asset cleanup encountered failures for: ${failedDeletions.map((f) => f.storageKey).join(", ")}.`
          : undefined,
      },
    };
  }

  // Demo fallback
  if (input.status !== undefined && input.status === "active") {
    if ((input.condition as string) === "unclassified") {
      throw new Error(
        "PUBLISHING_BLOCKED: Product condition (New or Pre-Owned) is mandatory before publishing."
      );
    }
    if (input.condition === "used" && input.inspectionStatus === "failed") {
      throw new Error(
        "VALIDATION_ERROR: Cannot publish pre-owned product with failed inspection status as active. Save as draft or archived."
      );
    }
  }

  if (input.images && input.images.length > 0) {
    const receiptCheck = await verifyProductImageReceipts(input.images, user);
    if (!receiptCheck.valid) {
      throw new Error(`SECURITY_ERROR: ${receiptCheck.error}`);
    }

    const attachments: EntityMediaAttachment[] = input.images
      .filter((img): img is typeof img & { storageKey: string } => Boolean(img.storageKey))
      .map((img) => ({
        storageKey: img.storageKey,
        uploadReceipt: img.uploadReceipt,
        fieldName: "gallery",
      }));

    if (attachments.length > 0) {
      await verifyAndCommitMediaUploadSessions({
        tx: null,
        attachments,
        entityType: "product",
        entityId: input.id,
        actorId: user.id,
        expectedFolder: CLOUDINARY_FOLDERS.products,
      });
    }
  }

  const verifiedKeysToDelete: string[] = [];
  if (input.stagedDeletedStorageKeys && input.stagedDeletedStorageKeys.length > 0) {
    const requestedKeys = Array.from(new Set(input.stagedDeletedStorageKeys));
    for (const reqKey of requestedKeys) {
      if (retainedIncomingKeys.has(reqKey)) {
        continue;
      }
      if (isValidProductAssetPublicId(reqKey)) {
        verifiedKeysToDelete.push(reqKey);
      }
    }
  }

  const failedDeletions: Array<{ storageKey: string; error: string }> = [];
  const successfulDeletions: string[] = [];

  if (verifiedKeysToDelete.length > 0) {
    const { deleteCloudinaryAsset } = await import("@/lib/cloudinary");
    for (const storageKey of verifiedKeysToDelete) {
      try {
        const delRes = await deleteCloudinaryAsset(storageKey, { userOverride });
        if (delRes.success) {
          successfulDeletions.push(storageKey);
        } else {
          failedDeletions.push({ storageKey, error: delRes.error || "Deletion failed" });
        }
      } catch (delErr) {
        failedDeletions.push({
          storageKey,
          error: delErr instanceof Error ? delErr.message : "Deletion error",
        });
      }
    }
  }

  updateInMemoryProduct(input.id, {
    ...(input.name ? { name: input.name.trim() } : {}),
    ...(input.sku ? { sku: input.sku.trim().toUpperCase() } : {}),
    ...(input.priceMinor ? { priceMinor: input.priceMinor } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.condition ? { condition: input.condition } : {}),
    ...(input.subcategoryId !== undefined ? { subcategoryId: input.subcategoryId || undefined } : {}),
    ...(input.fitmentHint !== undefined ? { fitmentHint: input.fitmentHint || undefined } : {}),
    ...(input.images?.[0]?.url ? { imageUrl: input.images[0].url } : {}),
  });

  invalidateAdminCache("products");
  const hasCleanupWarnings = failedDeletions.length > 0;
  return {
    success: true,
    productId: input.id,
    status: input.status,
    isDemo: true,
    message: hasCleanupWarnings
      ? `[Demo Mode] Product "${input.name || input.id}" updated successfully. Note: ${failedDeletions.length} unreferenced media asset(s) could not be removed from Cloudinary.`
      : `[Demo Mode] Product "${input.name || input.id}" updated successfully (simulated).`,
    cleanup: {
      attemptedCount: verifiedKeysToDelete.length,
      deletedCount: successfulDeletions.length,
      failedCount: failedDeletions.length,
      failedKeys: failedDeletions,
      hasFailures: hasCleanupWarnings,
      warning: hasCleanupWarnings
        ? `Database update succeeded, but Cloudinary asset cleanup encountered failures for: ${failedDeletions.map((f) => f.storageKey).join(", ")}.`
        : undefined,
    },
  };
}

/**
 * Publishes or changes the status of a catalogue product.
 * Requires mandatory explicit condition (New or Pre-Owned) before publishing.
 */
export async function publishAdminProduct(
  id: string,
  status: "active" | "draft" | "archived" = "active",
  userOverride?: SafeUser | null
) {
  await assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_WRITE, userOverride);

  const isDemoProduct = id.startsWith("demo-") || DEMO_FEATURED_PRODUCTS.some((p) => p.id === id);

  if (isDatabaseConfigured() && !isDemoProduct && isValidUuid(id)) {
    const db = getDb();
    if (!db) {
      throw new Error("DATABASE_UNAVAILABLE: Database connection is not available.");
    }

    const existing = await db.query.products.findFirst({
      where: eq(products.id, id),
    });

    if (!existing) {
      throw new Error(`Product not found with ID: ${id}`);
    }

    const attrs = (existing.attributes || {}) as Record<string, unknown>;
    const condition = parseProductCondition(attrs.condition);

    if (status === "active" && (condition === "unclassified" || !attrs.condition)) {
      throw new Error(
        "PUBLISHING_BLOCKED: Product condition (New or Pre-Owned) is mandatory before publishing."
      );
    }

    if (status === "active" && condition === "used" && attrs.inspectionStatus === "failed") {
      throw new Error(
        "VALIDATION_ERROR: Cannot publish pre-owned product with failed inspection status as active. Save as draft or archived."
      );
    }

    const [updated] = await db
      .update(products)
      .set({ status, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();

    if (!updated) {
      throw new Error(`Failed to update status for product ID: ${id}`);
    }

    invalidateAdminCache("products");
    return {
      success: true,
      productId: updated.id,
      status: updated.status,
      message: `Product "${updated.name}" status changed to ${status}.`,
    };
  }

  // Demo fallback
  if (status === "active") {
    const demoProd = DEMO_FEATURED_PRODUCTS.find((p) => p.id === id);
    if (demoProd) {
      if (demoProd.condition === "used" && demoProd.inspectionStatus === "failed") {
        throw new Error(
          "VALIDATION_ERROR: Cannot publish pre-owned product with failed inspection status as active. Save as draft or archived."
        );
      }
    }
  }

  updateInMemoryProduct(id, { status });

  invalidateAdminCache("products");
  return {
    success: true,
    productId: id,
    status,
    isDemo: true,
    message: `[Demo Mode] Product status changed to ${status} (simulated).`,
  };
}

/**
 * Deletes a product from the catalogue.
 * Requires CATALOGUE_DELETE permission.
 */
export async function deleteAdminProduct(
  id: string,
  userOverride?: SafeUser | null
) {
  await assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_DELETE, userOverride);

  const isDemoProduct = id.startsWith("demo-") || DEMO_FEATURED_PRODUCTS.some((p) => p.id === id);

  if (isDatabaseConfigured() && !isDemoProduct && isValidUuid(id)) {
    const db = getDb();
    if (!db) {
      throw new Error("DATABASE_UNAVAILABLE: Database connection is not available.");
    }

    const [deleted] = await db
      .delete(products)
      .where(eq(products.id, id))
      .returning();

    if (!deleted) {
      throw new Error(`Product not found or already deleted: ${id}`);
    }

    invalidateAdminCache("products");
    return {
      success: true,
      productId: deleted.id,
      message: `Product "${deleted.name}" deleted successfully.`,
    };
  }

  // Demo fallback
  invalidateAdminCache("products");
  return {
    success: true,
    productId: id,
    isDemo: true,
    message: `[Demo Mode] Product ${id} deleted successfully (simulated).`,
  };
}

// ==============================================================================
// Phase C3: Category, Brand & Promotional Banner Image Management
// ==============================================================================

export interface AdminCategoryItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  storageKey: string | null;
  status: string;
  sortOrder: number;
  isTopNav: boolean;
}

export interface AdminBrandItem {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  storageKey: string | null;
  status: string;
}

export interface AdminBannerItem {
  id: string;
  title: string;
  subtitle?: string | null;
  desktopImageUrl: string;
  desktopStorageKey?: string | null;
  desktopUploadReceipt?: string | null;
  mobileImageUrl?: string | null;
  mobileStorageKey?: string | null;
  mobileUploadReceipt?: string | null;
  altText: string;
  linkUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
}

import {
  INITIAL_DEMO_CATEGORIES,
  INITIAL_DEMO_BRANDS,
  INITIAL_DEMO_BANNERS,
  getInMemoryCategories,
  getInMemoryCategoryById,
  setInMemoryCategory,
  getInMemoryBrands,
  getInMemoryBrandById,
  setInMemoryBrand,
  getInMemoryBanners,
  setInMemoryBanners,
} from "@/server/catalogue/demo-state";

export const DEMO_ADMIN_CATEGORIES: AdminCategoryItem[] = INITIAL_DEMO_CATEGORIES;
export const DEMO_ADMIN_BRANDS: AdminBrandItem[] = INITIAL_DEMO_BRANDS;
export const DEMO_ADMIN_BANNERS: AdminBannerItem[] = INITIAL_DEMO_BANNERS;

/**
 * Loads categories for administrative management.
 */
export async function getAdminCategories(
  userOverride?: SafeUser | null
): Promise<AdminCategoryItem[]> {
  await assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_READ, userOverride);

  const cacheKey = "admin:categories";
  if (!userOverride) {
    const cached = getFromAdminCache<AdminCategoryItem[]>(cacheKey);
    if (cached) return cached;
  }

  let result: AdminCategoryItem[] = [];

  if (isDatabaseConfigured()) {
    const db = getDb();
    if (!db) {
      throw new Error("DATABASE_UNAVAILABLE: Database connection is not available.");
    }

    const rows = await db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        imageUrl: categories.imageUrl,
        status: categories.status,
        sortOrder: categories.sortOrder,
        isTopNav: categories.isTopNav,
      })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name));

    if (rows.length > 0 || !isExplicitDevOrTest()) {
      result = rows.map((cat) => ({
        ...cat,
        storageKey: extractCloudinaryStorageKey(cat.imageUrl),
      }));
      if (!userOverride) setAdminCache(cacheKey, result);
      return result;
    }
  }

  result = getInMemoryCategories().map((c) => ({
    ...c,
    storageKey: extractCloudinaryStorageKey(c.imageUrl),
  }));
  if (!userOverride) setAdminCache(cacheKey, result);
  return result;
}

/**
 * Loads a single category by ID.
 */
export async function getAdminCategoryById(
  id: string,
  userOverride?: SafeUser | null
): Promise<AdminCategoryItem | null> {
  const cats = await getAdminCategories(userOverride);
  return cats.find((c) => c.id === id) || null;
}

export interface AdminCreateCategoryInput {
  name: string;
  slug?: string;
  description?: string | null;
  imageUrl?: string | null;
  storageKey?: string | null;
  isTopNav?: boolean;
  uploadReceipt?: string | null;
}

/**
 * Creates a new category in the catalogue or demo in-memory storage.
 */
export async function createAdminCategory(
  input: AdminCreateCategoryInput,
  userOverride?: SafeUser | null
): Promise<{ success: boolean; category: AdminCategoryItem; isDemo?: boolean }> {
  await assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_WRITE, userOverride);

  if (!input.name || input.name.trim().length === 0) {
    throw new Error("Category name is required.");
  }

  const cleanName = input.name.trim();
  const cleanSlug =
    input.slug?.trim() ||
    cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
    `cat-${Date.now()}`;

  if (isDatabaseConfigured()) {
    const db = getDb();
    if (db) {
      try {
        const [created] = await db
          .insert(categories)
          .values({
            name: cleanName,
            slug: cleanSlug,
            description: input.description?.trim() || null,
            imageUrl: input.imageUrl?.trim() || null,
            isTopNav: Boolean(input.isTopNav),
            status: "active",
            sortOrder: 10,
          })
          .returning();

        if (created) {
          invalidateAdminCache("categories");
          return {
            success: true,
            category: {
              id: created.id,
              name: created.name,
              slug: created.slug,
              description: created.description,
              imageUrl: created.imageUrl,
              storageKey: extractCloudinaryStorageKey(created.imageUrl),
              status: created.status,
              sortOrder: created.sortOrder,
              isTopNav: created.isTopNav,
            },
          };
        }
      } catch (dbErr) {
        console.warn("[Admin Category] DB insert fallback to memory:", dbErr);
      }
    }
  }

  // Demo fallback
  const newCatId = `cat-${Date.now()}`;
  const newCat: AdminCategoryItem = {
    id: newCatId,
    name: cleanName,
    slug: cleanSlug,
    description: input.description?.trim() || null,
    imageUrl: input.imageUrl?.trim() || null,
    storageKey: input.storageKey?.trim() || extractCloudinaryStorageKey(input.imageUrl),
    status: "active",
    sortOrder: 10,
    isTopNav: Boolean(input.isTopNav),
  };
  setInMemoryCategory(newCatId, newCat);
  invalidateAdminCache("categories");
  return {
    success: true,
    category: newCat,
    isDemo: true,
  };
}

/**
 * Updates a category's promotional image with Cloudinary asset validation and lifecycle protection.
 */
export async function updateAdminCategoryImage(
  input: AdminUpdateCategoryImageInput,
  userOverride?: SafeUser | null
): Promise<{
  success: boolean;
  category: AdminCategoryItem;
  cleanupErrors?: string[];
  isDemo?: boolean;
}> {
  const user = await assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_WRITE, userOverride);

  if (!input.id || typeof input.id !== "string") {
    throw new Error("Category ID is required.");
  }

  // 1. Process staged deleted storage keys
  const requestedStagedKeys = Array.from(new Set(input.stagedDeletedStorageKeys || []));
  for (const key of requestedStagedKeys) {
    if (!isValidCategoryAssetPublicId(key)) {
      throw new Error(
        `SECURITY_ERROR: Invalid or unauthorized category storage key '${key}'. Asset deletion is restricted to '${CLOUDINARY_FOLDERS.categories}/'.`
      );
    }
  }

  // 2. Determine incoming image storage key
  const incomingKey = input.storageKey || extractCloudinaryStorageKey(input.imageUrl);

  // Retained vs Deleted Defense: Never delete a storage key that remains in imageUrl
  const verifiedKeysToDelete = requestedStagedKeys.filter((key) => key !== incomingKey);

  // 3. Validate new image URL, storage key, and upload receipt
  if (input.imageUrl) {
    if (!incomingKey || !isValidCategoryAssetPublicId(incomingKey)) {
      throw new Error(
        `SECURITY_ERROR: Category image storage key '${incomingKey || "unknown"}' must belong to '${CLOUDINARY_FOLDERS.categories}/' without path traversal.`
      );
    }

    if (input.uploadReceipt) {
      const { verifyCloudinaryUploadReceipt } = await import("@/lib/cloudinary");
      const receiptCheck = verifyCloudinaryUploadReceipt(input.uploadReceipt, {
        publicId: incomingKey,
        adminId: user.id,
      });
      if (!receiptCheck.valid) {
        throw new Error(`SECURITY_ERROR: ${receiptCheck.error}`);
      }
    }
  }

  // 4. Persistence handling
  const isDemoCategory = !isValidUuid(input.id);

  if (isDatabaseConfigured() && !isDemoCategory) {
    const db = getDb();
    if (!db) {
      throw new Error("DATABASE_UNAVAILABLE: Database connection is not available.");
    }

    let updatedCategory: typeof categories.$inferSelect | undefined;

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({
          id: categories.id,
          imageUrl: categories.imageUrl,
          name: categories.name,
          slug: categories.slug,
          description: categories.description,
          status: categories.status,
          sortOrder: categories.sortOrder,
          isTopNav: categories.isTopNav,
        })
        .from(categories)
        .where(eq(categories.id, input.id));

      if (!existing) {
        throw new Error(`Category not found with ID: ${input.id}`);
      }

      const currentPersistedKey = extractCloudinaryStorageKey(existing.imageUrl);

      // Staged deletion ownership: only allow deleting assets previously belonging to this exact category
      for (const key of verifiedKeysToDelete) {
        if (currentPersistedKey && key !== currentPersistedKey) {
          throw new Error(
            `SECURITY_ERROR: Staged deletion asset '${key}' is not associated with category '${input.id}'. Cross-entity deletion prohibited.`
          );
        }
      }

      // Reuse prevention: check if this storage key is already in use by another category
      if (incomingKey && input.imageUrl) {
        const [duplicate] = await tx
          .select({ id: categories.id, name: categories.name })
          .from(categories)
          .where(
            and(
              ne(categories.id, input.id),
              eq(categories.imageUrl, input.imageUrl)
            )
          )
          .limit(1);

        if (duplicate) {
          throw new Error(
            `SECURITY_ERROR: Storage key '${incomingKey}' is already associated with category '${duplicate.name}' (${duplicate.id}). Asset reuse across categories is prohibited.`
          );
        }

        // Stage C: Verify and commit media upload session in the same transaction
        await verifyAndCommitMediaUploadSessions({
          tx,
          attachments: [
            {
              storageKey: incomingKey,
              uploadReceipt: input.uploadReceipt,
              fieldName: "imageUrl",
            },
          ],
          entityType: "category",
          entityId: input.id,
          actorId: user.id,
          expectedFolder: CLOUDINARY_FOLDERS.categories,
        });
      }

      // Execute database update
      const [updated] = await tx
        .update(categories)
        .set({
          imageUrl: input.imageUrl ?? null,
          updatedAt: new Date(),
        })
        .where(eq(categories.id, input.id))
        .returning();

      if (!updated) {
        throw new Error(`Failed to update category: ${input.id}`);
      }

      updatedCategory = updated;
    });

    if (!updatedCategory) {
      throw new Error(`Failed to update category: ${input.id}`);
    }

    // Post-commit asset cleanup
    const cleanupErrors: string[] = [];
    if (verifiedKeysToDelete.length > 0) {
      const { deleteCloudinaryAsset } = await import("@/lib/cloudinary");
      for (const delKey of verifiedKeysToDelete) {
        try {
          const delRes = await deleteCloudinaryAsset(delKey, {
            allowedFolder: CLOUDINARY_FOLDERS.categories,
            userOverride,
          });
          if (!delRes.success) {
            cleanupErrors.push(`Failed to delete ${delKey}: ${delRes.error}`);
          }
        } catch (delErr) {
          cleanupErrors.push(
            `Exception deleting ${delKey}: ${delErr instanceof Error ? delErr.message : "Error"}`
          );
        }
      }
    }

    invalidateAdminCache("categories");
    return {
      success: true,
      category: {
        id: updatedCategory.id,
        name: updatedCategory.name,
        slug: updatedCategory.slug,
        description: updatedCategory.description,
        imageUrl: updatedCategory.imageUrl,
        storageKey: extractCloudinaryStorageKey(updatedCategory.imageUrl),
        status: updatedCategory.status,
        sortOrder: updatedCategory.sortOrder,
        isTopNav: updatedCategory.isTopNav,
      },
      cleanupErrors: cleanupErrors.length > 0 ? cleanupErrors : undefined,
    };
  }

  // Demo fallback
  const demoCat = getInMemoryCategoryById(input.id);
  if (!demoCat) {
    throw new Error(`Category not found with ID: ${input.id}`);
  }

  const currentPersistedKey = extractCloudinaryStorageKey(demoCat.imageUrl);
  for (const key of verifiedKeysToDelete) {
    if (currentPersistedKey && key !== currentPersistedKey) {
      throw new Error(
        `SECURITY_ERROR: Staged deletion asset '${key}' is not associated with category '${input.id}'.`
      );
    }
  }

  // Demo reuse check
  if (incomingKey && input.imageUrl) {
    for (const otherCat of getInMemoryCategories()) {
      if (otherCat.id !== input.id && otherCat.imageUrl === input.imageUrl) {
        throw new Error(
          `SECURITY_ERROR: Storage key '${incomingKey}' is already associated with category '${otherCat.name}'.`
        );
      }
    }

    // Stage C: Verify and commit media upload session in demo mode
    await verifyAndCommitMediaUploadSessions({
      tx: null,
      attachments: [
        {
          storageKey: incomingKey,
          uploadReceipt: input.uploadReceipt,
          fieldName: "imageUrl",
        },
      ],
      entityType: "category",
      entityId: input.id,
      actorId: user.id,
      expectedFolder: CLOUDINARY_FOLDERS.categories,
    });
  }

  const updatedDemoCat: AdminCategoryItem = {
    ...demoCat,
    imageUrl: input.imageUrl ?? null,
    storageKey: incomingKey ?? null,
  };
  setInMemoryCategory(input.id, updatedDemoCat);

  const cleanupErrors: string[] = [];
  if (verifiedKeysToDelete.length > 0) {
    const { deleteCloudinaryAsset } = await import("@/lib/cloudinary");
    for (const delKey of verifiedKeysToDelete) {
      try {
        const delRes = await deleteCloudinaryAsset(delKey, {
          allowedFolder: CLOUDINARY_FOLDERS.categories,
          userOverride,
        });
        if (!delRes.success) {
          cleanupErrors.push(`Failed to delete ${delKey}: ${delRes.error}`);
        }
      } catch (delErr) {
        cleanupErrors.push(
          `Exception deleting ${delKey}: ${delErr instanceof Error ? delErr.message : "Error"}`
        );
      }
    }
  }

  invalidateAdminCache("categories");
  return {
    success: true,
    category: { ...updatedDemoCat },
    cleanupErrors: cleanupErrors.length > 0 ? cleanupErrors : undefined,
    isDemo: true,
  };
}

/**
 * Loads brands for administrative management.
 */
export async function getAdminBrands(
  userOverride?: SafeUser | null
): Promise<AdminBrandItem[]> {
  await assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_READ, userOverride);

  const cacheKey = "admin:brands";
  if (!userOverride) {
    const cached = getFromAdminCache<AdminBrandItem[]>(cacheKey);
    if (cached) return cached;
  }

  let result: AdminBrandItem[] = [];

  if (isDatabaseConfigured()) {
    const db = getDb();
    if (!db) {
      throw new Error("DATABASE_UNAVAILABLE: Database connection is not available.");
    }

    const rows = await db
      .select({
        id: brands.id,
        name: brands.name,
        slug: brands.slug,
        logoUrl: brands.logoUrl,
        status: brands.status,
      })
      .from(brands)
      .orderBy(asc(brands.name));

    if (rows.length > 0) {
      const dbBrands: AdminBrandItem[] = rows.map((b) => ({
        ...b,
        storageKey: extractCloudinaryStorageKey(b.logoUrl),
      }));

      const existingSlugs = new Set(rows.map((r) => r.slug.toLowerCase()));
      const existingNames = new Set(rows.map((r) => r.name.toLowerCase()));

      const masterBrands = getInMemoryBrands().map((b) => ({
        ...b,
        storageKey: extractCloudinaryStorageKey(b.logoUrl),
      }));

      const missingMasters = masterBrands.filter(
        (m) => !existingSlugs.has(m.slug.toLowerCase()) && !existingNames.has(m.name.toLowerCase())
      );

      result = [...dbBrands, ...missingMasters].sort((a, b) => a.name.localeCompare(b.name));
      if (!userOverride) setAdminCache(cacheKey, result);
      return result;
    } else if (!isExplicitDevOrTest()) {
      result = [];
      if (!userOverride) setAdminCache(cacheKey, result);
      return result;
    }
  }

  result = getInMemoryBrands().map((b) => ({
    ...b,
    storageKey: extractCloudinaryStorageKey(b.logoUrl),
  }));
  if (!userOverride) setAdminCache(cacheKey, result);
  return result;
}

/**
 * Loads a single brand by ID.
 */
export async function getAdminBrandById(
  id: string,
  userOverride?: SafeUser | null
): Promise<AdminBrandItem | null> {
  const brandList = await getAdminBrands(userOverride);
  return brandList.find((b) => b.id === id) || null;
}

export interface AdminCreateBrandInput {
  name: string;
  slug?: string;
  logoUrl?: string | null;
  storageKey?: string | null;
  uploadReceipt?: string | null;
}

/**
 * Creates a new manufacturer brand in the catalogue or demo in-memory storage.
 */
export async function createAdminBrand(
  input: AdminCreateBrandInput,
  userOverride?: SafeUser | null
): Promise<{ success: boolean; brand: AdminBrandItem; isDemo?: boolean }> {
  await assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_WRITE, userOverride);

  if (!input.name || input.name.trim().length === 0) {
    throw new Error("Brand name is required.");
  }

  const cleanName = input.name.trim();
  const cleanSlug =
    input.slug?.trim() ||
    cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
    `brand-${Date.now()}`;

  if (isDatabaseConfigured()) {
    const db = getDb();
    if (db) {
      try {
        const [created] = await db
          .insert(brands)
          .values({
            name: cleanName,
            slug: cleanSlug,
            logoUrl: input.logoUrl?.trim() || null,
            status: "active",
          })
          .returning();

        if (created) {
          invalidateAdminCache("brands");
          return {
            success: true,
            brand: {
              id: created.id,
              name: created.name,
              slug: created.slug,
              logoUrl: created.logoUrl,
              storageKey: extractCloudinaryStorageKey(created.logoUrl),
              status: created.status,
            },
          };
        }
      } catch (dbErr) {
        console.warn("[Admin Brand] DB insert fallback to memory:", dbErr);
      }
    }
  }

  // Demo fallback
  const newBrandId = `brand-${Date.now()}`;
  const newBrand: AdminBrandItem = {
    id: newBrandId,
    name: cleanName,
    slug: cleanSlug,
    logoUrl: input.logoUrl?.trim() || null,
    storageKey: input.storageKey?.trim() || extractCloudinaryStorageKey(input.logoUrl),
    status: "active",
  };
  setInMemoryBrand(newBrandId, newBrand);
  invalidateAdminCache("brands");
  return {
    success: true,
    brand: newBrand,
    isDemo: true,
  };
}

/**
 * Updates a brand's logo with Cloudinary asset validation and lifecycle protection.
 */
export async function updateAdminBrandLogo(
  input: AdminUpdateBrandLogoInput,
  userOverride?: SafeUser | null
): Promise<{
  success: boolean;
  brand: AdminBrandItem;
  cleanupErrors?: string[];
  isDemo?: boolean;
}> {
  const user = await assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_WRITE, userOverride);

  if (!input.id || typeof input.id !== "string") {
    throw new Error("Brand ID is required.");
  }

  // 1. Process staged deleted storage keys
  const requestedStagedKeys = Array.from(new Set(input.stagedDeletedStorageKeys || []));
  for (const key of requestedStagedKeys) {
    if (!isValidBrandAssetPublicId(key)) {
      throw new Error(
        `SECURITY_ERROR: Invalid or unauthorized brand storage key '${key}'. Asset deletion is restricted to '${CLOUDINARY_FOLDERS.brands}/'.`
      );
    }
  }

  // 2. Determine incoming logo storage key
  const incomingKey = input.storageKey || extractCloudinaryStorageKey(input.logoUrl);

  // Retained vs Deleted Defense
  const verifiedKeysToDelete = requestedStagedKeys.filter((key) => key !== incomingKey);

  // 3. Validate new logo URL, storage key, and upload receipt
  if (input.logoUrl) {
    if (!incomingKey || !isValidBrandAssetPublicId(incomingKey)) {
      throw new Error(
        `SECURITY_ERROR: Brand logo storage key '${incomingKey || "unknown"}' must belong to '${CLOUDINARY_FOLDERS.brands}/' without path traversal.`
      );
    }

    if (input.uploadReceipt) {
      const { verifyCloudinaryUploadReceipt } = await import("@/lib/cloudinary");
      const receiptCheck = verifyCloudinaryUploadReceipt(input.uploadReceipt, {
        publicId: incomingKey,
        adminId: user.id,
      });
      if (!receiptCheck.valid) {
        throw new Error(`SECURITY_ERROR: ${receiptCheck.error}`);
      }
    }
  }

  // 4. Persistence handling
  const isDemoBrand = !isValidUuid(input.id);

  if (isDatabaseConfigured() && !isDemoBrand) {
    const db = getDb();
    if (!db) {
      throw new Error("DATABASE_UNAVAILABLE: Database connection is not available.");
    }

    let updatedBrand: typeof brands.$inferSelect | undefined;

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({
          id: brands.id,
          logoUrl: brands.logoUrl,
          name: brands.name,
          slug: brands.slug,
          status: brands.status,
        })
        .from(brands)
        .where(eq(brands.id, input.id));

      if (!existing) {
        throw new Error(`Brand not found with ID: ${input.id}`);
      }

      const currentPersistedKey = extractCloudinaryStorageKey(existing.logoUrl);

      // Staged deletion ownership: only allow deleting assets previously belonging to this exact brand
      for (const key of verifiedKeysToDelete) {
        if (currentPersistedKey && key !== currentPersistedKey) {
          throw new Error(
            `SECURITY_ERROR: Staged deletion asset '${key}' is not associated with brand '${input.id}'. Cross-entity deletion prohibited.`
          );
        }
      }

      // Reuse prevention: check if this storage key is already in use by another brand
      if (incomingKey && input.logoUrl) {
        const [duplicate] = await tx
          .select({ id: brands.id, name: brands.name })
          .from(brands)
          .where(
            and(
              ne(brands.id, input.id),
              eq(brands.logoUrl, input.logoUrl)
            )
          )
          .limit(1);

        if (duplicate) {
          throw new Error(
            `SECURITY_ERROR: Storage key '${incomingKey}' is already associated with brand '${duplicate.name}' (${duplicate.id}). Asset reuse across brands is prohibited.`
          );
        }

        // Stage C: Verify and commit media upload session in the same transaction
        await verifyAndCommitMediaUploadSessions({
          tx,
          attachments: [
            {
              storageKey: incomingKey,
              uploadReceipt: input.uploadReceipt,
              fieldName: "logoUrl",
            },
          ],
          entityType: "brand",
          entityId: input.id,
          actorId: user.id,
          expectedFolder: CLOUDINARY_FOLDERS.brands,
        });
      }

      // Execute database update
      const [updated] = await tx
        .update(brands)
        .set({
          logoUrl: input.logoUrl ?? null,
          updatedAt: new Date(),
        })
        .where(eq(brands.id, input.id))
        .returning();

      if (!updated) {
        throw new Error(`Failed to update brand: ${input.id}`);
      }

      updatedBrand = updated;
    });

    if (!updatedBrand) {
      throw new Error(`Failed to update brand: ${input.id}`);
    }

    // Post-commit asset cleanup
    const cleanupErrors: string[] = [];
    if (verifiedKeysToDelete.length > 0) {
      const { deleteCloudinaryAsset } = await import("@/lib/cloudinary");
      for (const delKey of verifiedKeysToDelete) {
        try {
          const delRes = await deleteCloudinaryAsset(delKey, {
            allowedFolder: CLOUDINARY_FOLDERS.brands,
            userOverride,
          });
          if (!delRes.success) {
            cleanupErrors.push(`Failed to delete ${delKey}: ${delRes.error}`);
          }
        } catch (delErr) {
          cleanupErrors.push(
            `Exception deleting ${delKey}: ${delErr instanceof Error ? delErr.message : "Error"}`
          );
        }
      }
    }

    invalidateAdminCache("brands");
    return {
      success: true,
      brand: {
        id: updatedBrand.id,
        name: updatedBrand.name,
        slug: updatedBrand.slug,
        logoUrl: updatedBrand.logoUrl,
        storageKey: extractCloudinaryStorageKey(updatedBrand.logoUrl),
        status: updatedBrand.status,
      },
      cleanupErrors: cleanupErrors.length > 0 ? cleanupErrors : undefined,
    };
  }

  // Demo fallback
  const demoBrand = getInMemoryBrandById(input.id);
  if (!demoBrand) {
    throw new Error(`Brand not found with ID: ${input.id}`);
  }

  const currentPersistedKey = extractCloudinaryStorageKey(demoBrand.logoUrl);
  for (const key of verifiedKeysToDelete) {
    if (currentPersistedKey && key !== currentPersistedKey) {
      throw new Error(
        `SECURITY_ERROR: Staged deletion asset '${key}' is not associated with brand '${input.id}'.`
      );
    }
  }

  // Demo reuse check
  if (incomingKey && input.logoUrl) {
    for (const otherBrand of getInMemoryBrands()) {
      if (otherBrand.id !== input.id && otherBrand.logoUrl === input.logoUrl) {
        throw new Error(
          `SECURITY_ERROR: Storage key '${incomingKey}' is already associated with brand '${otherBrand.name}'.`
        );
      }
    }

    // Stage C: Verify and commit media upload session in demo mode
    await verifyAndCommitMediaUploadSessions({
      tx: null,
      attachments: [
        {
          storageKey: incomingKey,
          uploadReceipt: input.uploadReceipt,
          fieldName: "logoUrl",
        },
      ],
      entityType: "brand",
      entityId: input.id,
      actorId: user.id,
      expectedFolder: CLOUDINARY_FOLDERS.brands,
    });
  }

  const updatedDemoBrand: AdminBrandItem = {
    ...demoBrand,
    logoUrl: input.logoUrl ?? null,
    storageKey: incomingKey ?? null,
  };
  setInMemoryBrand(input.id, updatedDemoBrand);

  const cleanupErrors: string[] = [];
  if (verifiedKeysToDelete.length > 0) {
    const { deleteCloudinaryAsset } = await import("@/lib/cloudinary");
    for (const delKey of verifiedKeysToDelete) {
      try {
        const delRes = await deleteCloudinaryAsset(delKey, {
          allowedFolder: CLOUDINARY_FOLDERS.brands,
          userOverride,
        });
        if (!delRes.success) {
          cleanupErrors.push(`Failed to delete ${delKey}: ${delRes.error}`);
        }
      } catch (delErr) {
        cleanupErrors.push(
          `Exception deleting ${delKey}: ${delErr instanceof Error ? delErr.message : "Error"}`
        );
      }
    }
  }

  invalidateAdminCache("brands");
  return {
    success: true,
    brand: { ...updatedDemoBrand },
    cleanupErrors: cleanupErrors.length > 0 ? cleanupErrors : undefined,
    isDemo: true,
  };
}

/**
 * Loads promotional banners for administrative management and storefront display.
 * Reads from siteSettings ('homepage_banners') without requiring a dedicated table.
 */
export async function getAdminBanners(
  userOverride?: SafeUser | null
): Promise<AdminBannerItem[]> {
  await assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_READ, userOverride);

  const cacheKey = "admin:banners";
  if (!userOverride) {
    const cached = getFromAdminCache<AdminBannerItem[]>(cacheKey);
    if (cached) return cached;
  }

  let result: AdminBannerItem[] = [];

  if (isDatabaseConfigured()) {
    const db = getDb();
    if (!db) {
      throw new Error("DATABASE_UNAVAILABLE: Database connection is not available.");
    }

    const [row] = await db
      .select({
        value: siteSettings.value,
      })
      .from(siteSettings)
      .where(eq(siteSettings.key, "homepage_banners"))
      .limit(1);

    if (row && Array.isArray(row.value) && row.value.length > 0) {
      result = (row.value as AdminBannerItem[]).sort((a, b) => a.sortOrder - b.sortOrder);
      if (!userOverride) setAdminCache(cacheKey, result);
      return result;
    }

    result = DEMO_ADMIN_BANNERS;
    if (!userOverride) setAdminCache(cacheKey, result);
    return result;
  }

  result = getInMemoryBanners().sort((a, b) => a.sortOrder - b.sortOrder);
  if (!userOverride) setAdminCache(cacheKey, result);
  return result;
}

/**
 * Updates promotional banners in siteSettings with Cloudinary validation and cleanup.
 */
export async function updateAdminBanners(
  input: AdminUpdateBannersPayload,
  userOverride?: SafeUser | null
): Promise<{
  success: boolean;
  banners: AdminBannerItem[];
  cleanupErrors?: string[];
  isDemo?: boolean;
}> {
  const user = await assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_WRITE, userOverride);

  if (!Array.isArray(input.banners)) {
    throw new Error("Banners array is required.");
  }

  // 1. Process staged deleted storage keys
  const requestedStagedKeys = Array.from(new Set(input.stagedDeletedStorageKeys || []));
  for (const key of requestedStagedKeys) {
    if (!isValidBannerAssetPublicId(key)) {
      throw new Error(
        `SECURITY_ERROR: Invalid or unauthorized banner storage key '${key}'. Asset deletion is restricted to '${CLOUDINARY_FOLDERS.banners}/'.`
      );
    }
  }

  // 2. Validate all banners and collect all retained storage keys
  const retainedKeys = new Set<string>();

  const normalizedBanners: AdminBannerItem[] = input.banners.map((banner, idx) => {
    if (!banner.title || banner.title.trim().length === 0) {
      throw new Error("Banner title is required.");
    }
    if (!banner.altText || banner.altText.trim().length === 0) {
      throw new Error(`Banner '${banner.title}' requires descriptive alt text for accessibility.`);
    }

    const desktopKey = banner.desktopStorageKey || extractCloudinaryStorageKey(banner.desktopImageUrl);
    if (!desktopKey || !isValidBannerAssetPublicId(desktopKey)) {
      throw new Error(
        `SECURITY_ERROR: Desktop image key '${desktopKey || "unknown"}' must belong to '${CLOUDINARY_FOLDERS.banners}/' without path traversal.`
      );
    }
    retainedKeys.add(desktopKey);

    let mobileKey: string | null = null;
    if (banner.mobileImageUrl) {
      mobileKey = banner.mobileStorageKey || extractCloudinaryStorageKey(banner.mobileImageUrl);
      if (!mobileKey || !isValidBannerAssetPublicId(mobileKey)) {
        throw new Error(
          `SECURITY_ERROR: Mobile image key '${mobileKey || "unknown"}' must belong to '${CLOUDINARY_FOLDERS.banners}/' without path traversal.`
        );
      }
      retainedKeys.add(mobileKey);
    }

    return {
      id: banner.id,
      title: banner.title,
      subtitle: banner.subtitle ?? null,
      desktopImageUrl: banner.desktopImageUrl,
      desktopStorageKey: desktopKey,
      desktopUploadReceipt: banner.desktopUploadReceipt ?? null,
      mobileImageUrl: banner.mobileImageUrl ?? null,
      mobileStorageKey: mobileKey,
      mobileUploadReceipt: banner.mobileUploadReceipt ?? null,
      altText: banner.altText,
      linkUrl: banner.linkUrl ?? null,
      sortOrder: banner.sortOrder ?? idx + 1,
      isActive: banner.isActive ?? true,
    };
  });

  // Verify HMAC receipts if present
  for (const banner of normalizedBanners) {
    if (banner.desktopUploadReceipt && banner.desktopStorageKey) {
      const { verifyCloudinaryUploadReceipt } = await import("@/lib/cloudinary");
      const check = verifyCloudinaryUploadReceipt(banner.desktopUploadReceipt, {
        publicId: banner.desktopStorageKey,
        adminId: user.id,
      });
      if (!check.valid) {
        throw new Error(`SECURITY_ERROR: Desktop image receipt invalid: ${check.error}`);
      }
    }

    if (banner.mobileUploadReceipt && banner.mobileStorageKey) {
      const { verifyCloudinaryUploadReceipt } = await import("@/lib/cloudinary");
      const check = verifyCloudinaryUploadReceipt(banner.mobileUploadReceipt, {
        publicId: banner.mobileStorageKey,
        adminId: user.id,
      });
      if (!check.valid) {
        throw new Error(`SECURITY_ERROR: Mobile image receipt invalid: ${check.error}`);
      }
    }
  }

  // Retained vs Deleted Defense: Never delete any key present in retainedKeys
  const verifiedKeysToDelete = requestedStagedKeys.filter((key) => !retainedKeys.has(key));

  // Collect candidate attachments for Stage C verification
  const bannerAttachments: EntityMediaAttachment[] = [];
  for (const banner of normalizedBanners) {
    if (banner.desktopStorageKey && banner.desktopUploadReceipt) {
      bannerAttachments.push({
        storageKey: banner.desktopStorageKey,
        uploadReceipt: banner.desktopUploadReceipt,
        fieldName: `banners[${banner.id}].desktopImageUrl`,
      });
    }
    if (banner.mobileStorageKey && banner.mobileUploadReceipt) {
      bannerAttachments.push({
        storageKey: banner.mobileStorageKey,
        uploadReceipt: banner.mobileUploadReceipt,
        fieldName: `banners[${banner.id}].mobileImageUrl`,
      });
    }
  }

  // 3. Persistence handling
  if (isDatabaseConfigured()) {
    const db = getDb();
    if (!db) {
      throw new Error("DATABASE_UNAVAILABLE: Database connection is not available.");
    }

    await db.transaction(async (tx) => {
      // Stage C: Verify and commit media upload session(s) atomically
      if (bannerAttachments.length > 0) {
        await verifyAndCommitMediaUploadSessions({
          tx,
          attachments: bannerAttachments,
          entityType: "banner",
          entityId: "homepage_banners",
          actorId: user.id,
          expectedFolder: CLOUDINARY_FOLDERS.banners,
        });
      }

      const [existing] = await tx
        .select({ id: siteSettings.id })
        .from(siteSettings)
        .where(eq(siteSettings.key, "homepage_banners"))
        .limit(1);

      if (existing) {
        await tx
          .update(siteSettings)
          .set({
            value: normalizedBanners,
            updatedBy: user.id,
            updatedAt: new Date(),
          })
          .where(eq(siteSettings.key, "homepage_banners"));
      } else {
        await tx.insert(siteSettings).values({
          key: "homepage_banners",
          value: normalizedBanners,
          updatedBy: user.id,
          updatedAt: new Date(),
        });
      }
    });

    // Post-commit asset cleanup
    const cleanupErrors: string[] = [];
    if (verifiedKeysToDelete.length > 0) {
      const { deleteCloudinaryAsset } = await import("@/lib/cloudinary");
      for (const delKey of verifiedKeysToDelete) {
        try {
          const delRes = await deleteCloudinaryAsset(delKey, {
            allowedFolder: CLOUDINARY_FOLDERS.banners,
            userOverride,
          });
          if (!delRes.success) {
            cleanupErrors.push(`Failed to delete ${delKey}: ${delRes.error}`);
          }
        } catch (delErr) {
          cleanupErrors.push(
            `Exception deleting ${delKey}: ${delErr instanceof Error ? delErr.message : "Error"}`
          );
        }
      }
    }

    invalidateAdminCache("banners");
    return {
      success: true,
      banners: normalizedBanners,
      cleanupErrors: cleanupErrors.length > 0 ? cleanupErrors : undefined,
    };
  }

  // Demo fallback
  if (bannerAttachments.length > 0) {
    await verifyAndCommitMediaUploadSessions({
      tx: null,
      attachments: bannerAttachments,
      entityType: "banner",
      entityId: "homepage_banners",
      actorId: user.id,
      expectedFolder: CLOUDINARY_FOLDERS.banners,
    });
  }

  setInMemoryBanners(normalizedBanners);

  const cleanupErrors: string[] = [];
  if (verifiedKeysToDelete.length > 0) {
    const { deleteCloudinaryAsset } = await import("@/lib/cloudinary");
    for (const delKey of verifiedKeysToDelete) {
      try {
        const delRes = await deleteCloudinaryAsset(delKey, {
          allowedFolder: CLOUDINARY_FOLDERS.banners,
          userOverride,
        });
        if (!delRes.success) {
          cleanupErrors.push(`Failed to delete ${delKey}: ${delRes.error}`);
        }
      } catch (delErr) {
        cleanupErrors.push(
          `Exception deleting ${delKey}: ${delErr instanceof Error ? delErr.message : "Error"}`
        );
      }
    }
  }

  invalidateAdminCache("banners");
  return {
    success: true,
    banners: getInMemoryBanners(),
    cleanupErrors: cleanupErrors.length > 0 ? cleanupErrors : undefined,
    isDemo: true,
  };
}

// ==============================================================================
// Phase C5: Orphan Asset Detection & Lifecycle Management
// ==============================================================================

export {
  type AssetOrphanClassification,
  type CleanupOperationOutcome,
  type CleanupErrorClassification,
  type StructuredCleanupFailure,
  type CandidateAssetInput,
  type ClassifiedAssetCandidate,
  type DryRunCleanupPlan,
  type AuthoritativeReferenceCheckResult,
  type CleanupRetryState,
  type CleanupRetryScheduleConfig,
  type CleanupRetryDecision,
  type FutureCleanupExecutionRequirements,
  computeCleanupRetryDecision,
  CLEANUP_RETRY_CONFIG,
  sanitizeCleanupErrorMessage,
  classifyCleanupError,
  createStructuredCleanupFailure,
  checkAuthoritativeAssetReferences,
  planDryRunCleanup,
  assertExecutionForbidden,
} from "./orphan-lifecycle";

