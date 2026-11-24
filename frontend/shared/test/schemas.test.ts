import { describe, expect, it } from "vitest";
import { toJsonSchema } from "../src/ai/engine";
import { createDemoApi, memoryStore } from "../src/demo/api";
import { AskAnswer, CheckResult, GatekeeperResult } from "../src/schemas";
import { parseSummary } from "../src/ui/summary";

describe("AI schemas", () => {
  it("accept golden outputs", () => {
    expect(GatekeeperResult.safeParse({ isNews: true, timeSensitive: true, needsCheck: true, topic: "Quake in X", claims: [{ subject: "earthquake in X", predicate: "death toll", value: "12" }], entities: ["X"], reason: "Toll may change" }).success).toBe(true);
    expect(CheckResult.safeParse({ status: "moved_on", summary: "Toll revised.", changes: [{ fact: "Death toll", oldValue: "12", newValue: "30", reason: "revised" }] }).success).toBe(true);
    expect(AskAnswer.safeParse({ answer: "Yes.", citations: ["c3"], confident: true }).success).toBe(true);
  });

  it("reject malformed outputs", () => {
    expect(GatekeeperResult.safeParse({ isNews: "yes" }).success).toBe(false);
    expect(CheckResult.safeParse({ status: "true", summary: "", changes: [] }).success).toBe(false); // no truth verdicts
    expect(CheckResult.safeParse({ status: "current", summary: "", changes: Array(6).fill({ fact: "a", oldValue: "b", newValue: "c", reason: "revised" }) }).success).toBe(false);
  });

  it("produce a JSON schema for structured output (no $schema key)", () => {
    const js = toJsonSchema(CheckResult);
    expect(js.$schema).toBeUndefined();
    expect(js.type).toBe("object");
    expect(Object.keys(js.properties as object)).toEqual(["status", "summary", "changes"]);
  });
});

describe("parseSummary", () => {
  it("splits TL;DR and 5W rows", () => {
    const r = parseSummary("The bridge will reopen later. Costs rose.\n\nWho: State dept.\n- **What:** Delay\nWhen — Nov 23");
    expect(r.tldr).toBe("The bridge will reopen later. Costs rose.");
    expect(r.rows).toEqual([
      { k: "Who", v: "State dept." },
      { k: "What", v: "Delay" },
      { k: "When", v: "Nov 23" },
    ]);
  });
});

describe("demo API tiers", () => {
  it("guests can't generate explainers or ask globally; members can", async () => {
    let tier: "guest" | "member" = "guest";
    const api = createDemoApi({ getUser: () => ({ uid: "u", tier }), store: memoryStore(), latencyMs: 0 });
    const g = await api.getExplainer("riverton-library");
    expect(!g.ok && g.error).toMatchObject({ code: "not_generated", details: { canGenerate: false } });
    expect((await api.generateExplainer("riverton-library")).ok).toBe(false);
    expect((await api.ask({ storyId: "harbor-bridge", question: "Why?", mode: "global" })).ok).toBe(false);
    tier = "member";
    const gen = await api.generateExplainer("riverton-library");
    expect(gen.ok && gen.data.usage).toMatchObject({ feature: "explainer", used: 1, limit: 20 });
    expect((await api.getExplainer("riverton-library")).ok).toBe(true);
    expect((await api.follow({ storyId: "harbor-bridge", articleUrl: "x" })).ok).toBe(true);
    const dup = await api.follow({ storyId: "harbor-bridge", articleUrl: "x" });
    expect(!dup.ok && dup.error.code).toBe("conflict");
    const f = await api.follows();
    expect(f.ok && f.data.items.map((i) => i.storyId)).toEqual(["harbor-bridge"]);
  });
});
