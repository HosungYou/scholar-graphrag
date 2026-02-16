-- Migration: 019_chunk_entity_provenance.sql
-- Description: Add MENTIONS to relationship_type enum and chunk-entity provenance support
-- Version: v0.15.0
-- Phase: 7A - Chunk->Entity Provenance

-- ============================================================================
-- 1. Add MENTIONS to relationship_type enum
-- ============================================================================
-- MENTIONS represents the provenance link: "this entity was extracted from this chunk"
-- While we store chunk provenance in entity properties (source_chunk_ids),
-- the enum value is reserved for future use when chunk-entity edges can be
-- stored directly (e.g., if chunks become first-class graph nodes).

ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'MENTIONS';

-- ============================================================================
-- 2. Index for efficient MENTIONS lookups (future use)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_relationships_mentions
    ON relationships(relationship_type, source_id)
    WHERE relationship_type = 'MENTIONS';

-- ============================================================================
-- 3. Index for efficient entity properties JSONB queries on source_chunk_ids
-- ============================================================================
-- Enables fast lookup of entities by their source_chunk_ids property

CREATE INDEX IF NOT EXISTS idx_entities_source_chunk_ids
    ON entities USING gin ((properties->'source_chunk_ids'))
    WHERE properties ? 'source_chunk_ids';

-- ============================================================================
-- 4. Helper function: Get chunks that mention a specific entity
-- ============================================================================

CREATE OR REPLACE FUNCTION get_entity_source_chunks(
    target_entity_id UUID,
    max_chunks INTEGER DEFAULT 10
)
RETURNS TABLE (
    chunk_id UUID,
    text TEXT,
    section_type VARCHAR(50),
    paper_id UUID,
    paper_title TEXT,
    paper_year INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH entity_chunk_ids AS (
        SELECT jsonb_array_elements_text(properties->'source_chunk_ids')::UUID AS cid
        FROM entities
        WHERE id = target_entity_id
          AND properties ? 'source_chunk_ids'
    )
    SELECT
        sc.id AS chunk_id,
        sc.text,
        sc.section_type,
        pm.id AS paper_id,
        pm.title AS paper_title,
        pm.year AS paper_year
    FROM entity_chunk_ids eci
    JOIN semantic_chunks sc ON sc.id = eci.cid
    LEFT JOIN paper_metadata pm ON sc.paper_id = pm.id
    ORDER BY sc.sequence_order
    LIMIT max_chunks;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. Helper function: Get shared chunks between two entities (for evidence)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_shared_entity_chunks(
    entity_a_id UUID,
    entity_b_id UUID,
    max_chunks INTEGER DEFAULT 5
)
RETURNS TABLE (
    chunk_id UUID,
    text TEXT,
    section_type VARCHAR(50),
    paper_id UUID,
    paper_title TEXT,
    paper_year INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH chunks_a AS (
        SELECT jsonb_array_elements_text(properties->'source_chunk_ids')::UUID AS cid
        FROM entities
        WHERE id = entity_a_id
          AND properties ? 'source_chunk_ids'
    ),
    chunks_b AS (
        SELECT jsonb_array_elements_text(properties->'source_chunk_ids')::UUID AS cid
        FROM entities
        WHERE id = entity_b_id
          AND properties ? 'source_chunk_ids'
    ),
    shared AS (
        SELECT chunks_a.cid FROM chunks_a
        INTERSECT
        SELECT chunks_b.cid FROM chunks_b
    )
    SELECT
        sc.id AS chunk_id,
        sc.text,
        sc.section_type,
        pm.id AS paper_id,
        pm.title AS paper_title,
        pm.year AS paper_year
    FROM shared s
    JOIN semantic_chunks sc ON sc.id = s.cid
    LEFT JOIN paper_metadata pm ON sc.paper_id = pm.id
    ORDER BY sc.sequence_order
    LIMIT max_chunks;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. Migration marker
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 019: Chunk-entity provenance (MENTIONS + source_chunk_ids) applied successfully';
END $$;
