-- ==============================================================================
-- Cloudinary Phase C5.4.1: Permanent Media Registry & Durable Cleanup Queue
-- Migration 0005: media_upload_sessions and media_cleanup_queue
--
-- PRIVILEGE BOUNDARY & SECURITY NOTICE:
-- 1. BASELINE MODE (Current): Application connects using single owner-level
--    DATABASE_URL (neondb_owner). The BEFORE DELETE, BEFORE TRUNCATE, and BEFORE
--    UPDATE triggers unconditionally protect against ordinary application DML
--    (DELETE, TRUNCATE, and invalid state transitions) while active and enabled.
-- 2. HARDENED MODE (Production Prerequisite): A table owner possesses DDL rights
--    to alter/disable triggers. Therefore, creating a separate non-owner runtime
--    role (hs_app_runtime) with REVOKE DELETE, TRUNCATE on media_upload_sessions
--    is an explicit deployment prerequisite before live production launch.
-- ==============================================================================

CREATE TABLE "media_upload_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cloud_name" varchar(64) NOT NULL,
	"canonical_public_id" varchar(255) NOT NULL,
	"resource_type" varchar(32) DEFAULT 'image' NOT NULL,
	"delivery_type" varchar(32) DEFAULT 'upload' NOT NULL,
	"folder" varchar(64) NOT NULL,
	"created_by_actor_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'authorization_created' NOT NULL,
	"upload_verified_at" timestamp with time zone,
	"cloudinary_version" varchar(32),
	"uploaded_bytes" integer,
	"upload_proof" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_at" timestamp with time zone,
	"committed_entity_type" varchar(64),
	"committed_entity_id" varchar(255),
	"cleanup_intent_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"lease_version" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"locked_by_worker" varchar(128),
	CONSTRAINT "media_sessions_status_valid" CHECK ("status" IN (
		'authorization_created',
		'upload_verified',
		'committed',
		'expired_uncompleted',
		'cleanup_pending',
		'deletion_in_progress',
		'deleted'
	)),
	CONSTRAINT "media_sessions_upload_verified_check" CHECK ("status" != 'upload_verified' OR ("upload_verified_at" IS NOT NULL AND "cloudinary_version" IS NOT NULL)),
	CONSTRAINT "media_sessions_committed_check" CHECK ("status" != 'committed' OR ("committed_at" IS NOT NULL AND "committed_entity_type" IS NOT NULL AND "committed_entity_id" IS NOT NULL)),
	CONSTRAINT "media_sessions_cleanup_intent_check" CHECK ("status" NOT IN ('cleanup_pending', 'deletion_in_progress', 'deleted') OR "cleanup_intent_at" IS NOT NULL),
	CONSTRAINT "media_sessions_deleted_check" CHECK ("status" != 'deleted' OR "deleted_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_media_sessions_asset_identity" ON "media_upload_sessions" ("cloud_name", "resource_type", "delivery_type", "canonical_public_id");
--> statement-breakpoint
CREATE INDEX "media_sessions_public_id_idx" ON "media_upload_sessions" ("canonical_public_id");
--> statement-breakpoint
CREATE INDEX "media_sessions_status_idx" ON "media_upload_sessions" ("status");
--> statement-breakpoint
CREATE INDEX "media_sessions_entity_idx" ON "media_upload_sessions" ("committed_entity_type", "committed_entity_id");
--> statement-breakpoint
CREATE INDEX "media_sessions_actor_idx" ON "media_upload_sessions" ("created_by_actor_id");
--> statement-breakpoint
CREATE TABLE "media_cleanup_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"cloud_name" varchar(64) NOT NULL,
	"canonical_public_id" varchar(255) NOT NULL,
	"resource_type" varchar(32) DEFAULT 'image' NOT NULL,
	"delivery_type" varchar(32) DEFAULT 'upload' NOT NULL,
	"folder" varchar(64) NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"trigger_reason" varchar(64) NOT NULL,
	"original_entity_type" varchar(64),
	"original_entity_id" varchar(255),
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"locked_by_worker" varchar(128),
	"lease_version" integer DEFAULT 0 NOT NULL,
	"last_error_classification" varchar(64),
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "media_cleanup_queue_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "media_queue_status_valid" CHECK ("status" IN ('pending', 'processing', 'completed', 'cancelled_referenced', 'dead_letter')),
	CONSTRAINT "media_queue_attempts_valid" CHECK ("attempts" >= 0 AND "attempts" <= "max_attempts")
);
--> statement-breakpoint
ALTER TABLE "media_cleanup_queue" ADD CONSTRAINT "media_cleanup_queue_session_id_media_upload_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "media_upload_sessions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_media_queue_active_job" ON "media_cleanup_queue" ("session_id") WHERE "status" IN ('pending', 'processing');
--> statement-breakpoint
CREATE INDEX "media_queue_poll_idx" ON "media_cleanup_queue" ("status", "next_retry_at");
--> statement-breakpoint
CREATE INDEX "media_queue_stale_lease_idx" ON "media_cleanup_queue" ("status", "lease_expires_at");
--> statement-breakpoint
CREATE INDEX "media_queue_session_idx" ON "media_cleanup_queue" ("session_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fn_prevent_truncate_media_sessions()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'TRUNCATE_PROHIBITED: media_upload_sessions contains permanent tombstones and cannot be truncated.';
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;
--> statement-breakpoint
CREATE TRIGGER trg_prevent_truncate_media_sessions
BEFORE TRUNCATE ON "media_upload_sessions"
EXECUTE FUNCTION fn_prevent_truncate_media_sessions();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fn_enforce_media_upload_session_immutability()
RETURNS TRIGGER AS $$
BEGIN
  -- A. HARD DELETION IS UNCONDITIONALLY PROHIBITED
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DELETION_PROHIBITED: media_upload_sessions rows are permanent records and cannot be deleted (session_id=%)', OLD.id;
  END IF;

  -- B. IMMUTABLE IDENTITY FIELDS (CANNOT BE ALTERED ON UPDATE)
  IF OLD.id != NEW.id OR
     OLD.cloud_name != NEW.cloud_name OR
     OLD.canonical_public_id != NEW.canonical_public_id OR
     OLD.resource_type != NEW.resource_type OR
     OLD.delivery_type != NEW.delivery_type OR
     OLD.folder != NEW.folder OR
     OLD.created_at != NEW.created_at OR
     OLD.created_by_actor_id != NEW.created_by_actor_id THEN
    RAISE EXCEPTION 'IMMUTABLE_IDENTITY_MODIFICATION: Core identity fields of media_upload_sessions cannot be modified (session_id=%)', OLD.id;
  END IF;

  -- C. IMMUTABLE TOMBSTONE TIMESTAMP
  IF OLD.cleanup_intent_at IS NOT NULL AND (
    NEW.cleanup_intent_at IS NULL OR NEW.cleanup_intent_at != OLD.cleanup_intent_at
  ) THEN
    RAISE EXCEPTION 'TOMBSTONE_TIMESTAMP_MODIFICATION: cleanup_intent_at is immutable once set (session_id=%)', OLD.id;
  END IF;

  -- D. FREEZE OWNERSHIP AFTER CLEANUP INTENT
  IF OLD.cleanup_intent_at IS NOT NULL AND (
    NEW.committed_entity_type IS DISTINCT FROM OLD.committed_entity_type OR
    NEW.committed_entity_id IS DISTINCT FROM OLD.committed_entity_id
  ) THEN
    RAISE EXCEPTION 'TOMBSTONED_OWNERSHIP_MODIFICATION: Ownership cannot be altered on a tombstoned asset (session_id=%)', OLD.id;
  END IF;

  -- E. TERMINAL STATES ARE IMMUTABLE
  IF OLD.status = 'deleted' AND NEW.status != 'deleted' THEN
    RAISE EXCEPTION 'ILLEGAL_STATE_TRANSITION: Asset is permanently deleted (session_id=%)', OLD.id;
  END IF;

  IF OLD.status = 'expired_uncompleted' AND NEW.status != 'expired_uncompleted' THEN
    RAISE EXCEPTION 'ILLEGAL_STATE_TRANSITION: Expired uncompleted session cannot be modified (session_id=%)', OLD.id;
  END IF;

  -- F. ABSOLUTE RESURRECTION PROHIBITION
  IF OLD.status IN ('cleanup_pending', 'deletion_in_progress')
     AND NEW.status IN ('authorization_created', 'upload_verified', 'committed') THEN
    RAISE EXCEPTION 'ILLEGAL_STATE_TRANSITION: Tombstoned asset cannot return to attachable status % (session_id=%)', NEW.status, OLD.id;
  END IF;

  -- G. FORWARD TRANSITION WHITELIST
  IF OLD.status = 'authorization_created' AND NEW.status NOT IN ('authorization_created', 'upload_verified', 'expired_uncompleted') THEN
    RAISE EXCEPTION 'ILLEGAL_STATE_TRANSITION: authorization_created can only transition to upload_verified or expired_uncompleted (attempted %)', NEW.status;
  END IF;

  IF OLD.status = 'upload_verified' AND NEW.status NOT IN ('upload_verified', 'committed', 'cleanup_pending', 'expired_uncompleted') THEN
    RAISE EXCEPTION 'ILLEGAL_STATE_TRANSITION: upload_verified can only transition to committed, cleanup_pending, or expired_uncompleted (attempted %)', NEW.status;
  END IF;

  IF OLD.status = 'committed' AND NEW.status NOT IN ('committed', 'cleanup_pending') THEN
    RAISE EXCEPTION 'ILLEGAL_STATE_TRANSITION: committed can only transition to cleanup_pending (attempted %)', NEW.status;
  END IF;

  IF OLD.status = 'cleanup_pending' AND NEW.status NOT IN ('cleanup_pending', 'deletion_in_progress') THEN
    RAISE EXCEPTION 'ILLEGAL_STATE_TRANSITION: cleanup_pending can only transition to deletion_in_progress (attempted %)', NEW.status;
  END IF;

  IF OLD.status = 'deletion_in_progress' AND NEW.status NOT IN ('deletion_in_progress', 'deleted', 'cleanup_pending') THEN
    RAISE EXCEPTION 'ILLEGAL_STATE_TRANSITION: deletion_in_progress can only transition to deleted or cleanup_pending (attempted %)', NEW.status;
  END IF;

  NEW.last_updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;
--> statement-breakpoint
CREATE TRIGGER trg_media_upload_session_immutability_update
BEFORE UPDATE ON "media_upload_sessions"
FOR EACH ROW
EXECUTE FUNCTION fn_enforce_media_upload_session_immutability();
--> statement-breakpoint
CREATE TRIGGER trg_media_upload_session_immutability_delete
BEFORE DELETE ON "media_upload_sessions"
FOR EACH ROW
EXECUTE FUNCTION fn_enforce_media_upload_session_immutability();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fn_enforce_media_cleanup_queue_immutability()
RETURNS TRIGGER AS $$
BEGIN
  -- A. HARD DELETION SAFEGUARD (30-DAY RETENTION FOR COMPLETED/CANCELLED ONLY)
  IF TG_OP = 'DELETE' THEN
    IF OLD.status NOT IN ('completed', 'cancelled_referenced') THEN
      RAISE EXCEPTION 'QUEUE_DELETE_PROHIBITED: Only completed or cancelled jobs can be deleted (id=%, status=%)', OLD.id, OLD.status;
    END IF;
    IF OLD.completed_at IS NULL OR OLD.completed_at > (NOW() - INTERVAL '30 days') THEN
      RAISE EXCEPTION 'QUEUE_RETENTION_VIOLATION: Completed/cancelled queue jobs must be retained for at least 30 days before pruning (id=%)', OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  -- B. IMMUTABLE SNAPSHOT COORDINATES (CANNOT BE ALTERED ON UPDATE)
  IF OLD.id != NEW.id OR
     OLD.session_id != NEW.session_id OR
     OLD.cloud_name != NEW.cloud_name OR
     OLD.canonical_public_id != NEW.canonical_public_id OR
     OLD.resource_type != NEW.resource_type OR
     OLD.delivery_type != NEW.delivery_type OR
     OLD.folder != NEW.folder OR
     OLD.idempotency_key != NEW.idempotency_key OR
     OLD.created_at != NEW.created_at THEN
    RAISE EXCEPTION 'IMMUTABLE_QUEUE_IDENTITY_MODIFICATION: Core identity coordinates of media_cleanup_queue cannot be modified (id=%)', OLD.id;
  END IF;

  -- C. TERMINAL STATES IMMUTABILITY (CANNOT ROLL BACK TO ACTIVE)
  IF OLD.status IN ('completed', 'cancelled_referenced', 'dead_letter') AND NEW.status != OLD.status THEN
    RAISE EXCEPTION 'ILLEGAL_QUEUE_STATE_TRANSITION: Terminal queue job status cannot be modified (id=%, old_status=%, attempted=%)', OLD.id, OLD.status, NEW.status;
  END IF;

  -- D. ATTEMPTS CANNOT DECREASE
  IF NEW.attempts < OLD.attempts THEN
    RAISE EXCEPTION 'ILLEGAL_QUEUE_ATTEMPTS_DECREMENT: attempts counter cannot decrease (id=%, old=%, new=%)', OLD.id, OLD.attempts, NEW.attempts;
  END IF;

  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;
--> statement-breakpoint
CREATE TRIGGER trg_media_cleanup_queue_immutability_update
BEFORE UPDATE ON "media_cleanup_queue"
FOR EACH ROW
EXECUTE FUNCTION fn_enforce_media_cleanup_queue_immutability();
--> statement-breakpoint
CREATE TRIGGER trg_media_cleanup_queue_immutability_delete
BEFORE DELETE ON "media_cleanup_queue"
FOR EACH ROW
EXECUTE FUNCTION fn_enforce_media_cleanup_queue_immutability();
