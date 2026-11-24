# SUBMISSION.md — Devpost checklist, video script, judge access

Hackathon: https://firebasehybridaihackathon.devpost.com/ · **Deadline Mon Nov 30, 2:00 PM PT** · Judging Dec 10–16 · Category: **Web (Chrome)** → eligible for Best Web/Chrome + main prizes.

## Stage 1 (pass/fail) checklist

- [ ] Firebase AI Logic imported **and called at runtime** — `packages/shared/ai/client.ts`, used by extension + website (point judges to the file in the description).
- [ ] **App Check enabled** (reCAPTCHA v3 web; debug token extension) — screenshot of console optional.
- [ ] New project (no prior work) — say so explicitly.
- [ ] English UI; installs and runs; matches video + description.
- [ ] Public GitHub repo with all source + run instructions (README).
- [ ] Open-source license visible in repo About (**Apache-2.0**).
- [ ] No production API keys / service account / secrets / PII in repo or form (Firebase web config is fine). Run secret scan.
- [ ] Demo video ≤ 3:00, public on YouTube, English, shows the app running in Chrome.
- [ ] Text description: how AI Logic is used, features, value proposition.
- [ ] Free test access for judges through **Dec 16**: website URL, extension zip (+ optional Web Store link), no paid steps. Guests work without sign-in; Google sign-in for member features.
- [ ] Platform selected: Web (Chrome).

## Judging criteria → where we score

| Criterion | Our evidence |
|---|---|
| Technological implementation | Hybrid split by design (on-device gatekeeper/graph check, cloud only when needed); GraphRAG knowledge graph; server-enforced quotas; App Check; Remote Config; $0 free-tier architecture |
| Design | Complete product on two surfaces; one clear status language; explainer; consistent design system |
| Potential impact | Old news recirculating as new is a real, documented problem; works on any news site; privacy-first |
| Quality of the idea | Event-based staleness ("still true?") instead of date warnings; "what changed since this article"; graph memory lets known stories be checked fully on-device |

## Devpost text (template)

**Tagline:** Not another news app — a layer on any article that tells you if the story has moved on.

**Inspiration** — Articles keep circulating after the facts change: death tolls revised, deals collapsed, verdicts reached. Date warnings say "this is old"; they don't say what changed.

**What it does** — Case A / Case B, explainer, follow, Ask. (2–3 sentences each.)

**How we built it — Firebase AI Logic hybrid inference**
- Gemini Nano on-device (`PREFER_ON_DEVICE`) runs the gatekeeper, summary, graph check and question routing; the article never leaves the browser.
- When a story is new or stale, our API calls Gemini with Google Search grounding; results feed a knowledge graph (Firestore) with GraphRAG retrieval.
- Next time anyone reads about that story, the check runs on-device from a compact subgraph — no cloud call.
- Firebase Auth (anonymous guests + Google), App Check, Remote Config, Hosting, Firestore vector search — all on the free Spark plan.

**Challenges** · **Accomplishments** · **What we learned** · **What's next** (Android/iOS clients with the same graph).

**Where AI Logic is used in code:** `packages/shared/ai/client.ts`, `apps/extension/entrypoints/sidepanel/hooks/useCheckFlow.ts`, `apps/web/src/features/check/useCheckFlow.ts`.

## Demo video script (≤ 3:00)

| Time | Shot | Voice-over |
|---|---|---|
| 0:00–0:15 | Social feed with an old article being shared | "This article is three days old. Is it still true?" |
| 0:15–0:40 | Open article → click icon → side panel → ⚡ On-device summary appears instantly | "ThreadNews reads the article on your computer with Gemini Nano. Nothing leaves your browser." |
| 0:40–1:10 | Status: **Story has moved on** → change card *death toll ~~12~~ → 30* → sources + Search suggestions | "Our API checked what happened since — with Google Search — and found two facts changed." |
| 1:10–1:35 | Open full explainer → What changed → Timeline → Bigger picture | "A full catch-up, built from our knowledge graph." |
| 1:35–1:55 | Graph view: story, claims, superseded chain | "Every check enriches a knowledge graph — GraphRAG." |
| 1:55–2:20 | Second article about the same story (different outlet) → instant ⚡ check, no cloud | "The next time anyone reads about this story, the check runs fully on-device." |
| 2:20–2:40 | Guest limit → Sign in with Google → follow → badge update | "Guests try it free; members follow stories and get updates." |
| 2:40–3:00 | Architecture slide (hybrid split) + URLs | "Hybrid by design: Nano reads the page, the cloud knows the world." |

Record on a machine with Nano available (check `chrome://on-device-internals`). Pre-seed the graph so the second check is on-device. Turn on captions.

## Judge access block (paste into Devpost "Testing instructions")

```
Website: https://threadnews-prod.web.app  (works in any desktop Chrome; on-device AI needs Chrome 148+ and capable hardware, otherwise cloud fallback)
Extension: https://github.com/<org>/threadnews/releases/latest → threadnews-extension.zip
  chrome://extensions → Developer mode → Load unpacked → select unzipped folder
  Open any news article → click the ThreadNews icon → "Enable on-device AI" (first time, model download may take minutes)
Try: <seeded moved-on article URL>, <seeded current article URL>, <seeded disputed article URL>
Guest: no sign-in needed (3 cloud checks/day). Member: "Sign in with Google" (50/day).
API docs: https://us-central1-threadnews-4c8bd.cloudfunctions.net/api/docs
Available through Dec 16, 2026.
```

## Final hour

- [ ] Re-run judge steps on a clean Chrome profile.
- [ ] Video link public; repo public; license visible.
- [ ] Submit; screenshot the confirmation; stop pushing to `main` before 2 PM PT.
