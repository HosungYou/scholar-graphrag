# Release Notes v0.30.0

> **Version**: 0.30.0 | **Date**: 2026-02-17
> **Codename**: Quality Evaluation + Research Report + Temporal Dashboard + Paper Fit

## Overview

Major feature release adding three new analysis layers: a quality evaluation system (retrieval metrics, cluster quality, entity extraction quality), an executive research report with Markdown/HTML export, and a temporal dashboard with paper fit analysis. UI toolbar streamlined from 13 to 6 buttons, InsightHUD redesigned, and a 6th view mode (Summary) added.

---

## Phase 1: Quality Evaluation System + UI Cleanup

### Retrieval Quality Evaluation

New endpoint evaluates how well the knowledge graph retrieves relevant content:

- **`POST /api/evaluation/retrieval/{project_id}`** — runs retrieval quality evaluation against auto-generated ground truth
- **`backend/evaluation/auto_ground_truth.py`** — generates test queries from top entities (3 query types: `concept_search`, `relationship_query`, `method_inquiry`)
- **Metrics computed**: Precision@K, Recall@K, MRR (Mean Reciprocal Rank), Hit Rate
- Ground truth is auto-derived from project entities — no manual labeling required

### Cluster Quality Metrics

`GET /api/graph/metrics/{project_id}` now returns additional quality signals:

| Metric | Type | Notes |
|--------|------|-------|
| Raw modularity | Float | Community detection quality score |
| Modularity interpretation | Korean badge | 강함 / 보통 / 약함 |
| Silhouette score | Float | Cluster separation quality |
| Avg cluster coherence | Float | Intra-cluster semantic density |
| Cluster coverage | Float | Fraction of nodes in clusters |

### Entity Extraction Quality

`GET /api/graph/metrics/{project_id}` also surfaces entity extraction diagnostics:

- **Type diversity**: Number of distinct entity types present
- **Paper coverage**: Fraction of papers with at least one extracted entity
- **Avg entities/paper**: Mean entity count per paper
- **Cross-paper ratio**: Fraction of entities appearing in 2+ papers
- **Type distribution**: Per-type entity counts

### UI Cleanup

Toolbar reduced from 13 buttons to 6 (removed: Bloom, Label, SAME_AS, Centrality, Cluster, LOD, ClusterCompare, MainTopics).

Additional defaults updated:

| Setting | Before | After |
|---------|--------|-------|
| `max_nodes` | 2000 | 500 |
| Label visibility | Top 20% | All (`alwaysVisiblePercentile: 0`, `labelVisibility: 'all'`) |
| Weak edge opacity | Full opacity | Fade for edges with weight < 0.3 |

**InsightHUD** redesigned: raw modularity displayed with Korean interpretation badge + new entity quality section.

---

## Phase 2: Executive Summary & Research Report

### Research Summary API

- **`GET /api/graph/summary/{project_id}`** — aggregates overview, quality metrics, top entities, communities, structural gaps, temporal info into a single JSON response
- **`GET /api/graph/summary/{project_id}/export?format=markdown|html`** — exports as StreamingResponse (Markdown or HTML)
- **`backend/graph/report_generator.py`** — generates structured Markdown report (연구 지형 리포트) with all sections

### ResearchReport Component

- **`frontend/components/graph/ResearchReport.tsx`** — in-app report viewer with all sections rendered
- Export button triggers `GET /api/graph/summary/{project_id}/export`
- Accessible via the 6th view mode tab (Summary, emerald theme)

---

## Phase 3: Temporal Dashboard + Paper Fit Analysis

### Temporal Trends

- **`GET /api/graph/temporal/{project_id}/trends`** — classifies entities into lifecycle stages:

| Stage | Criteria | Color |
|-------|----------|-------|
| Emerging | `first_seen >= max_year - 2` AND 2+ papers | Emerald |
| Stable | 3+ papers | Blue |
| Declining | `last_seen <= max_year - 3` | Coral |

- **`frontend/components/graph/TemporalDashboard.tsx`** — color-coded entity cards grouped by lifecycle stage

### Paper Fit Analysis

- **`POST /api/graph/{project_id}/paper-fit`** — analyzes how well a given paper fits into the existing knowledge graph
  - Accepts DOI or title; DOI lookup via Semantic Scholar API (S2)
  - Uses **pgvector** similarity matching to find similar existing entities
  - Maps paper to graph communities
  - Detects gap connections (potential bridge contributions)
  - Returns a text summary

- **`backend/graph/paper_fit_analyzer.py`** — `PaperFitAnalyzer` class with:
  - Embedding generation
  - Similar entity search (pgvector cosine similarity)
  - Community mapping
  - Gap connection detection
  - Natural language summary generation

- **`frontend/components/graph/PaperFitPanel.tsx`** — DOI/title input form + analysis results display:
  - Similarity bars for top matching entities
  - Community relevance scores
  - Gap connection list
  - Paper Fit toolbar button (purple theme, Search icon)

---

## New Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/evaluation/retrieval/{project_id}` | Retrieval quality evaluation (Precision@K, Recall@K, MRR, Hit Rate) |
| `GET` | `/api/graph/summary/{project_id}` | Aggregated research summary JSON |
| `GET` | `/api/graph/summary/{project_id}/export` | Export summary as Markdown or HTML (`?format=markdown\|html`) |
| `GET` | `/api/graph/temporal/{project_id}/trends` | Entity lifecycle classification (Emerging/Stable/Declining) |
| `POST` | `/api/graph/{project_id}/paper-fit` | Paper fit analysis (DOI or title input) |

---

## New Files

| File | Description |
|------|-------------|
| `backend/evaluation/auto_ground_truth.py` | Auto-generates test queries from project entities |
| `backend/graph/report_generator.py` | Markdown report generator (연구 지형 리포트) |
| `backend/graph/paper_fit_analyzer.py` | PaperFitAnalyzer: embeddings, pgvector search, community mapping |
| `frontend/components/graph/ResearchReport.tsx` | In-app research report viewer with export |
| `frontend/components/graph/TemporalDashboard.tsx` | Temporal lifecycle dashboard (Emerging/Stable/Declining) |
| `frontend/components/graph/PaperFitPanel.tsx` | Paper fit input + results panel |

---

## Modified Files

| File | Changes |
|------|---------|
| `backend/routers/graph.py` | 5 new endpoints (summary, summary/export, temporal/trends, paper-fit, retrieval eval) |
| `backend/routers/evaluation.py` | Retrieval evaluation endpoint wired to auto_ground_truth |
| `frontend/components/graph/Graph3D.tsx` | Toolbar 13→6 buttons, Paper Fit button added, weak edge fade |
| `frontend/components/graph/KnowledgeGraph3D.tsx` | ViewMode extended, Summary tab (6th), PaperFitPanel integration |
| `frontend/components/graph/InsightHUD.tsx` | Redesigned: modularity + interpretation badge + entity quality section |
| `frontend/store/graphStore.ts` | `max_nodes` default 2000→500, label defaults updated |
| `frontend/types/graph.ts` | ViewMode: added `'summary'` literal type |
| `frontend/lib/api.ts` | API client methods for new endpoints |
| `frontend/components/graph/TemporalViewMode.tsx` | TemporalDashboard integration |

---

## Technical

- **16 files changed** (6 new + 10 modified), +3108/-230 lines
- **0 TypeScript errors** (`npx tsc --noEmit`)
- **260 pytest passing**
- **No database migrations required**
- **No new environment variables**
- **No breaking changes** (removed toolbar buttons are internal UI only; all API endpoints are additive)

---

## View Modes

| Mode | Tab | Color Theme | Description |
|------|-----|-------------|-------------|
| 3D | 1st | Teal | Full knowledge graph with Three.js physics |
| Topic | 2nd | Purple | D3.js community clustering |
| Gaps | 3rd | Amber | Research gap identification + bridge hypotheses |
| Citations | 4th | Blue | Citation network view |
| Temporal | 5th | Orange | Temporal co-citation trends |
| **Summary** | **6th** | **Emerald** | **Executive research report + export** |

---

## Deployment

- **Backend**: Auto-deploys via Render (push to `origin main`)
- **Frontend**: Auto-deploys via Vercel (push to `origin main`)
- **Database**: No migrations required
- **Environment**: No new env vars
- **Breaking Changes**: None
