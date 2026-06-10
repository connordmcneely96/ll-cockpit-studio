-- Migration: 0002
-- Sprint 178B-2a: Movie asset model (gateway-first provider layer)
-- Applied to ll-cockpit-db (831eeccf-60bc-4378-8a3b-71dfb910756e)
-- Tracked in studio_migrations (isolated from hub d1_migrations)

CREATE TABLE IF NOT EXISTS movie_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  scene_id TEXT,
  tenant_id TEXT NOT NULL,
  kind TEXT NOT NULL,                      -- 'footage' | 'avatar'
  provider TEXT NOT NULL,                  -- 'fal' | 'heygen'
  model TEXT,                              -- e.g. fal model id, or heygen template
  prompt TEXT,
  provider_request_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | generating | ready | failed
  output_url TEXT,
  r2_key TEXT,
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_ma_project ON movie_assets(project_id, status);
CREATE INDEX IF NOT EXISTS idx_ma_status ON movie_assets(status, created_at);
