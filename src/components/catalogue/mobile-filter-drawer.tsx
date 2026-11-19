"use client";

import React, { useState, useEffect } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { ProductFilters } from "./product-filters";
import type { FilterFacetsDTO } from "@/features/catalogue/schemas";
import { useSearchParams } from "next/navigation";

interface MobileFilterDrawerProps {
  facets: FilterFacetsDTO;
  basePath?: string;
  totalCount?: number;
}

export function MobileFilterDrawer({ facets, basePath = "/search", totalCount }: MobileFilterDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const searchParams = useSearchParams();

  // Count active filters
  const activeCount = [
    searchParams.get("category"),
    searchParams.get("subcategory"),
    searchParams.get("brand"),
    searchParams.get("condition"),
    searchParams.get("minPrice") || searchParams.get("maxPrice"),
    searchParams.get("make"),
    searchParams.get("model"),
  ].filter(Boolean).length;

  // Handle ESC key press
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="lg:hidden inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-gray-300 text-gray-800 text-xs font-semibold shadow-xs hover:border-ember transition-colors"
      >
        <SlidersHorizontal className="w-4 h-4 text-ember" />
        <span>Filters</span>
        {activeCount > 0 && (
          <span className="w-5 h-5 rounded-full bg-ember text-white font-black text-[10px] flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </button>

      {/* Backdrop & Slide-Over Panel */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Dimmed backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer content */}
          <div className="relative w-full max-w-sm bg-white border-l border-gray-200 h-full overflow-y-auto p-6 z-10 flex flex-col justify-between shadow-2xl">
            <div>
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-ember" />
                  <h2 className="text-base font-bold text-gray-900">Filter Parts</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                  aria-label="Close filters"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <ProductFilters
                facets={facets}
                basePath={basePath}
                isMobile
                onApplyMobile={() => setIsOpen(false)}
              />
            </div>

            <div className="pt-6 border-t border-gray-200 mt-6 sticky bottom-0 bg-white pb-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="btn-primary w-full py-3 text-xs font-bold uppercase tracking-wider rounded-xl shadow-md"
              >
                <span>Show {totalCount ? `${totalCount} Results` : "Results"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
