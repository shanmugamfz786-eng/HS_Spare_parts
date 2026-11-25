import React from "react";
import { notFound } from "next/navigation";
import { getCurrentAdminUser } from "@/features/auth/service";
import { ROLES, PERMISSIONS, hasRole, hasPermission } from "@/lib/auth/rbac";
import { AdminAccessDenied } from "@/components/admin/admin-access-denied";
import { getAdminProductById } from "@/features/admin/service";
import { AdminEditProductForm } from "@/components/admin/admin-edit-product-form";

export const metadata = {
  title: "Edit Product — Admin Console — HS Spare Parts",
  description: "Modify spare part specifications, condition disclosures, and image gallery.",
};

interface AdminEditProductPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function AdminEditProductPage({ params }: AdminEditProductPageProps) {
  const { id } = await params;
  const currentUser = await getCurrentAdminUser();

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

  const product = await getAdminProductById(id, currentUser);
  if (!product) {
    notFound();
  }

  return <AdminEditProductForm initialProduct={product} />;
}
