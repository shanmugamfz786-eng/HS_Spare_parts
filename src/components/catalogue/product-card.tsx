"use client";

import React, { useTransition } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { ShieldCheck, Tag, ShoppingCart, Info, Wrench, Loader2 } from "lucide-react";
import { addToCartAction } from "@/features/cart/actions";
import type { ProductCardDTO } from "@/features/catalogue/schemas";

interface ProductCardProps {
  product: ProductCardDTO;
  className?: string;
}

export function ProductCard({ product, className = "" }: ProductCardProps) {
  const [isPending, startTransition] = useTransition();

  const handleQuickAdd = () => {
    startTransition(async () => {
      if (product.isDemo) {
        alert(`[Demo Catalogue Preview] ${product.name} added to preview cart. Real database storage activates with live database connection.`);
        return;
      }
      const res = await addToCartAction({ productId: product.id, quantity: 1 });
      if (res.success) {
        alert(`Added ${product.name} to your shopping cart!`);
      } else {
        alert(res.error || "Failed to add to cart.");
      }
    });
  };

  const savingsPercent =
    product.compareAtPriceMinor && product.compareAtPriceMinor > product.priceMinor
      ? Math.round(
          ((product.compareAtPriceMinor - product.priceMinor) / product.compareAtPriceMinor) * 100
        )
      : null;

  return (
    <div
      className={`surface-card bg-paper text-charcoal rounded-card border border-border flex flex-col justify-between shadow-card hover:shadow-xl transition-all duration-200 group ${className}`}
    >
      <div>
        {/* Visual Media Header / Fallback Part Canvas */}
        <div className="bg-mist p-5 rounded-t-card border-b border-border relative overflow-hidden flex flex-col items-center justify-center min-h-[160px]">
          {/* Top Badges */}
          <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none z-10">
            {product.isDemo ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-800 border border-amber-300">
                Demo Part
              </span>
            ) : product.isOem ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-success/15 text-success border border-success/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                <span>OES Genuine</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-ink/10 text-charcoal border border-border">
                Aftermarket Tier-1
              </span>
            )}

            {savingsPercent && (
              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-ember text-paper">
                Save {savingsPercent}%
              </span>
            )}
          </div>

          {/* Part Placeholder Badge */}
          <div className="w-24 h-24 rounded-full bg-paper/80 border border-border/80 flex flex-col items-center justify-center p-3 text-center shadow-inner group-hover:scale-105 transition-transform duration-300">
            <Wrench className="w-6 h-6 text-muted mb-1 group-hover:text-ember transition-colors" />
            <span className="text-[10px] font-black text-charcoal tracking-tight">
              {product.brandName}
            </span>
          </div>

          <span className="text-[10px] font-mono text-muted mt-2 tracking-wider">
            SKU: {product.sku}
          </span>
        </div>

        {/* Content Body */}
        <div className="p-4">
          <div className="flex items-center justify-between text-[11px] text-muted mb-1">
            <span className="font-bold text-ember uppercase tracking-wider">
              {product.brandName}
            </span>
            <span className="truncate max-w-[120px]">{product.categoryName}</span>
          </div>

          <h3 className="text-xs sm:text-sm font-bold text-charcoal line-clamp-2 mb-1.5 group-hover:text-ember transition-colors">
            <Link href={`/products/${product.id}`} className="focus:outline-none">
              {product.name}
            </Link>
          </h3>

          {/* Compatibility & Reference Hint */}
          {product.fitmentHint && (
            <p className="text-[11px] text-muted line-clamp-1 mb-1.5">
              {product.fitmentHint}
            </p>
          )}

          {product.oemReference && (
            <div className="flex items-center gap-1 text-[10px] text-muted font-mono mb-3">
              <Tag className="w-3 h-3 text-muted flex-shrink-0" />
              <span className="truncate">OEM Ref: {product.oemReference}</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer Pricing & CTA */}
      <div className="p-4 pt-0">
        <div className="pt-3 border-t border-border flex items-baseline justify-between mb-3">
          <div>
            <span className="text-sm sm:text-base font-black text-charcoal">
              {formatMoney(product.priceMinor)}
            </span>
            {product.compareAtPriceMinor && (
              <span className="text-xs text-muted line-through ml-2">
                {formatMoney(product.compareAtPriceMinor)}
              </span>
            )}
            <span className="text-[10px] text-muted block">Inclusive of GST</span>
          </div>

          {product.isDemo && (
            <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-1">
              <Info className="w-3 h-3" />
              <span>Sample</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`/products/${product.id}`}
            className="btn-secondary py-1.5 px-3 text-xs font-semibold text-center truncate"
          >
            View Details
          </Link>
          <button
            type="button"
            disabled={!product.inStock || isPending}
            className="btn-primary py-1.5 px-2 text-xs font-semibold flex items-center justify-center gap-1 truncate disabled:opacity-40"
            title={product.inStock ? "Add item to shopping cart" : "Currently out of stock"}
            onClick={handleQuickAdd}
          >
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5 flex-shrink-0" />}
            <span>{product.inStock ? "Add" : "Out"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
