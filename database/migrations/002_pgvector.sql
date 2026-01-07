-- ScholaRAG_Graph Database Schema
-- Migration 002: pgvector Extension

-- Enable pgvector extension
-- Note: This requires pgvector to be installed on the PostgreSQL server
-- On Render: pgvector is available by default
-- On local: brew install pgvector (macOS) or follow pgvector installation guide

CREATE EXTENSION IF NOT EXISTS vector;

-- Verify pgvector is installed
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        RAISE EXCEPTION 'pgvector extension is not installed. Please install it first.';
    END IF;
END $$;
