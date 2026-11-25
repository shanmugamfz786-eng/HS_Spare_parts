"use client";

import React, { useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { Tag, ShoppingCart, Info, Loader2 } from "lucide-react";
import { addToCartAction } from "@/features/cart/actions";
import type { ProductCardDTO } from "@/features/catalogue/schemas";
import { getOptimizedCloudinaryUrl } from "@/lib/cloudinary-shared";

interface ProductCardProps {
  product: ProductCardDTO;
  className?: string;
}

const CATEGORY_IMAGE_MAP: Record<string, string> = {
  brake: "/images/brakes.jpg",
  "suspension-steering": "/images/suspension.jpg",
  "engine-parts": "/images/engine.jpg",
  transmission: "/images/transmission.jpg",
  hvac: "/images/cooling.jpg",
  electrical: "/images/electrical.jpg",
  "body-parts": "/images/body.jpg",
  accessories: "/images/accessories.jpg",
};

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

  const cardImage =
    product.primaryImageUrl || CATEGORY_IMAGE_MAP[product.categorySlug] || "/images/brakes.jpg";
  const optimizedCardImage =
    getOptimizedCloudinaryUrl(cardImage, "productThumbnail") || cardImage;

  return (
    <div
      className={`surface-card bg-paper text-charcoal rounded-card border border-border flex flex-col justify-between shadow-card hover:shadow-xl transition-all duration-200 group overflow-hidden ${className}`}
    >
      <div>
        {/* Visual Media Header with Realistic Component Photography */}
        <div className="bg-[#090D18] p-4 rounded-t-card border-b border-border relative overflow-hidden flex flex-col items-center justify-center min-h-[180px]">
          {/* Top Badges */}
          <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none z-10">
            <div className="flex items-center gap-1.5 flex-wrap">
              {product.condition === "used" ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm">
                  PRE-OWNED
                </span>
              ) : product.condition === "new" ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm">
                  NEW
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-700/60 text-gray-300 border border-gray-600 shadow-sm">
                  UNCLASSIFIED
                </span>
              )}

              {product.origin === "genuine_oem" ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm">
                  GENUINE OEM
                </span>
              ) : product.origin === "branded_aftermarket" ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm">
                  AFTERMARKET
                </span>
              ) : null}

              {product.isDemo && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-200 border border-blue-500/30">
                  Demo
                </span>
              )}
            </div>

            {savingsPercent && (
              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-ember text-paper">
                Save {savingsPercent}%
              </span>
            )}
          </div>

          {/* Photo */}
          <div className="relative w-full h-32 flex items-center justify-center overflow-hidden my-2">
            <Image
              src={optimizedCardImage}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              loading="lazy"
              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500 drop-shadow-md"
            />
          </div>

          <span className="text-[10px] font-mono text-gray-400 tracking-wider">
            SKU: {product.sku}
          </span>
        </div>

        {/* Content Body */}
        <div className="p-4">
          <div className="flex items-center justify-between text-[11px] text-muted mb-1">
            <span className="font-bold text-ember uppercase tracking-wider">
              {product.brandName}
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-charcoal/80">
              {product.condition === "used"
                ? "Pre-Owned"
                : product.condition === "new"
                ? "Brand New"
                : "Condition Unspecified"}
            </span>
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

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted font-mono mb-2">
            {product.partNumber && (
              <span className="truncate">Part: <strong className="text-charcoal">{product.partNumber}</strong></span>
            )}
            {(product.oemNumber || product.oemReference) && (
              <div className="flex items-center gap-1 truncate">
                <Tag className="w-3 h-3 text-muted flex-shrink-0" />
                <span className="truncate">OEM: <strong className="text-charcoal">{product.oemNumber || product.oemReference}</strong></span>
              </div>
            )}
          </div>
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
            className="btn-secondary py-2 px-3 text-xs font-bold rounded-lg text-center flex items-center justify-center hover:border-ember hover:text-ember transition-colors"
          >
            Details
          </Link>

          <button
            type="button"
            onClick={handleQuickAdd}
            disabled={isPending}
            className="btn-primary py-2 px-3 text-xs font-bold rounded-lg flex items-center justify-center gap-1 shadow-sm disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <ShoppingCart className="w-3 h-3" />
            )}
            <span>Add</span>
          </button>
        </div>
      </div>
    </div>
  );
}
