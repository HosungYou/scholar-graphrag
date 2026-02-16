-- Migration: 005_user_profiles.sql
-- Description: Add user profiles and project ownership
-- Date: 2025-01-14

-- ================================================
-- User Profiles Table
-- Stores extended user information beyond Supabase Auth
-- ================================================
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY,  -- Same as Supabase Auth user ID
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255),
    avatar_url TEXT,
    institution VARCHAR(500),
    research_interests TEXT[],
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- ================================================
-- Add owner_id to projects table
-- Links projects to their owners
-- ================================================
ALTER TABLE projects 
    ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL;

ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;

ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS visibility VARCHAR(50) DEFAULT 'private';
    -- Values: 'private', 'team', 'public'

-- Index for owner lookups
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_visibility ON projects(visibility);

-- ================================================
-- Project collaborators (for future team features)
-- ================================================
CREATE TABLE IF NOT EXISTS project_collaborators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    -- Roles: 'owner', 'admin', 'editor', 'viewer'
    permissions JSONB DEFAULT '{}',
    invited_by UUID REFERENCES user_profiles(id),
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    UNIQUE(project_id, user_id)
);

-- Indexes for collaborator lookups
CREATE INDEX IF NOT EXISTS idx_collaborators_project ON project_collaborators(project_id);
CREATE INDEX IF NOT EXISTS idx_collaborators_user ON project_collaborators(user_id);

-- ================================================
-- User activity log (optional, for analytics)
-- ================================================
CREATE TABLE IF NOT EXISTS user_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),  -- 'project', 'graph', 'chat', etc.
    resource_id UUID,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for activity queries
CREATE INDEX IF NOT EXISTS idx_activity_user ON user_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON user_activity_log(created_at DESC);

-- ================================================
-- Function to update updated_at timestamp
-- ================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for user_profiles
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- RLS Policies (for Supabase)
-- Enable Row Level Security on tables
-- ================================================

-- Enable RLS on all user-related tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_log ENABLE ROW LEVEL SECURITY;

-- ================================================
-- user_profiles policies
-- ================================================

-- Policy: Users can read their own profile
CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id);

-- Policy: Users can insert their own profile (on signup)
CREATE POLICY "Users can create own profile" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);

-- ================================================
-- projects policies
-- ================================================

-- Policy: Users can view their own projects or public projects
CREATE POLICY "Users can view own projects" ON projects
    FOR SELECT USING (
        owner_id = auth.uid()
        OR is_public = true
        OR visibility = 'public'
    );

-- Policy: Users can view projects they collaborate on
CREATE POLICY "Collaborators can view projects" ON projects
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM project_collaborators
            WHERE project_id = projects.id
            AND user_id = auth.uid()
        )
    );

-- Policy: Users can create their own projects
CREATE POLICY "Users can create projects" ON projects
    FOR INSERT WITH CHECK (owner_id = auth.uid());

-- Policy: Users can update their own projects
CREATE POLICY "Users can update own projects" ON projects
    FOR UPDATE USING (owner_id = auth.uid());

-- Policy: Users can delete their own projects
CREATE POLICY "Users can delete own projects" ON projects
    FOR DELETE USING (owner_id = auth.uid());

-- ================================================
-- project_collaborators policies
-- ================================================

-- Policy: Project owners can manage collaborators
CREATE POLICY "Project owners can manage collaborators" ON project_collaborators
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = project_collaborators.project_id
            AND projects.owner_id = auth.uid()
        )
    );

-- Policy: Collaborators can view their own collaborations
CREATE POLICY "Users can view own collaborations" ON project_collaborators
    FOR SELECT USING (user_id = auth.uid());

-- ================================================
-- user_activity_log policies
-- ================================================

-- Policy: Users can only see their own activity
CREATE POLICY "Users can view own activity" ON user_activity_log
    FOR SELECT USING (user_id = auth.uid());

-- Policy: System can insert activity logs (using service role)
CREATE POLICY "System can log activity" ON user_activity_log
    FOR INSERT WITH CHECK (true);  -- Backend uses service role key
