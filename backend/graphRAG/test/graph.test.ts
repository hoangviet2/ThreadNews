import { describe, expect, it } from "vitest";
import { parseContext } from "@threadnews/shared/graph";
import { canonicalUrl, factKey, normName, rankAndPack, searchScore, stableIds, storyMatchScore, versionClaim, type PackNode } from "../src";

describe("text", () => {
  it("normName strips honorifics, accents, punctuation", () => {
    expect(normName("President Emmanuel Macron")).toBe("emmanuel macron");
    expect(normName("Société Générale, S.A.")).toBe("societe generale s a");
  });
  it("canonicalUrl drops tracking, fragment, www", () => {
    expect(canonicalUrl("https://WWW.Reuters.com/a/?utm_source=x&id=2#top")).toBe("https://reuters.com/a/?id=2");
  });
  it("factKey maps predicate synonyms", () => {
    expect(factKey({ subject: "Earthquake in X", predicate: "fatalities" })).toBe(factKey({ subject: "earthquake in x", predicate: "Death toll" }));
  });
});

describe("versionClaim", () => {
  const cur = { id: "c1", value: "12", asOf: "2026-11-22", status: "current" as const };
  it("same value → same", () => expect(versionClaim([cur], { value: " 12 ", disputed: false })).toEqual({ kind: "same", id: "c1" }));
  it("none → new", () => expect(versionClaim([], { value: "12", disputed: false })).toEqual({ kind: "new" }));
  it("newer value → supersede", () => expect(versionClaim([cur], { value: "30", asOf: "2026-11-23", disputed: false })).toEqual({ kind: "supersede", oldId: "c1" }));
  it("older value → recorded as history", () => expect(versionClaim([cur], { value: "8", asOf: "2026-11-21", disputed: false })).toEqual({ kind: "older", currentId: "c1" }));
  it("disagreeing sources → dispute", () => expect(versionClaim([cur], { value: "30", disputed: true })).toEqual({ kind: "dispute", otherId: "c1" }));
  it("superseded claims are history, not current", () =>
    expect(versionClaim([{ ...cur, status: "superseded" }, { id: "c3", value: "30", asOf: "2026-11-23", status: "current" }], { value: "41", asOf: "2026-11-24", disputed: false })).toEqual({ kind: "supersede", oldId: "c3" }));
});

describe("rankAndPack", () => {
  const header = 'STORY s1 "Quake" status=moved_on updated=2026-11-24T02:10Z checked=2026-11-24T03:00Z';
  const nodes: PackNode[] = [
    { id: "c1", kind: "claim", group: "k", score: 0.9, line: "CLAIM c1 [superseded→c3] earthquake in x :: death toll = 12 (asOf 2026-11-22) src=s1 reason=revised" },
    { id: "c3", kind: "claim", group: "k", score: 0.1, line: "CLAIM c3 [current] earthquake in x :: death toll = 30 (asOf 2026-11-23) src=s2" },
    { id: "e1", kind: "event", score: 0.5, line: 'EVENT e1 2026-11-22 "M6.8 quake strikes X" src=s1' },
    { id: "n1", kind: "entity", score: 0.01, line: "ENTITY n1 org \"Red Cross\" — " + "x".repeat(400) },
  ];
  it("keeps chains whole, respects the budget, output parses", () => {
    const p = rankAndPack(header, nodes, 120);
    expect(p.nodeIds).toEqual(["e1", "c1", "c3"]);
    expect(p.tokenEstimate).toBeLessThanOrEqual(120);
    const ctx = parseContext(p.context);
    expect(ctx.story?.id).toBe("s1");
    expect(ctx.claims.map((c) => [c.id, c.status, c.supersededBy])).toEqual([["c1", "superseded", "c3"], ["c3", "current", undefined]]);
  });
});

describe("stableIds", () => {
  it("reuses ids at Jaccard ≥ 0.5, flags > 20% change", () => {
    let n = 0;
    const ids = stableIds([["a", "b", "c", "d"], ["x", "y", "z"], ["p", "q", "r"]], [{ id: "A", members: ["a", "b", "c", "d"] }, { id: "X", members: ["x", "y", "w"] }], () => `new${n++}`);
    expect(ids).toEqual([{ id: "A", changed: false }, { id: "X", changed: true }, { id: "new0", changed: true }]);
  });
});

describe("searchScore", () => {
  it("keyword hits lift a story; unrelated text scores on cosine only", () => {
    const hit = searchScore("Bank of England rates", 0.5, "Bank of England Base Interest Rate Change");
    const miss = searchScore("Bank of England rates", 0.5, "ICE arrest at Seattle airport");
    expect(hit.kw).toBeGreaterThan(0.6);
    expect(miss.kw).toBe(0);
    expect(hit.score).toBeGreaterThan(miss.score);
  });
});

describe("storyMatchScore (ADR-019)", () => {
  const o = { storyMatchThreshold: 0.82, storyMatchCosine: 0.88 };
  it("no query entities: cosine decides (used to be capped at 0.7 → duplicates)", () => {
    expect(storyMatchScore(0.85, [], ["nvidia"], o)).toMatchObject({ ok: true, score: 0.85 });
    expect(storyMatchScore(0.8, [], ["nvidia"], o).ok).toBe(false);
  });
  it("entity names that don't line up no longer block a near-identical story", () => {
    expect(storyMatchScore(0.9, ["nvidia corporation"], ["nvidia", "jensen huang"], o).ok).toBe(true);
  });
  it("related-but-different stories stay apart", () => {
    expect(storyMatchScore(0.82, ["bank of england"], ["office for national statistics"], o).ok).toBe(false);
  });
  it("shared entities still lift a moderate match", () => {
    expect(storyMatchScore(0.8, ["jensen huang", "nvidia"], ["nvidia", "jensen huang", "colette kress"], o).ok).toBe(true);
  });
});
