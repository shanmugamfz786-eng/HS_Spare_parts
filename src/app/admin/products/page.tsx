import React from "react";
import Link from "next/link";
import { Plus, ShieldCheck } from "lucide-react";
import { getAdminProducts, type AdminProductListItem } from "@/features/admin/service";
import { getCurrentAdminUser } from "@/features/auth/service";
import { ROLES, PERMISSIONS, hasRole, hasPermission } from "@/lib/auth/rbac";
import { AdminAccessDenied } from "@/components/admin/admin-access-denied";
import { AdminProductsClient } from "@/components/admin/admin-products-client";

export const metadata = {
  title: "Admin Catalogue Management — HS Spare Parts",
  description: "Administrator console for managing new and pre-owned spare parts catalogue.",
};

export default async function AdminProductsPage() {
  const currentUser = await getCurrentAdminUser();

  const isAuthorized =
    currentUser &&
    !currentUser.roles.includes(ROLES.CUSTOMER) &&
    (hasRole(currentUser.roles, [
      ROLES.ADMINISTRATOR,
      ROLES.SUPER_ADMINISTRATOR,
      ROLES.CATALOGUE_MANAGER,
    ]) || hasPermission(currentUser.permissions, PERMISSIONS.CATALOGUE_READ));

  if (!isAuthorized) {
    return <AdminAccessDenied />;
  }

  let products: AdminProductListItem[] = [];
  let errorMsg: string | null = null;

  try {
    products = await getAdminProducts();
  } catch (err: unknown) {
    errorMsg = err instanceof Error ? err.message : "Access restricted.";
  }

  const policyNotice = (
    <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-950 flex items-start gap-3">
      <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
      <div className="space-y-0.5">
        <span className="font-bold block text-sm">
          Admin-Managed Storefront Policy
        </span>
        <p className="text-blue-900 leading-relaxed">
          Only authorized administrators and catalogue managers may add, edit, or publish catalogue products. Customers browse and purchase available products only; customer listings, seller registration, and vendor dashboards are disabled.
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-xl font-black text-gray-900">
            Product Catalogue Management
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage spare parts catalogue, conditions (new/used), pricing, and Cloudinary galleries.
          </p>
        </div>

        <Link
          href="/admin/products/new"
          className="btn-primary py-2.5 px-4 text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Product</span>
        </Link>
      </div>

      <AdminProductsClient
        initialProducts={products}
        policyNotice={policyNotice}
        errorMsg={errorMsg}
      />
    </div>
  );
}
