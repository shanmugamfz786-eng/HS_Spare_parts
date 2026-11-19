import React from "react";
import Link from "next/link";
import {
  Package,
  Truck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  Ban,
} from "lucide-react";
import { getCurrentUser } from "@/features/auth/service";
import { ROLES, PERMISSIONS, hasRole, hasPermission } from "@/lib/auth/rbac";
import { formatMoney } from "@/lib/money";
import { AdminAccessDenied } from "@/components/admin/admin-access-denied";
import { defaultDrizzleFulfillmentStore } from "@/features/fulfillment/service";
import type { AdminOrderListItemDTO } from "@/features/fulfillment/types";

export const metadata = {
  title: "Admin Orders & Fulfillment — HS Spare Parts",
  description: "Fulfillment console for managing orders, verifying payment, and recording carrier dispatch.",
};

interface AdminOrdersPageProps {
  searchParams: Promise<{
    status?: "all" | "awaiting_dispatch" | "unpaid" | "shipped";
    q?: string;
  }>;
}

export default async function AdminOrdersPage({ searchParams }: AdminOrdersPageProps) {
  const params = await searchParams;
  const currentTab = params.status || "all";
  const currentUser = await getCurrentUser();

  const isAuthorized =
    currentUser &&
    !currentUser.roles.includes(ROLES.CUSTOMER) &&
    (hasRole(currentUser.roles, [
      ROLES.ADMINISTRATOR,
      ROLES.SUPER_ADMINISTRATOR,
      ROLES.ORDER_MANAGER,
    ]) || hasPermission(currentUser.permissions, PERMISSIONS.ORDERS_MANAGE));

  if (!isAuthorized) {
    return (
      <AdminAccessDenied
        title="403 — Fulfillment Management Access Required"
        message="This area is restricted to authorized store administrators and order managers. Regular customer accounts and unauthenticated visitors cannot inspect orders or perform fulfillment actions."
      />
    );
  }

  let allOrders: AdminOrderListItemDTO[] = [];
  let errorMsg: string | null = null;

  try {
    allOrders = await defaultDrizzleFulfillmentStore.getAdminOrders({ status: "all" });
  } catch (err: unknown) {
    errorMsg = err instanceof Error ? err.message : "Failed to load orders.";
  }

  // Summary Metrics
  const totalCount = allOrders.length;
  const awaitingDispatchCount = allOrders.filter(
    (o) =>
      o.paymentStatus === "succeeded" &&
      ["pending", "confirmed", "processing", "packed"].includes(o.fulfillmentStatus)
  ).length;
  const unpaidCount = allOrders.filter((o) => o.paymentStatus !== "succeeded").length;
  const shippedCount = allOrders.filter(
    (o) => o.fulfillmentStatus === "shipped" || o.fulfillmentStatus === "delivered"
  ).length;

  // Filter orders by active tab
  let displayedOrders = allOrders;
  if (currentTab === "awaiting_dispatch") {
    displayedOrders = allOrders.filter(
      (o) =>
        o.paymentStatus === "succeeded" &&
        ["pending", "confirmed", "processing", "packed"].includes(o.fulfillmentStatus)
    );
  } else if (currentTab === "unpaid") {
    displayedOrders = allOrders.filter((o) => o.paymentStatus !== "succeeded");
  } else if (currentTab === "shipped") {
    displayedOrders = allOrders.filter(
      (o) => o.fulfillmentStatus === "shipped" || o.fulfillmentStatus === "delivered"
    );
  }

  // Filter by search query if present
  if (params.q && params.q.trim()) {
    const query = params.q.trim().toLowerCase();
    displayedOrders = displayedOrders.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(query) ||
        o.customerName.toLowerCase().includes(query) ||
        (o.customerEmail && o.customerEmail.toLowerCase().includes(query))
    );
  }

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
                <Link
                  href="/admin/products"
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Catalogue Console
                </Link>
                <span className="text-gray-600">•</span>
                <span className="text-xs font-bold text-ember uppercase tracking-wider">
                  Orders & Fulfillment
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Orders & Fulfillment Console
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <span className="px-3 py-1.5 rounded-xl bg-gray-800 border border-gray-700 text-xs text-gray-300 font-mono flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Admin RBAC Active</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Policy Notice Banner */}
        <div className="p-4 rounded-2xl bg-white border border-gray-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-ember/10 border border-ember/20 text-ember flex items-center justify-center flex-shrink-0 mt-0.5">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                Fulfillment Management Architecture
              </h2>
              <p className="text-xs text-gray-600 mt-0.5 max-w-3xl leading-relaxed">
                Courier integrations are provider-independent. Authorized staff can record carrier dispatch and tracking references manually. <strong>Strict Requirement:</strong> Orders must have verified payment capture (<code>succeeded</code>) before carrier dispatch is unlocked.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 font-medium whitespace-nowrap bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
            <span>Provider Gateway:</span>
            <span className="font-semibold text-gray-900">Manual Dispatch Recording</span>
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center gap-3 text-xs">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <p>{errorMsg}</p>
          </div>
        )}

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/admin/orders"
            className={`p-5 rounded-2xl border transition-all ${
              currentTab === "all"
                ? "bg-white border-gray-900 shadow-md ring-1 ring-gray-900"
                : "bg-white border-gray-200 hover:border-gray-300 shadow-sm"
            }`}
          >
            <div className="flex items-center justify-between text-gray-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Total Orders</span>
              <Package className="w-4 h-4 text-gray-400" />
            </div>
            <div className="text-2xl font-black text-gray-900">{totalCount}</div>
            <div className="text-[11px] text-gray-500 mt-1">All recorded transactions</div>
          </Link>

          <Link
            href="/admin/orders?status=awaiting_dispatch"
            className={`p-5 rounded-2xl border transition-all ${
              currentTab === "awaiting_dispatch"
                ? "bg-white border-ember shadow-md ring-1 ring-ember"
                : "bg-white border-gray-200 hover:border-gray-300 shadow-sm"
            }`}
          >
            <div className="flex items-center justify-between text-ember mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Awaiting Dispatch</span>
              <Truck className="w-4 h-4 text-ember" />
            </div>
            <div className="text-2xl font-black text-ember">{awaitingDispatchCount}</div>
            <div className="text-[11px] text-gray-500 mt-1">Paid & ready for courier dispatch</div>
          </Link>

          <Link
            href="/admin/orders?status=unpaid"
            className={`p-5 rounded-2xl border transition-all ${
              currentTab === "unpaid"
                ? "bg-white border-amber-500 shadow-md ring-1 ring-amber-500"
                : "bg-white border-gray-200 hover:border-gray-300 shadow-sm"
            }`}
          >
            <div className="flex items-center justify-between text-amber-600 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Dispatch Blocked</span>
              <Ban className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-black text-amber-600">{unpaidCount}</div>
            <div className="text-[11px] text-gray-500 mt-1">Unpaid / pending payment capture</div>
          </Link>

          <Link
            href="/admin/orders?status=shipped"
            className={`p-5 rounded-2xl border transition-all ${
              currentTab === "shipped"
                ? "bg-white border-emerald-600 shadow-md ring-1 ring-emerald-600"
                : "bg-white border-gray-200 hover:border-gray-300 shadow-sm"
            }`}
          >
            <div className="flex items-center justify-between text-emerald-600 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Dispatched / Completed</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-emerald-600">{shippedCount}</div>
            <div className="text-[11px] text-gray-500 mt-1">In transit or successfully delivered</div>
          </Link>
        </div>

        {/* Tab Filters */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
              <Link
                href="/admin/orders"
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                  currentTab === "all"
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                }`}
              >
                All Orders ({totalCount})
              </Link>
              <Link
                href="/admin/orders?status=awaiting_dispatch"
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                  currentTab === "awaiting_dispatch"
                    ? "bg-ember text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                }`}
              >
                Awaiting Dispatch ({awaitingDispatchCount})
              </Link>
              <Link
                href="/admin/orders?status=unpaid"
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                  currentTab === "unpaid"
                    ? "bg-amber-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                }`}
              >
                Unpaid / Blocked ({unpaidCount})
              </Link>
              <Link
                href="/admin/orders?status=shipped"
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                  currentTab === "shipped"
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                }`}
              >
                Dispatched ({shippedCount})
              </Link>
            </div>

            <div className="text-xs text-gray-500 font-medium">
              Showing {displayedOrders.length} {displayedOrders.length === 1 ? "order" : "orders"}
            </div>
          </div>

          {/* Orders Table */}
          {displayedOrders.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
                <Package className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-gray-900">No orders found in this view</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                {currentTab === "awaiting_dispatch"
                  ? "All verified orders have been dispatched. There are currently no pending orders awaiting carrier dispatch."
                  : currentTab === "unpaid"
                  ? "There are no unpaid orders pending payment capture."
                  : "No orders match the selected filter criteria."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-gray-50/75 border-b border-gray-100 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4 sm:px-6">Order Reference</th>
                    <th className="py-3.5 px-4">Date Placed</th>
                    <th className="py-3.5 px-4">Customer</th>
                    <th className="py-3.5 px-4">Items</th>
                    <th className="py-3.5 px-4">Total Amount</th>
                    <th className="py-3.5 px-4">Payment</th>
                    <th className="py-3.5 px-4">Fulfillment</th>
                    <th className="py-3.5 px-4">Dispatch Status</th>
                    <th className="py-3.5 px-4 sm:px-6 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayedOrders.map((ord) => {
                    const isPaid = ord.paymentStatus === "succeeded";
                    return (
                      <tr key={ord.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-4 px-4 sm:px-6 font-mono font-bold text-gray-900">
                          <Link
                            href={`/admin/orders/${ord.id}`}
                            className="hover:text-ember transition-colors"
                          >
                            {ord.orderNumber}
                          </Link>
                        </td>
                        <td className="py-4 px-4 text-gray-500 whitespace-nowrap">
                          {new Date(ord.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="py-4 px-4">
                          <div className="font-semibold text-gray-900">{ord.customerName}</div>
                          {ord.customerEmail && (
                            <div className="text-[11px] text-gray-400 truncate max-w-[160px]">
                              {ord.customerEmail}
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-4 text-gray-600 font-medium">
                          {ord.itemsCount} {ord.itemsCount === 1 ? "part" : "parts"}
                        </td>
                        <td className="py-4 px-4 font-bold text-gray-900 whitespace-nowrap">
                          {formatMoney(ord.totalAmount * 100, ord.currency)}
                        </td>
                        <td className="py-4 px-4 whitespace-nowrap">
                          {isPaid ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Paid</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock className="w-3 h-3" />
                              <span className="capitalize">{ord.paymentStatus}</span>
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-gray-100 text-gray-800 capitalize">
                            {ord.fulfillmentStatus.replace("_", " ")}
                          </span>
                        </td>
                        <td className="py-4 px-4 whitespace-nowrap">
                          {ord.isDispatchEligible ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-ember/10 text-ember border border-ember/20">
                              <Truck className="w-3 h-3" />
                              <span>Eligible</span>
                            </span>
                          ) : ord.fulfillmentStatus === "shipped" ||
                            ord.fulfillmentStatus === "delivered" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-600">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Dispatched</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-red-50 text-red-700 border border-red-200">
                              <Ban className="w-3 h-3" />
                              <span>Blocked (Unpaid)</span>
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 sm:px-6 text-right whitespace-nowrap">
                          <Link
                            href={`/admin/orders/${ord.id}`}
                            className="inline-flex items-center gap-1 text-xs font-bold text-ember hover:text-ember/80 transition-colors bg-ember/5 hover:bg-ember/10 px-3 py-1.5 rounded-lg border border-ember/20"
                          >
                            <span>Inspect & Dispatch</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
