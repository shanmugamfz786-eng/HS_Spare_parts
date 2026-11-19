"use client";

import React, { useTransition } from "react";
import Link from "next/link";
import { ShieldCheck, ArrowRight, RotateCcw, AlertCircle, Trash2, Loader2, Truck } from "lucide-react";
import { formatMoney } from "@/lib/money";
import type { CartDTO } from "@/features/cart/schemas";

interface CartSummaryProps {
  cart: CartDTO;
  onClearCart: () => Promise<void>;
}

export function CartSummary({ cart, onClearCart }: CartSummaryProps) {
  const [isPending, startTransition] = useTransition();
  const hasOutOfStockItems = cart.items.some((i) => !i.inStock);

  const handleClear = () => {
    if (confirm("Are you sure you want to remove all items from your cart?")) {
      startTransition(async () => {
        await onClearCart();
      });
    }
  };

  return (
    <div className="rounded-2xl bg-white border border-gray-200/90 p-6 space-y-6 sticky top-24 shadow-sm">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <h2 className="text-base font-bold text-gray-900">Order Summary</h2>
        <button
          type="button"
          onClick={handleClear}
          disabled={isPending || cart.items.length === 0}
          className="text-xs text-gray-400 hover:text-red-500 inline-flex items-center gap-1 transition-colors disabled:opacity-40"
          title="Clear entire cart"
        >
          {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          <span>Clear Cart</span>
        </button>
      </div>

      {/* Warnings & Alerts */}
      {cart.warnings.length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>Cart Notices</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800">
            {cart.warnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Price Calculations */}
      <div className="space-y-3 text-xs">
        <div className="flex items-center justify-between text-gray-600">
          <span>Subtotal ({cart.totalQuantity} items)</span>
          <span className="font-bold text-gray-900">
            {formatMoney(cart.subtotalMinor)}
          </span>
        </div>

        <div className="flex items-center justify-between text-gray-600">
          <span className="flex items-center gap-1">
            <Truck className="w-3.5 h-3.5 text-ember" />
            <span>Estimated Shipping</span>
          </span>
          <span className="text-gray-500 font-medium">Calculated at checkout</span>
        </div>

        <div className="flex items-center justify-between text-gray-600">
          <span>Estimated GST (Inclusive)</span>
          <span className="text-gray-500 font-medium">Included in part prices</span>
        </div>

        <div className="pt-3 border-t border-gray-100 flex items-baseline justify-between text-base font-black text-gray-900">
          <span>Total</span>
          <span className="text-2xl text-gray-900">
            {formatMoney(cart.subtotalMinor)}
          </span>
        </div>
      </div>

      {/* Checkout CTA */}
      <div>
        {hasOutOfStockItems ? (
          <div className="space-y-2">
            <button
              type="button"
              disabled
              className="w-full py-3.5 px-4 rounded-xl bg-gray-200 text-gray-500 font-bold text-xs uppercase tracking-wider cursor-not-allowed"
            >
              Resolve Out-of-Stock Items
            </button>
            <p className="text-[11px] text-red-600 text-center">
              Please remove out-of-stock items before proceeding to checkout.
            </p>
          </div>
        ) : (
          <Link
            href="/checkout"
            className="btn-primary w-full py-3.5 px-4 rounded-xl font-bold text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-md"
          >
            <span>Proceed to Checkout</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      {/* Trust Badges */}
      <div className="space-y-2 pt-2 border-t border-gray-100 text-[11px] text-gray-500">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-green-600 flex-shrink-0" />
          <span>OEM &amp; OES Quality Specifications</span>
        </div>
        <div className="flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-ember flex-shrink-0" />
          <span>10-Day Returns on Uninstalled Spares</span>
        </div>
      </div>
    </div>
  );
}
