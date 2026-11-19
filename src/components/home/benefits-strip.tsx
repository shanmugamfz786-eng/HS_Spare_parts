import React from "react";
import { ShieldCheck, Truck, RotateCcw, Wrench } from "lucide-react";
import { STORE_POLICY_CONFIG } from "@/lib/constants/store-config";

export function BenefitsStrip() {
  const benefits = [
    {
      icon: ShieldCheck,
      title: "New & Pre-Owned Parts",
      description: "Explore both factory-new components and inspected pre-owned spares in one catalogue.",
    },
    {
      icon: Truck,
      title: "Pan-India Shipping Network",
      description: `${STORE_POLICY_CONFIG.shippingClaim}. Secure packaging for transit protection.`,
    },
    {
      icon: RotateCcw,
      title: `${STORE_POLICY_CONFIG.returnWindowDays}-Day Return Policy (Provisional)`,
      description: "Return and exchange window on uninstalled parts in original packaging.",
    },
    {
      icon: Wrench,
      title: "Vehicle Fitment Assistance",
      description: "Vehicle compatibility guidance cross-referenced by model generation and OEM part references.",
    },
  ];

  return (
    <section className="py-10 sm:py-12 bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {benefits.map((b, idx) => {
            const Icon = b.icon;
            return (
              <div
                key={idx}
                className="bg-[#F8F9FA] rounded-2xl border border-gray-200/80 shadow-sm hover:shadow-md transition-shadow p-5 flex items-start gap-4 group"
              >
                <div className="w-12 h-12 rounded-xl bg-ember/10 border border-ember/20 flex items-center justify-center flex-shrink-0 text-ember group-hover:bg-ember group-hover:text-white transition-colors duration-200">
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-gray-900 tracking-tight">
                    {b.title}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    {b.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
