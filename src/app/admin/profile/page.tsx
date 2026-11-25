import React from "react";
import { getCurrentAdminUser } from "@/features/auth/service";
import { ROLES, hasRole, hasPermission, PERMISSIONS } from "@/lib/auth/rbac";
import { AdminAccessDenied } from "@/components/admin/admin-access-denied";
import { AdminProfileClient } from "@/components/admin/admin-profile-client";

export const metadata = {
  title: "Admin Profile & Security — HS Spare Parts Admin",
  description: "View administrator account details and manage cryptographic credentials.",
};

export default async function AdminProfilePage() {
  const currentUser = await getCurrentAdminUser();

  const isAuthorized =
    currentUser &&
    !currentUser.roles.includes(ROLES.CUSTOMER) &&
    (hasRole(currentUser.roles, [
      ROLES.ADMINISTRATOR,
      ROLES.SUPER_ADMINISTRATOR,
      ROLES.CATALOGUE_MANAGER,
      ROLES.ORDER_MANAGER,
    ]) || hasPermission(currentUser.permissions, PERMISSIONS.CATALOGUE_READ));

  if (!isAuthorized) {
    return <AdminAccessDenied />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
        <div>
          <h1 className="text-xl font-black text-gray-900">Administrator Profile & Security</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage your executive profile, review assigned authorization roles, and update credentials.
          </p>
        </div>
      </div>

      <AdminProfileClient
        user={{
          id: currentUser.id,
          email: currentUser.email,
          name: currentUser.name,
          phone: currentUser.phone,
          status: currentUser.status,
          roles: currentUser.roles,
          createdAt: currentUser.createdAt,
        }}
      />
    </div>
  );
}
