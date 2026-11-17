import { z } from "zod";

export const createReviewSchema = z
  .object({
    productId: z.string().min(1, "Product ID is required").max(100),
    rating: z
      .number({ invalid_type_error: "Rating must be an integer from 1 to 5" })
      .int("Rating must be a whole number")
      .min(1, "Rating must be at least 1 star")
      .max(5, "Rating cannot exceed 5 stars"),
    title: z
      .string()
      .trim()
      .min(3, "Title must be at least 3 characters")
      .max(255, "Title cannot exceed 255 characters"),
    body: z
      .string()
      .trim()
      .min(10, "Review body must be at least 10 characters")
      .max(2000, "Review body cannot exceed 2000 characters"),
  })
  .strict();

export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export interface ReviewDTO {
  id: string;
  productId: string;
  authorName: string;
  rating: number;
  title: string;
  body: string;
  status: "pending" | "approved" | "rejected";
  isVerifiedPurchase: boolean;
  isDemoSample: boolean;
  createdAt: string;
}
