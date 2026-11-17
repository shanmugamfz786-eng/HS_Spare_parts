import React from "react";
import Link from "next/link";
import { Search, RotateCcw, ArrowLeft, Info } from "lucide-react";

interface EmptyStateProps {
  title?: string;
  message?: string;
  query?: string;
  isDatabaseSource?: boolean;
  isDatabaseUnavailable?: boolean;
  onResetHref?: string;
}

export function EmptyState({
  title,
  message,
  query,
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
    : "No parts match your selected filters. Try broadening your criteria or clearing active brand and price constraints.";

  return (
    <div className="rounded-card bg-ink-raised border border-gray-800 p-8 sm:p-12 text-center max-w-lg mx-auto my-10">
      <div className="w-14 h-14 rounded-full bg-ink border border-gray-700 flex items-center justify-center mx-auto mb-4 text-gray-400">
        <Search className="w-6 h-6 text-ember" />
      </div>

      <h3 className="text-lg font-black text-paper tracking-tight mb-2">{displayTitle}</h3>

      <p className="text-xs text-gray-400 leading-relaxed mb-6">
        {message || defaultMessage}
      </p>

      {/* Database vs Demo Source Notice */}
      <div className="rounded-brand bg-ink border border-gray-800 p-3 mb-6 text-left flex items-start gap-2">
        <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <span className="text-[11px] text-gray-400">
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
          className="w-full sm:w-auto btn-primary py-2 px-4 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset All Filters</span>
        </Link>
        <Link
          href="/categories"
          className="w-full sm:w-auto btn-secondary py-2 px-4 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Browse All Categories</span>
        </Link>
      </div>
    </div>
  );
}
