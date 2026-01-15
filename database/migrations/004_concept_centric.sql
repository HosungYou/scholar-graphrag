-- ScholaRAG_Graph Database Schema
-- Migration 004: Concept-Centric Knowledge Graph Redesign
--
-- This migration transforms the graph from Paper/Author-centric to Concept-centric:
-- - Concepts become primary nodes with centrality metrics
-- - Papers/Authors become metadata (not visualized as nodes)
-- - Adds Gap Detection support with structural_gaps table

-- ============================================================================
-- 1. Add Centrality Metrics to Entities
-- ============================================================================

-- Add centrality columns for graph analysis
ALTER TABLE entities
ADD COLUMN IF NOT EXISTS centrality_degree FLOAT DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS centrality_betweenness FLOAT DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS centrality_pagerank FLOAT DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS cluster_id INTEGER,
ADD COLUMN IF NOT EXISTS is_visualized BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS source_paper_ids UUID[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS definition TEXT;

-- Set Paper and Author entities to NOT be visualized (metadata only)
UPDATE entities SET is_visualized = FALSE WHERE entity_type IN ('Paper', 'Author');

-- Concepts, Methods, Findings are visualized
UPDATE entities SET is_visualized = TRUE WHERE entity_type IN ('Concept', 'Method', 'Finding');

-- Create index for visualization queries
CREATE INDEX IF NOT EXISTS idx_entities_visualized ON entities(is_visualized) WHERE is_visualized = TRUE;
CREATE INDEX IF NOT EXISTS idx_entities_cluster ON entities(cluster_id);

-- ============================================================================
-- 2. Add New Entity Types for Academic Knowledge Graph
-- ============================================================================

-- Extend entity_type enum with new academic types
DO $$
BEGIN
    -- Add Problem type (research questions/problems)
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'Problem' AND enumtypid = 'entity_type'::regtype) THEN
        ALTER TYPE entity_type ADD VALUE 'Problem';
    END IF;

    -- Add Dataset type
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'Dataset' AND enumtypid = 'entity_type'::regtype) THEN
        ALTER TYPE entity_type ADD VALUE 'Dataset';
    END IF;

    -- Add Metric type (evaluation metrics)
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'Metric' AND enumtypid = 'entity_type'::regtype) THEN
        ALTER TYPE entity_type ADD VALUE 'Metric';
    END IF;

    -- Add Innovation type (novel contributions)
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'Innovation' AND enumtypid = 'entity_type'::regtype) THEN
        ALTER TYPE entity_type ADD VALUE 'Innovation';
    END IF;

    -- Add Limitation type
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'Limitation' AND enumtypid = 'entity_type'::regtype) THEN
        ALTER TYPE entity_type ADD VALUE 'Limitation';
    END IF;
END $$;

-- ============================================================================
-- 3. Add New Relationship Types
-- ============================================================================

-- Extend relationship_type enum
DO $$
BEGIN
    -- Concept-Concept relationships
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CO_OCCURS_WITH' AND enumtypid = 'relationship_type'::regtype) THEN
        ALTER TYPE relationship_type ADD VALUE 'CO_OCCURS_WITH';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PREREQUISITE_OF' AND enumtypid = 'relationship_type'::regtype) THEN
        ALTER TYPE relationship_type ADD VALUE 'PREREQUISITE_OF';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'BRIDGES_GAP' AND enumtypid = 'relationship_type'::regtype) THEN
        ALTER TYPE relationship_type ADD VALUE 'BRIDGES_GAP';
    END IF;

    -- Method-Concept relationships
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'APPLIES_TO' AND enumtypid = 'relationship_type'::regtype) THEN
        ALTER TYPE relationship_type ADD VALUE 'APPLIES_TO';
    END IF;

    -- Finding-Concept relationships (SUPPORTS already exists)
    -- CONTRADICTS already exists

    -- Problem relationships
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ADDRESSES' AND enumtypid = 'relationship_type'::regtype) THEN
        ALTER TYPE relationship_type ADD VALUE 'ADDRESSES';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'EVALUATES_WITH' AND enumtypid = 'relationship_type'::regtype) THEN
        ALTER TYPE relationship_type ADD VALUE 'EVALUATES_WITH';
    END IF;
END $$;

-- ============================================================================
-- 4. Structural Gaps Table (InfraNodus-style Gap Detection)
-- ============================================================================

CREATE TABLE IF NOT EXISTS structural_gaps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

    -- Gap identification
    cluster_a_id INTEGER NOT NULL,
    cluster_b_id INTEGER NOT NULL,
    gap_strength FLOAT NOT NULL DEFAULT 0.0,  -- 0 = strong gap, 1 = well connected

    -- Representative concepts from each cluster
    concept_a_ids UUID[] NOT NULL DEFAULT '{}',
    concept_b_ids UUID[] NOT NULL DEFAULT '{}',

    -- AI-generated bridging suggestions
    suggested_bridge_concepts TEXT[],
    suggested_research_questions TEXT[],

    -- Gap status
    status VARCHAR(20) DEFAULT 'detected' CHECK (status IN ('detected', 'explored', 'bridged', 'dismissed')),

    -- Metadata
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gaps_project ON structural_gaps(project_id);
CREATE INDEX IF NOT EXISTS idx_gaps_strength ON structural_gaps(gap_strength);
CREATE INDEX IF NOT EXISTS idx_gaps_status ON structural_gaps(status);

-- Unique constraint: one gap per cluster pair per project
CREATE UNIQUE INDEX IF NOT EXISTS idx_gaps_unique
    ON structural_gaps(project_id, LEAST(cluster_a_id, cluster_b_id), GREATEST(cluster_a_id, cluster_b_id));

CREATE TRIGGER update_gaps_updated_at
    BEFORE UPDATE ON structural_gaps
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 5. Concept Clusters Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS concept_clusters (
    id SERIAL PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

    -- Cluster metadata
    name VARCHAR(255),  -- Auto-generated or user-defined cluster name
    color VARCHAR(7),   -- Hex color for visualization (#RRGGBB)

    -- Cluster statistics
    concept_count INTEGER DEFAULT 0,
    avg_centrality FLOAT DEFAULT 0.0,

    -- Cluster centroid (average embedding)
    centroid vector(1536),

    -- Top keywords for cluster description
    keywords TEXT[],

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clusters_project ON concept_clusters(project_id);

-- ============================================================================
-- 6. Paper Metadata Table (Papers are NOT nodes, just metadata)
-- ============================================================================

CREATE TABLE IF NOT EXISTS paper_metadata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

    -- Paper identification
    paper_id VARCHAR(255),  -- Original ScholaRAG paper_id
    doi VARCHAR(255),
    title TEXT NOT NULL,

    -- Authors as JSONB array (not separate nodes)
    authors JSONB DEFAULT '[]',  -- [{name, affiliation, orcid}]

    -- Paper metadata
    abstract TEXT,
    year INTEGER,
    source VARCHAR(100),
    citation_count INTEGER DEFAULT 0,
    pdf_url TEXT,

    -- Screening status from ScholaRAG
    screening_status VARCHAR(50),
    relevance_score FLOAT,

    -- Extracted concepts (references to entities)
    extracted_concept_ids UUID[] DEFAULT '{}',
    extracted_method_ids UUID[] DEFAULT '{}',
    extracted_finding_ids UUID[] DEFAULT '{}',

    -- Full-text embedding for semantic search
    embedding vector(1536),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paper_meta_project ON paper_metadata(project_id);
CREATE INDEX IF NOT EXISTS idx_paper_meta_doi ON paper_metadata(doi);
CREATE INDEX IF NOT EXISTS idx_paper_meta_year ON paper_metadata(year);
CREATE INDEX IF NOT EXISTS idx_paper_meta_embedding ON paper_metadata
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- 7. Useful Views for Concept-Centric Queries
-- ============================================================================

-- View: Concepts with paper counts and centrality
CREATE OR REPLACE VIEW concept_overview AS
SELECT
    e.id,
    e.name,
    e.definition,
    e.properties,
    e.centrality_degree,
    e.centrality_betweenness,
    e.centrality_pagerank,
    e.cluster_id,
    cc.name AS cluster_name,
    cc.color AS cluster_color,
    array_length(e.source_paper_ids, 1) AS paper_count
FROM entities e
LEFT JOIN concept_clusters cc ON e.cluster_id = cc.id
WHERE e.entity_type = 'Concept'
AND e.is_visualized = TRUE
ORDER BY e.centrality_pagerank DESC;

-- View: Gaps with cluster info
CREATE OR REPLACE VIEW gap_overview AS
SELECT
    g.id,
    g.project_id,
    g.gap_strength,
    g.status,
    ca.name AS cluster_a_name,
    ca.color AS cluster_a_color,
    cb.name AS cluster_b_name,
    cb.color AS cluster_b_color,
    g.suggested_research_questions,
    g.detected_at
FROM structural_gaps g
LEFT JOIN concept_clusters ca ON g.cluster_a_id = ca.id
LEFT JOIN concept_clusters cb ON g.cluster_b_id = cb.id
WHERE g.status != 'dismissed'
ORDER BY g.gap_strength ASC;  -- Strongest gaps first (lower = less connected)

-- ============================================================================
-- 8. Functions for Gap Detection
-- ============================================================================

-- Function: Calculate concept co-occurrence strength
CREATE OR REPLACE FUNCTION calculate_cooccurrence_strength(
    concept_a_id UUID,
    concept_b_id UUID
) RETURNS FLOAT AS $$
DECLARE
    shared_papers INTEGER;
    total_papers_a INTEGER;
    total_papers_b INTEGER;
    jaccard FLOAT;
BEGIN
    -- Get papers for concept A
    SELECT array_length(source_paper_ids, 1) INTO total_papers_a
    FROM entities WHERE id = concept_a_id;

    -- Get papers for concept B
    SELECT array_length(source_paper_ids, 1) INTO total_papers_b
    FROM entities WHERE id = concept_b_id;

    -- Count shared papers
    SELECT COUNT(*) INTO shared_papers
    FROM (
        SELECT UNNEST(source_paper_ids) AS paper_id
        FROM entities WHERE id = concept_a_id
        INTERSECT
        SELECT UNNEST(source_paper_ids) AS paper_id
        FROM entities WHERE id = concept_b_id
    ) shared;

    -- Jaccard similarity
    IF (total_papers_a + total_papers_b - shared_papers) = 0 THEN
        RETURN 0.0;
    END IF;

    jaccard := shared_papers::FLOAT / (total_papers_a + total_papers_b - shared_papers);
    RETURN jaccard;
END;
$$ LANGUAGE plpgsql;

-- Function: Find bridging concepts between clusters
CREATE OR REPLACE FUNCTION find_bridge_concepts(
    target_project_id UUID,
    cluster_a INTEGER,
    cluster_b INTEGER,
    limit_count INTEGER DEFAULT 5
) RETURNS TABLE (
    concept_id UUID,
    concept_name VARCHAR,
    bridge_score FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.name,
        -- Concepts with high betweenness that relate to both clusters
        e.centrality_betweenness * (
            CASE WHEN e.cluster_id = cluster_a THEN 0.5
                 WHEN e.cluster_id = cluster_b THEN 0.5
                 ELSE 1.0 END
        ) AS bridge_score
    FROM entities e
    WHERE e.project_id = target_project_id
    AND e.entity_type = 'Concept'
    AND e.centrality_betweenness > 0.1  -- Only high-betweenness nodes
    ORDER BY bridge_score DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. Migration Complete Marker
-- ============================================================================

-- Insert migration record
INSERT INTO import_jobs (id, status, progress, message, created_at, updated_at)
VALUES (
    uuid_generate_v4(),
    'completed',
    1.0,
    'Migration 004: Concept-centric schema applied',
    NOW(),
    NOW()
) ON CONFLICT DO NOTHING;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 004: Concept-centric knowledge graph schema applied successfully';
END $$;
