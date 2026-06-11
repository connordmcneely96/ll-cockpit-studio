-- Migration: 0003
-- Sprint 178B-2b-1: plug-in selection columns + tenant plugin config
-- Applied to ll-cockpit-db (831eeccf-60bc-4378-8a3b-71dfb910756e)
-- Tracked in studio_migrations (isolated from hub d1_migrations)
-- Note: ALTER TABLE ADD COLUMN has no IF NOT EXISTS — that's fine,
-- studio_migrations guarantees single application of this file.

ALTER TABLE movie_renders ADD COLUMN generator TEXT;
ALTER TABLE movie_renders ADD COLUMN generator_model TEXT;
ALTER TABLE movie_renders ADD COLUMN compositor TEXT;

CREATE TABLE IF NOT EXISTS tenant_plugin_config (
  tenant_id TEXT NOT NULL,
  plugin_type TEXT NOT NULL,
  plugin_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  config_json TEXT,
  byok_kv_key TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (tenant_id, plugin_type, plugin_name)
);
CREATE INDEX IF NOT EXISTS idx_tpc_tenant ON tenant_plugin_config(tenant_id, plugin_type, enabled);
