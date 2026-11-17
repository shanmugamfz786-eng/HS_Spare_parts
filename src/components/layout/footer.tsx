import React from "react";
import Link from "next/link";
import {
  PhoneCall,
  Mail,
  MapPin,
  ShieldCheck,
  Truck,
  RotateCcw,
  CreditCard,
  Lock,
  Info,
} from "lucide-react";
import { NAVBAR_CATEGORIES } from "@/lib/constants/navigation";
import { STORE_CONTACT_CONFIG, STORE_POLICY_CONFIG } from "@/lib/constants/store-config";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-ink-raised border-t border-gray-800 text-gray-300 text-sm mt-auto">
      {/* Trust & Value Proposition Strip */}
      <div className="border-b border-gray-800/80 bg-ink py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-brand bg-ember/10 border border-ember/20 flex items-center justify-center flex-shrink-0 text-ember">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-paper font-bold text-sm">Genuine OES Standards</h4>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                Catalogue architecture designed for tier-1 OEM and OES certified replacement components.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-brand bg-ember/10 border border-ember/20 flex items-center justify-center flex-shrink-0 text-ember">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-paper font-bold text-sm">Pan-India Courier Network</h4>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                {STORE_POLICY_CONFIG.shippingClaim}.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-brand bg-ember/10 border border-ember/20 flex items-center justify-center flex-shrink-0 text-ember">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-paper font-bold text-sm">Provisional Return Window</h4>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                {STORE_POLICY_CONFIG.returnPolicyNote}.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-brand bg-ember/10 border border-ember/20 flex items-center justify-center flex-shrink-0 text-ember">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-paper font-bold text-sm">Encrypted Architecture</h4>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                Planned payment integrations built with bank-grade encryption for UPI, Cards & NetBanking.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Links */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Company & Brand Column */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-brand bg-ember flex items-center justify-center font-black text-xl text-paper">
                HS
              </div>
              <div>
                <span className="font-extrabold text-xl tracking-tight text-paper block">
                  {STORE_CONTACT_CONFIG.companyName.toUpperCase()}
                </span>
                <span className="text-xs text-ember font-medium uppercase tracking-widest block">
                  {STORE_CONTACT_CONFIG.tagline}
                </span>
              </div>
            </div>

            <p className="text-xs text-gray-400 leading-relaxed max-w-sm">
              Digital storefront foundation for precision automotive replacement components in India. Cataloguing mechanical, electrical, cooling, and body replacement parts.
            </p>

            {/* WhatsApp Support Status */}
            <div className="pt-2">
              {STORE_CONTACT_CONFIG.isWhatsAppEnabled && STORE_CONTACT_CONFIG.socialLinks.whatsapp ? (
                <a
                  href={STORE_CONTACT_CONFIG.socialLinks.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-brand bg-whatsapp hover:bg-whatsapp/90 text-paper font-semibold text-xs shadow-md transition-colors"
                >
                  <PhoneCall className="w-4 h-4" />
                  <span>{STORE_CONTACT_CONFIG.whatsappDisplay}</span>
                </a>
              ) : (
                <span
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-brand bg-ink-raised border border-gray-800 text-gray-400 font-semibold text-xs cursor-default"
                  title="WhatsApp support channel disabled until official business number is configured."
                >
                  <PhoneCall className="w-4 h-4 text-gray-500" />
                  <span>{STORE_CONTACT_CONFIG.whatsappDisplay}</span>
                </span>
              )}
            </div>
          </div>

          {/* Quick Categories Column */}
          <div>
            <h3 className="text-paper font-bold text-xs uppercase tracking-wider mb-4">
              Top Categories
            </h3>
            <ul className="space-y-2 text-xs">
              {NAVBAR_CATEGORIES.slice(0, 6).map((cat) => (
                <li key={cat.id}>
                  <Link
                    href={cat.href}
                    className="text-gray-400 hover:text-ember transition-colors"
                  >
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Customer Service Column */}
          <div>
            <h3 className="text-paper font-bold text-xs uppercase tracking-wider mb-4">
              Customer Care
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/track-order" className="text-gray-400 hover:text-ember transition-colors">
                  Track Shipment Status
                </Link>
              </li>
              <li>
                <Link href="/pages/shipping-policy" className="text-gray-400 hover:text-ember transition-colors">
                  Shipping Policy (Provisional)
                </Link>
              </li>
              <li>
                <Link href="/pages/return-refund-policy" className="text-gray-400 hover:text-ember transition-colors">
                  Returns & Refunds (Provisional)
                </Link>
              </li>
              <li>
                <Link href="/pages/fitment-guarantee" className="text-gray-400 hover:text-ember transition-colors">
                  Fitment Guarantee Notes
                </Link>
              </li>
              <li>
                <Link href="/pages/faq" className="text-gray-400 hover:text-ember transition-colors">
                  Help & FAQs
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Information Column */}
          <div>
            <h3 className="text-paper font-bold text-xs uppercase tracking-wider mb-4">
              Contact & Business Info
            </h3>
            <ul className="space-y-3 text-xs text-gray-400">
              <li className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-ember flex-shrink-0 mt-0.5" />
                <span>{STORE_CONTACT_CONFIG.addressLines.join(", ")}</span>
              </li>
              <li className="flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-ember flex-shrink-0" />
                <span>{STORE_CONTACT_CONFIG.phoneDisplay}</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-ember flex-shrink-0" />
                <span>{STORE_CONTACT_CONFIG.supportEmail}</span>
              </li>
              <li className="text-[11px] text-gray-400 pt-1">
                {STORE_CONTACT_CONFIG.operatingHours}
              </li>
            </ul>
          </div>
        </div>

        {/* Provisional Claims Disclaimer Note */}
        <div className="mt-8 pt-6 border-t border-gray-800/60 text-xs text-gray-400 flex items-start gap-2">
          <Info className="w-4 h-4 text-amber-500/80 flex-shrink-0 mt-0.5" />
          <span>
            {STORE_POLICY_CONFIG.claimsDisclaimer}
          </span>
        </div>
      </div>

      {/* Bottom Legal & Payment Badges Bar */}
      <div className="border-t border-gray-800 bg-ink py-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-gray-400">
          <p>
            © {currentYear} {STORE_CONTACT_CONFIG.companyName}. All rights reserved. Precision Automotive Solutions.
          </p>

          <div className="flex items-center gap-4 text-xs">
            <Link href="/pages/terms" className="hover:text-ember transition-colors">
              Terms of Service
            </Link>
            <span>•</span>
            <Link href="/pages/privacy-policy" className="hover:text-ember transition-colors">
              Privacy Policy
            </Link>
            <span>•</span>
            <Link href="/pages/disclaimer" className="hover:text-ember transition-colors">
              OES Disclaimer
            </Link>
          </div>

          <div className="flex items-center gap-2 text-gray-400 text-[11px]">
            <CreditCard className="w-4 h-4 text-gray-400" />
            <span>Planned Integrations: UPI • RuPay • Visa • Mastercard • NetBanking</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
