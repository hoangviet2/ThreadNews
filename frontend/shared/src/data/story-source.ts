/**
 * Read-only story subgraph for the explainer / graph pages. Live mode reads Firestore directly
 * (cheap, no quota — docs/WEBSITE.md "Explainer page"); clients never write kg_* (hard rule 7).
 * A story loads with 4–5 queries (docs/architecture/03-data-model.md).
 */
import type { Firestore } from "firebase/firestore";
import { ClaimDoc, EntityDoc, EventDoc, SourceDoc, StoryDoc } from "../schemas";
import { demoStories, demoStory } from "../demo/data";

export type StoryBundle = { story: StoryDoc; events: EventDoc[]; claims: ClaimDoc[]; sources: SourceDoc[]; entities: EntityDoc[] };
export type StorySource = {
  getStory(storyId: string): Promise<StoryBundle | null>;
  /** Most recently updated stories (homepage). One query. */
  recent(n: number): Promise<StoryDoc[]>;
};

export const demoStorySource: StorySource = {
  async getStory(id) {
    const d = demoStory(id);
    return d ? { story: d.story, events: d.events, claims: d.claims, sources: d.sources, entities: d.entities } : null;
  },
  async recent(n) {
    return demoStories().map((d) => d.story).slice(0, n);
  },
};

/** Firestore Timestamps → ISO strings, recursively; drops embeddings. */
function plain(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === "embedding") continue;
    out[k] = v && typeof v === "object" && "toDate" in v && typeof v.toDate === "function" ? (v.toDate() as Date).toISOString() : v;
  }
  return out;
}

function parseAll<T>(schema: { safeParse(v: unknown): { success: boolean; data?: T } }, docs: { id: string; data(): Record<string, unknown> }[]): T[] {
  return docs.map((d) => schema.safeParse({ id: d.id, ...plain(d.data()) })).flatMap((r) => (r.success && r.data ? [r.data] : []));
}

/** Firestore is loaded on first use (keeps it out of the initial bundle). */
export function createFirestoreStorySource(getDb: () => Promise<Firestore>): StorySource {
  return {
    async getStory(id) {
      const [db, { collection, doc, documentId, getDoc, getDocs, limit, orderBy, query, where }] = await Promise.all([getDb(), import("firebase/firestore")]);
      const snap = await getDoc(doc(db, "kg_stories", id));
      if (!snap.exists()) return null;
      const story = StoryDoc.safeParse({ id: snap.id, ...plain(snap.data()) });
      if (!story.success) return null;

      const [events, claims, sources] = await Promise.all([
        getDocs(query(collection(db, "kg_events"), where("storyId", "==", id), orderBy("date", "desc"), limit(50))),
        getDocs(query(collection(db, "kg_claims"), where("storyId", "==", id), limit(100))),
        getDocs(query(collection(db, "kg_sources"), where("storyId", "==", id), limit(30))),
      ]);
      const ids = story.data.entityIds.slice(0, 30);
      const entities = ids.length ? await getDocs(query(collection(db, "kg_entities"), where(documentId(), "in", ids))) : null;

      return {
        story: story.data,
        events: parseAll(EventDoc, events.docs),
        claims: parseAll(ClaimDoc, claims.docs),
        sources: parseAll(SourceDoc, sources.docs),
        entities: entities ? parseAll(EntityDoc, entities.docs) : [],
      };
    },
    async recent(n) {
      const [db, { collection, getDocs, limit, orderBy, query }] = await Promise.all([getDb(), import("firebase/firestore")]);
      const snap = await getDocs(query(collection(db, "kg_stories"), orderBy("lastUpdatedAt", "desc"), limit(n)));
      return parseAll(StoryDoc, snap.docs);
    },
  };
}
