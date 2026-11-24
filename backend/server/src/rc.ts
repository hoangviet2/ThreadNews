/** Remote Config (docs/DEPLOYMENT.md §5): the deployed template's default values, cached 5 min, code defaults as fallback. */
import { RC_DEFAULTS } from "@threadnews/shared/config";
import { env } from "./env";
import { remoteConfig } from "./firebase";

export const RC = {
  ...RC_DEFAULTS,
  model_cloud: "gemini-3.8-flash",
  model_embedding: "gemini-embedding-2",
  embedding_dims: 768,
  limits_guest: { retrieve: 20, check: 3, explainer: 0, ask: 0, follows: 0 },
  limits_member: { retrieve: 200, check: 50, explainer: 20, ask: 30, follows: 50 },
  global_daily_ai_budget: 1000,
  context_tokens_device: 1500,
  context_tokens_cloud: 8000,
  story_match_threshold: 0.82,
  entity_merge_threshold: 0.9,
};
type Widen<T> = { [K in keyof T]: T[K] extends boolean ? boolean : T[K] extends number ? number : T[K] extends string ? string : T[K] };
export type Rc = Widen<typeof RC>;

let cache: { at: number; v: Rc } | undefined;

export async function rc(): Promise<Rc> {
  if (cache && Date.now() - cache.at < 300_000) return cache.v;
  const v: Rc = { ...RC };
  // Credentials: a service-account key (Vercel/local) or the runtime identity on Google Cloud (K_SERVICE is set there).
  if (env().FIREBASE_PRIVATE_KEY || process.env.K_SERVICE) {
    try {
      // The template `firebase deploy --only remoteconfig` publishes (backend/database/remoteconfig.template.json).
      const { parameters } = await remoteConfig().getTemplate();
      const r = v as Record<string, unknown>;
      for (const [k, d] of Object.entries(RC)) {
        const raw = (parameters[k]?.defaultValue as { value?: string } | undefined)?.value;
        if (raw === undefined) continue;
        if (typeof d === "number") r[k] = Number.isFinite(Number(raw)) ? Number(raw) : d;
        else if (typeof d === "boolean") r[k] = raw === "true";
        else if (typeof d === "string") r[k] = raw;
        else r[k] = { ...d, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn(JSON.stringify({ msg: "remote config unavailable, using defaults", err: String(e) }));
    }
  }
  cache = { at: Date.now(), v };
  return v;
}
