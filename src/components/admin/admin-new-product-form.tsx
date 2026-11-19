"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, ShieldCheck, AlertCircle, CheckCircle2, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { createAdminProductAction } from "@/features/admin/actions";
import { NAVBAR_CATEGORIES } from "@/lib/constants/navigation";

const BRANDS_LIST = [
  "Brembo",
  "Gabriel",
  "Valeo",
  "Bosch",
  "Denso",
  "Lumax",
  "Mann-Filter",
  "Motherson",
  "Maruti Suzuki Genuine",
  "Hyundai Mobis",
  "Generic Aftermarket",
];

export function AdminNewProductForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Condition is mandatory - starts unselected to enforce deliberate choice
  const [condition, setCondition] = useState<"new" | "used" | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [brand, setBrand] = useState("Brembo");
  const [category, setCategory] = useState("brake");
  const [priceRupees, setPriceRupees] = useState("");
  const [compareAtPriceRupees, setCompareAtPriceRupees] = useState("");
  const [stockQuantity, setStockQuantity] = useState("1");
  const [oemReference, setOemReference] = useState("");
  const [fitmentHint, setFitmentHint] = useState("");
  const [isOem, setIsOem] = useState(false);
  const [description, setDescription] = useState("");

  // Pre-Owned specific fields - strictly start empty, no fabricated defaults
  const [conditionGrade, setConditionGrade] = useState("");
  const [conditionNotes, setConditionNotes] = useState("");
  const [visibleWearOrDefects, setVisibleWearOrDefects] = useState("");
  const [testedStatus, setTestedStatus] = useState("");
  const [warrantyDetails, setWarrantyDetails] = useState("");

  // Status message
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!condition) {
      setFeedback({
        type: "error",
        message: "Product condition (New or Pre-Owned) is mandatory before publishing.",
      });
      return;
    }

    const priceNum = parseFloat(priceRupees);
    if (isNaN(priceNum) || priceNum <= 0) {
      setFeedback({ type: "error", message: "Please provide a valid positive price." });
      return;
    }

    const priceMinor = Math.round(priceNum * 100);
    const compareAtMinor = compareAtPriceRupees ? Math.round(parseFloat(compareAtPriceRupees) * 100) : null;

    startTransition(async () => {
      const res = await createAdminProductAction({
        name,
        sku: sku.toUpperCase(),
        categoryId: category,
        brandId: brand,
        condition,
        priceMinor,
        compareAtPriceMinor: compareAtMinor,
        stockQuantity: parseInt(stockQuantity, 10) || 0,
        description: description || null,
        fitmentHint: fitmentHint || null,
        oemReference: oemReference || null,
        isOem,
        conditionGrade: condition === "used" && conditionGrade ? conditionGrade : null,
        conditionNotes: condition === "used" && conditionNotes ? conditionNotes : null,
        visibleWearOrDefects: condition === "used" && visibleWearOrDefects ? visibleWearOrDefects : null,
        testedStatus: condition === "used" && testedStatus ? testedStatus : null,
        warrantyDetails: warrantyDetails || null,
      });

      if (res.success) {
        setFeedback({
          type: "success",
          message: `Product "${name}" successfully registered in the catalogue with condition: ${condition.toUpperCase()}!`,
        });
        setTimeout(() => {
          router.push("/admin/products");
        }, 1500);
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Failed to create product listing.",
        });
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-gray-900 pb-16">
      {/* Top Header */}
      <div className="bg-[#090D18] text-white border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/admin/products"
              className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Products</span>
            </Link>
            <span className="text-gray-600">•</span>
            <span className="text-xs font-bold text-ember uppercase tracking-wider">
              Admin Only
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Add Catalogue Product
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Publish a new spare part listing with mandatory condition classification (New vs Pre-Owned).
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Admin Model Disclaimer */}
        <div className="mb-6 p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 text-xs text-blue-950 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-blue-900 leading-relaxed">
            <strong>Admin-Managed Catalogue Store:</strong> Only authorized store administrators have catalogue write access. Public sellers and customer listings are not supported.
          </p>
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

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Card 1: Mandatory Product Condition Selector */}
          <div className="p-6 rounded-2xl bg-white border border-gray-200/90 shadow-sm space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-bold text-gray-900">
                  Product Condition <span className="text-ember">* Mandatory</span>
                </label>
                {!condition && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    Selection Required
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Administrators must explicitly assign whether this item is brand new or an inspected pre-owned component.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
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
                    <span className="font-bold text-sm text-gray-900">
                      Brand New
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 mt-0.5 block leading-relaxed">
                    Unused spare part in manufacturer packaging. Standard manufacturer warranty.
                  </span>
                </div>
              </label>

              <label
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
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
                    <span className="font-bold text-sm text-gray-900">
                      Pre-Owned / Used
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 mt-0.5 block leading-relaxed">
                    Inspected automotive component. Requires condition grading and wear disclosures.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Card 2: Basic Product Information */}
          <div className="p-6 rounded-2xl bg-white border border-gray-200/90 shadow-sm space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900 border-b border-gray-100 pb-2">
              Basic Product Details
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Product Name <span className="text-ember">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Brembo Front Brake Disc Rotor Set"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  SKU (Stock Keeping Unit) <span className="text-ember">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. BRM-09A72711"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono text-gray-900 focus:outline-none focus:border-ember"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Brand <span className="text-ember">*</span>
                </label>
                <select
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
                >
                  {BRANDS_LIST.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Category <span className="text-ember">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
                >
                  {NAVBAR_CATEGORIES.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  OEM Reference Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. 55311-M68P00"
                  value={oemReference}
                  onChange={(e) => setOemReference(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono text-gray-900 focus:outline-none focus:border-ember"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Price in Rupees (₹) <span className="text-ember">*</span>
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
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Original / Compare Price (₹)
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
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Fitment Scope Hint
                </label>
                <input
                  type="text"
                  placeholder="e.g. Maruti Suzuki Swift (2018-2023), Baleno"
                  value={fitmentHint}
                  onChange={(e) => setFitmentHint(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isOem}
                    onChange={(e) => setIsOem(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-ember focus:ring-ember"
                  />
                  <span className="text-xs font-semibold text-gray-700">
                    OEM Specification Component
                  </span>
                </label>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Product Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Component details, specifications, and scope..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
                />
              </div>
            </div>
          </div>

          {/* Card 3: Pre-Owned Specific Disclosures (Shown when condition === "used") */}
          {condition === "used" && (
            <div className="p-6 rounded-2xl bg-amber-500/5 border border-amber-300/80 shadow-sm space-y-4">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-amber-900 border-b border-amber-200 pb-2 flex items-center justify-between">
                  <span>Pre-Owned Inspection &amp; Wear Disclosures</span>
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                    Pre-Owned Settings
                  </span>
                </h2>
                <p className="text-xs text-gray-600 mt-1">
                  Accurate disclosures protect customer trust. All fields start blank and should be filled with genuine inspection observations.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Condition Grade
                  </label>
                  <select
                    value={conditionGrade}
                    onChange={(e) => setConditionGrade(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
                  >
                    <option value="">Select Condition Grade (Optional)</option>
                    <option value="Grade A - Excellent">Grade A — Excellent (Minimal surface marks)</option>
                    <option value="Grade B - Good">Grade B — Good (Normal cosmetic service wear)</option>
                    <option value="Grade C - Fair">Grade C — Fair (Visible blemishes, functionally sound)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Testing Status
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Visually inspected and bench verified (leave blank if untested)"
                    value={testedStatus}
                    onChange={(e) => setTestedStatus(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Condition Assessment Notes
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Factual assessment notes from intake verification (leave blank if none recorded)..."
                    value={conditionNotes}
                    onChange={(e) => setConditionNotes(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Visible Wear or Cosmetic Disclosures
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Superficial paint marks on outer bracket; no structural wear..."
                    value={visibleWearOrDefects}
                    onChange={(e) => setVisibleWearOrDefects(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Warranty &amp; Return Terms
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 15-day return policy (leave blank if standard store terms apply)"
                    value={warrantyDetails}
                    onChange={(e) => setWarrantyDetails(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <Link
              href="/admin/products"
              className="btn-secondary py-2.5 px-4 text-xs font-bold rounded-xl"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={isPending}
              className="btn-primary py-2.5 px-6 text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-ember/20 disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>Publish Product to Storefront</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
