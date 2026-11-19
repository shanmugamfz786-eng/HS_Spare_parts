import "server-only";

// ----------------------------------------------------------------------
// Payment Domain Types & State Machine
// ----------------------------------------------------------------------

export type PaymentStatus =
  | "created"
  | "pending"
  | "succeeded"
  | "failed"
  | "cancelled";

export type WebhookEventType =
  | "payment.created"
  | "payment.pending"
  | "payment.succeeded"
  | "payment.failed"
  | "payment.cancelled";

/**
 * Valid state transitions for the payment lifecycle.
 * Backward transitions and mutations from terminal states are disallowed.
 */
export const ALLOWED_PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  created: ["pending", "succeeded", "failed", "cancelled"],
  pending: ["succeeded", "failed", "cancelled"],
  succeeded: [], // Terminal for standard payment capture: cannot regress or be altered by client
  failed: [], // Terminal
  cancelled: [], // Terminal
} as const;

export function isValidPaymentTransition(
  from: PaymentStatus,
  to: PaymentStatus
): boolean {
  if (from === to) return true; // Idempotent same-state is valid
  const allowed = ALLOWED_PAYMENT_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

// ----------------------------------------------------------------------
// DTOs
// ----------------------------------------------------------------------

export interface PaymentIntentParams {
  orderId: string;
  orderNumber: string;
  amountMinor: number;
  currency: string;
  customerEmail: string;
  customerPhone?: string | null;
  idempotencyKey: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface PaymentIntentResult {
  providerPaymentId: string;
  clientSecret?: string;
  checkoutUrl?: string;
  status: PaymentStatus;
  metadata?: Record<string, unknown>;
}

export interface WebhookVerificationParams {
  rawBody: string | Buffer;
  headers: Record<string, string | string[] | undefined>;
  webhookSecret?: string;
}

export interface PaymentWebhookEventDTO {
  providerEventId: string;
  eventType: WebhookEventType;
  orderId?: string;
  orderNumber?: string;
  providerPaymentId: string;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  rawPayloadDigest: string; // SHA-256 digest of incoming raw payload
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface PaymentDetailsResult {
  providerPaymentId: string;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  verifiedAt?: Date;
  metadata?: Record<string, unknown>;
}

// ----------------------------------------------------------------------
// Provider-Independent Payment Gateway Adapter Contract
// ----------------------------------------------------------------------

export interface PaymentGatewayAdapter {
  readonly providerName: string;

  /**
   * Creates an intent/session with the upstream provider.
   */
  createPaymentIntent(params: PaymentIntentParams): Promise<PaymentIntentResult>;

  /**
   * Verifies the cryptographic signature of an incoming webhook event.
   * MUST use constant-time comparison to prevent timing attacks.
   */
  verifyWebhookSignature(params: WebhookVerificationParams): Promise<boolean>;

  /**
   * Parses the raw incoming webhook request into a normalized event DTO.
   */
  parseWebhookEvent(
    rawBody: string | Buffer,
    headers: Record<string, string | string[] | undefined>
  ): Promise<PaymentWebhookEventDTO>;

  /**
   * Fetches latest payment state directly from the upstream provider (used for reconciliation).
   */
  fetchPaymentDetails?(providerPaymentId: string): Promise<PaymentDetailsResult>;
}
