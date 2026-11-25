"use client";

import React, { useState } from "react";
import Image from "next/image";
import { ShieldCheck } from "lucide-react";
import type { ProductImageDTO } from "@/features/catalogue/schemas";
import { getOptimizedCloudinaryUrl } from "@/lib/cloudinary-shared";

interface ProductGalleryProps {
  images?: ProductImageDTO[];
  productName: string;
  brandName: string;
  sku: string;
  categorySlug?: string;
  isOem?: boolean;
}

const CATEGORY_DEFAULT_GALLERIES: Record<string, string[]> = {
  brake: ["/images/brakes.jpg", "/images/hero-car.jpg"],
  "suspension-steering": ["/images/suspension.jpg", "/images/hero-car.jpg"],
  "engine-parts": ["/images/engine.jpg", "/images/accessories.jpg"],
  transmission: ["/images/transmission.jpg", "/images/engine.jpg"],
  hvac: ["/images/cooling.jpg", "/images/engine.jpg"],
  electrical: ["/images/electrical.jpg", "/images/body.jpg"],
  "body-parts": ["/images/body.jpg", "/images/hero-car.jpg"],
  accessories: ["/images/accessories.jpg", "/images/electrical.jpg"],
};

export function ProductGallery({
  images = [],
  productName,
  brandName,
  sku,
  categorySlug = "brake",
  isOem = true,
}: ProductGalleryProps) {
  const defaultList = CATEGORY_DEFAULT_GALLERIES[categorySlug] || ["/images/brakes.jpg"];
  const displayImages: string[] =
    images.length > 0 ? images.map((img) => img.url) : defaultList;

  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeImageUrl: string =
    displayImages[selectedIndex] ?? displayImages[0] ?? defaultList[0] ?? "/images/brakes.jpg";
  const optimizedActiveImage: string =
    getOptimizedCloudinaryUrl(activeImageUrl, "productGallery") || activeImageUrl;

  return (
    <div className="flex flex-col gap-4">
      {/* Active Main Product Image */}
      <div className="bg-[#090D18] rounded-2xl border border-gray-800 p-4 sm:p-6 flex items-center justify-center min-h-[360px] sm:min-h-[440px] relative overflow-hidden shadow-md group">
        {/* Top Badges */}
        <div className="absolute top-4 left-4 z-10 flex flex-col gap-1.5 items-start">
          {isOem ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-950/80 backdrop-blur-md px-3 py-1 rounded-full border border-emerald-700/80 shadow">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>OEM Specification</span>
            </span>
          ) : (
            <span className="text-xs font-semibold text-gray-300 bg-gray-900/80 backdrop-blur-md px-3 py-1 rounded-full border border-gray-700 shadow">
              Aftermarket Component
            </span>
          )}

          <span className="text-[10px] font-medium text-amber-300 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded border border-amber-500/30">
            Demo Catalogue View
          </span>
        </div>

        {/* Brand Stamp */}
        <div className="absolute top-4 right-4 z-10 text-[11px] font-mono text-gray-400 font-bold tracking-wider bg-black/50 px-2.5 py-1 rounded border border-gray-800">
          {brandName} • {sku}
        </div>

        {/* Main Image */}
        <div className="relative w-full h-[280px] sm:h-[360px] flex items-center justify-center">
          <Image
            src={optimizedActiveImage}
            alt={productName}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            priority={selectedIndex === 0}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500 drop-shadow-[0_15px_30px_rgba(0,0,0,0.8)]"
          />
        </div>

        {/* Ambient Floor Glow */}
        <div className="absolute -bottom-6 w-3/4 h-8 bg-ember/15 blur-2xl rounded-full pointer-events-none" />
      </div>

      {/* Thumbnail Selector Gallery Bar */}
      {displayImages.length > 1 && (
        <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-thin">
          {displayImages.map((imgUrl, idx) => {
            const isSelected = idx === selectedIndex;
            const optimizedThumb =
              getOptimizedCloudinaryUrl(imgUrl, "productThumbnail") || imgUrl;

            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedIndex(idx)}
                className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl border-2 overflow-hidden flex-shrink-0 transition-all bg-[#090D18] ${
                  isSelected
                    ? "border-ember shadow-md shadow-ember/30 scale-102"
                    : "border-gray-200 hover:border-gray-400 opacity-70 hover:opacity-100"
                }`}
                aria-label={`Select product image view ${idx + 1}`}
              >
                <Image
                  src={optimizedThumb}
                  alt={`${productName} thumbnail ${idx + 1}`}
                  fill
                  sizes="96px"
                  loading="lazy"
                  className="w-full h-full object-cover object-center"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
