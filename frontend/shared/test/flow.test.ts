import { describe, expect, it, vi } from "vitest";
import { createAiJobs } from "../src/ai/jobs";
import { createDemoApi, memoryStore } from "../src/demo/api";
import { demoStory } from "../src/demo/data";
import { runCheckFlow, type FlowState } from "../src/flow/check-flow";
import type { ExtractedArticle } from "../src/schemas";

const ai = createAiJobs(null); // heuristic path: no Firebase in tests
const mkApi = (tier: "guest" | "member" = "guest") => createDemoApi({ getUser: () => ({ uid: "u1", tier }), store: memoryStore(), latencyMs: 0 });

const fromDemo = (id: string): ExtractedArticle => {
  const a = demoStory(id)!.article;
  return { url: a.url, title: a.title, publisher: a.publisher, publishedAt: a.publishedAt, text: a.text, isProbablyArticle: true };
};

async function run(article: ExtractedArticle, api = mkApi(), preset = true) {
  const states: FlowState[] = [];
  const saveCheck = vi.fn(async () => {});
  const d = demoStory(article.url.includes("harbor") ? "harbor-bridge" : article.url.includes("library") ? "riverton-library" : "valley-flood")!;
  const final = await runCheckFlow({ article, presetClaims: preset ? { claims: d.article.claims, entities: d.article.entities } : undefined }, { ai, api, saveCheck }, (s) => states.push(s));
  return { final, states, saveCheck };
}

describe("check flow", () => {
  it("known + fresh story → on-device graph check, moved on, saved to history without article text", async () => {
    const { final, states, saveCheck } = await run(fromDemo("harbor-bridge"));
    expect(states.map((s) => s.phase)).toContain("graph_checking");
    expect(final.phase).toBe("done");
    expect(final.result).toMatchObject({ status: "moved_on", inference: "on_device", storyId: "harbor-bridge", grounding: null });
    expect(final.result!.changes.map((c) => c.newValue)).toEqual(["June 10", "$11M"]);
    expect(final.summary.done).toBe(true);
    expect(saveCheck).toHaveBeenCalledOnce();
    const saved = JSON.stringify(saveCheck.mock.calls[0]);
    expect(saved).not.toContain("temporary ferry"); // article body never persisted
  });

  it("finds the story from heuristic claims too (no preset)", async () => {
    const { final } = await run(fromDemo("harbor-bridge"), mkApi(), false);
    expect(final.result?.status).toBe("moved_on");
  });

  it("stale story → cloud check with grounding + usage echo", async () => {
    const { final, states } = await run(fromDemo("valley-flood"));
    expect(states.map((s) => s.phase)).toContain("cloud_checking");
    expect(final.result).toMatchObject({ status: "disputed", inference: "cloud" });
    expect(final.result!.grounding?.searchEntryPointHtml).toBeTruthy();
    expect(final.usage).toMatchObject({ feature: "check", used: 1, limit: 3 });
  });

  it("guest quota exhausted → quota_exceeded error, summary still done", async () => {
    const api = mkApi("guest");
    for (let i = 0; i < 3; i++) await run(fromDemo("valley-flood"), api);
    const { final } = await run(fromDemo("valley-flood"), api);
    expect(final.phase).toBe("error");
    expect(final.error).toMatchObject({ code: "quota_exceeded", details: { limit: 3, used: 3, upgrade: true } });
    expect(final.summary.done).toBe(true);
    expect(final.summary.text.length).toBeGreaterThan(10);
  });

  it("unknown story in demo mode → demo_unavailable, quota refunded", async () => {
    const api = mkApi();
    const { final } = await run({ url: "https://news.example/transit-deal", title: "Transit workers and city reach tentative contract deal", text: "Union leaders and the city agreed on a three-year contract on Friday. Members still have to vote on it next week, officials said.", isProbablyArticle: true }, api, false);
    expect(final.error?.code).toBe("demo_unavailable");
    const me = await api.me();
    expect(me.ok && me.data.usage.check).toBe(0);
  });

  it("not news → gatekeeper_only, no API check", async () => {
    const api = mkApi();
    const spy = vi.spyOn(api, "check");
    const states: FlowState[] = [];
    const final = await runCheckFlow({ article: { url: "https://shop.example/p", title: "Blue mug", text: "short", isProbablyArticle: false } }, { ai, api }, (s) => states.push(s));
    expect(final.result?.status).toBe("not_news");
    expect(spy).not.toHaveBeenCalled();
  });
});
