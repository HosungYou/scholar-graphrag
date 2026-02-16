-- Migration 004: Concept Extension for Concept-Centric Architecture
-- This migration extends the data model to support concept-centric knowledge graphs.

-- ============================================================================
-- 1. Concept Types Table
-- ============================================================================
-- Categorizes concepts into Theory, Technique, Domain, Variable, Measure
CREATE TABLE IF NOT EXISTS concept_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    parent_type_id UUID REFERENCES concept_types(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default concept types
INSERT INTO concept_types (name, description) VALUES
    ('Theory', 'Theoretical frameworks and conceptual models'),
    ('Technique', 'Specific methods, algorithms, or approaches'),
    ('Domain', 'Research domains or application areas'),
    ('Variable', 'Measurable variables in research'),
    ('Measure', 'Measurement instruments or metrics')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 2. Extend Entities Table
-- ============================================================================
-- Add columns for concept-centric features

-- Column for concept type classification (only for Concept entities)
ALTER TABLE entities
ADD COLUMN IF NOT EXISTS concept_type_id UUID REFERENCES concept_types(id);

-- Column for canonical concept reference (for normalization/deduplication)
ALTER TABLE entities
ADD COLUMN IF NOT EXISTS canonical_id UUID REFERENCES entities(id);

-- Column for aliases (synonyms, alternative names)
ALTER TABLE entities
ADD COLUMN IF NOT EXISTS aliases TEXT[] DEFAULT '{}';

-- Column for description (detailed explanation of the entity)
ALTER TABLE entities
ADD COLUMN IF NOT EXISTS description TEXT;

-- Column for confidence score from extraction
ALTER TABLE entities
ADD COLUMN IF NOT EXISTS confidence FLOAT DEFAULT 1.0;

-- Column for extraction source (llm, keyword, manual)
ALTER TABLE entities
ADD COLUMN IF NOT EXISTS extraction_source VARCHAR(50) DEFAULT 'manual';

-- Create index for concept type queries
CREATE INDEX IF NOT EXISTS idx_entities_concept_type
ON entities(concept_type_id) WHERE entity_type = 'Concept';

-- Create index for canonical concept lookups
CREATE INDEX IF NOT EXISTS idx_entities_canonical
ON entities(canonical_id) WHERE canonical_id IS NOT NULL;

-- ============================================================================
-- 3. Concept Aliases Table (for normalization)
-- ============================================================================
-- Tracks all known aliases for canonical concepts
CREATE TABLE IF NOT EXISTS concept_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_concept_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    alias VARCHAR(500) NOT NULL,
    source VARCHAR(100) DEFAULT 'manual', -- user, llm, import, manual
    confidence FLOAT DEFAULT 1.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(canonical_concept_id, alias)
);

-- Index for alias lookups
CREATE INDEX IF NOT EXISTS idx_concept_aliases_alias
ON concept_aliases(LOWER(alias));

CREATE INDEX IF NOT EXISTS idx_concept_aliases_canonical
ON concept_aliases(canonical_concept_id);

-- ============================================================================
-- 4. Extend Relationship Types
-- ============================================================================
-- Add new relationship types for concept hierarchy and operationalization

-- Check if relationship_type is an enum and add new values
DO $$
BEGIN
    -- Add IS_A relationship type
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'IS_A' AND enumtypid = 'relationship_type'::regtype) THEN
        ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'IS_A';
    END IF;

    -- Add PART_OF relationship type
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PART_OF' AND enumtypid = 'relationship_type'::regtype) THEN
        ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'PART_OF';
    END IF;

    -- Add OPERATIONALIZED_BY relationship type
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'OPERATIONALIZED_BY' AND enumtypid = 'relationship_type'::regtype) THEN
        ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'OPERATIONALIZED_BY';
    END IF;

    -- Add MEASURED_BY relationship type
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MEASURED_BY' AND enumtypid = 'relationship_type'::regtype) THEN
        ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'MEASURED_BY';
    END IF;

    -- Add EVOLVED_FROM relationship type (for concept evolution tracking)
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'EVOLVED_FROM' AND enumtypid = 'relationship_type'::regtype) THEN
        ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'EVOLVED_FROM';
    END IF;
EXCEPTION
    WHEN others THEN
        -- If relationship_type is not an enum, skip
        RAISE NOTICE 'Could not add enum values: %', SQLERRM;
END;
$$;

-- ============================================================================
-- 5. Migration Metadata
-- ============================================================================
-- Track applied migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(100) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    description TEXT
);

INSERT INTO schema_migrations (version, description) VALUES
    ('004_concept_extension', 'Concept-centric architecture extension')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- 6. Helper Views for Concept-Centric Queries
-- ============================================================================

-- View: All concepts with their type and paper count
CREATE OR REPLACE VIEW concept_summary AS
SELECT
    e.id,
    e.name,
    e.description,
    ct.name as concept_type,
    e.confidence,
    e.project_id,
    COUNT(DISTINCT r.source_id) as paper_count,
    ARRAY_AGG(DISTINCT ca.alias) FILTER (WHERE ca.alias IS NOT NULL) as aliases
FROM entities e
LEFT JOIN concept_types ct ON e.concept_type_id = ct.id
LEFT JOIN relationships r ON e.id = r.target_id AND r.relationship_type = 'DISCUSSES_CONCEPT'
LEFT JOIN concept_aliases ca ON e.id = ca.canonical_concept_id
WHERE e.entity_type = 'Concept'
GROUP BY e.id, e.name, e.description, ct.name, e.confidence, e.project_id;

-- View: Concept hierarchy (IS_A, PART_OF relationships)
CREATE OR REPLACE VIEW concept_hierarchy AS
SELECT
    parent.id as parent_id,
    parent.name as parent_name,
    child.id as child_id,
    child.name as child_name,
    r.relationship_type,
    r.properties
FROM entities parent
JOIN relationships r ON parent.id = r.target_id
JOIN entities child ON r.source_id = child.id
WHERE r.relationship_type IN ('IS_A', 'PART_OF')
AND parent.entity_type = 'Concept'
AND child.entity_type = 'Concept';

COMMENT ON VIEW concept_summary IS 'Summary of all concepts with paper counts and aliases';
COMMENT ON VIEW concept_hierarchy IS 'Hierarchical relationships between concepts';
