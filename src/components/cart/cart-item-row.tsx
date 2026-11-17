"use client";

import React, { useTransition } from "react";
import Link from "next/link";
import { Trash2, AlertTriangle, PackageX, Minus, Plus, Loader2 } from "lucide-react";
import { formatMoney } from "@/lib/money";
import type { CartItemDTO } from "@/features/cart/schemas";

interface CartItemRowProps {
  item: CartItemDTO;
  onUpdateQuantity: (cartItemId: string, quantity: number) => Promise<void>;
  onRemove: (cartItemId: string) => Promise<void>;
}

export function CartItemRow({ item, onUpdateQuantity, onRemove }: CartItemRowProps) {
  const [isPending, startTransition] = useTransition();

  const handleDecrement = () => {
    if (item.quantity > 1) {
      startTransition(async () => {
        await onUpdateQuantity(item.id, item.quantity - 1);
      });
    }
  };

  const handleIncrement = () => {
    if (item.quantity < 10) {
      startTransition(async () => {
        await onUpdateQuantity(item.id, item.quantity + 1);
      });
    }
  };

  const handleRemove = () => {
    startTransition(async () => {
      await onRemove(item.id);
    });
  };

  return (
    <div
      className={`p-4 sm:p-5 rounded-card bg-ink-raised border transition-all ${
        !item.inStock
          ? "border-red-900/60 bg-red-950/10"
          : item.hasStockWarning
          ? "border-amber-700/50 bg-amber-950/10"
          : "border-gray-800 hover:border-gray-700"
      }`}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Left: Product Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-ink border border-gray-700 text-gray-300">
              {item.sku}
            </span>
            {item.isDemo && (
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                Demo Preview
              </span>
            )}
            {!item.inStock && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                <PackageX className="w-3 h-3" />
                <span>Out of Stock</span>
              </span>
            )}
          </div>

          <h3 className="text-sm sm:text-base font-bold text-paper truncate">
            <Link href={`/products/${item.productId}`} className="hover:text-ember transition-colors">
              {item.name}
            </Link>
          </h3>

          <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
            <span>Unit Price: <span className="text-paper font-semibold">{formatMoney(item.priceMinor)}</span></span>
          </div>

          {/* Stock Warning Notice */}
          {item.hasStockWarning && item.stockWarningMessage && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{item.stockWarningMessage}</span>
            </div>
          )}
        </div>

        {/* Right: Quantity Stepper & Pricing */}
        <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-6">
          {/* Stepper */}
          <div className="flex items-center border border-gray-700 rounded-brand bg-ink">
            <button
              type="button"
              onClick={handleDecrement}
              disabled={isPending || item.quantity <= 1}
              aria-label="Decrease quantity"
              className="p-1.5 text-gray-300 hover:text-paper hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="px-3 text-xs font-bold text-paper font-mono min-w-[2rem] text-center">
              {isPending ? <Loader2 className="w-3 h-3 animate-spin mx-auto text-ember" /> : item.quantity}
            </span>
            <button
              type="button"
              onClick={handleIncrement}
              disabled={isPending || item.quantity >= 10 || (item.availableStock > 0 && item.quantity >= item.availableStock)}
              aria-label="Increase quantity"
              className="p-1.5 text-gray-300 hover:text-paper hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Line Total */}
          <div className="text-right min-w-[5.5rem]">
            <span className="text-xs text-gray-400 block sm:hidden">Total</span>
            <span className="text-sm sm:text-base font-black text-paper font-mono">
              {formatMoney(item.lineTotalMinor)}
            </span>
          </div>

          {/* Remove Button */}
          <button
            type="button"
            onClick={handleRemove}
            disabled={isPending}
            aria-label={`Remove ${item.name} from cart`}
            title="Remove item"
            className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-950/20 rounded-brand transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
