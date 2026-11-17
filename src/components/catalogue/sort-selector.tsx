"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown } from "lucide-react";
import { SORT_OPTIONS, type SortOption } from "@/features/catalogue/schemas";

const SORT_LABELS: Record<SortOption, string> = {
  relevance: "Relevance",
  price_asc: "Price: Low to High",
  price_desc: "Price: High to Low",
  newest: "Newest Arrivals",
};

interface SortSelectorProps {
  currentSort?: SortOption;
  basePath?: string;
}

export function SortSelector({ currentSort = "relevance", basePath }: SortSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleSortChange(newSort: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", newSort);
    params.delete("page"); // reset page on sort change

    const path = basePath || window.location.pathname;
    router.push(`${path}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="catalogue-sort"
        className="text-xs text-gray-400 font-medium flex items-center gap-1 cursor-pointer"
      >
        <ArrowUpDown className="w-3.5 h-3.5 text-ember" />
        <span className="hidden sm:inline">Sort:</span>
      </label>
      <select
        id="catalogue-sort"
        value={currentSort}
        onChange={(e) => handleSortChange(e.target.value)}
        className="bg-ink-raised border border-gray-700 text-paper text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember cursor-pointer"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {SORT_LABELS[opt]}
          </option>
        ))}
      </select>
    </div>
  );
}
