# TESTING.md

Fast, focused tests — we have 7 days. Test the logic that's easy to break silently: schemas, quotas, graph merging, rules, prompts.

## Layers

| Layer | Tool | Where | Run |
|---|---|---|---|
| Unit | Vitest | `packages/*/test`, `apps/api/test` | `pnpm test` |
| Firestore rules | `@firebase/rules-unit-testing` + emulator | `apps/api/test/rules.test.ts` | `pnpm test:rules` |
| API integration | Vitest + Hono `app.request()` + emulators + mocked Gemini | `apps/api/test/routes/*.test.ts` | `pnpm test` |
| Prompt evals | custom runner (`pnpm eval`) | `packages/graph/eval` | `pnpm eval` (uses real Gemini; on-device prompts run against cloud fallback model as proxy) |
| Web smoke | Playwright (3 tests) | `apps/web/e2e` | `pnpm --filter web e2e` |
| Extension | manual checklist (below) | — | before each release |

## Must-have unit tests

- `packages/shared/schemas`: every AI schema accepts golden outputs and rejects malformed ones.
- `packages/shared/ai/budget`: trimming keeps total ≤ 9,216 tokens; article text cut at paragraph boundaries.
- `packages/graph/resolve`: `normName`, alias match, merge threshold behavior.
- `packages/graph/ingest/claims`: same value → sources added; new value → supersede + edge; dispute → both disputed; idempotent re-ingest.
- `packages/graph/search/local`: ranking order (matched claim chains first), packing never splits a chain, budget respected.
- `packages/graph/search/diff`: deterministic change detection from claimKeys.
- `packages/graph/communities`: stable ids across runs (Jaccard ≥ 0.5 reuse).
- `apps/api/middleware/quota`: limit reached → 429 with details; refund on upstream failure; cache hit doesn't count; guest vs member limits.
- `apps/api/middleware/auth` & `appCheck`: missing/invalid tokens → 401 codes.

## Rules tests (emulator)

- Owner can read/write `users/{uid}`; others can't.
- Client can create `checks` only with `source in [graph_check, gatekeeper_only]`, no extra fields, ≤ 30 claims.
- Nobody can write `kg_*`, `usage/*`, `follows`.
- Signed-in (anonymous) users can read `kg_*`; unauthenticated can't.

## Mocks

- Gemini: `apps/api/test/fixtures/gemini/*.json` (grounded research text + groundingMetadata, structured outputs). Inject via `services/gemini.ts` interface.
- AI Logic in web tests: mock `packages/shared/ai/client` module.
- Time: fake timers for UTC-day quota rollovers.

## Prompt evals (`pnpm eval`)

`packages/graph/eval/golden.json` — 15–20 cases:
```json
{ "id": "quake-toll", "article": { "headline": "…", "publishedAt": "…", "claims": [ … ] },
  "graphContext": "…", "expected": { "status": "moved_on", "changes": [{ "fact": "death toll", "newValue": "30" }] } }
```
Mix: 6 moved_on, 6 current, 3 disputed, 3 not_news, 2 tricky ("more coverage but nothing changed").

| Metric | Target |
|---|---|
| Status accuracy | ≥ 85% |
| Change precision | ≥ 80% |
| False "moved on" | ≤ 10% |
| Gatekeeper not_news recall | ≥ 90% |
| Valid JSON first try | ≥ 95% |

Eval output is a table printed to the console + `eval-report.md` (gitignored). Run after every prompt change.

## Web smoke (Playwright, emulators + mocked API)

1. Home loads, anonymous sign-in happens, QuotaMeter shows "3 of 3".
2. Paste sample text → status renders, SourceList renders Search suggestions block.
3. `/story/:seededId` → timeline + "what changed" render from Firestore.

## Extension manual checklist

- [ ] Fresh profile → load unpacked → panel opens on icon click.
- [ ] Enable on-device AI → progress → ⚡ badge on results (on a capable machine).
- [ ] On a machine without Nano → ☁️ badge, everything still works.
- [ ] Not-news page (e.g. Wikipedia main page) → "Not a news article".
- [ ] Seeded "moved on" story → Case B, change card with old → new, Open full explainer works.
- [ ] Seeded "current" story → Case A, Follow (member) / UpgradePrompt (guest).
- [ ] 4th cloud check as guest → limit reached UI.
- [ ] Sign in with Google → same history, limits updated.
- [ ] Airplane mode on a followed story → on-device check from cache.
- [ ] No console errors; no network request for remote scripts.

## Before submission

`pnpm lint && pnpm typecheck && pnpm test && pnpm test:rules && pnpm eval` all green; run the extension checklist on a second machine.
