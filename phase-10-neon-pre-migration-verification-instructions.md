# HS SPARE PARTS — PHASE 10 NEON PRE-MIGRATION READ-ONLY VERIFICATION RUNBOOK (FINAL)

**Workspace:** `E:\HS Spare Parts`  
**Target Environment:** Neon PostgreSQL Serverless (`neondb`)  
**Production Branch:** `HS Spare Parts / production`  
**Migration Target:** `src/lib/db/migrations/0005_media_lifecycle.sql`  
**Snapshot Reference:** `production at 2026-11-21 10:32:53 UTC (manual)`  
**Snapshot Evidence:** Created: `2026-11-21 10:32:53 UTC` | Type: Manual | Expiry: Never  
**Read-Only Script:** `phase-10-neon-pre-migration-read-only-verification.sql`  
**Revision:** Reconciled Final Corrected Version (2026-11-21)  

---

> [!IMPORTANT]
> **EXPLICIT PRODUCTION SAFETY & RECOVERY CONSTRAINTS:**  
> - **Diagnostic Only:** This runbook and accompanying SQL script are for **read-only diagnostic assessment only**.  
> - **Zero Authorization Granted:** Seeing `MIGRATION_NOT_APPLIED` does **NOT** grant authorization to execute `0005_media_lifecycle.sql`. Seeing `OBJECTS_PRESENT_STRUCTURAL_REVIEW_REQUIRED` does **NOT** authorize Admin Provisioning. All actions require a separate explicit review and approval gate.  
> - **Snapshot Recovery Status:** Snapshot `production at 2026-11-21 10:32:53 UTC (manual)` creation was visually confirmed from the operator's Neon Console display. However, snapshot restoration/recovery has **not been tested or independently verified** in this project environment.  
> - **Zero Automatic Restore:** Never treat a snapshot as permission to automatically roll back or discard newer production data. If customer orders or account updates occurred after `2026-11-21 10:32:53 UTC`, restoring to the snapshot will permanently destroy live data.

---

## 1. PURPOSE & VERIFICATION PHILOSOPHY

This runbook instructs the human release operator on safely executing and interpreting the final pre-migration verification script in the Neon Console SQL Editor.

### Why False "Fully Applied" Results Are Eliminated:
Previous draft scripts suffered from count-only false positives: if tables and columns happened to match numeric counts, the script prematurely output `MIGRATION_FULLY_APPLIED`.  
The final script eliminates this vulnerability:
1. When all physical objects are present, the master diagnostic query returns **`OBJECTS_PRESENT_STRUCTURAL_REVIEW_REQUIRED`** rather than assuming full structural fidelity.
2. It requires an operator inspection of the detailed outputs in Sections 4 through 8 (where every column is evaluated against expected type and nullability, indexes are checked for `indisvalid = TRUE`, and foreign keys are checked for `ON DELETE RESTRICT`).
3. It separates physical catalog verification from Drizzle ledger inspection, establishing an explicit operator gate for migration tracking.

---

## 2. OPERATOR STEP-BY-STEP EXECUTION PROTOCOL

### Step 1: Console Environment Confirmation
1. Log in to the [Neon Console](https://console.neon.tech).
2. Select the **HS Spare Parts** project.
3. In the branch selector, explicitly select:  
   `HS Spare Parts / production` (or `production`).
4. In the left navigation, click **SQL Editor**.
5. Verify the connection target in the SQL Editor header:  
   `neondb` (Role: `neondb_owner` or database administrator).

### Step 2: Query Execution Sequence
Open [phase-10-neon-pre-migration-read-only-verification.sql](file:///e:/HS%20Spare%20Parts/phase-10-neon-pre-migration-read-only-verification.sql).

Execute the sections according to the following strict protocol:

| Step | Script Section | Target Query | Safe in Batch? | Purpose & Operator Constraint |
| :---: | :--- | :--- | :---: | :--- |
| **1** | **Section 1** | Master Diagnostic Rollup | **YES** | Primary catalog audit across 14 dimensions. Evaluates master verdict and ledger gate. |
| **2** | **Section 2A** | Ledger Detection | **YES** | Parse-safe detection of whether `__drizzle_migrations` exists in `drizzle` or `public`. |
| **3** | **Section 2B / 2C** | Ledger Records | **CONDITIONAL** | **Do NOT run in batch.** Run 2B only if 2A returned `drizzle`; run 2C only if 2A returned `public`. If neither exists, skip. |
| **4** | **Section 3** | Table Existence & Persistence | **YES** | Confirms tables are regular (`relkind = 'r'`) and permanent (`relpersistence = 'p'`). |
| **5** | **Section 4** | Column Inventory & Deep Types | **YES** | Checks all 49 columns. Every single row must display `MATCH` in `specification_alignment`. |
| **6** | **Section 5** | Constraints & FK Integrity | **YES** | Confirms all 11 constraints and verifies `delete_rule = RESTRICT`. |
| **7** | **Section 6** | Indexes & Partial Predicates | **YES** | Confirms all 12 indexes, verifies `is_valid = TRUE` and partial predicate `status IN ('pending', 'processing')`. |
| **8** | **Section 7** | Stored Functions & search_path | **YES** | Confirms explicit `search_path = public, pg_temp` on all 3 functions. |
| **9** | **Section 8** | Triggers & Enabled States | **YES** | Confirms all 5 triggers have `tgenabled = 'O'` (active). |
| **10**| **Section 9** | Colliding Object Scan | **YES** | Confirms 0 colliding triggers or indexes exist on other tables. |

### Step 3: Capture and Submit Outputs
- Copy and save the output tables from all executed sections into a text file or screenshot.
- Submit the results to the release lead for review.
- **DO NOT execute migration 0005 or admin provisioning SQL until explicit authorization is granted.**

---

## 3. MASTER VERDICTS & DECISION TREE (SECTION 1)

When Section 1 is executed, inspect the `master_verdict` and `ledger_gate_status` columns:

```
+---------------------------------------------+----------------------------------+-------------------------------------------------------+
| master_verdict                              | ledger_gate_status               | operator_action                                       |
+---------------------------------------------+----------------------------------+-------------------------------------------------------+
```

### 1. `MIGRATION_NOT_APPLIED` (Clean Pre-Migration Candidate)
* **Catalog Evidence:**
  - `tables_found: 0/2`, `sessions_cols: 0/24`, `queue_cols: 0/25`
  - `indexes_valid_vs_invalid: 0/12 (inv: 0)`
  - `constraints_valid: 0/11`, `fk_restrict_valid: 0/1`
  - `functions_hardened_vs_total: 0/0 (exp 3)`
  - `triggers_valid_vs_disabled: 0/5 (dis: 0)`
  - `table_collisions: 0`, `index_collisions: 0`, `trigger_collisions: 0`
* **Interpretation:** The physical database catalog is completely clean. No migration 0005 tables, functions, triggers, or colliding objects exist.
* **Ledger Gate Check:**
  - If `ledger_gate_status` says `LEDGER_NOT_DETECTED`: Database operates in Manual SQL Mode. Physical catalog state governs.
  - If `ledger_gate_status` says `LEDGER_DETECTED_REVIEW_REQUIRED`: Run Section 2B (or 2C). Confirm that migration 0005 (`when = 1794935000000`) is **NOT** present in the ledger. If it is present, HALT (`MIGRATION_TRACKING_MISMATCH`).
* **Operator Action:** Record all outputs and hold. **DO NOT execute migration 0005 yet.** Share outputs with the release team and await explicit authorization.

---

### 2. `OBJECTS_PRESENT_STRUCTURAL_REVIEW_REQUIRED` (Automated Counts Passed)
* **Catalog Evidence:**
  - `tables_found: 2/2`
  - `sessions_cols: 24/24`, `queue_cols: 25/25`
  - `indexes_valid_vs_invalid: 12/12 (inv: 0)`
  - `constraints_valid: 11/11`, `fk_restrict_valid: 1/1`
  - `functions_hardened_vs_total: 3/3 (exp 3)`
  - `triggers_valid_vs_disabled: 5/5 (dis: 0)`
  - `table_collisions: 0`, `index_collisions: 0`, `trigger_collisions: 0`
* **Interpretation:** All migration 0005 objects are present and active according to catalog counts.
* **Operator Action (Structural Review Gate):**
  1. Inspect **Section 4**: Verify all 49 rows show `MATCH` under `specification_alignment`.
  2. Inspect **Section 5B**: Verify `safety_assessment` displays `PASSED: Protected against accidental cascade deletions`.
  3. Inspect **Section 6**: Verify `is_valid = TRUE` on all 12 rows, and `uq_media_queue_active_job` displays `(status)::text = ANY ... ('pending', 'processing')`.
  4. Inspect **Section 7**: Verify all 3 functions show `PASSED: Hardened explicit search_path`.
  5. Inspect **Section 8**: Verify all 5 triggers show `ACTIVE (ENABLED)`.
  6. **Verdict Decision:** Once all structural outputs are confirmed: **DO NOT RE-RUN `0005_media_lifecycle.sql`**. The migration is complete. **DO NOT proceed to Admin Provisioning without explicit human authorization.**

---

### 3. `UNEXPECTED_OBJECT_COLLISION` (Hazardous Collision)
* **Catalog Evidence:**
  - Target tables are absent (`0/2`), BUT `functions_hardened_vs_total > 0`, `trigger_collisions > 0`, `index_collisions > 0`, or `table_collisions > 0`.
* **Interpretation:** Pre-existing functions, triggers, indexes, or views exist matching migration 0005 names. Direct DDL execution will fail or overwrite live objects.
* **Operator Action:** **HALT ALL MIGRATION ACTIVITY.** Inspect Section 9 (`COLLIDING OBJECT SCAN`). Do not run migration 0005.

---

### 4. `MIGRATION_PARTIALLY_APPLIED` (Incomplete State)
* **Catalog Evidence:**
  - `tables_found: 1/2`, OR `tables_found: 2/2` but functions (`< 3`), triggers (`< 5`), or indexes (`< 12`) are missing.
* **Interpretation:** A prior migration attempt failed midway, was interrupted, or executed outside an atomic transaction.
* **Operator Action:** **HALT ALL MIGRATION ACTIVITY.** Follow the Recovery Protocol in Section 5 below.

---

### 5. `SCHEMA_MISMATCH` (Structural Divergence or Disabled Objects)
* **Catalog Evidence:**
  - Target tables exist, but column counts (`!= 24` or `!= 25`), invalid indexes (`inv > 0`), disabled triggers (`dis > 0`), foreign key delete rule (`!= RESTRICT`), or unhardened functions are detected.
* **Interpretation:** Tables exist with structural drift or disabled security triggers.
* **Operator Action:** **HALT ALL MIGRATION ACTIVITY.** Review Sections 4, 5B, 6, 7, and 8 to identify the drift.

---

### 6. `VERIFICATION_INCONCLUSIVE` (Anomalous State)
* **Catalog Evidence:**
  - Catalog metrics returned unclassified or contradictory counts.
* **Operator Action:** **HALT ALL MIGRATION ACTIVITY.** Conduct a manual DBA inspection.

---

## 4. HOW DRIZZLE MIGRATION LEDGER AUDIT WORKS (SECTION 2)

### Source Evidence:
- Drizzle Kit stores migration history in table `__drizzle_migrations` in schema `drizzle` (default in `neon-http/migrator.js`) or `public`.
- Migration 0005 parameters from `_journal.json`:
  - `tag: 0005_media_lifecycle`
  - `when / folderMillis: 1794935000000`
  - `expected sha256 hash: f58b5947ff7a42358429d4d259b5344d6588f2ed7747cb76ddb9b1d7a51b1921`

### Operator Protocol:
1. Run **Query 2A**.
   - If Query 2A returns 0 rows: The database operates in **Manual SQL Mode**. The ledger table does not exist. This is normal when migrations are applied directly in the SQL Editor. Physical catalog state governs.
   - If Query 2A returns schema `drizzle`: Run standalone **Query 2B**.
   - If Query 2A returns schema `public`: Run standalone **Query 2C**.
2. When running Query 2B or 2C, inspect `ledger_interpretation`:
   - If `MATCH: Migration 0005 confirmed in ledger`: The ledger confirms migration 0005. If Section 1 reported `MIGRATION_NOT_APPLIED` or `MIGRATION_PARTIALLY_APPLIED`, this is a **`MIGRATION_TRACKING_MISMATCH`**. **HALT** and investigate why the ledger contains a record whose DDL is missing.
   - If migration 0005 is absent from the ledger, but migrations 0000–0004 are present: The ledger accurately reflects that migration 0005 has not yet been applied by the CLI. Safe to proceed if Section 1 is `MIGRATION_NOT_APPLIED`.

---

## 5. STRICT OPERATOR RECOVERY PROTOCOL

> [!CAUTION]
> **DO NOT AUTOMATICALLY RESTORE THE DATABASE TO THE SNAPSHOT UPON DETECTING A PARTIAL MIGRATION.**  
> A snapshot is a disaster recovery safeguard, NOT permission to discard newer production data. If customer orders, account updates, or inventory transactions occurred after the snapshot timestamp (`2026-11-21 10:32:53 UTC`), restoring to the snapshot will permanently destroy that live data.

### Mandatory Recovery Procedure:
1. **Stop Migration Activity:** Immediately halt any script execution. Do not attempt blind re-execution of DDL.
2. **Preserve Current State:** Do not drop tables, alter schema, or truncate any relations.
3. **Inspect Actual State:** Run Sections 3 through 9 of the verification script to document exactly which objects exist and their structural state.
4. **Audit Data Mutation:** Check existing core tables (`orders`, `users`, `products`, `stock_reservations`) to determine whether any live production transactions occurred after `2026-11-21 10:32:53 UTC`.
5. **Formulate a Reviewed Plan:**
   - If no live transactions occurred AND an aborted migration left broken schema: A snapshot restore may be considered, but **only with explicit DBA authorization**.
   - If live data exists: A forward-fix SQL patch must be authored and reviewed to safely drop or align only the uncommitted migration 0005 objects without touching application tables.
6. **Authorization Required:** Require explicit authorization from the lead operator before executing any restore or manual cleanup.

---

## 6. FINAL VERDICT

**`READY FOR READ-ONLY OPERATOR REVIEW`**
