"use client";

import React, { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Sparkles,
  RefreshCw,
  FileText,
  Trash2,
  Wrench,
  Percent,
  Package,
  Car,
  Tag,
  DollarSign,
  Camera,
  Layers,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  createAdminProductAction,
  createAdminDraftProductAction,
} from "@/features/admin/actions";
import type {
  ProductImageInput,
  ProductFitmentInput,
} from "@/features/admin/schemas";
import { AdminProductImageUploader } from "@/components/admin/admin-product-image-uploader";
import {
  APPROVED_CATEGORIES,
  APPROVED_BRANDS,
  APPROVED_VEHICLE_MAKES,
  PRODUCT_ORIGIN_LABELS,
  USED_CONDITION_GRADES,
  USED_CONDITION_GRADE_LABELS,
  INSPECTION_STATUSES,
  INSPECTION_STATUS_LABELS,
  generateStandardSku,
  resolveCanonicalCategorySlug,
  type ProductOrigin,
} from "@/lib/constants/approved-catalogue";
import { NAVBAR_CATEGORIES } from "@/lib/constants/navigation";

export function AdminNewProductForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramCategory = searchParams.get("category");
  const paramSubcategoryId = searchParams.get("subcategoryId");
  const paramBrand = searchParams.get("brand");
  const paramMake = searchParams.get("make");
  const paramModel = searchParams.get("model");
  const paramName = searchParams.get("name");
  const returnTo = searchParams.get("returnTo") || "/admin/brands";

  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<"publish" | "draft" | null>(null);

  // Classification: Origin & Condition
  const [origin, setOrigin] = useState<ProductOrigin>("genuine_oem");
  const [condition, setCondition] = useState<"new" | "used">("new");

  // Match brand from param or fallback to first
  const matchedBrand = useMemo(() => {
    if (!paramBrand) return APPROVED_BRANDS[0]?.name || "Bosch";
    const found = APPROVED_BRANDS.find(
      (b) =>
        b.name.toLowerCase() === paramBrand.toLowerCase() ||
        b.slug.toLowerCase() === paramBrand.toLowerCase() ||
        b.name.toLowerCase().includes(paramBrand.toLowerCase())
    );
    return found ? found.name : paramBrand;
  }, [paramBrand]);

  // Match vehicle make from param
  const matchedMake = useMemo(() => {
    if (!paramMake) return "";
    const found = APPROVED_VEHICLE_MAKES.find(
      (m) =>
        m.name.toLowerCase() === paramMake.toLowerCase() ||
        m.slug.toLowerCase() === paramMake.toLowerCase() ||
        m.name.toLowerCase().includes(paramMake.toLowerCase())
    );
    return found ? found.name : paramMake;
  }, [paramMake]);

  // Section 1: Basic Part Details
  const initialName =
    paramName ||
    (matchedMake && paramSubcategoryId
      ? `${matchedMake} ${paramSubcategoryId
          .replace(/-/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())}`
      : "");
  const [name, setName] = useState(initialName);
  const [sku, setSku] = useState("");
  const initialCat = paramCategory || APPROVED_CATEGORIES[0]?.slug || "suspension-and-steering";
  const [category, setCategory] = useState(initialCat);
  const [subcategoryId, setSubcategoryId] = useState(paramSubcategoryId || "");
  const [brand, setBrand] = useState(matchedBrand);
  const [partNumber, setPartNumber] = useState("");
  const [oemNumber, setOemNumber] = useState("");
  const [description, setDescription] = useState("");
  const [fitmentHint, setFitmentHint] = useState(matchedMake ? `Fits ${matchedMake}` : "");

  // Section 2: Pre-Owned Disclosures
  const [conditionGrade, setConditionGrade] = useState("A");
  const [inspectionStatus, setInspectionStatus] = useState<"pending" | "inspected" | "failed" | "">("inspected");
  const [testedStatus, setTestedStatus] = useState("100% Tested & Verified");
  const [conditionNotes, setConditionNotes] = useState("");
  const [visibleWearOrDefects, setVisibleWearOrDefects] = useState("");
  const [warrantyDetails, setWarrantyDetails] = useState("30-Day Replacement Guarantee");

  // Section 3: Fitment
  const [fitments, setFitments] = useState<ProductFitmentInput[]>([]);
  const [isAddingFitmentOpen, setIsAddingFitmentOpen] = useState(false);
  const [fitmentMake, setFitmentMake] = useState(matchedMake || APPROVED_VEHICLE_MAKES[0]?.name || "");
  const [fitmentModel, setFitmentModel] = useState(paramModel || "");
  const [fitmentVariant, setFitmentVariant] = useState("");
  const [fitmentYearStart, setFitmentYearStart] = useState("2015");
  const [fitmentYearEnd, setFitmentYearEnd] = useState("");
  const [fitmentFuel, setFitmentFuel] = useState("");
  const [fitmentTransmission, setFitmentTransmission] = useState("");
  const [fitmentNotes, setFitmentNotes] = useState("");
  const [fitmentVerified, setFitmentVerified] = useState<"verified" | "unverified" | "oem_cross_ref">("verified");

  // Section 4: Pricing & Stock
  const [priceRupees, setPriceRupees] = useState("");
  const [compareAtPriceRupees, setCompareAtPriceRupees] = useState("");
  const [stockQuantity, setStockQuantity] = useState("5");
  const [lowStockThreshold, setLowStockThreshold] = useState("2");

  // Section 5: Images
  const [images, setImages] = useState<ProductImageInput[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);

  // Status feedback
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Dynamic subcategories for selected category
  const availableSubcategories = useMemo(() => {
    const canon = resolveCanonicalCategorySlug(category);
    const nav = NAVBAR_CATEGORIES.find(
      (c) => c.slug === category || c.slug === canon || resolveCanonicalCategorySlug(c.slug) === canon
    );
    if (nav && nav.subcategories && nav.subcategories.length > 0) {
      return nav.subcategories;
    }
    const appr = APPROVED_CATEGORIES.find(
      (c) => c.slug === category || c.slug === canon
    );
    return appr?.subcategories || [];
  }, [category]);

  // Ensure default subcategory is selected if none chosen
  React.useEffect(() => {
    if (!subcategoryId && availableSubcategories.length > 0 && availableSubcategories[0]) {
      setSubcategoryId(availableSubcategories[0].slug);
    }
  }, [availableSubcategories, subcategoryId]);

  // Available models for fitment make
  const activeMakeObj = useMemo(
    () => APPROVED_VEHICLE_MAKES.find((m) => m.name === fitmentMake),
    [fitmentMake]
  );

  const availableModels = useMemo(
    () => activeMakeObj?.models || [],
    [activeMakeObj]
  );

  const activeModelObj = useMemo(
    () => availableModels.find((m) => m.name === fitmentModel),
    [availableModels, fitmentModel]
  );

  // Auto SKU generator helper
  const handleAutoGenerateSku = () => {
    const nextSeq = Math.floor(1000 + Math.random() * 9000);
    const newSku = generateStandardSku(category, brand, nextSeq);
    setSku(newSku);
  };

  // Add fitment record
  const handleAddFitment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fitmentMake || !fitmentModel) {
      setFeedback({ type: "error", message: "Please select both Make and Model for vehicle compatibility." });
      return;
    }

    const yStart = parseInt(fitmentYearStart, 10);
    if (isNaN(yStart) || yStart < 1980 || yStart > 2035) {
      setFeedback({ type: "error", message: "Please provide a valid start year (between 1980 and 2035)." });
      return;
    }

    let yEnd: number | null = null;
    if (fitmentYearEnd.trim()) {
      const parsedEnd = parseInt(fitmentYearEnd, 10);
      if (isNaN(parsedEnd) || parsedEnd < yStart || parsedEnd > 2035) {
        setFeedback({ type: "error", message: "End year must be equal to or greater than start year." });
        return;
      }
      yEnd = parsedEnd;
    }

    const newFitment: ProductFitmentInput = {
      make: fitmentMake,
      model: fitmentModel,
      variant: fitmentVariant || null,
      yearStart: yStart,
      yearEnd: yEnd,
      fuelType: fitmentFuel || null,
      transmission: fitmentTransmission || null,
      notes: fitmentNotes.trim() || null,
      verifiedStatus: fitmentVerified,
    };

    setFitments((prev) => [...prev, newFitment]);
    setFitmentModel("");
    setFitmentVariant("");
    setFitmentNotes("");
    setIsAddingFitmentOpen(false);
    setFeedback(null);
  };

  const handleRemoveFitment = (index: number) => {
    setFitments((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculate discount percentage
  const sellingNum = parseFloat(priceRupees) || 0;
  const compareNum = parseFloat(compareAtPriceRupees) || 0;
  const discountPercent =
    compareNum > sellingNum && sellingNum > 0
      ? Math.round(((compareNum - sellingNum) / compareNum) * 100)
      : null;

  const handleCreate = (mode: "publish" | "draft") => {
    setFeedback(null);

    if (!name.trim()) {
      setFeedback({ type: "error", message: "Product name is required." });
      return;
    }

    if (!sku.trim()) {
      setFeedback({ type: "error", message: "Product SKU is required. Click 'Generate SKU' if needed." });
      return;
    }

    if (isUploadingImages) {
      setFeedback({
        type: "error",
        message: "Please wait for photos to finish uploading before saving.",
      });
      return;
    }

    if (sellingNum <= 0) {
      setFeedback({ type: "error", message: "Please enter a valid selling price greater than 0." });
      return;
    }

    const priceMinor = Math.round(sellingNum * 100);
    const compareAtMinor = compareNum > 0 ? Math.round(compareNum * 100) : null;
    const primaryImg = images.find((img) => img.isPrimary)?.url || images[0]?.url || null;

    setPendingAction(mode);
    startTransition(async () => {
      const action = mode === "draft" ? createAdminDraftProductAction : createAdminProductAction;
      const res = await action({
        name: name.trim(),
        sku: sku.trim().toUpperCase(),
        categoryId: category,
        subcategoryId: subcategoryId || null,
        brandId: brand,
        condition,
        origin,
        isOem: origin === "genuine_oem",
        partNumber: partNumber.trim() || null,
        oemNumber: oemNumber.trim() || null,
        oemReference: oemNumber.trim() || null,
        priceMinor,
        compareAtPriceMinor: compareAtMinor,
        stockQuantity: parseInt(stockQuantity, 10) || 0,
        lowStockThreshold: parseInt(lowStockThreshold, 10) || 2,
        description: description.trim() || null,
        fitmentHint: fitmentHint.trim() || null,
        fitments,
        primaryImageUrl: primaryImg,
        images,
        conditionGrade: condition === "used" && conditionGrade ? conditionGrade : null,
        inspectionStatus: condition === "used" && inspectionStatus ? (inspectionStatus as "pending" | "inspected" | "failed") : null,
        conditionNotes: condition === "used" && conditionNotes ? conditionNotes : null,
        visibleWearOrDefects: condition === "used" && visibleWearOrDefects ? visibleWearOrDefects : null,
        testedStatus: condition === "used" && testedStatus ? testedStatus : null,
        warrantyDetails: warrantyDetails.trim() || null,
      });

      if (res.success) {
        setFeedback({
          type: "success",
          message:
            mode === "draft"
              ? `Spare part "${name}" saved as DRAFT.`
              : `Spare part "${name}" successfully published to catalogue!`,
        });
        setTimeout(() => {
          router.push(returnTo);
        }, 1200);
      } else {
        setFeedback({
          type: "error",
          message: res.error || (mode === "draft" ? "Failed to save draft." : "Failed to create spare part."),
        });
      }
      setPendingAction(null);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleCreate("publish");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {/* ===================================================================== */}
      {/* Studio Header Card */}
      {/* ===================================================================== */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Link
              href={returnTo}
              className="text-xs font-bold text-gray-500 hover:text-ember transition-colors flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Brands &amp; Categories</span>
            </Link>
            <span className="text-gray-300">•</span>
            <span className="text-[10px] font-black uppercase tracking-wider text-ember bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200/80">
              Spare Part Onboarding
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
            Add Product to Catalogue
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Fill in the essential part specifications, vehicle fitment, pricing, and upload images.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={returnTo}
            className="px-3.5 py-2 text-xs font-bold rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={() => handleCreate("draft")}
            disabled={isPending || isUploadingImages}
            className="px-3.5 py-2 text-xs font-bold rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-gray-500" />
            <span>Save Draft</span>
          </button>
          <button
            type="button"
            onClick={() => handleCreate("publish")}
            disabled={isPending || isUploadingImages}
            className="btn-primary px-4 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {isPending && pendingAction === "publish" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4 stroke-[2.5]" />
            )}
            <span>Publish Part</span>
          </button>
        </div>
      </div>

      {/* Status Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center gap-2.5 shadow-2xs ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-red-50 border-red-200 text-red-900"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span className="font-semibold">{feedback.message}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* =================================================================== */}
        {/* SECTION 1: ESSENTIAL PART DETAILS                                   */}
        {/* =================================================================== */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/90 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <div className="w-7 h-7 rounded-lg bg-ember/10 text-ember flex items-center justify-center text-xs font-black">
              1
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">
                Essential Spare Part Details
              </h2>
              <p className="text-[11px] text-gray-500">
                Name, category, brand manufacturer, and part numbers.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            {/* Product Name */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-gray-800 mb-1">
                Spare Part Name <span className="text-ember">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Swift Front Shock Absorber Strut (Pair)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember font-medium placeholder:text-gray-400"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-bold text-gray-800 mb-1">
                Category <span className="text-ember">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => {
                  const newCat = e.target.value;
                  setCategory(newCat);
                  const canon = resolveCanonicalCategorySlug(newCat);
                  const navMatch = NAVBAR_CATEGORIES.find((c) => c.slug === newCat || c.slug === canon);
                  if (navMatch?.subcategories?.[0]) {
                    setSubcategoryId(navMatch.subcategories[0].slug);
                  }
                }}
                className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
              >
                {NAVBAR_CATEGORIES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Subcategory */}
            <div>
              <label className="block text-xs font-bold text-gray-800 mb-1">
                Subcategory <span className="text-ember">*</span>
              </label>
              <select
                value={subcategoryId}
                onChange={(e) => setSubcategoryId(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
              >
                {availableSubcategories.map((sub) => (
                  <option key={sub.slug} value={sub.slug}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Brand */}
            <div>
              <label className="block text-xs font-bold text-gray-800 mb-1">
                Component Brand / Maker <span className="text-ember">*</span>
              </label>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
              >
                {APPROVED_BRANDS.map((b) => (
                  <option key={b.id} value={b.name}>
                    {b.name} ({b.isOem ? "OEM Genuine" : "Aftermarket"})
                  </option>
                ))}
              </select>
            </div>

            {/* Sourcing Origin */}
            <div>
              <label className="block text-xs font-bold text-gray-800 mb-1">
                Sourcing Type <span className="text-ember">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOrigin("genuine_oem")}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    origin === "genuine_oem"
                      ? "bg-blue-50 border-blue-400 text-blue-900 ring-1 ring-blue-300"
                      : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                  <span>Genuine OEM</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOrigin("branded_aftermarket")}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    origin === "branded_aftermarket"
                      ? "bg-purple-50 border-purple-400 text-purple-900 ring-1 ring-purple-300"
                      : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Wrench className="w-3.5 h-3.5 text-purple-600" />
                  <span>Aftermarket</span>
                </button>
              </div>
            </div>

            {/* SKU with 1-click generator */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-gray-800">
                  Stock SKU Code <span className="text-ember">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleAutoGenerateSku}
                  className="text-[10px] font-bold text-ember hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  <span>Auto-Generate SKU</span>
                </button>
              </div>
              <input
                type="text"
                required
                placeholder="e.g. SUS-MAR-1024"
                value={sku}
                onChange={(e) => setSku(e.target.value.toUpperCase())}
                className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-gray-900 focus:outline-none focus:border-ember"
              />
            </div>

            {/* Part / OEM Number */}
            <div>
              <label className="block text-xs font-bold text-gray-800 mb-1">
                Manufacturer / OEM Part No.
              </label>
              <input
                type="text"
                placeholder="e.g. 55311-M68P00"
                value={partNumber || oemNumber}
                onChange={(e) => {
                  setPartNumber(e.target.value);
                  setOemNumber(e.target.value);
                }}
                className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2 text-xs font-mono text-gray-900 focus:outline-none focus:border-ember"
              />
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* SECTION 2: CONDITION & QUALITY                                      */}
        {/* =================================================================== */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/90 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <div className="w-7 h-7 rounded-lg bg-ember/10 text-ember flex items-center justify-center text-xs font-black">
              2
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">
                Condition &amp; Warranty
              </h2>
              <p className="text-[11px] text-gray-500">
                Select whether this spare part is Brand New or Inspected Pre-Owned.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div
              onClick={() => setCondition("new")}
              className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3 ${
                condition === "new"
                  ? "border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-400 shadow-2xs"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <div className="w-5 h-5 rounded-full border flex items-center justify-center mt-0.5 shrink-0 bg-white">
                {condition === "new" && <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span className="font-bold text-xs text-gray-900">Brand New</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                    FACTORY PACKED
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  100% brand new, never installed, factory sealed with standard warranty.
                </p>
              </div>
            </div>

            <div
              onClick={() => setCondition("used")}
              className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3 ${
                condition === "used"
                  ? "border-amber-500 bg-amber-50/40 ring-1 ring-amber-400 shadow-2xs"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <div className="w-5 h-5 rounded-full border flex items-center justify-center mt-0.5 shrink-0 bg-white">
                {condition === "used" && <span className="w-2.5 h-2.5 rounded-full bg-amber-600" />}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4 text-amber-600" />
                  <span className="font-bold text-xs text-gray-900">Pre-Owned / Tested</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900">
                    TESTED
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Multi-point inspected, clean working order with replacement warranty.
                </p>
              </div>
            </div>
          </div>

          {/* Simple Pre-Owned Quality Details (Only shown if used) */}
          {condition === "used" && (
            <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200/80 grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-[11px] font-bold text-amber-900 mb-1">
                  Condition Grade
                </label>
                <select
                  value={conditionGrade}
                  onChange={(e) => setConditionGrade(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900"
                >
                  {USED_CONDITION_GRADES.map((g) => (
                    <option key={g} value={g}>
                      {USED_CONDITION_GRADE_LABELS[g]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-amber-900 mb-1">
                  Replacement Warranty
                </label>
                <input
                  type="text"
                  placeholder="e.g. 30-Day Testing Replacement"
                  value={warrantyDetails}
                  onChange={(e) => setWarrantyDetails(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900"
                />
              </div>
            </div>
          )}
        </div>

        {/* =================================================================== */}
        {/* SECTION 3: VEHICLE COMPATIBILITY (WHICH CARS DOES IT FIT?)         */}
        {/* =================================================================== */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-ember/10 text-ember flex items-center justify-center text-xs font-black">
                3
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900">
                  Vehicle Compatibility (Fitment)
                </h2>
                <p className="text-[11px] text-gray-500">
                  Describe which car models this component fits for client searches.
                </p>
              </div>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
              {fitments.length} Models Added
            </span>
          </div>

          <div className="space-y-3 pt-1">
            {/* Quick Fitment Summary */}
            <div>
              <label className="block text-xs font-bold text-gray-800 mb-1">
                Quick Fitment Hint / Compatible Cars
              </label>
              <input
                type="text"
                placeholder="e.g. Maruti Suzuki Swift (2018-2024), Baleno, Dzire 1.2L Petrol"
                value={fitmentHint}
                onChange={(e) => setFitmentHint(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
              />
              <span className="text-[10px] text-gray-400 mt-1 block">
                Shown prominently on the storefront card and product title.
              </span>
            </div>

            {/* Added Fitments Badges */}
            {fitments.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {fitments.map((fit, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-gray-100 text-gray-800 border border-gray-200"
                  >
                    <Car className="w-3.5 h-3.5 text-ember" />
                    <span>
                      {fit.make} {fit.model} ({fit.yearStart}{fit.yearEnd ? `–${fit.yearEnd}` : "+"})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFitment(idx)}
                      className="text-gray-400 hover:text-red-600 transition-colors ml-1 cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Collapsible Model Fitment Selector */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsAddingFitmentOpen(!isAddingFitmentOpen)}
                className="text-xs font-bold text-ember hover:underline flex items-center gap-1 cursor-pointer"
              >
                {isAddingFitmentOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                <span>{isAddingFitmentOpen ? "Close Car Selector" : "+ Add Specific Car Model to Filter"}</span>
              </button>

              {isAddingFitmentOpen && (
                <div className="mt-3 p-4 rounded-xl bg-gray-50 border border-gray-200 grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">Make</label>
                    <select
                      value={fitmentMake}
                      onChange={(e) => {
                        setFitmentMake(e.target.value);
                        setFitmentModel("");
                      }}
                      className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900"
                    >
                      {APPROVED_VEHICLE_MAKES.map((m) => (
                        <option key={m.slug} value={m.name}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">Model</label>
                    <select
                      value={fitmentModel}
                      onChange={(e) => setFitmentModel(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900"
                    >
                      <option value="">Select Model</option>
                      {availableModels.map((m) => (
                        <option key={m.slug} value={m.name}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">From Year</label>
                    <input
                      type="number"
                      placeholder="2015"
                      value={fitmentYearStart}
                      onChange={(e) => setFitmentYearStart(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleAddFitment}
                      className="w-full py-2 px-3 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-lg shadow-2xs transition-colors cursor-pointer"
                    >
                      Add Model
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* SECTION 4: PRICING & WAREHOUSE STOCK                                */}
        {/* =================================================================== */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/90 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <div className="w-7 h-7 rounded-lg bg-ember/10 text-ember flex items-center justify-center text-xs font-black">
              4
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">
                Pricing &amp; Warehouse Inventory
              </h2>
              <p className="text-[11px] text-gray-500">
                Selling price, compare MRP, and initial stock quantity.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            {/* Selling Price */}
            <div>
              <label className="block text-xs font-bold text-gray-800 mb-1">
                Selling Price (₹) <span className="text-ember">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">
                  ₹
                </span>
                <input
                  type="number"
                  step="1"
                  min="1"
                  required
                  placeholder="3450"
                  value={priceRupees}
                  onChange={(e) => setPriceRupees(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl pl-8 pr-3.5 py-2 text-xs font-bold text-gray-900 focus:outline-none focus:border-ember"
                />
              </div>
              <span className="text-[10px] text-gray-400 mt-1 block">Final price inclusive of GST</span>
            </div>

            {/* Compare at Price / MRP */}
            <div>
              <label className="block text-xs font-bold text-gray-800 mb-1">
                Original MRP (₹) <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">
                  ₹
                </span>
                <input
                  type="number"
                  step="1"
                  min="1"
                  placeholder="4200"
                  value={compareAtPriceRupees}
                  onChange={(e) => setCompareAtPriceRupees(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl pl-8 pr-3.5 py-2 text-xs font-bold text-gray-900 focus:outline-none focus:border-ember"
                />
              </div>
              {discountPercent !== null && discountPercent > 0 && (
                <span className="text-[10px] font-bold text-emerald-700 mt-1 flex items-center gap-1">
                  <Percent className="w-3 h-3" />
                  <span>{discountPercent}% Customer Savings</span>
                </span>
              )}
            </div>

            {/* Available Stock Quantity */}
            <div>
              <label className="block text-xs font-bold text-gray-800 mb-1">
                Stock Quantity (Units)
              </label>
              <input
                type="number"
                min="0"
                value={stockQuantity}
                onChange={(e) => setStockQuantity(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2 text-xs font-bold text-gray-900 focus:outline-none focus:border-ember"
              />
              <span className="text-[10px] text-gray-400 mt-1 block">Units available in warehouse</span>
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* SECTION 5: PHOTOS & MEDIA (CLOUDINARY)                              */}
        {/* =================================================================== */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/90 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <div className="w-7 h-7 rounded-lg bg-ember/10 text-ember flex items-center justify-center text-xs font-black">
              5
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">
                Product Photos &amp; Images
              </h2>
              <p className="text-[11px] text-gray-500">
                Upload clear photos of the spare part. First image will be the primary catalog thumbnail.
              </p>
            </div>
          </div>

          <div className="pt-1">
            <AdminProductImageUploader
              images={images}
              onChange={setImages}
              onUploadingChange={setIsUploadingImages}
              disabled={isPending}
            />
          </div>
        </div>

        {/* =================================================================== */}
        {/* BOTTOM ACTION BAR                                                   */}
        {/* =================================================================== */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200/90 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <Link
            href={returnTo}
            className="text-xs font-bold text-gray-500 hover:text-gray-900 transition-colors"
          >
            ← Cancel and Return
          </Link>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => handleCreate("draft")}
              disabled={isPending || isUploadingImages}
              className="flex-1 sm:flex-none px-4 py-2.5 text-xs font-bold rounded-xl border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              {isPending && pendingAction === "draft" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-gray-500" />
              )}
              <span>Save as Draft</span>
            </button>

            <button
              type="submit"
              disabled={isPending || isUploadingImages}
              className="flex-1 sm:flex-none btn-primary px-6 py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isPending && pendingAction === "publish" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isUploadingImages ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 stroke-[2.5]" />
              )}
              <span>
                {isUploadingImages
                  ? "Uploading Photos..."
                  : isPending && pendingAction === "publish"
                  ? "Publishing..."
                  : "Publish Spare Part"}
              </span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
