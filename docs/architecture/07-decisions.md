# 07 · Decisions (ADRs)

Short records: **context → decision → consequences**. Add new ones at the bottom; never edit an accepted one — supersede it.

### ADR-001 · Staleness is event-based, not date-based — Accepted
- **Context:** Date-based "old article" warnings already exist. An old article can still be the latest; a fresh one can be overtaken.
- **Decision:** Case B ("moved on") only when a fact in the article was **revised, contradicted or overtaken** by a later development. More coverage alone is not a change.
- **Consequences:** Needs claim-level comparison (→ claims as graph nodes, ADR-003). Clear, testable definition for prompts and evals.

### ADR-002 · Hybrid split: client AI Logic for on-device-first, server for grounded/expensive — Accepted
- **Context:** Hackathon requires Firebase AI Logic at runtime and judges "effective use of hybrid inference". Grounding/tools are cloud-only in hybrid mode. AI Logic's per-user limit is a single per-minute limit for all users.
- **Decision:** Gatekeeper, reader, graph check, router, on-device Ask → AI Logic `PREFER_ON_DEVICE` in clients. Grounded check, explainer, cloud Ask, embeddings, extraction → `apps/api`.
- **Consequences:** Real per-tier quotas; hybrid stays the core UX; two AI code paths to maintain (shared prompts/schemas mitigate).

### ADR-003 · Knowledge graph + GraphRAG (local + global search) — Accepted
- **Context:** Stories evolve; we need "what changed", story matching, cheaper repeat checks, and context small enough for Nano.
- **Decision:** Property graph (stories, events, claims, entities, sources, communities). Local search for story questions; Louvain communities + summaries for global questions.
- **Consequences:** ~2–2.5 days of work; enables fully on-device checks for known stories; requires seeding for the demo.

### ADR-004 · Firestore as the graph store — Accepted
- **Context:** Neo4j/Spanner Graph add infra, secrets or cost. Queries are ≤ 2 hops around one story.
- **Decision:** Model nodes/edges as Firestore collections with denormalized `storyId`; Firestore vector search for entry points; adjacency snapshot docs for community detection.
- **Consequences:** One database, rules + realtime for free; no arbitrary-depth traversal (not needed).

### ADR-005 · Free plan: Firebase Spark + Vercel Hobby + GitHub Actions — Accepted
- **Context:** Team uses free plans. Spark has no Cloud Functions/triggers. Hackathon quota account lasts 4 days; judging lasts until Dec 16.
- **Decision:** Server logic in a Hono app on Vercel Hobby; schedules via GitHub Actions; website on Firebase Hosting; extension via GitHub Releases.
- **Consequences:** $0. Cross-origin API (CORS). Ingest runs inline via `waitUntil` instead of a Firestore trigger. Portable to Cloud Functions if Blaze becomes available (ADR-009).

### ADR-006 · Firebase Auth ID tokens as the JWT; anonymous guests + Google members — Accepted
- **Context:** AI credits must be protected; guests should still try the app.
- **Decision:** Everyone signs in (anonymous by default). Tier from `firebase.sign_in_provider`. Upgrade via `linkWith*` keeps the uid.
- **Consequences:** No custom auth code; extension needs `chrome.identity` + OAuth client + stable extension key.

### ADR-007 · Server-side quota enforcement with Firestore transactions — Accepted
- **Decision:** Per-user per-day counters in `usage/{uid}/days/{date}`, global counter for the free Gemini budget, refund on upstream failure, cache hits are free.
- **Consequences:** 1–2 extra writes per AI call; limits tunable via Remote Config.

### ADR-008 · `@google/genai` on the server instead of Genkit — Accepted
- **Context:** Genkit is nice but adds a framework; we need reliable access to `groundingMetadata` and simple deployment on Vercel.
- **Decision:** Use the official `@google/genai` SDK directly; keep prompt/schema code framework-free in `packages/shared`.
- **Consequences:** Less magic, easy to port; we write our own small retriever (`packages/graph/search`).

### ADR-009 · Hono for the API (portable runtime) — Accepted
- **Decision:** Hono app exported once; adapters for Vercel (`hono/vercel`) and Cloud Functions (`onRequest`). OpenAPI via `@hono/zod-openapi`, docs via Scalar at `/docs`.
- **Consequences:** One codebase, published API docs for judges.

### ADR-010 · Grounded research + separate structuring step — Accepted (revisit after spike)
- **Context:** Unclear whether Google Search tool and JSON `responseSchema` work together in one call.
- **Decision:** Step 1 grounded text + citations; step 2 flash-lite structures into `CheckResult + GraphExtraction`.
- **Consequences:** +1 cheap call per check; collapse into one call if the spike succeeds.

### ADR-011 · Never store article text — Accepted
- **Decision:** Only URL hash/URL, headline, publisher, date, claims, entities are sent or stored.
- **Consequences:** Privacy story for judges; graph built from model-extracted facts and sources.

### ADR-012 · On-demand extraction with `activeTab` + `scripting` — Accepted
- **Context:** A content script on every page needs `<all_urls>` (scary permission, slower review).
- **Decision:** Inject the extractor into the active tab when the side panel opens or the tab changes while it's open.
- **Consequences:** No automatic checks with the panel closed; "Update available" badge is driven by followed stories, not by visited URLs.

### ADR-013 · Embeddings: `gemini-embedding-2` at 768 dims, with in-memory fallback index — Accepted
- **Decision:** 768-d (Firestore vector max is 2048; model default 3072, MRL-truncated and re-normalized). If Firestore vector search isn't usable on our plan, fall back to 256-d vectors in `kg_meta/storyIndex_*` and cosine in API memory.
- **Consequences:** One flag (`vector_backend = firestore | memory`) in Remote Config.

### ADR-014 · Website on Firebase Hosting; extension built with WXT — Accepted
- **Decision:** Vite + React SPA on Hosting (free, judge URL). WXT for MV3 with React, HMR and zip packaging.
- **Consequences:** Shared `packages/ui` across both.

### ADR-015 · Story match uses entity overlap, not Jaccard — Accepted
- **Context:** `0.7·cos + 0.3·jaccard ≥ 0.82` (GRAPHRAG §3.2.2) is unreachable for retrieval: an article names 1–10 entities while a story accumulates up to 40, so Jaccard stays small. Found by the emulator test.
- **Decision:** Score = `0.7·cos + 0.3·overlap`, overlap = `|A∩B| / min(|A|,|B|)`. Threshold unchanged (Remote Config `story_match_threshold`).
- **Consequences:** Retrieval can match known stories; tune the threshold with `pnpm eval`.

### ADR-016 · Graph writes in ordered batches, not BulkWriter — Accepted
- **Context:** BulkWriter doesn't keep write order, so an update could reach a document before the set that creates it in the same ingest.
- **Decision:** `batchWriter()` in `backend/graphRAG/src/ingest.ts` commits ordered `WriteBatch`es of ≤ 400. The idempotency marker `kg_meta/ingest_{checkId}` is written last, so a failed ingest is retried in full.

### ADR-017 · Blaze on the $300 Google Cloud trial credit — Accepted (supersedes ADR-005)
- **Context:** Google Search grounding has no free quota on current Gemini models, so billing was enabled. The team has a $300 Google Cloud trial credit.
- **Decision:** `threadnews-4c8bd` runs on Blaze, paid by the trial credit, with a budget alert. Free tiers still come first. The API stays on Vercel; Cloud Run / Cloud Functions, Cloud Scheduler and Secret Manager are approved options (CLAUDE.md → Google Cloud).
- **Consequences:** Cloud Run would remove the service-account key (runtime identity) and co-locate the API with Firestore. The credit expires 90 days after activation, so decide on keeping or shutting down the project after judging (Dec 16).

### ADR-018 · API on Cloud Functions 2nd gen + Cloud Scheduler — Accepted (supersedes the Vercel part of ADR-005)
- **Context:** Blaze is available (ADR-017). On Vercel the API needed a service-account key and the cron ran from GitHub Actions.
- **Decision:** Deploy the same Hono app as `onRequest` in us-central1 (next to Firestore `nam5`), with 3 `onSchedule` jobs calling the `/internal/cron/*` routes in-process. Secrets live in Secret Manager. The Vercel entry stays as a fallback.
- **Consequences:** No service-account key in production. Cron needs no GitHub secrets. Cold start was about 0.4 s and warm about 0.15 s on `/v1/health`. Deploys use the Firebase CLI.

### ADR-019 · Story match: cosine alone can match; /v1/check lets ingest decide — Accepted (refines ADR-015)
- **Context:** Production had 19 stories with 4 duplicate clusters (6× the same Nvidia story). The score `0.7·cos + 0.3·overlap` capped checks without entities (keyword look-ups, failed extraction) at 0.7, below the 0.82 threshold, and mismatched entity names did the same. `/v1/check` also forced a new story ID whenever its pre-match missed, so ingest's richer match never ran.
- **Decision:** No query entities → score = cosine. Cosine ≥ `story_match_cosine` (Remote Config, 0.88) is a match on its own. Measured: true duplicates 0.83–0.97, related-but-different stories 0.80–0.82. `/v1/check` passes a story ID only when the pre-match found one; otherwise `ingest` matches on the structured result (title + summary + extracted entities) and its story ID is returned.
- **Consequences:** Replaying the 3 look-ups that had duplicated: all attached to existing stories, story count unchanged. A pre-match miss can still cost a search (the cached answer needs the pre-match), but no longer forks the story. Existing duplicates still need a one-off merge (proposal D).
