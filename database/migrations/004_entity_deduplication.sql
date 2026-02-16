-- Migration: 004_entity_deduplication.sql
-- Purpose: Merge duplicate entities based on (project_id, entity_type, normalized name)
--          and update all related relationships

BEGIN;

-- Ensure relationships table has updated_at column (may not exist in older schemas)
ALTER TABLE relationships ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Step 1: Identify duplicate entities and determine canonical (oldest) entity for each group
WITH duplicate_groups AS (
    SELECT
        project_id,
        entity_type,
        LOWER(TRIM(name)) AS normalized_name,
        array_agg(id ORDER BY created_at ASC, id ASC) AS entity_ids,
        COUNT(*) AS duplicate_count
    FROM entities
    GROUP BY project_id, entity_type, LOWER(TRIM(name))
    HAVING COUNT(*) > 1
),
-- Step 2: Flatten the duplicate groups to get canonical and duplicate mappings
duplicate_mappings AS (
    SELECT
        project_id,
        entity_type,
        normalized_name,
        entity_ids[1] AS canonical_id,
        unnest(entity_ids[2:array_length(entity_ids, 1)]) AS duplicate_id
    FROM duplicate_groups
),
-- Step 3: Merge properties from duplicates into canonical entities
merged_properties AS (
    SELECT
        dm.canonical_id,
        jsonb_object_agg(
            COALESCE(key, 'merged'),
            value
        ) AS merged_props
    FROM duplicate_mappings dm
    JOIN entities e ON e.id = dm.duplicate_id OR e.id = dm.canonical_id
    CROSS JOIN LATERAL jsonb_each(COALESCE(e.properties, '{}'::jsonb))
    GROUP BY dm.canonical_id
),
-- Step 4: Update canonical entities with merged properties
update_canonical AS (
    UPDATE entities e
    SET
        properties = COALESCE(e.properties, '{}'::jsonb) || COALESCE(mp.merged_props, '{}'::jsonb),
        updated_at = NOW()
    FROM merged_properties mp
    WHERE e.id = mp.canonical_id
    RETURNING e.id
),
-- Step 5: Update relationships pointing to duplicate entities (source_id)
update_relationships_source AS (
    UPDATE relationships r
    SET
        source_id = dm.canonical_id,
        updated_at = NOW()
    FROM duplicate_mappings dm
    WHERE r.source_id = dm.duplicate_id
    RETURNING r.id
),
-- Step 6: Update relationships pointing to duplicate entities (target_id)
update_relationships_target AS (
    UPDATE relationships r
    SET
        target_id = dm.canonical_id,
        updated_at = NOW()
    FROM duplicate_mappings dm
    WHERE r.target_id = dm.duplicate_id
    RETURNING r.id
),
-- Step 7: Identify duplicate relationships after entity merge
duplicate_relationships AS (
    SELECT
        array_agg(id ORDER BY created_at ASC, id ASC) AS rel_ids
    FROM relationships
    GROUP BY source_id, target_id, relationship_type
    HAVING COUNT(*) > 1
),
-- Step 8: Delete duplicate relationships (keep oldest)
delete_duplicate_relationships AS (
    DELETE FROM relationships
    WHERE id IN (
        SELECT unnest(rel_ids[2:array_length(rel_ids, 1)])
        FROM duplicate_relationships
    )
    RETURNING id
),
-- Step 9: Delete duplicate entities
delete_duplicates AS (
    DELETE FROM entities
    WHERE id IN (
        SELECT duplicate_id
        FROM duplicate_mappings
    )
    RETURNING id
)
-- Final summary: Count operations performed
SELECT
    (SELECT COUNT(*) FROM update_canonical) AS canonical_entities_updated,
    (SELECT COUNT(*) FROM update_relationships_source) AS relationships_source_updated,
    (SELECT COUNT(*) FROM update_relationships_target) AS relationships_target_updated,
    (SELECT COUNT(*) FROM delete_duplicate_relationships) AS duplicate_relationships_deleted,
    (SELECT COUNT(*) FROM delete_duplicates) AS duplicate_entities_deleted;

-- Step 10: Create unique constraint to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_unique_name
ON entities(project_id, entity_type, LOWER(TRIM(name)));

-- Add comment to document the constraint
COMMENT ON INDEX idx_entities_unique_name IS
'Ensures entity uniqueness per project based on normalized name (case-insensitive, trimmed)';

COMMIT;
