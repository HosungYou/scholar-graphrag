# Release Notes — v0.32.0

> **Version**: 0.32.0
> **Date**: 2026-02-18
> **Codename**: Production Hardening + International UI

## Overview

v0.32.0 addresses critical production bugs discovered in v0.31.0 testing: remaining 500 errors from unsafe float casts, broken project isolation in importers, server API key leakage, and Korean-only UI strings. Additionally improves Gap View UX with corrected progress bars, enlarged FrontierMatrix, differentiated scoring formulas, and automatic paper recommendations.

---

## Phase 1: 500 Error Complete Fix

### BUG-056: Unsafe Python `float()` Casts (13 locations)
- **Location**: `backend/routers/graph.py` — 13 call sites
- **Problem**: v0.31.0 fixed SQL-level casts but left Python-level `float()` calls unguarded. Empty strings, None, or non-numeric values from JSONB properties cause `ValueError` → 500
- **Fix**: Added `_safe_float(val, default=0.0)` helper. Replaced all bare `float()` calls:
  - Centrality metrics: `degree_centrality`, `betweenness_centrality`, `pagerank` (lines ~1250-1252)
  - Bridge confidence: `float(props.get("confidence", ...))` (line ~2302)
  - Gap strength: `float(gap_row["gap_strength"] or 0.0)` (lines ~2344, ~5266)
  - Top entities pagerank: `float(_parse_json_field(...))` (line ~5214)
  - Weight fields: 4 visualization query locations (lines ~2858, ~3151, ~3419, ~5133)

### BUG-057: SQL Weight Cast Without Guard
- **Location**: `backend/routers/graph.py:5103`
- **Problem**: `COALESCE((properties->>'weight')::float, 1.0)` fails when weight value is non-numeric string
- **Fix**: Added regex guard: `CASE WHEN properties->>'weight' ~ '^-?\d+(\.\d+)?$' THEN ... ELSE NULL END`

### BUG-058: ARRAY_AGG Includes NULL Names
- **Location**: `backend/routers/graph.py` — timeline queries (lines ~3982, ~4006)
- **Problem**: `ARRAY_AGG(name ...)` could include NULL entity names in top_names arrays
- **Fix**: Added `FILTER (WHERE name IS NOT NULL)` to both ARRAY_AGG calls

---

## Phase 2: Project Isolation Fix

### BUG-059: Importers Missing owner_id
- **Problem**: 5 out of 6 `INSERT INTO projects` statements across importers did not include `owner_id`, causing all imported projects to be visible to every user
- **Fix**: Added `owner_id` parameter to all importer constructors and INSERT queries:

| File | Change |
|------|--------|
| `importers/scholarag_importer.py` | `owner_id` constructor param + INSERT column |
| `importers/pdf_importer.py` | `owner_id` in both single and batch INSERT |
| `importers/tto_sample_importer.py` | `owner_id` constructor param + INSERT column |
| `importers/zotero_rdf_importer.py` | `owner_id` passed through to graph_store |
| `graph/persistence/entity_dao.py` | `owner_id` param in `create_project()` + INSERT |
| `routers/import_.py` | `owner_id=user_id` at all 5 importer creation sites |

### BUG-060: NULL Projects Visible to All Users
- **Location**: `backend/routers/projects.py` — lines 45, 151
- **Problem**: `OR p.owner_id IS NULL` in both `check_project_access()` and project listing allowed unowned projects to appear for all users
- **Fix**: Removed both `OR p.owner_id IS NULL` clauses

---

## Phase 3: Settings Isolation

### BUG-061: Server API Key Leakage
- **Location**: `backend/routers/settings.py` — lines 144-153
- **Problem**: Server-configured API keys (Groq, etc.) were shown with masked values to all users via the settings endpoint, revealing that server keys exist and their partial content
- **Fix**: Server keys now return `is_set=False, masked_key="", source="not_configured"`. Backend fallback still works transparently — users just don't see server keys in the UI

---

## Phase 4: English UI

### Frontend (7 files)

| File | Strings Translated |
|------|-------------------|
| `GapPanel.tsx` | 12 strings: opportunity ratings (Very High/High/Moderate/Low/Very Low), description, gap explanation, section headers (Bridge Concepts, AI Research Questions, Related Papers, Find Papers, Cluster A/B, Concept Clusters) |
| `GapsViewMode.tsx` | 3 strings: bridges, Bridge Concepts, Inactive Nodes |
| `FrontierMatrix.tsx` | 6 strings: Quick Win, Ambitious, Safe Start, Low Priority, Feasibility, Impact |
| `BridgeStoryline.tsx` | 1 string: Similarity |
| `KnowledgeGraph3D.tsx` | 3 strings: Paper Fit Analysis, Temporal View, Research Summary |
| `InsightHUD.tsx` | 8 strings: all tooltip texts (silhouette, coherence, coverage, type diversity, paper coverage, entities/paper, cross-paper) + dual-language modularity matching |
| `PaperFitPanel.tsx` | 5 strings: Analyze, Matched Entities, Community Relevance, Gap Connections, Summary |

### Backend (2 files)

| File | Change |
|------|--------|
| `graph/centrality_analyzer.py` | `강함/보통/약함/없음` → `Strong/Moderate/Weak/N/A` |
| `routers/graph.py` | Research significance template + cluster label fallbacks → English |

---

## Phase 5: Gap View UX

### 5.1 Progress Bar Inversion
- **File**: `GapPanel.tsx:603`
- **Problem**: Progress bar showed `gap_strength` directly — but gap_strength=1.0 means well-connected (low opportunity). Higher bar incorrectly suggested more opportunity
- **Fix**: Inverted to `(1 - gap_strength)`. Now: full amber bar = high opportunity, empty bar = low opportunity. Color gradient also inverted accordingly

### 5.2 FrontierMatrix Size Increase
- **File**: `FrontierMatrix.tsx`
- **Changes**:
  - Canvas: 280×220 → 420×340 (plot area: 200×140 → 340×260)
  - Dot radius: 5/7 → 7/10 (normal/selected)
  - Selection ring: r=10 → r=14
  - Quadrant labels: 8px → 10px
  - Axis labels: 9px → 10px

### 5.3 Score Differentiation
- **File**: `backend/routers/graph.py` — scoring block (lines ~1192-1209)
- **Problem**: All gaps received similar scores due to linear size ratio and 2-factor formulas
- **Fix**: Multi-factor scoring with centrality awareness:

**Impact Score** (4 factors):
```
raw_impact = size_ratio^0.5 × 0.25 + bridge_factor × 0.25 + centrality_factor × 0.3 + type_diversity × 0.2
```
- `size_ratio^0.5`: Non-linear scaling dampens large cluster dominance
- `centrality_factor`: Average PageRank of cluster concepts
- `type_diversity`: Unique entity types in bridge candidates / 8

**Feasibility Score** (5 factors):
```
raw_feasibility = sim_ratio × 0.25 + median_sim × 0.2 + bridge_avail × 0.2 + gap_weakness × 0.15 + sim_spread × 0.2
```
- `median_sim`: Median similarity of potential edges (more robust than ratio)
- `sim_spread`: Similarity distribution variance (higher = more differentiation)

---

## Phase 6: View Strategy + S2 Integration

### 6.4 Auto-Fetch Papers on Gap Expansion
- **File**: `GapPanel.tsx`
- **Change**: Added `useEffect` on `expandedGapId` that automatically triggers S2 paper recommendation fetch when a gap card is expanded and papers haven't been cached yet
- **Behavior**: Users no longer need to click "Find Papers" — recommendations load automatically on card open

### 6.5 Research Significance English Template
- **File**: `backend/routers/graph.py:1228`
- **Change**: Korean template replaced with English: `"Unexplored connection between {A} and {B} presents a new interdisciplinary research opportunity."`
- **Note**: LLM-based batch generation deferred as future enhancement

---

## Files Changed

| File | Action | Phase |
|------|--------|-------|
| `backend/routers/graph.py` | MODIFIED | 1, 4, 5.3, 6.5 |
| `backend/routers/projects.py` | MODIFIED | 2 |
| `backend/routers/import_.py` | MODIFIED | 2 |
| `backend/routers/settings.py` | MODIFIED | 3 |
| `backend/importers/scholarag_importer.py` | MODIFIED | 2 |
| `backend/importers/pdf_importer.py` | MODIFIED | 2 |
| `backend/importers/tto_sample_importer.py` | MODIFIED | 2 |
| `backend/importers/zotero_rdf_importer.py` | MODIFIED | 2 |
| `backend/graph/persistence/entity_dao.py` | MODIFIED | 2 |
| `backend/graph/graph_store.py` | MODIFIED | 2 |
| `backend/graph/centrality_analyzer.py` | MODIFIED | 4 |
| `frontend/components/graph/GapPanel.tsx` | MODIFIED | 4, 5.1, 6.4 |
| `frontend/components/graph/GapsViewMode.tsx` | MODIFIED | 4 |
| `frontend/components/graph/FrontierMatrix.tsx` | MODIFIED | 4, 5.2 |
| `frontend/components/graph/BridgeStoryline.tsx` | MODIFIED | 4 |
| `frontend/components/graph/KnowledgeGraph3D.tsx` | MODIFIED | 4 |
| `frontend/components/graph/InsightHUD.tsx` | MODIFIED | 4 |
| `frontend/components/graph/PaperFitPanel.tsx` | MODIFIED | 4 |

**Total**: 19 files (18 modified + tsconfig), +201/-102 lines

---

## Technical Details

- **TypeScript**: 0 errors (`npx tsc --noEmit`)
- **Python**: 0 compilation errors (`py_compile` on all 11 backend files)
- **Database**: No migrations required
- **Environment Variables**: No new variables
- **Breaking Changes**: None — `owner_id IS NULL` projects become hidden until assigned an owner

---

## API Changes

### Modified Behavior: `GET /api/settings/api-keys`
- Server-configured keys now return `is_set: false, source: "not_configured"` instead of `is_set: true, source: "server"` with masked key

### Modified Behavior: `GET /api/projects`
- Projects with `owner_id = NULL` are no longer listed (previously visible to all users)

### Modified Response: `GET /api/graph/gaps/{project_id}/analysis`
- `research_significance` now in English instead of Korean
- Impact/feasibility scores use improved multi-factor formulas (values will differ from v0.31.0)

### Modified Response: `GET /api/graph/metrics/{project_id}`
- `modularity_interpretation` now returns `"Strong"/"Moderate"/"Weak"/"N/A"` instead of Korean `"강함"/"보통"/"약함"/"없음"`

---

## Upgrade Notes

- No migration needed
- No environment variable changes
- Existing projects imported without `owner_id` will be hidden from project listings until an owner is assigned via direct DB update: `UPDATE projects SET owner_id = '<user-uuid>' WHERE owner_id IS NULL`
- Frontend InsightHUD handles both Korean and English modularity values for backward compatibility during rollout
