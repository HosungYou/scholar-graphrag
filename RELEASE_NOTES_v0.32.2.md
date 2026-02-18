# Release Notes — v0.32.2

> **Version**: 0.32.2 | **Date**: 2026-02-18 | **Codename**: Zotero Resume + Import Speed

## Summary

Two targeted improvements to the Zotero import workflow: a proper file re-upload resume flow for interrupted imports, and a ~10 minute speed improvement for 150-paper imports via rate limiter tuning and LLM call reduction.

---

## Bug Fixes

### BUG-064: Zotero Import Resume with File Re-upload

- **Severity**: High (import workflow blocked)
- **Files**:
  - `backend/routers/import_.py`
  - `frontend/app/import/page.tsx`
  - `frontend/app/projects/page.tsx`
  - `frontend/components/import/ImportProgress.tsx`
  - `frontend/lib/api.ts`
  - `frontend/types/graph.ts`

**What happened**: When a Zotero import is interrupted (e.g., server restart), uploaded files are lost from the temp filesystem. The resume endpoint previously hard-blocked with HTTP 400 "Zotero import resume requires re-uploading files", giving users no path to continue without starting over.

**Fix**:
- Backend now accepts a `resume_job_id` query parameter on the `POST /api/import/zotero` endpoint. When provided, it loads the checkpoint from the old job and passes `skip_paper_ids` to the background task so already-processed papers are skipped.
- The resume endpoint (`POST /api/import/resume/{job_id}`) now returns a `requires_reupload` status response instead of a hard HTTP 400 for Zotero jobs where files must be re-provided.
- Frontend detects the `requires_reupload` status and redirects to `/import?resume_job_id=<id>&method=zotero`, displaying a resume banner that explains already-processed papers will be skipped.
- Added `job_type` field to `ImportJobResponse` to enable correct routing logic on the frontend.

**Commits**: 5c91c20

---

## Performance Improvements

### PERF-013: Import Speed Improvement (~10 min saved for 150 papers)

- **Severity**: Medium (performance)
- **Files**:
  - `backend/llm/groq_provider.py`
  - `backend/importers/zotero_rdf_importer.py`

**Root cause**: The Groq rate limiter was set to 20 RPM (3-second intervals), creating a 15-minute floor for 300 LLM calls. Each paper required 2 LLM calls: one for entity extraction and one for resolution confirmation.

**Fix 1 — Rate limiter raised to 28 RPM**: Groq free tier allows up to 30 RPM. Raised the `AsyncRateLimiter` from 20 to 28 RPM, reducing the mandatory inter-call delay from 3.0s to ~2.1s. Estimated savings: ~2.5 minutes for 150 papers.

**Fix 2 — LLM entity resolution confirmation disabled during import**: Set `use_llm_confirmation=False` in the Zotero importer. String-based resolution (Jaccard similarity + SequenceMatcher at 0.95 threshold) continues to handle duplicate detection. This eliminates the second LLM call per paper. Estimated savings: ~7.5 minutes for 150 papers.

**Estimated new import time**: 5–10 minutes for 150 papers (down from 15–20 minutes).

**Commits**: d5fa7f9

---

## API Changes

### Modified Endpoints

**`POST /api/import/zotero`** — New optional query parameter:
- `resume_job_id` (string, optional): When provided, loads checkpoint from the specified job ID and passes `skip_paper_ids` to the background task. Allows re-uploading files to resume an interrupted Zotero import without reprocessing already-completed papers.

**`POST /api/import/resume/{job_id}`** — Changed behavior for Zotero jobs:
- Previously: returned HTTP 400 with "Zotero import resume requires re-uploading files"
- Now: returns HTTP 200 with `{ "status": "requires_reupload", "job_id": "...", "resume_job_id": "..." }` so the frontend can redirect the user to the re-upload flow gracefully.

**`GET /api/import/jobs`** — Response schema change:
- `ImportJobResponse` now includes a `job_type` field (string) indicating the type of import job (e.g., `"zotero_import"`, `"pdf_import"`, `"pdf_import_multiple"`). Used by the frontend to determine the correct resume routing path.

---

## Technical

- **9 files changed**, +110/-18 lines
- 0 TypeScript errors, 0 Python errors
- No DB migrations required
- No new environment variables
- Backward compatible: `resume_job_id` param is optional; existing Zotero imports unaffected
- `use_llm_confirmation=False` affects import-time deduplication only; post-import graph operations unchanged
