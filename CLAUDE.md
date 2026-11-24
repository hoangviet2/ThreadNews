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

## Skills & tooling

Shared for all contributors via `.claude/settings.json` and `.claude/skills/`. First-time setup: `./scripts/setup-claude.sh` (see README → Contributor setup).

**Precedence:** DESIGN.md is the source of truth for colors (Chrome palette), font (Inter) and components. frontend-design and Apple HIG skills give principles only; if they conflict with DESIGN.md, DESIGN.md wins. Repo docs (docs/*) win over generic Firebase skills (e.g. we're on Spark: no Cloud Functions/App Hosting).

**Plugins**
- `firebase@firebase` (firebase/agent-skills): Firebase CLI, Auth, Firestore, rules, Remote Config, Hosting, AI Logic basics. Use: `firebase-basics`, `firebase-ai-logic-basics`, `firebase-auth-basics`, `firebase-firestore`, `firestore-rules-creation`, `firebase-security-rules-auditor`, `firebase-remote-config-basics`, `firebase-hosting-basics`. Ignore: analytics, crashlytics, data-connect, app-hosting, extension-to-functions, xcode.
- `frontend-design@claude-plugins-official`: visual polish and design principles for new UI. DESIGN.md wins.
- `chrome-devtools-mcp@chrome-devtools-plugins`: Chrome DevTools MCP + skills. Debug the website/extension (console, network, performance, a11y, LCP).

**MCP servers** (both come with their plugins, so there's no `.mcp.json`)
- `firebase`: Firebase CLI MCP (projects, rules, emulators, Remote Config). Needs `firebase login` once.
- `chrome-devtools`: Chrome DevTools MCP.

**Repo skills** (`.claude/skills/`, ours)
- `firebase-hybrid-inference`: any change touching AI Logic / on-device prompts / ⚡☁️ badge.
- `firebase-app-check`: App Check init on web/extension, API `X-Firebase-AppCheck` middleware.
- `chrome-extension-mv3`: anything in `apps/extension` (permissions, auth, extraction, release).
- `grounded-results`: any UI or API response carrying grounding → `<SourceList>` obligations.

**Vendored skills** (`.claude/skills/`, sources + licenses in `.claude/skills/THIRD_PARTY.md`)
- `vercel-react-best-practices`: writing/reviewing React for performance.
- `web-design-guidelines`: UI/accessibility review of web code.
- `hig-foundations`, `hig-patterns`, `hig-components-{content,controls,dialogs,layout,menus,search,status}`: Apple HIG principles (hierarchy, feedback, controls, loading states). Principles only. DESIGN.md wins.
