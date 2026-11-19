"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ShoppingCart,
  Heart,
  ArrowRight,
} from "lucide-react";
import { DEMO_FEATURED_PRODUCTS, DemoProduct } from "@/lib/constants/demo-catalog";
import { formatMoney } from "@/lib/money";

const PRODUCT_IMAGE_MAP: Record<string, string> = {
  "demo-brembo-pads": "/images/brakes.jpg",
  "demo-gabriel-shockers": "/images/suspension.jpg",
  "demo-valeo-clutch": "/images/transmission.jpg",
  "demo-bosch-spark-plugs": "/images/electrical.jpg",
  "demo-denso-radiator": "/images/cooling.jpg",
  "demo-lumax-headlight": "/images/body.jpg",
  "demo-mann-filters": "/images/accessories.jpg",
  "demo-bosch-wipers": "/images/accessories.jpg",
};

export function FeaturedProducts() {
  const [previewWishlist, setPreviewWishlist] = useState<Set<string>>(new Set());
  const [interactiveToast, setInteractiveToast] = useState<string | null>(null);

  const handlePreviewAddToCart = (product: DemoProduct) => {
    setInteractiveToast(product.name);
    setTimeout(() => {
      setInteractiveToast(null);
    }, 3500);
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

  const newProducts = DEMO_FEATURED_PRODUCTS.filter((p) => p.condition === "new");
  const usedProducts = DEMO_FEATURED_PRODUCTS.filter((p) => p.condition === "used");

  return (
    <section id="catalogue-sections" className="py-14 sm:py-20 bg-[#090D18] text-white border-t border-b border-gray-800 space-y-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Interactive Preview Feedback Banner */}
        {interactiveToast && (
          <div className="mb-8 p-3 rounded-xl bg-ember/20 border border-ember/40 text-ember-200 text-xs flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-ember flex-shrink-0" />
              <span>
                Item added to cart preview: <strong className="text-white">&ldquo;{interactiveToast}&rdquo;</strong>.
              </span>
            </div>
            <Link
              href="/cart"
              className="text-xs font-bold underline hover:text-white"
            >
              View Preview Cart &rarr;
            </Link>
          </div>
        )}

        {/* =========================================================================
            SECTION 1: NEW SPARE PARTS
            ========================================================================= */}
        <div id="new-spare-parts" className="space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-gray-800">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Factory New Inventory</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                New Spare Parts
              </h2>
              <p className="text-sm text-gray-400 mt-1 max-w-xl">
                Brand new, unused OEM and aftermarket replacement components in original packaging.
              </p>
            </div>

            <Link
              href="/search?condition=new"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-emerald-400 hover:text-emerald-300 transition-colors group"
            >
              <span>Explore All New Parts</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {newProducts.map((product) => {
              const isWishlisted = previewWishlist.has(product.id);
              const discountPercentage =
                product.originalPriceMinor && product.originalPriceMinor > product.priceMinor
                  ? Math.round(
                      ((product.originalPriceMinor - product.priceMinor) / product.originalPriceMinor) * 100
                    )
                  : 0;

              const productImage = PRODUCT_IMAGE_MAP[product.id] || "/images/brakes.jpg";

              return (
                <div
                  key={product.id}
                  className="bg-[#121826] rounded-2xl border border-gray-800/90 hover:border-emerald-500/50 shadow-lg hover:shadow-2xl transition-all duration-300 flex flex-col justify-between overflow-hidden group"
                >
                  {/* Product Image Stage */}
                  <div className="relative aspect-[4/3] bg-gray-950 flex items-center justify-center overflow-hidden border-b border-gray-800">
                    <img
                      src={productImage}
                      alt={product.name}
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500 opacity-90 group-hover:opacity-100"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#121826] via-transparent to-transparent pointer-events-none" />

                    {/* Condition Badge Top Left */}
                    <div className="absolute top-3 left-3 flex flex-col gap-1 items-start z-10">
                      <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-md shadow-xs backdrop-blur-md">
                        NEW
                      </span>
                      <span className="text-[9px] font-bold text-gray-300 bg-black/70 backdrop-blur-md px-1.5 py-0.5 rounded border border-gray-700">
                        {product.brand}
                      </span>
                    </div>

                    {discountPercentage > 0 && (
                      <div className="absolute bottom-3 right-3 z-10 bg-emerald-500 text-black text-[10px] font-black px-2 py-0.5 rounded-md shadow">
                        Save {discountPercentage}%
                      </div>
                    )}

                    {/* Wishlist Button */}
                    <button
                      type="button"
                      onClick={() => togglePreviewWishlist(product.id)}
                      aria-label={`Add ${product.name} to preview wishlist`}
                      className={`absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                        isWishlisted
                          ? "bg-emerald-500 text-white"
                          : "bg-black/60 text-gray-300 hover:text-white hover:bg-black/80"
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${isWishlisted ? "fill-current" : ""}`} />
                    </button>
                  </div>

                  {/* Product Content Details */}
                  <div className="p-5 flex flex-col flex-1 justify-between">
                    <div>
                      <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                          {product.categorySlug.replace("-", " ")}
                        </span>
                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                          Brand New
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors line-clamp-2 mb-2 leading-snug">
                        <Link href={`/products/${product.id}`} className="focus:outline-none">
                          {product.name}
                        </Link>
                      </h3>

                      <div className="space-y-1 mb-4 text-[11px] text-gray-400">
                        <p className="font-mono">
                          SKU: <span className="text-gray-300">{product.sku}</span>
                        </p>
                        <p className="line-clamp-1">
                          Fits: <span className="text-gray-300">{product.fitmentHint}</span>
                        </p>
                      </div>
                    </div>

                    {/* Pricing and Add to Cart Action */}
                    <div className="pt-4 border-t border-gray-800/90">
                      <div className="flex items-baseline gap-2 mb-3">
                        <span className="text-lg font-black text-white">
                          {formatMoney(product.priceMinor)}
                        </span>
                        {product.originalPriceMinor && (
                          <span className="text-xs text-gray-500 line-through">
                            {formatMoney(product.originalPriceMinor)}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handlePreviewAddToCart(product)}
                        className="w-full btn-primary py-2.5 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        <span>Add to Cart</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* =========================================================================
            SECTION 2: PRE-OWNED SPARE PARTS
            ========================================================================= */}
        <div id="pre-owned-spare-parts" className="space-y-8 pt-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-gray-800">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>Inspected &amp; Disclosed</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Pre-Owned Spare Parts
              </h2>
              <p className="text-sm text-gray-400 mt-1 max-w-xl">
                Tested automotive assemblies and components with disclosed wear notes, physical photographs, and exchange warranty.
              </p>
            </div>

            <Link
              href="/search?condition=used"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-amber-400 hover:text-amber-300 transition-colors group"
            >
              <span>Explore All Pre-Owned Parts</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {usedProducts.map((product) => {
              const isWishlisted = previewWishlist.has(product.id);
              const discountPercentage =
                product.originalPriceMinor && product.originalPriceMinor > product.priceMinor
                  ? Math.round(
                      ((product.originalPriceMinor - product.priceMinor) / product.originalPriceMinor) * 100
                    )
                  : 0;

              const productImage = PRODUCT_IMAGE_MAP[product.id] || "/images/brakes.jpg";

              return (
                <div
                  key={product.id}
                  className="bg-[#121826] rounded-2xl border border-gray-800/90 hover:border-amber-500/50 shadow-lg hover:shadow-2xl transition-all duration-300 flex flex-col justify-between overflow-hidden group"
                >
                  {/* Product Image Stage */}
                  <div className="relative aspect-[4/3] bg-gray-950 flex items-center justify-center overflow-hidden border-b border-gray-800">
                    <img
                      src={productImage}
                      alt={product.name}
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500 opacity-90 group-hover:opacity-100"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#121826] via-transparent to-transparent pointer-events-none" />

                    {/* Condition Badge Top Left */}
                    <div className="absolute top-3 left-3 flex flex-col gap-1 items-start z-10">
                      <span className="text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-md shadow-xs backdrop-blur-md">
                        PRE-OWNED
                      </span>
                      <span className="text-[9px] font-bold text-gray-300 bg-black/70 backdrop-blur-md px-1.5 py-0.5 rounded border border-gray-700">
                        {product.brand}
                      </span>
                    </div>

                    {discountPercentage > 0 && (
                      <div className="absolute bottom-3 right-3 z-10 bg-amber-500 text-black text-[10px] font-black px-2 py-0.5 rounded-md shadow">
                        Save {discountPercentage}%
                      </div>
                    )}

                    {/* Wishlist Button */}
                    <button
                      type="button"
                      onClick={() => togglePreviewWishlist(product.id)}
                      aria-label={`Add ${product.name} to preview wishlist`}
                      className={`absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                        isWishlisted
                          ? "bg-amber-500 text-white"
                          : "bg-black/60 text-gray-300 hover:text-white hover:bg-black/80"
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${isWishlisted ? "fill-current" : ""}`} />
                    </button>
                  </div>

                  {/* Product Content Details */}
                  <div className="p-5 flex flex-col flex-1 justify-between">
                    <div>
                      <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                          {product.categorySlug.replace("-", " ")}
                        </span>
                        <span className="text-[10px] font-semibold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800">
                          Pre-Owned
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors line-clamp-2 mb-2 leading-snug">
                        <Link href={`/products/${product.id}`} className="focus:outline-none">
                          {product.name}
                        </Link>
                      </h3>

                      {/* Condition Notes Preview */}
                      {product.conditionNotes && (
                        <div className="p-2 rounded bg-amber-950/30 border border-amber-800/40 text-[10px] text-amber-200/90 line-clamp-2 mb-3">
                          <strong className="text-amber-300">Inspection:</strong> {product.conditionNotes}
                        </div>
                      )}

                      <div className="space-y-1 mb-4 text-[11px] text-gray-400">
                        <p className="font-mono">
                          SKU: <span className="text-gray-300">{product.sku}</span>
                        </p>
                        <p className="line-clamp-1">
                          Fits: <span className="text-gray-300">{product.fitmentHint}</span>
                        </p>
                      </div>
                    </div>

                    {/* Pricing and Add to Cart Action */}
                    <div className="pt-4 border-t border-gray-800/90">
                      <div className="flex items-baseline gap-2 mb-3">
                        <span className="text-lg font-black text-white">
                          {formatMoney(product.priceMinor)}
                        </span>
                        {product.originalPriceMinor && (
                          <span className="text-xs text-gray-500 line-through">
                            {formatMoney(product.originalPriceMinor)}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handlePreviewAddToCart(product)}
                        className="w-full btn-primary py-2.5 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        <span>Add to Cart</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
