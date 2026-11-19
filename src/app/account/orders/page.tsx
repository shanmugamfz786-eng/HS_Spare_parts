"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, ArrowLeft, ArrowRight, Loader2, Calendar, FileText } from "lucide-react";
import { getCustomerOrdersAction } from "@/features/orders/actions";
import type { PaginatedOrdersDTO } from "@/features/orders/schemas";
import { formatMoney } from "@/lib/money";

export default function CustomerOrdersPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<PaginatedOrdersDTO | null>(null);
  const [page, setPage] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchOrders = async (targetPage: number) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await getCustomerOrdersAction(targetPage, 10);
      if (res.isUnauthenticated) {
        router.push("/account?returnTo=/account/orders");
        return;
      }
      if (!res.success) {
        setErrorMessage(res.error || "Failed to load order history.");
      } else if (res.data) {
        setData(res.data);
      }
    } catch (err) {
      console.error("[OrdersPage] error:", err);
      setErrorMessage("Could not load your orders.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between pb-6 mb-8 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Order History</h1>
          <p className="text-xs text-gray-500 mt-1">
            Review past orders, check reservation states, and view snapshot invoices
          </p>
        </div>
        <Link
          href="/account"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-ember transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Account Dashboard</span>
        </Link>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-ember mx-auto mb-3" />
          <p className="text-xs text-gray-500">Loading your orders...</p>
        </div>
      )}

      {/* Error */}
      {!isLoading && errorMessage && (
        <div className="p-6 rounded-2xl bg-red-50 border border-red-200 text-center max-w-md mx-auto my-8">
          <p className="text-xs text-red-700 mb-4">{errorMessage}</p>
          <button
            type="button"
            onClick={() => fetchOrders(page)}
            className="btn-primary py-2 px-4 text-xs font-bold"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !errorMessage && data && data.orders.length === 0 && (
        <div className="p-12 rounded-2xl bg-white border border-gray-200/90 shadow-sm text-center max-w-md mx-auto my-8">
          <div className="w-14 h-14 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400 mx-auto mb-4">
            <Package className="w-7 h-7 text-gray-400" />
          </div>
          <h2 className="text-base font-bold text-gray-900 mb-1">No Orders Found</h2>
          <p className="text-xs text-gray-500 mb-6">
            You haven&apos;t placed any orders with HS Spare Parts yet.
          </p>
          <Link
            href="/"
            className="btn-primary py-2.5 px-6 text-xs font-bold uppercase tracking-wider inline-block"
          >
            Explore Catalogue
          </Link>
        </div>
      )}

      {/* Orders List */}
      {!isLoading && !errorMessage && data && data.orders.length > 0 && (
        <div className="space-y-4">
          {data.orders.map((order) => {
            const formattedDate = new Date(order.placedAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            });

            return (
              <div
                key={order.id}
                className="rounded-2xl bg-white border border-gray-200/90 shadow-sm p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 hover:border-gray-300 hover:shadow-md transition-all"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono font-bold text-sm text-gray-900">{order.orderNumber}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200">
                      {order.paymentStatus === "pending" ? "Pending Payment" : order.paymentStatus}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-700">
                      {order.fulfillmentStatus}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      <span>{formattedDate}</span>
                    </span>
                    <span>•</span>
                    <span>{order.itemCount} {order.itemCount === 1 ? "item" : "items"}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-6 pt-3 md:pt-0 border-t md:border-t-0 border-gray-100">
                  <div className="text-left md:text-right">
                    <span className="text-[10px] uppercase text-gray-500 block font-semibold">Total</span>
                    <span className="font-mono font-bold text-base text-gray-900">{formatMoney(order.totalMinor)}</span>
                  </div>

                  <Link
                    href={`/account/orders/${order.orderNumber}`}
                    className="btn-secondary py-2 px-3 text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>View Details</span>
                  </Link>
                </div>
              </div>
            );
          })}

          {/* Pagination Controls */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between pt-6 border-t border-gray-200 text-xs">
              <span className="text-gray-500">
                Page {data.page} of {data.totalPages} ({data.total} total orders)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={data.page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="btn-secondary py-1.5 px-3 text-xs font-semibold disabled:opacity-40"
                >
                  <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />
                  Previous
                </button>
                <button
                  type="button"
                  disabled={data.page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="btn-secondary py-1.5 px-3 text-xs font-semibold disabled:opacity-40"
                >
                  Next
                  <ArrowRight className="w-3.5 h-3.5 inline ml-1" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
