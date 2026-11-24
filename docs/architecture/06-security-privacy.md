# 06 · Security & privacy

## What data goes where

| Data | Leaves the device? | Stored? | Where |
|---|---|---|---|
| Full article text | **No** (on-device only; cloud fallback of AI Logic sends it to Gemini only when Nano is unavailable — disclosed in the UI) | **Never** | — |
| URL, headline, publisher, publish date | Yes → API | Yes | `users/{uid}/checks`, `kg_sources` |
| Extracted claims, entity names | Yes → API → Gemini | Yes | checks, graph |
| Questions asked (Ask) | Cloud path only | No (not logged) | — |
| Reading history | Only checks the user ran | Yes, per user, last 100 | `users/{uid}/checks` |
| Google account email/name | Firebase Auth | Auth only | Not copied to Firestore |

UI disclosure (Settings + first-run card): "ThreadNews reads articles on your computer. When it checks a story online, only the headline and the key claims are sent. Without on-device AI, the summary is generated in the cloud."

Third-party notes to verify before launch:
- **Gemini free tier:** content sent on the free tier may be used by Google to improve its products — another reason we send only claims, never article text. Check the current Gemini API terms.
- **Grounding with Google Search:** check the terms on storing/caching grounded output (we store derived graph facts and cached explainers). If storage is restricted, cache only our structured extraction + source links and re-render suggestions on demand.

## Threat model (hackathon scope)

| Threat | Mitigation |
|---|---|
| Someone burns our Gemini quota by calling AI Logic directly | App Check enforced on AI Logic; AI Logic per-user RPM limit set low (10); expensive calls only via API |
| Someone calls the API from a script | App Check token required + Firebase ID token required; per-user daily quotas; global budget |
| Guest farms new anonymous accounts for more quota | App Check; per-IP soft limit in API (in-memory, 30 req/min); guest limits are tiny; global budget caps damage |
| Graph poisoning (fake claims written to shared graph) | Clients cannot write `kg_*`; only API writes after Gemini + Search; ingest validates with Zod and caps sizes |
| Prompt injection inside articles ("ignore instructions…") | Article text is treated as data in delimited blocks; outputs are schema-validated; on-device output never written to the shared graph |
| XSS via model output or Search suggestions | Render model text as text (no `dangerouslySetInnerHTML`); Search suggestions HTML rendered inside a sandboxed iframe (`sandbox="allow-popups allow-popups-to-escape-sandbox"`, no scripts) |
| Leaked secrets | Service account + Gemini key only in Vercel env; cron secret in GitHub secrets; `.env*` gitignored; secret scanning on |
| Extension debug App Check token extracted from zip | Judge build only; token revoked after Dec 16; quotas still apply |
| Cron endpoint abuse | `X-Cron-Secret` (constant-time compare) + not listed in public OpenAPI |

## Firestore rules (`firestore.rules`)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function isOwner(uid) { return signedIn() && request.auth.uid == uid; }

    function validCheck(d) {
      return d.keys().hasOnly(['createdAt','articleUrl','urlHash','headline','publisher','publishedAt',
                               'claims','entities','storyId','result','inference','source'])
        && d.source in ['graph_check', 'gatekeeper_only']      // cloud results are written by the API
        && d.inference in ['on_device', 'cloud']
        && d.claims is list && d.claims.size() <= 30
        && d.headline is string && d.headline.size() <= 300
        && d.createdAt == request.time;
    }

    match /users/{uid} {
      allow read: if isOwner(uid);
      allow create, update: if isOwner(uid)
        && request.resource.data.keys().hasOnly(['createdAt','lastSeenAt','tier','settings']);

      match /checks/{checkId} {
        allow read: if isOwner(uid);
        allow create: if isOwner(uid) && validCheck(request.resource.data);
        allow update, delete: if false;
      }
      match /follows/{storyId} {
        allow read: if isOwner(uid);
        allow write: if false;                                  // API only (keeps followerCount consistent)
      }
    }

    match /usage/{uid}/days/{day} {
      allow read: if isOwner(uid);
      allow write: if false;
    }

    match /kg_stories/{id}      { allow read: if signedIn(); allow write: if false; }
    match /kg_events/{id}       { allow read: if signedIn(); allow write: if false; }
    match /kg_claims/{id}       { allow read: if signedIn(); allow write: if false; }
    match /kg_entities/{id}     { allow read: if signedIn(); allow write: if false; }
    match /kg_sources/{id}      { allow read: if signedIn(); allow write: if false; }
    match /kg_edges/{id}        { allow read: if signedIn(); allow write: if false; }
    match /kg_communities/{id}  { allow read: if signedIn(); allow write: if false; }
    match /kg_explainers/{id}   { allow read: if signedIn(); allow write: if false; }
    match /kg_meta/{id}         { allow read, write: if false; }
  }
}
```
Rules tests live in `apps/api/test/rules.test.ts` (emulator) — see `docs/TESTING.md`.

## API hardening

- CORS allowlist: `https://<project>.web.app`, `https://<project>.firebaseapp.com`, `chrome-extension://<EXTENSION_ID>`, `http://localhost:5173`.
- Body size limit 32 KB; Zod validation on every body; string length caps.
- Timeouts: Gemini 20 s, total request 30 s.
- Errors never echo stack traces or upstream messages.
- Logs: request id, uid hash, route, status, latency. No claims or questions in logs.

## Extension permissions (least privilege)

`sidePanel`, `activeTab`, `scripting`, `storage`, `alarms`, `identity` + `host_permissions` only for the API origin. No `<all_urls>`, no `tabs`, no content script on every page — extraction is injected on demand into the active tab when the side panel asks.
