/**
 * Provider-Independent Email Delivery Types
 * Defines the contract for dispatching transactional authentication and notification emails.
 */

export interface SendPasswordResetEmailParams {
  toEmail: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export interface EmailDeliveryResult {
  success: boolean;
  error?: string;
}

export interface EmailDispatcher {
  sendPasswordResetEmail(params: SendPasswordResetEmailParams): Promise<EmailDeliveryResult>;
}
