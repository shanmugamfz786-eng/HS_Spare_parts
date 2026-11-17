"use client";

import React, { useTransition } from "react";
import Link from "next/link";
import { ShieldCheck, ArrowRight, RotateCcw, AlertCircle, Trash2, Loader2 } from "lucide-react";
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
    <div className="rounded-card bg-ink-raised border border-gray-800 p-6 space-y-6 sticky top-24">
      <div className="flex items-center justify-between pb-4 border-b border-gray-800">
        <h2 className="text-base font-bold text-paper">Order Summary</h2>
        <button
          type="button"
          onClick={handleClear}
          disabled={isPending || cart.items.length === 0}
          className="text-xs text-gray-400 hover:text-red-400 inline-flex items-center gap-1 transition-colors disabled:opacity-40"
          title="Clear entire cart"
        >
          {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          <span>Clear Cart</span>
        </button>
      </div>

      {/* Warnings & Alerts */}
      {cart.warnings.length > 0 && (
        <div className="p-3 rounded-brand bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 space-y-1">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>Cart Notices</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-[11px] text-gray-300">
            {cart.warnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Subtotal Breakdown */}
      <div className="space-y-3 text-xs text-gray-300">
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Total Items</span>
          <span className="font-semibold text-paper font-mono">{cart.totalQuantity} units ({cart.itemCount} distinct)</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Subtotal (Excl. Tax & Shipping)</span>
          <span className="text-sm font-bold text-paper font-mono">{formatMoney(cart.subtotalMinor)}</span>
        </div>
        <div className="flex items-center justify-between text-gray-400">
          <span>Shipping & GST</span>
          <span className="italic text-[11px]">Calculated during checkout</span>
        </div>
      </div>

      <div className="pt-4 border-t border-gray-800">
        <div className="flex items-baseline justify-between mb-4">
          <span className="text-sm font-bold text-paper">Estimated Subtotal</span>
          <span className="text-xl font-black text-paper font-mono">{formatMoney(cart.subtotalMinor)}</span>
        </div>

        {/* Phase Boundary Notice */}
        <div className="mb-4 p-2.5 rounded-brand bg-ink border border-gray-700 text-[11px] text-gray-400">
          <span className="font-bold text-paper block mb-0.5">Phase 6 Checkout Notice:</span>
          <span>Server-side checkout quotes and atomic inventory reservation are active. Direct online gateway settlement (Razorpay) activates in Phase 7.</span>
        </div>

        {/* Checkout Button */}
        {hasOutOfStockItems || cart.items.length === 0 ? (
          <button
            type="button"
            disabled
            className="w-full btn-primary py-3 px-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg opacity-50 cursor-not-allowed"
          >
            <span>Proceed to Checkout</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <Link
            href="/checkout"
            className="w-full btn-primary py-3 px-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg"
          >
            <span>Proceed to Checkout</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}

        {hasOutOfStockItems && (
          <p className="mt-2 text-[11px] text-red-400 text-center font-medium">
            Please remove or adjust out-of-stock items before checking out.
          </p>
        )}
      </div>

      {/* Trust Highlights */}
      <div className="pt-4 border-t border-gray-800 space-y-2">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <ShieldCheck className="w-4 h-4 text-ember flex-shrink-0" />
          <span>Server-verified genuine OEM & OES parts</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <RotateCcw className="w-4 h-4 text-ember flex-shrink-0" />
          <span>Provisional 10-day return policy</span>
        </div>
      </div>
    </div>
  );
}
