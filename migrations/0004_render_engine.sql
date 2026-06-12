-- Migration: 0004
-- Sprint 178B-2b-2a: generation engine (claim + cost + render link)
-- Applied to ll-cockpit-db (831eeccf-60bc-4378-8a3b-71dfb910756e)
-- Tracked in studio_migrations (isolated from hub d1_migrations)
-- Note: ALTER TABLE ADD COLUMN has no IF NOT EXISTS — studio_migrations
-- guarantees single application of this file.

ALTER TABLE movie_renders ADD COLUMN claimed_at INTEGER;
ALTER TABLE movie_renders ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE movie_renders ADD COLUMN total_cost_usd REAL NOT NULL DEFAULT 0;

ALTER TABLE movie_assets ADD COLUMN render_id TEXT;
ALTER TABLE movie_assets ADD COLUMN cost_usd REAL;

CREATE INDEX IF NOT EXISTS idx_ma_render ON movie_assets(render_id, status);
