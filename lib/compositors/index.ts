// Compositor registry — native fetch only, NO vendor SDK (house rule).
// Each compositor POSTs the CompositionSpec to its Cloud Run render endpoint.
import { getEnv } from "@/lib/movie";
import type { Compositor, CompositionSpec } from "./types";

type CompositorEnv = {
  REMOTION_RENDER_URL?: string;
  HYPERFRAMES_RENDER_URL?: string;
  COMPOSITOR_INVOKE_SECRET?: string;
};

function getCompositorEnv(): CompositorEnv {
  return getEnv() as unknown as CompositorEnv;
}

// Shared POST: dispatch the spec to a Cloud Run render URL with the invoke secret.
async function invoke(
  renderUrl: string | undefined,
  urlVarName: string,
  spec: CompositionSpec
): Promise<{ accepted: boolean; detail?: string }> {
  if (!renderUrl) throw new Error(`${urlVarName} not configured`);
  const { COMPOSITOR_INVOKE_SECRET } = getCompositorEnv();
  const res = await fetch(renderUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Invoke-Secret": COMPOSITOR_INVOKE_SECRET ?? "",
    },
    body: JSON.stringify(spec),
  });
  return { accepted: res.ok, detail: res.ok ? undefined : `${res.status}` };
}

export const remotionCompositor: Compositor = {
  name: "remotion",
  render(spec: CompositionSpec) {
    return invoke(getCompositorEnv().REMOTION_RENDER_URL, "REMOTION_RENDER_URL", spec);
  },
};

export const hyperframesCompositor: Compositor = {
  name: "hyperframes",
  render(spec: CompositionSpec) {
    return invoke(getCompositorEnv().HYPERFRAMES_RENDER_URL, "HYPERFRAMES_RENDER_URL", spec);
  },
};

export function getCompositor(name: string): Compositor {
  if (name === "remotion") return remotionCompositor;
  if (name === "hyperframes") return hyperframesCompositor;
  throw new Error(`unknown compositor: ${name}`);
}
