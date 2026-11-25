"use client";

import React, { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
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
  ExternalLink,
  Globe,
} from "lucide-react";
import {
  updateAdminProductAction,
  publishAdminProductAction,
} from "@/features/admin/actions";
import type { ProductImageInput, ProductFitmentInput } from "@/features/admin/schemas";
import type { AdminProductDetail } from "@/features/admin/service";
import { AdminProductImageUploader } from "@/components/admin/admin-product-image-uploader";
import {
  APPROVED_CATEGORIES,
  APPROVED_BRANDS,
  APPROVED_VEHICLE_MAKES,
  USED_CONDITION_GRADES,
  USED_CONDITION_GRADE_LABELS,
  INSPECTION_STATUSES,
  INSPECTION_STATUS_LABELS,
  generateStandardSku,
  resolveCanonicalCategorySlug,
  type ProductOrigin,
} from "@/lib/constants/approved-catalogue";
import { NAVBAR_CATEGORIES } from "@/lib/constants/navigation";

interface AdminEditProductFormProps {
  initialProduct: AdminProductDetail;
}

export function AdminEditProductForm({ initialProduct }: AdminEditProductFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Status state
  const [status, setStatus] = useState<string>(initialProduct.status || "active");

  // Independent Classification: Origin & Condition
  const [origin, setOrigin] = useState<ProductOrigin>(
    initialProduct.origin || (initialProduct.isOem ? "genuine_oem" : "branded_aftermarket")
  );
  const [condition, setCondition] = useState<"new" | "used" | null>(
    initialProduct.condition === "unclassified" ? null : initialProduct.condition
  );

  // Section A: Basic Details State
  const [name, setName] = useState(initialProduct.name);
  const [sku, setSku] = useState(initialProduct.sku);
  const [category, setCategory] = useState(
    resolveCanonicalCategorySlug(initialProduct.categoryId || "engine-parts")
  );
  const [subcategoryId, setSubcategoryId] = useState(initialProduct.subcategoryId || "");
  const [brand, setBrand] = useState(initialProduct.brandName || "Bosch");
  const [partNumber, setPartNumber] = useState(initialProduct.partNumber || "");
  const [oemNumber, setOemNumber] = useState(initialProduct.oemNumber || initialProduct.oemReference || "");
  const [description, setDescription] = useState(initialProduct.description || "");
  const [fitmentHint, setFitmentHint] = useState(initialProduct.fitmentHint || "");

  // Section B: Used Disclosures State
  const [conditionGrade, setConditionGrade] = useState(initialProduct.conditionGrade || "");
  const [inspectionStatus, setInspectionStatus] = useState<"pending" | "inspected" | "failed" | "">(
    (initialProduct.inspectionStatus as "pending" | "inspected" | "failed") || ""
  );
  const [testedStatus, setTestedStatus] = useState(initialProduct.testedStatus || "");
  const [conditionNotes, setConditionNotes] = useState(initialProduct.conditionNotes || "");
  const [visibleWearOrDefects, setVisibleWearOrDefects] = useState(initialProduct.visibleWearOrDefects || "");
  const [warrantyDetails, setWarrantyDetails] = useState(initialProduct.warrantyDetails || "");

  // Section C: Vehicle Compatibility Fitments
  const [fitments, setFitments] = useState<ProductFitmentInput[]>(
    Array.isArray(initialProduct.fitments) ? (initialProduct.fitments as ProductFitmentInput[]) : []
  );
  const [fitmentMake, setFitmentMake] = useState("");
  const [fitmentModel, setFitmentModel] = useState("");
  const [fitmentVariant, setFitmentVariant] = useState("");
  const [fitmentYearStart, setFitmentYearStart] = useState("2015");
  const [fitmentYearEnd, setFitmentYearEnd] = useState("");
  const [fitmentFuel, setFitmentFuel] = useState("");
  const [fitmentTransmission, setFitmentTransmission] = useState("");
  const [fitmentNotes, setFitmentNotes] = useState("");
  const [fitmentVerified, setFitmentVerified] = useState<"verified" | "unverified" | "oem_cross_ref">("verified");

  // Section D: Pricing & Stock State
  const [priceRupees, setPriceRupees] = useState((initialProduct.priceMinor / 100).toString());
  const [compareAtPriceRupees, setCompareAtPriceRupees] = useState(
    initialProduct.compareAtPriceMinor ? (initialProduct.compareAtPriceMinor / 100).toString() : ""
  );
  const [stockQuantity, setStockQuantity] = useState(initialProduct.stockQuantity?.toString() || "1");
  const [lowStockThreshold, setLowStockThreshold] = useState("3");

  // Section E: Images & Media State (Cloudinary)
  const [images, setImages] = useState<ProductImageInput[]>(
    initialProduct.images.map((img) => ({
      url: img.url,
      storageKey: img.storageKey || "",
      altText: img.altText || initialProduct.name,
      isPrimary: img.isPrimary,
      sortOrder: img.sortOrder,
    }))
  );
  const [isUploadingImages, setIsUploadingImages] = useState(false);

  // Staged deletions for persisted assets
  const [stagedDeletedStorageKeys, setStagedDeletedStorageKeys] = useState<string[]>([]);

  // Status message
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Dynamic subcategories for selected category (prioritizing Storefront top-navbar taxonomy)
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

  // Dynamic models for fitment make
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
      setFeedback({ type: "error", message: "Make and Model are required to add vehicle compatibility." });
      return;
    }

    const yStart = parseInt(fitmentYearStart, 10);
    if (isNaN(yStart) || yStart < 1980 || yStart > 2035) {
      setFeedback({ type: "error", message: "Please provide a valid Year Start between 1980 and 2035." });
      return;
    }

    const yEnd = fitmentYearEnd ? parseInt(fitmentYearEnd, 10) : null;
    if (yEnd !== null && (isNaN(yEnd) || yEnd < yStart)) {
      setFeedback({ type: "error", message: "Year End must be greater than or equal to Year Start." });
      return;
    }

    const newFitment: ProductFitmentInput = {
      make: fitmentMake,
      model: fitmentModel,
      variant: fitmentVariant || null,
      yearStart: yStart,
      yearEnd: yEnd,
      fuelType: fitmentFuel || null,
      transmission: fitmentTransmission || null,
      notes: fitmentNotes || null,
      verifiedStatus: fitmentVerified,
    };

    setFitments((prev) => [...prev, newFitment]);
    setFitmentModel("");
    setFitmentVariant("");
    setFitmentTransmission("");
    setFitmentNotes("");
    setFeedback(null);
  };

  const handleRemoveFitment = (index: number) => {
    setFitments((prev) => prev.filter((_, i) => i !== index));
  };

  // Discount calculation
  const sellingNum = parseFloat(priceRupees) || 0;
  const compareNum = parseFloat(compareAtPriceRupees) || 0;
  const discountPercent =
    compareNum > sellingNum && sellingNum > 0
      ? Math.round(((compareNum - sellingNum) / compareNum) * 100)
      : null;

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!condition) {
      setFeedback({
        type: "error",
        message: "Product condition (Brand New or Pre-Owned) is mandatory before saving.",
      });
      return;
    }

    if (!name.trim()) {
      setFeedback({ type: "error", message: "Product name is required." });
      return;
    }

    if (!sku.trim()) {
      setFeedback({ type: "error", message: "SKU is required." });
      return;
    }

    if (isUploadingImages) {
      setFeedback({
        type: "error",
        message: "Please wait for image uploads to complete before saving.",
      });
      return;
    }

    if (sellingNum <= 0) {
      setFeedback({ type: "error", message: "Please provide a valid positive price." });
      return;
    }

    const priceMinor = Math.round(sellingNum * 100);
    const compareAtMinor = compareNum > 0 ? Math.round(compareNum * 100) : null;
    const primaryImg = images.find((img) => img.isPrimary)?.url || images[0]?.url || null;

    startTransition(async () => {
      const res = await updateAdminProductAction({
        id: initialProduct.id,
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
        lowStockThreshold: parseInt(lowStockThreshold, 10) || 3,
        description: description.trim() || null,
        fitmentHint: fitmentHint.trim() || null,
        fitments,
        primaryImageUrl: primaryImg,
        images,
        stagedDeletedStorageKeys,
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
            res.error ||
            `Product "${name}" updated successfully! Existing ${status.toUpperCase()} status was preserved.`,
        });
        setTimeout(() => {
          router.push("/admin/products");
        }, 1500);
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Failed to update product.",
        });
      }
    });
  };

  const handleStatusToggle = (targetStatus: "active" | "draft") => {
    setFeedback(null);
    startTransition(async () => {
      const res = await publishAdminProductAction(initialProduct.id, targetStatus);
      if (res.success) {
        setStatus(targetStatus);
        setFeedback({
          type: "success",
          message: `Product status successfully updated to ${targetStatus.toUpperCase()}.`,
        });
      } else {
        setFeedback({
          type: "error",
          message: res.error || `Failed to change status to ${targetStatus}.`,
        });
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-gray-900 pb-16">
      {/* Top Header */}
      <div className="bg-[#090D18] text-white border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
            <div className="flex items-center gap-2">
              <Link
                href="/admin/products"
                className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Products</span>
              </Link>
              <span className="text-gray-600">•</span>
              <span className="text-xs font-bold text-ember uppercase tracking-wider">
                Admin Catalogue Console
              </span>
            </div>

            {/* Status Indicator & Quick Storefront View */}
            <div className="flex items-center gap-2">
              {status === "draft" ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-purple-950/80 text-purple-300 border border-purple-800 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                  <span>Draft (Unpublished)</span>
                </span>
              ) : status === "active" ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-950/80 text-emerald-300 border border-emerald-800 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Active (Live)</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-gray-800 text-gray-300 border border-gray-700">
                  {status}
                </span>
              )}

              {status === "active" && (
                <Link
                  href={`/products/${initialProduct.id}`}
                  target="_blank"
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/10 text-white hover:bg-white/20 border border-white/10 transition-colors flex items-center gap-1.5"
                >
                  <Globe className="w-3.5 h-3.5 text-ember" />
                  <span>View in Storefront</span>
                  <ExternalLink className="w-3 h-3 text-gray-400" />
                </Link>
              )}
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Edit Catalogue Product
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            SKU: <span className="font-mono text-gray-300 font-bold">{initialProduct.sku}</span> • ID: <span className="font-mono text-gray-400">{initialProduct.id}</span>
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Quick Status Control Bar */}
        <div className="mb-6 p-4 rounded-xl bg-white border border-gray-200/90 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-100 text-gray-700">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-gray-900 block">
                Storefront Visibility
              </span>
              <span className="text-[11px] text-gray-500">
                {status === "active"
                  ? "This product is LIVE and searchable on the storefront."
                  : "This product is saved as DRAFT and hidden from the public storefront."}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {status === "active" ? (
              <button
                type="button"
                onClick={() => handleStatusToggle("draft")}
                disabled={isPending}
                className="py-1.5 px-3 text-xs font-bold rounded-lg border border-purple-300 bg-purple-50 text-purple-800 hover:bg-purple-100 transition-colors"
              >
                Switch to Draft (Hide)
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleStatusToggle("active")}
                disabled={isPending}
                className="py-1.5 px-3 text-xs font-bold rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors"
              >
                Publish Live to Storefront
              </button>
            )}
          </div>
        </div>

        {feedback && (
          <div
            className={`mb-6 p-4 rounded-xl border text-xs flex items-center gap-2.5 ${
              feedback.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900"
                : "bg-red-500/10 border-red-500/30 text-red-900"
            }`}
          >
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        <form onSubmit={handleUpdate} className="space-y-6">
          {/* ==================================================================== */}
          {/* SECTION B: INDEPENDENT CLASSIFICATION (Origin + Condition)           */}
          {/* ==================================================================== */}
          <div className="p-6 rounded-2xl bg-white border border-gray-200/90 shadow-sm space-y-5">
            <div className="border-b border-gray-100 pb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-ember/10 text-ember flex items-center justify-center text-xs font-black">
                  1
                </span>
                <span>Product Classification</span>
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Sourcing Origin (Genuine OEM vs Branded Aftermarket) and Condition (Brand New vs Pre-Owned) are strictly independent.
              </p>
            </div>

            {/* Sourcing Origin */}
            <div>
              <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-2">
                Sourcing Type / Origin <span className="text-ember">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                    origin === "genuine_oem"
                      ? "border-blue-600 bg-blue-50/50 shadow-xs ring-1 ring-blue-500"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="productOrigin"
                    value="genuine_oem"
                    checked={origin === "genuine_oem"}
                    onChange={() => setOrigin("genuine_oem")}
                    className="mt-1 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                      <span className="font-bold text-xs text-gray-900">
                        Genuine OEM
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-500 mt-0.5 block">
                      Original Equipment Manufacturer part (Maruti Suzuki Genuine, Hyundai Mobis, Tata Genuine, etc.).
                    </span>
                  </div>
                </label>

                <label
                  className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                    origin === "branded_aftermarket"
                      ? "border-purple-600 bg-purple-50/50 shadow-xs ring-1 ring-purple-500"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="productOrigin"
                    value="branded_aftermarket"
                    checked={origin === "branded_aftermarket"}
                    onChange={() => setOrigin("branded_aftermarket")}
                    className="mt-1 text-purple-600 focus:ring-purple-500"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-purple-600" />
                      <span className="font-bold text-xs text-gray-900">
                        Branded Aftermarket
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-500 mt-0.5 block">
                      Certified third-party automotive brands (Bosch, Brembo, Valeo, DENSO, Gabriel, etc.).
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Condition */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider">
                  Product Condition <span className="text-ember">* Mandatory</span>
                </label>
                {!condition && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    Selection Required
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                    condition === "new"
                      ? "border-emerald-600 bg-emerald-50/50 shadow-xs ring-1 ring-emerald-500"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="productCondition"
                    value="new"
                    checked={condition === "new"}
                    onChange={() => setCondition("new")}
                    className="mt-1 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="font-bold text-xs text-gray-900">
                        Brand New
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-500 mt-0.5 block">
                      Factory sealed in original manufacturer packaging with full warranty.
                    </span>
                  </div>
                </label>

                <label
                  className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                    condition === "used"
                      ? "border-amber-600 bg-amber-50/50 shadow-xs ring-1 ring-amber-500"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="productCondition"
                    value="used"
                    checked={condition === "used"}
                    onChange={() => setCondition("used")}
                    className="mt-1 text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
                      <span className="font-bold text-xs text-gray-900">
                        Pre-Owned / Used
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-500 mt-0.5 block">
                      Multi-point inspected automotive part. Requires condition grade and inspection status.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Sub-block for Pre-Owned specifics */}
            {condition === "used" && (
              <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-300 space-y-4">
                <div className="flex items-center justify-between border-b border-amber-200 pb-2">
                  <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                    Pre-Owned Quality &amp; Inspection Assessment
                  </span>
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                    Required for Used Parts
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      Condition Grade
                    </label>
                    <select
                      value={conditionGrade}
                      onChange={(e) => setConditionGrade(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-ember"
                    >
                      <option value="">Select Condition Grade</option>
                      {USED_CONDITION_GRADES.map((g) => (
                        <option key={g} value={g}>
                          {USED_CONDITION_GRADE_LABELS[g]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      Multi-Point Inspection Status
                    </label>
                    <select
                      value={inspectionStatus}
                      onChange={(e) => setInspectionStatus(e.target.value as "pending" | "inspected" | "failed" | "")}
                      className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-ember"
                    >
                      <option value="">Select Inspection Status</option>
                      {INSPECTION_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {INSPECTION_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      Testing / Operational Status
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Bench tested with 12V actuator verified"
                      value={testedStatus}
                      onChange={(e) => setTestedStatus(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-ember"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      Warranty &amp; Return Terms
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 15-day replacement warranty"
                      value={warrantyDetails}
                      onChange={(e) => setWarrantyDetails(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-ember"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      Visible Wear or Cosmetic Disclosures
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Minor surface scratches on casing; no mechanical wear or fluid leaks."
                      value={visibleWearOrDefects}
                      onChange={(e) => setVisibleWearOrDefects(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-ember"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      Condition Assessment Notes
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Internal technician notes on intake inspection..."
                      value={conditionNotes}
                      onChange={(e) => setConditionNotes(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-ember"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ==================================================================== */}
          {/* SECTION A: BASIC PRODUCT DETAILS                                     */}
          {/* ==================================================================== */}
          <div className="p-6 rounded-2xl bg-white border border-gray-200/90 shadow-sm space-y-4">
            <div className="border-b border-gray-100 pb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-ember/10 text-ember flex items-center justify-center text-xs font-black">
                  2
                </span>
                <span>Basic Product Information</span>
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Product Name <span className="text-ember">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bosch Front Brake Disc Rotor Set (Pair)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
                />
              </div>

              {/* Category (12 approved) */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Category (12 Approved Categories) <span className="text-ember">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => {
                    const newCatSlug = e.target.value;
                    setCategory(newCatSlug);
                    const catObj = APPROVED_CATEGORIES.find((c) => c.slug === newCatSlug);
                    setSubcategoryId(catObj?.subcategories[0]?.slug || "");
                  }}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
                >
                  {APPROVED_CATEGORIES.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Subcategory (Dependent dropdown) */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Subcategory <span className="text-ember">*</span>
                </label>
                <select
                  value={subcategoryId}
                  onChange={(e) => setSubcategoryId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
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
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Brand (Master Brand Roster) <span className="text-ember">*</span>
                </label>
                <select
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
                >
                  {APPROVED_BRANDS.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name} ({b.code}) — {b.isOem ? "OEM" : "Aftermarket"}
                    </option>
                  ))}
                </select>
              </div>

              {/* SKU */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-700">
                    SKU (Standard Format: CATEGORY-BRAND-SEQ) <span className="text-ember">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAutoGenerateSku}
                    className="text-[10px] font-bold text-ember hover:underline flex items-center gap-1"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>Regenerate Standard SKU</span>
                  </button>
                </div>
                <input
                  type="text"
                  required
                  placeholder="e.g. BRK-BOS-0001"
                  value={sku}
                  onChange={(e) => setSku(e.target.value.toUpperCase())}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono text-gray-900 focus:outline-none focus:border-ember"
                />
              </div>

              {/* Part Number */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Manufacturer Part Number (MPN)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 0 986 AB0 123"
                  value={partNumber}
                  onChange={(e) => setPartNumber(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono text-gray-900 focus:outline-none focus:border-ember"
                />
              </div>

              {/* OEM Reference Number */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  OEM Reference Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. 55311-M68P00"
                  value={oemNumber}
                  onChange={(e) => setOemNumber(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono text-gray-900 focus:outline-none focus:border-ember"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Quick Fitment Scope Summary Hint
                </label>
                <input
                  type="text"
                  placeholder="e.g. Maruti Suzuki Swift (2018-2023), Baleno, Dzire 1.2L Petrol"
                  value={fitmentHint}
                  onChange={(e) => setFitmentHint(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Product Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Comprehensive description of the component, technical specifications, and fitment notes..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
                />
              </div>
            </div>
          </div>

          {/* ==================================================================== */}
          {/* SECTION C: VEHICLE COMPATIBILITY (FITMENT MATRIX)                    */}
          {/* ==================================================================== */}
          <div className="p-6 rounded-2xl bg-white border border-gray-200/90 shadow-sm space-y-4">
            <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-ember/10 text-ember flex items-center justify-center text-xs font-black">
                    3
                  </span>
                  <span>Vehicle Compatibility (Indian Passenger Cars)</span>
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Manage verified vehicle fitments for this part.
                </p>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                {fitments.length} Fitment{fitments.length === 1 ? "" : "s"} Added
              </span>
            </div>

            {/* List of currently added fitments */}
            {fitments.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-700 border-b border-gray-200">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Make &amp; Model</th>
                      <th className="py-2.5 px-3 font-semibold">Variant</th>
                      <th className="py-2.5 px-3 font-semibold">Years</th>
                      <th className="py-2.5 px-3 font-semibold">Fuel / Engine</th>
                      <th className="py-2.5 px-3 font-semibold">Status</th>
                      <th className="py-2.5 px-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {fitments.map((fit, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/60">
                        <td className="py-2.5 px-3 font-bold text-gray-900">
                          {fit.make} {fit.model}
                        </td>
                        <td className="py-2.5 px-3 text-gray-600">
                          {fit.variant || "All Variants"}
                        </td>
                        <td className="py-2.5 px-3 text-gray-600 font-mono">
                          {fit.yearStart} – {fit.yearEnd || "Present"}
                        </td>
                        <td className="py-2.5 px-3 text-gray-600">
                          {fit.fuelType || "Any"} {fit.engine ? `(${fit.engine})` : ""}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              fit.verifiedStatus === "verified"
                                ? "bg-emerald-100 text-emerald-800"
                                : fit.verifiedStatus === "oem_cross_ref"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {fit.verifiedStatus === "verified"
                              ? "Verified"
                              : fit.verifiedStatus === "oem_cross_ref"
                              ? "OEM Cross-Ref"
                              : "Unverified"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveFitment(idx)}
                            className="text-gray-400 hover:text-red-600 transition-colors p-1"
                            title="Remove fitment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-dashed border-gray-300 text-center text-xs text-gray-500">
                No specific vehicle compatibility entries added yet. Use the form below to add fitment records.
              </div>
            )}

            {/* Sub-form to add fitment */}
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-200/80 space-y-3">
              <span className="text-xs font-bold text-gray-800 block">
                Add Vehicle Fitment Record
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Make */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Vehicle Make
                  </label>
                  <select
                    value={fitmentMake}
                    onChange={(e) => {
                      setFitmentMake(e.target.value);
                      setFitmentModel("");
                      setFitmentVariant("");
                    }}
                    className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-ember"
                  >
                    <option value="">Select Make</option>
                    {APPROVED_VEHICLE_MAKES.map((m) => (
                      <option key={m.slug} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Model */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Vehicle Model
                  </label>
                  <select
                    value={fitmentModel}
                    onChange={(e) => {
                      setFitmentModel(e.target.value);
                      setFitmentVariant("");
                    }}
                    disabled={!fitmentMake}
                    className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-ember disabled:bg-gray-100"
                  >
                    <option value="">Select Model</option>
                    {availableModels.map((mod) => (
                      <option key={mod.slug} value={mod.name}>
                        {mod.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Variant */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Variant (Optional)
                  </label>
                  <select
                    value={fitmentVariant}
                    onChange={(e) => setFitmentVariant(e.target.value)}
                    disabled={!fitmentModel}
                    className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-ember disabled:bg-gray-100"
                  >
                    <option value="">All Variants</option>
                    {activeModelObj?.variants.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Year Start */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Year From
                  </label>
                  <input
                    type="number"
                    min="1980"
                    max="2035"
                    placeholder="2015"
                    value={fitmentYearStart}
                    onChange={(e) => setFitmentYearStart(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-ember"
                  />
                </div>

                {/* Year End */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Year To (Leave blank if present)
                  </label>
                  <input
                    type="number"
                    min="1980"
                    max="2035"
                    placeholder="e.g. 2023"
                    value={fitmentYearEnd}
                    onChange={(e) => setFitmentYearEnd(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-ember"
                  />
                </div>

                {/* Fuel Type */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Fuel Type
                  </label>
                  <select
                    value={fitmentFuel}
                    onChange={(e) => setFitmentFuel(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-ember"
                  >
                    <option value="">Any Fuel Type</option>
                    <option value="Petrol">Petrol</option>
                    <option value="Diesel">Diesel</option>
                    <option value="CNG">CNG</option>
                    <option value="Electric">Electric</option>
                  </select>
                </div>

                {/* Transmission */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Transmission
                  </label>
                  <select
                    value={fitmentTransmission}
                    onChange={(e) => setFitmentTransmission(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-ember"
                  >
                    <option value="">Any Transmission</option>
                    <option value="Manual">Manual</option>
                    <option value="Automatic">Automatic</option>
                    <option value="AMT">AMT</option>
                    <option value="CVT">CVT</option>
                    <option value="DCT">DCT</option>
                  </select>
                </div>

                {/* Verified Status */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Fitment Verification Status
                  </label>
                  <select
                    value={fitmentVerified}
                    onChange={(e) => setFitmentVerified(e.target.value as "verified" | "unverified" | "oem_cross_ref")}
                    className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-ember"
                  >
                    <option value="verified">Verified Fitment (Tested / Guaranteed)</option>
                    <option value="oem_cross_ref">OEM Cross-Reference</option>
                    <option value="unverified">Unverified (Community Submitted)</option>
                  </select>
                </div>

                {/* Fitment Notes */}
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Specific Fitment Notes
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Fits manual transmission models only; disc diameter 256mm"
                    value={fitmentNotes}
                    onChange={(e) => setFitmentNotes(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-ember"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleAddFitment}
                  className="btn-secondary py-1.5 px-3 text-xs font-bold rounded-lg flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Compatibility Record</span>
                </button>
              </div>
            </div>
          </div>

          {/* ==================================================================== */}
          {/* SECTION D: PRICING & INVENTORY STOCK                                 */}
          {/* ==================================================================== */}
          <div className="p-6 rounded-2xl bg-white border border-gray-200/90 shadow-sm space-y-4">
            <div className="border-b border-gray-100 pb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-ember/10 text-ember flex items-center justify-center text-xs font-black">
                  4
                </span>
                <span>Pricing, GST &amp; Inventory Management</span>
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Selling Price (₹) <span className="text-ember">*</span>
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  required
                  placeholder="e.g. 3450"
                  value={priceRupees}
                  onChange={(e) => setPriceRupees(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">Inclusive of GST</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Original MRP / Compare Price (₹)
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  placeholder="e.g. 4200 (optional)"
                  value={compareAtPriceRupees}
                  onChange={(e) => setCompareAtPriceRupees(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
                />
                {discountPercent !== null && discountPercent > 0 && (
                  <span className="text-[10px] font-bold text-emerald-700 mt-1 flex items-center gap-1">
                    <Percent className="w-3 h-3" />
                    <span>Calculates {discountPercent}% Customer Savings</span>
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Available Stock Quantity
                </label>
                <input
                  type="number"
                  min="0"
                  value={stockQuantity}
                  onChange={(e) => setStockQuantity(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">Units currently on hand</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Low Stock Threshold Alert
                </label>
                <input
                  type="number"
                  min="1"
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">Alert admin when stock falls below</span>
              </div>
            </div>
          </div>

          {/* ==================================================================== */}
          {/* SECTION E: PRODUCT IMAGES & MEDIA (Cloudinary)                      */}
          {/* ==================================================================== */}
          <div className="p-6 rounded-2xl bg-white border border-gray-200/90 shadow-sm space-y-4">
            <div className="border-b border-gray-100 pb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-ember/10 text-ember flex items-center justify-center text-xs font-black">
                  5
                </span>
                <span>Component Photography &amp; Media</span>
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Upload up to 8 crisp images. The primary image is shown on cards and search results.
              </p>
            </div>

            <AdminProductImageUploader
              images={images}
              onChange={setImages}
              onUploadingChange={setIsUploadingImages}
              disabled={isPending}
              onStagedDeletionsChange={(keys: string[]) => {
                setStagedDeletedStorageKeys(keys);
              }}
            />
          </div>

          {/* ==================================================================== */}
          {/* SECTION F: PUBLISHING CONTROLS & ACTIONS                             */}
          {/* ==================================================================== */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <Link
              href="/admin/products"
              className="btn-secondary py-2.5 px-4 text-xs font-bold rounded-xl text-center"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={isPending || isUploadingImages}
              className="btn-primary py-2.5 px-6 text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-ember/20 disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isUploadingImages ? (
                <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>
                {isUploadingImages
                  ? "Uploading Images..."
                  : isPending
                  ? "Saving Changes..."
                  : "Save Changes"}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
