import React from "react";
import { Sparkles, ExternalLink, ShieldCheck, PhoneCall } from "lucide-react";

export function PromotionalBanner() {
  return (
    <section className="py-12 bg-ink-raised border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 1: Stock Clearance Special Offer */}
          <div className="rounded-card bg-gradient-to-br from-amber-950/40 via-ink to-ink border border-amber-500/30 p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden group shadow-lg">
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -z-10" />

            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold uppercase tracking-wider mb-3">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>Special Clearance Deal</span>
              </div>

              <h3 className="text-xl sm:text-2xl font-black text-paper tracking-tight mb-2">
                Up to 40% Off on Warehouse Stock Clearance
              </h3>

              <p className="text-xs sm:text-sm text-gray-300 leading-relaxed mb-6">
                Direct access to limited-quantity genuine suspension struts, brake rotors, and electrical spares. Available while supplies last.
              </p>
            </div>

            <div className="pt-2">
              <a
                href="https://www.motrparts.com/special-offer/stock-clearance/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-brand bg-gradient-to-r from-ember to-amber-500 hover:from-ember-deep hover:to-ember text-paper font-bold text-xs uppercase tracking-wider shadow-md transition-all transform hover:scale-105"
              >
                <span>Shop Stock Clearance</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Card 2: WhatsApp Fitment Specialist Assistance */}
          <div className="rounded-card bg-gradient-to-br from-emerald-950/40 via-ink to-ink border border-whatsapp/30 p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden group shadow-lg">
            <div className="absolute top-0 right-0 w-64 h-64 bg-whatsapp/10 rounded-full blur-3xl pointer-events-none -z-10" />

            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-whatsapp/20 text-whatsapp border border-whatsapp/30 text-xs font-bold uppercase tracking-wider mb-3">
                <ShieldCheck className="w-3.5 h-3.5 text-whatsapp" />
                <span>Expert Fitment Assurance</span>
              </div>

              <h3 className="text-xl sm:text-2xl font-black text-paper tracking-tight mb-2">
                Unsure About Compatibility? Ask Our Auto Specialists
              </h3>

              <p className="text-xs sm:text-sm text-gray-300 leading-relaxed mb-6">
                Technical specialists can verify chassis VIN numbers and OEM cross-references directly over WhatsApp once the official support channel is launched.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-brand bg-ink-raised border border-gray-800 text-gray-400 font-bold text-xs uppercase tracking-wider cursor-not-allowed shadow-none"
                title="WhatsApp action disabled until business owner provides official number."
              >
                <PhoneCall className="w-4 h-4 text-gray-500" />
                <span>WhatsApp Channel (Pending Setup)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
