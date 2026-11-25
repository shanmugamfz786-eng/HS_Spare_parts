import "server-only";

import { eq, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { categories, brands } from "@/lib/db/schema/catalogue";
import { siteSettings } from "@/lib/db/schema/admin";
import {
  storefrontBannerSchema,
  type StorefrontCategoryDTO,
  type StorefrontBrandDTO,
  type StorefrontBannerDTO,
} from "@/features/catalogue/schemas";
import {
  getInMemoryCategories,
  getInMemoryBrands,
  getInMemoryBanners,
} from "./demo-state";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const STOREFRONT_CACHE_TTL_MS = 300_000; // 5 minutes in-memory cache
let categoriesCache: CacheEntry<StorefrontCategoryDTO[]> | null = null;
let brandsCache: CacheEntry<StorefrontBrandDTO[]> | null = null;
let bannersCache: CacheEntry<StorefrontBannerDTO[]> | null = null;

function isCacheEnabled(): boolean {
  return process.env.NODE_ENV !== "test";
}

export function invalidateStorefrontCache(): void {
  categoriesCache = null;
  brandsCache = null;
  bannersCache = null;
}

function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function isExplicitDevOrTest(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_ENABLE_DEMO_CATALOG === "true"
  );
}

/**
 * Retrieves public active categories for storefront display (e.g. Featured Categories).
 * Strictly exposes only public-facing fields. Never exposes internal admin attributes.
 */
export async function getStorefrontCategories(): Promise<StorefrontCategoryDTO[]> {
  if (isCacheEnabled() && categoriesCache && Date.now() - categoriesCache.timestamp < STOREFRONT_CACHE_TTL_MS) {
    return categoriesCache.data;
  }

  if (isDatabaseConfigured()) {
    const db = getDb();
    if (!db) {
      console.error("[StorefrontService] Database configured but client pool unavailable for categories.");
      return [];
    }

    try {
      const rows = await db
        .select({
          name: categories.name,
          slug: categories.slug,
          imageUrl: categories.imageUrl,
        })
        .from(categories)
        .where(eq(categories.status, "active"))
        .orderBy(asc(categories.sortOrder), asc(categories.name));

      const result: StorefrontCategoryDTO[] = rows.map((r) => ({
        name: r.name,
        slug: r.slug,
        imageUrl: r.imageUrl ?? null,
      }));

      if (isCacheEnabled()) {
        categoriesCache = { data: result, timestamp: Date.now() };
      }
      return result;
    } catch (error) {
      console.error("[StorefrontService] Database query error for categories:", error);
      // In production, database failures must fail closed; never silently fall back to demo data
      return [];
    }
  }

  // Database unconfigured: demo fallback in dev/test only
  if (isExplicitDevOrTest()) {
    const result = getInMemoryCategories().map((c) => ({
      name: c.name,
      slug: c.slug,
      imageUrl: c.imageUrl,
    }));
    if (isCacheEnabled()) {
      categoriesCache = { data: result, timestamp: Date.now() };
    }
    return result;
  }

  // In production without DATABASE_URL, fail closed
  return [];
}

/**
 * Retrieves public active brands for storefront display (e.g. Shop by Brand).
 * Strictly exposes only public-facing fields.
 */
export async function getStorefrontBrands(): Promise<StorefrontBrandDTO[]> {
  if (isCacheEnabled() && brandsCache && Date.now() - brandsCache.timestamp < STOREFRONT_CACHE_TTL_MS) {
    return brandsCache.data;
  }

  if (isDatabaseConfigured()) {
    const db = getDb();
    if (!db) {
      console.error("[StorefrontService] Database configured but client pool unavailable for brands.");
      return [];
    }

    try {
      const rows = await db
        .select({
          name: brands.name,
          slug: brands.slug,
          logoUrl: brands.logoUrl,
        })
        .from(brands)
        .where(eq(brands.status, "active"))
        .orderBy(asc(brands.name));

      const result: StorefrontBrandDTO[] = rows.map((b) => ({
        name: b.name,
        queryParam: b.name,
        logoUrl: b.logoUrl ?? null,
      }));

      if (isCacheEnabled()) {
        brandsCache = { data: result, timestamp: Date.now() };
      }
      return result;
    } catch (error) {
      console.error("[StorefrontService] Database query error for brands:", error);
      return [];
    }
  }

  if (isExplicitDevOrTest()) {
    const result = getInMemoryBrands().map((b) => ({
      name: b.name,
      queryParam: b.name,
      logoUrl: b.logoUrl,
    }));
    if (isCacheEnabled()) {
      brandsCache = { data: result, timestamp: Date.now() };
    }
    return result;
  }

  return [];
}

/**
 * Retrieves public active promotional campaign banners for homepage display.
 * Validates persisted JSON, strictly filters for isActive = true, and sorts by sortOrder.
 * Inactive banners are never exposed publicly.
 */
export async function getStorefrontBanners(): Promise<StorefrontBannerDTO[]> {
  if (isCacheEnabled() && bannersCache && Date.now() - bannersCache.timestamp < STOREFRONT_CACHE_TTL_MS) {
    return bannersCache.data;
  }

  if (isDatabaseConfigured()) {
    const db = getDb();
    if (!db) {
      console.error("[StorefrontService] Database configured but client pool unavailable for banners.");
      return [];
    }

    try {
      const [row] = await db
        .select({
          value: siteSettings.value,
        })
        .from(siteSettings)
        .where(eq(siteSettings.key, "homepage_banners"))
        .limit(1);

      if (!row || !Array.isArray(row.value)) {
        return [];
      }

      // Validate, normalize, and strictly filter for active banners
      const validBanners: StorefrontBannerDTO[] = [];
      for (const item of row.value) {
        const parsed = storefrontBannerSchema.safeParse(item);
        if (parsed.success && parsed.data.isActive) {
          validBanners.push({
            id: parsed.data.id,
            title: parsed.data.title,
            subtitle: parsed.data.subtitle ?? null,
            desktopImageUrl: parsed.data.desktopImageUrl,
            mobileImageUrl: parsed.data.mobileImageUrl ?? null,
            altText: parsed.data.altText,
            linkUrl: parsed.data.linkUrl ?? null,
            sortOrder: parsed.data.sortOrder,
            isActive: true,
          });
        }
      }

      const result = validBanners.sort((a, b) => a.sortOrder - b.sortOrder);
      if (isCacheEnabled()) {
        bannersCache = { data: result, timestamp: Date.now() };
      }
      return result;
    } catch (error) {
      console.error("[StorefrontService] Database query error for banners:", error);
      return [];
    }
  }

  if (isExplicitDevOrTest()) {
    const demoBanners = getInMemoryBanners();
    const validBanners: StorefrontBannerDTO[] = [];
    for (const item of demoBanners) {
      const parsed = storefrontBannerSchema.safeParse(item);
      if (parsed.success && parsed.data.isActive) {
        validBanners.push({
          id: parsed.data.id,
          title: parsed.data.title,
          subtitle: parsed.data.subtitle ?? null,
          desktopImageUrl: parsed.data.desktopImageUrl,
          mobileImageUrl: parsed.data.mobileImageUrl ?? null,
          altText: parsed.data.altText,
          linkUrl: parsed.data.linkUrl ?? null,
          sortOrder: parsed.data.sortOrder,
          isActive: true,
        });
      }
    }
    const result = validBanners.sort((a, b) => a.sortOrder - b.sortOrder);
    if (isCacheEnabled()) {
      bannersCache = { data: result, timestamp: Date.now() };
    }
    return result;
  }

  return [];
}
