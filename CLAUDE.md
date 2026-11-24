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
apps/web         Website (Vite + React + TS) → Firebase Hosting
apps/extension   Chrome extension (WXT + React + TS, MV3, side panel)
apps/api         API server (Hono + TS, Node) → Vercel Hobby (free)
packages/shared  Zod schemas, types, prompts, AI client wrapper (firebase/ai), API client, config keys
packages/ui      Shared React components (Tailwind + shadcn/ui)
packages/graph   Knowledge-graph logic: ingest, entity resolution, local/global search, context packing
scripts/         seed-graph, emulator helpers
.github/         CI + scheduled jobs (cron) workflows
docs/            All design docs (see index below)
```

## Commands

```bash
pnpm i                      # install (pnpm workspaces)
pnpm dev                    # web + api + emulators
pnpm dev:ext                # extension (WXT dev, loads unpacked)
pnpm emulators              # Firebase Auth + Firestore emulators
pnpm test                   # Vitest, all packages
pnpm test:rules             # Firestore rules tests (emulator)
pnpm eval                   # prompt evals on golden stories
pnpm lint && pnpm typecheck
pnpm build                  # all apps
pnpm seed                   # seed the graph (scripts/seed-graph.ts)
```

## Hard rules (do not break)

1. **Free plan only.** Firebase is on **Spark**: no Cloud Functions, no Firestore triggers, no Cloud Run. Server code lives in `apps/api` (Vercel). Scheduled work runs from GitHub Actions calling `/internal/cron/*`. Keep `apps/api` framework-portable (Hono) so it can move to Cloud Functions later.
2. **Firebase AI Logic must be imported and called at runtime** in web and extension (hackathon requirement). All on-device-first jobs go through `packages/shared/ai` with `InferenceMode.PREFER_ON_DEVICE`.
3. **Every expensive cloud AI call goes through `apps/api`** (Google Search grounding, explainer, cloud Q&A, embeddings, extraction). Never call these from the client — quotas can't be enforced there.
4. **Every API request is verified:** Firebase ID token (`Authorization: Bearer`) + App Check token (`X-Firebase-AppCheck`). Tier = `firebase.sign_in_provider == 'anonymous'` ? guest : member.
5. **Never store or send full article text.** Only headline, publisher, publish date, URL hash, extracted claims and entities leave the device.
6. **Grounded results must render Google Search suggestions** (`searchEntryPoint.renderedContent`) **and sources** (`groundingChunks`) via `<SourceList>`. No exceptions.
7. **Clients never write `kg_*` or `usage/*`.** Only `apps/api` (Admin SDK) does.
8. **Extension bundles all code.** No remote scripts, no CDN, no `eval` (MV3 + Web Store policy).
9. **No secrets in the repo.** Firebase web config is public by design; service-account keys, Gemini API key, cron secret live in Vercel / GitHub secrets. See `.env.example` files.
10. **Respect the Firestore Spark budget** (50k reads / 20k writes per day). Batch reads, cache, never scan whole collections in request paths.
11. **No truth verdicts.** UI copy says "still current" / "story has moved on" / "backed by N sources" — never "true", "false", "fake", "certified".
12. English UI. Apache-2.0 license header not required per file.

## Conventions

- TypeScript strict everywhere. ESM. Node 22.
- **Zod schemas in `packages/shared/schemas` are the single source of truth** for API bodies, AI structured output and Firestore documents. Infer types from them.
- AI structured output: pass the JSON schema generated from Zod; validate the response with Zod; on failure retry once, then return a typed error.
- Prompts live in `packages/shared/prompts/*.ts` as versioned constants (`GATEKEEPER_V1`). Changing a prompt = bump version + run `pnpm eval`.
- Model names, limits and thresholds come from **Remote Config** (keys in `packages/shared/config/keys.ts`) with code defaults. Never hard-code a model name elsewhere.
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
| `ARCHITECTURE.md` + `docs/architecture/*` | Understanding the system, adding services |
| `docs/API.md` | Adding/changing endpoints |
| `docs/GRAPHRAG.md` | Graph ingest, retrieval, communities |
| `docs/PROMPTS.md` | Any AI prompt or structured output |
| `docs/WEBSITE.md` / `docs/EXTENSION.md` | App-specific work |
| `docs/DEPLOYMENT.md` | Env vars, deploys, cron, free-tier limits |
| `docs/TESTING.md` | Tests, evals, emulators |
| `docs/ROADMAP.md` | What to build today |
| `docs/SUBMISSION.md` | Devpost checklist, video, judge access |

## Useful tooling

```bash
# Firebase Agent Skills + MCP for Claude Code
claude plugin marketplace add firebase/agent-skills
claude plugin install firebase@firebase
claude mcp add firebase npx -- -y firebase-tools@latest mcp
```
Relevant skills: firebase-ai-logic-basics, firebase-basics, firebase-local-env-setup, firebase-hosting-basics, firebase-auth-basics, firebase-firestore-standard, firestore-security-rules-auditor, firebase-remote-config-basics. There is no official skill for hybrid inference or App Check — use `docs/architecture/02-hybrid-ai.md` and the Firebase docs links there.
