import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  runOrphanCleanupWorkerBatch,
  runOrphanCleanupDryRun,
  type WorkerBatchReport,
  type CleanupDryRunReport,
} from "@/features/admin/orphan-cleanup-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60-second bounded execution limit for serverless runtime

// Conservative execution limits per invocation
export const DEFAULT_BATCH_SIZE = 3;
export const HARD_MAX_BATCH_SIZE = 3;
export const INVOCATION_DEADLINE_BUFFER_MS = 10_000; // 10-second safety margin before Vercel 60s hard kill
export const ESTIMATED_WORST_CASE_JOB_MS = 16_000; // 15s Cloudinary timeout + 1s DB overhead
export const MIN_CRON_SECRET_BYTES = 32;

interface AuthValidationResult {
  authorized: boolean;
  status: number;
  error?: string;
}

/**
 * Validates that CRON_SECRET meets the production structural specification:
 * 1. Represents at least 32 bytes (256 bits) of secret material.
 * 2. Matches a supported production encoding format:
 *    - 64-character hexadecimal string (decodes to exactly 32 bytes)
 *    - 43- to 44-character Base64/Base64URL string (decodes to >= 32 bytes)
 *    - Raw UTF-8 string with byte length >= 32
 * 3. Rejects trivial repeating sequences (requires at least 8 distinct characters).
 * 4. Rejects common default placeholder phrases.
 *
 * NOTE: Structural format validation verifies representation and length criteria
 * but cannot mathematically prove cryptographic randomness or entropy.
 * The production operator must generate the secret using a cryptographically
 * secure pseudorandom generator (e.g., crypto.randomBytes(32)).
 *
 * Never prints, logs, or exposes secret values in errors or test outputs.
 */
export function isValidProductionSecretFormat(secret: string): boolean {
  if (!secret || typeof secret !== "string") {
    return false;
  }

  const trimmed = secret.trim();
  if (trimmed.length === 0) {
    return false;
  }

  // 1. Check for 64-character hexadecimal format (32 bytes raw)
  const isHex64 = /^[0-9a-fA-F]{64}$/.test(trimmed);
  if (isHex64) {
    const hexBuf = Buffer.from(trimmed, "hex");
    if (hexBuf.length !== 32) return false;
  } else {
    // 2. Check for 43- or 44-character Base64/Base64URL format (32 bytes raw)
    const isBase64 = /^[A-Za-z0-9+/_-]{43,44}={0,2}$/.test(trimmed);
    if (isBase64) {
      const b64Buf = Buffer.from(trimmed, "base64");
      if (b64Buf.length < MIN_CRON_SECRET_BYTES) return false;
    } else {
      // 3. Raw UTF-8 string format: byte length must be at least 32 bytes
      if (Buffer.byteLength(trimmed, "utf-8") < MIN_CRON_SECRET_BYTES) {
        return false;
      }
    }
  }

  // Minimum character diversity to guard against repeating trivial sequences (e.g. "a".repeat(64))
  if (new Set(trimmed).size < 8) {
    return false;
  }

  // Reject obvious placeholder phrases
  const lower = trimmed.toLowerCase();
  const knownPlaceholders = [
    "change_me",
    "replace_me",
    "placeholder",
    "default_secret",
    "your_secret",
    "insert_secret",
    "production_secret",
  ];
  for (const ph of knownPlaceholders) {
    if (lower.includes(ph)) {
      return false;
    }
  }

  return true;
}

// Backward-compatible alias for existing references
export const isCryptographicallyAdequateSecret = isValidProductionSecretFormat;

/**
 * Validates the incoming Authorization header against the server's CRON_SECRET.
 * Uses timingSafeEqual to prevent side-channel timing attacks.
 * Fails closed if the secret is missing, empty, or does not meet the 32-byte specification.
 */
export function validateCronAuthorization(authHeader: string | null): AuthValidationResult {
  const cronSecret = process.env.CRON_SECRET?.trim();

  // Fail closed: Never permit execution if CRON_SECRET is unconfigured or insecure
  if (!cronSecret || !isValidProductionSecretFormat(cronSecret)) {
    return {
      authorized: false,
      status: 500,
      error:
        "CRON_CONFIGURATION_ERROR: Cron secret is unconfigured, malformed, or does not meet the 32-byte production format specification.",
    };
  }

  if (!authHeader) {
    return {
      authorized: false,
      status: 401,
      error: "UNAUTHORIZED: Missing Authorization header.",
    };
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== "bearer" || !parts[1]) {
    return {
      authorized: false,
      status: 401,
      error: "UNAUTHORIZED: Invalid Authorization header format. Expected 'Bearer <token>'.",
    };
  }

  const providedToken = parts[1];
  const expectedSecretBuffer = Buffer.from(cronSecret, "utf-8");
  const providedTokenBuffer = Buffer.from(providedToken, "utf-8");

  if (
    expectedSecretBuffer.length !== providedTokenBuffer.length ||
    !crypto.timingSafeEqual(expectedSecretBuffer, providedTokenBuffer)
  ) {
    return {
      authorized: false,
      status: 401,
      error: "UNAUTHORIZED: Invalid cron bearer token.",
    };
  }

  return { authorized: true, status: 200 };
}

/**
 * Parses and clamps the requested batch size.
 * Enforces a hard maximum limit (5) to guarantee bounded execution time.
 */
function parseBoundedBatchSize(rawParam: string | null): number {
  if (!rawParam) return DEFAULT_BATCH_SIZE;
  const parsed = parseInt(rawParam, 10);
  if (isNaN(parsed) || parsed < 1) return DEFAULT_BATCH_SIZE;
  return Math.min(parsed, HARD_MAX_BATCH_SIZE);
}

/**
 * Handles scheduled cron triggers or operator dry-run invocations.
 */
async function handleCleanupRequest(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const authResult = validateCronAuthorization(authHeader);

  if (!authResult.authorized) {
    return NextResponse.json(
      {
        success: false,
        error: authResult.error,
      },
      {
        status: authResult.status,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }

  // Parse query parameters
  const url = new URL(request.url);
  const isDryRunRequested = url.searchParams.get("dryRun") === "true";
  const batchSize = parseBoundedBatchSize(url.searchParams.get("batchSize"));

  try {
    if (isDryRunRequested) {
      const dryRunReport: CleanupDryRunReport = await runOrphanCleanupDryRun({
        batchSize,
      });

      return NextResponse.json(
        {
          success: true,
          mode: "dry_run",
          timestamp: dryRunReport.timestamp,
          batchSize,
          totalCandidates: dryRunReport.totalCandidates,
          summary: dryRunReport.summary,
          inspections: dryRunReport.inspections.map((i) => ({
            queueId: i.queueId,
            canonicalPublicId: i.canonicalPublicId,
            folder: i.folder,
            resourceType: i.resourceType,
            verdict: i.verdict,
            isEligible: i.isEligible,
            reason: i.reason,
            matchedEntity: i.matchedEntity,
          })),
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        }
      );
    }

    // Active worker execution path (gated by ENABLE_ORPHAN_CLEANUP_WORKER)
    // Enforce strict invocation deadline (50s) to guarantee response before Vercel 60s hard kill
    const invocationDeadlineMs = Date.now() + (maxDuration * 1000) - INVOCATION_DEADLINE_BUFFER_MS;

    const report: WorkerBatchReport = await runOrphanCleanupWorkerBatch({
      batchSize,
      deadlineMs: invocationDeadlineMs,
    });

    return NextResponse.json(
      {
        success: true,
        mode: "active",
        executed: report.executed,
        reason: report.reason,
        workerId: report.workerId,
        startedAt: report.startedAt,
        completedAt: report.completedAt,
        jobsClaimed: report.jobsClaimed,
        skippedDueToBudget: report.skippedDueToBudget ?? 0,
        batchSizeLimit: batchSize,
        summary: report.summary,
        outcomes: report.outcomes.map((o) => ({
          jobId: o.jobId,
          canonicalPublicId: o.canonicalPublicId,
          status: o.status,
          attempts: o.attempts,
          reason: o.reason,
          errorClassification: o.errorClassification,
        })),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal worker error";
    // Never expose database credentials or stack traces
    const sanitized = message.replace(/postgres:\/\/[^@]+@/g, "postgres://[redacted]@");

    return NextResponse.json(
      {
        success: false,
        error: "INTERNAL_WORKER_ERROR",
        message: sanitized,
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }
}

export async function GET(request: Request) {
  return handleCleanupRequest(request);
}

export async function POST(request: Request) {
  return handleCleanupRequest(request);
}
