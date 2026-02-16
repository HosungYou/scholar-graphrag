-- Migration 006: Community Detection + Retrieval Trace
-- Phase 2 (v0.22) - Community clustering enhancements and query trace cache
-- All operations are idempotent

BEGIN;

-- 1. Enhance concept_clusters table for Leiden community detection
ALTER TABLE concept_clusters ADD COLUMN IF NOT EXISTS detection_method VARCHAR(20) DEFAULT 'kmeans';
ALTER TABLE concept_clusters ADD COLUMN IF NOT EXISTS community_level INTEGER DEFAULT 0;
ALTER TABLE concept_clusters ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE concept_clusters ADD COLUMN IF NOT EXISTS parent_cluster_id INTEGER REFERENCES concept_clusters(id);
ALTER TABLE concept_clusters ADD COLUMN IF NOT EXISTS summary_updated_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN concept_clusters.detection_method IS 'Algorithm used: kmeans, leiden, louvain, connected_components';
COMMENT ON COLUMN concept_clusters.community_level IS 'Hierarchical level (0 = top level)';
COMMENT ON COLUMN concept_clusters.summary IS 'LLM-generated 2-3 sentence summary of the community';

-- 2. Query path cache for retrieval trace
CREATE TABLE IF NOT EXISTS query_path_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    query_hash VARCHAR(64) NOT NULL,
    trace JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ttl_seconds INTEGER DEFAULT 3600,
    UNIQUE(project_id, query_hash)
);

COMMENT ON TABLE query_path_cache IS 'Caches retrieval trace for repeated queries';

-- 3. Index for cache lookup
CREATE INDEX IF NOT EXISTS idx_query_path_cache_lookup
    ON query_path_cache(project_id, query_hash);

CREATE INDEX IF NOT EXISTS idx_query_path_cache_ttl
    ON query_path_cache(created_at);

-- 4. Track migration
-- Track in both migration tables for compatibility
INSERT INTO _migrations (name) VALUES ('024_community_trace.sql') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(255) PRIMARY KEY, description TEXT, applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW());
INSERT INTO schema_migrations (version, description) VALUES
    ('024_community_trace', 'Community detection enhancements and retrieval trace cache')
ON CONFLICT (version) DO NOTHING;

COMMIT;
