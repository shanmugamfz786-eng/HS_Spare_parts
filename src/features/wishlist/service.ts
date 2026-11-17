import "server-only";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { wishlists, wishlistItems, products, inventory } from "@/lib/db/schema";
import { getCurrentUser } from "@/features/auth/service";
import { checkSharedRateLimit } from "@/lib/auth/rate-limit";
import type { AddToWishlistInput, RemoveFromWishlistInput, WishlistDTO, WishlistItemDTO } from "./schemas";
import { addToWishlistSchema, removeFromWishlistSchema } from "./schemas";

function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

function calculateAvailableStock(quantityOnHand: number | null, quantityReserved: number | null): number {
  const onHand = quantityOnHand ?? 0;
  const reserved = quantityReserved ?? 0;
  return Math.max(0, onHand - reserved);
}

/**
 * Resolves or creates the user's wishlist row.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOrCreateWishlistId(txOrDb: any, userId: string): Promise<string> {
  const existing = await txOrDb.query.wishlists.findFirst({
    where: eq(wishlists.userId, userId),
  });

  if (existing) return existing.id;

  const [created] = await txOrDb
    .insert(wishlists)
    .values({ userId })
    .onConflictDoNothing()
    .returning({ id: wishlists.id });

  if (created) return created.id;

  const refetched = await txOrDb.query.wishlists.findFirst({
    where: eq(wishlists.userId, userId),
  });

  if (refetched) return refetched.id;
  throw new Error("WISHLIST_ERROR: Unable to resolve customer wishlist.");
}

/**
 * Retrieves the current customer's wishlist items.
 */
export async function getWishlist(): Promise<WishlistDTO> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("UNAUTHENTICATED: Please sign in to view your wishlist.");
  }

  if (!isDatabaseConfigured()) {
    return {
      id: "demo-wishlist",
      items: [],
      totalCount: 0,
    };
  }

  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
  }

  const wishlistId = await getOrCreateWishlistId(db, currentUser.id);

  const rows = await db
    .select({
      itemId: wishlistItems.id,
      productId: wishlistItems.productId,
      name: products.name,
      sku: products.sku,
      priceMinor: products.priceMinor,
      quantityOnHand: inventory.quantityOnHand,
      quantityReserved: inventory.quantityReserved,
      addedAt: wishlistItems.createdAt,
    })
    .from(wishlistItems)
    .innerJoin(products, eq(wishlistItems.productId, products.id))
    .leftJoin(inventory, eq(products.id, inventory.productId))
    .where(eq(wishlistItems.wishlistId, wishlistId));

  const items: WishlistItemDTO[] = rows.map((r) => {
    const available = calculateAvailableStock(r.quantityOnHand, r.quantityReserved);
    return {
      id: r.itemId,
      productId: r.productId,
      name: r.name,
      sku: r.sku,
      brand: "Certified",
      priceMinor: r.priceMinor,
      inStock: available > 0,
      addedAt: r.addedAt ? r.addedAt.toISOString() : new Date().toISOString(),
    };
  });

  return {
    id: wishlistId,
    items,
    totalCount: items.length,
  };
}

/**
 * Server-side shared rate limiter for wishlist mutations.
 * 30 mutations per 10 minutes per authenticated customer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enforceWishlistRateLimit(db: any, userId: string): Promise<void> {
  const rateLimitKey = `wishlist:${userId}`;
  const rateLimitResult = await checkSharedRateLimit(db, rateLimitKey, {
    maxAttempts: 30,
    windowSeconds: 600, // 30 mutations per 10 minutes
  });

  if (!rateLimitResult.success) {
    if (rateLimitResult.isServiceUnavailable) {
      throw new Error("SERVICE_UNAVAILABLE: Wishlist service is temporarily unavailable. Please try again shortly.");
    }
    throw new Error(
      `RATE_LIMITED: You have performed too many wishlist actions. Please wait ${rateLimitResult.resetInSeconds} seconds before trying again.`
    );
  }
}

/**
 * Adds a product to the customer's wishlist.
 * Suppresses duplicates via composite unique index on (wishlist_id, product_id).
 */
export async function addToWishlist(rawInput: AddToWishlistInput): Promise<WishlistDTO> {
  const input = addToWishlistSchema.parse(rawInput);

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("UNAUTHENTICATED: Please sign in to save items to your wishlist.");
  }

  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_UNAVAILABLE: Wishlist operations require an active database.");
  }

  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
  }

  // Rate limiting before mutation: 30 mutations per 10 minutes
  await enforceWishlistRateLimit(db, currentUser.id);

  // Validate product exists in catalogue
  const product = await db.query.products.findFirst({
    where: eq(products.id, input.productId),
  });

  if (!product) {
    throw new Error("NOT_FOUND: The requested product does not exist.");
  }

  const wishlistId = await getOrCreateWishlistId(db, currentUser.id);

  await db
    .insert(wishlistItems)
    .values({
      wishlistId,
      productId: input.productId,
    })
    .onConflictDoNothing();

  return getWishlist();
}

/**
 * Removes a product from the customer's wishlist with IDOR ownership protection.
 */
export async function removeFromWishlist(rawInput: RemoveFromWishlistInput): Promise<WishlistDTO> {
  const input = removeFromWishlistSchema.parse(rawInput);

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("UNAUTHENTICATED: Please sign in to modify your wishlist.");
  }

  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
  }

  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
  }

  // Rate limiting before mutation: 30 mutations per 10 minutes
  await enforceWishlistRateLimit(db, currentUser.id);

  const wishlistId = await getOrCreateWishlistId(db, currentUser.id);

  await db
    .delete(wishlistItems)
    .where(and(eq(wishlistItems.wishlistId, wishlistId), eq(wishlistItems.productId, input.productId)));

  return getWishlist();
}
