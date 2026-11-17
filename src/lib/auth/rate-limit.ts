import "server-only";
import { eq, sql } from "drizzle-orm";
import { rateLimits } from "@/lib/db/schema/admin";

export interface RateLimitConfig {
  maxAttempts: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetInSeconds: number;
  isServiceUnavailable?: boolean;
}

// ==============================================================================
// 1. In-Memory Rate Limiter (LOCAL DEVELOPMENT & UNIT TEST USE ONLY)
// ==============================================================================
// WARNING: This in-memory Map is NOT distributed across serverless instances or
// clustered container replicas. It serves as a local development/testing fallback.
// In multi-instance production, checkSharedRateLimit() backed by PostgreSQL is used.
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const localMemoryStore = new Map<string, RateLimitRecord>();

// Periodic memory cleanup to prevent local heap leaks
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of localMemoryStore.entries()) {
      if (now > record.resetAt) {
        localMemoryStore.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref?.();
}

/**
 * [LOCAL DEVELOPMENT ONLY]
 * In-process sliding-window rate limiter.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig = { maxAttempts: 5, windowSeconds: 15 * 60 }
): RateLimitResult {
  const now = Date.now();
  const record = localMemoryStore.get(key);

  if (!record || now > record.resetAt) {
    localMemoryStore.set(key, {
      count: 1,
      resetAt: now + config.windowSeconds * 1000,
    });
    return {
      success: true,
      remaining: config.maxAttempts - 1,
      resetInSeconds: config.windowSeconds,
    };
  }

  if (record.count >= config.maxAttempts) {
    return {
      success: false,
      remaining: 0,
      resetInSeconds: Math.ceil((record.resetAt - now) / 1000),
    };
  }

  record.count += 1;
  return {
    success: true,
    remaining: config.maxAttempts - record.count,
    resetInSeconds: Math.ceil((record.resetAt - now) / 1000),
  };
}

export function resetRateLimit(key: string): void {
  localMemoryStore.delete(key);
}

// ==============================================================================
// 2. Shared PostgreSQL-Backed Distributed Rate Limiter
// ==============================================================================
/**
 * Shared distributed rate limiting backed by PostgreSQL.
 * Uses atomic conditional UPSERT (INSERT ... ON CONFLICT DO UPDATE):
 * Ensures all serverless instances and worker processes share a single synchronized rate limit state.
 *
 * Security & Failure Handling:
 * If the database connection is absent or throws, it degrades safely to local in-memory
 * rate-limiting rather than allowing unconstrained brute-force attempts.
 */
export async function checkSharedRateLimit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  key: string,
  config: RateLimitConfig = { maxAttempts: 5, windowSeconds: 15 * 60 }
): Promise<RateLimitResult> {
  // Allow in-memory fallback ONLY in explicit development or test environments.
  // For production, staging, unset, or any unknown environment, database failures fail closed.
  const isDevOrTest = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

  if (!db) {
    if (!isDevOrTest) {
      console.error("[RateLimit] Database client unavailable in protected environment. Failing closed.");
      return {
        success: false,
        remaining: 0,
        resetInSeconds: config.windowSeconds,
        isServiceUnavailable: true,
      };
    }
    return checkRateLimit(key, config);
  }

  try {
    const now = new Date();
    const resetIntervalSql = sql`NOW() + (${config.windowSeconds} || ' seconds')::interval`;

    const rows = await db
      .insert(rateLimits)
      .values({
        key,
        attempts: 1,
        resetAt: sql`${resetIntervalSql}`,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          attempts: sql`
            CASE
              WHEN ${rateLimits.resetAt} < NOW() THEN 1
              ELSE ${rateLimits.attempts} + 1
            END
          `,
          resetAt: sql`
            CASE
              WHEN ${rateLimits.resetAt} < NOW() THEN ${resetIntervalSql}
              ELSE ${rateLimits.resetAt}
            END
          `,
          updatedAt: now,
        },
      })
      .returning({
        attempts: rateLimits.attempts,
        resetAt: rateLimits.resetAt,
      });

    const firstRow = rows?.[0];
    if (!firstRow) {
      if (!isDevOrTest) {
        console.error("[RateLimit] Database did not return rate limit record in protected environment. Failing closed.");
        return {
          success: false,
          remaining: 0,
          resetInSeconds: config.windowSeconds,
          isServiceUnavailable: true,
        };
      }
      return checkRateLimit(key, config);
    }

    const { attempts, resetAt } = firstRow;
    const resetTimestamp = new Date(resetAt).getTime();
    const resetInSeconds = Math.max(0, Math.ceil((resetTimestamp - Date.now()) / 1000));

    if (attempts > config.maxAttempts) {
      return {
        success: false,
        remaining: 0,
        resetInSeconds,
      };
    }

    return {
      success: true,
      remaining: Math.max(0, config.maxAttempts - attempts),
      resetInSeconds,
    };
  } catch (err: unknown) {
    console.error(
      "[RateLimit] Shared database rate limiting query error:",
      err instanceof Error ? err.message : "Internal error"
    );

    if (!isDevOrTest) {
      return {
        success: false,
        remaining: 0,
        resetInSeconds: config.windowSeconds,
        isServiceUnavailable: true,
      };
    }

    // In development and test environments, allow local in-memory fallback
    return checkRateLimit(key, config);
  }
}

/**
 * Resets rate limit across both shared PostgreSQL storage and local memory.
 */
export async function resetSharedRateLimit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  key: string
): Promise<void> {
  resetRateLimit(key);
  if (!db) return;

  try {
    await db.delete(rateLimits).where(eq(rateLimits.key, key));
  } catch (err: unknown) {
    console.error(
      "[RateLimit] Failed to clear shared rate limit record from database:",
      err instanceof Error ? err.message : "Internal error"
    );
    // Note: If the delete operation fails, the existing record remains in the database.
    // Subsequent requests will continue to evaluate against the remaining rate-limit record,
    // ensuring that reset failures cannot be leveraged to bypass future rate limits.
  }
}
