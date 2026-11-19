import React from "react";
import Link from "next/link";
import { Sparkles, ArrowRight, ShieldCheck, PhoneCall } from "lucide-react";

export function PromotionalBanner() {
  return (
    <section className="py-12 bg-white border-b border-gray-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 1: Promotional Clearance Showcase */}
          <div className="rounded-2xl bg-gradient-to-br from-[#090D18] via-[#111827] to-[#090D18] text-white border border-gray-800 p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden group shadow-lg">
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -z-10" />

            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold uppercase tracking-wider mb-3">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Featured Catalogue Spares</span>
              </div>

              <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-2">
                Explore Replacement Spares &amp; Maintenance Components
              </h3>

              <p className="text-xs sm:text-sm text-gray-300 leading-relaxed mb-6">
                Direct access to high-demand replacement parts for suspension, braking, filtration, and lighting systems across top Indian vehicle brands.
              </p>
            </div>

            <div className="pt-2">
              <Link
                href="/categories"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-ember to-amber-500 hover:from-ember-deep hover:to-ember text-white font-bold text-xs uppercase tracking-wider shadow-md transition-all"
              >
                <span>Browse All Categories</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Card 2: Fitment Compatibility Guidance */}
          <div className="rounded-2xl bg-gradient-to-br from-[#0B1528] via-[#090D18] to-[#0B1528] text-white border border-gray-800 p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden group shadow-lg">
            <div className="absolute top-0 right-0 w-64 h-64 bg-ember/10 rounded-full blur-3xl pointer-events-none -z-10" />

            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 text-xs font-bold uppercase tracking-wider mb-3">
                <ShieldCheck className="w-3.5 h-3.5 text-ember" />
                <span>Fitment Assistance</span>
              </div>

              <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-2">
                Need Help Confirming Vehicle Fitment?
              </h3>

              <p className="text-xs sm:text-sm text-gray-300 leading-relaxed mb-6">
                Consult our vehicle selector tool by Make, Model, and Year, or review manufacturer OEM part numbers before purchasing to confirm compatibility.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-gray-500 font-bold text-xs uppercase tracking-wider cursor-not-allowed shadow-none"
                title="WhatsApp support channel is disabled pending official business configuration."
              >
                <PhoneCall className="w-4 h-4 text-gray-600" />
                <span>WhatsApp Channel (Disabled)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
