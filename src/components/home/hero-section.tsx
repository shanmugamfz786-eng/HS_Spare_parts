import React from "react";
import Link from "next/link";
import { ArrowRight, Layers } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative bg-[#090D18] overflow-hidden pt-10 pb-16 sm:pt-14 sm:pb-20 lg:pt-16 lg:pb-24 border-b border-gray-800 text-white">
      {/* Automotive Ambient Lighting & Radial Glow */}
      <div className="absolute top-1/4 right-1/4 w-[600px] h-[450px] bg-gradient-to-br from-ember/20 via-ember/5 to-transparent blur-[120px] pointer-events-none -z-10" />
      <div className="absolute -bottom-10 left-1/3 w-[500px] h-[350px] bg-gradient-to-tr from-amber-500/10 via-transparent to-transparent blur-[100px] pointer-events-none -z-10" />

      {/* Subtle Engineered Grid Pattern */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none -z-10"
        style={{
          backgroundImage: "radial-gradient(#F45A1B 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-8 items-center min-h-[380px] sm:min-h-[420px] lg:min-h-[440px]">
          {/* Left Column: ~45% (5 cols on lg) */}
          <div className="lg:col-span-5 text-center lg:text-left z-20 flex flex-col justify-center">
            {/* Eyebrow Label */}
            <div className="inline-flex items-center gap-2 self-center lg:self-start px-3 py-1 rounded-md bg-ember/15 border border-ember/30 text-ember text-[11px] sm:text-xs font-black tracking-widest uppercase mb-4 sm:mb-5">
              <span>NEW &amp; PRE-OWNED SPARE PARTS</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight text-white mb-4 leading-[1.08]">
              Find the Right Part. <br />
              <span className="text-ember italic">
                New or Pre-Owned.
              </span>
            </h1>

            {/* Supporting Text */}
            <p className="text-sm sm:text-base lg:text-lg text-gray-300 max-w-lg mx-auto lg:mx-0 leading-relaxed mb-8 font-normal">
              Explore automotive spare parts for your vehicle, with new and pre-owned options in one place.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3.5 sm:gap-4">
              <Link
                href="/search"
                className="btn-primary px-8 py-3.5 text-sm font-bold flex items-center justify-center gap-2 rounded-xl shadow-lg shadow-ember/30 hover:shadow-ember/50 hover:bg-ember-deep transition-all"
              >
                <span>Shop Parts</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/categories"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 text-sm font-bold rounded-xl bg-white/5 hover:bg-white/10 text-white border border-gray-700/80 hover:border-gray-500 transition-all shadow-sm"
              >
                <Layers className="w-4 h-4 text-ember" />
                <span>Explore Categories</span>
              </Link>
            </div>
          </div>

          {/* Right Column: ~55% (7 cols on lg) - Immersive Edge-Blended Automotive Visual */}
          <div className="lg:col-span-7 relative w-full flex items-center justify-center lg:justify-end mt-4 lg:mt-0">
            {/* Showroom Ambient Warmth Glow behind car */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] h-[75%] bg-ember/15 blur-[90px] rounded-full pointer-events-none" />

            <div className="relative w-full aspect-[16/10] sm:aspect-[16/9] max-h-[380px] sm:max-h-[440px] lg:max-h-[460px] overflow-hidden">
              {/* Seamless Edge Blends into #090D18 */}
              {/* Left Edge Gradient Blend (connects headline with car on desktop) */}
              <div className="hidden lg:block absolute inset-y-0 left-0 w-36 bg-gradient-to-r from-[#090D18] via-[#090D18]/70 to-transparent z-10 pointer-events-none" />
              {/* Top Edge Gradient Blend */}
              <div className="absolute inset-x-0 top-0 h-10 sm:h-16 bg-gradient-to-b from-[#090D18] via-[#090D18]/50 to-transparent z-10 pointer-events-none" />
              {/* Bottom Edge Gradient Blend */}
              <div className="absolute inset-x-0 bottom-0 h-12 sm:h-20 bg-gradient-to-t from-[#090D18] via-[#090D18]/60 to-transparent z-10 pointer-events-none" />
              {/* Right Edge Gradient Blend */}
              <div className="hidden sm:block absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#090D18] via-[#090D18]/40 to-transparent z-10 pointer-events-none" />

              {/* Realistic Red Performance Car Image */}
              <img
                src="/images/hero-car.jpg"
                alt="HS Spare Parts Premium Automotive Performance Sedan"
                className="w-full h-full object-cover lg:object-contain object-center lg:object-right-center select-none drop-shadow-[0_25px_40px_rgba(0,0,0,0.95)]"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
