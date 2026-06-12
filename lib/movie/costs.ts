// Approximate generation cost estimates (Sprint 178B-2b-2a).
//
// ESTIMATES — tune later; reconcile against provider billing in a later slice.
// These feed movie_assets.cost_usd / movie_renders.total_cost_usd so the product
// always has a non-zero meter, even before real billing reconciliation exists.

const FAL_USD_PER_SECOND = 0.1; // fal footage, per output second
const FAL_DEFAULT_SECONDS = 5; // assume a 5s clip when scene duration is unknown
const HEYGEN_USD_PER_CLIP = 0.5; // heygen avatar, flat per clip
const FALLBACK_USD = 0.1; // unknown provider/model — never silently zero

export function estimateCost(
  provider: string,
  model: string,
  durationSeconds?: number
): number {
  // model is reserved for per-model tuning in a later slice; not yet differentiated.
  void model;

  if (provider === "fal") {
    const seconds = durationSeconds ?? FAL_DEFAULT_SECONDS;
    return Number((seconds * FAL_USD_PER_SECOND).toFixed(4));
  }

  if (provider === "heygen") {
    return HEYGEN_USD_PER_CLIP;
  }

  return FALLBACK_USD;
}
