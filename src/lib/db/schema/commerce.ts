import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./auth";
import { products, productVariants } from "./catalogue";

// ----------------------------------------------------------------------
// Wishlists
// ----------------------------------------------------------------------
export const wishlists = pgTable(
  "wishlists",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull()
      .unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("wishlist_user_idx").on(table.userId)]
);

export const wishlistItems = pgTable(
  "wishlist_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    wishlistId: uuid("wishlist_id")
      .references(() => wishlists.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wishlist_prod_unique_idx").on(table.wishlistId, table.productId),
    index("wishlist_item_prod_idx").on(table.productId),
  ]
);

// ----------------------------------------------------------------------
// Carts (Persistent for signed-in users, session-bound for guests)
// ----------------------------------------------------------------------
export const carts = pgTable(
  "carts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    guestSessionHash: varchar("guest_session_hash", { length: 255 }),
    currency: varchar("currency", { length: 10 }).notNull().default("INR"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("cart_user_unique_idx").on(table.userId),
    index("cart_guest_idx").on(table.guestSessionHash),
  ]
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cartId: uuid("cart_id")
      .references(() => carts.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("cart_item_cart_idx").on(table.cartId),
    index("cart_item_prod_idx").on(table.productId),
    uniqueIndex("cart_item_no_variant_unique_idx")
      .on(table.cartId, table.productId)
      .where(sql`${table.variantId} IS NULL`),
    uniqueIndex("cart_item_variant_unique_idx")
      .on(table.cartId, table.productId, table.variantId)
      .where(sql`${table.variantId} IS NOT NULL`),
  ]
);

// ----------------------------------------------------------------------
// Reviews (Product ratings and reviews with moderation)
// ----------------------------------------------------------------------
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    orderItemId: uuid("order_item_id"), // Nullable link to verified purchase
    rating: integer("rating").notNull(), // 1 to 5 integer
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("pending"), // pending, approved, rejected
    isVerifiedPurchase: boolean("is_verified_purchase").notNull().default(false),
    moderatedBy: uuid("moderated_by").references(() => users.id, { onDelete: "set null" }),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("review_prod_status_idx").on(table.productId, table.status),
    index("review_user_idx").on(table.userId),
  ]
);

// ----------------------------------------------------------------------
// Coupons & Promotions
// ----------------------------------------------------------------------
export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    codeNormalized: varchar("code_normalized", { length: 50 }).notNull().unique(), // e.g. "SPRING20"
    discountType: varchar("discount_type", { length: 32 }).notNull(), // "percentage" | "fixed_minor"
    discountValue: integer("discount_value").notNull(), // e.g. 10 for 10% or 50000 for ₹500 in paise
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    usageLimit: integer("usage_limit"), // Nullable for unlimited
    perCustomerLimit: integer("per_customer_limit").notNull().default(1),
    minimumSubtotalMinor: integer("minimum_subtotal_minor").notNull().default(0),
    active: boolean("active").notNull().default(true),
    stackingPolicy: varchar("stacking_policy", { length: 32 }).notNull().default("none"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("coupon_code_idx").on(table.codeNormalized),
    index("coupon_active_dates_idx").on(table.active, table.startAt, table.endAt),
  ]
);

export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    couponId: uuid("coupon_id")
      .references(() => coupons.id, { onDelete: "restrict" })
      .notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    orderId: uuid("order_id"), // Reference to order id
    discountMinor: integer("discount_minor").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("redemption_coupon_idx").on(table.couponId),
    index("redemption_user_idx").on(table.userId),
  ]
);

// ----------------------------------------------------------------------
// Relations
// ----------------------------------------------------------------------
export const wishlistsRelations = relations(wishlists, ({ one, many }) => ({
  user: one(users, {
    fields: [wishlists.userId],
    references: [users.id],
  }),
  items: many(wishlistItems),
}));

export const wishlistItemsRelations = relations(wishlistItems, ({ one }) => ({
  wishlist: one(wishlists, {
    fields: [wishlistItems.wishlistId],
    references: [wishlists.id],
  }),
  product: one(products, {
    fields: [wishlistItems.productId],
    references: [products.id],
  }),
}));

export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(users, {
    fields: [carts.userId],
    references: [users.id],
  }),
  items: many(cartItems),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, {
    fields: [cartItems.cartId],
    references: [carts.id],
  }),
  product: one(products, {
    fields: [cartItems.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [cartItems.variantId],
    references: [productVariants.id],
  }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  product: one(products, {
    fields: [reviews.productId],
    references: [products.id],
  }),
  user: one(users, {
    fields: [reviews.userId],
    references: [users.id],
  }),
  moderator: one(users, {
    fields: [reviews.moderatedBy],
    references: [users.id],
  }),
}));

export const couponsRelations = relations(coupons, ({ many }) => ({
  redemptions: many(couponRedemptions),
}));

export const couponRedemptionsRelations = relations(couponRedemptions, ({ one }) => ({
  coupon: one(coupons, {
    fields: [couponRedemptions.couponId],
    references: [coupons.id],
  }),
  user: one(users, {
    fields: [couponRedemptions.userId],
    references: [users.id],
  }),
}));
