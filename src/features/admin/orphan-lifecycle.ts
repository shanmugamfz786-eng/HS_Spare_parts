import "server-only";

import { eq, or, like } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { productImages, categories, brands } from "@/lib/db/schema/catalogue";
import { siteSettings } from "@/lib/db/schema/admin";
import {
  CLOUDINARY_FOLDERS,
  isValidAssetPublicId,
  extractCloudinaryStorageKey,
} from "@/lib/cloudinary-shared";
import { inspectCloudinaryUploadReceipt } from "@/lib/cloudinary";
import {
  getInMemoryCategories,
  getInMemoryBrands,
  getInMemoryBanners,
} from "@/server/catalogue/demo-state";

// ==============================================================================
// 1. Structured Types & Classifications (Cloudinary Phase C5.1)
// ==============================================================================

export type AssetOrphanClassification =
  | "referenced"
  | "database_unreferenced"
  | "uncertain";

export type CleanupOperationOutcome = "success" | "failed" | "skipped";

export type CleanupErrorClassification =
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "SECURITY_REJECTION"
  | "INTEGRITY_INCIDENT"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "PROVIDER_UNAVAILABLE"
  | "UNKNOWN";

export type CandidateSource =
  | "staged_deleted"
  | "cleanup_failure_retry"
  | "external_inventory"
  | "untracked_candidate";

export interface StructuredCleanupFailure {
  entityType: "product" | "category" | "brand" | "banner";
  entityId: string;
  canonicalPublicId: string;
  operationOutcome: CleanupOperationOutcome;
  errorClassification: CleanupErrorClassification;
  message: string;
  timestamp: string; // ISO 8601
}

/**
 * Candidate asset input for orphan detection planning.
 *
 * Security Invariants (C5.2.1):
 * - Receipt-based verification is required for proving candidate provenance.
 * - No general-purpose exported factory exists to forge or invent server attestation.
 * - Properties like `isServerAttested`, `source`, or `receiptTimestamp` cannot establish trust.
 * - Any candidate lacking a cryptographically verified server-signed receipt fails closed as UNCERTAIN.
 */
export interface CandidateAssetInput {
  canonicalPublicId: string;
  uploadReceipt?: string;
  entityType?: "product" | "category" | "brand" | "banner";
  entityId?: string;
  detectedAt?: Date | string;
  source?: CandidateSource | string;
  receiptTimestamp?: number;
  isServerAttested?: boolean;
}

export interface ClassifiedAssetCandidate {
  canonicalPublicId: string;
  classification: AssetOrphanClassification;
  reason: string;
  entityType?: "product" | "category" | "brand" | "banner";
  entityId?: string;
  folder: string;
  isDeletableInDryRun: boolean; // Always false in C5 / C5.1
}

export interface DryRunCleanupPlan {
  planId: string;
  createdAt: string;
  isDryRun: true; // Hardcoded true: no execution permitted
  totalCandidates: number;
  summary: {
    referencedCount: number;
    databaseUnreferencedCount: number;
    uncertainCount: number;
  };
  classifiedCandidates: ClassifiedAssetCandidate[];
  retainedAssets: string[]; // List of candidate IDs that are referenced and must not be touched
  databaseUnreferencedCandidates: string[]; // List of candidates with zero database references
  uncertainCandidates: string[]; // Candidates requiring manual review or DB recovery
}

export interface AuthoritativeReferenceCheckResult {
  canonicalPublicId: string;
  isReferenced: boolean;
  isUncertain: boolean;
  matchedEntity?: {
    type: "product" | "category" | "brand" | "banner";
    id: string;
  };
  reason: string;
}

function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

// ==============================================================================
// 2. Secret Redaction & Error Observability
// ==============================================================================

/**
 * Sanitizes cleanup log and error messages to guarantee no API secrets,
 * upload receipts, or credentials leak to logs or responses.
 */
export function sanitizeCleanupErrorMessage(message: unknown): string {
  if (typeof message !== "string") {
    return "Unknown cleanup error";
  }

  return message
    // Redact Cloudinary API secret / password values
    .replace(/\b(api_secret|secret|password)=([^\s&]+)/gi, "$1=[REDACTED]")
    // Redact API key assignments
    .replace(/\b(api_key)=([^\s&]+)/gi, "$1=[REDACTED]")
    // Redact cryptographic upload receipts and tokens (2-part or 3-part base64url)
    .replace(/\b[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}(?:\.[a-zA-Z0-9_-]{8,})?\b/g, "[REDACTED_RECEIPT]")
    // Redact authorization headers
    .replace(/Bearer\s+[a-zA-Z0-9_.-]+/gi, "Bearer [REDACTED]")
    .trim();
}

/**
 * Maps raw error messages or exceptions to typed, standardized error classifications.
 */
export function classifyCleanupError(error: unknown): CleanupErrorClassification {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();

  if (msg.includes("security violation") || msg.includes("security_error") || msg.includes("traversal")) {
    return "SECURITY_REJECTION";
  }
  if (msg.includes("integrity incident") || msg.includes("integrity_incident")) {
    return "INTEGRITY_INCIDENT";
  }
  if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("etimedout")) {
    return "TIMEOUT";
  }
  if (msg.includes("network") || msg.includes("econnrefused") || msg.includes("econnreset") || msg.includes("fetch failed")) {
    return "NETWORK_ERROR";
  }
  if (msg.includes("rate limit") || msg.includes("too many requests") || msg.includes("429")) {
    return "RATE_LIMITED";
  }
  if (msg.includes("not found") || msg.includes("404")) {
    return "NOT_FOUND";
  }
  if (msg.includes("unauthorized") || msg.includes("access denied") || msg.includes("forbidden") || msg.includes("401") || msg.includes("403")) {
    return "UNAUTHORIZED";
  }
  if (msg.includes("database_unavailable") || msg.includes("pool unavailable") || msg.includes("connection refused")) {
    return "PROVIDER_UNAVAILABLE";
  }

  return "UNKNOWN";
}

/**
 * Creates a structured, secret-sanitized cleanup failure record for observability.
 */
export function createStructuredCleanupFailure(params: {
  entityType: "product" | "category" | "brand" | "banner";
  entityId: string;
  canonicalPublicId: string;
  error: unknown;
  outcome?: CleanupOperationOutcome;
}): StructuredCleanupFailure {
  const sanitizedMessage = sanitizeCleanupErrorMessage(
    params.error instanceof Error ? params.error.message : String(params.error)
  );
  const classification = classifyCleanupError(params.error);

  return {
    entityType: params.entityType,
    entityId: params.entityId,
    canonicalPublicId: params.canonicalPublicId,
    operationOutcome: params.outcome || "failed",
    errorClassification: classification,
    message: sanitizedMessage,
    timestamp: new Date().toISOString(),
  };
}

// ==============================================================================
// 3. Authoritative Reference Check Layer (C5.1 Accuracy & Provenance)
// ==============================================================================

/**
 * Authoritatively verifies whether a canonical public ID is referenced anywhere
 * across products, categories, brands, or promotional banners.
 *
 * Strict C5.1 & C5.2.2 Invariants:
 * - A candidate with no trusted upload-session evidence or reliable creation time is marked UNCERTAIN.
 * - Missing receiptTimestamp is NEVER treated as proof that an upload is abandoned.
 * - An active cryptographic receipt (exp >= now) is protected as in-flight (UNCERTAIN).
 * - An expired cryptographic receipt (exp < now) proves ONLY that the signed upload authorization window has elapsed.
 *   Expiry does NOT prove upload completion, upload failure, remote asset existence, abandonment, or deletion safety.
 * - Untrusted client-supplied timestamps without cryptographic signatures are rejected (UNCERTAIN).
 * - Absence of a database reference produces `database_unreferenced`, strictly meaning no local reference was found.
 *   It NEVER claims the asset exists in Cloudinary, was abandoned, or is safe to delete.
 */
export async function checkAuthoritativeAssetReferences(
  rawCandidateId: string,
  options?: {
    customDb?: ReturnType<typeof getDb>;
    nowSeconds?: number;
    source?: CandidateSource | string;
    uploadReceipt?: string;
    receiptTimestamp?: number;
    isServerAttested?: boolean;
    isDurableSessionVerified?: boolean;
  }
): Promise<AuthoritativeReferenceCheckResult> {
  // 1. Canonicalize public ID
  const canonicalPublicId = extractCloudinaryStorageKey(rawCandidateId) || rawCandidateId.trim();

  if (!canonicalPublicId) {
    return {
      canonicalPublicId: rawCandidateId,
      isReferenced: false,
      isUncertain: true,
      reason: "MALFORMED_ID: Candidate public ID is empty or invalid.",
    };
  }

  // 2. Folder and path traversal security validation
  if (!isValidAssetPublicId(canonicalPublicId)) {
    return {
      canonicalPublicId,
      isReferenced: false,
      isUncertain: true,
      reason: `SECURITY_REJECTION: Public ID '${canonicalPublicId}' does not belong to an authorized Cloudinary folder (${Object.values(CLOUDINARY_FOLDERS).join(", ")}) or contains traversal sequences.`,
    };
  }

  // 3. In-Flight Upload & Candidate Provenance Protection (Phase C5.1, C5.2, C5.2.2)
  const now = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  let hasElapsedReceiptAuthorizationWindow = false;

  // Case A: Cryptographic upload receipt is provided
  if (options?.uploadReceipt) {
    const inspection = inspectCloudinaryUploadReceipt(options.uploadReceipt);
    if (!inspection.valid || !inspection.payload) {
      return {
        canonicalPublicId,
        isReferenced: false,
        isUncertain: true,
        reason: `SECURITY_REJECTION: Upload receipt token failed cryptographic verification (${inspection.error || "invalid"}).`,
      };
    }

    if (inspection.payload.pid !== canonicalPublicId) {
      return {
        canonicalPublicId,
        isReferenced: false,
        isUncertain: true,
        reason: `SECURITY_REJECTION: Receipt token was issued for '${inspection.payload.pid}', but candidate is '${canonicalPublicId}'.`,
      };
    }

    // Receipt is authentic and matches public ID
    // C5.2: Inclusive boundary consistency (exp >= now is active in-flight)
    if (inspection.payload.exp >= now) {
      // Active in-flight upload session: must remain protected
      return {
        canonicalPublicId,
        isReferenced: false,
        isUncertain: true,
        reason: `IN_FLIGHT_UPLOAD: Asset has an active verified upload receipt (expires in ${inspection.payload.exp - now}s). Protected as active in-flight upload session.`,
      };
    }

    // Receipt authorization window has elapsed (exp < now): proves ONLY that the signed upload authorization
    // window is no longer active (> 2 hours old). It permits authoritative database reference checking.
    // Crucially, expiry does NOT prove upload completion, upload failure, remote asset existence, abandonment, or deletion safety.
    hasElapsedReceiptAuthorizationWindow = true;
  }

  // Case B: No valid expired upload receipt provided. Evaluate provenance.
  if (!hasElapsedReceiptAuthorizationWindow && !options?.isDurableSessionVerified) {
    // In C5.2.1: Without a durable server-controlled database registry (media_cleanup_queue),
    // no internal attestation is granted. Arbitrary server modules cannot invent attestation.
    // In C5.5+: Once an asset is attested by a verified durable registry row (isDurableSessionVerified),
    // provenance is established by the database registry. All unverified candidates strictly remain UNCERTAIN.

    // Reject bare client-supplied timestamps as authoritative evidence
    if (options?.receiptTimestamp !== undefined) {
      return {
        canonicalPublicId,
        isReferenced: false,
        isUncertain: true,
        reason: "UNTRUSTED_RECEIPT_TIMESTAMP: Bare client-supplied timestamp is not cryptographically signed or verified against a trusted upload session.",
      };
    }

    // Untracked candidate, external inventory, or unverified input without trusted session evidence
    return {
      canonicalPublicId,
      isReferenced: false,
      isUncertain: true,
      reason: "UNCERTAIN_PROVENANCE: Candidate lacks trusted upload-session evidence or reliable server-verified creation timestamp. In-flight upload status cannot be ruled out without remote Cloudinary audit or durable upload registry.",
    };
  }

  // 4. Authoritative check: Neon PostgreSQL
  if (isDatabaseConfigured()) {
    const db = options?.customDb || getDb();
    if (!db) {
      return {
        canonicalPublicId,
        isReferenced: false,
        isUncertain: true,
        reason: "DATABASE_UNAVAILABLE: Neon database pool is unavailable. Safe fail-closed.",
      };
    }

    try {
      // 4A. Check productImages table
      const matchingProductImages = await db
        .select({
          id: productImages.id,
          productId: productImages.productId,
          storageKey: productImages.storageKey,
        })
        .from(productImages)
        .where(
          or(
            eq(productImages.storageKey, canonicalPublicId),
            like(productImages.url, `%${canonicalPublicId}%`)
          )
        )
        .limit(1);

      if (matchingProductImages.length > 0 && matchingProductImages[0]) {
        return {
          canonicalPublicId,
          isReferenced: true,
          isUncertain: false,
          matchedEntity: {
            type: "product",
            id: matchingProductImages[0].productId,
          },
          reason: `REFERENCED: Active product image reference found on product '${matchingProductImages[0].productId}'.`,
        };
      }

      // 4B. Check categories table
      const matchingCategories = await db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(like(categories.imageUrl, `%${canonicalPublicId}%`))
        .limit(1);

      if (matchingCategories.length > 0 && matchingCategories[0]) {
        return {
          canonicalPublicId,
          isReferenced: true,
          isUncertain: false,
          matchedEntity: {
            type: "category",
            id: matchingCategories[0].id,
          },
          reason: `REFERENCED: Active category image reference found on category '${matchingCategories[0].name}'.`,
        };
      }

      // 4C. Check brands table
      const matchingBrands = await db
        .select({ id: brands.id, name: brands.name })
        .from(brands)
        .where(like(brands.logoUrl, `%${canonicalPublicId}%`))
        .limit(1);

      if (matchingBrands.length > 0 && matchingBrands[0]) {
        return {
          canonicalPublicId,
          isReferenced: true,
          isUncertain: false,
          matchedEntity: {
            type: "brand",
            id: matchingBrands[0].id,
          },
          reason: `REFERENCED: Active brand logo reference found on brand '${matchingBrands[0].name}'.`,
        };
      }

      // 4D. Check siteSettings (homepage_banners JSON payload)
      const bannerRows = await db
        .select({ value: siteSettings.value })
        .from(siteSettings)
        .where(eq(siteSettings.key, "homepage_banners"))
        .limit(1);

      if (bannerRows.length > 0 && Array.isArray(bannerRows[0]?.value)) {
        for (const rawBanner of bannerRows[0].value) {
          if (!rawBanner || typeof rawBanner !== "object") continue;
          const b = rawBanner as Record<string, unknown>;
          const desktopKey = b.desktopStorageKey || extractCloudinaryStorageKey(String(b.desktopImageUrl || ""));
          const mobileKey = b.mobileStorageKey || extractCloudinaryStorageKey(String(b.mobileImageUrl || ""));

          if (desktopKey === canonicalPublicId || mobileKey === canonicalPublicId) {
            return {
              canonicalPublicId,
              isReferenced: true,
              isUncertain: false,
              matchedEntity: {
                type: "banner",
                id: String(b.id || "homepage_banners"),
              },
              reason: `REFERENCED: Active promotional banner reference found on banner '${String(b.title || b.id)}'.`,
            };
          }
        }
      }

      // Zero database references found across all active tables
      return {
        canonicalPublicId,
        isReferenced: false,
        isUncertain: false,
        reason: "DATABASE_UNREFERENCED: Zero active references found across products, categories, brands, and banners in PostgreSQL. Remote Cloudinary asset existence and ownership are not established.",
      };
    } catch (dbError) {
      return {
        canonicalPublicId,
        isReferenced: false,
        isUncertain: true,
        reason: `DATABASE_ERROR: Authoritative check failed: ${sanitizeCleanupErrorMessage(dbError)}. Safe fail-closed.`,
      };
    }
  }

  // 5. Authoritative check: In-Memory Demo State (Development / Test)
  const demoCats = getInMemoryCategories();
  const matchedCat = demoCats.find(
    (c) => c.storageKey === canonicalPublicId || (c.imageUrl && c.imageUrl.includes(canonicalPublicId))
  );
  if (matchedCat) {
    return {
      canonicalPublicId,
      isReferenced: true,
      isUncertain: false,
      matchedEntity: { type: "category", id: matchedCat.id },
      reason: `REFERENCED: In-memory demo category '${matchedCat.name}' references this asset.`,
    };
  }

  const demoBrands = getInMemoryBrands();
  const matchedBrand = demoBrands.find(
    (b) => b.storageKey === canonicalPublicId || (b.logoUrl && b.logoUrl.includes(canonicalPublicId))
  );
  if (matchedBrand) {
    return {
      canonicalPublicId,
      isReferenced: true,
      isUncertain: false,
      matchedEntity: { type: "brand", id: matchedBrand.id },
      reason: `REFERENCED: In-memory demo brand '${matchedBrand.name}' references this asset.`,
    };
  }

  const demoBanners = getInMemoryBanners();
  const matchedBanner = demoBanners.find(
    (ban) =>
      ban.desktopStorageKey === canonicalPublicId ||
      ban.mobileStorageKey === canonicalPublicId ||
      ban.desktopImageUrl.includes(canonicalPublicId) ||
      (ban.mobileImageUrl && ban.mobileImageUrl.includes(canonicalPublicId))
  );
  if (matchedBanner) {
    return {
      canonicalPublicId,
      isReferenced: true,
      isUncertain: false,
      matchedEntity: { type: "banner", id: matchedBanner.id },
      reason: `REFERENCED: In-memory demo banner '${matchedBanner.title}' references this asset.`,
    };
  }

  return {
    canonicalPublicId,
    isReferenced: false,
    isUncertain: false,
    reason: "DATABASE_UNREFERENCED: Zero active references found in demo state catalogue entities. Remote existence not established.",
  };
}

// ==============================================================================
// 4. Dry-Run Cleanup Planner (C5.1)
// ==============================================================================

/**
 * Plans an orphan asset cleanup operation strictly in DRY-RUN mode.
 *
 * Invariants:
 * - Output classification is strictly `database_unreferenced` (never implies remote existence or deletion safety).
 * - `isDryRun: true` and `isDeletableInDryRun: false` are hardcoded.
 * - No code path in this phase can invoke Cloudinary asset deletion.
 */
export async function planDryRunCleanup(
  candidates: CandidateAssetInput[],
  options?: {
    customDb?: ReturnType<typeof getDb>;
    nowSeconds?: number;
  }
): Promise<DryRunCleanupPlan> {
  const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const classifiedCandidates: ClassifiedAssetCandidate[] = [];
  const retainedAssets: string[] = [];
  const databaseUnreferencedCandidates: string[] = [];
  const uncertainCandidates: string[] = [];

  for (const candidate of candidates) {
    const canonicalId =
      extractCloudinaryStorageKey(candidate.canonicalPublicId) ||
      candidate.canonicalPublicId.trim();

    const folder = canonicalId.split("/")[0] || "unknown";

    // In C5.2.1: Candidates are evaluated authoritatively via cryptographic receipts.
    // Client-supplied flags or unverified source labels cannot bypass provenance checks.
    const check = await checkAuthoritativeAssetReferences(canonicalId, {
      customDb: options?.customDb,
      nowSeconds: options?.nowSeconds,
      uploadReceipt: candidate.uploadReceipt,
      receiptTimestamp: candidate.receiptTimestamp,
    });

    let classification: AssetOrphanClassification;
    if (check.isUncertain) {
      classification = "uncertain";
      uncertainCandidates.push(canonicalId);
    } else if (check.isReferenced) {
      classification = "referenced";
      retainedAssets.push(canonicalId);
    } else {
      classification = "database_unreferenced";
      databaseUnreferencedCandidates.push(canonicalId);
    }

    classifiedCandidates.push({
      canonicalPublicId: canonicalId,
      classification,
      reason: check.reason,
      entityType: candidate.entityType || check.matchedEntity?.type,
      entityId: candidate.entityId || check.matchedEntity?.id,
      folder,
      isDeletableInDryRun: false, // In C5/C5.1/C5.2, execution is strictly disabled
    });
  }

  return {
    planId,
    createdAt: new Date().toISOString(),
    isDryRun: true,
    totalCandidates: candidates.length,
    summary: {
      referencedCount: retainedAssets.length,
      databaseUnreferencedCount: databaseUnreferencedCandidates.length,
      uncertainCount: uncertainCandidates.length,
    },
    classifiedCandidates,
    retainedAssets,
    databaseUnreferencedCandidates,
    uncertainCandidates,
  };
}

/**
 * Explicit assertion guard guaranteeing execution is forbidden in this phase.
 */
export function assertExecutionForbidden(): never {
  throw new Error(
    "EXECUTION_FORBIDDEN: Dry-run planning only. Asset deletion is strictly prohibited in Phase C5."
  );
}

// ==============================================================================
// 5. Cleanup Retry Planning Utilities (Pure Logic - Phase C5.2)
// ==============================================================================

export type CleanupRetryState =
  | "pending"
  | "retrying"
  | "completed"
  | "cancelled_referenced"
  | "dead_letter";

export interface CleanupRetryScheduleConfig {
  maxAttempts: number;
  baseIntervalsSeconds: readonly number[];
  maxJitterFraction: number;
}

export const CLEANUP_RETRY_CONFIG: CleanupRetryScheduleConfig = {
  maxAttempts: 5,
  // Approximate backoff: 1m, 5m, 25m, 2h, 8h
  baseIntervalsSeconds: [60, 300, 1500, 7200, 28800],
  maxJitterFraction: 0.1, // ±10% bounded jitter
} as const;

export interface CleanupRetryDecision {
  isRetryable: boolean;
  isDue: boolean;
  state: CleanupRetryState;
  attempts: number;
  maxAttempts: number;
  nextAttemptAtSeconds?: number;
  delaySeconds?: number;
  reason: string;
  requiresManualReview: boolean;
}

/**
 * Pure decision function calculating retry eligibility and schedule for failed cleanup operations.
 * Strictly side-effect-free: does NOT schedule background jobs, execute deletions, or write to database.
 */
export function computeCleanupRetryDecision(params: {
  attempts: number;
  lastErrorClassification?: CleanupErrorClassification;
  lastAttemptAtSeconds?: number;
  nowSeconds?: number;
  maxAttempts?: number;
  jitterRatio?: number; // Deterministic test injection between 0.0 and 1.0
}): CleanupRetryDecision {
  // 1. Explicit validation: attempts (must be non-negative finite integer, not NaN, not Infinity)
  if (
    typeof params.attempts !== "number" ||
    !Number.isFinite(params.attempts) ||
    Number.isNaN(params.attempts) ||
    !Number.isInteger(params.attempts) ||
    params.attempts < 0
  ) {
    return {
      isRetryable: false,
      isDue: false,
      state: "dead_letter",
      attempts: 0,
      maxAttempts: CLEANUP_RETRY_CONFIG.maxAttempts,
      reason: `INVALID_RETRY_INPUT: 'attempts' must be a non-negative finite integer. Got: ${String(params.attempts)}. Transferred to dead-letter for manual review.`,
      requiresManualReview: true,
    };
  }

  // 2. Explicit validation: maxAttempts (must be positive finite integer)
  const maxAttempts = params.maxAttempts ?? CLEANUP_RETRY_CONFIG.maxAttempts;
  if (
    typeof maxAttempts !== "number" ||
    !Number.isFinite(maxAttempts) ||
    Number.isNaN(maxAttempts) ||
    !Number.isInteger(maxAttempts) ||
    maxAttempts <= 0
  ) {
    return {
      isRetryable: false,
      isDue: false,
      state: "dead_letter",
      attempts: params.attempts,
      maxAttempts: CLEANUP_RETRY_CONFIG.maxAttempts,
      reason: `INVALID_RETRY_INPUT: 'maxAttempts' must be a positive finite integer. Got: ${String(params.maxAttempts)}. Transferred to dead-letter for manual review.`,
      requiresManualReview: true,
    };
  }

  // 3. Explicit validation: nowSeconds (must be positive finite integer timestamp, never NaN/invalid date)
  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (
    typeof now !== "number" ||
    !Number.isFinite(now) ||
    Number.isNaN(now) ||
    now <= 0
  ) {
    return {
      isRetryable: false,
      isDue: false,
      state: "dead_letter",
      attempts: params.attempts,
      maxAttempts,
      reason: `INVALID_RETRY_INPUT: 'nowSeconds' must be a positive finite integer timestamp. Got: ${String(params.nowSeconds)}. Transferred to dead-letter for manual review.`,
      requiresManualReview: true,
    };
  }

  // 4. Explicit validation: lastAttemptAtSeconds (if provided, must be positive finite integer timestamp)
  if (
    params.lastAttemptAtSeconds !== undefined &&
    (typeof params.lastAttemptAtSeconds !== "number" ||
      !Number.isFinite(params.lastAttemptAtSeconds) ||
      Number.isNaN(params.lastAttemptAtSeconds) ||
      params.lastAttemptAtSeconds <= 0)
  ) {
    return {
      isRetryable: false,
      isDue: false,
      state: "dead_letter",
      attempts: params.attempts,
      maxAttempts,
      reason: `INVALID_RETRY_INPUT: 'lastAttemptAtSeconds' must be a positive finite integer timestamp. Got: ${String(params.lastAttemptAtSeconds)}. Transferred to dead-letter for manual review.`,
      requiresManualReview: true,
    };
  }

  // 5. Explicit validation: jitterRatio (must be finite, non-negative, and in range [0, 1])
  if (
    params.jitterRatio !== undefined &&
    (typeof params.jitterRatio !== "number" ||
      !Number.isFinite(params.jitterRatio) ||
      Number.isNaN(params.jitterRatio) ||
      params.jitterRatio < 0 ||
      params.jitterRatio > 1)
  ) {
    return {
      isRetryable: false,
      isDue: false,
      state: "dead_letter",
      attempts: params.attempts,
      maxAttempts,
      reason: `INVALID_RETRY_INPUT: 'jitterRatio' must be a finite non-negative number in range [0, 1]. Got: ${String(params.jitterRatio)}. Transferred to dead-letter for manual review.`,
      requiresManualReview: true,
    };
  }

  // 6. Security rejections and integrity incidents are terminal: NEVER retried automatically
  if (
    params.lastErrorClassification === "SECURITY_REJECTION" ||
    params.lastErrorClassification === "INTEGRITY_INCIDENT"
  ) {
    return {
      isRetryable: false,
      isDue: false,
      state: "dead_letter",
      attempts: params.attempts,
      maxAttempts,
      reason: `${params.lastErrorClassification}: Security violations and integrity incidents must never be automatically retried. Transferred to dead-letter for manual review.`,
      requiresManualReview: true,
    };
  }

  // 7. Max attempts threshold reached: terminal dead-letter
  if (params.attempts >= maxAttempts) {
    return {
      isRetryable: false,
      isDue: false,
      state: "dead_letter",
      attempts: params.attempts,
      maxAttempts,
      reason: `MAX_ATTEMPTS_EXCEEDED: Exceeded ${maxAttempts} retry attempts. Transferred to dead-letter queue for operator review.`,
      requiresManualReview: true,
    };
  }

  // 8. Compute deterministic exponential backoff
  const attemptIndex = Math.min(
    params.attempts,
    CLEANUP_RETRY_CONFIG.baseIntervalsSeconds.length - 1
  );
  const baseDelay = CLEANUP_RETRY_CONFIG.baseIntervalsSeconds[attemptIndex]!;
  const jitterRatio = params.jitterRatio ?? 0;
  const jitterOffset = Math.round(baseDelay * CLEANUP_RETRY_CONFIG.maxJitterFraction * jitterRatio);
  const delaySeconds = baseDelay + jitterOffset;

  const lastAttempt = params.lastAttemptAtSeconds ?? now;
  const nextAttemptAtSeconds = lastAttempt + delaySeconds;
  const isDue = now >= nextAttemptAtSeconds;

  return {
    isRetryable: true,
    isDue,
    state: isDue ? "retrying" : "pending",
    attempts: params.attempts,
    maxAttempts,
    nextAttemptAtSeconds,
    delaySeconds,
    reason: isDue
      ? `RETRY_DUE: Backoff window elapsed (${delaySeconds}s since last attempt). Eligible for pre-deletion reference check and retry.`
      : `RETRY_PENDING: Waiting for scheduled backoff delay (${nextAttemptAtSeconds - now}s remaining).`,
    requiresManualReview: false,
  };
}

// ==============================================================================
// 6. Safe Future Execution Requirements (Architecture Specification)
// ==============================================================================

/**
 * Architectural specification for any future background cleanup execution worker.
 *
 * Mandatory Invariants for Execution (Phase C5.3+):
 * 1. Pre-Deletion Reference Verification:
 *    Any future worker MUST call `checkAuthoritativeAssetReferences(canonicalPublicId)`
 *    immediately before invoking Cloudinary asset deletion.
 * 2. Abort on Active Reference:
 *    If the asset is referenced anywhere in PostgreSQL or demo state, the job MUST be
 *    immediately aborted and marked `cancelled_referenced`. Under no circumstances may
 *    a referenced asset be deleted.
 * 3. Fail-Closed on Uncertainty:
 *    If reference inspection returns `uncertain` (e.g. database connection pool drop,
 *    unresolved provenance, or query timeout), execution MUST abort and fail closed.
 * 4. Folder and Storage Key Validation:
 *    The canonical public ID MUST be validated against authorized Cloudinary folder
 *    prefixes (`isValidAssetPublicId`) and checked for path traversal (`..`, `//`).
 * 5. Idempotent Absent Asset Handling:
 *    Cloudinary 404 (Not Found / Resource not found) may be treated as idempotent success
 *    ONLY AFTER reference and ownership safeguards (1-4) have been completely satisfied.
 * 6. Durable Audit and Attempt Tracking:
 *    Attempts, timestamps, and sanitized error classifications MUST be durably recorded
 *    in PostgreSQL before claiming retry support.
 */
export interface FutureCleanupExecutionRequirements {
  recheckReferencesImmediatelyBeforeDeletion: true;
  abortIfReferenced: "cancelled_referenced";
  failClosedOnUncertain: true;
  enforceAuthorizedFolderIsolation: true;
  allowIdempotentSuccessOn404AfterVerification: true;
  requireDurableAuditLogging: true;
}
