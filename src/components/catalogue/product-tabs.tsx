"use client";

import React, { useState } from "react";
import {
  FileText,
  ShieldCheck,
  Car,
  Truck,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { ProductReviews } from "@/components/reviews/product-reviews";
import { STORE_POLICY_CONFIG } from "@/lib/constants/store-config";
import type { ProductDetailDTO } from "@/features/catalogue/schemas";

interface ProductTabsProps {
  product: ProductDetailDTO;
}

export function ProductTabs({ product }: ProductTabsProps) {
  const [activeTab, setActiveTab] = useState<
    "description" | "specifications" | "fitment" | "condition" | "shipping" | "reviews"
  >("description");

  const isUsed = product.condition === "used";

  const tabs = [
    { id: "description" as const, label: "Description", icon: FileText },
    ...(isUsed
      ? [
          {
            id: "condition" as const,
            label: "Condition & Inspection",
            icon: AlertCircle,
          },
        ]
      : []),
    { id: "specifications" as const, label: "Specifications", icon: ShieldCheck },
    { id: "fitment" as const, label: "Vehicle Fitment", icon: Car },
    { id: "shipping" as const, label: "Shipping & Returns", icon: Truck },
    { id: "reviews" as const, label: "Customer Reviews", icon: MessageSquare },
  ];

  return (
    <div className="rounded-2xl bg-white border border-gray-200/90 shadow-sm overflow-hidden">
      {/* Tabs Bar */}
      <div className="flex items-center gap-1 border-b border-gray-200/90 bg-[#F8F9FA] px-4 pt-3 overflow-x-auto scrollbar-thin">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`inline-flex items-center gap-2 px-5 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap focus-visible:outline-none ${
                isActive
                  ? "border-ember text-ember bg-white rounded-t-xl shadow-xs"
                  : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-200/60 rounded-t-xl"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-ember" : "text-gray-400"}`} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div className="p-6 sm:p-8">
        {/* 1. Description Tab */}
        {activeTab === "description" && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-gray-900">
              Product Overview &amp; Engineering Specifications
            </h3>
            {product.description ? (
              <p className="text-xs sm:text-sm text-gray-700 leading-relaxed">
                {product.description}
              </p>
            ) : (
              <p className="text-xs text-gray-500 italic">
                Precision OEM replacement component manufactured according to automotive industrial tolerances.
              </p>
            )}

            <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-gray-600">
              <div className="p-4 rounded-xl bg-[#F8F9FA] border border-gray-100">
                <span className="font-bold text-gray-900 block mb-1">Manufacturer</span>
                <span>{product.brandName}</span>
              </div>
              <div className="p-4 rounded-xl bg-[#F8F9FA] border border-gray-100">
                <span className="font-bold text-gray-900 block mb-1">Part SKU Code</span>
                <span className="font-mono">{product.sku}</span>
              </div>
              <div className="p-4 rounded-xl bg-[#F8F9FA] border border-gray-100">
                <span className="font-bold text-gray-900 block mb-1">Catalogue Subsystem</span>
                <span>{product.categoryName}</span>
              </div>
            </div>
          </div>
        )}

        {/* Pre-Owned Condition & Inspection Tab */}
        {activeTab === "condition" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-bold text-gray-900 mb-1">
                Pre-Owned Part Inspection &amp; Wear Disclosures
              </h3>
              <p className="text-xs text-gray-500">
                Transparent condition report recorded by our catalogue inspection team prior to listing.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-200">
                <span className="text-xs font-bold text-amber-900 block mb-1.5">Condition Assessment</span>
                <p className="text-xs text-gray-700 leading-relaxed">
                  {product.conditionNotes || "No intake assessment notes recorded."}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-200">
                <span className="text-xs font-bold text-amber-900 block mb-1.5">Visible Wear or Cosmetic Disclosures</span>
                <p className="text-xs text-gray-700 leading-relaxed">
                  {product.visibleWearOrDefects || "No visible cosmetic defects recorded."}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                <span className="text-xs font-bold text-gray-900 block mb-1.5">Verification &amp; Bench Testing</span>
                <p className="text-xs text-gray-700 leading-relaxed">
                  {product.testedStatus || "Testing status not recorded for this component."}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                <span className="text-xs font-bold text-gray-900 block mb-1.5">Warranty &amp; Replacement Terms</span>
                <p className="text-xs text-gray-700 leading-relaxed">
                  {product.warrantyDetails || "Standard terms apply (no supplemental store warranty configured)."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 2. Specifications Tab */}
        {activeTab === "specifications" && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-gray-900">
              Technical &amp; Material Specifications
            </h3>
            {product.specifications.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4 rounded-l-lg">Specification Property</th>
                      <th className="py-3 px-4 rounded-r-lg">Engineering Value / Standard</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {product.specifications.map((spec, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4 font-semibold text-gray-800">{spec.name}</td>
                        <td className="py-3 px-4 text-gray-600">{spec.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-gray-500 italic">
                Standard manufacturer dimensions and tolerance specifications apply.
              </p>
            )}
          </div>
        )}

        {/* 3. Vehicle Fitment Tab */}
        {activeTab === "fitment" && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-gray-900">
              Vehicle Fitment Compatibility
            </h3>
            {product.fitments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4 rounded-l-lg">Make &amp; Model</th>
                      <th className="py-3 px-4">Years</th>
                      <th className="py-3 px-4">Engine / Variant</th>
                      <th className="py-3 px-4 rounded-r-lg">Position / Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {product.fitments.map((fit, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4 font-bold text-gray-900">
                          {fit.makeName} {fit.modelName}
                        </td>
                        <td className="py-3 px-4 text-gray-600">
                          {fit.yearStart ? `${fit.yearStart} – ${fit.yearEnd || "Present"}` : "All Years"}
                        </td>
                        <td className="py-3 px-4 text-gray-600">{fit.variantEngine || "All Variants"}</td>
                        <td className="py-3 px-4 text-gray-600">{fit.notes || "Direct Bolt-on Replacement"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-gray-500">
                Universal application across catalogued engine codes. Please check OEM part reference or consult our specialist desk.
              </p>
            )}
          </div>
        )}

        {/* 4. Shipping & Returns Tab */}
        {activeTab === "shipping" && (
          <div className="space-y-6">
            <h3 className="text-base font-bold text-gray-900">
              Shipping Guidelines &amp; Return Policy (Provisional)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-gray-600 leading-relaxed">
              <div className="p-5 rounded-xl bg-[#F8F9FA] border border-gray-200">
                <h4 className="font-bold text-gray-900 mb-2 flex items-center gap-1.5 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span>Pan-India Courier Network</span>
                </h4>
                <p>
                  {STORE_POLICY_CONFIG.shippingClaim}. Packaging standards designed to protect fragile lighting and mechanical components in transit.
                </p>
              </div>
              <div className="p-5 rounded-xl bg-[#F8F9FA] border border-gray-200">
                <h4 className="font-bold text-gray-900 mb-2 flex items-center gap-1.5 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span>{STORE_POLICY_CONFIG.returnWindowDays}-Day Return Policy (Provisional)</span>
                </h4>
                <p>
                  {STORE_POLICY_CONFIG.returnPolicyNote}. Eligible for uninstalled parts returned in their original packaging.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 5. Customer Reviews Tab */}
        {activeTab === "reviews" && (
          <div id="customer-reviews" className="space-y-6">
            <ProductReviews productId={product.id} />
          </div>
        )}
      </div>
    </div>
  );
}
