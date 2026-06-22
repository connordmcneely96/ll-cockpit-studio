// fal video provider — native fetch only, NO vendor SDK (@fal-ai/client banned by house rule).
// Talks to the fal queue API: submit enqueues a request, check polls status then result.
import { getEnv } from "@/lib/movie";
import type { GenInput, GenStatus, GenSubmit, VideoProvider } from "./types";

// Confirmed-live text-to-video slug as of 2026-06-11; any fal model id is valid here.
export const DEFAULT_FOOTAGE_MODEL = "fal-ai/kling-video/v3/standard/text-to-video";

function getFalKey(): string {
  const env = getEnv() as unknown as { FAL_KEY?: string };
  const key = env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY not configured");
  return key;
}

// Map the provider-agnostic GenInput to fal's request body, omitting undefined keys.
function mapInput(input: GenInput): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.prompt !== undefined) body.prompt = input.prompt;
  if (input.imageUrl !== undefined) body.image_url = input.imageUrl;
  if (input.durationSeconds !== undefined) body.duration = input.durationSeconds;
  if (input.aspectRatio !== undefined) body.aspect_ratio = input.aspectRatio;
  if (input.resolution !== undefined) body.resolution = input.resolution;
  return body;
}

export const falProvider: VideoProvider = {
  name: "fal",
  capabilities: { kinds: ["footage"] },

  async submit(model: string, input: GenInput): Promise<GenSubmit> {
    const key = getFalKey();
    const res = await fetch(`https://queue.fal.run/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mapInput(input)),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`fal submit failed (${res.status}): ${text}`);
    }
    const json = (await res.json()) as { request_id?: string };
    if (!json.request_id) {
      throw new Error("fal submit: response missing request_id");
    }
    return { providerRequestId: json.request_id };
  },

  async check(model: string, providerRequestId: string): Promise<GenStatus> {
    const key = getFalKey();
    // Asymmetry: submit POSTs to the full model path, but the queue status/result
    // endpoints live at the APP-level path (owner/app), not the full sub-path.
    const appBase = model.split("/").slice(0, 2).join("/"); // e.g. 'fal-ai/kling-video'
    const statusRes = await fetch(
      `https://queue.fal.run/${appBase}/requests/${providerRequestId}/status`,
      { headers: { Authorization: `Key ${key}` } }
    );
    if (!statusRes.ok) {
      const text = await statusRes.text();
      return { status: "failed", error: `fal status (${statusRes.status}): ${text}` };
    }

    const statusJson = (await statusRes.json()) as { status?: string; error?: string };
    const falStatus = statusJson.status;

    if (falStatus === "IN_QUEUE" || falStatus === "IN_PROGRESS") {
      return { status: "generating" };
    }

    if (falStatus === "COMPLETED") {
      const resultRes = await fetch(
        `https://queue.fal.run/${appBase}/requests/${providerRequestId}`,
        { headers: { Authorization: `Key ${key}` } }
      );
      if (!resultRes.ok) {
        const text = await resultRes.text();
        return { status: "failed", error: `fal result (${resultRes.status}): ${text}` };
      }
      const result = (await resultRes.json()) as {
        video?: { url?: string };
        video_url?: string;
        output?: { url?: string };
      };
      const outputUrl = result.video?.url ?? result.video_url ?? result.output?.url;
      if (!outputUrl) {
        return { status: "failed", error: "fal completed but no video url in result" };
      }
      return { status: "ready", outputUrl };
    }

    // Any other status (e.g. ERROR) is terminal failure.
    return { status: "failed", error: statusJson.error ?? `fal status: ${falStatus ?? "unknown"}` };
  },
};
