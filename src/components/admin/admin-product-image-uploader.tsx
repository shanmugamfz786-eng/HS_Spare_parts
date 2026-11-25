"use client";

import React, { useState, useRef } from "react";
import {
  UploadCloud,
  X,
  Star,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ImageIcon,
} from "lucide-react";
import type { ProductImageInput } from "@/features/admin/schemas";
import {
  getCloudinaryUploadSignatureAction,
  confirmUploadProofAction,
  deleteCloudinaryAssetAction,
} from "@/features/admin/actions";
import {
  CLOUDINARY_CONFIG,
  validateCloudinaryAssetMetadata,
  isValidProductAssetPublicId,
} from "@/lib/cloudinary-shared";

interface AdminProductImageUploaderProps {
  images: ProductImageInput[];
  onChange: (images: ProductImageInput[]) => void;
  onUploadingChange?: (isUploading: boolean) => void;
  disabled?: boolean;
  onStagedDeletionsChange?: (stagedStorageKeys: string[]) => void;
  persistedStorageKeys?: string[];
}

export function AdminProductImageUploader({
  images,
  onChange,
  onUploadingChange,
  disabled = false,
  onStagedDeletionsChange,
  persistedStorageKeys,
}: AdminProductImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceTargetIndex, setReplaceTargetIndex] = useState<number | null>(null);

  // Storage keys of newly uploaded assets during this active session (unsaved in database)
  const newlyUploadedKeysRef = useRef<Set<string>>(new Set());

  // Staged deletions for persisted assets (referenced in database)
  const stagedDeletionsRef = useRef<Set<string>>(new Set());

  // Initial set of persisted keys provided at mount
  const initialPersistedKeysRef = useRef<Set<string>>(
    new Set(
      persistedStorageKeys ??
        images.map((img) => img.storageKey).filter((k): k is string => Boolean(k))
    )
  );

  const isPersistedKey = (key: string): boolean => {
    return (
      initialPersistedKeysRef.current.has(key) ||
      Boolean(persistedStorageKeys?.includes(key)) ||
      !newlyUploadedKeysRef.current.has(key)
    );
  };

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const updateUploadingState = (uploading: boolean, progressText: string | null = null) => {
    setIsUploading(uploading);
    setUploadProgress(progressText);
    onUploadingChange?.(uploading);
  };

  const validateLocalFile = (file: File): string | null => {
    // 1. Format restriction (JPEG, PNG, WebP only; SVG and others strictly prohibited)
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return `Invalid format '${file.type || "unknown"}'. Only JPEG, PNG, and WebP images are accepted. SVG is prohibited.`;
    }

    // 2. File size limit (10MB)
    if (file.size > CLOUDINARY_CONFIG.maxFileSizeBytes) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      return `File size (${sizeMb}MB) exceeds the 10MB limit.`;
    }

    return null;
  };

  const uploadSingleFileToCloudinary = async (
    file: File
  ): Promise<{ secureUrl: string; publicId: string; format: string; uploadReceipt?: string }> => {
    // 1. Fetch server-signed upload parameters
    const sigRes = await getCloudinaryUploadSignatureAction();
    if (!sigRes.success || !sigRes.data) {
      throw new Error(sigRes.error || "Failed to generate server upload signature.");
    }

    const {
      uploadUrl,
      apiKey,
      timestamp,
      signature,
      folder,
      publicId,
      uploadPreset,
      sessionId,
      uploadReceipt,
    } = sigRes.data as {
      uploadUrl: string;
      apiKey: string;
      timestamp: number;
      signature: string;
      folder: string;
      publicId: string;
      uploadPreset: string;
      sessionId?: string;
      uploadReceipt?: string;
    };

    // 2. Direct browser upload to Cloudinary (bypassing Vercel proxy)
    const formData = new FormData();
    formData.append("file", file);
    formData.append("api_key", apiKey);
    formData.append("timestamp", timestamp.toString());
    formData.append("signature", signature);
    formData.append("folder", folder);
    formData.append("public_id", publicId);
    formData.append("upload_preset", uploadPreset);

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
    });

    if (!uploadRes.ok) {
      let errorText = "Cloudinary upload request failed.";
      try {
        const errorJson = (await uploadRes.json()) as { error?: { message?: string } };
        if (errorJson.error?.message) {
          errorText = errorJson.error.message;
        }
      } catch {
        // Fallback to generic message
      }
      throw new Error(`Upload rejected: ${errorText}`);
    }

    const json = (await uploadRes.json()) as Record<string, unknown>;

    // 3. Authoritative size validation on Cloudinary's returned bytes
    // (Client file.size check is a usability pre-check, not a security boundary)
    const returnedBytes = typeof json.bytes === "number" ? json.bytes : undefined;
    const returnedPublicId = typeof json.public_id === "string" ? json.public_id : undefined;

    if (returnedBytes !== undefined && returnedBytes > CLOUDINARY_CONFIG.maxFileSizeBytes) {
      // Asset exceeds 10MB: reject immediately and attempt authenticated cleanup of this generated asset
      if (isValidProductAssetPublicId(returnedPublicId)) {
        try {
          const cleanupRes = await deleteCloudinaryAssetAction(returnedPublicId);
          if (!cleanupRes.success) {
            console.warn(
              `[Cloudinary Cleanup] Oversized upload rejected, but automated server cleanup could not be confirmed: ${cleanupRes.error}`
            );
          }
        } catch (cleanupErr) {
          console.warn(
            "[Cloudinary Cleanup] Oversized upload rejected, but automated server cleanup encountered an error:",
            cleanupErr
          );
        }
      }

      const sizeMb = (returnedBytes / (1024 * 1024)).toFixed(1);
      throw new Error(
        `Uploaded image rejected: asset size (${sizeMb}MB) exceeds the 10MB limit. Asset was not saved.`
      );
    }

    // 4. Server-side validation of response fields
    const validation = validateCloudinaryAssetMetadata({
      publicId: json.public_id,
      secureUrl: json.secure_url,
      format: json.format,
      resourceType: json.resource_type,
      width: json.width,
      height: json.height,
      bytes: json.bytes,
    });

    if (!validation.valid || !validation.data) {
      // If metadata validation fails (e.g. non-image or prohibited format), attempt cleanup of the rejected asset
      if (isValidProductAssetPublicId(returnedPublicId)) {
        try {
          await deleteCloudinaryAssetAction(returnedPublicId);
        } catch {
          // Non-blocking warning
        }
      }
      throw new Error(validation.error || "Uploaded asset metadata failed security validation.");
    }

    // 5. Stage B: Verify upload proof with server & obtain Receipt v2
    let verifiedReceipt = uploadReceipt;
    if (sessionId && json.signature && json.version) {
      const proofRes = await confirmUploadProofAction({
        sessionId,
        publicId: String(json.public_id),
        version: String(json.version),
        signature: String(json.signature),
        bytes: typeof json.bytes === "number" ? json.bytes : undefined,
        format: typeof json.format === "string" ? json.format : undefined,
        width: typeof json.width === "number" ? json.width : undefined,
        height: typeof json.height === "number" ? json.height : undefined,
      });
      if (!proofRes.success || !proofRes.data?.receipt) {
        throw new Error(proofRes.error || "Upload proof verification failed.");
      }
      verifiedReceipt = proofRes.data.receipt;
    }

    return {
      secureUrl: validation.data.secureUrl,
      publicId: validation.data.publicId,
      format: validation.data.format,
      uploadReceipt: verifiedReceipt,
    };
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    const remainingSlots = CLOUDINARY_CONFIG.maxImagesPerProduct - images.length;
    if (remainingSlots <= 0) {
      setErrorMessage(`Maximum of ${CLOUDINARY_CONFIG.maxImagesPerProduct} images allowed per product.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);

    // Validate all files before beginning upload
    for (const file of filesToUpload) {
      const err = validateLocalFile(file);
      if (err) {
        setErrorMessage(err);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }

    updateUploadingState(true, `Uploading 0 of ${filesToUpload.length} image(s)...`);

    const newImages: ProductImageInput[] = [...images];
    let uploadCount = 0;

    try {
      for (const file of filesToUpload) {
        updateUploadingState(
          true,
          `Uploading ${uploadCount + 1} of ${filesToUpload.length}: ${file.name}...`
        );

        const uploaded = await uploadSingleFileToCloudinary(file);

        // Register as newly uploaded (unsaved in database)
        newlyUploadedKeysRef.current.add(uploaded.publicId);

        const isFirstImage = newImages.length === 0;
        newImages.push({
          url: uploaded.secureUrl,
          storageKey: uploaded.publicId,
          altText: file.name.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " "),
          isPrimary: isFirstImage,
          sortOrder: newImages.length,
          uploadReceipt: uploaded.uploadReceipt,
        });

        uploadCount++;
      }

      onChange(newImages);
      setSuccessMessage(`Successfully uploaded ${uploadCount} image(s) to Cloudinary.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to upload images.";
      setErrorMessage(msg);
    } finally {
      updateUploadingState(false, null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || replaceTargetIndex === null) return;

    const file = files[0];
    if (!file) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    const err = validateLocalFile(file);
    if (err) {
      setErrorMessage(err);
      if (replaceInputRef.current) replaceInputRef.current.value = "";
      return;
    }

    const oldTarget = images[replaceTargetIndex];
    if (!oldTarget) return;

    updateUploadingState(true, `Replacing image: ${file.name}...`);

    try {
      const uploaded = await uploadSingleFileToCloudinary(file);

      // Register new asset as newly uploaded
      newlyUploadedKeysRef.current.add(uploaded.publicId);

      // Replace in array preserving isPrimary, sortOrder, and existing altText
      const updated = [...images];
      updated[replaceTargetIndex] = {
        ...oldTarget,
        url: uploaded.secureUrl,
        storageKey: uploaded.publicId,
        uploadReceipt: uploaded.uploadReceipt,
      };

      onChange(updated);
      setSuccessMessage("Image replaced successfully.");

      // Distinguish newly uploaded unsaved asset from saved/persisted asset
      const oldKey = oldTarget.storageKey;
      if (oldKey) {
        if (!isPersistedKey(oldKey)) {
          // Unsaved asset: safe to delete immediately
          newlyUploadedKeysRef.current.delete(oldKey);
          void deleteCloudinaryAssetAction(oldKey);
        } else {
          // Persisted asset: NEVER delete immediately!
          // Stage deletion until after database update successfully commits.
          stagedDeletionsRef.current.add(oldKey);
          onStagedDeletionsChange?.(Array.from(stagedDeletionsRef.current));
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to replace image.";
      setErrorMessage(msg);
    } finally {
      updateUploadingState(false, null);
      setReplaceTargetIndex(null);
      if (replaceInputRef.current) replaceInputRef.current.value = "";
    }
  };

  const handleRemoveImage = (index: number) => {
    const target = images[index];
    if (!target) return;

    const remaining = images.filter((_, idx) => idx !== index);

    // If removed image was primary, assign primary to the first remaining image
    if (target.isPrimary && remaining.length > 0) {
      const first = remaining[0];
      if (first) first.isPrimary = true;
    }

    // Re-index sort order
    remaining.forEach((img, idx) => {
      img.sortOrder = idx;
    });

    onChange(remaining);

    // Distinguish newly uploaded unsaved asset from saved/persisted asset
    const storageKey = target.storageKey;
    if (storageKey) {
      if (!isPersistedKey(storageKey)) {
        // Unsaved newly uploaded asset: safe to delete immediately
        newlyUploadedKeysRef.current.delete(storageKey);
        void deleteCloudinaryAssetAction(storageKey);
      } else {
        // Persisted asset: NEVER delete immediately!
        // Stage deletion until after database update successfully commits.
        stagedDeletionsRef.current.add(storageKey);
        onStagedDeletionsChange?.(Array.from(stagedDeletionsRef.current));
      }
    }
  };

  const handleSetPrimary = (index: number) => {
    const updated = images.map((img, idx) => ({
      ...img,
      isPrimary: idx === index,
    }));
    onChange(updated);
  };

  const handleAltTextChange = (index: number, newAltText: string) => {
    const updated = [...images];
    const target = updated[index];
    if (target) {
      target.altText = newAltText;
      onChange(updated);
    }
  };

  const handleMove = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= images.length) return;

    const updated = [...images];
    const temp = updated[index];
    const target = updated[targetIndex];

    if (temp && target) {
      updated[index] = target;
      updated[targetIndex] = temp;

      // Re-index sort order
      updated.forEach((img, idx) => {
        img.sortOrder = idx;
      });

      onChange(updated);
    }
  };

  return (
    <div className="p-6 rounded-2xl bg-white border border-gray-200/90 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900">
              Product Images &amp; Media Gallery
            </h2>
            <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              Cloudinary Powered
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Upload component photography directly to Cloudinary. Main image is shown in catalogue searches; gallery images display on the product detail page.
          </p>
        </div>

        <div className="text-xs font-semibold text-gray-500 self-start sm:self-auto">
          {images.length} / {CLOUDINARY_CONFIG.maxImagesPerProduct} images
        </div>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-900 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Upload Zone */}
      {images.length < CLOUDINARY_CONFIG.maxImagesPerProduct && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={disabled || isUploading}
            onChange={handleFilesSelected}
            className="hidden"
            id="cloudinary-image-input"
          />

          <label
            htmlFor="cloudinary-image-input"
            className={`border-2 border-dashed rounded-xl p-6 text-center flex flex-col items-center justify-center cursor-pointer transition-all ${
              isUploading || disabled
                ? "border-gray-200 bg-gray-50 cursor-not-allowed opacity-60"
                : "border-gray-300 hover:border-ember hover:bg-ember/5 bg-gray-50/50"
            }`}
          >
            {isUploading ? (
              <div className="flex flex-col items-center gap-2 py-2">
                <Loader2 className="w-7 h-7 text-ember animate-spin" />
                <span className="text-xs font-bold text-gray-800">
                  {uploadProgress || "Uploading to Cloudinary..."}
                </span>
                <span className="text-[11px] text-gray-500">
                  Direct browser upload in progress. Do not refresh.
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-2">
                <div className="w-10 h-10 rounded-full bg-ember/10 flex items-center justify-center text-ember">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-gray-800 hover:text-ember">
                    Click to browse or drop images here
                  </span>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    JPEG, PNG, or WebP up to 10MB each. Destination folder:{" "}
                    <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-[10px]">
                      {CLOUDINARY_CONFIG.folder}
                    </code>
                  </p>
                </div>
              </div>
            )}
          </label>
        </div>
      )}

      {/* Hidden File Input for Replace */}
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleReplaceFile}
        className="hidden"
      />

      {/* Image Gallery List */}
      {images.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-ember" />
            <span>Configured Product Media ({images.length})</span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {images.map((img, index) => (
              <div
                key={`${img.url}-${index}`}
                className={`p-3 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all ${
                  img.isPrimary
                    ? "border-ember/50 bg-ember/5 ring-1 ring-ember/30"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                {/* Thumbnail & Badges */}
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="relative w-16 h-16 rounded-lg bg-gray-100 border border-gray-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.altText || "Product preview"}
                      className="w-full h-full object-contain"
                    />
                    {img.isPrimary && (
                      <span className="absolute bottom-0 left-0 right-0 bg-ember text-white text-[8px] font-black uppercase tracking-wider text-center py-0.5">
                        MAIN
                      </span>
                    )}
                  </div>

                  {/* Alt Text Input */}
                  <div className="flex-1 sm:w-72">
                    <label className="block text-[10px] font-bold text-gray-600 mb-0.5">
                      Alt Text &amp; Accessibility Description
                    </label>
                    <input
                      type="text"
                      value={img.altText}
                      disabled={disabled || isUploading}
                      onChange={(e) => handleAltTextChange(index, e.target.value)}
                      placeholder="e.g. Front disc brake rotor assembly view"
                      className="w-full bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1 text-xs text-gray-900 focus:outline-none focus:border-ember"
                    />
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] text-gray-400 font-mono">
                        Slot #{index + 1}
                      </span>
                      {img.storageKey && (
                        <span className="text-[9px] text-gray-400 font-mono truncate max-w-[150px]">
                          ID: {img.storageKey.split("/").pop()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 self-end sm:self-center">
                  {/* Set Primary Button */}
                  {!img.isPrimary ? (
                    <button
                      type="button"
                      disabled={disabled || isUploading}
                      onClick={() => handleSetPrimary(index)}
                      className="px-2.5 py-1 rounded text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 flex items-center gap-1 transition-colors"
                      title="Set as main storefront product image"
                    >
                      <Star className="w-3 h-3 text-gray-500" />
                      <span>Set Main</span>
                    </button>
                  ) : (
                    <span className="px-2.5 py-1 rounded text-xs font-black text-ember bg-ember/10 flex items-center gap-1">
                      <Star className="w-3 h-3 fill-ember" />
                      <span>Main Image</span>
                    </span>
                  )}

                  {/* Reorder Buttons */}
                  <button
                    type="button"
                    disabled={disabled || isUploading || index === 0}
                    onClick={() => handleMove(index, "up")}
                    className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move up in gallery"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    disabled={disabled || isUploading || index === images.length - 1}
                    onClick={() => handleMove(index, "down")}
                    className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move down in gallery"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>

                  {/* Replace Button */}
                  <button
                    type="button"
                    disabled={disabled || isUploading}
                    onClick={() => {
                      setReplaceTargetIndex(index);
                      replaceInputRef.current?.click();
                    }}
                    className="p-1.5 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                    title="Replace this image"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>

                  {/* Remove Button */}
                  <button
                    type="button"
                    disabled={disabled || isUploading}
                    onClick={() => handleRemoveImage(index)}
                    className="p-1.5 rounded text-red-500 hover:text-red-700 hover:bg-red-50"
                    title="Remove image"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
