-- Migration: 021_cross_paper_links.sql
-- Description: Add SAME_AS relationship type for cross-paper entity linking
-- Version: v0.15.0
-- Phase: 10B - Cross-Paper Entity Linking

-- ============================================================================
-- 1. Add SAME_AS to relationship_type enum
-- ============================================================================
-- SAME_AS represents identity links between entities extracted from different
-- papers that share the same canonical name.  Created by the second-pass
-- cross_paper_entity_linking() in EntityResolutionService.

ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'SAME_AS';

-- ============================================================================
-- 2. Index for efficient cross-paper entity grouping queries
-- ============================================================================
-- Speeds up the GROUP BY (name, entity_type) query used by
-- cross_paper_entity_linking() to find entities shared across papers.

CREATE INDEX IF NOT EXISTS idx_entities_name_type
    ON entities(name, entity_type)
    WHERE entity_type IN ('Method', 'Dataset', 'Concept');

-- ============================================================================
-- 3. Index for SAME_AS relationship lookups
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_relationships_same_as
    ON relationships(source_id, target_id)
    WHERE relationship_type = 'SAME_AS';

-- ============================================================================
-- 4. Migration marker
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 021: Cross-paper entity links (SAME_AS) applied successfully';
END $$;
