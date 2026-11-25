import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  jsonb,
  text,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql, type InferSelectModel, type InferInsertModel } from "drizzle-orm";

// ==============================================================================
// 1. Session Statuses & Queue Statuses Constants
// ==============================================================================

export const MEDIA_UPLOAD_SESSION_STATUSES = [
  "authorization_created",
  "upload_verified",
  "committed",
  "expired_uncompleted",
  "cleanup_pending",
  "deletion_in_progress",
  "deleted",
] as const;

export type MediaUploadSessionStatus = (typeof MEDIA_UPLOAD_SESSION_STATUSES)[number];

export const MEDIA_CLEANUP_QUEUE_STATUSES = [
  "pending",
  "processing",
  "completed",
  "cancelled_referenced",
  "dead_letter",
] as const;

export type MediaCleanupQueueStatus = (typeof MEDIA_CLEANUP_QUEUE_STATUSES)[number];

// ==============================================================================
// 2. Table A: media_upload_sessions (Permanent Asset Lifecycle & Tombstone Registry)
// ==============================================================================

export const mediaUploadSessions = pgTable(
  "media_upload_sessions",
  {
    // Primary Key (Used directly as Receipt v2 'sid')
    id: uuid("id").defaultRandom().primaryKey(),

    // Canonical Asset Identity
    cloudName: varchar("cloud_name", { length: 64 }).notNull(),
    canonicalPublicId: varchar("canonical_public_id", { length: 255 }).notNull(),
    resourceType: varchar("resource_type", { length: 32 }).notNull().default("image"),
    deliveryType: varchar("delivery_type", { length: 32 }).notNull().default("upload"),
    folder: varchar("folder", { length: 64 }).notNull(),

    // Immutable Actor Attribution (Decoupled UUID: no foreign key to users, survives account deletion)
    createdByActorId: uuid("created_by_actor_id").notNull(),

    // Lifecycle Status
    status: varchar("status", { length: 32 }).notNull().default("authorization_created"),

    // Verified Cloudinary Upload Proof Metadata (Stage B)
    uploadVerifiedAt: timestamp("upload_verified_at", { withTimezone: true }),
    cloudinaryVersion: varchar("cloudinary_version", { length: 32 }),
    uploadedBytes: integer("uploaded_bytes"),
    uploadProof: jsonb("upload_proof"),

    // Lifecycle Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }).defaultNow().notNull(),

    // Entity Commitment & Ownership (Stage C)
    committedAt: timestamp("committed_at", { withTimezone: true }),
    committedEntityType: varchar("committed_entity_type", { length: 64 }),
    committedEntityId: varchar("committed_entity_id", { length: 255 }),

    // Permanent Tombstone Fields
    cleanupIntentAt: timestamp("cleanup_intent_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),

    // Concurrency Lease Coordination (For worker claiming)
    leaseVersion: integer("lease_version").notNull().default(0),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lockedByWorker: varchar("locked_by_worker", { length: 128 }),
  },
  (table) => [
    // Composite canonical asset identity uniqueness constraint
    uniqueIndex("uq_media_sessions_asset_identity").on(
      table.cloudName,
      table.resourceType,
      table.deliveryType,
      table.canonicalPublicId
    ),
    index("media_sessions_public_id_idx").on(table.canonicalPublicId),
    index("media_sessions_status_idx").on(table.status),
    index("media_sessions_entity_idx").on(table.committedEntityType, table.committedEntityId),
    index("media_sessions_actor_idx").on(table.createdByActorId),

    // Row-level CHECK constraints validating state invariants
    check(
      "media_sessions_status_valid",
      sql`${table.status} IN ('authorization_created', 'upload_verified', 'committed', 'expired_uncompleted', 'cleanup_pending', 'deletion_in_progress', 'deleted')`
    ),
    check(
      "media_sessions_upload_verified_check",
      sql`${table.status} != 'upload_verified' OR (${table.uploadVerifiedAt} IS NOT NULL AND ${table.cloudinaryVersion} IS NOT NULL)`
    ),
    check(
      "media_sessions_committed_check",
      sql`${table.status} != 'committed' OR (${table.committedAt} IS NOT NULL AND ${table.committedEntityType} IS NOT NULL AND ${table.committedEntityId} IS NOT NULL)`
    ),
    check(
      "media_sessions_cleanup_intent_check",
      sql`${table.status} NOT IN ('cleanup_pending', 'deletion_in_progress', 'deleted') OR ${table.cleanupIntentAt} IS NOT NULL`
    ),
    check(
      "media_sessions_deleted_check",
      sql`${table.status} != 'deleted' OR ${table.deletedAt} IS NOT NULL`
    ),
  ]
);

// ==============================================================================
// 3. Table B: media_cleanup_queue (Durable Background Worker Queue)
// ==============================================================================

export const mediaCleanupQueue = pgTable(
  "media_cleanup_queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .references(() => mediaUploadSessions.id, { onDelete: "restrict" })
      .notNull(),

    // Snapshot of asset identity coordinates
    cloudName: varchar("cloud_name", { length: 64 }).notNull(),
    canonicalPublicId: varchar("canonical_public_id", { length: 255 }).notNull(),
    resourceType: varchar("resource_type", { length: 32 }).notNull().default("image"),
    deliveryType: varchar("delivery_type", { length: 32 }).notNull().default("upload"),
    folder: varchar("folder", { length: 64 }).notNull(),

    // Idempotency & Origin Context
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull().unique(),
    triggerReason: varchar("trigger_reason", { length: 64 }).notNull(),
    originalEntityType: varchar("original_entity_type", { length: 64 }),
    originalEntityId: varchar("original_entity_id", { length: 255 }),

    // Queue Task Status
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }).defaultNow().notNull(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),

    // Worker Claim & Fencing
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lockedByWorker: varchar("locked_by_worker", { length: 128 }),
    leaseVersion: integer("lease_version").notNull().default(0),

    // Sanitized Observability (No secrets, credentials, or tokens stored)
    lastErrorClassification: varchar("last_error_classification", { length: 64 }),
    lastErrorMessage: text("last_error_message"),

    // Audit Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    // Partial unique index: strictly one active cleanup task per session
    uniqueIndex("uq_media_queue_active_job")
      .on(table.sessionId)
      .where(sql`${table.status} IN ('pending', 'processing')`),

    index("media_queue_poll_idx").on(table.status, table.nextRetryAt),
    index("media_queue_stale_lease_idx").on(table.status, table.leaseExpiresAt),
    index("media_queue_session_idx").on(table.sessionId),

    check(
      "media_queue_status_valid",
      sql`${table.status} IN ('pending', 'processing', 'completed', 'cancelled_referenced', 'dead_letter')`
    ),
    check(
      "media_queue_attempts_valid",
      sql`${table.attempts} >= 0 AND ${table.attempts} <= ${table.maxAttempts}`
    ),
  ]
);

// ==============================================================================
// 4. Drizzle Relations
// ==============================================================================

export const mediaUploadSessionsRelations = relations(mediaUploadSessions, ({ many }) => ({
  cleanupJobs: many(mediaCleanupQueue),
}));

export const mediaCleanupQueueRelations = relations(mediaCleanupQueue, ({ one }) => ({
  session: one(mediaUploadSessions, {
    fields: [mediaCleanupQueue.sessionId],
    references: [mediaUploadSessions.id],
  }),
}));

// ==============================================================================
// 5. Model Inferred Types & Helpers
// ==============================================================================

export type MediaUploadSession = InferSelectModel<typeof mediaUploadSessions>;
export type NewMediaUploadSession = InferInsertModel<typeof mediaUploadSessions>;

export type MediaCleanupQueueItem = InferSelectModel<typeof mediaCleanupQueue>;
export type NewMediaCleanupQueueItem = InferInsertModel<typeof mediaCleanupQueue>;
