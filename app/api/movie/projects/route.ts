import { authFromCookie, getEnv } from "@/lib/movie";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await authFromCookie();
  if (!auth) {
    return Response.json({ error: "no_session" }, { status: 401 });
  }

  let body: {
    title?: string;
    brief?: string;
    aspect_ratio?: string;
    scenes?: { prompt?: string; duration_seconds?: number }[];
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.title) {
    return Response.json({ error: "title_required" }, { status: 400 });
  }

  const { DB } = getEnv();
  const projectId = crypto.randomUUID();

  try {
    await DB.prepare(
      `INSERT INTO movie_projects (id, tenant_id, user_id, title, brief, aspect_ratio)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(
        projectId,
        auth.tenantId,
        auth.userId,
        body.title,
        body.brief ?? null,
        body.aspect_ratio ?? null
      )
      .run();

    if (body.scenes && body.scenes.length > 0) {
      for (let i = 0; i < body.scenes.length; i++) {
        const scene = body.scenes[i];
        await DB.prepare(
          `INSERT INTO movie_scenes (id, project_id, tenant_id, scene_index, prompt, duration_seconds)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
          .bind(
            crypto.randomUUID(),
            projectId,
            auth.tenantId,
            i,
            scene.prompt ?? null,
            scene.duration_seconds ?? null
          )
          .run();
      }
    }

    return Response.json({ ok: true, project_id: projectId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  const auth = await authFromCookie();
  if (!auth) {
    return Response.json({ error: "no_session" }, { status: 401 });
  }

  const { DB } = getEnv();
  try {
    const { results } = await DB.prepare(
      `SELECT id, title, status, created_at, updated_at
       FROM movie_projects
       WHERE tenant_id = ?
       ORDER BY created_at DESC
       LIMIT 30`
    )
      .bind(auth.tenantId)
      .all();

    return Response.json({ projects: results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
