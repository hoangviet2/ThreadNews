/** Remote Config keys + code defaults (docs/DEPLOYMENT.md §5). Never hard-code a model name elsewhere. */
export const RC_DEFAULTS = {
  model_fallback: "gemini-3.5-flash-lite",
  graph_freshness_hours: 6,
  enable_global_search: true,
  enable_graph_view: true,
  maintenance_mode: false,
} as const;

export type RcKey = keyof typeof RC_DEFAULTS;
export type RemoteConfigValues = { [K in RcKey]: (typeof RC_DEFAULTS)[K] extends boolean ? boolean : (typeof RC_DEFAULTS)[K] extends number ? number : string };

export const RC_FETCH_INTERVAL_MS = 3_600_000;

/** Nano hard limit and per-part budgets (docs/architecture/02-hybrid-ai.md). */
export const ON_DEVICE_LIMITS = {
  totalTokens: 9216,
  articleTokens: 6000,
  contextTokens: 1500,
  instructionTokens: 800,
  maxOutputTokens: 400,
} as const;
