/**
 * Indexing (docs/GRAPHRAG.md §3). Idempotent per checkId. One embedding batch, ordered batched writes.
 * Expects the Firestore instance to have `ignoreUndefinedProperties: true` (optional fields are left undefined).
 */
import { FieldValue, type DocumentReference, type DocumentSnapshot, type Firestore, type SetOptions, type WriteBatch } from "firebase-admin/firestore";
import type { ChangeReason, Grounding } from "@threadnews/shared/schemas";
import type { GraphExtraction } from "./schemas";
import { canonicalUrl, cosine, factKey, iso, normName, normValue, overlap, sha, urlHash } from "./text";

export type Embed = (texts: string[]) => Promise<number[][]>;
export type IngestOptions = {
  checkId: string;
  /** Force this story (created if missing). Omit to match by embedding + entities. */
  storyId?: string;
  storyMatchThreshold: number;
  entityMergeThreshold: number;
  grounding?: Grounding | null;
};
export type IngestResult = { storyId: string; status: "current" | "moved_on"; created: boolean };

export type KnownClaim = { id: string; value: string; asOf?: string; status: "current" | "superseded" | "disputed" };
export type ClaimAction =
  | { kind: "new" }
  | { kind: "same"; id: string }
  | { kind: "supersede"; oldId: string }
  | { kind: "dispute"; otherId: string }
  | { kind: "older"; currentId: string };

/** Claim versioning for one claimKey (docs/GRAPHRAG.md §3.2.5). Pure. */
export function versionClaim(known: KnownClaim[], inc: { value: string; asOf?: string; disputed: boolean }): ClaimAction {
  const same = known.find((k) => normValue(k.value) === normValue(inc.value));
  if (same) return { kind: "same", id: same.id };
  const cur = known.filter((k) => k.status !== "superseded").sort((a, b) => (b.asOf ?? "").localeCompare(a.asOf ?? ""))[0];
  if (!cur) return { kind: "new" };
  if (inc.disputed) return { kind: "dispute", otherId: cur.id };
  if (inc.asOf && cur.asOf && inc.asOf < cur.asOf) return { kind: "older", currentId: cur.id };
  return { kind: "supersede", oldId: cur.id };
}

/** Ordered writes in batches of ≤ 400 (BulkWriter reorders, which breaks create-then-update on the same doc). */
export function batchWriter(db: Firestore) {
  const ops: ((b: WriteBatch) => void)[] = [];
  return {
    set: (ref: DocumentReference, data: Record<string, unknown>, opts: SetOptions = {}) => void ops.push((b) => b.set(ref, data, opts)),
    update: (ref: DocumentReference, data: Record<string, unknown>) => void ops.push((b) => b.update(ref, data)),
    delete: (ref: DocumentReference) => void ops.push((b) => b.delete(ref)),
    async close() {
      for (let i = 0; i < ops.length; i += 400) {
        const b = db.batch();
        ops.slice(i, i + 400).forEach((op) => op(b));
        await b.commit();
      }
    },
  };
}

const vec = (v: unknown) => (v as { toArray?: () => number[] } | undefined)?.toArray?.();
const toDate = (s?: string) => {
  const d = s ? new Date(s) : null;
  return d && !Number.isNaN(d.getTime()) ? d : undefined;
};

export async function matchStory(db: Firestore, queryVec: number[], entityNorms: string[], threshold: number) {
  const near = await db
    .collection("kg_stories")
    .findNearest({ vectorField: "embedding", queryVector: queryVec, limit: 5, distanceMeasure: "COSINE", distanceResultField: "_d" })
    .get();
  let best: { id: string; score: number } | null = null;
  for (const d of near.docs) {
    // Doc says Jaccard; overlap is used because a story's entity list grows while an article names only a few.
    const score = 0.7 * (1 - (d.get("_d") as number)) + 0.3 * overlap(entityNorms, (d.get("entityNorms") as string[]) ?? []);
    if (score >= threshold && (!best || score > best.score)) best = { id: d.id, score };
  }
  return best;
}

async function resolveEntity(db: Firestore, type: string, n: string, v: number[], threshold: number): Promise<DocumentSnapshot | null> {
  const col = db.collection("kg_entities");
  const exact = await col.where("normName", "==", n).where("type", "==", type).limit(1).get();
  if (!exact.empty) return exact.docs[0]!;
  const alias = await col.where("aliases", "array-contains", n).limit(5).get();
  const a = alias.docs.find((d) => d.get("type") === type);
  if (a) return a;
  const near = await col.findNearest({ vectorField: "embedding", queryVector: v, limit: 3, distanceMeasure: "COSINE", distanceResultField: "_d" }).get();
  return near.docs.find((d) => d.get("type") === type && 1 - (d.get("_d") as number) >= threshold) ?? null;
}

export async function ingest(db: Firestore, embed: Embed, x: GraphExtraction, o: IngestOptions): Promise<IngestResult> {
  const marker = db.doc(`kg_meta/ingest_${o.checkId}`);
  const prev = await marker.get();
  if (prev.exists) {
    const { storyId, status, created } = prev.data() as IngestResult;
    return { storyId, status, created };
  }

  const vecs = await embed([
    `${x.story.title}\n${x.story.summary}`,
    ...x.events.map((e) => `${e.headline}\n${e.description}`),
    ...x.claims.map((c) => `${c.subject} ${c.predicate} ${c.value}`),
    ...x.entities.map((e) => `${e.name}\n${e.description}`),
  ]);
  let vi = 0;
  const storyVec = vecs[vi++]!;
  const eventVecs = x.events.map(() => vecs[vi++]!);
  const claimVecs = x.claims.map(() => vecs[vi++]!);
  const entityVecs = x.entities.map(() => vecs[vi++]!);
  const now = new Date();

  // Entities (resolved before the story so story matching can use entity overlap).
  const resolved = await Promise.all(x.entities.map((e, k) => resolveEntity(db, e.type, normName(e.name), entityVecs[k]!, o.entityMergeThreshold)));
  const entityId = new Map<string, string>();
  const entityNorms: string[] = [];
  const dirty = new Set<string>();
  const w = batchWriter(db);
  let newEntities = 0;
  x.entities.forEach((e, k) => {
    const n = normName(e.name);
    const aliases = [...new Set([n, ...e.aliases.map(normName)])].filter(Boolean);
    const hit = resolved[k];
    entityNorms.push(n);
    if (hit) {
      entityId.set(e.tempId, hit.id);
      dirty.add((hit.get("communityId") as string | undefined) ?? "new");
      if (aliases.length) w.update(hit.ref, { aliases: FieldValue.arrayUnion(...aliases) });
    } else {
      const ref = db.collection("kg_entities").doc();
      entityId.set(e.tempId, ref.id);
      dirty.add("new");
      newEntities++;
      w.set(ref, { name: e.name, normName: n, type: e.type, aliases, description: e.description, degree: 0, embedding: FieldValue.vector(entityVecs[k]!), createdAt: now });
    }
  });

  // Story
  const storyId = o.storyId ?? (await matchStory(db, storyVec, entityNorms, o.storyMatchThreshold))?.id ?? db.collection("kg_stories").doc().id;
  const storyRef = db.doc(`kg_stories/${storyId}`);
  const story = await storyRef.get();
  const created = !story.exists;

  // Sources
  for (const s of x.sources)
    w.set(db.doc(`kg_sources/${urlHash(s.url)}`), { url: canonicalUrl(s.url), publisher: s.publisher, title: s.title, publishedAt: s.publishedAt, storyId, firstSeenAt: now }, { merge: true });

  const edge = (type: string, from: string, fromType: string, to: string, toType: string, props: Record<string, unknown> = {}, weight: unknown = 1) =>
    w.set(db.doc(`kg_edges/${sha(`${type}|${from}|${to}`)}`), { from, fromType, to, toType, type, weight, props, createdAt: now }, { merge: true });

  // Events
  const knownEvents = created ? [] : (await db.collection("kg_events").where("storyId", "==", storyId).limit(50).get()).docs;
  const eventId = new Map<string, string>();
  x.events.forEach((e, k) => {
    const srcIds = e.sourceUrls.map(urlHash);
    const hit = knownEvents.find((d) => d.get("date") === e.date && cosine(vec(d.get("embedding")), eventVecs[k]) >= 0.9);
    let id: string;
    if (hit) {
      id = hit.id;
      if (srcIds.length) w.update(hit.ref, { sourceIds: FieldValue.arrayUnion(...srcIds) });
    } else {
      const ref = db.collection("kg_events").doc();
      id = ref.id;
      w.set(ref, { storyId, date: e.date, headline: e.headline, description: e.description, sourceIds: srcIds, embedding: FieldValue.vector(eventVecs[k]!), createdAt: now });
    }
    eventId.set(e.tempId, id);
    edge("HAS_EVENT", storyId, "story", id, "event");
    for (const s of srcIds) edge("REPORTS", s, "source", id, "event");
  });
  const firstEventId = [...eventId.values()][0] ?? "";

  // Claims — oldest first, replacements last, so supersede chains build in order.
  const known = created
    ? []
    : (await db.collection("kg_claims").where("storyId", "==", storyId).limit(200).get()).docs.map((d) => ({
        id: d.id,
        key: d.get("claimKey") as string,
        value: d.get("value") as string,
        asOf: d.get("asOf") as string | undefined,
        status: d.get("status") as KnownClaim["status"],
      }));
  const claimId = new Map<string, string>();
  let movedOn = false;
  const order = x.claims.map((c, k) => ({ c, k })).sort((a, b) => Number(!!a.c.replaces) - Number(!!b.c.replaces) || (a.c.asOf ?? "").localeCompare(b.c.asOf ?? ""));
  for (const { c, k } of order) {
    const key = factKey(c);
    const srcIds = c.sourceUrls.map(urlHash);
    const disputedBy = (c.disputedBy ?? []).map(urlHash);
    const action = versionClaim(known.filter((kc) => kc.key === key), { value: c.value, asOf: c.asOf, disputed: disputedBy.length > 0 });
    const evId = eventId.get(c.eventTempId) ?? firstEventId;
    const create = (status: KnownClaim["status"], extra: Record<string, unknown> = {}) => {
      const ref = db.collection("kg_claims").doc();
      w.set(ref, { storyId, eventId: evId, claimKey: key, subject: c.subject, predicate: c.predicate, value: c.value, asOf: c.asOf, status, sourceIds: srcIds, embedding: FieldValue.vector(claimVecs[k]!), createdAt: now, ...extra });
      known.push({ id: ref.id, key, value: c.value, asOf: c.asOf, status });
      return ref.id;
    };
    const setStatus = (id: string, patch: Partial<KnownClaim> & Record<string, unknown>) => {
      w.update(db.doc(`kg_claims/${id}`), patch);
      Object.assign(known.find((kc) => kc.id === id)!, patch);
    };
    let id: string;
    switch (action.kind) {
      case "same":
        id = action.id;
        if (srcIds.length) w.update(db.doc(`kg_claims/${id}`), { sourceIds: FieldValue.arrayUnion(...srcIds) });
        break;
      case "new":
        id = create(disputedBy.length ? "disputed" : "current");
        break;
      case "supersede": {
        const reason: ChangeReason = c.replaces?.reason ?? "revised";
        id = create("current");
        setStatus(action.oldId, { status: "superseded", supersededBy: id, reason });
        edge("SUPERSEDES", id, "claim", action.oldId, "claim", { reason });
        movedOn = true;
        break;
      }
      case "dispute":
        id = create("disputed");
        setStatus(action.otherId, { status: "disputed" });
        break;
      case "older":
        id = create("superseded", { supersededBy: action.currentId, reason: "revised" });
        edge("SUPERSEDES", action.currentId, "claim", id, "claim", { reason: "revised" });
        movedOn = true;
        break;
    }
    claimId.set(c.tempId, id);
    if (evId) edge("ASSERTS", evId, "event", id, "claim");
    for (const s of srcIds) edge("SUPPORTS", s, "source", id, "claim");
    for (const s of disputedBy) edge("DISPUTES", s, "source", id, "claim");
  }

  // Mentions + entity co-occurrence
  const mentionCount = new Map<string, number>();
  const byEvent = new Map<string, Set<string>>();
  const claimEvent = new Map(x.claims.map((c) => [c.tempId, c.eventTempId]));
  for (const m of x.mentions) {
    const ent = entityId.get(m.entityTempId);
    if (!ent) continue;
    mentionCount.set(ent, (mentionCount.get(ent) ?? 0) + 1);
    const cId = m.claimTempId && claimId.get(m.claimTempId);
    const eId = m.eventTempId && eventId.get(m.eventTempId);
    if (cId) edge("ABOUT", cId, "claim", ent, "entity");
    if (eId) edge("INVOLVES", eId, "event", ent, "entity");
    const evKey = m.eventTempId ?? (m.claimTempId && claimEvent.get(m.claimTempId));
    if (evKey) byEvent.set(evKey, (byEvent.get(evKey) ?? new Set()).add(ent));
  }
  const pairs = new Map<string, string>();
  for (const r of x.relations) {
    const a = entityId.get(r.a), b = entityId.get(r.b);
    if (a && b && a !== b) pairs.set([a, b].sort().join("|"), r.relation);
  }
  for (const ents of byEvent.values()) {
    const list = [...ents].sort();
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const k = `${list[i]}|${list[j]}`;
      if (!pairs.has(k)) pairs.set(k, "co-mentioned");
    }
  }
  const degree = new Map<string, number>();
  for (const [k, relation] of pairs) {
    const [a, b] = k.split("|") as [string, string];
    edge("RELATED_TO", a, "entity", b, "entity", { relation }, FieldValue.increment(1));
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(b, (degree.get(b) ?? 0) + 1);
  }
  for (const [id, d] of degree) w.update(db.doc(`kg_entities/${id}`), { degree: FieldValue.increment(d) });
  // ponytail: one snapshot doc (1 MB ≈ 30k edges); chunk into entityGraph_{n} when it nears the limit.
  // Never write an empty map with merge: Firestore replaces the whole field (that wiped all edges once).
  const snapshot: Record<string, unknown> = {};
  if (entityId.size) snapshot.nodes = Object.fromEntries([...new Set(entityId.values())].map((id) => [id, FieldValue.increment(degree.get(id) ?? 0)]));
  if (pairs.size) snapshot.edges = Object.fromEntries([...pairs.keys()].map((k) => [k, FieldValue.increment(1)]));
  if (Object.keys(snapshot).length) w.set(db.doc("kg_meta/entityGraph_0"), snapshot, { merge: true });

  // Story fields
  const topEntities = [...mentionCount.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const entityIds = [...new Set([...((story.get("entityIds") as string[]) ?? []), ...topEntities, ...entityId.values()])].slice(0, 20);
  const norms = [...new Set([...((story.get("entityNorms") as string[]) ?? []), ...entityNorms])].slice(0, 40);
  const latest = [iso(story.get("lastUpdatedAt")), ...x.events.map((e) => toDate(e.date)?.toISOString())].filter(Boolean).sort().pop();
  const status: IngestResult["status"] = movedOn || story.get("status") === "moved_on" ? "moved_on" : "current";
  w.set(
    storyRef,
    {
      ...(created ? { title: x.story.title, followerCount: 0, createdAt: now } : {}),
      summary: x.story.summary,
      status,
      lastUpdatedAt: toDate(latest) ?? now,
      lastCheckedAt: now,
      entityIds,
      entityNorms: norms,
      embedding: FieldValue.vector(storyVec),
      ...(o.grounding ? { lastGrounding: o.grounding } : {}),
    },
    { merge: true },
  );

  // Related stories: share ≥ 2 entities.
  if (entityIds.length >= 2) {
    const rel = await db.collection("kg_stories").where("entityIds", "array-contains-any", entityIds.slice(0, 10)).limit(10).get();
    for (const d of rel.docs) {
      if (d.id === storyId) continue;
      const shared = ((d.get("entityIds") as string[]) ?? []).filter((e) => entityIds.includes(e)).length;
      if (shared >= 2) edge("RELATED_TO", storyId, "story", d.id, "story", {}, shared);
    }
  }

  const result: IngestResult = { storyId, status, created };
  w.set(db.doc("kg_meta/state"), { ...(dirty.size ? { dirtyCommunityIds: FieldValue.arrayUnion(...dirty) } : {}), storyCount: FieldValue.increment(created ? 1 : 0), entityCount: FieldValue.increment(newEntities) }, { merge: true });
  w.set(marker, { ...result, at: now });
  await w.close();
  return result;
}
