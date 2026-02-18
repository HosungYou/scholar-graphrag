# Release Notes v0.30.1

> **Version**: 0.30.1 | **Date**: 2026-02-18
> **Codename**: Insight HUD Accuracy Fix + First-Entry Race Condition

## Overview

Critical bugfix release addressing three issues that caused Insight HUD metrics to display incorrect values and a race condition that showed "No graph data available" on first project entry.

---

## Bug Fixes

### BUG-050: Paper Coverage SQL Type Error (P0)

**Problem**: The paper coverage query in `GET /api/graph/metrics/{project_id}` used `pm.id::text = ANY(e.source_paper_ids)`, comparing `text` against `uuid[]`. PostgreSQL raised a type error, caught silently by `try/except`, causing `paper_coverage` to always report **0%**.

**Actual value**: 82.4% (28/34 papers have at least one extracted entity)

**Fix**: Changed to `pm.id = ANY(e.source_paper_ids)` for proper UUID-to-UUID comparison.

**File**: `backend/routers/graph.py:3207`

### BUG-051: UUID/String Type Mismatch in Cluster Metrics (P0)

**Problem**: The `concept_clusters.concepts` column stores `UUID[]` values. When the metrics and diversity endpoints read cluster data, they passed raw UUID objects as `node_ids`. However, graph nodes were built with `str(row["id"])` (string). When NetworkX computed modularity via `set(UUID).intersection(set(string))`, the result was always an empty set, causing:

- **Modularity**: 0 (should be ~0.60)
- **Silhouette Score**: 0 or incorrect
- **Cluster Coherence**: 0 or incorrect
- **Cluster Coverage**: 0 (should be ~100%)
- **Diversity Gauge**: incorrect entropy and rating

**Fix**: Added `[str(c) for c in (row["concepts"] or [])]` conversion in both endpoints:
- `GET /api/graph/metrics/{project_id}` (line 3107)
- `GET /api/graph/diversity/{project_id}` (line 2974)

**Files**: `backend/routers/graph.py:2974,3107`

### BUG-052: "No graph data available" Race Condition on First Entry (P0)

**Problem**: `useGraphStore` initialized with `isLoading: false` and `graphData: null`. On first project entry, the component rendered before `useEffect` triggered `fetchGraphData`, resulting in a frame where `isLoading=false` + `graphData=null` → "No graph data available" displayed instead of a loading spinner.

Going back and returning fixed it because the zustand in-memory store retained `graphData` from the first visit.

**Fix**: Changed `isLoading` initial value from `false` to `true` so the loading spinner shows until the first fetch completes.

**File**: `frontend/hooks/useGraphStore.ts:129`

---

## Technical Details

| Metric | Before Fix | After Fix |
|--------|-----------|-----------|
| Paper Coverage | 0% (SQL type error) | 82.4% |
| Modularity | 0 (UUID mismatch) | ~0.60 (computed correctly) |
| Silhouette | 0 or incorrect | Computed from embeddings |
| Coherence | 0 or incorrect | Avg pairwise cosine sim |
| Coverage | 0 (UUID mismatch) | ~100% |
| Diversity Gauge | Incorrect | Correct entropy/rating |
| First Entry | "No graph data available" | Loading spinner |

### Files Changed
- `backend/routers/graph.py` — 3 lines changed (SQL fix + 2x UUID→str conversion)
- `frontend/hooks/useGraphStore.ts` — 1 line changed (isLoading initial value)

### Impact
- 0 TypeScript errors
- 0 Python syntax errors
- No database migrations required
- No new environment variables
- No breaking changes
- Backward compatible
