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
// 1. Categories (Supports Motrparts-specified hierarchy & navbar groups)
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
    status: varchar("status", { length: 32 }).notNull().default("active"), // active, inactive, archived
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

export const brandsRelations = relations(brands, ({ many }) => ({
  products: many(products),
}));

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
    priceMinor: integer("price_minor").notNull(), // Amount in paise/cents
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

export const productsRelations = relations(products, ({ one }) => ({
  brand: one(brands, {
    fields: [products.brandId],
    references: [brands.id],
  }),
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
}));
