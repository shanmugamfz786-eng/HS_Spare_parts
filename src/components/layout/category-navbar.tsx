"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, Sparkles } from "lucide-react";
import { NAVBAR_CATEGORIES } from "@/lib/constants/navigation";

export function CategoryNavbar() {
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveDropdown(null);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleMouseEnter = (id: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setActiveDropdown(id);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setActiveDropdown(null);
    }, 150);
  };

  const toggleDropdown = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    setActiveDropdown((prev) => (prev === id ? null : id));
  };

  return (
    <nav
      ref={navRef}
      className="bg-ink border-b border-gray-800 text-paper text-sm relative z-40 hidden lg:block"
      aria-label="Primary Spare Parts Categories"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ul className="flex items-center justify-between gap-1 overflow-x-visible py-0">
          {NAVBAR_CATEGORIES.map((category) => {
            const hasSubcategories = category.subcategories && category.subcategories.length > 0;
            const isOpen = activeDropdown === category.id;

            // Stock Clearance is a direct badge (non-clickable, no external reference navigation)
            if (category.isDirectLink) {
              return (
                <li key={category.id} className="relative py-2.5">
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 font-bold text-xs uppercase tracking-wider rounded-brand bg-gradient-to-r from-ember to-amber-500 text-paper shadow-sm select-none cursor-default"
                    title="Stock Clearance (In-Store Warehouse Deals)"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                    <span>{category.name}</span>
                  </span>
                </li>
              );
            }

            return (
              <li
                key={category.id}
                className="relative py-2.5"
                onMouseEnter={() => handleMouseEnter(category.id)}
                onMouseLeave={handleMouseLeave}
              >
                <div className="flex items-center">
                  <Link
                    href={category.href}
                    prefetch={true}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-brand transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember ${
                      isOpen
                        ? "text-ember bg-ink-raised"
                        : "text-gray-300 hover:text-paper hover:bg-ink-raised/60"
                    }`}
                  >
                    <span>{category.name}</span>
                  </Link>
                  {hasSubcategories && (
                    <button
                      type="button"
                      onClick={(e) => toggleDropdown(category.id, e)}
                      aria-expanded={isOpen}
                      aria-haspopup="true"
                      aria-label={`Toggle ${category.name} submenu`}
                      className="p-1 -ml-1 text-gray-400 hover:text-ember focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember rounded"
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${
                          isOpen ? "rotate-180 text-ember" : ""
                        }`}
                      />
                    </button>
                  )}
                </div>

                {/* Dropdown Panel */}
                {hasSubcategories && isOpen && (
                  <div
                    className="absolute top-full left-0 mt-0.5 min-w-[280px] max-w-sm max-h-[480px] overflow-y-auto bg-paper text-charcoal rounded-card border border-border shadow-dropdown py-2 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                    role="menu"
                    aria-label={`${category.name} subcategories`}
                  >
                    <div className="px-4 py-2 border-b border-border bg-mist flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-charcoal">
                        {category.name}
                      </span>
                      <Link
                        href={category.href}
                        onClick={() => setActiveDropdown(null)}
                        className="text-[11px] font-semibold text-ember hover:text-ember-deep hover:underline"
                      >
                        View All
                      </Link>
                    </div>
                    <ul className="py-1">
                      {category.subcategories.map((sub) => (
                        <li key={sub.slug} role="none">
                          <Link
                            href={`/categories/${category.slug}/${sub.slug}`}
                            role="menuitem"
                            prefetch={true}
                            onClick={() => setActiveDropdown(null)}
                            className="block px-4 py-2 text-xs font-medium text-charcoal hover:bg-mist hover:text-ember transition-colors focus-visible:outline-none focus-visible:bg-mist focus-visible:text-ember"
                          >
                            {sub.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
