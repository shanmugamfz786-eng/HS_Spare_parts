import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductByIdOrSlug } from "@/server/catalogue/catalogue-service";
import { ProductGallery } from "@/components/catalogue/product-gallery";
import { ProductPurchaseActions } from "@/components/catalogue/product-purchase-actions";
import { ProductReviews } from "@/components/reviews/product-reviews";
import { STORE_POLICY_CONFIG } from "@/lib/constants/store-config";
import { formatMoney } from "@/lib/money";
import {
  ShieldCheck,
  Truck,
  RotateCcw,
  Info,
  CheckCircle2,
  AlertTriangle,
  Car,
  Layers,
  FileText,
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex items-center space-x-2 text-xs text-gray-400">
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
          <li className="text-paper font-semibold truncate max-w-xs">{product.name}</li>
        </ol>
      </nav>

      {/* Demo Catalogue Transparency Alert */}
      {product.isDemo && (
        <div className="mb-8 p-3.5 rounded-brand bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block text-paper">
              Demo Catalogue Item
            </span>
            <span className="text-gray-300">
              This product record is a demonstration layout component. Specifications and fitments
              demonstrate the catalogue schema structure. Real inventory and verified compatibility
              records will be populated directly from PostgreSQL.
            </span>
          </div>
        </div>
      )}

      {/* Product Top Grid: Gallery & Information */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-12">
        {/* Left Column: Product Image Gallery */}
        <div>
          <ProductGallery
            images={product.images}
            productName={product.name}
            brandName={product.brandName}
            sku={product.sku}
            isOem={product.isOem}
          />
        </div>

        {/* Right Column: Key Details & Purchasing Actions */}
        <div className="flex flex-col justify-between">
          <div>
            {/* Brand, Category & OEM Badge */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-ember">
                  {product.brandName}
                </span>
                <span className="text-gray-600">•</span>
                <span className="text-xs text-gray-400">{product.categoryName}</span>
              </div>

              {product.isOem ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-success bg-success/15 px-2.5 py-0.5 rounded-pill border border-success/30">
                  <ShieldCheck className="w-3 h-3" />
                  <span>OES Genuine</span>
                </span>
              ) : (
                <span className="text-[11px] font-medium text-gray-400 bg-ink-raised px-2.5 py-0.5 rounded-pill border border-gray-800">
                  Tier-1 Aftermarket
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-paper tracking-tight mb-3">
              {product.name}
            </h1>

            {/* SKU and OEM References */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 mb-6 font-mono">
              <span className="bg-ink-raised px-2 py-1 rounded border border-gray-800">
                SKU: <strong className="text-paper">{product.sku}</strong>
              </span>
              {product.oemReference && (
                <span className="bg-ink-raised px-2 py-1 rounded border border-gray-800">
                  OEM Ref: <strong className="text-paper">{product.oemReference}</strong>
                </span>
              )}
            </div>

            {/* Price Box */}
            <div className="p-4 rounded-brand bg-ink-raised border border-gray-800 mb-6">
              <div className="flex items-baseline gap-3 mb-1">
                <span className="text-2xl sm:text-3xl font-black text-paper">
                  {formatMoney(product.priceMinor)}
                </span>
                {product.compareAtPriceMinor && (
                  <span className="text-sm text-gray-400 line-through">
                    {formatMoney(product.compareAtPriceMinor)}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-gray-400">
                {STORE_POLICY_CONFIG.taxPolicy} • {STORE_POLICY_CONFIG.shippingClaim}
              </span>
            </div>

            {/* Product Variants (if available) */}
            {product.variants.length > 1 && (
              <div className="mb-6">
                <label className="block text-xs font-bold uppercase tracking-wider text-paper mb-2">
                  Available Variants / Positions
                </label>
                <div className="flex flex-wrap gap-2">
                  {product.variants.map((v) => (
                    <div
                      key={v.id}
                      className="px-3 py-1.5 rounded-brand bg-ink-raised border border-gray-700 text-xs text-paper flex items-center gap-2 cursor-pointer hover:border-ember"
                    >
                      <Layers className="w-3.5 h-3.5 text-ember" />
                      <span>{v.sku}</span>
                      {v.priceOverrideMinor && (
                        <span className="text-ember font-bold">
                          {formatMoney(v.priceOverrideMinor)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Primary Fitment Scope Hint */}
            {product.fitmentHint && (
              <div className="rounded-brand bg-ink-raised border border-gray-800 p-3.5 mb-6 flex items-start gap-2.5">
                <Car className="w-4 h-4 text-ember flex-shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-bold text-paper block mb-0.5">
                    Primary Application Scope
                  </span>
                  <span className="text-gray-300">{product.fitmentHint}</span>
                </div>
              </div>
            )}
          </div>

          {/* Purchasing Actions */}
          <div className="space-y-4 pt-4 border-t border-gray-800">
            <ProductPurchaseActions
              productId={product.id}
              inStock={Boolean(product.inStock)}
              isDemo={Boolean(product.isDemo)}
            />

            {/* Policy Badges */}
            <div className="grid grid-cols-2 gap-3 text-xs text-gray-400 pt-2">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-ember flex-shrink-0" />
                <span>Express Courier Dispatch (Provisional)</span>
              </div>
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-ember flex-shrink-0" />
                <span>{STORE_POLICY_CONFIG.returnWindowDays}-Day Return Policy (Provisional)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Product Detail Lower Tabs / Specifications & Fitment Tables */}
      <div className="space-y-10">
        {/* 1. Description */}
        {product.description && (
          <div className="rounded-card bg-ink-raised border border-gray-800 p-6 sm:p-8">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ember flex items-center gap-2 mb-4 pb-2 border-b border-gray-800">
              <FileText className="w-4 h-4" />
              <span>Product Description & Engineering Overview</span>
            </h2>
            <div className="text-xs sm:text-sm text-gray-300 leading-relaxed space-y-3">
              <p>{product.description}</p>
            </div>
          </div>
        )}

        {/* 2. Technical Specifications Table */}
        <div className="rounded-card bg-ink-raised border border-gray-800 p-6 sm:p-8">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ember flex items-center gap-2 mb-4 pb-2 border-b border-gray-800">
            <ShieldCheck className="w-4 h-4" />
            <span>Technical Specifications</span>
          </h2>

          {product.specifications.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400 uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 px-3">Specification Property</th>
                    <th className="py-2.5 px-3">Engineering Value / Standard</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {product.specifications.map((spec, i) => (
                    <tr key={i} className="hover:bg-ink/50 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-gray-300">{spec.name}</td>
                      <td className="py-2.5 px-3 text-paper font-mono">{spec.value}</td>
                    </tr>
                  ))}
                  {product.weightGrams && (
                    <tr className="hover:bg-ink/50 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-gray-300">Net Weight</td>
                      <td className="py-2.5 px-3 text-paper font-mono">
                        {product.weightGrams} grams ({product.weightGrams / 1000} kg)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-gray-400">
              Standard manufacturer specifications apply. Refer to the OEM part number for exact
              tolerance values.
            </p>
          )}
        </div>

        {/* 3. Verified Vehicle Fitment Matrix */}
        <div className="rounded-card bg-ink-raised border border-gray-800 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-2 border-b border-gray-800">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ember flex items-center gap-2">
              <Car className="w-4 h-4" />
              <span>Verified Vehicle Compatibility Matrix</span>
            </h2>

            <span className="text-[11px] text-gray-400">
              {product.fitments.length} verified applications
            </span>
          </div>

          {product.fitments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400 uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 px-3">Make & Model</th>
                    <th className="py-2.5 px-3">Generation / Engine</th>
                    <th className="py-2.5 px-3">Year Model Range</th>
                    <th className="py-2.5 px-3">Compatibility Standard</th>
                    <th className="py-2.5 px-3">Application Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {product.fitments.map((fit) => (
                    <tr key={fit.id} className="hover:bg-ink/50 transition-colors">
                      <td className="py-3 px-3 font-bold text-paper">
                        {fit.makeName} {fit.modelName}
                      </td>
                      <td className="py-3 px-3 text-gray-300">
                        {fit.variantGeneration || "Standard"} • {fit.variantEngine || "All Engines"}
                      </td>
                      <td className="py-3 px-3 text-gray-300 font-mono">
                        {fit.yearStart} – {fit.yearEnd ?? "Present"}
                      </td>
                      <td className="py-3 px-3">
                        {fit.verifiedStatus === "verified" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-success">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Verified OEM</span>
                          </span>
                        ) : fit.verifiedStatus === "oem_cross_ref" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400">
                            <Info className="w-3.5 h-3.5" />
                            <span>Cross-Reference</span>
                          </span>
                        ) : (
                          <span className="text-gray-400 text-[11px]">Unverified Standard</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-gray-400 text-[11px]">
                        {fit.notes || "Direct drop-in replacement"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 rounded-brand bg-ink border border-gray-800 text-xs text-gray-400 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-paper block">
                  Vehicle Compatibility Unconfirmed
                </span>
                <span>
                  No verified fitment record exists in the database for this specific SKU.
                  Consult your vehicle service manual or verify the OEM reference before ordering.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 4. Customer Reviews Section */}
        <ProductReviews productId={product.id} />
      </div>
    </div>
  );
}
