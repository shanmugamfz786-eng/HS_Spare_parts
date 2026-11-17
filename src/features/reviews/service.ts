import "server-only";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { reviews, products, users } from "@/lib/db/schema";
import { getCurrentUser } from "@/features/auth/service";
import { checkSharedRateLimit } from "@/lib/auth/rate-limit";
import type { CreateReviewInput, ReviewDTO } from "./schemas";
import { createReviewSchema } from "./schemas";

function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

/**
 * Basic HTML tag stripping for user-generated text.
 */
function sanitizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, "") // Strip HTML tags
    .replace(/[&<>"']/g, (match) => {
      switch (match) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        case "'":
          return "&#039;";
        default:
          return match;
      }
    })
    .trim();
}

/**
 * Phase 6 boundary hook for verified-purchase check.
 * Strictly returns false throughout Phase 5.
 */
export async function verifyPurchaseForReview(_userId: string, _productId: string): Promise<string | null> {
  void _userId;
  void _productId;
  // Phase 5 invariant: No order processing or checkout has been authorized.
  // Order verification will be connected in Phase 6.
  return null;
}

/**
 * Retrieves approved customer reviews for a given product.
 */
export async function getProductReviews(productId: string): Promise<ReviewDTO[]> {
  if (!isDatabaseConfigured()) {
    // Return empty list or sample review with explicit demo labeling
    return [];
  }

  const db = getDb();
  if (!db) {
    return [];
  }

  const rows = await db
    .select({
      id: reviews.id,
      productId: reviews.productId,
      rating: reviews.rating,
      title: reviews.title,
      body: reviews.body,
      status: reviews.status,
      isVerifiedPurchase: reviews.isVerifiedPurchase,
      createdAt: reviews.createdAt,
      authorName: users.name,
    })
    .from(reviews)
    .innerJoin(users, eq(reviews.userId, users.id))
    .where(and(eq(reviews.productId, productId), eq(reviews.status, "approved")))
    .orderBy(desc(reviews.createdAt));

  return rows.map((r) => ({
    id: r.id,
    productId: r.productId,
    authorName: r.authorName,
    rating: r.rating,
    title: r.title,
    body: r.body,
    status: r.status as "approved",
    isVerifiedPurchase: r.isVerifiedPurchase,
    isDemoSample: false,
    createdAt: r.createdAt ? r.createdAt.toISOString() : new Date().toISOString(),
  }));
}

/**
 * Submits a new product review with strict validation, duplicate prevention, and moderation status.
 */
export async function submitProductReview(rawInput: CreateReviewInput): Promise<ReviewDTO> {
  // Strict Zod parse rejects any unexpected keys (e.g. isVerifiedPurchase, orderItemId, status)
  const input = createReviewSchema.parse(rawInput);

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new Error("UNAUTHENTICATED: Please sign in to submit a review.");
  }

  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_UNAVAILABLE: Review submission requires an active database.");
  }

  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
  }

  // Rate limiting: 5 reviews per hour per customer (PostgreSQL-backed shared rate limiter)
  const rateLimitKey = `review:${currentUser.id}`;
  const rateLimitResult = await checkSharedRateLimit(db, rateLimitKey, { maxAttempts: 5, windowSeconds: 3600 });
  if (!rateLimitResult.success) {
    if (rateLimitResult.isServiceUnavailable) {
      throw new Error("SERVICE_UNAVAILABLE: Review service is temporarily unavailable. Please try again shortly.");
    }
    throw new Error(`RATE_LIMITED: You have submitted too many reviews recently. Please wait ${rateLimitResult.resetInSeconds} seconds before trying again.`);
  }

  // Verify product exists in catalogue
  const product = await db.query.products.findFirst({
    where: eq(products.id, input.productId),
  });

  if (!product) {
    throw new Error("NOT_FOUND: The product being reviewed does not exist.");
  }

  // Duplicate check: One review per customer per product
  const existingReview = await db.query.reviews.findFirst({
    where: and(eq(reviews.productId, input.productId), eq(reviews.userId, currentUser.id)),
  });

  if (existingReview) {
    throw new Error("DUPLICATE_REVIEW: You have already submitted a review for this product.");
  }

  // Phase 5 verification boundary: strictly server-controlled false
  await verifyPurchaseForReview(currentUser.id, input.productId);

  const cleanTitle = sanitizeText(input.title);
  const cleanBody = sanitizeText(input.body);

  const [newReview] = await db
    .insert(reviews)
    .values({
      productId: input.productId,
      userId: currentUser.id,
      orderItemId: null,
      rating: input.rating,
      title: cleanTitle,
      body: cleanBody,
      status: "pending", // Pending moderation
      isVerifiedPurchase: false, // Strictly server-controlled
    })
    .returning();

  if (!newReview) {
    throw new Error("INSERT_FAILED: Failed to record product review.");
  }

  return {
    id: newReview.id,
    productId: newReview.productId,
    authorName: currentUser.name,
    rating: newReview.rating,
    title: newReview.title,
    body: newReview.body,
    status: "pending",
    isVerifiedPurchase: false,
    isDemoSample: false,
    createdAt: newReview.createdAt.toISOString(),
  };
}
