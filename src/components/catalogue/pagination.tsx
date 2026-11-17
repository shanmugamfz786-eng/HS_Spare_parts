"use client";

import React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  basePath?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  basePath,
}: PaginationProps) {
  const searchParams = useSearchParams();

  if (totalPages <= 1) {
    return null;
  }

  function getPageUrl(pageNumber: number): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", pageNumber.toString());
    const path = basePath || (typeof window !== "undefined" ? window.location.pathname : "");
    return `${path}?${params.toString()}`;
  }

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);

  // Generate page numbers array with ellipsis
  const pageNumbers: (number | string)[] = [];
  const delta = 1;

  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 ||
      i === totalPages ||
      (i >= currentPage - delta && i <= currentPage + delta)
    ) {
      pageNumbers.push(i);
    } else if (
      pageNumbers[pageNumbers.length - 1] !== "..."
    ) {
      pageNumbers.push("...");
    }
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-gray-800 text-xs">
      <span className="text-gray-400">
        Showing <span className="text-paper font-semibold">{startItem}</span>–
        <span className="text-paper font-semibold">{endItem}</span> of{" "}
        <span className="text-paper font-semibold">{totalCount}</span> spare parts
      </span>

      <nav aria-label="Pagination" className="flex items-center gap-1.5">
        {/* Previous Page Link */}
        {currentPage > 1 ? (
          <Link
            href={getPageUrl(currentPage - 1)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-brand bg-ink-raised border border-gray-700 text-paper font-semibold hover:border-ember transition-colors"
            aria-label="Go to previous page"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Prev</span>
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-brand bg-ink border border-gray-800 text-gray-600 cursor-not-allowed">
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Prev</span>
          </span>
        )}

        {/* Page Numbers */}
        <div className="flex items-center gap-1">
          {pageNumbers.map((page, index) => {
            if (page === "...") {
              return (
                <span key={`ellipsis-${index}`} className="px-2 text-gray-500">
                  ...
                </span>
              );
            }

            const pNum = Number(page);
            const isCurrent = pNum === currentPage;

            return (
              <Link
                key={pNum}
                href={getPageUrl(pNum)}
                className={`min-w-[32px] h-8 flex items-center justify-center rounded-brand text-xs font-bold transition-colors ${
                  isCurrent
                    ? "bg-ember text-paper"
                    : "bg-ink-raised border border-gray-700 text-paper hover:border-ember"
                }`}
                aria-current={isCurrent ? "page" : undefined}
                aria-label={`Page ${pNum}`}
              >
                {pNum}
              </Link>
            );
          })}
        </div>

        {/* Next Page Link */}
        {currentPage < totalPages ? (
          <Link
            href={getPageUrl(currentPage + 1)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-brand bg-ink-raised border border-gray-700 text-paper font-semibold hover:border-ember transition-colors"
            aria-label="Go to next page"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-brand bg-ink border border-gray-800 text-gray-600 cursor-not-allowed">
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </span>
        )}
      </nav>
    </div>
  );
}
