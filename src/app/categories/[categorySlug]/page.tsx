import React, { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NAVBAR_CATEGORIES, resolveCanonicalCategorySlug } from "@/lib/constants/navigation";
import { searchProducts } from "@/server/catalogue/catalogue-service";
import type { RawProductSearchParams } from "@/features/catalogue/schemas";
import { ProductCard } from "@/components/catalogue/product-card";
import { ProductFilters } from "@/components/catalogue/product-filters";
import { MobileFilterDrawer } from "@/components/catalogue/mobile-filter-drawer";
import { SortSelector } from "@/components/catalogue/sort-selector";
import { Pagination } from "@/components/catalogue/pagination";
import { EmptyState } from "@/components/catalogue/empty-state";
import { Info, ChevronRight, Layers } from "lucide-react";

interface CategoryPageProps {
  params: Promise<{
    categorySlug: string;
  }>;
  searchParams: Promise<RawProductSearchParams>;
}

const CATEGORY_BANNER_IMAGES: Record<string, string> = {
  brake: "/images/brakes.jpg",
  "suspension-steering": "/images/suspension.jpg",
  "engine-parts": "/images/engine.jpg",
  transmission: "/images/transmission.jpg",
  hvac: "/images/cooling.jpg",
  electrical: "/images/electrical.jpg",
  "body-parts": "/images/body.jpg",
  accessories: "/images/accessories.jpg",
};

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { categorySlug } = await params;
  const resolvedSearchParams = await searchParams;

  const canonicalSlug = resolveCanonicalCategorySlug(categorySlug);
  const category = NAVBAR_CATEGORIES.find(
    (c) => c.slug === categorySlug || c.slug === canonicalSlug
  );
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
          <li>
            <Link href="/categories" className="hover:text-ember transition-colors">
              Categories
            </Link>
          </li>
          <li>/</li>
          <li className="text-gray-900 font-bold">{category.name}</li>
        </ol>
      </nav>

      {/* Demo Notice Banner */}
      {result.isDemoSource && (
        <div className="mb-6 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-900 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <span>
            <strong>Demo Catalogue Mode:</strong> Showing simulated catalog items for {category.name}. Real inventory
            records connect upon live database deployment.
          </span>
        </div>
      )}

      {/* Premium Dark Category Banner with Image */}
      <div className="rounded-2xl bg-gradient-to-r from-[#090D18] via-[#111827] to-[#090D18] border border-gray-800 text-white p-6 sm:p-8 mb-8 shadow-md relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="absolute top-0 right-0 w-80 h-80 bg-ember/10 rounded-full blur-3xl pointer-events-none -z-10" />
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-ember/15 border border-ember/30 text-ember text-xs font-bold uppercase tracking-wider mb-3">
            <Layers className="w-3.5 h-3.5" />
            <span>Vehicle Subsystem Assembly</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight mb-3">
            {category.name}
          </h1>
          <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">
            Discover OEM and aftermarket replacement components for {category.name.toLowerCase()}.
            Vehicle fitment assistance for popular Indian passenger vehicles.
          </p>
        </div>

        {CATEGORY_BANNER_IMAGES[category.slug] && (
          <div className="w-full md:w-64 h-36 rounded-xl overflow-hidden border border-gray-700/80 shadow-lg flex-shrink-0 relative bg-black">
            <img
              src={CATEGORY_BANNER_IMAGES[category.slug]}
              alt={category.name}
              className="w-full h-full object-cover object-center opacity-90"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Column: Subcategories & Filters */}
        <div className="hidden lg:block lg:col-span-1 space-y-6">
          {/* Subcategories Directory */}
          <div className="rounded-xl bg-white border border-gray-200/90 shadow-sm p-5 text-gray-900">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-3 pb-2 border-b border-gray-100">
              Subcategories
            </h2>
            <ul className="space-y-1 text-xs text-gray-600">
              {category.subcategories.map((sub) => (
                <li key={sub.slug}>
                  <Link
                    href={`/categories/${category.slug}/${sub.slug}`}
                    className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50 hover:text-ember transition-colors group"
                  >
                    <span>{sub.name}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-ember group-hover:translate-x-0.5 transition-all" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Faceted Filters */}
          <Suspense fallback={<div className="h-96 rounded-xl bg-white animate-pulse" />}>
            <ProductFilters facets={result.facets} basePath={basePath} />
          </Suspense>
        </div>

        {/* Right Column: Active Products Viewport */}
        <div className="lg:col-span-3 space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-gray-200/90 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between sm:justify-start gap-4">
              <span className="text-xs sm:text-sm text-gray-600">
                Showing <strong className="text-gray-900 font-bold">{result.products.length}</strong> of{" "}
                <strong className="text-gray-900 font-bold">{result.totalCount}</strong> parts
              </span>

              {/* Mobile Filter Trigger */}
              <div className="lg:hidden">
                <MobileFilterDrawer
                  facets={result.facets}
                  totalCount={result.totalCount}
                  basePath={basePath}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <SortSelector currentSort={result.activeFilters.sort} />
            </div>
          </div>

          {/* Products Grid or Empty State */}
          {result.products.length === 0 ? (
            <EmptyState
              categorySlug={categorySlug}
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
                basePath={basePath}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
