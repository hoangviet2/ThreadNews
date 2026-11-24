/** Ingest → retrieve → communities against the Firestore emulator. Run: `pnpm test:emulator` (skipped otherwise). */
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { diffClaims, parseContext } from "@threadnews/shared/graph";
import { buildCommunities, ingest, localSearch, type GraphExtraction } from "../src";

const on = !!process.env.FIRESTORE_EMULATOR_HOST;
const db = on ? getFirestore(initializeApp({ projectId: "demo-threadnews" })) : (null as never);
if (on) db.settings({ ignoreUndefinedProperties: true });

/** Deterministic bag-of-words vectors: similar text → similar vector. */
const embed = async (texts: string[]) =>
  texts.map((t) => {
    const v = Array<number>(32).fill(0);
    for (const w of t.toLowerCase().match(/\p{L}+|\d+/gu) ?? []) v[[...w].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % 32]! += 1;
    return v;
  });
const opts = { storyMatchThreshold: 0.6, entityMergeThreshold: 0.9 };

const day1: GraphExtraction = {
  story: { title: "Earthquake in Xland", summary: "A strong earthquake hit Xland; rescue teams and the Red Cross respond." },
  events: [{ tempId: "e1", date: "2026-11-22", headline: "M6.8 quake strikes Xland", description: "Strong quake near the capital.", sourceUrls: ["https://a.example/q1"] }],
  claims: [{ tempId: "c1", eventTempId: "e1", subject: "earthquake in Xland", predicate: "death toll", value: "12", asOf: "2026-11-22", sourceUrls: ["https://a.example/q1"] }],
  entities: [
    { tempId: "n1", name: "Xland", type: "place", description: "Country hit by the quake", aliases: [] },
    { tempId: "n2", name: "Red Cross", type: "org", description: "Humanitarian organization", aliases: ["IFRC"] },
    { tempId: "n3", name: "Xland Rescue Service", type: "org", description: "National rescue agency", aliases: [] },
  ],
  mentions: [{ eventTempId: "e1", entityTempId: "n1" }, { eventTempId: "e1", entityTempId: "n2" }, { claimTempId: "c1", entityTempId: "n3" }],
  relations: [{ a: "n2", b: "n3", relation: "works with" }],
  sources: [{ url: "https://a.example/q1?utm_source=x", publisher: "A News", title: "Quake strikes Xland", publishedAt: "2026-11-22" }],
};
const day2: GraphExtraction = {
  ...day1,
  events: [{ tempId: "e2", date: "2026-11-23", headline: "Toll revised as rescuers reach villages", description: "Rescue teams revise the toll.", sourceUrls: ["https://b.example/q2"] }],
  claims: [
    { tempId: "c1", eventTempId: "e2", subject: "earthquake in Xland", predicate: "fatalities", value: "30", asOf: "2026-11-23", sourceUrls: ["https://b.example/q2"], replaces: { value: "12", reason: "revised" } },
  ],
  mentions: [{ eventTempId: "e2", entityTempId: "n1" }, { eventTempId: "e2", entityTempId: "n3" }],
  sources: [{ url: "https://b.example/q2", publisher: "B Wire", title: "Death toll in Xland quake climbs to 30", publishedAt: "2026-11-23" }],
};

describe.skipIf(!on)("graph on the emulator", () => {
  it("ingests, supersedes, retrieves, diffs and clusters", async () => {
    const first = await ingest(db, embed, day1, { ...opts, checkId: "t1" });
    expect(first.created).toBe(true);
    expect(await ingest(db, embed, day1, { ...opts, checkId: "t1" })).toEqual(first); // idempotent per checkId

    const second = await ingest(db, embed, day2, { ...opts, checkId: "t2" }); // matched by embedding + entities
    expect(second).toMatchObject({ storyId: first.storyId, status: "moved_on", created: false });

    const claims = (await db.collection("kg_claims").where("storyId", "==", first.storyId).get()).docs.map((d) => d.data());
    expect(claims.map((c) => [c.value, c.status]).sort()).toEqual([["12", "superseded"], ["30", "current"]]);
    expect((await db.collection("kg_entities").where("normName", "==", "red cross").get()).size).toBe(1); // resolved, not duplicated

    const r = await localSearch(db, embed, { mode: "local", headline: "Quake death toll rises in Xland", claims: [{ subject: "earthquake in Xland", predicate: "death toll", value: "12" }], entities: ["Xland"], question: null, storyId: null, budget: "device" }, { ...opts, freshnessHours: 6, tokensDevice: 1500, tokensCloud: 8000 });
    expect(r.storyId).toBe(first.storyId);
    if (!r.storyId) return;
    expect(r.fresh).toBe(true);
    const { changes } = diffClaims([{ subject: "earthquake in Xland", predicate: "death toll", value: "12" }], parseContext(r.context!));
    expect(changes).toMatchObject([{ oldValue: "12", newValue: "30", reason: "revised" }]);

    // Regression: an ingest without entity pairs must not wipe existing snapshot edges.
    const edgesBefore = Object.keys((await db.doc("kg_meta/entityGraph_0").get()).get("edges") ?? {}).length;
    await ingest(db, embed, { ...day1, story: { title: "Lone fact", summary: "One entity, no pairs." }, entities: [day1.entities[0]!], mentions: [], relations: [], claims: [], events: [] }, { ...opts, checkId: "t3", storyId: "lone" });
    expect(Object.keys((await db.doc("kg_meta/entityGraph_0").get()).get("edges") ?? {}).length).toBe(edgesBefore);
    expect(edgesBefore).toBeGreaterThan(0);

    const built = await buildCommunities(db, embed, async () => ({ title: "Xland quake response", summary: "Rescue and relief." }));
    expect(built.processed).toBeGreaterThan(0);
    expect((await db.collection("kg_communities").where("level", "==", 0).get()).size).toBeGreaterThan(0);
    expect(await buildCommunities(db, embed, async () => ({ title: "", summary: "" }))).toEqual({ processed: 0, skipped: 0 }); // nothing dirty
  });
});
