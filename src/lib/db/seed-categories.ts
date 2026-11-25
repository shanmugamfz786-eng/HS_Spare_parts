import { eq } from "drizzle-orm";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { categories } from "./schema/catalogue";
import * as schema from "./schema";
import {
  APPROVED_CATEGORIES,
  TOTAL_APPROVED_SUBCATEGORIES_COUNT,
  type ApprovedSubcategory,
} from "@/lib/constants/approved-catalogue";

export interface CategoryConflict {
  slug: string;
  type: "parent" | "subcategory";
  reason: string;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
}

export interface CategorySeedSummary {
  categoriesTotal: number;
  subcategoriesTotal: number;
  categoriesInserted: string[];
  categoriesMatched: string[];
  subcategoriesInserted: string[];
  subcategoriesMatched: string[];
  conflicts: CategoryConflict[];
  durationMs: number;
}

export class CategorySeedConflictError extends Error {
  public readonly conflicts: CategoryConflict[];

  constructor(conflicts: CategoryConflict[]) {
    super(
      `CATEGORY_SEED_CONFLICT: ${conflicts.length} conflicting existing category record(s) detected. Aborting transaction to prevent metadata corruption.`
    );
    this.name = "CategorySeedConflictError";
    this.conflicts = conflicts;
  }
}

export interface TargetVerificationResult {
  valid: boolean;
  parsedHost: string;
  maskedHost: string;
  databaseName: string;
  error?: string;
}

/**
 * Safely masks a database hostname to avoid exposing sensitive internal identifiers.
 * Retains domain hierarchy while obscuring endpoint-specific middle hashes.
 * Example: 'ep-cool-fog-123456.us-east-2.aws.neon.tech' -> 'ep-c****456.us-east-2.aws.neon.tech'
 */
export function maskHost(host: string): string {
  if (!host || host.length <= 4) return "****";
  const parts = host.split(".");
  if (parts.length >= 2) {
    const first = parts[0]!;
    const maskedFirst =
      first.length > 7
        ? `${first.slice(0, 4)}****${first.slice(-3)}`
        : `${first.slice(0, 2)}****`;
    return [maskedFirst, ...parts.slice(1)].join(".");
  }
  return `${host.slice(0, 3)}****${host.slice(-3)}`;
}

/**
 * Validates the database URL against an explicit expected target host.
 *
 * SAFETY INVARIANTS:
 * 1. Parses URL safely without exposing user credentials or connection strings in logs.
 * 2. Requires EXPECTED_DATABASE_HOST to be explicitly provided.
 * 3. Compares hosts with strict exact equality (never generic substring matching).
 * 4. Masks the hostname for logging.
 */
export function verifyDatabaseTarget(
  databaseUrl: string | undefined,
  expectedHost: string | undefined
): TargetVerificationResult {
  if (!databaseUrl || databaseUrl.trim().length === 0) {
    return {
      valid: false,
      parsedHost: "",
      maskedHost: "",
      databaseName: "",
      error: "DATABASE_URL environment variable is missing or empty.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return {
      valid: false,
      parsedHost: "",
      maskedHost: "",
      databaseName: "",
      error: "DATABASE_URL is not a valid URL format.",
    };
  }

  const parsedHost = parsed.hostname.trim().toLowerCase();
  const databaseName = parsed.pathname.replace(/^\//, "").trim() || "neondb";
  const maskedHost = maskHost(parsedHost);

  if (!expectedHost || expectedHost.trim().length === 0) {
    return {
      valid: false,
      parsedHost,
      maskedHost,
      databaseName,
      error:
        "EXPECTED_DATABASE_HOST environment variable is required to prevent targeting an unintended database branch or instance.",
    };
  }

  const normalizedExpected = expectedHost.trim().toLowerCase();

  // Strict exact comparison (case-insensitive) - never loose substring
  if (parsedHost !== normalizedExpected) {
    return {
      valid: false,
      parsedHost,
      maskedHost,
      databaseName,
      error: `TARGET_MISMATCH: Parsed DATABASE_URL host (${maskedHost}) does not exactly match EXPECTED_DATABASE_HOST (${maskHost(normalizedExpected)}). Aborting.`,
    };
  }

  return {
    valid: true,
    parsedHost,
    maskedHost,
    databaseName,
  };
}

export type SeederDbClient = ReturnType<typeof drizzle<typeof schema>>;
export type SeederTxClient = Parameters<Parameters<SeederDbClient["transaction"]>[0]>[0];

/**
 * Creates a standalone database client without importing Next.js server-only modules.
 */
export function createSeederDbClient(databaseUrl: string): {
  pool: Pool;
  db: SeederDbClient;
} {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  return { pool, db };
}

/**
 * Idempotently and non-destructively seeds the 12 canonical approved categories
 * and 90 subcategories in a SINGLE atomic database transaction.
 *
 * NON-DESTRUCTIVE POLICY:
 * 1. Missing canonical slugs are INSERTED.
 * 2. Existing canonical slugs with matching parentage and name are PRESERVED AS-IS.
 *    No updates are performed; existing UUIDs, custom descriptions, images, sort orders,
 *    status flags, and timestamps remain completely untouched.
 * 3. Existing canonical slugs with conflicting parentage or names are flagged as CONFLICTS.
 * 4. Any conflict or unexpected error throws inside the transaction, triggering an
 *    immediate and complete ROLLBACK.
 * 5. Zero deletion of categories, products, or references.
 *
 * @param db Database client instance.
 * @returns CategorySeedSummary upon successful transaction commit.
 */
export async function seedCategories(db: SeederDbClient): Promise<CategorySeedSummary> {
  const startTime = Date.now();

  // Wrap all operations in one atomic database transaction
  return await db.transaction(async (tx: SeederTxClient) => {
    const summary: CategorySeedSummary = {
      categoriesTotal: APPROVED_CATEGORIES.length,
      subcategoriesTotal: TOTAL_APPROVED_SUBCATEGORIES_COUNT,
      categoriesInserted: [],
      categoriesMatched: [],
      subcategoriesInserted: [],
      subcategoriesMatched: [],
      conflicts: [],
      durationMs: 0,
    };

    const conflicts: CategoryConflict[] = [];

    // Step 1: Process all 12 Parent Categories
    for (const cat of APPROVED_CATEGORIES) {
      let parentCategoryId: string;

      // Check if main category already exists by unique slug
      const existingParent = await tx
        .select({
          id: categories.id,
          name: categories.name,
          slug: categories.slug,
          parentId: categories.parentId,
          isTopNav: categories.isTopNav,
          status: categories.status,
        })
        .from(categories)
        .where(eq(categories.slug, cat.slug))
        .limit(1);

      const firstParent = existingParent[0];

      if (firstParent) {
        parentCategoryId = firstParent.id;

        // Conflict detection: Canonical parent MUST have parentId === null
        if (firstParent.parentId !== null) {
          conflicts.push({
            slug: cat.slug,
            type: "parent",
            reason: `Existing category '${cat.slug}' has non-null parentId (${firstParent.parentId}). Canonical parents must be top-level (parentId: null).`,
            expected: { parentId: null, name: cat.name },
            actual: { parentId: firstParent.parentId, name: firstParent.name },
          });
        } else if (firstParent.name.trim().toLowerCase() !== cat.name.trim().toLowerCase()) {
          conflicts.push({
            slug: cat.slug,
            type: "parent",
            reason: `Existing category slug '${cat.slug}' has conflicting name '${firstParent.name}' (canonical: '${cat.name}').`,
            expected: { name: cat.name },
            actual: { name: firstParent.name },
          });
        } else {
          // Non-destructive preservation: Already matching canonical definition; leave untouched
          summary.categoriesMatched.push(cat.slug);
        }
      } else {
        // Missing canonical parent - INSERT
        const [inserted] = await tx
          .insert(categories)
          .values({
            name: cat.name,
            slug: cat.slug,
            description: cat.description,
            sortOrder: cat.sortOrder,
            isTopNav: true,
            status: "active",
            parentId: null,
          })
          .returning({ id: categories.id });

        if (!inserted) {
          throw new Error(`Failed to insert canonical parent category: ${cat.name} (${cat.slug})`);
        }
        parentCategoryId = inserted.id;
        summary.categoriesInserted.push(cat.slug);
      }

      // Step 2: Process Subcategories for this category
      if (Array.isArray(cat.subcategories)) {
        for (let subIdx = 0; subIdx < cat.subcategories.length; subIdx++) {
          const sub: ApprovedSubcategory = cat.subcategories[subIdx]!;

          // Check if subcategory already exists by unique slug
          const existingSub = await tx
            .select({
              id: categories.id,
              name: categories.name,
              slug: categories.slug,
              parentId: categories.parentId,
              isTopNav: categories.isTopNav,
              status: categories.status,
            })
            .from(categories)
            .where(eq(categories.slug, sub.slug))
            .limit(1);

          const firstSub = existingSub[0];

          if (firstSub) {
            // Conflict detection: Canonical subcategory MUST point to this parentCategoryId
            if (firstSub.parentId !== parentCategoryId) {
              conflicts.push({
                slug: sub.slug,
                type: "subcategory",
                reason: `Existing subcategory '${sub.slug}' has parentId '${firstSub.parentId}' which does not match expected parent '${cat.slug}' (${parentCategoryId}).`,
                expected: { parentId: parentCategoryId, parentSlug: cat.slug, name: sub.name },
                actual: { parentId: firstSub.parentId, name: firstSub.name },
              });
            } else if (firstSub.name.trim().toLowerCase() !== sub.name.trim().toLowerCase()) {
              conflicts.push({
                slug: sub.slug,
                type: "subcategory",
                reason: `Existing subcategory slug '${sub.slug}' has conflicting name '${firstSub.name}' (canonical: '${sub.name}').`,
                expected: { name: sub.name },
                actual: { name: firstSub.name },
              });
            } else {
              // Non-destructive preservation: Already matching canonical definition; leave untouched
              summary.subcategoriesMatched.push(sub.slug);
            }
          } else {
            // Missing canonical subcategory - INSERT
            const [insertedSub] = await tx
              .insert(categories)
              .values({
                name: sub.name,
                slug: sub.slug,
                description: sub.description || `${sub.name} for Indian passenger cars`,
                parentId: parentCategoryId,
                sortOrder: subIdx + 1,
                isTopNav: false,
                status: "active",
              })
              .returning({ id: categories.id });

            if (!insertedSub) {
              throw new Error(`Failed to insert canonical subcategory: ${sub.name} (${sub.slug})`);
            }
            summary.subcategoriesInserted.push(sub.slug);
          }
        }
      }
    }

    // Step 3: If any conflicts detected, abort transaction via rollback
    if (conflicts.length > 0) {
      summary.conflicts = conflicts;
      throw new CategorySeedConflictError(conflicts);
    }

    summary.durationMs = Date.now() - startTime;
    return summary;
  });
}

/**
 * Standalone CLI runner entrypoint.
 * Requires:
 * 1. CONFIRM_CATEGORY_SEED=YES_I_CONFIRM_SEED_CATEGORIES
 * 2. EXPECTED_DATABASE_HOST=<exact-neon-host>
 * 3. DATABASE_URL=<full-connection-string>
 */
async function runCli() {
  const confirmation = process.env.CONFIRM_CATEGORY_SEED;
  if (confirmation !== "YES_I_CONFIRM_SEED_CATEGORIES") {
    console.error(
      "\x1b[31m[ERROR] Category seeder requires explicit operator confirmation token.\x1b[0m\n" +
      "Set CONFIRM_CATEGORY_SEED=YES_I_CONFIRM_SEED_CATEGORIES to proceed.\n"
    );
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  const expectedHost = process.env.EXPECTED_DATABASE_HOST;

  const targetCheck = verifyDatabaseTarget(databaseUrl, expectedHost);
  if (!targetCheck.valid) {
    console.error(`\x1b[31m[ERROR] Database target verification failed: ${targetCheck.error}\x1b[0m`);
    process.exit(1);
  }

  console.log(
    `\x1b[36m[INFO] Verified target database: ${targetCheck.maskedHost} / ${targetCheck.databaseName}\x1b[0m`
  );

  let pool: Pool | null = null;
  try {
    const client = createSeederDbClient(databaseUrl!);
    pool = client.pool;

    console.log(
      "\x1b[36m[INFO] Seeding canonical approved categories & subcategories in an atomic transaction...\x1b[0m"
    );
    const summary = await seedCategories(client.db);
    console.log(
      "\x1b[32m[SUCCESS] Category seeding transaction committed successfully:\x1b[0m",
      {
        categoriesInserted: summary.categoriesInserted.length,
        categoriesMatched: summary.categoriesMatched.length,
        subcategoriesInserted: summary.subcategoriesInserted.length,
        subcategoriesMatched: summary.subcategoriesMatched.length,
        durationMs: summary.durationMs,
      }
    );
    process.exit(0);
  } catch (error) {
    if (error instanceof CategorySeedConflictError) {
      console.error(
        "\x1b[31m[FAILURE] Seeding transaction rolled back due to metadata conflicts:\x1b[0m",
        error.conflicts
      );
    } else {
      console.error("\x1b[31m[FAILURE] Seeding transaction failed and rolled back:\x1b[0m", error);
    }
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

if (typeof require !== "undefined" && require.main === module) {
  void runCli();
}
