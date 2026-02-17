# Release Notes v0.27.0 — Production Stabilization & Relationship Diversity

> **Version**: 0.27.0 | **Date**: 2026-02-17
> **Codename**: Production Stabilization & Relationship Diversity

## Summary

Comprehensive production fix addressing data quality issues visible in the UI. Applied pending DB migrations 022-025, rebuilt relationship graph with 6 diverse relationship types, fixed edge paper_count calculation, improved popup positioning, and consolidated git remotes.

---

## Database Migrations (Applied to Production)

### Migration 022 — Entity Deduplication
- Merged duplicate entities by `(project_id, entity_type, LOWER(name))`
- Rewired all relationships to canonical entities
- **Result**: 0 duplicate entities remaining

### Migration 023 — Lexical Graph Schema
- Tables and indexes for lexical graph features

### Migration 024 — Community Trace
- Community detection audit trail support

### Migration 025 — P0 Comprehensive Fix
- Added missing `relationship_type` enum values: `REPORTS_FINDING`, `ADDRESSES_PROBLEM`, `PROPOSES_INNOVATION`
- Feature flag defaults applied

---

## Relationship Diversity (Data Reprocessing)

| Metric | Before | After |
|--------|--------|-------|
| Relationship types | 2 | **6** |
| Total relationships | 3,903 | **5,207** |

### Relationship Breakdown (After)

| Type | Count | Semantic Rule |
|------|-------|---------------|
| CO_OCCURS_WITH | 3,707 | Entity co-occurrence in same paper |
| SUPPORTS | 569 | Finding → Concept, same paper |
| APPLIES_TO | 414 | Method → Concept, same paper |
| ADDRESSES | 286 | Problem → Concept, same paper |
| RELATED_TO | 196 | Embedding similarity ≥ 0.7 |
| EVALUATES_WITH | 35 | Dataset → Method, same paper |

- Populated `source_paper_ids` column from entity properties JSON for all 430 entities

---

## Community Detection & Gap Analysis

- Refreshed community detection: **11 communities**, modularity **0.6025**
- Cluster labels now meaningful topic names (was "Cluster 1, 2, 3")
- **55 structural gaps** identified with varying strengths
- Shannon diversity: **1.44** | Graph density: **0.042**

---

## Code Changes

### `backend/routers/graph.py`

- CO_OCCURS_WITH edge `paper_count` now computed from `source_paper_ids` intersection (was hardcoded to 1)
- Added `source_paper_ids` to visualization SQL query
- Built entity→papers mapping for accurate co-occurrence counts

### `frontend/components/graph/NodeDetails.tsx`

- Viewport boundary detection with dynamic top/bottom positioning via `useRef` + `useEffect`
- `break-words` CSS class on content div, fallback text, and AI explanation text
- Imports updated: added `useRef`, `useEffect`, `useCallback`

---

## Infrastructure

### INFRA-016 — Git Remotes Consolidated

- `render` remote renamed to `origin` (scholar-graphrag)
- Single remote for all deployment
- CLAUDE.md deployment docs updated to reflect single-remote setup
- Supabase project linked via CLI (ref: `arxntrtipkakbvhcpfqj`)

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `backend/routers/graph.py` | Modified | +45/-18 |
| `frontend/components/graph/NodeDetails.tsx` | Modified | +21/-12 |

**Total**: 3 files changed (code), 6 total with config, +66/-30 lines

---

## Technical Details

### Entity Distribution (7 Types)

| Entity Type | Count |
|-------------|-------|
| Concept | 228 |
| Finding | 69 |
| Method | 51 |
| Problem | 35 |
| Dataset | 20 |
| Innovation | 19 |
| Limitation | 8 |
| **Total** | **430** |

### Quality Metrics

- TypeScript: 0 errors (`tsc --noEmit`)
- Python: 0 syntax errors
- Relationship type enum values registered: 24
- Backward compatible: no breaking changes

---

## Verification Checklist

- [x] Duplicate entities: 0 (migration 022)
- [x] Relationship types: 6 (was 2)
- [x] Entity types: 7 diverse types
- [x] Cluster labels: meaningful names
- [x] Modularity: 0.6025 (non-zero)
- [x] Structural gaps: 55 (non-zero)
- [x] tsc --noEmit: 0 errors
- [x] Git remote: origin → scholar-graphrag only
