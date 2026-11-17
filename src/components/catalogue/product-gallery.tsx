"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Wrench, ShieldCheck } from "lucide-react";
import type { ProductImageDTO } from "@/features/catalogue/schemas";

interface ProductGalleryProps {
  images: ProductImageDTO[];
  productName: string;
  brandName: string;
  sku: string;
  isOem?: boolean;
}

export function ProductGallery({
  images,
  productName,
  brandName,
  sku,
  isOem = true,
}: ProductGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // If no uploaded images exist, render an informative automotive hardware schematic canvas
  if (!images || images.length === 0) {
    return (
      <div className="surface-card bg-paper text-charcoal rounded-card border border-border p-8 flex flex-col items-center justify-center min-h-[380px] shadow-card relative">
        <div className="absolute top-4 left-4">
          {isOem ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-success bg-success/10 px-2.5 py-1 rounded-pill border border-success/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>OES Certified Standard</span>
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-muted bg-mist px-2.5 py-1 rounded-pill border border-border">
              Tier-1 Component
            </span>
          )}
        </div>

        <div className="w-48 h-48 rounded-card bg-mist border border-border/80 flex flex-col items-center justify-center p-6 text-center shadow-inner my-4">
          <Wrench className="w-12 h-12 text-muted mb-2 animate-pulse" />
          <span className="text-xs font-bold text-muted uppercase tracking-wider block">
            {brandName}
          </span>
          <span className="text-lg font-black text-charcoal block mt-1 tracking-tight">
            {sku}
          </span>
        </div>

        <span className="text-xs text-muted text-center max-w-xs mt-2">
          Genuine manufacturer packaging with security seal verified prior to dispatch.
        </span>
      </div>
    );
  }

  const activeImage = images[selectedIndex] ?? images[0];

  return (
    <div className="flex flex-col gap-4">
      {/* Active Hero Image Display */}
      <div className="surface-card bg-paper rounded-card border border-border p-6 flex items-center justify-center min-h-[380px] relative overflow-hidden">
        {activeImage ? (
          <div className="relative w-full h-[320px]">
            <Image
              src={activeImage.url}
              alt={activeImage.altText || productName}
              fill
              className="object-contain"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
            />
          </div>
        ) : null}
      </div>

      {/* Thumbnail Bar */}
      {images.length > 1 && (
        <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-thin">
          {images.map((img, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <button
                key={img.id || idx}
                type="button"
                onClick={() => setSelectedIndex(idx)}
                className={`w-16 h-16 rounded-brand border-2 overflow-hidden flex-shrink-0 transition-all p-1 bg-paper ${
                  isSelected
                    ? "border-ember ring-2 ring-ember/30"
                    : "border-border hover:border-gray-400 opacity-70 hover:opacity-100"
                }`}
                aria-label={`Select photo ${idx + 1} of ${images.length}`}
              >
                <div className="relative w-full h-full">
                  <Image
                    src={img.url}
                    alt={img.altText || `${productName} thumbnail ${idx + 1}`}
                    fill
                    className="object-contain"
                    sizes="64px"
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
