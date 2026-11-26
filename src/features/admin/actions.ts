"use server";

import { revalidatePath } from "next/cache";
import {
  adminCreateProductSchema,
  adminUpdateProductSchema,
  adminUpdateCategoryImageSchema,
  adminUpdateBrandLogoSchema,
  adminUpdateBannersPayloadSchema,
  type AdminCreateProductInput,
  type AdminUpdateProductInput,
  type AdminUpdateCategoryImageInput,
  type AdminUpdateBrandLogoInput,
  type AdminUpdateBannersPayload,
} from "./schemas";
import {
  createAdminProduct,
  updateAdminProduct,
  publishAdminProduct,
  deleteAdminProduct,
  getAdminProducts,
  getAdminProductById,
  getAdminCategories,
  getAdminCategoryById,
  createAdminCategory,
  createAdminSubcategory,
  type AdminCreateSubcategoryInput,
  updateAdminCategoryImage,
  getAdminBrands,
  getAdminBrandById,
  createAdminBrand,
  updateAdminBrandLogo,
  getAdminBanners,
  updateAdminBanners,
  assertAdminCatalogueAccess,
  type AdminCategoryItem,
  type AdminBrandItem,
  type AdminBannerItem,
  type AdminCreateCategoryInput,
  type AdminCreateBrandInput,
} from "./service";
import {
  getCloudinaryUploadParams,
  confirmUploadProof,
  deleteCloudinaryAsset,
  type CloudinaryFolder,
  type ConfirmUploadProofInput,
} from "@/lib/cloudinary";
import { getDb } from "@/lib/db";
import { users, inventory, adminAuditLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/features/auth/service";
import { verifyPassword, hashPassword } from "@/lib/security";
import { strongPasswordSchema } from "@/features/auth/schemas";
import { ROLES, PERMISSIONS } from "@/lib/auth/rbac";

export interface AdminActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  isUnauthorized?: boolean;
}

function isAuthErrorMessage(message: string): boolean {
  return (
    message.includes("Access Denied") ||
    message.includes("Authentication required") ||
    message.includes("Insufficient permissions")
  );
}

export async function getAdminProductsAction(): Promise<AdminActionResult> {
  try {
    const products = await getAdminProducts();
    return { success: true, data: products };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load products.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

export async function createAdminProductAction(
  rawInput: AdminCreateProductInput,
  actionType: "publish" | "draft" = "publish"
): Promise<AdminActionResult> {
  try {
    const parsed = adminCreateProductSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message || "Invalid product details.",
      };
    }

    const targetStatus = actionType === "draft" ? "draft" : "active";

    // Invariant: Failed inspection on used parts must never permit active publishing
    if (
      parsed.data.condition === "used" &&
      parsed.data.inspectionStatus === "failed" &&
      targetStatus === "active"
    ) {
      return {
        success: false,
        error:
          "VALIDATION_ERROR: Cannot publish pre-owned product with failed inspection status as active. Save as draft or archived.",
      };
    }

    const res = await createAdminProduct(parsed.data, undefined, { status: targetStatus });

    revalidatePath("/admin/brands");
    revalidatePath("/admin/products");
    if (targetStatus === "active") {
      revalidatePath("/search");
      revalidatePath("/categories");
      revalidatePath("/");
    }

    return { success: true, data: res };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create product.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

export async function createAdminDraftProductAction(
  rawInput: AdminCreateProductInput
): Promise<AdminActionResult> {
  return createAdminProductAction(rawInput, "draft");
}

export async function getAdminProductByIdAction(
  id: string
): Promise<AdminActionResult> {
  try {
    if (!id || typeof id !== "string") {
      return { success: false, error: "Product ID is required." };
    }

    const product = await getAdminProductById(id);
    if (!product) {
      return { success: false, error: `Product not found with ID: ${id}` };
    }

    return { success: true, data: product };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load product details.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

export async function updateAdminProductAction(
  rawInput: AdminUpdateProductInput
): Promise<AdminActionResult> {
  try {
    const parsed = adminUpdateProductSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message || "Invalid update payload.",
      };
    }

    const res = await updateAdminProduct(parsed.data);

    revalidatePath("/admin/brands");
    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${parsed.data.id}/edit`);
    revalidatePath(`/products/${parsed.data.id}`);
    revalidatePath("/search");
    revalidatePath("/categories");
    revalidatePath("/");

    return { success: true, data: res };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update product.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

export async function publishAdminProductAction(
  id: string,
  status: "active" | "draft" | "archived" = "active"
): Promise<AdminActionResult> {
  try {
    if (!id || typeof id !== "string") {
      return { success: false, error: "Product ID is required." };
    }

    const res = await publishAdminProduct(id, status);

    revalidatePath("/admin/brands");
    revalidatePath("/admin/products");
    revalidatePath("/search");
    revalidatePath("/categories");
    revalidatePath("/");

    return { success: true, data: res };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to change product status.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

export async function deleteAdminProductAction(
  id: string
): Promise<AdminActionResult> {
  try {
    if (!id || typeof id !== "string") {
      return { success: false, error: "Product ID is required." };
    }

    const res = await deleteAdminProduct(id);

    revalidatePath("/admin/brands");
    revalidatePath("/admin/products");
    revalidatePath("/search");
    revalidatePath("/categories");
    revalidatePath("/");

    return { success: true, data: res };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete product.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

/**
 * Server Action: Generates server-signed Cloudinary upload parameters for authenticated administrators.
 * Supports dedicated folders: products, categories, brands, banners.
 */
export async function getCloudinaryUploadSignatureAction(
  folder?: CloudinaryFolder
): Promise<AdminActionResult> {
  try {
    const params = await getCloudinaryUploadParams(folder ? { folder } : undefined);
    return { success: true, data: params };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate upload signature.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

/**
 * Server Action (Stage B): Cryptographically verifies Cloudinary upload proof,
 * locks session, persists verified metadata, and issues Receipt v2 upon durable commit.
 */
export async function confirmUploadProofAction(
  rawInput: ConfirmUploadProofInput
): Promise<AdminActionResult<{ receipt: string; sessionId: string; publicId: string }>> {
  try {
    const res = await confirmUploadProof(rawInput);
    if (!res.success || !res.receipt) {
      return {
        success: false,
        error: res.error || "Failed to verify upload proof.",
      };
    }
    return {
      success: true,
      data: {
        receipt: res.receipt,
        sessionId: res.sessionId!,
        publicId: res.publicId!,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to verify upload proof.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

/**
 * Server Action: Authenticated deletion of a Cloudinary asset with optional folder isolation.
 */
export async function deleteCloudinaryAssetAction(
  publicId: string,
  allowedFolder?: string
): Promise<AdminActionResult> {
  try {
    if (!publicId || typeof publicId !== "string") {
      return { success: false, error: "Public ID is required." };
    }

    const res = await deleteCloudinaryAsset(
      publicId,
      allowedFolder ? { allowedFolder } : undefined
    );
    if (!res.success) {
      return { success: false, error: res.error || "Failed to delete Cloudinary asset." };
    }

    return { success: true, data: res };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete asset.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

// ==============================================================================
// Phase C3 Actions: Categories, Brands & Promotional Banners
// ==============================================================================

export async function getAdminCategoriesAction(): Promise<AdminActionResult<AdminCategoryItem[]>> {
  try {
    const data = await getAdminCategories();
    return { success: true, data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load categories.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

export async function getAdminCategoryByIdAction(
  id: string
): Promise<AdminActionResult<AdminCategoryItem | null>> {
  try {
    const data = await getAdminCategoryById(id);
    return { success: true, data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load category.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

export async function updateAdminCategoryImageAction(
  input: AdminUpdateCategoryImageInput
): Promise<AdminActionResult> {
  try {
    const parsed = adminUpdateCategoryImageSchema.safeParse(input);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Validation failed";
      return { success: false, error: firstError };
    }

    const result = await updateAdminCategoryImage(parsed.data);

    revalidatePath("/admin/categories");
    revalidatePath("/categories");
    revalidatePath("/");

    return { success: true, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update category image.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

export async function createAdminCategoryAction(
  input: AdminCreateCategoryInput
): Promise<AdminActionResult<{ category: AdminCategoryItem }>> {
  try {
    const result = await createAdminCategory(input);

    revalidatePath("/admin/categories");
    revalidatePath("/categories");
    revalidatePath("/");

    return { success: true, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create category.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

export async function createAdminSubcategoryAction(
  input: AdminCreateSubcategoryInput
): Promise<AdminActionResult<{ name: string; slug: string; categorySlug: string }>> {
  try {
    const result = await createAdminSubcategory(input);

    revalidatePath("/admin/brands");
    revalidatePath("/categories");
    revalidatePath(`/categories/${input.categorySlug}`);
    revalidatePath("/");

    return { success: true, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create subcategory.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

export async function getAdminBrandsAction(): Promise<AdminActionResult<AdminBrandItem[]>> {
  try {
    const data = await getAdminBrands();
    return { success: true, data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load brands.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

export async function getAdminBrandByIdAction(
  id: string
): Promise<AdminActionResult<AdminBrandItem | null>> {
  try {
    const data = await getAdminBrandById(id);
    return { success: true, data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load brand.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

export async function updateAdminBrandLogoAction(
  input: AdminUpdateBrandLogoInput
): Promise<AdminActionResult> {
  try {
    const parsed = adminUpdateBrandLogoSchema.safeParse(input);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Validation failed";
      return { success: false, error: firstError };
    }

    const result = await updateAdminBrandLogo(parsed.data);

    revalidatePath("/admin/brands");
    revalidatePath("/");

    return { success: true, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update brand logo.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

export async function createAdminBrandAction(
  input: AdminCreateBrandInput
): Promise<AdminActionResult<{ brand: AdminBrandItem }>> {
  try {
    const result = await createAdminBrand(input);

    revalidatePath("/admin/brands");
    revalidatePath("/");

    return { success: true, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create brand.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

export async function getAdminBannersAction(): Promise<AdminActionResult<AdminBannerItem[]>> {
  try {
    const data = await getAdminBanners();
    return { success: true, data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load banners.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

export async function updateAdminBannersAction(
  input: AdminUpdateBannersPayload
): Promise<AdminActionResult> {
  try {
    const parsed = adminUpdateBannersPayloadSchema.safeParse(input);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Validation failed";
      return { success: false, error: firstError };
    }

    const result = await updateAdminBanners(parsed.data);

    revalidatePath("/");

    return { success: true, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update promotional banners.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

export async function updateInventoryStockAction(input: {
  productId: string;
  quantityOnHand: number;
}): Promise<AdminActionResult<{ productId: string; quantityOnHand: number }>> {
  try {
    const user = await assertAdminCatalogueAccess(PERMISSIONS.CATALOGUE_WRITE);
    if (
      !input.productId ||
      typeof input.quantityOnHand !== "number" ||
      input.quantityOnHand < 0 ||
      !Number.isInteger(input.quantityOnHand)
    ) {
      return { success: false, error: "Stock quantity must be a non-negative integer." };
    }

    const db = getDb();
    if (!db) {
      return { success: false, error: "Database connection is not configured." };
    }

    const existingInv = await db
      .select({ id: inventory.id })
      .from(inventory)
      .where(eq(inventory.productId, input.productId))
      .limit(1);

    if (existingInv.length > 0) {
      await db
        .update(inventory)
        .set({ quantityOnHand: input.quantityOnHand, updatedAt: new Date() })
        .where(eq(inventory.productId, input.productId));
    } else {
      await db.insert(inventory).values({
        productId: input.productId,
        quantityOnHand: input.quantityOnHand,
      });
    }

    // Write audit log
    try {
      await db.insert(adminAuditLogs).values({
        actorUserId: user.id,
        action: "inventory:update_stock",
        entityType: "product",
        entityId: input.productId,
        metadata: { newStock: input.quantityOnHand },
      });
    } catch {
      // Non-fatal audit log failure
    }

    revalidatePath("/admin/inventory");
    revalidatePath("/admin");
    revalidatePath("/admin/products");

    return {
      success: true,
      data: { productId: input.productId, quantityOnHand: input.quantityOnHand },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update stock quantity.";
    return {
      success: false,
      error: message,
      isUnauthorized: isAuthErrorMessage(message),
    };
  }
}

export async function adminChangePasswordAction(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<AdminActionResult<{ success: boolean }>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.roles.includes(ROLES.CUSTOMER)) {
      return {
        success: false,
        error: "Unauthorized: Active administrator authentication is required.",
        isUnauthorized: true,
      };
    }

    if (!input.currentPassword) {
      return { success: false, error: "Current password is required." };
    }

    if (input.newPassword !== input.confirmPassword) {
      return { success: false, error: "New password and confirmation do not match." };
    }

    const passwordValidation = strongPasswordSchema.safeParse(input.newPassword);
    if (!passwordValidation.success) {
      return {
        success: false,
        error: passwordValidation.error.errors[0]?.message || "Password does not meet complexity requirements.",
      };
    }

    const db = getDb();
    if (!db) {
      return { success: false, error: "Database connection is not configured." };
    }

    const userRecord = await db.query.users.findFirst({
      where: eq(users.id, currentUser.id),
    });

    if (!userRecord) {
      return { success: false, error: "Administrator account record not found." };
    }

    const isMatch = await verifyPassword(input.currentPassword, userRecord.passwordHash);
    if (!isMatch) {
      return { success: false, error: "Current password is incorrect." };
    }

    const newHash = await hashPassword(input.newPassword);

    await db
      .update(users)
      .set({
        passwordHash: newHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, currentUser.id));

    // Audit log
    try {
      await db.insert(adminAuditLogs).values({
        actorUserId: currentUser.id,
        action: "admin:password_change",
        entityType: "user",
        entityId: currentUser.id,
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch {
      // Non-fatal
    }

    return { success: true, data: { success: true } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update administrator password.";
    return {
      success: false,
      error: message,
    };
  }
}
