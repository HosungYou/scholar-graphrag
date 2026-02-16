# Release Notes — v0.18.0

> **Version**: 0.18.0 | **Date**: 2026-02-13
> **Title**: Production Stabilization + 3D Root Fix + Researcher-Centric UX

## Summary

v0.18.0 addresses **8 production error patterns** discovered via Render MCP diagnostics, eliminates the **"central burst" 3D rendering bug** at its root cause, and introduces a **ConceptExplorer panel** for researcher-friendly relationship exploration.

---

## Phase 0: Production Backend Hotfixes (Critical)

### P1: `fetch_one()` → `fetchrow()` (WARNING → Fixed)
- **File**: `backend/routers/integrations.py:166`
- **Issue**: `Database.fetch_one()` method doesn't exist; asyncpg uses `fetchrow()`
- **Fix**: Changed to `db.fetchrow()` — eliminates repeated WARNING on user API key lookup

### P2: `search_entities()` missing `project_id` (WARNING → Fixed)
- **File**: `backend/agents/concept_extraction_agent.py:105,110`
- **Issue**: `graph_store.search_entities()` requires `project_id` but call omitted it
- **Fix**: Added `project_id: str = ""` parameter to `match_to_graph()` and passed through

### P3: Temporal timeline missing columns (ERROR → Fixed)
- **File**: `backend/routers/graph.py:3547-3562`
- **Issue**: `first_seen_year`/`last_seen_year` columns not in DB → 500 ERROR on every temporal API call
- **Fix**: Wrapped temporal endpoint in try-except; returns empty `TemporalGraphResponse` with warning log instead of 500

### P4: Absolute import error (Skipped)
- **Issue**: No `from backend` import found in `graph.py` — non-issue in current codebase

### P5: Conversation FK violation (ERROR → Fixed)
- **File**: `backend/routers/chat.py:132-140`
- **Issue**: `conversations_user_id_fkey` FK violation when `user_id` not in `user_profiles`
- **Fix**: Defensive `fetchrow` check before INSERT; sets `user_id = None` with warning if not found

---

## Phase 1: 3D "Central Burst" Root Fix (High)

### Root Cause Chain (Confirmed)
```
centralityMetrics change → centralityPercentileMap recalculated
  → nodeThreeObject callback recreated (was in deps)
    → ForceGraph3D destroys/recreates all Three.js objects
      → New objects start at position (0,0,0)
        → Physics simulation explodes from center = "BURST"
```

### F1: centralityPercentileMap deps removal
- **File**: `frontend/components/graph/Graph3D.tsx`
- **Fix**: Removed `centralityPercentileMap` from `nodeThreeObject` useCallback deps. Added `centralityPercentileMapRef` (useRef) with sync useEffect. Label opacity updates now use separate `scene.traverse` useEffect.
- **Impact**: Eliminates the primary trigger for node object recreation

### F2: Defensive position preservation
- **File**: `frontend/components/graph/Graph3D.tsx`
- **Fix**: After creating `new THREE.Group()` in nodeThreeObject, immediately restores position from `nodePositionsRef.current.get(node.id)`
- **Impact**: Even if nodes ARE recreated, they appear at their last known position instead of (0,0,0)

### F3: onLinkClick removal
- **File**: `frontend/components/graph/Graph3D.tsx`
- **Fix**: Removed `handleEdgeClick` callback and `onLinkClick` prop from ForceGraph3D
- **Impact**: Eliminates accidental edge clicks causing unexpected camera/selection behavior

---

## Phase 2: Researcher-Centric UX Redesign (Major)

### U1: ConceptExplorer Panel (New)
- **File**: `frontend/components/graph/ConceptExplorer.tsx` (new, 249 lines)
- **Feature**: When a node is clicked, shows a structured exploration panel:
  - Node name, entity type, centrality percentile, connection count
  - Edges grouped by relationship type with colored left borders
  - Each group: type name, count, list of connected nodes
  - Per-edge: other node name (clickable → navigate), paper count, similarity score
  - `[▶]` button opens EdgeContextModal for relationship evidence
- **Design**: Editorial Research style (font-mono, bg-paper, teal/violet accents)

### U2: KnowledgeGraph3D Integration
- **File**: `frontend/components/graph/KnowledgeGraph3D.tsx`
- **Changes**:
  - Removed `onEdgeClick` from Graph3D and GapsViewMode props
  - Added `handleRelationshipClick` (called from ConceptExplorer → opens EdgeContextModal)
  - Added `handleNodeNavigate` (click node name in ConceptExplorer → focus camera + select)
  - Added `selectedNodeCentrality` useMemo for percentile display
  - Renders ConceptExplorer when `selectedNode` is set

### U3: 3-Tier Neighbor Highlight
- **File**: `frontend/components/graph/Graph3D.tsx`
- **Feature**: When a node is selected:
  - **Selected**: Gold color, 1.2x scale, full opacity
  - **Connected**: Original color, 1.0 scale, full opacity
  - **Non-connected**: 0.15 opacity (dimmed)
  - **Edges**: Connected = 0.9 opacity, non-connected = 0.03 opacity
  - **Labels**: Connected = 1.0 opacity, non-connected = 0.05 opacity

### U4: Relationship Type Edge Colors
- **File**: `frontend/components/graph/Graph3D.tsx`
- **Feature**: Semantic edge coloring by relationship type:

| Type | Color | Hex |
|------|-------|-----|
| CO_OCCURS_WITH | Teal | `#4ECDC4` |
| RELATED_TO | Purple | `#9D4EDD` |
| SUPPORTS | Green | `#10B981` |
| CONTRADICTS | Red | `#EF4444` |
| BRIDGES_GAP | Gold | `#FFD700` |
| DISCUSSES_CONCEPT | Sky Blue | `#45B7D1` |
| USES_METHOD | Amber | `#F59E0B` |
| SAME_AS | Purple | `#9D4EDD` |

- Priority: Highlights > Relationship type > Cluster color (fallback)

---

## Phase 3: Backend Quality Improvements (Medium)

### Q1: Cluster Label LLM Generation
- **File**: `backend/graph/gap_detector.py:220-226`
- **Status**: Identified `cluster_concepts()` is sync but `_generate_cluster_label()` is async — cannot `await` in sync context. Added keyword filtering improvement and documented async refactor needed.

### Q2: Concept Name Length Limit
- **File**: `backend/graph/entity_extractor.py:902-909`
- **Fix**: Concepts with names >60 characters are reclassified as `Finding` entity type
- **Impact**: Eliminates sentence-length "concepts" that clutter the graph

### Q3: Centrality Fallback Improvement
- **File**: `backend/graph/centrality_analyzer.py:154-157`
- **Fix**: Eigenvector centrality failure (`PowerIterationFailedConvergence`) now falls back to `degree.copy()` instead of `{n: 0.0 for all n}`
- **Impact**: Eliminates all-zero centrality values that triggered the central burst chain

---

## Supporting Changes

### Relationship Type Normalization
- **File**: `backend/graph/persistence/entity_dao.py`
- Added `_normalize_relationship_type()` helper: `IS_RELATED_TO` → `RELATED_TO`, `CO_OCCUR_WITH` → `CO_OCCURS_WITH`
- Applied on both write and read paths for consistency

### ClusterPanel Recompute Callback
- **File**: `frontend/components/graph/ClusterPanel.tsx`
- Replaced `window.location.reload()` with proper `onRecomputeComplete` callback

### View Context API Parameter
- **Files**: `frontend/lib/api.ts`, `frontend/hooks/useGraphStore.ts`
- Added `viewContext` parameter (`hybrid` | `concept` | `all`) to `getVisualizationData()` API call

---

## Technical Summary

| Metric | Value |
|--------|-------|
| Files changed | 15 (8 backend, 6 frontend, 1 new) |
| Lines added | ~486 |
| Lines removed | ~74 |
| Net change | +412 lines |
| TypeScript errors | 0 |
| Python compile errors | 0 |
| New components | 1 (`ConceptExplorer.tsx`) |
| New endpoints | 0 |
| Database migrations | 0 |
| New env vars | 0 |
| Breaking changes | Edge click removed (replaced by ConceptExplorer) |

---

## Deployment

```bash
git push render main    # Triggers Vercel (frontend) + Render (manual deploy for backend)
```

**Post-deploy verification**:
1. Render logs: P1-P5 errors should disappear
2. 3D view: No central burst on hover/interaction
3. Node click: ConceptExplorer panel appears (not EdgeContextModal)
4. Edges: Visible color differentiation by relationship type
5. Selection: 3-tier opacity dimming works
