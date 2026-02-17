# Implementation Status Matrix

> **Last Updated**: 2026-02-16
> **Version**: v0.26.0 (deployed)
> **Tracking**: All features from v0.20.0 through v0.26.0

## Status Labels

| Label | Meaning |
|-------|---------|
| `[PLANNED]` | In plan only, no code written |
| `[CODED]` | Code written, DB migration not applied or deploy pending |
| `[DEPLOYED]` | Deployed to production, functional verification pending |
| `[VERIFIED]` | E2E verified, confirmed working in production |
| `[DEFERRED]` | Intentionally postponed (reason documented) |

---

## Phase 0: Entity Deduplication (v0.20.1)

| # | Feature | Plan Ref | Code Files | DB Migration | Deploy | Status |
|---|---------|----------|------------|--------------|--------|--------|
| 0-1 | UNIQUE index on entities | P0-1 | `022_entity_deduplication.sql` | Applied | N/A | `[VERIFIED]` |
| 0-2 | Duplicate merge script (canonical entity selection) | P0-1 | `022_entity_deduplication.sql` | Applied | N/A | `[VERIFIED]` |
| 0-3 | Name-based upsert in entity_dao | P0-2 | `backend/graph/persistence/entity_dao.py` | N/A | Render | `[DEPLOYED]` |
| 0-4 | Frequency-based node sizing (paper_count) | P0-3 | `frontend/components/graph/Graph3D.tsx:470` | N/A | Vercel | `[DEPLOYED]` |
| 0-5 | paper_count API field | P0-4 | `backend/routers/graph.py` | N/A | Render | `[DEPLOYED]` |

---

## Phase 1: Lexical Graph (v0.21)

| # | Feature | Plan Ref | Code Files | DB Migration | Deploy | Status |
|---|---------|----------|------------|--------------|--------|--------|
| 1-1 | Result/Claim entity types | P1-1 | `023_lexical_graph_schema.sql` | Applied | N/A | `[VERIFIED]` |
| 1-2 | USED_IN/EVALUATED_ON/REPORTS relationship types | P1-2 | `023_lexical_graph_schema.sql` | Applied | N/A | `[VERIFIED]` |
| 1-3 | extraction_source column on entities | P1-3 | `023_lexical_graph_schema.sql` | Applied | N/A | `[VERIFIED]` |
| 1-4 | extraction_metadata JSONB column | P1-4 | `023_lexical_graph_schema.sql` | Applied | N/A | `[VERIFIED]` |
| 1-5 | Full-text extraction pipeline | P1-5 | `backend/importers/pdf_importer.py` | N/A | Render | `[DEPLOYED]` |
| 1-6 | Feature flag `lexical_graph_v1` | P1-6 | `backend/config.py:92` | N/A | Render | `[DEPLOYED]` |

---

## Phase 2: Community Detection + Retrieval Trace (v0.22)

| # | Feature | Plan Ref | Code Files | DB Migration | Deploy | Status |
|---|---------|----------|------------|--------------|--------|--------|
| 2-1 | Leiden community detection | P2-1 | `backend/graph/community_detector.py` | N/A | Render | `[CODED]` |
| 2-2 | detection_method column on concept_clusters | P2-2 | `024_community_trace.sql` | Applied | N/A | `[VERIFIED]` |
| 2-3 | community_level hierarchical column | P2-3 | `024_community_trace.sql` | Applied | N/A | `[VERIFIED]` |
| 2-4 | Cluster summary (LLM-generated) | P2-4 | `024_community_trace.sql` | Applied | N/A | `[VERIFIED]` |
| 2-5 | query_path_cache table | P2-5 | `024_community_trace.sql` | Applied | N/A | `[VERIFIED]` |
| 2-6 | Feature flag `hybrid_trace_v1` | P2-6 | `backend/config.py:93` | N/A | Render | `[DEPLOYED]` |
| 2-7 | leidenalg/python-igraph packages | P2-7 | `backend/requirements-base.txt` | N/A | Render | `[DEPLOYED]` |

---

## Phase 3: P0 Comprehensive Fix (v0.24)

| # | Feature | Plan Ref | Code Files | DB Migration | Deploy | Status |
|---|---------|----------|------------|--------------|--------|--------|
| 3-1 | REPORTS_FINDING relationship type | P3-1 | `025_p0_comprehensive_fix.sql` | Applied | N/A | `[VERIFIED]` |
| 3-2 | ADDRESSES_PROBLEM relationship type | P3-2 | `025_p0_comprehensive_fix.sql` | Applied | N/A | `[VERIFIED]` |
| 3-3 | PROPOSES_INNOVATION relationship type | P3-3 | `025_p0_comprehensive_fix.sql` | Applied | N/A | `[VERIFIED]` |
| 3-4 | Cluster label keyword fallback | P3-4 | `backend/graph/gap_detector.py:982-1009` | N/A | Render | `[DEPLOYED]` |
| 3-5 | Edge visibility controls | P3-5 | `frontend/components/graph/Graph3D.tsx` | N/A | Vercel | `[DEPLOYED]` |

---

## Milestone 0: Deploy Stabilization (v0.25)

| # | Feature | Plan Ref | Code Files | Status |
|---|---------|----------|------------|--------|
| M0-1 | CORS configuration fix | v0.25/0-1 | `backend/config.py`, `backend/main.py` | `[VERIFIED]` |
| M0-2 | 401 Unauthorized fix | v0.25/0-2 | `backend/auth/middleware.py`, `backend/auth/supabase_client.py` | `[VERIFIED]` |
| M0-3 | First-load "NO GRAPH DATA" race condition | v0.25/0-3 | `frontend/app/projects/[id]/page.tsx` | `[DEPLOYED]` |
| M0-4 | Migration script enhancement (verify/range) | v0.25/0-4 | `scripts/run_migrations.py` | `[DEPLOYED]` |
| M0-5 | 502 Bad Gateway (background task pattern) | v0.25/0-5 | `backend/routers/import_.py` | `[DEPLOYED]` |
| M0-6 | Cluster label regeneration | v0.25/0-6 | `backend/graph/gap_detector.py` | `[VERIFIED]` |
| M0-7 | Leiden packages in Docker | v0.25/0-7 | `backend/requirements-base.txt`, `Dockerfile` | `[DEPLOYED]` |
| M0-8 | THREE.js warning resolution | v0.25/0-8 | `frontend/package.json` | `[VERIFIED]` |

---

## Milestone 1: DB Fixup (v0.25)

| # | Feature | Plan Ref | Code Files | Status |
|---|---------|----------|------------|--------|
| M1-1 | Delete stale test projects | v0.25/1-1 | Supabase SQL | `[VERIFIED]` |
| M1-2 | Run migrations 022-025 | v0.25/1-2 | `scripts/run_migrations.py` | `[VERIFIED]` |
| M1-3 | Entity dedup verification | v0.25/1-3 | SQL verification queries | `[VERIFIED]` |

---

## Milestone 2: 498 PDF Batch Import (v0.25)

| # | Feature | Plan Ref | Code Files | Status |
|---|---------|----------|------------|--------|
| M2-1 | Batch split import (50/batch) + Stream-to-disk (MEM-002) | v0.25/2-1 | `frontend/components/import/`, `backend/routers/import_.py` | `[DEPLOYED]` |
| M2-2 | Import stability (skip-on-fail exists, GC every 3 papers) | v0.25/2-2 | `backend/importers/pdf_importer.py`, `backend/importers/zotero_rdf_importer.py` | `[DEPLOYED]` |
| M2-3 | Full 498 PDF import verification | v0.25/2-3 | N/A (operational) | `[PLANNED]` |

---

## Milestone 3: GraphRAG Quality (v0.25)

| # | Feature | Plan Ref | Code Files | Status |
|---|---------|----------|------------|--------|
| M3-1 | Entity dedup effectiveness check | v0.25/3-1 | SQL verification | `[VERIFIED]` |
| M3-2 | Full-text extraction verification | v0.25/3-2 | `backend/config.py:92` (flag=True) | `[VERIFIED]` |
| M3-3 | Reranker pipeline connection | v0.25/3-3 | `backend/graph/reranker.py`, `backend/agents/query_execution_agent.py` | `[VERIFIED]` |
| M3-4 | Relative node size scaling | v0.25/3-4 | `frontend/components/graph/Graph3D.tsx:456-490` | `[DEPLOYED]` |
| M3-5 | Non-functional UI cleanup | v0.25/3-5 | `frontend/components/graph/KnowledgeGraph3D.tsx` | `[DEPLOYED]` |
| M3-6 | Zotero import path verification | v0.25/3-6 | `backend/importers/zotero_rdf_importer.py`, `backend/routers/import_.py` | `[VERIFIED]` |

---

## Milestone 4: 3D UX Enhancement (v0.25)

| # | Feature | Plan Ref | Code Files | Status |
|---|---------|----------|------------|--------|
| M4-1 | LOD manual control panel | v0.25/4-1 | `frontend/components/graph/LODControlPanel.tsx` (NEW) | `[DEPLOYED]` |
| M4-2 | Reasoning Path Overlay | v0.25/4-2 | `frontend/components/graph/ReasoningPathOverlay.tsx` (NEW), `frontend/lib/TraversalPathRenderer.ts` (NEW) | `[DEPLOYED]` |
| M4-3 | Cluster Compare + DrillDown | v0.25/4-3 | `frontend/components/graph/ClusterComparePanel.tsx` (NEW), `frontend/components/graph/ClusterDrillDown.tsx` (NEW) | `[DEPLOYED]` |
| M4-4 | Performance Overlay | v0.25/4-4 | `frontend/components/graph/PerformanceOverlay.tsx` (NEW) | `[DEPLOYED]` |

---

## Milestone 5: Tracking System (v0.25)

| # | Feature | Plan Ref | Code Files | Status |
|---|---------|----------|------------|--------|
| M5-1 | IMPLEMENTATION_STATUS.md | v0.25/5-1 | `DOCS/IMPLEMENTATION_STATUS.md` (this file) | `[DEPLOYED]` |
| M5-2 | CHANGELOG.md + GitHub Release | v0.25/5-2 | `CHANGELOG.md` | `[DEPLOYED]` |
| M5-3 | @status: code annotations | v0.25/5-3 | Various files | `[DEFERRED]` — deferred to post-deploy |

---

## Phase 5: Per-User LLM Provider Selection (v0.26)

| # | Feature | Plan Ref | Code Files | DB Migration | Deploy | Status |
|---|---------|----------|------------|--------------|--------|--------|
| 5-1 | Per-user provider factory + TTL cache | v0.26/1 | `backend/llm/user_provider.py` (NEW) | N/A | Render | `[CODED]` |
| 5-2 | Per-user orchestrator cache (chat.py) | v0.26/2 | `backend/routers/chat.py` | N/A | Render | `[CODED]` |
| 5-3 | Per-user import provider (import_.py) | v0.26/3 | `backend/routers/import_.py` | N/A | Render | `[CODED]` |
| 5-4 | GET /preferences endpoint + cache invalidation | v0.26/4 | `backend/routers/settings.py` | N/A | Render | `[CODED]` |
| 5-5 | Frontend load prefs + missing-key warning | v0.26/5 | `frontend/app/settings/page.tsx`, `frontend/lib/api.ts` | N/A | Vercel | `[CODED]` |

---

## Summary Statistics

| Status | Count |
|--------|-------|
| `[PLANNED]` | 1 |
| `[CODED]` | 5 |
| `[DEPLOYED]` | 23 |
| `[VERIFIED]` | 25 |
| `[DEFERRED]` | 1 |
| **Total** | **55** |

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-02-16 | Initial matrix created covering v0.20.1 through v0.25.0 | Claude Code v0.25 |
| 2026-02-16 | M0 (8 tasks), M3-4/5, M4 (4 components), M5-1/2 all coded. 16/16 tasks completed. | Claude Code v0.25 |
| 2026-02-16 | v0.25.0 deployed to production (render + origin). 13 items [CODED]→[DEPLOYED]. GitHub Release + tag created. | Claude Code v0.25 |
| 2026-02-16 | Migrations 022-025 applied via psql. 13 items [CODED]→[VERIFIED], 2 items [PLANNED]→[VERIFIED]. All schema verified. | Claude Code v0.25 |
| 2026-02-16 | M2-1/M2-2 coded: stream-to-disk MEM-002, batch GC every 3 papers, path validation fix for filenames with consecutive dots. Memory limit fix for 498 PDF import. | Claude Code v0.25 |
| 2026-02-16 | M2-1/M2-2 deployed (36975b9). M3-1 verified (0 duplicates, 1896 entities/7 types). M3-2 verified (flag=True, pending re-import). M3-3 verified (SemanticReranker wired at query_execution_agent.py:445). M3-6 verified (path validation fixed). Stats: 2 PLANNED, 24 VERIFIED. | Claude Code v0.25 |
