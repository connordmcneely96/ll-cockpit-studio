// Compositor contracts (Sprint 178B-2b-1). A compositor accepts a finished set of
// generated assets and renders the final video on a Cloud Run container. Fire-and-accept;
// the container reports completion back through the render state machine (later slice).
import type { AssetKind } from "../providers/types";

export type CompositionAsset = {
  url: string;
  kind: AssetKind;
  sceneIndex?: number;
};

export type CompositionSpec = {
  renderId: string;
  tenantId: string;
  aspectRatio?: string;
  assets: CompositionAsset[];
  meta?: Record<string, unknown>;
};

export interface Compositor {
  name: string;
  render(spec: CompositionSpec): Promise<{ accepted: boolean; detail?: string }>;
}
