"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Package,
  Search,
  Plus,
  Edit2,
  ExternalLink,
  Tag,
  CheckCircle2,
  FileText,
  HelpCircle,
  Box,
  Filter,
  X,
  ShieldCheck,
  AlertTriangle,
  ArrowUpDown,
  Car,
} from "lucide-react";
import type { AdminProductListItem } from "@/features/admin/service";
import { formatMoney } from "@/lib/money";

interface AdminProductsClientProps {
  initialProducts: AdminProductListItem[];
  policyNotice?: React.ReactNode;
  errorMsg?: string | null;
}

export function AdminProductsClient({
  initialProducts,
  policyNotice,
  errorMsg,
}: AdminProductsClientProps) {
  const [products] = useState<AdminProductListItem[]>(initialProducts);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCondition, setSelectedCondition] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  // Computed counts
  const totalCount = products.length;
  const newCount = useMemo(() => products.filter((p) => p.condition === "new").length, [products]);
  const usedCount = useMemo(() => products.filter((p) => p.condition === "used").length, [products]);
  const draftCount = useMemo(() => products.filter((p) => p.status === "draft").length, [products]);
  const unclassifiedCount = useMemo(
    () => products.filter((p) => !p.condition || p.condition === "unclassified").length,
    [products]
  );

  // Unique categories & brands for dropdown filters
  const uniqueCategories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.categoryName) set.add(p.categoryName);
    });
    return Array.from(set).sort();
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Search query filter
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesSku = p.sku.toLowerCase().includes(q);
        const matchesBrand = (p.brandName || "").toLowerCase().includes(q);
        const matchesCat = (p.categoryName || "").toLowerCase().includes(q);
        const matchesFitment = (p.fitmentHint || "").toLowerCase().includes(q);
        if (!matchesName && !matchesSku && !matchesBrand && !matchesCat && !matchesFitment) {
          return false;
        }
      }

      // Condition filter
      if (selectedCondition !== "all") {
        if (selectedCondition === "new" && p.condition !== "new") return false;
        if (selectedCondition === "used" && p.condition !== "used") return false;
        if (
          selectedCondition === "unclassified" &&
          p.condition !== "unclassified" &&
          p.condition
        ) {
          return false;
        }
      }

      // Status filter
      if (selectedStatus !== "all") {
        if (p.status !== selectedStatus) return false;
      }

      // Category filter
      if (selectedCategory !== "all") {
        if (p.categoryName !== selectedCategory) return false;
      }

      return true;
    });
  }, [products, searchQuery, selectedCondition, selectedCategory, selectedStatus]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    selectedCondition !== "all" ||
    selectedCategory !== "all" ||
    selectedStatus !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCondition("all");
    setSelectedCategory("all");
    setSelectedStatus("all");
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Policy Notice if provided */}
      {policyNotice}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-900 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <button
          type="button"
          onClick={() => {
            setSelectedCondition("all");
            setSelectedStatus("all");
          }}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            selectedCondition === "all" && selectedStatus === "all"
              ? "bg-white border-ember shadow-xs ring-1 ring-ember/20"
              : "bg-white border-gray-200/90 hover:border-gray-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Total Products
            </span>
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700">
              <Box className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl font-black text-gray-900 mt-2 block">{totalCount}</span>
          <span className="text-[10px] text-gray-400 font-medium">All catalogue listings</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedCondition("new");
            setSelectedStatus("all");
          }}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            selectedCondition === "new"
              ? "bg-emerald-50/40 border-emerald-500 shadow-xs ring-1 ring-emerald-500/20"
              : "bg-white border-gray-200/90 hover:border-gray-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              Brand New
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <Tag className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl font-black text-emerald-900 mt-2 block">{newCount}</span>
          <span className="text-[10px] text-emerald-700 font-medium">New replacement parts</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedCondition("used");
            setSelectedStatus("all");
          }}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            selectedCondition === "used"
              ? "bg-amber-50/40 border-amber-500 shadow-xs ring-1 ring-amber-500/20"
              : "bg-white border-gray-200/90 hover:border-gray-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
              Pre-Owned
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
              <Tag className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl font-black text-amber-900 mt-2 block">{usedCount}</span>
          <span className="text-[10px] text-amber-700 font-medium">Certified tested spares</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedStatus("draft");
            setSelectedCondition("all");
          }}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            selectedStatus === "draft"
              ? "bg-purple-50/40 border-purple-500 shadow-xs ring-1 ring-purple-500/20"
              : "bg-white border-gray-200/90 hover:border-gray-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">
              Draft Listings
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl font-black text-purple-900 mt-2 block">{draftCount}</span>
          <span className="text-[10px] text-purple-700 font-medium">Unpublished drafts</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedCondition("unclassified");
            setSelectedStatus("all");
          }}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            selectedCondition === "unclassified"
              ? "bg-gray-100 border-gray-500 shadow-xs"
              : "bg-white border-gray-200/90 hover:border-gray-300 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Unclassified
            </span>
            <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500">
              <HelpCircle className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl font-black text-gray-700 mt-2 block">{unclassifiedCount}</span>
          <span className="text-[10px] text-gray-400 font-medium">Legacy items</span>
        </button>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-2xs overflow-hidden">
        {/* Search & Filter Toolbar */}
        <div className="p-4 sm:p-5 border-b border-gray-100 space-y-3.5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by product name, SKU, brand, or model..."
                className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-ember/20 focus:border-ember bg-gray-50/50 hover:bg-white transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Quick Dropdown Filters */}
            <div className="flex items-center gap-2 flex-wrap self-end md:self-auto">
              {/* Category Select */}
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="text-xs py-2 px-3 border border-gray-200 rounded-xl bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-ember/20 focus:border-ember"
              >
                <option value="all">All Categories</option>
                {uniqueCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {/* Status Select */}
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="text-xs py-2 px-3 border border-gray-200 rounded-xl bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-ember/20 focus:border-ember"
              >
                <option value="all">All Statuses</option>
                <option value="published">Published</option>
                <option value="draft">Draft (Unpublished)</option>
                <option value="archived">Archived</option>
              </select>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-bold px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>

          {/* Active Filter Pills Bar */}
          <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
            <span className="font-medium">
              Showing <strong className="text-gray-900 font-bold">{filteredProducts.length}</strong> of{" "}
              {totalCount} products
            </span>
          </div>
        </div>

        {/* Product Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-100">
              <tr>
                <th className="py-3 px-4">Product Details</th>
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4">Condition</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Brand</th>
                <th className="py-3 px-4">Price (₹)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProducts.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50/80 transition-colors">
                  {/* Product Details with Thumbnail */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center shadow-2xs">
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                      <div className="min-w-0 max-w-xs sm:max-w-sm">
                        <Link
                          href={`/admin/products/${p.id}/edit`}
                          className="font-bold text-gray-900 hover:text-ember block truncate transition-colors"
                        >
                          {p.name}
                        </Link>
                        {p.fitmentHint && (
                          <span className="text-[10px] text-gray-500 block truncate font-medium">
                            {p.fitmentHint}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* SKU */}
                  <td className="py-3 px-4 font-mono text-[11px] text-gray-700 font-medium">
                    {p.sku}
                  </td>

                  {/* Condition Badge */}
                  <td className="py-3 px-4">
                    {p.condition === "new" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                        <span>Brand New</span>
                      </span>
                    ) : p.condition === "used" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                        <span>Pre-Owned</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                        <span>Unclassified</span>
                      </span>
                    )}
                  </td>

                  {/* Category */}
                  <td className="py-3 px-4 text-gray-700 font-medium">
                    {p.categoryName}
                  </td>

                  {/* Brand */}
                  <td className="py-3 px-4 text-gray-800 font-bold">
                    {p.brandName}
                  </td>

                  {/* Price */}
                  <td className="py-3 px-4 font-bold text-gray-900">
                    {formatMoney(p.priceMinor)}
                  </td>

                  {/* Status Badge */}
                  <td className="py-3 px-4">
                    {p.status === "draft" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-200">
                        Draft
                      </span>
                    ) : p.status === "archived" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200">
                        Archived
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Live
                      </span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href={`/admin/products/${p.id}/edit`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-ember/5 hover:border-ember hover:text-ember font-bold text-[11px] transition-colors shadow-2xs"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Edit</span>
                      </Link>

                      {p.status !== "draft" && (
                        <Link
                          href={`/products/${p.id}`}
                          target="_blank"
                          title="Open in storefront"
                          className="p-1 rounded-lg text-gray-400 hover:text-ember hover:bg-gray-100 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 px-4 text-center">
                    <div className="max-w-xs mx-auto space-y-2">
                      <Package className="w-8 h-8 text-gray-400 mx-auto" />
                      <p className="text-sm font-bold text-gray-800">No products found</p>
                      <p className="text-xs text-gray-500">
                        Try adjusting your search query or reset the active filters.
                      </p>
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-ember hover:underline"
                        >
                          Clear all filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
