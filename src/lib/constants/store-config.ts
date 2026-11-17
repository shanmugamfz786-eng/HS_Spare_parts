/**
 * HS Spare Parts — Store Configuration & Business Information
 *
 * NOTE: The business claims, contact numbers, and policies below are
 * PROVISIONAL PLACEHOLDERS awaiting explicit confirmation from the business owner.
 *
 * In accordance with project instructions (docs/01_PRODUCT_REQUIREMENTS.md & docs/02_UI_UX_DESIGN_SYSTEM.md):
 * Unconfirmed details must never be stated as audited facts.
 */

export interface StoreContactConfig {
  companyName: string;
  tagline: string;
  legalEntityName: string;
  isProvisional: boolean;
  phoneDisplay: string;
  phoneRaw: string;
  isWhatsAppEnabled: boolean;
  whatsappDisplay: string;
  whatsappNumber: string | null;
  supportEmail: string;
  addressLines: string[];
  operatingHours: string;
  socialLinks: {
    whatsapp?: string;
  };
}

export interface StorePolicyConfig {
  returnWindowDays: number;
  returnPolicyNote: string;
  shippingClaim: string;
  warrantyClaim: string;
  taxPolicy: string;
  claimsDisclaimer: string;
}

export const STORE_CONTACT_CONFIG: StoreContactConfig = {
  companyName: "HS Spare Parts",
  tagline: "Right Part. Right Price.",
  legalEntityName: "HS Spare Parts (Provisional Business Entity)",
  isProvisional: true,
  phoneDisplay: "+91 (Store Phone Pending Confirmation)",
  phoneRaw: "910000000000",
  isWhatsAppEnabled: false,
  whatsappDisplay: "WhatsApp Support (Inactive — Pending Configuration)",
  whatsappNumber: null,
  supportEmail: "support@example.com (Configurable)",
  addressLines: [
    "Industrial Distribution Facility (Address to be confirmed by owner)",
    "New Delhi, India",
  ],
  operatingHours: "Mon – Sat: 9:30 AM – 7:00 PM IST (Provisional)",
  socialLinks: {},
};

export const STORE_POLICY_CONFIG: StorePolicyConfig = {
  returnWindowDays: 10,
  returnPolicyNote: "Provisional 10-day return policy (Subject to business owner approval)",
  shippingClaim: "Pan-India delivery network (Courier partners to be configured)",
  warrantyClaim: "Standard OEM/OES warranty terms as per manufacturer policy",
  taxPolicy: "Prices inclusive of applicable GST (Pending tax configuration)",
  claimsDisclaimer:
    "Notice: Product compatibility hints, service claims, and contact details are shown as UI layout placeholders pending final business verification.",
};
