# ScholaRAG_Graph v0.29.0 Release Notes

> **Version**: 0.29.0 | **Date**: 2026-02-17
> **Type**: Security + Bug Fix Release

## Summary

Critical 4-issue production hotfix addressing authentication bypass, settings persistence failure, graph rendering TypeError, and Find Papers UUID search query bug.

---

## Security Fix

### Auth Enforcement (SEC-005)
- **Problem**: When `current_user is None`, all access control was skipped — any unauthenticated request could read all projects and cross-project data
- **Fix**: All endpoints now return **HTTP 401** when `current_user is None`:
  - `verify_project_access()` in `graph.py` — affects all graph, gap, temporal, citation, diversity endpoints
  - `list_projects`, `get_project`, `update_project`, `delete_project`, `get_project_stats` in `projects.py`
  - `search_nodes` in `graph.py` — no more unfiltered cross-project search
- **Impact**: With `REQUIRE_AUTH=True` on Render, `current_user` is always present for legitimate requests. The 401 defense prevents data leakage if auth middleware is bypassed or misconfigured.

---

## Bug Fixes

### Settings Save/Load (BUG-045)
- **Problem**: Semantic Scholar API key (and all user API keys) disappeared on page refresh
- **Root Cause**: `db.fetch_one()` method doesn't exist on the `Database` class — correct method is `db.fetchrow()`. Tests passed because mocks added a fake `fetch_one` method.
- **Fix**: `fetch_one()` → `fetchrow()` in 4 locations:
  - `backend/routers/settings.py` (lines 117, 177, 242)
  - `backend/llm/user_provider.py` (line 32)
- **Impact**: API key save/load restored, per-user LLM provider selection restored

### Graph TypeError (BUG-046)
- **Problem**: Console error `TypeError: Cannot read properties of undefined` from `computeLineDistances()` + intermittent "No Graph Data Available"
- **Root Cause**: `computeLineDistances()` called on `THREE.Line` with empty `BufferGeometry` (no position data yet) during `linkThreeObject` callback. The geometry gets populated later in `linkPositionUpdate`.
- **Fix**: Removed 3 `computeLineDistances()` calls in `linkThreeObject` for SAME_AS, BRIDGES_GAP, and ghost edges. The call in `linkPositionUpdate` (which has actual position data) is preserved.
- **Impact**: No more console TypeError, stable graph rendering

### Find Papers UUID Search (BUG-047)
- **Problem**: "Find Papers" for gaps intermittently returned 0 results from Semantic Scholar
- **Root Cause**: `gap_detector.find_bridge_candidates()` returns concept UUIDs (by design), which were stored as-is in `bridge_candidates` column. `_build_gap_recommendation_query()` then used these UUIDs as Semantic Scholar search terms (e.g., `"a1b2c3d4-e5f6-..."` instead of `"machine learning"`).
- **Fix** (two-layer):
  1. **Immediate**: `_build_gap_recommendation_query()` now filters UUID patterns via regex, falling back to cluster names
  2. **Future data**: Gap INSERT now resolves bridge concept UUIDs to concept names before storing
- **Impact**: Find Papers returns relevant results; existing gaps with UUID bridge_candidates are handled gracefully

---

## Files Changed

| File | Changes | Lines |
|------|---------|-------|
| `backend/routers/settings.py` | `fetch_one` → `fetchrow` (3x) | 3 |
| `backend/llm/user_provider.py` | `fetch_one` → `fetchrow` (1x) | 1 |
| `backend/routers/projects.py` | Auth enforcement (5 endpoints) | ~30 |
| `backend/routers/graph.py` | Auth enforcement + UUID filter + bridge name resolution | ~35 |
| `frontend/components/graph/Graph3D.tsx` | Remove 3 `computeLineDistances()` | 3 |

**Total**: 5 files, 74 insertions, 68 deletions

---

## Verification

| Check | Method | Expected |
|-------|--------|----------|
| Settings save | `/settings` → save S2 key → refresh | Key persists |
| Auth enforcement | Unauthenticated `GET /api/projects` | HTTP 401 |
| Graph rendering | Open project graph, check console | No `computeLineDistances` error |
| Find Papers | Select gap → Find Papers | Papers returned (not 0 results) |
| TypeScript | `npx tsc --noEmit` | 0 errors |
| Python | `py_compile` all 4 files | 0 errors |

---

## Deployment

- **Backend**: Auto-deploys via Render (push to `origin main`)
- **Frontend**: Auto-deploys via Vercel (push to `origin main`)
- **Database**: No migrations required
- **Environment**: No new env vars
- **Breaking Changes**: None (unauthenticated requests that previously leaked data now correctly return 401)
