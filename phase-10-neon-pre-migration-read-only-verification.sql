-- ==============================================================================
-- HS SPARE PARTS — PHASE 10 NEON PRE-MIGRATION READ-ONLY VERIFICATION (FINAL)
--
-- Target Database:     Neon PostgreSQL Serverless (neondb)
-- Target Branch:       HS Spare Parts / production
-- Target Migration:    src/lib/db/migrations/0005_media_lifecycle.sql
-- Snapshot Reference:   production at 2026-11-21 10:32:53 UTC (manual)
-- Snapshot Metadata:    Created: 2026-11-21 10:32:53 UTC | Type: Manual | Expiry: Never
-- Snapshot Status:      Confirmed from Neon Console display; restoration NOT tested.
--
-- STRICT READ-ONLY SECURITY GUARANTEE:
-- - 100% READ-ONLY: Contains strictly SELECT queries against PostgreSQL system
--   catalogs (pg_catalog) and information_schema.
-- - ZERO DML / ZERO DDL: Absolutely NO INSERT, UPDATE, DELETE, MERGE, CREATE,
--   ALTER, DROP, TRUNCATE, or DO procedural execution blocks.
-- - ZERO MUTATING FUNCTIONS: No administrative or state-altering function calls.
-- - ZERO SECRET / ZERO PII EXPOSURE: Does NOT query application user records,
--   credentials, bcrypt hashes, customer addresses, orders, or tokens.
-- - NON-BLOCKING: Uses system catalogs and reltuples metadata; zero table locks.
--
-- OPERATOR GO/NO-GO GATE PROTOCOL:
-- - This script is DIAGNOSTIC ONLY.
-- - A verdict of MIGRATION_NOT_APPLIED does NOT authorize running migration 0005.
-- - An objects-present verdict does NOT authorize Admin Provisioning.
-- - The operator must save and submit all query outputs for team review.
-- - Explicit go-ahead authorization is required before any DDL is executed.
-- ==============================================================================


-- ==============================================================================
-- SECTION 1: MASTER DIAGNOSTIC ROLLUP & AUTOMATED CATALOG VERDICT
--
-- Evaluates PostgreSQL catalog metrics across 14 distinct dimensions.
-- Possible Master Verdicts:
--   1. MIGRATION_NOT_APPLIED
--      -> Clean pre-migration candidate. All 0005 objects & collisions are absent.
--         Operator must check Section 2 ledger gate and hold for review.
--   2. OBJECTS_PRESENT_STRUCTURAL_REVIEW_REQUIRED
--      -> All target tables, columns, constraints, functions & triggers exist.
--         Count check passed; operator must review detailed outputs (Sections 3–9)
--         to confirm full structural fidelity before declaring fully applied.
--   3. UNEXPECTED_OBJECT_COLLISION
--      -> Target tables are absent, but functions, triggers, indexes, or views
--         matching migration 0005 names already exist. HALT.
--   4. MIGRATION_PARTIALLY_APPLIED
--      -> Incomplete migration state (1 table missing, or broken/missing triggers). HALT.
--   5. SCHEMA_MISMATCH
--      -> Target tables exist, but column definitions, constraints, FK rules,
--         or function search paths diverge from migration 0005. HALT.
--   6. VERIFICATION_INCONCLUSIVE
--      -> Catalog returned anomalous metrics that require DBA investigation. HALT.
-- ==============================================================================

WITH catalog_metrics AS (
  SELECT
    -- 1. Regular Table Presence (relkind 'r')
    (
      SELECT count(*)::int
      FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relname = 'media_upload_sessions'
        AND relkind = 'r'
    ) AS has_tbl_sessions,

    (
      SELECT count(*)::int
      FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relname = 'media_cleanup_queue'
        AND relkind = 'r'
    ) AS has_tbl_queue,

    -- 2. Non-standard object collisions (views, foreign tables with target names)
    (
      SELECT count(*)::int
      FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relname IN ('media_upload_sessions', 'media_cleanup_queue')
        AND relkind != 'r'
    ) AS cnt_tbl_collisions,

    -- 3. Exact Column Inventory (Expected: sessions = 24, queue = 25)
    (
      SELECT count(*)::int
      FROM pg_attribute att
      JOIN pg_class cls ON att.attrelid = cls.oid
      WHERE cls.relnamespace = 'public'::regnamespace
        AND cls.relname = 'media_upload_sessions'
        AND att.attnum > 0
        AND NOT att.attisdropped
    ) AS cnt_cols_sessions,

    (
      SELECT count(*)::int
      FROM pg_attribute att
      JOIN pg_class cls ON att.attrelid = cls.oid
      WHERE cls.relnamespace = 'public'::regnamespace
        AND cls.relname = 'media_cleanup_queue'
        AND att.attnum > 0
        AND NOT att.attisdropped
    ) AS cnt_cols_queue,

    -- 4. Valid Indexes attached to target tables (Expected: exactly 12)
    (
      SELECT count(*)::int
      FROM pg_index idx
      JOIN pg_class cls ON idx.indrelid = cls.oid
      WHERE cls.relnamespace = 'public'::regnamespace
        AND cls.relname IN ('media_upload_sessions', 'media_cleanup_queue')
        AND idx.indisvalid
    ) AS cnt_indexes_valid,

    -- 5. Invalid Indexes (detects failed index creation)
    (
      SELECT count(*)::int
      FROM pg_index idx
      JOIN pg_class cls ON idx.indrelid = cls.oid
      WHERE cls.relnamespace = 'public'::regnamespace
        AND cls.relname IN ('media_upload_sessions', 'media_cleanup_queue')
        AND NOT idx.indisvalid
    ) AS cnt_indexes_invalid,

    -- 6. Colliding indexes with our names attached to OTHER tables
    (
      SELECT count(*)::int
      FROM pg_class idx_cls
      JOIN pg_index idx ON idx.indexrelid = idx_cls.oid
      JOIN pg_class tbl_cls ON idx.indrelid = tbl_cls.oid
      WHERE idx_cls.relname IN (
        'uq_media_sessions_asset_identity',
        'media_sessions_public_id_idx',
        'media_sessions_status_idx',
        'media_sessions_entity_idx',
        'media_sessions_actor_idx',
        'uq_media_queue_active_job',
        'media_queue_poll_idx',
        'media_queue_stale_lease_idx',
        'media_queue_session_idx',
        'media_cleanup_queue_idempotency_key_unique'
      ) AND tbl_cls.relname NOT IN ('media_upload_sessions', 'media_cleanup_queue')
    ) AS cnt_indexes_colliding,

    -- 7. Validated Constraints (Expected: exactly 11)
    (
      SELECT count(*)::int
      FROM pg_constraint con
      JOIN pg_class cls ON con.conrelid = cls.oid
      WHERE cls.relnamespace = 'public'::regnamespace
        AND cls.relname IN ('media_upload_sessions', 'media_cleanup_queue')
        AND con.convalidated
    ) AS cnt_constraints_valid,

    -- 8. Foreign Key ON DELETE RESTRICT Rule (Expected: exactly 1)
    (
      SELECT count(*)::int
      FROM pg_constraint con
      JOIN pg_class cls ON con.conrelid = cls.oid
      WHERE cls.relnamespace = 'public'::regnamespace
        AND cls.relname = 'media_cleanup_queue'
        AND con.contype = 'f'
        AND con.confdeltype = 'r'
        AND con.conname = 'media_cleanup_queue_session_id_media_upload_sessions_id_fk'
        AND con.convalidated
    ) AS cnt_fk_restrict,

    -- 9. Stored Immutability Functions (Expected: exactly 3)
    (
      SELECT count(*)::int
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'fn_prevent_truncate_media_sessions',
          'fn_enforce_media_upload_session_immutability',
          'fn_enforce_media_cleanup_queue_immutability'
        )
    ) AS cnt_functions,

    -- 10. Functions with Hardened search_path = public, pg_temp (Expected: exactly 3)
    (
      SELECT count(*)::int
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'fn_prevent_truncate_media_sessions',
          'fn_enforce_media_upload_session_immutability',
          'fn_enforce_media_cleanup_queue_immutability'
        )
        AND array_to_string(p.proconfig, ', ') = 'search_path=public, pg_temp'
    ) AS cnt_functions_hardened,

    -- 11. Enabled Triggers on target tables (Expected: exactly 5)
    (
      SELECT count(*)::int
      FROM pg_trigger trg
      JOIN pg_class cls ON trg.tgrelid = cls.oid
      WHERE cls.relnamespace = 'public'::regnamespace
        AND cls.relname IN ('media_upload_sessions', 'media_cleanup_queue')
        AND NOT trg.tgisinternal
        AND trg.tgname IN (
          'trg_prevent_truncate_media_sessions',
          'trg_media_upload_session_immutability_update',
          'trg_media_upload_session_immutability_delete',
          'trg_media_cleanup_queue_immutability_update',
          'trg_media_cleanup_queue_immutability_delete'
        )
        AND trg.tgenabled = 'O'
    ) AS cnt_triggers_valid,

    -- 12. Disabled Triggers on target tables (detects tampering)
    (
      SELECT count(*)::int
      FROM pg_trigger trg
      JOIN pg_class cls ON trg.tgrelid = cls.oid
      WHERE cls.relnamespace = 'public'::regnamespace
        AND cls.relname IN ('media_upload_sessions', 'media_cleanup_queue')
        AND NOT trg.tgisinternal
        AND trg.tgenabled != 'O'
    ) AS cnt_triggers_disabled,

    -- 13. Colliding triggers with our names attached to OTHER tables
    (
      SELECT count(*)::int
      FROM pg_trigger trg
      JOIN pg_class cls ON trg.tgrelid = cls.oid
      WHERE (cls.relnamespace != 'public'::regnamespace OR cls.relname NOT IN ('media_upload_sessions', 'media_cleanup_queue'))
        AND trg.tgname IN (
          'trg_prevent_truncate_media_sessions',
          'trg_media_upload_session_immutability_update',
          'trg_media_upload_session_immutability_delete',
          'trg_media_cleanup_queue_immutability_update',
          'trg_media_cleanup_queue_immutability_delete'
        )
    ) AS cnt_triggers_colliding,

    -- 14. Drizzle Migration Ledger Detection
    (
      SELECT count(*)::int
      FROM pg_class c
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE c.relname = '__drizzle_migrations'
        AND n.nspname IN ('drizzle', 'public')
    ) AS cnt_tracking_tables
)
SELECT
  -- Deterministic Master Verdict
  CASE
    -- State 1: Clean Pre-Migration Candidate (All 0005 objects & collisions absent)
    WHEN has_tbl_sessions = 0 AND has_tbl_queue = 0
         AND cnt_tbl_collisions = 0
         AND cnt_functions = 0
         AND cnt_triggers_valid = 0 AND cnt_triggers_colliding = 0 AND cnt_triggers_disabled = 0
         AND cnt_indexes_valid = 0 AND cnt_indexes_invalid = 0 AND cnt_indexes_colliding = 0
      THEN 'MIGRATION_NOT_APPLIED'

    -- State 2: Physical Objects Present (Automated counts passed -> Requires structural review)
    WHEN has_tbl_sessions = 1 AND has_tbl_queue = 1
         AND cnt_tbl_collisions = 0
         AND cnt_cols_sessions = 24 AND cnt_cols_queue = 25
         AND cnt_indexes_valid = 12 AND cnt_indexes_invalid = 0 AND cnt_indexes_colliding = 0
         AND cnt_constraints_valid = 11 AND cnt_fk_restrict = 1
         AND cnt_functions = 3 AND cnt_functions_hardened = 3
         AND cnt_triggers_valid = 5 AND cnt_triggers_colliding = 0 AND cnt_triggers_disabled = 0
      THEN 'OBJECTS_PRESENT_STRUCTURAL_REVIEW_REQUIRED'

    -- State 3: Collisions Detected (Objects exist while tables are absent)
    WHEN (has_tbl_sessions = 0 OR has_tbl_queue = 0)
         AND (cnt_functions > 0 OR cnt_triggers_colliding > 0 OR cnt_indexes_colliding > 0 OR cnt_tbl_collisions > 0)
      THEN 'UNEXPECTED_OBJECT_COLLISION'

    -- State 4: Partially Applied (One table missing, or missing triggers/functions/indexes)
    WHEN (has_tbl_sessions = 1 AND has_tbl_queue = 0)
         OR (has_tbl_sessions = 0 AND has_tbl_queue = 1)
         OR (has_tbl_sessions = 1 AND has_tbl_queue = 1
             AND (cnt_functions < 3 OR cnt_triggers_valid < 5 OR cnt_indexes_valid < 12))
      THEN 'MIGRATION_PARTIALLY_APPLIED'

    -- State 5: Schema Mismatch (Target tables exist, but column/constraint counts, FK rules, or search_path diverge)
    WHEN has_tbl_sessions = 1 AND has_tbl_queue = 1
         AND (cnt_cols_sessions != 24 OR cnt_cols_queue != 25 OR cnt_constraints_valid != 11
              OR cnt_fk_restrict != 1 OR cnt_functions_hardened < cnt_functions
              OR cnt_indexes_invalid > 0 OR cnt_triggers_disabled > 0)
      THEN 'SCHEMA_MISMATCH'

    -- State 6: Inconclusive
    ELSE 'VERIFICATION_INCONCLUSIVE'
  END AS master_verdict,

  -- Migration Ledger Gate Status
  CASE
    WHEN cnt_tracking_tables > 0
      THEN 'LEDGER_DETECTED_REVIEW_REQUIRED: Ledger table exists. Operator MUST run Section 2B/2C before go/no-go decision.'
    ELSE 'LEDGER_NOT_DETECTED: Database operates in Manual SQL Mode. Physical schema state governs.'
  END AS ledger_gate_status,

  -- Action Required
  CASE
    WHEN has_tbl_sessions = 0 AND has_tbl_queue = 0
         AND cnt_tbl_collisions = 0 AND cnt_functions = 0
         AND cnt_triggers_valid = 0 AND cnt_triggers_colliding = 0 AND cnt_triggers_disabled = 0
         AND cnt_indexes_valid = 0 AND cnt_indexes_invalid = 0 AND cnt_indexes_colliding = 0
      THEN 'RECORD_AND_HOLD: Catalog has zero migration 0005 objects. Run Section 2A/2B/2C to audit ledger state. Save and share all outputs for review. DO NOT execute migration 0005 without separate explicit authorization.'

    WHEN has_tbl_sessions = 1 AND has_tbl_queue = 1
         AND cnt_tbl_collisions = 0
         AND cnt_cols_sessions = 24 AND cnt_cols_queue = 25
         AND cnt_indexes_valid = 12 AND cnt_indexes_invalid = 0 AND cnt_indexes_colliding = 0
         AND cnt_constraints_valid = 11 AND cnt_fk_restrict = 1
         AND cnt_functions = 3 AND cnt_functions_hardened = 3
         AND cnt_triggers_valid = 5 AND cnt_triggers_colliding = 0 AND cnt_triggers_disabled = 0
      THEN 'RECORD_AND_HOLD: Target objects detected. Automated counts passed. Operator must review Sections 4 through 8 outputs against runbook specifications. DO NOT re-run migration 0005. DO NOT proceed to Admin Provisioning without separate human authorization.'

    WHEN (has_tbl_sessions = 0 OR has_tbl_queue = 0)
         AND (cnt_functions > 0 OR cnt_triggers_colliding > 0 OR cnt_indexes_colliding > 0 OR cnt_tbl_collisions > 0)
      THEN 'HALT_COLLISION: Pre-existing objects collide with migration 0005 names while tables are absent. DO NOT apply migration. Save outputs and review Section 9.'

    WHEN (has_tbl_sessions = 1 AND has_tbl_queue = 0)
         OR (has_tbl_sessions = 0 AND has_tbl_queue = 1)
         OR (has_tbl_sessions = 1 AND has_tbl_queue = 1
             AND (cnt_functions < 3 OR cnt_triggers_valid < 5 OR cnt_indexes_valid < 12))
      THEN 'HALT_PARTIAL: Incomplete migration state detected. DO NOT re-run migration. Preserve current state and submit outputs for DBA review.'

    WHEN has_tbl_sessions = 1 AND has_tbl_queue = 1
         AND (cnt_cols_sessions != 24 OR cnt_cols_queue != 25 OR cnt_constraints_valid != 11
              OR cnt_fk_restrict != 1 OR cnt_functions_hardened < cnt_functions
              OR cnt_indexes_invalid > 0 OR cnt_triggers_disabled > 0)
      THEN 'HALT_MISMATCH: Target tables exist but definitions diverge from migration 0005 specification. Inspect Sections 4 through 8.'

    ELSE 'HALT_INCONCLUSIVE: Database catalog returned anomalous or unclassified metrics. Manual catalog inspection required.'
  END AS operator_action,

  -- Metric Evidence Breakdown
  (has_tbl_sessions + has_tbl_queue) || '/2' AS tables_found,
  cnt_cols_sessions || '/24' AS sessions_cols,
  cnt_cols_queue || '/25' AS queue_cols,
  cnt_indexes_valid || '/12 (inv: ' || cnt_indexes_invalid || ')' AS indexes_valid_vs_invalid,
  cnt_constraints_valid || '/11' AS constraints_valid,
  cnt_fk_restrict || '/1' AS fk_restrict_valid,
  cnt_functions_hardened || '/' || cnt_functions || ' (exp 3)' AS functions_hardened_vs_total,
  cnt_triggers_valid || '/5 (dis: ' || cnt_triggers_disabled || ')' AS triggers_valid_vs_disabled,
  cnt_tbl_collisions AS table_collisions,
  cnt_indexes_colliding AS index_collisions,
  cnt_triggers_colliding AS trigger_collisions
FROM catalog_metrics;


-- ==============================================================================
-- SECTION 2: DRIZZLE MIGRATION LEDGER AUDIT
--
-- Inspects the actual migration journal tracking table.
-- Source evidence (node_modules/drizzle-orm/neon-http/migrator.js):
--   Default Schema: 'drizzle'
--   Default Table:  '__drizzle_migrations'
--   Journal Entry for 0005 (_journal.json):
--     tag:          '0005_media_lifecycle'
--     when:         1794935000000
--     expected sha: 'f58b5947ff7a42358429d4d259b5344d6588f2ed7747cb76ddb9b1d7a51b1921'
-- ==============================================================================

-- 2A. Parse-Safe Catalog Detection of Migration Tracking Table
-- Run this first. It tells you which schema holds __drizzle_migrations (or none).
SELECT
  n.nspname AS ledger_schema,
  c.relname AS ledger_table,
  c.reltuples AS estimated_records,
  CASE
    WHEN n.nspname = 'drizzle' THEN 'Run Query 2B manually to inspect recorded migrations.'
    WHEN n.nspname = 'public' THEN 'Run Query 2C manually to inspect recorded migrations.'
    ELSE 'Ledger table not found. Normal for manual SQL editor workflows.'
  END AS operator_next_step
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname = '__drizzle_migrations'
  AND n.nspname IN ('drizzle', 'public');

-- 2B. Standalone Query: Inspect 'drizzle.__drizzle_migrations'
-- OPERATOR NOTICE: Run this query ONLY if Query 2A returned 'drizzle' above.
-- Do not run in batch if schema 'drizzle' does not exist.
/*
SELECT
  id,
  hash,
  created_at,
  CASE
    WHEN created_at = 1794935000000 AND hash = 'f58b5947ff7a42358429d4d259b5344d6588f2ed7747cb76ddb9b1d7a51b1921'
      THEN 'MATCH: Migration 0005 confirmed in ledger (exact hash & timestamp).'
    WHEN created_at = 1794935000000 AND hash != 'f58b5947ff7a42358429d4d259b5344d6588f2ed7747cb76ddb9b1d7a51b1921'
      THEN 'HASH_MISMATCH: Timestamp matches 1794935000000 but SQL hash differs! Review DDL.'
    WHEN created_at = 1794934860128 THEN 'PRIOR_MIGRATION: 0004_huge_dark_beast'
    WHEN created_at = 1794933295682 THEN 'PRIOR_MIGRATION: 0003_loud_rhino'
    WHEN created_at = 1794928264675 THEN 'PRIOR_MIGRATION: 0002_wealthy_shaman'
    WHEN created_at = 1794826662814 THEN 'PRIOR_MIGRATION: 0001_tan_power_pack'
    WHEN created_at = 1794825015990 THEN 'PRIOR_MIGRATION: 0000_simple_baron_strucker'
    ELSE 'OTHER_MIGRATION: timestamp=' || created_at::text
  END AS ledger_interpretation,
  to_timestamp(created_at / 1000) AT TIME ZONE 'UTC' AS recorded_at_utc
FROM drizzle.__drizzle_migrations
ORDER BY id ASC;
*/

-- 2C. Standalone Query: Inspect 'public.__drizzle_migrations'
-- OPERATOR NOTICE: Run this query ONLY if Query 2A returned 'public' above.
/*
SELECT
  id,
  hash,
  created_at,
  CASE
    WHEN created_at = 1794935000000 AND hash = 'f58b5947ff7a42358429d4d259b5344d6588f2ed7747cb76ddb9b1d7a51b1921'
      THEN 'MATCH: Migration 0005 confirmed in ledger (exact hash & timestamp).'
    WHEN created_at = 1794935000000 AND hash != 'f58b5947ff7a42358429d4d259b5344d6588f2ed7747cb76ddb9b1d7a51b1921'
      THEN 'HASH_MISMATCH: Timestamp matches 1794935000000 but SQL hash differs!'
    ELSE 'OTHER_MIGRATION: timestamp=' || created_at::text
  END AS ledger_interpretation,
  to_timestamp(created_at / 1000) AT TIME ZONE 'UTC' AS recorded_at_utc
FROM public.__drizzle_migrations
ORDER BY id ASC;
*/


-- ==============================================================================
-- SECTION 3: TABLE EXISTENCE, PERSISTENCE & OBJECT CLASSIFICATION
-- Evaluates presence of target tables in public schema using pg_class.
-- Zero table locks; safe to execute against production.
-- ==============================================================================

SELECT
  n.nspname AS table_schema,
  c.relname AS table_name,
  CASE
    WHEN c.relkind = 'r' THEN 'STANDARD_TABLE'
    WHEN c.relkind = 'v' THEN 'VIEW (COLLISION)'
    WHEN c.relkind = 'm' THEN 'MATERIALIZED_VIEW (COLLISION)'
    WHEN c.relkind = 'f' THEN 'FOREIGN_TABLE (COLLISION)'
    WHEN c.relkind = 'p' THEN 'PARTITIONED_TABLE (COLLISION)'
    ELSE 'OTHER_KIND: ' || c.relkind::text
  END AS object_classification,
  CASE
    WHEN c.relpersistence = 'p' THEN 'PERMANENT'
    WHEN c.relpersistence = 'u' THEN 'UNLOGGED (COLLISION)'
    WHEN c.relpersistence = 't' THEN 'TEMPORARY (COLLISION)'
    ELSE 'UNKNOWN: ' || c.relpersistence::text
  END AS persistence,
  r.rolname AS table_owner,
  c.reltuples AS estimated_rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_roles r ON r.oid = c.relowner
WHERE n.nspname = 'public'
  AND c.relname IN ('media_upload_sessions', 'media_cleanup_queue')
ORDER BY c.relname ASC;


-- ==============================================================================
-- SECTION 4: EXACT COLUMN INVENTORY, DATA TYPES, NULLABILITY & ALIGNMENT
-- Automatically evaluates every column against migration 0005 specification.
-- Expected: media_upload_sessions (24 columns), media_cleanup_queue (25 columns).
-- Every row must display 'MATCH' in the specification_alignment column.
-- ==============================================================================

SELECT
  table_name,
  ordinal_position,
  column_name,
  data_type,
  character_maximum_length,
  is_nullable,
  column_default,
  CASE
    -- media_upload_sessions (24 columns)
    WHEN table_name = 'media_upload_sessions' AND column_name = 'id' AND data_type = 'uuid' AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_upload_sessions' AND column_name = 'cloud_name' AND data_type = 'character varying' AND character_maximum_length = 64 AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_upload_sessions' AND column_name = 'canonical_public_id' AND data_type = 'character varying' AND character_maximum_length = 255 AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_upload_sessions' AND column_name = 'resource_type' AND data_type = 'character varying' AND character_maximum_length = 32 AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_upload_sessions' AND column_name = 'delivery_type' AND data_type = 'character varying' AND character_maximum_length = 32 AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_upload_sessions' AND column_name = 'folder' AND data_type = 'character varying' AND character_maximum_length = 64 AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_upload_sessions' AND column_name = 'created_by_actor_id' AND data_type = 'uuid' AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_upload_sessions' AND column_name = 'status' AND data_type = 'character varying' AND character_maximum_length = 32 AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_upload_sessions' AND column_name = 'upload_verified_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'YES' THEN 'MATCH'
    WHEN table_name = 'media_upload_sessions' AND column_name = 'cloudinary_version' AND data_type = 'character varying' AND character_maximum_length = 32 AND is_nullable = 'YES' THEN 'MATCH'
    WHEN table_name = 'media_upload_sessions' AND column_name = 'uploaded_bytes' AND data_type = 'integer' AND is_nullable = 'YES' THEN 'MATCH'
    WHEN table_name = 'media_upload_sessions' AND column_name = 'upload_proof' AND data_type = 'jsonb' AND is_nullable = 'YES' THEN 'MATCH'
    WHEN table_name = 'media_upload_sessions' AND column_name = 'created_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_upload_sessions' AND column_name = 'expires_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_upload_sessions' AND column_name = 'last_updated_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_upload_sessions' AND column_name = 'committed_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'YES' THEN 'MATCH'
    WHEN table_name = 'media_upload_sessions' AND column_name = 'committed_entity_type' AND data_type = 'character varying' AND character_maximum_length = 64 AND is_nullable = 'YES' THEN 'MATCH'
    WHEN table_name = 'media_upload_sessions' AND column_name = 'committed_entity_id' AND data_type = 'character varying' AND character_maximum_length = 255 AND is_nullable = 'YES' THEN 'MATCH'
    WHEN table_name = 'media_upload_sessions' AND column_name = 'cleanup_intent_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'YES' THEN 'MATCH'
    WHEN table_name = 'media_upload_sessions' AND column_name = 'deleted_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'YES' THEN 'MATCH'
    WHEN table_name = 'media_upload_sessions' AND column_name = 'lease_version' AND data_type = 'integer' AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_upload_sessions' AND column_name = 'locked_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'YES' THEN 'MATCH'
    WHEN table_name = 'media_upload_sessions' AND column_name = 'lease_expires_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'YES' THEN 'MATCH'
    WHEN table_name = 'media_upload_sessions' AND column_name = 'locked_by_worker' AND data_type = 'character varying' AND character_maximum_length = 128 AND is_nullable = 'YES' THEN 'MATCH'

    -- media_cleanup_queue (25 columns)
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'id' AND data_type = 'uuid' AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'session_id' AND data_type = 'uuid' AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'cloud_name' AND data_type = 'character varying' AND character_maximum_length = 64 AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'canonical_public_id' AND data_type = 'character varying' AND character_maximum_length = 255 AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'resource_type' AND data_type = 'character varying' AND character_maximum_length = 32 AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'delivery_type' AND data_type = 'character varying' AND character_maximum_length = 32 AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'folder' AND data_type = 'character varying' AND character_maximum_length = 64 AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'idempotency_key' AND data_type = 'character varying' AND character_maximum_length = 128 AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'trigger_reason' AND data_type = 'character varying' AND character_maximum_length = 64 AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'original_entity_type' AND data_type = 'character varying' AND character_maximum_length = 64 AND is_nullable = 'YES' THEN 'MATCH'
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'original_entity_id' AND data_type = 'character varying' AND character_maximum_length = 255 AND is_nullable = 'YES' THEN 'MATCH'
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'status' AND data_type = 'character varying' AND character_maximum_length = 32 AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'attempts' AND data_type = 'integer' AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'max_attempts' AND data_type = 'integer' AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'next_retry_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'last_attempt_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'YES' THEN 'MATCH'
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'locked_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'YES' THEN 'MATCH'
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'lease_expires_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'YES' THEN 'MATCH'
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'locked_by_worker' AND data_type = 'character varying' AND character_maximum_length = 128 AND is_nullable = 'YES' THEN 'MATCH'
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'lease_version' AND data_type = 'integer' AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'last_error_classification' AND data_type = 'character varying' AND character_maximum_length = 64 AND is_nullable = 'YES' THEN 'MATCH'
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'last_error_message' AND data_type = 'text' AND is_nullable = 'YES' THEN 'MATCH'
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'created_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'updated_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'NO' THEN 'MATCH'
    WHEN table_name = 'media_cleanup_queue' AND column_name = 'completed_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'YES' THEN 'MATCH'

    ELSE 'MISMATCH_OR_UNEXPECTED_COLUMN'
  END AS specification_alignment
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('media_upload_sessions', 'media_cleanup_queue')
ORDER BY table_name ASC, ordinal_position ASC;


-- ==============================================================================
-- SECTION 5: CONSTRAINTS, CHECK CLAUSES & FOREIGN KEY INTEGRITY
-- Verifies:
--   - 2 PRIMARY KEYs (media_upload_sessions_pkey, media_cleanup_queue_pkey)
--   - 1 UNIQUE constraint (media_cleanup_queue_idempotency_key_unique)
--   - 1 FOREIGN KEY with ON DELETE RESTRICT (media_cleanup_queue_session_id_media_upload_sessions_id_fk)
--   - 7 CHECK constraints (5 on sessions, 2 on queue)
-- ==============================================================================

-- 5A. Constraint Inventory, Type & Validation Status
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  CASE
    WHEN tc.is_deferrable = 'NO' AND tc.initially_deferred = 'NO' THEN 'IMMEDIATE'
    ELSE 'DEFERRED'
  END AS enforcement_mode,
  CASE
    WHEN tc.constraint_type = 'CHECK' THEN cc.check_clause
    ELSE NULL
  END AS check_definition
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('media_upload_sessions', 'media_cleanup_queue')
ORDER BY tc.table_name ASC, tc.constraint_type ASC, tc.constraint_name ASC;

-- 5B. Foreign Key Integrity on media_cleanup_queue (Must be ON DELETE RESTRICT)
SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS referenced_table,
  ccu.column_name AS referenced_column,
  rc.delete_rule,
  rc.update_rule,
  CASE
    WHEN rc.delete_rule = 'RESTRICT' THEN 'PASSED: Protected against accidental cascade deletions'
    ELSE 'CRITICAL_FAILURE: Foreign key delete_rule is ' || rc.delete_rule || ', expected RESTRICT'
  END AS safety_assessment
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name = 'media_cleanup_queue';


-- ==============================================================================
-- SECTION 6: INDEX INVENTORY, VALIDITY, UNIQUENESS & PARTIAL PREDICATES
-- Verifies all 12 indexes, confirms indisvalid = TRUE, checks uniqueness,
-- and evaluates partial filter predicate: (status IN ('pending', 'processing')).
-- ==============================================================================

SELECT
  cls.relname AS table_name,
  idx_cls.relname AS index_name,
  idx.indisunique AS is_unique,
  idx.indisvalid AS is_valid,
  CASE
    WHEN idx.indpred IS NOT NULL THEN pg_get_expr(idx.indpred, idx.indrelid)
    ELSE NULL
  END AS partial_filter_predicate,
  CASE
    WHEN NOT idx.indisvalid THEN 'CRITICAL: Index is INVALID'
    WHEN idx_cls.relname = 'uq_media_queue_active_job' AND idx.indpred IS NULL THEN 'CRITICAL: Missing partial predicate'
    WHEN idx_cls.relname = 'uq_media_sessions_asset_identity' AND NOT idx.indisunique THEN 'CRITICAL: Must be UNIQUE'
    ELSE 'VERIFIED'
  END AS index_health_assessment,
  pg_get_indexdef(idx.indexrelid) AS index_definition
FROM pg_index idx
JOIN pg_class cls ON idx.indrelid = cls.oid
JOIN pg_class idx_cls ON idx.indexrelid = idx_cls.oid
WHERE cls.relnamespace = 'public'::regnamespace
  AND cls.relname IN ('media_upload_sessions', 'media_cleanup_queue')
ORDER BY cls.relname ASC, idx_cls.relname ASC;


-- ==============================================================================
-- SECTION 7: STORED FUNCTIONS & SECURITY HARDENING CONFIGURATION
-- Verifies the 3 immutability trigger functions and strictly enforces that
-- search_path is explicitly set to 'public, pg_temp' (defense against search_path hijacking).
-- ==============================================================================

SELECT
  p.proname AS function_name,
  l.lanname AS language,
  p.prosecdef AS is_security_definer,
  array_to_string(p.proconfig, ', ') AS runtime_configuration,
  CASE
    WHEN array_to_string(p.proconfig, ', ') = 'search_path=public, pg_temp'
      THEN 'PASSED: Hardened explicit search_path'
    ELSE 'SECURITY_WARNING: search_path not explicitly set to public, pg_temp'
  END AS security_verdict
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
JOIN pg_language l ON p.prolang = l.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'fn_prevent_truncate_media_sessions',
    'fn_enforce_media_upload_session_immutability',
    'fn_enforce_media_cleanup_queue_immutability'
  )
ORDER BY p.proname ASC;


-- ==============================================================================
-- SECTION 8: TRIGGER INVENTORY, EVENT BINDINGS & ENABLED STATUS
-- Verifies all 5 immutability triggers:
--   - trg_prevent_truncate_media_sessions (BEFORE TRUNCATE on sessions)
--   - trg_media_upload_session_immutability_update (BEFORE UPDATE on sessions)
--   - trg_media_upload_session_immutability_delete (BEFORE DELETE on sessions)
--   - trg_media_cleanup_queue_immutability_update (BEFORE UPDATE on queue)
--   - trg_media_cleanup_queue_immutability_delete (BEFORE DELETE on queue)
-- Verifies tgenabled = 'O' (Origin and local modes active; not disabled).
-- ==============================================================================

SELECT
  cls.relname AS table_name,
  trg.tgname AS trigger_name,
  CASE
    WHEN (trg.tgtype & 2) != 0 THEN 'BEFORE'
    WHEN (trg.tgtype & 64) != 0 THEN 'INSTEAD OF'
    ELSE 'AFTER'
  END AS action_timing,
  CASE
    WHEN (trg.tgtype & 4) != 0 THEN 'INSERT'
    WHEN (trg.tgtype & 8) != 0 THEN 'DELETE'
    WHEN (trg.tgtype & 16) != 0 THEN 'UPDATE'
    WHEN (trg.tgtype & 32) != 0 THEN 'TRUNCATE'
    ELSE 'OTHER'
  END AS event_manipulation,
  CASE
    WHEN (trg.tgtype & 1) != 0 THEN 'ROW'
    ELSE 'STATEMENT'
  END AS action_orientation,
  p.proname AS trigger_function,
  CASE
    WHEN trg.tgenabled = 'O' THEN 'ACTIVE (ENABLED)'
    WHEN trg.tgenabled = 'D' THEN 'DISABLED (CRITICAL_ALERT)'
    WHEN trg.tgenabled = 'A' THEN 'ALWAYS'
    WHEN trg.tgenabled = 'R' THEN 'REPLICA ONLY'
    ELSE 'UNKNOWN: ' || trg.tgenabled::text
  END AS trigger_enabled_status
FROM pg_trigger trg
JOIN pg_class cls ON trg.tgrelid = cls.oid
JOIN pg_proc p ON trg.tgfoid = p.oid
WHERE cls.relnamespace = 'public'::regnamespace
  AND cls.relname IN ('media_upload_sessions', 'media_cleanup_queue')
  AND NOT trg.tgisinternal
ORDER BY cls.relname ASC, trg.tgname ASC;


-- ==============================================================================
-- SECTION 9: ORPHANED & COLLIDING OBJECT SCAN
-- Checks whether any functions, triggers, or indexes matching migration 0005 names
-- exist attached to other tables or outside expected namespaces.
-- Expected output: Exactly 0 rows.
-- ==============================================================================

SELECT
  'COLLIDING_TRIGGER' AS collision_type,
  cls.relname AS attached_table,
  trg.tgname AS object_name
FROM pg_trigger trg
JOIN pg_class cls ON trg.tgrelid = cls.oid
WHERE (cls.relnamespace != 'public'::regnamespace OR cls.relname NOT IN ('media_upload_sessions', 'media_cleanup_queue'))
  AND trg.tgname IN (
    'trg_prevent_truncate_media_sessions',
    'trg_media_upload_session_immutability_update',
    'trg_media_upload_session_immutability_delete',
    'trg_media_cleanup_queue_immutability_update',
    'trg_media_cleanup_queue_immutability_delete'
  )

UNION ALL

SELECT
  'COLLIDING_INDEX' AS collision_type,
  tbl_cls.relname AS attached_table,
  idx_cls.relname AS object_name
FROM pg_class idx_cls
JOIN pg_index idx ON idx.indexrelid = idx_cls.oid
JOIN pg_class tbl_cls ON idx.indrelid = tbl_cls.oid
WHERE idx_cls.relname IN (
  'uq_media_sessions_asset_identity',
  'media_sessions_public_id_idx',
  'media_sessions_status_idx',
  'media_sessions_entity_idx',
  'media_sessions_actor_idx',
  'uq_media_queue_active_job',
  'media_queue_poll_idx',
  'media_queue_stale_lease_idx',
  'media_queue_session_idx',
  'media_cleanup_queue_idempotency_key_unique'
) AND tbl_cls.relname NOT IN ('media_upload_sessions', 'media_cleanup_queue')

ORDER BY collision_type ASC, object_name ASC;
