import React from "react";
import Link from "next/link";
import { ShieldCheck, Truck, RotateCcw, Sparkles } from "lucide-react";
import { VehicleSelector } from "./vehicle-selector";

export function HeroSection() {
  return (
    <section className="relative bg-ink overflow-hidden pt-8 pb-16 sm:pt-12 sm:pb-24 border-b border-gray-800">
      {/* Background Subtle Radial Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-b from-ember/15 via-ember/5 to-transparent blur-3xl pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Badges & Tagline */}
        <div className="text-center max-w-3xl mx-auto mb-8 sm:mb-12">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-pill bg-ember/10 border border-ember/30 text-ember text-xs font-bold uppercase tracking-wider mb-4 animate-in fade-in duration-300">
            <Sparkles className="w-3.5 h-3.5 text-ember" />
            <span>India&apos;s Trusted Automotive Spares Specialist</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-paper mb-4 leading-tight sm:leading-none">
            Right Part. Right Price. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-ember via-amber-400 to-ember">
              Guaranteed Fitment.
            </span>
          </h1>

          <p className="text-sm sm:text-base lg:text-lg text-gray-300 max-w-2xl mx-auto leading-relaxed">
            Find certified replacement parts for your car. Sourced directly from tier-1 OEM & OES manufacturers with express pan-India doorstep dispatch.
          </p>

          {/* Quick Value Pillars */}
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mt-6 text-xs text-gray-300">
            <span className="inline-flex items-center gap-1.5 bg-ink-raised/60 px-3 py-1.5 rounded-brand border border-gray-800">
              <ShieldCheck className="w-4 h-4 text-ember" />
              <span>100% Genuine OES Spares</span>
            </span>
            <span className="inline-flex items-center gap-1.5 bg-ink-raised/60 px-3 py-1.5 rounded-brand border border-gray-800">
              <Truck className="w-4 h-4 text-ember" />
              <span>Express Pan-India Delivery</span>
            </span>
            <span className="inline-flex items-center gap-1.5 bg-ink-raised/60 px-3 py-1.5 rounded-brand border border-gray-800">
              <RotateCcw className="w-4 h-4 text-ember" />
              <span>10-Day Hassle-Free Returns</span>
            </span>
          </div>
        </div>

        {/* Flagship Vehicle Selector Form */}
        <div className="max-w-4xl mx-auto">
          <VehicleSelector />
        </div>

        {/* Quick Links below hero */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs text-gray-400">
          <span className="font-semibold text-gray-400">Popular Quick Searches:</span>
          <Link
            href="/categories/brake/brake-pads"
            className="hover:text-ember underline underline-offset-4 decoration-gray-700 hover:decoration-ember transition-colors"
          >
            Brake Pads
          </Link>
          <span>•</span>
          <Link
            href="/categories/suspension-steering/struts-and-shock-absorbers"
            className="hover:text-ember underline underline-offset-4 decoration-gray-700 hover:decoration-ember transition-colors"
          >
            Shock Absorbers
          </Link>
          <span>•</span>
          <Link
            href="/categories/transmission/clutch-set"
            className="hover:text-ember underline underline-offset-4 decoration-gray-700 hover:decoration-ember transition-colors"
          >
            Clutch Sets
          </Link>
          <span>•</span>
          <Link
            href="/categories/hvac/radiator"
            className="hover:text-ember underline underline-offset-4 decoration-gray-700 hover:decoration-ember transition-colors"
          >
            Radiators
          </Link>
          <span>•</span>
          <a
            href="https://www.motrparts.com/special-offer/stock-clearance/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 font-bold hover:underline"
          >
            Stock Clearance Offers →
          </a>
        </div>
      </div>
    </section>
  );
}
