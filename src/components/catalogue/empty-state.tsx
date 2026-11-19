import React from "react";
import Link from "next/link";
import { Search, RotateCcw, ArrowLeft, Info } from "lucide-react";

interface EmptyStateProps {
  title?: string;
  message?: string;
  query?: string;
  categorySlug?: string;
  subcategorySlug?: string;
  activeFiltersCount?: number;
  isDatabaseSource?: boolean;
  isDatabaseUnavailable?: boolean;
  onResetHref?: string;
}

export function EmptyState({
  title,
  message,
  query,
  categorySlug,
  subcategorySlug,
  activeFiltersCount,
  isDatabaseSource = false,
  isDatabaseUnavailable = false,
  onResetHref = "/search",
}: EmptyStateProps) {
  const displayTitle = isDatabaseUnavailable
    ? "Catalogue Temporarily Unavailable"
    : title || "No Spare Parts Found";

  const defaultMessage = isDatabaseUnavailable
    ? "The parts catalogue is currently undergoing scheduled maintenance or experiencing temporary connectivity. Please retry your request shortly."
    : query
    ? `We could not find any spare parts matching "${query}". Check spelling, remove specific brand or vehicle filters, or search by OEM part code.`
    : subcategorySlug
    ? `No parts match your selected filters in this section. Try broadening your criteria.`
    : categorySlug
    ? `No parts match your selected filters in this category. Try broadening your criteria.`
    : "No parts match your selected filters. Try broadening your criteria or clearing active brand and price constraints.";

  return (
    <div className="rounded-2xl bg-white border border-gray-200/90 shadow-sm p-8 sm:p-12 text-center max-w-lg mx-auto my-10">
      <div className="w-14 h-14 rounded-full bg-ember/10 border border-ember/20 flex items-center justify-center mx-auto mb-4 text-ember">
        <Search className="w-6 h-6" />
      </div>

      <h3 className="text-lg font-black text-gray-900 tracking-tight mb-2">{displayTitle}</h3>

      <p className="text-xs text-gray-500 leading-relaxed mb-6">
        {message || defaultMessage}
      </p>

      {/* Database vs Demo Source Notice */}
      <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 mb-6 text-left flex items-start gap-2">
        <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <span className="text-[11px] text-gray-600">
          {isDatabaseUnavailable
            ? "Service Notice: Database catalogue service is currently disconnected or failing closed. Internal diagnostic details are suppressed for security."
            : isDatabaseSource
            ? "Live PostgreSQL Catalogue: Zero matching inventory records currently registered in database for this query."
            : "Catalogue Status: Real inventory records will populate from PostgreSQL once database migrations are initialized in production."}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link
          href={onResetHref}
          className="w-full sm:w-auto btn-primary py-2.5 px-4 text-xs font-semibold inline-flex items-center justify-center gap-1.5 rounded-xl"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{activeFiltersCount && activeFiltersCount > 0 ? `Reset ${activeFiltersCount} Filters` : "Reset All Filters"}</span>
        </Link>
        <Link
          href="/categories"
          className="w-full sm:w-auto btn-secondary py-2.5 px-4 text-xs font-semibold inline-flex items-center justify-center gap-1.5 rounded-xl"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Browse All Categories</span>
        </Link>
      </div>
    </div>
  );
}
