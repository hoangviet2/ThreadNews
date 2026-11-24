/** Firestore rules tests (docs/TESTING.md → Rules tests). Run with `pnpm test:rules` (starts the emulator). */
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-threadnews",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") },
  });
});
afterAll(() => env.cleanup());

const alice = () => env.authenticatedContext("alice").firestore();
const anon = () => env.unauthenticatedContext().firestore();

const check = (over: Record<string, unknown> = {}) => ({
  createdAt: serverTimestamp(),
  articleUrl: "https://news.example.com/a",
  urlHash: "abc",
  headline: "Quake death toll rises",
  claims: [],
  entities: [],
  storyId: null,
  result: { status: "current", changes: [] },
  inference: "on_device",
  source: "graph_check",
  ...over,
});

describe("users", () => {
  it("owner reads/writes own doc, others can't", async () => {
    await assertSucceeds(setDoc(doc(alice(), "users/alice"), { tier: "guest" }));
    await assertFails(setDoc(doc(alice(), "users/bob"), { tier: "guest" }));
    await assertFails(setDoc(doc(alice(), "users/alice"), { tier: "guest", isAdmin: true }));
    await assertFails(getDoc(doc(env.authenticatedContext("bob").firestore(), "users/alice")));
  });

  it("checks: only on-device sources, no extra fields, ≤ 30 claims", async () => {
    await assertSucceeds(setDoc(doc(alice(), "users/alice/checks/c1"), check()));
    await assertFails(setDoc(doc(alice(), "users/alice/checks/c2"), check({ source: "cloud_check" })));
    await assertFails(setDoc(doc(alice(), "users/alice/checks/c3"), check({ text: "full article" })));
    const claim = { subject: "s", predicate: "p", value: "v" };
    await assertFails(setDoc(doc(alice(), "users/alice/checks/c4"), check({ claims: Array(31).fill(claim) })));
  });

  it("nobody writes follows or usage", async () => {
    await assertFails(setDoc(doc(alice(), "users/alice/follows/s1"), { storyId: "s1" }));
    await assertFails(setDoc(doc(alice(), "usage/alice/days/2026-11-23"), { check: 0 }));
  });
});

describe("knowledge graph", () => {
  it("signed-in can read kg_*, nobody writes, kg_meta closed", async () => {
    await assertSucceeds(getDoc(doc(alice(), "kg_stories/s1")));
    await assertFails(getDoc(doc(anon(), "kg_stories/s1")));
    await assertFails(setDoc(doc(alice(), "kg_claims/c1"), { value: "x" }));
    await assertFails(getDoc(doc(alice(), "kg_meta/state")));
  });
});
