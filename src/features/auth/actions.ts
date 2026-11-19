"use server";

import {
  registerSchema,
  loginSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  GENERIC_PASSWORD_RESET_SUCCESS_MESSAGE,
} from "./schemas";
import type { EmailDispatcher } from "@/lib/email/types";
import {
  registerCustomer,
  authenticateCustomer,
  signOutUser,
  getCurrentUser,
  requestPasswordReset,
  resetPasswordWithToken,
} from "./service";
import { setSessionCookie } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { checkSharedRateLimit, resetSharedRateLimit } from "@/lib/auth/rate-limit";
import { cookies, headers } from "next/headers";
import { CART_COOKIE_NAME, mergeGuestCartIntoUserCart, clearGuestCartCookie } from "@/features/cart/service";
import { resolveTrustedClientIp } from "@/features/fulfillment/service";
import { hashToken } from "@/lib/security";

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

export interface RequestPasswordResetActionOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbClient?: any;
  emailDispatcher?: EmailDispatcher;
}

export interface ConfirmPasswordResetActionOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbClient?: any;
}

/**
 * Server Action: Request Password Recovery Token
 * - Enforces trusted client IP resolution (fails closed in production if proxy is untrusted)
 * - Distributed rate limiting on IP (5 attempts per 15 min)
 * - Distributed rate limiting on deterministic email hash (3 attempts per 15 min; email never exposed in key)
 * - Returns neutral non-enumerating generic success response in all cases
 */
export async function requestPasswordResetAction(
  _prevState: unknown,
  formData: FormData,
  options?: RequestPasswordResetActionOptions
): Promise<AuthActionResult> {
  let headerList: { get(name: string): string | null };
  try {
    headerList = await headers();
  } catch {
    headerList = { get: () => null };
  }

  const { clientIp, error: ipError } = resolveTrustedClientIp(headerList);
  if (!clientIp) {
    return {
      success: false,
      error:
        ipError ||
        "Authentication service is temporarily unavailable. Please try again shortly.",
    };
  }

  const rawData: Record<string, unknown> = {};
  formData.forEach((value, key) => {
    rawData[key] = value;
  });

  const parsed = passwordResetRequestSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please provide a valid email address.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const db = options?.dbClient ?? getDb();

  // 1. IP Rate limit: max 5 requests per 15 minutes
  const ipRate = await checkSharedRateLimit(db, `pwd-reset:ip:${clientIp}`, {
    maxAttempts: 5,
    windowSeconds: 15 * 60,
  });
  if (!ipRate.success) {
    if (ipRate.isServiceUnavailable) {
      return {
        success: false,
        error:
          "Authentication service is temporarily unavailable. Please try again shortly.",
      };
    }
    return {
      success: false,
      error: `Too many password reset requests from this network. Please wait ${ipRate.resetInSeconds} seconds before trying again.`,
    };
  }

  // 2. Normalized-Email Rate limit: max 3 requests per 15 minutes
  // Do NOT store raw email in rate-limit keys; use deterministic SHA-256 hash prefix
  const emailKey = `pwd-reset:email:${hashToken(parsed.data.email).slice(0, 32)}`;
  const emailRate = await checkSharedRateLimit(db, emailKey, {
    maxAttempts: 3,
    windowSeconds: 15 * 60,
  });
  if (!emailRate.success) {
    if (emailRate.isServiceUnavailable) {
      return {
        success: false,
        error:
          "Authentication service is temporarily unavailable. Please try again shortly.",
      };
    }
    return {
      success: false,
      error: `Too many requests for this account. Please wait ${emailRate.resetInSeconds} seconds before trying again.`,
    };
  }

  try {
    await requestPasswordReset(parsed.data.email, {
      dbClient: db,
      emailDispatcher: options?.emailDispatcher,
    });
    return {
      success: true,
      data: { message: GENERIC_PASSWORD_RESET_SUCCESS_MESSAGE },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message.startsWith("DATABASE_UNAVAILABLE")) {
      return {
        success: false,
        error:
          "Database service is temporarily unavailable. Please try again shortly.",
      };
    }
    // Generic non-enumerating success even on internal errors to prevent side-channel probing
    return {
      success: true,
      data: { message: GENERIC_PASSWORD_RESET_SUCCESS_MESSAGE },
    };
  }
}

/**
 * Server Action: Confirm Password Reset with Token
 * - Enforces trusted client IP resolution (fails closed in production)
 * - Distributed rate limiting on redemption attempts (10 attempts per 15 min per IP)
 * - Validates input against schema and strong password policy
 * - Never returns token in error messages or responses
 */
export async function confirmPasswordResetAction(
  _prevState: unknown,
  formData: FormData,
  options?: ConfirmPasswordResetActionOptions
): Promise<AuthActionResult> {
  let headerList: { get(name: string): string | null };
  try {
    headerList = await headers();
  } catch {
    headerList = { get: () => null };
  }

  const { clientIp, error: ipError } = resolveTrustedClientIp(headerList);
  if (!clientIp) {
    return {
      success: false,
      error:
        ipError ||
        "Authentication service is temporarily unavailable. Please try again shortly.",
    };
  }

  const rawData: Record<string, unknown> = {};
  formData.forEach((value, key) => {
    rawData[key] = value;
  });

  const parsed = passwordResetConfirmSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please correct the highlighted form errors.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const db = options?.dbClient ?? getDb();

  // Redemption rate limit: max 10 attempts per 15 minutes per IP
  const rateCheck = await checkSharedRateLimit(
    db,
    `pwd-reset:confirm:ip:${clientIp}`,
    {
      maxAttempts: 10,
      windowSeconds: 15 * 60,
    }
  );
  if (!rateCheck.success) {
    if (rateCheck.isServiceUnavailable) {
      return {
        success: false,
        error:
          "Authentication service is temporarily unavailable. Please try again shortly.",
      };
    }
    return {
      success: false,
      error: `Too many password reset attempts. Please wait ${rateCheck.resetInSeconds} seconds before trying again.`,
    };
  }

  try {
    await resetPasswordWithToken(parsed.data.token, parsed.data.newPassword, {
      dbClient: db,
    });
    return {
      success: true,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message.startsWith("WEAK_PASSWORD")) {
      const displayMsg = message.replace("WEAK_PASSWORD: ", "");
      return {
        success: false,
        error: displayMsg,
        fieldErrors: { newPassword: [displayMsg] },
      };
    }
    if (message.startsWith("DATABASE_UNAVAILABLE")) {
      return {
        success: false,
        error:
          "Database service is temporarily unavailable. Please try again shortly.",
      };
    }
    // Generic non-revealing error for invalid/expired tokens (never echo raw token)
    return {
      success: false,
      error:
        "This password reset link is invalid, expired, or has already been used. Please request a new one.",
    };
  }
}

