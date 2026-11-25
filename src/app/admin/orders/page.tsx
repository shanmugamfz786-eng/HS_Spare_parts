import React from "react";
import Link from "next/link";
import {
  Package,
  Truck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ShieldCheck,
  Ban,
  Search,
  X,
  CreditCard,
} from "lucide-react";
import { getCurrentAdminUser } from "@/features/auth/service";
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
  const currentUser = await getCurrentAdminUser();

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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">
            Orders & Fulfillment Console
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage customer orders, verify payment capture, and record carrier dispatch tracking.
          </p>
        </div>

        <span className="px-3 py-1.5 rounded-xl bg-gray-100 border border-gray-200 text-xs text-gray-700 font-mono flex items-center gap-2 self-start sm:self-auto font-semibold">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>RBAC Dispatch Lock Active</span>
        </span>
      </div>

      <div className="space-y-6">
        {/* Policy Notice Banner */}
        <div className="p-4 rounded-2xl bg-white border border-gray-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 text-ember flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                Fulfillment Management Architecture
              </h2>
              <p className="text-xs text-gray-600 mt-0.5 max-w-3xl leading-relaxed">
                Courier integrations are provider-independent. Authorized staff can record carrier dispatch and tracking references manually. <strong>Strict Policy:</strong> Orders must have verified payment capture (<code className="bg-gray-100 px-1 py-0.5 rounded text-[11px] font-mono">succeeded</code>) before carrier dispatch is unlocked.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 font-medium whitespace-nowrap bg-gray-50 px-3.5 py-2 rounded-xl border border-gray-200">
            <span>Dispatch Mode:</span>
            <span className="font-bold text-gray-900">Manual Multi-Carrier</span>
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center gap-3 text-xs">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <p className="font-semibold">{errorMsg}</p>
          </div>
        )}

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Link
            href="/admin/orders"
            className={`p-4 rounded-2xl border text-left transition-all ${
              currentTab === "all"
                ? "bg-white border-gray-900 shadow-sm ring-1 ring-gray-900"
                : "bg-white border-gray-200 hover:border-gray-300 shadow-2xs"
            }`}
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Total Orders</span>
              <Package className="w-4 h-4 text-gray-400" />
            </div>
            <div className="text-2xl font-black text-gray-900 mt-2">{totalCount}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">All transactions</div>
          </Link>

          <Link
            href="/admin/orders?status=awaiting_dispatch"
            className={`p-4 rounded-2xl border text-left transition-all ${
              currentTab === "awaiting_dispatch"
                ? "bg-white border-ember shadow-sm ring-1 ring-ember"
                : "bg-white border-gray-200 hover:border-gray-300 shadow-2xs"
            }`}
          >
            <div className="flex items-center justify-between text-ember">
              <span className="text-[11px] font-bold uppercase tracking-wider">Awaiting Dispatch</span>
              <Truck className="w-4 h-4 text-ember" />
            </div>
            <div className="text-2xl font-black text-ember mt-2">{awaitingDispatchCount}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">Paid & ready to ship</div>
          </Link>

          <Link
            href="/admin/orders?status=unpaid"
            className={`p-4 rounded-2xl border text-left transition-all ${
              currentTab === "unpaid"
                ? "bg-white border-amber-500 shadow-sm ring-1 ring-amber-500"
                : "bg-white border-gray-200 hover:border-gray-300 shadow-2xs"
            }`}
          >
            <div className="flex items-center justify-between text-amber-600">
              <span className="text-[11px] font-bold uppercase tracking-wider">Dispatch Blocked</span>
              <Ban className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-black text-amber-600 mt-2">{unpaidCount}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">Unpaid / pending payment</div>
          </Link>

          <Link
            href="/admin/orders?status=shipped"
            className={`p-4 rounded-2xl border text-left transition-all ${
              currentTab === "shipped"
                ? "bg-white border-emerald-600 shadow-sm ring-1 ring-emerald-600"
                : "bg-white border-gray-200 hover:border-gray-300 shadow-2xs"
            }`}
          >
            <div className="flex items-center justify-between text-emerald-600">
              <span className="text-[11px] font-bold uppercase tracking-wider">Dispatched</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-emerald-600 mt-2">{shippedCount}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">In transit or delivered</div>
          </Link>
        </div>

        {/* Tab Filters and Search */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 md:pb-0">
              <Link
                href="/admin/orders"
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                  currentTab === "all"
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                }`}
              >
                All Orders ({totalCount})
              </Link>
              <Link
                href="/admin/orders?status=awaiting_dispatch"
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                  currentTab === "awaiting_dispatch"
                    ? "bg-ember text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                }`}
              >
                Awaiting Dispatch ({awaitingDispatchCount})
              </Link>
              <Link
                href="/admin/orders?status=unpaid"
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                  currentTab === "unpaid"
                    ? "bg-amber-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                }`}
              >
                Unpaid / Blocked ({unpaidCount})
              </Link>
              <Link
                href="/admin/orders?status=shipped"
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                  currentTab === "shipped"
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                }`}
              >
                Dispatched ({shippedCount})
              </Link>
            </div>

            {/* Quick search input */}
            <form method="GET" action="/admin/orders" className="relative w-full md:w-72">
              {currentTab !== "all" && <input type="hidden" name="status" value={currentTab} />}
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                name="q"
                defaultValue={params.q || ""}
                placeholder="Search order # or customer..."
                className="w-full pl-9 pr-8 py-1.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:border-ember bg-[#F8F9FA]"
              />
              {params.q && (
                <Link
                  href={currentTab === "all" ? "/admin/orders" : `/admin/orders?status=${currentTab}`}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                >
                  <X className="w-3.5 h-3.5" />
                </Link>
              )}
            </form>
          </div>

          {/* Orders Table */}
          {displayedOrders.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
                <Package className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-gray-900">No orders found in this view</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                {currentTab === "awaiting_dispatch"
                  ? "All verified orders have been dispatched. There are currently no pending orders awaiting carrier dispatch."
                  : currentTab === "unpaid"
                  ? "There are no unpaid orders pending payment capture."
                  : "No orders match the selected filter or search query."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#F8F9FA] border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4 sm:px-6">Order Reference</th>
                    <th className="py-3.5 px-4">Date Placed</th>
                    <th className="py-3.5 px-4">Customer</th>
                    <th className="py-3.5 px-4 text-center">Items</th>
                    <th className="py-3.5 px-4 text-right">Total Amount</th>
                    <th className="py-3.5 px-4 text-center">Payment Status</th>
                    <th className="py-3.5 px-4 text-center">Fulfillment</th>
                    <th className="py-3.5 px-4 text-center">Dispatch Status</th>
                    <th className="py-3.5 px-4 sm:px-6 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayedOrders.map((ord) => {
                    const isPaid = ord.paymentStatus === "succeeded";
                    return (
                      <tr key={ord.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="py-4 px-4 sm:px-6 font-mono font-bold text-gray-900">
                          <Link
                            href={`/admin/orders/${ord.id}`}
                            className="hover:text-ember transition-colors"
                          >
                            {ord.orderNumber}
                          </Link>
                        </td>
                        <td className="py-4 px-4 text-gray-500 whitespace-nowrap font-mono text-[11px]">
                          {new Date(ord.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="py-4 px-4">
                          <div className="font-semibold text-gray-900">{ord.customerName}</div>
                          {ord.customerEmail && (
                            <div className="text-[11px] text-gray-400 font-mono truncate max-w-[170px]">
                              {ord.customerEmail}
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center text-gray-600 font-medium">
                          {ord.itemsCount} {ord.itemsCount === 1 ? "part" : "parts"}
                        </td>
                        <td className="py-4 px-4 text-right font-black text-gray-900 whitespace-nowrap font-mono">
                          {formatMoney(ord.totalAmount * 100, ord.currency)}
                        </td>
                        <td className="py-4 px-4 text-center whitespace-nowrap">
                          {isPaid ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                              <span>Paid</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              <span className="capitalize">{ord.paymentStatus}</span>
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-gray-100 text-gray-800 capitalize border border-gray-200">
                            {ord.fulfillmentStatus.replace("_", " ")}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center whitespace-nowrap">
                          {ord.isDispatchEligible ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-50 text-ember border border-orange-200">
                              <Truck className="w-3 h-3" />
                              <span>Ready to Dispatch</span>
                            </span>
                          ) : ord.fulfillmentStatus === "shipped" ||
                            ord.fulfillmentStatus === "delivered" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Dispatched</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                              <Ban className="w-3 h-3" />
                              <span>Locked (Unpaid)</span>
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 sm:px-6 text-right whitespace-nowrap">
                          <Link
                            href={`/admin/orders/${ord.id}`}
                            className="inline-flex items-center gap-1 text-xs font-bold text-ember hover:text-ember/80 transition-colors bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-xl border border-orange-200 shadow-2xs"
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
