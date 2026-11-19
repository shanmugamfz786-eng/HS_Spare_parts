"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  ShieldCheck,
  Loader2,
  Clock,
  PackageCheck,
  AlertCircle,
  Truck,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import { getOrderByReferenceAction } from "@/features/orders/actions";
import type { OrderDetailDTO } from "@/features/orders/schemas";
import { isSafeHttpsUrl } from "@/features/fulfillment/schemas";
import { formatMoney } from "@/lib/money";

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderReference = params?.orderReference as string;

  const [isLoading, setIsLoading] = useState(true);
  const [order, setOrder] = useState<OrderDetailDTO | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!orderReference) return;

    const fetchOrder = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const res = await getOrderByReferenceAction(orderReference);
        if (res.isUnauthenticated) {
          router.push(`/account?returnTo=/account/orders/${orderReference}`);
          return;
        }
        if (!res.success) {
          setErrorMessage(res.error || "Order not found or access denied.");
        } else if (res.data) {
          setOrder(res.data);
        }
      } catch (err) {
        console.error("[OrderDetailPage] fetch error:", err);
        setErrorMessage("Could not load order details.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrder();
  }, [orderReference, router]);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-ember mx-auto mb-3" />
        <p className="text-xs text-gray-400">Loading order details...</p>
      </div>
    );
  }

  if (errorMessage || !order) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="p-6 rounded-card bg-red-950/20 border border-red-800 space-y-4">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
          <h2 className="text-base font-bold text-paper">Order Lookup Notice</h2>
          <p className="text-xs text-gray-300">{errorMessage || "The requested order could not be located."}</p>
          <div className="flex justify-center gap-3 pt-2">
            <Link
              href="/account/orders"
              className="btn-primary py-2 px-4 text-xs font-bold"
            >
              Back to My Orders
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const formattedPlacedDate = new Date(order.placedAt).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Top Navigation */}
      <div className="flex items-center justify-between pb-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <Link
            href="/account/orders"
            className="p-2 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-gray-900 transition-colors shadow-xs"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-gray-900 font-mono tracking-tight">{order.orderNumber}</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200">
                {order.paymentStatus === "pending" ? "Pending Payment" : order.paymentStatus}
              </span>
            </div>
            <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <span>Placed on {formattedPlacedDate}</span>
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] uppercase text-gray-500 block font-semibold">Total Amount</span>
          <span className="text-lg font-black text-gray-900 font-mono">{formatMoney(order.totalMinor)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Columns: Items & Timeline */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Items Snapshot */}
          <div className="rounded-2xl bg-white border border-gray-200/90 shadow-sm p-6 space-y-4">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-ember" />
              <span>Purchased Items Snapshot ({order.items.length})</span>
            </h2>

            <div className="divide-y divide-gray-100">
              {order.items.map((item) => (
                <div key={item.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-gray-900 leading-snug">{item.productName}</p>
                    <p className="text-xs text-gray-500">
                      SKU: <span className="font-mono">{item.sku}</span>
                      {item.variantSku && (
                        <span> • Variant SKU: <span className="font-mono">{item.variantSku}</span></span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatMoney(item.unitPriceMinor)} × {item.quantity} units
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="font-mono font-bold text-sm text-gray-900">
                      {formatMoney(item.lineTotalMinor)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Fulfilment & Authoritative Carrier Tracking */}
          <div className="rounded-2xl bg-white border border-gray-200/90 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Truck className="w-4 h-4 text-ember" />
                <span>Shipment & Delivery Status</span>
              </h2>
              {order.tracking.hasLiveTracking ? (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200">
                  {order.tracking.status ? order.tracking.status.replace(/_/g, " ") : "Dispatched"}
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200">
                  Awaiting Dispatch
                </span>
              )}
            </div>

            {order.tracking.hasLiveTracking ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-500 block">Courier Partner</span>
                      <span className="font-semibold text-gray-900 text-sm">{order.tracking.carrier}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-500 block">Waybill / AWB Number</span>
                      <span className="font-mono font-bold text-gray-900 text-sm">{order.tracking.trackingNumber}</span>
                    </div>
                  </div>

                  {order.tracking.shippedAt && (
                    <p className="text-[11px] text-gray-500">
                      Dispatched on {new Date(order.tracking.shippedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  )}

                  {order.tracking.trackingUrl && (
                    <div className="pt-2 border-t border-gray-200">
                      {isSafeHttpsUrl(order.tracking.trackingUrl) ? (
                        <a
                          href={order.tracking.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-ember hover:underline"
                        >
                          <span>Track package on {order.tracking.carrier} website</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <span className="text-[11px] text-gray-500 italic block">
                          Direct online tracking link is unavailable. Please visit the {order.tracking.carrier} website and enter your AWB number.
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {order.tracking.milestones && order.tracking.milestones.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">Shipment Milestone History</h3>
                    <div className="space-y-2 text-xs">
                      {order.tracking.milestones.map((m, mIdx) => (
                        <div key={mIdx} className="flex items-start gap-2.5 p-2 rounded-lg bg-gray-50 border border-gray-100">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <p className="font-semibold text-gray-900 text-[11px]">{m.description}</p>
                            <p className="text-[10px] text-gray-500">{new Date(m.timestamp).toLocaleString("en-IN")}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200 text-xs text-amber-950 space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-900">
                  <Clock className="w-4 h-4 text-amber-700" />
                  <span>Preparing Warehouse Dispatch</span>
                </div>
                <p className="text-gray-600 leading-relaxed text-[11px]">
                  {order.tracking.message}
                </p>
              </div>
            )}
          </div>

          {/* Audit History Timeline */}
          <div className="rounded-2xl bg-white border border-gray-200/90 shadow-sm p-6 space-y-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-ember" />
              <span>Order Timeline</span>
            </h2>
            <div className="space-y-3 text-xs">
              {order.statusHistory.map((h, idx) => (
                <div key={idx} className="flex items-start gap-3 pb-2 border-b border-gray-100 last:border-0">
                  <div className="w-2 h-2 rounded-full bg-ember mt-1.5 flex-shrink-0" />
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 uppercase tracking-wider text-[11px]">{h.status}</span>
                      <span className="text-[10px] text-gray-500">{new Date(h.timestamp).toLocaleString("en-IN")}</span>
                    </div>
                    {h.note && <p className="text-gray-500 text-[11px]">{h.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Address & Price Breakdown */}
        <div className="lg:col-span-1 space-y-6">
          {/* Delivery Address Snapshot */}
          <div className="rounded-2xl bg-white border border-gray-200/90 shadow-sm p-6 space-y-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-ember" />
              <span>Delivery Address</span>
            </h2>
            <div className="text-xs text-gray-600 space-y-1">
              <p className="font-bold text-gray-900">{order.shippingAddress.recipient}</p>
              <p>{order.shippingAddress.addressLine1}</p>
              {order.shippingAddress.addressLine2 && <p>{order.shippingAddress.addressLine2}</p>}
              <p>{order.shippingAddress.city}, {order.shippingAddress.stateRegion} - <span className="font-mono font-semibold">{order.shippingAddress.postalCode}</span></p>
              <p className="text-gray-500 pt-1">Phone: {order.shippingAddress.phone}</p>
            </div>
          </div>

          {/* Payment Summary */}
          <div className="rounded-2xl bg-white border border-gray-200/90 shadow-sm p-6 space-y-4">
            <h2 className="text-base font-bold text-gray-900 pb-3 border-b border-gray-100">Payment Breakdown</h2>
            <div className="space-y-2 text-xs text-gray-600">
              <div className="flex justify-between">
                <span className="text-gray-500">Items Subtotal</span>
                <span className="font-mono font-semibold text-gray-900">{formatMoney(order.subtotalMinor)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Delivery</span>
                <span className="font-mono font-semibold text-emerald-600">FREE</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Taxes (GST)</span>
                <span className="font-mono text-gray-500 italic">Included</span>
              </div>
              <div className="flex justify-between pt-3 border-t border-gray-100 font-bold text-sm">
                <span className="text-gray-900">Total</span>
                <span className="font-mono font-black text-gray-900">{formatMoney(order.totalMinor)}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-100 text-[10px] text-gray-500 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-ember flex-shrink-0" />
              <span>Immutable order snapshot recorded at checkout</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
