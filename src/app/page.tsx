import React from "react";
import { HeroSection } from "@/components/home/hero-section";
import { VehicleSelector } from "@/components/home/vehicle-selector";
import { BenefitsStrip } from "@/components/home/benefits-strip";
import { ShopByBrand } from "@/components/home/shop-by-brand";
import { FeaturedCategories } from "@/components/home/featured-categories";
import { FeaturedProducts } from "@/components/home/featured-products";
import { PromotionalBanner } from "@/components/home/promotional-banner";
import { WhyChooseUs } from "@/components/home/why-choose-us";
import { Newsletter } from "@/components/home/newsletter";

export default function HomePage() {
  return (
    <div className="w-full flex flex-col bg-white">
      {/* 1. Full-Width Dark Hero Banner with Red Car */}
      <HeroSection />

      {/* 2. Prominent White/Light Vehicle Finder Card Overlapping Hero */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-12 sm:-mt-16 relative z-20 w-full">
        <VehicleSelector />
      </div>

      {/* 3. Four Pillars Benefits Strip */}
      <BenefitsStrip />

      {/* 4. Shop by Car Brand */}
      <ShopByBrand />

      {/* 5. Shop by Popular Categories */}
      <FeaturedCategories />

      {/* 6. Latest Products (Dark Navy Contrast Section) */}
      <FeaturedProducts />

      {/* 7. Promotional Panels & Fitment Assistance */}
      <PromotionalBanner />

      {/* 8. Why Choose HS Spare Parts */}
      <WhyChooseUs />

      {/* 9. Newsletter Subscription */}
      <Newsletter />
    </div>
  );
}
