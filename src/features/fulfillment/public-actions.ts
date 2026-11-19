"use server";

import { headers } from "next/headers";
import { trackOrderPublicly, resolveTrustedClientIp, FulfillmentError } from "./service";
import type { PublicOrderTrackingDTO } from "./types";

export interface PublicTrackingActionResult {
  success: boolean;
  data?: PublicOrderTrackingDTO;
  error?: string;
}

/**
 * Public customer tracking server action.
 * Resolves trusted client IP through established proxy boundaries and executes abuse-protected order lookup.
 */
export async function trackOrderPubliclyAction(
  rawInput: unknown
): Promise<PublicTrackingActionResult> {
  try {
    let headerList: { get(name: string): string | null };
    try {
      headerList = await headers();
    } catch {
      headerList = { get: () => null };
    }

    const { clientIp, error: ipResolutionError } = resolveTrustedClientIp(headerList);
    if (!clientIp) {
      return {
        success: false,
        error: ipResolutionError || "Tracking service is temporarily unavailable. Please try again later.",
      };
    }

    const trackingData = await trackOrderPublicly(rawInput, { clientIp });
    return {
      success: true,
      data: trackingData,
    };
  } catch (err: unknown) {
    if (err instanceof FulfillmentError) {
      return {
        success: false,
        error: err.message,
      };
    }
    return {
      success: false,
      error: "Unable to retrieve tracking details at this time. Please try again later.",
    };
  }
}
