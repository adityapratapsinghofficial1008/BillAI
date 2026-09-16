-- BillAI V1 Database Migration (PostgreSQL)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    verification_token TEXT,
    verification_token_expires TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Organizations Table
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Projects Table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Add project_id to Teams Table (Nullable for existing V0 data)
ALTER TABLE teams ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- 5. Team Members Table
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    billai_key TEXT UNIQUE NOT NULL,
    invite_status TEXT NOT NULL DEFAULT 'pending' CHECK (invite_status IN ('pending', 'active')),
    invite_token TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS invite_token TEXT UNIQUE;

-- 6. Add team_member_id to Usage Logs Table (Nullable for existing V0 data)
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL;

-- Indexes for fast query lookup
CREATE INDEX IF NOT EXISTS idx_team_members_billai_key ON team_members(billai_key);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_team_member_id ON usage_logs(team_member_id);
CREATE INDEX IF NOT EXISTS idx_projects_org_id ON projects(org_id);
CREATE INDEX IF NOT EXISTS idx_teams_project_id ON teams(project_id);
