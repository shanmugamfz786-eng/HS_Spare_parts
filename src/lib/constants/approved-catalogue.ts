/**
 * HS SPARE PARTS — CANONICAL APPROVED CATALOGUE TAXONOMY & MASTER DATA
 *
 * Implements the 12 approved main categories, 88 exact subcategories,
 * vehicle makes/models for Indian passenger cars, master brands,
 * and independent product classification (Origin + Condition).
 */

export interface ApprovedSubcategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

export interface ApprovedCategory {
  id: string;
  code: string; // 3-letter SKU prefix
  name: string;
  slug: string;
  sortOrder: number;
  description: string;
  subcategories: ApprovedSubcategory[];
}

export interface ApprovedBrand {
  id: string;
  code: string; // 3-letter SKU code
  name: string;
  slug: string;
  isOem: boolean;
  countryOfOrigin?: string;
}

export interface ApprovedVehicleModel {
  name: string;
  slug: string;
  variants: string[];
  yearStart: number;
  yearEnd?: number;
  engineDisplacements?: string[];
  fuelTypes: ("Petrol" | "Diesel" | "CNG" | "Electric")[];
}

export interface ApprovedVehicleMake {
  name: string;
  slug: string;
  models: ApprovedVehicleModel[];
}

// ==============================================================================
// 1. THE 12 APPROVED MAIN CATEGORIES & 88 SUBCATEGORIES
// ==============================================================================

export const APPROVED_CATEGORIES: ApprovedCategory[] = [
  {
    id: "cat-01-engine-parts",
    code: "ENG",
    name: "Engine Parts",
    slug: "engine-parts",
    sortOrder: 1,
    description: "Pistons, cylinder heads, valves, camshafts, crankshafts, timing kits, and engine gaskets.",
    subcategories: [
      { id: "sub-01-01", name: "Pistons & Piston Rings", slug: "pistons-piston-rings" },
      { id: "sub-01-02", name: "Cylinder Head & Components", slug: "cylinder-head-components" },
      { id: "sub-01-03", name: "Engine Valves", slug: "engine-valves" },
      { id: "sub-01-04", name: "Camshaft & Crankshaft", slug: "camshaft-crankshaft" },
      { id: "sub-01-05", name: "Timing Chain & Timing Belt", slug: "timing-chain-timing-belt" },
      { id: "sub-01-06", name: "Engine Mounts", slug: "engine-mounts" },
      { id: "sub-01-07", name: "Head Gaskets", slug: "head-gaskets" },
      { id: "sub-01-08", name: "Oil Seals & Engine Gaskets", slug: "oil-seals-engine-gaskets" },
    ],
  },
  {
    id: "cat-02-brake-system",
    code: "BRK",
    name: "Brake System",
    slug: "brake-system",
    sortOrder: 2,
    description: "Front & rear brake pads, brake discs, shoes, calipers, master cylinders, and brake hoses.",
    subcategories: [
      { id: "sub-02-01", name: "Front Brake Pads", slug: "front-brake-pads" },
      { id: "sub-02-02", name: "Rear Brake Pads", slug: "rear-brake-pads" },
      { id: "sub-02-03", name: "Brake Shoes", slug: "brake-shoes" },
      { id: "sub-02-04", name: "Brake Discs / Rotors", slug: "brake-discs-rotors" },
      { id: "sub-02-05", name: "Brake Drums", slug: "brake-drums" },
      { id: "sub-02-06", name: "Brake Calipers", slug: "brake-calipers" },
      { id: "sub-02-07", name: "Master Cylinder", slug: "master-cylinder" },
      { id: "sub-02-08", name: "Brake Hoses & Wheel Cylinders", slug: "brake-hoses-wheel-cylinders" },
    ],
  },
  {
    id: "cat-03-clutch-transmission",
    code: "CLU",
    name: "Clutch & Transmission",
    slug: "clutch-transmission",
    sortOrder: 3,
    description: "Clutch plates, pressure plates, release bearings, master cylinders, gearboxes, and drive shafts.",
    subcategories: [
      { id: "sub-03-01", name: "Clutch Plates / Discs", slug: "clutch-plates-discs" },
      { id: "sub-03-02", name: "Pressure Plates", slug: "pressure-plates" },
      { id: "sub-03-03", name: "Clutch Release Bearings", slug: "clutch-release-bearings" },
      { id: "sub-03-04", name: "Clutch Master & Slave Cylinders", slug: "clutch-master-slave-cylinders" },
      { id: "sub-03-05", name: "Gearbox Components", slug: "gearbox-components" },
      { id: "sub-03-06", name: "Drive Shafts", slug: "drive-shafts" },
      { id: "sub-03-07", name: "CV Joints", slug: "cv-joints" },
      { id: "sub-03-08", name: "Gear Linkage Components", slug: "gear-linkage-components" },
    ],
  },
  {
    id: "cat-04-suspension-steering",
    code: "SUS",
    name: "Suspension & Steering",
    slug: "suspension-steering",
    sortOrder: 4,
    description: "Shock absorbers, struts, control arms, ball joints, tie rod ends, steering racks, and hubs.",
    subcategories: [
      { id: "sub-04-01", name: "Shock Absorbers", slug: "shock-absorbers" },
      { id: "sub-04-02", name: "Struts & Strut Mounts", slug: "struts-strut-mounts" },
      { id: "sub-04-03", name: "Control Arms", slug: "control-arms" },
      { id: "sub-04-04", name: "Ball Joints", slug: "ball-joints" },
      { id: "sub-04-05", name: "Tie Rod Ends", slug: "tie-rod-ends" },
      { id: "sub-04-06", name: "Steering Rack Components", slug: "steering-rack-components" },
      { id: "sub-04-07", name: "Stabilizer Links", slug: "stabilizer-links" },
      { id: "sub-04-08", name: "Wheel Bearings & Hubs", slug: "wheel-bearings-hubs" },
    ],
  },
  {
    id: "cat-05-electrical-parts",
    code: "ELE",
    name: "Electrical Parts",
    slug: "electrical-parts",
    sortOrder: 5,
    description: "Alternators, starter motors, ignition coils, spark plugs, sensors, relays, switches, and harnesses.",
    subcategories: [
      { id: "sub-05-01", name: "Alternators", slug: "alternators" },
      { id: "sub-05-02", name: "Starter Motors", slug: "starter-motors" },
      { id: "sub-05-03", name: "Ignition Coils", slug: "ignition-coils" },
      { id: "sub-05-04", name: "Spark Plugs", slug: "spark-plugs" },
      { id: "sub-05-05", name: "Sensors", slug: "sensors" },
      { id: "sub-05-06", name: "Relays & Switches", slug: "relays-switches" },
      { id: "sub-05-07", name: "Wiring Harnesses", slug: "wiring-harnesses" },
      { id: "sub-05-08", name: "Window Motors", slug: "window-motors" },
    ],
  },
  {
    id: "cat-06-cooling-system",
    code: "COO",
    name: "Cooling System",
    slug: "cooling-system",
    sortOrder: 6,
    description: "Radiators, water pumps, thermostats, cooling fans, coolant reservoirs, and radiator hoses.",
    subcategories: [
      { id: "sub-06-01", name: "Radiators", slug: "radiators" },
      { id: "sub-06-02", name: "Water Pumps", slug: "water-pumps" },
      { id: "sub-06-03", name: "Thermostats", slug: "thermostats" },
      { id: "sub-06-04", name: "Radiator Fans", slug: "radiator-fans" },
      { id: "sub-06-05", name: "Cooling Fan Motors", slug: "cooling-fan-motors" },
      { id: "sub-06-06", name: "Coolant Reservoirs", slug: "coolant-reservoirs" },
      { id: "sub-06-07", name: "Radiator Hoses", slug: "radiator-hoses" },
      { id: "sub-06-08", name: "Temperature Sensors", slug: "temperature-sensors" },
    ],
  },
  {
    id: "cat-07-fuel-air-system",
    code: "FUL",
    name: "Fuel & Air System",
    slug: "fuel-air-system",
    sortOrder: 7,
    description: "Fuel pumps, injectors, throttle bodies, fuel pressure regulators, air intake, and air flow sensors.",
    subcategories: [
      { id: "sub-07-01", name: "Fuel Pumps", slug: "fuel-pumps" },
      { id: "sub-07-02", name: "Fuel Injectors", slug: "fuel-injectors" },
      { id: "sub-07-03", name: "Throttle Bodies", slug: "throttle-bodies" },
      { id: "sub-07-04", name: "Fuel Pressure Regulators", slug: "fuel-pressure-regulators" },
      { id: "sub-07-05", name: "Air Intake Components", slug: "air-intake-components" },
      { id: "sub-07-06", name: "Fuel Tank Components", slug: "fuel-tank-components" },
      { id: "sub-07-07", name: "Air Flow Sensors", slug: "air-flow-sensors" },
    ],
  },
  {
    id: "cat-08-body-exterior",
    code: "BOD",
    name: "Body & Exterior",
    slug: "body-exterior",
    sortOrder: 8,
    description: "Bumpers, headlights, tail lights, fog lamps, side mirrors, front grilles, and bonnets.",
    subcategories: [
      { id: "sub-08-01", name: "Front & Rear Bumpers", slug: "front-rear-bumpers" },
      { id: "sub-08-02", name: "Headlights", slug: "headlights" },
      { id: "sub-08-03", name: "Tail Lights", slug: "tail-lights" },
      { id: "sub-08-04", name: "Fog Lamps", slug: "fog-lamps" },
      { id: "sub-08-05", name: "Side Mirrors", slug: "side-mirrors" },
      { id: "sub-08-06", name: "Front Grilles", slug: "front-grilles" },
      { id: "sub-08-07", name: "Door Handles", slug: "door-handles" },
      { id: "sub-08-08", name: "Fender & Bonnet Components", slug: "fender-bonnet-components" },
    ],
  },
  {
    id: "cat-09-interior-parts",
    code: "INT",
    name: "Interior Parts",
    slug: "interior-parts",
    sortOrder: 9,
    description: "Dashboard components, seat belts, door trims, window switches, and AC control panels.",
    subcategories: [
      { id: "sub-09-01", name: "Dashboard Components", slug: "dashboard-components" },
      { id: "sub-09-02", name: "Seat Belts", slug: "seat-belts" },
      { id: "sub-09-03", name: "Door Trims", slug: "door-trims" },
      { id: "sub-09-04", name: "Window Switches", slug: "window-switches" },
      { id: "sub-09-05", name: "Interior Door Handles", slug: "interior-door-handles" },
      { id: "sub-09-06", name: "AC Control Panels", slug: "ac-control-panels" },
      { id: "sub-09-07", name: "Power Window Components", slug: "power-window-components" },
      { id: "sub-09-08", name: "Interior Console Parts", slug: "interior-console-parts" },
    ],
  },
  {
    id: "cat-10-filters",
    code: "FLT",
    name: "Filters",
    slug: "filters",
    sortOrder: 10,
    description: "Engine oil filters, air filters, cabin/AC filters, fuel filters, and transmission filters.",
    subcategories: [
      { id: "sub-10-01", name: "Engine Oil Filters", slug: "engine-oil-filters" },
      { id: "sub-10-02", name: "Air Filters", slug: "air-filters" },
      { id: "sub-10-03", name: "Cabin / AC Filters", slug: "cabin-ac-filters" },
      { id: "sub-10-04", name: "Fuel Filters", slug: "fuel-filters" },
      { id: "sub-10-05", name: "Transmission Filters", slug: "transmission-filters" },
    ],
  },
  {
    id: "cat-11-exhaust-system",
    code: "EXH",
    name: "Exhaust System",
    slug: "exhaust-system",
    sortOrder: 11,
    description: "Exhaust manifolds, catalytic converters, mufflers, exhaust pipes, mountings, and O2 sensors.",
    subcategories: [
      { id: "sub-11-01", name: "Exhaust Manifolds", slug: "exhaust-manifolds" },
      { id: "sub-11-02", name: "Catalytic Converters", slug: "catalytic-converters" },
      { id: "sub-11-03", name: "Silencers / Mufflers", slug: "silencers-mufflers" },
      { id: "sub-11-04", name: "Exhaust Pipes", slug: "exhaust-pipes" },
      { id: "sub-11-05", name: "Exhaust Mountings", slug: "exhaust-mountings" },
      { id: "sub-11-06", name: "Oxygen Sensors", slug: "oxygen-sensors" },
    ],
  },
  {
    id: "cat-12-belts-hoses-bearings",
    code: "BLT",
    name: "Belts, Hoses & Bearings",
    slug: "belts-hoses-bearings",
    sortOrder: 12,
    description: "Drive belts, alternator belts, timing belts, radiator hoses, coolant hoses, and wheel bearings.",
    subcategories: [
      { id: "sub-12-01", name: "Drive Belts", slug: "drive-belts" },
      { id: "sub-12-02", name: "Alternator Belts", slug: "alternator-belts" },
      { id: "sub-12-03", name: "Timing Belts", slug: "timing-belts" },
      { id: "sub-12-04", name: "Radiator Hoses", slug: "radiator-hoses-belts" },
      { id: "sub-12-05", name: "Coolant Hoses", slug: "coolant-hoses" },
      { id: "sub-12-06", name: "Wheel Bearings", slug: "wheel-bearings" },
      { id: "sub-12-07", name: "Engine Bearings", slug: "engine-bearings" },
      { id: "sub-12-08", name: "Oil Seals", slug: "oil-seals" },
    ],
  },
];

// Total category count verification
export const TOTAL_APPROVED_CATEGORIES_COUNT = APPROVED_CATEGORIES.length; // 12
export const TOTAL_APPROVED_SUBCATEGORIES_COUNT = APPROVED_CATEGORIES.reduce(
  (sum, cat) => sum + cat.subcategories.length,
  0
); // 90

// ==============================================================================
// 2. BACKWARD-COMPATIBILITY SLUG MAPPING (OLD DEMO SLUGS -> CANONICAL)
// ==============================================================================

export const CATEGORY_SLUG_ALIASES: Record<string, string> = {
  brake: "brake-system",
  transmission: "clutch-transmission",
  hvac: "cooling-system",
  electrical: "electrical-parts",
  "body-parts": "body-exterior",
  accessories: "belts-hoses-bearings",
};

export function resolveCanonicalCategorySlug(inputSlug: string): string {
  const normalized = inputSlug.trim().toLowerCase();
  return CATEGORY_SLUG_ALIASES[normalized] || normalized;
}

// ==============================================================================
// 3. MASTER BRANDS (AFTERMARKET LEADERS & CAR OEMS)
// ==============================================================================

export const APPROVED_BRANDS: ApprovedBrand[] = [
  // 1. Popular Passenger Car Brands (Vehicle Manufacturers in India)
  { id: "brand-maruti-suzuki", code: "MSI", name: "Maruti Suzuki", slug: "maruti-suzuki", isOem: true, countryOfOrigin: "India" },
  { id: "brand-hyundai", code: "HYU", name: "Hyundai", slug: "hyundai", isOem: true, countryOfOrigin: "South Korea" },
  { id: "brand-tata-motors", code: "TTM", name: "Tata Motors", slug: "tata-motors", isOem: true, countryOfOrigin: "India" },
  { id: "brand-mahindra", code: "MHD", name: "Mahindra", slug: "mahindra", isOem: true, countryOfOrigin: "India" },
  { id: "brand-toyota", code: "TYT", name: "Toyota", slug: "toyota", isOem: true, countryOfOrigin: "Japan" },
  { id: "brand-honda", code: "HND", name: "Honda", slug: "honda", isOem: true, countryOfOrigin: "Japan" },
  { id: "brand-volkswagen", code: "VWG", name: "Volkswagen", slug: "volkswagen", isOem: true, countryOfOrigin: "Germany" },
  { id: "brand-skoda", code: "SKD", name: "Skoda", slug: "skoda", isOem: true, countryOfOrigin: "Czech Republic" },
  { id: "brand-kia", code: "KIA", name: "Kia", slug: "kia", isOem: true, countryOfOrigin: "South Korea" },
  { id: "brand-ford", code: "FRD", name: "Ford", slug: "ford", isOem: true, countryOfOrigin: "USA" },
  { id: "brand-renault", code: "RNT", name: "Renault", slug: "renault", isOem: true, countryOfOrigin: "France" },
  { id: "brand-nissan", code: "NSN", name: "Nissan", slug: "nissan", isOem: true, countryOfOrigin: "Japan" },
  { id: "brand-bmw", code: "BMW", name: "BMW", slug: "bmw", isOem: true, countryOfOrigin: "Germany" },
  { id: "brand-mercedes-benz", code: "MBZ", name: "Mercedes-Benz", slug: "mercedes-benz", isOem: true, countryOfOrigin: "Germany" },

  // 2. Vehicle Manufacturer Genuine / OEM Brands
  { id: "brand-maruti-genuine", code: "MSZ", name: "Maruti Suzuki Genuine", slug: "maruti-suzuki-genuine", isOem: true, countryOfOrigin: "India" },
  { id: "brand-hyundai-mobis", code: "MOB", name: "Hyundai Mobis", slug: "hyundai-mobis", isOem: true, countryOfOrigin: "South Korea" },
  { id: "brand-tata-genuine", code: "TAT", name: "Tata Genuine Parts", slug: "tata-genuine", isOem: true, countryOfOrigin: "India" },
  { id: "brand-honda-genuine", code: "HON", name: "Honda Genuine Parts", slug: "honda-genuine", isOem: true, countryOfOrigin: "Japan" },
  { id: "brand-toyota-genuine", code: "TOY", name: "Toyota Genuine Parts", slug: "toyota-genuine", isOem: true, countryOfOrigin: "Japan" },
  { id: "brand-mahindra-genuine", code: "MAH", name: "Mahindra Genuine Parts", slug: "mahindra-genuine", isOem: true, countryOfOrigin: "India" },

  // 3. Leading Tier-1 Automotive Component Manufacturers & Aftermarket Specialists
  { id: "brand-bosch", code: "BOS", name: "Bosch", slug: "bosch", isOem: false, countryOfOrigin: "Germany" },
  { id: "brand-brembo", code: "BRE", name: "Brembo", slug: "brembo", isOem: false, countryOfOrigin: "Italy" },
  { id: "brand-denso", code: "DEN", name: "DENSO", slug: "denso", isOem: false, countryOfOrigin: "Japan" },
  { id: "brand-valeo", code: "VAL", name: "Valeo", slug: "valeo", isOem: false, countryOfOrigin: "France" },
  { id: "brand-lumax", code: "LMX", name: "Lumax", slug: "lumax", isOem: false, countryOfOrigin: "India" },
  { id: "brand-uno-minda", code: "MIN", name: "Uno Minda", slug: "uno-minda", isOem: false, countryOfOrigin: "India" },
  { id: "brand-gabriel", code: "GAB", name: "Gabriel", slug: "gabriel", isOem: false, countryOfOrigin: "USA" },
  { id: "brand-tvs-girling", code: "TVS", name: "TVS Girling", slug: "tvs-girling", isOem: false, countryOfOrigin: "India" },
  { id: "brand-mann", code: "MAN", name: "MANN-FILTER", slug: "mann-filter", isOem: false, countryOfOrigin: "Germany" },
  { id: "brand-ngk", code: "NGK", name: "NGK", slug: "ngk", isOem: false, countryOfOrigin: "Japan" },
  { id: "brand-gates", code: "GAT", name: "Gates", slug: "gates", isOem: false, countryOfOrigin: "USA" },
  { id: "brand-kyb", code: "KYB", name: "KYB", slug: "kyb", isOem: false, countryOfOrigin: "Japan" },
  { id: "brand-motherson", code: "MTH", name: "Motherson", slug: "motherson", isOem: false, countryOfOrigin: "India" },
];

// ==============================================================================
// 4. VEHICLE MASTER DATA (INDIAN PASSENGER CARS)
// ==============================================================================

export const APPROVED_VEHICLE_MAKES: ApprovedVehicleMake[] = [
  {
    name: "Maruti Suzuki",
    slug: "maruti-suzuki",
    models: [
      { name: "Swift", slug: "swift", variants: ["LXi", "VXi", "ZXi", "ZXi+"], yearStart: 2005, fuelTypes: ["Petrol", "CNG"] },
      { name: "Baleno", slug: "baleno", variants: ["Sigma", "Delta", "Zeta", "Alpha"], yearStart: 2015, fuelTypes: ["Petrol", "CNG"] },
      { name: "Dzire", slug: "dzire", variants: ["LXi", "VXi", "ZXi", "ZXi+"], yearStart: 2008, fuelTypes: ["Petrol", "CNG"] },
      { name: "Wagon R", slug: "wagon-r", variants: ["LXi", "VXi", "ZXi"], yearStart: 1999, fuelTypes: ["Petrol", "CNG"] },
      { name: "Alto K10", slug: "alto-k10", variants: ["Std", "LXi", "VXi", "VXi+"], yearStart: 2010, fuelTypes: ["Petrol", "CNG"] },
      { name: "Brezza", slug: "brezza", variants: ["LXi", "VXi", "ZXi", "ZXi+"], yearStart: 2016, fuelTypes: ["Petrol", "CNG"] },
      { name: "Ertiga", slug: "ertiga", variants: ["LXi", "VXi", "ZXi", "ZXi+"], yearStart: 2012, fuelTypes: ["Petrol", "CNG"] },
    ],
  },
  {
    name: "Hyundai",
    slug: "hyundai",
    models: [
      { name: "Grand i10 / i10", slug: "grand-i10", variants: ["Era", "Magna", "Sportz", "Asta"], yearStart: 2007, fuelTypes: ["Petrol", "CNG"] },
      { name: "i20", slug: "i20", variants: ["Magna", "Sportz", "Asta", "Asta (O)"], yearStart: 2008, fuelTypes: ["Petrol", "Diesel"] },
      { name: "Aura", slug: "aura", variants: ["E", "S", "SX", "SX+"], yearStart: 2020, fuelTypes: ["Petrol", "CNG"] },
      { name: "Xcent", slug: "xcent", variants: ["Base", "S", "SX"], yearStart: 2014, yearEnd: 2020, fuelTypes: ["Petrol", "Diesel"] },
      { name: "Venue", slug: "venue", variants: ["E", "S", "S+", "SX", "SX(O)"], yearStart: 2019, fuelTypes: ["Petrol", "Diesel"] },
      { name: "Creta", slug: "creta", variants: ["E", "EX", "S", "SX", "SX(O)"], yearStart: 2015, fuelTypes: ["Petrol", "Diesel"] },
      { name: "Verna", slug: "verna", variants: ["EX", "S", "SX", "SX(O)"], yearStart: 2006, fuelTypes: ["Petrol", "Diesel"] },
    ],
  },
  {
    name: "Tata",
    slug: "tata",
    models: [
      { name: "Tiago", slug: "tiago", variants: ["XE", "XT", "XZ", "XZ+"], yearStart: 2016, fuelTypes: ["Petrol", "CNG", "Electric"] },
      { name: "Tigor", slug: "tigor", variants: ["XE", "XM", "XZ", "XZ+"], yearStart: 2017, fuelTypes: ["Petrol", "CNG", "Electric"] },
      { name: "Altroz", slug: "altroz", variants: ["XE", "XM", "XT", "XZ", "XZ+"], yearStart: 2020, fuelTypes: ["Petrol", "Diesel", "CNG"] },
      { name: "Punch", slug: "punch", variants: ["Pure", "Adventure", "Accomplished", "Creative"], yearStart: 2021, fuelTypes: ["Petrol", "CNG", "Electric"] },
      { name: "Nexon", slug: "nexon", variants: ["Smart", "Pure", "Creative", "Fearless"], yearStart: 2017, fuelTypes: ["Petrol", "Diesel", "Electric"] },
      { name: "Harrier", slug: "harrier", variants: ["Smart", "Pure", "Adventure", "Fearless"], yearStart: 2019, fuelTypes: ["Diesel"] },
      { name: "Safari", slug: "safari", variants: ["Smart", "Pure", "Adventure", "Accomplished"], yearStart: 2021, fuelTypes: ["Diesel"] },
    ],
  },
  {
    name: "Honda",
    slug: "honda",
    models: [
      { name: "City", slug: "city", variants: ["V", "VX", "ZX"], yearStart: 1998, fuelTypes: ["Petrol", "Diesel"] },
      { name: "Amaze", slug: "amaze", variants: ["E", "S", "VX"], yearStart: 2013, fuelTypes: ["Petrol", "Diesel"] },
      { name: "Jazz", slug: "jazz", variants: ["V", "VX", "ZX"], yearStart: 2009, yearEnd: 2023, fuelTypes: ["Petrol", "Diesel"] },
      { name: "WR-V", slug: "wr-v", variants: ["SV", "VX"], yearStart: 2017, yearEnd: 2023, fuelTypes: ["Petrol", "Diesel"] },
      { name: "Civic", slug: "civic", variants: ["V", "VX", "ZX"], yearStart: 2006, yearEnd: 2021, fuelTypes: ["Petrol", "Diesel"] },
    ],
  },
  {
    name: "Toyota",
    slug: "toyota",
    models: [
      { name: "Innova", slug: "innova", variants: ["GX", "VX", "ZX"], yearStart: 2005, fuelTypes: ["Diesel", "Petrol"] },
      { name: "Fortuner", slug: "fortuner", variants: ["Standard", "Legender", "GR-S"], yearStart: 2009, fuelTypes: ["Diesel", "Petrol"] },
      { name: "Glanza", slug: "glanza", variants: ["E", "S", "G", "V"], yearStart: 2019, fuelTypes: ["Petrol", "CNG"] },
      { name: "Urban Cruiser", slug: "urban-cruiser", variants: ["Mid", "High", "Premium"], yearStart: 2020, fuelTypes: ["Petrol"] },
      { name: "Corolla", slug: "corolla", variants: ["G", "GL", "VL"], yearStart: 2003, yearEnd: 2020, fuelTypes: ["Petrol", "Diesel"] },
    ],
  },
  {
    name: "Mahindra",
    slug: "mahindra",
    models: [
      { name: "Scorpio", slug: "scorpio", variants: ["Classic S", "Classic S11", "Z2", "Z4", "Z6", "Z8"], yearStart: 2002, fuelTypes: ["Diesel", "Petrol"] },
      { name: "XUV700", slug: "xuv700", variants: ["MX", "AX3", "AX5", "AX7", "AX7L"], yearStart: 2021, fuelTypes: ["Petrol", "Diesel"] },
      { name: "Thar", slug: "thar", variants: ["AX", "AX Opt", "LX"], yearStart: 2010, fuelTypes: ["Petrol", "Diesel"] },
      { name: "Bolero", slug: "bolero", variants: ["B4", "B6", "B6 Opt"], yearStart: 2000, fuelTypes: ["Diesel"] },
      { name: "XUV300", slug: "xuv300", variants: ["W4", "W6", "W8", "W8(O)"], yearStart: 2019, fuelTypes: ["Petrol", "Diesel"] },
    ],
  },
  {
    name: "Kia",
    slug: "kia",
    models: [
      { name: "Seltos", slug: "seltos", variants: ["HTE", "HTK", "HTK+", "HTX", "GTX", "X-Line"], yearStart: 2019, fuelTypes: ["Petrol", "Diesel"] },
      { name: "Sonet", slug: "sonet", variants: ["HTE", "HTK", "HTX", "GTX+", "X-Line"], yearStart: 2020, fuelTypes: ["Petrol", "Diesel"] },
      { name: "Carens", slug: "carens", variants: ["Premium", "Prestige", "Luxury", "Luxury Plus"], yearStart: 2022, fuelTypes: ["Petrol", "Diesel"] },
      { name: "Carnival", slug: "carnival", variants: ["Prestige", "Limousine", "Limousine Plus"], yearStart: 2020, fuelTypes: ["Diesel"] },
    ],
  },
  {
    name: "Renault",
    slug: "renault",
    models: [
      { name: "Kwid", slug: "kwid", variants: ["RXE", "RXL", "RXT", "Climber"], yearStart: 2015, fuelTypes: ["Petrol"] },
      { name: "Triber", slug: "triber", variants: ["RXE", "RXL", "RXT", "RXZ"], yearStart: 2019, fuelTypes: ["Petrol"] },
      { name: "Kiger", slug: "kiger", variants: ["RXE", "RXL", "RXT", "RXZ"], yearStart: 2021, fuelTypes: ["Petrol"] },
      { name: "Duster", slug: "duster", variants: ["RXE", "RXL", "RXT", "RXZ"], yearStart: 2012, yearEnd: 2022, fuelTypes: ["Petrol", "Diesel"] },
    ],
  },
  {
    name: "Nissan",
    slug: "nissan",
    models: [
      { name: "Magnite", slug: "magnite", variants: ["XE", "XL", "XV", "XV Premium"], yearStart: 2020, fuelTypes: ["Petrol"] },
      { name: "Kicks", slug: "kicks", variants: ["XL", "XV", "XV Premium"], yearStart: 2019, yearEnd: 2023, fuelTypes: ["Petrol"] },
      { name: "Micra", slug: "micra", variants: ["XL", "XV"], yearStart: 2010, yearEnd: 2020, fuelTypes: ["Petrol", "Diesel"] },
      { name: "Sunny", slug: "sunny", variants: ["XE", "XL", "XV"], yearStart: 2011, yearEnd: 2020, fuelTypes: ["Petrol", "Diesel"] },
    ],
  },
  {
    name: "Volkswagen",
    slug: "volkswagen",
    models: [
      { name: "Polo", slug: "polo", variants: ["Trendline", "Comfortline", "Highline", "GT TSI"], yearStart: 2010, yearEnd: 2022, fuelTypes: ["Petrol", "Diesel"] },
      { name: "Vento", slug: "vento", variants: ["Trendline", "Comfortline", "Highline"], yearStart: 2010, yearEnd: 2022, fuelTypes: ["Petrol", "Diesel"] },
      { name: "Taigun", slug: "taigun", variants: ["Comfortline", "Highline", "Topline", "GT"], yearStart: 2021, fuelTypes: ["Petrol"] },
      { name: "Virtus", slug: "virtus", variants: ["Comfortline", "Highline", "Topline", "GT"], yearStart: 2022, fuelTypes: ["Petrol"] },
    ],
  },
  {
    name: "Skoda",
    slug: "skoda",
    models: [
      { name: "Kushaq", slug: "kushaq", variants: ["Active", "Ambition", "Style", "Monte Carlo"], yearStart: 2021, fuelTypes: ["Petrol"] },
      { name: "Slavia", slug: "slavia", variants: ["Active", "Ambition", "Style", "Monte Carlo"], yearStart: 2022, fuelTypes: ["Petrol"] },
      { name: "Rapid", slug: "rapid", variants: ["Active", "Ambition", "Style", "Monte Carlo"], yearStart: 2011, yearEnd: 2021, fuelTypes: ["Petrol", "Diesel"] },
      { name: "Octavia", slug: "octavia", variants: ["Ambition", "Style", "L&K", "vRS"], yearStart: 2002, yearEnd: 2023, fuelTypes: ["Petrol", "Diesel"] },
    ],
  },
];

// ==============================================================================
// 5. PRODUCT CLASSIFICATION TYPES & CONSTANTS
// ==============================================================================

// Independent Sourcing Classification
export const PRODUCT_ORIGINS = ["genuine_oem", "branded_aftermarket"] as const;
export type ProductOrigin = (typeof PRODUCT_ORIGINS)[number];

export const PRODUCT_ORIGIN_LABELS: Record<ProductOrigin, string> = {
  genuine_oem: "Genuine OEM",
  branded_aftermarket: "Branded Aftermarket",
};

// Independent Condition Classification
export const PRODUCT_CONDITIONS = ["new", "used"] as const;
export type ProductCondition = (typeof PRODUCT_CONDITIONS)[number];

export const PRODUCT_CONDITION_LABELS: Record<ProductCondition, string> = {
  new: "Brand New",
  used: "Pre-owned / Used",
};

// Used Condition Grades (Only when condition === 'used')
export const USED_CONDITION_GRADES = ["excellent", "good", "fair"] as const;
export type UsedConditionGrade = (typeof USED_CONDITION_GRADES)[number];

export const USED_CONDITION_GRADE_LABELS: Record<UsedConditionGrade, string> = {
  excellent: "Grade A — Excellent (Near new, zero structural wear)",
  good: "Grade B — Good (Normal cosmetic wear, tested functional)",
  fair: "Grade C — Fair (Visible surface wear, operational integrity intact)",
};

// Inspection Statuses (For verified pre-owned parts)
export const INSPECTION_STATUSES = ["pending", "inspected", "failed"] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export const INSPECTION_STATUS_LABELS: Record<InspectionStatus, string> = {
  pending: "Inspection Pending",
  inspected: "Multi-Point Inspected & Certified",
  failed: "Inspection Failed (Blocked from Sale)",
};

// ==============================================================================
// 6. SKU FORMAT GENERATOR: CATEGORY-BRAND-SEQUENCE
// ==============================================================================

export function getCategoryCode(categorySlug: string): string {
  const cat = APPROVED_CATEGORIES.find((c) => c.slug === categorySlug);
  if (cat) return cat.code;

  // Check if it's an alias
  const canonical = resolveCanonicalCategorySlug(categorySlug);
  const canonCat = APPROVED_CATEGORIES.find((c) => c.slug === canonical);
  if (canonCat) return canonCat.code;

  // Fallback: derive 3-letter alphanumeric code
  return categorySlug.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() || "GEN";
}

export function getBrandCode(brandSlugOrName: string): string {
  const brand = APPROVED_BRANDS.find(
    (b) =>
      b.slug.toLowerCase() === brandSlugOrName.toLowerCase() ||
      b.name.toLowerCase() === brandSlugOrName.toLowerCase()
  );
  if (brand) return brand.code;

  // Fallback: derive 3-letter alphanumeric code
  return brandSlugOrName.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() || "GEN";
}

/**
 * Generates a stable standard SKU adhering to:
 * `CATEGORY-BRAND-SEQUENCE` (e.g. `BRK-BOS-0001`, `ENG-GEN-0001`, `SUS-KYB-0001`)
 */
export function generateStandardSku(
  categorySlug: string,
  brandSlugOrName: string,
  sequenceNumber: number
): string {
  const catCode = getCategoryCode(categorySlug);
  const brandCode = getBrandCode(brandSlugOrName);
  const seqStr = String(sequenceNumber).padStart(4, "0");
  return `${catCode}-${brandCode}-${seqStr}`;
}
