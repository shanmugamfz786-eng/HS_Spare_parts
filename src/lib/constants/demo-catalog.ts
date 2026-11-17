export interface DemoProduct {
  id: string;
  name: string;
  brand: string;
  sku: string;
  categorySlug: string;
  categoryName: string;
  priceMinor: number;
  originalPriceMinor?: number;
  discountPercentage?: number;
  sampleRating: number;
  sampleReviewCount: number;
  isDemo: true;
  provisionalStockStatus: string;
  fitmentHint: string;
  oemReference: string;
  badge?: string;
  description: string;
  imagePlaceholderCategory: string;
}

export interface DemoVehicleMake {
  id: string;
  name: string;
  slug: string;
  models: {
    name: string;
    slug: string;
    years: number[];
    variants: string[];
  }[];
}

export const POPULAR_VEHICLE_MAKES: DemoVehicleMake[] = [
  {
    id: "maruti-suzuki",
    name: "Maruti Suzuki",
    slug: "maruti-suzuki",
    models: [
      {
        name: "Swift",
        slug: "swift",
        years: [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015],
        variants: ["1.2L K12M Petrol (Manual)", "1.2L DualJet AMT", "1.3L DDiS Diesel"],
      },
      {
        name: "Baleno",
        slug: "baleno",
        years: [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015],
        variants: ["1.2L DualJet MT", "1.2L K-Series AGS", "1.3L DDiS"],
      },
      {
        name: "Brezza / Vitara Brezza",
        slug: "brezza",
        years: [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016],
        variants: ["1.5L K15C Smart Hybrid", "1.3L DDiS Diesel MT"],
      },
      {
        name: "Ertiga",
        slug: "ertiga",
        years: [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016],
        variants: ["1.5L K15C Petrol/CNG", "1.3L DDiS Diesel"],
      },
    ],
  },
  {
    id: "hyundai",
    name: "Hyundai",
    slug: "hyundai",
    models: [
      {
        name: "Creta",
        slug: "creta",
        years: [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015],
        variants: ["1.5L MPi Petrol MT/IVT", "1.5L U2 CRDi Diesel", "1.4L Turbo GDi DCT"],
      },
      {
        name: "i20",
        slug: "i20",
        years: [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016],
        variants: ["1.2L Kappa Petrol", "1.0L Turbo GDi iMT/DCT", "1.5L CRDi Diesel"],
      },
      {
        name: "Venue",
        slug: "venue",
        years: [2024, 2023, 2022, 2021, 2020, 2019],
        variants: ["1.2L Kappa MT", "1.0L Turbo DCT", "1.5L CRDi Diesel"],
      },
    ],
  },
  {
    id: "tata",
    name: "Tata",
    slug: "tata",
    models: [
      {
        name: "Nexon",
        slug: "nexon",
        years: [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017],
        variants: ["1.2L Revotron Turbo Petrol", "1.5L Revotorq Diesel", "EV Prime/Max"],
      },
      {
        name: "Harrier",
        slug: "harrier",
        years: [2024, 2023, 2022, 2021, 2020, 2019],
        variants: ["2.0L Kryotec Diesel 6MT", "2.0L Kryotec Diesel 6AT"],
      },
      {
        name: "Altroz",
        slug: "altroz",
        years: [2024, 2023, 2022, 2021, 2020],
        variants: ["1.2L Revotron MT", "1.2L i-Turbo", "1.5L Revotorq Diesel"],
      },
    ],
  },
  {
    id: "mahindra",
    name: "Mahindra",
    slug: "mahindra",
    models: [
      {
        name: "Thar",
        slug: "thar",
        years: [2024, 2023, 2022, 2021, 2020],
        variants: ["2.0L mStallion Turbo Petrol", "2.2L mHawk Diesel 4x4", "1.5L D117 RWD"],
      },
      {
        name: "XUV700",
        slug: "xuv700",
        years: [2024, 2023, 2022, 2021],
        variants: ["2.0L Turbo Petrol MT/AT", "2.2L mHawk CRDe MT/AT AWD"],
      },
      {
        name: "Scorpio-N / Classic",
        slug: "scorpio",
        years: [2024, 2023, 2022, 2021, 2020, 2019, 2018],
        variants: ["2.2L mHawk Diesel 4WD", "2.0L mStallion Petrol"],
      },
    ],
  },
  {
    id: "toyota",
    name: "Toyota",
    slug: "toyota",
    models: [
      {
        name: "Innova Crysta / Hycross",
        slug: "innova",
        years: [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016],
        variants: ["2.4L 2GD-FTV Diesel MT", "2.0L Strong Hybrid e-CVT", "2.8L 1GD-FTV AT"],
      },
      {
        name: "Fortuner",
        slug: "fortuner",
        years: [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016],
        variants: ["2.8L 1GD-FTV Diesel 4x4 MT/AT", "2.7L 2TR-FE Petrol"],
      },
      {
        name: "Urban Cruiser Hyryder",
        slug: "hyryder",
        years: [2024, 2023, 2022],
        variants: ["1.5L NeoDrive K15C", "1.5L Intelligent Hybrid e-CVT"],
      },
    ],
  },
];

export const DEMO_FEATURED_PRODUCTS: DemoProduct[] = [
  {
    id: "demo-brembo-pads",
    name: "Brembo Premium Ceramic Front Brake Pad Set (Sample Specification)",
    brand: "Brembo",
    sku: "DEMO-BP-8492",
    categorySlug: "brake",
    categoryName: "Brake",
    priceMinor: 285000, // Provisional layout price: ₹2,850.00
    originalPriceMinor: 340000,
    discountPercentage: 16,
    sampleRating: 4.8,
    sampleReviewCount: 142,
    isDemo: true,
    provisionalStockStatus: "Sample Layout Item (Not Active Stock)",
    fitmentHint: "Sample reference: Swift (2018-2023), Baleno",
    oemReference: "Sample OEM: 55810M68P00",
    badge: "Demo Showcase",
    description: "Sample catalog product specification demonstrating layout typography, rating displays, and pricing format.",
    imagePlaceholderCategory: "brake",
  },
  {
    id: "demo-gabriel-shock",
    name: "Gabriel Gas-Charged Rear Shock Absorber Pair (Sample Specification)",
    brand: "Gabriel",
    sku: "DEMO-SA-1120",
    categorySlug: "suspension-steering",
    categoryName: "Suspension & Steering",
    priceMinor: 389000,
    originalPriceMinor: 460000,
    discountPercentage: 15,
    sampleRating: 4.9,
    sampleReviewCount: 96,
    isDemo: true,
    provisionalStockStatus: "Sample Layout Item (Not Active Stock)",
    fitmentHint: "Sample reference: Hyundai Creta (2016-2020)",
    oemReference: "Sample OEM: 55310-M0000",
    badge: "Demo Showcase",
    description: "Sample catalog product specification demonstrating suspension item presentation.",
    imagePlaceholderCategory: "suspension",
  },
  {
    id: "demo-valeo-clutch",
    name: "Valeo Complete Clutch Kit with Bearing (Sample Specification)",
    brand: "Valeo",
    sku: "DEMO-CK-9230",
    categorySlug: "transmission",
    categoryName: "Transmission",
    priceMinor: 645000,
    originalPriceMinor: 780000,
    discountPercentage: 17,
    sampleRating: 4.7,
    sampleReviewCount: 78,
    isDemo: true,
    provisionalStockStatus: "Sample Layout Item (Not Active Stock)",
    fitmentHint: "Sample reference: Tata Nexon 1.5 Diesel",
    oemReference: "Sample OEM: 288725400101",
    badge: "Demo Showcase",
    description: "Sample catalog product specification demonstrating transmission item presentation.",
    imagePlaceholderCategory: "transmission",
  },
  {
    id: "demo-bosch-plugs",
    name: "Bosch Platinum-Iridium Spark Plug Pack (Sample Specification)",
    brand: "Bosch",
    sku: "DEMO-SP-4019",
    categorySlug: "electrical",
    categoryName: "Electrical",
    priceMinor: 165000,
    originalPriceMinor: 210000,
    discountPercentage: 21,
    sampleRating: 4.9,
    sampleReviewCount: 210,
    isDemo: true,
    provisionalStockStatus: "Sample Layout Item (Not Active Stock)",
    fitmentHint: "Sample reference: Honda City i-VTEC",
    oemReference: "Sample OEM: 12290-RB0-J01",
    badge: "Demo Showcase",
    description: "Sample catalog product specification demonstrating electrical components presentation.",
    imagePlaceholderCategory: "electrical",
  },
  {
    id: "demo-denso-radiator",
    name: "Denso Multi-Louver Radiator Assembly (Sample Specification)",
    brand: "Denso",
    sku: "DEMO-RD-5501",
    categorySlug: "hvac",
    categoryName: "HVAC",
    priceMinor: 520000,
    originalPriceMinor: 610000,
    discountPercentage: 15,
    sampleRating: 4.6,
    sampleReviewCount: 43,
    isDemo: true,
    provisionalStockStatus: "Sample Layout Item (Not Active Stock)",
    fitmentHint: "Sample reference: Mahindra Scorpio 2.2",
    oemReference: "Sample OEM: 0303BC0341N",
    badge: "Demo Showcase",
    description: "Sample catalog product specification demonstrating cooling components presentation.",
    imagePlaceholderCategory: "hvac",
  },
  {
    id: "demo-lumax-headlight",
    name: "Lumax Projector Headlight Assembly RH (Sample Specification)",
    brand: "Lumax",
    sku: "DEMO-HL-7712",
    categorySlug: "body-parts",
    categoryName: "Body Parts",
    priceMinor: 485000,
    originalPriceMinor: 560000,
    discountPercentage: 13,
    sampleRating: 4.7,
    sampleReviewCount: 52,
    isDemo: true,
    provisionalStockStatus: "Sample Layout Item (Not Active Stock)",
    fitmentHint: "Sample reference: Maruti Suzuki Brezza",
    oemReference: "Sample OEM: 35120M66R00",
    badge: "Demo Showcase",
    description: "Sample catalog product specification demonstrating body & lighting components presentation.",
    imagePlaceholderCategory: "body",
  },
  {
    id: "demo-mann-filters",
    name: "Mann-Filter Service Tri-Pack (Sample Specification)",
    brand: "Mann-Filter",
    sku: "DEMO-FK-3382",
    categorySlug: "engine-parts",
    categoryName: "Engine Parts",
    priceMinor: 189000,
    originalPriceMinor: 240000,
    discountPercentage: 21,
    sampleRating: 4.8,
    sampleReviewCount: 188,
    isDemo: true,
    provisionalStockStatus: "Sample Layout Item (Not Active Stock)",
    fitmentHint: "Sample reference: Toyota Innova Crysta Diesel",
    oemReference: "Sample OEM: 04152-YZZA1",
    badge: "Demo Showcase",
    description: "Sample catalog product specification demonstrating filter service kits presentation.",
    imagePlaceholderCategory: "engine",
  },
  {
    id: "demo-bosch-wiper",
    name: "Bosch Aerodynamic Wiper Blades Pair (Sample Specification)",
    brand: "Bosch",
    sku: "DEMO-WP-2418",
    categorySlug: "accessories",
    categoryName: "Accessories",
    priceMinor: 89000,
    originalPriceMinor: 115000,
    discountPercentage: 23,
    sampleRating: 4.7,
    sampleReviewCount: 320,
    isDemo: true,
    provisionalStockStatus: "Sample Layout Item (Not Active Stock)",
    fitmentHint: "Sample reference: Universal J-Hook (24\" + 18\")",
    oemReference: "Universal Fitment Reference",
    badge: "Demo Showcase",
    description: "Sample catalog product specification demonstrating accessory item presentation.",
    imagePlaceholderCategory: "accessories",
  },
];
