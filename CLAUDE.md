# CLAUDE.md

Guidance for Claude Code working in this repository. Read this first, then the doc for the area you're touching.

## What we're building

**ThreadNews** — a Chrome extension + website that answers one question about any news article: **"Is this article still true, or has the story moved on?"**
Built for the #BuildHybridAI hackathon (Firebase AI Logic hybrid inference). **Deadline: Mon Nov 30 2026, 2:00 PM PT.** Commits after that are not judged.

- **Case A — still current:** brief, sources, Follow.
- **Case B — moved on:** a fact in the article was revised, contradicted or overtaken. Show "what changed" and a full explainer.
- **On-device first** (Gemini Nano via Firebase AI Logic `PREFER_ON_DEVICE`); cloud + Google Search only when needed; a **knowledge graph + GraphRAG** remembers every story.

## Repo map

```
frontend/website          Website (Vite + React + TS) → Firebase Hosting
frontend/chromeExtension  Chrome extension (WXT + React + TS, MV3, side panel)
frontend/shared           Zod schemas, types, on-device prompts, AI client wrapper (firebase/ai), API client, config keys, UI
backend/server            API server (Hono + TS, Node) → Cloud Functions 2nd gen (src/functions.ts: api + 3 scheduled jobs). routes/ middleware.ts gemini.ts prompts.ts (server prompts) rc.ts
backend/graphRAG          Knowledge-graph logic: ingest, entity resolution, local/global search, context packing, communities
backend/database          firestore.rules, firestore.indexes.json, remoteconfig.template.json, rules tests
docs/                     All design docs (see index below)
```
Docs still say `apps/api` → `backend/server`, `packages/graph` → `backend/graphRAG`, `packages/shared` → `frontend/shared`.

## Commands

```bash
pnpm i                      # install (pnpm workspaces)
pnpm dev                    # website
pnpm dev:api                # API on :8787 (backend/server/.env.local)
pnpm dev:ext                # extension (WXT dev, loads unpacked)
pnpm emulators              # Firebase Auth + Firestore emulators
pnpm test                   # Vitest, all packages
pnpm test:rules             # Firestore rules tests (emulator)
pnpm test:emulator          # graph ingest → retrieve → communities on the emulator
pnpm eval                   # prompt evals on golden stories
pnpm lint && pnpm typecheck
pnpm build                  # all apps
pnpm seed                   # seed the graph (backend/server/scripts/seed.mjs + stories.seed.json)
pnpm deploy:api             # bundle + `firebase deploy --only functions:api` (needs `firebase login` once)
```

## Hard rules (do not break)

1. **Spend only the $300 Google Cloud trial credit.** Firebase project `threadnews-4c8bd` is on **Blaze**, billed to the free-trial billing account (credit expires 90 days after activation; judging runs to Dec 16). Use free tiers first (see *Google Cloud* below); anything that could cost more than a few dollars a day needs the user's OK. A Cloud Billing budget alert must exist. Keep `backend/server` framework-portable (Hono): it runs on Cloud Functions; `src/vercel.ts` + `pnpm --filter @threadnews/server deploy:vercel` remain as a fallback.
2. **Firebase AI Logic must be imported and called at runtime** in web and extension (hackathon requirement). All on-device-first jobs go through `frontend/shared/src/ai` with `InferenceMode.PREFER_ON_DEVICE`.
3. **Every expensive cloud AI call goes through `backend/server`** (Google Search grounding, explainer, cloud Q&A, embeddings, extraction). Never call these from the client — quotas can't be enforced there.
4. **Every API request is verified:** Firebase ID token (`Authorization: Bearer`) + App Check token (`X-Firebase-AppCheck`). Tier = `firebase.sign_in_provider == 'anonymous'` ? guest : member.
5. **Never store or send full article text.** Only headline, publisher, publish date, URL hash, extracted claims and entities leave the device.
6. **Grounded results must render Google Search suggestions** (`searchEntryPoint.renderedContent`) **and sources** (`groundingChunks`) via `<SourceList>`. No exceptions.
7. **Clients never write `kg_*` or `usage/*`.** Only `backend/server` (Admin SDK) does.
8. **Extension bundles all code.** No remote scripts, no CDN, no `eval` (MV3 + Web Store policy).
9. **No secrets in the repo.** Firebase web config is public by design; Gemini API key and cron secret live in **Secret Manager** (`firebase functions:secrets:set`); production needs no service-account key (runtime identity). A key is only for local dev (`.env.local`, gitignored). See `.env.example` files.
10. **Stay inside the Firestore free quota** (50k reads / 20k writes / 20k deletes per day; Blaze bills beyond it). Batch reads, cache, never scan whole collections in request paths.
11. **No truth verdicts.** UI copy says "still current" / "story has moved on" / "backed by N sources" — never "true", "false", "fake", "certified".
12. English UI. Apache-2.0 license header not required per file.

## Google Cloud ($300 trial credit)

Same project as Firebase (`threadnews-4c8bd`). Deployed: Firestore `(default)` in `nam5`; API on Cloud Functions `https://us-central1-threadnews-4c8bd.cloudfunctions.net/api`; Cloud Scheduler jobs `cronCommunities` / `cronRecheck` / `cronCleanup`; secrets in Secret Manager.

| Service | Use it for | Cost note |
|---|---|---|
| **Cloud Run** | Underneath Cloud Functions 2nd gen. Direct Cloud Run is an option for `backend/server` (Hono via `@hono/node-server`, `gcloud run deploy --source`). Runs as a service account in the project → **no service-account key**, same region as Firestore (`us-central1`). | Free tier: 2M requests, 180k vCPU-s / month; `min-instances=0` |
| **Cloud Functions (2nd gen)** | **In use:** `api` (`onRequest`) + 3 `onSchedule` jobs. Firestore triggers are available. `/v1/check` ingests before responding, because Cloud Run throttles CPU after the response | Free tier: 2M invocations / month |
| **Cloud Scheduler** | **In use** via `onSchedule` (communities hourly, recheck 6-hourly, cleanup daily) | 3 jobs free per billing account (we have 3) |
| **Secret Manager** | **In use:** `GEMINI_API_KEY`, `CRON_SECRET` | 6 active versions free |
| **Vertex AI (Gemini)** | Optional: same models via the service account instead of an API key (`@google/genai` with `vertexai: true`) | Paid from credit; Search grounding billed per query either way |
| **Cloud Logging / Monitoring** | API logs (`gemini usage` lines show tokens + searches per call), uptime check on `/v1/health` | 50 GiB logs / month free |
| **Cloud Billing budgets** | Required: alert at 50% / 90% of the credit | Free |

Not needed: Cloud SQL, GKE, Pub/Sub, Memorystore (Firestore + in-memory caches cover it). The API moved off Vercel in ADR-018.

## Conventions

- TypeScript strict everywhere. ESM. Node 22.
- **Zod schemas in `frontend/shared/src/schemas` are the single source of truth** for API bodies, AI structured output and Firestore documents. Infer types from them.
- AI structured output: pass the JSON schema generated from Zod; validate the response with Zod; on failure retry once, then return a typed error.
- Prompts live in `frontend/shared/src/prompts` (on-device) and `backend/server/src/prompts.ts` (server) as versioned constants (`GATEKEEPER_V1`). Changing a prompt = bump version + run `pnpm eval`.
- Model names, limits and thresholds come from **Remote Config** (keys in `frontend/shared/src/config/keys.ts` + `backend/server/src/rc.ts`) with code defaults. Never hard-code a model name elsewhere.
- API errors: `{ error: { code, message, details? } }` with codes from `docs/API.md`.
- React: function components, TanStack Query for server state, no global state lib unless needed. Tailwind + shadcn/ui. Follow `DESIGN.md`.
- File names: `kebab-case.ts`, components `PascalCase.tsx`.
- Commits: Conventional Commits (`feat(api): …`).

## Definition of done (any feature)

- Types + Zod schema updated; unit tests for logic; rules test if Firestore access changed.
- Works with **Nano available** and **Nano unavailable** (cloud fallback) — test both.
- Works as **guest** and **member**; limit-reached state handled.
- Loading, empty and error states per `DESIGN.md`.
- No new secrets, no article text persisted, no remote code in extension.
- Docs updated if behavior or API changed.

## Docs index

| Doc | Read when |
|---|---|
| `DESIGN.md` | Any UI work |
| `BACKEND.md` | Frontend ↔ backend: live URLs, env, API usage, deploying the website + extension |
| `ARCHITECTURE.md` + `docs/architecture/*` | Understanding the system, adding services |
| `docs/API.md` | Adding/changing endpoints |
| `docs/GRAPHRAG.md` | Graph ingest, retrieval, communities |
| `docs/PROMPTS.md` | Any AI prompt or structured output |
| `docs/WEBSITE.md` / `docs/EXTENSION.md` | App-specific work |
| `docs/DEPLOYMENT.md` | Env vars, deploys, cron, free-tier limits |
| `docs/TESTING.md` | Tests, evals, emulators |
| `docs/ROADMAP.md` | What to build today |
| `docs/SUBMISSION.md` | Devpost checklist, video, judge access |

## Skills & tooling

Shared for all contributors via `.claude/settings.json` and `.claude/skills/`. First-time setup: `./scripts/setup-claude.sh` (see README → Contributor setup).

**Precedence:** DESIGN.md is the source of truth for colors (Chrome palette), font (Inter) and components. frontend-design and Apple HIG skills give principles only; if they conflict with DESIGN.md, DESIGN.md wins. Repo docs (docs/*) win over generic Firebase skills (e.g. the API is `backend/server` on Vercel/Cloud Run, not App Hosting).

**Plugins**
- `firebase@firebase` (firebase/agent-skills): Firebase CLI, Auth, Firestore, rules, Remote Config, Hosting, AI Logic basics. Use: `firebase-basics`, `firebase-ai-logic-basics`, `firebase-auth-basics`, `firebase-firestore`, `firestore-rules-creation`, `firebase-security-rules-auditor`, `firebase-remote-config-basics`, `firebase-hosting-basics`. Ignore: analytics, crashlytics, data-connect, app-hosting, extension-to-functions, xcode.
- `frontend-design@claude-plugins-official`: visual polish and design principles for new UI. DESIGN.md wins.
- `chrome-devtools-mcp@chrome-devtools-plugins`: Chrome DevTools MCP + skills. Debug the website/extension (console, network, performance, a11y, LCP).
- `ponytail@ponytail` (DietrichGebert/ponytail): lazy-senior-dev mode, auto-on via SessionStart hook. Simplest working solution, YAGNI. `/ponytail lite|full|ultra`, `/ponytail-review`, `/ponytail-help`.

**MCP servers** (both come with their plugins, so there's no `.mcp.json`)
- `firebase`: Firebase CLI MCP (projects, rules, emulators, Remote Config). Needs `firebase login` once.
- `chrome-devtools`: Chrome DevTools MCP.

**Repo skills** (`.claude/skills/`, ours)
- `firebase-hybrid-inference`: any change touching AI Logic / on-device prompts / ⚡☁️ badge.
- `firebase-app-check`: App Check init on web/extension, API `X-Firebase-AppCheck` middleware.
- `chrome-extension-mv3`: anything in `frontend/chromeExtension` (permissions, auth, extraction, release).
- `grounded-results`: any UI or API response carrying grounding → `<SourceList>` obligations.

**Vendored skills** (`.claude/skills/`, sources + licenses in `.claude/skills/THIRD_PARTY.md`)
- `vercel-react-best-practices`: writing/reviewing React for performance.
- `web-design-guidelines`: UI/accessibility review of web code.
- `hig-foundations`, `hig-patterns`, `hig-components-{content,controls,dialogs,layout,menus,search,status}`: Apple HIG principles (hierarchy, feedback, controls, loading states). Principles only. DESIGN.md wins.
