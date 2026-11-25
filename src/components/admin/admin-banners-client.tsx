"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  MoveUp,
  MoveDown,
  Info,
} from "lucide-react";
import { AdminSingleImageUploader } from "./admin-single-image-uploader";
import { updateAdminBannersAction } from "@/features/admin/actions";
import { CLOUDINARY_FOLDERS } from "@/lib/cloudinary-shared";
import type { AdminBannerItem } from "@/features/admin/service";

interface AdminBannersClientProps {
  initialBanners: AdminBannerItem[];
}

export function AdminBannersClient({ initialBanners }: AdminBannersClientProps) {
  const [banners, setBanners] = useState<AdminBannerItem[]>(initialBanners);
  const [stagedDeletions, setStagedDeletions] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const handleAddBanner = () => {
    const newBanner: AdminBannerItem = {
      id: `banner-${Date.now()}`,
      title: "New Seasonal Campaign",
      subtitle: "Discover OEM and aftermarket spare parts with express shipping.",
      desktopImageUrl: "",
      desktopStorageKey: null,
      mobileImageUrl: null,
      mobileStorageKey: null,
      altText: "Automotive promotional campaign banner",
      linkUrl: "/categories",
      sortOrder: banners.length + 1,
      isActive: true,
    };
    setBanners([...banners, newBanner]);
  };

  const handleRemoveBanner = (index: number) => {
    const toRemove = banners[index];
    if (toRemove) {
      const keysToStage: string[] = [];
      if (toRemove.desktopStorageKey) keysToStage.push(toRemove.desktopStorageKey);
      if (toRemove.mobileStorageKey) keysToStage.push(toRemove.mobileStorageKey);

      if (keysToStage.length > 0) {
        setStagedDeletions((prev) => Array.from(new Set([...prev, ...keysToStage])));
      }
    }

    const next = banners.filter((_, i) => i !== index);
    setBanners(next);
  };

  const handleUpdateField = <K extends keyof AdminBannerItem>(
    index: number,
    field: K,
    val: AdminBannerItem[K]
  ) => {
    setBanners((prev) =>
      prev.map((b, i) => (i === index ? { ...b, [field]: val } : b))
    );
  };

  const handleMove = (index: number, direction: "up" | "down") => {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === banners.length - 1)
    ) {
      return;
    }

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const copy = [...banners];
    const temp = copy[index]!;
    copy[index] = copy[targetIndex]!;
    copy[targetIndex] = temp;

    // Re-assign sort orders sequentially
    const reordered = copy.map((b, idx) => ({ ...b, sortOrder: idx + 1 }));
    setBanners(reordered);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    for (let i = 0; i < banners.length; i++) {
      const b = banners[i]!;
      if (!b.title.trim()) {
        setActionError(`Banner #${i + 1} must have a title.`);
        return;
      }
      if (!b.desktopImageUrl.trim()) {
        setActionError(`Banner #${i + 1} ("${b.title}") requires a desktop image.`);
        return;
      }
      if (!b.altText.trim()) {
        setActionError(`Banner #${i + 1} ("${b.title}") requires alt text for accessibility.`);
        return;
      }
    }

    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await updateAdminBannersAction({
        banners,
        stagedDeletedStorageKeys: stagedDeletions,
      });

      if (!res.success) {
        throw new Error(res.error || "Failed to update promotional banners.");
      }

      const updated = res.data as { banners: AdminBannerItem[]; cleanupErrors?: string[] };
      setBanners(updated.banners);
      setStagedDeletions([]);

      if (updated.cleanupErrors && updated.cleanupErrors.length > 0) {
        setActionSuccess(
          `Banners saved successfully. (Note: ${updated.cleanupErrors.length} Cloudinary cleanup warning(s))`
        );
      } else {
        setActionSuccess("Promotional banners updated successfully!");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed.";
      setActionError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Information Banner on Persistence Architecture */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-amber-900 text-xs">
        <Info className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
        <div>
          <p className="font-bold">Zero-Migration Cloudinary Persistence</p>
          <p className="mt-0.5 text-amber-800 leading-relaxed">
            Promotional banners are stored in the existing <span className="font-mono font-semibold">site_settings</span> table under the key <span className="font-mono font-semibold">&apos;homepage_banners&apos;</span>. Assets are isolated in <span className="font-mono font-semibold">hs-spare-parts/banners</span> with full HMAC signature verification and post-commit cleanup.
          </p>
        </div>
      </div>

      {actionError && (
        <div className="flex items-center gap-2 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="flex items-center gap-2 p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{actionSuccess}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700">
            Active Campaign Banners ({banners.length})
          </h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleAddBanner}
              disabled={banners.length >= 10 || isSubmitting}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gray-900 hover:bg-black text-white text-xs font-bold transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>Add Banner</span>
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-ember hover:bg-ember-deep text-white text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <span>Save All Banners</span>
              )}
            </button>
          </div>
        </div>

        {banners.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
            <Sparkles className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm font-bold text-gray-700">No custom promotional banners</p>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              The storefront will show default hardcoded promotional tiles until custom banners are added.
            </p>
            <button
              type="button"
              onClick={handleAddBanner}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ember text-white text-xs font-bold hover:bg-ember-deep"
            >
              <Plus className="w-4 h-4" />
              <span>Create First Banner</span>
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {banners.map((banner, index) => (
              <div
                key={banner.id}
                className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs relative space-y-6"
              >
                {/* Header with Ordering and Delete */}
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center">
                      {index + 1}
                    </span>
                    <span className="text-xs font-bold text-gray-800">
                      Banner Order #{banner.sortOrder}
                    </span>
                    <label className="ml-4 inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={banner.isActive}
                        onChange={(e) =>
                          handleUpdateField(index, "isActive", e.target.checked)
                        }
                        className="rounded border-gray-300 text-ember focus:ring-ember/20"
                      />
                      <span>Active on Storefront</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleMove(index, "up")}
                      disabled={index === 0 || isSubmitting}
                      className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg disabled:opacity-30"
                      title="Move Up"
                    >
                      <MoveUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(index, "down")}
                      disabled={index === banners.length - 1 || isSubmitting}
                      className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg disabled:opacity-30"
                      title="Move Down"
                    >
                      <MoveDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveBanner(index)}
                      disabled={isSubmitting}
                      className="p-1.5 text-red-400 hover:text-red-700 rounded-lg ml-2"
                      title="Delete Banner"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Banner Metadata Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Banner Headline *
                    </label>
                    <input
                      type="text"
                      value={banner.title}
                      onChange={(e) =>
                        handleUpdateField(index, "title", e.target.value)
                      }
                      placeholder="e.g. OEM Brake Systems Clearance"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-ember/20 focus:border-ember"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Destination Link
                    </label>
                    <input
                      type="text"
                      value={banner.linkUrl ?? ""}
                      onChange={(e) =>
                        handleUpdateField(index, "linkUrl", e.target.value)
                      }
                      placeholder="e.g. /categories/brake"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-ember/20 focus:border-ember font-mono"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Subtitle / Supporting Text
                    </label>
                    <input
                      type="text"
                      value={banner.subtitle ?? ""}
                      onChange={(e) =>
                        handleUpdateField(index, "subtitle", e.target.value)
                      }
                      placeholder="e.g. Up to 25% off genuine ceramic brake pads and rotors."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-ember/20 focus:border-ember"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Accessibility Alt Text *
                    </label>
                    <input
                      type="text"
                      value={banner.altText}
                      onChange={(e) =>
                        handleUpdateField(index, "altText", e.target.value)
                      }
                      placeholder="Describe the banner imagery clearly for screen readers"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-ember/20 focus:border-ember"
                      required
                    />
                  </div>
                </div>

                {/* Cloudinary Asset Uploaders: Desktop & Mobile Variants */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <div className="bg-gray-50/80 p-4 rounded-xl border border-gray-200/80">
                    <AdminSingleImageUploader
                      label="Desktop Banner Image *"
                      value={banner.desktopImageUrl}
                      storageKey={banner.desktopStorageKey}
                      folder={CLOUDINARY_FOLDERS.banners}
                      aspectRatioHint="Landscape ~21:9 or 16:9 (e.g. 1920x800)"
                      onChange={(data) => {
                        handleUpdateField(
                          index,
                          "desktopImageUrl",
                          data.imageUrl ?? ""
                        );
                        handleUpdateField(
                          index,
                          "desktopStorageKey",
                          data.storageKey
                        );
                        handleUpdateField(
                          index,
                          "desktopUploadReceipt",
                          data.uploadReceipt
                        );
                      }}
                      onStagedDeletion={(delKey) => {
                        setStagedDeletions((prev) =>
                          Array.from(new Set([...prev, delKey]))
                        );
                      }}
                    />
                  </div>

                  <div className="bg-gray-50/80 p-4 rounded-xl border border-gray-200/80">
                    <AdminSingleImageUploader
                      label="Mobile Banner Image (Optional)"
                      value={banner.mobileImageUrl ?? null}
                      storageKey={banner.mobileStorageKey}
                      folder={CLOUDINARY_FOLDERS.banners}
                      aspectRatioHint="Portrait or Square ~1:1 or 4:5 (e.g. 800x800)"
                      onChange={(data) => {
                        handleUpdateField(
                          index,
                          "mobileImageUrl",
                          data.imageUrl
                        );
                        handleUpdateField(
                          index,
                          "mobileStorageKey",
                          data.storageKey
                        );
                        handleUpdateField(
                          index,
                          "mobileUploadReceipt",
                          data.uploadReceipt
                        );
                      }}
                      onStagedDeletion={(delKey) => {
                        setStagedDeletions((prev) =>
                          Array.from(new Set([...prev, delKey]))
                        );
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </form>
    </div>
  );
}
