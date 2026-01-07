-- ScholaRAG_Graph Database Schema
-- Migration 003: Graph Tables (Entities & Relationships)

-- Entity types enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entity_type') THEN
        CREATE TYPE entity_type AS ENUM (
            'Paper',
            'Author',
            'Concept',
            'Method',
            'Finding'
        );
    END IF;
END $$;

-- Relationship types enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'relationship_type') THEN
        CREATE TYPE relationship_type AS ENUM (
            'AUTHORED_BY',
            'CITES',
            'DISCUSSES_CONCEPT',
            'USES_METHOD',
            'USES_DATASET',
            'SUPPORTS',
            'CONTRADICTS',
            'RELATED_TO',
            'AFFILIATED_WITH',
            'COLLABORATION'
        );
    END IF;
END $$;

-- Entities table (all node types unified)
CREATE TABLE IF NOT EXISTS entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    entity_type entity_type NOT NULL,
    name VARCHAR(500) NOT NULL,
    properties JSONB DEFAULT '{}',
    embedding vector(1536),  -- OpenAI text-embedding-3-small dimension
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for entities
CREATE INDEX IF NOT EXISTS idx_entities_project ON entities(project_id);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);

-- HNSW index for vector similarity search (faster than IVFFlat for smaller datasets)
CREATE INDEX IF NOT EXISTS idx_entities_embedding ON entities
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Full-text search index on name
CREATE INDEX IF NOT EXISTS idx_entities_name_trgm ON entities
    USING gin (name gin_trgm_ops);

-- GIN index on properties for JSONB queries
CREATE INDEX IF NOT EXISTS idx_entities_properties ON entities USING gin (properties);

CREATE TRIGGER update_entities_updated_at
    BEFORE UPDATE ON entities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Relationships table (edges)
CREATE TABLE IF NOT EXISTS relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    source_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    target_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    relationship_type relationship_type NOT NULL,
    properties JSONB DEFAULT '{}',
    weight FLOAT DEFAULT 1.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for relationships
CREATE INDEX IF NOT EXISTS idx_relationships_project ON relationships(project_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_id);

-- Composite index for graph traversal queries
CREATE INDEX IF NOT EXISTS idx_relationships_source_type ON relationships(source_id, relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationships_target_type ON relationships(target_id, relationship_type);

-- Prevent duplicate relationships
CREATE UNIQUE INDEX IF NOT EXISTS idx_relationships_unique
    ON relationships(source_id, target_id, relationship_type);

-- Enable trigram extension for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Useful views

-- View: Paper with author names
CREATE OR REPLACE VIEW papers_with_authors AS
SELECT
    p.id AS paper_id,
    p.name AS paper_title,
    p.properties AS paper_properties,
    array_agg(DISTINCT a.name) AS authors
FROM entities p
LEFT JOIN relationships r ON p.id = r.source_id AND r.relationship_type = 'AUTHORED_BY'
LEFT JOIN entities a ON r.target_id = a.id AND a.entity_type = 'Author'
WHERE p.entity_type = 'Paper'
GROUP BY p.id, p.name, p.properties;

-- View: Concept frequency (for research gap analysis)
CREATE OR REPLACE VIEW concept_frequency AS
SELECT
    c.id AS concept_id,
    c.name AS concept_name,
    c.properties AS concept_properties,
    COUNT(r.id) AS paper_count
FROM entities c
LEFT JOIN relationships r ON c.id = r.target_id AND r.relationship_type = 'DISCUSSES_CONCEPT'
WHERE c.entity_type = 'Concept'
GROUP BY c.id, c.name, c.properties
ORDER BY paper_count DESC;

-- Function: Find similar papers by shared concepts
CREATE OR REPLACE FUNCTION find_similar_papers(paper_uuid UUID, limit_count INT DEFAULT 10)
RETURNS TABLE (
    related_paper_id UUID,
    related_paper_name VARCHAR,
    shared_concept_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH paper_concepts AS (
        SELECT target_id AS concept_id
        FROM relationships
        WHERE source_id = paper_uuid
          AND relationship_type = 'DISCUSSES_CONCEPT'
    )
    SELECT
        r2.source_id AS related_paper_id,
        e.name AS related_paper_name,
        COUNT(DISTINCT r2.target_id) AS shared_concept_count
    FROM relationships r2
    JOIN paper_concepts pc ON r2.target_id = pc.concept_id
    JOIN entities e ON r2.source_id = e.id
    WHERE r2.relationship_type = 'DISCUSSES_CONCEPT'
      AND r2.source_id != paper_uuid
      AND e.entity_type = 'Paper'
    GROUP BY r2.source_id, e.name
    ORDER BY shared_concept_count DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Find research gaps (concepts with few papers)
CREATE OR REPLACE FUNCTION find_research_gaps(project_uuid UUID, min_papers INT DEFAULT 3)
RETURNS TABLE (
    concept_id UUID,
    concept_name VARCHAR,
    paper_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.name,
        COUNT(r.id) AS paper_count
    FROM entities c
    LEFT JOIN relationships r ON c.id = r.target_id AND r.relationship_type = 'DISCUSSES_CONCEPT'
    WHERE c.entity_type = 'Concept'
      AND c.project_id = project_uuid
    GROUP BY c.id, c.name
    HAVING COUNT(r.id) < min_papers
    ORDER BY paper_count ASC;
END;
$$ LANGUAGE plpgsql;

-- Function: Vector similarity search
CREATE OR REPLACE FUNCTION search_similar_entities(
    query_embedding vector(1536),
    target_project_id UUID,
    target_entity_type entity_type DEFAULT NULL,
    limit_count INT DEFAULT 10
)
RETURNS TABLE (
    entity_id UUID,
    entity_name VARCHAR,
    entity_type entity_type,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.name,
        e.entity_type,
        1 - (e.embedding <=> query_embedding) AS similarity
    FROM entities e
    WHERE e.project_id = target_project_id
      AND e.embedding IS NOT NULL
      AND (target_entity_type IS NULL OR e.entity_type = target_entity_type)
    ORDER BY e.embedding <=> query_embedding
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;
