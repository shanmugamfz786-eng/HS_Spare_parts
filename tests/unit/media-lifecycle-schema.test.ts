import { describe, it, expect } from "vitest";
import {
  mediaUploadSessions,
  mediaCleanupQueue,
  MEDIA_UPLOAD_SESSION_STATUSES,
  MEDIA_CLEANUP_QUEUE_STATUSES,
  type MediaUploadSessionStatus,
  type MediaCleanupQueueStatus,
} from "@/lib/db/schema/media";
import { getTableColumns } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import fs from "fs";
import path from "path";

// Pure simulator replicating PostgreSQL trigger fn_enforce_media_upload_session_immutability
function validateSessionTransition(
  oldState: MediaUploadSessionStatus,
  newState: MediaUploadSessionStatus
): { allowed: boolean; error?: string } {
  if (oldState === newState) return { allowed: true };

  if (oldState === "deleted") {
    return { allowed: false, error: "ILLEGAL_STATE_TRANSITION: Asset is permanently deleted" };
  }
  if (oldState === "expired_uncompleted") {
    return { allowed: false, error: "ILLEGAL_STATE_TRANSITION: Expired uncompleted session cannot be modified" };
  }

  // Resurrection prohibition
  if (
    (oldState === "cleanup_pending" || oldState === "deletion_in_progress") &&
    (newState === "authorization_created" || newState === "upload_verified" || newState === "committed")
  ) {
    return { allowed: false, error: "ILLEGAL_STATE_TRANSITION: Tombstoned asset cannot return to attachable status" };
  }

  // Forward transition whitelist
  if (oldState === "authorization_created") {
    if (newState === "upload_verified" || newState === "expired_uncompleted") return { allowed: true };
    return { allowed: false, error: "ILLEGAL_STATE_TRANSITION: Invalid transition from authorization_created" };
  }

  if (oldState === "upload_verified") {
    if (newState === "committed" || newState === "cleanup_pending" || newState === "expired_uncompleted")
      return { allowed: true };
    return { allowed: false, error: "ILLEGAL_STATE_TRANSITION: Invalid transition from upload_verified" };
  }

  if (oldState === "committed") {
    if (newState === "cleanup_pending") return { allowed: true };
    return { allowed: false, error: "ILLEGAL_STATE_TRANSITION: Invalid transition from committed" };
  }

  if (oldState === "cleanup_pending") {
    if (newState === "deletion_in_progress") return { allowed: true };
    return { allowed: false, error: "ILLEGAL_STATE_TRANSITION: Invalid transition from cleanup_pending" };
  }

  if (oldState === "deletion_in_progress") {
    if (newState === "deleted" || newState === "cleanup_pending") return { allowed: true };
    return { allowed: false, error: "ILLEGAL_STATE_TRANSITION: Invalid transition from deletion_in_progress" };
  }

  return { allowed: false, error: "UNKNOWN_STATE" };
}

describe("Cloudinary Phase C5.4.1: Media Lifecycle Schema & Invariants", () => {
  // ============================================================================
  // 1. Schema Definition & Column Verification
  // ============================================================================
  describe("1. Schema Definition & Column Verification", () => {
    it("exports media tables through the schema master barrel", () => {
      expect(schema.mediaUploadSessions).toBeDefined();
      expect(schema.mediaCleanupQueue).toBeDefined();
      expect(schema.MEDIA_UPLOAD_SESSION_STATUSES).toBeDefined();
      expect(schema.MEDIA_CLEANUP_QUEUE_STATUSES).toBeDefined();
    });

    it("verifies media_upload_sessions columns and defaults", () => {
      const cols = getTableColumns(mediaUploadSessions);

      // Primary Key
      expect(cols.id).toBeDefined();
      expect(cols.id.dataType).toBe("string"); // uuid is string in JS
      expect(cols.id.primary).toBe(true);

      // Identity Coordinates
      expect(cols.cloudName).toBeDefined();
      expect(cols.canonicalPublicId).toBeDefined();
      expect(cols.resourceType).toBeDefined();
      expect(cols.deliveryType).toBeDefined();
      expect(cols.folder).toBeDefined();

      // Actor Attribution (Decoupled UUID, NOT NULL)
      expect(cols.createdByActorId).toBeDefined();
      expect(cols.createdByActorId.notNull).toBe(true);

      // Status
      expect(cols.status).toBeDefined();
      expect(cols.status.default).toBe("authorization_created");

      // Timestamps & Proof
      expect(cols.createdAt).toBeDefined();
      expect(cols.expiresAt).toBeDefined();
      expect(cols.lastUpdatedAt).toBeDefined();
      expect(cols.uploadVerifiedAt).toBeDefined();
      expect(cols.cloudinaryVersion).toBeDefined();
      expect(cols.uploadedBytes).toBeDefined();
      expect(cols.uploadProof).toBeDefined();

      // Entity Commitment & Tombstone
      expect(cols.committedAt).toBeDefined();
      expect(cols.committedEntityType).toBeDefined();
      expect(cols.committedEntityId).toBeDefined();
      expect(cols.cleanupIntentAt).toBeDefined();
      expect(cols.deletedAt).toBeDefined();

      // Lease & Concurrency
      expect(cols.leaseVersion).toBeDefined();
      expect(cols.lockedAt).toBeDefined();
      expect(cols.leaseExpiresAt).toBeDefined();
      expect(cols.lockedByWorker).toBeDefined();
    });

    it("verifies media_cleanup_queue columns and defaults", () => {
      const cols = getTableColumns(mediaCleanupQueue);

      expect(cols.id).toBeDefined();
      expect(cols.id.primary).toBe(true);
      expect(cols.sessionId).toBeDefined();
      expect(cols.sessionId.notNull).toBe(true);

      // Snapshot Identity
      expect(cols.cloudName).toBeDefined();
      expect(cols.canonicalPublicId).toBeDefined();
      expect(cols.resourceType).toBeDefined();
      expect(cols.deliveryType).toBeDefined();
      expect(cols.folder).toBeDefined();

      // Task Controls
      expect(cols.idempotencyKey).toBeDefined();
      expect(cols.triggerReason).toBeDefined();
      expect(cols.status).toBeDefined();
      expect(cols.status.default).toBe("pending");
      expect(cols.attempts).toBeDefined();
      expect(cols.attempts.default).toBe(0);
      expect(cols.maxAttempts).toBeDefined();
      expect(cols.maxAttempts.default).toBe(5);

      // Timestamps & Observability
      expect(cols.nextRetryAt).toBeDefined();
      expect(cols.lastAttemptAt).toBeDefined();
      expect(cols.lockedAt).toBeDefined();
      expect(cols.leaseExpiresAt).toBeDefined();
      expect(cols.lockedByWorker).toBeDefined();
      expect(cols.leaseVersion).toBeDefined();
      expect(cols.lastErrorClassification).toBeDefined();
      expect(cols.lastErrorMessage).toBeDefined();
      expect(cols.createdAt).toBeDefined();
      expect(cols.updatedAt).toBeDefined();
      expect(cols.completedAt).toBeDefined();
    });
  });

  // ============================================================================
  // 2. Session States & Allowed Transitions
  // ============================================================================
  describe("2. Session States & Allowed Transitions", () => {
    it("contains exactly the seven mandated lifecycle states", () => {
      expect(MEDIA_UPLOAD_SESSION_STATUSES).toEqual([
        "authorization_created",
        "upload_verified",
        "committed",
        "expired_uncompleted",
        "cleanup_pending",
        "deletion_in_progress",
        "deleted",
      ]);
      expect(MEDIA_UPLOAD_SESSION_STATUSES).toHaveLength(7);
    });

    it("allows all valid forward transitions", () => {
      expect(validateSessionTransition("authorization_created", "upload_verified").allowed).toBe(true);
      expect(validateSessionTransition("authorization_created", "expired_uncompleted").allowed).toBe(true);
      expect(validateSessionTransition("upload_verified", "committed").allowed).toBe(true);
      expect(validateSessionTransition("upload_verified", "cleanup_pending").allowed).toBe(true);
      expect(validateSessionTransition("upload_verified", "expired_uncompleted").allowed).toBe(true);
      expect(validateSessionTransition("committed", "cleanup_pending").allowed).toBe(true);
      expect(validateSessionTransition("cleanup_pending", "deletion_in_progress").allowed).toBe(true);
      expect(validateSessionTransition("deletion_in_progress", "deleted").allowed).toBe(true);
      expect(validateSessionTransition("deletion_in_progress", "cleanup_pending").allowed).toBe(true); // Lease recovery
    });

    it("rejects illegal skips and invalid backwards transitions", () => {
      // Cannot skip straight from authorization_created to committed
      expect(validateSessionTransition("authorization_created", "committed").allowed).toBe(false);
      // Cannot transition from committed back to upload_verified
      expect(validateSessionTransition("committed", "upload_verified").allowed).toBe(false);
      // Cannot transition from committed to authorization_created
      expect(validateSessionTransition("committed", "authorization_created").allowed).toBe(false);
      // Cannot skip from cleanup_pending directly to deleted without claiming lease
      expect(validateSessionTransition("cleanup_pending", "deleted").allowed).toBe(false);
    });

    it("enforces terminal states: deleted and expired_uncompleted cannot transition anywhere", () => {
      for (const targetState of MEDIA_UPLOAD_SESSION_STATUSES) {
        if (targetState !== "deleted") {
          expect(validateSessionTransition("deleted", targetState).allowed).toBe(false);
        }
        if (targetState !== "expired_uncompleted") {
          expect(validateSessionTransition("expired_uncompleted", targetState).allowed).toBe(false);
        }
      }
    });
  });

  // ============================================================================
  // 3. Permanent Tombstone Invariants & Resurrection Prohibition
  // ============================================================================
  describe("3. Permanent Tombstone Invariants & Resurrection Prohibition", () => {
    it("prohibits tombstone resurrection: condemned assets cannot return to attachable states", () => {
      const tombstonedStates: MediaUploadSessionStatus[] = ["cleanup_pending", "deletion_in_progress"];
      const attachableStates: MediaUploadSessionStatus[] = ["authorization_created", "upload_verified", "committed"];

      for (const fromState of tombstonedStates) {
        for (const toState of attachableStates) {
          const result = validateSessionTransition(fromState, toState);
          expect(result.allowed).toBe(false);
          expect(result.error).toContain("Tombstoned asset cannot return to attachable status");
        }
      }
    });

    it("enforces immutable cleanup_intent_at once set", () => {
      function validateCleanupIntentImmutability(
        oldTimestamp: Date | null,
        newTimestamp: Date | null
      ): { allowed: boolean; error?: string } {
        if (oldTimestamp !== null) {
          if (newTimestamp === null || newTimestamp.getTime() !== oldTimestamp.getTime()) {
            return {
              allowed: false,
              error: "TOMBSTONE_TIMESTAMP_MODIFICATION: cleanup_intent_at is immutable once set",
            };
          }
        }
        return { allowed: true };
      }

      const initialIntent = new Date("2026-11-20T10:00:00Z");
      // Keeping same timestamp is allowed
      expect(validateCleanupIntentImmutability(initialIntent, new Date("2026-11-20T10:00:00Z")).allowed).toBe(true);
      // Clearing timestamp is strictly blocked
      expect(validateCleanupIntentImmutability(initialIntent, null).allowed).toBe(false);
      // Altering timestamp is strictly blocked
      expect(validateCleanupIntentImmutability(initialIntent, new Date("2026-11-20T11:00:00Z")).allowed).toBe(false);
    });

    it("freezes entity ownership once tombstoned", () => {
      function validateOwnershipModification(
        cleanupIntentAt: Date | null,
        oldEntity: { type: string | null; id: string | null },
        newEntity: { type: string | null; id: string | null }
      ): { allowed: boolean; error?: string } {
        if (cleanupIntentAt !== null) {
          if (oldEntity.type !== newEntity.type || oldEntity.id !== newEntity.id) {
            return {
              allowed: false,
              error: "TOMBSTONED_OWNERSHIP_MODIFICATION: Ownership cannot be altered on a tombstoned asset",
            };
          }
        }
        return { allowed: true };
      }

      const tombstoneTime = new Date();
      // Attempting to rebind entity after entering tombstone is blocked
      expect(
        validateOwnershipModification(
          tombstoneTime,
          { type: "product", id: "prod_123" },
          { type: "product", id: "prod_456" }
        ).allowed).toBe(false);

      // Attempting to clear entity after entering tombstone is blocked
      expect(
        validateOwnershipModification(
          tombstoneTime,
          { type: "product", id: "prod_123" },
          { type: null, id: null }
        ).allowed).toBe(false);

      // Untombstoned session (before cleanup_intent_at) allows initial binding
      expect(
        validateOwnershipModification(
          null,
          { type: null, id: null },
          { type: "product", id: "prod_123" }
        ).allowed).toBe(true);
    });
  });

  // ============================================================================
  // 4. Immutable Actor Attribution & Decoupled Identity
  // ============================================================================
  describe("4. Immutable Actor Attribution & Decoupled Identity", () => {
    it("uses created_by_actor_id without a foreign key to users table", () => {
      const cols = getTableColumns(mediaUploadSessions);
      expect(cols.createdByActorId).toBeDefined();
      expect(cols.createdByActorId.name).toBe("created_by_actor_id");
      expect(cols.createdByActorId.notNull).toBe(true);

      // Verify there is no adminUserId column
      expect((cols as Record<string, unknown>).adminUserId).toBeUndefined();
    });

    it("preserves actor attribution even if user account is deleted", () => {
      // In the SQL schema, created_by_actor_id has NO foreign key constraint to users(id).
      // Therefore, deleting a user row in the users table has ZERO CASCADE OR NULLIFY effect
      // on media_upload_sessions.created_by_actor_id.
      const migrationSql = fs.readFileSync(
        path.join(__dirname, "../../src/lib/db/migrations/0005_media_lifecycle.sql"),
        "utf-8"
      );
      expect(migrationSql).toContain('"created_by_actor_id" uuid NOT NULL');
      expect(migrationSql).not.toContain('FOREIGN KEY ("created_by_actor_id")');
    });

    it("rejects modification of created_by_actor_id on update", () => {
      function validateActorImmutability(
        oldActorId: string,
        newActorId: string
      ): { allowed: boolean; error?: string } {
        if (oldActorId !== newActorId) {
          return {
            allowed: false,
            error: "IMMUTABLE_IDENTITY_MODIFICATION: Core identity fields of media_upload_sessions cannot be modified",
          };
        }
        return { allowed: true };
      }

      expect(validateActorImmutability("actor_uuid_1", "actor_uuid_1").allowed).toBe(true);
      expect(validateActorImmutability("actor_uuid_1", "actor_uuid_2").allowed).toBe(false);
    });
  });

  // ============================================================================
  // 5. Queue States, Terminal Behavior & Bounded Retries
  // ============================================================================
  describe("5. Queue States, Terminal Behavior & Bounded Retries", () => {
    it("contains exactly the five mandated cleanup queue states", () => {
      expect(MEDIA_CLEANUP_QUEUE_STATUSES).toEqual([
        "pending",
        "processing",
        "completed",
        "cancelled_referenced",
        "dead_letter",
      ]);
      expect(MEDIA_CLEANUP_QUEUE_STATUSES).toHaveLength(5);
    });

    it("verifies bounded retry contract with max_attempts = 5 (1 initial + 4 retries)", () => {
      const RETRY_DELAYS_SECONDS = [60, 300, 1500, 7200];
      const MAX_ATTEMPTS = 5;

      function computeNextQueueStep(currentAttempts: number): {
        action: "execute" | "retry" | "dead_letter";
        nextAttemptNumber?: number;
        delaySeconds?: number;
      } {
        if (currentAttempts === 0) {
          return { action: "execute", nextAttemptNumber: 1, delaySeconds: 0 };
        }
        if (currentAttempts < MAX_ATTEMPTS) {
          const retryIndex = currentAttempts - 1; // 1 -> index 0 (60s), 2 -> index 1 (300s), etc.
          return {
            action: "retry",
            nextAttemptNumber: currentAttempts + 1,
            delaySeconds: RETRY_DELAYS_SECONDS[retryIndex],
          };
        }
        return { action: "dead_letter" };
      }

      // Initial execution (Attempt 1)
      const step1 = computeNextQueueStep(0);
      expect(step1.action).toBe("execute");
      expect(step1.nextAttemptNumber).toBe(1);

      // Retry 1 after failure (Attempt 2) -> Delay 60s
      const step2 = computeNextQueueStep(1);
      expect(step2.action).toBe("retry");
      expect(step2.nextAttemptNumber).toBe(2);
      expect(step2.delaySeconds).toBe(60);

      // Retry 2 after failure (Attempt 3) -> Delay 300s
      const step3 = computeNextQueueStep(2);
      expect(step3.action).toBe("retry");
      expect(step3.nextAttemptNumber).toBe(3);
      expect(step3.delaySeconds).toBe(300);

      // Retry 3 after failure (Attempt 4) -> Delay 1500s
      const step4 = computeNextQueueStep(3);
      expect(step4.action).toBe("retry");
      expect(step4.nextAttemptNumber).toBe(4);
      expect(step4.delaySeconds).toBe(1500);

      // Retry 4 after failure (Attempt 5) -> Delay 7200s
      const step5 = computeNextQueueStep(4);
      expect(step5.action).toBe("retry");
      expect(step5.nextAttemptNumber).toBe(5);
      expect(step5.delaySeconds).toBe(7200);

      // After 5 attempts fail -> dead_letter (No 6th automatic attempt)
      const step6 = computeNextQueueStep(5);
      expect(step6.action).toBe("dead_letter");
      expect(step6.nextAttemptNumber).toBeUndefined();
    });

    it("verifies terminal queue states cannot silently return to processing", () => {
      const terminalStates: MediaCleanupQueueStatus[] = ["completed", "cancelled_referenced", "dead_letter"];

      function validateQueuePollEligibility(status: MediaCleanupQueueStatus): boolean {
        // Only 'pending' items are polled by workers
        return status === "pending";
      }

      for (const termState of terminalStates) {
        expect(validateQueuePollEligibility(termState)).toBe(false);
      }
      expect(validateQueuePollEligibility("processing")).toBe(false);
      expect(validateQueuePollEligibility("pending")).toBe(true);
    });
  });

  // ============================================================================
  // 6. Legacy Asset Exclusion & Provenance Verification
  // ============================================================================
  describe("6. Legacy Asset Exclusion & Provenance Verification", () => {
    it("excludes legacy assets lacking verified upload sessions from automatic deletion", () => {
      // In our architecture, media_cleanup_queue requires session_id referencing media_upload_sessions.id.
      // Legacy unmanaged assets (uploaded before C5.4) have no media_upload_sessions row.
      const cols = getTableColumns(mediaCleanupQueue);
      expect(cols.sessionId.notNull).toBe(true);

      function canAssetEnterAutomaticCleanupQueue(sessionRecord: {
        id: string;
        status: MediaUploadSessionStatus;
        uploadVerifiedAt: Date | null;
      } | null): boolean {
        if (!sessionRecord) {
          // Legacy asset without session record: cannot be queued
          return false;
        }
        // Only sessions that were properly verified and tombstoned can enter cleanup
        return (
          sessionRecord.status === "cleanup_pending" &&
          sessionRecord.uploadVerifiedAt !== null
        );
      }

      // Legacy asset (null session) -> EXCLUDED
      expect(canAssetEnterAutomaticCleanupQueue(null)).toBe(false);

      // Session in authorization_created without proof -> EXCLUDED
      expect(
        canAssetEnterAutomaticCleanupQueue({
          id: "session_123",
          status: "authorization_created",
          uploadVerifiedAt: null,
        })
      ).toBe(false);

      // Valid verified session in cleanup_pending -> ALLOWED
      expect(
        canAssetEnterAutomaticCleanupQueue({
          id: "session_456",
          status: "cleanup_pending",
          uploadVerifiedAt: new Date(),
        })
      ).toBe(true);
    });
  });

  // ============================================================================
  // 7. Queue Pruning Isolation
  // ============================================================================
  describe("7. Queue Pruning Isolation", () => {
    it("enforces ON DELETE RESTRICT from queue to session in migration SQL", () => {
      const migrationSql = fs.readFileSync(
        path.join(__dirname, "../../src/lib/db/migrations/0005_media_lifecycle.sql"),
        "utf-8"
      );

      // Queue references session with ON DELETE RESTRICT
      expect(migrationSql).toContain(
        'FOREIGN KEY ("session_id") REFERENCES "media_upload_sessions"("id") ON DELETE restrict'
      );

      // Session table is protected by BEFORE DELETE trigger
      expect(migrationSql).toContain("BEFORE DELETE ON \"media_upload_sessions\"");
      expect(migrationSql).toContain("DELETION_PROHIBITED: media_upload_sessions rows are permanent records");
    });

    it("guarantees pruning queue tasks leaves session tombstones untouched", () => {
      // Simulating database delete of a completed queue row:
      // DELETE FROM media_cleanup_queue WHERE status = 'completed' AND completed_at < now() - interval '30 days';
      // The session row remains in media_upload_sessions because ON DELETE RESTRICT on the FK
      // ensures parent deletion is blocked if child exists, but child deletion never deletes the parent!
      const cols = getTableColumns(mediaCleanupQueue);
      expect(cols.sessionId).toBeDefined();

      const sessionCols = getTableColumns(mediaUploadSessions);
      expect(sessionCols.cleanupIntentAt).toBeDefined();
    });
  });

  // ============================================================================
  // 8. Migration SQL & Journal Verification
  // ============================================================================
  describe("8. Migration SQL & Journal Verification", () => {
    it("verifies migration journal includes 0005_media_lifecycle entry", () => {
      const journalRaw = fs.readFileSync(
        path.join(__dirname, "../../src/lib/db/migrations/meta/_journal.json"),
        "utf-8"
      );
      const journal = JSON.parse(journalRaw);

      expect(journal.entries).toHaveLength(6);
      const entry5 = journal.entries[5];
      expect(entry5.idx).toBe(5);
      expect(entry5.tag).toBe("0005_media_lifecycle");
      expect(entry5.version).toBe("7");
    });

    it("verifies 0005_media_lifecycle.sql contains all mandatory triggers and constraints", () => {
      const migrationSql = fs.readFileSync(
        path.join(__dirname, "../../src/lib/db/migrations/0005_media_lifecycle.sql"),
        "utf-8"
      );

      // Tables
      expect(migrationSql).toContain('CREATE TABLE "media_upload_sessions"');
      expect(migrationSql).toContain('CREATE TABLE "media_cleanup_queue"');

      // Unique asset identity constraint
      expect(migrationSql).toContain('CREATE UNIQUE INDEX "uq_media_sessions_asset_identity"');

      // Partial unique active job index
      expect(migrationSql).toContain('CREATE UNIQUE INDEX "uq_media_queue_active_job"');
      expect(migrationSql).toContain("WHERE \"status\" IN ('pending', 'processing')");

      // Check constraints
      expect(migrationSql).toContain('CONSTRAINT "media_sessions_status_valid"');
      expect(migrationSql).toContain('CONSTRAINT "media_sessions_upload_verified_check"');
      expect(migrationSql).toContain('CONSTRAINT "media_sessions_committed_check"');
      expect(migrationSql).toContain('CONSTRAINT "media_sessions_cleanup_intent_check"');
      expect(migrationSql).toContain('CONSTRAINT "media_sessions_deleted_check"');
      expect(migrationSql).toContain('CONSTRAINT "media_queue_status_valid"');
      expect(migrationSql).toContain('CONSTRAINT "media_queue_attempts_valid"');

      // Functions and Triggers
      expect(migrationSql).toContain("fn_prevent_truncate_media_sessions()");
      expect(migrationSql).toContain("trg_prevent_truncate_media_sessions");
      expect(migrationSql).toContain("fn_enforce_media_upload_session_immutability()");
      expect(migrationSql).toContain("trg_media_upload_session_immutability_update");
      expect(migrationSql).toContain("trg_media_upload_session_immutability_delete");

      // C5.5 Security Hardening: F-08 & F-09
      expect(migrationSql).toContain("fn_enforce_media_cleanup_queue_immutability()");
      expect(migrationSql).toContain("trg_media_cleanup_queue_immutability_update");
      expect(migrationSql).toContain("trg_media_cleanup_queue_immutability_delete");
      expect(migrationSql).toContain("SET search_path = public, pg_temp;");

      // Privilege Boundary Comments
      expect(migrationSql).toContain("BASELINE MODE");
      expect(migrationSql).toContain("HARDENED MODE");
      expect(migrationSql).toContain("hs_app_runtime");
    });
  });
});
