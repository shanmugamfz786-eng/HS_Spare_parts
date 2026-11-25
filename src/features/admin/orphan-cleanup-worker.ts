import "server-only";

import crypto from "crypto";
import { eq, and, lte, or, lt, sql, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { mediaUploadSessions, mediaCleanupQueue } from "@/lib/db/schema/media";
import {
  checkAuthoritativeAssetReferences,
  computeCleanupRetryDecision,
  sanitizeCleanupErrorMessage,
  classifyCleanupError,
  type CleanupErrorClassification,
} from "@/features/admin/orphan-lifecycle";
import {
  getInMemoryUploadSessionById,
  updateInMemoryUploadSession,
  getInMemoryCleanupQueue,
  updateInMemoryCleanupQueueItem,
  deleteInMemoryCleanupQueueItem,
} from "@/server/catalogue/demo-state";

// ==============================================================================
// 1. Interfaces & Types
// ==============================================================================

export interface CloudinaryDeletionResult {
  success: boolean;
  result?: string;
  notFound?: boolean;
  httpCode?: number;
  error?: string;
}

export interface CloudinaryDeletionClient {
  destroyAsset(
    publicId: string,
    options?: { resourceType?: string; deliveryType?: string }
  ): Promise<CloudinaryDeletionResult>;
}

export interface WorkerRunOptions {
  workerId?: string;
  batchSize?: number;
  leaseDurationSeconds?: number;
  nowSeconds?: number;
  forceEnable?: boolean; // For test harness execution only
  dryRun?: boolean;
  deletionClient?: CloudinaryDeletionClient;
  customDb?: ReturnType<typeof getDb>;
  deadlineMs?: number; // Absolute timestamp (Date.now() + ms) after which no new job may start
}

export interface JobProcessOutcome {
  jobId: string;
  sessionId: string;
  canonicalPublicId: string;
  status: "completed" | "cancelled_referenced" | "dead_letter" | "retrying";
  attempts: number;
  reason: string;
  errorClassification?: CleanupErrorClassification;
}

export interface WorkerBatchReport {
  executed: boolean;
  reason?: string;
  workerId: string;
  startedAt: string;
  completedAt: string;
  jobsClaimed: number;
  outcomes: JobProcessOutcome[];
  summary: {
    completed: number;
    cancelledReferenced: number;
    deadLetter: number;
    retrying: number;
  };
  skippedDueToBudget?: number;
}

export interface PruneQueueOptions {
  olderThanDays?: number;
  customDb?: ReturnType<typeof getDb>;
  nowDate?: Date;
  dryRun?: boolean;
}

export interface PruneQueueReport {
  scannedCount: number;
  prunedCount: number;
  dryRun: boolean;
  prunedIds: string[];
  retainedTombstonesCount: number;
}

function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

// ==============================================================================
// 2. Production Cloudinary Deletion Client (15-Second Hard Timeout)
// ==============================================================================

export class ProductionCloudinaryDeletionClient implements CloudinaryDeletionClient {
  private readonly cloudName: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly timeoutMs: number;

  constructor(options?: {
    cloudName?: string;
    apiKey?: string;
    apiSecret?: string;
    timeoutMs?: number;
  }) {
    this.cloudName = options?.cloudName || process.env.CLOUDINARY_CLOUD_NAME || "";
    this.apiKey = options?.apiKey || process.env.CLOUDINARY_API_KEY || "";
    this.apiSecret = options?.apiSecret || process.env.CLOUDINARY_API_SECRET || "";
    // Cloudinary client timeout strictly capped at 15s (worker lease is at least 120s)
    this.timeoutMs = options?.timeoutMs || 15000;
  }

  async destroyAsset(
    publicId: string,
    options?: { resourceType?: string; deliveryType?: string }
  ): Promise<CloudinaryDeletionResult> {
    if (!this.cloudName || !this.apiKey || !this.apiSecret) {
      return {
        success: false,
        error: "SECURITY_REJECTION: Missing Cloudinary credentials. Cannot execute deletion.",
      };
    }

    const resourceType = options?.resourceType || "image";
    const timestamp = Math.floor(Date.now() / 1000);
    const toSign = `public_id=${publicId}&timestamp=${timestamp}${this.apiSecret}`;
    const signature = crypto.createHash("sha1").update(toSign).digest("hex");

    const endpoint = `https://api.cloudinary.com/v1_1/${this.cloudName}/${resourceType}/destroy`;

    const formData = new URLSearchParams();
    formData.append("public_id", publicId);
    formData.append("timestamp", String(timestamp));
    formData.append("api_key", this.apiKey);
    formData.append("signature", signature);
    if (options?.deliveryType && options.deliveryType !== "upload") {
      formData.append("type", options.deliveryType);
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      const responseText = await response.text();
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(responseText);
      } catch {
        // Non-JSON response
      }

      if (response.ok && data.result === "ok") {
        return {
          success: true,
          result: "ok",
          httpCode: response.status,
        };
      }

      // Cloudinary responds with { result: "not found" } or 404 when asset does not exist
      if (data.result === "not found" || response.status === 404) {
        return {
          success: true,
          notFound: true,
          result: "not found",
          httpCode: response.status,
        };
      }

      const errorMsg =
        (data.error as { message?: string })?.message ||
        (typeof data.result === "string" ? data.result : responseText) ||
        `HTTP ${response.status}`;

      return {
        success: false,
        error: sanitizeCleanupErrorMessage(errorMsg),
        httpCode: response.status,
      };
    } catch (err) {
      return {
        success: false,
        error: sanitizeCleanupErrorMessage(err),
      };
    }
  }
}

// ==============================================================================
// 3. Queue Claiming & Lease Locking (Stage 2)
// ==============================================================================

export interface ClaimedQueueJob {
  id: string;
  sessionId: string;
  cloudName: string;
  canonicalPublicId: string;
  resourceType: string;
  deliveryType: string;
  folder: string;
  idempotencyKey: string;
  triggerReason: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: Date;
  leaseVersion: number;
  lockedByWorker: string | null;
  lockedAt: Date | null;
  leaseExpiresAt: Date | null;
}

export async function claimEligibleCleanupJobs(
  options: WorkerRunOptions
): Promise<ClaimedQueueJob[]> {
  const workerId = options.workerId || `worker-${crypto.randomUUID().slice(0, 8)}`;
  const batchSize = Math.max(1, Math.min(options.batchSize || 10, 100));
  const leaseSeconds = Math.max(30, options.leaseDurationSeconds || 120);
  const now = options.nowSeconds ? new Date(options.nowSeconds * 1000) : new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000);

  // PostgreSQL Mode
  if (isDatabaseConfigured()) {
    const db = options.customDb || getDb();
    if (!db) {
      throw new Error("DATABASE_UNAVAILABLE: Neon database pool is unavailable.");
    }

    return await db.transaction(async (tx) => {
      // Find candidate IDs with FOR UPDATE SKIP LOCKED
      const candidates = await tx
        .select({ id: mediaCleanupQueue.id })
        .from(mediaCleanupQueue)
        .where(
          or(
            and(
              eq(mediaCleanupQueue.status, "pending"),
              lte(mediaCleanupQueue.nextRetryAt, now)
            ),
            and(
              eq(mediaCleanupQueue.status, "processing"),
              lt(mediaCleanupQueue.leaseExpiresAt, now)
            )
          )
        )
        .orderBy(mediaCleanupQueue.nextRetryAt)
        .limit(batchSize)
        .for("update", { skipLocked: true });

      if (candidates.length === 0) {
        return [];
      }

      const candidateIds = candidates.map((c) => c.id);

      // Claim jobs atomically by updating status and incrementing lease_version
      const claimed = await tx
        .update(mediaCleanupQueue)
        .set({
          status: "processing",
          lockedAt: now,
          leaseExpiresAt,
          lockedByWorker: workerId,
          leaseVersion: sql`${mediaCleanupQueue.leaseVersion} + 1`,
          updatedAt: now,
        })
        .where(inArray(mediaCleanupQueue.id, candidateIds))
        .returning();

      return claimed.map((row) => ({
        id: row.id,
        sessionId: row.sessionId,
        cloudName: row.cloudName,
        canonicalPublicId: row.canonicalPublicId,
        resourceType: row.resourceType,
        deliveryType: row.deliveryType,
        folder: row.folder,
        idempotencyKey: row.idempotencyKey,
        triggerReason: row.triggerReason,
        status: row.status,
        attempts: row.attempts,
        maxAttempts: row.maxAttempts,
        nextRetryAt: row.nextRetryAt,
        leaseVersion: row.leaseVersion,
        lockedByWorker: row.lockedByWorker,
        lockedAt: row.lockedAt,
        leaseExpiresAt: row.leaseExpiresAt,
      }));
    });
  }

  // In-Memory Demo Mode (Development / Unit Tests)
  const queue = getInMemoryCleanupQueue();
  const eligible = queue.filter((job) => {
    if (job.status === "pending" && job.nextRetryAt <= now) return true;
    if (job.status === "processing" && job.leaseExpiresAt && job.leaseExpiresAt < now) return true;
    return false;
  });

  const toClaim = eligible.slice(0, batchSize);
  const claimedList: ClaimedQueueJob[] = [];

  for (const item of toClaim) {
    const updated = updateInMemoryCleanupQueueItem(item.id, {
      status: "processing",
      lockedAt: now,
      leaseExpiresAt,
      lockedByWorker: workerId,
      leaseVersion: item.leaseVersion + 1,
    });
    if (updated) {
      claimedList.push({
        id: updated.id,
        sessionId: updated.sessionId,
        cloudName: updated.cloudName,
        canonicalPublicId: updated.canonicalPublicId,
        resourceType: updated.resourceType,
        deliveryType: updated.deliveryType,
        folder: updated.folder,
        idempotencyKey: updated.idempotencyKey,
        triggerReason: updated.triggerReason,
        status: updated.status,
        attempts: updated.attempts,
        maxAttempts: updated.maxAttempts,
        nextRetryAt: updated.nextRetryAt,
        leaseVersion: updated.leaseVersion,
        lockedByWorker: updated.lockedByWorker,
        lockedAt: updated.lockedAt,
        leaseExpiresAt: updated.leaseExpiresAt,
      });
    }
  }

  return claimedList;
}

// ==============================================================================
// 4. Single Job Processing Engine (Stages 1, 3, 4, 5, 6, 7)
// ==============================================================================

export async function processCleanupJob(
  job: ClaimedQueueJob,
  options: WorkerRunOptions
): Promise<JobProcessOutcome> {
  const now = options.nowSeconds ? new Date(options.nowSeconds * 1000) : new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const deletionClient =
    options.deletionClient || new ProductionCloudinaryDeletionClient();

  // Helper to transition job to dead_letter
  const deadLetter = async (
    reason: string,
    classification: CleanupErrorClassification = "SECURITY_REJECTION"
  ): Promise<JobProcessOutcome> => {
    const sanitizedReason = sanitizeCleanupErrorMessage(reason);
    if (isDatabaseConfigured()) {
      const db = options.customDb || getDb();
      if (db) {
        await db
          .update(mediaCleanupQueue)
          .set({
            status: "dead_letter",
            lastErrorClassification: classification,
            lastErrorMessage: sanitizedReason,
            lockedByWorker: null,
            leaseExpiresAt: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(mediaCleanupQueue.id, job.id),
              eq(mediaCleanupQueue.leaseVersion, job.leaseVersion)
            )
          );
      }
    } else {
      updateInMemoryCleanupQueueItem(job.id, {
        status: "dead_letter",
        lastErrorClassification: classification,
        lastErrorMessage: sanitizedReason,
        lockedByWorker: null,
        leaseExpiresAt: null,
      });
    }
    return {
      jobId: job.id,
      sessionId: job.sessionId,
      canonicalPublicId: job.canonicalPublicId,
      status: "dead_letter",
      attempts: job.attempts,
      reason: sanitizedReason,
      errorClassification: classification,
    };
  };

  // ----------------------------------------------------------------------------
  // Stage 1 & 6: Inspect Session & Verify Tombstone Preconditions
  // ----------------------------------------------------------------------------
  let sessionRecord: {
    id: string;
    cloudName: string;
    canonicalPublicId: string;
    resourceType: string;
    deliveryType: string;
    folder: string;
    status: string;
    uploadVerifiedAt: Date | null;
    cleanupIntentAt: Date | null;
  } | null = null;

  if (isDatabaseConfigured()) {
    const db = options.customDb || getDb();
    if (!db) {
      return await deadLetter("DATABASE_UNAVAILABLE: Could not connect to registry", "PROVIDER_UNAVAILABLE");
    }
    const rows = await db
      .select({
        id: mediaUploadSessions.id,
        cloudName: mediaUploadSessions.cloudName,
        canonicalPublicId: mediaUploadSessions.canonicalPublicId,
        resourceType: mediaUploadSessions.resourceType,
        deliveryType: mediaUploadSessions.deliveryType,
        folder: mediaUploadSessions.folder,
        status: mediaUploadSessions.status,
        uploadVerifiedAt: mediaUploadSessions.uploadVerifiedAt,
        cleanupIntentAt: mediaUploadSessions.cleanupIntentAt,
      })
      .from(mediaUploadSessions)
      .where(eq(mediaUploadSessions.id, job.sessionId))
      .limit(1);

    sessionRecord = rows[0] || null;
  } else {
    const mem = getInMemoryUploadSessionById(job.sessionId);
    sessionRecord = mem
      ? {
          id: mem.id,
          cloudName: mem.cloudName,
          canonicalPublicId: mem.canonicalPublicId,
          resourceType: mem.resourceType,
          deliveryType: mem.deliveryType,
          folder: mem.folder,
          status: mem.status,
          uploadVerifiedAt: mem.uploadVerifiedAt,
          cleanupIntentAt: mem.cleanupIntentAt,
        }
      : null;
  }

  if (!sessionRecord) {
    return await deadLetter(
      `SESSION_NOT_FOUND: Referenced upload session '${job.sessionId}' does not exist in registry.`,
      "SECURITY_REJECTION"
    );
  }

  // Precondition A: Already deleted (idempotent resolution)
  if (sessionRecord.status === "deleted") {
    if (isDatabaseConfigured()) {
      const db = options.customDb || getDb();
      if (db) {
        await db
          .update(mediaCleanupQueue)
          .set({
            status: "completed",
            completedAt: now,
            lockedByWorker: null,
            leaseExpiresAt: null,
            updatedAt: now,
          })
          .where(eq(mediaCleanupQueue.id, job.id));
      }
    } else {
      updateInMemoryCleanupQueueItem(job.id, {
        status: "completed",
        completedAt: now,
        lockedByWorker: null,
        leaseExpiresAt: null,
      });
    }
    return {
      jobId: job.id,
      sessionId: job.sessionId,
      canonicalPublicId: job.canonicalPublicId,
      status: "completed",
      attempts: job.attempts,
      reason: "SESSION_ALREADY_DELETED: Asset was already tombstoned and marked deleted.",
    };
  }

  // Precondition B: Session must be in tombstoned state ('cleanup_pending' or 'deletion_in_progress')
  if (
    sessionRecord.status !== "cleanup_pending" &&
    sessionRecord.status !== "deletion_in_progress"
  ) {
    return await deadLetter(
      `INELIGIBLE_SESSION_STATE: Session status is '${sessionRecord.status}'. Only tombstoned sessions (cleanup_pending, deletion_in_progress) can be processed.`,
      "SECURITY_REJECTION"
    );
  }

  // Precondition C: Upload proof MUST be verified
  if (!sessionRecord.uploadVerifiedAt) {
    return await deadLetter(
      "UNVERIFIED_UPLOAD: Session has no verified upload proof timestamp. Unverified sessions cannot be cleaned up.",
      "SECURITY_REJECTION"
    );
  }

  // ----------------------------------------------------------------------------
  // F-07: Queue-to-Session Identity Snapshot Consistency Check
  // ----------------------------------------------------------------------------
  if (
    job.canonicalPublicId !== sessionRecord.canonicalPublicId ||
    job.cloudName !== sessionRecord.cloudName ||
    job.resourceType !== sessionRecord.resourceType ||
    job.deliveryType !== sessionRecord.deliveryType ||
    job.folder !== sessionRecord.folder
  ) {
    return await deadLetter(
      `INTEGRITY_MISMATCH (F-07): Queue snapshot coordinates differ from durable session registry. [queue=${job.canonicalPublicId}, session=${sessionRecord.canonicalPublicId}]`,
      "SECURITY_REJECTION"
    );
  }

  // ----------------------------------------------------------------------------
  // Stage 3: Pre-Deletion Reference Verification (TOCTOU Defense)
  // ----------------------------------------------------------------------------
  const refCheck = await checkAuthoritativeAssetReferences(sessionRecord.canonicalPublicId, {
    customDb: options.customDb,
    nowSeconds,
    isDurableSessionVerified: true,
  });

  if (refCheck.isReferenced) {
    // CRITICAL: A reference found after tombstoning is an INTEGRITY INCIDENT.
    // Deletion must abort immediately to prevent data loss.
    // The incident is formally classified and recorded in the audit trail.
    const incidentMessage = `INTEGRITY_INCIDENT: Tombstoned asset was found actively referenced in catalogue entity (${refCheck.matchedEntity?.type || "unknown"}:${refCheck.matchedEntity?.id || "unknown"}). Deletion aborted to prevent data loss. Incident logged for security audit. Details: ${sanitizeCleanupErrorMessage(refCheck.reason)}`;

    if (isDatabaseConfigured()) {
      const db = options.customDb || getDb();
      if (db) {
        await db
          .update(mediaCleanupQueue)
          .set({
            status: "cancelled_referenced",
            completedAt: now,
            lockedByWorker: null,
            leaseExpiresAt: null,
            lastErrorClassification: "INTEGRITY_INCIDENT",
            lastErrorMessage: incidentMessage,
            updatedAt: now,
          })
          .where(
            and(
              eq(mediaCleanupQueue.id, job.id),
              eq(mediaCleanupQueue.leaseVersion, job.leaseVersion)
            )
          );
      }
    } else {
      updateInMemoryCleanupQueueItem(job.id, {
        status: "cancelled_referenced",
        completedAt: now,
        lockedByWorker: null,
        leaseExpiresAt: null,
        lastErrorClassification: "INTEGRITY_INCIDENT",
        lastErrorMessage: incidentMessage,
      });
    }

    return {
      jobId: job.id,
      sessionId: job.sessionId,
      canonicalPublicId: job.canonicalPublicId,
      status: "cancelled_referenced",
      attempts: job.attempts,
      reason: incidentMessage,
      errorClassification: "INTEGRITY_INCIDENT",
    };
  }

  if (refCheck.isUncertain) {
    // Fail-closed on uncertainty (e.g. database connection blip)
    return await deadLetter(
      `UNCERTAIN_REFERENCE_CHECK: Cannot prove zero references safely. Fail-closed. ${refCheck.reason}`,
      "PROVIDER_UNAVAILABLE"
    );
  }

  // ----------------------------------------------------------------------------
  // Stage 4: Cloudinary Deletion Adapter Dispatch
  // ----------------------------------------------------------------------------
  if (options.dryRun) {
    return {
      jobId: job.id,
      sessionId: job.sessionId,
      canonicalPublicId: job.canonicalPublicId,
      status: "completed",
      attempts: job.attempts,
      reason: "DRY_RUN_SUCCESS: Asset verified safe for deletion (dry-run mode).",
    };
  }

  // Mark session as deletion_in_progress before network call
  if (isDatabaseConfigured()) {
    const db = options.customDb || getDb();
    if (db) {
      await db
        .update(mediaUploadSessions)
        .set({ status: "deletion_in_progress" })
        .where(eq(mediaUploadSessions.id, sessionRecord.id));
    }
  } else {
    updateInMemoryUploadSession(sessionRecord.id, {
      status: "deletion_in_progress",
    });
  }

  const deletionResult = await deletionClient.destroyAsset(
    sessionRecord.canonicalPublicId,
    {
      resourceType: sessionRecord.resourceType,
      deliveryType: sessionRecord.deliveryType,
    }
  );

  // ----------------------------------------------------------------------------
  // Stage 5 & 7: Evaluate Outcome, Persist State & Handle Retries
  // ----------------------------------------------------------------------------
  if (deletionResult.success) {
    // Both Cloudinary "ok" and confirmed 404 "not found" are treated as successful deletions
    // since identity, session proof, and zero-reference checks have already passed!
    if (isDatabaseConfigured()) {
      const db = options.customDb || getDb();
      if (db) {
        await db.transaction(async (tx) => {
          await tx
            .update(mediaCleanupQueue)
            .set({
              status: "completed",
              completedAt: now,
              lockedByWorker: null,
              leaseExpiresAt: null,
              lastErrorClassification: null,
              lastErrorMessage: null,
              updatedAt: now,
            })
            .where(
              and(
                eq(mediaCleanupQueue.id, job.id),
                eq(mediaCleanupQueue.leaseVersion, job.leaseVersion)
              )
            );

          await tx
            .update(mediaUploadSessions)
            .set({
              status: "deleted",
              deletedAt: now,
              lockedByWorker: null,
              leaseExpiresAt: null,
            })
            .where(eq(mediaUploadSessions.id, sessionRecord!.id));
        });
      }
    } else {
      updateInMemoryCleanupQueueItem(job.id, {
        status: "completed",
        completedAt: now,
        lockedByWorker: null,
        leaseExpiresAt: null,
        lastErrorClassification: null,
        lastErrorMessage: null,
      });
      updateInMemoryUploadSession(sessionRecord.id, {
        status: "deleted",
        deletedAt: now,
        lockedByWorker: null,
        leaseExpiresAt: null,
      });
    }

    return {
      jobId: job.id,
      sessionId: job.sessionId,
      canonicalPublicId: job.canonicalPublicId,
      status: "completed",
      attempts: job.attempts,
      reason: deletionResult.notFound
        ? "IDEMPOTENT_DELETED: Asset was already absent in Cloudinary (404 Not Found)."
        : "SUCCESS: Asset physically destroyed in Cloudinary.",
    };
  }

  // Deletion failed: evaluate retry vs dead-letter
  const newAttempts = job.attempts + 1;
  const classification = classifyCleanupError(deletionResult.error);
  const rawSanitizedError = sanitizeCleanupErrorMessage(deletionResult.error);

  // AMBIGUOUS OUTCOME DEFENSE: A 15-second client timeout does not prove the remote
  // Cloudinary destroy request was cancelled or aborted on the provider's servers.
  // The outcome is inherently ambiguous. We explicitly document this in the audit message.
  // The subsequent retry attempt will safely reconcile this: if Cloudinary destroyed the asset,
  // the retry will receive 404 (Not Found) which is resolved as idempotent success.
  const sanitizedError =
    classification === "TIMEOUT"
      ? `AMBIGUOUS_EXTERNAL_OUTCOME (TIMEOUT): 15-second Cloudinary destruction call timed out. Asset may have been destroyed or remains intact. Subsequent retry will reconcile via idempotent 404 check or re-destruction. Details: ${rawSanitizedError}`
      : rawSanitizedError;

  const retryDecision = computeCleanupRetryDecision({
    attempts: newAttempts,
    maxAttempts: job.maxAttempts,
    lastErrorClassification: classification,
    lastAttemptAtSeconds: nowSeconds,
    nowSeconds,
  });

  if (!retryDecision.isRetryable || newAttempts >= job.maxAttempts) {
    // Terminal dead-letter
    return await deadLetter(
      `MAX_ATTEMPTS_EXCEEDED (${newAttempts}/${job.maxAttempts}): ${sanitizedError}`,
      classification
    );
  }

  // Schedule retry
  const nextRetryAt = new Date(
    (retryDecision.nextAttemptAtSeconds || nowSeconds + (retryDecision.delaySeconds || 60)) * 1000
  );

  if (isDatabaseConfigured()) {
    const db = options.customDb || getDb();
    if (db) {
      await db.transaction(async (tx) => {
        await tx
          .update(mediaCleanupQueue)
          .set({
            status: "pending",
            attempts: newAttempts,
            nextRetryAt,
            lastAttemptAt: now,
            lastErrorClassification: classification,
            lastErrorMessage: sanitizedError,
            lockedByWorker: null,
            leaseExpiresAt: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(mediaCleanupQueue.id, job.id),
              eq(mediaCleanupQueue.leaseVersion, job.leaseVersion)
            )
          );

        // Revert session back to cleanup_pending so it can be retried cleanly
        await tx
          .update(mediaUploadSessions)
          .set({
            status: "cleanup_pending",
            lockedByWorker: null,
            leaseExpiresAt: null,
          })
          .where(eq(mediaUploadSessions.id, sessionRecord!.id));
      });
    }
  } else {
    updateInMemoryCleanupQueueItem(job.id, {
      status: "pending",
      attempts: newAttempts,
      nextRetryAt,
      lastAttemptAt: now,
      lastErrorClassification: classification,
      lastErrorMessage: sanitizedError,
      lockedByWorker: null,
      leaseExpiresAt: null,
    });
    updateInMemoryUploadSession(sessionRecord.id, {
      status: "cleanup_pending",
      lockedByWorker: null,
      leaseExpiresAt: null,
    });
  }

  return {
    jobId: job.id,
    sessionId: job.sessionId,
    canonicalPublicId: job.canonicalPublicId,
    status: "retrying",
    attempts: newAttempts,
    reason: `RETRY_SCHEDULED: Attempt ${newAttempts}/${job.maxAttempts} failed. Next retry in ${retryDecision.delaySeconds}s. Error: ${sanitizedError}`,
    errorClassification: classification,
  };
}

// ==============================================================================
// 5. Batch Runner Entrypoint (Feature-Flag Gated & Safe by Default)
// ==============================================================================

/**
 * Releases leases on claimed jobs that cannot be processed within the current invocation budget.
 * Immediately resets them back to 'pending' state so they can be claimed by a subsequent worker
 * without waiting for the full 120-second lease timeout.
 */
export async function releaseUnprocessedJobLeases(
  jobs: ClaimedQueueJob[],
  options?: WorkerRunOptions
): Promise<void> {
  if (!jobs || jobs.length === 0) return;
  const now = options?.nowSeconds ? new Date(options.nowSeconds * 1000) : new Date();

  if (isDatabaseConfigured()) {
    const db = options?.customDb || getDb();
    if (db) {
      for (const job of jobs) {
        await db
          .update(mediaCleanupQueue)
          .set({
            status: "pending",
            lockedByWorker: null,
            lockedAt: null,
            leaseExpiresAt: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(mediaCleanupQueue.id, job.id),
              eq(mediaCleanupQueue.leaseVersion, job.leaseVersion)
            )
          );
      }
    }
  } else {
    for (const job of jobs) {
      updateInMemoryCleanupQueueItem(job.id, {
        status: "pending",
        lockedByWorker: null,
        lockedAt: null,
        leaseExpiresAt: null,
      });
    }
  }
}

export async function runOrphanCleanupWorkerBatch(
  options?: WorkerRunOptions
): Promise<WorkerBatchReport> {
  const isEnabled =
    options?.forceEnable || process.env.ENABLE_ORPHAN_CLEANUP_WORKER === "true";

  const workerId = options?.workerId || `worker-${crypto.randomUUID().slice(0, 8)}`;
  const startedAt = new Date().toISOString();

  if (!isEnabled) {
    return {
      executed: false,
      reason:
        "WORKER_DISABLED: Background cleanup worker is disabled by default. Set ENABLE_ORPHAN_CLEANUP_WORKER=true to enable.",
      workerId,
      startedAt,
      completedAt: new Date().toISOString(),
      jobsClaimed: 0,
      outcomes: [],
      summary: {
        completed: 0,
        cancelledReferenced: 0,
        deadLetter: 0,
        retrying: 0,
      },
    };
  }

  // 15s Cloudinary client timeout + 1s DB reference check / outcome persistence overhead
  const ESTIMATED_MAX_JOB_DURATION_MS = 16_000;
  const claimedJobs = await claimEligibleCleanupJobs(options || {});
  const outcomes: JobProcessOutcome[] = [];
  let skippedDueToBudget = 0;

  for (let i = 0; i < claimedJobs.length; i++) {
    const job = claimedJobs[i];
    if (!job) continue;

    // Execution budget guard: ensure sufficient time remains before invocation deadline
    if (
      options?.deadlineMs &&
      Date.now() + ESTIMATED_MAX_JOB_DURATION_MS > options.deadlineMs
    ) {
      const unprocessed = claimedJobs.slice(i);
      skippedDueToBudget = unprocessed.length;
      await releaseUnprocessedJobLeases(unprocessed, options);
      break;
    }

    const outcome = await processCleanupJob(job, options || {});
    outcomes.push(outcome);
  }

  const completed = outcomes.filter((o) => o.status === "completed").length;
  const cancelledReferenced = outcomes.filter((o) => o.status === "cancelled_referenced").length;
  const deadLetter = outcomes.filter((o) => o.status === "dead_letter").length;
  const retrying = outcomes.filter((o) => o.status === "retrying").length;

  return {
    executed: true,
    workerId,
    startedAt,
    completedAt: new Date().toISOString(),
    jobsClaimed: claimedJobs.length,
    outcomes,
    summary: {
      completed,
      cancelledReferenced,
      deadLetter,
      retrying,
    },
    skippedDueToBudget,
  };
}

// ==============================================================================
// 6. 30-Day Queue Pruning Engine (Stage 10)
// ==============================================================================

export async function pruneCompletedCleanupQueueJobs(
  options?: PruneQueueOptions
): Promise<PruneQueueReport> {
  const olderThanDays = Math.max(1, options?.olderThanDays || 30);
  const now = options?.nowDate || new Date();
  const cutoffDate = new Date(now.getTime() - olderThanDays * 24 * 60 * 60 * 1000);
  const dryRun = options?.dryRun ?? false;

  if (isDatabaseConfigured()) {
    const db = options?.customDb || getDb();
    if (!db) {
      throw new Error("DATABASE_UNAVAILABLE: Neon database pool is unavailable.");
    }

    // 1. Total session tombstones baseline (guarantees session table is untouched)
    const sessionCountRes = await db
      .select({ count: sql<number>`count(*)` })
      .from(mediaUploadSessions);
    const retainedTombstonesCount = Number(sessionCountRes[0]?.count || 0);

    // 2. Identify eligible completed or cancelled queue items older than 30 days
    const eligibleJobs = await db
      .select({ id: mediaCleanupQueue.id })
      .from(mediaCleanupQueue)
      .where(
        and(
          inArray(mediaCleanupQueue.status, ["completed", "cancelled_referenced"]),
          lte(mediaCleanupQueue.completedAt, cutoffDate)
        )
      );

    const prunedIds = eligibleJobs.map((j) => j.id);

    if (!dryRun && prunedIds.length > 0) {
      await db
        .delete(mediaCleanupQueue)
        .where(inArray(mediaCleanupQueue.id, prunedIds));
    }

    return {
      scannedCount: eligibleJobs.length,
      prunedCount: dryRun ? 0 : prunedIds.length,
      dryRun,
      prunedIds,
      retainedTombstonesCount,
    };
  }

  // In-Memory Mode
  const queue = getInMemoryCleanupQueue();
  const eligible = queue.filter(
    (item) =>
      (item.status === "completed" || item.status === "cancelled_referenced") &&
      item.completedAt &&
      item.completedAt <= cutoffDate
  );

  const prunedIds = eligible.map((item) => item.id);

  if (!dryRun) {
    for (const id of prunedIds) {
      deleteInMemoryCleanupQueueItem(id);
    }
  }

  return {
    scannedCount: eligible.length,
    prunedCount: dryRun ? 0 : prunedIds.length,
    dryRun,
    prunedIds,
    retainedTombstonesCount: 0,
  };
}

// ==============================================================================
// 7. Dedicated Read-Only Cleanup Dry-Run Engine (Phase 5)
// ==============================================================================

export type CandidateDryRunVerdict =
  | "verified_cleanup_candidate"
  | "integrity_incident"
  | "active_reference"
  | "unverified_upload"
  | "identity_mismatch"
  | "missing_session"
  | "already_deleted"
  | "ineligible_session_state"
  | "uncertain";

export interface CandidateDryRunInspection {
  queueId: string;
  sessionId: string;
  canonicalPublicId: string;
  cloudName: string;
  folder: string;
  resourceType: string;
  deliveryType: string;
  verdict: CandidateDryRunVerdict;
  isEligible: boolean;
  reason: string;
  matchedEntity?: {
    type: "product" | "category" | "brand" | "banner";
    id: string;
  };
}

export interface CleanupDryRunOptions {
  batchSize?: number;
  nowSeconds?: number;
  customDb?: ReturnType<typeof getDb>;
}

export interface CleanupDryRunReport {
  timestamp: string;
  isDryRun: true;
  totalCandidates: number;
  summary: {
    verifiedCandidates: number;
    integrityIncidents: number;
    activeReferences: number;
    unverifiedUploads: number;
    identityMismatches: number;
    missingSessions: number;
    alreadyDeleted: number;
    ineligibleState: number;
    uncertain: number;
  };
  inspections: CandidateDryRunInspection[];
}

/**
 * Dedicated, strictly READ-ONLY dry-run engine meeting all Phase 5 requirements:
 * 1. Read-only database access (no INSERT, UPDATE, or DELETE).
 * 2. Never calls Cloudinary deletion APIs.
 * 3. Never mutates queue or session records.
 * 4. Never acquires a destructive processing lease (no FOR UPDATE).
 * 5. Never changes lifecycle states.
 * 6. Never modifies permanent tombstones.
 * 7. Inspects candidate queue records.
 * 8. Categorizes each candidate with exact eligibility/ineligibility reasons.
 * 9. Distinguishes verified candidates from uncertain or integrity incidents.
 * 10. Fails closed on any inconclusive check.
 */
export async function runOrphanCleanupDryRun(
  options?: CleanupDryRunOptions
): Promise<CleanupDryRunReport> {
  const now = options?.nowSeconds ? new Date(options.nowSeconds * 1000) : new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const batchSize = Math.max(1, Math.min(options?.batchSize || 100, 500));

  interface RawQueueCandidate {
    id: string;
    sessionId: string;
    cloudName: string;
    canonicalPublicId: string;
    resourceType: string;
    deliveryType: string;
    folder: string;
    status: string;
  }

  let candidates: RawQueueCandidate[] = [];

  if (isDatabaseConfigured()) {
    const db = options?.customDb || getDb();
    if (!db) {
      throw new Error("DATABASE_UNAVAILABLE: Neon database pool is unavailable.");
    }

    // Read-only candidate query (no lock, no update)
    const rows = await db
      .select({
        id: mediaCleanupQueue.id,
        sessionId: mediaCleanupQueue.sessionId,
        cloudName: mediaCleanupQueue.cloudName,
        canonicalPublicId: mediaCleanupQueue.canonicalPublicId,
        resourceType: mediaCleanupQueue.resourceType,
        deliveryType: mediaCleanupQueue.deliveryType,
        folder: mediaCleanupQueue.folder,
        status: mediaCleanupQueue.status,
      })
      .from(mediaCleanupQueue)
      .where(eq(mediaCleanupQueue.status, "pending"))
      .orderBy(mediaCleanupQueue.nextRetryAt)
      .limit(batchSize);

    candidates = rows;
  } else {
    // In-memory demo queue
    const memQueue = getInMemoryCleanupQueue();
    candidates = memQueue
      .filter((item) => item.status === "pending")
      .slice(0, batchSize)
      .map((item) => ({
        id: item.id,
        sessionId: item.sessionId,
        cloudName: item.cloudName,
        canonicalPublicId: item.canonicalPublicId,
        resourceType: item.resourceType,
        deliveryType: item.deliveryType,
        folder: item.folder,
        status: item.status,
      }));
  }

  const inspections: CandidateDryRunInspection[] = [];

  for (const candidate of candidates) {
    let sessionRecord: {
      id: string;
      cloudName: string;
      canonicalPublicId: string;
      resourceType: string;
      deliveryType: string;
      folder: string;
      status: string;
      uploadVerifiedAt: Date | null;
    } | null = null;

    if (isDatabaseConfigured()) {
      const db = options?.customDb || getDb();
      if (db) {
        const sRows = await db
          .select({
            id: mediaUploadSessions.id,
            cloudName: mediaUploadSessions.cloudName,
            canonicalPublicId: mediaUploadSessions.canonicalPublicId,
            resourceType: mediaUploadSessions.resourceType,
            deliveryType: mediaUploadSessions.deliveryType,
            folder: mediaUploadSessions.folder,
            status: mediaUploadSessions.status,
            uploadVerifiedAt: mediaUploadSessions.uploadVerifiedAt,
          })
          .from(mediaUploadSessions)
          .where(eq(mediaUploadSessions.id, candidate.sessionId))
          .limit(1);

        sessionRecord = sRows[0] || null;
      }
    } else {
      const memSess = getInMemoryUploadSessionById(candidate.sessionId);
      sessionRecord = memSess
        ? {
            id: memSess.id,
            cloudName: memSess.cloudName,
            canonicalPublicId: memSess.canonicalPublicId,
            resourceType: memSess.resourceType,
            deliveryType: memSess.deliveryType,
            folder: memSess.folder,
            status: memSess.status,
            uploadVerifiedAt: memSess.uploadVerifiedAt,
          }
        : null;
    }

    // 1. Missing session check
    if (!sessionRecord) {
      inspections.push({
        queueId: candidate.id,
        sessionId: candidate.sessionId,
        canonicalPublicId: candidate.canonicalPublicId,
        cloudName: candidate.cloudName,
        folder: candidate.folder,
        resourceType: candidate.resourceType,
        deliveryType: candidate.deliveryType,
        verdict: "missing_session",
        isEligible: false,
        reason: `MISSING_SESSION: Referenced session '${candidate.sessionId}' does not exist in registry.`,
      });
      continue;
    }

    // 2. Already deleted check
    if (sessionRecord.status === "deleted") {
      inspections.push({
        queueId: candidate.id,
        sessionId: candidate.sessionId,
        canonicalPublicId: candidate.canonicalPublicId,
        cloudName: candidate.cloudName,
        folder: candidate.folder,
        resourceType: candidate.resourceType,
        deliveryType: candidate.deliveryType,
        verdict: "already_deleted",
        isEligible: false,
        reason: "ALREADY_DELETED: Asset is already permanently deleted in session registry.",
      });
      continue;
    }

    // 3. Tombstone status check
    if (
      sessionRecord.status !== "cleanup_pending" &&
      sessionRecord.status !== "deletion_in_progress"
    ) {
      inspections.push({
        queueId: candidate.id,
        sessionId: candidate.sessionId,
        canonicalPublicId: candidate.canonicalPublicId,
        cloudName: candidate.cloudName,
        folder: candidate.folder,
        resourceType: candidate.resourceType,
        deliveryType: candidate.deliveryType,
        verdict: "ineligible_session_state",
        isEligible: false,
        reason: `INELIGIBLE_SESSION_STATE: Session status is '${sessionRecord.status}'. Only tombstoned sessions (cleanup_pending, deletion_in_progress) can be processed.`,
      });
      continue;
    }

    // 4. Upload verification proof check
    if (!sessionRecord.uploadVerifiedAt) {
      inspections.push({
        queueId: candidate.id,
        sessionId: candidate.sessionId,
        canonicalPublicId: candidate.canonicalPublicId,
        cloudName: candidate.cloudName,
        folder: candidate.folder,
        resourceType: candidate.resourceType,
        deliveryType: candidate.deliveryType,
        verdict: "unverified_upload",
        isEligible: false,
        reason: "UNVERIFIED_UPLOAD: Session has no confirmed cryptographic upload proof.",
      });
      continue;
    }

    // 5. F-07 Coordinate integrity check
    if (
      candidate.canonicalPublicId !== sessionRecord.canonicalPublicId ||
      candidate.cloudName !== sessionRecord.cloudName ||
      candidate.resourceType !== sessionRecord.resourceType ||
      candidate.deliveryType !== sessionRecord.deliveryType ||
      candidate.folder !== sessionRecord.folder
    ) {
      inspections.push({
        queueId: candidate.id,
        sessionId: candidate.sessionId,
        canonicalPublicId: candidate.canonicalPublicId,
        cloudName: candidate.cloudName,
        folder: candidate.folder,
        resourceType: candidate.resourceType,
        deliveryType: candidate.deliveryType,
        verdict: "identity_mismatch",
        isEligible: false,
        reason: `IDENTITY_MISMATCH (F-07): Queue snapshot coordinates differ from durable session registry. [queue=${candidate.canonicalPublicId}, session=${sessionRecord.canonicalPublicId}]`,
      });
      continue;
    }

    // 6. Authoritative Reference Check (TOCTOU Defense)
    const refCheck = await checkAuthoritativeAssetReferences(sessionRecord.canonicalPublicId, {
      customDb: options?.customDb,
      nowSeconds,
      isDurableSessionVerified: true,
    });

    if (refCheck.isReferenced) {
      inspections.push({
        queueId: candidate.id,
        sessionId: candidate.sessionId,
        canonicalPublicId: candidate.canonicalPublicId,
        cloudName: candidate.cloudName,
        folder: candidate.folder,
        resourceType: candidate.resourceType,
        deliveryType: candidate.deliveryType,
        verdict: "integrity_incident",
        isEligible: false,
        reason: `INTEGRITY_INCIDENT: Tombstoned asset was found actively referenced in catalogue entity (${refCheck.matchedEntity?.type || "unknown"}:${refCheck.matchedEntity?.id || "unknown"}). Deletion forbidden.`,
        matchedEntity: refCheck.matchedEntity,
      });
      continue;
    }

    if (refCheck.isUncertain) {
      inspections.push({
        queueId: candidate.id,
        sessionId: candidate.sessionId,
        canonicalPublicId: candidate.canonicalPublicId,
        cloudName: candidate.cloudName,
        folder: candidate.folder,
        resourceType: candidate.resourceType,
        deliveryType: candidate.deliveryType,
        verdict: "uncertain",
        isEligible: false,
        reason: `UNCERTAIN: Authoritative reference check could not prove zero references conclusively. Fail-closed. ${refCheck.reason}`,
      });
      continue;
    }

    // Passed all 6 checks!
    inspections.push({
      queueId: candidate.id,
      sessionId: candidate.sessionId,
      canonicalPublicId: candidate.canonicalPublicId,
      cloudName: candidate.cloudName,
      folder: candidate.folder,
      resourceType: candidate.resourceType,
      deliveryType: candidate.deliveryType,
      verdict: "verified_cleanup_candidate",
      isEligible: true,
      reason: "VERIFIED_CANDIDATE: Tombstoned, upload-verified, identity-consistent, zero active database references.",
    });
  }

  const verifiedCandidates = inspections.filter((i) => i.verdict === "verified_cleanup_candidate").length;
  const integrityIncidents = inspections.filter((i) => i.verdict === "integrity_incident").length;
  const activeReferences = integrityIncidents; // Alias for clarity
  const unverifiedUploads = inspections.filter((i) => i.verdict === "unverified_upload").length;
  const identityMismatches = inspections.filter((i) => i.verdict === "identity_mismatch").length;
  const missingSessions = inspections.filter((i) => i.verdict === "missing_session").length;
  const alreadyDeleted = inspections.filter((i) => i.verdict === "already_deleted").length;
  const ineligibleState = inspections.filter((i) => i.verdict === "ineligible_session_state").length;
  const uncertain = inspections.filter((i) => i.verdict === "uncertain").length;

  return {
    timestamp: new Date().toISOString(),
    isDryRun: true,
    totalCandidates: candidates.length,
    summary: {
      verifiedCandidates,
      integrityIncidents,
      activeReferences,
      unverifiedUploads,
      identityMismatches,
      missingSessions,
      alreadyDeleted,
      ineligibleState,
      uncertain,
    },
    inspections,
  };
}
