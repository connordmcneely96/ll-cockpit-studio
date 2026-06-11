// Provider registry.
import { falProvider } from "./fal";
import { heygenProvider } from "./heygen";
import type { VideoProvider } from "./types";

export function getProvider(name: string): VideoProvider {
  if (name === "fal") return falProvider;
  if (name === "heygen") return heygenProvider;
  throw new Error(`unknown provider: ${name}`);
}
