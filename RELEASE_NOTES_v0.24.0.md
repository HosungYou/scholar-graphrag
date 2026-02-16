# Release Notes v0.24.0 — P0-P2 Comprehensive Fix

> **Version**: 0.24.0 | **Date**: 2026-02-16
> **Codename**: Foundation Repair

## Summary

Fixes critical issues preventing v0.21-v0.23 strategic evolution code from functioning: migration conflicts, disabled feature flags, missing relationship enums, broken cluster labels, dead community detection code, and invisible edges.

## Critical Fixes

### Database Migration Conflicts (Task 1)
- **Problem**: Migration files 004B, 005B, 006B had duplicate numbers with existing migrations → never executed
- **Fix**: Renamed to 022, 023, 024; created 025_p0_comprehensive_fix.sql for missing relationship enums
- **Impact**: Entity deduplication, lexical graph schema, and community trace features now deployable

### Missing Relationship Types (Task 7)
- **Problem**: `REPORTS_FINDING`, `ADDRESSES_PROBLEM`, `PROPOSES_INNOVATION` used in pdf_importer.py but not in DB enum → silent data loss
- **Fix**: Added to PostgreSQL enum (migration 025) and frontend RelationshipType
- **Impact**: PDF imports now correctly store all relationship types

## Feature Activation

### Feature Flags Default True (Task 2)
- `lexical_graph_v1`: Section-aware entity extraction with evidence spans
- `hybrid_trace_v1`: Retrieval trace with step-by-step reasoning paths
- `topic_lod_default`: Level-of-Detail for 500+ node graphs

## Improvements

### Visualization API: paper_count (Task 3)
- Nodes now include `paper_count` derived from `source_paper_ids` array length
- Enables paper frequency visualization in frontend node sizing
- Default fallback: 1 (for entities without source tracking)

### Cluster Label LLM Fix (Task 4)
- Timeout: 5s → 15s (accommodates cold-start LLM providers)
- Retry: 1 automatic retry with 1s backoff
- Fallback: Top 3 keywords joined with " / " (never generic "Cluster N")
- Logging: Final failure escalated to ERROR level

### Leiden Community Detection (Task 5)
- `cluster_concepts()` now tries Leiden algorithm (igraph + leidenalg) before K-means
- Graph topology-based clustering produces more meaningful communities
- Graceful fallback: if Leiden unavailable or fails → K-means (existing behavior)
- `CommunityDetector` and `CommunitySummarizer` connected (previously dead code)

### Edge Visibility (Task 6)
- **3D View (Graph3D.tsx)**:
  - Weak edges: 15% → 35% opacity
  - Medium edges: 35% → 55% opacity
  - Non-connected (selection): 3% → 15% opacity
  - Default floor: 8% → 20% opacity
  - Cross-cluster blend: 12% → 25% minimum
- **Topic View (TopicViewMode.tsx)**:
  - Weak connections: 30% → 50% opacity
  - Color: #666 → #8b949e (brighter gray)

### Frontend Defaults (Task 8)
- `max_nodes`: 1000 → 2000 (API default, max still 5000)
- Default `viewMode`: '3d' → 'topic' (topic clustering as primary view)
- LOD already enabled by default (confirmed)

## New UI: Edge Type Filter (Task 7)
- FilterPanel now includes "Edge Types" section
- All/None toggle controls
- Scrollable list with left accent bar for active types
- Consistent with existing entity type filter design pattern

## Technical Details
- **Files changed**: 13
- **Lines**: +215 / -50
- **New migration**: 025_p0_comprehensive_fix.sql
- **Renamed migrations**: 004→022, 005→023, 006→024
- **No new environment variables**
- **No breaking API changes**
- **Build**: 0 TypeScript errors, 0 Python syntax errors

## Post-Deployment Steps (Manual)

1. **Run migrations in Supabase SQL Editor** (in order):
   - `022_entity_deduplication.sql`
   - `023_lexical_graph_schema.sql`
   - `024_community_trace.sql`
   - `025_p0_comprehensive_fix.sql`
2. Refresh gap analysis on existing projects (triggers cluster re-labeling)
3. Test 500+ PDF project with new max_nodes=2000

## Migration Guide

No code changes needed by users. After deploying:
1. Run the 4 SQL migrations above
2. All features activate automatically (flags default True)
3. Existing data is preserved; new features apply on next import/refresh
