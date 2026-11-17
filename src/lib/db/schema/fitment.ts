import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { products } from "./catalogue";

// ----------------------------------------------------------------------
// Vehicle Makes (e.g. Maruti Suzuki, Hyundai, Tata, Mahindra, Toyota)
// ----------------------------------------------------------------------
export const vehicleMakes = pgTable(
  "vehicle_makes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("make_slug_idx").on(table.slug)]
);

// ----------------------------------------------------------------------
// Vehicle Models (e.g. Swift, Creta, Nexon, Thar, Innova)
// ----------------------------------------------------------------------
export const vehicleModels = pgTable(
  "vehicle_models",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    makeId: uuid("make_id")
      .references(() => vehicleMakes.id, { onDelete: "restrict" })
      .notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("model_make_idx").on(table.makeId),
    index("model_slug_idx").on(table.slug),
  ]
);

// ----------------------------------------------------------------------
// Vehicle Variants (e.g. Gen 3 1.2L K12M Petrol Manual 2018-2023)
// ----------------------------------------------------------------------
export const vehicleVariants = pgTable(
  "vehicle_variants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    modelId: uuid("model_id")
      .references(() => vehicleModels.id, { onDelete: "restrict" })
      .notNull(),
    generation: varchar("generation", { length: 100 }),
    engine: varchar("engine", { length: 100 }),
    fuel: varchar("fuel", { length: 50 }), // Petrol, Diesel, CNG, Electric
    transmission: varchar("transmission", { length: 50 }), // Manual, Automatic, AMT
    yearStart: integer("year_start").notNull(),
    yearEnd: integer("year_end"), // Nullable for ongoing production
    attributes: jsonb("attributes").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("variant_model_idx").on(table.modelId),
    index("variant_years_idx").on(table.yearStart, table.yearEnd),
  ]
);

// ----------------------------------------------------------------------
// Product Fitments (Curated and verified fitment records)
// ----------------------------------------------------------------------
export const productFitments = pgTable(
  "product_fitments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    vehicleVariantId: uuid("vehicle_variant_id")
      .references(() => vehicleVariants.id, { onDelete: "restrict" })
      .notNull(),
    notes: text("notes"),
    sourceReference: varchar("source_reference", { length: 255 }),
    verifiedStatus: varchar("verified_status", { length: 32 }).notNull().default("unverified"), // verified, unverified, oem_cross_ref
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("product_variant_unique_idx").on(table.productId, table.vehicleVariantId),
    index("fitment_product_idx").on(table.productId),
    index("fitment_variant_idx").on(table.vehicleVariantId),
  ]
);

// ----------------------------------------------------------------------
// Fitment Relations
// ----------------------------------------------------------------------
export const vehicleMakesRelations = relations(vehicleMakes, ({ many }) => ({
  models: many(vehicleModels),
}));

export const vehicleModelsRelations = relations(vehicleModels, ({ one, many }) => ({
  make: one(vehicleMakes, {
    fields: [vehicleModels.makeId],
    references: [vehicleMakes.id],
  }),
  variants: many(vehicleVariants),
}));

export const vehicleVariantsRelations = relations(vehicleVariants, ({ one, many }) => ({
  model: one(vehicleModels, {
    fields: [vehicleVariants.modelId],
    references: [vehicleModels.id],
  }),
  fitments: many(productFitments),
}));

export const productFitmentsRelations = relations(productFitments, ({ one }) => ({
  product: one(products, {
    fields: [productFitments.productId],
    references: [products.id],
  }),
  variant: one(vehicleVariants, {
    fields: [productFitments.vehicleVariantId],
    references: [vehicleVariants.id],
  }),
}));
