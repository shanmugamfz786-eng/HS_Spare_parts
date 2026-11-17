import "server-only";
import crypto from "crypto";
import { hashToken, timingSafeCompare } from "@/lib/security";
import { getAuthSecret } from "@/lib/env";

export interface CartItemFingerprintSource {
  productId: string;
  variantId?: string | null;
  quantity: number;
}

export interface QuoteTokenItemSnapshot {
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface QuoteTokenPayload {
  customerId: string;
  addressId: string | null;
  expiresAt: string;
  items: QuoteTokenItemSnapshot[];
  subtotalMinor: number;
  shippingMinor: number;
  taxMinor: number;
  discountMinor: number;
  totalMinor: number;
  currency: "INR";
}

export interface AuthoritativeQuoteComparison {
  customerId: string;
  addressId: string;
  items: QuoteTokenItemSnapshot[];
  subtotalMinor: number;
  shippingMinor: number;
  taxMinor: number;
  discountMinor: number;
  totalMinor: number;
  currency: "INR";
}

/**
 * Resolves the HMAC signing secret for checkout quote tokens.
 * In production: requires a valid AUTH_SECRET >= 32 characters; fails closed if missing.
 * In development/test: uses AUTH_SECRET if present, or a non-production test fallback.
 */
export function getQuoteSigningSecret(): string {
  return getAuthSecret();
}

/**
 * Deterministically sorts quote item snapshots by productId asc, then variantId asc.
 */
export function sortQuoteItems(items: QuoteTokenItemSnapshot[]): QuoteTokenItemSnapshot[] {
  return [...items].sort((a, b) => {
    const pComp = a.productId.localeCompare(b.productId);
    if (pComp !== 0) return pComp;
    const vA = a.variantId ?? "";
    const vB = b.variantId ?? "";
    return vA.localeCompare(vB);
  });
}

/**
 * Computes a canonical, deterministic SHA-256 fingerprint for a cart's contents.
 * Items are sorted deterministically by productId then variantId before hashing.
 */
export function computeCartFingerprint(items: CartItemFingerprintSource[]): string {
  const sorted = [...items].sort((a, b) => {
    const pComp = a.productId.localeCompare(b.productId);
    if (pComp !== 0) return pComp;
    const vA = a.variantId ?? "";
    const vB = b.variantId ?? "";
    return vA.localeCompare(vB);
  });

  const canonicalString = sorted
    .map((item) => `${item.productId}:${item.variantId ?? ""}:${item.quantity}`)
    .join(",");

  return hashToken(canonicalString);
}

/**
 * Computes a canonical SHA-256 fingerprint representing the logical business contents
 * of an order request (customer, address, currency, items, prices, and totals).
 * Excludes transient token metadata such as `expiresAt` and cryptographic signatures.
 * A regenerated quote token with a different expiry but identical logical contents
 * produces the exact same fingerprint.
 */
export function computeLogicalRequestFingerprint(payload: {
  customerId: string;
  addressId: string;
  currency: string;
  items: QuoteTokenItemSnapshot[];
  subtotalMinor: number;
  shippingMinor: number;
  taxMinor: number;
  discountMinor: number;
  totalMinor: number;
}): string {
  const sortedItems = sortQuoteItems(payload.items ?? []);
  const itemsString = sortedItems
    .map(
      (it) =>
        `${it.productId}:${it.variantId ?? ""}:${it.quantity}:${it.unitPriceMinor}:${it.lineTotalMinor}`
    )
    .join(",");

  const canonicalString = [
    payload.customerId,
    payload.addressId,
    payload.currency,
    itemsString,
    payload.subtotalMinor,
    payload.shippingMinor,
    payload.taxMinor,
    payload.discountMinor,
    payload.totalMinor,
  ].join("|");

  return hashToken(canonicalString);
}

/**
 * Decodes and verifies the HMAC-SHA256 signature and JSON structure of a quote token
 * using constant-time comparison.
 * Note: Does NOT check expiration timestamp, allowing callers to inspect cryptographically
 * authenticated payload data during order replay lookup before rejecting expired quotes.
 */
export function decodeAndVerifyQuoteTokenSignature(
  token: string,
  secret?: string
): QuoteTokenPayload {
  const signingKey = secret ?? getQuoteSigningSecret();

  if (!token || typeof token !== "string" || !token.includes(".")) {
    throw new Error("INVALID_QUOTE_TOKEN: Malformed or missing checkout quote token.");
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("INVALID_QUOTE_TOKEN: Checkout quote token structure is invalid.");
  }

  const expectedSignature = crypto
    .createHmac("sha256", signingKey)
    .update(encodedPayload)
    .digest("base64url");

  if (!timingSafeCompare(signature, expectedSignature)) {
    throw new Error(
      "INVALID_QUOTE_TOKEN: Checkout quote token signature verification failed. Quote may have been altered or tampered with."
    );
  }

  let payload: QuoteTokenPayload;
  try {
    const json = Buffer.from(encodedPayload, "base64url").toString("utf8");
    payload = JSON.parse(json);
  } catch {
    throw new Error("INVALID_QUOTE_TOKEN: Failed to parse checkout quote token payload.");
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("INVALID_QUOTE_TOKEN: Checkout quote token payload is invalid.");
  }

  return payload;
}

/**
 * Generates an HMAC-SHA256 cryptographically signed quote snapshot token.
 * Canonicalizes item order before encoding.
 */
export function signQuoteToken(
  payload: QuoteTokenPayload,
  secret?: string
): string {
  const signingKey = secret ?? getQuoteSigningSecret();

  const sortedPayload: QuoteTokenPayload = {
    ...payload,
    items: sortQuoteItems(payload.items),
  };

  const json = JSON.stringify(sortedPayload);
  const encodedPayload = Buffer.from(json, "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", signingKey)
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

/**
 * Validates a signed checkout quote token against authoritative current database values.
 * Enforces:
 * 1. HMAC-SHA256 constant-time signature verification.
 * 2. Token expiry check.
 * 3. Customer ownership match.
 * 4. Delivery address binding.
 * 5. Full item snapshot match (product, variant, quantity, unit price in integer paise, line total).
 * 6. Authoritative quote totals match (subtotal, shipping, tax, discount, total payable).
 *
 * If ANY price or total differs, throws QUOTE_STALE so order creation rejects the stale quote safely.
 */
export function verifyQuoteToken(
  token: string,
  expected: AuthoritativeQuoteComparison,
  secret?: string
): QuoteTokenPayload {
  const signingKey = secret ?? getQuoteSigningSecret();
  const payload = decodeAndVerifyQuoteTokenSignature(token, signingKey);

  // 1. Expiry check
  const expiresAtMs = new Date(payload.expiresAt).getTime();
  if (isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new Error(
      "QUOTE_EXPIRED: Your checkout quote has expired. Please refresh your quote to verify current stock and pricing."
    );
  }

  // 2. Customer match
  if (payload.customerId !== expected.customerId) {
    throw new Error(
      "QUOTE_MISMATCH: Checkout quote token does not match the authenticated customer account."
    );
  }

  // 3. Address match
  if (payload.addressId !== expected.addressId) {
    throw new Error(
      "QUOTE_MISMATCH: Checkout quote token was generated for a different delivery address."
    );
  }

  // 4. Currency match
  if (payload.currency !== expected.currency) {
    throw new Error("QUOTE_MISMATCH: Currency mismatch in checkout quote.");
  }

  // 5. Canonical item comparison (sorted)
  const sortedExpectedItems = sortQuoteItems(expected.items);
  const sortedPayloadItems = sortQuoteItems(payload.items ?? []);

  if (sortedPayloadItems.length !== sortedExpectedItems.length) {
    throw new Error(
      "QUOTE_STALE: Items in your cart have changed since your checkout quote was generated. Please review and confirm the refreshed quote."
    );
  }

  for (let i = 0; i < sortedPayloadItems.length; i++) {
    const pItem = sortedPayloadItems[i]!;
    const eItem = sortedExpectedItems[i]!;

    if (pItem.productId !== eItem.productId || (pItem.variantId ?? null) !== (eItem.variantId ?? null)) {
      throw new Error(
        "QUOTE_STALE: Products or variants in your cart have changed. Please review and confirm the refreshed quote."
      );
    }

    if (pItem.quantity !== eItem.quantity) {
      throw new Error(
        `QUOTE_STALE: Quantity for item changed from ${pItem.quantity} to ${eItem.quantity}. Please review and confirm the refreshed quote.`
      );
    }

    if (pItem.unitPriceMinor !== eItem.unitPriceMinor) {
      throw new Error(
        `QUOTE_STALE: Catalogue price changed from ₹${(pItem.unitPriceMinor / 100).toFixed(2)} to ₹${(eItem.unitPriceMinor / 100).toFixed(2)}. Please review and confirm the refreshed quote.`
      );
    }

    if (pItem.lineTotalMinor !== eItem.lineTotalMinor) {
      throw new Error(
        "QUOTE_STALE: Line total changed due to updated catalogue pricing. Please review and confirm the refreshed quote."
      );
    }
  }

  // 6. Authoritative quote totals comparison
  if (payload.subtotalMinor !== expected.subtotalMinor) {
    throw new Error(
      `QUOTE_STALE: Items subtotal changed from ₹${(payload.subtotalMinor / 100).toFixed(2)} to ₹${(expected.subtotalMinor / 100).toFixed(2)}. Please review and confirm the refreshed quote.`
    );
  }

  if (payload.shippingMinor !== expected.shippingMinor) {
    throw new Error(
      `QUOTE_STALE: Shipping fee changed from ₹${(payload.shippingMinor / 100).toFixed(2)} to ₹${(expected.shippingMinor / 100).toFixed(2)}. Please review and confirm the refreshed quote.`
    );
  }

  if (payload.taxMinor !== expected.taxMinor) {
    throw new Error("QUOTE_STALE: Tax amount has changed. Please review and confirm the refreshed quote.");
  }

  if (payload.discountMinor !== expected.discountMinor) {
    throw new Error("QUOTE_STALE: Discount amount has changed. Please review and confirm the refreshed quote.");
  }

  if (payload.totalMinor !== expected.totalMinor) {
    throw new Error(
      `QUOTE_STALE: Total payable changed from ₹${(payload.totalMinor / 100).toFixed(2)} to ₹${(expected.totalMinor / 100).toFixed(2)}. Please review and confirm the updated total.`
    );
  }

  return payload;
}
