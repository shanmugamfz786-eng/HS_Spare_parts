import React from "react";

export function ProductCardSkeleton() {
  return (
    <div className="surface-card bg-paper rounded-card border border-border flex flex-col justify-between shadow-card animate-pulse">
      <div>
        <div className="bg-mist h-44 rounded-t-card border-b border-border flex items-center justify-center" />
        <div className="p-4 space-y-2">
          <div className="h-3 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
        </div>
      </div>
      <div className="p-4 pt-0">
        <div className="pt-3 border-t border-border flex items-center justify-between mb-3">
          <div className="h-5 bg-gray-200 rounded w-1/3" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="h-8 bg-gray-200 rounded" />
          <div className="h-8 bg-gray-200 rounded" />
        </div>
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
