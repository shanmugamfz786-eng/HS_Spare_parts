"use server";

import { registerSchema, loginSchema } from "./schemas";
import { registerCustomer, authenticateCustomer, signOutUser, getCurrentUser } from "./service";
import { setSessionCookie } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { checkSharedRateLimit, resetSharedRateLimit } from "@/lib/auth/rate-limit";
import { cookies } from "next/headers";
import { CART_COOKIE_NAME, mergeGuestCartIntoUserCart, clearGuestCartCookie } from "@/features/cart/service";

export interface AuthActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

/**
 * Server Action: Customer Registration
 */
export async function registerAction(
  _prevState: unknown,
  formData: FormData
): Promise<AuthActionResult> {
  const rawData: Record<string, unknown> = {};
  formData.forEach((value, key) => {
    rawData[key] = value;
  });

  // 1. Zod input validation
  const parsed = registerSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please correct the highlighted form errors.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // 2. Shared rate limiting check (PostgreSQL-backed atomic UPSERT: 5 attempts per 15 mins per email)
  const rateLimitKey = `register:${parsed.data.email}`;
  const db = getDb();
  const rateCheck = await checkSharedRateLimit(db, rateLimitKey, { maxAttempts: 5, windowSeconds: 15 * 60 });
  if (!rateCheck.success) {
    if (rateCheck.isServiceUnavailable) {
      return {
        success: false,
        error: "Authentication service is temporarily unavailable. Please try again shortly.",
      };
    }
    return {
      success: false,
      error: `Too many attempts. Please try again in ${rateCheck.resetInSeconds} seconds.`,
    };
  }

  // 3. Service execution
  try {
    const { user, sessionToken } = await registerCustomer(parsed.data);
    await setSessionCookie(sessionToken);
    await resetSharedRateLimit(db, rateLimitKey);

    // Merge guest cart if one exists
    try {
      const cookieStore = await cookies();
      const guestCartToken = cookieStore.get(CART_COOKIE_NAME)?.value;
      if (guestCartToken) {
        await mergeGuestCartIntoUserCart(user.id, guestCartToken);
      }
    } catch (mergeErr) {
      console.error("[Auth] Cart merge error on register:", mergeErr);
    }

    return {
      success: true,
      data: { user },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Registration failed";
    if (message.startsWith("EMAIL_EXISTS")) {
      return {
        success: false,
        fieldErrors: { email: ["An account with this email address already exists."] },
      };
    }
    if (message.startsWith("DATABASE_UNAVAILABLE")) {
      return {
        success: false,
        error: "Database service is temporarily unavailable. Please try again shortly.",
      };
    }
    return {
      success: false,
      error: "An unexpected error occurred during registration. Please try again.",
    };
  }
}

/**
 * Server Action: Customer Login
 */
export async function loginAction(
  _prevState: unknown,
  formData: FormData
): Promise<AuthActionResult> {
  const rawData: Record<string, unknown> = {};
  formData.forEach((value, key) => {
    rawData[key] = value;
  });

  // 1. Zod input validation
  const parsed = loginSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      error: "Invalid email or password format.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // 2. Shared rate limiting (brute-force defense: PostgreSQL-backed atomic UPSERT: 5 attempts per 15 mins per email)
  const rateLimitKey = `login:${parsed.data.email}`;
  const db = getDb();
  const rateCheck = await checkSharedRateLimit(db, rateLimitKey, { maxAttempts: 5, windowSeconds: 15 * 60 });
  if (!rateCheck.success) {
    if (rateCheck.isServiceUnavailable) {
      return {
        success: false,
        error: "Authentication service is temporarily unavailable. Please try again shortly.",
      };
    }
    return {
      success: false,
      error: `Too many failed login attempts. Please wait ${rateCheck.resetInSeconds} seconds before trying again.`,
    };
  }

  // 3. Service execution
  try {
    const { user, sessionToken } = await authenticateCustomer(parsed.data.email, parsed.data.password);
    await setSessionCookie(sessionToken);
    await resetSharedRateLimit(db, rateLimitKey);

    // Merge guest cart if one exists
    try {
      const cookieStore = await cookies();
      const guestCartToken = cookieStore.get(CART_COOKIE_NAME)?.value;
      if (guestCartToken) {
        await mergeGuestCartIntoUserCart(user.id, guestCartToken);
      }
    } catch (mergeErr) {
      console.error("[Auth] Cart merge error on login:", mergeErr);
    }

    return {
      success: true,
      data: { user },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message.startsWith("DATABASE_UNAVAILABLE")) {
      return {
        success: false,
        error: "Database service is temporarily unavailable. Please try again shortly.",
      };
    }
    // Return generic error message to prevent user enumeration
    return {
      success: false,
      error: "Invalid email address or password.",
    };
  }
}

/**
 * Server Action: Sign Out / Invalidate Session
 */
export async function logoutAction(): Promise<AuthActionResult> {
  try {
    await signOutUser();
    await clearGuestCartCookie();
    return { success: true };
  } catch (err: unknown) {
    console.error("[Auth] Logout error:", err);
    return { success: false, error: "Failed to sign out." };
  }
}

/**
 * Server Action: Current Session Check
 */
export async function checkAuthStatusAction(): Promise<AuthActionResult> {
  try {
    const user = await getCurrentUser();
    return {
      success: true,
      data: { user },
    };
  } catch {
    return {
      success: true,
      data: { user: null },
    };
  }
}
