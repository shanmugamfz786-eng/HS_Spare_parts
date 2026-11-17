"use server";

import { getCurrentUser } from "@/features/auth/service";
import { generateCheckoutQuote } from "./service";
import type { GetCheckoutQuoteInput, CheckoutQuoteDTO } from "./schemas";
import { getCheckoutQuoteSchema } from "./schemas";

export interface CheckoutActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  isUnauthenticated?: boolean;
}

export async function getCheckoutQuoteAction(
  rawInput?: GetCheckoutQuoteInput
): Promise<CheckoutActionResult<CheckoutQuoteDTO>> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return {
        success: false,
        error: "Please sign in to proceed with checkout.",
        isUnauthenticated: true,
      };
    }

    const parsed = getCheckoutQuoteSchema.safeParse(rawInput ?? {});
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message || "Invalid checkout input parameters.",
      };
    }

    const quote = await generateCheckoutQuote(currentUser.id, parsed.data.addressId);
    return { success: true, data: quote };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to generate checkout quote.";
    console.error("[CheckoutAction] getQuote error:", error);
    return { success: false, error: message };
  }
}
