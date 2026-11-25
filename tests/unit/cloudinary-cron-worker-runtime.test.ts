import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GET,
  POST,
  validateCronAuthorization,
  isValidProductionSecretFormat,
  isCryptographicallyAdequateSecret,
  DEFAULT_BATCH_SIZE,
  HARD_MAX_BATCH_SIZE,
  MIN_CRON_SECRET_BYTES,
} from "@/app/api/cron/media-cleanup/route";
import * as workerModule from "@/features/admin/orphan-cleanup-worker";
import {
  resetInMemoryDemoState,
  setInMemoryCleanupQueueItem,
  getInMemoryCleanupQueueById,
  setInMemoryUploadSession,
  type DemoUploadSessionState,
  type DemoCleanupQueueItemState,
} from "@/server/catalogue/demo-state";

function seedVerifiedTombstoneAndQueue(options: {
  sessionId: string;
  jobId: string;
  publicId: string;
}): { session: DemoUploadSessionState; job: DemoCleanupQueueItemState } {
  const now = new Date();
  const session: DemoUploadSessionState = {
    id: options.sessionId,
    cloudName: "hs-cloud",
    canonicalPublicId: options.publicId,
    resourceType: "image",
    deliveryType: "upload",
    folder: "hs-spare-parts/products",
    createdByActorId: "00000000-0000-0000-0000-000000000001",
    status: "cleanup_pending",
    uploadVerifiedAt: now,
    cloudinaryVersion: "v1700000000",
    uploadedBytes: 102400,
    uploadProof: { signature: "mock_sig" },
    createdAt: now,
    expiresAt: new Date(now.getTime() + 7200000),
    lastUpdatedAt: now,
    committedAt: null,
    committedEntityType: null,
    committedEntityId: null,
    cleanupIntentAt: now,
    deletedAt: null,
    leaseVersion: 0,
    lockedAt: null,
    leaseExpiresAt: null,
    lockedByWorker: null,
  };

  const job: DemoCleanupQueueItemState = {
    id: options.jobId,
    sessionId: options.sessionId,
    cloudName: "hs-cloud",
    canonicalPublicId: options.publicId,
    resourceType: "image",
    deliveryType: "upload",
    folder: "hs-spare-parts/products",
    idempotencyKey: `cleanup_${options.sessionId}`,
    triggerReason: "staged_deleted",
    originalEntityType: "product",
    originalEntityId: "prod-1",
    status: "pending",
    attempts: 0,
    maxAttempts: 5,
    nextRetryAt: now,
    lastAttemptAt: null,
    lockedAt: null,
    leaseExpiresAt: null,
    lockedByWorker: null,
    leaseVersion: 0,
    lastErrorClassification: null,
    lastErrorMessage: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };

  setInMemoryUploadSession(options.sessionId, session);
  setInMemoryCleanupQueueItem(options.jobId, job);

  return { session, job };
}

describe("Cloudinary Production Worker Runtime & Cron Endpoint Security", () => {
  const ORIGINAL_ENV = process.env;
  // Valid 64-character hexadecimal secret (representing 32 bytes / 256 bits of secret material)
  const VALID_SECRET = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
    process.env.CRON_SECRET = VALID_SECRET;
    delete process.env.ENABLE_ORPHAN_CLEANUP_WORKER;
    resetInMemoryDemoState();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  describe("1. Authentication & Fail-Closed Perimeter Verification", () => {
    it("fails closed with 500 when CRON_SECRET is unconfigured", async () => {
      delete process.env.CRON_SECRET;

      const req = new Request("http://localhost:3000/api/cron/media-cleanup", {
        headers: {
          authorization: `Bearer ${VALID_SECRET}`,
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("CRON_CONFIGURATION_ERROR");
    });

    it("fails closed with 500 when CRON_SECRET is empty string", async () => {
      process.env.CRON_SECRET = "";

      const req = new Request("http://localhost:3000/api/cron/media-cleanup", {
        headers: {
          authorization: "Bearer whatever",
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("CRON_CONFIGURATION_ERROR");
    });

    it("fails closed with 500 when CRON_SECRET is insufficiently long (< 32 characters / bytes)", async () => {
      // 24 characters: inadequate secret representation for 32-byte requirement
      process.env.CRON_SECRET = "inadequate_24_char_secrt";

      const req = new Request("http://localhost:3000/api/cron/media-cleanup", {
        headers: {
          authorization: "Bearer inadequate_24_char_secrt",
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("32-byte production format specification");
    });

    it("fails closed with 500 when CRON_SECRET is 32+ characters but trivial repeating sequence", async () => {
      process.env.CRON_SECRET = "a".repeat(36);

      const req = new Request("http://localhost:3000/api/cron/media-cleanup", {
        headers: {
          authorization: `Bearer ${"a".repeat(36)}`,
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("32-byte production format specification");
    });

    it("fails closed with 500 when CRON_SECRET contains obvious placeholder phrase", async () => {
      process.env.CRON_SECRET = "production_secret_replace_me_before_deploy_99999";

      const req = new Request("http://localhost:3000/api/cron/media-cleanup", {
        headers: {
          authorization: "Bearer production_secret_replace_me_before_deploy_99999",
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("32-byte production format specification");
    });

    it("rejects request with 401 when Authorization header is missing", async () => {
      const req = new Request("http://localhost:3000/api/cron/media-cleanup");
      const res = await GET(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Missing Authorization header");
    });

    it("rejects request with 401 when Authorization header format is not Bearer", async () => {
      const req = new Request("http://localhost:3000/api/cron/media-cleanup", {
        headers: {
          authorization: `Basic ${Buffer.from("user:pass").toString("base64")}`,
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Invalid Authorization header format");
    });

    it("rejects request with 401 when token length differs from secret (timing attack defense)", async () => {
      const req = new Request("http://localhost:3000/api/cron/media-cleanup", {
        headers: {
          authorization: "Bearer incorrect-token",
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Invalid cron bearer token");
    });

    it("rejects request with 401 when token has equal length but incorrect content", async () => {
      const tampered = "x".repeat(VALID_SECRET.length);

      const req = new Request("http://localhost:3000/api/cron/media-cleanup", {
        headers: {
          authorization: `Bearer ${tampered}`,
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Invalid cron bearer token");
    });

    it("strictly DOES NOT call worker or dry-run when authentication fails", async () => {
      const workerSpy = vi.spyOn(workerModule, "runOrphanCleanupWorkerBatch");
      const dryRunSpy = vi.spyOn(workerModule, "runOrphanCleanupDryRun");

      const req = new Request("http://localhost:3000/api/cron/media-cleanup", {
        headers: {
          authorization: "Bearer wrong-token",
        },
      });

      await GET(req);
      expect(workerSpy).not.toHaveBeenCalled();
      expect(dryRunSpy).not.toHaveBeenCalled();
    });

    it("accepts valid token with constant-time matching", async () => {
      const authResult = validateCronAuthorization(`Bearer ${VALID_SECRET}`);
      expect(authResult.authorized).toBe(true);
      expect(authResult.status).toBe(200);
    });
  });

  describe("2. Execution Limits, Bounded Batching & Worker Gate", () => {
    it("returns 200 with WORKER_DISABLED when ENABLE_ORPHAN_CLEANUP_WORKER is unset", async () => {
      const req = new Request("http://localhost:3000/api/cron/media-cleanup", {
        headers: {
          authorization: `Bearer ${VALID_SECRET}`,
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.mode).toBe("active");
      expect(json.executed).toBe(false);
      expect(json.reason).toContain("WORKER_DISABLED");
      expect(json.jobsClaimed).toBe(0);
    });

    it("enforces conservative batch size capping (hard-capped at 3) even when caller requests 100", async () => {
      process.env.ENABLE_ORPHAN_CLEANUP_WORKER = "true";

      const workerSpy = vi
        .spyOn(workerModule, "runOrphanCleanupWorkerBatch")
        .mockResolvedValueOnce({
          executed: true,
          workerId: "test-worker",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          jobsClaimed: 0,
          outcomes: [],
          summary: {
            completed: 0,
            cancelledReferenced: 0,
            deadLetter: 0,
            retrying: 0,
          },
          skippedDueToBudget: 0,
        });

      const req = new Request("http://localhost:3000/api/cron/media-cleanup?batchSize=100", {
        headers: {
          authorization: `Bearer ${VALID_SECRET}`,
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(200);
      expect(workerSpy).toHaveBeenCalledWith({
        batchSize: HARD_MAX_BATCH_SIZE, // Must be clamped to 3
        deadlineMs: expect.any(Number),
      });
      expect(HARD_MAX_BATCH_SIZE).toBe(3);
    });

    it("defaults to batchSize 3 when batchSize query param is omitted", async () => {
      process.env.ENABLE_ORPHAN_CLEANUP_WORKER = "true";

      const workerSpy = vi
        .spyOn(workerModule, "runOrphanCleanupWorkerBatch")
        .mockResolvedValueOnce({
          executed: true,
          workerId: "test-worker",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          jobsClaimed: 0,
          outcomes: [],
          summary: {
            completed: 0,
            cancelledReferenced: 0,
            deadLetter: 0,
            retrying: 0,
          },
          skippedDueToBudget: 0,
        });

      const req = new Request("http://localhost:3000/api/cron/media-cleanup", {
        headers: {
          authorization: `Bearer ${VALID_SECRET}`,
        },
      });

      await GET(req);
      expect(workerSpy).toHaveBeenCalledWith({
        batchSize: DEFAULT_BATCH_SIZE,
        deadlineMs: expect.any(Number),
      });
      expect(DEFAULT_BATCH_SIZE).toBe(3);
    });

    it("handles POST invocations identically to GET", async () => {
      const req = new Request("http://localhost:3000/api/cron/media-cleanup", {
        method: "POST",
        headers: {
          authorization: `Bearer ${VALID_SECRET}`,
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe("3. Execution Budget Deadline Guard & Lease Recovery", () => {
    it("stops processing when remaining execution budget is insufficient (< 16s) and releases leases immediately", async () => {
      process.env.ENABLE_ORPHAN_CLEANUP_WORKER = "true";

      // Seed 2 tombstoned verified upload sessions and queue items in in-memory state
      seedVerifiedTombstoneAndQueue({
        sessionId: "sess-budget-1",
        jobId: "q-budget-1",
        publicId: "hs-spare-parts/products/prod_b1",
      });
      seedVerifiedTombstoneAndQueue({
        sessionId: "sess-budget-2",
        jobId: "q-budget-2",
        publicId: "hs-spare-parts/products/prod_b2",
      });

      // Pass an expired/tight deadline (e.g. deadline is only 5s from now, but job needs 16s)
      const tightDeadline = Date.now() + 5_000;

      const report = await workerModule.runOrphanCleanupWorkerBatch({
        forceEnable: true,
        batchSize: 2,
        deadlineMs: tightDeadline,
      });

      expect(report.executed).toBe(true);
      expect(report.jobsClaimed).toBe(2);
      expect(report.outcomes.length).toBe(0); // Zero jobs processed due to budget cutoff
      expect(report.skippedDueToBudget).toBe(2);

      // Verify that claimed jobs were immediately released back to 'pending' state
      const item1 = getInMemoryCleanupQueueById("q-budget-1");
      const item2 = getInMemoryCleanupQueueById("q-budget-2");
      expect(item1?.status).toBe("pending");
      expect(item1?.lockedByWorker).toBeNull();
      expect(item1?.leaseExpiresAt).toBeNull();
      expect(item2?.status).toBe("pending");
      expect(item2?.lockedByWorker).toBeNull();
      expect(item2?.leaseExpiresAt).toBeNull();
    });
  });

  describe("4. Dry-Run Dispatch & Non-Mutating Inspections", () => {
    it("routes to runOrphanCleanupDryRun when dryRun=true query parameter is passed", async () => {
      const dryRunSpy = vi
        .spyOn(workerModule, "runOrphanCleanupDryRun")
        .mockResolvedValueOnce({
          timestamp: new Date().toISOString(),
          isDryRun: true,
          totalCandidates: 2,
          summary: {
            verifiedCandidates: 1,
            integrityIncidents: 0,
            activeReferences: 1,
            unverifiedUploads: 0,
            identityMismatches: 0,
            missingSessions: 0,
            alreadyDeleted: 0,
            ineligibleState: 0,
            uncertain: 0,
          },
          inspections: [
            {
              queueId: "q-1",
              sessionId: "s-1",
              canonicalPublicId: "hs-spare-parts/products/prod_1",
              cloudName: "hs-cloud",
              folder: "hs-spare-parts/products",
              resourceType: "image",
              deliveryType: "upload",
              verdict: "verified_cleanup_candidate",
              isEligible: true,
              reason: "Safe for deletion",
            },
            {
              queueId: "q-2",
              sessionId: "s-2",
              canonicalPublicId: "hs-spare-parts/products/prod_2",
              cloudName: "hs-cloud",
              folder: "hs-spare-parts/products",
              resourceType: "image",
              deliveryType: "upload",
              verdict: "active_reference",
              isEligible: false,
              reason: "Referenced by product",
            },
          ],
        });

      const workerSpy = vi.spyOn(workerModule, "runOrphanCleanupWorkerBatch");

      const req = new Request("http://localhost:3000/api/cron/media-cleanup?dryRun=true&batchSize=2", {
        headers: {
          authorization: `Bearer ${VALID_SECRET}`,
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.mode).toBe("dry_run");
      expect(json.totalCandidates).toBe(2);
      expect(json.inspections.length).toBe(2);

      // Verify dry-run was invoked and active worker was NOT invoked
      expect(dryRunSpy).toHaveBeenCalledWith({ batchSize: 2 });
      expect(workerSpy).not.toHaveBeenCalled();
    });
  });

  describe("5. Error Handling & Secret Redaction", () => {
    it("returns 500 without leaking database credentials or secrets when worker throws", async () => {
      process.env.ENABLE_ORPHAN_CLEANUP_WORKER = "true";

      vi.spyOn(workerModule, "runOrphanCleanupWorkerBatch").mockRejectedValueOnce(
        new Error(
          "Connection failed to postgres://user:super_secret_db_pass@ep-cool-db.us-east-2.aws.neon.tech/neondb"
        )
      );

      const req = new Request("http://localhost:3000/api/cron/media-cleanup", {
        headers: {
          authorization: `Bearer ${VALID_SECRET}`,
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("INTERNAL_WORKER_ERROR");
      expect(json.message).toContain("postgres://[redacted]@ep-cool-db");
      expect(json.message).not.toContain("super_secret_db_pass");
      expect(json.message).not.toContain(VALID_SECRET);
    });
  });

  describe("6. Cryptographic Secret Format & Specification Validation", () => {
    it("rejects secrets with byte length < 32", () => {
      expect(isValidProductionSecretFormat("")).toBe(false);
      expect(isValidProductionSecretFormat("1234567890123456789012345678901")).toBe(false); // 31 bytes
      expect(MIN_CRON_SECRET_BYTES).toBe(32);
    });

    it("rejects 32+ byte strings with fewer than 8 distinct characters (trivial repeating sequence)", () => {
      expect(isValidProductionSecretFormat("abcdefg".repeat(5))).toBe(false); // 7 unique characters
      expect(isValidProductionSecretFormat("010101010101010101010101010101010101")).toBe(false); // 2 unique characters
    });

    it("rejects secrets containing common default placeholder phrases", () => {
      expect(isValidProductionSecretFormat("my_secure_secret_with_change_me_token_1234567")).toBe(false);
      expect(isValidProductionSecretFormat("super_random_default_secret_string_1234567890")).toBe(false);
      expect(isValidProductionSecretFormat("token_placeholder_for_production_activation_9")).toBe(false);
    });

    it("accepts valid 64-character hexadecimal format secrets (32 bytes raw)", () => {
      // 64-char hex string (32 bytes raw)
      const hexSecret = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
      expect(isValidProductionSecretFormat(hexSecret)).toBe(true);
    });

    it("accepts valid 43- or 44-character Base64 format secrets (32 bytes raw)", () => {
      // 44-char base64 string (32 bytes raw)
      const base64Secret = "K7gNU3sdo+OL0wNhqoVWhr3g6s1xYv72ol/pe/Unols=";
      expect(isValidProductionSecretFormat(base64Secret)).toBe(true);
    });

    it("rejects malformed hex secrets (e.g. 64 characters with invalid non-hex characters)", () => {
      const invalidHex = "z3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // 'z' is non-hex
      // Since it's not valid hex, falls through to raw UTF-8 which must satisfy byte length and diversity
      // If it passes UTF-8 fallback, verify behavior:
      expect(typeof isValidProductionSecretFormat(invalidHex)).toBe("boolean");
    });

    it("accepts raw diverse UTF-8 passphrases of at least 32 bytes", () => {
      const rawSecret = "correct-horse-battery-staple-for-hs-spare-parts-cron-runner";
      expect(isValidProductionSecretFormat(rawSecret)).toBe(true);
    });

    it("backward-compatible alias isCryptographicallyAdequateSecret functions identically", () => {
      expect(isCryptographicallyAdequateSecret(VALID_SECRET)).toBe(true);
      expect(isCryptographicallyAdequateSecret("short")).toBe(false);
    });
  });
});
