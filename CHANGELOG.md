# Changelog

All notable changes to ScholaRAG_Graph are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — v0.25.0

### Added
- **LOD Control Panel**: Manual 4-step slider (All/Important/Key/Hub) for node visibility control
- **Reasoning Path Overlay**: 3D path visualization from chat retrieval traces with timeline scrubber
- **Cluster Compare Panel**: Side-by-side comparison of 2 clusters (methods, datasets, metrics)
- **Cluster DrillDown**: Double-click cluster to view internal nodes only
- **Performance Overlay**: Real-time FPS, node/edge count display (toggle with P key)
- **IMPLEMENTATION_STATUS.md**: Full status matrix tracking plan-to-code-to-deploy lifecycle
- **CHANGELOG.md**: Project-level changelog (this file)
- **Migration script enhancements**: `--verify-only` and `--from/--to` range flags

### Changed
- **Node sizing**: Absolute sizing replaced with relative scaling (density-aware, 0-1 normalized)
  - 500+ nodes: ~70% smaller than before, preventing visual overcrowding
  - Dynamic baseSize adapts to graph density
- **Import endpoints**: Background task pattern (202 + polling) to avoid Render 30s timeout
- **Leiden packages**: Added `leidenalg` + `python-igraph` to Docker build

### Fixed
- **CORS**: Verified `cors_origins_list` property and Vercel domain configuration
- **401 Unauthorized**: Auth middleware and Supabase client verification
- **First-load "NO GRAPH DATA"**: Auth race condition — graph fetch now waits for auth initialization
- **502 Bad Gateway on Import**: Converted synchronous import to background job pattern
- **Cluster labels**: Verified keyword fallback ("ML / NLP / Classification" style)
- **THREE.js warning**: Investigated CylinderBufferGeometry deprecation (cosmetic, pinned versions)

### Removed
- Non-functional UI elements and placeholder buttons cleaned from toolbar

---

## [0.24.0] — 2026-02-16

Codename: **Foundation Repair**

### Fixed
- **Migration conflicts**: Renamed 004B/005B/006B to 022/023/024; created 025 for missing enums
- **Missing relationship types**: `REPORTS_FINDING`, `ADDRESSES_PROBLEM`, `PROPOSES_INNOVATION` added to DB enum
- **Cluster labels**: LLM timeout 5s→15s, retry with backoff, keyword fallback (never "Cluster N")
- **Dead community detection code**: CommunityDetector + CommunitySummarizer now connected
- **Edge visibility**: Opacity floors raised across 3D View and Topic View

### Added
- Feature flags defaulted to `True`: `lexical_graph_v1`, `hybrid_trace_v1`, `topic_lod_default`
- `paper_count` field in visualization API (from `source_paper_ids` array length)
- Leiden community detection (igraph + leidenalg) with K-means fallback
- Relationship type frontend types: `REPORTS_FINDING`, `ADDRESSES_PROBLEM`, `PROPOSES_INNOVATION`
- 20 TDD tests passing (test_p0_p2_fixes.py)

### Changed
- `max_nodes` API default: 1000 → 2000
- Edge opacity: weak 15%→35%, medium 35%→55%, default floor 8%→20%

---

## [0.18.0] — 2026-02-13

### Fixed
- `fetch_one()` → `fetchrow()` in integrations.py
- Missing `project_id` in `search_entities()` call
- Temporal endpoint `first_seen_year` column error
- Conversation FK violation with defensive `user_id` check
- 3D "Central Burst" via `centralityPercentileMap` removal + ref pattern

### Added
- **ConceptExplorer**: Relationship exploration panel (replaces edge clicking)
- 3-tier neighbor highlight (gold/green/dim)
- Relationship type edge colors (teal/purple/green/red)

---

## [0.16.3] — 2026-02-13

### Fixed
- **BUG-044**: Render `SUPABASE_ANON_KEY` mismatch causing all 401 errors

---

## [0.15.0] — 2026-02-08

### Added
- Provenance Chain: 3-tier evidence cascade + AI explanation fallback
- Search Strategy Routing: vector/graph_traversal/hybrid classification
- Embedding-based Entity Resolution with cosine similarity
- Table-to-Graph Pipeline with TableSourceMetadata
- Gap Evaluation: ground truth dataset + Recall/Precision/F1
- Query Instrumentation with hop-level latency
- Cross-Paper Linking: SAME_AS relationship type
- Frontend: Provenance UI, Strategy Badges, ER Dashboard, Evaluation Page
- Migration: `021_cross_paper_links.sql`

---

## [0.14.0] — 2026-02-07

### Fixed
- WebGL crash on unmount (resource disposal + texture caching)
- Hover jitter (decoupled highlight from nodeThreeObject deps)
- Broken labels (empty concept name filter)
- Panel overlap (global z-index counter)

### Added
- Auto-load paper recommendations on gap expansion
- Toast notification system
- Topic labels with centrality-based sizing

---

## [0.12.1] — 2026-02-07

### Added
- LLM-Summarized Cluster Labels endpoint
- Gap-Based Paper Recommendations endpoint
- Gap Analysis Report Export (Markdown)

---

## [0.10.0] — 2026-02-05

### Added
- Entity Type V2: 8 distinct types with confidence thresholds
- Entity Shape Visualization: 8 Three.js geometries per type
- EntityTypeLegend component
- Convex Hull cluster boundaries in Topic View
- Test infrastructure (6 test files)

---

## [0.9.0] — 2026-02-04

### Added
- InfraNodus-style centrality labeling (top 20% always visible)
- Korean tooltips for all 14 toolbar buttons

### Fixed
- Graph shrinkage (velocity decay 0.9→0.4)
- AI Explain UUID → concept names
- "No Gaps Detected" auto-refresh

### Removed
- Particle effects (lightning toggle + rendering)

---

## [0.7.0] — 2026-02-04

### Added
- Node pinning (click + Shift+click multi-select)
- Adaptive zoom-responsive labeling
- Graph-to-Prompt export
- Continuous Documentation Protocol
- Three.js ESM pinning + webpack config

---

[Unreleased]: https://github.com/HosungYou/ScholaRAG_Graph/compare/v0.24.0...HEAD
[0.24.0]: https://github.com/HosungYou/ScholaRAG_Graph/compare/v0.18.0...v0.24.0
[0.18.0]: https://github.com/HosungYou/ScholaRAG_Graph/compare/v0.16.3...v0.18.0
[0.16.3]: https://github.com/HosungYou/ScholaRAG_Graph/compare/v0.15.0...v0.16.3
[0.15.0]: https://github.com/HosungYou/ScholaRAG_Graph/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/HosungYou/ScholaRAG_Graph/compare/v0.12.1...v0.14.0
[0.12.1]: https://github.com/HosungYou/ScholaRAG_Graph/compare/v0.10.0...v0.12.1
[0.10.0]: https://github.com/HosungYou/ScholaRAG_Graph/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/HosungYou/ScholaRAG_Graph/compare/v0.7.0...v0.9.0
[0.7.0]: https://github.com/HosungYou/ScholaRAG_Graph/releases/tag/v0.7.0
