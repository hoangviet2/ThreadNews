# API.md — ThreadNews API (v1)

- **Base URL (prod):** `https://us-central1-threadnews-4c8bd.cloudfunctions.net/api` · **local:** `http://localhost:8787`
- **Interactive docs (public):** `GET /docs` (Scalar) · **OpenAPI:** `GET /v1/openapi.json`
- **Runtime:** Hono on Node 22, Cloud Functions 2nd gen (`us-central1`). Code: `backend/server`. Schemas: `packages/shared/schemas/api.ts` (Zod → OpenAPI via `@hono/zod-openapi`).
- **Client:** `packages/shared/api-client` (typed fetch wrapper that attaches tokens, maps errors).

## Conventions

### Required headers (all `/v1/*` except `/v1/health`, `/v1/openapi.json`)
| Header | Value |
|---|---|
| `Authorization` | `Bearer <Firebase ID token>` (guest or member) |
| `X-Firebase-AppCheck` | App Check token |
| `Content-Type` | `application/json` |
| `X-Request-Id` | optional; echoed back |

### Errors
```json
{ "error": { "code": "quota_exceeded", "message": "Daily cloud check limit reached.", "details": { "limit": 3, "used": 3, "resetAt": "2026-11-25T00:00:00Z", "upgrade": true } } }
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `invalid_argument` | Body fails Zod validation |
| 401 | `unauthenticated` | Missing/invalid/expired ID token |
| 401 | `app_check_failed` | Missing/invalid App Check token |
| 403 | `tier_required` | Feature needs a member (`details.upgrade: true`) |
| 404 | `not_found` / `not_generated` | Unknown story / explainer not generated yet |
| 409 | `conflict` | e.g. already following |
| 429 | `quota_exceeded` | Per-user daily limit (`details.limit, used, resetAt, upgrade`) |
| 429 | `rate_limited` | Burst limit (30 req/min per user/IP) |
| 502 | `upstream_error` | Gemini failed after retry (quota refunded) |
| 503 | `budget_exhausted` | Global daily AI budget reached |
| 503 | `maintenance` | Remote Config `maintenance_mode = true` |

### Usage echo
AI endpoints return `usage` so the UI can update `QuotaMeter` without another call:
```json
"usage": { "feature": "check", "used": 2, "limit": 3, "resetAt": "2026-11-25T00:00:00Z" }
```

### Grounding object (any grounded response)
```json
"grounding": {
  "searchEntryPointHtml": "<style>…</style><div class=\"container\">…</div>",
  "chunks": [{ "uri": "https://…", "title": "Reuters" }],
  "supports": [{ "start": 0, "end": 54, "chunkIndices": [0, 2] }]
}
```
Clients **must** render `searchEntryPointHtml` and `chunks` (see `DESIGN.md` → `SourceList`).

---

## Endpoints

### `GET /v1/health` — public
`200 { "ok": true, "version": "1.0.0", "time": "…" }`

### `GET /v1/me`
Who am I, my tier, limits and today's usage.
```json
200 {
  "uid": "abc", "tier": "guest",
  "limits": { "retrieve": 20, "check": 3, "explainer": 0, "ask": 0, "follows": 0 },
  "usage":  { "retrieve": 4, "check": 1, "explainer": 0, "ask": 0 },
  "resetAt": "2026-11-25T00:00:00Z",
  "features": { "globalSearch": true, "graphView": true }
}
```

### `POST /v1/graph/retrieve` — quota: `retrieve`
GraphRAG retrieval. Local = one story's subgraph; global = community summaries.
```json
// request
{ "mode": "local",                       // "local" | "global"
  "headline": "Quake death toll rises in X",
  "claims": [{ "subject": "earthquake in X", "predicate": "death toll", "value": "12" }],
  "entities": ["X", "Red Cross"],
  "question": null,                      // for Ask
  "storyId": null,                       // if already known
  "budget": "device" }                   // "device" (≤1.5k tokens) | "cloud" (≤8k)
```
```json
// 200
{ "storyId": "01JD…", "matchScore": 0.91,
  "fresh": true, "lastUpdatedAt": "2026-11-24T02:10:00Z",
  "context": "STORY 01JD… \"Earthquake in X\" status=moved_on updated=2026-11-24T02:10Z\nEVENT e1 2026-11-22 …\nCLAIM c3 [current] death toll = 30 (asOf 2026-11-23) src=s2,s5\nCLAIM c1 [superseded by c3] death toll = 12 …",
  "nodeIds": ["01JD…", "e1", "c3", "c1"],
  "tokenEstimate": 1180 }
```
`storyId: null` → story unknown (client goes to `/v1/check`). Cached in API memory for 10 min per (storyId, mode, budget).

### `POST /v1/graph/search` — quota: `retrieve`
Explore by keywords: stories in the graph nearest to the query (embedding + keyword overlap).
```json
// request
{ "query": "bank of england interest rates" }
// 200
{ "items": [{ "storyId": "cc6m…", "title": "Bank of England Base Interest Rate Change", "summary": "…", "status": "moved_on", "lastUpdatedAt": "…", "score": 0.85 }] }
```
Empty `items` → the website offers "Look up the latest", which is a normal `/v1/check` with `headline = query`, `claims: []` and `articleUrl: "keywords"`.

### `POST /v1/check` — quota: `check` (cache hits free)
Cloud check with Google Search grounding + GraphRAG context. Ingests results into the graph after responding.
```json
// request
{ "articleUrl": "https://news.example.com/quake",
  "headline": "Quake death toll rises in X",
  "publisher": "Example News",
  "publishedAt": "2026-11-22T09:00:00Z",
  "claims": [{ "subject": "earthquake in X", "predicate": "death toll", "value": "12" }],
  "entities": ["X", "Red Cross"],
  "storyId": "01JD…" }                   // optional, from retrieve
```
```json
// 200
{ "storyId": "01JD…",
  "status": "moved_on",                  // "current" | "moved_on" | "disputed"
  "summary": "Rescue teams revised the toll upward on Nov 23.",
  "changes": [{ "fact": "Death toll", "oldValue": "12", "newValue": "30", "reason": "revised",
                "sourceUrl": "https://reuters.com/…", "date": "2026-11-23" }],
  "sources": [{ "url": "https://reuters.com/…", "publisher": "Reuters", "title": "…", "publishedAt": "…" }],
  "grounding": { … },
  "cached": false, "checkedAt": "…", "checkId": "01JE…",
  "usage": { "feature": "check", "used": 2, "limit": 3, "resetAt": "…" } }
```
Cache rule: if the story's `lastCheckedAt` is within `graph_freshness_hours`, return the stored result (`cached: true`, no quota).

### `GET /v1/explainer/:storyId` — no quota, any tier
`200` explainer · `404 not_generated { "canGenerate": true|false }`
```json
{ "storyId": "01JD…", "generatedAt": "…", "basedOnEventId": "e7", "stale": false,
  "sections": [
    { "id": "what_changed", "title": "What changed since this article", "body": "…", "citations": [0, 2] },
    { "id": "background", "title": "Background", "body": "…", "citations": [1] },
    { "id": "bigger_picture", "title": "The bigger picture", "body": "…", "citations": [] },
    { "id": "known_disputed", "title": "What's known and what's disputed", "items": [{ "text": "…", "state": "known" }] },
    { "id": "glossary", "title": "Glossary", "items": [{ "term": "…", "definition": "…" }] } ],
  "grounding": { … } }
```
Timeline is **not** in the explainer — clients read it directly from `kg_events`.

### `POST /v1/explainer` — members, quota: `explainer`
`{ "storyId": "01JD…" }` → same body as GET. Regenerates only if `stale` (new events since `basedOnEventId`), otherwise returns the cached one free.

### `POST /v1/ask` — members, quota: `ask`
```json
// request
{ "storyId": "01JD…", "question": "Why does this keep happening in this region?", "mode": "auto" }   // auto | local | global
// 200
{ "answer": "…", "mode": "global",
  "citations": [{ "nodeId": "comm_12", "label": "Seismic activity in region (community)" }, { "sourceUrl": "https://…" }],
  "grounding": null,
  "usage": { "feature": "ask", "used": 5, "limit": 30, "resetAt": "…" } }
```
Guests answer local questions on-device with `/v1/graph/retrieve` + Nano.

### `POST /v1/follows` — members
`{ "storyId": "01JD…", "articleUrl": "https://…" }` → `201 { "following": true, "count": 7 }` · `409 conflict` if already following · `429 quota_exceeded` past 50 follows.

### `DELETE /v1/follows/:storyId` — members
`200 { "following": false }`

### `GET /v1/follows` — members
`200 { "items": [{ "storyId", "title", "status", "lastUpdatedAt", "unread": true }] }`

---

## Internal (not in public OpenAPI)

All require `X-Cron-Secret: <CRON_SECRET>`; called in-process by the Cloud Scheduler functions in `backend/server/src/functions.ts`.

| Route | Schedule | Does |
|---|---|---|
| `POST /internal/cron/communities` | hourly | Exit if no dirty communities; else Louvain + summaries (`docs/GRAPHRAG.md`) |
| `POST /internal/cron/recheck` | every 6 h | Re-check ≤ 25 followed stories, oldest first |
| `POST /internal/cron/cleanup` | daily | Delete `usage/*/days/*` older than 14 days; trim checks > 100/user |
| `POST /internal/admin/seed` | manual (`pnpm seed`) | Ingest `scripts/stories.seed.json` without quotas, then build communities |

Response: `200 { "ok": true, "processed": 12, "skipped": 3, "ms": 8421 }`.

---

## Implementation map (`apps/api/src`)

```
app.ts                 Hono app: middleware chain + route mounting + OpenAPI + /docs
adapters/vercel.ts     export default handle(app)            (api/[[...route]].ts)
adapters/firebase-functions.ts  onRequest(app.fetch)          (Blaze only, optional)
middleware/            cors, requestId, appCheck, auth, tier, rateLimit, quota, budget, errors
routes/                me, graph, check, explainer, ask, follows, internal
services/              gemini.ts, embeddings.ts, remoteConfig.ts, firestore.ts, usage.ts
config.ts              env parsing (Zod)
```

Middleware order and quota pattern: `docs/architecture/04-auth-and-quotas.md`.

## Example (client)

```ts
const res = await api.check({ articleUrl, headline, publishedAt, claims, entities, storyId });
if (res.ok) render(res.data);
else if (res.error.code === "quota_exceeded" && res.error.details.upgrade) showUpgradePrompt();
```

```bash
curl -X POST https://us-central1-threadnews-4c8bd.cloudfunctions.net/api/v1/graph/retrieve \
  -H "Authorization: Bearer $ID_TOKEN" -H "X-Firebase-AppCheck: $APPCHECK" \
  -H "Content-Type: application/json" \
  -d '{"mode":"local","headline":"…","claims":[],"entities":[],"budget":"device"}'
```
