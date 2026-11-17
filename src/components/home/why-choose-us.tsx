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
    title: "OES & OEM Quality Standards (Provisional)",
    description: "Planned sourcing through authenticated distributor channels for tier-1 manufacturers including Bosch, Brembo, Valeo, Gabriel, Lumax, and Denso.",
    icon: ShieldCheck,
  },
  {
    title: "Precision Fitment Matching (Database Preview)",
    description: "Database links model generations, engine codes, and variant attributes to verify compatibility before checkout.",
    icon: CheckCircle2,
  },
  {
    title: "Pan-India Logistics Network (Pending Carrier Setup)",
    description: "Doorstep delivery across major Indian postal hubs. Packaging standards reinforced for delicate lighting and heavy mechanical assemblies.",
    icon: Truck,
  },
  {
    title: "10-Day Return Window (Provisional Policy)",
    description: "Provisional 10-day return policy for incompatible or defective parts in original packaging (subject to final business confirmation).",
    icon: RotateCcw,
  },
  {
    title: "Technical Specialist Desk (Pending Configuration)",
    description: "Assistance to confirm OEM codes and part numbers once official customer service channels are activated.",
    icon: Headphones,
  },
  {
    title: "Transparent & GST-Compliant Pricing (Provisional)",
    description: "Clear, all-inclusive pricing with GST breakdown for retail vehicle owners, independent workshops, and fleet managers.",
    icon: Receipt,
  },
];

export function WhyChooseUs() {
  return (
    <section className="py-16 bg-ink border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-ember/10 border border-ember/30 text-ember text-xs font-bold uppercase tracking-wider mb-3">
            <Award className="w-3.5 h-3.5" />
            <span>The HS Spare Parts Standard</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-paper tracking-tight">
            Why Car Owners & Garages Trust HS Spare Parts
          </h2>

          <p className="text-sm text-gray-400 mt-2 leading-relaxed">
            We bridge the gap between complex automotive manufacturing catalogues and everyday vehicle owners with verified compatibility, authentic parts, and fast logistics.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {PROPOSITIONS.map((prop, idx) => {
            const Icon = prop.icon;
            return (
              <div
                key={idx}
                className="rounded-card bg-ink-raised border border-gray-800 p-6 hover:border-ember/40 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="w-10 h-10 rounded-brand bg-ink border border-gray-700 text-ember flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5" />
                  </div>

                  <h3 className="text-base font-bold text-paper mb-2">
                    {prop.title}
                  </h3>

                  <p className="text-xs text-gray-400 leading-relaxed">
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
