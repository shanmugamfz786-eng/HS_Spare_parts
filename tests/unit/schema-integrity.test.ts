import { describe, it, expect } from "vitest";
import * as schema from "../../src/lib/db/schema";
import { isTable } from "drizzle-orm";

describe("Database Schema Integrity", () => {
  it("should export all required tables from 04_DATABASE_SCHEMA.md", () => {
    const requiredTables = [
      "users",
      "sessions",
      "addresses",
      "roles",
      "permissions",
      "user_roles",
      "role_permissions",
      "password_reset_tokens",
      "vehicle_makes",
      "vehicle_models",
      "vehicle_variants",
      "product_fitments",
      "categories",
      "brands",
      "products",
      "product_images",
      "product_variants",
      "product_specifications",
      "inventory",
      "wishlists",
      "wishlist_items",
      "carts",
      "cart_items",
      "reviews",
      "coupons",
      "coupon_redemptions",
      "orders",
      "order_items",
      "order_status_history",
      "payments",
      "payment_webhook_events",
      "shipments",
      "returns",
      "refunds",
      "admin_audit_logs",
      "site_settings",
      "content_pages",
    ];

    const exportedTableNames: string[] = [];

    for (const [key, value] of Object.entries(schema)) {
      if (isTable(value)) {
        // @ts-expect-error Drizzle table internal name property
        const tableName = value[Symbol.for("drizzle:Name")] || value._.name;
        exportedTableNames.push(tableName);
      }
    }

    for (const table of requiredTables) {
      expect(
        exportedTableNames,
        `Expected table ${table} to be defined in Drizzle schema`
      ).toContain(table);
    }

    expect(exportedTableNames.length).toBeGreaterThanOrEqual(37);
  });
});
