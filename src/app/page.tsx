import React from "react";
import { HeroSection } from "@/components/home/hero-section";
import { FeaturedCategories } from "@/components/home/featured-categories";
import { FeaturedProducts } from "@/components/home/featured-products";
import { PromotionalBanner } from "@/components/home/promotional-banner";
import { WhyChooseUs } from "@/components/home/why-choose-us";
import { Newsletter } from "@/components/home/newsletter";

export default function HomePage() {
  return (
    <div className="w-full flex flex-col">
      {/* 1. Hero Banner with Vehicle Selector */}
      <HeroSection />

      {/* 2. Shop by Popular Categories */}
      <FeaturedCategories />

      {/* 3. Featured Parts & Demo Products */}
      <FeaturedProducts />

      {/* 4. Promotional Offers & WhatsApp Fitment Specialist */}
      <PromotionalBanner />

      {/* 5. Why Choose HS Spare Parts (Trust Propositions) */}
      <WhyChooseUs />

      {/* 6. Newsletter Subscription */}
      <Newsletter />
    </div>
  );
}
