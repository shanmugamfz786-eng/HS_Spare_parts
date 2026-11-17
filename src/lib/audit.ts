import "server-only";
import { getDb } from "@/lib/db";
import { adminAuditLogs } from "@/lib/db/schema/admin";

export interface AuditLogParams {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
}

const REDACTED_KEYS = new Set([
  "password",
  "password_hash",
  "passwordHash",
  "token",
  "token_hash",
  "tokenHash",
  "secret",
  "apiKey",
  "cvv",
  "pan",
  "cardNumber",
]);

/**
 * Strips sensitive fields from audit log payloads to prevent credential leakage.
 */
export function sanitizeAuditMetadata(metadata?: Record<string, unknown>): Record<string, unknown> {
  if (!metadata) return {};
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (REDACTED_KEYS.has(key.toLowerCase()) || REDACTED_KEYS.has(key)) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeAuditMetadata(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Inserts an immutable audit log record for a privileged administrative action.
 */
export async function recordAdminAudit(params: AuditLogParams): Promise<void> {
  const db = getDb();
  if (!db) {
    console.warn("[Audit] Database unavailable. Skipping audit write for action:", params.action);
    return;
  }

  try {
    await db.insert(adminAuditLogs).values({
      actorUserId: params.actorUserId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      metadata: sanitizeAuditMetadata(params.metadata),
      requestId: params.requestId || null,
    });
  } catch (err: unknown) {
    console.error("[Audit] Failed to write audit record:", err);
  }
}
