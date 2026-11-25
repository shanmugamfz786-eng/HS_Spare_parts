import React from "react";

export default function SubCategoryLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 animate-pulse" aria-busy="true">
      {/* Breadcrumb Skeleton */}
      <div className="h-4 w-64 bg-gray-200 rounded mb-6" />

      {/* Hero Banner Skeleton */}
      <div className="rounded-2xl bg-[#090D18] p-6 sm:p-10 mb-8 border border-gray-800 space-y-3">
        <div className="h-5 w-40 bg-gray-800 rounded-full" />
        <div className="h-8 w-72 bg-gray-700 rounded-lg" />
        <div className="h-4 w-96 bg-gray-800 rounded" />
      </div>

      {/* Main Content Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Filters Sidebar Skeleton */}
        <div className="hidden lg:block space-y-6">
          <div className="h-6 w-32 bg-gray-200 rounded" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-4 w-full bg-gray-100 rounded" />
            ))}
          </div>
        </div>

        {/* Product Cards Grid Skeleton */}
        <div className="lg:col-span-3 space-y-6">
          <div className="flex justify-between items-center pb-4 border-b border-gray-200">
            <div className="h-4 w-32 bg-gray-200 rounded" />
            <div className="h-8 w-40 bg-gray-200 rounded-lg" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-4">
                <div className="aspect-square bg-gray-100 rounded-xl w-full" />
                <div className="space-y-2">
                  <div className="h-3 w-20 bg-gray-200 rounded" />
                  <div className="h-4 w-full bg-gray-300 rounded" />
                  <div className="h-5 w-28 bg-gray-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
