import "server-only";
import type {
  EmailDispatcher,
  SendPasswordResetEmailParams,
  EmailDeliveryResult,
} from "./types";

/**
 * In-memory test queue used exclusively in test / development environments
 * for test assertions. NEVER exposes tokens or URLs to public logs or terminal.
 */
interface QueuedEmailRecord {
  toEmail: string;
  expiresInMinutes: number;
  timestamp: Date;
  // Kept in memory only for test assertions, never printed to stdout
  _internalUrlForTestOnly?: string;
}

const inMemoryTestQueue: QueuedEmailRecord[] = [];

/**
 * Retrieves queued emails for unit/integration tests.
 */
export function getTestEmailQueue(): readonly QueuedEmailRecord[] {
  return inMemoryTestQueue;
}

/**
 * Clears the test email queue between test runs.
 */
export function clearTestEmailQueue(): void {
  inMemoryTestQueue.length = 0;
}

/**
 * Default Provider-Independent Email Dispatcher.
 * - In test/dev: safely records delivery in memory without printing tokens to logs.
 * - In production: safely returns false/unconfigured if no provider is wired, without breaking customer flow.
 */
export class DefaultEmailDispatcher implements EmailDispatcher {
  async sendPasswordResetEmail(
    params: SendPasswordResetEmailParams
  ): Promise<EmailDeliveryResult> {
    const isDevOrTest =
      process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

    if (!isDevOrTest) {
      // In production, until an email provider (e.g. Resend, SES, Postmark) is chosen and configured,
      // fail safely without crashing or exposing tokens.
      // Notice: Do NOT log the reset URL or token.
      console.warn(
        `[EmailDispatcher] Email provider is not configured. Delivery skipped for recipient.`
      );
      return {
        success: false,
        error: "EMAIL_PROVIDER_UNCONFIGURED",
      };
    }

    // In development / test: queue the message in memory for test assertions
    // Crucially, NEVER console.log the raw token or URL.
    inMemoryTestQueue.push({
      toEmail: params.toEmail,
      expiresInMinutes: params.expiresInMinutes,
      timestamp: new Date(),
      _internalUrlForTestOnly: params.resetUrl,
    });

    return { success: true };
  }
}

let activeDispatcher: EmailDispatcher = new DefaultEmailDispatcher();

export function getEmailDispatcher(): EmailDispatcher {
  return activeDispatcher;
}

export function setEmailDispatcher(dispatcher: EmailDispatcher): void {
  activeDispatcher = dispatcher;
}

export function resetEmailDispatcher(): void {
  activeDispatcher = new DefaultEmailDispatcher();
}
