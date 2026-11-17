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
import { Info, ArrowLeft } from "lucide-react";

interface SubCategoryPageProps {
  params: Promise<{
    categorySlug: string;
    subSlug: string;
  }>;
  searchParams: Promise<RawProductSearchParams>;
}

export default async function SubCategoryPage({ params, searchParams }: SubCategoryPageProps) {
  const { categorySlug, subSlug } = await params;
  const resolvedSearchParams = await searchParams;

  const category = NAVBAR_CATEGORIES.find((c) => c.slug === categorySlug);
  if (!category) {
    notFound();
  }

  const subcategory = category.subcategories.find((s) => s.slug === subSlug);
  if (!subcategory) {
    notFound();
  }

  const result = await searchProducts({
    ...resolvedSearchParams,
    category: categorySlug,
    subcategory: subSlug,
  });

  const basePath = `/categories/${categorySlug}/${subSlug}`;

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
          <li>
            <Link href={`/categories/${category.slug}`} className="hover:text-ember transition-colors">
              {category.name}
            </Link>
          </li>
          <li>/</li>
          <li className="text-paper font-semibold">{subcategory.name}</li>
        </ol>
      </nav>

      {/* Demo Notice Banner */}
      {result.isDemoSource && (
        <div className="mb-6 p-3 rounded-brand bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex items-start gap-2">
          <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <span>
            Demo Preview: Catalogue for {subcategory.name} in {category.name}. Real inventory
            records connect upon PostgreSQL database migration.
          </span>
        </div>
      )}

      {/* Header Banner */}
      <div className="rounded-card bg-gradient-to-r from-ink-raised via-ink to-ink border border-gray-800 p-6 sm:p-10 mb-8">
        <span className="text-xs font-bold uppercase tracking-wider text-ember block mb-2">
          {category.name} Subassembly
        </span>
        <h1 className="text-2xl sm:text-4xl font-black text-paper tracking-tight mb-3">
          {subcategory.name}
        </h1>
        <p className="text-xs sm:text-sm text-gray-300 leading-relaxed max-w-2xl">
          Browse OEM and aftermarket replacement spare parts for {subcategory.name.toLowerCase()}.
          Every part is catalogued with technical specifications and vehicle compatibility references.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Column: Filters Sidebar */}
        <div className="hidden lg:block lg:col-span-1 space-y-6">
          <div className="rounded-card bg-ink-raised border border-gray-800 p-4">
            <Link
              href={`/categories/${category.slug}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-ember transition-colors mb-4 pb-2 border-b border-gray-800 w-full"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to All {category.name}</span>
            </Link>

            <Suspense fallback={<div className="h-64 rounded bg-ink-raised animate-pulse" />}>
              <ProductFilters facets={result.facets} basePath={basePath} />
            </Suspense>
          </div>
        </div>

        {/* Right Column: Products Stream */}
        <div className="lg:col-span-3">
          {/* Controls Bar */}
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-gray-800">
            <div className="flex items-center gap-3">
              <MobileFilterDrawer facets={result.facets} basePath={basePath} />
              <span className="text-xs font-semibold text-gray-400">
                Found <span className="text-paper font-bold">{result.totalCount}</span> parts in{" "}
                {subcategory.name}
              </span>
            </div>

            <SortSelector currentSort={result.activeFilters.sort} basePath={basePath} />
          </div>

          {/* Products Grid / Empty State */}
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
              title={`No parts found for ${subcategory.name}`}
              message="No parts in this subassembly match your selected criteria. Try removing filters or exploring other subcategories."
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
