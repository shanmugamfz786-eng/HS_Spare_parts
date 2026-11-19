"use client";

import React, { useTransition } from "react";
import Link from "next/link";
import { Trash2, AlertTriangle, PackageX, Minus, Plus, Loader2, Wrench } from "lucide-react";
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
      className={`p-4 sm:p-5 rounded-xl bg-white border transition-all shadow-xs ${
        !item.inStock
          ? "border-red-300 bg-red-50/30"
          : item.hasStockWarning
          ? "border-amber-300 bg-amber-50/30"
          : "border-gray-200/90 hover:border-gray-300 hover:shadow-sm"
      }`}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Left: Thumbnail & Part Identity */}
        <div className="flex items-start gap-3.5 flex-1 min-w-0">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center flex-shrink-0 text-gray-500 shadow-inner">
            <Wrench className="w-6 h-6 text-gray-400" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-ember">
                {item.brand}
              </span>
              <span className="text-gray-300">•</span>
              <span className="text-[10px] font-mono text-gray-500">
                SKU: {item.sku}
              </span>
            </div>

            <h3 className="text-sm font-bold text-gray-900 truncate">
              <Link
                href={`/products/${item.productId}`}
                className="hover:text-ember transition-colors"
              >
                {item.name}
              </Link>
            </h3>

            {/* Stock Warnings */}
            {!item.inStock ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 mt-1">
                <PackageX className="w-3.5 h-3.5" />
                <span>Currently Out of Stock — Please remove to checkout</span>
              </span>
            ) : item.hasStockWarning ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 mt-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Low inventory ({item.availableStock} remaining)</span>
              </span>
            ) : (
              <span className="text-[11px] text-green-700 font-semibold block mt-0.5">
                In Stock — Express Dispatch Ready
              </span>
            )}
          </div>
        </div>

        {/* Right: Quantity Stepper, Price & Remove Action */}
        <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-0 border-gray-100">
          {/* Quantity Controls */}
          <div className="flex items-center border border-gray-300 rounded-lg bg-gray-50 p-1">
            <button
              type="button"
              onClick={handleDecrement}
              disabled={isPending || item.quantity <= 1 || !item.inStock}
              className="w-7 h-7 rounded bg-white border border-gray-200 flex items-center justify-center text-gray-700 hover:border-ember disabled:opacity-40 transition-colors shadow-2xs"
              aria-label="Decrease quantity"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-8 text-center text-xs font-black text-gray-900">
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={handleIncrement}
              disabled={isPending || item.quantity >= 10 || !item.inStock}
              className="w-7 h-7 rounded bg-white border border-gray-200 flex items-center justify-center text-gray-700 hover:border-ember disabled:opacity-40 transition-colors shadow-2xs"
              aria-label="Increase quantity"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Pricing */}
          <div className="text-right min-w-[90px]">
            <span className="text-base font-black text-gray-900 block">
              {formatMoney(item.lineTotalMinor)}
            </span>
            <span className="text-[10px] text-gray-500 block">
              {formatMoney(item.priceMinor)} each
            </span>
          </div>

          {/* Remove Button */}
          <button
            type="button"
            onClick={handleRemove}
            disabled={isPending}
            className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40"
            title="Remove item"
            aria-label={`Remove ${item.name}`}
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
