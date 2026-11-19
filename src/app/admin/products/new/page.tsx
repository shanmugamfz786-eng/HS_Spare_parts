import React from "react";
import { getCurrentUser } from "@/features/auth/service";
import { ROLES, PERMISSIONS, hasRole, hasPermission } from "@/lib/auth/rbac";
import { AdminAccessDenied } from "@/components/admin/admin-access-denied";
import { AdminNewProductForm } from "@/components/admin/admin-new-product-form";

export const metadata = {
  title: "Add Product — Admin Console — HS Spare Parts",
  description: "Register a new spare part listing with explicit condition classification.",
};

export default async function AdminNewProductPage() {
  const currentUser = await getCurrentUser();

  const isAuthorized =
    currentUser &&
    !currentUser.roles.includes(ROLES.CUSTOMER) &&
    (hasRole(currentUser.roles, [
      ROLES.ADMINISTRATOR,
      ROLES.SUPER_ADMINISTRATOR,
      ROLES.CATALOGUE_MANAGER,
    ]) || hasPermission(currentUser.permissions, PERMISSIONS.CATALOGUE_WRITE));

  if (!isAuthorized) {
    return <AdminAccessDenied />;
  }

  return <AdminNewProductForm />;
}
