import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

type D1 = { prepare: (sql: string) => { first: () => Promise<unknown> } };
type R2 = { head: (key: string) => Promise<unknown> };
type Env = { DB?: D1; R2?: R2 };

export async function GET() {
  const { env } = await getCloudflareContext({ async: true });
  const { DB, R2 } = env as unknown as Env;
  const checks: Record<string, boolean> = {};

  if (DB) {
    try {
      await DB.prepare("SELECT 1").first();
      checks.db = true;
    } catch {
      checks.db = false;
    }
  }

  if (R2) {
    try {
      await R2.head("healthcheck");
      checks.r2 = true;
    } catch (e: unknown) {
      // NoSuchKey is expected — means bucket is reachable but the key isn't there. That's fine.
      const err = e as { name?: string; message?: string };
      checks.r2 = err?.name === "NoSuchKey" || err?.message?.includes("NoSuchKey") || false;
    }
  }

  const healthy = Object.values(checks).every(Boolean);
  return Response.json(
    {
      worker: "ll-cockpit-studio",
      healthy,
      checks,
      timestamp: Date.now(),
    },
    { status: healthy ? 200 : 503 }
  );
}
