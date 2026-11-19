import React, { Suspense } from "react";
import Link from "next/link";
import { Car, Info, Search as SearchIcon } from "lucide-react";
import { searchProducts } from "@/server/catalogue/catalogue-service";
import type { RawProductSearchParams } from "@/features/catalogue/schemas";
import { ProductCard } from "@/components/catalogue/product-card";
import { ProductFilters } from "@/components/catalogue/product-filters";
import { MobileFilterDrawer } from "@/components/catalogue/mobile-filter-drawer";
import { SortSelector } from "@/components/catalogue/sort-selector";
import { Pagination } from "@/components/catalogue/pagination";
import { EmptyState } from "@/components/catalogue/empty-state";

interface SearchPageProps {
  searchParams: Promise<RawProductSearchParams>;
}

export const metadata = {
  title: "Search Automotive Spare Parts",
  description:
    "Search compatible automotive replacement components by vehicle make, model, year, brand, and OEM part number.",
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const resolvedParams = await searchParams;
  const result = await searchProducts(resolvedParams);

  const query = result.activeFilters.query;
  const hasVehicle = Boolean(result.activeFilters.make);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex items-center space-x-2 text-xs text-gray-500">
          <li>
            <Link href="/" className="hover:text-ember transition-colors">
              Home
            </Link>
          </li>
          <li>/</li>
          <li className="text-gray-900 font-bold">Search Parts</li>
          {query && (
            <>
              <li>/</li>
              <li className="text-ember font-bold truncate max-w-xs">
                &ldquo;{query}&rdquo;
              </li>
            </>
          )}
        </ol>
      </nav>

      {/* Demo Notice Banner */}
      {result.isDemoSource && (
        <div className="mb-6 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-900 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <span>
            <strong>Demo Catalogue Mode:</strong> Showing simulated catalogue records with full search, facet filtering, sorting, and pagination. Real inventory records populate upon live database connection.
          </span>
        </div>
      )}

      {/* Search Header Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-[#090D18] via-[#111827] to-[#090D18] border border-gray-800 text-white p-6 sm:p-8 mb-8 shadow-md">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-ember/15 border border-ember/30 text-ember text-xs font-bold uppercase tracking-wider mb-3">
              <SearchIcon className="w-3.5 h-3.5" />
              <span>Automotive Parts Catalogue</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {query ? `Search Results for "${query}"` : "Browse Automotive Spare Parts"}
            </h1>
          </div>

          {/* Active vehicle badge */}
          {hasVehicle && (
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gray-900 border border-gray-700 text-xs text-white">
              <Car className="w-4 h-4 text-ember flex-shrink-0" />
              <span>
                Filtered for: <strong className="text-ember">{result.activeFilters.make}</strong>{" "}
                {result.activeFilters.model} {result.activeFilters.year}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Grid: Sidebar Filters + Products Viewport */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Column: Desktop Filters Sidebar */}
        <div className="hidden lg:block lg:col-span-1">
          <div className="sticky top-24">
            <Suspense fallback={<div className="h-96 rounded-xl bg-white animate-pulse" />}>
              <ProductFilters facets={result.facets} />
            </Suspense>
          </div>
        </div>

        {/* Right Column: Active Products Viewport */}
        <div className="lg:col-span-3 space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-gray-200/90 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between sm:justify-start gap-4">
              <span className="text-xs sm:text-sm text-gray-600">
                Found <strong className="text-gray-900 font-bold">{result.totalCount}</strong> matching parts
              </span>

              {/* Mobile Filter Drawer Trigger */}
              <div className="lg:hidden">
                <MobileFilterDrawer
                  facets={result.facets}
                  totalCount={result.totalCount}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <SortSelector currentSort={result.activeFilters.sort} />
            </div>
          </div>

          {/* Product Grid or Empty State */}
          {result.products.length === 0 ? (
            <EmptyState
              query={query}
              activeFiltersCount={Object.keys(result.activeFilters).length}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {result.products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}

          {/* Pagination Controls */}
          {result.totalPages > 1 && (
            <div className="pt-6">
              <Pagination
                currentPage={result.page}
                totalPages={result.totalPages}
                totalCount={result.totalCount}
                pageSize={result.pageSize}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
