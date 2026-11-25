import "server-only";
import {
  APPROVED_CATEGORIES,
  APPROVED_BRANDS,
  resolveCanonicalCategorySlug,
} from "@/lib/constants/approved-catalogue";

export interface DemoCategoryState {
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

export interface DemoBrandState {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  storageKey: string | null;
  status: string;
}

export interface DemoBannerState {
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

export interface DemoUploadSessionState {
  id: string;
  cloudName: string;
  canonicalPublicId: string;
  resourceType: string;
  deliveryType: string;
  folder: string;
  createdByActorId: string;
  status: string;
  uploadVerifiedAt: Date | null;
  cloudinaryVersion: string | null;
  uploadedBytes: number | null;
  uploadProof: unknown;
  createdAt: Date;
  expiresAt: Date;
  lastUpdatedAt: Date;
  committedAt: Date | null;
  committedEntityType: string | null;
  committedEntityId: string | null;
  cleanupIntentAt: Date | null;
  deletedAt: Date | null;
  leaseVersion: number;
  lockedAt: Date | null;
  leaseExpiresAt: Date | null;
  lockedByWorker: string | null;
}

export interface DemoCleanupQueueItemState {
  id: string;
  sessionId: string;
  cloudName: string;
  canonicalPublicId: string;
  resourceType: string;
  deliveryType: string;
  folder: string;
  idempotencyKey: string;
  triggerReason: string;
  originalEntityType: string | null;
  originalEntityId: string | null;
  status: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: Date;
  lastAttemptAt: Date | null;
  lockedAt: Date | null;
  leaseExpiresAt: Date | null;
  lockedByWorker: string | null;
  leaseVersion: number;
  lastErrorClassification: string | null;
  lastErrorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export const INITIAL_DEMO_CATEGORIES: DemoCategoryState[] = APPROVED_CATEGORIES.map(
  (cat, idx) => ({
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    description: cat.description,
    imageUrl: null,
    storageKey: null,
    status: "active",
    sortOrder: idx + 1,
    isTopNav: true,
  })
);

export const INITIAL_DEMO_BRANDS: DemoBrandState[] = APPROVED_BRANDS.map((b) => ({
  id: b.id,
  name: b.name,
  slug: b.slug,
  logoUrl: null,
  storageKey: null,
  status: "active",
}));

export const INITIAL_DEMO_BANNERS: DemoBannerState[] = [
  {
    id: "banner-1",
    title: "Explore Replacement Spares & Maintenance Components",
    subtitle: "Direct access to high-demand replacement parts across top Indian vehicle brands.",
    desktopImageUrl: "https://res.cloudinary.com/demo/image/upload/hs-spare-parts/banners/banner_hero_default.webp",
    desktopStorageKey: "hs-spare-parts/banners/banner_hero_default",
    mobileImageUrl: null,
    mobileStorageKey: null,
    altText: "Automotive replacement parts promotional banner",
    linkUrl: "/categories",
    sortOrder: 1,
    isActive: true,
  },
];

// Singleton in-memory demo state for development / test
let inMemoryCategories = new Map<string, DemoCategoryState>(
  INITIAL_DEMO_CATEGORIES.map((c) => [c.id, { ...c }])
);
let inMemoryBrands = new Map<string, DemoBrandState>(
  INITIAL_DEMO_BRANDS.map((b) => [b.id, { ...b }])
);
let inMemoryBanners: DemoBannerState[] = [...INITIAL_DEMO_BANNERS];
let inMemorySessions = new Map<string, DemoUploadSessionState>();
let inMemoryQueue = new Map<string, DemoCleanupQueueItemState>();

export function getInMemoryCategories(): DemoCategoryState[] {
  return Array.from(inMemoryCategories.values());
}

export function getInMemoryCategoryById(id: string): DemoCategoryState | undefined {
  if (inMemoryCategories.has(id)) {
    return inMemoryCategories.get(id);
  }
  for (const c of inMemoryCategories.values()) {
    if (c.slug === id || c.id === id) return c;
  }
  const canonical = resolveCanonicalCategorySlug(id);
  for (const c of inMemoryCategories.values()) {
    if (c.slug === canonical) return c;
  }
  if (id === "cat-1") {
    const c = inMemoryCategories.get("cat-04-suspension-steering");
    return c ? { ...c, id: "cat-1" } : undefined;
  }
  if (id === "cat-2") {
    const c = inMemoryCategories.get("cat-02-brake-system");
    return c ? { ...c, id: "cat-2" } : undefined;
  }
  return undefined;
}

export function setInMemoryCategory(id: string, category: DemoCategoryState): void {
  inMemoryCategories.set(id, { ...category });
  if (id === "cat-1") {
    inMemoryCategories.set("cat-04-suspension-steering", {
      ...category,
      id: "cat-04-suspension-steering",
      slug: "suspension-steering",
    });
  } else if (id === "cat-2") {
    inMemoryCategories.set("cat-02-brake-system", {
      ...category,
      id: "cat-02-brake-system",
      slug: "brake-system",
    });
  }
}

export function getInMemoryBrands(): DemoBrandState[] {
  return Array.from(inMemoryBrands.values());
}

export function getInMemoryBrandById(id: string): DemoBrandState | undefined {
  if (inMemoryBrands.has(id)) {
    return inMemoryBrands.get(id);
  }
  for (const b of inMemoryBrands.values()) {
    if (b.slug === id || b.name.toLowerCase() === id.toLowerCase()) return b;
  }
  if (id === "brand-1") {
    const b = inMemoryBrands.get("brand-maruti-suzuki") || inMemoryBrands.get("brand-maruti-genuine") || inMemoryBrands.get("brand-bosch");
    return b ? { ...b, id: "brand-1" } : undefined;
  }
  if (id === "brand-2") {
    const b = inMemoryBrands.get("brand-hyundai") || inMemoryBrands.get("brand-hyundai-mobis") || inMemoryBrands.get("brand-denso");
    return b ? { ...b, id: "brand-2" } : undefined;
  }
  return undefined;
}

export function setInMemoryBrand(id: string, brand: DemoBrandState): void {
  inMemoryBrands.set(id, { ...brand });
  if (id === "brand-1") {
    inMemoryBrands.set("brand-maruti-suzuki", { ...brand, id: "brand-maruti-suzuki", name: "Maruti Suzuki" });
    inMemoryBrands.set("brand-maruti-genuine", { ...brand, id: "brand-maruti-genuine" });
  } else if (id === "brand-2") {
    inMemoryBrands.set("brand-hyundai", { ...brand, id: "brand-hyundai", name: "Hyundai" });
    inMemoryBrands.set("brand-hyundai-mobis", { ...brand, id: "brand-hyundai-mobis" });
  }
}

export function getInMemoryBanners(): DemoBannerState[] {
  return [...inMemoryBanners];
}

export function setInMemoryBanners(banners: DemoBannerState[]): void {
  inMemoryBanners = [...banners];
}

export function getInMemoryUploadSessionById(id: string): DemoUploadSessionState | undefined {
  if (process.env.NODE_ENV === "production") {
    return undefined;
  }
  return inMemorySessions.get(id);
}

export function setInMemoryUploadSession(id: string, session: DemoUploadSessionState): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SECURITY_ERROR: In-memory demo upload sessions are strictly prohibited in production."
    );
  }
  inMemorySessions.set(id, { ...session });
}

export function updateInMemoryUploadSession(
  id: string,
  updates: Partial<DemoUploadSessionState>
): DemoUploadSessionState | undefined {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SECURITY_ERROR: In-memory demo upload sessions are strictly prohibited in production."
    );
  }
  const existing = inMemorySessions.get(id);
  if (!existing) return undefined;
  const updated = { ...existing, ...updates, lastUpdatedAt: new Date() };
  inMemorySessions.set(id, updated);
  return updated;
}

export function getInMemoryCleanupQueue(): DemoCleanupQueueItemState[] {
  if (process.env.NODE_ENV === "production") {
    return [];
  }
  return Array.from(inMemoryQueue.values());
}

export function getInMemoryCleanupQueueById(id: string): DemoCleanupQueueItemState | undefined {
  if (process.env.NODE_ENV === "production") {
    return undefined;
  }
  return inMemoryQueue.get(id);
}

export function setInMemoryCleanupQueueItem(id: string, item: DemoCleanupQueueItemState): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SECURITY_ERROR: In-memory demo cleanup queue is strictly prohibited in production."
    );
  }
  inMemoryQueue.set(id, { ...item });
}

export function updateInMemoryCleanupQueueItem(
  id: string,
  updates: Partial<DemoCleanupQueueItemState>
): DemoCleanupQueueItemState | undefined {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SECURITY_ERROR: In-memory demo cleanup queue is strictly prohibited in production."
    );
  }
  const existing = inMemoryQueue.get(id);
  if (!existing) return undefined;
  const updated = { ...existing, ...updates, updatedAt: new Date() };
  inMemoryQueue.set(id, updated);
  return updated;
}

export function deleteInMemoryCleanupQueueItem(id: string): boolean {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SECURITY_ERROR: In-memory demo cleanup queue is strictly prohibited in production."
    );
  }
  return inMemoryQueue.delete(id);
}

export interface DemoProductState {
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
  condition: string;
  conditionNotes?: string | null;
  status: string;
  isDemo: boolean;
}

let inMemoryCreatedProducts: DemoProductState[] = [];

export function getInMemoryCreatedProducts(): DemoProductState[] {
  return [...inMemoryCreatedProducts];
}

export function addInMemoryCreatedProduct(product: DemoProductState): void {
  inMemoryCreatedProducts.unshift(product);
}

export function updateInMemoryProduct(id: string, updates: Partial<DemoProductState>): void {
  inMemoryCreatedProducts = inMemoryCreatedProducts.map((p) =>
    p.id === id ? { ...p, ...updates } : p
  );
}

export function resetInMemoryDemoState(): void {
  inMemoryCategories = new Map<string, DemoCategoryState>(
    INITIAL_DEMO_CATEGORIES.map((c) => [c.id, { ...c }])
  );
  inMemoryBrands = new Map<string, DemoBrandState>(
    INITIAL_DEMO_BRANDS.map((b) => [b.id, { ...b }])
  );
  inMemoryBanners = [...INITIAL_DEMO_BANNERS];
  inMemorySessions = new Map<string, DemoUploadSessionState>();
  inMemoryQueue = new Map<string, DemoCleanupQueueItemState>();
  inMemoryCreatedProducts = [];
}
