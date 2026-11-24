# 03 · Data model (Cloud Firestore)

Zod schemas in `packages/shared/schemas/firestore.ts` are authoritative; this doc mirrors them. All timestamps are Firestore `Timestamp`. IDs are ULIDs unless noted.

## Overview

```
users/{uid}
  follows/{storyId}
  checks/{checkId}
usage/{uid}/days/{yyyy-mm-dd}
usage/_global/days/{yyyy-mm-dd}

kg_stories/{storyId}
kg_events/{eventId}
kg_claims/{claimId}
kg_entities/{entityId}
kg_sources/{sourceId}          (id = urlHash)
kg_edges/{edgeId}
kg_communities/{communityId}
kg_explainers/{storyId}
kg_meta/entityGraph_{n}        (adjacency snapshot chunks)
kg_meta/state                  (dirty flags, counters)
kg_meta/storyIndex_{n}         (fallback vector index chunks, only if Firestore vector search unavailable)
```

Write access: **clients write only `users/{uid}` and `users/{uid}/checks/*`** (and only their own). Everything else is written by `apps/api` with the Admin SDK. See `06-security-privacy.md`.

## User space

### `users/{uid}`
```ts
{ createdAt, lastSeenAt,
  tier: "guest" | "member",               // mirror of token, for display only (never trusted)
  settings: { onDeviceEnabled: boolean, readingLevel: "standard" | "simple", theme: "system"|"light"|"dark" } }
```

### `users/{uid}/follows/{storyId}` — members only (written by API)
```ts
{ storyId, articleUrl, followedAt, lastSeenEventId: string | null, lastNotifiedAt: Timestamp | null }
```

### `users/{uid}/checks/{checkId}` — history (client writes on-device results, API writes cloud results)
```ts
{ createdAt, articleUrl, urlHash, headline, publisher?, publishedAt?,
  claims: Claim[],                         // extracted claims only, never article text
  entities: string[],
  storyId: string | null,
  result: { status: "current"|"moved_on"|"disputed"|"not_news", changes: Change[], summary?: string },
  inference: "on_device" | "cloud",
  source: "graph_check" | "cloud_check" | "gatekeeper_only" }
```

### `usage/{uid}/days/{yyyy-mm-dd}` — API only; owner can read
```ts
{ retrieve: number, check: number, explainer: number, ask: number, updatedAt }
```
### `usage/_global/days/{yyyy-mm-dd}` — API only
```ts
{ aiCalls: number, groundedCalls: number, embeddings: number, updatedAt }
```

## Knowledge graph (property graph on Firestore)

Shared value types:
```ts
type Claim  = { subject: string; predicate: string; value: string; asOf?: string };  // e.g. {subject:"earthquake in X", predicate:"death toll", value:"30"}
type Change = { fact: string; oldValue: string; newValue: string;
                reason: "revised"|"contradicted"|"overtaken"; sourceUrl: string; date: string };
type Vec768 = VectorValue;                 // FieldValue.vector(number[768])
```

### Nodes

| Collection | Fields |
|---|---|
| `kg_stories/{storyId}` | `title, summary, status ("current"\|"moved_on"), lastUpdatedAt, lastCheckedAt, followerCount, communityId?, entityIds[] (≤20), embedding: Vec768` |
| `kg_events/{eventId}` | `storyId, date, headline, description, sourceIds[], embedding` |
| `kg_claims/{claimId}` | `storyId, eventId, claimKey, subject, predicate, value, asOf, status ("current"\|"superseded"\|"disputed"), supersededBy?: claimId, sourceIds[], embedding` |
| `kg_entities/{entityId}` | `name, normName, type ("person"\|"org"\|"place"\|"thing"), aliases[], description, communityId?, degree, embedding` |
| `kg_sources/{urlHash}` | `url (canonical), publisher, title, publishedAt, storyId, firstSeenAt` |
| `kg_communities/{communityId}` | `level (0\|1), parentId?, title, summary, keyEntityIds[], storyIds[], size, updatedAt, embedding` |
| `kg_explainers/{storyId}` | `sections: ExplainerSection[], grounding (searchEntryPointHtml, chunks[]), generatedAt, model, basedOnEventId` |

`claimKey` = `slug(subject) + "::" + slug(predicate)` — the identity of a fact across time. Two claims with the same `claimKey` and different `value` ⇒ the newer one supersedes the older.

### Edges — `kg_edges/{edgeId}`
```ts
{ from: string, fromType: NodeType, to: string, toType: NodeType,
  type: EdgeType, weight: number, props: Record<string, unknown>, createdAt }
```

| `type` | from → to | props |
|---|---|---|
| `HAS_EVENT` | story → event | |
| `ASSERTS` | event → claim | |
| `SUPERSEDES` | claim (new) → claim (old) | `{ reason: "revised"\|"contradicted"\|"overtaken" }` |
| `ABOUT` | claim → entity | |
| `INVOLVES` | event → entity | |
| `REPORTS` | source → event | |
| `SUPPORTS` / `DISPUTES` | source → claim | |
| `RELATED_TO` | entity → entity | `{ relation }`, weight = co-occurrence |
| `RELATED_TO` | story → story | weight = shared entities |

Denormalization for cheap reads: `storyId` on events/claims/sources; `entityIds[]` on stories; `sourceIds[]` on events/claims. A story subgraph loads with **4 queries** (story doc, events by storyId, current claims by storyId, entities by id `in` batches).

### Meta

| Doc | Purpose |
|---|---|
| `kg_meta/entityGraph_{n}` | Compact adjacency for community detection: `{ nodes: [[entityId, degree]], edges: [[a, b, w]] }`, chunked at ~800 KB. Updated incrementally on ingest. The community job reads these instead of scanning `kg_edges`. |
| `kg_meta/state` | `{ dirtyCommunityIds[], lastCommunityBuildAt, storyCount, entityCount }` |
| `kg_meta/storyIndex_{n}` | **Fallback only**: `{ ids[], vecs: number[256][] }` for in-memory cosine search if Firestore vector search isn't available on our plan. |

## Indexes (`firestore.indexes.json`)

Composite:
- `kg_events (storyId ASC, date DESC)`
- `kg_claims (storyId ASC, status ASC)`
- `kg_claims (claimKey ASC, asOf DESC)`
- `kg_edges (from ASC, type ASC)` · `kg_edges (to ASC, type ASC)`
- `kg_communities (level ASC, updatedAt DESC)`
- `users/{uid}/checks (createdAt DESC)` (single-field, automatic)

Vector (flat, cosine, dimension 768):
- `kg_stories.embedding` · `kg_claims.embedding` · `kg_entities.embedding` · `kg_communities.embedding`

## Size & cost notes

- Per new story ingest: ~1 story + 3–8 events + 5–20 claims + 5–15 entities + 3–10 sources + 20–60 edges ≈ **40–110 writes**.
- Local search: ~4 queries + 1 vector query ≈ **30–60 reads**.
- Vectors: 768 floats ≈ 6 KB per doc — fine for hundreds to low thousands of nodes.
- No article body is stored anywhere. Summaries and descriptions are model-written, ≤ 400 chars.

## Retention

- `users/{uid}/checks`: keep last 100 per user (API trims on write).
- `usage/*/days/*`: delete docs older than 14 days (cron).
- Graph: kept (it's the product's memory). Stories with no activity for 30 days and no followers may be archived later (not in hackathon scope).
