import { authFromCookie, getEnv } from "@/lib/movie";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authFromCookie();
  if (!auth) {
    return Response.json({ error: "no_session" }, { status: 401 });
  }

  const { id } = await params;
  const { DB } = getEnv();

  try {
    const row = await DB.prepare(
      `SELECT 1 FROM movie_projects WHERE id = ? AND tenant_id = ?`
    )
      .bind(id, auth.tenantId)
      .first();

    if (!row) {
      return Response.json({ error: "project_not_found" }, { status: 404 });
    }

    const renderId = crypto.randomUUID();

    // 178B-2: enqueue to movie-render-queue here once the queue + consumer exist
    await DB.prepare(
      `INSERT INTO movie_renders (id, project_id, tenant_id, status)
       VALUES (?, ?, ?, 'queued')`
    )
      .bind(renderId, id, auth.tenantId)
      .run();

    return Response.json({ ok: true, render_id: renderId, status: "queued" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
