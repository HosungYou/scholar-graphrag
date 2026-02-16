-- Migration 005: Evidence Layer for Traceability
-- This migration adds claims and snippets tables for evidence tracking.

-- ============================================================================
-- 1. Claims Table
-- ============================================================================
-- Structured claims/assertions extracted from papers
CREATE TABLE IF NOT EXISTS claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    statement TEXT NOT NULL,
    claim_type VARCHAR(50) NOT NULL DEFAULT 'finding', -- hypothesis, finding, conclusion, implication
    confidence FLOAT DEFAULT 0.8,
    source_paper_id UUID REFERENCES entities(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for project queries
CREATE INDEX IF NOT EXISTS idx_claims_project ON claims(project_id);

-- Index for source paper queries
CREATE INDEX IF NOT EXISTS idx_claims_source_paper ON claims(source_paper_id);

-- Index for claim type filtering
CREATE INDEX IF NOT EXISTS idx_claims_type ON claims(claim_type);

-- ============================================================================
-- 2. Snippets Table
-- ============================================================================
-- Exact text snippets from papers supporting claims
CREATE TABLE IF NOT EXISTS snippets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID REFERENCES claims(id) ON DELETE CASCADE,
    paper_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    section VARCHAR(100), -- abstract, introduction, methods, results, discussion, conclusion
    page_number INT,
    start_offset INT, -- character offset in source
    end_offset INT,
    citation_intent VARCHAR(50) DEFAULT 'supporting', -- supporting, contrasting, mentioning
    confidence FLOAT DEFAULT 0.8,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for claim lookups
CREATE INDEX IF NOT EXISTS idx_snippets_claim ON snippets(claim_id);

-- Index for paper lookups
CREATE INDEX IF NOT EXISTS idx_snippets_paper ON snippets(paper_id);

-- Index for section filtering
CREATE INDEX IF NOT EXISTS idx_snippets_section ON snippets(section);

-- Index for citation intent filtering
CREATE INDEX IF NOT EXISTS idx_snippets_intent ON snippets(citation_intent);

-- Full-text search on snippet text
CREATE INDEX IF NOT EXISTS idx_snippets_text_search
ON snippets USING gin(to_tsvector('english', text));

-- ============================================================================
-- 3. Claim-Concept Links Table
-- ============================================================================
-- Links claims to the concepts they relate to
CREATE TABLE IF NOT EXISTS claim_concepts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    concept_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    relationship VARCHAR(50) DEFAULT 'discusses', -- discusses, supports, contradicts, extends
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(claim_id, concept_id)
);

-- Index for claim lookups
CREATE INDEX IF NOT EXISTS idx_claim_concepts_claim ON claim_concepts(claim_id);

-- Index for concept lookups
CREATE INDEX IF NOT EXISTS idx_claim_concepts_concept ON claim_concepts(concept_id);

-- ============================================================================
-- 4. Extend Relationship Types for Evidence
-- ============================================================================
DO $$
BEGIN
    -- Add EVIDENCED_BY relationship type (Concept -> Claim)
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'EVIDENCED_BY' AND enumtypid = 'relationship_type'::regtype) THEN
        ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'EVIDENCED_BY';
    END IF;

    -- Add CITED_IN relationship type (Claim -> Snippet)
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CITED_IN' AND enumtypid = 'relationship_type'::regtype) THEN
        ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'CITED_IN';
    END IF;
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'Could not add enum values: %', SQLERRM;
END;
$$;

-- ============================================================================
-- 5. Helper Views for Evidence Queries
-- ============================================================================

-- View: Claims with their supporting snippets and source papers
CREATE OR REPLACE VIEW claim_evidence AS
SELECT
    c.id as claim_id,
    c.statement,
    c.claim_type,
    c.confidence as claim_confidence,
    c.project_id,
    e.id as paper_id,
    e.name as paper_title,
    COUNT(s.id) as snippet_count,
    ARRAY_AGG(DISTINCT s.section) FILTER (WHERE s.section IS NOT NULL) as sections_cited
FROM claims c
LEFT JOIN entities e ON c.source_paper_id = e.id
LEFT JOIN snippets s ON c.id = s.claim_id
GROUP BY c.id, c.statement, c.claim_type, c.confidence, c.project_id, e.id, e.name;

-- View: Concept evidence summary
CREATE OR REPLACE VIEW concept_evidence AS
SELECT
    e.id as concept_id,
    e.name as concept_name,
    e.project_id,
    COUNT(DISTINCT cc.claim_id) as claim_count,
    COUNT(DISTINCT s.id) as snippet_count,
    COUNT(DISTINCT s.paper_id) as paper_count,
    ARRAY_AGG(DISTINCT c.claim_type) FILTER (WHERE c.claim_type IS NOT NULL) as claim_types
FROM entities e
LEFT JOIN claim_concepts cc ON e.id = cc.concept_id
LEFT JOIN claims c ON cc.claim_id = c.id
LEFT JOIN snippets s ON c.id = s.claim_id
WHERE e.entity_type = 'Concept'
GROUP BY e.id, e.name, e.project_id;

COMMENT ON VIEW claim_evidence IS 'Claims with their supporting evidence from papers';
COMMENT ON VIEW concept_evidence IS 'Concepts with their evidence counts';

-- ============================================================================
-- 6. Migration Metadata
-- ============================================================================
INSERT INTO schema_migrations (version, description) VALUES
    ('005_evidence_layer', 'Evidence layer with claims and snippets')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- 7. Update Trigger for claims.updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_claims_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_claims_updated_at ON claims;
CREATE TRIGGER trigger_claims_updated_at
    BEFORE UPDATE ON claims
    FOR EACH ROW
    EXECUTE FUNCTION update_claims_updated_at();
