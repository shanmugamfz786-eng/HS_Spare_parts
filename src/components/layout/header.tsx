"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Search,
  ShoppingCart,
  Heart,
  User,
  Truck,
  Menu,
  PhoneCall,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import { CategoryNavbar } from "./category-navbar";
import { MobileNav } from "./mobile-nav";
import { STORE_CONTACT_CONFIG, STORE_POLICY_CONFIG } from "@/lib/constants/store-config";

export function Header() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/search?q=${encodeURIComponent(searchQuery.trim())}`;
    }
  };

  return (
    <header className="w-full bg-ink-raised border-b border-gray-800 sticky top-0 z-40">
      {/* Top Utility Announcement Bar */}
      <div className="bg-ink border-b border-gray-800 text-xs py-1.5 px-4 sm:px-6 lg:px-8 text-gray-400">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="hidden sm:flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-gray-300">
              <ShieldCheck className="w-3.5 h-3.5 text-ember" />
              <span>OEM &amp; OES Parts Standards</span>
            </span>
            <span className="text-gray-700">|</span>
            <span className="flex items-center gap-1.5 text-gray-300">
              <RotateCcw className="w-3.5 h-3.5 text-ember" />
              <span>{STORE_POLICY_CONFIG.returnPolicyNote}</span>
            </span>
            <span className="text-gray-700">|</span>
            <span className="flex items-center gap-1.5 text-gray-300">
              <Truck className="w-3.5 h-3.5 text-ember" />
              <span>{STORE_POLICY_CONFIG.shippingClaim}</span>
            </span>
          </div>

          <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-4">
            {STORE_CONTACT_CONFIG.isWhatsAppEnabled && STORE_CONTACT_CONFIG.socialLinks.whatsapp ? (
              <a
                href={STORE_CONTACT_CONFIG.socialLinks.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-whatsapp hover:text-whatsapp/90 font-medium transition-colors"
              >
                <PhoneCall className="w-3 h-3" />
                <span>{STORE_CONTACT_CONFIG.whatsappDisplay}</span>
              </a>
            ) : (
              <span
                className="inline-flex items-center gap-1 text-gray-400 font-medium text-xs cursor-default"
                title="WhatsApp support disabled until official business number is configured."
              >
                <PhoneCall className="w-3 h-3 text-gray-500" />
                <span>{STORE_CONTACT_CONFIG.whatsappDisplay}</span>
              </span>
            )}
            <span className="text-gray-700 hidden sm:inline">|</span>
            <Link
              href="/track-order"
              className="text-gray-300 hover:text-ember transition-colors hidden sm:inline"
            >
              Track Order
            </Link>
            <span className="text-gray-700 hidden sm:inline">|</span>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 text-ember hover:text-amber-400 font-bold text-xs transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-ember" />
              <span>Admin Portal</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Brand & Search Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="flex items-center justify-between gap-4 sm:gap-8">
          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="p-2 rounded-brand text-gray-300 hover:text-paper hover:bg-gray-800 lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember"
            aria-label="Open navigation menu"
          >
            <Menu className="w-6 h-6" />
          </button>

          {/* Brand Identity */}
          <Link href="/" className="flex items-center space-x-3 group flex-shrink-0">
            <div className="w-10 h-10 rounded-brand bg-gradient-to-br from-ember to-ember-deep flex items-center justify-center font-black text-xl text-paper tracking-wider shadow-md group-hover:scale-105 transition-transform">
              HS
            </div>
            <div>
              <span className="font-extrabold text-lg sm:text-xl tracking-tight text-paper block group-hover:text-gray-100 transition-colors">
                {STORE_CONTACT_CONFIG.companyName.toUpperCase()}
              </span>
              <span className="text-[11px] text-ember font-semibold uppercase tracking-widest block">
                {STORE_CONTACT_CONFIG.tagline}
              </span>
            </div>
          </Link>

          {/* Search Bar UI */}
          <div className="flex-1 max-w-2xl hidden md:block">
            <form onSubmit={handleSearchSubmit} className="relative flex items-center">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by part name, brand, SKU or OEM number (e.g. Brembo pads, Swift shocker)..."
                className="w-full pl-4 pr-24 py-2.5 text-xs sm:text-sm bg-ink border border-gray-700 rounded-brand text-paper placeholder-gray-400 focus:outline-none focus:border-ember focus:ring-1 focus:ring-ember transition-colors shadow-inner"
              />
              <button
                type="submit"
                className="absolute right-1 px-4 py-1.5 bg-ember hover:bg-ember-deep text-paper font-semibold text-xs rounded-brand inline-flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember"
                aria-label="Submit search"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Search</span>
              </button>
            </form>
          </div>

          {/* Customer Action Links & Cart */}
          <div className="flex items-center space-x-1 sm:space-x-3">
            {/* Track Order - Desktop shortcut */}
            <Link
              href="/track-order"
              className="hidden xl:inline-flex flex-col items-center p-2 text-gray-300 hover:text-ember transition-colors text-xs"
              title="Track shipment status"
            >
              <Truck className="w-5 h-5 mb-0.5 text-gray-400" />
              <span>Track</span>
            </Link>

            {/* Wishlist Icon */}
            <Link
              href="/wishlist"
              className="relative p-2 text-gray-300 hover:text-ember transition-colors rounded-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember"
              aria-label="View Saved Wishlist"
            >
              <Heart className="w-5 h-5" />
              <span className="sr-only">Wishlist</span>
            </Link>

            {/* Account Icon */}
            <Link
              href="/account"
              className="flex items-center gap-2 p-2 text-gray-300 hover:text-ember transition-colors rounded-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember"
              aria-label="Customer Account"
            >
              <User className="w-5 h-5" />
              <span className="hidden lg:inline text-xs font-medium">Account</span>
            </Link>

            {/* Cart Icon with Item Counter */}
            <Link
              href="/cart"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-brand bg-ink border border-gray-700 hover:border-ember transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember"
              aria-label="Shopping Cart"
            >
              <div className="relative">
                <ShoppingCart className="w-5 h-5 text-ember group-hover:scale-105 transition-transform" />
                <span className="absolute -top-2 -right-2.5 w-4 h-4 rounded-full bg-ember text-paper font-bold text-[10px] flex items-center justify-center">
                  0
                </span>
              </div>
              <span className="hidden sm:inline text-xs font-semibold text-paper">
                ₹0.00
              </span>
            </Link>
          </div>
        </div>

        {/* Mobile Search Input (Visible on small screens) */}
        <div className="mt-3 md:hidden">
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search part, brand, OEM..."
              className="w-full pl-3 pr-20 py-2 text-xs bg-ink border border-gray-700 rounded-brand text-paper placeholder-gray-400 focus:outline-none focus:border-ember"
            />
            <button
              type="submit"
              className="absolute right-1 px-3 py-1 bg-ember text-paper text-xs font-medium rounded-brand"
            >
              Search
            </button>
          </form>
        </div>
      </div>

      {/* Main Horizontal Category Navigation */}
      <CategoryNavbar />

      {/* Mobile Navigation Drawer */}
      <MobileNav isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
    </header>
  );
}
