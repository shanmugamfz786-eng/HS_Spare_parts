import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductByIdOrSlug } from "@/server/catalogue/catalogue-service";
import { ProductGallery } from "@/components/catalogue/product-gallery";
import { ProductPurchaseActions } from "@/components/catalogue/product-purchase-actions";
import { ProductTabs } from "@/components/catalogue/product-tabs";
import { STORE_POLICY_CONFIG } from "@/lib/constants/store-config";
import { formatMoney } from "@/lib/money";
import {
  ShieldCheck,
  Truck,
  RotateCcw,
  Info,
  Car,
  Star,
} from "lucide-react";

interface ProductPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ProductDetailPage({ params }: ProductPageProps) {
  const { id } = await params;
  const product = await getProductByIdOrSlug(id);

  if (!product) {
    notFound();
  }

  const savingsPercent =
    product.compareAtPriceMinor && product.compareAtPriceMinor > product.priceMinor
      ? Math.round(
          ((product.compareAtPriceMinor - product.priceMinor) / product.compareAtPriceMinor) * 100
        )
      : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex items-center space-x-2 text-xs text-gray-500">
          <li>
            <Link href="/" className="hover:text-ember transition-colors">
              Home
            </Link>
          </li>
          <li>/</li>
          <li>
            <Link href="/categories" className="hover:text-ember transition-colors">
              Categories
            </Link>
          </li>
          <li>/</li>
          <li>
            <Link
              href={`/categories/${product.categorySlug}`}
              className="hover:text-ember transition-colors"
            >
              {product.categoryName}
            </Link>
          </li>
          <li>/</li>
          <li className="text-gray-900 font-bold truncate max-w-xs">{product.name}</li>
        </ol>
      </nav>

      {/* Demo Catalogue Transparency Alert */}
      {product.isDemo && (
        <div className="mb-6 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-900 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block text-gray-900">
              Demo Catalogue Item
            </span>
            <span className="text-gray-600">
              This product record is a demonstration layout component. Specifications and fitments
              demonstrate the catalogue schema structure. Real inventory and catalogue compatibility
              records will be populated directly from PostgreSQL.
            </span>
          </div>
        </div>
      )}

      {/* Primary Product Card: Gallery & Purchasing Console */}
      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-sm p-6 sm:p-10 mb-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Left Column: Product Image Gallery */}
          <div className="lg:col-span-6">
            <ProductGallery
              images={product.images}
              productName={product.name}
              brandName={product.brandName}
              sku={product.sku}
              categorySlug={product.categorySlug}
              isOem={product.isOem}
            />
          </div>

          {/* Right Column: Key Details & Purchasing Actions */}
          <div className="lg:col-span-6 flex flex-col justify-between">
            <div>
              {/* Brand, Category & Condition Badges */}
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-ember">
                    {product.brandName}
                  </span>
                  <span className="text-gray-300">•</span>
                  <span className="text-xs font-semibold text-gray-500">{product.categoryName}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {product.condition === "used" ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-amber-900 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-300 shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span>Pre-Owned</span>
                    </span>
                  ) : product.condition === "new" ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-emerald-900 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-300 shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>Brand New</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-gray-700 bg-gray-100 px-2.5 py-0.5 rounded-full border border-gray-300 shadow-xs">
                      <span>Condition Unclassified</span>
                    </span>
                  )}

                  {product.isOem ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-800 bg-gray-100 px-2.5 py-0.5 rounded-full border border-gray-200">
                      <ShieldCheck className="w-3.5 h-3.5 text-gray-600" />
                      <span>OEM Spec</span>
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-gray-600 bg-gray-100 px-2.5 py-0.5 rounded-full border border-gray-200">
                      Aftermarket
                    </span>
                  )}
                </div>
              </div>

              {/* Product Title */}
              <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight mb-2 leading-tight">
                {product.name}
              </h1>

              {/* Star Ratings & Review Counter */}
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center text-gray-300">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className="w-4 h-4 text-gray-300" />
                  ))}
                </div>
                <span className="text-xs text-gray-500">No customer reviews yet</span>
                <span className="text-gray-300">•</span>
                <a href="#customer-reviews" className="text-xs text-ember hover:underline font-semibold">
                  Write a review
                </a>
              </div>

              {/* SKU and OEM References */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mb-6 font-mono">
                <span className="bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-200">
                  SKU: <strong className="text-gray-800">{product.sku}</strong>
                </span>
                {product.oemReference && (
                  <span className="bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-200">
                    OEM Ref: <strong className="text-gray-800">{product.oemReference}</strong>
                  </span>
                )}
              </div>

              {/* Price Box */}
              <div className="p-4 sm:p-5 rounded-xl bg-[#F8F9FA] border border-gray-200/90 mb-6">
                <div className="flex items-baseline gap-3 mb-1">
                  <span className="text-3xl sm:text-4xl font-black text-gray-900">
                    {formatMoney(product.priceMinor)}
                  </span>
                  {product.compareAtPriceMinor && (
                    <span className="text-base text-gray-400 line-through">
                      {formatMoney(product.compareAtPriceMinor)}
                    </span>
                  )}
                  {savingsPercent && (
                    <span className="text-xs font-bold text-green-800 bg-green-100 px-2 py-0.5 rounded-full">
                      Save {savingsPercent}%
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  {STORE_POLICY_CONFIG.taxPolicy} • {STORE_POLICY_CONFIG.shippingClaim}
                </span>
              </div>

              {/* Product Condition & Disclosures Card */}
              {product.condition === "used" ? (
                <div className="p-4 sm:p-5 rounded-xl bg-amber-500/5 border border-amber-300/60 mb-6 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-amber-200">
                    <span className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <span>Pre-Owned Condition Record</span>
                    </span>
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                      Pre-Owned Part
                    </span>
                  </div>

                  {product.conditionNotes ? (
                    <div className="text-xs">
                      <strong className="text-gray-900 block mb-0.5 font-semibold">Condition Notes:</strong>
                      <p className="text-gray-700">{product.conditionNotes}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 italic">No intake condition notes recorded for this item.</p>
                  )}

                  {product.visibleWearOrDefects && (
                    <div className="text-xs">
                      <strong className="text-gray-900 block mb-0.5 font-semibold">Visible Wear &amp; Disclosures:</strong>
                      <p className="text-gray-700">{product.visibleWearOrDefects}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-amber-200/60 text-xs">
                    <div>
                      <span className="text-gray-500 block text-[11px]">Testing Status:</span>
                      <span className="font-semibold text-gray-900">{product.testedStatus || "Not recorded / Untested"}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[11px]">Warranty Coverage:</span>
                      <span className="font-semibold text-gray-900">{product.warrantyDetails || "Not configured"}</span>
                    </div>
                  </div>
                </div>
              ) : product.condition === "new" ? (
                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-300/60 mb-6 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span>Condition: Brand New</span>
                    </span>
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
                      New Component
                    </span>
                  </div>
                  {product.warrantyDetails ? (
                    <p className="text-xs text-gray-600">{product.warrantyDetails}</p>
                  ) : null}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 mb-6 space-y-1">
                  <span className="text-xs font-bold text-gray-800 block">
                    Condition Status: Unclassified
                  </span>
                  <p className="text-xs text-gray-500">
                    This catalogue record does not have an explicit condition assigned. Please verify part specifications before purchase.
                  </p>
                </div>
              )}

              {/* Stock Availability Badge */}
              <div className="flex items-center gap-2 mb-6">
                {product.inStock ? (
                  <div className="inline-flex items-center gap-2 text-xs font-bold text-green-700 bg-green-50 px-3 py-1.5 rounded-full border border-green-200">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span>In Stock — Dispatch Ready</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 text-xs font-bold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>Out of Stock / Backorder</span>
                  </div>
                )}
              </div>

              {/* Primary Fitment Scope Hint */}
              {product.fitmentHint && (
                <div className="rounded-xl bg-[#F8F9FA] border border-gray-200 p-4 mb-6 flex items-start gap-3">
                  <Car className="w-5 h-5 text-ember flex-shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <span className="font-bold text-gray-900 block mb-0.5">
                      Vehicle Fitment Scope
                    </span>
                    <span className="text-gray-600">{product.fitmentHint}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Purchasing Console */}
            <div className="space-y-4 pt-6 border-t border-gray-200">
              <ProductPurchaseActions
                productId={product.id}
                inStock={Boolean(product.inStock)}
                isDemo={Boolean(product.isDemo)}
              />

              {/* Policy Trust Strip */}
              <div className="grid grid-cols-2 gap-3 text-xs text-gray-600 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-ember flex-shrink-0" />
                  <span>Pan-India Courier Network</span>
                </div>
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-ember flex-shrink-0" />
                  <span>{STORE_POLICY_CONFIG.returnWindowDays}-Day Return Policy (Provisional)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Structured Information Tabs */}
      <div className="mb-12">
        <ProductTabs product={product} />
      </div>
    </div>
  );
}
