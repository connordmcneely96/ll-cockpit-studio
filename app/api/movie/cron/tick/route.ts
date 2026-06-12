import { getEnv } from "@/lib/movie";
import { tick } from "@/lib/movie/orchestrator";

export const dynamic = "force-dynamic";

// Machine-to-machine cron entrypoint. Gated solely by the x-cron-secret header
// (middleware already treats /api/ as public). No auth cookie — this is invoked
// by the platform scheduler, not a user.
export async function POST(request: Request) {
  const env = getEnv();
  const secret = (env as unknown as { CRON_SECRET?: string }).CRON_SECRET;
  const provided = request.headers.get("x-cron-secret");

  if (!secret || !provided || provided !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await tick(env, { maxRenders: 3 });
    return Response.json(summary);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
