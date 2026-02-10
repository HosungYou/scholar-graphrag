# Release Notes — v0.13.1: Gap Panel Display Fixes

**Date**: 2026-02-10

## Overview

v0.13.1 is a patch release fixing three UI/data-flow issues on the project detail page's Gap Analysis panel. No new features, no database migrations.

## Bug Fixes

### 1. Cluster Labels Show Descriptive Names (not "Cluster N")

**Problem**: Gap panel displayed "Cluster 3 → Cluster 4" instead of descriptive labels for projects imported before LLM labeling was added.

**Fix** (`frontend/components/graph/GapPanel.tsx`):
- 3-tier fallback in `getClusterLabel()`:
  1. LLM-generated `cluster.label` (with UUID guard to skip invalid labels)
  2. `cluster.concept_names` (top 3, joined with " / ")
  3. Names from `gaps` array (`cluster_a_names` / `cluster_b_names` — always populated)
  4. Final fallback: `Cluster N`

**Before**: `Cluster 3 → Cluster 4`
**After**: `Trust / Explainability / Fairness → Fine-tuning / Bias / Alignment`

### 2. InsightHUD Diversity Now Shows Correct Percentage

**Problem**: InsightHUD always showed "0%" diversity despite having 471 nodes across 4 clusters. Root cause: `ClusterResult.size` read from DB defaulted to 0 (migration 008 default), making entropy calculation return 0.

**Fix** (`backend/routers/graph.py`):
- When `row["size"]` is 0 or NULL, derive size from `len(row["concepts"] or [])`.

**Before**: `0%` diversity
**After**: Correct Shannon entropy-based percentage (e.g., `78%`)

### 3. Concept Cluster Chips Show Labels + Counts

**Problem**: Cluster chips in the sidebar showed only a number (e.g., "142") with no label, making them meaningless.

**Fix** (`frontend/components/graph/GapPanel.tsx`):
- Grid changed from 4-column to 2-column for readability
- Each chip now displays: color dot + truncated cluster label + right-aligned count
- Tooltip shows full label and concept count

**Before**: `[■ 142]` (number only, 4-col grid)
**After**: `[■ Trust / Explainability  142]` (label + count, 2-col grid)

## Files Changed

| File | Lines Changed | Description |
|------|---------------|-------------|
| `frontend/components/graph/GapPanel.tsx` | +22 / -5 | Label fallback + chip display |
| `backend/routers/graph.py` | +1 / -1 | Cluster size derivation |

## Deployment

| Service | Platform | Auto-Deploy |
|---------|----------|-------------|
| Frontend | Vercel | Yes (triggered by push) |
| Backend | Render (Docker) | **Manual** — deploy via Render Dashboard |

> **Reminder**: Backend auto-deploy is OFF (INFRA-006). Go to Render Dashboard → `scholarag-graph-docker` → Manual Deploy → "Deploy latest commit" to apply the backend fix.

## Verification Checklist

- [ ] Open any project → Gap panel shows descriptive cluster labels (not "Cluster N")
- [ ] InsightHUD shows non-zero diversity percentage
- [ ] Concept Clusters sidebar chips show names with counts
