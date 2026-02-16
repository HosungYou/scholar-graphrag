-- ============================================================================
-- Migration: 010_fix_structural_gaps_columns.sql
-- Purpose: Add missing columns to structural_gaps table for gap analysis
-- Date: 2026-01-19
-- ============================================================================

-- Add cluster_a_concepts (TEXT array of concept UUIDs as strings)
ALTER TABLE structural_gaps
ADD COLUMN IF NOT EXISTS cluster_a_concepts TEXT[] DEFAULT '{}';

-- Add cluster_b_concepts (TEXT array of concept UUIDs as strings)
ALTER TABLE structural_gaps
ADD COLUMN IF NOT EXISTS cluster_b_concepts TEXT[] DEFAULT '{}';

-- Add cluster_a_names (TEXT array of concept names)
ALTER TABLE structural_gaps
ADD COLUMN IF NOT EXISTS cluster_a_names TEXT[] DEFAULT '{}';

-- Add cluster_b_names (TEXT array of concept names)
ALTER TABLE structural_gaps
ADD COLUMN IF NOT EXISTS cluster_b_names TEXT[] DEFAULT '{}';

-- Add bridge_candidates (TEXT array of potential bridge concept names)
ALTER TABLE structural_gaps
ADD COLUMN IF NOT EXISTS bridge_candidates TEXT[] DEFAULT '{}';

-- Add research_questions (TEXT array of AI-generated questions)
-- Note: This is separate from suggested_research_questions for backward compatibility
ALTER TABLE structural_gaps
ADD COLUMN IF NOT EXISTS research_questions TEXT[] DEFAULT '{}';

-- Comments for documentation
COMMENT ON COLUMN structural_gaps.cluster_a_concepts IS 'Array of concept UUIDs (as strings) from cluster A';
COMMENT ON COLUMN structural_gaps.cluster_b_concepts IS 'Array of concept UUIDs (as strings) from cluster B';
COMMENT ON COLUMN structural_gaps.cluster_a_names IS 'Array of concept names from cluster A';
COMMENT ON COLUMN structural_gaps.cluster_b_names IS 'Array of concept names from cluster B';
COMMENT ON COLUMN structural_gaps.bridge_candidates IS 'Array of potential bridge concept names';
COMMENT ON COLUMN structural_gaps.research_questions IS 'Array of AI-generated research questions for this gap';

-- ============================================================================
-- Note: Run this migration on production database via Supabase SQL Editor
-- ============================================================================
