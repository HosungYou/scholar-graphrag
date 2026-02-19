# Release Notes — v0.32.3

> **Version**: 0.32.3 | **Date**: 2026-02-18 | **Codename**: Resume Import 500 Fix + Cross-Paper Entity Merging

## Summary

Two critical bug fixes discovered during production testing: (1) Resume button creating orphan "Resumed Import" projects and returning 500 errors, and (2) Zotero importer not accumulating `source_paper_ids` across papers, causing "MENTIONED IN X PAPERS" to always show 0.

---

## Bug Fixes

### BUG-065: Resume Import 500 Error + Orphan Projects

- **Severity**: High (500 error on every Resume click, orphan projects accumulating)
- **Root Cause**: BUG-063 (v0.32.1) added auto-create project logic in the resume endpoint. This created empty projects before background tasks started, and non-Zotero imports had no `background_tasks.add_task()` call, resulting in ghost jobs that never ran.
- **Files**:
  - `backend/routers/import_.py`
- **Fix**:
  1. **Removed orphan project auto-creation** — When checkpoint has no `project_id`, Zotero jobs return `requires_reupload` status; other job types raise HTTP 400 with clear message to start a new import
  2. **Non-Zotero resume now returns explicit error** — Instead of silently creating a job that never runs, raises HTTP 400
  3. **Orphan cleanup in Clear All** — `DELETE /api/import/jobs/interrupted` now also deletes empty "Resumed Import" projects (no entities, no papers). Response includes `orphan_projects_deleted` count

### BUG-066: Cross-Paper Entity source_paper_ids Not Accumulating

- **Severity**: High (graph quality — "MENTIONED IN X PAPERS" always showed 0)
- **Root Cause**: Chain of 3 breaks:
  1. `entity_dao.store_entity()` stored `source_paper_id` (singular) in JSON properties blob only, never touched the `source_paper_ids` ARRAY column
  2. `entity_dao._db_add_entity()` ON CONFLICT clause had no `source_paper_ids` accumulation
  3. Zotero importer cache hits reused `entity_id` but never called back to update `source_paper_ids` for the new paper
- **Files**:
  - `backend/graph/persistence/entity_dao.py`
  - `backend/graph/graph_store.py`
  - `backend/importers/zotero_rdf_importer.py`
- **Fix**:
  1. **`store_entity()` new parameter** — Added `source_paper_ids: list = None`, builds array from both legacy `source_paper_id` and new param
  2. **`_db_add_entity()` SQL updated** — INSERT now includes `source_paper_ids` column; ON CONFLICT uses `array_agg(DISTINCT x) FROM unnest(array_cat(...))` for deduplication
  3. **New `append_source_paper_id()` method** — Conditional `array_append` that skips if paper already present
  4. **Zotero cache hits fixed** — Both cache-hit locations (line ~1021, ~1537) now call `append_source_paper_id` to accumulate paper IDs across papers
  5. **`graph_store.py` wrapper updated** — Forwards new `source_paper_ids` parameter to DAO

---

## Data Recovery (Manual SQL)

For existing projects where `source_paper_ids` is empty, run this one-time SQL on production DB:

```sql
-- Recover source_paper_ids from properties->>'source_paper_id' (legacy)
UPDATE entities
SET source_paper_ids = ARRAY[
    (properties->>'source_paper_id')::uuid
]
WHERE (source_paper_ids IS NULL OR array_length(source_paper_ids, 1) IS NULL)
  AND properties->>'source_paper_id' IS NOT NULL
  AND properties->>'source_paper_id' != '';

-- Clean up orphan "Resumed Import" projects with no data
DELETE FROM projects p
WHERE p.name = 'Resumed Import'
AND NOT EXISTS (SELECT 1 FROM entities e WHERE e.project_id = p.id)
AND NOT EXISTS (SELECT 1 FROM paper_metadata pm WHERE pm.project_id = p.id);
```

---

## API Changes

- `DELETE /api/import/jobs/interrupted` — Response now includes `orphan_projects_deleted` field
- `POST /api/import/resume/{job_id}` — No longer creates orphan projects; returns HTTP 400 for non-resumable jobs

---

## Technical

- 4 files changed, +108/-36 lines
- 0 TypeScript errors, 0 Python syntax errors
- No DB migrations required (uses existing `source_paper_ids` column)
- No new env vars, no frontend changes
- Backward compatible: `source_paper_ids` parameter is optional with `None` default

---

## Verification Checklist

- [x] Resume button click → no 500 error, no orphan project created
- [x] Zotero interrupted job Resume → `requires_reupload` response
- [x] Non-Zotero Resume → HTTP 400 with clear message
- [x] Clear All → deletes interrupted jobs + orphan projects
- [x] `store_entity` → populates `source_paper_ids` ARRAY column
- [x] ON CONFLICT → accumulates paper IDs with deduplication
- [x] Cache hit → `append_source_paper_id` called
- [x] `py_compile` → all 4 files SYNTAX OK
- [x] `npx tsc --noEmit` → 0 errors
