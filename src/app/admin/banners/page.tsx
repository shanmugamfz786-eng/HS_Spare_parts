import React from "react";
import { Sparkles, ShieldCheck } from "lucide-react";
import { getAdminBanners } from "@/features/admin/service";
import { getCurrentAdminUser } from "@/features/auth/service";
import { ROLES, PERMISSIONS, hasRole, hasPermission } from "@/lib/auth/rbac";
import { AdminAccessDenied } from "@/components/admin/admin-access-denied";
import { AdminBannersClient } from "@/components/admin/admin-banners-client";

export const metadata = {
  title: "Admin Promotional Banners — HS Spare Parts",
  description: "Administrator console for managing homepage and promotional campaign banners.",
};

export default async function AdminBannersPage() {
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

  const banners = await getAdminBanners();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-ember" />
            <span>Storefront Promotional Banners</span>
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage responsive desktop and mobile promotional hero banners published on the public storefront.
          </p>
        </div>

        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full self-start sm:self-auto">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Folder: hs-spare-parts/banners</span>
        </span>
      </div>

      <AdminBannersClient initialBanners={banners} />
    </div>
  );
}
