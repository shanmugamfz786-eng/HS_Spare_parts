export interface NavSubItem {
  name: string;
  slug: string;
  description?: string;
}

export interface NavCategoryItem {
  id: string;
  name: string;
  slug: string;
  href: string;
  isDirectLink?: boolean;
  external?: boolean;
  highlight?: boolean;
  badge?: string;
  subcategories: NavSubItem[];
}

/**
 * Top-Level Navigation Taxonomy for HS Spare Parts
 * Sourced directly from docs/12_NAVBAR_CATEGORY_REFERENCE.md
 *
 * Rules:
 * 1. "All Categories" row under search is removed completely.
 * 2. Categories 1-8 have approved dropdown items in exact order.
 * 3. "Stock Clearance" is a direct link with NO dropdown or chevron.
 */
export const NAVBAR_CATEGORIES: NavCategoryItem[] = [
  {
    id: "suspension-steering",
    name: "Suspension & Steering",
    slug: "suspension-steering",
    href: "/categories/suspension-steering",
    subcategories: [
      { name: "Struts and Shock absorbers", slug: "struts-and-shock-absorbers" },
      { name: "Bushes, Strut mount & Kits", slug: "bushes-strut-mount-kits" },
      { name: "Coil Springs", slug: "coil-springs" },
      { name: "Tie Rod End / Outer Ball Joint", slug: "tie-rod-end-outer-ball-joint" },
      { name: "Rack End / Steering Ball Joint", slug: "rack-end-steering-ball-joint" },
      { name: "Stabilizer Link", slug: "stabilizer-link" },
      { name: "Control Arm", slug: "control-arm" },
      { name: "Suspension Ball Joint", slug: "suspension-ball-joint" },
      { name: "Steering Box Assembly / Rack assembly", slug: "steering-box-assembly-rack-assembly" },
      { name: "Power Steering Pump", slug: "power-steering-pump" },
      { name: "Gas Spring / Dicky Shocks", slug: "gas-spring-dicky-shocks" },
      { name: "Power Steering Oil", slug: "power-steering-oil" },
      { name: "Other suspension & Steering parts", slug: "other-suspension-steering-parts" },
    ],
  },
  {
    id: "body-parts",
    name: "Body Parts",
    slug: "body-parts",
    href: "/categories/body-parts",
    subcategories: [
      { name: "Rear View", slug: "rear-view" },
      { name: "Headlights", slug: "headlights" },
      { name: "Tail Lights", slug: "tail-lights" },
      { name: "Fog Lights & Indicator Lights", slug: "fog-lights-indicator-lights" },
      { name: "Bumpers", slug: "bumpers" },
      { name: "Fender & Fender Liner", slug: "fender-fender-liner" },
      { name: "Bonnet", slug: "bonnet" },
      { name: "Doors, Locks & Handles", slug: "doors-locks-handles" },
      { name: "Grills", slug: "grills" },
      { name: "Other Body Parts", slug: "other-body-parts" },
    ],
  },
  {
    id: "hvac",
    name: "HVAC",
    slug: "hvac",
    href: "/categories/hvac",
    subcategories: [
      { name: "Radiator", slug: "radiator" },
      { name: "Intercooler", slug: "intercooler" },
      { name: "AC compressor", slug: "ac-compressor" },
      { name: "Condensor", slug: "condensor" },
      { name: "Evaporator / Cooling Coil", slug: "evaporator-cooling-coil" },
      { name: "Fans", slug: "fans" },
      { name: "Cabin Filter", slug: "cabin-filter" },
      { name: "Coolant Oil", slug: "coolant-oil" },
      { name: "Radiator Hose", slug: "radiator-hose" },
      { name: "Heater Hose", slug: "heater-hose" },
      { name: "AC Gas", slug: "ac-gas" },
    ],
  },
  {
    id: "engine-parts",
    name: "Engine Parts",
    slug: "engine-parts",
    href: "/categories/engine-parts",
    subcategories: [
      { name: "Filters – Air, Oil, Fuel", slug: "filters-air-oil-fuel" },
      { name: "Piston, Rings, Liners", slug: "piston-rings-liners" },
      { name: "Main & Connect Bearing", slug: "main-connect-bearing" },
      { name: "Oil Cooler & Assembly", slug: "oil-cooler-assembly" },
      { name: "Fuel Pump Motor / Assy", slug: "fuel-pump-motor-assy" },
      { name: "Thermostat & Parts", slug: "thermostat-parts" },
      { name: "Gasket & Seals", slug: "gasket-seals" },
      { name: "Engine Belts", slug: "engine-belts" },
      { name: "Timing Tensioners & Idler Pulley", slug: "timing-tensioners-idler-pulley" },
      { name: "Timing Kit", slug: "timing-kit" },
      { name: "Water Pump", slug: "water-pump" },
      { name: "Turbo chargers", slug: "turbo-chargers" },
      { name: "Mountings", slug: "mountings" },
      { name: "Valves", slug: "valves" },
      { name: "Fuel Injectors", slug: "fuel-injectors" },
      { name: "Cylinder Head Parts", slug: "cylinder-head-parts" },
    ],
  },
  {
    id: "transmission",
    name: "Transmission",
    slug: "transmission",
    href: "/categories/transmission",
    subcategories: [
      { name: "Clutch Set", slug: "clutch-set" },
      { name: "Drive Shafts / Propeller Shafts & Parts", slug: "drive-shafts-propeller-shafts-parts" },
      { name: "Flywheel", slug: "flywheel" },
      { name: "Clutch Bearing / Clutch Slave Cylinder (CSC)", slug: "clutch-bearing-clutch-slave-cylinder-csc" },
      { name: "Clutch Master Cylinder/CMC", slug: "clutch-master-cylinder-cmc" },
      { name: "Clutch Cables", slug: "clutch-cables" },
      { name: "Wheel Bearings", slug: "wheel-bearings" },
      { name: "Gear & Transmission Oil", slug: "gear-transmission-oil" },
    ],
  },
  {
    id: "brake",
    name: "Brake",
    slug: "brake",
    href: "/categories/brake",
    subcategories: [
      { name: "Brake Pads", slug: "brake-pads" },
      { name: "Disc Rotors", slug: "disc-rotors" },
      { name: "Brake Shoes", slug: "brake-shoes" },
      { name: "Brake Drums", slug: "brake-drums" },
      { name: "Brake Master Cylinder", slug: "brake-master-cylinder" },
      { name: "Wheel Cylinder", slug: "wheel-cylinder" },
      { name: "Brake Booster", slug: "brake-booster" },
      { name: "Brake Oil", slug: "brake-oil" },
      { name: "Other brake parts", slug: "other-brake-parts" },
    ],
  },
  {
    id: "electrical",
    name: "Electrical",
    slug: "electrical",
    href: "/categories/electrical",
    subcategories: [
      { name: "Alternator Assembly", slug: "alternator-assembly" },
      { name: "Alternator Parts", slug: "alternator-parts" },
      { name: "Starter Motor Assembly", slug: "starter-motor-assembly" },
      { name: "Starter Motor Parts", slug: "starter-motor-parts" },
      { name: "Horns", slug: "horns" },
      { name: "Clock Springs", slug: "clock-springs" },
      { name: "Bulbs", slug: "bulbs" },
      { name: "Spark Plugs", slug: "spark-plugs" },
      { name: "Ignition Coil & Plug Wires", slug: "ignition-coil-plug-wires" },
      { name: "Sensors", slug: "sensors" },
      { name: "Power Window Switches", slug: "power-window-switches" },
      { name: "Switches", slug: "switches" },
      { name: "Meters & Gauges", slug: "meters-gauges" },
      { name: "Control Cables", slug: "control-cables" },
      { name: "Glow plugs", slug: "glow-plugs" },
    ],
  },
  {
    id: "accessories",
    name: "Accessories",
    slug: "accessories",
    href: "/categories/accessories",
    subcategories: [
      { name: "Wiper Blade", slug: "wiper-blade" },
      { name: "Wiper Arm & Link", slug: "wiper-arm-link" },
      { name: "Perfumes", slug: "perfumes" },
      { name: "Mobile Holder", slug: "mobile-holder" },
      { name: "Car Infotainment", slug: "car-infotainment" },
      { name: "Car Care", slug: "car-care" },
      { name: "Others", slug: "others" },
    ],
  },
  {
    id: "stock-clearance",
    name: "Stock Clearance",
    slug: "stock-clearance",
    href: "https://www.motrparts.com/special-offer/stock-clearance/",
    isDirectLink: true,
    external: true,
    highlight: true,
    badge: "Special Offer",
    subcategories: [], // Must NOT have a dropdown or submenu
  },
];
