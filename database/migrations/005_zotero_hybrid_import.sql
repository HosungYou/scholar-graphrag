-- ============================================================================
-- Migration 005: Zotero Hybrid Import Schema
-- ============================================================================
-- Purpose: Support Hybrid Import from Zotero with bidirectional sync
--
-- Features:
-- 1. Track Zotero metadata (item_key, collection_key, version)
-- 2. Source tracking (NodeSource: zotero/pdf_llm/merged)
-- 3. Incremental sync support with version tracking
-- 4. Conflict resolution for merged entities
-- 5. Sync history and audit trail
--
-- Design Philosophy:
-- - Zotero is ONE SOURCE of data (among PDF LLM extraction, manual input)
-- - Entities can have multiple sources (merged)
-- - Changes tracked for bidirectional sync
-- - Collection hierarchy preserved for organization
-- ============================================================================

-- ============================================================================
-- 1. Node Source Enum (Tracks origin of data)
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'node_source') THEN
        CREATE TYPE node_source AS ENUM (
            'zotero',           -- Imported from Zotero
            'pdf_llm',          -- Extracted from PDF via LLM
            'manual',           -- Manually created by user
            'merged',           -- Merged from multiple sources
            'auto_inferred'     -- Inferred by system (e.g., relationships)
        );
    END IF;
END $$;

-- ============================================================================
-- 2. Extend entities table with Zotero tracking
-- ============================================================================

-- Add Zotero tracking columns to entities
ALTER TABLE entities ADD COLUMN IF NOT EXISTS zotero_item_key VARCHAR(20);
ALTER TABLE entities ADD COLUMN IF NOT EXISTS zotero_version INTEGER;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS zotero_collection_keys VARCHAR(20)[] DEFAULT '{}';
ALTER TABLE entities ADD COLUMN IF NOT EXISTS node_source node_source DEFAULT 'manual';
ALTER TABLE entities ADD COLUMN IF NOT EXISTS source_metadata JSONB DEFAULT '{}';
ALTER TABLE entities ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;

-- Indexes for Zotero lookups
CREATE INDEX IF NOT EXISTS idx_entities_zotero_key ON entities(zotero_item_key)
    WHERE zotero_item_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entities_node_source ON entities(node_source);
CREATE INDEX IF NOT EXISTS idx_entities_last_synced ON entities(last_synced_at)
    WHERE last_synced_at IS NOT NULL;

COMMENT ON COLUMN entities.zotero_item_key IS 'Zotero item key (8-char alphanumeric) for sync';
COMMENT ON COLUMN entities.zotero_version IS 'Zotero item version for incremental sync';
COMMENT ON COLUMN entities.zotero_collection_keys IS 'Array of Zotero collection keys this entity belongs to';
COMMENT ON COLUMN entities.node_source IS 'Primary source of this entity (zotero/pdf_llm/manual/merged)';
COMMENT ON COLUMN entities.source_metadata IS 'Additional source-specific metadata (e.g., confidence, extraction_method)';
COMMENT ON COLUMN entities.last_synced_at IS 'Last sync timestamp with Zotero';

-- ============================================================================
-- 3. Extend paper_metadata table with Zotero tracking
-- ============================================================================

ALTER TABLE paper_metadata ADD COLUMN IF NOT EXISTS zotero_item_key VARCHAR(20);
ALTER TABLE paper_metadata ADD COLUMN IF NOT EXISTS zotero_version INTEGER;
ALTER TABLE paper_metadata ADD COLUMN IF NOT EXISTS zotero_collection_keys VARCHAR(20)[] DEFAULT '{}';
ALTER TABLE paper_metadata ADD COLUMN IF NOT EXISTS zotero_date_added TIMESTAMP WITH TIME ZONE;
ALTER TABLE paper_metadata ADD COLUMN IF NOT EXISTS zotero_date_modified TIMESTAMP WITH TIME ZONE;
ALTER TABLE paper_metadata ADD COLUMN IF NOT EXISTS zotero_tags JSONB DEFAULT '[]';
ALTER TABLE paper_metadata ADD COLUMN IF NOT EXISTS zotero_notes TEXT;
ALTER TABLE paper_metadata ADD COLUMN IF NOT EXISTS zotero_extra TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_paper_meta_zotero_key ON paper_metadata(zotero_item_key)
    WHERE zotero_item_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_meta_project_zotero ON paper_metadata(project_id, zotero_item_key)
    WHERE zotero_item_key IS NOT NULL;

COMMENT ON COLUMN paper_metadata.zotero_item_key IS 'Zotero item key for bidirectional sync';
COMMENT ON COLUMN paper_metadata.zotero_version IS 'Zotero item version for change detection';
COMMENT ON COLUMN paper_metadata.zotero_collection_keys IS 'Array of Zotero collections containing this paper';
COMMENT ON COLUMN paper_metadata.zotero_date_added IS 'Date added to Zotero library';
COMMENT ON COLUMN paper_metadata.zotero_date_modified IS 'Last modified date in Zotero';
COMMENT ON COLUMN paper_metadata.zotero_tags IS 'Zotero tags [{tag: "tag_name"}]';
COMMENT ON COLUMN paper_metadata.zotero_notes IS 'Concatenated Zotero notes (for full-text search)';
COMMENT ON COLUMN paper_metadata.zotero_extra IS 'Zotero Extra field (often contains additional metadata)';

-- ============================================================================
-- 4. Zotero Collections Table (for hierarchy preservation)
-- ============================================================================

CREATE TABLE IF NOT EXISTS zotero_collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

    -- Zotero collection metadata
    collection_key VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(500) NOT NULL,
    parent_collection_key VARCHAR(20),
    collection_version INTEGER NOT NULL DEFAULT 0,

    -- Statistics
    item_count INTEGER DEFAULT 0,
    subcollection_count INTEGER DEFAULT 0,

    -- Sync tracking
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zotero_coll_project ON zotero_collections(project_id);
CREATE INDEX IF NOT EXISTS idx_zotero_coll_key ON zotero_collections(collection_key);
CREATE INDEX IF NOT EXISTS idx_zotero_coll_parent ON zotero_collections(parent_collection_key)
    WHERE parent_collection_key IS NOT NULL;

COMMENT ON TABLE zotero_collections IS 'Zotero collection hierarchy for organizational context';

-- ============================================================================
-- 5. Zotero Sync State (per-project sync tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS zotero_sync_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID UNIQUE REFERENCES projects(id) ON DELETE CASCADE,

    -- Zotero library info
    library_id VARCHAR(20) NOT NULL,
    library_type VARCHAR(10) NOT NULL CHECK (library_type IN ('user', 'group')),
    library_version INTEGER NOT NULL DEFAULT 0,

    -- Sync status
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_successful_sync_at TIMESTAMP WITH TIME ZONE,
    sync_status VARCHAR(50) DEFAULT 'never_synced',
    sync_error TEXT,

    -- Sync statistics
    items_synced INTEGER DEFAULT 0,
    items_added INTEGER DEFAULT 0,
    items_updated INTEGER DEFAULT 0,
    items_deleted INTEGER DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zotero_sync_project ON zotero_sync_state(project_id);

COMMENT ON TABLE zotero_sync_state IS 'Per-project Zotero sync state for incremental updates';

-- ============================================================================
-- 6. Zotero Sync History (audit log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS zotero_sync_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

    -- Sync details
    sync_type VARCHAR(50) NOT NULL,  -- 'full', 'incremental', 'manual'
    sync_direction VARCHAR(50) NOT NULL,  -- 'import', 'export', 'bidirectional'
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_seconds FLOAT,

    -- Version tracking
    from_version INTEGER,
    to_version INTEGER,

    -- Results
    status VARCHAR(50) NOT NULL,  -- 'success', 'failed', 'partial'
    items_processed INTEGER DEFAULT 0,
    items_added INTEGER DEFAULT 0,
    items_updated INTEGER DEFAULT 0,
    items_deleted INTEGER DEFAULT 0,
    errors_encountered INTEGER DEFAULT 0,
    error_details JSONB,

    -- User context
    initiated_by VARCHAR(255),  -- user_id or 'system'

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zotero_sync_history_project ON zotero_sync_history(project_id);
CREATE INDEX IF NOT EXISTS idx_zotero_sync_history_date ON zotero_sync_history(started_at DESC);

COMMENT ON TABLE zotero_sync_history IS 'Complete audit log of all Zotero sync operations';

-- ============================================================================
-- 7. Entity Merge History (track merged entities from multiple sources)
-- ============================================================================

CREATE TABLE IF NOT EXISTS entity_merge_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,

    -- Source tracking
    source_type node_source NOT NULL,
    source_entity_id VARCHAR(255),  -- zotero_item_key, pdf_hash, etc.
    source_confidence FLOAT,

    -- Merge metadata
    merged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    merged_by VARCHAR(255),  -- user_id or 'system'
    merge_strategy VARCHAR(50),  -- 'manual', 'auto_title_match', 'auto_doi_match', 'llm_suggested'

    -- Change tracking
    changes_applied JSONB,  -- What fields were updated during merge

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entity_merge_entity ON entity_merge_history(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_merge_source ON entity_merge_history(source_type, source_entity_id);

COMMENT ON TABLE entity_merge_history IS 'Track how entities were merged from multiple sources (Zotero + PDF LLM)';

-- ============================================================================
-- 8. Conflict Resolution Table (track sync conflicts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS zotero_sync_conflicts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

    -- Conflict details
    entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    paper_metadata_id UUID REFERENCES paper_metadata(id) ON DELETE CASCADE,
    conflict_type VARCHAR(50) NOT NULL,  -- 'field_mismatch', 'deletion_conflict', 'merge_conflict'

    -- Conflicting data
    local_data JSONB NOT NULL,
    remote_data JSONB NOT NULL,
    conflicting_fields TEXT[] NOT NULL,

    -- Resolution
    resolution_status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'resolved_local', 'resolved_remote', 'resolved_manual'
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(255),
    resolution_notes TEXT,

    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zotero_conflicts_project ON zotero_sync_conflicts(project_id);
CREATE INDEX IF NOT EXISTS idx_zotero_conflicts_status ON zotero_sync_conflicts(resolution_status);
CREATE INDEX IF NOT EXISTS idx_zotero_conflicts_entity ON zotero_sync_conflicts(entity_id)
    WHERE entity_id IS NOT NULL;

COMMENT ON TABLE zotero_sync_conflicts IS 'Track and resolve conflicts during bidirectional sync';

-- ============================================================================
-- 9. Utility Functions
-- ============================================================================

-- Function: Get all entities from a Zotero collection
CREATE OR REPLACE FUNCTION get_entities_by_zotero_collection(
    collection_key_param VARCHAR(20)
)
RETURNS TABLE (
    entity_id UUID,
    entity_type entity_type,
    entity_name VARCHAR,
    node_source node_source
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.entity_type,
        e.name,
        e.node_source
    FROM entities e
    WHERE collection_key_param = ANY(e.zotero_collection_keys);
END;
$$ LANGUAGE plpgsql;

-- Function: Get papers requiring sync (modified in ScholaRAG but not synced to Zotero)
CREATE OR REPLACE FUNCTION get_papers_pending_zotero_sync(
    project_id_param UUID
)
RETURNS TABLE (
    paper_id UUID,
    title TEXT,
    last_modified TIMESTAMP WITH TIME ZONE,
    last_synced TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pm.id,
        pm.title,
        pm.created_at,
        NULL::TIMESTAMP WITH TIME ZONE AS last_synced
    FROM paper_metadata pm
    WHERE pm.project_id = project_id_param
      AND pm.zotero_item_key IS NULL  -- Not yet synced to Zotero
      AND pm.created_at > (
          SELECT COALESCE(last_successful_sync_at, '1970-01-01'::TIMESTAMP WITH TIME ZONE)
          FROM zotero_sync_state
          WHERE project_id = project_id_param
      );
END;
$$ LANGUAGE plpgsql;

-- Function: Find duplicate entities across sources (for merge suggestions)
CREATE OR REPLACE FUNCTION find_duplicate_entities_for_merge(
    project_id_param UUID,
    similarity_threshold FLOAT DEFAULT 0.85
)
RETURNS TABLE (
    entity_1_id UUID,
    entity_1_name VARCHAR,
    entity_1_source node_source,
    entity_2_id UUID,
    entity_2_name VARCHAR,
    entity_2_source node_source,
    similarity_score FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e1.id,
        e1.name,
        e1.node_source,
        e2.id,
        e2.name,
        e2.node_source,
        similarity(e1.name, e2.name) AS sim_score
    FROM entities e1
    JOIN entities e2 ON e1.id < e2.id
        AND e1.entity_type = e2.entity_type
        AND e1.project_id = e2.project_id
    WHERE e1.project_id = project_id_param
      AND e1.node_source != e2.node_source  -- Different sources
      AND similarity(e1.name, e2.name) >= similarity_threshold;
END;
$$ LANGUAGE plpgsql;

-- Function: Get sync statistics for a project
CREATE OR REPLACE FUNCTION get_zotero_sync_stats(
    project_id_param UUID
)
RETURNS TABLE (
    total_papers INTEGER,
    zotero_synced_papers INTEGER,
    pdf_llm_papers INTEGER,
    merged_papers INTEGER,
    pending_sync INTEGER,
    last_sync_time TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER AS total,
        COUNT(*) FILTER (WHERE zotero_item_key IS NOT NULL)::INTEGER AS zotero_count,
        COUNT(*) FILTER (
            WHERE zotero_item_key IS NULL
              AND array_length(extracted_concept_ids, 1) > 0
        )::INTEGER AS pdf_count,
        0::INTEGER AS merged,  -- TODO: Add merged tracking
        COUNT(*) FILTER (WHERE zotero_item_key IS NULL)::INTEGER AS pending,
        (SELECT last_sync_at FROM zotero_sync_state WHERE project_id = project_id_param)
    FROM paper_metadata
    WHERE project_id = project_id_param;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 10. Triggers for automatic sync tracking
-- ============================================================================

-- Trigger: Update zotero_sync_state on entity changes
CREATE OR REPLACE FUNCTION update_zotero_sync_state_on_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Mark project as having pending changes
    UPDATE zotero_sync_state
    SET sync_status = 'pending_changes',
        updated_at = NOW()
    WHERE project_id = NEW.project_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to entities
DROP TRIGGER IF EXISTS trigger_entity_zotero_change ON entities;
CREATE TRIGGER trigger_entity_zotero_change
    AFTER UPDATE ON entities
    FOR EACH ROW
    WHEN (OLD.zotero_item_key IS NOT NULL)
    EXECUTE FUNCTION update_zotero_sync_state_on_change();

-- Apply trigger to paper_metadata
DROP TRIGGER IF EXISTS trigger_paper_zotero_change ON paper_metadata;
CREATE TRIGGER trigger_paper_zotero_change
    AFTER UPDATE ON paper_metadata
    FOR EACH ROW
    WHEN (OLD.zotero_item_key IS NOT NULL)
    EXECUTE FUNCTION update_zotero_sync_state_on_change();

-- ============================================================================
-- 11. Views for Zotero integration
-- ============================================================================

-- View: Papers with Zotero sync status
CREATE OR REPLACE VIEW papers_with_zotero_status AS
SELECT
    pm.id,
    pm.project_id,
    pm.title,
    pm.authors,
    pm.year,
    pm.doi,
    pm.zotero_item_key,
    pm.zotero_version,
    CASE
        WHEN pm.zotero_item_key IS NOT NULL THEN 'synced'
        ELSE 'not_synced'
    END AS sync_status,
    pm.zotero_date_modified,
    pm.created_at AS local_created_at,
    CASE
        WHEN pm.zotero_date_modified > pm.created_at THEN 'zotero_newer'
        WHEN pm.zotero_date_modified < pm.created_at THEN 'local_newer'
        ELSE 'in_sync'
    END AS version_status
FROM paper_metadata pm;

-- View: Entities by source distribution
CREATE OR REPLACE VIEW entity_source_distribution AS
SELECT
    e.project_id,
    e.entity_type,
    e.node_source,
    COUNT(*) AS entity_count,
    AVG((e.source_metadata->>'confidence')::FLOAT) AS avg_confidence
FROM entities e
WHERE e.is_visualized = true
GROUP BY e.project_id, e.entity_type, e.node_source;

-- View: Zotero collection hierarchy
CREATE OR REPLACE VIEW zotero_collection_tree AS
WITH RECURSIVE coll_tree AS (
    -- Base case: top-level collections
    SELECT
        collection_key,
        name,
        parent_collection_key,
        name AS path,
        0 AS depth
    FROM zotero_collections
    WHERE parent_collection_key IS NULL

    UNION ALL

    -- Recursive case: subcollections
    SELECT
        zc.collection_key,
        zc.name,
        zc.parent_collection_key,
        ct.path || ' > ' || zc.name AS path,
        ct.depth + 1 AS depth
    FROM zotero_collections zc
    JOIN coll_tree ct ON zc.parent_collection_key = ct.collection_key
)
SELECT * FROM coll_tree;

-- ============================================================================
-- 12. Grant permissions (adjust based on your RLS setup)
-- ============================================================================

-- These are placeholder permissions - adjust based on your auth system
-- GRANT SELECT, INSERT, UPDATE ON zotero_collections TO authenticated;
-- GRANT SELECT, INSERT, UPDATE ON zotero_sync_state TO authenticated;
-- GRANT SELECT, INSERT ON zotero_sync_history TO authenticated;
-- GRANT SELECT, INSERT, UPDATE ON entity_merge_history TO authenticated;
-- GRANT SELECT, INSERT, UPDATE ON zotero_sync_conflicts TO authenticated;

-- ============================================================================
-- Migration Complete!
-- ============================================================================

-- Verify tables created
DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
          'zotero_collections',
          'zotero_sync_state',
          'zotero_sync_history',
          'entity_merge_history',
          'zotero_sync_conflicts'
      );

    IF table_count = 5 THEN
        RAISE NOTICE 'Migration 005 completed successfully: All 5 Zotero tables created';
        RAISE NOTICE 'New columns added to entities and paper_metadata tables';
        RAISE NOTICE 'Helper functions and views created';
    ELSE
        RAISE WARNING 'Migration 005 incomplete: Only % of 5 tables found', table_count;
    END IF;
END $$;
