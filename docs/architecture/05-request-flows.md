# 05 · Request flows

Mermaid sequence diagrams for the main flows. Participants: **SP** = extension side panel (or website page), **N** = Gemini Nano via AI Logic, **API** = apps/api, **FS** = Firestore, **G** = Gemini Developer API.

## 1. First open

```mermaid
sequenceDiagram
  participant SP as Side panel
  participant A as Firebase Auth
  participant API
  participant N as Nano (AI Logic)
  SP->>A: onAuthStateChanged → none → signInAnonymously()
  A-->>SP: guest user + ID token (JWT)
  SP->>API: GET /v1/me (Bearer, App Check)
  API-->>SP: {tier: guest, limits, usage}
  SP->>SP: LanguageModel.availability()
  alt downloadable / downloading
    SP->>SP: show "Enable on-device AI"
    SP->>N: user click → initializeDeviceModel()
    N-->>SP: download progress … ready
  else unavailable
    SP->>SP: note "Using the cloud instead" (once)
  end
```

## 2. Check an article — story known & fresh (no cloud)

```mermaid
sequenceDiagram
  participant SP as Side panel
  participant CS as Content script (injected)
  participant N as Nano
  participant API
  participant FS as Firestore
  SP->>CS: chrome.scripting.executeScript(extract)
  CS-->>SP: {url, title, publisher, publishedAt, text≤6k tokens}
  SP->>N: Gatekeeper(text) + Reader(text) in parallel
  N-->>SP: {isNews, needsCheck, claims[], entities[]} + streaming summary
  SP->>API: POST /v1/graph/retrieve {mode: local, headline, claims, entities, budget: device}
  API->>FS: vector search stories + expand 2 hops
  API-->>SP: {storyId, fresh: true, context, nodeIds, lastUpdatedAt}
  SP->>N: GraphCheck(article claims, context)
  N-->>SP: {status, changes[]} ⚡
  SP->>FS: write users/{uid}/checks/{id} (on-device result)
  SP->>SP: render Case A / Case B
```

## 3. Check an article — new or stale story (cloud)

```mermaid
sequenceDiagram
  participant SP as Side panel
  participant API
  participant FS as Firestore
  participant G as Gemini + Search
  SP->>API: POST /v1/graph/retrieve → {storyId|null, fresh: false, context}
  SP->>API: POST /v1/check {articleUrl, headline, publishedAt, claims, entities, storyId}
  API->>API: App Check, ID token, tier, cache?, budget, quota(+1)
  API->>G: grounded research (claims + context, "only news after lastUpdatedAt")
  G-->>API: text + groundingMetadata
  API->>G: structure → CheckResult + GraphExtraction (JSON)
  API-->>SP: {status, changes, sources, grounding, storyId, usage}
  API->>FS: waitUntil(ingest: upsert nodes/edges, supersede claims, embeddings, mark dirty)
  SP->>SP: render + SourceList (Search suggestions + sources) ☁️
```

## 4. Explainer (website)

```mermaid
sequenceDiagram
  participant W as Website /story/:id
  participant API
  participant FS as Firestore
  participant G as Gemini + Search
  W->>FS: read kg_stories, kg_events, kg_claims (timeline, what changed) — direct, read-only
  W->>API: GET /v1/explainer/:storyId
  alt cached & basedOnEventId == latest event
    API-->>W: explainer (no quota)
  else guest
    API-->>W: 404 not_generated {canGenerate: false}
    W->>W: show cached-less view + UpgradePrompt
  else member
    W->>API: POST /v1/explainer {storyId}
    API->>API: quota(explainer)
    API->>FS: local + global context
    API->>G: grounded generation → Explainer JSON
    API->>FS: write kg_explainers/{storyId}
    API-->>W: explainer + grounding
  end
```

## 5. Ask about this story

```mermaid
sequenceDiagram
  participant W as Website / Side panel
  participant N as Nano
  participant API
  W->>N: Router(question) → local | global
  alt local
    W->>API: POST /v1/graph/retrieve {mode: local, question, budget: device}
    W->>N: Ask(question, context) ⚡
  else global (member)
    W->>API: POST /v1/ask {storyId, question, mode: global}
    API-->>W: answer + citations ☁️
  else global (guest)
    W->>W: answer locally if possible + UpgradePrompt for "bigger picture"
  end
```

## 6. Follow + scheduled re-check

```mermaid
sequenceDiagram
  participant SP as Side panel
  participant API
  participant FS as Firestore
  participant GH as GitHub Actions (every 6 h)
  participant G as Gemini + Search
  SP->>API: POST /v1/follows {storyId, articleUrl} (member)
  API->>FS: users/{uid}/follows/{storyId}; kg_stories.followerCount +1
  GH->>API: POST /internal/cron/recheck (X-Cron-Secret)
  API->>FS: stories where followerCount > 0, oldest lastCheckedAt first (≤ 25 per run)
  loop each story
    API->>G: grounded check with local context
    API->>FS: ingest new events/claims, update status
  end
  SP->>FS: onSnapshot(followed story) → new event → "Update available"
  Note over SP: chrome.alarms (30 min) also polls and sets the toolbar badge
```

## 7. Community build (GraphRAG global index)

```mermaid
sequenceDiagram
  participant GH as GitHub Actions (hourly)
  participant API
  participant FS as Firestore
  participant G as Gemini
  GH->>API: POST /internal/cron/communities
  API->>FS: read kg_meta/state → no dirty? → exit (1 read)
  API->>FS: read kg_meta/entityGraph_* (snapshot)
  API->>API: graphology + Louvain → level 0, then level 1
  loop dirty communities
    API->>G: summarize (flash-lite) → title, summary
    API->>G: embed summary
    API->>FS: write kg_communities, set communityId on entities/stories
  end
  API->>FS: clear dirty flags
```

## 8. Limit reached

```mermaid
sequenceDiagram
  participant SP as Side panel
  participant API
  SP->>API: POST /v1/check
  API-->>SP: 429 quota_exceeded {limit: 3, used: 3, resetAt, upgrade: true}
  SP->>SP: show "Limit reached — sign in for 50 checks a day" + on-device summary stays
```
