/**
 * Check flow state machine, shared by the website and the side panel (docs/WEBSITE.md).
 *
 * idle → gatekeeping ─┬─ not_news → done
 *                     └─ retrieving ─┬─ fresh story → graph_checking (on-device) → done
 *                                    └─ unknown/stale → cloud_checking (API) → done
 * any → error(kind)
 *
 * The summary streams in parallel from `gatekeeping` on. Article text never leaves this module
 * except into on-device AI jobs; the API only gets headline, URL, publisher, date, claims, entities.
 */
import type { AiJobs } from "../ai/jobs";
import type { ThreadNewsApi } from "../api/client";
import { headlineFromUrl, urlHash } from "../format";
import type { ApiError, ArticleMeta, Change, Claim, ClientCheckDoc, ExtractedArticle, GatekeeperResult, Grounding, Inference, Source, Status, Usage } from "../schemas";

export type Phase = "idle" | "gatekeeping" | "retrieving" | "graph_checking" | "cloud_checking" | "done" | "error";

export type CheckViewModel = {
  status: Status;
  summary: string;
  changes: Change[];
  sources: Source[];
  grounding: Grounding | null;
  inference: Inference;
  storyId: string | null;
  cached: boolean;
  checkedAt: string;
};

export type FlowState = {
  phase: Phase;
  article?: ArticleMeta;
  gate?: GatekeeperResult;
  summary: { text: string; inference?: Inference; done: boolean };
  result?: CheckViewModel;
  error?: ApiError;
  usage?: Usage;
};

export const initialFlowState: FlowState = { phase: "idle", summary: { text: "", done: false } };

export type FlowInput = {
  article: ExtractedArticle;
  /** Claims already known (e.g. example stories) — skips extraction. */
  presetClaims?: { claims: Claim[]; entities: string[] };
  readingLevel?: "standard" | "simple";
};

export type FlowDeps = {
  ai: AiJobs;
  api: ThreadNewsApi;
  saveCheck?: (doc: ClientCheckDoc) => Promise<void>;
  onDeviceRun?: () => void;
};

/** Runs one check, reporting each state. Resolves with the final state. Abort via `signal`. */
export async function runCheckFlow(input: FlowInput, deps: FlowDeps, emit: (s: FlowState) => void, signal?: AbortSignal): Promise<FlowState> {
  const a = input.article;
  const meta: ArticleMeta = { url: a.url, title: a.title, publisher: a.publisher, publishedAt: a.publishedAt };
  let state: FlowState = { ...initialFlowState, phase: "gatekeeping", article: meta };
  const set = (patch: Partial<FlowState>) => {
    if (signal?.aborted) return;
    state = { ...state, ...patch };
    emit(state);
  };
  emit(state);

  const hasText = a.text.trim().length > 40;

  // Summary streams in parallel (on-device first).
  const summaryDone = hasText
    ? deps.ai
        .summary({ text: a.text }, input.readingLevel ?? "standard", (text) => set({ summary: { ...state.summary, text } }))
        .then((r) => {
          set({ summary: { text: r.value, inference: r.inference, done: true } });
          if (r.inference === "on_device") deps.onDeviceRun?.();
        })
        .catch(() => set({ summary: { ...state.summary, done: true } }))
    : Promise.resolve(set({ summary: { text: "", done: true } }));

  // 1. Gatekeeper (on-device), unless claims are already known or there's only a URL.
  let gate: GatekeeperResult;
  if (input.presetClaims) {
    gate = { isNews: true, timeSensitive: true, needsCheck: true, topic: a.title, claims: input.presetClaims.claims, entities: input.presetClaims.entities, reason: "" };
  } else if (!hasText && !a.isProbablyArticle) {
    gate = { isNews: false, timeSensitive: false, needsCheck: false, topic: a.title, claims: [], entities: [], reason: "This page doesn't look like a news article." };
  } else if (!hasText) {
    gate = { isNews: true, timeSensitive: true, needsCheck: true, topic: a.title || headlineFromUrl(a.url), claims: [], entities: [], reason: "Link only" };
  } else {
    gate = (await deps.ai.gatekeeper({ title: a.title, text: a.text, publishedAt: a.publishedAt, isProbablyArticle: a.isProbablyArticle })).value;
  }
  if (signal?.aborted) return state;
  set({ gate });

  if (!gate.isNews) {
    await summaryDone;
    const result: CheckViewModel = { status: "not_news", summary: gate.reason || "This page doesn't look like a news article.", changes: [], sources: [], grounding: null, inference: "on_device", storyId: null, cached: false, checkedAt: new Date().toISOString() };
    set({ phase: "done", result });
    await save(deps, meta, gate, result, "gatekeeper_only");
    return state;
  }

  const headline = a.title || headlineFromUrl(a.url);
  const claims = gate.claims.slice(0, 30);
  const entities = gate.entities.slice(0, 20);

  // 2. GraphRAG local retrieval.
  set({ phase: "retrieving" });
  const ret = await deps.api.retrieve({ mode: "local", headline, claims, entities, question: null, storyId: null, budget: "device" });
  if (signal?.aborted) return state;

  // 3a. Known & fresh → on-device graph check (no cloud call).
  if (ret.ok && ret.data.storyId && ret.data.fresh && ret.data.context) {
    set({ phase: "graph_checking" });
    const r = await deps.ai.graphCheck({ claims, publishedAt: a.publishedAt, context: ret.data.context, articleText: hasText ? a.text : undefined });
    if (signal?.aborted) return state;
    if (r.inference === "on_device") deps.onDeviceRun?.();
    const result: CheckViewModel = {
      ...r.value,
      sources: r.sources,
      grounding: null,
      inference: r.inference,
      storyId: ret.data.storyId,
      cached: false,
      checkedAt: new Date().toISOString(),
    };
    set({ phase: "done", result });
    await save(deps, meta, gate, result, "graph_check");
    await summaryDone;
    return state;
  }

  // 3b. Unknown or stale → cloud check through the API (quota-limited).
  if (!ret.ok && ret.error.code !== "quota_exceeded") {
    set({ phase: "error", error: ret.error });
    await summaryDone;
    return state;
  }
  set({ phase: "cloud_checking" });
  const res = await deps.api.check({
    articleUrl: a.canonicalUrl ?? a.url,
    headline,
    publisher: a.publisher,
    publishedAt: a.publishedAt,
    claims,
    entities,
    storyId: ret.ok ? (ret.data.storyId ?? undefined) : undefined,
  });
  if (signal?.aborted) return state;
  if (!res.ok) {
    set({ phase: "error", error: res.error });
    await summaryDone;
    return state;
  }
  const d = res.data;
  set({
    phase: "done",
    usage: d.usage,
    result: { status: d.status, summary: d.summary, changes: d.changes, sources: d.sources, grounding: d.grounding, inference: "cloud", storyId: d.storyId, cached: d.cached, checkedAt: d.checkedAt },
  });
  await summaryDone;
  return state;
}

async function save(deps: FlowDeps, a: ArticleMeta, gate: GatekeeperResult, r: CheckViewModel, source: ClientCheckDoc["source"]) {
  if (!deps.saveCheck) return;
  try {
    await deps.saveCheck({
      articleUrl: a.url,
      urlHash: await urlHash(a.url),
      headline: a.title.slice(0, 300),
      ...(a.publisher ? { publisher: a.publisher } : {}),
      ...(a.publishedAt ? { publishedAt: a.publishedAt } : {}),
      claims: gate.claims.slice(0, 30),
      entities: gate.entities.slice(0, 20),
      storyId: r.storyId,
      result: { status: r.status, changes: r.changes, summary: r.summary },
      inference: r.inference,
      source,
    });
  } catch {
    /* history is best-effort */
  }
}
