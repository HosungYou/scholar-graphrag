# Release Notes — v0.32.1

> **Version**: 0.32.1
> **Date**: 2026-02-18
> **Codename**: Critical Hotfix — Project Visibility + Import Resume

## Overview

v0.32.1 is a critical hotfix addressing two regressions introduced in v0.32.0:

1. **All pre-existing projects disappeared** after deploying BUG-060 fix
2. **Import resume fails** with "Checkpoint is missing project_id" when import was interrupted before project creation

---

## Root Cause Analysis

### BUG-062: Projects Disappeared After v0.32.0 Deploy

- **Severity**: Critical (data access loss)
- **Introduced by**: v0.32.0 Phase 2 (BUG-060)
- **Location**: `backend/routers/projects.py` — lines 45, 150

**What happened**:
v0.32.0's BUG-060 fix removed `OR p.owner_id IS NULL` from both `check_project_access()` and `list_projects()` queries. This was intended to prevent unowned projects from being visible to all users.

**Why it broke**:
ALL pre-existing projects imported before v0.32.0 had `owner_id = NULL` because the importers didn't set `owner_id` (BUG-059). Removing the NULL check immediately hid every existing project for all users.

**The flawed assumption**: BUG-060 assumed all existing projects already had `owner_id` set. In reality, BUG-059 (importers missing `owner_id`) meant 100% of imported projects had `owner_id = NULL`.

**Lesson learned**: When tightening access controls, always check existing data state. BUG-059 (cause) should have been deployed and data migrated BEFORE BUG-060 (consequence) was applied.

**Fix**: Restored `OR p.owner_id IS NULL` in both queries + added auto-claim mechanism:
- When a user lists projects, any orphaned projects (`owner_id IS NULL`) are automatically claimed by that user via `UPDATE projects SET owner_id = $1 WHERE id = ANY($2) AND owner_id IS NULL`
- After the first page load, the project permanently belongs to the user
- This provides gradual migration without manual DB intervention

### BUG-063: Import Resume Fails — "Checkpoint is missing project_id"

- **Severity**: High (import workflow blocked)
- **Location**: `backend/routers/import_.py` — line 2360

**What happened**:
When an import is interrupted (e.g., server restart during deployment) before the project is created in the database, the checkpoint is saved with `project_id: None`. The resume endpoint previously rejected this state with a 400 error, making it impossible to resume.

**Why it broke**:
The resume validation at line 2360 assumed all checkpoints would have a valid `project_id`. However, checkpoints are saved after each paper is processed, and if the server restarts during the early import phase (validation, scanning, project creation), the checkpoint exists but the project hasn't been created yet.

**Fix**: Instead of rejecting the resume, the endpoint now:
1. Detects missing `project_id` in checkpoint
2. Creates a new project using `project_name` from the original job metadata
3. Sets `owner_id` from the current authenticated user
4. Updates the checkpoint with the new `project_id`
5. Continues the normal resume flow

Also fixed `get_resume_info` endpoint: `can_resume` now returns `true` when a checkpoint exists (regardless of `project_id` presence), since the resume endpoint will create a project if needed.

---

## Deployment Safety Checklist (New Protocol)

> **CRITICAL**: This checklist MUST be followed for any access control changes.

### Before Deploying Access Control Changes

```
□ 1. DATA AUDIT: Query existing data to understand current state
     Example: SELECT COUNT(*) FROM projects WHERE owner_id IS NULL
□ 2. MIGRATION FIRST: If data needs updating, deploy migration BEFORE restriction
     Example: Deploy owner_id propagation (BUG-059) → verify all projects have owners → THEN remove NULL access
□ 3. GRADUAL ROLLOUT: Use auto-migration patterns instead of hard cuts
     Example: Auto-claim on list (v0.32.1) instead of immediate hide (v0.32.0)
□ 4. ROLLBACK PLAN: Ensure the change can be reverted without data loss
     Example: Adding a WHERE clause is reversible; deleting data is not
□ 5. VERIFICATION: After deploy, immediately verify:
     - Existing data is still accessible
     - New data follows the new rules
     - Edge cases (NULL, empty, migration-in-progress) are handled
```

### Import Resume Safety

```
□ 1. Checkpoint should never block resume — create missing resources on demand
□ 2. Test resume after server restart at every import stage:
     - Before project creation
     - During paper processing
     - During relationship building
□ 3. Avoid deploying during active imports (INFRA-006 principle)
```

---

## Files Changed

| File | Action | Bug |
|------|--------|-----|
| `backend/routers/projects.py` | MODIFIED | BUG-062 |
| `backend/routers/import_.py` | MODIFIED | BUG-063 |

**Total**: 2 files, +40/-9 lines

---

## Technical Details

- **TypeScript**: No frontend changes
- **Python**: 0 compilation errors
- **Database**: No migrations required
- **Environment Variables**: No new variables
- **Breaking Changes**: None — behavior restored to pre-v0.32.0 for existing projects

---

## API Changes

### Modified Behavior: `GET /api/projects`
- Projects with `owner_id = NULL` are visible again (restored from v0.32.0 removal)
- **New**: Orphaned projects are automatically claimed by the requesting user on first list
- After auto-claim, projects appear under the user's ownership permanently

### Modified Behavior: `POST /api/import/resume/{job_id}`
- No longer returns 400 when checkpoint is missing `project_id`
- **New**: Automatically creates a project using original job metadata when `project_id` is missing
- Resume info endpoint (`GET /api/import/resume/{job_id}/info`) now shows `can_resume: true` for any checkpoint

---

## Upgrade Notes

- Deploy immediately — no migration needed
- Projects will auto-claim on first page load (no manual DB intervention required)
- Interrupted imports from v0.32.0 deploy can now be resumed
- The v0.32.0 release notes entry for BUG-060 ("Removed both `OR p.owner_id IS NULL` clauses") is superseded by this hotfix

---

## Commits

| Hash | Message |
|------|---------|
| `d00d94d` | `hotfix: restore orphaned project visibility with auto-claim` |
| `9669726` | `hotfix: allow import resume when checkpoint missing project_id` |
