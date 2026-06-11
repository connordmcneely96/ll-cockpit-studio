// HeyGen avatar provider — native fetch only, NO vendor SDK (house rule).
// Uses the HeyGen Video Agent API: submit creates a video, check polls its status.
import { getEnv } from "@/lib/movie";
import type { GenInput, GenStatus, GenSubmit, VideoProvider } from "./types";

function getHeygenKey(): string {
  const env = getEnv() as unknown as { HEYGEN_API_KEY?: string };
  const key = env.HEYGEN_API_KEY;
  if (!key) throw new Error("HEYGEN_API_KEY not configured");
  return key;
}

export const heygenProvider: VideoProvider = {
  name: "heygen",
  capabilities: { kinds: ["avatar"] },

  async submit(model: string, input: GenInput): Promise<GenSubmit> {
    // model is unused for the Video Agent path — the agent is selected server-side by HeyGen.
    void model;
    const key = getHeygenKey();
    const res = await fetch("https://api.heygen.com/v3/video-agents", {
      method: "POST",
      headers: {
        "X-Api-Key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: input.prompt }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`heygen submit failed (${res.status}): ${text}`);
    }
    const json = (await res.json()) as { data?: { video_id?: string } };
    const videoId = json.data?.video_id;
    if (!videoId) {
      throw new Error("heygen submit: response missing data.video_id");
    }
    return { providerRequestId: videoId };
  },

  async check(model: string, providerRequestId: string): Promise<GenStatus> {
    void model;
    const key = getHeygenKey();
    const res = await fetch(`https://api.heygen.com/v3/videos/${providerRequestId}`, {
      headers: { "X-Api-Key": key },
    });
    if (!res.ok) {
      const text = await res.text();
      return { status: "failed", error: `heygen status (${res.status}): ${text}` };
    }
    const json = (await res.json()) as {
      data?: {
        status?: string;
        video_url?: string;
        failure_message?: string;
        failure_code?: string;
      };
    };
    const data = json.data ?? {};

    switch (data.status) {
      case "pending":
      case "processing":
        return { status: "generating" };
      case "completed":
        return { status: "ready", outputUrl: data.video_url };
      case "failed":
        return {
          status: "failed",
          error: data.failure_message ?? data.failure_code ?? "heygen failed",
        };
      default:
        return { status: "generating" };
    }
  },
};
