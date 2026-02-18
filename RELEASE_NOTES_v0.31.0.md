# Release Notes — v0.31.0

> **Version**: 0.31.0
> **Date**: 2026-02-18
> **Codename**: Research Frontier Explorer

## Overview

v0.31.0 fixes critical 500 errors in the Temporal and Summary endpoints, then redesigns the Gaps View into a comprehensive "Research Frontier Explorer" that helps researchers identify, evaluate, and act on research opportunities.

---

## Phase 1: Backend 500 Error Fixes

### BUG-053: Summary UUID→String Conversion
- **Location**: `backend/routers/graph.py:5087`
- **Problem**: `node_ids=r["concepts"] or []` passed UUID objects where strings were expected, causing `compute_graph_metrics()` to fail with type comparison errors
- **Fix**: `node_ids=[str(c) for c in (r["concepts"] or [])]`

### BUG-054: Unsafe PageRank Float Cast (3 locations)
- **Location**: Lines 5150, 5241, 1187
- **Problem**: `ORDER BY (properties->>'centrality_pagerank')::float` fails with "invalid input syntax" when the JSON value is empty string or non-numeric
- **Fix**: Added regex guard pattern:
  ```sql
  ORDER BY CASE WHEN properties->>'centrality_pagerank' ~ '^-?\d+(\.\d+)?$'
                THEN (properties->>'centrality_pagerank')::float
                ELSE 0 END DESC NULLS LAST
  ```

### BUG-055: Temporal Section Crashes Summary
- **Location**: Lines 5218-5247
- **Problem**: If temporal queries fail (e.g., no `first_seen_year` column or data issues), the entire summary endpoint returns 500
- **Fix**: Wrapped temporal section in try/except with graceful defaults (`min_year=None`, `max_year=None`, `emerging_concepts=[]`)

---

## Phase 2: Research Frontier Redesign

### 2.1 Rebranding + Localization
- "Structural Gaps" → "Research Frontiers" across all UI surfaces
- Korean labels: 연결 개념, AI 연구 질문, 관련 논문, 개념 클러스터, 논문 검색
- Legend: "Potential connections" → "Opportunity Connections" + new "Established Links" item
- Star rating: ★★★★★ 매우 높음 ~ ★☆☆☆☆ 매우 낮음

### 2.2 Impact × Feasibility Matrix
- **Component**: `FrontierMatrix.tsx`
- 2×2 SVG scatter plot showing each frontier's impact vs. feasibility
- Quadrant labels (Korean):
  - ⭐ 즉시 착수 (High Impact + High Feasibility)
  - 🔬 도전적 연구 (High Impact + Low Feasibility)
  - ✅ 안전한 시작 (Low Impact + High Feasibility)
  - ⏳ 낮은 우선순위 (Low Impact + Low Feasibility)
- Click a dot to select the frontier

### 2.3 Bridge Storyline
- **Component**: `BridgeStoryline.tsx`
- Horizontal 3-card flow: Cluster A → Bridge Concept → Cluster B
- Each card shows cluster name, top 3 concepts, and color accent
- Bridge card shows candidate names and average cosine similarity

### 2.4 Enhanced Frontier Cards
- Research significance text (auto-generated Korean)
- 1-line "why this is a research opportunity" explanation per card
- Star-based opportunity rating instead of raw percentage

### 2.5 Backend Score Computation
- **Impact Score** (0-1): `cluster_size_product × 0.6 + bridge_factor × 0.4`
- **Feasibility Score** (0-1): `similarity_ratio × 0.5 + bridge_availability × 0.3 + gap_openness × 0.2`
- **Quadrant**: Derived from impact ≥ 0.5 and feasibility ≥ 0.5 thresholds
- **Research Significance**: Auto-generated Korean text from cluster names

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `backend/routers/graph.py` | MODIFIED | +118/-0 |
| `frontend/types/graph.ts` | MODIFIED | +5/-0 |
| `frontend/components/graph/GapsViewMode.tsx` | MODIFIED | +28/-0 |
| `frontend/components/graph/GapPanel.tsx` | MODIFIED | +97/-0 |
| `frontend/components/graph/FrontierMatrix.tsx` | NEW | +140 |
| `frontend/components/graph/BridgeStoryline.tsx` | NEW | +165 |

**Total**: 7 files (5 modified + 2 new), +453/-61 lines

---

## Technical Details

- **TypeScript**: 0 errors (`npx tsc --noEmit`)
- **Python**: 0 compilation errors
- **Database**: No migrations required
- **Environment Variables**: No new variables
- **Breaking Changes**: None — all new fields have defaults

---

## API Changes

### Modified Response: `GET /api/graph/gaps/{project_id}/analysis`

`StructuralGapResponse` now includes:
```json
{
  "impact_score": 0.72,
  "feasibility_score": 0.58,
  "research_significance": "Machine Learning과(와) Education 사이의 미탐구 연결은 새로운 학제간 연구 기회를 제시합니다.",
  "quadrant": "high_impact_high_feasibility"
}
```

### Fixed Endpoints (500 → 200)
- `GET /api/graph/temporal/{project_id}/trends`
- `GET /api/graph/temporal/{project_id}/timeline`
- `GET /api/graph/summary/{project_id}`

---

## Upgrade Notes

- No migration needed
- No environment variable changes
- Backward compatible — existing gap analysis consumers will see new fields with sensible defaults
- Frontend automatically renders new components when scores are available
