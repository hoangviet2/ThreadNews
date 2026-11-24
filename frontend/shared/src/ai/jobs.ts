/**
 * On-device-first jobs (docs/architecture/02-hybrid-ai.md "Jobs"). Each returns the value and where it ran.
 * With no engine (Firebase not configured) or on engine failure, deterministic fallbacks keep the UI working.
 */
import { contextSources, diffClaims, parseContext } from "../graph/context";
import { ASK_LOCAL_V1, ASK_ROUTER_V1, GATEKEEPER_V1, GRAPH_CHECK_V1, READER_SIMPLE_V1, READER_V1 } from "../prompts";
import { AskAnswer, AskRoute, CheckResult, GatekeeperResult, type Change, type Claim, type Inference, type Source } from "../schemas";
import { trimArticle, trimContext } from "./budget";
import type { AiEngine } from "./engine";
import { heuristicAskLocal, heuristicAskRoute, heuristicGatekeeper, heuristicSummary } from "./heuristic";

export type Labeled<T> = { value: T; inference: Inference; fallback?: boolean };

export type AiJobs = {
  hasEngine: boolean;
  initializeDeviceModel(onProgress: (fraction: number) => void): Promise<void>;
  gatekeeper(a: { title: string; text: string; publishedAt?: string; isProbablyArticle?: boolean }): Promise<Labeled<GatekeeperResult>>;
  summary(a: { text: string }, level: "standard" | "simple", onText: (text: string) => void): Promise<Labeled<string>>;
  graphCheck(a: { claims: Claim[]; publishedAt?: string; context: string; articleText?: string }): Promise<Labeled<CheckResult> & { sources: Source[] }>;
  askRoute(question: string): Promise<"local" | "global">;
  askLocal(question: string, context: string): Promise<Labeled<AskAnswer>>;
};

export function statusSummary(status: CheckResult["status"], changes: number): string {
  if (status === "moved_on") return `${changes} ${changes === 1 ? "fact" : "facts"} in this article changed after it was published.`;
  if (status === "disputed") return "Sources disagree on some facts in this story.";
  return "No major changes since this was published.";
}

const local = <T>(value: T): Labeled<T> => ({ value, inference: "on_device", fallback: true });

export function createAiJobs(engine: AiEngine | null): AiJobs {
  return {
    hasEngine: !!engine,

    async initializeDeviceModel(onProgress) {
      if (!engine) throw new Error("On-device AI needs Firebase AI Logic to be configured.");
      await engine.initializeDeviceModel(onProgress);
    },

    async gatekeeper(a) {
      const text = trimArticle(a.text);
      if (!engine) return local(heuristicGatekeeper({ ...a, text }));
      try {
        return await engine.json(GatekeeperResult, GATEKEEPER_V1.build({ title: a.title, publishedAt: a.publishedAt, text }), { temperature: 0.1, maxOutputTokens: 400 });
      } catch {
        return local(heuristicGatekeeper({ ...a, text }));
      }
    },

    async summary(a, level, onText) {
      const text = trimArticle(a.text);
      const prompt = (level === "simple" ? READER_SIMPLE_V1 : READER_V1).build({ text });
      if (engine) {
        try {
          const r = await engine.stream(prompt, onText);
          if (r.text.trim()) return { value: r.text, inference: r.inference };
        } catch {
          /* fall through to the extractive summary */
        }
      }
      const s = heuristicSummary(text);
      onText(s);
      return local(s);
    },

    async graphCheck(a) {
      const ctx = parseContext(a.context);
      const sources = contextSources(ctx);
      const exact = diffClaims(a.claims, ctx, a.articleText);
      const decide = (changes: Change[]) => (changes.length ? "moved_on" : exact.disputed.length ? "disputed" : "current") as CheckResult["status"];

      if (engine) {
        try {
          const r = await engine.json(
            CheckResult,
            GRAPH_CHECK_V1.build({ publishedAt: a.publishedAt, claims: a.claims, candidates: exact.changes, context: trimContext(a.context) }),
            { temperature: 0.1, maxOutputTokens: 300 },
          );
          // Code decides exact matches; Nano may add fuzzy ones and writes the summary (GRAPHRAG §4).
          const extra = r.value.changes.filter((c) => !exact.changes.some((e) => e.fact.toLowerCase() === c.fact.toLowerCase()));
          const changes = [...exact.changes, ...extra].slice(0, 5);
          const status = decide(changes);
          const summary = r.value.status === status && r.value.summary ? r.value.summary : statusSummary(status, changes.length);
          return { value: { status, summary, changes }, inference: r.inference, sources };
        } catch {
          /* deterministic result below */
        }
      }
      const status = decide(exact.changes);
      return { ...local({ status, summary: statusSummary(status, exact.changes.length), changes: exact.changes }), sources };
    },

    async askRoute(question) {
      if (!engine) return heuristicAskRoute(question);
      try {
        return (await engine.json(AskRoute, ASK_ROUTER_V1.build({ question }), { temperature: 0.1, maxOutputTokens: 20 })).value.mode;
      } catch {
        return heuristicAskRoute(question);
      }
    },

    async askLocal(question, context) {
      if (engine) {
        try {
          return await engine.json(AskAnswer, ASK_LOCAL_V1.build({ question, context: trimContext(context) }), { temperature: 0.2, maxOutputTokens: 300 });
        } catch {
          /* fall through */
        }
      }
      return local(heuristicAskLocal(question, parseContext(context)));
    },
  };
}
