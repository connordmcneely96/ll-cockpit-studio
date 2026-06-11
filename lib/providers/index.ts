// Provider registry. HeyGen registers here in Sprint 178B-2b.
import { falProvider } from "./fal";
import type { VideoProvider } from "./types";

export function getProvider(name: string): VideoProvider {
  if (name === "fal") return falProvider;
  throw new Error(`unknown provider: ${name}`);
}
