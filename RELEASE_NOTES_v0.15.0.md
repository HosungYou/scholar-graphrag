# Release Notes v0.15.0 — Core-Preserving Reliability Track Extension

> **Version**: 0.15.0 | **Date**: 2026-02-08
> **Track**: Core-Preserving Reliability (Phases 7-12)
> **Previous**: v0.14.1 (UX Enhancement + Gap-to-Chat)

## Overview

Phase 7-12 extends the reliability track with deep provenance tracing, advanced entity resolution, evaluation frameworks, and comprehensive frontend integration. This release adds 18 sub-phases of work across backend infrastructure, frontend visualization, UX polish, and documentation.

---

## Backend Enhancements (Phases 7-10)

### Phase 7A: MENTIONS-based Provenance Chain
- **3-tier evidence cascade**: `relationship_evidence` → `source_chunk_ids` (MENTIONS) → `text_search`
- **AI explanation fallback** (Tier 4): LLM-generated explanation when no text evidence exists
- `provenance_source` field on all evidence responses for tracking origin

### Phase 7B: Search Strategy Routing
- Automatic query classification: `vector`, `graph_traversal`, `hybrid`
- `meta.search_strategy` and `meta.hop_count` in chat API responses
- Intent-based view mode routing integration

### Phase 8A: Embedding-based Entity Resolution
- Cosine similarity for ER candidate pair detection
- `embedding_candidates_found` / `string_candidates_found` metrics
- Reduced false positive merges through pre-filtering

### Phase 8B: Few-shot Extraction Enhancement
- Groq-based domain-specific few-shot prompts
- `llm_confirmed_merges` metric for LLM-verified merge tracking
- Improved entity extraction accuracy for academic domain

### Phase 9A: Table-to-Graph Pipeline
- `TableSourceMetadata` for table-sourced entity tracking
- Table page number and index preservation
- Confidence scoring for table-extracted entities

### Phase 9B: Gap Evaluation Dataset
- Ground truth dataset: AI Education domain (`ai_education_gaps.json`)
- `GapDetectionMetrics`: Recall, Precision, F1 computation
- `GET /api/evaluation/report` endpoint
- Jaccard similarity-based gap matching with configurable threshold

### Phase 10A: Query Performance Instrumentation
- `QueryMetricsCollector` singleton with `@timed_query` decorator
- Per-hop and per-type latency aggregation (avg, P95, max)
- `GET /api/system/query-metrics` endpoint
- Automatic GraphDB migration recommendation (500ms threshold)
- Slow query logging (>500ms automatic warning)

### Phase 10B: Cross-Paper Entity Linking
- `SAME_AS` relationship type for cross-paper entity identity
- `cross_paper_entity_linking()` async method in EntityResolutionService
- `POST /api/graph/{project_id}/cross-paper-links` endpoint
- Database migration: `021_cross_paper_links.sql`

---

## Frontend Integration (Phase 11)

### Phase 11A: Provenance Chain UI
- EdgeContextModal shows 4-tier provenance badges with Korean labels
  - `relationship_evidence` → "관계 증거 테이블"
  - `source_chunk_ids` → "청크 출처 참조"
  - `text_search` → "텍스트 검색"
  - `ai_explanation` → "AI 분석"
- Color-coded badges (teal, blue, amber, violet)

### Phase 11B: Search Strategy Badges
- Chat messages display strategy indicators after assistant responses
- Icons: 🔍 Vector, 🕸️ Graph Traversal (N-hop), 🔀 Hybrid
- Monospace font, accent-teal styling, Korean tooltips

### Phase 11C: ER Statistics Dashboard
- ImportProgress shows embedding/string candidate counts
- `llm_confirmed_merges` metric display
- Collapsible detail section for advanced metrics

### Phase 11D: Table Extraction Visualization
- Amber ring indicator on table-sourced entities in 3D graph
- Tooltip: "📊 From Table (p.N) #M"
- EVALUATED_ON relationship metric badges (metric/score/dataset)

### Phase 11E: Evaluation Report Viewer + Query Metrics
- **New page**: `/evaluation` with Recall/Precision/F1 metrics grid
- Matched/unmatched gap comparison tables
- **Settings page**: Query Performance Metrics section
  - Hop-by-hop latency bar charts
  - GraphDB recommendation gauge with 500ms threshold
- Empty states with Korean guidance messages

### Phase 11F: Cross-Paper SAME_AS Visualization
- Dashed purple lines (#9D4EDD) for SAME_AS edges using `THREE.LineDashedMaterial`
- Level-of-Detail: edges hidden when camera distance > 800
- Toggle control (Link2 icon) in graph toolbar
- "🔗 Cross-Paper" badge on gap cards involving SAME_AS entities

---

## UX Polish (Phase 12)

### Phase 12A: Progressive Disclosure
- **EdgeContextModal**: Shows first evidence chunk only; "상세 보기 (N개 더)" expand button
- **ImportProgress**: ER details collapsed by default with ChevronDown/Right toggle
- **ChatInterface**: Strategy badges icon-only with `group-hover` text expansion

### Phase 12B: Responsive Layout + Accessibility
- **EdgeContextModal**: `max-w-full sm:max-w-2xl` responsive modal, `break-words` for evidence text
- **GapPanel**: Responsive Cross-Paper badge, flexible cluster labels
- **ARIA labels**: Korean aria-label on provenance badges, strategy badges, SAME_AS toggle
- **SAME_AS LOD**: Camera distance-based transparency (>800 units = hidden)

### Phase 12C: QA Fixture Scenarios
- **provenance-chain** scenario: EdgeContextModal with 3 evidence chunks
- **strategy-badge** scenario: ChatInterface with hybrid + graph_traversal messages
- **same-as-edges** scenario: Graph3D with SAME_AS edge rendering
- Updated snapshot review checklist (items 8-12)

### Phase 12D: Codex Documentation
- Execution Procedure updated (Phase 7-12 complete)
- SDD sections 6-8, 11 updated
- TDD scenarios S5-S10 added
- Execution log Phase 7-12 batch entry

---

## New API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/evaluation/report` | Gap detection evaluation report |
| GET | `/api/system/query-metrics` | Query performance metrics + GraphDB recommendation |
| POST | `/api/graph/{project_id}/cross-paper-links` | Trigger cross-paper entity linking |
| GET | `/api/graph/gaps/{project_id}/repro/{gap_id}` | Single gap reproduction report |
| GET | `/api/graph/gaps/{project_id}/repro/{gap_id}/export` | Export gap repro report (MD/JSON) |

## New Frontend Pages

| Route | Description |
|-------|-------------|
| `/evaluation` | Gap detection evaluation report viewer |

## New Database Migration

| File | Description |
|------|-------------|
| `021_cross_paper_links.sql` | SAME_AS enum, cross-paper indexes |

---

## Technical Stats

- **Backend**: 10 sub-phases (7A-10B), 4 major feature modules
- **Frontend**: 6 integration modules (11A-11F) + 4 UX modules (12A-12D)
- **TypeScript**: 0 errors (verified after each phase)
- **Tests**: 9 suites, 38 tests, 9 snapshots — all passing
- **Backend tests**: 73 passed, 4 skipped

## Breaking Changes

None. All changes are additive.

## Migration Guide

1. Run database migration `021_cross_paper_links.sql`
2. No new environment variables required
3. Frontend types auto-updated (no manual changes needed)

## Known Limitations

1. Evaluation report uses mock detected gaps (real integration pending)
2. Query metrics start from zero on each server restart (in-memory collector)
3. SAME_AS LOD threshold (800) is hardcoded
4. Playwright graph tests use E2E mock mode, not real WebGL
