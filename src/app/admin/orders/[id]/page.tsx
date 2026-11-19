import React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Package,
  Truck,
  MapPin,
  User,
  CreditCard,
  Clock,
  CheckCircle2,
  AlertTriangle,
  History,
  Ban,
} from "lucide-react";
import { getCurrentUser } from "@/features/auth/service";
import { ROLES, PERMISSIONS, hasRole, hasPermission } from "@/lib/auth/rbac";
import { formatMoney } from "@/lib/money";
import { AdminAccessDenied } from "@/components/admin/admin-access-denied";
import { defaultDrizzleFulfillmentStore } from "@/features/fulfillment/service";
import { AdminDispatchConsole } from "@/components/admin/admin-dispatch-console";
import type { AdminOrderDetailDTO } from "@/features/fulfillment/types";

interface AdminOrderDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export async function generateMetadata({ params }: AdminOrderDetailPageProps) {
  const { id } = await params;
  return {
    title: `Order Fulfillment ${id} — HS Spare Parts Admin`,
    description: `Fulfillment and dispatch management console for order ${id}.`,
  };
}

export default async function AdminOrderDetailPage({ params }: AdminOrderDetailPageProps) {
  const { id } = await params;
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

  let order: AdminOrderDetailDTO | null = null;
  let errorMsg: string | null = null;

  try {
    order = await defaultDrizzleFulfillmentStore.getAdminOrderDetail(id);
  } catch (err: unknown) {
    errorMsg = err instanceof Error ? err.message : "Failed to load order details.";
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-8 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-gray-900">Order Not Found</h1>
          <p className="text-xs text-gray-500">
            No order record was found with ID <code>{id}</code>. It may have been removed or does not exist.
          </p>
          <div className="pt-2">
            <Link
              href="/admin/orders"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Orders Console</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isPaid = order.paymentStatus === "succeeded";

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-gray-900 pb-16">
      {/* Top Admin Header */}
      <div className="bg-[#090D18] text-white border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Link
                  href="/admin/orders"
                  className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Orders List</span>
                </Link>
                <span className="text-gray-600">•</span>
                <span className="text-xs font-mono font-bold text-ember">
                  {order.orderNumber}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Order #{order.orderNumber}
                </h1>
                <div className="flex items-center gap-2">
                  {isPaid ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Payment Succeeded</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Payment {order.paymentStatus.toUpperCase()}</span>
                    </span>
                  )}

                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-gray-800 text-gray-300 border border-gray-700 capitalize">
                    {order.fulfillmentStatus.replace("_", " ")}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-xs text-gray-400">
              Placed on:{" "}
              <strong className="text-white">
                {new Date(order.createdAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </strong>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {errorMsg && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center gap-3 text-xs">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <p>{errorMsg}</p>
          </div>
        )}

        {/* Main 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left 2 Columns: Order Items, Shipping Info, History */}
          <div className="lg:col-span-2 space-y-6">
            {/* Order Items Card */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Package className="w-4 h-4 text-ember" />
                  <h2 className="text-sm font-bold text-gray-900">
                    Ordered Parts ({order.items.length})
                  </h2>
                </div>
                <span className="text-xs text-gray-500 font-mono">
                  Immutable Purchase Snapshot
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-gray-50/75 border-b border-gray-100 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                      <th className="py-3 px-5">Part / SKU</th>
                      <th className="py-3 px-4 text-right">Unit Price</th>
                      <th className="py-3 px-4 text-center">Qty</th>
                      <th className="py-3 px-5 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {order.items.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-3.5 px-5">
                          <div className="font-bold text-gray-900">{item.name}</div>
                          <div className="text-[11px] font-mono text-gray-400 mt-0.5">
                            SKU: {item.sku}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right text-gray-600 font-medium">
                          {formatMoney(item.unitPrice * 100, order.currency)}
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-gray-900">
                          {item.quantity}
                        </td>
                        <td className="py-3.5 px-5 text-right font-bold text-gray-900">
                          {formatMoney(item.totalPrice * 100, order.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Customer & Shipping Address Card */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center gap-2.5 border-b border-gray-100 pb-3">
                <MapPin className="w-4 h-4 text-ember" />
                <h2 className="text-sm font-bold text-gray-900">
                  Customer & Shipping Destination
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5 p-3.5 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    <span>Customer Details</span>
                  </div>
                  <div className="font-bold text-gray-900 text-sm">{order.customerName}</div>
                  {order.customerEmail && (
                    <div className="text-gray-600">{order.customerEmail}</div>
                  )}
                  {order.customerPhone && (
                    <div className="text-gray-600 font-mono">{order.customerPhone}</div>
                  )}
                </div>

                <div className="space-y-1.5 p-3.5 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5" />
                    <span>Delivery Address</span>
                  </div>
                  <div className="font-medium text-gray-800 leading-relaxed">
                    {order.shippingAddress.line1}
                    {order.shippingAddress.line2 && <>, {order.shippingAddress.line2}</>}
                    <br />
                    {order.shippingAddress.city}, {order.shippingAddress.state} —{" "}
                    <strong className="font-bold font-mono">{order.shippingAddress.pincode}</strong>
                    <br />
                    {order.shippingAddress.country || "India"}
                  </div>
                </div>
              </div>
            </div>

            {/* Audit State Transitions Card */}
            {order.statusHistory && order.statusHistory.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
                <div className="flex items-center gap-2.5 border-b border-gray-100 pb-3">
                  <History className="w-4 h-4 text-ember" />
                  <h2 className="text-sm font-bold text-gray-900">
                    Fulfillment Audit Log ({order.statusHistory.length})
                  </h2>
                </div>

                <div className="space-y-3">
                  {order.statusHistory.map((h, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 text-xs p-3 rounded-xl bg-gray-50 border border-gray-100"
                    >
                      <div className="w-2 h-2 rounded-full bg-ember mt-1.5 flex-shrink-0" />
                      <div className="flex-1 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-gray-900 capitalize">
                            Status: {h.status.replace("_", " ")}
                          </span>
                          <span className="text-[11px] text-gray-400">
                            {new Date(h.timestamp).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        {h.note && <p className="text-gray-600">{h.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Financial Summary & Carrier Dispatch Console */}
          <div className="space-y-6">
            {/* Financial Summary Card */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center gap-2.5 border-b border-gray-100 pb-3">
                <CreditCard className="w-4 h-4 text-ember" />
                <h2 className="text-sm font-bold text-gray-900">Order Financials</h2>
              </div>

              <div className="space-y-2.5 text-xs text-gray-600">
                <div className="flex justify-between">
                  <span>Parts Subtotal</span>
                  <span className="font-semibold text-gray-900">
                    {formatMoney(order.subtotalAmount * 100, order.currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Shipping Fee</span>
                  <span className="font-semibold text-gray-900">
                    {order.shippingAmount > 0
                      ? formatMoney(order.shippingAmount * 100, order.currency)
                      : "Free Shipping"}
                  </span>
                </div>
                {order.taxAmount > 0 && (
                  <div className="flex justify-between">
                    <span>Applicable GST / Tax</span>
                    <span className="font-semibold text-gray-900">
                      {formatMoney(order.taxAmount * 100, order.currency)}
                    </span>
                  </div>
                )}
                <div className="border-t border-gray-100 pt-3 flex justify-between items-center text-sm">
                  <span className="font-bold text-gray-900">Total Charged</span>
                  <span className="font-black text-gray-900 text-base">
                    {formatMoney(order.totalAmount * 100, order.currency)}
                  </span>
                </div>
              </div>

              <div className="pt-2">
                {isPaid ? (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>Payment verified. Stock committed.</span>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2 font-medium">
                    <Ban className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>Unpaid order. Dispatch locked.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Carrier Dispatch & Milestone Console */}
            <AdminDispatchConsole
              orderId={order.id}
              orderNumber={order.orderNumber}
              paymentStatus={order.paymentStatus}
              fulfillmentStatus={order.fulfillmentStatus}
              isDispatchEligible={order.isDispatchEligible}
              shipments={order.shipments}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
