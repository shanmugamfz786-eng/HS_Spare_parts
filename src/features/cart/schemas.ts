import { z } from "zod";

export const addToCartSchema = z
  .object({
    productId: z.string().min(1, "Product ID is required").max(100),
    variantId: z.string().uuid("Invalid variant ID").optional().nullable(),
    quantity: z
      .number({ invalid_type_error: "Quantity must be an integer" })
      .int("Quantity must be a whole number")
      .min(1, "Quantity must be at least 1")
      .max(10, "Maximum allowed quantity per line is 10")
      .default(1),
  })
  .strict();

export type AddToCartInput = z.infer<typeof addToCartSchema>;

export const updateCartItemQuantitySchema = z
  .object({
    cartItemId: z.string().min(1, "Cart item ID is required").max(100),
    quantity: z
      .number({ invalid_type_error: "Quantity must be an integer" })
      .int("Quantity must be a whole number")
      .min(1, "Quantity must be at least 1")
      .max(10, "Maximum allowed quantity per line is 10"),
  })
  .strict();

export type UpdateCartItemQuantityInput = z.infer<typeof updateCartItemQuantitySchema>;

export const removeFromCartSchema = z
  .object({
    cartItemId: z.string().min(1, "Cart item ID is required").max(100),
  })
  .strict();

export type RemoveFromCartInput = z.infer<typeof removeFromCartSchema>;

export interface CartItemDTO {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  sku: string;
  brand: string;
  priceMinor: number;
  quantity: number;
  lineTotalMinor: number;
  availableStock: number;
  inStock: boolean;
  hasStockWarning: boolean;
  stockWarningMessage?: string;
  imageUrl?: string;
  status: string; // active, inactive, discontinued
  isDemo: boolean;
}

export interface CartDTO {
  id: string;
  items: CartItemDTO[];
  itemCount: number;
  totalQuantity: number;
  subtotalMinor: number;
  currency: string;
  isDemoPreview: boolean;
  warnings: string[];
}
