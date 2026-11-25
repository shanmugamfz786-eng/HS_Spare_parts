"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Layers,
  Edit2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  X,
  Search,
  Plus,
  FolderTree,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Package,
  FolderCheck,
  ArrowLeft,
  Tag,
  Car,
  Wrench,
  Sparkles,
  Grid,
  BarChart3,
  Filter,
} from "lucide-react";
import { AdminSingleImageUploader } from "./admin-single-image-uploader";
import {
  updateAdminCategoryImageAction,
  createAdminCategoryAction,
} from "@/features/admin/actions";
import { CLOUDINARY_FOLDERS } from "@/lib/cloudinary-shared";
import type { AdminCategoryItem, AdminProductListItem } from "@/features/admin/service";
import {
  APPROVED_CATEGORIES,
  TOTAL_APPROVED_SUBCATEGORIES_COUNT,
  resolveCanonicalCategorySlug,
} from "@/lib/constants/approved-catalogue";
import { NAVBAR_CATEGORIES } from "@/lib/constants/navigation";
import { formatMoney } from "@/lib/money";

export interface BrandFilterItem {
  id: string;
  name: string;
  shortName: string;
  oemBrandName: string;
  keywords: string[];
}

export const TARGET_CAR_BRANDS: BrandFilterItem[] = [
  {
    id: "all",
    name: "All Car Brands",
    shortName: "All Brands",
    oemBrandName: "Genuine OEM",
    keywords: [],
  },
  {
    id: "maruti",
    name: "Maruti Suzuki",
    shortName: "Maruti",
    oemBrandName: "Maruti Suzuki Genuine",
    keywords: ["maruti", "suzuki", "swift", "baleno", "dzire", "brezza", "ertiga", "wagon r", "alto", "celerio"],
  },
  {
    id: "hyundai",
    name: "Hyundai",
    shortName: "Hyundai",
    oemBrandName: "Hyundai Mobis",
    keywords: ["hyundai", "creta", "i20", "venue", "verna", "santro", "i10", "aura"],
  },
  {
    id: "tata",
    name: "Tata Motors",
    shortName: "Tata",
    oemBrandName: "Tata Genuine Parts",
    keywords: ["tata", "nexon", "harrier", "safari", "altroz", "punch", "tiago", "tigor"],
  },
  {
    id: "mahindra",
    name: "Mahindra",
    shortName: "Mahindra",
    oemBrandName: "Mahindra Genuine Parts",
    keywords: ["mahindra", "scorpio", "thar", "xuv700", "xuv300", "bolero"],
  },
  {
    id: "toyota",
    name: "Toyota",
    shortName: "Toyota",
    oemBrandName: "Toyota Genuine Parts",
    keywords: ["toyota", "innova", "fortuner", "glanza", "hyryder", "etios"],
  },
  {
    id: "honda",
    name: "Honda",
    shortName: "Honda",
    oemBrandName: "Honda Genuine Parts",
    keywords: ["honda", "city", "amaze", "jazz", "wr-v", "elevate"],
  },
  {
    id: "vw",
    name: "Volkswagen / Skoda",
    shortName: "VW / Skoda",
    oemBrandName: "Volkswagen Genuine",
    keywords: ["volkswagen", "vw", "polo", "vento", "taigun", "skoda", "rapid", "kushaq", "slavia"],
  },
];

interface AdminCategoriesClientProps {
  initialCategories: AdminCategoryItem[];
  initialProducts?: AdminProductListItem[];
}

export function AdminCategoriesClient({
  initialCategories,
  initialProducts = [],
}: AdminCategoriesClientProps) {
  const [categories, setCategories] = useState<AdminCategoryItem[]>(initialCategories);
  const [products] = useState<AdminProductListItem[]>(initialProducts);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<AdminCategoryItem | null>(null);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Record<string, boolean>>({});

  // View Mode: 'explorer' (Deep-dive category & products) | 'matrix' (Category x Brand Gap Matrix)
  const [viewMode, setViewMode] = useState<"explorer" | "matrix">("explorer");
  const [matrixCategorySlug, setMatrixCategorySlug] = useState<string>("body-parts");

  // Deep-dive Category & Product Explorer State
  const [selectedCategoryForExplorer, setSelectedCategoryForExplorer] =
    useState<AdminCategoryItem | null>(null);
  const [selectedSubcategorySlug, setSelectedSubcategorySlug] = useState<string | null>(null);
  const [explorerProductSearch, setExplorerProductSearch] = useState("");
  const [selectedBrandId, setSelectedBrandId] = useState<string>("all");
  const [showOnlyMissing, setShowOnlyMissing] = useState(false);

  const toggleExpand = (catId: string) => {
    setExpandedCategoryIds((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  const getCategorySubcategories = (catSlug: string) => {
    const canon = resolveCanonicalCategorySlug(catSlug);
    // Prioritize Storefront Top-Navbar subcategories so Admin exactly matches customer navigation
    const foundNav = NAVBAR_CATEGORIES.find(
      (c) =>
        c.slug === catSlug ||
        c.slug === canon ||
        resolveCanonicalCategorySlug(c.slug) === canon ||
        c.id === catSlug
    );
    if (foundNav && foundNav.subcategories && foundNav.subcategories.length > 0) {
      return foundNav.subcategories;
    }
    const foundAppr = APPROVED_CATEGORIES.find(
      (c) => c.slug === catSlug || c.slug === canon
    );
    return foundAppr?.subcategories || [];
  };

  // Helper: checks if a product matches a specific vehicle brand
  const productMatchesBrand = (prod: AdminProductListItem, brandId: string): boolean => {
    if (brandId === "all") return true;
    const target = TARGET_CAR_BRANDS.find((b) => b.id === brandId);
    if (!target) return true;

    const brandName = (prod.brandName || "").toLowerCase();
    const fitment = (prod.fitmentHint || "").toLowerCase();
    const prodName = (prod.name || "").toLowerCase();

    return target.keywords.some(
      (kw) => brandName.includes(kw) || fitment.includes(kw) || prodName.includes(kw)
    );
  };

  // Helper to query all products belonging to a given category
  const getProductsForCategory = (catSlug: string) => {
    const canon = resolveCanonicalCategorySlug(catSlug).toLowerCase();
    const catLower = catSlug.toLowerCase();
    return products.filter((p) => {
      const pCat = (p.categorySlug || "").toLowerCase();
      const pCanon = resolveCanonicalCategorySlug(pCat).toLowerCase();
      const pName = p.categoryName.toLowerCase();
      return (
        pCat === catLower ||
        pCanon === canon ||
        pCat === canon ||
        catLower === pCanon ||
        pName.includes(catLower) ||
        pName === catLower
      );
    });
  };

  // Helper to query products for category filtered by car brand
  const getProductsForCategoryAndBrand = (catSlug: string, brandId: string) => {
    const catProducts = getProductsForCategory(catSlug);
    if (brandId === "all") return catProducts;
    return catProducts.filter((p) => productMatchesBrand(p, brandId));
  };

  // Helper to count products inside a specific subcategory & brand
  const getProductsForSubcategoryAndBrand = (
    catSlug: string,
    subSlug: string,
    brandId: string = "all"
  ) => {
    const catProducts = getProductsForCategoryAndBrand(catSlug, brandId);
    const sLower = subSlug.toLowerCase();
    const sClean = sLower.replace(/[^a-z0-9]/g, "");
    return catProducts.filter((p) => {
      const pSub = (p.subcategoryId || "").toLowerCase();
      const pSubClean = pSub.replace(/[^a-z0-9]/g, "");
      const pNameClean = p.name.toLowerCase().replace(/[^a-z0-9]/g, "");

      return (
        pSub === sLower ||
        pSubClean === sClean ||
        (pSub && (pSub.includes(sLower) || sLower.includes(pSub))) ||
        (pSubClean && (pSubClean.includes(sClean) || sClean.includes(pSubClean))) ||
        (sClean.length > 3 && pNameClean.includes(sClean))
      );
    });
  };

  // Form edit state for image modal
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [uploadReceipt, setUploadReceipt] = useState<string | null>(null);
  const [altText, setAltText] = useState("");
  const [stagedDeletions, setStagedDeletions] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Form add state for category modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatSlug, setNewCatSlug] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");
  const [newCatIsTopNav, setNewCatIsTopNav] = useState(true);
  const [newCatImageUrl, setNewCatImageUrl] = useState<string | null>(null);
  const [newCatStorageKey, setNewCatStorageKey] = useState<string | null>(null);
  const [newCatUploadReceipt, setNewCatUploadReceipt] = useState<string | null>(null);

  const openAddModal = () => {
    setNewCatName("");
    setNewCatSlug("");
    setNewCatDesc("");
    setNewCatIsTopNav(true);
    setNewCatImageUrl(null);
    setNewCatStorageKey(null);
    setNewCatUploadReceipt(null);
    setActionError(null);
    setActionSuccess(null);
    setIsAddModalOpen(true);
  };

  const closeAddModal = () => {
    setIsAddModalOpen(false);
    setActionError(null);
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) {
      setActionError("Category name is required.");
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await createAdminCategoryAction({
        name: newCatName.trim(),
        slug: newCatSlug.trim() || undefined,
        description: newCatDesc.trim() || null,
        imageUrl: newCatImageUrl,
        storageKey: newCatStorageKey,
        isTopNav: newCatIsTopNav,
        uploadReceipt: newCatUploadReceipt,
      });

      if (!res.success || !res.data) {
        throw new Error(res.error || "Failed to create category.");
      }

      const createdCat = res.data.category;
      setCategories((prev) => [createdCat, ...prev]);
      setIsAddModalOpen(false);
      setActionSuccess(`Category "${createdCat.name}" created successfully.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Creation failed.";
      setActionError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (cat: AdminCategoryItem) => {
    setActiveCategory(cat);
    setImageUrl(cat.imageUrl);
    setStorageKey(cat.storageKey);
    setUploadReceipt(null);
    setAltText(cat.name);
    setStagedDeletions([]);
    setActionError(null);
    setActionSuccess(null);
  };

  const closeModal = () => {
    setActiveCategory(null);
    setImageUrl(null);
    setStorageKey(null);
    setUploadReceipt(null);
    setAltText("");
    setStagedDeletions([]);
    setActionError(null);
    setActionSuccess(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCategory) return;

    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await updateAdminCategoryImageAction({
        id: activeCategory.id,
        imageUrl: imageUrl,
        storageKey: storageKey,
        uploadReceipt: uploadReceipt,
        altText: altText || activeCategory.name,
        stagedDeletedStorageKeys: stagedDeletions,
      });

      if (!res.success) {
        throw new Error(res.error || "Failed to update category image.");
      }

      const updated = res.data as { category: AdminCategoryItem; cleanupErrors?: string[] };

      // Update local state
      setCategories((prev) =>
        prev.map((c) => (c.id === activeCategory.id ? updated.category : c))
      );

      setActionSuccess("Category image updated successfully!");
      setTimeout(() => {
        closeModal();
      }, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed.";
      setActionError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCategories = categories.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q) ||
      (c.description && c.description.toLowerCase().includes(q))
    );
  });

  // Calculate products for selected Explorer category filtered by Brand and Subcategory
  const activeExplorerProducts = useMemo(() => {
    if (!selectedCategoryForExplorer) return [];
    let list = getProductsForCategoryAndBrand(selectedCategoryForExplorer.slug, selectedBrandId);

    if (selectedSubcategorySlug) {
      const sLower = selectedSubcategorySlug.toLowerCase();
      const sClean = sLower.replace(/[^a-z0-9]/g, "");
      list = list.filter((p) => {
        const pSub = (p.subcategoryId || "").toLowerCase();
        const pSubClean = pSub.replace(/[^a-z0-9]/g, "");
        const pNameClean = p.name.toLowerCase().replace(/[^a-z0-9]/g, "");

        return (
          pSub === sLower ||
          pSubClean === sClean ||
          (pSub && (pSub.includes(sLower) || sLower.includes(pSub))) ||
          (pSubClean && (pSubClean.includes(sClean) || sClean.includes(pSubClean))) ||
          (sClean.length > 3 && pNameClean.includes(sClean))
        );
      });
    }

    if (explorerProductSearch.trim()) {
      const q = explorerProductSearch.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.brandName.toLowerCase().includes(q) ||
          (p.fitmentHint && p.fitmentHint.toLowerCase().includes(q))
      );
    }

    return list;
  }, [
    selectedCategoryForExplorer,
    selectedSubcategorySlug,
    selectedBrandId,
    explorerProductSearch,
    products,
  ]);

  // Selected brand object
  const activeBrandObj = useMemo(
    () => TARGET_CAR_BRANDS.find((b) => b.id === selectedBrandId) || TARGET_CAR_BRANDS[0]!,
    [selectedBrandId]
  );

  // --------------------------------------------------------------------------
  // VIEW 1: DEEP-DIVE CATEGORY & PRODUCT EXPLORER
  // Triggered when a user clicks "Explore Category & Products" on any category
  // --------------------------------------------------------------------------
  if (selectedCategoryForExplorer) {
    const subs = getCategorySubcategories(selectedCategoryForExplorer.slug);
    const allCatProducts = getProductsForCategory(selectedCategoryForExplorer.slug);
    const brandCatProducts = getProductsForCategoryAndBrand(
      selectedCategoryForExplorer.slug,
      selectedBrandId
    );

    const activeSubObj = subs.find((s) => s.slug === selectedSubcategorySlug);
    const isSubcategoryMissing =
      selectedSubcategorySlug !== null && activeExplorerProducts.length === 0;

    return (
      <div className="space-y-6">
        {/* Navigation Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-200/90 shadow-2xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSelectedCategoryForExplorer(null);
                setSelectedSubcategorySlug(null);
                setExplorerProductSearch("");
                setSelectedBrandId("all");
                setShowOnlyMissing(false);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-300 hover:border-ember bg-gray-50 hover:bg-ember/5 text-gray-700 hover:text-ember text-xs font-bold transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to All Categories</span>
            </button>
            <div className="h-4 w-px bg-gray-200" />
            <span className="text-xs text-gray-500">
              Category:{" "}
              <strong className="text-gray-900 font-bold">
                {selectedCategoryForExplorer.name}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/categories/${selectedCategoryForExplorer.slug}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 text-xs font-semibold text-gray-700 hover:text-ember transition-colors"
            >
              <span>View Customer Storefront</span>
              <ExternalLink className="w-3 h-3 text-gray-400" />
            </Link>

            <Link
              href={`/admin/products/new?category=${selectedCategoryForExplorer.slug}${
                selectedSubcategorySlug ? `&subcategoryId=${selectedSubcategorySlug}` : ""
              }${
                selectedBrandId !== "all"
                  ? `&make=${encodeURIComponent(activeBrandObj.name)}&brand=${encodeURIComponent(activeBrandObj.oemBrandName)}`
                  : ""
              }`}
              className="btn-primary py-1.5 px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Product</span>
            </Link>
          </div>
        </div>

        {/* Selected Category Header Banner Card */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-[#090D18] via-[#111827] to-[#090D18] border border-gray-800 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-xl border border-gray-700 bg-gray-800/80 overflow-hidden flex items-center justify-center flex-shrink-0 shadow-sm">
              {selectedCategoryForExplorer.imageUrl ? (
                <img
                  src={selectedCategoryForExplorer.imageUrl}
                  alt={selectedCategoryForExplorer.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Layers className="w-7 h-7 text-ember" />
              )}
            </div>
            <div>
              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-ember/15 border border-ember/30 text-ember text-[10px] font-bold uppercase tracking-wider mb-1.5">
                <span>Category &amp; Brand Fitment Explorer</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white">
                {selectedCategoryForExplorer.name}
              </h2>
              <p className="text-xs text-gray-300 mt-1 max-w-xl leading-relaxed">
                {selectedCategoryForExplorer.description ||
                  `Automotive components and replacement spares for ${selectedCategoryForExplorer.name.toLowerCase()}.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start md:self-center">
            <button
              type="button"
              onClick={() => openEditModal(selectedCategoryForExplorer)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Change Cover Image</span>
            </button>
          </div>
        </div>

        {/* 🚗 BRAND MIX BAR: Filter by Car Brand / OEM Fitment */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200/90 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-2.5">
            <div className="flex items-center gap-2">
              <Car className="w-4 h-4 text-ember" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900">
                Mix with Car Brand (Vehicle Fitment Filter)
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowOnlyMissing((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  showOnlyMissing
                    ? "bg-amber-500 text-white shadow-2xs"
                    : "bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200"
                }`}
                title="Toggle to show only subcategories with 0 parts for this brand"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>
                  {showOnlyMissing ? "Showing Missing Gaps Only" : "Highlight Missing Gaps (Upload Needed)"}
                </span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {TARGET_CAR_BRANDS.map((b) => {
              const isSelected = selectedBrandId === b.id;
              const countForBrand = getProductsForCategoryAndBrand(
                selectedCategoryForExplorer.slug,
                b.id
              ).length;

              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedBrandId(b.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border cursor-pointer ${
                    isSelected
                      ? "bg-[#090D18] text-white border-[#090D18] shadow-xs"
                      : "bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700"
                  }`}
                >
                  <span>{b.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isSelected
                        ? "bg-white/20 text-white"
                        : countForBrand > 0
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {countForBrand > 0 ? `${countForBrand} parts` : "0 (Gap)"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Subcategories Filter Chips Bar */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200/90 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-ember" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900">
                Child Subcategories ({subs.length}){" "}
                {selectedBrandId !== "all" && (
                  <span className="text-ember font-bold">for {activeBrandObj.name}</span>
                )}
              </h3>
            </div>
            <span className="text-[11px] text-gray-500">
              Click any subcategory chip to filter parts or inspect missing gaps
            </span>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => setSelectedSubcategorySlug(null)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedSubcategorySlug === null
                  ? "bg-ember text-white shadow-xs"
                  : "bg-gray-100 hover:bg-gray-200/80 text-gray-700"
              }`}
            >
              <span>All Subcategories</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  selectedSubcategorySlug === null
                    ? "bg-white/20 text-white"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {brandCatProducts.length}
              </span>
            </button>

            {subs.map((sub) => {
              const subCount = getProductsForSubcategoryAndBrand(
                selectedCategoryForExplorer.slug,
                sub.slug,
                selectedBrandId
              ).length;
              const isSelected = selectedSubcategorySlug === sub.slug;
              const isMissing = subCount === 0;

              if (showOnlyMissing && !isMissing) return null;

              return (
                <button
                  key={sub.slug}
                  type="button"
                  onClick={() => setSelectedSubcategorySlug(isSelected ? null : sub.slug)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer ${
                    isSelected
                      ? "bg-ember text-white border-ember shadow-xs"
                      : isMissing
                      ? "bg-amber-50/70 hover:bg-amber-100 border-dashed border-amber-300 text-amber-900"
                      : "bg-gray-50 hover:bg-orange-50/80 border-gray-200 text-gray-700"
                  }`}
                >
                  <span>{sub.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isSelected
                        ? "bg-white/20 text-white"
                        : subCount > 0
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-200 text-amber-900"
                    }`}
                  >
                    {subCount > 0 ? subCount : "Missing"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Products in this Category Section */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-200/90 shadow-2xs">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-ember" />
              <h3 className="text-sm font-bold text-gray-900">
                Parts in {selectedCategoryForExplorer.name}
                {selectedSubcategorySlug && (
                  <span className="text-gray-500 font-normal">
                    {" "}
                    &gt;{" "}
                    <strong className="text-ember font-semibold">
                      {activeSubObj?.name || selectedSubcategorySlug}
                    </strong>
                  </span>
                )}
                {selectedBrandId !== "all" && (
                  <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md ml-2">
                    Fitment: {activeBrandObj.name}
                  </span>
                )}
              </h3>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 font-semibold">
                {activeExplorerProducts.length} parts
              </span>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={explorerProductSearch}
                onChange={(e) => setExplorerProductSearch(e.target.value)}
                placeholder="Search parts by name, SKU or car..."
                className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-ember"
              />
            </div>
          </div>

          {/* Missing Gap Alert / Empty State with Quick Upload Button */}
          {activeExplorerProducts.length === 0 ? (
            <div className="p-10 rounded-2xl bg-gradient-to-b from-amber-50/50 via-white to-white border border-amber-200/90 text-center shadow-2xs">
              <div className="w-14 h-14 rounded-2xl bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto mb-3 shadow-2xs">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-amber-900 text-[11px] font-bold uppercase tracking-wider mb-2">
                <span>Inventory Gap Detected</span>
              </div>
              <h4 className="text-base font-bold text-gray-900 mb-1">
                No {activeSubObj ? activeSubObj.name : selectedCategoryForExplorer.name} listed for{" "}
                <span className="text-ember font-black">
                  {selectedBrandId === "all" ? "any vehicle" : activeBrandObj.name}
                </span>
              </h4>
              <p className="text-xs text-gray-600 max-w-md mx-auto mb-5 leading-relaxed">
                This is a missing part gap! Customers searching for{" "}
                <strong>{selectedBrandId === "all" ? "this part" : activeBrandObj.name}</strong> will not find it.
                Upload this missing component now to expand your catalogue coverage!
              </p>
              <Link
                href={`/admin/products/new?category=${selectedCategoryForExplorer.slug}${
                  selectedSubcategorySlug ? `&subcategoryId=${selectedSubcategorySlug}` : ""
                }${
                  selectedBrandId !== "all"
                    ? `&make=${encodeURIComponent(activeBrandObj.name)}&brand=${encodeURIComponent(activeBrandObj.oemBrandName)}`
                    : ""
                }`}
                className="btn-primary text-xs py-2.5 px-5 rounded-xl inline-flex items-center gap-2 shadow-sm font-bold"
              >
                <Plus className="w-4 h-4" />
                <span>
                  + Upload {activeSubObj ? activeSubObj.name : "Part"} for{" "}
                  {selectedBrandId === "all" ? selectedCategoryForExplorer.name : activeBrandObj.name} Now
                </span>
              </Link>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200/90 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#090D18] text-white text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Part Details</th>
                      <th className="py-3 px-4">Brand</th>
                      <th className="py-3 px-4">Vehicle Fitment (Cars)</th>
                      <th className="py-3 px-4">Condition</th>
                      <th className="py-3 px-4">Price</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {activeExplorerProducts.map((prod) => (
                      <tr key={prod.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-3 px-4 max-w-sm">
                          <div className="font-bold text-gray-900 text-xs">{prod.name}</div>
                          <div className="font-mono text-[10px] text-gray-400 mt-0.5">
                            SKU: {prod.sku}
                          </div>
                          {prod.subcategoryId && (
                            <span className="inline-block mt-1 text-[10px] font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md">
                              Sub: {prod.subcategoryId}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-bold text-gray-900">{prod.brandName}</span>
                        </td>

                        <td className="py-3 px-4 max-w-xs">
                          {prod.fitmentHint ? (
                            <div className="flex items-center gap-1.5 text-gray-700 bg-orange-50/80 border border-orange-100 px-2.5 py-1 rounded-lg">
                              <Car className="w-3.5 h-3.5 text-ember flex-shrink-0" />
                              <span className="text-[11px] font-medium truncate">
                                {prod.fitmentHint.replace("Sample reference: ", "")}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400 italic text-[11px]">
                              Universal / Multiple Models
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          {prod.condition === "new" ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              Brand New
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                              Pre-Owned
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 font-bold text-gray-900 text-xs">
                          {formatMoney(prod.priceMinor)}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            <Link
                              href={`/admin/products/${prod.id}/edit`}
                              className="px-2.5 py-1 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-[11px] font-semibold text-gray-700 hover:text-ember transition-colors"
                            >
                              Edit
                            </Link>

                            <Link
                              href={`/categories/${selectedCategoryForExplorer.slug}`}
                              target="_blank"
                              className="p-1 rounded-lg border border-gray-200 text-gray-400 hover:text-ember hover:bg-gray-50 transition-colors"
                              title="View on Storefront"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // VIEW 2: MASTER OVERVIEW TABLE & BRAND COVERAGE MATRIX
  // --------------------------------------------------------------------------
  const fallbackCategory: AdminCategoryItem = {
    id: "cat-body",
    name: "Body Parts",
    slug: "body-parts",
    description: "Body panels, bumpers, lighting, and exterior components.",
    imageUrl: null,
    storageKey: null,
    status: "active",
    sortOrder: 1,
    isTopNav: true,
  };
  const matrixCategory: AdminCategoryItem =
    categories.find((c) => c.slug === matrixCategorySlug) || categories[0] || fallbackCategory;
  const matrixSubs = getCategorySubcategories(matrixCategory.slug);
  const targetBrandsWithoutAll = TARGET_CAR_BRANDS.filter((b) => b.id !== "all");

  // Calculate matrix coverage metrics
  const totalMatrixCells = matrixSubs.length * targetBrandsWithoutAll.length;
  let coveredMatrixCells = 0;
  matrixSubs.forEach((sub) => {
    targetBrandsWithoutAll.forEach((b) => {
      const parts = getProductsForSubcategoryAndBrand(matrixCategory.slug, sub.slug, b.id);
      if (parts.length > 0) coveredMatrixCells++;
    });
  });
  const missingMatrixCells = totalMatrixCells - coveredMatrixCells;
  const coveragePercent =
    totalMatrixCells > 0 ? Math.round((coveredMatrixCells / totalMatrixCells) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Top Navigation & View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-200/90 shadow-2xs">
        <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode("explorer")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === "explorer"
                ? "bg-white text-gray-900 shadow-2xs"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <FolderTree className="w-3.5 h-3.5 text-ember" />
            <span>Categories Explorer</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("matrix")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === "matrix"
                ? "bg-white text-gray-900 shadow-2xs"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <Grid className="w-3.5 h-3.5 text-ember" />
            <span>Brand x Category Matrix (Missing Gaps)</span>
          </button>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          <Link
            href="/categories"
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 text-xs font-semibold text-gray-700 hover:text-ember transition-colors"
          >
            <span>Live Storefront</span>
            <ExternalLink className="w-3 h-3 text-gray-400" />
          </Link>

          <button
            type="button"
            onClick={openAddModal}
            className="btn-primary text-xs py-2 px-3.5 rounded-xl flex items-center gap-1.5 shadow-xs font-bold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Category</span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MATRIX VIEW: CATEGORY X CAR BRAND COVERAGE & MISSING PARTS UPLOADER */}
      {/* ===================================================================== */}
      {viewMode === "matrix" ? (
        <div className="space-y-6">
          {/* Matrix Category Selector Tabs */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200/90 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Grid className="w-4 h-4 text-ember" />
                  <span>Car Brand Fitment Coverage Matrix</span>
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Select a category to see which car brands already have parts and which ones have missing gaps.
                </p>
              </div>

              {/* KPI Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 font-bold">
                  {totalMatrixCells} Combinations
                </span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                  ✓ {coveredMatrixCells} Covered ({coveragePercent}%)
                </span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  <span>{missingMatrixCells} Missing Gaps</span>
                </span>
              </div>
            </div>

            {/* Category Switcher Pills */}
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const isSelected = matrixCategorySlug === c.slug;
                const catProductsCount = getProductsForCategory(c.slug).length;

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setMatrixCategorySlug(c.slug)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border cursor-pointer ${
                      isSelected
                        ? "bg-ember text-white border-ember shadow-xs"
                        : "bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700"
                    }`}
                  >
                    <span>{c.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isSelected
                          ? "bg-white/20 text-white"
                          : "bg-gray-200/80 text-gray-600"
                      }`}
                    >
                      {catProductsCount}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2D Coverage Grid Table */}
          <div className="bg-white rounded-2xl border border-gray-200/90 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#090D18] text-white text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4 min-w-[200px]">Subcategory ({matrixSubs.length})</th>
                    {targetBrandsWithoutAll.map((b) => (
                      <th key={b.id} className="py-3.5 px-3 text-center min-w-[120px]">
                        {b.shortName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {matrixSubs.map((sub) => (
                    <tr key={sub.slug} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-3 px-4 font-bold text-gray-900 border-r border-gray-100 bg-gray-50/40">
                        <div className="flex items-center gap-1.5">
                          <FolderTree className="w-3.5 h-3.5 text-ember shrink-0" />
                          <span className="truncate">{sub.name}</span>
                        </div>
                      </td>

                      {targetBrandsWithoutAll.map((b) => {
                        const parts = getProductsForSubcategoryAndBrand(
                          matrixCategory.slug,
                          sub.slug,
                          b.id
                        );
                        const hasParts = parts.length > 0;

                        return (
                          <td key={b.id} className="py-2.5 px-3 text-center border-r border-gray-50 last:border-r-0">
                            {hasParts ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedCategoryForExplorer(matrixCategory);
                                  setSelectedSubcategorySlug(sub.slug);
                                  setSelectedBrandId(b.id);
                                  setViewMode("explorer");
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors cursor-pointer"
                                title={`View ${parts.length} part(s) for ${b.name}`}
                              >
                                <span>✓ {parts.length} {parts.length === 1 ? "part" : "parts"}</span>
                              </button>
                            ) : (
                              <Link
                                href={`/admin/products/new?category=${matrixCategory.slug}&subcategoryId=${sub.slug}&make=${encodeURIComponent(b.name)}&brand=${encodeURIComponent(b.oemBrandName)}`}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border border-dashed border-amber-300 bg-amber-50/80 hover:bg-amber-100 text-amber-900 transition-colors"
                                title={`Upload missing ${sub.name} for ${b.name}`}
                              >
                                <Plus className="w-3 h-3 text-amber-600" />
                                <span>Upload</span>
                              </Link>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* ===================================================================== */
        /* EXPLORER MASTER OVERVIEW VIEW                                         */
        /* ===================================================================== */
        <div className="space-y-6">
          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-white border border-gray-200 shadow-2xs flex items-center justify-between">
              <div>
                <span className="text-xs text-gray-500 font-medium">Total Categories</span>
                <div className="text-xl font-black text-gray-900 mt-1">{categories.length}</div>
                <span className="text-[11px] text-emerald-600 font-semibold">Storefront Top Navigation</span>
              </div>
              <div className="w-11 h-11 rounded-xl bg-ember/10 border border-ember/20 flex items-center justify-center text-ember">
                <Layers className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-gray-200 shadow-2xs flex items-center justify-between">
              <div>
                <span className="text-xs text-gray-500 font-medium">Subcategories Taxonomy</span>
                <div className="text-xl font-black text-gray-900 mt-1">
                  {TOTAL_APPROVED_SUBCATEGORIES_COUNT}
                </div>
                <span className="text-[11px] text-gray-400 font-semibold">12 Approved Domains</span>
              </div>
              <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                <FolderTree className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-gray-200 shadow-2xs flex items-center justify-between">
              <div>
                <span className="text-xs text-gray-500 font-medium">Mapped Catalogue Parts</span>
                <div className="text-xl font-black text-gray-900 mt-1">{products.length}</div>
                <span className="text-[11px] text-emerald-600 font-semibold">Realistic Automotive Parts</span>
              </div>
              <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                <Package className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-2xs">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search categories by name, slug or description..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ember/20 focus:border-ember"
              />
            </div>
            <div className="flex items-center gap-3 self-end sm:self-auto">
              <span className="text-xs text-gray-500 font-medium hidden md:inline">
                Showing {filteredCategories.length} of {categories.length} categories
              </span>
              <button
                type="button"
                onClick={() => setViewMode("matrix")}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-ember/30 bg-ember/10 hover:bg-ember/15 text-ember text-xs font-bold transition-colors cursor-pointer"
              >
                <Grid className="w-3.5 h-3.5" />
                <span>Open Brand Gap Matrix</span>
              </button>
            </div>
          </div>

          {/* Categories Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#090D18] text-white text-xs uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Image</th>
                    <th className="py-3 px-4">Category &amp; Options</th>
                    <th className="py-3 px-4">Slug</th>
                    <th className="py-3 px-4">Mapped Parts</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCategories.map((cat) => {
                    const subs = getCategorySubcategories(cat.slug);
                    const isExpanded = Boolean(expandedCategoryIds[cat.id]);
                    const catProductsCount = getProductsForCategory(cat.slug).length;

                    return (
                      <React.Fragment key={cat.id}>
                        <tr className="hover:bg-gray-50/80 transition-colors">
                          <td className="py-3.5 px-4 w-20 align-top">
                            <div className="w-14 h-14 rounded-lg border border-gray-200 bg-gray-100 overflow-hidden flex items-center justify-center shadow-2xs">
                              {cat.imageUrl ? (
                                <img
                                  src={cat.imageUrl}
                                  alt={cat.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Layers className="w-5 h-5 text-gray-400" />
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 align-top">
                            <div className="font-bold text-gray-900 text-sm">{cat.name}</div>
                            {cat.description && (
                              <div className="text-xs text-gray-500 font-normal mt-0.5 line-clamp-2 max-w-md">
                                {cat.description}
                              </div>
                            )}

                            {/* Interactive Category Sub-Options Bar */}
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => toggleExpand(cat.id)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-orange-50 hover:bg-orange-100 text-ember transition-colors border border-orange-200/60 cursor-pointer"
                              >
                                <FolderTree className="w-3.5 h-3.5 text-ember" />
                                <span>{subs.length} Subcategories</span>
                                {isExpanded ? (
                                  <ChevronUp className="w-3 h-3 text-ember" />
                                ) : (
                                  <ChevronDown className="w-3 h-3 text-ember" />
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setMatrixCategorySlug(cat.slug);
                                  setViewMode("matrix");
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 transition-colors border border-amber-200/70 cursor-pointer"
                              >
                                <Grid className="w-3.5 h-3.5 text-amber-600" />
                                <span>Brand Gap Matrix</span>
                              </button>

                              <Link
                                href={`/categories/${cat.slug}`}
                                target="_blank"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-gray-600 hover:text-ember bg-gray-100 hover:bg-gray-200/80 transition-colors font-semibold"
                              >
                                <span>Live Storefront</span>
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 font-mono text-xs text-gray-500 align-top">
                            {cat.slug}
                          </td>

                          <td className="py-3.5 px-4 align-top">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                                catProductsCount > 0
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              <Package className="w-3 h-3 mr-1" />
                              <span>{catProductsCount} parts</span>
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right align-top">
                            <div className="inline-flex items-center gap-2 flex-wrap justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedCategoryForExplorer(cat);
                                  setSelectedSubcategorySlug(null);
                                  setSelectedBrandId("all");
                                  setShowOnlyMissing(false);
                                }}
                                className="btn-primary py-1.5 px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                              >
                                <span>Explore Category &amp; Products ({catProductsCount}) ➔</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => openEditModal(cat)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-300 hover:border-ember hover:bg-ember/5 text-gray-700 hover:text-ember text-xs font-bold transition-all shadow-2xs cursor-pointer"
                                title="Upload cover image"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                                <span>Cover Image</span>
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expandable Subcategories Drawer Row */}
                        {isExpanded && (
                          <tr className="bg-gray-50/80 border-y border-gray-200">
                            <td colSpan={5} className="p-4 sm:p-5 pl-14 sm:pl-20">
                              <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200/90 shadow-2xs space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-gray-100">
                                  <span className="text-xs font-bold uppercase tracking-wider text-gray-900 flex items-center gap-1.5">
                                    <FolderTree className="w-4 h-4 text-ember" />
                                    <span>
                                      {cat.name} Subcategories ({subs.length})
                                    </span>
                                  </span>
                                  <div className="flex items-center gap-3">
                                    <span className="text-[11px] text-gray-400">
                                      Click any subcategory to view its mapped products
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedCategoryForExplorer(cat);
                                        setSelectedSubcategorySlug(null);
                                        setSelectedBrandId("all");
                                      }}
                                      className="text-[11px] font-bold text-ember hover:underline flex items-center gap-1 cursor-pointer"
                                    >
                                      <span>Explore All Products ({catProductsCount}) ➔</span>
                                    </button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 pt-1">
                                  {subs.map((sub) => {
                                    const subPartsCount = getProductsForSubcategoryAndBrand(
                                      cat.slug,
                                      sub.slug,
                                      "all"
                                    ).length;

                                    return (
                                      <button
                                        key={sub.slug}
                                        type="button"
                                        onClick={() => {
                                          setSelectedCategoryForExplorer(cat);
                                          setSelectedSubcategorySlug(sub.slug);
                                          setSelectedBrandId("all");
                                        }}
                                        className="inline-flex items-center justify-between gap-2 p-2.5 rounded-lg bg-gray-50/80 hover:bg-orange-50/80 border border-gray-200 hover:border-ember text-xs text-gray-800 hover:text-ember font-medium transition-all group text-left cursor-pointer shadow-2xs"
                                        title={`Click to view all parts in ${sub.name}`}
                                      >
                                        <span className="truncate">{sub.name}</span>
                                        <span
                                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                            subPartsCount > 0
                                              ? "bg-emerald-100 text-emerald-800"
                                              : "bg-gray-200/60 text-gray-500"
                                          }`}
                                        >
                                          {subPartsCount} {subPartsCount === 1 ? "part" : "parts"} ➔
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Edit Category Image Modal */}
      {activeCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">
                Update Category Image: {activeCategory.name}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {actionError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{actionError}</span>
              </div>
            )}

            {actionSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{actionSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <AdminSingleImageUploader
                label="Category Cover Image"
                folder={CLOUDINARY_FOLDERS.categories}
                value={imageUrl}
                storageKey={storageKey}
                uploadReceipt={uploadReceipt}
                onChange={(data) => {
                  setImageUrl(data.imageUrl);
                  setStorageKey(data.storageKey);
                  setUploadReceipt(data.uploadReceipt);
                }}
                onStagedDeletion={(delKey) => {
                  setStagedDeletions((prev) => Array.from(new Set([...prev, delKey])));
                }}
                disabled={isSubmitting}
              />

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Alt Text / Image Description
                </label>
                <input
                  type="text"
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                  placeholder={`${activeCategory.name} spare parts`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-ember"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary text-xs py-2 px-4 rounded-xl font-bold flex items-center gap-1.5"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Category Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">Add New Category</h3>
              <button
                type="button"
                onClick={closeAddModal}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {actionError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{actionError}</span>
              </div>
            )}

            <form onSubmit={handleCreateCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Category Name <span className="text-ember">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="e.g. Braking Systems, Transmission"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-ember"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Slug (Optional - Auto-generated if empty)
                </label>
                <input
                  type="text"
                  value={newCatSlug}
                  onChange={(e) => setNewCatSlug(e.target.value)}
                  placeholder="e.g. braking-systems"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-ember"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  placeholder="Provide an overview of components in this category..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-ember"
                />
              </div>

              <AdminSingleImageUploader
                label="Category Cover Image (Cloudinary)"
                folder={CLOUDINARY_FOLDERS.categories}
                value={newCatImageUrl}
                storageKey={newCatStorageKey}
                uploadReceipt={newCatUploadReceipt}
                onChange={(data) => {
                  setNewCatImageUrl(data.imageUrl);
                  setNewCatStorageKey(data.storageKey);
                  setNewCatUploadReceipt(data.uploadReceipt);
                }}
                disabled={isSubmitting}
              />

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="newCatIsTopNav"
                  checked={newCatIsTopNav}
                  onChange={(e) => setNewCatIsTopNav(e.target.checked)}
                  className="w-4 h-4 text-ember rounded-sm border-gray-300 focus:ring-ember"
                />
                <label htmlFor="newCatIsTopNav" className="text-xs font-semibold text-gray-700">
                  Feature in Storefront Top Navigation
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={closeAddModal}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary text-xs py-2 px-4 rounded-xl font-bold flex items-center gap-1.5"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Create Category</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
