import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ----------------------------------------------------------------------
// 1. Categories
// ----------------------------------------------------------------------
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parentId: uuid("parent_id"),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    description: text("description"),
    imageUrl: text("image_url"),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    sortOrder: integer("sort_order").notNull().default(0),
    isTopNav: boolean("is_top_nav").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("category_parent_idx").on(table.parentId),
    index("category_slug_idx").on(table.slug),
    index("category_status_sort_idx").on(table.status, table.sortOrder),
  ]
);

// ----------------------------------------------------------------------
// 2. Brands
// ----------------------------------------------------------------------
export const brands = pgTable(
  "brands",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    logoUrl: text("logo_url"),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("brand_slug_idx").on(table.slug),
    index("brand_status_idx").on(table.status),
  ]
);

// ----------------------------------------------------------------------
// 3. Products
// ----------------------------------------------------------------------
export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "restrict" }),
    sku: varchar("sku", { length: 100 }).notNull().unique(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    shortDescription: text("short_description"),
    description: text("description"),
    status: varchar("status", { length: 32 }).notNull().default("draft"), // draft, active, archived
    currency: varchar("currency", { length: 10 }).notNull().default("INR"),
    priceMinor: integer("price_minor").notNull(), // Minor integer currency units (paise)
    compareAtPriceMinor: integer("compare_at_price_minor"),
    taxCode: varchar("tax_code", { length: 50 }),
    weightGrams: integer("weight_grams"),
    attributes: jsonb("attributes").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("product_sku_idx").on(table.sku),
    index("product_slug_idx").on(table.slug),
    index("product_brand_idx").on(table.brandId),
    index("product_category_idx").on(table.categoryId),
    index("product_status_idx").on(table.status),
  ]
);

// ----------------------------------------------------------------------
// 4. Product Images
// ----------------------------------------------------------------------
export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    storageKey: varchar("storage_key", { length: 255 }),
    url: text("url").notNull(),
    altText: text("alt_text").notNull().default("Automotive spare part"),
    sortOrder: integer("sort_order").notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("product_image_prod_idx").on(table.productId),
    index("product_image_sort_idx").on(table.productId, table.sortOrder),
  ]
);

// ----------------------------------------------------------------------
// 5. Product Variants
// ----------------------------------------------------------------------
export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    sku: varchar("sku", { length: 100 }).notNull().unique(),
    attributes: jsonb("attributes").notNull().default({}),
    priceOverrideMinor: integer("price_override_minor"),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("variant_prod_idx").on(table.productId),
    index("variant_sku_idx").on(table.sku),
  ]
);

// ----------------------------------------------------------------------
// 6. Product Specifications
// ----------------------------------------------------------------------
export const productSpecifications = pgTable(
  "product_specifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    value: text("value").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("spec_prod_idx").on(table.productId),
    index("spec_sort_idx").on(table.productId, table.sortOrder),
  ]
);

// ----------------------------------------------------------------------
// 7. Inventory (Stock and atomic reservations)
// ----------------------------------------------------------------------
export const inventory = pgTable(
  "inventory",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "cascade" }),
    quantityOnHand: integer("quantity_on_hand").notNull().default(0),
    quantityReserved: integer("quantity_reserved").notNull().default(0),
    reorderLevel: integer("reorder_level").notNull().default(5),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("inventory_prod_idx").on(table.productId),
    index("inventory_variant_idx").on(table.variantId),
  ]
);

// ----------------------------------------------------------------------
// Catalogue Relations
// ----------------------------------------------------------------------
export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "subcategories",
  }),
  children: many(categories, {
    relationName: "subcategories",
  }),
  products: many(products),
}));

export const brandsRelations = relations(brands, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  brand: one(brands, {
    fields: [products.brandId],
    references: [brands.id],
  }),
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  images: many(productImages),
  variants: many(productVariants),
  specifications: many(productSpecifications),
  inventory: many(inventory),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, {
    fields: [productImages.productId],
    references: [products.id],
  }),
}));

export const productVariantsRelations = relations(productVariants, ({ one, many }) => ({
  product: one(products, {
    fields: [productVariants.productId],
    references: [products.id],
  }),
  inventory: many(inventory),
}));

export const productSpecificationsRelations = relations(productSpecifications, ({ one }) => ({
  product: one(products, {
    fields: [productSpecifications.productId],
    references: [products.id],
  }),
}));

export const inventoryRelations = relations(inventory, ({ one }) => ({
  product: one(products, {
    fields: [inventory.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [inventory.variantId],
    references: [productVariants.id],
  }),
}));
