import "server-only";
import { cookies } from "next/headers";
import { eq, and, sql, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { carts, cartItems, products, productVariants, inventory } from "@/lib/db/schema";
import { generateSecureToken, hashToken } from "@/lib/security";
import { getCurrentUser } from "@/features/auth/service";
import { checkSharedRateLimit } from "@/lib/auth/rate-limit";
import type { AddToCartInput, UpdateCartItemQuantityInput, RemoveFromCartInput, CartDTO, CartItemDTO } from "./schemas";
import { addToCartSchema, updateCartItemQuantitySchema, removeFromCartSchema } from "./schemas";

export const CART_COOKIE_NAME = "hs_cart_session";
export const CART_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

function isExplicitDevOrTest(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test" ||
    process.env.NEXT_PUBLIC_ENABLE_DEMO_CATALOG === "true"
  );
}

/**
 * Cookie options for the anonymous guest cart token.
 */
function getCartCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: CART_COOKIE_MAX_AGE,
  };
}

/**
 * Retrieves or establishes the guest cart session token via secure cookie.
 */
export async function getOrSetGuestCartToken(): Promise<string> {
  const cookieStore = await cookies();
  const existingCookie = cookieStore.get(CART_COOKIE_NAME);
  if (existingCookie?.value && existingCookie.value.trim().length > 0) {
    return existingCookie.value.trim();
  }

  const newToken = generateSecureToken(32);
  cookieStore.set(CART_COOKIE_NAME, newToken, getCartCookieOptions());
  return newToken;
}

/**
 * Clears the guest cart cookie on login/merge or logout.
 */
export async function clearGuestCartCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CART_COOKIE_NAME);
}

/**
 * Resolves or atomically creates the active cart (User-bound or Guest-bound).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOrCreateActiveCartId(txOrDb: any, userId: string | null, guestSessionHash: string | null): Promise<string> {
  if (userId) {
    // Atomic first-time creation or return existing customer cart using ON CONFLICT (user_id)
    const [cartRow] = await txOrDb
      .insert(carts)
      .values({
        userId,
        currency: "INR",
      })
      .onConflictDoUpdate({
        target: carts.userId,
        set: {
          updatedAt: sql`NOW()`,
        },
      })
      .returning({ id: carts.id });

    if (cartRow) return cartRow.id;

    // Fallback lookup if not returned
    const existing = await txOrDb.query.carts.findFirst({
      where: eq(carts.userId, userId),
    });
    if (existing) return existing.id;
    throw new Error("CART_CREATION_FAILED: Unable to resolve or create customer cart.");
  }

  if (guestSessionHash) {
    const existing = await txOrDb.query.carts.findFirst({
      where: eq(carts.guestSessionHash, guestSessionHash),
    });
    if (existing) return existing.id;

    const [newGuestCart] = await txOrDb
      .insert(carts)
      .values({
        guestSessionHash,
        currency: "INR",
      })
      .returning({ id: carts.id });

    if (newGuestCart) return newGuestCart.id;
    throw new Error("CART_CREATION_FAILED: Unable to create guest cart.");
  }

  throw new Error("INVALID_SESSION: Neither customer userId nor guestSessionHash provided.");
}

/**
 * Pure calculation helper to evaluate purchasable stock.
 * Phase 5 read-only invariant: Never mutates inventory records.
 */
function calculateAvailableStock(quantityOnHand: number | null, quantityReserved: number | null): number {
  const onHand = quantityOnHand ?? 0;
  const reserved = quantityReserved ?? 0;
  return Math.max(0, onHand - reserved);
}

/**
 * Empty response builder for unconfigured or error states.
 */
function createUnavailableCartResponse(message: string): CartDTO {
  return {
    id: "unavailable",
    items: [],
    itemCount: 0,
    totalQuantity: 0,
    subtotalMinor: 0,
    currency: "INR",
    isDemoPreview: false,
    warnings: [message],
  };
}

/**
 * Server-side shared rate limiter for cart mutations.
 * 60 mutations per 10 minutes per customer or guest session.
 * For guests, uses SHA-256 hash of guest session token — raw token is never stored/logged.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enforceCartRateLimit(db: any, currentUser: { id: string } | null, guestToken: string | null): Promise<void> {
  const rateLimitKey = currentUser
    ? `cart:user:${currentUser.id}`
    : `cart:guest:${guestToken ? hashToken(guestToken) : "unknown"}`;

  const rateLimitResult = await checkSharedRateLimit(db, rateLimitKey, {
    maxAttempts: 60,
    windowSeconds: 600, // 60 mutations per 10 minutes
  });

  if (!rateLimitResult.success) {
    if (rateLimitResult.isServiceUnavailable) {
      throw new Error("SERVICE_UNAVAILABLE: Cart service is temporarily unavailable. Please try again shortly.");
    }
    throw new Error(
      `RATE_LIMITED: You have performed too many cart actions. Please wait ${rateLimitResult.resetInSeconds} seconds before trying again.`
    );
  }
}

/**
 * Fetches the active cart and revalidates all line prices and stock availability on the server.
 */
export async function getCart(): Promise<CartDTO> {
  if (!isDatabaseConfigured()) {
    if (!isExplicitDevOrTest()) {
      return createUnavailableCartResponse("Database is not configured. Cart is unavailable in production.");
    }
    // In dev/test demo mode without database, return a non-persistent preview state
    return {
      id: "demo-preview-cart",
      items: [],
      itemCount: 0,
      totalQuantity: 0,
      subtotalMinor: 0,
      currency: "INR",
      isDemoPreview: true,
      warnings: ["Demo Catalogue Preview Mode: Cart items are not persisted to a database."],
    };
  }

  const db = getDb();
  if (!db) {
    return createUnavailableCartResponse("Database connection unavailable.");
  }

  const currentUser = await getCurrentUser();
  let cartId: string;

  if (currentUser) {
    cartId = await getOrCreateActiveCartId(db, currentUser.id, null);
  } else {
    const guestToken = await getOrSetGuestCartToken();
    const guestHash = hashToken(guestToken);
    cartId = await getOrCreateActiveCartId(db, null, guestHash);
  }

  // Fetch all cart items joined with current live product & inventory data
  const rawItems = await db
    .select({
      cartItemId: cartItems.id,
      productId: cartItems.productId,
      variantId: cartItems.variantId,
      quantity: cartItems.quantity,
      productName: products.name,
      productSku: products.sku,
      productStatus: products.status,
      productPriceMinor: products.priceMinor,
      variantSku: productVariants.sku,
      variantPriceOverrideMinor: productVariants.priceOverrideMinor,
      variantStatus: productVariants.status,
      quantityOnHand: inventory.quantityOnHand,
      quantityReserved: inventory.quantityReserved,
    })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .leftJoin(productVariants, eq(cartItems.variantId, productVariants.id))
    .leftJoin(inventory, eq(products.id, inventory.productId))
    .where(eq(cartItems.cartId, cartId));

  const items: CartItemDTO[] = [];
  const warnings: string[] = [];

  for (const row of rawItems) {
    const isVariant = Boolean(row.variantId && row.variantSku);
    const name = isVariant ? `${row.productName} (${row.variantSku})` : row.productName;
    const sku = isVariant && row.variantSku ? row.variantSku : row.productSku;
    const status = isVariant && row.variantStatus ? row.variantStatus : row.productStatus;

    // Server-authoritative price calculation
    const unitPriceMinor = isVariant && row.variantPriceOverrideMinor != null ? row.variantPriceOverrideMinor : row.productPriceMinor;
    const quantity = Math.min(10, Math.max(1, row.quantity));
    const lineTotalMinor = unitPriceMinor * quantity;

    // Server-side stock availability validation (read-only)
    const availableStock = calculateAvailableStock(row.quantityOnHand, row.quantityReserved);
    const inStock = availableStock > 0;
    const hasStockWarning = availableStock < quantity;

    let stockWarningMessage: string | undefined;
    if (!inStock) {
      stockWarningMessage = "Currently out of stock.";
      warnings.push(`"${name}" is currently out of stock.`);
    } else if (hasStockWarning) {
      stockWarningMessage = `Only ${availableStock} units available. Requested ${quantity}.`;
      warnings.push(`"${name}": only ${availableStock} units available.`);
    }

    if (status !== "active") {
      warnings.push(`"${name}" is no longer active in our catalogue.`);
    }

    items.push({
      id: row.cartItemId,
      productId: row.productId,
      variantId: row.variantId,
      name,
      sku,
      brand: "Certified",
      priceMinor: unitPriceMinor,
      quantity,
      lineTotalMinor,
      availableStock,
      inStock,
      hasStockWarning,
      stockWarningMessage,
      status,
      isDemo: false,
    });
  }

  const subtotalMinor = items.reduce((acc, item) => acc + item.lineTotalMinor, 0);
  const totalQuantity = items.reduce((acc, item) => acc + item.quantity, 0);

  return {
    id: cartId,
    items,
    itemCount: items.length,
    totalQuantity,
    subtotalMinor,
    currency: "INR",
    isDemoPreview: false,
    warnings,
  };
}

/**
 * Adds an item to the active cart with strict server validation.
 */
export async function addToCart(rawInput: AddToCartInput): Promise<CartDTO> {
  const input = addToCartSchema.parse(rawInput);

  // Demo catalogue isolation check: Never persist demo products to database carts
  if (input.productId.startsWith("DEMO-") || input.productId.includes("demo")) {
    throw new Error("INVALID_PRODUCT: Demo catalogue items cannot be added to a persistent customer cart.");
  }

  if (!isDatabaseConfigured()) {
    if (!isExplicitDevOrTest()) {
      throw new Error("DATABASE_UNAVAILABLE: Database is not configured. Cart is unavailable in production.");
    }
    throw new Error("DEMO_CATALOGUE_MODE: Live cart mutations require an active database. Demo items cannot be persisted.");
  }

  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection is not available.");
  }

  // Verify product exists and is active in database
  const productRecord = await db.query.products.findFirst({
    where: and(eq(products.id, input.productId), eq(products.status, "active")),
  });

  if (!productRecord) {
    throw new Error("PRODUCT_UNAVAILABLE: The requested product does not exist or is no longer active.");
  }

  // If variant specified, verify variant exists, belongs to product, and is active
  if (input.variantId) {
    const variantRecord = await db.query.productVariants.findFirst({
      where: and(
        eq(productVariants.id, input.variantId),
        eq(productVariants.productId, input.productId),
        eq(productVariants.status, "active")
      ),
    });

    if (!variantRecord) {
      throw new Error("VARIANT_UNAVAILABLE: The requested product variant is not available.");
    }
  }

  const currentUser = await getCurrentUser();
  const guestToken = currentUser ? null : await getOrSetGuestCartToken();
  const guestHash = guestToken ? hashToken(guestToken) : null;

  // Rate limiting before mutations: 60 mutations per 10 minutes
  await enforceCartRateLimit(db, currentUser, guestToken);

  await db.transaction(async (tx) => {
    const cartId = await getOrCreateActiveCartId(tx, currentUser?.id ?? null, guestHash);

    // Check for existing cart item
    const existingItemCondition = input.variantId
      ? and(eq(cartItems.cartId, cartId), eq(cartItems.productId, input.productId), eq(cartItems.variantId, input.variantId))
      : and(eq(cartItems.cartId, cartId), eq(cartItems.productId, input.productId), isNull(cartItems.variantId));

    const existingItem = await tx.query.cartItems.findFirst({
      where: existingItemCondition,
    });

    if (existingItem) {
      const newQuantity = Math.min(10, existingItem.quantity + input.quantity);
      await tx
        .update(cartItems)
        .set({
          quantity: newQuantity,
          updatedAt: sql`NOW()`,
        })
        .where(eq(cartItems.id, existingItem.id));
    } else {
      if (input.variantId) {
        await tx
          .insert(cartItems)
          .values({
            cartId,
            productId: input.productId,
            variantId: input.variantId,
            quantity: Math.min(10, Math.max(1, input.quantity)),
          })
          .onConflictDoUpdate({
            target: [cartItems.cartId, cartItems.productId, cartItems.variantId],
            targetWhere: sql`${cartItems.variantId} IS NOT NULL`,
            set: {
              quantity: sql`LEAST(10, ${cartItems.quantity} + EXCLUDED.quantity)`,
              updatedAt: sql`NOW()`,
            },
          });
      } else {
        await tx
          .insert(cartItems)
          .values({
            cartId,
            productId: input.productId,
            variantId: null,
            quantity: Math.min(10, Math.max(1, input.quantity)),
          })
          .onConflictDoUpdate({
            target: [cartItems.cartId, cartItems.productId],
            targetWhere: sql`${cartItems.variantId} IS NULL`,
            set: {
              quantity: sql`LEAST(10, ${cartItems.quantity} + EXCLUDED.quantity)`,
              updatedAt: sql`NOW()`,
            },
          });
      }
    }
  });

  return getCart();
}

/**
 * Updates the quantity of an existing cart item with customer ownership enforcement.
 */
export async function updateCartItemQuantity(rawInput: UpdateCartItemQuantityInput): Promise<CartDTO> {
  const input = updateCartItemQuantitySchema.parse(rawInput);

  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection is not configured.");
  }

  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
  }

  const currentUser = await getCurrentUser();
  const guestToken = currentUser ? null : await getOrSetGuestCartToken();
  const guestHash = guestToken ? hashToken(guestToken) : null;

  // Rate limiting before mutations: 60 mutations per 10 minutes
  await enforceCartRateLimit(db, currentUser, guestToken);

  await db.transaction(async (tx) => {
    const cartId = await getOrCreateActiveCartId(tx, currentUser?.id ?? null, guestHash);

    // Verify ownership: cartItem must belong to the active cart
    const item = await tx.query.cartItems.findFirst({
      where: and(eq(cartItems.id, input.cartItemId), eq(cartItems.cartId, cartId)),
    });

    if (!item) {
      throw new Error("NOT_FOUND: Cart item not found or does not belong to active cart.");
    }

    await tx
      .update(cartItems)
      .set({
        quantity: input.quantity,
        updatedAt: sql`NOW()`,
      })
      .where(eq(cartItems.id, input.cartItemId));
  });

  return getCart();
}

/**
 * Removes an item from the cart with customer ownership enforcement.
 */
export async function removeFromCart(rawInput: RemoveFromCartInput): Promise<CartDTO> {
  const input = removeFromCartSchema.parse(rawInput);

  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection is not configured.");
  }

  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
  }

  const currentUser = await getCurrentUser();
  const guestToken = currentUser ? null : await getOrSetGuestCartToken();
  const guestHash = guestToken ? hashToken(guestToken) : null;

  // Rate limiting before mutations: 60 mutations per 10 minutes
  await enforceCartRateLimit(db, currentUser, guestToken);

  await db.transaction(async (tx) => {
    const cartId = await getOrCreateActiveCartId(tx, currentUser?.id ?? null, guestHash);

    const deleted = await tx
      .delete(cartItems)
      .where(and(eq(cartItems.id, input.cartItemId), eq(cartItems.cartId, cartId)))
      .returning({ id: cartItems.id });

    if (deleted.length === 0) {
      throw new Error("NOT_FOUND: Cart item not found or does not belong to active cart.");
    }
  });

  return getCart();
}

/**
 * Clears all items from the active cart.
 */
export async function clearCart(): Promise<CartDTO> {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection is not configured.");
  }

  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
  }

  const currentUser = await getCurrentUser();
  const guestToken = currentUser ? null : await getOrSetGuestCartToken();
  const guestHash = guestToken ? hashToken(guestToken) : null;

  // Rate limiting before mutations: 60 mutations per 10 minutes
  await enforceCartRateLimit(db, currentUser, guestToken);

  await db.transaction(async (tx) => {
    const cartId = await getOrCreateActiveCartId(tx, currentUser?.id ?? null, guestHash);
    await tx.delete(cartItems).where(eq(cartItems.cartId, cartId));
  });

  return getCart();
}

/**
 * Transactional guest-to-customer cart merge on login.
 * Guarantees idempotency, row locking, and caps merged quantities at 10.
 */
export async function mergeGuestCartIntoUserCart(userId: string, guestToken: string): Promise<CartDTO> {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection is not configured.");
  }

  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: Database connection unavailable.");
  }

  const guestHash = hashToken(guestToken);

  await db.transaction(async (tx) => {
    // 1. Resolve or atomically create customer cart with row locking
    const customerCartId = await getOrCreateActiveCartId(tx, userId, null);

    // 2. Find guest cart
    const guestCart = await tx.query.carts.findFirst({
      where: eq(carts.guestSessionHash, guestHash),
    });

    if (!guestCart) {
      // Guest cart does not exist or was already merged
      return;
    }

    // 3. Fetch guest cart items
    const guestItems = await tx.query.cartItems.findMany({
      where: eq(cartItems.cartId, guestCart.id),
    });

    if (guestItems.length === 0) {
      // Clean up empty guest cart
      await tx.delete(carts).where(eq(carts.id, guestCart.id));
      return;
    }

    // 4. Fetch customer cart items
    const customerItems = await tx.query.cartItems.findMany({
      where: eq(cartItems.cartId, customerCartId),
    });

    // 5. Merge items deterministically
    for (const gItem of guestItems) {
      const match = customerItems.find(
        (cItem) =>
          cItem.productId === gItem.productId &&
          ((cItem.variantId === null && gItem.variantId === null) || cItem.variantId === gItem.variantId)
      );

      if (match) {
        // Line exists in customer cart: sum and cap quantity at 10
        const mergedQty = Math.min(10, match.quantity + gItem.quantity);
        await tx
          .update(cartItems)
          .set({
            quantity: mergedQty,
            updatedAt: sql`NOW()`,
          })
          .where(eq(cartItems.id, match.id));
      } else {
        // Line unique to guest cart: move to customer cart with matching partial unique index target
        if (gItem.variantId === null) {
          await tx
            .insert(cartItems)
            .values({
              cartId: customerCartId,
              productId: gItem.productId,
              variantId: null,
              quantity: Math.min(10, Math.max(1, gItem.quantity)),
            })
            .onConflictDoUpdate({
              target: [cartItems.cartId, cartItems.productId],
              targetWhere: sql`${cartItems.variantId} IS NULL`,
              set: {
                quantity: sql`LEAST(10, ${cartItems.quantity} + EXCLUDED.quantity)`,
                updatedAt: sql`NOW()`,
              },
            });
        } else {
          await tx
            .insert(cartItems)
            .values({
              cartId: customerCartId,
              productId: gItem.productId,
              variantId: gItem.variantId,
              quantity: Math.min(10, Math.max(1, gItem.quantity)),
            })
            .onConflictDoUpdate({
              target: [cartItems.cartId, cartItems.productId, cartItems.variantId],
              targetWhere: sql`${cartItems.variantId} IS NOT NULL`,
              set: {
                quantity: sql`LEAST(10, ${cartItems.quantity} + EXCLUDED.quantity)`,
                updatedAt: sql`NOW()`,
              },
            });
        }
      }
    }

    // 6. Delete guest cart items and guest cart record
    await tx.delete(cartItems).where(eq(cartItems.cartId, guestCart.id));
    await tx.delete(carts).where(eq(carts.id, guestCart.id));
  });

  // Rotate / clear guest cookie
  await clearGuestCartCookie();

  return getCart();
}
