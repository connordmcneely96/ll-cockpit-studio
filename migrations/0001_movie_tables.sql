-- Migration: 0001
-- Sprint 178B-1: Movie Studio data model
-- Applied to ll-cockpit-db (831eeccf-60bc-4378-8a3b-71dfb910756e)
-- Tracked in studio_migrations (isolated from hub d1_migrations)

CREATE TABLE IF NOT EXISTS movie_projects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  brief TEXT,
  aspect_ratio TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_mp_tenant ON movie_projects(tenant_id, status, created_at);

CREATE TABLE IF NOT EXISTS movie_scenes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  scene_index INTEGER NOT NULL,
  prompt TEXT,
  duration_seconds INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_ms_project ON movie_scenes(project_id, scene_index);

CREATE TABLE IF NOT EXISTS movie_renders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  r2_key TEXT,
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_mr_project ON movie_renders(project_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_mr_tenant ON movie_renders(tenant_id, status);
