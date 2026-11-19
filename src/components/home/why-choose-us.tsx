import React from "react";
import {
  ShieldCheck,
  CheckCircle2,
  Truck,
  RotateCcw,
  Receipt,
  Headphones,
  Award,
} from "lucide-react";

interface Proposition {
  title: string;
  description: string;
  icon: React.ElementType;
}

const PROPOSITIONS: Proposition[] = [
  {
    title: "OES & OEM Quality Standards",
    description: "Distributor sourcing channels for major automotive manufacturers including Bosch, Brembo, Valeo, Gabriel, Lumax, and Denso.",
    icon: ShieldCheck,
  },
  {
    title: "Precision Fitment Matching",
    description: "Database links model generations, engine codes, and variant attributes to check compatibility before checkout.",
    icon: CheckCircle2,
  },
  {
    title: "Pan-India Logistics Network",
    description: "Doorstep delivery across major Indian postal hubs. Packaging standards reinforced for delicate lighting and heavy mechanical assemblies.",
    icon: Truck,
  },
  {
    title: "10-Day Return Policy (Provisional)",
    description: "Provisional return and exchange window for incompatible parts in original packaging.",
    icon: RotateCcw,
  },
  {
    title: "Technical Specialist Support",
    description: "Expert guidance to confirm OEM codes and part numbers for accurate parts identification.",
    icon: Headphones,
  },
  {
    title: "Transparent & GST-Compliant Pricing",
    description: "Clear, all-inclusive pricing with complete GST breakdown for vehicle owners, independent workshops, and fleet managers.",
    icon: Receipt,
  },
];

export function WhyChooseUs() {
  return (
    <section className="py-14 sm:py-20 bg-[#F8F9FA] border-b border-gray-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-ember/10 border border-ember/20 text-ember text-xs font-bold uppercase tracking-wider mb-3">
            <Award className="w-3.5 h-3.5" />
            <span>The HS Spare Parts Standard</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
            Why Car Owners &amp; Garages Trust HS Spare Parts
          </h2>

          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            We bridge the gap between complex automotive manufacturing catalogues and everyday vehicle owners with structured compatibility, quality parts, and reliable logistics.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {PROPOSITIONS.map((prop, idx) => {
            const Icon = prop.icon;
            return (
              <div
                key={idx}
                className="bg-white rounded-xl border border-gray-200/90 shadow-sm hover:shadow-md hover:border-ember/40 transition-all p-6 flex flex-col justify-between group"
              >
                <div>
                  <div className="w-11 h-11 rounded-xl bg-ember/10 border border-ember/20 text-ember flex items-center justify-center mb-4 group-hover:bg-ember group-hover:text-white transition-colors duration-200">
                    <Icon className="w-5 h-5" />
                  </div>

                  <h3 className="text-base font-bold text-gray-900 mb-2 group-hover:text-ember transition-colors">
                    {prop.title}
                  </h3>

                  <p className="text-xs text-gray-500 leading-relaxed">
                    {prop.description}
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
