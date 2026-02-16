-- Migration 005: Lexical Graph Schema Extension
-- Phase 1 (v0.21) - Adds entity/relationship types and extraction metadata columns
-- All operations are idempotent

BEGIN;

-- ============================================================================
-- 1. Add new entity_type enum values: 'Result', 'Claim'
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'Result'
        AND enumtypid = 'entity_type'::regtype
    ) THEN
        ALTER TYPE entity_type ADD VALUE 'Result';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'Claim'
        AND enumtypid = 'entity_type'::regtype
    ) THEN
        ALTER TYPE entity_type ADD VALUE 'Claim';
    END IF;
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'Could not add entity_type enum values: %', SQLERRM;
END;
$$;

-- ============================================================================
-- 2. Add new relationship_type enum values: 'USED_IN', 'EVALUATED_ON', 'REPORTS'
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'USED_IN'
        AND enumtypid = 'relationship_type'::regtype
    ) THEN
        ALTER TYPE relationship_type ADD VALUE 'USED_IN';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'EVALUATED_ON'
        AND enumtypid = 'relationship_type'::regtype
    ) THEN
        ALTER TYPE relationship_type ADD VALUE 'EVALUATED_ON';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'REPORTS'
        AND enumtypid = 'relationship_type'::regtype
    ) THEN
        ALTER TYPE relationship_type ADD VALUE 'REPORTS';
    END IF;
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'Could not add relationship_type enum values: %', SQLERRM;
END;
$$;

-- ============================================================================
-- 3. Add extraction_section column to entities
-- ============================================================================
-- Tracks which paper section the entity was extracted from
ALTER TABLE entities
ADD COLUMN IF NOT EXISTS extraction_section VARCHAR(50);

COMMENT ON COLUMN entities.extraction_section IS
    'Paper section where entity was extracted: methodology, results, discussion, introduction, abstract';

-- ============================================================================
-- 4. Add evidence_spans column to entities
-- ============================================================================
-- Array of verbatim text spans that support the entity extraction
ALTER TABLE entities
ADD COLUMN IF NOT EXISTS evidence_spans TEXT[] DEFAULT '{}';

COMMENT ON COLUMN entities.evidence_spans IS
    'Verbatim text spans from source paper supporting this entity extraction';

-- ============================================================================
-- 5. Add evidence_spans column to relationships
-- ============================================================================
ALTER TABLE relationships
ADD COLUMN IF NOT EXISTS evidence_spans TEXT[] DEFAULT '{}';

COMMENT ON COLUMN relationships.evidence_spans IS
    'Verbatim text spans from source paper supporting this relationship';

-- ============================================================================
-- 6. Add has_full_text column to entities (for Paper entities)
-- ============================================================================
ALTER TABLE entities
ADD COLUMN IF NOT EXISTS has_full_text BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN entities.has_full_text IS
    'Whether full text is available for this Paper entity';

-- ============================================================================
-- 7. Add full_text_sections column to entities (for Paper entities)
-- ============================================================================
ALTER TABLE entities
ADD COLUMN IF NOT EXISTS full_text_sections TEXT[] DEFAULT '{}';

COMMENT ON COLUMN entities.full_text_sections IS
    'List of available sections in the full text (e.g., introduction, methodology, results, discussion)';

-- ============================================================================
-- 8. Track migration
-- ============================================================================
INSERT INTO schema_migrations (version, description) VALUES
    ('005_lexical_graph_schema', 'Lexical graph schema extension - Result/Claim types, extraction metadata')
ON CONFLICT (version) DO NOTHING;

COMMIT;
