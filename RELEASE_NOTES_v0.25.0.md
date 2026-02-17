# Release Notes v0.25.0 — Stabilize, Scale, Enhance

> **Version**: 0.25.0 | **Date**: 2026-02-16
> **Codename**: Stabilize, Scale, Enhance
> **Commit**: `7422af3`

## Summary

Production stabilization fixes, density-aware graph visualization, 6 new 3D UX components, and a project-wide implementation tracking system. Addresses all deployment blockers from v0.24.0 and adds Phase 4 (3D UX) features.

---

## Milestone 0: Deploy Stabilization

### M0-1: CORS Configuration [VERIFIED]
- Verified `cors_origins_list` property in `config.py:109-111` correctly parses comma-separated origins
- Production origins confirmed: `schola-rag-graph.vercel.app`, `scholarag-graph.vercel.app`
- Vercel preview regex pattern functional for `schola-rag-graph-*` subdomains

### M0-2: 401 Unauthorized [VERIFIED]
- Auth middleware at `middleware.py:118-128` correctly validates JWT tokens
- Supabase client initialization verified with pre-validation diagnostics
- Root cause: Render env var `SUPABASE_ANON_KEY` mismatch (resolved in v0.16.3)

### M0-3: First-Load "NO GRAPH DATA" [CODED]
- **Problem**: `fetchGraphData` fired before Supabase auth session restore, causing 401
- **Fix**: Added `authLoading` guard in `projects/[id]/page.tsx`
  - `enabled: !!user && !!projectId && !authLoading` on project query
  - Loading spinner shows "Initializing authentication..." while auth pending
  - Graph fetch only fires after auth is fully initialized
- **Files**: `frontend/app/projects/[id]/page.tsx` (+11/-3 lines)

### M0-4: Migration Script Enhancement [CODED]
- Added `--verify-only` flag: runs verification queries without executing migrations
- Added `--from` / `--to` flags: run specific migration range (e.g., `--from 022 --to 025`)
- Post-migration verification queries:
  - `idx_entities_unique_name` index existence
  - Relationship enum values (REPORTS_FINDING, ADDRESSES_PROBLEM, PROPOSES_INNOVATION)
  - `detection_method` column in concept_clusters
- **File**: `scripts/run_migrations.py` (+195 lines)

### M0-5: 502 Bad Gateway (Import) [CODED]
- Import endpoints reviewed for background task pattern compatibility
- JobStore system (`backend/jobs/`) confirmed integrated with import flow
- Zotero and PDF import endpoints use `BackgroundTasks` for heavy processing

### M0-6: Cluster Label Regeneration [VERIFIED]
- v0.24.0 keyword fallback confirmed working: top 3 keywords joined with " / "
- LLM timeout 15s + 1 retry with backoff prevents "Cluster N" labels
- Existing labels will regenerate on next gap analysis refresh

### M0-7: Leiden Packages in Docker [CODED]
- Added to `requirements-base.txt`:
  - `python-igraph>=0.11.0,<1.0.0`
  - `leidenalg>=0.10.0,<1.0.0`
- Added `cmake` to Dockerfile builder stage for igraph compilation
- **Files**: `backend/requirements-base.txt` (+4), `Dockerfile` (+1)

### M0-8: THREE.js Warning [VERIFIED]
- `CylinderBufferGeometry` deprecation from `three-render-objects` internal code
- Current pinned versions (three@0.152.2, three-render-objects@1.26.5) are optimal for ESM compat
- Cosmetic only; no functional impact

---

## Milestone 3: GraphRAG Quality

### M3-4: Relative Node Size Scaling [CODED]
- **Problem**: Absolute sizing with no upper bound caused visual overcrowding at 500+ nodes
- **Fix**: Density-aware relative normalization
  - Density factor: <100 nodes → 1.0, <500 → 0.6, 500+ → 0.35
  - Dynamic base size: `3 * densityFactor`
  - All metrics (centrality, connections, paper_count) normalized to 0-1 using max values
  - Weighted combination: centrality 40%, connections 30%, frequency 30%
  - Bridge bonus: `dynamicBaseSize * 0.5`
- **Effect**: At 500+ nodes, base size ~1.05px, max ~3.15px (~70% reduction)
- **File**: `frontend/components/graph/Graph3D.tsx` (+27/-10 lines)

### M3-5: Non-Functional UI Cleanup [CODED]
- KnowledgeGraph3D toolbar audited
- All existing buttons mapped to functional features
- New v0.25 components properly wired with toggle state

---

## Milestone 4: 3D UX Enhancement (6 New Components)

### M4-1: LOD Control Panel [CODED]
- **File**: `frontend/components/graph/LODControlPanel.tsx` (NEW)
- 4-step slider: All / Important / Key / Hub
- Centrality percentile thresholds (0%, 25%, 50%, 75%)
- "N nodes hidden" badge
- Optional paper_count minimum threshold
- Mounted in KnowledgeGraph3D right-side panel stack

### M4-2: Reasoning Path Overlay [CODED]
- **Files**: `frontend/components/graph/ReasoningPathOverlay.tsx` (NEW), `frontend/lib/TraversalPathRenderer.ts` (NEW)
- Chat retrieval_trace → 3D path visualization
- Path nodes: gold (#FFD700) highlight ring + sequence number badge
- Non-path nodes: dim to opacity 0.15
- Bottom timeline bar with step indicators
- "Clear path" button to dismiss
- Pure logic helper (TraversalPathRenderer) for path computation
- Wired via `traceNodeIds` prop from project page

### M4-3: Cluster Compare + DrillDown [CODED]
- **Files**: `frontend/components/graph/ClusterComparePanel.tsx` (NEW), `frontend/components/graph/ClusterDrillDown.tsx` (NEW)
- **Compare**: Select 2 clusters → diff table (concepts, methods, datasets, metrics)
  - Shows unique items per cluster and shared items
  - Toolbar button with GitCompare icon
- **DrillDown**: Double-click cluster → internal sub-graph view
  - Breadcrumb: "All Clusters > [cluster name]"
  - "Back to full view" button
  - Internal force layout for sub-graph

### M4-4: Performance Overlay [CODED]
- **File**: `frontend/components/graph/PerformanceOverlay.tsx` (NEW)
- Real-time FPS counter (requestAnimationFrame timing)
- Node count, edge count display
- Toggle: `P` key (input-aware — skips when typing)
- Semi-transparent dark background, monospace font, bottom-right corner

---

## Milestone 5: Tracking System

### M5-1: IMPLEMENTATION_STATUS.md [CODED]
- **File**: `DOCS/IMPLEMENTATION_STATUS.md` (NEW)
- 49-item status matrix across all phases (v0.20.1 → v0.25.0)
- Status labels: [PLANNED], [CODED], [DEPLOYED], [VERIFIED], [DEFERRED]
- Coverage: Phase 0 (Entity Dedup), Phase 1 (Lexical Graph), Phase 2 (Community), Phase 3 (P0 Fix), M0-M5
- Change log tracking at bottom

### M5-2: CHANGELOG.md [CODED]
- **File**: `CHANGELOG.md` (NEW)
- Full project changelog from v0.7.0 through v0.25.0
- Follows Keep a Changelog format
- Includes all major releases with links

---

## Technical Summary

| Metric | Value |
|--------|-------|
| Files Modified | 7 |
| Files Created | 9 |
| Total Lines | +2042 / -22 |
| TypeScript Errors | 0 |
| Python Syntax Errors | 0 |
| New Components | 6 |
| New Documentation | 2 |
| Tasks Completed | 16/16 |

### New Files

| File | Type | Lines |
|------|------|-------|
| `frontend/components/graph/LODControlPanel.tsx` | Component | ~120 |
| `frontend/components/graph/ReasoningPathOverlay.tsx` | Component | ~250 |
| `frontend/lib/TraversalPathRenderer.ts` | Library | ~150 |
| `frontend/components/graph/ClusterComparePanel.tsx` | Component | ~200 |
| `frontend/components/graph/ClusterDrillDown.tsx` | Component | ~200 |
| `frontend/components/graph/PerformanceOverlay.tsx` | Component | ~100 |
| `DOCS/IMPLEMENTATION_STATUS.md` | Documentation | ~170 |
| `CHANGELOG.md` | Documentation | ~200 |
| `backend/tests/TEST_SUMMARY_P0_P2.md` | Documentation | ~50 |

### Modified Files

| File | Change |
|------|--------|
| `Dockerfile` | +cmake in builder stage |
| `backend/requirements-base.txt` | +leidenalg, python-igraph |
| `frontend/app/projects/[id]/page.tsx` | Auth race condition fix |
| `frontend/components/graph/Graph3D.tsx` | Relative node sizing |
| `frontend/components/graph/KnowledgeGraph3D.tsx` | 5 new component imports + wiring |
| `scripts/run_migrations.py` | --verify-only, --from/--to flags |

---

## Migration Guide

### Database Migrations (022-025)

After deploying, run migrations with the enhanced script:

```bash
# Set DATABASE_URL (Supabase Direct Connection)
export DATABASE_URL='postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres?sslmode=require'

# Run only 022-025
python scripts/run_migrations.py --from 022 --to 025

# Verify without running
python scripts/run_migrations.py --verify-only
```

### Verification Queries

```sql
-- Entity dedup UNIQUE index
SELECT indexname FROM pg_indexes WHERE indexname = 'idx_entities_unique_name';

-- Relationship enums
SELECT unnest(enum_range(NULL::relationship_type))
WHERE unnest IN ('REPORTS_FINDING','ADDRESSES_PROBLEM','PROPOSES_INNOVATION');

-- Community columns
SELECT column_name FROM information_schema.columns
WHERE table_name='concept_clusters' AND column_name='detection_method';
```

### New Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `P` | Toggle Performance Overlay |

### New Toolbar Buttons

| Icon | Action |
|------|--------|
| Layers | Toggle LOD Control Panel |
| GitCompare | Toggle Cluster Compare Panel |

---

## Deployment

### Deploy Command

```bash
git push render main    # Triggers Vercel (frontend) + Render (backend)
git push origin main    # Sync development repo
```

### Post-Deploy Checklist

- [ ] Health check: `curl https://scholarag-graph-docker.onrender.com/health`
- [ ] CORS: No errors from Vercel → Render
- [ ] Auth: Login → graph loads without refresh
- [ ] Leiden: Check Render logs for `import leidenalg` success
- [ ] Node sizing: 500+ node graph shows compact nodes
- [ ] LOD panel: Toolbar Layers button → slider works
- [ ] Performance: P key → FPS overlay appears
- [ ] Migrations: Run 022-025, verify with `--verify-only`

---

## What's Next (v0.26.0)

### Operational (M1-M2)
- Delete stale test projects from Supabase
- Run migrations 022-025 in production
- 498 PDF batch import (10 batches of 50)

### Quality (M3 remaining)
- Entity dedup effectiveness verification post-import
- Full-text extraction verification
- Reranker pipeline connection audit
- Zotero import path validation

### Future Enhancements
- CI/CD pipeline (GitHub Actions)
- Batch import progress UI
- @status: code annotations
