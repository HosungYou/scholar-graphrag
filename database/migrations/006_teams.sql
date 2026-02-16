-- Migration: 006_teams.sql
-- Description: Add teams table for collaboration features
-- Date: 2025-01-14

-- ================================================
-- Teams Table
-- ================================================
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for team lookups
CREATE INDEX IF NOT EXISTS idx_teams_created_by ON teams(created_by);

-- ================================================
-- Team Members Table
-- ================================================
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    -- Roles: 'owner', 'admin', 'editor', 'viewer'
    invited_by UUID REFERENCES user_profiles(id),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

-- Indexes for team member lookups
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_role ON team_members(role);

-- ================================================
-- Team Projects Junction Table (optional)
-- Links teams to projects for team-based access
-- ================================================
CREATE TABLE IF NOT EXISTS team_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    added_by UUID REFERENCES user_profiles(id),
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, project_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_team_projects_team ON team_projects(team_id);
CREATE INDEX IF NOT EXISTS idx_team_projects_project ON team_projects(project_id);

-- ================================================
-- Update trigger for teams
-- ================================================
DROP TRIGGER IF EXISTS update_teams_updated_at ON teams;
CREATE TRIGGER update_teams_updated_at
    BEFORE UPDATE ON teams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- View: User's accessible projects
-- Combines owned, collaborated, and team projects
-- ================================================
CREATE OR REPLACE VIEW user_accessible_projects AS
SELECT DISTINCT
    p.id,
    p.name,
    p.description,
    p.owner_id,
    p.visibility,
    p.created_at,
    p.updated_at,
    up.id as accessor_id,
    CASE
        WHEN p.owner_id = up.id THEN 'owner'
        WHEN pc.role IS NOT NULL THEN pc.role
        WHEN tm.role IS NOT NULL THEN 'team_' || tm.role
        WHEN p.visibility = 'public' THEN 'public'
        ELSE NULL
    END as access_role
FROM projects p
CROSS JOIN user_profiles up
LEFT JOIN project_collaborators pc ON p.id = pc.project_id AND pc.user_id = up.id
LEFT JOIN team_projects tp ON p.id = tp.project_id
LEFT JOIN team_members tm ON tp.team_id = tm.team_id AND tm.user_id = up.id
WHERE 
    p.owner_id = up.id
    OR pc.user_id = up.id
    OR (tm.user_id = up.id AND tp.project_id IS NOT NULL)
    OR p.visibility = 'public';
