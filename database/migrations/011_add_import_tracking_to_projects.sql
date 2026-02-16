-- Migration 011: Add import tracking columns to projects table
-- Purpose: Fix BUG-029 - system.py queries non-existent import_source and last_synced_at columns
-- Date: 2026-01-21

-- Add import_source column to track the source of imported data
-- Values: 'zotero', 'pdf', 'scholarag', 'manual', NULL (unknown)
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS import_source VARCHAR(50);

-- Add last_synced_at column to track the last synchronization time
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;

-- Create index for efficient filtering by import source
CREATE INDEX IF NOT EXISTS idx_projects_import_source ON projects(import_source);

-- Create index for efficient filtering by last sync time
CREATE INDEX IF NOT EXISTS idx_projects_last_synced ON projects(last_synced_at);

-- Add comment for documentation
COMMENT ON COLUMN projects.import_source IS 'Source of imported data: zotero, pdf, scholarag, manual';
COMMENT ON COLUMN projects.last_synced_at IS 'Timestamp of last synchronization with external source';

-- Update existing projects based on their data sources
-- If project has zotero_sync_state entries, mark as 'zotero'
UPDATE projects p
SET import_source = 'zotero',
    last_synced_at = (
        SELECT MAX(last_sync_at)
        FROM zotero_sync_state zss
        WHERE zss.project_id = p.id
    )
WHERE EXISTS (
    SELECT 1 FROM zotero_sync_state zss WHERE zss.project_id = p.id
)
AND p.import_source IS NULL;

-- If project has paper_metadata with source_path containing 'scholarag', mark as 'scholarag'
UPDATE projects p
SET import_source = 'scholarag'
WHERE p.source_path IS NOT NULL
AND p.source_path != ''
AND p.import_source IS NULL;

-- If project has paper_metadata but no zotero or scholarag source, mark as 'pdf'
UPDATE projects p
SET import_source = 'pdf'
WHERE EXISTS (
    SELECT 1 FROM paper_metadata pm WHERE pm.project_id = p.id
)
AND p.import_source IS NULL;
