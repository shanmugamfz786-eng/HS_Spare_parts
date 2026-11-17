import { z } from "zod";

export const indianPhoneRegex = /^[6-9]\d{9}$/;
export const indianPostalCodeRegex = /^\d{6}$/;

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name cannot exceed 100 characters"),
    phone: z
      .string()
      .trim()
      .regex(indianPhoneRegex, "Please enter a valid 10-digit Indian mobile number")
      .optional()
      .nullable()
      .or(z.literal("")),
  })
  .strict();

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const createAddressSchema = z
  .object({
    recipient: z
      .string()
      .trim()
      .min(2, "Recipient name must be at least 2 characters")
      .max(100, "Recipient name cannot exceed 100 characters"),
    phone: z
      .string()
      .trim()
      .regex(indianPhoneRegex, "Please enter a valid 10-digit mobile number"),
    addressLine1: z
      .string()
      .trim()
      .min(5, "Address must be at least 5 characters")
      .max(255, "Address cannot exceed 255 characters"),
    addressLine2: z.string().trim().max(255).optional().nullable().or(z.literal("")),
    city: z.string().trim().min(2, "City is required").max(100),
    stateRegion: z.string().trim().min(2, "State/Region is required").max(100),
    postalCode: z.string().trim().regex(indianPostalCodeRegex, "Please enter a valid 6-digit PIN code"),
    countryCode: z.string().trim().length(2).default("IN"),
    addressType: z.enum(["shipping", "billing"]).default("shipping"),
    isDefault: z.boolean().default(false),
  })
  .strict();

export type CreateAddressInput = z.infer<typeof createAddressSchema>;

export const updateAddressSchema = z
  .object({
    addressId: z.string().uuid("Invalid address ID"),
    recipient: z
      .string()
      .trim()
      .min(2, "Recipient name must be at least 2 characters")
      .max(100, "Recipient name cannot exceed 100 characters"),
    phone: z
      .string()
      .trim()
      .regex(indianPhoneRegex, "Please enter a valid 10-digit mobile number"),
    addressLine1: z
      .string()
      .trim()
      .min(5, "Address must be at least 5 characters")
      .max(255, "Address cannot exceed 255 characters"),
    addressLine2: z.string().trim().max(255).optional().nullable().or(z.literal("")),
    city: z.string().trim().min(2, "City is required").max(100),
    stateRegion: z.string().trim().min(2, "State/Region is required").max(100),
    postalCode: z.string().trim().regex(indianPostalCodeRegex, "Please enter a valid 6-digit PIN code"),
    countryCode: z.string().trim().length(2).default("IN"),
    addressType: z.enum(["shipping", "billing"]).default("shipping"),
    isDefault: z.boolean().default(false),
  })
  .strict();

export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;

export const deleteAddressSchema = z
  .object({
    addressId: z.string().uuid("Invalid address ID"),
  })
  .strict();

export type DeleteAddressInput = z.infer<typeof deleteAddressSchema>;

export const setDefaultAddressSchema = z
  .object({
    addressId: z.string().uuid("Invalid address ID"),
  })
  .strict();

export type SetDefaultAddressInput = z.infer<typeof setDefaultAddressSchema>;

export interface CustomerProfileDTO {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  status: string;
  roles: string[];
  createdAt: string;
}

export interface CustomerAddressDTO {
  id: string;
  userId: string;
  recipient: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  stateRegion: string;
  postalCode: string;
  countryCode: string;
  addressType: "shipping" | "billing";
  isDefault: boolean;
  createdAt: string;
}
