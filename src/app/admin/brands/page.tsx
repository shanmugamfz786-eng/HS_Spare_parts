import React from "react";
import { Car, ShieldCheck } from "lucide-react";
import { getAdminBrands, getAdminCategories, getAdminProducts } from "@/features/admin/service";
import { getCurrentAdminUser } from "@/features/auth/service";
import { ROLES, PERMISSIONS, hasRole, hasPermission } from "@/lib/auth/rbac";
import { AdminAccessDenied } from "@/components/admin/admin-access-denied";
import { AdminBrandsClient } from "@/components/admin/admin-brands-client";

export const metadata = {
  title: "Admin Brands & Catalogue Explorer — HS Spare Parts",
  description: "Administrator console for managing brands, exploring categories and spare parts by brand, and managing brand logos.",
};

export default async function AdminBrandsPage() {
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

  const brands = await getAdminBrands();
  const categories = await getAdminCategories();
  const products = await getAdminProducts();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <Car className="w-5 h-5 text-ember" />
            <span>Brands & Category Explorer</span>
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Select a car or parts brand to view its categories, inspect mapped spare parts, and upload missing components directly.
          </p>
        </div>

        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full self-start sm:self-auto">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Folder: hs-spare-parts/brands</span>
        </span>
      </div>

      <AdminBrandsClient
        initialBrands={brands}
        initialCategories={categories}
        initialProducts={products}
      />
    </div>
  );
}
