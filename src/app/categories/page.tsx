import React from "react";
import Link from "next/link";
import { NAVBAR_CATEGORIES } from "@/lib/constants/navigation";
import { ExternalLink, Sparkles, ArrowRight } from "lucide-react";

export const metadata = {
  title: "All Spare Parts Categories",
  description: "Browse all automotive categories for passenger vehicles in India.",
};

export default function CategoriesPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10">
        <span className="text-xs font-bold uppercase tracking-wider text-ember block mb-2">
          Full Automotive Catalogue
        </span>
        <h1 className="text-3xl sm:text-4xl font-black text-paper tracking-tight">
          Browse All Spare Parts Categories
        </h1>
        <p className="text-sm text-gray-400 mt-2 max-w-2xl leading-relaxed">
          Explore complete mechanical, electrical, cooling, and body replacement parts organized by vehicle assembly systems.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {NAVBAR_CATEGORIES.map((cat) => {
          if (cat.isDirectLink) {
            return (
              <div
                key={cat.id}
                className="rounded-card bg-gradient-to-br from-ember/20 via-ink-raised to-ink-raised border border-ember/40 p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-ember text-paper text-xs font-bold uppercase tracking-wider mb-3">
                    <Sparkles className="w-3.5 h-3.5 text-amber-200 animate-pulse" />
                    <span>Special Deals</span>
                  </div>
                  <h2 className="text-xl font-bold text-paper mb-2">{cat.name}</h2>
                  <p className="text-xs text-gray-300 leading-relaxed mb-6">
                    Direct access to warehouse stock clearance items and limited-quantity discount spare parts.
                  </p>
                </div>
                <a
                  href={cat.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-brand bg-ember hover:bg-ember-deep text-paper text-xs font-bold uppercase tracking-wider transition-colors"
                >
                  <span>Visit Stock Clearance Deals</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            );
          }

          return (
            <div
              key={cat.id}
              className="rounded-card bg-ink-raised border border-gray-800 p-6 flex flex-col justify-between hover:border-ember/50 transition-colors"
            >
              <div>
                <h2 className="text-lg font-bold text-paper mb-4 flex items-center justify-between">
                  <Link
                    href={cat.href}
                    className="hover:text-ember transition-colors"
                  >
                    {cat.name}
                  </Link>
                  <span className="text-[11px] font-semibold text-gray-400 bg-ink px-2.5 py-0.5 rounded-pill border border-gray-800">
                    {cat.subcategories.length} subcategories
                  </span>
                </h2>

                <ul className="space-y-1.5 mb-6 text-xs text-gray-400">
                  {cat.subcategories.map((sub) => (
                    <li key={sub.slug}>
                      <Link
                        href={`/categories/${cat.slug}/${sub.slug}`}
                        className="hover:text-paper hover:underline transition-colors block py-0.5"
                      >
                        • {sub.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-4 border-t border-gray-800/80">
                <Link
                  href={cat.href}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-ember hover:text-ember-deep transition-colors"
                >
                  <span>View All {cat.name}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
