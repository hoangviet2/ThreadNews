# BACKEND.md: the ThreadNews backend, for the frontend

Everything the website and the Chrome extension need from the backend: what's live, how to call it, what to configure, and how to deploy the web app and the extension against it.
Deeper docs: `docs/API.md` (contract), `docs/GRAPHRAG.md` (graph), `docs/architecture/*`, `docs/DEPLOYMENT.md`.

## 1. What's live

| Part | Where | Status |
|---|---|---|
| **API** (Hono, Node 22) | Cloud Functions 2nd gen `api`, us-central1 → **`https://us-central1-threadnews-4c8bd.cloudfunctions.net/api`** | ✅ production-tested (guest, member, check, cache, retrieve, follows) |
| Interactive API docs | `…/api/docs` · OpenAPI `…/api/v1/openapi.json` | ✅ public |
| **GraphRAG** (ingest, retrieval, communities) | Library inside `api` (`backend/graphRAG`) | ✅ |
| Scheduled jobs | Cloud Scheduler: `cronCommunities` hourly, `cronRecheck` every 6 h, `cronCleanup` daily (UTC) | ✅ |
| **Database** | Firestore `(default)`, `nam5`, rules + indexes (including vector) from `backend/database` | ✅ |
| Remote Config | Template v1 (`backend/database/remoteconfig.template.json`) | ✅ |
| Auth | Firebase Auth: **Anonymous + Google** enabled | ✅ |
| Secrets | Secret Manager: `GEMINI_API_KEY`, `CRON_SECRET` (server only) | ✅ |
| App Check | **Not enforced yet** (`APP_CHECK_ENFORCE=false`), see §5 | ⏳ |
| Demo data | Graph holds one test story; seed stories not loaded yet | ⏳ |

Firebase project: **`threadnews-4c8bd`** (Blaze, paid by the $300 Google Cloud trial credit).

## 2. How the backend is split

```
frontend (website / extension)
  ├─ Firebase AI Logic → Gemini Nano on-device (free); cloud fallback gemini-3.5-flash-lite
  │     gatekeeper, reader summary, on-device graph check, ask router, local ask
  ├─ Firestore (read-only kg_*, own users/{uid}/…): story pages, timeline, follow badges
  └─ API (ID token + App Check): everything that needs Google Search, embeddings, quotas or graph writes
        /v1/graph/retrieve   GraphRAG context for a story (small enough for Nano)
        /v1/check            Gemini + Google Search → status + changes, then ingests into the graph
        /v1/explainer, /v1/ask, /v1/follows, /v1/me
```

- `backend/server`: the API. Routes, auth/quota middleware, Gemini calls, server prompts.
- `backend/graphRAG`: the knowledge graph (stories → events → claims → entities → sources). A revised fact becomes a new `current` claim with the old one marked `superseded` (with a `reason`).
- `backend/database`: Firestore rules, indexes, Remote Config template, rules tests.

**Never from the client:** Google Search grounding, embeddings, cloud explainer/Q&A, writes to `kg_*` or `usage/*` (CLAUDE.md hard rules 3 and 7).

## 3. Firebase web config (public by design)

```
apiKey:            AIzaSyAgWKxe2Yz-vYMa0Gz_IfB-k0N2OOhetGo
authDomain:        threadnews-4c8bd.firebaseapp.com
projectId:         threadnews-4c8bd
appId:             1:854758859427:web:3c3dfb3741c2655d765516
storageBucket:     threadnews-4c8bd.firebasestorage.app
messagingSenderId: 854758859427
```

### `frontend/website/.env.local`
```
VITE_FIREBASE_API_KEY=AIzaSyAgWKxe2Yz-vYMa0Gz_IfB-k0N2OOhetGo
VITE_FIREBASE_AUTH_DOMAIN=threadnews-4c8bd.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=threadnews-4c8bd
VITE_FIREBASE_APP_ID=1:854758859427:web:3c3dfb3741c2655d765516
VITE_RECAPTCHA_V3_SITE_KEY=            # after App Check setup (§5)
VITE_API_BASE_URL=https://us-central1-threadnews-4c8bd.cloudfunctions.net/api
VITE_USE_EMULATORS=false
```

### `frontend/chromeExtension/.env.local`
```
WXT_FIREBASE_API_KEY=AIzaSyAgWKxe2Yz-vYMa0Gz_IfB-k0N2OOhetGo
WXT_FIREBASE_AUTH_DOMAIN=threadnews-4c8bd.firebaseapp.com
WXT_FIREBASE_PROJECT_ID=threadnews-4c8bd
WXT_FIREBASE_APP_ID=1:854758859427:web:3c3dfb3741c2655d765516
WXT_API_BASE_URL=https://us-central1-threadnews-4c8bd.cloudfunctions.net/api
WXT_WEBSITE_URL=https://threadnews-4c8bd.web.app
WXT_APPCHECK_DEBUG_TOKEN=              # judge build only (§5), never commit
WXT_OAUTH_CLIENT_ID=                   # Chrome Extension OAuth client (§7)
WXT_EXTENSION_KEY=                     # public key → stable extension ID (§7)
```
`wxt.config.ts` derives `host_permissions` from `WXT_API_BASE_URL` (→ `https://us-central1-threadnews-4c8bd.cloudfunctions.net/*`).
The base URL **includes `/api`**; the client appends `/v1/...`.

## 4. Calling the API

Use `createHttpApi` from `@threadnews/shared/api`. It already sends the headers, validates responses with the shared Zod schemas and maps errors.

| Header | Value |
|---|---|
| `Authorization` | `Bearer <Firebase ID token>`: guest (anonymous) or member (Google) |
| `X-Firebase-AppCheck` | App Check token (send it now; enforcement comes later) |
| `Content-Type` | `application/json` |

**Tier comes from the token:** anonymous → `guest`, any other provider → `member`. Upgrading with `linkWithPopup` / `linkWithCredential` keeps the uid, so usage and history carry over.

### Endpoints

| Endpoint | Who | Quota (guest / member per UTC day) | Notes |
|---|---|---|---|
| `GET /v1/health` | public | none | |
| `GET /v1/me` | all | none | `{ tier, limits, usage, resetAt, features }` → `QuotaMeter` |
| `POST /v1/graph/retrieve` | all | 20 / 200 | `storyId: null` = unknown story → go to `/v1/check`. `fresh: true` → on-device graph check with `context`, no cloud. `budget: "device"` ≈ 1.5k tokens. |
| `POST /v1/graph/search` | all | 20 / 200 | Explore by keywords → `{ items: [{ storyId, title, summary, status, lastUpdatedAt, score }] }`. Nothing found → offer "Look up the latest" = `/v1/check` with `headline: query, claims: [], articleUrl: "keywords"`. |
| `POST /v1/check` | all | **3 / 50**, cache hits free | Story checked < 6 h ago → `cached: true` (≈ 0.5–1 s, no quota). Otherwise Gemini + Search (≈ 8–12 s). Returns `status`, `changes[]`, `sources[]`, `grounding`, `usage`. |
| `GET /v1/explainer/:storyId` | all | none | `404 not_generated { canGenerate }` if none yet |
| `POST /v1/explainer` | member | – / 20 | Regenerates only if `stale`; otherwise free |
| `POST /v1/ask` | member | – / 30 | `mode: local \| global \| auto` |
| `POST /v1/follows` · `DELETE /v1/follows/:id` · `GET /v1/follows` | member | max 50 follows | `409` if already following |

AI endpoints echo `usage: { feature, used, limit, resetAt }`, so update the meter from the response.

### Typical flow (extension side panel / website check page)
1. On-device gatekeeper → `needsCheck`? If not, show the summary only.
2. `POST /v1/graph/retrieve { mode: "local", budget: "device", … }`
   - `storyId` + `fresh` → on-device `GRAPH_CHECK_V1` with `context` (⚡, no quota spent)
   - otherwise → `POST /v1/check` (☁️)
3. Render Case A (`current`) / Case B (`moved_on`, `changes[]`) / `disputed`, **with `<SourceList>`**.
4. On-device results may be written to `users/{uid}/checks/{id}` (only `source: graph_check | gatekeeper_only`). Cloud results are written by the API.

### Errors → UI (`errorCopy()` in `@threadnews/shared/api` already maps these)
| HTTP / code | UI |
|---|---|
| 401 `unauthenticated` / `app_check_failed` | re-auth silently; retry once |
| 403 `tier_required` | `UpgradePrompt` (sign in with Google) |
| 404 `not_found` / `not_generated` | "We don't know this story yet" / generate button for members |
| 409 `conflict` | already following |
| 429 `quota_exceeded` (`details.limit, used, resetAt, upgrade`) | guest: UpgradePrompt; member: "resets tomorrow" |
| 429 `rate_limited` | 30 requests/min per user, back off |
| 502 `upstream_error` | "Couldn't check right now", quota was refunded |
| 503 `budget_exhausted` / `maintenance` | "High demand / being updated: on-device features still work" |

### Grounding (hard rule 6)
Any response with `grounding` (check, explainer) must render **`grounding.searchEntryPointHtml`** (Google Search suggestions, in a sandboxed iframe, no scripts) **and** `grounding.chunks` via `<SourceList>`. Cached checks return the stored grounding too.
`changes[].sourceUrl` and `sources[].url` are real article URLs, not Google redirect links.

## 5. App Check (required before judging)

The backend currently accepts requests without App Check (`APP_CHECK_ENFORCE=false`) so the frontend can be wired first. To finish:
1. **Website:** Firebase console → App Check → register the web app with **reCAPTCHA v3** (site key from the reCAPTCHA admin console; domains `threadnews-4c8bd.web.app`, `threadnews-4c8bd.firebaseapp.com`, `localhost`) → put the key in `VITE_RECAPTCHA_V3_SITE_KEY`.
2. **Extension:** App Check → web app → **Manage debug tokens** → add one for the judge build → `WXT_APPCHECK_DEBUG_TOKEN` (never commit it; revoke after Dec 16).
3. Confirm requests carry `X-Firebase-AppCheck`, then turn enforcement on: set `APP_CHECK_ENFORCE=true` in `backend/server/scripts/build-functions.mjs` and run `pnpm deploy:api`. Also enforce App Check for Firestore and AI Logic in the console.

## 6. Reading Firestore directly (read-only)

Signed-in users (guests too) can read `kg_*`. Clients write only `users/{uid}` and `users/{uid}/checks/*`.

| Collection | Useful fields |
|---|---|
| `kg_stories/{id}` | `title, summary, status ("current"\|"moved_on"), lastUpdatedAt, lastCheckedAt, followerCount, entityIds[], communityId?` |
| `kg_events` (`where storyId == id orderBy date desc`) | `date (YYYY-MM-DD), headline, description, sourceIds[]` → timeline |
| `kg_claims` (`where storyId == id`) | `subject, predicate, value, asOf, status (current\|superseded\|disputed), supersededBy?, reason?, sourceIds[]` → "what changed" |
| `kg_entities/{id}` | `name, type, description, communityId?` |
| `kg_sources/{urlHash}` | `url, publisher, title, publishedAt` |
| `kg_explainers/{storyId}` | cached explainer (prefer `GET /v1/explainer`) |
| `users/{uid}/follows/*`, `usage/{uid}/days/*` | owner read-only |

Timestamps are Firestore Timestamps. `createFirestoreStorySource` in `@threadnews/shared` already converts them to ISO strings and drops `embedding`.
Every read counts against the free 50k/day quota: one story page ≈ 4–5 queries, so don't poll. Use `onSnapshot` only for followed stories.

**Context format:** `/v1/graph/retrieve` returns the line format that `parseContext()` / `diffClaims()` in `@threadnews/shared/graph` parse (`STORY`, `EVENT`, `CLAIM … [superseded→id] … reason=`, `ENTITY`, `SOURCE … url=`). This is tested end to end.
Known gap: the server's claim identity maps predicate synonyms ("fatalities" → "death toll"); the shared client `claimKey()` doesn't. So the on-device diff can miss a synonym, and Nano or the cloud check covers it.

## 7. Deploy

### Website → Firebase Hosting (`firebase.json` already points at `frontend/website/dist`)
```bash
pnpm --filter @threadnews/website build
npx -y firebase-tools@latest deploy --only hosting --project threadnews-4c8bd
```
Live at `https://threadnews-4c8bd.web.app`. Its origin and `firebaseapp.com` are already allowed by the API CORS list. Check: anonymous sign-in → `GET /v1/me` → `tier: "guest"`.

### Chrome extension
1. **Stable ID:** generate a key pair (keep the private key secret, outside the repo) → public key into `WXT_EXTENSION_KEY` → load unpacked once → note the ID.
2. **Google sign-in:** Google Cloud console (project `threadnews-4c8bd`) → Credentials → OAuth client ID → *Chrome extension* → Item ID = extension ID → `WXT_OAUTH_CLIENT_ID`.
3. **Firebase Auth → Settings → Authorized domains:** add `chrome-extension://<ID>`.
4. **API CORS:** add `chrome-extension://<ID>` to `ALLOWED_ORIGINS` in `backend/server/scripts/build-functions.mjs`, then `pnpm deploy:api` (or send the ID to the backend agent). Until then the side panel's API calls fail CORS.
5. App Check debug token (§5), then build and zip: `pnpm --filter @threadnews/extension zip` → attach to a GitHub Release for judges.

### API (backend agent normally does this)
```bash
pnpm deploy:api      # bundle → backend/server/.functions → firebase deploy --only functions:api
```

## 8. Local development

| Mode | Website | API |
|---|---|---|
| Against production | `.env.local` as in §3 | none needed (uses the deployed API) |
| Fully local | `VITE_USE_EMULATORS=true`, `VITE_FIREBASE_PROJECT_ID=demo-threadnews`, `VITE_API_BASE_URL=http://localhost:8787` | `pnpm emulators` + `pnpm dev:api` (`backend/server/.env.local` in emulator mode: `FIREBASE_PROJECT_ID=demo-threadnews` + `*_EMULATOR_HOST` lines). Checks still call the real Gemini API. |

`http://localhost:5173` is allowed by the production API's CORS list.

## 9. Quick smoke test

```bash
API=https://us-central1-threadnews-4c8bd.cloudfunctions.net/api
curl -s $API/v1/health                       # {"ok":true,...}
curl -s $API/v1/me                           # 401 unauthenticated (expected without a token)
```
On the deployed site: open it in a fresh profile and confirm, in DevTools → Network, that `GET …/api/v1/me` returns `200` with `"tier":"guest"` and the request carries `Authorization` (and `X-Firebase-AppCheck` once §5 is done).

## 10. Send back to the backend

- The extension ID, so it can be added to CORS.
- "App Check tokens are being sent", so enforcement can be switched on.
- Any request/response shape that doesn't match `docs/API.md`. The Zod schemas in `frontend/shared/src/schemas` are shared by both sides; change them there, not ad hoc.
- Demo story choices for `backend/server/scripts/stories.seed.json` (seeding: `API_BASE_URL=$API CRON_SECRET=… pnpm seed`).
