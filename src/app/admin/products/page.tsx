import React from "react";
import Link from "next/link";
import { Plus, ShieldCheck, Tag, Box, AlertTriangle, ArrowLeft, HelpCircle } from "lucide-react";
import { getAdminProducts, type AdminProductListItem } from "@/features/admin/service";
import { getCurrentUser } from "@/features/auth/service";
import { ROLES, PERMISSIONS, hasRole, hasPermission } from "@/lib/auth/rbac";
import { formatMoney } from "@/lib/money";
import { AdminAccessDenied } from "@/components/admin/admin-access-denied";

export const metadata = {
  title: "Admin Catalogue Management — HS Spare Parts",
  description: "Administrator console for managing new and pre-owned spare parts catalogue.",
};

export default async function AdminProductsPage() {
  const currentUser = await getCurrentUser();

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

  const newCount = products.filter((p) => p.condition === "new").length;
  const usedCount = products.filter((p) => p.condition === "used").length;
  const unclassifiedCount = products.filter((p) => p.condition === "unclassified").length;

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-gray-900 pb-16">
      {/* Top Admin Nav Header */}
      <div className="bg-[#090D18] text-white border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Link
                  href="/"
                  className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Return to Storefront</span>
                </Link>
                <span className="text-gray-600">•</span>
                <span className="text-xs font-bold text-ember uppercase tracking-wider">
                  Admin Console
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Product Catalogue Management
              </h1>
            </div>

            <Link
              href="/admin/products/new"
              className="btn-primary py-2.5 px-4 text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-ember/20 hover:shadow-ember/30 self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Product</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Strict Admin-Managed Store Notice */}
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 text-xs text-blue-950 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold block text-sm">
              Admin-Managed Storefront Policy
            </span>
            <p className="text-blue-900">
              Only authorized administrators and catalogue managers may add, edit, or publish catalogue products. Customers browse and purchase available products only; customer listings, seller registration, and vendor dashboards are disabled.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Condition Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-white border border-gray-200/90 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold block mb-1">
                Total Products
              </span>
              <span className="text-2xl font-black text-gray-900">
                {products.length}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-700">
              <Box className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-gray-200/90 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-emerald-700 uppercase tracking-wider font-semibold block mb-1">
                New Spare Parts
              </span>
              <span className="text-2xl font-black text-emerald-900">
                {newCount}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <Tag className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-gray-200/90 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-amber-700 uppercase tracking-wider font-semibold block mb-1">
                Pre-Owned Spare Parts
              </span>
              <span className="text-2xl font-black text-amber-900">
                {usedCount}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
              <Tag className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-gray-200/90 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold block mb-1">
                Unclassified
              </span>
              <span className="text-2xl font-black text-gray-700">
                {unclassifiedCount}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500">
              <HelpCircle className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Product Table */}
        <div className="bg-white rounded-2xl border border-gray-200/90 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">Catalogue Listings</h2>
              <p className="text-xs text-gray-500">
                Managed items with distinct condition metadata and transparency disclosures.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4 font-bold">Product Name &amp; SKU</th>
                  <th className="py-3 px-4 font-bold">Condition</th>
                  <th className="py-3 px-4 font-bold">Category</th>
                  <th className="py-3 px-4 font-bold">Brand</th>
                  <th className="py-3 px-4 font-bold">Price (₹)</th>
                  <th className="py-3 px-4 font-bold">Condition Notes</th>
                  <th className="py-3 px-4 font-bold text-right">Storefront</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-gray-900 max-w-xs truncate">{p.name}</div>
                      <div className="font-mono text-[10px] text-gray-400">SKU: {p.sku}</div>
                    </td>
                    <td className="py-3 px-4">
                      {p.condition === "used" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                          <span>Pre-Owned</span>
                        </span>
                      ) : p.condition === "new" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                          <span>New</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600 border border-gray-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                          <span>Unclassified</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-600">{p.categoryName}</td>
                    <td className="py-3 px-4 text-gray-600 font-semibold">{p.brandName}</td>
                    <td className="py-3 px-4 font-bold text-gray-900">
                      {formatMoney(p.priceMinor)}
                    </td>
                    <td className="py-3 px-4 text-gray-500 max-w-xs truncate text-[11px]">
                      {p.conditionNotes || "—"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/products/${p.id}`}
                        className="text-ember hover:underline font-semibold"
                        target="_blank"
                      >
                        View &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
