import React from "react";
import Link from "next/link";
import { ArrowRight, Car } from "lucide-react";

interface BrandItem {
  name: string;
  queryParam: string;
  origin: string;
  partCount: string;
  badge: string;
}

const POPULAR_BRANDS: BrandItem[] = [
  { name: "Maruti Suzuki", queryParam: "Maruti Suzuki", origin: "Indo-Japanese", partCount: "5,400+ parts", badge: "MS" },
  { name: "Hyundai", queryParam: "Hyundai", origin: "South Korea", partCount: "4,200+ parts", badge: "HY" },
  { name: "Tata Motors", queryParam: "Tata", origin: "India", partCount: "3,800+ parts", badge: "TM" },
  { name: "Mahindra", queryParam: "Mahindra", origin: "India", partCount: "3,500+ parts", badge: "MH" },
  { name: "Toyota", queryParam: "Toyota", origin: "Japan", partCount: "3,200+ parts", badge: "TY" },
  { name: "Honda", queryParam: "Honda", origin: "Japan", partCount: "2,900+ parts", badge: "HD" },
  { name: "Ford", queryParam: "Ford", origin: "USA", partCount: "2,400+ parts", badge: "FD" },
  { name: "Kia", queryParam: "Kia", origin: "South Korea", partCount: "2,100+ parts", badge: "KA" },
  { name: "Volkswagen", queryParam: "Volkswagen", origin: "Germany", partCount: "2,600+ parts", badge: "VW" },
  { name: "Skoda", queryParam: "Skoda", origin: "Czech Republic", partCount: "2,200+ parts", badge: "SK" },
  { name: "BMW", queryParam: "BMW", origin: "Germany", partCount: "1,800+ parts", badge: "BM" },
  { name: "Mercedes-Benz", queryParam: "Mercedes-Benz", origin: "Germany", partCount: "1,600+ parts", badge: "MB" },
];

export function ShopByBrand() {
  return (
    <section className="py-14 sm:py-20 bg-white border-b border-gray-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-10 gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ember mb-2">
              <Car className="w-4 h-4 text-ember" />
              <span>Manufacturer Catalogues</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
              Shop by Car Brand
            </h2>
            <p className="text-sm text-gray-500 mt-1 max-w-xl">
              Precision-engineered replacement components calibrated for India&apos;s leading passenger vehicles.
            </p>
          </div>

          <Link
            href="/search"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-ember hover:text-ember-deep transition-colors group"
          >
            <span>View All Makes & Models</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {/* Brands Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {POPULAR_BRANDS.map((brand) => (
            <Link
              key={brand.name}
              href={`/search?make=${encodeURIComponent(brand.queryParam)}`}
              className="bg-[#F8F9FA] hover:bg-white rounded-xl border border-gray-200/90 hover:border-ember p-4 sm:p-5 flex flex-col items-center text-center shadow-xs hover:shadow-md transition-all duration-200 group"
            >
              {/* Brand Monogram Emblem */}
              <div className="w-14 h-14 rounded-full bg-white border border-gray-200 flex items-center justify-center font-black text-sm text-gray-800 shadow-inner group-hover:border-ember group-hover:bg-ember/5 group-hover:text-ember transition-all mb-3">
                {brand.badge}
              </div>

              {/* Brand Title */}
              <h3 className="font-bold text-xs sm:text-sm text-gray-900 group-hover:text-ember transition-colors leading-tight">
                {brand.name}
              </h3>

              {/* Part Count */}
              <span className="text-[11px] text-gray-500 font-medium mt-1">
                {brand.partCount}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
