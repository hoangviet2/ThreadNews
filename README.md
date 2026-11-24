# ThreadNews — is this article still true?

> Not another news app — a layer on any article that tells you if the story has moved on.

Built for **#BuildHybridAI 2026** with **Firebase AI Logic hybrid inference**: Gemini Nano runs on your computer first; the cloud (Gemini + Google Search) is used only when needed. A **knowledge graph with GraphRAG** remembers every story, so known stories are checked entirely on-device.

- **Website:** `https://<project-id>.web.app` · **API docs:** `https://<api>.vercel.app/docs`
- **Extension:** download the latest `threadnews-extension.zip` from [Releases](../../releases) → see *Install the extension* below.
- **Demo video:** `<YouTube link>`

## What it does

Open any news article and ThreadNews answers:

- ✅ **Still current** — nothing material has changed. You get a short brief, the sources covering it, and can follow the story.
- 🕘 **Story has moved on** — a fact was revised, contradicted or overtaken by events (e.g. *death toll ~~12~~ → 30*). You get "what changed since this article" and a full explainer with timeline, background and the bigger picture.

## How hybrid inference is used

| Step | Runs | Why |
|---|---|---|
| Gatekeeper: is this news? any checkable claims? | **On-device** (Nano), cloud fallback | Private, instant, free — the article never leaves the browser |
| Summary, "explain simpler" | **On-device**, cloud fallback | Same |
| Check a story the graph already knows | **On-device** with GraphRAG context | No cloud call at all |
| Check a new story | **Cloud** (Gemini + Google Search) via our API | Needs fresh world knowledge |
| Explainer, cloud Q&A | **Cloud** with GraphRAG context | Long context + search |

Only extracted claims, entities and the headline ever leave the device.

## Tech

Firebase **AI Logic** (hybrid, `PREFER_ON_DEVICE`) · **Auth** (anonymous guests + Google) · **Firestore** (data + knowledge graph + vector search) · **App Check** · **Remote Config** · **Hosting** — all on the free Spark plan. API on Vercel (Hono, TypeScript), scheduled jobs on GitHub Actions. React + Vite website, WXT + React Chrome extension.

See [ARCHITECTURE.md](ARCHITECTURE.md).

## Install the extension (judges)

1. Use **Chrome 148+ on desktop** (Windows, macOS, Linux). For on-device AI your machine needs ~22 GB free disk and a GPU with >4 GB VRAM or 16 GB RAM + 4 cores. Without it, everything still works via the cloud.
2. Download and unzip `threadnews-extension.zip` from Releases.
3. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, pick the unzipped folder.
4. Open any news article, click the ThreadNews icon → side panel opens → **Enable on-device AI** (first time only; the model download can take a few minutes).
5. Try as a guest, then **Sign in with Google** for higher limits.

Check model status at `chrome://on-device-internals`.

## Run locally

```bash
pnpm i
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env.local
cp apps/extension/.env.example apps/extension/.env.local
pnpm emulators   # in one terminal
pnpm dev         # web on :5173, api on :8787
pnpm dev:ext     # extension
pnpm seed        # load demo stories into the graph
```

Full setup: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Docs

[Architecture](ARCHITECTURE.md) · [API](docs/API.md) · [GraphRAG](docs/GRAPHRAG.md) · [Website](docs/WEBSITE.md) · [Extension](docs/EXTENSION.md) · [Prompts](docs/PROMPTS.md) · [Design](DESIGN.md) · [Deployment](docs/DEPLOYMENT.md) · [Testing](docs/TESTING.md)

## License

Apache-2.0
