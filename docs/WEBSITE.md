# WEBSITE.md — apps/web

Vite + React + TypeScript SPA on **Firebase Hosting** (free). Shares UI (`packages/ui`), schemas, prompts and the AI wrapper (`packages/shared`) with the extension. UI rules: `DESIGN.md`.

## Purpose

1. **Paste-a-link / paste-text checks** for people without the extension (and the easiest path for judges).
2. **Explainer** pages for "moved on" stories (the extension's "Open full explainer" lands here).
3. **Ask about this story**, **story graph view**, **followed stories**.

## Stack

| Concern | Choice |
|---|---|
| Build | Vite 6, TypeScript strict |
| Routing | React Router (data routers) |
| Server state | TanStack Query (API + Firestore reads via small hooks) |
| Firestore realtime | `onSnapshot` hooks for followed stories & story timeline |
| UI | Tailwind + shadcn/ui + `packages/ui` |
| Graph view | Cytoscape.js (lazy-loaded chunk) |
| Forms | native + Zod |
| Firebase | `firebase/app`, `auth`, `firestore`, `app-check`, `remote-config`, `ai` |

## Routes

| Path | Page | Auth | Notes |
|---|---|---|---|
| `/` | Home | any | Input (URL or text), 3 example chips (seeded stories), how-it-works, install CTA |
| `/check` | Check result | any | Runs the flow on pasted input; URL param `?u=` for a link |
| `/story/:storyId` | Explainer | any | Timeline + what changed from Firestore; explainer from API; Ask; Graph |
| `/story/:storyId/graph` | Full-screen graph | any | Deep link from explainer |
| `/following` | Followed stories | member | Guest → UpgradePrompt |
| `/settings` | Settings | any | On-device AI toggle/status, reading level, theme, privacy note, sign out |
| `/about` | About / privacy | any | What data is sent, hybrid explanation |
| `*` | 404 | | |

## Paste-a-link flow

Browsers can't fetch arbitrary article HTML (CORS), and we don't proxy article bodies. So:
- **Text pasted** → full flow (gatekeeper + summary on-device, then retrieve/check).
- **Link pasted** → we use the URL + whatever the user pastes as the headline/lead (prompt them: "Paste the headline or first paragraph too for best results"). If only a URL is given, `/v1/check` runs with headline = URL slug-derived text and claims = [] → the server's grounded research finds the story by URL (Gemini + Search), and returns claims in its structured output.
- Recommend the extension for one-click checks.

## Module layout

```
apps/web/src
  main.tsx                 providers: QueryClient, Auth, RemoteConfig, Theme
  firebase.ts              initializeApp, App Check (ReCaptchaV3Provider), auth, db, rc, ai
  routes/                  home, check, story, story-graph, following, settings, about
  features/
    auth/                  useAuth (anonymous bootstrap, linkWithPopup), AccountChip wiring
    quota/                 useMe (GET /v1/me), QuotaMeter wiring
    check/                 useCheckFlow (state machine below)
    story/                 useStory (Firestore story/events/claims), useExplainer, Timeline adapter
    ask/                   useAsk (router → local on-device | /v1/ask)
    graph/                 GraphView container (lazy)
    ondevice/              useOnDevice (availability, initialize, progress)
  lib/                     api client instance, formatting, analytics-free logging
```

## Check flow state machine (`features/check/useCheckFlow.ts`)

```
idle → extracting → gatekeeping ─┬─ not_news → done
                                 └─ retrieving ─┬─ fresh story → graph_checking (on-device) → done
                                                └─ unknown/stale → cloud_checking (API) → done
any → error(kind)  where kind ∈ quota | budget | network | upstream | invalid
```
Summary streams in parallel from `gatekeeping` onward. Result object = `CheckViewModel` (status, summary, changes, sources, grounding, inference, storyId, cached).

## Explainer page

Data:
- `kg_stories/{id}`, `kg_events where storyId` (timeline), `kg_claims where storyId` (what changed = superseded chains) — **direct Firestore reads** (cheap, realtime, no quota).
- `GET /v1/explainer/:id` → sections. If `404 not_generated`: member → "Generate explainer" button (`POST`), guest → UpgradePrompt + the graph-derived parts still render.
- Sections render with citation chips → `SourceList` (with Search suggestions).

Layout ≥1024px: content column + sticky rail (mini timeline, sources). Order: What changed → Background → Bigger picture → Timeline → Known vs disputed → Glossary → Ask → Graph.

Share: `/story/:id` is the canonical shareable link (opens as guest for anyone).

## Auth bootstrap

```ts
onAuthStateChanged(auth, async (u) => {
  if (!u) return signInAnonymously(auth);
  queryClient.invalidateQueries({ queryKey: ["me"] });
});
```
Sign in: `linkWithPopup(currentUser, new GoogleAuthProvider())`; handle `auth/credential-already-in-use` (see `04-auth-and-quotas.md`).

## Hosting config (`apps/web/firebase.json` excerpt)

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }],
    "headers": [
      { "source": "**/*.@(js|css|woff2)", "headers": [{ "key": "Cache-Control", "value": "public,max-age=31536000,immutable" }] },
      { "source": "**", "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" } ] }
    ]
  }
}
```

## Env (`apps/web/.env.example`)

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_RECAPTCHA_V3_SITE_KEY=
VITE_API_BASE_URL=https://us-central1-threadnews-4c8bd.cloudfunctions.net/api
VITE_USE_EMULATORS=false
```

## Performance budget

- Initial JS ≤ 250 KB gzip (Cytoscape and explainer serif font lazy-loaded).
- LCP ≤ 2.5 s on fast 3G-ish profile for `/`.
- No layout shift from skeleton → content.

## Done checklist

- Works with Nano and without; guest and member; offline banner when network drops (on-device summary still works on pasted text).
- Lighthouse a11y ≥ 95.
- Search suggestions rendered on every grounded result.
