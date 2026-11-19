import { z } from "zod";

export const strongPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password cannot exceed 72 characters")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^a-zA-Z0-9]/, "Password must contain at least one special character");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().trim().toLowerCase().email("Please provide a valid email address"),
  password: strongPasswordSchema,
  phone: z
    .string()
    .trim()
    .regex(/^[+]?[0-9\s-]{10,15}$/, "Please provide a valid phone number")
    .optional()
    .or(z.literal("")),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please provide a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please provide a valid email address"),
});

export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;

export const GENERIC_PASSWORD_RESET_SUCCESS_MESSAGE =
  "If an account matches that email address, password recovery instructions will be available when email delivery is configured.";

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(32, "Invalid or malformed reset token"),
  newPassword: strongPasswordSchema,
});

export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;

export const addressSchema = z.object({
  recipient: z.string().trim().min(2, "Recipient name must be at least 2 characters").max(100),
  phone: z.string().trim().min(10, "Phone number must be at least 10 digits"),
  addressLine1: z.string().trim().min(5, "Address line 1 is required").max(255),
  addressLine2: z.string().trim().max(255).optional(),
  city: z.string().trim().min(2, "City is required").max(100),
  stateRegion: z.string().trim().min(2, "State / Region is required").max(100),
  postalCode: z.string().trim().min(5, "Postal code is required").max(20),
  countryCode: z.string().trim().length(2).default("IN"),
  addressType: z.enum(["shipping", "billing"]).default("shipping"),
  isDefault: z.boolean().default(false),
});

export type AddressInput = z.infer<typeof addressSchema>;
