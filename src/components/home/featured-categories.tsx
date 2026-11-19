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
  Layers,
} from "lucide-react";

interface CategoryTile {
  name: string;
  slug: string;
  icon: React.ElementType;
  image: string;
  count: string;
  description: string;
  highlightedParts: string[];
}

const CATEGORY_TILES: CategoryTile[] = [
  {
    name: "Suspension & Steering",
    slug: "suspension-steering",
    icon: Compass,
    image: "/images/suspension.jpg",
    count: "4,200+ parts",
    description: "Shock absorbers, struts, control arms, tie rods, and stabilizer links for superior ride stability.",
    highlightedParts: ["Struts", "Control Arms", "Ball Joints", "Steering Racks"],
  },
  {
    name: "Brake Systems",
    slug: "brake",
    icon: Disc,
    image: "/images/brakes.jpg",
    count: "2,800+ parts",
    description: "Premium ceramic brake pads, vented disc rotors, brake shoes, master cylinders, and fluids.",
    highlightedParts: ["Brake Pads", "Disc Rotors", "Brake Shoes", "Cylinders"],
  },
  {
    name: "Engine Parts",
    slug: "engine-parts",
    icon: Cog,
    image: "/images/engine.jpg",
    count: "6,500+ parts",
    description: "Oil, air & fuel filters, timing kits, gaskets, pistons, water pumps, and turbochargers.",
    highlightedParts: ["Service Filters", "Timing Kits", "Gaskets", "Fuel Pumps"],
  },
  {
    name: "Transmission",
    slug: "transmission",
    icon: Gauge,
    image: "/images/transmission.jpg",
    count: "1,900+ parts",
    description: "Complete clutch kits, flywheels, CSC release bearings, drive shafts, and wheel bearings.",
    highlightedParts: ["Clutch Sets", "Drive Shafts", "Flywheels", "Bearings"],
  },
  {
    name: "HVAC & Cooling",
    slug: "hvac",
    icon: ThermometerSnowflake,
    image: "/images/cooling.jpg",
    count: "1,600+ parts",
    description: "Radiators, AC compressors, condensers, cooling fans, intercoolers, and cabin air filters.",
    highlightedParts: ["Radiators", "Compressors", "Condensers", "Cooling Fans"],
  },
  {
    name: "Electrical Systems",
    slug: "electrical",
    icon: Zap,
    image: "/images/electrical.jpg",
    count: "3,400+ parts",
    description: "Alternators, starter motors, ignition coils, spark plugs, sensors, and power window switches.",
    highlightedParts: ["Spark Plugs", "Ignition Coils", "Alternators", "Sensors"],
  },
  {
    name: "Body Parts & Mirrors",
    slug: "body-parts",
    icon: Shield,
    image: "/images/body.jpg",
    count: "2,100+ parts",
    description: "Bumpers, fenders, headlights, tail lights, bonnets, door handles, and rear-view mirrors.",
    highlightedParts: ["Headlights", "Tail Lights", "Bumpers", "Mirrors"],
  },
  {
    name: "Accessories & Care",
    slug: "accessories",
    icon: Wrench,
    image: "/images/accessories.jpg",
    count: "950+ parts",
    description: "Aerodynamic wiper blades, car care compounds, cabin styling, and essential road trip utilities.",
    highlightedParts: ["Wipers", "Car Care", "Infotainment", "Holders"],
  },
];

export function FeaturedCategories() {
  return (
    <section id="popular-categories" className="py-14 sm:py-20 bg-[#F8F9FA] border-b border-gray-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-10 gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ember mb-2">
              <Layers className="w-4 h-4 text-ember" />
              <span>Browse By Subsystem</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
              Popular Categories
            </h2>
            <p className="text-sm text-gray-500 mt-1 max-w-xl">
              Source mechanical, electrical, and body components grouped by automotive subsystems.
            </p>
          </div>

          <Link
            href="/categories"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-ember hover:text-ember-deep transition-colors group"
          >
            <span>Browse All 9 Categories</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
          {CATEGORY_TILES.map((cat) => {
            const Icon = cat.icon;
            return (
              <div
                key={cat.slug}
                className="bg-white rounded-2xl border border-gray-200/90 shadow-sm hover:shadow-xl hover:border-ember overflow-hidden flex flex-col justify-between transition-all duration-300 group"
              >
                {/* Image Header with Category Thumbnail */}
                <div className="relative h-40 w-full overflow-hidden bg-gray-950">
                  <img
                    src={cat.image}
                    alt={cat.name}
                    className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500 opacity-90 group-hover:opacity-100"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                  {/* Icon badge overlay */}
                  <div className="absolute top-3 left-3 w-9 h-9 rounded-xl bg-gray-900/80 backdrop-blur-md border border-gray-700/80 text-ember flex items-center justify-center shadow-lg">
                    <Icon className="w-4 h-4" />
                  </div>

                  {/* Count badge overlay */}
                  <span className="absolute top-3 right-3 text-[11px] font-bold text-white bg-black/60 backdrop-blur-md border border-white/20 px-2.5 py-0.5 rounded-full">
                    {cat.count}
                  </span>

                  {/* Category Title on image bottom */}
                  <div className="absolute bottom-3 left-4 right-4">
                    <h3 className="text-base font-bold text-white group-hover:text-ember transition-colors drop-shadow">
                      <Link href={`/categories/${cat.slug}`} className="focus:outline-none">
                        {cat.name}
                      </Link>
                    </h3>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 flex flex-col flex-1 justify-between">
                  <div>
                    <p className="text-xs text-gray-500 leading-relaxed mb-4">
                      {cat.description}
                    </p>

                    {/* Subcategory Pills */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {cat.highlightedParts.map((sub, idx) => (
                        <span
                          key={idx}
                          className="text-[11px] font-medium bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md"
                        >
                          {sub}
                        </span>
                      ))}
                    </div>
                  </div>

                  <Link
                    href={`/categories/${cat.slug}`}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-ember group-hover:text-ember-deep transition-colors pt-3 border-t border-gray-100"
                  >
                    <span>Explore {cat.name}</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
