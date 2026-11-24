# GRAPHRAG.md — knowledge graph & retrieval

Code: `packages/graph` (pure TS, used by `apps/api` and `scripts/`). Schema: `docs/architecture/03-data-model.md`.

## 1. Why

News stories are graphs: events in time, claims that get revised, people/orgs involved, sources that agree or disagree. Storing that structure lets us:
1. Compute **"what changed"** deterministically (claims versioned by `claimKey`, linked by `SUPERSEDES`).
2. **Match** different articles to the same story.
3. Check known stories **on-device** — a packed subgraph fits Nano's context.
4. Only ask the cloud for news **after** the graph's last update.
5. Give the explainer a **bigger picture** (communities) and power **grounded Q&A**.

## 2. Pipeline at a glance

```
INDEXING  (API: /v1/check, before responding, /internal/cron/recheck, scripts/seed-graph)
  GraphExtraction (from Gemini) → canonicalize → match story → resolve entities
  → upsert events → version claims → edges → embeddings → snapshot + dirty flags

COMMUNITIES (API: /internal/cron/communities, hourly, only if dirty)
  adjacency snapshot → graphology → Louvain L0 → Louvain L1 → stable ids → summaries → embeddings

RETRIEVAL  (API: /v1/graph/retrieve, /v1/ask, /v1/explainer)
  local:  query → embed → story match → 2-hop expand → rank → pack (token budget)
  global: query → embed → communities L1 → children L0 → map (per community) → reduce
```

## 3. Indexing

### 3.1 Input — `GraphExtraction` (from the structuring step, see `docs/PROMPTS.md#extract`)
```ts
{
  story:    { title: string; summary: string },
  events:   { tempId: string; date: string; headline: string; description: string; sourceUrls: string[] }[],
  claims:   { tempId: string; eventTempId: string; subject: string; predicate: string; value: string;
              asOf?: string; sourceUrls: string[]; disputedBy?: string[];          // urls that disagree
              replaces?: { value: string; reason: "revised"|"contradicted"|"overtaken" } }[],
  entities: { tempId: string; name: string; type: "person"|"org"|"place"|"thing"; description: string; aliases: string[] }[],
  mentions: { claimTempId?: string; eventTempId?: string; entityTempId: string }[],
  relations:{ a: string; b: string; relation: string }[],                        // entity tempIds
  sources:  { url: string; publisher: string; title: string; publishedAt?: string }[]
}
```
Caps (Zod): ≤ 10 events, ≤ 30 claims, ≤ 20 entities, ≤ 15 sources.

### 3.2 Steps (`packages/graph/ingest/index.ts`, idempotent per `checkId`)
1. **Canonicalize** source URLs (strip tracking params, lower host, drop fragments) → `urlHash = sha256(url).slice(0, 32)`.
2. **Match story**
   - If `storyId` provided → use it.
   - Else embed `title + summary`; `findNearest(kg_stories.embedding, k=5)`; score = `0.7·cos + 0.3·jaccard(entityNames)`; accept best if ≥ `story_match_threshold` (0.82). Else create a new story.
3. **Resolve entities** (`resolve/entities.ts`)
   - `normName` = lowercase, strip punctuation/diacritics, collapse spaces, drop honorifics ("president", "mr").
   - Exact `normName` or alias hit (same `type`) → existing entity; add new aliases.
   - Else embed `name + description`; `findNearest(kg_entities, k=3)` same type, cos ≥ `entity_merge_threshold` (0.90) → merge.
   - Else create.
4. **Upsert events**: same story + same date + headline cos ≥ 0.9 → merge `sourceIds`; else create.
5. **Version claims** (`ingest/claims.ts`)
   - `claimKey = slug(subject) + "::" + slug(canonicalPredicate(predicate))` — `canonicalPredicate` maps synonyms ("deaths", "fatalities", "killed" → "death toll"; "price", "cost" → "price"; …) from `packages/graph/predicates.ts`.
   - Find the current claim with the same `claimKey` in the story:
     - none → create `current`.
     - same normalized value → add sources (no new node).
     - different value and newer `asOf`/source date → create new `current`, mark old `superseded`, set `supersededBy`, add `SUPERSEDES {reason}` (reason from `replaces.reason`, default `revised`).
     - sources disagree at the same time (`disputedBy` non-empty) → both `disputed`, `DISPUTES` edges from disagreeing sources.
6. **Edges**: `HAS_EVENT`, `ASSERTS`, `ABOUT`, `INVOLVES`, `REPORTS`, `SUPPORTS`/`DISPUTES`, entity `RELATED_TO` (+1 weight per co-mention), story `RELATED_TO` when two stories share ≥ 2 entities.
7. **Embeddings**: one batch call to `gemini-embedding-2` for all new nodes (768-d, re-normalized). Text per node: story `title + summary`; event `headline + description`; claim `subject + predicate + value`; entity `name + description`.
8. **Story fields**: `lastUpdatedAt = max(event.date)`, `lastCheckedAt = now`, `status = moved_on` if any claim became superseded in this ingest, `entityIds` = top 20 by mentions.
9. **Snapshot + dirty**: update `kg_meta/entityGraph_*` with new nodes/edge weights; add touched `communityId`s (or `"new"`) to `kg_meta/state.dirtyCommunityIds`.
10. Writes in batches of ≤ 400; whole ingest ≤ ~110 writes for a new story.

## 4. Local search (`packages/graph/search/local.ts`)

Input: `{ headline, claims[], entities[], question?, storyId?, budget }`.

1. **Query text** = question ?? `headline + " | " + claims.map(c => c.subject+" "+c.predicate+" "+c.value).join("; ")`.
2. **Story**: given `storyId`, or story match as in §3.2.2 (no create). None → return `{ storyId: null }`.
3. **Expand (≤ 2 hops, 4–6 queries):**
   - events: `where storyId == s order by date desc limit 12`
   - claims: `where storyId == s limit 60` (current + superseded + disputed)
   - entities: `story.entityIds` (batched `in` reads, ≤ 20)
   - sources: ids referenced by the selected claims (≤ 10)
4. **Rank** each candidate node:
   `score = relevance × recency × priority`
   - relevance = cos(query embedding, node embedding)
   - recency = `exp(-ageDays / 7)` (events/claims), 1 for entities
   - priority: claim whose `claimKey` matches an article claim ×3 (and its whole `SUPERSEDES` chain); latest 3 events ×2; disputed claims ×2; others ×1
5. **Pack** to budget (`device` 1,500 tokens, `cloud` 8,000; ~4 chars/token): story header first, then by score, keeping every chain intact.
6. **Fresh** = `now − story.lastCheckedAt < graph_freshness_hours` (6 h).

### Context format (what models see)
```
STORY s_01JD "Earthquake in X" status=moved_on updated=2026-11-24T02:10Z checked=2026-11-24T03:00Z
EVENT e1 2026-11-22 "M6.8 quake strikes X" src=s1,s2
EVENT e4 2026-11-23 "Toll revised as rescue teams reach villages" src=s2,s5
CLAIM c1 [superseded→c3] earthquake in X :: death toll = 12 (asOf 2026-11-22) src=s1
CLAIM c3 [current] earthquake in X :: death toll = 30 (asOf 2026-11-23) src=s2,s5
CLAIM c5 [disputed] earthquake in X :: magnitude = 6.8 | 7.1 src=s1|s6
ENTITY n2 org "Red Cross" — humanitarian organization coordinating relief in X
SOURCE s2 Reuters 2026-11-23 "Death toll in X quake climbs to 30"
```
Models are told to cite ids (`c3`, `s2`) — the UI maps them to chips.

### On-device graph check = code first, Nano second
1. **Deterministic diff** (`search/diff.ts`): map each article claim to a `claimKey`; if the graph's current value differs → candidate `Change` (old = article value, new = graph value, reason from the edge).
2. **Nano** only resolves fuzzy cases (claims that don't map cleanly) and writes the one-line summary, with the packed context. Output validated by `CheckResult`.
3. Status: any change → `moved_on`; disputed claims only → `disputed`; else `current`.

## 5. Communities (global index) — `packages/graph/communities`

Run by `/internal/cron/communities` (hourly; exits after 1 read if nothing is dirty).

1. Load `kg_meta/entityGraph_*` → `graphology` undirected weighted graph (entities as nodes, `RELATED_TO`/co-mention weights as edges).
2. `graphology-communities-louvain` (resolution 1.0) → **level 0** communities.
3. Collapse level 0 into a community graph (edge weight = sum of cross edges) → Louvain again → **level 1**.
4. **Stable ids**: match each new community to an old one by Jaccard of members ≥ 0.5 → reuse id; else new id.
5. **Summarize** only communities that are new, dirty, or changed membership > 20%:
   input = top 15 entities by degree (name, type, description), top 10 stories (title, status, lastUpdatedAt), up to 10 recent superseded claims. Model `gemini-3.5-flash-lite` → `{ title, summary (≤ 120 words) }`. Embed summary.
6. Write `kg_communities`, set `communityId` on entities and stories (story's community = majority of its entities), clear dirty flags.
7. Skip communities with < 3 entities (noise).

## 6. Global search (`packages/graph/search/global.ts`) — members

1. Embed question (or story summary for the explainer's "bigger picture").
2. `findNearest(kg_communities where level == 1, k=3)`; for each, its top-2 level-0 children by similarity.
3. **Map**: for each selected community (≤ 6), `gemini-3.5-flash-lite`: "Using only this summary, answer or reply NONE" → partial answers with community ids.
4. **Reduce**: `gemini-3.8-flash` merges non-NONE partials + the local context of the current story → final answer with citations (community ids + source ids).

## 7. Ask router (on-device)
Nano classifies the question: `local` (about this story's facts, people, numbers, timeline) vs `global` (causes, patterns, "why does this keep happening", comparisons to other events). Guests get `local` answers; `global` shows UpgradePrompt plus the best local answer.

## 8. Seeding (`scripts/seed-graph.ts`)
- `scripts/stories.seed.json`: 10–20 real recent stories with known developments. Pick **3 demo stories**: one clearly *still current*, one clearly *moved on* (a revised number), one *disputed*. Make 2–3 share entities so communities form.
- The script calls the same ingest path (admin mode, bypasses quota) and then runs the community build once.
- Re-run is safe (idempotent by `checkId = hash(seed url)`).

## 9. Evaluation (`pnpm eval`, see `docs/TESTING.md`)
Golden set `packages/graph/eval/golden.json`: article claims + expected status + expected changes.
Metrics: status accuracy (target ≥ 85%), change precision (≥ 80%), false "moved on" rate (≤ 10%), entity merge spot check (20 pairs).

## 10. Costs per operation (approx.)

| Operation | Firestore reads | writes | Gemini calls |
|---|---|---|---|
| Local retrieve | 30–60 | 0 | 1 embedding |
| Cloud check + ingest (new story) | 60–100 | 40–110 | 1 grounded + 1 structure + 1 embedding batch |
| Community build (dirty) | 2–5 | 10–60 | 1 summary + 1 embedding per changed community |
| Global ask | 10–20 | 0 | 1 embedding + ≤ 6 map + 1 reduce |
