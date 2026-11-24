import { describe, expect, it } from "vitest";
import { claimKey, diffClaims, parseContext } from "../src/graph/context";
import { buildContext } from "../src/demo/context";
import { demoStory } from "../src/demo/data";

const CTX = `STORY s_01 "Earthquake in X" status=moved_on updated=2026-11-24T02:10Z checked=2026-11-24T03:00Z
EVENT e1 2026-11-22 "M6.8 quake strikes X" src=s1,s2
CLAIM c1 [superseded→c3] earthquake in X :: death toll = 12 (asOf 2026-11-22) src=s1
CLAIM c3 [current] earthquake in X :: death toll = 30 (asOf 2026-11-23) src=s2,s5
CLAIM c5 [disputed] earthquake in X :: magnitude = 6.8 | 7.1 src=s1|s6
SOURCE s2 Reuters 2026-11-23 "Death toll in X quake climbs to 30" url=https://reuters.example/x`;

describe("parseContext", () => {
  it("parses the documented format", () => {
    const c = parseContext(CTX);
    expect(c.story?.id).toBe("s_01");
    expect(c.events).toHaveLength(1);
    expect(c.claims.map((x) => x.id)).toEqual(["c1", "c3", "c5"]);
    expect(c.claims[0]).toMatchObject({ status: "superseded", supersededBy: "c3", value: "12", asOf: "2026-11-22" });
    expect(c.claims[2]!.sourceIds).toEqual(["s1", "s6"]);
    expect(c.sources[0]).toMatchObject({ id: "s2", publisher: "Reuters", date: "2026-11-23", url: "https://reuters.example/x" });
  });
});

describe("diffClaims (deterministic, by claimKey)", () => {
  const ctx = parseContext(CTX);

  it("finds a revised value", () => {
    const { changes } = diffClaims([{ subject: "Earthquake in X", predicate: "Death toll", value: "12" }], ctx);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ oldValue: "12", newValue: "30", reason: "revised", sourceUrl: "https://reuters.example/x", date: "2026-11-23" });
  });

  it("reports nothing when the article already has the latest value", () => {
    expect(diffClaims([{ subject: "earthquake in X", predicate: "death toll", value: "30" }], ctx).changes).toEqual([]);
  });

  it("does not turn disputed claims into changes", () => {
    const r = diffClaims([{ subject: "earthquake in X", predicate: "magnitude", value: "6.8" }], ctx);
    expect(r.changes).toEqual([]);
    expect(r.disputed).toHaveLength(1);
  });

  it("matches superseded values found in the on-device article text", () => {
    const r = diffClaims([], ctx, "Officials said 12 people died.");
    expect(r.changes[0]).toMatchObject({ oldValue: "12", newValue: "30" });
  });

  it("claimKey normalizes case and punctuation", () => {
    expect(claimKey({ subject: "Harbor Bridge", predicate: "Reopening date" })).toBe("harbor-bridge::reopening-date");
  });

  it("round-trips the demo story context", () => {
    const d = demoStory("harbor-bridge")!;
    const { changes } = diffClaims(d.article.claims, parseContext(buildContext(d, "device").context));
    expect(changes.map((c) => [c.oldValue, c.newValue])).toEqual([
      ["March 3", "June 10"],
      ["$4M", "$11M"],
    ]);
  });
});

describe("story helpers", async () => {
  const { storyChanges, articleEventId } = await import("../src/graph/story");
  const d = demoStory("harbor-bridge")!;
  const b = { story: d.story, events: d.events, claims: d.claims, sources: d.sources, entities: d.entities };
  it("derives what changed from supersede chains", () => {
    expect(storyChanges(b).map((c) => `${c.oldValue}→${c.newValue}`)).toEqual(["March 3→June 10", "$4M→$11M"]);
  });
  it("puts 'You are here' on the article's own event", () => {
    expect(articleEventId(b, d.article.url)).toBe("e2");
  });
});
