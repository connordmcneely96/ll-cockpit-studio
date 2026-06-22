// Generation orchestrator (Sprint 178B-2b-2a).
//
// A secret-gated cron tick drives queued renders through the generation half of
// the pipeline: CLAIM -> FAN-OUT -> POLL -> FINALIZE. It does NOT invoke
// compositors (that lands in 2b-2b once Cloud Run exists in 2c).
//
// v1 SIMPLIFICATION (locked): one generator per render applies to all its scenes.
import { type Env } from "@/lib/movie";
import { getProvider } from "@/lib/providers";
import { DEFAULT_FOOTAGE_MODEL } from "@/lib/providers/fal";
import { estimateCost } from "./costs";

// Hardening bounds (Sprint 178B-2b-2a-h).
const MAX_POLL_RENDERS = 10; // cap renders polled per tick so a tick can never run unbounded
const STALE_SECONDS = 1800; // 30 min: a claim older than this is considered timed out
const MAX_ATTEMPTS = 3; // don't re-claim a render that has already been attempted this many times

// Local D1 view that exposes meta.changes for guarded updates — the lib/movie
// Env.DB type intentionally omits it. Native binding, no SDK.
type RunResult = { success: boolean; meta?: { changes?: number } };
type D1Stmt = {
  bind: (...values: unknown[]) => D1Stmt;
  all: <T = unknown>() => Promise<{ results: T[] }>;
  run: () => Promise<RunResult>;
  first: <T = unknown>() => Promise<T | null>;
};
type D1 = { prepare: (sql: string) => D1Stmt };

function db(env: Env): D1 {
  return env.DB as unknown as D1;
}

type RenderRow = {
  id: string;
  project_id: string;
  tenant_id: string;
  generator: string | null;
  generator_model: string | null;
};

type SceneRow = {
  id: string;
  prompt: string | null;
  duration_seconds: number | null;
};

type AssetRow = {
  id: string;
  provider: string;
  model: string | null;
  provider_request_id: string | null;
  status: string;
};

export type TickSummary = {
  reaped: number; // stale renders timed out this tick
  claimed: number; // renders claimed this tick
  submitted: number; // assets submitted to a generator this tick
  ready: number; // renders finalized to 'assets_ready'
  failed: number; // renders finalized to 'failed'
  composing: number; // always 0 in this slice (no compositor yet)
};

// Resolve the generator + model for a render: explicit columns win, then the
// tenant's default generator plugin, then the system default (fal).
async function resolveSelection(
  render: RenderRow,
  env: Env
): Promise<{ generator: string; model: string }> {
  if (render.generator) {
    return { generator: render.generator, model: render.generator_model ?? DEFAULT_FOOTAGE_MODEL };
  }

  const row = await db(env)
    .prepare(
      `SELECT plugin_name, config_json FROM tenant_plugin_config
       WHERE tenant_id = ? AND plugin_type = 'generator' AND is_default = 1 AND enabled = 1
       ORDER BY updated_at DESC LIMIT 1`
    )
    .bind(render.tenant_id)
    .first<{ plugin_name: string; config_json: string | null }>();

  if (row?.plugin_name) {
    let model = DEFAULT_FOOTAGE_MODEL;
    if (row.config_json) {
      try {
        const cfg = JSON.parse(row.config_json) as { model?: string };
        if (cfg.model) model = cfg.model;
      } catch {
        // malformed config_json — fall back to the default model.
      }
    }
    return { generator: row.plugin_name, model };
  }

  return { generator: "fal", model: DEFAULT_FOOTAGE_MODEL };
}

async function markRenderFailed(
  env: Env,
  renderId: string,
  tenantId: string,
  error: string
): Promise<void> {
  await db(env)
    .prepare(
      `UPDATE movie_renders SET status = 'failed', error = ?, updated_at = unixepoch()
       WHERE id = ? AND tenant_id = ?`
    )
    .bind(error, renderId, tenantId)
    .run();
}

// Fan out one claimed render into per-scene movie_assets and submit each to the generator.
async function fanOut(env: Env, render: RenderRow, summary: TickSummary): Promise<void> {
  const database = db(env);

  // Idempotency: only fan out if this render has no assets yet.
  const existing = await database
    .prepare(`SELECT COUNT(*) AS n FROM movie_assets WHERE render_id = ?`)
    .bind(render.id)
    .first<{ n: number }>();
  if ((existing?.n ?? 0) > 0) return;

  let generator: string;
  let model: string;
  let kind: string;
  try {
    const selection = await resolveSelection(render, env);
    generator = selection.generator;
    model = selection.model;
    // Asset kind comes from the selected provider's declared capability.
    kind = getProvider(generator).capabilities.kinds[0];
  } catch (e) {
    await markRenderFailed(env, render.id, render.tenant_id, e instanceof Error ? e.message : String(e));
    summary.failed++;
    return;
  }

  const { results: scenes } = await database
    .prepare(
      `SELECT id, prompt, duration_seconds FROM movie_scenes
       WHERE project_id = ? AND tenant_id = ? ORDER BY scene_index ASC`
    )
    .bind(render.project_id, render.tenant_id)
    .all<SceneRow>();

  if (scenes.length === 0) {
    // Nothing to generate — fail closed so the render doesn't hang in 'generating'.
    await markRenderFailed(env, render.id, render.tenant_id, "no scenes to render");
    summary.failed++;
    return;
  }

  const provider = getProvider(generator);

  for (const scene of scenes) {
    const assetId = crypto.randomUUID();
    await database
      .prepare(
        `INSERT INTO movie_assets
           (id, project_id, scene_id, tenant_id, kind, provider, model, prompt, render_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
      )
      .bind(
        assetId,
        render.project_id,
        scene.id,
        render.tenant_id,
        kind,
        generator,
        model,
        scene.prompt ?? null,
        render.id
      )
      .run();

    // One scene's failure must not abort the tick.
    try {
      const sub = await provider.submit(model, { prompt: scene.prompt ?? "" });
      const cost = estimateCost(generator, model, scene.duration_seconds ?? undefined);
      await database
        .prepare(
          `UPDATE movie_assets
             SET provider_request_id = ?, status = 'generating', cost_usd = ?, updated_at = unixepoch()
           WHERE id = ?`
        )
        .bind(sub.providerRequestId, cost, assetId)
        .run();
      summary.submitted++;
    } catch (e) {
      await database
        .prepare(
          `UPDATE movie_assets SET status = 'failed', error = ?, updated_at = unixepoch() WHERE id = ?`
        )
        .bind(e instanceof Error ? e.message : String(e), assetId)
        .run();
    }
  }
}

// Poll in-flight assets for one render and advance them to ready/failed.
async function pollRender(env: Env, renderId: string, tenantId: string): Promise<void> {
  const database = db(env);
  const { results: assets } = await database
    .prepare(
      `SELECT id, provider, model, provider_request_id, status FROM movie_assets
       WHERE render_id = ? AND tenant_id = ? AND status IN ('pending', 'generating')`
    )
    .bind(renderId, tenantId)
    .all<AssetRow>();

  for (const a of assets) {
    if (!a.provider_request_id) continue; // never submitted — leave for fan-out / failure path
    try {
      const status = await getProvider(a.provider).check(a.model ?? "", a.provider_request_id);
      if (status.status === "ready") {
        await database
          .prepare(
            `UPDATE movie_assets SET status = 'ready', output_url = ?, updated_at = unixepoch() WHERE id = ?`
          )
          .bind(status.outputUrl ?? null, a.id)
          .run();
      } else if (status.status === "failed") {
        await database
          .prepare(
            `UPDATE movie_assets SET status = 'failed', error = ?, updated_at = unixepoch() WHERE id = ?`
          )
          .bind(status.error ?? "generation failed", a.id)
          .run();
      }
      // 'generating' — leave the asset as-is for a future tick.
    } catch {
      // Transient check error — do not permanently fail the asset; retry next tick.
    }
  }
}

// Finalize a render once its assets settle: all ready -> assets_ready (+ cost), any failed -> failed.
async function finalizeRender(
  env: Env,
  renderId: string,
  tenantId: string,
  summary: TickSummary
): Promise<void> {
  const database = db(env);
  const { results: assets } = await database
    .prepare(`SELECT status, cost_usd FROM movie_assets WHERE render_id = ? AND tenant_id = ?`)
    .bind(renderId, tenantId)
    .all<{ status: string; cost_usd: number | null }>();

  if (assets.length === 0) return; // nothing fanned out yet

  if (assets.some((a) => a.status === "failed")) {
    await markRenderFailed(env, renderId, tenantId, "one or more assets failed");
    summary.failed++;
    return;
  }

  if (assets.every((a) => a.status === "ready")) {
    const total = assets.reduce((sum, a) => sum + (a.cost_usd ?? 0), 0);
    await database
      .prepare(
        `UPDATE movie_renders SET status = 'assets_ready', total_cost_usd = ?, updated_at = unixepoch()
         WHERE id = ? AND tenant_id = ?`
      )
      .bind(Number(total.toFixed(4)), renderId, tenantId)
      .run();
    summary.ready++;
  }
}

// Reap stale claims: renders stuck in 'generating' past STALE_SECONDS are failed out, along
// with their non-terminal assets. This is fail-out (not auto-retry) to avoid double-spend;
// an auto-retry under MAX_ATTEMPTS could be added here later. Returns the count reaped.
async function reapStale(env: Env): Promise<number> {
  const database = db(env);
  const { results: stale } = await database
    .prepare(
      `SELECT id, tenant_id FROM movie_renders
       WHERE status = 'generating' AND claimed_at IS NOT NULL
         AND claimed_at < (unixepoch() - ?)`
    )
    .bind(STALE_SECONDS)
    .all<{ id: string; tenant_id: string }>();

  for (const r of stale) {
    await database
      .prepare(
        `UPDATE movie_assets SET status = 'failed', error = 'render timed out', updated_at = unixepoch()
         WHERE render_id = ? AND tenant_id = ? AND status IN ('pending', 'generating')`
      )
      .bind(r.id, r.tenant_id)
      .run();
    await database
      .prepare(
        `UPDATE movie_renders
           SET status = 'failed', error = 'timed out after ' || ? || 's', updated_at = unixepoch()
         WHERE id = ? AND tenant_id = ?`
      )
      .bind(STALE_SECONDS, r.id, r.tenant_id)
      .run();
  }

  return stale.length;
}

export async function tick(
  env: Env,
  opts?: { maxRenders?: number }
): Promise<TickSummary> {
  const maxRenders = opts?.maxRenders ?? 3;
  const database = db(env);
  const summary: TickSummary = { reaped: 0, claimed: 0, submitted: 0, ready: 0, failed: 0, composing: 0 };

  // Reap stale claims before anything else, so timed-out renders free up and don't get polled.
  summary.reaped = await reapStale(env);

  // a) CLAIM — grab up to maxRenders queued renders, oldest first, with a guarded update.
  // Skip renders that have already exhausted MAX_ATTEMPTS (defensive; fail-out makes this rare).
  const { results: queued } = await database
    .prepare(
      `SELECT id, project_id, tenant_id, generator, generator_model FROM movie_renders
       WHERE status = 'queued' AND attempts < ? ORDER BY created_at ASC LIMIT ?`
    )
    .bind(MAX_ATTEMPTS, maxRenders)
    .all<RenderRow>();

  const claimedIds = new Set<string>();
  for (const r of queued) {
    const res = await database
      .prepare(
        `UPDATE movie_renders
           SET status = 'generating', claimed_at = unixepoch(), attempts = attempts + 1, updated_at = unixepoch()
         WHERE id = ? AND status = 'queued'`
      )
      .bind(r.id)
      .run();
    if ((res.meta?.changes ?? 0) > 0) {
      claimedIds.add(r.id);
      summary.claimed++;
      // b) FAN-OUT for this freshly claimed render.
      try {
        await fanOut(env, r, summary);
      } catch (e) {
        await markRenderFailed(env, r.id, r.tenant_id, e instanceof Error ? e.message : String(e));
        summary.failed++;
      }
    }
  }

  // c+d) POLL + FINALIZE — renders already mid-flight (excluding ones claimed this tick,
  // which were just submitted and won't have results yet).
  const { results: generating } = await database
    .prepare(
      `SELECT id, tenant_id FROM movie_renders WHERE status = 'generating'
       ORDER BY claimed_at ASC LIMIT ${MAX_POLL_RENDERS}`
    )
    .all<{ id: string; tenant_id: string }>();

  for (const r of generating) {
    if (claimedIds.has(r.id)) continue;
    try {
      await pollRender(env, r.id, r.tenant_id);
      await finalizeRender(env, r.id, r.tenant_id, summary);
    } catch {
      // Per-render isolation — a poll failure on one render must not abort the tick.
    }
  }

  return summary;
}
