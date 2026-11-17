import React, { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NAVBAR_CATEGORIES } from "@/lib/constants/navigation";
import { searchProducts } from "@/server/catalogue/catalogue-service";
import type { RawProductSearchParams } from "@/features/catalogue/schemas";
import { ProductCard } from "@/components/catalogue/product-card";
import { ProductFilters } from "@/components/catalogue/product-filters";
import { MobileFilterDrawer } from "@/components/catalogue/mobile-filter-drawer";
import { SortSelector } from "@/components/catalogue/sort-selector";
import { Pagination } from "@/components/catalogue/pagination";
import { EmptyState } from "@/components/catalogue/empty-state";
import { Info, ChevronRight } from "lucide-react";

interface CategoryPageProps {
  params: Promise<{
    categorySlug: string;
  }>;
  searchParams: Promise<RawProductSearchParams>;
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { categorySlug } = await params;
  const resolvedSearchParams = await searchParams;

  const category = NAVBAR_CATEGORIES.find((c) => c.slug === categorySlug);
  if (!category) {
    notFound();
  }

  // Query catalogue for this category with any active filters
  const result = await searchProducts({
    ...resolvedSearchParams,
    category: categorySlug,
  });

  const basePath = `/categories/${categorySlug}`;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex items-center space-x-2 text-xs text-gray-400">
          <li>
            <Link href="/" className="hover:text-ember transition-colors">
              Home
            </Link>
          </li>
          <li>/</li>
          <li>
            <Link href="/categories" className="hover:text-ember transition-colors">
              Categories
            </Link>
          </li>
          <li>/</li>
          <li className="text-paper font-semibold">{category.name}</li>
        </ol>
      </nav>

      {/* Demo Notice Banner */}
      {result.isDemoSource && (
        <div className="mb-6 p-3 rounded-brand bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex items-start gap-2">
          <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <span>
            Demo Mode: Showing simulated catalog items for {category.name}. Real inventory
            records connect upon PostgreSQL database migration.
          </span>
        </div>
      )}

      {/* Category Hero Banner */}
      <div className="rounded-card bg-gradient-to-r from-ink-raised via-ink to-ink border border-gray-800 p-6 sm:p-10 mb-8">
        <div className="max-w-2xl">
          <span className="text-xs font-bold uppercase tracking-wider text-ember block mb-2">
            Vehicle Subsystem Assembly
          </span>
          <h1 className="text-2xl sm:text-4xl font-black text-paper tracking-tight mb-3">
            {category.name}
          </h1>
          <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">
            Discover verified OEM and OES replacement components for {category.name.toLowerCase()}.
            Precision fitment for popular Indian passenger vehicles.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Column: Subcategories & Filters */}
        <div className="hidden lg:block lg:col-span-1 space-y-6">
          {/* Subcategories Directory */}
          <div className="rounded-card bg-ink-raised border border-gray-800 p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-paper mb-3 pb-2 border-b border-gray-800">
              Subcategories
            </h2>
            <ul className="space-y-1 text-xs text-gray-300">
              {category.subcategories.map((sub) => (
                <li key={sub.slug}>
                  <Link
                    href={`/categories/${category.slug}/${sub.slug}`}
                    className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-ink hover:text-ember transition-colors group"
                  >
                    <span>{sub.name}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-ember transition-colors" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Facet Filters */}
          <Suspense fallback={<div className="h-64 rounded bg-ink-raised animate-pulse" />}>
            <ProductFilters facets={result.facets} basePath={basePath} />
          </Suspense>
        </div>

        {/* Right Column: Products Stream */}
        <div className="lg:col-span-3">
          {/* Controls Bar */}
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-gray-800">
            <div className="flex items-center gap-3">
              <MobileFilterDrawer facets={result.facets} basePath={basePath} />
              <span className="text-xs font-semibold text-gray-400">
                Found <span className="text-paper font-bold">{result.totalCount}</span> items in{" "}
                {category.name}
              </span>
            </div>

            <SortSelector currentSort={result.activeFilters.sort} basePath={basePath} />
          </div>

          {/* Products Grid */}
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
                basePath={basePath}
              />
            </div>
          ) : (
            <EmptyState
              title={`No parts found in ${category.name}`}
              message="No parts in this category match your selected brand or price filters. Try resetting filters."
              isDatabaseSource={!result.isDemoSource}
              isDatabaseUnavailable={result.isDatabaseUnavailable}
              onResetHref={basePath}
            />
          )}
        </div>
      </div>
    </div>
  );
}
