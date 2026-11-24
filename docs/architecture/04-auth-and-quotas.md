# 04 · Auth & quotas

## Principles

- **Everyone is signed in.** First open → anonymous Firebase Auth user (a *guest*). No sign-up wall.
- **Members** sign in with Google and get higher AI limits + follow/sync.
- **Firebase ID tokens are the JWT.** No custom JWT system. The token is signed by Google, lasts ~1 h and is refreshed by the SDK automatically.
- **Quotas are enforced on the server** (`apps/api`), never trusted from the client.

## Identity flows

### Guest (first open)
```ts
onAuthStateChanged(auth, (u) => { if (!u) signInAnonymously(auth); });
```

### Upgrade to member — website
```ts
const cred = await linkWithPopup(auth.currentUser!, new GoogleAuthProvider());   // same uid, data kept
// on 'auth/credential-already-in-use': signInWithCredential(auth, GoogleAuthProvider.credentialFromError(e)) and drop guest data
```

### Upgrade to member — extension
```ts
import { getAuth, GoogleAuthProvider, linkWithCredential, signInWithCredential } from "firebase/auth/web-extension";
const { token } = await chrome.identity.getAuthToken({ interactive: true });
const cred = GoogleAuthProvider.credential(null, token);
await linkWithCredential(auth.currentUser!, cred).catch(async (e) => {
  if (e.code === "auth/credential-already-in-use") await signInWithCredential(auth, cred);
  else throw e;
});
```
Needs: `identity` permission, `oauth2.client_id` (Chrome Extension OAuth client) in the manifest, a fixed extension `key` so the ID is stable, and `chrome-extension://<ID>` in Firebase Auth authorized domains. Details: `docs/EXTENSION.md`.

Same Google account on web and extension ⇒ same uid ⇒ follows sync automatically.

## Tiers

Tier is derived from the verified token, never from Firestore:
```ts
const tier = decoded.firebase.sign_in_provider === "anonymous" ? "guest" : "member";
```
Custom claim `plan: "pro"` is reserved for later (not implemented).

## Limits (per user per UTC day — Remote Config `limits_guest` / `limits_member`)

| Feature | API endpoint | Guest | Member |
|---|---|---|---|
| On-device gatekeeper, summary, graph check, on-device Ask | — (client) | unlimited | unlimited |
| Graph retrieve | `POST /v1/graph/retrieve` | 20 | 200 |
| Cloud check (Google Search) | `POST /v1/check` | **3** | **50** |
| Read cached explainer | `GET /v1/explainer/:storyId` | ✓ (no quota) | ✓ |
| Generate explainer | `POST /v1/explainer` | ✗ | 20 |
| Ask (cloud / global) | `POST /v1/ask` | ✗ | 30 |
| Follow / unfollow | `POST/DELETE /v1/follows` | ✗ | ✓ (max 50 followed) |

Plus a **global daily AI budget** (`global_daily_ai_budget`, default 1,000 cloud AI calls) protecting the free Gemini quota.

Remote Config JSON values:
```json
limits_guest  = {"retrieve":20,"check":3,"explainer":0,"ask":0,"follows":0}
limits_member = {"retrieve":200,"check":50,"explainer":20,"ask":30,"follows":50}
```

## Enforcement (API middleware chain)

```
request
 → cors (allowlist)
 → appCheck      verify X-Firebase-AppCheck   → 401 app_check_failed
 → auth          verify Bearer ID token       → 401 unauthenticated
 → tier          from sign_in_provider
 → allow         feature allowed for tier?    → 403 tier_required {upgrade:true}
 → cache         fresh graph/explainer hit?   → 200 (no quota used)
 → budget        global daily budget left?    → 503 budget_exhausted
 → quota         txn: usage/{uid}/days/{d}.feature < limit ? +1 : 429 quota_exceeded {limit,used,resetAt,upgrade}
 → handler       call Gemini, ingest, respond
 → on failure    refund quota + budget in a txn
```

```ts
// apps/api/src/middleware/quota.ts (sketch)
await db.runTransaction(async (tx) => {
  const ref = db.doc(`usage/${uid}/days/${utcDate()}`);
  const used = (await tx.get(ref)).get(feature) ?? 0;
  if (used >= limit) throw new ApiError("quota_exceeded", 429, { limit, used, resetAt: nextUtcMidnight(), upgrade: tier === "guest" });
  tx.set(ref, { [feature]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
});
```

## Client UX

- `GET /v1/me` on start → `{ uid, tier, limits, usage }` → `QuotaMeter`.
- Guest hits a member feature → inline `UpgradePrompt` ("Sign in with Google to generate explainers — free").
- Quota exceeded → guest: UpgradePrompt; member: "Back tomorrow (resets 4 PM your time)".
- Budget exhausted → "High demand — on-device features still work".

## App Check

| Client | Provider | Notes |
|---|---|---|
| Website | `ReCaptchaV3Provider(siteKey)` | Free. Register the Hosting domain. |
| Extension | Debug provider with a registered debug token baked into the **judge build only** | reCAPTCHA can't run in an extension page without remote script. Rotate/revoke the token after judging (Dec 16). |
| Local dev | Debug provider | `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` |

Enforce App Check for Firestore and AI Logic in the console; the API verifies tokens itself with `getAppCheck().verifyToken()`.
