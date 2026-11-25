"use client";

import React, { useState, useRef } from "react";
import {
  UploadCloud,
  X,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import {
  getCloudinaryUploadSignatureAction,
  confirmUploadProofAction,
} from "@/features/admin/actions";
import {
  CLOUDINARY_CONFIG,
  validateCloudinaryAssetMetadata,
  type CloudinaryFolder,
} from "@/lib/cloudinary-shared";

interface AdminSingleImageUploaderProps {
  label: string;
  value: string | null;
  storageKey?: string | null;
  uploadReceipt?: string | null;
  folder: CloudinaryFolder;
  onChange: (data: {
    imageUrl: string | null;
    storageKey: string | null;
    uploadReceipt: string | null;
  }) => void;
  onStagedDeletion?: (storageKey: string) => void;
  aspectRatioHint?: string;
  disabled?: boolean;
  helperText?: string;
}

export function AdminSingleImageUploader({
  label,
  value,
  storageKey,
  folder,
  onChange,
  onStagedDeletion,
  aspectRatioHint = "Recommended 16:9 or square (JPEG, PNG, WebP up to 10MB)",
  disabled = false,
  helperText,
}: AdminSingleImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Storage key of the asset when component mounted (persisted asset)
  const initialStorageKeyRef = useRef<string | null>(storageKey ?? null);

  const validateLocalFile = (file: File): string | null => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return `Invalid format '${file.type || "unknown"}'. Only JPEG, PNG, and WebP images are accepted. SVG is prohibited.`;
    }

    if (file.size > CLOUDINARY_CONFIG.maxFileSizeBytes) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      return `File size (${sizeMb}MB) exceeds the 10MB limit.`;
    }

    return null;
  };

  const uploadFileToCloudinary = async (file: File) => {
    // 1. Fetch server-signed upload parameters
    const sigRes = await getCloudinaryUploadSignatureAction(folder);
    if (!sigRes.success || !sigRes.data) {
      throw new Error(sigRes.error || "Failed to generate server upload signature.");
    }

    const {
      uploadUrl,
      apiKey,
      timestamp,
      signature,
      folder: targetFolder,
      publicId,
      uploadPreset,
      sessionId,
      uploadReceipt: receiptToken,
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

    // 2. Direct browser upload to Cloudinary
    const formData = new FormData();
    formData.append("file", file);
    formData.append("api_key", apiKey);
    formData.append("timestamp", timestamp.toString());
    formData.append("signature", signature);
    formData.append("folder", targetFolder);
    formData.append("public_id", publicId);
    formData.append("upload_preset", uploadPreset);

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
    });

    if (!uploadRes.ok) {
      let errDetail = "Upload failed.";
      try {
        const errorJson = (await uploadRes.json()) as { error?: { message?: string } };
        if (errorJson.error?.message) errDetail = errorJson.error.message;
      } catch {
        // use default
      }
      throw new Error(`Cloudinary upload failed (${uploadRes.status}): ${errDetail}`);
    }

    const responseJson = (await uploadRes.json()) as {
      secure_url: string;
      public_id: string;
      format: string;
      resource_type: string;
      bytes: number;
      width: number;
      height: number;
      signature?: string;
      version?: string | number;
    };

    // 3. Client metadata validation
    const validation = validateCloudinaryAssetMetadata(
      {
        publicId: responseJson.public_id,
        secureUrl: responseJson.secure_url,
        format: responseJson.format,
        resourceType: responseJson.resource_type,
        bytes: responseJson.bytes,
      },
      targetFolder
    );

    if (!validation.valid) {
      throw new Error(validation.error || "Uploaded asset failed security validation.");
    }

    // 4. Stage B: Verify upload proof with server & obtain Receipt v2
    let verifiedReceipt = receiptToken || null;
    if (sessionId && responseJson.signature && responseJson.version) {
      const proofRes = await confirmUploadProofAction({
        sessionId,
        publicId: responseJson.public_id,
        version: String(responseJson.version),
        signature: String(responseJson.signature),
        bytes: responseJson.bytes,
        format: responseJson.format,
        width: responseJson.width,
        height: responseJson.height,
      });
      if (!proofRes.success || !proofRes.data?.receipt) {
        throw new Error(proofRes.error || "Upload proof verification failed.");
      }
      verifiedReceipt = proofRes.data.receipt;
    }

    return {
      secureUrl: responseJson.secure_url,
      publicId: responseJson.public_id,
      uploadReceipt: verifiedReceipt,
    };
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    const validationErr = validateLocalFile(file);
    if (validationErr) {
      setErrorMessage(validationErr);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Stage deletion of previous persisted key if replacing
    if (storageKey && storageKey === initialStorageKeyRef.current) {
      onStagedDeletion?.(storageKey);
    }

    setIsUploading(true);
    try {
      const uploaded = await uploadFileToCloudinary(file);
      onChange({
        imageUrl: uploaded.secureUrl,
        storageKey: uploaded.publicId,
        uploadReceipt: uploaded.uploadReceipt,
      });
      setSuccessMessage("Asset uploaded successfully.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed.";
      setErrorMessage(msg);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemove = () => {
    if (storageKey) {
      // If was persisted on mount, stage for deletion upon form save
      if (storageKey === initialStorageKeyRef.current) {
        onStagedDeletion?.(storageKey);
      }
    }
    onChange({ imageUrl: null, storageKey: null, uploadReceipt: null });
    setSuccessMessage(null);
    setErrorMessage(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
          {label}
        </label>
        {aspectRatioHint && (
          <span className="text-[11px] text-gray-500">{aspectRatioHint}</span>
        )}
      </div>

      {helperText && <p className="text-xs text-gray-500">{helperText}</p>}

      {errorMessage && (
        <div className="flex items-start gap-2 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="flex items-center gap-2 p-2.5 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={disabled || isUploading}
      />

      {value ? (
        <div className="relative group border border-gray-200 rounded-xl overflow-hidden bg-gray-900 flex items-center justify-center max-h-56">
          <img
            src={value}
            alt={label}
            className="w-full h-auto max-h-56 object-contain"
          />

          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading}
              className="px-3 py-1.5 bg-white text-gray-900 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Replace</span>
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled || isUploading}
              className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
              <span>Remove</span>
            </button>
          </div>

          {storageKey && (
            <div className="absolute bottom-1 left-2 bg-black/70 px-2 py-0.5 rounded text-[10px] text-gray-300 font-mono truncate max-w-[85%]">
              {storageKey}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
          className="w-full border-2 border-dashed border-gray-300 hover:border-ember hover:bg-ember/5 rounded-xl p-6 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          {isUploading ? (
            <Loader2 className="w-7 h-7 text-ember animate-spin" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-100 group-hover:bg-ember/10 flex items-center justify-center text-gray-500 group-hover:text-ember transition-colors">
              <UploadCloud className="w-5 h-5" />
            </div>
          )}

          <div className="text-center">
            <p className="text-xs font-bold text-gray-700 group-hover:text-ember transition-colors">
              {isUploading ? "Uploading to Cloudinary..." : "Click or drag to upload asset"}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Target folder: <span className="font-mono text-gray-500">{folder}</span>
            </p>
          </div>
        </button>
      )}
    </div>
  );
}
