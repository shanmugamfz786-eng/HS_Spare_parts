import "server-only";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { products, brands, categories } from "@/lib/db/schema/catalogue";
import { getCurrentUser, type SafeUser } from "@/features/auth/service";
import {
  ROLES,
  PERMISSIONS,
  hasRole,
  hasPermission,
  AuthorizationError,
  AuthenticationError,
  type PermissionKey,
} from "@/lib/auth/rbac";
import { DEMO_FEATURED_PRODUCTS } from "@/lib/constants/demo-catalog";
import { parseProductCondition } from "@/server/catalogue/catalogue-service";
import type {
  AdminCreateProductInput,
  AdminUpdateProductInput,
  ProductCondition,
} from "./schemas";

function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

function isExplicitDevOrTest(): boolean {
  return (
    process.env.NEXT_PUBLIC_ENABLE_DEMO_CATALOG === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

/**
 * Asserts that the active user possesses catalogue privileges.
 * Strictly blocks regular customer accounts and unauthenticated users.
 * Supports optional userOverride for unit test scenarios.
 */
export async function assertAdminCatalogueAccess(
  permission: PermissionKey = PERMISSIONS.CATALOGUE_WRITE,
  userOverride?: SafeUser | null
) {
  const currentUser = userOverride !== undefined ? userOverride : await getCurrentUser();

  if (!currentUser) {
    throw new AuthenticationError("Authentication required: Please sign in as an administrator.");
  }

  // Reject customer role explicitly
  if (currentUser.roles.includes(ROLES.CUSTOMER) && !currentUser.roles.includes(ROLES.ADMINISTRATOR)) {
    throw new AuthorizationError(
      "Access Denied: Regular customer accounts cannot create or manage catalogue products. This store is administrator-managed."
    );
  }

  const isAdmin = hasRole(currentUser.roles, [
    ROLES.ADMINISTRATOR,
    ROLES.SUPER_ADMINISTRATOR,
  ]);
  const hasAccess = isAdmin || hasPermission(currentUser.permissions, permission);

  if (!hasAccess) {
    throw new AuthorizationError(
      "Access Denied: Insufficient permissions to manage catalogue items."
    );
  }

  return currentUser;
}

export interface AdminProductListItem {
  id: string;
  sku: string;
  name: string;
  brandName: string;
  categoryName: string;
  priceMinor: number;
  condition: ProductCondition;
  conditionNotes?: string | null;
  status: string;
  isDemo?: boolean;
}

/**
 * Lists products for the admin catalogue dashboard.
 */
export async function getAdminProducts(
  userOverride?: SafeUser | null
): Promise<AdminProductListItem[]> {
  await assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_READ, userOverride);

  if (isDatabaseConfigured()) {
    const db = getDb();
    if (db) {
      const rows = await db
        .select({
          id: products.id,
          sku: products.sku,
          name: products.name,
          priceMinor: products.priceMinor,
          status: products.status,
          attributes: products.attributes,
          brandName: brands.name,
          categoryName: categories.name,
        })
        .from(products)
        .leftJoin(brands, eq(products.brandId, brands.id))
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .orderBy(desc(products.createdAt))
        .limit(100);

      return rows.map((r) => {
        const attrs = (r.attributes || {}) as Record<string, unknown>;
        return {
          id: r.id,
          sku: r.sku,
          name: r.name,
          brandName: r.brandName ?? "Generic",
          categoryName: r.categoryName ?? "General",
          priceMinor: r.priceMinor,
          condition: parseProductCondition(attrs.condition),
          conditionNotes: (attrs.conditionNotes as string) || null,
          status: r.status,
          isDemo: false,
        };
      });
    }
  }

  if (isExplicitDevOrTest()) {
    return DEMO_FEATURED_PRODUCTS.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      brandName: p.brand,
      categoryName: p.categoryName,
      priceMinor: p.priceMinor,
      condition: parseProductCondition(p.condition),
      conditionNotes: p.conditionNotes ?? null,
      status: "active",
      isDemo: true,
    }));
  }

  return [];
}

/**
 * Creates a new product in the catalogue with condition metadata.
 */
export async function createAdminProduct(
  input: AdminCreateProductInput,
  userOverride?: SafeUser | null
) {
  await assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_WRITE, userOverride);

  const attributesPayload = {
    condition: input.condition,
    conditionGrade: input.conditionGrade || null,
    conditionNotes: input.conditionNotes || null,
    visibleWearOrDefects: input.visibleWearOrDefects || null,
    testedStatus: input.testedStatus || null,
    warrantyDetails: input.warrantyDetails || null,
    fitmentHint: input.fitmentHint || null,
    oemReference: input.oemReference || null,
    isOem: Boolean(input.isOem),
  };

  if (isDatabaseConfigured()) {
    const db = getDb();
    if (!db) {
      throw new Error("DATABASE_UNAVAILABLE: Database connection is not available.");
    }

    const slug = input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const [created] = await db
      .insert(products)
      .values({
        sku: input.sku.trim().toUpperCase(),
        slug: `${slug}-${Date.now().toString(36)}`,
        name: input.name.trim(),
        brandId: input.brandId,
        categoryId: input.categoryId,
        priceMinor: input.priceMinor,
        compareAtPriceMinor: input.compareAtPriceMinor,
        shortDescription: input.shortDescription,
        description: input.description,
        status: "active",
        attributes: attributesPayload,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to insert product record into database.");
    }

    return {
      success: true,
      productId: created.id,
      message: `Product "${created.name}" created successfully with condition: ${input.condition.toUpperCase()}.`,
    };
  }

  // Demo fallback
  return {
    success: true,
    productId: `demo-${Date.now()}`,
    isDemo: true,
    message: `[Demo Mode] Admin created product "${input.name}" with condition: ${input.condition.toUpperCase()} (simulated).`,
  };
}

/**
 * Updates an existing catalogue product while preserving existing condition and disclosures.
 */
export async function updateAdminProduct(
  input: AdminUpdateProductInput,
  userOverride?: SafeUser | null
) {
  await assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_WRITE, userOverride);

  if (isDatabaseConfigured()) {
    const db = getDb();
    if (!db) {
      throw new Error("DATABASE_UNAVAILABLE: Database connection is not available.");
    }

    const existing = await db.query.products.findFirst({
      where: eq(products.id, input.id),
    });

    if (!existing) {
      throw new Error(`Product not found with ID: ${input.id}`);
    }

    const currentAttrs = (existing.attributes || {}) as Record<string, unknown>;

    // Safely merge attributes preserving existing condition/disclosures
    const mergedAttrs = {
      ...currentAttrs,
      ...(input.condition !== undefined ? { condition: input.condition } : {}),
      ...(input.conditionGrade !== undefined ? { conditionGrade: input.conditionGrade } : {}),
      ...(input.conditionNotes !== undefined ? { conditionNotes: input.conditionNotes } : {}),
      ...(input.visibleWearOrDefects !== undefined ? { visibleWearOrDefects: input.visibleWearOrDefects } : {}),
      ...(input.testedStatus !== undefined ? { testedStatus: input.testedStatus } : {}),
      ...(input.warrantyDetails !== undefined ? { warrantyDetails: input.warrantyDetails } : {}),
      ...(input.fitmentHint !== undefined ? { fitmentHint: input.fitmentHint } : {}),
      ...(input.oemReference !== undefined ? { oemReference: input.oemReference } : {}),
      ...(input.isOem !== undefined ? { isOem: input.isOem } : {}),
    };

    const updateFields: Record<string, unknown> = {
      attributes: mergedAttrs,
      updatedAt: new Date(),
    };

    if (input.name !== undefined) updateFields.name = input.name.trim();
    if (input.sku !== undefined) updateFields.sku = input.sku.trim().toUpperCase();
    if (input.categoryId !== undefined) updateFields.categoryId = input.categoryId;
    if (input.brandId !== undefined) updateFields.brandId = input.brandId;
    if (input.priceMinor !== undefined) updateFields.priceMinor = input.priceMinor;
    if (input.compareAtPriceMinor !== undefined) updateFields.compareAtPriceMinor = input.compareAtPriceMinor;
    if (input.shortDescription !== undefined) updateFields.shortDescription = input.shortDescription;
    if (input.description !== undefined) updateFields.description = input.description;

    const [updated] = await db
      .update(products)
      .set(updateFields)
      .where(eq(products.id, input.id))
      .returning();

    if (!updated) {
      throw new Error(`Failed to update product with ID: ${input.id}`);
    }

    return {
      success: true,
      productId: updated.id,
      message: `Product "${updated.name}" updated successfully.`,
    };
  }

  // Demo fallback
  return {
    success: true,
    productId: input.id,
    isDemo: true,
    message: `[Demo Mode] Product "${input.name || input.id}" updated successfully (simulated).`,
  };
}

/**
 * Publishes or changes the status of a catalogue product.
 * Requires mandatory explicit condition (New or Pre-Owned) before publishing.
 */
export async function publishAdminProduct(
  id: string,
  status: "active" | "draft" | "archived" = "active",
  userOverride?: SafeUser | null
) {
  await assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_WRITE, userOverride);

  if (isDatabaseConfigured()) {
    const db = getDb();
    if (!db) {
      throw new Error("DATABASE_UNAVAILABLE: Database connection is not available.");
    }

    const existing = await db.query.products.findFirst({
      where: eq(products.id, id),
    });

    if (!existing) {
      throw new Error(`Product not found with ID: ${id}`);
    }

    const attrs = (existing.attributes || {}) as Record<string, unknown>;
    const condition = parseProductCondition(attrs.condition);

    if (status === "active" && (condition === "unclassified" || !attrs.condition)) {
      throw new Error(
        "PUBLISHING_BLOCKED: Product condition (New or Pre-Owned) is mandatory before publishing."
      );
    }

    const [updated] = await db
      .update(products)
      .set({ status, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();

    if (!updated) {
      throw new Error(`Failed to update status for product ID: ${id}`);
    }

    return {
      success: true,
      productId: updated.id,
      status: updated.status,
      message: `Product "${updated.name}" status changed to ${status}.`,
    };
  }

  // Demo fallback
  return {
    success: true,
    productId: id,
    status,
    isDemo: true,
    message: `[Demo Mode] Product status changed to ${status} (simulated).`,
  };
}

/**
 * Deletes a product from the catalogue.
 * Requires CATALOGUE_DELETE permission.
 */
export async function deleteAdminProduct(
  id: string,
  userOverride?: SafeUser | null
) {
  await assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_DELETE, userOverride);

  if (isDatabaseConfigured()) {
    const db = getDb();
    if (!db) {
      throw new Error("DATABASE_UNAVAILABLE: Database connection is not available.");
    }

    const [deleted] = await db
      .delete(products)
      .where(eq(products.id, id))
      .returning();

    if (!deleted) {
      throw new Error(`Product not found or already deleted: ${id}`);
    }

    return {
      success: true,
      productId: deleted.id,
      message: `Product "${deleted.name}" deleted successfully.`,
    };
  }

  // Demo fallback
  return {
    success: true,
    productId: id,
    isDemo: true,
    message: `[Demo Mode] Product ${id} deleted successfully (simulated).`,
  };
}
