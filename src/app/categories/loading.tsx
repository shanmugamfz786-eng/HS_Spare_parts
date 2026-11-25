import React from "react";

export default function CategoriesLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 animate-pulse" aria-busy="true">
      <div className="mb-10 space-y-3">
        <div className="h-4 w-36 bg-gray-200 rounded" />
        <div className="h-8 w-80 bg-gray-300 rounded-lg" />
        <div className="h-4 w-96 bg-gray-100 rounded" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="rounded-2xl bg-white border border-gray-200 p-6 flex flex-col justify-between space-y-4 shadow-sm"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-5 w-40 bg-gray-200 rounded" />
                <div className="h-4 w-16 bg-gray-100 rounded-full" />
              </div>
              <div className="space-y-2 pt-2">
                <div className="h-3 w-32 bg-gray-100 rounded" />
                <div className="h-3 w-28 bg-gray-100 rounded" />
                <div className="h-3 w-36 bg-gray-100 rounded" />
                <div className="h-3 w-24 bg-gray-100 rounded" />
              </div>
            </div>
            <div className="pt-4 border-t border-gray-100">
              <div className="h-4 w-28 bg-gray-200 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
