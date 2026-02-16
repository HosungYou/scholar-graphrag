-- Migration 025: P0 Comprehensive Fix - Missing Relationship Types
-- Adds relationship_type enum values used in pdf_importer.py but missing from DB schema
-- All operations are idempotent

BEGIN;

-- ============================================================================
-- 1. Add missing relationship_type enum values
-- These are used in pdf_importer.py (lines 492, 818-820, 897) but were never
-- added to the PostgreSQL enum, causing silent data loss on import
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'REPORTS_FINDING'
        AND enumtypid = 'relationship_type'::regtype
    ) THEN
        ALTER TYPE relationship_type ADD VALUE 'REPORTS_FINDING';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'ADDRESSES_PROBLEM'
        AND enumtypid = 'relationship_type'::regtype
    ) THEN
        ALTER TYPE relationship_type ADD VALUE 'ADDRESSES_PROBLEM';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'PROPOSES_INNOVATION'
        AND enumtypid = 'relationship_type'::regtype
    ) THEN
        ALTER TYPE relationship_type ADD VALUE 'PROPOSES_INNOVATION';
    END IF;
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'Could not add relationship_type enum values: %', SQLERRM;
END;
$$;

-- ============================================================================
-- 2. Track migration
-- ============================================================================
INSERT INTO _migrations (name) VALUES ('025_p0_comprehensive_fix.sql') ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations (version, description) VALUES
    ('025_p0_comprehensive_fix', 'Add missing relationship types: REPORTS_FINDING, ADDRESSES_PROBLEM, PROPOSES_INNOVATION')
ON CONFLICT (version) DO NOTHING;

COMMIT;
