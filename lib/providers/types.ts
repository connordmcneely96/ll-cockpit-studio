// Gateway-first video generation provider contracts (Sprint 178B-2a).
// Providers wrap async generation APIs behind submit/check; no vendor SDKs.

export type GenInput = {
  prompt: string;
  imageUrl?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  resolution?: string;
};

export type GenSubmit = {
  providerRequestId: string;
};

export type GenStatus = {
  status: "generating" | "ready" | "failed";
  outputUrl?: string;
  error?: string;
};

export interface VideoProvider {
  name: string;
  submit(model: string, input: GenInput): Promise<GenSubmit>;
  check(model: string, providerRequestId: string): Promise<GenStatus>;
}
