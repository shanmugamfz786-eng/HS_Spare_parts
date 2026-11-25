import React from "react";

export default function SearchLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 animate-pulse" aria-busy="true">
      <div className="h-4 w-48 bg-gray-200 rounded mb-6" />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 pb-4 border-b border-gray-200">
        <div className="space-y-2">
          <div className="h-7 w-64 bg-gray-300 rounded-lg" />
          <div className="h-4 w-40 bg-gray-200 rounded" />
        </div>
        <div className="h-9 w-44 bg-gray-200 rounded-xl" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="hidden lg:block space-y-6">
          <div className="h-6 w-28 bg-gray-200 rounded" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-4 w-full bg-gray-100 rounded" />
            ))}
          </div>
        </div>

        <div className="lg:col-span-3">
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
