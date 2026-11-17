"use server";

import { revalidatePath } from "next/cache";
import { submitProductReview, getProductReviews } from "./service";
import type { CreateReviewInput, ReviewDTO } from "./schemas";
import { createReviewSchema } from "./schemas";

export interface ReviewActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function submitProductReviewAction(rawInput: CreateReviewInput): Promise<ReviewActionResult<ReviewDTO>> {
  try {
    const parsed = createReviewSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0]?.message || "Invalid review data." };
    }

    const review = await submitProductReview(parsed.data);
    revalidatePath(`/products/${parsed.data.productId}`);
    return { success: true, data: review };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to submit review.";
    console.error("[ReviewAction] submitReview error:", error);
    return { success: false, error: message };
  }
}

export async function getProductReviewsAction(productId: string): Promise<ReviewActionResult<ReviewDTO[]>> {
  try {
    const reviews = await getProductReviews(productId);
    return { success: true, data: reviews };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load reviews.";
    console.error("[ReviewAction] getReviews error:", error);
    return { success: false, error: message };
  }
}
