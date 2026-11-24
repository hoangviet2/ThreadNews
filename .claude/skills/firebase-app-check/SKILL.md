---
name: firebase-app-check
description: ThreadNews App Check setup — ReCaptchaV3Provider on the website, debug token + CustomProvider (no remote script) in the extension, and X-Firebase-AppCheck verification in the Hono API middleware. Use for any change to App Check init, API auth middleware, or request headers.
---

# Firebase App Check (ThreadNews)

Source of truth: `docs/architecture/04-auth-and-quotas.md` (App Check table, middleware chain) and `docs/architecture/06-security-privacy.md` (threat model). Extension details: `docs/EXTENSION.md` → App Check.

## Clients

| Client | Provider | Rule |
|---|---|---|
| Website (`apps/web`) | `ReCaptchaV3Provider(siteKey)` | Site key from env. Register the Hosting domain in the console. |
| Extension (`apps/extension`) | Debug provider + `CustomProvider` | Set `self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.WXT_APPCHECK_DEBUG_TOKEN` **before** `initializeAppCheck`. **No remote script** (no reCAPTCHA, which loads from Google: MV3 + hard rule 8). Token goes in the judge build only, never committed, and is revoked after Dec 16. |
| Local dev | Debug provider | `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` |

Every API call sends `Authorization: Bearer <ID token>` and `X-Firebase-AppCheck: <token>` (hard rule 4). Use the shared API client in `packages/shared`. Don't hand-roll `fetch`.

## API (`apps/api`, Hono)

Verify with the Admin SDK: `await getAppCheck().verifyToken(header)`. A missing or invalid token gets `401 app_check_failed` (error shape from `docs/API.md`).

Middleware order (don't reorder):
```
cors → appCheck → auth (verifyIdToken) → tier → allow → cache → budget → quota → handler → refund on failure
```
App Check runs **before** auth, so unattested traffic never reaches token verification or Firestore. `/v1/health` is public. `/internal/cron/*` uses `X-Cron-Secret` (constant-time compare) instead.

## Done when

- The extension build has no remote script loads (grep `.output/` for `https://` script tags and `recaptcha`).
- The API has tests for a missing token, an invalid token and a valid token.
- No debug token in git (`.env*` is ignored. Check with `git grep -i appcheck_debug`).
