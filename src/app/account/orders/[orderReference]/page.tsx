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
} from "lucide-react";
import { getOrderByReferenceAction } from "@/features/orders/actions";
import type { OrderDetailDTO } from "@/features/orders/schemas";
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
      <div className="flex items-center justify-between pb-6 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <Link
            href="/account/orders"
            className="p-2 rounded-brand bg-ink border border-gray-800 text-gray-400 hover:text-paper transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-paper font-mono tracking-tight">{order.orderNumber}</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                {order.paymentStatus === "pending" ? "Pending Payment" : order.paymentStatus}
              </span>
            </div>
            <p className="text-xs text-gray-400 flex items-center gap-1.5 mt-0.5">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <span>Placed on {formattedPlacedDate}</span>
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] uppercase text-gray-400 block font-semibold">Total Amount</span>
          <span className="text-lg font-black text-paper font-mono">{formatMoney(order.totalMinor)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Columns: Items & Timeline */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Items Snapshot */}
          <div className="rounded-card bg-ink-raised border border-gray-800 p-6 space-y-4">
            <h2 className="text-base font-bold text-paper flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-ember" />
              <span>Purchased Items Snapshot ({order.items.length})</span>
            </h2>

            <div className="divide-y divide-gray-800/80">
              {order.items.map((item) => (
                <div key={item.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-paper leading-snug">{item.productName}</p>
                    <p className="text-xs text-gray-400">
                      SKU: <span className="font-mono">{item.sku}</span>
                      {item.variantSku && (
                        <span> • Variant SKU: <span className="font-mono">{item.variantSku}</span></span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatMoney(item.unitPriceMinor)} × {item.quantity} units
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="font-mono font-bold text-sm text-paper">
                      {formatMoney(item.lineTotalMinor)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Fulfilment & Tracking Notice */}
          <div className="rounded-card bg-ink-raised border border-gray-800 p-6 space-y-3">
            <h2 className="text-base font-bold text-paper flex items-center gap-2">
              <Truck className="w-4 h-4 text-ember" />
              <span>Fulfilment & Carrier Tracking</span>
            </h2>
            <div className="p-3.5 rounded-brand bg-ink border border-gray-800 text-xs text-gray-300 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-paper">Carrier Status</span>
                <span className="text-[11px] font-bold text-amber-400 uppercase">Awaiting Warehouse Dispatch</span>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                {order.tracking.message}
              </p>
            </div>
          </div>

          {/* Audit History Timeline */}
          <div className="rounded-card bg-ink-raised border border-gray-800 p-6 space-y-3">
            <h2 className="text-base font-bold text-paper flex items-center gap-2">
              <Clock className="w-4 h-4 text-ember" />
              <span>Order Timeline</span>
            </h2>
            <div className="space-y-3 text-xs">
              {order.statusHistory.map((h, idx) => (
                <div key={idx} className="flex items-start gap-3 pb-2 border-b border-gray-800/60 last:border-0">
                  <div className="w-2 h-2 rounded-full bg-ember mt-1.5 flex-shrink-0" />
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-paper uppercase tracking-wider text-[11px]">{h.status}</span>
                      <span className="text-[10px] text-gray-400">{new Date(h.timestamp).toLocaleString("en-IN")}</span>
                    </div>
                    {h.note && <p className="text-gray-400 text-[11px]">{h.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Address & Price Breakdown */}
        <div className="lg:col-span-1 space-y-6">
          {/* Delivery Address Snapshot */}
          <div className="rounded-card bg-ink-raised border border-gray-800 p-6 space-y-3">
            <h2 className="text-base font-bold text-paper flex items-center gap-2">
              <MapPin className="w-4 h-4 text-ember" />
              <span>Delivery Address</span>
            </h2>
            <div className="text-xs text-gray-300 space-y-1">
              <p className="font-bold text-paper">{order.shippingAddress.recipient}</p>
              <p>{order.shippingAddress.addressLine1}</p>
              {order.shippingAddress.addressLine2 && <p>{order.shippingAddress.addressLine2}</p>}
              <p>{order.shippingAddress.city}, {order.shippingAddress.stateRegion} - <span className="font-mono font-semibold">{order.shippingAddress.postalCode}</span></p>
              <p className="text-gray-400 pt-1">Phone: {order.shippingAddress.phone}</p>
            </div>
          </div>

          {/* Payment Summary */}
          <div className="rounded-card bg-ink-raised border border-gray-800 p-6 space-y-4">
            <h2 className="text-base font-bold text-paper pb-3 border-b border-gray-800">Payment Breakdown</h2>
            <div className="space-y-2 text-xs text-gray-300">
              <div className="flex justify-between">
                <span className="text-gray-400">Items Subtotal</span>
                <span className="font-mono font-semibold text-paper">{formatMoney(order.subtotalMinor)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Delivery</span>
                <span className="font-mono font-semibold text-emerald-400">FREE</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Taxes (GST)</span>
                <span className="font-mono text-gray-400 italic">Included</span>
              </div>
              <div className="flex justify-between pt-3 border-t border-gray-800 font-bold text-sm">
                <span className="text-paper">Total</span>
                <span className="font-mono font-black text-paper">{formatMoney(order.totalMinor)}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-800 text-[10px] text-gray-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-ember flex-shrink-0" />
              <span>Immutable order snapshot recorded at checkout</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
