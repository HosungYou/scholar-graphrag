-- Migration: 020_table_relationships.sql
-- Description: Add EVALUATED_ON to relationship_type enum for table-extracted data
-- Version: v0.15.0
-- Phase: 9A - Table Detection and Graph Conversion Pipeline

-- ============================================================================
-- 1. Add EVALUATED_ON to relationship_type enum
-- ============================================================================
-- EVALUATED_ON represents Method->Dataset relationships extracted from
-- SOTA comparison tables in academic PDFs, carrying metric_name and
-- metric_value as relationship properties.

ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'EVALUATED_ON';

-- ============================================================================
-- 2. Index for efficient EVALUATED_ON lookups
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_relationships_evaluated_on
    ON relationships(relationship_type, source_id)
    WHERE relationship_type = 'EVALUATED_ON';

-- ============================================================================
-- 3. Index for table-sourced entities (source_type = 'table' in properties)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_entities_source_type_table
    ON entities USING gin ((properties->'source_type'))
    WHERE properties ? 'source_type';

-- ============================================================================
-- 4. Migration marker
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 020: Table relationships (EVALUATED_ON) applied successfully';
END $$;
