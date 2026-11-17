"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  X,
  ChevronDown,
  Sparkles,
  ExternalLink,
  Search,
  Truck,
  Heart,
  User,
  PhoneCall,
  ShieldCheck,
} from "lucide-react";
import { NAVBAR_CATEGORIES } from "@/lib/constants/navigation";

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileNav({ isOpen, onClose }: MobileNavProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const toggleCategory = (id: string) => {
    setExpandedCategory((prev) => (prev === id ? null : id));
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onClose();
      window.location.href = `/search?q=${encodeURIComponent(searchQuery.trim())}`;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Mobile Navigation">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div className="fixed inset-y-0 left-0 max-w-xs w-full bg-ink border-r border-gray-800 shadow-2xl flex flex-col z-50 animate-in slide-in-from-left duration-250">
        {/* Drawer Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-ink-raised">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-brand bg-ember flex items-center justify-center font-black text-sm text-paper">
              HS
            </div>
            <div>
              <span className="font-extrabold text-sm tracking-tight text-paper block">
                HS SPARE PARTS
              </span>
              <span className="text-[10px] text-ember font-medium uppercase tracking-wider block">
                Right Part. Right Price.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-brand text-gray-400 hover:text-paper hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember"
            aria-label="Close navigation menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile Search */}
        <div className="p-4 border-b border-gray-800 bg-ink">
          <form onSubmit={handleSearchSubmit} className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search part name, OEM, or SKU..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-ink-raised border border-gray-700 rounded-brand text-paper placeholder-gray-400 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember"
            />
            <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          </form>
        </div>

        {/* Categories Navigation */}
        <div className="flex-1 overflow-y-auto px-2 py-4 divide-y divide-gray-800/60">
          <div className="pb-3">
            <span className="px-3 text-[11px] font-bold uppercase tracking-wider text-gray-400 block mb-2">
              Parts Categories
            </span>
            <ul className="space-y-1">
              {NAVBAR_CATEGORIES.map((category) => {
                const hasSub = category.subcategories && category.subcategories.length > 0;
                const isExpanded = expandedCategory === category.id;

                if (category.isDirectLink) {
                  return (
                    <li key={category.id}>
                      <a
                        href={category.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-brand text-amber-400 bg-ember/10 hover:bg-ember/20 transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                          <span>{category.name}</span>
                        </span>
                        <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                      </a>
                    </li>
                  );
                }

                return (
                  <li key={category.id} className="rounded-brand overflow-hidden">
                    <div className="flex items-center justify-between hover:bg-ink-raised rounded-brand">
                      <Link
                        href={category.href}
                        onClick={onClose}
                        className="flex-1 px-3 py-2 text-xs font-medium text-gray-200 hover:text-ember transition-colors"
                      >
                        {category.name}
                      </Link>
                      {hasSub && (
                        <button
                          type="button"
                          onClick={() => toggleCategory(category.id)}
                          aria-expanded={isExpanded}
                          aria-label={`Expand ${category.name} subcategories`}
                          className="p-2 text-gray-400 hover:text-ember focus-visible:outline-none"
                        >
                          <ChevronDown
                            className={`w-4 h-4 transition-transform duration-200 ${
                              isExpanded ? "rotate-180 text-ember" : ""
                            }`}
                          />
                        </button>
                      )}
                    </div>

                    {/* Submenu Accordion */}
                    {hasSub && isExpanded && (
                      <ul className="pl-4 pr-2 py-1 space-y-0.5 bg-ink-raised/50 border-l border-ember/30 ml-3 my-1">
                        {category.subcategories.map((sub) => (
                          <li key={sub.slug}>
                            <Link
                              href={`/categories/${category.slug}/${sub.slug}`}
                              onClick={onClose}
                              className="block py-1.5 px-2 text-[11px] text-gray-400 hover:text-paper hover:bg-ink-raised rounded transition-colors"
                            >
                              {sub.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Customer Support & Quick Links */}
          <div className="pt-3 px-3 space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block mb-2">
              Customer Services
            </span>
            <Link
              href="/track-order"
              onClick={onClose}
              className="flex items-center gap-2.5 py-1.5 text-xs text-gray-300 hover:text-ember transition-colors"
            >
              <Truck className="w-4 h-4 text-ember" />
              <span>Track Your Order</span>
            </Link>
            <Link
              href="/wishlist"
              onClick={onClose}
              className="flex items-center gap-2.5 py-1.5 text-xs text-gray-300 hover:text-ember transition-colors"
            >
              <Heart className="w-4 h-4 text-ember" />
              <span>Saved Wishlist</span>
            </Link>
            <Link
              href="/account"
              onClick={onClose}
              className="flex items-center gap-2.5 py-1.5 text-xs text-gray-300 hover:text-ember transition-colors"
            >
              <User className="w-4 h-4 text-ember" />
              <span>Customer Account / Sign In</span>
            </Link>
            <span
              className="flex items-center gap-2.5 py-2 px-3 rounded-brand bg-ink-raised border border-gray-800 text-gray-400 font-semibold text-xs cursor-default"
              title="WhatsApp channel disabled until official business number is configured."
            >
              <PhoneCall className="w-4 h-4 text-gray-500" />
              <span>WhatsApp (Awaiting Configuration)</span>
            </span>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-gray-800 bg-ink-raised text-[11px] text-gray-400 flex items-center justify-between">
          <div className="flex items-center gap-1 text-ember">
            <ShieldCheck className="w-4 h-4" />
            <span>OES Quality Standards (Demo Layout)</span>
          </div>
          <span>v0.1.0</span>
        </div>
      </div>
    </div>
  );
}
