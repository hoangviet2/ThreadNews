# ROADMAP.md — 7-day build plan

**Deadline: Mon Nov 30, 2:00 PM PT. Aim to submit by Mon 11:00 AM PT.** All times PT.
⚠️ **Request the hackathon quota account before Wed Nov 25, 10:00 AM PT** (form link in the hackathon resources). Optional for us, but free extra capacity for building and recording.
Note: Thu Nov 26 is US Thanksgiving — plan reduced hours if relevant.

## Priorities (cut from the bottom if late)

1. **P0 — must ship:** auth (guest + Google), gatekeeper + summary on-device, `/v1/graph/retrieve` (local), `/v1/check` + ingest, Case A/B UI in extension and website, Search suggestions + sources, quotas, deploys, seeded demo stories, video.
2. **P1 — should ship:** explainer page, on-device graph check for fresh stories, follow + 6 h recheck + badge, Ask (local, on-device).
3. **P2 — nice:** global search + communities, Ask global, story graph view, offline cache, Web Store listing.

## Day by day

### Day 0 — Mon Nov 23 (evening)
- [ ] Repo + pnpm workspaces + docs (this set) + Apache-2.0 license + public on GitHub.
- [ ] Firebase project (Spark), Auth providers, Firestore, AI Logic, App Check, Remote Config template.
- [ ] Vercel project for `apps/api` (hello world `/v1/health`).

### Day 1 — Tue Nov 24 · spikes (decide architecture risks)
- [ ] Spike 1: Firebase AI Logic hybrid + Nano **inside the extension side panel** (and on the website). Confirm `initializeDeviceModel`, availability detection, structured output on-device.
- [ ] Spike 2: `@google/genai` grounded call from Vercel → `groundingMetadata`; try Search + `responseSchema` in one call (ADR-010).
- [ ] Spike 3: Extension auth — anonymous + `chrome.identity` Google + `linkWithCredential`; App Check debug token with no remote script.
- [ ] Spike 4: `gemini-embedding-2` 768-d + Firestore vector index + `findNearest` on Spark (else `vector_backend=memory`).
- [ ] Spike 5: graphology + Louvain in a Vercel function on a toy graph.
- [ ] Write results into `docs/architecture/07-decisions.md` (update ADR-010/013 status).

### Day 2 — Wed Nov 25 · skeletons end-to-end
- [ ] **Quota form before 10 AM.**
- [ ] `packages/shared`: schemas, prompts v1, AI client wrapper, API client, Remote Config keys.
- [ ] API: middleware chain (cors, App Check, auth, tier, quota, budget, errors), `/v1/me`, OpenAPI + `/docs`.
- [ ] Extension: side panel shell, extractor, on-device setup card, gatekeeper + summary streaming.
- [ ] Website: shell, auth bootstrap, Home + paste text → gatekeeper + summary.

### Day 3 — Thu Nov 26 · the core check + GraphRAG local
- [ ] `packages/graph`: ingest (canonicalize, story match, entity resolution, claim versioning, edges, embeddings).
- [ ] `/v1/check`: research → structure → respond → `waitUntil(ingest)`; cache-first.
- [ ] `/v1/graph/retrieve` local search + packing; deterministic diff.
- [ ] Extension + web: full Case A/B rendering with ChangeCard + SourceList (Search suggestions).

### Day 4 — Fri Nov 27 · hybrid graph check, follow, explainer
- [ ] On-device graph check path for fresh stories (⚡ badge).
- [ ] Follows API + `/following` page + side panel Follow + alarms badge.
- [ ] `/internal/cron/recheck` + `cron.yml`.
- [ ] Explainer: `GET/POST /v1/explainer`, `/story/:id` page with timeline from Firestore.
- [ ] Seed script + 10–20 stories; pick the 3 demo stories.

### Day 5 — Sat Nov 28 · Ask, communities, polish pass 1
- [ ] Ask: router + local on-device; `/v1/ask` (member).
- [ ] Communities cron + global search (P2 — skip if behind).
- [ ] Story graph view (P2).
- [ ] UI polish against `DESIGN.md`; all states (quota, budget, offline, Nano unavailable).
- [ ] Optional: submit Chrome Web Store unlisted listing.

### Day 6 — Sun Nov 29 · harden, deploy, record
- [ ] `pnpm test`, rules tests, evals ≥ targets; fix top failures.
- [ ] Production deploys (Hosting, Vercel, rules, indexes, Remote Config); extension release zip.
- [ ] Fresh-machine test of the judge install steps.
- [ ] Record the demo video (script in `docs/SUBMISSION.md`), upload to YouTube (public).

### Day 7 — Mon Nov 30 · submit (by 11 AM)
- [ ] README final, Devpost text, screenshots, test access instructions, prior-work disclosure (none — new project).
- [ ] Submit on Devpost. Freeze `main` — **no commits after 2 PM PT**.

## Who does what (fill in)

| Area | Owner |
|---|---|
| Extension | |
| Website | |
| API + GraphRAG | |
| Prompts + evals | |
| Video + Devpost | |
