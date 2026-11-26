import React from "react";
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

  const [brands, categories, products] = await Promise.all([
    getAdminBrands(),
    getAdminCategories(),
    getAdminProducts(),
  ]);

  return (
    <div className="space-y-6">
      <AdminBrandsClient
        initialBrands={brands}
        initialCategories={categories}
        initialProducts={products}
      />
    </div>
  );
}
