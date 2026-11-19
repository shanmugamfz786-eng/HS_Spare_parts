import React from "react";
import Link from "next/link";
import { NAVBAR_CATEGORIES } from "@/lib/constants/navigation";
import { Sparkles, ArrowRight } from "lucide-react";

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
        <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">
          Browse All Spare Parts Categories
        </h1>
        <p className="text-sm text-gray-500 mt-2 max-w-2xl leading-relaxed">
          Explore complete mechanical, electrical, cooling, and body replacement parts organized by vehicle assembly systems.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
        {NAVBAR_CATEGORIES.map((cat) => {
          if (cat.isDirectLink) {
            return (
              <div
                key={cat.id}
                className="rounded-2xl bg-gradient-to-br from-[#090D18] via-[#111827] to-[#090D18] text-white border border-gray-800 p-6 flex flex-col justify-between shadow-md"
              >
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-ember text-white text-xs font-bold uppercase tracking-wider mb-3 shadow-xs">
                    <Sparkles className="w-3.5 h-3.5 text-amber-200 animate-pulse" />
                    <span>Special Deals</span>
                  </div>
                  <h2 className="text-xl font-bold text-white mb-2">{cat.name}</h2>
                  <p className="text-xs text-gray-300 leading-relaxed mb-6">
                    Direct access to warehouse stock clearance items and limited-quantity discount spare parts.
                  </p>
                </div>
                <div
                  className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gray-800/80 border border-gray-700 text-gray-400 text-xs font-bold uppercase tracking-wider cursor-default select-none shadow-sm"
                >
                  <span>In-Warehouse Clearance Deals</span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={cat.id}
              className="rounded-2xl bg-white border border-gray-200/90 p-6 flex flex-col justify-between shadow-sm hover:shadow-xl hover:border-ember transition-all group"
            >
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center justify-between">
                  <Link
                    href={cat.href}
                    className="group-hover:text-ember transition-colors"
                  >
                    {cat.name}
                  </Link>
                  <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full">
                    {cat.subcategories.length} parts
                  </span>
                </h2>

                <ul className="space-y-1.5 mb-6 text-xs text-gray-500">
                  {cat.subcategories.map((sub) => (
                    <li key={sub.slug}>
                      <Link
                        href={`/categories/${cat.slug}/${sub.slug}`}
                        className="hover:text-ember hover:underline transition-colors block py-0.5"
                      >
                        • {sub.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <Link
                  href={cat.href}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-ember hover:text-ember-deep transition-colors"
                >
                  <span>View All {cat.name}</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
