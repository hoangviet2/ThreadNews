# DEPLOYMENT.md — free-tier setup & deploys

Everything here runs at **$0**: Firebase Spark, Gemini Developer API free tier, Vercel Hobby, GitHub (public repo). Background: `docs/architecture/01-deployment-free-tier.md`.

## 0. Accounts you need

- Google account → Firebase console + Google AI Studio + Google Cloud console (same project).
- GitHub account (public repo, Apache-2.0 license shown in About).
- Vercel account (Hobby) connected to GitHub.
- Optional: Chrome Web Store developer account ($5 one-time).

## 1. Firebase project (Spark)

1. Create project `threadnews-prod` (stay on **Spark** — do not link billing).
2. Add a **Web app** → copy config into `apps/web/.env.local` and `apps/extension/.env.local`.
3. **Authentication** → enable **Anonymous** and **Google**. Authorized domains: `<project>.web.app`, `<project>.firebaseapp.com`, `localhost`, `chrome-extension://<EXTENSION_ID>`.
4. **Firestore** → create database (Native, region close to Vercel region, e.g. `us-east1` or `nam5`). Deploy rules + indexes (step 6).
5. **AI Logic** → get started → **Gemini Developer API** (no billing needed). Set the per-user rate limit low (e.g. 10 RPM) in the AI Logic API quota page.
6. **App Check** → register the web app with **reCAPTCHA v3** (create the site key at the reCAPTCHA admin console; domains: Hosting domains + localhost). Add a **debug token** for local dev and one for the extension judge build. Enforce for Firestore and AI Logic once both clients work.
7. **Remote Config** → import `remoteconfig.template.json` (section 5).
8. **Service account** for the API: Project settings → Service accounts → Generate new private key → store in Vercel env (never commit).

## 2. Gemini API key (server)

Google AI Studio → API keys → create key **in the same Google Cloud project** → `GEMINI_API_KEY` in Vercel. Check the free-tier limits for `gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-embedding-2` and Google Search grounding on the AI Studio rate-limit page; set `global_daily_ai_budget` below them.

## 3. Deploy rules & indexes

```bash
npm i -g firebase-tools
firebase login
firebase use threadnews-prod
firebase deploy --only firestore:rules,firestore:indexes
```
Vector indexes (if not expressible in `firestore.indexes.json` with your CLI version):
```bash
for c in kg_stories kg_claims kg_entities; do
  gcloud firestore indexes composite create --project=threadnews-prod \
    --collection-group=$c --query-scope=COLLECTION \
    --field-config=field-path=embedding,vector-config='{"dimension":"768","flat":"{}"}'
done
# communities: prefilter on level
gcloud firestore indexes composite create --project=threadnews-prod \
  --collection-group=kg_communities --query-scope=COLLECTION \
  --field-config=order=ASCENDING,field-path=level \
  --field-config=field-path=embedding,vector-config='{"dimension":"768","flat":"{}"}'
```
If vector indexes can't be created on Spark, set Remote Config `vector_backend = "memory"` (ADR-013).

## 4. API on Cloud Functions (2nd gen)

- Code: `backend/server/src/functions.ts` → `api` (`onRequest`, us-central1, 512 MiB, 60 s) + `cronCommunities` / `cronRecheck` / `cronCleanup` (`onSchedule`, UTC).
- Secrets (once): `firebase functions:secrets:set GEMINI_API_KEY` and `CRON_SECRET` (Secret Manager). Non-secret config (`ALLOWED_ORIGINS`, `APP_CHECK_ENFORCE`) is written to `.functions/.env` by `scripts/build-functions.mjs`.
- Deploy: `pnpm deploy:api` (esbuild bundle into `backend/server/.functions`, then `firebase deploy --only functions:api`). The first deploy enables Cloud Build, Run, Scheduler, Artifact Registry and Eventarc.
- Live: `https://us-central1-threadnews-4c8bd.cloudfunctions.net/api` (docs at `/docs`). Runs as the default compute service account, so production needs **no service-account key**.
- Fallback: `pnpm --filter @threadnews/server deploy:vercel` (Build Output API bundle in `.vercel/output`, env vars in the Vercel project).
- The API reads the Remote Config template that `firebase deploy --only remoteconfig` publishes (default values), not a separate server template.

## 5. Remote Config parameters (`remoteconfig.template.json`)

| Key | Default | Used by |
|---|---|---|
| `model_fallback` | `gemini-3.5-flash-lite` | clients (AI Logic cloud fallback), API structure/map/summary |
| `model_cloud` | `gemini-3.8-flash` | API grounded check, explainer, reduce |
| `model_embedding` | `gemini-embedding-2` | API |
| `embedding_dims` | `768` | API |
| `limits_guest` | `{"retrieve":20,"check":3,"explainer":0,"ask":0,"follows":0}` | API |
| `limits_member` | `{"retrieve":200,"check":50,"explainer":20,"ask":30,"follows":50}` | API |
| `global_daily_ai_budget` | `1000` | API |
| `graph_freshness_hours` | `6` | API, clients |
| `context_tokens_device` / `context_tokens_cloud` | `1500` / `8000` | API |
| `story_match_threshold` | `0.82` | API |
| `entity_merge_threshold` | `0.90` | API |
| `vector_backend` | `firestore` | API (`firestore` \| `memory`) |
| `enable_global_search` | `true` | API, clients |
| `enable_graph_view` | `true` | web |
| `maintenance_mode` | `false` | API, clients |

Clients fetch with `minimumFetchIntervalMillis = 3600000`. API uses the server template (`getRemoteConfig().getServerTemplate()`), cached 5 min.

## 6. Website on Firebase Hosting

```bash
pnpm --filter web build
firebase deploy --only hosting
```
CI does this on `main` (below). URL: `https://threadnews-prod.web.app`.

## 7. GitHub Actions

### `ci.yml` (push / PR)
`pnpm i --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build`. On `main`: deploy hosting + rules with `FirebaseExtended/action-hosting-deploy` (service account secret `FIREBASE_SERVICE_ACCOUNT`).

### Scheduled jobs
Cloud Scheduler via `onSchedule` in `backend/server/src/functions.ts`: communities `7 * * * *`, recheck `17 */6 * * *`, cleanup `27 4 * * *` (UTC). They call the `/internal/cron/*` routes in-process. No GitHub secrets are needed for cron.

### `release-extension.yml` (tag `ext-v*`)
Build with `WXT_*` secrets → `pnpm --filter extension zip` → upload to the GitHub Release.

Secrets: `FIREBASE_SERVICE_ACCOUNT`, `API_BASE_URL`, `CRON_SECRET`, `WXT_FIREBASE_*`, `WXT_APPCHECK_DEBUG_TOKEN`, `WXT_API_BASE_URL`.

## 8. Extension OAuth & ID

1. `pnpm --filter extension keygen` (script) → private key (keep secret, not in repo) + public key → `manifest.key`.
2. Load unpacked once → note the extension ID (stable now).
3. Google Cloud console → APIs & Services → Credentials → OAuth client ID → **Chrome extension** → Item ID = extension ID → client id into `manifest.oauth2.client_id`.
4. Firebase Auth authorized domain: `chrome-extension://<ID>`; API `ALLOWED_ORIGINS` includes it.

## 9. Seed the graph

```bash
API_BASE_URL=… CRON_SECRET=… pnpm seed     # uses /internal/admin/seed (cron-secret protected) or runs ingest locally with the service account
```

## 10. Cost table

| Service | Plan | Expected cost |
|---|---|---|
| Firebase (Auth, Firestore, Hosting, App Check, Remote Config, AI Logic) | Spark | $0 |
| Gemini Developer API | Free tier | $0 (capped by `global_daily_ai_budget`) |
| Vercel | Hobby | $0 |
| GitHub Actions + Releases | Public repo | $0 |
| Chrome Web Store | optional | $5 one-time |

## 11. After judging (Dec 16)

Revoke the extension App Check debug token, rotate `CRON_SECRET`, and decide whether to keep the project live.
