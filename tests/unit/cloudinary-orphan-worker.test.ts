import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  claimEligibleCleanupJobs,
  processCleanupJob,
  runOrphanCleanupWorkerBatch,
  pruneCompletedCleanupQueueJobs,
  runOrphanCleanupDryRun,
  ProductionCloudinaryDeletionClient,
  type CloudinaryDeletionClient,
  type CloudinaryDeletionResult,
  type ClaimedQueueJob,
} from "@/features/admin/orphan-cleanup-worker";
import {
  resetInMemoryDemoState,
  setInMemoryUploadSession,
  getInMemoryUploadSessionById,
  setInMemoryCleanupQueueItem,
  getInMemoryCleanupQueueById,
  setInMemoryCategory,
  setInMemoryBrand,
  setInMemoryBanners,
  INITIAL_DEMO_CATEGORIES,
  INITIAL_DEMO_BRANDS,
  INITIAL_DEMO_BANNERS,
  type DemoUploadSessionState,
  type DemoCleanupQueueItemState,
} from "@/server/catalogue/demo-state";

describe("Cloudinary Phase C5.5: Orphan Cleanup Worker & Security Verification", () => {
  const DEFAULT_CLOUD_NAME = "hs-spare-parts-demo";
  const DEFAULT_ACTOR_ID = "00000000-0000-0000-0000-000000000001";
  const SAMPLE_PUBLIC_ID = "hs-spare-parts/products/prod_sample_123";

  // Mock deletion client factory
  function createMockDeletionClient(
    mockResult: CloudinaryDeletionResult
  ): CloudinaryDeletionClient & { calls: Array<{ publicId: string; options?: unknown }> } {
    const calls: Array<{ publicId: string; options?: unknown }> = [];
    return {
      calls,
      destroyAsset: vi.fn(async (publicId: string, options?: unknown) => {
        calls.push({ publicId, options });
        return mockResult;
      }),
    };
  }

  // Helper to seed a valid verified tombstoned session and queue job
  function seedVerifiedTombstoneAndQueue(options?: {
    sessionId?: string;
    jobId?: string;
    publicId?: string;
    sessionStatus?: string;
    queueStatus?: string;
    uploadVerified?: boolean;
    folder?: string;
    cloudName?: string;
    resourceType?: string;
    deliveryType?: string;
    queuePublicId?: string; // For testing snapshot mismatch
    queueAttempts?: number;
    leaseExpiresAt?: Date | null;
  }): { session: DemoUploadSessionState; job: DemoCleanupQueueItemState } {
    const sessionId = options?.sessionId || "sess-uuid-001";
    const jobId = options?.jobId || "job-uuid-001";
    const publicId = options?.publicId || SAMPLE_PUBLIC_ID;
    const folder = options?.folder || "hs-spare-parts/products";
    const cloudName = options?.cloudName || DEFAULT_CLOUD_NAME;
    const resourceType = options?.resourceType || "image";
    const deliveryType = options?.deliveryType || "upload";

    const session: DemoUploadSessionState = {
      id: sessionId,
      cloudName,
      canonicalPublicId: publicId,
      resourceType,
      deliveryType,
      folder,
      createdByActorId: DEFAULT_ACTOR_ID,
      status: options?.sessionStatus || "cleanup_pending",
      uploadVerifiedAt: options?.uploadVerified !== false ? new Date("2026-11-20T10:00:00Z") : null,
      cloudinaryVersion: "v1700000000",
      uploadedBytes: 102400,
      uploadProof: { signature: "mock_sig" },
      createdAt: new Date("2026-11-20T09:00:00Z"),
      expiresAt: new Date("2026-11-20T11:00:00Z"),
      lastUpdatedAt: new Date("2026-11-20T10:00:00Z"),
      committedAt: null,
      committedEntityType: null,
      committedEntityId: null,
      cleanupIntentAt: new Date("2026-11-20T10:30:00Z"),
      deletedAt: null,
      leaseVersion: 0,
      lockedAt: null,
      leaseExpiresAt: null,
      lockedByWorker: null,
    };

    const job: DemoCleanupQueueItemState = {
      id: jobId,
      sessionId,
      cloudName,
      canonicalPublicId: options?.queuePublicId || publicId,
      resourceType,
      deliveryType,
      folder,
      idempotencyKey: `cleanup_${sessionId}`,
      triggerReason: "product_image_replaced",
      originalEntityType: "product",
      originalEntityId: "prod-1",
      status: options?.queueStatus || "pending",
      attempts: options?.queueAttempts || 0,
      maxAttempts: 5,
      nextRetryAt: new Date("2026-11-20T10:30:00Z"),
      lastAttemptAt: null,
      lockedAt: null,
      leaseExpiresAt: options?.leaseExpiresAt || null,
      lockedByWorker: null,
      leaseVersion: 0,
      lastErrorClassification: null,
      lastErrorMessage: null,
      createdAt: new Date("2026-11-20T10:30:00Z"),
      updatedAt: new Date("2026-11-20T10:30:00Z"),
      completedAt: null,
    };

    setInMemoryUploadSession(sessionId, session);
    setInMemoryCleanupQueueItem(jobId, job);

    return { session, job };
  }

  beforeEach(() => {
    resetInMemoryDemoState();
    vi.restoreAllMocks();
  });

  // ============================================================================
  // 1. Worker Claiming & Lease Coordination (Stage 2)
  // ============================================================================
  describe("1. Worker Claiming & Lease Coordination", () => {
    it("claims pending jobs whose next_retry_at is due and increments lease_version", async () => {
      const { job } = seedVerifiedTombstoneAndQueue();

      const claimed = await claimEligibleCleanupJobs({
        workerId: "worker-alpha",
        batchSize: 5,
        leaseDurationSeconds: 120,
        nowSeconds: Math.floor(new Date("2026-11-20T10:35:00Z").getTime() / 1000),
      });

      expect(claimed).toHaveLength(1);
      expect(claimed[0]?.id).toBe(job.id);
      expect(claimed[0]?.status).toBe("processing");
      expect(claimed[0]?.leaseVersion).toBe(1);
      expect(claimed[0]?.lockedByWorker).toBe("worker-alpha");
      expect(claimed[0]?.leaseExpiresAt).toBeDefined();

      // Verify stored state in in-memory queue
      const stored = getInMemoryCleanupQueueById(job.id);
      expect(stored?.status).toBe("processing");
      expect(stored?.leaseVersion).toBe(1);
      expect(stored?.lockedByWorker).toBe("worker-alpha");
    });

    it("does not claim pending jobs whose next_retry_at is in the future", async () => {
      seedVerifiedTombstoneAndQueue();

      // Current time is BEFORE next_retry_at
      const claimed = await claimEligibleCleanupJobs({
        workerId: "worker-alpha",
        batchSize: 5,
        nowSeconds: Math.floor(new Date("2026-11-20T10:00:00Z").getTime() / 1000),
      });

      expect(claimed).toHaveLength(0);
    });

    it("reclaims stale processing leases when lease_expires_at has elapsed", async () => {
      const expiredLease = new Date("2026-11-20T10:20:00Z");
      const { job } = seedVerifiedTombstoneAndQueue({
        queueStatus: "processing",
        leaseExpiresAt: expiredLease,
      });

      // Another worker attempts to claim after lease expiry
      const claimed = await claimEligibleCleanupJobs({
        workerId: "worker-beta",
        batchSize: 5,
        leaseDurationSeconds: 120,
        nowSeconds: Math.floor(new Date("2026-11-20T10:30:00Z").getTime() / 1000),
      });

      expect(claimed).toHaveLength(1);
      expect(claimed[0]?.id).toBe(job.id);
      expect(claimed[0]?.lockedByWorker).toBe("worker-beta");
      expect(claimed[0]?.leaseVersion).toBe(1);
    });

    it("does not claim active processing jobs whose lease has not expired", async () => {
      const activeLease = new Date("2026-11-20T10:45:00Z");
      seedVerifiedTombstoneAndQueue({
        queueStatus: "processing",
        leaseExpiresAt: activeLease,
      });

      // Claim attempt while lease is active
      const claimed = await claimEligibleCleanupJobs({
        workerId: "worker-gamma",
        nowSeconds: Math.floor(new Date("2026-11-20T10:30:00Z").getTime() / 1000),
      });

      expect(claimed).toHaveLength(0);
    });
  });

  // ============================================================================
  // 2. Tombstone Eligibility & Invariant Verification (Stage 1 & 6)
  // ============================================================================
  describe("2. Tombstone Eligibility & Invariant Verification", () => {
    it("dead-letters jobs referencing nonexistent upload sessions", async () => {
      const claimedJob: ClaimedQueueJob = {
        id: "job-ghost-01",
        sessionId: "nonexistent-session-id",
        cloudName: DEFAULT_CLOUD_NAME,
        canonicalPublicId: SAMPLE_PUBLIC_ID,
        resourceType: "image",
        deliveryType: "upload",
        folder: "hs-spare-parts/products",
        idempotencyKey: "ghost_key",
        triggerReason: "test",
        status: "processing",
        attempts: 0,
        maxAttempts: 5,
        nextRetryAt: new Date(),
        leaseVersion: 1,
        lockedByWorker: "worker-1",
        lockedAt: new Date(),
        leaseExpiresAt: new Date(),
      };

      const outcome = await processCleanupJob(claimedJob, {});
      expect(outcome.status).toBe("dead_letter");
      expect(outcome.reason).toContain("SESSION_NOT_FOUND");
    });

    it("dead-letters jobs if session was never upload-verified (unverified proof)", async () => {
      const { job } = seedVerifiedTombstoneAndQueue({ uploadVerified: false });
      const claimedJob: ClaimedQueueJob = {
        ...job,
        status: "processing",
        leaseVersion: 1,
      };

      const outcome = await processCleanupJob(claimedJob, {});
      expect(outcome.status).toBe("dead_letter");
      expect(outcome.reason).toContain("UNVERIFIED_UPLOAD");
    });

    it("dead-letters jobs if session is in non-tombstone state (e.g. committed or authorization_created)", async () => {
      const { job } = seedVerifiedTombstoneAndQueue({ sessionStatus: "committed" });
      const claimedJob: ClaimedQueueJob = {
        ...job,
        status: "processing",
        leaseVersion: 1,
      };

      const outcome = await processCleanupJob(claimedJob, {});
      expect(outcome.status).toBe("dead_letter");
      expect(outcome.reason).toContain("INELIGIBLE_SESSION_STATE");
    });

    it("idempotently completes job if session was already marked deleted", async () => {
      const { job } = seedVerifiedTombstoneAndQueue({ sessionStatus: "deleted" });
      const claimedJob: ClaimedQueueJob = {
        ...job,
        status: "processing",
        leaseVersion: 1,
      };

      const mockClient = createMockDeletionClient({ success: true, result: "ok" });
      const outcome = await processCleanupJob(claimedJob, { deletionClient: mockClient });

      expect(outcome.status).toBe("completed");
      expect(outcome.reason).toContain("SESSION_ALREADY_DELETED");
      // Cloudinary destruction must NOT be called for already-deleted sessions
      expect(mockClient.calls).toHaveLength(0);
    });
  });

  // ============================================================================
  // 3. F-07: Queue-to-Session Identity Snapshot Consistency Check
  // ============================================================================
  describe("3. F-07: Queue-to-Session Identity Snapshot Consistency", () => {
    it("dead-letters immediately without calling Cloudinary if public ID differs between queue and session", async () => {
      // Snapshot mismatch: queue has prod_different, session has prod_sample_123
      const { job } = seedVerifiedTombstoneAndQueue({
        queuePublicId: "hs-spare-parts/products/prod_different_456",
      });

      const claimedJob: ClaimedQueueJob = {
        ...job,
        status: "processing",
        leaseVersion: 1,
      };

      const mockClient = createMockDeletionClient({ success: true, result: "ok" });
      const outcome = await processCleanupJob(claimedJob, { deletionClient: mockClient });

      expect(outcome.status).toBe("dead_letter");
      expect(outcome.reason).toContain("INTEGRITY_MISMATCH (F-07)");
      // Zero external calls allowed on snapshot mismatch
      expect(mockClient.calls).toHaveLength(0);
    });

    it("dead-letters immediately if cloudName, resourceType, or folder differ", async () => {
      const { job } = seedVerifiedTombstoneAndQueue();
      const claimedJob: ClaimedQueueJob = {
        ...job,
        cloudName: "tampered-cloud-name", // Mismatch
        status: "processing",
        leaseVersion: 1,
      };

      const mockClient = createMockDeletionClient({ success: true, result: "ok" });
      const outcome = await processCleanupJob(claimedJob, { deletionClient: mockClient });

      expect(outcome.status).toBe("dead_letter");
      expect(outcome.reason).toContain("INTEGRITY_MISMATCH (F-07)");
      expect(mockClient.calls).toHaveLength(0);
    });
  });

  // ============================================================================
  // 4. Pre-Deletion Reference Verification & TOCTOU Defense (Stage 3)
  // ============================================================================
  describe("4. Pre-Deletion Reference Verification & TOCTOU Defense", () => {
    it("aborts deletion and transitions to cancelled_referenced if asset is referenced in categories", async () => {
      const activeCatKey = "hs-spare-parts/categories/cat_engine_active";
      const { job, session } = seedVerifiedTombstoneAndQueue({
        publicId: activeCatKey,
        folder: "hs-spare-parts/categories",
      });

      // Bind asset to demo category
      setInMemoryCategory("cat-1", {
        ...INITIAL_DEMO_CATEGORIES[0]!,
        storageKey: activeCatKey,
        imageUrl: `https://res.cloudinary.com/demo/image/upload/${activeCatKey}.webp`,
      });

      const claimedJob: ClaimedQueueJob = {
        ...job,
        status: "processing",
        leaseVersion: 1,
      };

      const mockClient = createMockDeletionClient({ success: true, result: "ok" });
      const outcome = await processCleanupJob(claimedJob, { deletionClient: mockClient });

      expect(outcome.status).toBe("cancelled_referenced");
      expect(outcome.reason).toContain("INTEGRITY_INCIDENT");
      expect(outcome.errorClassification).toBe("INTEGRITY_INCIDENT");
      expect(mockClient.calls).toHaveLength(0);

      // Session tombstone must NOT be resurrected or deleted
      const updatedSession = getInMemoryUploadSessionById(session.id);
      expect(updatedSession?.status).toBe("cleanup_pending");
      expect(updatedSession?.deletedAt).toBeNull();

      // Queue item must be in cancelled_referenced state with INTEGRITY_INCIDENT classification
      const updatedJob = getInMemoryCleanupQueueById(job.id);
      expect(updatedJob?.status).toBe("cancelled_referenced");
      expect(updatedJob?.lastErrorClassification).toBe("INTEGRITY_INCIDENT");
      expect(updatedJob?.completedAt).toBeDefined();
    });

    it("aborts deletion if asset is referenced in promotional banners", async () => {
      const activeBannerKey = "hs-spare-parts/banners/banner_winter_sale";
      const { job } = seedVerifiedTombstoneAndQueue({
        publicId: activeBannerKey,
        folder: "hs-spare-parts/banners",
      });

      setInMemoryBanners([
        {
          ...INITIAL_DEMO_BANNERS[0]!,
          desktopStorageKey: activeBannerKey,
          desktopImageUrl: `https://res.cloudinary.com/demo/image/upload/${activeBannerKey}.webp`,
        },
      ]);

      const claimedJob: ClaimedQueueJob = {
        ...job,
        status: "processing",
        leaseVersion: 1,
      };

      const mockClient = createMockDeletionClient({ success: true, result: "ok" });
      const outcome = await processCleanupJob(claimedJob, { deletionClient: mockClient });

      expect(outcome.status).toBe("cancelled_referenced");
      expect(outcome.reason).toContain("INTEGRITY_INCIDENT");
      expect(outcome.errorClassification).toBe("INTEGRITY_INCIDENT");
      expect(mockClient.calls).toHaveLength(0);
    });

    it("aborts deletion if asset is referenced in brands", async () => {
      const activeBrandKey = "hs-spare-parts/brands/brand_bosch_logo";
      const { job } = seedVerifiedTombstoneAndQueue({
        publicId: activeBrandKey,
        folder: "hs-spare-parts/brands",
      });

      setInMemoryBrand("brand-1", {
        ...INITIAL_DEMO_BRANDS[0]!,
        storageKey: activeBrandKey,
        logoUrl: `https://res.cloudinary.com/demo/image/upload/${activeBrandKey}.png`,
      });

      const claimedJob: ClaimedQueueJob = {
        ...job,
        status: "processing",
        leaseVersion: 1,
      };

      const mockClient = createMockDeletionClient({ success: true, result: "ok" });
      const outcome = await processCleanupJob(claimedJob, { deletionClient: mockClient });

      expect(outcome.status).toBe("cancelled_referenced");
      expect(mockClient.calls).toHaveLength(0);
    });
  });

  // ============================================================================
  // 5. Cloudinary Deletion Adapter & 404 Idempotent Handling (Stage 4)
  // ============================================================================
  describe("5. Cloudinary Deletion Adapter & 404 Idempotency", () => {
    it("successfully destroys asset, marks queue completed and session deleted", async () => {
      const { job, session } = seedVerifiedTombstoneAndQueue();
      const claimedJob: ClaimedQueueJob = {
        ...job,
        status: "processing",
        leaseVersion: 1,
      };

      const mockClient = createMockDeletionClient({ success: true, result: "ok" });
      const outcome = await processCleanupJob(claimedJob, { deletionClient: mockClient });

      expect(outcome.status).toBe("completed");
      expect(mockClient.calls).toHaveLength(1);
      expect(mockClient.calls[0]?.publicId).toBe(SAMPLE_PUBLIC_ID);

      // Verify queue state
      const updatedJob = getInMemoryCleanupQueueById(job.id);
      expect(updatedJob?.status).toBe("completed");
      expect(updatedJob?.completedAt).toBeDefined();

      // Verify session tombstone updated to deleted
      const updatedSession = getInMemoryUploadSessionById(session.id);
      expect(updatedSession?.status).toBe("deleted");
      expect(updatedSession?.deletedAt).toBeDefined();
    });

    it("treats confirmed 404 Not Found as idempotent success after verification", async () => {
      const { job, session } = seedVerifiedTombstoneAndQueue();
      const claimedJob: ClaimedQueueJob = {
        ...job,
        status: "processing",
        leaseVersion: 1,
      };

      const mockClient = createMockDeletionClient({
        success: true,
        notFound: true,
        result: "not found",
      });

      const outcome = await processCleanupJob(claimedJob, { deletionClient: mockClient });

      expect(outcome.status).toBe("completed");
      expect(outcome.reason).toContain("IDEMPOTENT_DELETED");

      const updatedJob = getInMemoryCleanupQueueById(job.id);
      expect(updatedJob?.status).toBe("completed");

      const updatedSession = getInMemoryUploadSessionById(session.id);
      expect(updatedSession?.status).toBe("deleted");
    });

    it("production deletion client fails closed when credentials are missing", async () => {
      const client = new ProductionCloudinaryDeletionClient({
        cloudName: "",
        apiKey: "",
        apiSecret: "",
      });

      const result = await client.destroyAsset("sample");
      expect(result.success).toBe(false);
      expect(result.error).toContain("SECURITY_REJECTION");
    });
  });

  // ============================================================================
  // 6. Bounded Retry Schedule & Dead-Letter Escalation (Stage 5 & 7)
  // ============================================================================
  describe("6. Bounded Retry Schedule & Dead-Letter Escalation", () => {
    it("schedules retry on transient network error (attempt 0 -> attempt 1)", async () => {
      const { job, session } = seedVerifiedTombstoneAndQueue({ queueAttempts: 0 });
      const claimedJob: ClaimedQueueJob = {
        ...job,
        status: "processing",
        leaseVersion: 1,
      };

      const mockClient = createMockDeletionClient({
        success: false,
        error: "Fetch failed: ECONNRESET network drop",
      });

      const outcome = await processCleanupJob(claimedJob, { deletionClient: mockClient });

      expect(outcome.status).toBe("retrying");
      expect(outcome.attempts).toBe(1);
      expect(outcome.errorClassification).toBe("NETWORK_ERROR");

      const updatedJob = getInMemoryCleanupQueueById(job.id);
      expect(updatedJob?.status).toBe("pending"); // Released back to pending for next retry
      expect(updatedJob?.attempts).toBe(1);
      expect(updatedJob?.nextRetryAt.getTime()).toBeGreaterThan(Date.now() - 1000);

      // Session reverts to cleanup_pending
      const updatedSession = getInMemoryUploadSessionById(session.id);
      expect(updatedSession?.status).toBe("cleanup_pending");
    });

    it("handles 15-second timeout as ambiguous outcome without assuming cancellation", async () => {
      const { job, session } = seedVerifiedTombstoneAndQueue({ queueAttempts: 0 });
      const claimedJob: ClaimedQueueJob = {
        ...job,
        status: "processing",
        leaseVersion: 1,
      };

      const mockClient = createMockDeletionClient({
        success: false,
        error: "Timeout error: operation timed out after 15000ms",
      });

      const outcome = await processCleanupJob(claimedJob, { deletionClient: mockClient });

      expect(outcome.status).toBe("retrying");
      expect(outcome.errorClassification).toBe("TIMEOUT");
      expect(outcome.reason).toContain("AMBIGUOUS_EXTERNAL_OUTCOME (TIMEOUT)");

      const updatedJob = getInMemoryCleanupQueueById(job.id);
      expect(updatedJob?.status).toBe("pending");
      expect(updatedJob?.lastErrorClassification).toBe("TIMEOUT");
      expect(updatedJob?.lastErrorMessage).toContain("AMBIGUOUS_EXTERNAL_OUTCOME (TIMEOUT)");

      // Session tombstone remains safely condemned
      const updatedSession = getInMemoryUploadSessionById(session.id);
      expect(updatedSession?.status).toBe("cleanup_pending");
    });

    it("escalates to dead_letter when attempts reach max_attempts (5 attempts)", async () => {
      // 4 previous attempts, this 5th attempt fails -> terminal dead_letter
      const { job } = seedVerifiedTombstoneAndQueue({ queueAttempts: 4 });
      const claimedJob: ClaimedQueueJob = {
        ...job,
        attempts: 4,
        status: "processing",
        leaseVersion: 1,
      };

      const mockClient = createMockDeletionClient({
        success: false,
        error: "Gateway timeout 504",
      });

      const outcome = await processCleanupJob(claimedJob, { deletionClient: mockClient });

      expect(outcome.status).toBe("dead_letter");
      expect(outcome.attempts).toBe(4);
      expect(outcome.reason).toContain("MAX_ATTEMPTS_EXCEEDED (5/5)");

      const updatedJob = getInMemoryCleanupQueueById(job.id);
      expect(updatedJob?.status).toBe("dead_letter");
      expect(updatedJob?.lastErrorClassification).toBe("TIMEOUT");
    });

    it("immediately dead-letters on security violation without retry", async () => {
      const { job } = seedVerifiedTombstoneAndQueue({ queueAttempts: 0 });
      const claimedJob: ClaimedQueueJob = {
        ...job,
        status: "processing",
        leaseVersion: 1,
      };

      const mockClient = createMockDeletionClient({
        success: false,
        error: "Security violation: directory traversal rejected",
      });

      const outcome = await processCleanupJob(claimedJob, { deletionClient: mockClient });

      expect(outcome.status).toBe("dead_letter");
      expect(outcome.errorClassification).toBe("SECURITY_REJECTION");
    });
  });

  // ============================================================================
  // 7. 30-Day Queue Pruning vs. Tombstone Preservation (Stage 10)
  // ============================================================================
  describe("7. 30-Day Queue Pruning vs. Tombstone Preservation", () => {
    it("prunes completed/cancelled queue items older than 30 days while leaving sessions untouched", async () => {
      const now = new Date("2026-11-20T12:00:00Z");
      const thirtyFiveDaysAgo = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000);
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

      // Old completed job (eligible)
      const { job: oldJob, session: oldSession } = seedVerifiedTombstoneAndQueue({
        jobId: "job-old-complete",
        sessionId: "sess-old-complete",
        queueStatus: "completed",
        sessionStatus: "deleted",
      });
      setInMemoryCleanupQueueItem("job-old-complete", {
        ...oldJob,
        status: "completed",
        completedAt: thirtyFiveDaysAgo,
      });

      // Recent completed job (not eligible)
      const { job: recentJob } = seedVerifiedTombstoneAndQueue({
        jobId: "job-recent-complete",
        sessionId: "sess-recent-complete",
        queueStatus: "completed",
      });
      setInMemoryCleanupQueueItem("job-recent-complete", {
        ...recentJob,
        status: "completed",
        completedAt: tenDaysAgo,
      });

      // Active pending job (never eligible)
      seedVerifiedTombstoneAndQueue({
        jobId: "job-active-pending",
        sessionId: "sess-active-pending",
        queueStatus: "pending",
      });

      // Execute pruner
      const report = await pruneCompletedCleanupQueueJobs({
        nowDate: now,
        olderThanDays: 30,
        dryRun: false,
      });

      expect(report.scannedCount).toBe(1);
      expect(report.prunedCount).toBe(1);
      expect(report.prunedIds).toContain("job-old-complete");

      // Old job is pruned from queue
      expect(getInMemoryCleanupQueueById("job-old-complete")).toBeUndefined();
      // Recent job is preserved
      expect(getInMemoryCleanupQueueById("job-recent-complete")).toBeDefined();
      // Active job is preserved
      expect(getInMemoryCleanupQueueById("job-active-pending")).toBeDefined();

      // CRITICAL: Session tombstone must remain 100% intact!
      const preservedSession = getInMemoryUploadSessionById(oldSession.id);
      expect(preservedSession).toBeDefined();
      expect(preservedSession?.status).toBe("deleted");
    });

    it("dry-run mode reports eligible prunable jobs without deleting them", async () => {
      const now = new Date("2026-11-20T12:00:00Z");
      const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);

      const { job } = seedVerifiedTombstoneAndQueue({
        jobId: "job-dry-prune",
        sessionId: "sess-dry-prune",
        queueStatus: "completed",
      });
      setInMemoryCleanupQueueItem("job-dry-prune", {
        ...job,
        status: "completed",
        completedAt: fortyDaysAgo,
      });

      const report = await pruneCompletedCleanupQueueJobs({
        nowDate: now,
        olderThanDays: 30,
        dryRun: true,
      });

      expect(report.dryRun).toBe(true);
      expect(report.scannedCount).toBe(1);
      expect(report.prunedCount).toBe(0);
      expect(report.prunedIds).toContain("job-dry-prune");

      // Verify row was NOT deleted in dry-run
      expect(getInMemoryCleanupQueueById("job-dry-prune")).toBeDefined();
    });
  });

  // ============================================================================
  // 8. Batch Runner Entrypoint & Feature Flag Gating
  // ============================================================================
  describe("8. Batch Runner Entrypoint & Feature Flag Gating", () => {
    it("is disabled by default and returns executed: false without processing jobs", async () => {
      seedVerifiedTombstoneAndQueue();

      const originalEnv = process.env.ENABLE_ORPHAN_CLEANUP_WORKER;
      delete process.env.ENABLE_ORPHAN_CLEANUP_WORKER;

      const report = await runOrphanCleanupWorkerBatch();

      expect(report.executed).toBe(false);
      expect(report.reason).toContain("WORKER_DISABLED");
      expect(report.jobsClaimed).toBe(0);

      process.env.ENABLE_ORPHAN_CLEANUP_WORKER = originalEnv;
    });

    it("runs batch when ENABLE_ORPHAN_CLEANUP_WORKER=true", async () => {
      seedVerifiedTombstoneAndQueue();
      const mockClient = createMockDeletionClient({ success: true, result: "ok" });

      const report = await runOrphanCleanupWorkerBatch({
        forceEnable: true,
        deletionClient: mockClient,
      });

      expect(report.executed).toBe(true);
      expect(report.jobsClaimed).toBe(1);
      expect(report.summary.completed).toBe(1);
      expect(report.summary.deadLetter).toBe(0);
    });
  });

  // ============================================================================
  // 9. Dedicated Read-Only Cleanup Dry-Run Engine (Phase 5)
  // ============================================================================
  describe("9. Dedicated Read-Only Cleanup Dry-Run Engine (Phase 5)", () => {
    it("identifies verified cleanup candidates while maintaining strict zero-mutation invariants", async () => {
      // 1. Legitimate orphan candidate (eligible)
      const { job: job1 } = seedVerifiedTombstoneAndQueue({
        jobId: "job-dry-eligible",
        sessionId: "sess-dry-eligible",
        publicId: "hs-spare-parts/products/prod_dry_cleanable",
      });

      // 2. Active reference candidate (integrity incident)
      const activeCatKey = "hs-spare-parts/categories/cat_dry_referenced";
      const { job: job2 } = seedVerifiedTombstoneAndQueue({
        jobId: "job-dry-ref",
        sessionId: "sess-dry-ref",
        publicId: activeCatKey,
        folder: "hs-spare-parts/categories",
      });
      setInMemoryCategory("cat-1", {
        ...INITIAL_DEMO_CATEGORIES[0]!,
        storageKey: activeCatKey,
        imageUrl: `https://res.cloudinary.com/demo/image/upload/${activeCatKey}.webp`,
      });

      // 3. Coordinate mismatch candidate (F-07 identity mismatch)
      const { job: job3 } = seedVerifiedTombstoneAndQueue({
        jobId: "job-dry-drift",
        sessionId: "sess-dry-drift",
        publicId: "hs-spare-parts/products/prod_session_id",
        queuePublicId: "hs-spare-parts/products/prod_queue_id_tampered",
      });

      // 4. Missing session candidate
      const missingJob: DemoCleanupQueueItemState = {
        id: "job-dry-missing",
        sessionId: "sess-nonexistent",
        cloudName: DEFAULT_CLOUD_NAME,
        canonicalPublicId: "hs-spare-parts/products/prod_missing_sess",
        resourceType: "image",
        deliveryType: "upload",
        folder: "hs-spare-parts/products",
        idempotencyKey: "cleanup_sess-nonexistent",
        triggerReason: "product_image_replaced",
        originalEntityType: "product",
        originalEntityId: "prod-99",
        status: "pending",
        attempts: 0,
        maxAttempts: 5,
        nextRetryAt: new Date("2026-11-20T10:00:00Z"),
        lastAttemptAt: null,
        lockedAt: null,
        leaseExpiresAt: null,
        lockedByWorker: null,
        leaseVersion: 0,
        lastErrorClassification: null,
        lastErrorMessage: null,
        createdAt: new Date("2026-11-20T10:00:00Z"),
        updatedAt: new Date("2026-11-20T10:00:00Z"),
        completedAt: null,
      };
      setInMemoryCleanupQueueItem("job-dry-missing", missingJob);

      // Run dedicated dry-run engine
      const report = await runOrphanCleanupDryRun({
        nowSeconds: Math.floor(new Date("2026-11-20T12:00:00Z").getTime() / 1000),
      });

      expect(report.isDryRun).toBe(true);
      expect(report.totalCandidates).toBe(4);
      expect(report.summary.verifiedCandidates).toBe(1);
      expect(report.summary.integrityIncidents).toBe(1);
      expect(report.summary.identityMismatches).toBe(1);
      expect(report.summary.missingSessions).toBe(1);

      // Verify specific candidate verdicts
      const inspEligible = report.inspections.find((i) => i.queueId === job1.id);
      expect(inspEligible?.verdict).toBe("verified_cleanup_candidate");
      expect(inspEligible?.isEligible).toBe(true);

      const inspRef = report.inspections.find((i) => i.queueId === job2.id);
      expect(inspRef?.verdict).toBe("integrity_incident");
      expect(inspRef?.isEligible).toBe(false);
      expect(inspRef?.matchedEntity?.type).toBe("category");

      const inspDrift = report.inspections.find((i) => i.queueId === job3.id);
      expect(inspDrift?.verdict).toBe("identity_mismatch");
      expect(inspDrift?.isEligible).toBe(false);

      const inspMissing = report.inspections.find((i) => i.queueId === "job-dry-missing");
      expect(inspMissing?.verdict).toBe("missing_session");
      expect(inspMissing?.isEligible).toBe(false);

      // INVARIANT: Zero mutations must occur in dry run!
      // All queue items must remain in 'pending' status with lease_version 0 and null worker locks
      const storedJob1 = getInMemoryCleanupQueueById(job1.id);
      expect(storedJob1?.status).toBe("pending");
      expect(storedJob1?.leaseVersion).toBe(0);
      expect(storedJob1?.lockedByWorker).toBeNull();

      const storedJob2 = getInMemoryCleanupQueueById(job2.id);
      expect(storedJob2?.status).toBe("pending");
      expect(storedJob2?.leaseVersion).toBe(0);

      // Sessions must remain in cleanup_pending with null deletedAt
      const storedSession1 = getInMemoryUploadSessionById(job1.sessionId);
      expect(storedSession1?.status).toBe("cleanup_pending");
      expect(storedSession1?.deletedAt).toBeNull();
    });
  });
});
