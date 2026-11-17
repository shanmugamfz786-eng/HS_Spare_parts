import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./auth";

// ----------------------------------------------------------------------
// 1. Admin Audit Logs (Immutable audit trail of privileged operations)
// ----------------------------------------------------------------------
export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id")
      .references(() => users.id, { onDelete: "set null" })
      .notNull(),
    action: varchar("action", { length: 100 }).notNull(), // e.g. "product:update", "order:refund", "category:delete"
    entityType: varchar("entity_type", { length: 100 }).notNull(), // "product", "order", "category", "user"
    entityId: varchar("entity_id", { length: 255 }).notNull(),
    metadata: jsonb("metadata").default({}), // Safe before/after payload, no passwords/PII
    requestId: varchar("request_id", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_actor_created_idx").on(table.actorUserId, table.createdAt),
    index("audit_entity_idx").on(table.entityType, table.entityId),
  ]
);

// ----------------------------------------------------------------------
// 2. Site Settings (Store configuration, excluding credentials)
// ----------------------------------------------------------------------
export const siteSettings = pgTable(
  "site_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: varchar("key", { length: 100 }).notNull().unique(), // e.g. "store_announcement", "business_hours"
    value: jsonb("value").notNull(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("setting_key_idx").on(table.key)]
);

// ----------------------------------------------------------------------
// 3. Content Pages (About, FAQ, Shipping & Return Policy, Terms)
// ----------------------------------------------------------------------
export const contentPages = pgTable(
  "content_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("draft"), // draft, published, archived
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("content_slug_idx").on(table.slug),
    index("content_status_idx").on(table.status),
  ]
);

// ----------------------------------------------------------------------
// 4. Rate Limits (Shared distributed rate limiter backed by PostgreSQL)
// ----------------------------------------------------------------------
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: varchar("key", { length: 255 }).primaryKey(),
    attempts: integer("attempts").notNull().default(1),
    resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("rate_limit_reset_idx").on(table.resetAt)]
);

// ----------------------------------------------------------------------
// Relations
// ----------------------------------------------------------------------
export const adminAuditLogsRelations = relations(adminAuditLogs, ({ one }) => ({
  actor: one(users, {
    fields: [adminAuditLogs.actorUserId],
    references: [users.id],
  }),
}));

export const siteSettingsRelations = relations(siteSettings, ({ one }) => ({
  updater: one(users, {
    fields: [siteSettings.updatedBy],
    references: [users.id],
  }),
}));

export const contentPagesRelations = relations(contentPages, ({ one }) => ({
  updater: one(users, {
    fields: [contentPages.updatedBy],
    references: [users.id],
  }),
}));
