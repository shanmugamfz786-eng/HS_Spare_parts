import React from "react";
import Link from "next/link";
import {
  Compass,
  Disc,
  Cog,
  Gauge,
  ThermometerSnowflake,
  Zap,
  Shield,
  Wrench,
  ArrowRight,
} from "lucide-react";

interface CategoryTile {
  name: string;
  slug: string;
  icon: React.ElementType;
  count: string;
  description: string;
  highlightedParts: string[];
}

const CATEGORY_TILES: CategoryTile[] = [
  {
    name: "Suspension & Steering",
    slug: "suspension-steering",
    icon: Compass,
    count: "4,200+ parts",
    description: "Shock absorbers, struts, control arms, tie rods, and stabilizer links for superior ride stability.",
    highlightedParts: ["Struts", "Control Arms", "Ball Joints", "Steering Racks"],
  },
  {
    name: "Brake Systems",
    slug: "brake",
    icon: Disc,
    count: "2,800+ parts",
    description: "Premium ceramic brake pads, vented disc rotors, brake shoes, master cylinders, and fluids.",
    highlightedParts: ["Brake Pads", "Disc Rotors", "Brake Shoes", "Cylinders"],
  },
  {
    name: "Engine Parts",
    slug: "engine-parts",
    icon: Cog,
    count: "6,500+ parts",
    description: "Oil, air & fuel filters, timing kits, gaskets, pistons, water pumps, and turbochargers.",
    highlightedParts: ["Service Filters", "Timing Kits", "Gaskets", "Fuel Pumps"],
  },
  {
    name: "Transmission",
    slug: "transmission",
    icon: Gauge,
    count: "1,900+ parts",
    description: "Complete clutch kits, flywheels, CSC release bearings, drive shafts, and wheel bearings.",
    highlightedParts: ["Clutch Sets", "Drive Shafts", "Flywheels", "Bearings"],
  },
  {
    name: "HVAC & Cooling",
    slug: "hvac",
    icon: ThermometerSnowflake,
    count: "1,600+ parts",
    description: "Radiators, AC compressors, condensers, cooling fans, intercoolers, and cabin air filters.",
    highlightedParts: ["Radiators", "Compressors", "Condensers", "Cooling Fans"],
  },
  {
    name: "Electrical Systems",
    slug: "electrical",
    icon: Zap,
    count: "3,400+ parts",
    description: "Alternators, starter motors, ignition coils, spark plugs, sensors, and power window switches.",
    highlightedParts: ["Spark Plugs", "Ignition Coils", "Alternators", "Sensors"],
  },
  {
    name: "Body Parts & Mirrors",
    slug: "body-parts",
    icon: Shield,
    count: "2,100+ parts",
    description: "Bumpers, fenders, headlights, tail lights, bonnets, door handles, and rear-view mirrors.",
    highlightedParts: ["Headlights", "Tail Lights", "Bumpers", "Mirrors"],
  },
  {
    name: "Accessories & Care",
    slug: "accessories",
    icon: Wrench,
    count: "950+ parts",
    description: "Aerodynamic wiper blades, car care compounds, cabin styling, and essential road trip utilities.",
    highlightedParts: ["Wipers", "Car Care", "Infotainment", "Holders"],
  },
];

export function FeaturedCategories() {
  return (
    <section className="py-16 bg-ink border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-ember block mb-2">
              Browse By System
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-paper tracking-tight">
              Shop by Popular Categories
            </h2>
            <p className="text-sm text-gray-400 mt-1 max-w-xl">
              Precision engineered spare parts catalogued by primary vehicle system. Certified fitment for all major passenger car makes.
            </p>
          </div>

          <Link
            href="/categories"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-ember hover:text-ember-deep transition-colors self-start md:self-auto"
          >
            <span>Explore All 8 Categories</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {CATEGORY_TILES.map((cat) => {
            const Icon = cat.icon;
            return (
              <Link
                key={cat.slug}
                href={`/categories/${cat.slug}`}
                className="group rounded-card bg-ink-raised border border-gray-800 p-5 hover:border-ember/60 transition-all hover:-translate-y-1 hover:shadow-xl flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-brand bg-ink border border-gray-700 text-ember flex items-center justify-center group-hover:bg-ember group-hover:text-paper group-hover:border-ember transition-all">
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-semibold text-gray-400 bg-ink px-2.5 py-1 rounded-pill border border-gray-800">
                      {cat.count}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-paper group-hover:text-ember transition-colors mb-1.5">
                    {cat.name}
                  </h3>

                  <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed mb-4">
                    {cat.description}
                  </p>
                </div>

                <div>
                  {/* Part Pills */}
                  <div className="flex flex-wrap gap-1.5 pt-3 border-t border-gray-800/80">
                    {cat.highlightedParts.map((part) => (
                      <span
                        key={part}
                        className="text-[10px] text-gray-300 bg-ink/80 px-2 py-0.5 rounded border border-gray-800"
                      >
                        {part}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
