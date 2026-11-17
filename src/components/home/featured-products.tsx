"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Star,
  CheckCircle2,
  ShoppingCart,
  Heart,
  Eye,
  Info,
  ArrowRight,
} from "lucide-react";
import { DEMO_FEATURED_PRODUCTS, DemoProduct } from "@/lib/constants/demo-catalog";
import { formatMoney } from "@/lib/money";

export function FeaturedProducts() {
  const [interactiveToast, setInteractiveToast] = useState<string | null>(null);
  const [previewWishlist, setPreviewWishlist] = useState<Set<string>>(new Set());

  const handlePreviewAddToCart = (product: DemoProduct) => {
    setInteractiveToast(product.name);
    setTimeout(() => {
      setInteractiveToast(null);
    }, 3000);
  };

  const togglePreviewWishlist = (productId: string) => {
    setPreviewWishlist((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  return (
    <section className="py-16 bg-ink border-b border-gray-800" aria-labelledby="featured-parts-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">
              <Info className="w-4 h-4 text-amber-400" />
              <span>UI Layout Showcase (Sample Specifications)</span>
            </div>
            <h2 id="featured-parts-heading" className="text-2xl sm:text-3xl font-black text-paper tracking-tight">
              Featured Parts Preview
            </h2>
            <p className="text-sm text-gray-400 mt-1 max-w-xl">
              Representative catalogue layout demonstrating part cards, sample specifications, and monetary display formats.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold text-amber-300 bg-amber-500/10 px-3 py-1.5 rounded-pill border border-amber-500/30">
              Demo Preview Only — Not Live Stock
            </span>
          </div>
        </div>

        {/* Clear Demo Notice Banner */}
        <div className="mb-8 p-3.5 rounded-brand bg-ink-raised border border-amber-500/30 text-amber-200/90 text-xs flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <span className="leading-relaxed">
            <strong>Demonstration Notice:</strong> The items below are sample specifications for layout verification. Real inventory, live stock availability, and verified pricing will connect from the PostgreSQL catalogue in Phase 5.
          </span>
        </div>

        {/* Interactive Preview Feedback Banner */}
        {interactiveToast && (
          <div className="mb-6 p-4 rounded-brand bg-ink-raised border border-ember/40 text-paper text-xs font-semibold flex items-center justify-between animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-ember flex-shrink-0" />
              <span>
                <strong>Interactive Preview:</strong> Add-to-cart triggered for &ldquo;{interactiveToast}&rdquo;. Real cart server actions connect in Phase 7.
              </span>
            </div>
            <Link href="/cart" className="underline font-bold text-ember hover:text-paper ml-4 whitespace-nowrap">
              View Cart Preview →
            </Link>
          </div>
        )}

        {/* Products Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {DEMO_FEATURED_PRODUCTS.map((product) => {
            const isWishlisted = previewWishlist.has(product.id);

            return (
              <div
                key={product.id}
                className="surface-card bg-paper text-charcoal rounded-card border border-border shadow-card hover:shadow-xl transition-all flex flex-col justify-between group overflow-hidden"
              >
                {/* Product Card Top: Visual Area */}
                <div className="relative bg-mist p-6 flex items-center justify-center min-h-[190px] border-b border-border/80">
                  <div className="absolute top-3 left-3 flex flex-col gap-1 items-start z-10">
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-ink text-paper shadow-sm">
                      {product.badge || "Demo Part"}
                    </span>
                    {product.discountPercentage && (
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-ember text-paper shadow-sm">
                        Sample {product.discountPercentage}% Off
                      </span>
                    )}
                  </div>

                  {/* Wishlist Preview Toggle */}
                  <button
                    type="button"
                    onClick={() => togglePreviewWishlist(product.id)}
                    aria-label={`Toggle sample wishlist for ${product.name}`}
                    className={`absolute top-3 right-3 p-1.5 rounded-full bg-paper/90 backdrop-blur border border-border shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember ${
                      isWishlisted ? "text-ember" : "text-gray-400 hover:text-ember"
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${isWishlisted ? "fill-current text-ember" : ""}`} />
                  </button>

                  <div className="w-28 h-28 rounded-card bg-paper border border-border/60 shadow-sm flex flex-col items-center justify-center p-3 text-center group-hover:scale-105 transition-transform duration-200">
                    <span className="text-[10px] font-bold uppercase text-muted tracking-wider block">
                      {product.brand}
                    </span>
                    <span className="text-xs font-black text-charcoal block mt-1">
                      {product.sku}
                    </span>
                    <span className="text-[9px] text-gray-400 block mt-1 truncate max-w-full">
                      {product.categoryName}
                    </span>
                  </div>
                </div>

                {/* Product Content Body */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-muted mb-1">
                      <span className="font-bold text-charcoal uppercase tracking-wider">
                        {product.brand}
                      </span>
                      <span>{product.sku}</span>
                    </div>

                    <h3 className="text-xs sm:text-sm font-bold text-charcoal line-clamp-2 leading-snug group-hover:text-ember transition-colors mb-2">
                      <Link href={`/products/${product.id}`}>{product.name}</Link>
                    </h3>

                    <div className="bg-mist p-2 rounded-brand text-[11px] text-charcoal border border-border/60 mb-3 flex items-start gap-1.5">
                      <Info className="w-3.5 h-3.5 text-muted flex-shrink-0 mt-0.5" />
                      <span className="font-medium line-clamp-1">{product.fitmentHint}</span>
                    </div>

                    {/* Ratings with Sample Data label */}
                    <div className="flex items-center gap-1.5 mb-3 text-xs">
                      <div className="flex items-center text-amber-500">
                        <Star className="w-3.5 h-3.5 fill-current" />
                      </div>
                      <span className="font-bold text-charcoal text-xs">{product.sampleRating}</span>
                      <span className="text-[11px] text-muted">
                        (Sample score • {product.sampleReviewCount} demo reviews)
                      </span>
                    </div>
                  </div>

                  {/* Pricing and Action Button */}
                  <div className="pt-3 border-t border-border/80">
                    <div className="flex items-baseline justify-between mb-3">
                      <div>
                        <span className="text-base sm:text-lg font-black text-charcoal">
                          {formatMoney(product.priceMinor)}
                        </span>
                        {product.originalPriceMinor && (
                          <span className="text-xs text-muted line-through ml-2">
                            {formatMoney(product.originalPriceMinor)}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        Demo Layout
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => handlePreviewAddToCart(product)}
                        className="col-span-3 btn-primary py-2 text-xs font-bold gap-1.5 shadow-sm"
                        title="Interactive UI Preview"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        <span>Preview Add to Cart</span>
                      </button>
                      <Link
                        href={`/products/${product.id}`}
                        className="col-span-1 inline-flex items-center justify-center p-2 rounded-brand bg-mist hover:bg-gray-200 text-charcoal border border-border text-xs transition-colors"
                        title="View Part Preview"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/categories"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-brand bg-ink-raised border border-gray-700 hover:border-ember text-paper font-bold text-xs sm:text-sm shadow-md transition-all hover:bg-ink hover:scale-105"
          >
            <span>Browse Full Category Taxonomy</span>
            <ArrowRight className="w-4 h-4 text-ember" />
          </Link>
        </div>
      </div>
    </section>
  );
}
