"use client";

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  X,
  RotateCcw,
  SlidersHorizontal,
  ChevronDown,
  Car,
} from "lucide-react";
import type { FilterFacetsDTO } from "@/features/catalogue/schemas";
import { NAVBAR_CATEGORIES } from "@/lib/constants/navigation";
import { POPULAR_VEHICLE_MAKES } from "@/lib/constants/demo-catalog";

interface ProductFiltersProps {
  facets: FilterFacetsDTO;
  basePath?: string;
  isMobile?: boolean;
  onApplyMobile?: () => void;
}

export function ProductFilters({
  facets,
  basePath = "/search",
  isMobile = false,
  onApplyMobile,
}: ProductFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Active query parameters
  const activeQuery = searchParams.get("q") || "";
  const activeCategory = searchParams.get("category") || "";
  const activeSubcategory = searchParams.get("subcategory") || "";
  const activeBrands = searchParams.get("brand")?.split(",").filter(Boolean) || [];
  const activeCondition = searchParams.get("condition") || "";
  const activeMinPrice = searchParams.get("minPrice") || "";
  const activeMaxPrice = searchParams.get("maxPrice") || "";
  const activeMake = searchParams.get("make") || "";
  const activeModel = searchParams.get("model") || "";
  const activeYear = searchParams.get("year") || "";
  const activeVariant = searchParams.get("variant") || "";
  const activeInStock = searchParams.get("inStockOnly") === "true";

  // Local state for price inputs
  const [minPriceInput, setMinPriceInput] = useState(activeMinPrice);
  const [maxPriceInput, setMaxPriceInput] = useState(activeMaxPrice);

  // Helper to update URL query params
  function updateFilters(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());

    // Reset pagination to page 1 whenever filters change
    params.delete("page");

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    const newUrl = `${basePath}?${params.toString()}`;
    router.push(newUrl);

    if (isMobile && onApplyMobile) {
      onApplyMobile();
    }
  }

  // Brand toggle
  function handleBrandToggle(brandSlug: string) {
    const isSelected = activeBrands.includes(brandSlug);
    let newBrands: string[];
    if (isSelected) {
      newBrands = activeBrands.filter((b) => b !== brandSlug);
    } else {
      newBrands = [...activeBrands, brandSlug];
    }
    updateFilters({ brand: newBrands.length > 0 ? newBrands.join(",") : null });
  }

  // Price range apply
  function handlePriceApply(e: React.FormEvent) {
    e.preventDefault();
    updateFilters({
      minPrice: minPriceInput ? minPriceInput.trim() : null,
      maxPrice: maxPriceInput ? maxPriceInput.trim() : null,
    });
  }

  // Clear all filters
  function handleClearAll() {
    const params = new URLSearchParams();
    if (activeQuery) {
      params.set("q", activeQuery); // preserve search term
    }
    router.push(`${basePath}?${params.toString()}`);
    setMinPriceInput("");
    setMaxPriceInput("");

    if (isMobile && onApplyMobile) {
      onApplyMobile();
    }
  }

  const hasActiveFilters = Boolean(
    activeCategory ||
      activeSubcategory ||
      activeBrands.length > 0 ||
      activeCondition ||
      activeMinPrice ||
      activeMaxPrice ||
      activeMake ||
      activeModel ||
      activeYear ||
      activeVariant ||
      activeInStock
  );

  return (
    <div className="space-y-5">
      {/* Active Filter Pills Bar */}
      {hasActiveFilters && (
        <div className="p-4 rounded-xl bg-white border border-gray-200/90 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-900">
              Active Filters
            </span>
            <button
              type="button"
              onClick={handleClearAll}
              className="text-[11px] font-semibold text-ember hover:underline flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Clear All</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {activeCondition && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-800 border border-gray-200 text-xs font-medium">
                <span>Condition: {activeCondition === "used" ? "Pre-Owned" : "New"}</span>
                <button
                  type="button"
                  onClick={() => updateFilters({ condition: null })}
                  className="hover:text-ember"
                  aria-label="Remove condition filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {activeCategory && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-800 border border-gray-200 text-xs font-medium">
                <span>Category: {activeCategory}</span>
                <button
                  type="button"
                  onClick={() => updateFilters({ category: null, subcategory: null })}
                  className="hover:text-ember"
                  aria-label="Remove category filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {activeSubcategory && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-800 border border-gray-200 text-xs font-medium">
                <span>Sub: {activeSubcategory}</span>
                <button
                  type="button"
                  onClick={() => updateFilters({ subcategory: null })}
                  className="hover:text-ember"
                  aria-label="Remove subcategory filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {activeBrands.map((b) => (
              <span
                key={b}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-800 border border-gray-200 text-xs font-medium"
              >
                <span>Brand: {b}</span>
                <button
                  type="button"
                  onClick={() => handleBrandToggle(b)}
                  className="hover:text-ember"
                  aria-label={`Remove brand ${b}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {(activeMinPrice || activeMaxPrice) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-800 border border-gray-200 text-xs font-medium">
                <span>
                  Price: ₹{activeMinPrice || "0"} – ₹{activeMaxPrice || "Any"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setMinPriceInput("");
                    setMaxPriceInput("");
                    updateFilters({ minPrice: null, maxPrice: null });
                  }}
                  className="hover:text-ember"
                  aria-label="Remove price filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {activeMake && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-800 border border-gray-200 text-xs font-medium">
                <span>Vehicle: {activeMake}</span>
                <button
                  type="button"
                  onClick={() =>
                    updateFilters({
                      make: null,
                      model: null,
                      year: null,
                      variant: null,
                    })
                  }
                  className="hover:text-ember"
                  aria-label="Remove vehicle filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {activeInStock && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-800 border border-gray-200 text-xs font-medium">
                <span>In-Stock Only</span>
                <button
                  type="button"
                  onClick={() => updateFilters({ inStockOnly: null })}
                  className="hover:text-ember"
                  aria-label="Remove stock filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        </div>
      )}

      {/* 0. Product Condition Filter */}
      <div className="rounded-xl bg-white border border-gray-200/90 shadow-sm p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-3 pb-2 border-b border-gray-100 flex items-center justify-between">
          <span>Product Condition</span>
        </h3>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => updateFilters({ condition: null })}
            className={`py-2 px-1 text-center text-xs font-semibold rounded-lg border transition-all ${
              !activeCondition
                ? "bg-gray-900 text-white border-gray-900 shadow-xs"
                : "bg-gray-50 text-gray-700 border-gray-200 hover:border-gray-300"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => updateFilters({ condition: "new" })}
            className={`py-2 px-1 text-center text-xs font-semibold rounded-lg border transition-all ${
              activeCondition === "new"
                ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                : "bg-gray-50 text-gray-700 border-gray-200 hover:border-gray-300"
            }`}
          >
            New
          </button>
          <button
            type="button"
            onClick={() => updateFilters({ condition: "used" })}
            className={`py-2 px-1 text-center text-xs font-semibold rounded-lg border transition-all ${
              activeCondition === "used"
                ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                : "bg-gray-50 text-gray-700 border-gray-200 hover:border-gray-300"
            }`}
          >
            Pre-Owned
          </button>
        </div>
      </div>

      {/* 1. Vehicle Fitment Filter Accordion */}
      <div className="rounded-xl bg-white border border-gray-200/90 shadow-sm p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
          <span className="flex items-center gap-1.5">
            <Car className="w-3.5 h-3.5 text-ember" />
            <span>Vehicle Fitment</span>
          </span>
        </h3>

        <div className="space-y-2.5">
          <div>
            <label htmlFor="filter-make" className="block text-[11px] font-semibold text-gray-600 mb-1">
              Vehicle Make
            </label>
            <select
              id="filter-make"
              value={activeMake}
              onChange={(e) =>
                updateFilters({
                  make: e.target.value || null,
                  model: null,
                  year: null,
                  variant: null,
                })
              }
              className="w-full bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-ember"
            >
              <option value="">All Vehicle Makes</option>
              {POPULAR_VEHICLE_MAKES.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {activeMake && (
            <div>
              <label htmlFor="filter-model" className="block text-[11px] font-semibold text-gray-600 mb-1">
                Model
              </label>
              <select
                id="filter-model"
                value={activeModel}
                onChange={(e) =>
                  updateFilters({
                    model: e.target.value || null,
                    year: null,
                    variant: null,
                  })
                }
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-ember"
              >
                <option value="">All Models</option>
                {POPULAR_VEHICLE_MAKES.find((m) => m.slug === activeMake)?.models.map((mod) => (
                  <option key={mod.slug} value={mod.slug}>
                    {mod.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* 2. Categories & Subcategories List */}
      <div className="rounded-xl bg-white border border-gray-200/90 shadow-sm p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
          <span className="flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-ember" />
            <span>Categories</span>
          </span>
        </h3>

        <ul className="space-y-1 text-xs">
          {NAVBAR_CATEGORIES.filter((c) => !c.isDirectLink).map((cat) => {
            const isCatSelected = activeCategory.toLowerCase() === cat.slug.toLowerCase();
            return (
              <li key={cat.id}>
                <button
                  type="button"
                  onClick={() =>
                    updateFilters({
                      category: isCatSelected ? null : cat.slug,
                      subcategory: null,
                    })
                  }
                  className={`w-full text-left py-1.5 px-2 rounded-lg flex items-center justify-between transition-colors ${
                    isCatSelected
                      ? "bg-ember text-white font-bold"
                      : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  <span className="truncate">{cat.name}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${isCatSelected ? "rotate-180" : ""}`}
                  />
                </button>

                {/* Subcategories */}
                {isCatSelected && cat.subcategories.length > 0 && (
                  <ul className="ml-3 mt-1.5 space-y-1 pl-2 border-l border-gray-200">
                    {cat.subcategories.map((sub) => {
                      const isSubSelected = activeSubcategory.toLowerCase() === sub.slug.toLowerCase();
                      return (
                        <li key={sub.slug}>
                          <button
                            type="button"
                            onClick={() =>
                              updateFilters({
                                subcategory: isSubSelected ? null : sub.slug,
                              })
                            }
                            className={`w-full text-left py-1 px-1.5 rounded text-[11px] transition-colors ${
                              isSubSelected
                                ? "text-ember font-bold bg-ember/5"
                                : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                            }`}
                          >
                            • {sub.name}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* 3. Brands Checkbox List */}
      <div className="rounded-xl bg-white border border-gray-200/90 shadow-sm p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-3 pb-2 border-b border-gray-100">
          Brands
        </h3>

        <div className="space-y-2 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
          {facets.brands.map((b) => {
            const isChecked = activeBrands.includes(b.value) || activeBrands.includes(b.label.toLowerCase());
            return (
              <label
                key={b.value}
                className="flex items-center justify-between text-xs text-gray-700 hover:text-gray-900 cursor-pointer py-0.5"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleBrandToggle(b.value)}
                    className="w-3.5 h-3.5 rounded border-gray-300 bg-white text-ember focus:ring-ember focus:ring-offset-0"
                  />
                  <span>{b.label}</span>
                </div>
                <span className="text-[10px] text-gray-400 font-mono">
                  ({b.count})
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* 4. Price Range Filter */}
      <div className="rounded-xl bg-white border border-gray-200/90 shadow-sm p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-3 pb-2 border-b border-gray-100">
          Price Range (₹)
        </h3>

        <form onSubmit={handlePriceApply} className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="price-min" className="block text-[10px] text-gray-500 mb-0.5">
                Min (₹)
              </label>
              <input
                id="price-min"
                type="number"
                min="0"
                step="50"
                placeholder="0"
                value={minPriceInput}
                onChange={(e) => setMinPriceInput(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-ember"
              />
            </div>
            <div>
              <label htmlFor="price-max" className="block text-[10px] text-gray-500 mb-0.5">
                Max (₹)
              </label>
              <input
                id="price-max"
                type="number"
                min="0"
                step="50"
                placeholder="50000"
                value={maxPriceInput}
                onChange={(e) => setMaxPriceInput(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-ember"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full btn-primary py-2 px-3 text-xs font-semibold rounded-lg"
          >
            Apply Price Filter
          </button>
        </form>
      </div>

      {/* 5. Stock Availability Filter */}
      <div className="rounded-xl bg-white border border-gray-200/90 shadow-sm p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-3 pb-2 border-b border-gray-100">
          Stock Availability
        </h3>
        <label className="flex items-center justify-between text-xs text-gray-700 hover:text-gray-900 cursor-pointer py-0.5">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={activeInStock}
              onChange={(e) => updateFilters({ inStockOnly: e.target.checked ? "true" : null })}
              className="w-3.5 h-3.5 rounded border-gray-300 bg-white text-ember focus:ring-ember focus:ring-offset-0"
            />
            <span>In-Stock Items Only</span>
          </div>
        </label>
      </div>
    </div>
  );
}
