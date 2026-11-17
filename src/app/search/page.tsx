import React, { Suspense } from "react";
import Link from "next/link";
import { Car, Info } from "lucide-react";
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex items-center space-x-2 text-xs text-gray-400">
          <li>
            <Link href="/" className="hover:text-ember transition-colors">
              Home
            </Link>
          </li>
          <li>/</li>
          <li className="text-paper font-semibold">Search Parts</li>
          {query && (
            <>
              <li>/</li>
              <li className="text-ember font-semibold truncate max-w-xs">
                &ldquo;{query}&rdquo;
              </li>
            </>
          )}
        </ol>
      </nav>

      {/* Demo Catalogue Transparency Banner */}
      {result.isDemoSource && (
        <div className="mb-6 p-3.5 rounded-brand bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block text-paper">
              Demo Catalogue Preview Mode
            </span>
            <span className="text-gray-300">
              Database connection unconfigured in this environment. Showing simulated catalogue
              records with full search, facet filtering, sorting, and pagination capabilities. Real
              inventory records populate upon Neon database connection.
            </span>
          </div>
        </div>
      )}

      {/* Search Header Banner */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-ember block mb-1">
              Automotive Parts Catalogue
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-paper tracking-tight">
              {query ? `Search Results for "${query}"` : "Browse Automotive Spare Parts"}
            </h1>
          </div>

          {/* Active vehicle badge */}
          {hasVehicle && (
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-pill bg-ink-raised border border-gray-700 text-xs text-paper">
              <Car className="w-3.5 h-3.5 text-ember" />
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
            <Suspense fallback={<div className="h-96 rounded bg-ink-raised animate-pulse" />}>
              <ProductFilters facets={result.facets} basePath="/search" />
            </Suspense>
          </div>
        </div>

        {/* Right Column: Results Stream */}
        <div className="lg:col-span-3">
          {/* Controls Bar */}
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-gray-800">
            <div className="flex items-center gap-3">
              <MobileFilterDrawer facets={result.facets} basePath="/search" />
              <span className="text-xs font-semibold text-gray-400">
                Found <span className="text-paper font-bold">{result.totalCount}</span> parts
              </span>
            </div>

            <SortSelector currentSort={result.activeFilters.sort} basePath="/search" />
          </div>

          {/* Product Listing / Empty State */}
          {result.products.length > 0 ? (
            <div className="space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {result.products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {/* Server-Side Pagination */}
              <Pagination
                currentPage={result.page}
                totalPages={result.totalPages}
                totalCount={result.totalCount}
                pageSize={result.pageSize}
                basePath="/search"
              />
            </div>
          ) : (
            <EmptyState
              query={query}
              isDatabaseSource={!result.isDemoSource}
              isDatabaseUnavailable={result.isDatabaseUnavailable}
              onResetHref="/search"
            />
          )}
        </div>
      </div>
    </div>
  );
}
