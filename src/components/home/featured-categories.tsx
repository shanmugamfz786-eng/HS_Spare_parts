import React from "react";
import Image from "next/image";
import Link from "next/link";
import { getOptimizedCloudinaryUrl } from "@/lib/cloudinary-shared";
import {
  Cog,
  Disc,
  Gauge,
  Compass,
  Zap,
  ThermometerSnowflake,
  Wind,
  Shield,
  SlidersHorizontal,
  Filter,
  Volume2,
  RefreshCw,
  ArrowRight,
  Layers,
} from "lucide-react";

interface CategoryTile {
  name: string;
  slug: string;
  icon: React.ElementType;
  image: string;
  description: string;
  highlightedParts: string[];
}

const CATEGORY_TILES: CategoryTile[] = [
  {
    name: "Engine Parts",
    slug: "engine-parts",
    icon: Cog,
    image: "/images/engine.jpg",
    description: "Pistons, cylinder heads, valves, camshafts, crankshafts, timing kits, and engine gaskets.",
    highlightedParts: ["Pistons & Rings", "Cylinder Heads", "Timing Kits", "Head Gaskets"],
  },
  {
    name: "Brake System",
    slug: "brake-system",
    icon: Disc,
    image: "/images/brakes.jpg",
    description: "Front & rear brake pads, brake discs, shoes, calipers, master cylinders, and brake hoses.",
    highlightedParts: ["Front Brake Pads", "Brake Discs / Rotors", "Brake Calipers", "Brake Shoes"],
  },
  {
    name: "Clutch & Transmission",
    slug: "clutch-transmission",
    icon: Gauge,
    image: "/images/transmission.jpg",
    description: "Clutch plates, pressure plates, release bearings, master cylinders, gearboxes, and drive shafts.",
    highlightedParts: ["Clutch Plates", "Pressure Plates", "Drive Shafts", "CV Joints"],
  },
  {
    name: "Suspension & Steering",
    slug: "suspension-steering",
    icon: Compass,
    image: "/images/suspension.jpg",
    description: "Shock absorbers, struts, control arms, ball joints, tie rod ends, steering racks, and hubs.",
    highlightedParts: ["Shock Absorbers", "Struts & Mounts", "Control Arms", "Steering Racks"],
  },
  {
    name: "Electrical Parts",
    slug: "electrical-parts",
    icon: Zap,
    image: "/images/electrical.jpg",
    description: "Alternators, starter motors, ignition coils, spark plugs, sensors, relays, switches, and harnesses.",
    highlightedParts: ["Alternators", "Starter Motors", "Ignition Coils", "Spark Plugs"],
  },
  {
    name: "Cooling System",
    slug: "cooling-system",
    icon: ThermometerSnowflake,
    image: "/images/cooling.jpg",
    description: "Radiators, water pumps, thermostats, cooling fans, coolant reservoirs, and radiator hoses.",
    highlightedParts: ["Radiators", "Water Pumps", "Thermostats", "Radiator Fans"],
  },
  {
    name: "Fuel & Air System",
    slug: "fuel-air-system",
    icon: Wind,
    image: "/images/engine.jpg",
    description: "Fuel pumps, injectors, throttle bodies, fuel pressure regulators, air intake, and air flow sensors.",
    highlightedParts: ["Fuel Pumps", "Fuel Injectors", "Throttle Bodies", "Air Flow Sensors"],
  },
  {
    name: "Body & Exterior",
    slug: "body-exterior",
    icon: Shield,
    image: "/images/body.jpg",
    description: "Bumpers, headlights, tail lights, fog lamps, side mirrors, front grilles, and bonnets.",
    highlightedParts: ["Bumpers", "Headlights", "Tail Lights", "Side Mirrors"],
  },
  {
    name: "Interior Parts",
    slug: "interior-parts",
    icon: SlidersHorizontal,
    image: "/images/accessories.jpg",
    description: "Dashboard components, seat belts, door trims, window switches, and AC control panels.",
    highlightedParts: ["Dashboard Parts", "Seat Belts", "Window Switches", "AC Control Panels"],
  },
  {
    name: "Filters",
    slug: "filters",
    icon: Filter,
    image: "/images/engine.jpg",
    description: "Engine oil filters, air filters, cabin/AC filters, fuel filters, and transmission filters.",
    highlightedParts: ["Engine Oil Filters", "Air Filters", "Cabin / AC Filters", "Fuel Filters"],
  },
  {
    name: "Exhaust System",
    slug: "exhaust-system",
    icon: Volume2,
    image: "/images/transmission.jpg",
    description: "Exhaust manifolds, catalytic converters, mufflers, exhaust pipes, mountings, and O2 sensors.",
    highlightedParts: ["Exhaust Manifolds", "Catalytic Converters", "Mufflers", "Oxygen Sensors"],
  },
  {
    name: "Belts, Hoses & Bearings",
    slug: "belts-hoses-bearings",
    icon: RefreshCw,
    image: "/images/suspension.jpg",
    description: "Drive belts, alternator belts, timing belts, radiator hoses, coolant hoses, and wheel bearings.",
    highlightedParts: ["Drive Belts", "Timing Belts", "Coolant Hoses", "Wheel Bearings"],
  },
];

interface FeaturedCategoriesProps {
  categories?: Array<{
    name: string;
    slug: string;
    imageUrl?: string | null;
  }>;
}

export function FeaturedCategories({ categories: customCategories }: FeaturedCategoriesProps = {}) {
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
              12 Automotive Categories
            </h2>
            <p className="text-sm text-gray-500 mt-1 max-w-xl">
              Source genuine OEM and branded aftermarket components structured by vehicle subsystems.
            </p>
          </div>

          <Link
            href="/categories"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-ember hover:text-ember/80 transition-colors group self-start sm:self-auto"
          >
            <span>View All Categories & Subcategories</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {/* 12-Category Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {CATEGORY_TILES.map((cat) => {
            const Icon = cat.icon;
            const customMatch = customCategories?.find((c) => c.slug === cat.slug);
            const displayImageUrl = customMatch?.imageUrl
              ? getOptimizedCloudinaryUrl(customMatch.imageUrl, {
                  width: 600,
                  height: 360,
                  crop: "fill",
                  quality: "auto",
                  format: "auto",
                })
              : cat.image;
            const finalImageSrc = displayImageUrl || "/images/brakes.jpg";

            return (
              <Link
                key={cat.slug}
                href={`/categories/${cat.slug}`}
                prefetch={true}
                className="group relative bg-white rounded-2xl overflow-hidden border border-gray-200/90 shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-300 flex flex-col"
              >
                {/* Image & Header Overlay */}
                <div className="relative h-44 w-full overflow-hidden bg-gray-900">
                  <Image
                    src={finalImageSrc}
                    alt={`${cat.name} spare parts`}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105 opacity-80 group-hover:opacity-90"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-950/90 via-gray-950/40 to-transparent" />

                  {/* Top Badge: Icon */}
                  <div className="absolute top-3.5 left-3.5 flex items-center gap-2 z-10">
                    <div className="w-8 h-8 rounded-lg bg-white/90 backdrop-blur-sm text-gray-900 flex items-center justify-center shadow-sm">
                      <Icon className="w-4 h-4 text-ember" />
                    </div>
                  </div>

                  {/* Title & Description inside image card */}
                  <div className="absolute bottom-3.5 left-3.5 right-3.5 z-10">
                    <h3 className="text-lg font-black text-white tracking-tight group-hover:text-ember transition-colors">
                      {cat.name}
                    </h3>
                  </div>
                </div>

                {/* Subcategory Highlights */}
                <div className="p-4 flex-1 flex flex-col justify-between bg-white">
                  <div>
                    <p className="text-xs text-gray-500 line-clamp-2 mb-3">
                      {cat.description}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {cat.highlightedParts.map((part) => (
                        <span
                          key={part}
                          className="text-[10px] font-medium bg-[#F8F9FA] text-gray-600 px-2 py-0.5 rounded-md border border-gray-200/70"
                        >
                          {part}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs font-bold text-ember">
                    <span>Explore Subcategories</span>
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
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
