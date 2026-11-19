import { z } from "zod";

// ----------------------------------------------------------------------
// Validation Schemas for Admin Fulfillment & Dispatch
// ----------------------------------------------------------------------

/**
 * Strictly validates that a URL uses the safe "https:" protocol scheme.
 * Rejects http:, javascript:, data:, protocol-relative, and malformed URLs.
 */
export function isSafeHttpsUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" && Boolean(parsed.hostname && parsed.hostname.length > 0);
  } catch {
    return false;
  }
}

export const manualDispatchInputSchema = z.object({
  orderId: z.string().trim().min(1, "Order ID is required."),
  carrier: z
    .string()
    .trim()
    .min(2, "Carrier name must be at least 2 characters.")
    .max(100, "Carrier name is too long."),
  trackingNumber: z
    .string()
    .trim()
    .min(3, "Tracking number must be at least 3 characters.")
    .max(100, "Tracking number is too long."),
  trackingUrl: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine(
      (val) => !val || isSafeHttpsUrl(val),
      { message: "Tracking URL must be a valid HTTPS URL (starting with https://)." }
    ),
});

export type ManualDispatchInput = z.infer<typeof manualDispatchInputSchema>;

export const updateShipmentStatusInputSchema = z.object({
  shipmentId: z.string().trim().min(1, "Shipment ID is required."),
  status: z.enum([
    "created",
    "shipped",
    "in_transit",
    "out_for_delivery",
    "delivered",
    "failed",
    "returned",
  ]),
  note: z.string().trim().max(500, "Note cannot exceed 500 characters.").optional().nullable(),
});

export type UpdateShipmentStatusActionInput = z.infer<typeof updateShipmentStatusInputSchema>;

// ----------------------------------------------------------------------
// Validation Schema for Public Customer Order Tracking
// ----------------------------------------------------------------------

export const publicTrackingLookupSchema = z.object({
  orderReference: z
    .string()
    .trim()
    .min(3, "Order reference is required.")
    .max(50, "Order reference is too long.")
    .regex(/^[A-Za-z0-9_-]+$/, "Order reference contains invalid characters."),
  contact: z
    .string()
    .trim()
    .min(3, "Please enter your registered email address or phone number.")
    .max(255, "Contact entry is too long."),
});

export type PublicTrackingLookupInput = z.infer<typeof publicTrackingLookupSchema>;

/**
 * Normalizes email address for secure case-insensitive comparison.
 */
export function normalizeTrackingEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Normalizes phone numbers by stripping whitespace, dashes, brackets, and leading zero/91 prefixes
 * to produce canonical digit comparisons.
 */
export function normalizeTrackingPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // If 11 digits starting with 0 (e.g., 09876543210), strip the leading 0
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }
  // If 12 digits starting with 91 (e.g., 919876543210), strip the country code
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  return digits;
}

/**
 * Checks if the contact string is formatted as an email.
 */
export function isEmailContact(contact: string): boolean {
  return contact.includes("@") && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.trim());
}
