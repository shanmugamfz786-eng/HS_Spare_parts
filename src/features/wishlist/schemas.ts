import { z } from "zod";

export const addToWishlistSchema = z
  .object({
    productId: z.string().min(1, "Product ID is required").max(100),
  })
  .strict();

export type AddToWishlistInput = z.infer<typeof addToWishlistSchema>;

export const removeFromWishlistSchema = z
  .object({
    productId: z.string().min(1, "Product ID is required").max(100),
  })
  .strict();

export type RemoveFromWishlistInput = z.infer<typeof removeFromWishlistSchema>;

export interface WishlistItemDTO {
  id: string;
  productId: string;
  name: string;
  sku: string;
  brand: string;
  priceMinor: number;
  inStock: boolean;
  imageUrl?: string;
  addedAt: string;
}

export interface WishlistDTO {
  id: string;
  items: WishlistItemDTO[];
  totalCount: number;
}
