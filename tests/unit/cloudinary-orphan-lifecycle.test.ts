import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkAuthoritativeAssetReferences,
  planDryRunCleanup,
  sanitizeCleanupErrorMessage,
  classifyCleanupError,
  createStructuredCleanupFailure,
  assertExecutionForbidden,
  computeCleanupRetryDecision,
  CLEANUP_RETRY_CONFIG,
  type CandidateAssetInput,
} from "@/features/admin/orphan-lifecycle";
import { createCloudinaryUploadReceipt } from "@/lib/cloudinary";
import {
  resetInMemoryDemoState,
  setInMemoryCategory,
  setInMemoryBrand,
  setInMemoryBanners,
  INITIAL_DEMO_CATEGORIES,
  INITIAL_DEMO_BRANDS,
  INITIAL_DEMO_BANNERS,
} from "@/server/catalogue/demo-state";

describe("Cloudinary Phase C5.2.2: Upload Receipt Expiry Semantics Audit & Correction", () => {
  beforeEach(() => {
    resetInMemoryDemoState();
    vi.restoreAllMocks();
  });

  // ============================================================================
  // 1. Secret Redaction & Cleanup Failure Observability
  // ============================================================================
  describe("1. Secret Redaction & Structured Cleanup Failure Observability", () => {
    it("redacts Cloudinary API secrets, API keys, and upload receipts from error messages", () => {
      const sensitiveError =
        "Failed to delete hs-spare-parts/products/sample.jpg: api_secret=my_super_secret_123&api_key=987654321 with receipt token eyJhbGciOi.eyJzdWIiOi.signature1234567890abcdef and Bearer secret_token_xyz";

      const sanitized = sanitizeCleanupErrorMessage(sensitiveError);

      expect(sanitized).not.toContain("my_super_secret_123");
      expect(sanitized).not.toContain("987654321");
      expect(sanitized).not.toContain("eyJhbGciOi.eyJzdWIiOi.signature1234567890abcdef");
      expect(sanitized).not.toContain("secret_token_xyz");
      expect(sanitized).toContain("[REDACTED]");
    });

    it("classifies cleanup errors into standardized, typed categories", () => {
      expect(classifyCleanupError("Security violation: deletion is restricted to authorized folder")).toBe(
        "SECURITY_REJECTION"
      );
      expect(classifyCleanupError("Connection timed out after 5000ms")).toBe("TIMEOUT");
      expect(classifyCleanupError("Fetch failed: ECONNREFUSED 127.0.0.1:443")).toBe("NETWORK_ERROR");
      expect(classifyCleanupError("429 Too Many Requests: Rate limit exceeded")).toBe("RATE_LIMITED");
      expect(classifyCleanupError("Resource not found: 404")).toBe("NOT_FOUND");
      expect(classifyCleanupError("401 Unauthorized: Invalid credentials")).toBe("UNAUTHORIZED");
      expect(classifyCleanupError("DATABASE_UNAVAILABLE: Neon client pool unavailable")).toBe(
        "PROVIDER_UNAVAILABLE"
      );
      expect(classifyCleanupError("Something completely unexpected")).toBe("UNKNOWN");
    });

    it("creates structured cleanup failure records without exposing raw credentials", () => {
      const failure = createStructuredCleanupFailure({
        entityType: "product",
        entityId: "prod-uuid-123",
        canonicalPublicId: "hs-spare-parts/products/prod_sample",
        error: new Error("Network timeout: api_secret=super_secret_key"),
      });

      expect(failure.entityType).toBe("product");
      expect(failure.entityId).toBe("prod-uuid-123");
      expect(failure.canonicalPublicId).toBe("hs-spare-parts/products/prod_sample");
      expect(failure.operationOutcome).toBe("failed");
      expect(failure.errorClassification).toBe("TIMEOUT");
      expect(failure.message).not.toContain("super_secret_key");
      expect(failure.message).toContain("[REDACTED]");
      expect(failure.timestamp).toBeDefined();
    });
  });

  // ============================================================================
  // 2. Authoritative Reference Check & Entity Protection
  // ============================================================================
  describe("2. Authoritative Reference Checks & Referenced Asset Protection", () => {
    it("protects demo category images from being marked as unreferenced", async () => {
      const activeCatKey = "hs-spare-parts/categories/cat_brakes_123";
      setInMemoryCategory("cat-1", {
        ...INITIAL_DEMO_CATEGORIES[0]!,
        storageKey: activeCatKey,
        imageUrl: `https://res.cloudinary.com/demo/image/upload/${activeCatKey}.webp`,
      });

      const expiredReceipt = createCloudinaryUploadReceipt(activeCatKey, "admin-1", -100);
      const check = await checkAuthoritativeAssetReferences(activeCatKey, {
        uploadReceipt: expiredReceipt,
      });
      expect(check.isReferenced).toBe(true);
      expect(check.isUncertain).toBe(false);
      expect(check.matchedEntity?.type).toBe("category");
      expect(check.reason).toContain("REFERENCED");
    });

    it("protects demo brand logos from being marked as unreferenced", async () => {
      const activeBrandKey = "hs-spare-parts/brands/brand_maruti_logo";
      setInMemoryBrand("brand-1", {
        ...INITIAL_DEMO_BRANDS[0]!,
        storageKey: activeBrandKey,
        logoUrl: `https://res.cloudinary.com/demo/image/upload/${activeBrandKey}.png`,
      });

      const expiredReceipt = createCloudinaryUploadReceipt(activeBrandKey, "admin-1", -100);
      const check = await checkAuthoritativeAssetReferences(activeBrandKey, {
        uploadReceipt: expiredReceipt,
      });
      expect(check.isReferenced).toBe(true);
      expect(check.isUncertain).toBe(false);
      expect(check.matchedEntity?.type).toBe("brand");
      expect(check.reason).toContain("REFERENCED");
    });

    it("protects demo promotional banners (both desktop and mobile) from being marked as unreferenced", async () => {
      const bannerDesktopKey = "hs-spare-parts/banners/banner_hero_desktop";
      const bannerMobileKey = "hs-spare-parts/banners/banner_hero_mobile";

      setInMemoryBanners([
        {
          ...INITIAL_DEMO_BANNERS[0]!,
          desktopStorageKey: bannerDesktopKey,
          mobileStorageKey: bannerMobileKey,
        },
      ]);

      const expiredDesktopReceipt = createCloudinaryUploadReceipt(bannerDesktopKey, "admin-1", -100);
      const checkDesktop = await checkAuthoritativeAssetReferences(bannerDesktopKey, {
        uploadReceipt: expiredDesktopReceipt,
      });
      expect(checkDesktop.isReferenced).toBe(true);
      expect(checkDesktop.matchedEntity?.type).toBe("banner");

      const expiredMobileReceipt = createCloudinaryUploadReceipt(bannerMobileKey, "admin-1", -100);
      const checkMobile = await checkAuthoritativeAssetReferences(bannerMobileKey, {
        uploadReceipt: expiredMobileReceipt,
      });
      expect(checkMobile.isReferenced).toBe(true);
      expect(checkMobile.matchedEntity?.type).toBe("banner");
    });

    it("classifies asset as database_unreferenced when receipt authorization window has elapsed and zero entities reference it", async () => {
      const unusedKey = "hs-spare-parts/products/prod_unreferenced_candidate_999";
      const expiredReceipt = createCloudinaryUploadReceipt(unusedKey, "admin-1", -100);
      const check = await checkAuthoritativeAssetReferences(unusedKey, {
        uploadReceipt: expiredReceipt,
      });

      expect(check.isReferenced).toBe(false);
      expect(check.isUncertain).toBe(false);
      expect(check.reason).toContain("DATABASE_UNREFERENCED");
      expect(check.reason).not.toContain("CONFIRMED_UNREFERENCED");
      expect(check.reason).not.toContain("ABANDONED");
    });
  });

  // ============================================================================
  // 3. Receipt Expiry Boundary Consistency & Semantics (C5.2, C5.2.1, C5.2.2)
  // ============================================================================
  describe("3. Receipt Expiry Boundary Consistency & Semantics (exp >= now vs exp < now)", () => {
    it("treats exp > now as active and valid, classifying matching asset as UNCERTAIN (in-flight upload)", async () => {
      const candidateKey = "hs-spare-parts/products/prod_future_exp";
      const now = 1700000000;
      const receipt = createCloudinaryUploadReceipt(candidateKey, "admin-1", 3600);

      const check = await checkAuthoritativeAssetReferences(candidateKey, {
        uploadReceipt: receipt,
        nowSeconds: now - 1800,
      });

      expect(check.isReferenced).toBe(false);
      expect(check.isUncertain).toBe(true);
      expect(check.reason).toContain("IN_FLIGHT_UPLOAD");
    });

    it("treats exact boundary exp === now as active and valid, classifying matching asset as UNCERTAIN (in-flight upload)", async () => {
      const candidateKey = "hs-spare-parts/products/prod_boundary_exact";
      const receipt = createCloudinaryUploadReceipt(candidateKey, "admin-1", 7200);
      const [payloadB64] = receipt.split(".");
      const payload = JSON.parse(Buffer.from(payloadB64!, "base64url").toString("utf8"));
      const exactExpiry = payload.exp;

      const check = await checkAuthoritativeAssetReferences(candidateKey, {
        uploadReceipt: receipt,
        nowSeconds: exactExpiry,
      });

      expect(check.isReferenced).toBe(false);
      expect(check.isUncertain).toBe(true);
      expect(check.reason).toContain("IN_FLIGHT_UPLOAD");
      expect(check.reason).toContain("expires in 0s");
    });

    it("treats exp < now as expired and permits reference check: classifies as database_unreferenced when zero DB references exist", async () => {
      const candidateKey = "hs-spare-parts/products/prod_boundary_expired_unreferenced";
      const receipt = createCloudinaryUploadReceipt(candidateKey, "admin-1", 7200);
      const [payloadB64] = receipt.split(".");
      const payload = JSON.parse(Buffer.from(payloadB64!, "base64url").toString("utf8"));

      const check = await checkAuthoritativeAssetReferences(candidateKey, {
        uploadReceipt: receipt,
        nowSeconds: payload.exp + 1,
      });

      expect(check.isReferenced).toBe(false);
      expect(check.isUncertain).toBe(false);
      expect(check.reason).toContain("DATABASE_UNREFERENCED");
    });

    it("treats exp < now as expired and permits reference check: classifies as referenced when active DB reference exists", async () => {
      const activeCatKey = "hs-spare-parts/categories/cat_boundary_referenced";
      setInMemoryCategory("cat-boundary", {
        ...INITIAL_DEMO_CATEGORIES[0]!,
        id: "cat-boundary",
        storageKey: activeCatKey,
      });

      const receipt = createCloudinaryUploadReceipt(activeCatKey, "admin-1", 7200);
      const [payloadB64] = receipt.split(".");
      const payload = JSON.parse(Buffer.from(payloadB64!, "base64url").toString("utf8"));

      const check = await checkAuthoritativeAssetReferences(activeCatKey, {
        uploadReceipt: receipt,
        nowSeconds: payload.exp + 1,
      });

      expect(check.isReferenced).toBe(true);
      expect(check.isUncertain).toBe(false);
      expect(check.reason).toContain("REFERENCED");
    });

    it("rejects tampered or forged receipt at the boundary as UNCERTAIN (security rejection)", async () => {
      const candidateKey = "hs-spare-parts/products/prod_tampered";
      const validReceipt = createCloudinaryUploadReceipt(candidateKey, "admin-1", 7200);
      const [payloadB64] = validReceipt.split(".");
      const tamperedReceipt = `${payloadB64}.tampered_signature_1234567890`;

      const check = await checkAuthoritativeAssetReferences(candidateKey, {
        uploadReceipt: tamperedReceipt,
      });

      expect(check.isReferenced).toBe(false);
      expect(check.isUncertain).toBe(true);
      expect(check.reason).toContain("SECURITY_REJECTION");
    });

    it("rejects receipt public ID mismatch at the boundary as UNCERTAIN (security rejection)", async () => {
      const candidateKey = "hs-spare-parts/products/prod_actual_candidate";
      const mismatchedReceipt = createCloudinaryUploadReceipt(
        "hs-spare-parts/products/prod_different_asset",
        "admin-1",
        7200
      );

      const check = await checkAuthoritativeAssetReferences(candidateKey, {
        uploadReceipt: mismatchedReceipt,
      });

      expect(check.isReferenced).toBe(false);
      expect(check.isUncertain).toBe(true);
      expect(check.reason).toContain("SECURITY_REJECTION");
    });

    it("verifies receipt expiry semantics: elapsed authorization window permits DB check but never proves remote existence, abandonment, or deletion safety", async () => {
      const candidateKey = "hs-spare-parts/products/prod_expired_window_semantics";
      const expiredReceipt = createCloudinaryUploadReceipt(candidateKey, "admin-1", -300);

      // 1. Authoritative check executes DB reference inspection
      const check = await checkAuthoritativeAssetReferences(candidateKey, {
        uploadReceipt: expiredReceipt,
      });

      // Status is database_unreferenced because zero DB records reference it
      expect(check.isReferenced).toBe(false);
      expect(check.isUncertain).toBe(false);
      expect(check.reason).toContain("DATABASE_UNREFERENCED");
      // Must NOT claim abandonment or confirmed orphan
      expect(check.reason).not.toContain("ABANDONED");
      expect(check.reason).not.toContain("CONFIRMED_ORPHAN");

      // 2. Dry run planning classifies candidate as database_unreferenced
      const plan = await planDryRunCleanup([
        {
          canonicalPublicId: candidateKey,
          uploadReceipt: expiredReceipt,
        },
      ]);

      expect(plan.isDryRun).toBe(true);
      expect(plan.summary.databaseUnreferencedCount).toBe(1);
      const classified = plan.classifiedCandidates[0]!;
      expect(classified.classification).toBe("database_unreferenced");

      // 3. Receipt expiry does NOT authorize deletion or make asset deletable
      expect(classified.isDeletableInDryRun).toBe(false);
      expect(() => assertExecutionForbidden()).toThrow("EXECUTION_FORBIDDEN");
    });
  });

  // ============================================================================
  // 4. Candidate Provenance Hardening & Receipt Requirement (C5.2.1)
  // ============================================================================
  describe("4. Candidate Provenance Hardening & Receipt-Based Verification", () => {
    it("rejects external candidate attempting to assert forged isServerAttested: true", async () => {
      const candidateKey = "hs-spare-parts/products/prod_forged_attestation";

      const check = await checkAuthoritativeAssetReferences(candidateKey, {
        isServerAttested: true,
      });

      expect(check.isReferenced).toBe(false);
      expect(check.isUncertain).toBe(true);
      expect(check.reason).toContain("UNCERTAIN_PROVENANCE");
    });

    it("rejects external candidate attempting to assert forged cleanup_failure_retry source label", async () => {
      const candidateKey = "hs-spare-parts/products/prod_forged_source";

      const check = await checkAuthoritativeAssetReferences(candidateKey, {
        source: "cleanup_failure_retry",
      });

      expect(check.isReferenced).toBe(false);
      expect(check.isUncertain).toBe(true);
      expect(check.reason).toContain("UNCERTAIN_PROVENANCE");
    });

    it("rejects external candidate attempting to assert forged staged_deleted source label", async () => {
      const candidateKey = "hs-spare-parts/products/prod_forged_staged";

      const check = await checkAuthoritativeAssetReferences(candidateKey, {
        source: "staged_deleted",
      });

      expect(check.isReferenced).toBe(false);
      expect(check.isUncertain).toBe(true);
      expect(check.reason).toContain("UNCERTAIN_PROVENANCE");
    });

    it("rejects plain object or untrusted candidate without upload receipt as UNCERTAIN_PROVENANCE", async () => {
      const candidateKey = "hs-spare-parts/products/prod_plain_object";

      const check = await checkAuthoritativeAssetReferences(candidateKey);

      expect(check.isReferenced).toBe(false);
      expect(check.isUncertain).toBe(true);
      expect(check.reason).toContain("UNCERTAIN_PROVENANCE");
    });

    it("rejects serialized and deserialized JSON object without upload receipt as UNCERTAIN_PROVENANCE", async () => {
      const candidateKey = "hs-spare-parts/products/prod_serialized_json";
      const serialized = JSON.stringify({
        canonicalPublicId: candidateKey,
        isServerAttested: true,
        source: "cleanup_failure_retry",
      });
      const parsed = JSON.parse(serialized);

      const plan = await planDryRunCleanup([parsed]);

      expect(plan.summary.uncertainCount).toBe(1);
      expect(plan.summary.databaseUnreferencedCount).toBe(0);
      expect(plan.uncertainCandidates).toContain(candidateKey);
    });

    it("rejects untrusted bare client-supplied timestamp as UNTRUSTED_RECEIPT_TIMESTAMP", async () => {
      const candidateKey = "hs-spare-parts/products/prod_untrusted_time";
      const now = Math.floor(Date.now() / 1000);

      const check = await checkAuthoritativeAssetReferences(candidateKey, {
        nowSeconds: now,
        receiptTimestamp: now - 86400,
      });

      expect(check.isReferenced).toBe(false);
      expect(check.isUncertain).toBe(true);
      expect(check.reason).toContain("UNTRUSTED_RECEIPT_TIMESTAMP");
    });

    it("accepts candidate with valid cryptographic upload receipt to establish trusted provenance", async () => {
      const unrefKey = "hs-spare-parts/products/prod_receipt_attested";
      const expiredReceipt = createCloudinaryUploadReceipt(unrefKey, "admin-1", -100);

      const plan = await planDryRunCleanup([
        {
          canonicalPublicId: unrefKey,
          uploadReceipt: expiredReceipt,
        },
      ]);

      expect(plan.isDryRun).toBe(true);
      expect(plan.summary.databaseUnreferencedCount).toBe(1);
      expect(plan.summary.uncertainCount).toBe(0);
      expect(plan.databaseUnreferencedCandidates).toContain(unrefKey);
    });
  });

  // ============================================================================
  // 5. Pure Cleanup Retry Planning Utilities & Hardened Input Validation (C5.2.1)
  // ============================================================================
  describe("5. Pure Cleanup Retry Planning Utilities & Input Validation", () => {
    it("exposes the standard retry policy constants", () => {
      expect(CLEANUP_RETRY_CONFIG.maxAttempts).toBe(5);
      expect(CLEANUP_RETRY_CONFIG.baseIntervalsSeconds).toEqual([60, 300, 1500, 7200, 28800]);
      expect(CLEANUP_RETRY_CONFIG.maxJitterFraction).toBe(0.1);
    });

    it("fails safely into dead-letter when attempts is NaN, Infinity, -Infinity, negative, or fractional", () => {
      const invalidAttempts = [NaN, Infinity, -Infinity, -1, -5, 1.5, 2.7, "3" as unknown as number];

      for (const val of invalidAttempts) {
        const decision = computeCleanupRetryDecision({
          attempts: val,
          nowSeconds: 1700000000,
        });

        expect(decision.isRetryable).toBe(false);
        expect(decision.isDue).toBe(false);
        expect(decision.state).toBe("dead_letter");
        expect(decision.requiresManualReview).toBe(true);
        expect(decision.reason).toContain("INVALID_RETRY_INPUT");
      }
    });

    it("fails safely into dead-letter when nowSeconds is NaN, invalid string, or non-positive", () => {
      const invalidNow = [NaN, Infinity, -Infinity, -100, 0, "invalid_date" as unknown as number];

      for (const val of invalidNow) {
        const decision = computeCleanupRetryDecision({
          attempts: 1,
          nowSeconds: val,
        });

        expect(decision.isRetryable).toBe(false);
        expect(decision.isDue).toBe(false);
        expect(decision.state).toBe("dead_letter");
        expect(decision.requiresManualReview).toBe(true);
        expect(decision.reason).toContain("INVALID_RETRY_INPUT");
      }
    });

    it("fails safely into dead-letter when lastAttemptAtSeconds is NaN, negative, or non-finite", () => {
      const invalidLast = [NaN, Infinity, -Infinity, -10, 0];

      for (const val of invalidLast) {
        const decision = computeCleanupRetryDecision({
          attempts: 1,
          lastAttemptAtSeconds: val,
          nowSeconds: 1700000000,
        });

        expect(decision.isRetryable).toBe(false);
        expect(decision.isDue).toBe(false);
        expect(decision.state).toBe("dead_letter");
        expect(decision.requiresManualReview).toBe(true);
        expect(decision.reason).toContain("INVALID_RETRY_INPUT");
      }
    });

    it("fails safely into dead-letter when jitterRatio is negative, non-finite, or exceeds 1.0", () => {
      const invalidJitter = [-0.1, -1.0, -10, NaN, Infinity, -Infinity, 1.5, 2.0];

      for (const val of invalidJitter) {
        const decision = computeCleanupRetryDecision({
          attempts: 1,
          nowSeconds: 1700000000,
          jitterRatio: val,
        });

        expect(decision.isRetryable).toBe(false);
        expect(decision.isDue).toBe(false);
        expect(decision.state).toBe("dead_letter");
        expect(decision.requiresManualReview).toBe(true);
        expect(decision.reason).toContain("INVALID_RETRY_INPUT");
      }
    });

    it("marks SECURITY_REJECTION as terminal dead-letter requiring manual review (never auto-retried)", () => {
      const decision = computeCleanupRetryDecision({
        attempts: 1,
        lastErrorClassification: "SECURITY_REJECTION",
        nowSeconds: 1700000000,
      });

      expect(decision.isRetryable).toBe(false);
      expect(decision.isDue).toBe(false);
      expect(decision.state).toBe("dead_letter");
      expect(decision.requiresManualReview).toBe(true);
      expect(decision.reason).toContain("SECURITY_REJECTION");
    });

    it("marks the fifth failure (attempts >= 5) as terminal dead-letter requiring operator review", () => {
      const decision = computeCleanupRetryDecision({
        attempts: 5,
        lastErrorClassification: "TIMEOUT",
        nowSeconds: 1700000000,
      });

      expect(decision.isRetryable).toBe(false);
      expect(decision.isDue).toBe(false);
      expect(decision.state).toBe("dead_letter");
      expect(decision.requiresManualReview).toBe(true);
      expect(decision.reason).toContain("MAX_ATTEMPTS_EXCEEDED");
    });

    it("calculates deterministic exponential backoff intervals matching schedule without jitter", () => {
      const now = 1700000000;

      // Attempt 0 -> ~60s (1m)
      const d0 = computeCleanupRetryDecision({
        attempts: 0,
        lastAttemptAtSeconds: now,
        nowSeconds: now,
        jitterRatio: 0,
      });
      expect(d0.delaySeconds).toBe(60);
      expect(d0.nextAttemptAtSeconds).toBe(now + 60);

      // Attempt 1 -> ~300s (5m)
      const d1 = computeCleanupRetryDecision({
        attempts: 1,
        lastAttemptAtSeconds: now,
        nowSeconds: now,
        jitterRatio: 0,
      });
      expect(d1.delaySeconds).toBe(300);
      expect(d1.nextAttemptAtSeconds).toBe(now + 300);

      // Attempt 2 -> ~1500s (25m)
      const d2 = computeCleanupRetryDecision({
        attempts: 2,
        lastAttemptAtSeconds: now,
        nowSeconds: now,
        jitterRatio: 0,
      });
      expect(d2.delaySeconds).toBe(1500);
      expect(d2.nextAttemptAtSeconds).toBe(now + 1500);

      // Attempt 3 -> ~7200s (2h)
      const d3 = computeCleanupRetryDecision({
        attempts: 3,
        lastAttemptAtSeconds: now,
        nowSeconds: now,
        jitterRatio: 0,
      });
      expect(d3.delaySeconds).toBe(7200);
      expect(d3.nextAttemptAtSeconds).toBe(now + 7200);

      // Attempt 4 -> ~28800s (8h)
      const d4 = computeCleanupRetryDecision({
        attempts: 4,
        lastAttemptAtSeconds: now,
        nowSeconds: now,
        jitterRatio: 0,
      });
      expect(d4.delaySeconds).toBe(28800);
      expect(d4.nextAttemptAtSeconds).toBe(now + 28800);
    });

    it("applies bounded non-negative jitter deterministically in range [0, 1] (+0% to +10%)", () => {
      const now = 1700000000;

      // Zero jitter (0.0) -> 60s
      const dZero = computeCleanupRetryDecision({
        attempts: 0,
        lastAttemptAtSeconds: now,
        nowSeconds: now,
        jitterRatio: 0.0,
      });
      expect(dZero.delaySeconds).toBe(60);

      // Max positive jitter (1.0) -> 60 + 6 = 66s
      const dMax = computeCleanupRetryDecision({
        attempts: 0,
        lastAttemptAtSeconds: now,
        nowSeconds: now,
        jitterRatio: 1.0,
      });
      expect(dMax.delaySeconds).toBe(66);

      // Half jitter (0.5) -> 60 + 3 = 63s
      const dHalf = computeCleanupRetryDecision({
        attempts: 0,
        lastAttemptAtSeconds: now,
        nowSeconds: now,
        jitterRatio: 0.5,
      });
      expect(dHalf.delaySeconds).toBe(63);
    });

    it("distinguishes between pending backoff and due retry status", () => {
      const now = 1700000000;
      const lastAttempt = now - 30; // 30s ago, delay is 60s

      // Pending (30s remaining)
      const pending = computeCleanupRetryDecision({
        attempts: 0,
        lastAttemptAtSeconds: lastAttempt,
        nowSeconds: now,
        jitterRatio: 0,
      });
      expect(pending.isDue).toBe(false);
      expect(pending.state).toBe("pending");
      expect(pending.reason).toContain("RETRY_PENDING");

      // Due (70s elapsed, delay is 60s)
      const due = computeCleanupRetryDecision({
        attempts: 0,
        lastAttemptAtSeconds: lastAttempt - 40,
        nowSeconds: now,
        jitterRatio: 0,
      });
      expect(due.isDue).toBe(true);
      expect(due.state).toBe("retrying");
      expect(due.reason).toContain("RETRY_DUE");
    });
  });

  // ============================================================================
  // 6. Malformed IDs, Foreign Folders & Path Traversal
  // ============================================================================
  describe("6. Malformed Public IDs, Foreign Folders & Path Traversal", () => {
    it("marks empty or whitespace public ID as UNCERTAIN", async () => {
      const check = await checkAuthoritativeAssetReferences("");
      expect(check.isUncertain).toBe(true);
      expect(check.reason).toContain("MALFORMED_ID");
    });

    it("marks foreign folder public IDs as UNCERTAIN", async () => {
      const foreignKey = "other-folder/products/sample";
      const check = await checkAuthoritativeAssetReferences(foreignKey);

      expect(check.isUncertain).toBe(true);
      expect(check.reason).toContain("SECURITY_REJECTION");
    });

    it("strictly marks directory traversal public IDs as UNCERTAIN", async () => {
      const traversalKey = "hs-spare-parts/products/../root_secret";
      const check = await checkAuthoritativeAssetReferences(traversalKey);

      expect(check.isUncertain).toBe(true);
      expect(check.reason).toContain("SECURITY_REJECTION");
    });

    it("extracts canonical storage key if full delivery URL is provided with expired receipt", async () => {
      const activeBrandKey = "hs-spare-parts/brands/brand_test_logo";
      setInMemoryBrand("brand-2", {
        ...INITIAL_DEMO_BRANDS[1]!,
        storageKey: activeBrandKey,
      });

      const fullTransformedUrl = `https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_200/${activeBrandKey}.png`;
      const expiredReceipt = createCloudinaryUploadReceipt(activeBrandKey, "admin-1", -100);
      const check = await checkAuthoritativeAssetReferences(fullTransformedUrl, {
        uploadReceipt: expiredReceipt,
      });

      expect(check.canonicalPublicId).toBe(activeBrandKey);
      expect(check.isReferenced).toBe(true);
    });
  });

  // ============================================================================
  // 7. Dry-Run Cleanup Planner Invariants & Execution Prohibitions
  // ============================================================================
  describe("7. Dry-Run Cleanup Planner Invariants & Execution Prohibitions", () => {
    it("generates a structured dry-run plan with explicit database_unreferenced classifications and zero deletions", async () => {
      // 1. Referenced category with expired receipt
      const refCat = "hs-spare-parts/categories/cat_referenced";
      setInMemoryCategory("cat-1", {
        ...INITIAL_DEMO_CATEGORIES[0]!,
        storageKey: refCat,
      });
      const expiredRefReceipt = createCloudinaryUploadReceipt(refCat, "admin-1", -100);

      // 2. Database unreferenced with expired receipt
      const unrefProd = "hs-spare-parts/products/prod_unreferenced_123";
      const expiredUnrefReceipt = createCloudinaryUploadReceipt(unrefProd, "admin-1", -100);

      // 3. Uncertain due to traversal
      const evilTraverse = "hs-spare-parts/products/../evil";

      // 4. Uncertain due to in-flight active receipt
      const inFlight = "hs-spare-parts/products/prod_in_flight";
      const activeReceipt = createCloudinaryUploadReceipt(inFlight, "admin-1", 1800);

      // 5. Uncertain due to untrusted bare timestamp
      const untrustedTime = "hs-spare-parts/products/prod_untrusted_time";

      const candidates: CandidateAssetInput[] = [
        { canonicalPublicId: refCat, uploadReceipt: expiredRefReceipt },
        { canonicalPublicId: unrefProd, uploadReceipt: expiredUnrefReceipt },
        { canonicalPublicId: evilTraverse },
        {
          canonicalPublicId: inFlight,
          uploadReceipt: activeReceipt,
        },
        {
          canonicalPublicId: untrustedTime,
          receiptTimestamp: 1600000000,
        },
      ];

      const plan = await planDryRunCleanup(candidates);

      expect(plan.isDryRun).toBe(true);
      expect(plan.totalCandidates).toBe(5);
      expect(plan.summary.referencedCount).toBe(1);
      expect(plan.summary.databaseUnreferencedCount).toBe(1);
      expect(plan.summary.uncertainCount).toBe(3);

      expect(plan.retainedAssets).toContain(refCat);
      expect(plan.databaseUnreferencedCandidates).toContain(unrefProd);
      expect(plan.uncertainCandidates).toContain(evilTraverse);
      expect(plan.uncertainCandidates).toContain(inFlight);
      expect(plan.uncertainCandidates).toContain(untrustedTime);

      // Verify that every single candidate has isDeletableInDryRun = false
      for (const item of plan.classifiedCandidates) {
        expect(item.isDeletableInDryRun).toBe(false);
      }
    });

    it("strictly prohibits and throws on execution assertion guard", () => {
      expect(() => assertExecutionForbidden()).toThrow("EXECUTION_FORBIDDEN");
    });
  });

  // ============================================================================
  // 8. Fail-Closed PostgreSQL Error Handling
  // ============================================================================
  describe("8. Fail-Closed Behavior on Database Failures", () => {
    it("marks candidates as UNCERTAIN when database throws connection error", async () => {
      const mockFailingDb = {
        select: vi.fn().mockImplementation(() => {
          throw new Error("Neon connection pool timeout: ECONNRESET");
        }),
      } as unknown as Parameters<typeof checkAuthoritativeAssetReferences>[1] extends { customDb?: infer D } ? D : never;

      const originalEnv = process.env.DATABASE_URL;
      process.env.DATABASE_URL = "postgres://fake-neon-url";

      try {
        const candidateKey = "hs-spare-parts/products/prod_test_candidate";
        const expiredReceipt = createCloudinaryUploadReceipt(candidateKey, "admin-1", -100);
        const check = await checkAuthoritativeAssetReferences(candidateKey, {
          customDb: mockFailingDb,
          uploadReceipt: expiredReceipt,
        });

        expect(check.isReferenced).toBe(false);
        expect(check.isUncertain).toBe(true);
        expect(check.reason).toContain("DATABASE_ERROR");
        expect(check.reason).toContain("Safe fail-closed");
      } finally {
        process.env.DATABASE_URL = originalEnv;
      }
    });
  });
});