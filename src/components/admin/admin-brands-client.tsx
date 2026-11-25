"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Car,
  Search,
  Plus,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  FolderTree,
  Tag,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Layers,
  Grid,
  Package,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Filter,
  Zap,
  Disc,
  Wrench,
  Snowflake,
  Cog,
  Flame,
  ArrowUpRight,
} from "lucide-react";
import { AdminSingleImageUploader } from "./admin-single-image-uploader";
import {
  updateAdminBrandLogoAction,
  createAdminBrandAction,
} from "@/features/admin/actions";
import { CLOUDINARY_FOLDERS } from "@/lib/cloudinary-shared";
import type {
  AdminBrandItem,
  AdminCategoryItem,
  AdminProductListItem,
} from "@/features/admin/service";
import { NAVBAR_CATEGORIES } from "@/lib/constants/navigation";
import {
  APPROVED_CATEGORIES,
  resolveCanonicalCategorySlug,
} from "@/lib/constants/approved-catalogue";

// -----------------------------------------------------------------------------
// Brand Taxonomy & Keyword Matching Dictionary
// -----------------------------------------------------------------------------
interface BrandMeta {
  keywords: string[];
  oemBrandName: string;
  categoryGroup: "car_make" | "oem_genuine" | "aftermarket";
  origin: string;
}

const BRAND_METADATA_MAP: Record<string, BrandMeta> = {
  "maruti-suzuki": {
    keywords: ["maruti", "suzuki", "swift", "baleno", "dzire", "wagonr", "wagon r", "alto", "brezza", "ertiga", "celerio", "ciaz", "ignis", "spresso", "s-presso"],
    oemBrandName: "Maruti Suzuki Genuine",
    categoryGroup: "car_make",
    origin: "Indo-Japanese",
  },
  "hyundai": {
    keywords: ["hyundai", "i10", "grand i10", "i20", "elite i20", "creta", "venue", "verna", "aura", "xcent", "tucson", "alcazar", "santro", "mobis"],
    oemBrandName: "Hyundai Mobis",
    categoryGroup: "car_make",
    origin: "South Korea",
  },
  "tata-motors": {
    keywords: ["tata", "nexon", "harrier", "safari", "tiago", "tigor", "punch", "altroz", "indica", "indigo", "hexa"],
    oemBrandName: "Tata Genuine Parts",
    categoryGroup: "car_make",
    origin: "India",
  },
  "mahindra": {
    keywords: ["mahindra", "scorpio", "thar", "xuv", "xuv700", "xuv300", "xuv500", "bolero", "marazzo", "xylo"],
    oemBrandName: "Mahindra Genuine Parts",
    categoryGroup: "car_make",
    origin: "India",
  },
  "toyota": {
    keywords: ["toyota", "innova", "crysta", "fortuner", "glanza", "urban cruiser", "hyryder", "etios", "corolla", "yaris", "camry"],
    oemBrandName: "Toyota Genuine Parts",
    categoryGroup: "car_make",
    origin: "Japan",
  },
  "honda": {
    keywords: ["honda", "city", "amaze", "civic", "jazz", "wr-v", "wrv", "elevate", "brio", "cr-v", "crv"],
    oemBrandName: "Honda Genuine Parts",
    categoryGroup: "car_make",
    origin: "Japan",
  },
  "volkswagen": {
    keywords: ["volkswagen", "vw", "polo", "vento", "virtus", "taigun", "tiguan", "jetta", "passat"],
    oemBrandName: "Bosch",
    categoryGroup: "car_make",
    origin: "Germany",
  },
  "skoda": {
    keywords: ["skoda", "rapid", "slavia", "kushaq", "octavia", "superb", "kodiaq", "laura", "fabia"],
    oemBrandName: "Bosch",
    categoryGroup: "car_make",
    origin: "Czech Republic",
  },
  "kia": {
    keywords: ["kia", "seltos", "sonet", "carens", "carnival", "ev6"],
    oemBrandName: "Hyundai Mobis",
    categoryGroup: "car_make",
    origin: "South Korea",
  },
  "ford": {
    keywords: ["ford", "ecosport", "figo", "endeavour", "aspire", "freestyle", "fiesta"],
    oemBrandName: "Generic Aftermarket",
    categoryGroup: "car_make",
    origin: "USA",
  },
  "renault": {
    keywords: ["renault", "kwid", "triber", "kiger", "duster", "lodgy", "pulse"],
    oemBrandName: "Generic Aftermarket",
    categoryGroup: "car_make",
    origin: "France",
  },
  "nissan": {
    keywords: ["nissan", "magnite", "kicks", "sunny", "micra", "terrano"],
    oemBrandName: "Generic Aftermarket",
    categoryGroup: "car_make",
    origin: "Japan",
  },
  "bmw": {
    keywords: ["bmw", "3 series", "5 series", "7 series", "x1", "x3", "x5", "x7", "m3"],
    oemBrandName: "Brembo",
    categoryGroup: "car_make",
    origin: "Germany",
  },
  "mercedes-benz": {
    keywords: ["mercedes", "benz", "c-class", "e-class", "s-class", "gla", "glc", "gle", "amg"],
    oemBrandName: "Brembo",
    categoryGroup: "car_make",
    origin: "Germany",
  },
  // OEM Spares
  "maruti-suzuki-genuine": {
    keywords: ["maruti suzuki genuine", "maruti genuine", "mgp"],
    oemBrandName: "Maruti Suzuki Genuine",
    categoryGroup: "oem_genuine",
    origin: "India",
  },
  "hyundai-mobis": {
    keywords: ["hyundai mobis", "mobis"],
    oemBrandName: "Hyundai Mobis",
    categoryGroup: "oem_genuine",
    origin: "South Korea",
  },
  "tata-genuine": {
    keywords: ["tata genuine", "tata genuine parts"],
    oemBrandName: "Tata Genuine Parts",
    categoryGroup: "oem_genuine",
    origin: "India",
  },
  "mahindra-genuine": {
    keywords: ["mahindra genuine", "mahindra genuine parts"],
    oemBrandName: "Mahindra Genuine Parts",
    categoryGroup: "oem_genuine",
    origin: "India",
  },
  "toyota-genuine": {
    keywords: ["toyota genuine", "toyota genuine parts"],
    oemBrandName: "Toyota Genuine Parts",
    categoryGroup: "oem_genuine",
    origin: "Japan",
  },
  "honda-genuine": {
    keywords: ["honda genuine", "honda genuine parts"],
    oemBrandName: "Honda Genuine Parts",
    categoryGroup: "oem_genuine",
    origin: "Japan",
  },
};

// Category icon helper
function getCategoryIcon(catSlug: string) {
  const s = catSlug.toLowerCase();
  if (s.includes("brake")) return Disc;
  if (s.includes("suspension") || s.includes("steering")) return Wrench;
  if (s.includes("electrical")) return Zap;
  if (s.includes("cool")) return Snowflake;
  if (s.includes("transmission") || s.includes("clutch")) return Cog;
  if (s.includes("exhaust")) return Flame;
  if (s.includes("filter")) return Filter;
  if (s.includes("body")) return ShieldCheck;
  return Layers;
}

interface AdminBrandsClientProps {
  initialBrands: AdminBrandItem[];
  initialCategories?: AdminCategoryItem[];
  initialProducts?: AdminProductListItem[];
}

export function AdminBrandsClient({
  initialBrands,
  initialCategories = [],
  initialProducts = [],
}: AdminBrandsClientProps) {
  const searchParams = useSearchParams();
  const [brands, setBrands] = useState<AdminBrandItem[]>(initialBrands);
  const [products] = useState<AdminProductListItem[]>(initialProducts);

  // Active View Mode: 'explorer' (Categories & Parts inside Selected Brand) | 'logos' (Emblem Grid)
  const [viewMode, setViewMode] = useState<"explorer" | "logos">("explorer");

  // Selected Brand for Deep-Dive Explorer
  const [selectedBrandSlug, setSelectedBrandSlug] = useState<string>(() => {
    return initialBrands[0]?.slug || "maruti-suzuki";
  });

  // Filters
  const [brandGroupFilter, setBrandGroupFilter] = useState<string>("all");
  const [brandSearch, setBrandSearch] = useState("");
  const [partsSearch, setPartsSearch] = useState("");
  const [showOnlyGaps, setShowOnlyGaps] = useState(false);
  const [expandedCategorySlugs, setExpandedCategorySlugs] = useState<Record<string, boolean>>({});

  // Expanded Subcategories cards (to see mapped spare parts directly under subcategory)
  const [expandedSubcategoryCards, setExpandedSubcategoryCards] = useState<Record<string, boolean>>({});
  // Selected Subcategory filter per category (to filter the table below to that subcategory)
  const [selectedSubcategoryFilter, setSelectedSubcategoryFilter] = useState<Record<string, string | null>>({});

  // Synchronize brand and category from URL query parameters (e.g. returning from product creation)
  useEffect(() => {
    const paramBrand = searchParams.get("brand");
    const paramCat = searchParams.get("category");

    if (paramBrand) {
      const match = brands.find(
        (b) =>
          b.slug.toLowerCase() === paramBrand.toLowerCase() ||
          b.name.toLowerCase() === paramBrand.toLowerCase()
      );
      if (match) {
        setSelectedBrandSlug(match.slug);
      }
    }

    if (paramCat) {
      setExpandedCategorySlugs((prev) => ({
        ...prev,
        [paramCat]: true,
      }));
    }
  }, [searchParams, brands]);

  const toggleSubcategoryCard = (catSlug: string, subSlug: string) => {
    const key = `${catSlug}:${subSlug}`;
    setExpandedSubcategoryCards((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSelectSubcategoryFilter = (catSlug: string, subSlug: string | null) => {
    setSelectedSubcategoryFilter((prev) => ({
      ...prev,
      [catSlug]: prev[catSlug] === subSlug ? null : subSlug,
    }));
  };

  // Modals state for Edit Logo
  const [activeBrandForLogo, setActiveBrandForLogo] = useState<AdminBrandItem | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [uploadReceipt, setUploadReceipt] = useState<string | null>(null);
  const [altText, setAltText] = useState("");
  const [stagedDeletions, setStagedDeletions] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Add Brand Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandSlug, setNewBrandSlug] = useState("");
  const [newBrandLogoUrl, setNewBrandLogoUrl] = useState<string | null>(null);
  const [newBrandStorageKey, setNewBrandStorageKey] = useState<string | null>(null);
  const [newBrandUploadReceipt, setNewBrandUploadReceipt] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Helper: Determine Brand Category Group
  // ---------------------------------------------------------------------------
  const getBrandGroup = (brandSlug: string): "car_make" | "oem_genuine" | "aftermarket" => {
    const meta = BRAND_METADATA_MAP[brandSlug];
    if (meta) return meta.categoryGroup;
    if (brandSlug.includes("genuine") || brandSlug.includes("mobis")) return "oem_genuine";
    return "aftermarket";
  };

  // ---------------------------------------------------------------------------
  // Helper: Check if a product matches a specific brand
  // ---------------------------------------------------------------------------
  const productMatchesBrand = (prod: AdminProductListItem, brand: AdminBrandItem): boolean => {
    const bName = brand.name.toLowerCase();
    const bSlug = brand.slug.toLowerCase();
    const meta = BRAND_METADATA_MAP[bSlug];

    const prodBrand = (prod.brandName || "").toLowerCase();
    const prodFitment = (prod.fitmentHint || "").toLowerCase();
    const prodName = (prod.name || "").toLowerCase();

    // 1. Direct Part Manufacturer Brand match
    if (
      prodBrand.includes(bName) ||
      bName.includes(prodBrand) ||
      prodBrand.includes(bSlug) ||
      bSlug.includes(prodBrand)
    ) {
      return true;
    }

    // 2. Vehicle Make fitment match
    if (meta && meta.keywords.length > 0) {
      const matchesFitment = meta.keywords.some(
        (kw) => prodFitment.includes(kw) || prodName.includes(kw) || prodBrand.includes(kw)
      );
      if (matchesFitment) return true;
    }

    // 3. Fallback check
    return prodFitment.includes(bName) || prodName.includes(bName) || prodFitment.includes(bSlug);
  };

  // ---------------------------------------------------------------------------
  // Filtered Brands List
  // ---------------------------------------------------------------------------
  const filteredBrands = useMemo(() => {
    return brands.filter((b) => {
      const matchesSearch =
        b.name.toLowerCase().includes(brandSearch.toLowerCase()) ||
        b.slug.toLowerCase().includes(brandSearch.toLowerCase());
      if (!matchesSearch) return false;

      if (brandGroupFilter === "all") return true;
      return getBrandGroup(b.slug) === brandGroupFilter;
    });
  }, [brands, brandSearch, brandGroupFilter]);

  // Selected Brand Object
  const selectedBrand = useMemo(() => {
    return brands.find((b) => b.slug === selectedBrandSlug) || brands[0] || null;
  }, [brands, selectedBrandSlug]);

  const selectedBrandMeta = selectedBrand ? BRAND_METADATA_MAP[selectedBrand.slug] : undefined;

  // Products belonging to the selected brand
  const productsForSelectedBrand = useMemo(() => {
    if (!selectedBrand) return [];
    return products.filter((p) => productMatchesBrand(p, selectedBrand));
  }, [products, selectedBrand]);

  // Subcategories retrieval helper
  const getSubcategoriesForCategory = (catSlug: string) => {
    const canon = resolveCanonicalCategorySlug(catSlug);
    const navMatch = NAVBAR_CATEGORIES.find(
      (c) =>
        c.slug === catSlug ||
        c.slug === canon ||
        resolveCanonicalCategorySlug(c.slug) === canon ||
        c.id === catSlug
    );
    if (navMatch?.subcategories && navMatch.subcategories.length > 0) {
      return navMatch.subcategories;
    }
    const appMatch = APPROVED_CATEGORIES.find(
      (c) => c.slug === catSlug || c.slug === canon
    );
    return appMatch?.subcategories || [];
  };

  // Helper: Query products for Category under Selected Brand
  const getProductsForCategory = (catSlug: string) => {
    const canon = resolveCanonicalCategorySlug(catSlug).toLowerCase();
    const catLower = catSlug.toLowerCase();
    return productsForSelectedBrand.filter((p) => {
      const pCat = (p.categorySlug || "").toLowerCase();
      const pCanon = resolveCanonicalCategorySlug(pCat).toLowerCase();
      const pName = p.categoryName.toLowerCase();
      return (
        pCat === catLower ||
        pCanon === canon ||
        pCat === canon ||
        catLower === pCanon ||
        pName.includes(catLower)
      );
    });
  };

  // Helper: Query products for Subcategory under Selected Brand
  const getProductsForSubcategory = (catSlug: string, subSlug: string) => {
    const catProducts = getProductsForCategory(catSlug);
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

  // Toggle Category Accordion
  const toggleCategoryExpand = (catSlug: string) => {
    setExpandedCategorySlugs((prev) => ({
      ...prev,
      [catSlug]: !prev[catSlug],
    }));
  };

  const expandAllCategories = () => {
    const nextState: Record<string, boolean> = {};
    NAVBAR_CATEGORIES.forEach((c) => {
      nextState[c.slug] = true;
    });
    setExpandedCategorySlugs(nextState);
  };

  const collapseAllCategories = () => {
    setExpandedCategorySlugs({});
  };

  // ---------------------------------------------------------------------------
  // Logo Modal Actions
  // ---------------------------------------------------------------------------
  const openEditLogoModal = (brand: AdminBrandItem) => {
    setActiveBrandForLogo(brand);
    setLogoUrl(brand.logoUrl);
    setStorageKey(brand.storageKey);
    setUploadReceipt(null);
    setAltText(`${brand.name} official manufacturer logo`);
    setStagedDeletions([]);
    setActionError(null);
    setActionSuccess(null);
  };

  const closeEditLogoModal = () => {
    setActiveBrandForLogo(null);
    setActionError(null);
    setActionSuccess(null);
  };

  const handleSaveLogo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBrandForLogo) return;

    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await updateAdminBrandLogoAction({
        id: activeBrandForLogo.id,
        logoUrl,
        storageKey,
        altText,
        uploadReceipt,
        stagedDeletedStorageKeys: stagedDeletions,
      });

      if (!res.success) {
        throw new Error(res.error || "Failed to update brand logo.");
      }

      const updated = res.data as { brand: AdminBrandItem };
      setBrands((prev) =>
        prev.map((b) => (b.id === activeBrandForLogo.id ? updated.brand : b))
      );

      setActionSuccess("Brand logo updated successfully!");
      setTimeout(() => {
        closeEditLogoModal();
      }, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed.";
      setActionError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Add Brand Modal Actions
  // ---------------------------------------------------------------------------
  const openAddBrandModal = () => {
    setNewBrandName("");
    setNewBrandSlug("");
    setNewBrandLogoUrl(null);
    setNewBrandStorageKey(null);
    setNewBrandUploadReceipt(null);
    setActionError(null);
    setActionSuccess(null);
    setIsAddModalOpen(true);
  };

  const closeAddBrandModal = () => {
    setIsAddModalOpen(false);
    setActionError(null);
  };

  const handleCreateBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrandName.trim()) {
      setActionError("Brand name is required.");
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await createAdminBrandAction({
        name: newBrandName.trim(),
        slug: newBrandSlug.trim() || undefined,
        logoUrl: newBrandLogoUrl,
        storageKey: newBrandStorageKey,
        uploadReceipt: newBrandUploadReceipt,
      });

      if (!res.success || !res.data) {
        throw new Error(res.error || "Failed to create brand.");
      }

      const createdBrand = res.data.brand;
      setBrands((prev) => [createdBrand, ...prev]);
      setSelectedBrandSlug(createdBrand.slug);
      setIsAddModalOpen(false);
      setActionSuccess(`Brand "${createdBrand.name}" created successfully!`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Creation failed.";
      setActionError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Computed Metrics for Selected Brand
  // ---------------------------------------------------------------------------
  const categoryMetrics = useMemo(() => {
    if (!selectedBrand) return { coveredCount: 0, missingCount: 0, totalCategories: 0 };
    let covered = 0;
    let missing = 0;

    NAVBAR_CATEGORIES.forEach((cat) => {
      const parts = getProductsForCategory(cat.slug);
      if (parts.length > 0) {
        covered++;
      } else {
        missing++;
      }
    });

    return {
      coveredCount: covered,
      missingCount: missing,
      totalCategories: NAVBAR_CATEGORIES.length,
    };
  }, [selectedBrand, productsForSelectedBrand]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ===================================================================== */}
      {/* Top Header & View Mode Switcher */}
      {/* ===================================================================== */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-ember/10 border border-ember/20 flex items-center justify-center text-ember shrink-0">
            <Car className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-gray-900 tracking-tight">
                Automotive Brands & Parts Catalogue
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-mono">
                {brands.length} Brands
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Browse brand-specific categories, assign replacement components, and identify missing gaps.
            </p>
          </div>
        </div>

        {/* View Switcher & Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap self-end md:self-auto">
          <div className="flex items-center p-1 bg-gray-100 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode("explorer")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === "explorer"
                  ? "bg-white text-gray-900 shadow-2xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <FolderTree className="w-3.5 h-3.5 text-ember" />
              <span>Brand Explorer</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode("logos")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === "logos"
                  ? "bg-white text-gray-900 shadow-2xs"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Grid className="w-3.5 h-3.5 text-ember" />
              <span>Logos Directory</span>
            </button>
          </div>

          <button
            type="button"
            onClick={openAddBrandModal}
            className="btn-primary text-xs py-2 px-3.5 rounded-xl flex items-center gap-1.5 shadow-xs font-bold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Brand</span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* VIEW MODE 1: PROFESSIONAL SPLIT-PANE BRAND EXPLORER */}
      {/* ===================================================================== */}
      {viewMode === "explorer" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ----------------------------------------------------------------- */}
          {/* LEFT COLUMN: BRAND DIRECTORY SELECTOR (4 Columns on Desktop) */}
          {/* ----------------------------------------------------------------- */}
          <div className="lg:col-span-4 bg-white rounded-2xl border border-gray-200/90 shadow-2xs p-4 sm:p-5 space-y-4 lg:sticky lg:top-20">
            {/* Search Brand Field */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={brandSearch}
                onChange={(e) => setBrandSearch(e.target.value)}
                placeholder="Search 34 brands..."
                className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-ember/20 focus:border-ember bg-gray-50/50 hover:bg-white transition-colors"
              />
              {brandSearch && (
                <button
                  type="button"
                  onClick={() => setBrandSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Brand Group Filter Chips */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin">
              {[
                { id: "all", label: "All" },
                { id: "car_make", label: "Car Makes" },
                { id: "oem_genuine", label: "OEM Spares" },
                { id: "aftermarket", label: "Aftermarket" },
              ].map((grp) => (
                <button
                  key={grp.id}
                  type="button"
                  onClick={() => setBrandGroupFilter(grp.id)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg font-bold shrink-0 transition-all cursor-pointer ${
                    brandGroupFilter === grp.id
                      ? "bg-gray-900 text-white shadow-xs"
                      : "bg-gray-100 hover:bg-gray-200 text-gray-600"
                  }`}
                >
                  {grp.label}
                </button>
              ))}
            </div>

            {/* Vertical Scrollable Brand List */}
            <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1 scrollbar-thin">
              {filteredBrands.map((brand) => {
                const isSelected = selectedBrand?.slug === brand.slug;
                const brandPartsCount = products.filter((p) => productMatchesBrand(p, brand)).length;
                const meta = BRAND_METADATA_MAP[brand.slug];

                return (
                  <button
                    key={brand.id}
                    type="button"
                    onClick={() => setSelectedBrandSlug(brand.slug)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all cursor-pointer border ${
                      isSelected
                        ? "bg-ember/5 border-ember/60 shadow-xs ring-1 ring-ember/20"
                        : "bg-white hover:bg-gray-50/80 border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Emblem Box */}
                      <div className="w-8 h-8 rounded-lg bg-[#F8F9FA] border border-gray-200 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                        {brand.logoUrl ? (
                          <img
                            src={brand.logoUrl}
                            alt={brand.name}
                            className="w-full h-full object-contain p-1"
                          />
                        ) : (
                          <span className="text-[10px] font-black text-gray-700">
                            {brand.name.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>

                      {/* Brand Titles */}
                      <div className="min-w-0">
                        <span
                          className={`text-xs font-bold block truncate leading-tight ${
                            isSelected ? "text-ember" : "text-gray-900"
                          }`}
                        >
                          {brand.name}
                        </span>
                        <span className="text-[10px] text-gray-400 font-medium block truncate">
                          {meta?.origin || "Automotive Component"}
                        </span>
                      </div>
                    </div>

                    {/* Part Count Badge */}
                    <div className="shrink-0 pl-2">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                          brandPartsCount > 0
                            ? isSelected
                              ? "bg-ember text-white"
                              : "bg-emerald-100 text-emerald-800"
                            : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {brandPartsCount} {brandPartsCount === 1 ? "part" : "parts"}
                      </span>
                    </div>
                  </button>
                );
              })}

              {filteredBrands.length === 0 && (
                <div className="p-6 text-center text-xs text-gray-400">
                  No brands match &quot;{brandSearch}&quot;
                </div>
              )}
            </div>
          </div>

          {/* ----------------------------------------------------------------- */}
          {/* RIGHT COLUMN: SELECTED BRAND CANVAS (8 Columns on Desktop) */}
          {/* ----------------------------------------------------------------- */}
          <div className="lg:col-span-8 space-y-6">
            {selectedBrand ? (
              <>
                {/* Active Brand Hero Card */}
                <div className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-200/90 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-5 relative overflow-hidden">
                  <div className="flex items-center gap-4">
                    {/* Brand High-Res Emblem */}
                    <div className="w-16 h-16 rounded-2xl bg-white border border-gray-200 p-2 flex items-center justify-center shrink-0 shadow-xs relative group">
                      {selectedBrand.logoUrl ? (
                        <img
                          src={selectedBrand.logoUrl}
                          alt={selectedBrand.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-xl font-black text-gray-800">
                          {selectedBrand.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditLogoModal(selectedBrand)}
                        title="Change Logo"
                        className="absolute inset-0 bg-black/60 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-bold"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg sm:text-xl font-black text-gray-900 tracking-tight">
                          {selectedBrand.name}
                        </h2>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-ember/10 text-ember uppercase tracking-wider">
                          {selectedBrandMeta?.origin || "Global Specialist"}
                        </span>
                        {selectedBrandMeta?.categoryGroup === "car_make" && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 uppercase tracking-wider">
                            Vehicle OEM
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Slug: <span className="font-mono text-gray-700">{selectedBrand.slug}</span> • Showing categories calibrated for this manufacturer.
                      </p>
                    </div>
                  </div>

                  {/* Actions & Live Links */}
                  <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => openEditLogoModal(selectedBrand)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 hover:border-gray-300 bg-white text-gray-700 hover:text-gray-900 text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-gray-400" />
                      <span>Edit Logo</span>
                    </button>

                    <Link
                      href={`/search?make=${encodeURIComponent(selectedBrand.name)}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 hover:border-gray-300 bg-white text-gray-700 hover:text-ember text-xs font-bold transition-colors shadow-2xs"
                    >
                      <span>Storefront</span>
                      <ArrowUpRight className="w-3 h-3 text-gray-400" />
                    </Link>

                    <Link
                      href={`/admin/products/new?make=${encodeURIComponent(selectedBrand.name)}&brand=${encodeURIComponent(selectedBrandMeta?.oemBrandName || selectedBrand.name)}`}
                      className="btn-primary text-xs py-1.5 px-3.5 rounded-xl font-bold flex items-center gap-1.5 shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Add Part for {selectedBrand.name}</span>
                    </Link>
                  </div>
                </div>

                {/* KPI Metrics Strip */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white p-3.5 rounded-xl border border-gray-200/90 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
                      Mapped Spare Parts
                    </span>
                    <span className="text-xl font-black text-gray-900 mt-0.5 block">
                      {productsForSelectedBrand.length}
                    </span>
                    <span className="text-[11px] text-emerald-600 font-medium">
                      ✓ Ready in catalogue
                    </span>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-gray-200/90 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
                      Active Categories
                    </span>
                    <span className="text-xl font-black text-emerald-700 mt-0.5 block">
                      {categoryMetrics.coveredCount} / {categoryMetrics.totalCategories}
                    </span>
                    <span className="text-[11px] text-gray-500 font-medium">
                      Navigation coverage
                    </span>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-gray-200/90 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
                      Inventory Gaps
                    </span>
                    <span className="text-xl font-black text-amber-600 mt-0.5 block">
                      {categoryMetrics.missingCount}
                    </span>
                    <span className="text-[11px] text-amber-700 font-medium">
                      {categoryMetrics.missingCount > 0 ? "Uploads recommended" : "100% full coverage"}
                    </span>
                  </div>
                </div>

                {/* Controls Bar: Parts Filter & Category Toggles */}
                <div className="bg-white p-3.5 rounded-xl border border-gray-200/90 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={expandAllCategories}
                      className="text-[11px] font-bold text-gray-600 hover:text-gray-900 px-2.5 py-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                      Expand All
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={collapseAllCategories}
                      className="text-[11px] font-bold text-gray-600 hover:text-gray-900 px-2.5 py-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                      Collapse All
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700">
                      <input
                        type="checkbox"
                        checked={showOnlyGaps}
                        onChange={(e) => setShowOnlyGaps(e.target.checked)}
                        className="rounded border-gray-300 text-ember focus:ring-ember h-4 w-4"
                      />
                      <span>Show Missing Gaps Only</span>
                    </label>

                    <div className="relative w-44">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={partsSearch}
                        onChange={(e) => setPartsSearch(e.target.value)}
                        placeholder="Filter parts..."
                        className="w-full pl-8 pr-2.5 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-ember"
                      />
                    </div>
                  </div>
                </div>

                {/* Categories & Mapped Spare Parts List */}
                <div className="space-y-3.5">
                  {NAVBAR_CATEGORIES.map((cat) => {
                    const catParts = getProductsForCategory(cat.slug);
                    const hasParts = catParts.length > 0;
                    const isExpanded = Boolean(expandedCategorySlugs[cat.slug]);
                    const subcategories = getSubcategoriesForCategory(cat.slug);
                    const IconComponent = getCategoryIcon(cat.slug);

                    if (showOnlyGaps && hasParts) return null;

                    const selectedSubSlug = selectedSubcategoryFilter[cat.slug] || null;

                    const filteredCatParts = catParts.filter((p) => {
                      if (selectedSubSlug) {
                        const partsForSub = getProductsForSubcategory(cat.slug, selectedSubSlug);
                        if (!partsForSub.some((subP) => subP.id === p.id)) return false;
                      }
                      if (partsSearch.trim()) {
                        return (
                          p.name.toLowerCase().includes(partsSearch.toLowerCase()) ||
                          p.sku.toLowerCase().includes(partsSearch.toLowerCase()) ||
                          (p.subcategoryId && p.subcategoryId.toLowerCase().includes(partsSearch.toLowerCase()))
                        );
                      }
                      return true;
                    });

                    const getProductSubcategoryName = (prod: AdminProductListItem) => {
                      if (!prod.subcategoryId) return "General";
                      const subs = subcategories;
                      const found = subs.find(
                        (s) =>
                          s.slug.toLowerCase() === prod.subcategoryId?.toLowerCase() ||
                          s.name.toLowerCase() === prod.subcategoryId?.toLowerCase()
                      );
                      if (found) return found.name;
                      return prod.subcategoryId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                    };

                    return (
                      <div
                        key={cat.id}
                        className={`bg-white rounded-2xl border transition-all overflow-hidden ${
                          hasParts
                            ? "border-gray-200/90 shadow-2xs"
                            : "border-dashed border-amber-300 bg-amber-50/15"
                        }`}
                      >
                        {/* Category Card Header */}
                        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100">
                          <div
                            onClick={() => toggleCategoryExpand(cat.slug)}
                            className="flex items-center gap-3 cursor-pointer group flex-1"
                          >
                            <div className="w-8 h-8 rounded-xl bg-gray-100 group-hover:bg-ember/10 flex items-center justify-center text-gray-600 group-hover:text-ember transition-colors shrink-0">
                              <IconComponent className="w-4 h-4" />
                            </div>

                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-bold text-gray-900 group-hover:text-ember transition-colors">
                                  {cat.name}
                                </h3>
                                {hasParts ? (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                    ✓ {catParts.length} {catParts.length === 1 ? "part" : "parts"}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                                    ⚠️ Missing Gap
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-gray-400">
                                {subcategories.length} subcategories
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                            <Link
                              href={`/admin/products/new?category=${cat.slug}&make=${encodeURIComponent(selectedBrand.name)}&brand=${encodeURIComponent(selectedBrandMeta?.oemBrandName || selectedBrand.name)}&returnTo=${encodeURIComponent(`/admin/brands?brand=${selectedBrand.slug}&category=${cat.slug}`)}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-gray-200 hover:border-ember bg-white hover:bg-orange-50/50 text-gray-700 hover:text-ember transition-all shadow-2xs"
                            >
                              <Plus className="w-3.5 h-3.5 text-ember stroke-[2.5]" />
                              <span>Add {cat.name}</span>
                            </Link>

                            <button
                              type="button"
                              onClick={() => toggleCategoryExpand(cat.slug)}
                              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
                              title={isExpanded ? "Collapse Category" : "Expand Subcategories"}
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-ember" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Accordion Content */}
                        {isExpanded && (
                          <div className="p-4 bg-gray-50/50 space-y-4">
                            {/* Structured Subcategories Grid */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between pb-1 border-b border-gray-200/60">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600 flex items-center gap-1.5">
                                  <span>Subcategories for {selectedBrand.name}</span>
                                  <span className="text-[10px] text-gray-400 font-normal">({subcategories.length} total)</span>
                                </span>
                                <span className="text-[11px] text-gray-500 font-medium">
                                  {subcategories.filter((s) => getProductsForSubcategory(cat.slug, s.slug).length > 0).length} of {subcategories.length} covered
                                </span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 pt-1">
                                {subcategories.map((sub, idx) => {
                                  const subParts = getProductsForSubcategory(cat.slug, sub.slug);
                                  const subHas = subParts.length > 0;
                                  const isSubExpanded = Boolean(expandedSubcategoryCards[`${cat.slug}:${sub.slug}`]);
                                  const isSelectedFilter = selectedSubcategoryFilter[cat.slug] === sub.slug;

                                  const uploadUrl = `/admin/products/new?category=${cat.slug}&subcategoryId=${sub.slug}&make=${encodeURIComponent(selectedBrand.name)}&brand=${encodeURIComponent(selectedBrandMeta?.oemBrandName || selectedBrand.name)}&returnTo=${encodeURIComponent(`/admin/brands?brand=${selectedBrand.slug}&category=${cat.slug}`)}`;

                                  return (
                                    <div
                                      key={sub.slug}
                                      className={`rounded-xl border transition-all overflow-hidden ${
                                        isSelectedFilter
                                          ? "bg-amber-50/40 border-ember ring-2 ring-ember/20 shadow-xs"
                                          : subHas
                                          ? "bg-white border-emerald-200 shadow-2xs hover:border-emerald-400"
                                          : "bg-white border-dashed border-gray-300 hover:border-amber-400 hover:bg-amber-50/20"
                                      }`}
                                    >
                                      <div className="p-2.5 flex items-center justify-between gap-2.5">
                                        <div className="min-w-0 flex items-center gap-2">
                                          <span className="w-5 h-5 rounded-md bg-gray-100 text-gray-500 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                                            {idx + 1}
                                          </span>
                                          <div className="min-w-0">
                                            <span className="font-bold text-xs text-gray-900 block truncate" title={sub.name}>
                                              {sub.name}
                                            </span>
                                            <span className="text-[10px] text-gray-400 block">
                                              {subHas
                                                ? `${subParts.length} mapped ${subParts.length === 1 ? "part" : "parts"}`
                                                : "Missing component"}
                                            </span>
                                          </div>
                                        </div>

                                        <div className="shrink-0 flex items-center gap-1.5">
                                          {subHas && (
                                            <button
                                              type="button"
                                              onClick={() => toggleSubcategoryCard(cat.slug, sub.slug)}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors cursor-pointer"
                                              title="Click to toggle parts list for this subcategory"
                                            >
                                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                              <span>{subParts.length}</span>
                                              {isSubExpanded ? (
                                                <ChevronUp className="w-3 h-3 text-emerald-600 ml-0.5" />
                                              ) : (
                                                <ChevronDown className="w-3 h-3 text-emerald-600 ml-0.5" />
                                              )}
                                            </button>
                                          )}

                                          <Link
                                            href={uploadUrl}
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all shadow-2xs ${
                                              subHas
                                                ? "bg-gray-50 hover:bg-orange-50 text-gray-700 hover:text-ember border border-gray-200 hover:border-ember"
                                                : "bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300"
                                            }`}
                                            title={`Upload ${sub.name} for ${selectedBrand.name}`}
                                          >
                                            <Plus className="w-3 h-3 stroke-[2.5]" />
                                            <span>Upload</span>
                                          </Link>
                                        </div>
                                      </div>

                                      {/* Expanded subcategory parts inline preview drawer */}
                                      {isSubExpanded && subHas && (
                                        <div className="px-2.5 pb-2.5 pt-1 border-t border-gray-100 bg-gray-50/60 space-y-1.5">
                                          <div className="flex items-center justify-between text-[10px] text-gray-500 font-semibold pt-1">
                                            <span>Parts in {sub.name}:</span>
                                            <button
                                              type="button"
                                              onClick={() => handleSelectSubcategoryFilter(cat.slug, sub.slug)}
                                              className="text-ember hover:underline font-bold cursor-pointer"
                                            >
                                              {isSelectedFilter ? "Viewing in table" : "Filter table below"}
                                            </button>
                                          </div>
                                          {subParts.map((sp) => (
                                            <div
                                              key={sp.id}
                                              className="flex items-center justify-between p-1.5 rounded-lg bg-white border border-gray-200/80 gap-2 text-xs hover:border-gray-300 transition-colors"
                                            >
                                              <div className="flex items-center gap-2 min-w-0">
                                                <div className="w-7 h-7 rounded bg-gray-50 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
                                                  {sp.imageUrl ? (
                                                    <img src={sp.imageUrl} alt={sp.name} className="w-full h-full object-cover" />
                                                  ) : (
                                                    <Package className="w-3.5 h-3.5 text-gray-400" />
                                                  )}
                                                </div>
                                                <div className="min-w-0">
                                                  <span className="font-bold text-gray-900 block truncate text-[11px]" title={sp.name}>
                                                    {sp.name}
                                                  </span>
                                                  <div className="flex items-center gap-1.5 text-[9px] text-gray-500">
                                                    <span className="font-mono">{sp.sku}</span>
                                                    <span>•</span>
                                                    <span className={sp.condition === "new" ? "text-emerald-700 font-bold" : "text-amber-800 font-bold"}>
                                                      {sp.condition.toUpperCase()}
                                                    </span>
                                                  </div>
                                                </div>
                                              </div>

                                              <div className="shrink-0 flex items-center gap-2">
                                                <span className="font-bold text-gray-900 text-[11px]">
                                                  ₹{(sp.priceMinor / 100).toLocaleString("en-IN")}
                                                </span>
                                                <Link
                                                  href={`/admin/products/${sp.id}`}
                                                  className="p-1 rounded text-gray-400 hover:text-ember hover:bg-gray-100 transition-colors"
                                                  title="Edit Part"
                                                >
                                                  <Edit2 className="w-3 h-3" />
                                                </Link>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Subcategory Filter Pills Row for Table */}
                            {catParts.length > 0 && (
                              <div className="flex items-center justify-between flex-wrap gap-2 pt-2 pb-1 border-t border-gray-200/60">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] font-bold text-gray-600 mr-1 flex items-center gap-1">
                                    <Filter className="w-3 h-3 text-ember" />
                                    <span>Filter Table:</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleSelectSubcategoryFilter(cat.slug, null)}
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                                      !selectedSubSlug
                                        ? "bg-gray-900 text-white shadow-2xs"
                                        : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                                    }`}
                                  >
                                    All Parts ({catParts.length})
                                  </button>
                                  {subcategories.map((sub) => {
                                    const count = getProductsForSubcategory(cat.slug, sub.slug).length;
                                    if (count === 0) return null;
                                    const isSelected = selectedSubSlug === sub.slug;
                                    return (
                                      <button
                                        key={sub.slug}
                                        type="button"
                                        onClick={() => handleSelectSubcategoryFilter(cat.slug, sub.slug)}
                                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                                          isSelected
                                            ? "bg-ember text-white shadow-2xs"
                                            : "bg-white text-gray-700 border border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                                        }`}
                                      >
                                        <span>{sub.name}</span>
                                        <span className={`px-1.5 py-0.2 rounded-full text-[9px] ${isSelected ? "bg-white/20 text-white" : "bg-emerald-50 text-emerald-700"}`}>
                                          {count}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                                {selectedSubSlug && (
                                  <button
                                    type="button"
                                    onClick={() => handleSelectSubcategoryFilter(cat.slug, null)}
                                    className="text-[10px] text-gray-500 hover:text-ember font-bold underline cursor-pointer"
                                  >
                                    Clear Filter
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Mapped Parts Table */}
                            {filteredCatParts.length > 0 ? (
                              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-2xs">
                                <table className="w-full text-left text-xs">
                                  <thead className="bg-gray-50/80 text-gray-500 font-bold border-b border-gray-100">
                                    <tr>
                                      <th className="py-2.5 px-3">Product Name</th>
                                      <th className="py-2.5 px-3">Subcategory</th>
                                      <th className="py-2.5 px-3">SKU</th>
                                      <th className="py-2.5 px-3">Condition</th>
                                      <th className="py-2.5 px-3">Fitment</th>
                                      <th className="py-2.5 px-3">Price</th>
                                      <th className="py-2.5 px-3 text-right">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {filteredCatParts.map((prod) => (
                                      <tr key={prod.id} className="hover:bg-gray-50/80 transition-colors">
                                        <td className="py-2 px-3">
                                          <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
                                              {prod.imageUrl ? (
                                                <img
                                                  src={prod.imageUrl}
                                                  alt={prod.name}
                                                  className="w-full h-full object-cover"
                                                />
                                              ) : (
                                                <Package className="w-3.5 h-3.5 text-gray-400" />
                                              )}
                                            </div>
                                            <div className="min-w-0">
                                              <span className="font-bold text-gray-900 block truncate max-w-xs">
                                                {prod.name}
                                              </span>
                                              <span className="text-[10px] text-gray-400">
                                                {prod.brandName}
                                              </span>
                                            </div>
                                          </div>
                                        </td>
                                        <td className="py-2 px-3">
                                          <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-200/80 max-w-[130px] truncate" title={getProductSubcategoryName(prod)}>
                                            {getProductSubcategoryName(prod)}
                                          </span>
                                        </td>
                                        <td className="py-2 px-3 font-mono text-[11px] text-gray-600">
                                          {prod.sku}
                                        </td>
                                        <td className="py-2 px-3">
                                          {prod.condition === "new" ? (
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                              NEW
                                            </span>
                                          ) : (
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
                                              USED
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-2 px-3 text-gray-500 text-[11px] max-w-xs truncate">
                                          {prod.fitmentHint || "Direct Fit"}
                                        </td>
                                        <td className="py-2 px-3 font-bold text-gray-900">
                                          ₹{(prod.priceMinor / 100).toLocaleString("en-IN")}
                                        </td>
                                        <td className="py-2 px-3 text-right">
                                          <Link
                                            href={`/admin/products/${prod.id}`}
                                            className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-600 hover:text-ember px-2 py-1 rounded-md hover:bg-gray-100 transition-colors"
                                          >
                                            <Edit2 className="w-3 h-3" />
                                            <span>Edit</span>
                                          </Link>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="bg-amber-50/80 border border-dashed border-amber-300 rounded-xl p-4 text-center">
                                <p className="text-xs font-bold text-amber-900">
                                  {selectedSubSlug
                                    ? `No parts mapped for selected subcategory yet.`
                                    : `No ${cat.name} parts mapped for ${selectedBrand.name} yet.`}
                                </p>
                                <div className="mt-2">
                                  <Link
                                    href={`/admin/products/new?category=${cat.slug}&make=${encodeURIComponent(selectedBrand.name)}&brand=${encodeURIComponent(selectedBrandMeta?.oemBrandName || selectedBrand.name)}`}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ember text-white text-xs font-bold shadow-xs hover:bg-ember-deep transition-colors"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>Upload {cat.name} for {selectedBrand.name}</span>
                                  </Link>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="bg-white p-8 rounded-2xl border border-gray-200 text-center">
                <Car className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-gray-700">No brand selected</p>
                <p className="text-xs text-gray-500">Pick a brand from the list on the left.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VIEW MODE 2: ORIGINAL BRAND LOGOS & EMBLEMS DIRECTORY */}
      {/* ===================================================================== */}
      {viewMode === "logos" && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200/90 shadow-2xs">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={brandSearch}
                onChange={(e) => setBrandSearch(e.target.value)}
                placeholder="Search brands by name or slug..."
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-ember/20 focus:border-ember"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">
                {filteredBrands.length} brands total
              </span>
            </div>
          </div>

          {/* Brands Studio Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {filteredBrands.map((brand) => {
              const brandPartsCount = products.filter((p) => productMatchesBrand(p, brand)).length;
              const meta = BRAND_METADATA_MAP[brand.slug];

              return (
                <div
                  key={brand.id}
                  className="bg-white rounded-2xl border border-gray-200/90 p-4 flex flex-col items-center text-center shadow-2xs hover:shadow-md transition-all group"
                >
                  {/* Emblem Circle */}
                  <div className="w-16 h-16 rounded-full border border-gray-200 bg-[#F8F9FA] flex items-center justify-center overflow-hidden mb-3 shadow-inner group-hover:border-ember transition-colors">
                    {brand.logoUrl ? (
                      <img
                        src={brand.logoUrl}
                        alt={brand.name}
                        className="w-full h-full object-contain p-2"
                      />
                    ) : (
                      <span className="font-black text-sm text-gray-700">
                        {brand.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-xs sm:text-sm text-gray-900 leading-tight">
                    {brand.name}
                  </h3>
                  <span className="text-[10px] text-gray-400 font-mono mt-0.5">
                    {brand.slug}
                  </span>

                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full mt-2">
                    {brandPartsCount} parts
                  </span>

                  <div className="w-full space-y-1.5 mt-3 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => openEditLogoModal(brand)}
                      className="w-full inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border border-gray-200 hover:border-ember hover:bg-ember/5 text-gray-700 hover:text-ember text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Manage Logo</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBrandSlug(brand.slug);
                        setViewMode("explorer");
                      }}
                      className="w-full inline-flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      <Layers className="w-3 h-3 text-ember" />
                      <span>View Categories</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* EDIT BRAND LOGO MODAL */}
      {/* ===================================================================== */}
      {activeBrandForLogo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 relative">
            <button
              type="button"
              onClick={closeEditLogoModal}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-ember">
                Brand Logo Management
              </span>
              <h3 className="text-lg font-bold text-gray-900">{activeBrandForLogo.name}</h3>
              <p className="text-xs text-gray-500 font-mono">Slug: {activeBrandForLogo.slug}</p>
            </div>

            {actionError && (
              <div className="flex items-center gap-2 p-3 mb-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{actionError}</span>
              </div>
            )}

            {actionSuccess && (
              <div className="flex items-center gap-2 p-3 mb-4 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                <span>{actionSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveLogo} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Manufacturer Logo / Emblem (Cloudinary)
                </label>
                <AdminSingleImageUploader
                  label="Brand Logo"
                  folder={CLOUDINARY_FOLDERS.brands}
                  value={logoUrl}
                  storageKey={storageKey}
                  onChange={(data) => {
                    setLogoUrl(data.imageUrl);
                    setStorageKey(data.storageKey);
                    setUploadReceipt(data.uploadReceipt);
                  }}
                  onStagedDeletion={(oldKey) => {
                    setStagedDeletions((prev) => [...prev, oldKey]);
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Image Alt Text (SEO Accessibility)
                </label>
                <input
                  type="text"
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                  placeholder="e.g. Maruti Suzuki official emblem"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-ember/20 focus:border-ember"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={closeEditLogoModal}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary text-xs py-2 px-5 rounded-xl font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Brand Logo</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* ADD BRAND MODAL */}
      {/* ===================================================================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 relative">
            <button
              type="button"
              onClick={closeAddBrandModal}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-ember">
                New Automotive Brand
              </span>
              <h3 className="text-lg font-bold text-gray-900">Add New Brand</h3>
              <p className="text-xs text-gray-500">
                Register a new vehicle make or component manufacturer in the catalogue.
              </p>
            </div>

            {actionError && (
              <div className="flex items-center gap-2 p-3 mb-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{actionError}</span>
              </div>
            )}

            <form onSubmit={handleCreateBrand} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Brand Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newBrandName}
                  onChange={(e) => {
                    setNewBrandName(e.target.value);
                    if (!newBrandSlug || newBrandSlug === newBrandName.toLowerCase().replace(/[^a-z0-9]+/g, "-")) {
                      setNewBrandSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
                    }
                  }}
                  placeholder="e.g. Isuzu Motors"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-ember/20 focus:border-ember"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  URL Slug
                </label>
                <input
                  type="text"
                  value={newBrandSlug}
                  onChange={(e) => setNewBrandSlug(e.target.value)}
                  placeholder="e.g. isuzu-motors"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ember/20 focus:border-ember"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Brand Logo (Optional Cloudinary Upload)
                </label>
                <AdminSingleImageUploader
                  label="Brand Logo"
                  folder={CLOUDINARY_FOLDERS.brands}
                  value={newBrandLogoUrl}
                  storageKey={newBrandStorageKey}
                  onChange={(data) => {
                    setNewBrandLogoUrl(data.imageUrl);
                    setNewBrandStorageKey(data.storageKey);
                    setNewBrandUploadReceipt(data.uploadReceipt);
                  }}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={closeAddBrandModal}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary text-xs py-2 px-5 rounded-xl font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Create Brand</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
