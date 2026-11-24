# 02 · Hybrid AI

**Rule of thumb:** Nano reads the page; the cloud knows the world.

## Two paths

| Path | Where | Library | Used for |
|---|---|---|---|
| **Client hybrid** | extension + website | Firebase AI Logic (`firebase/ai`), `InferenceMode.PREFER_ON_DEVICE` | Everything that only needs the article or a small graph context |
| **Server cloud** | `apps/api` | `@google/genai` (Gemini Developer API, AI Studio key) | Google Search grounding, long-context generation, embeddings, graph extraction — anything quota-limited |

Why the server path exists: AI Logic's per-user rate limit is a single per-minute limit for all users — it can't express guest vs member daily quotas. Expensive calls therefore go through our API, which enforces quotas. The client still uses AI Logic for every on-device-first job, so hybrid inference stays the core of the app.

## Jobs

| Job | Path | Mode / model | Input | Output schema (`packages/shared/schemas/ai.ts`) | Tier |
|---|---|---|---|---|---|
| Gatekeeper | client | `PREFER_ON_DEVICE` → `gemini-3.5-flash-lite` | title + first ~6k tokens of article | `GatekeeperResult` | all |
| Reader (TL;DR, 5W, simpler) | client | `PREFER_ON_DEVICE` | same | streaming text | all |
| Graph check | client | `PREFER_ON_DEVICE` | article claims + local graph context (≤1.5k tokens) | `CheckResult` | all |
| Ask router | client | `PREFER_ON_DEVICE` | question | `{ mode: "local" \| "global" }` | all |
| Ask (on-device) | client | `PREFER_ON_DEVICE` | question + local context | `AskAnswer` | all |
| Cloud check | API `/v1/check` | `gemini-3.8-flash` + `googleSearch`, then `gemini-3.5-flash-lite` to structure | claims + local context + `lastUpdatedAt` | `CheckResult` + `GraphExtraction` | quota |
| Explainer | API `/v1/explainer` | `gemini-3.8-flash` + `googleSearch` | local + global context | `Explainer` | member |
| Ask (cloud / global) | API `/v1/ask` | `gemini-3.8-flash` | local or global context | `AskAnswer` | member |
| Community summary | API cron | `gemini-3.5-flash-lite` | community members | `CommunitySummary` | — |
| Embeddings | API | `gemini-embedding-2`, 768 dims (MRL-truncated, re-normalized) | text | `number[768]` | — |

All model names come from Remote Config (`docs/DEPLOYMENT.md#remote-config`). Avoid Gemini 2.5 models (retiring).

## Client setup (sketch — verify exact names against the Firebase hybrid web docs on day 1)

```ts
// packages/shared/ai/client.ts
import { initializeApp } from "firebase/app";
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, Schema } from "firebase/ai";

const ai = getAI(app, { backend: new GoogleAIBackend() });

export const gatekeeperModel = getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_ON_DEVICE,
  inCloudParams: { model: rc.model_fallback },            // gemini-3.5-flash-lite
  // structured output: JSON schema generated from Zod (on-device supports JSON + enums)
});

// Must be triggered by a user gesture (button click) before the first prompt:
// "Enable on-device AI" → initializeDeviceModel() → show download progress.
```

### Knowing which path ran (for the ⚡ / ☁️ badge)
Before each call, check `LanguageModel.availability()` (Chrome Prompt API global). If `"available"` and mode is `PREFER_ON_DEVICE`, label ⚡ On-device; otherwise ☁️ Cloud. Store the label with the result.

## Limits of on-device (design around them)

- Single-turn only (no chat) → Ask is single-turn by design.
- **Max 9,216 tokens** → article text capped at ~6,000 tokens (title + lead + first paragraphs), graph context ≤ 1,500, instructions ≤ 800.
- Text and JPEG/PNG input only; no tools, no grounding, no URL context.
- Desktop Chrome 148+ with enough hardware (~22 GB free disk; GPU >4 GB VRAM, or 16 GB RAM + 4 cores). Not on mobile.
- First use downloads the model (minutes) → `OnDeviceSetup` card with progress.

## Server setup (sketch)

```ts
// apps/api/src/services/gemini.ts
import { GoogleGenAI } from "@google/genai";
const genai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

// Step 1: grounded research (text + citations)
const research = await genai.models.generateContent({
  model: rc.model_cloud,                                   // gemini-3.8-flash
  contents: buildCheckPrompt(claims, graphContext, lastUpdatedAt),
  config: { tools: [{ googleSearch: {} }], temperature: 0.2 },
});
const grounding = research.candidates?.[0]?.groundingMetadata; // searchEntryPoint + groundingChunks + groundingSupports

// Step 2: structure (no tools) → CheckResult + GraphExtraction in one schema
const structured = await genai.models.generateContent({
  model: rc.model_fallback,
  contents: buildStructurePrompt(research.text, claims),
  config: { responseMimeType: "application/json", responseSchema: toGeminiSchema(CheckAndExtract) },
});
```
If day-1 spike shows grounding + `responseSchema` work together in one call, collapse to one call.

## Grounding display obligations

Any response with `groundingMetadata` is a grounded result. The UI **must** show:
1. Google Search suggestions — `searchEntryPoint.renderedContent` (HTML + CSS; render in a sandboxed container).
2. Sources — `groundingChunks[].web.{uri,title}`; use `groundingSupports` for inline citations.

The API passes `grounding` through unchanged in its responses; `<SourceList>` renders it.

## Failure handling

| Failure | Behavior |
|---|---|
| Nano unavailable / download pending | AI Logic falls back to cloud automatically; show ☁️ and a one-time notice |
| Client cloud fallback rate-limited (429) | Show summary unavailable; keep gatekeeper heuristic (URL/meta-based `isNews`) |
| Structured output fails Zod | Retry once with "return valid JSON only"; then typed error |
| API AI quota / budget exhausted | 429 / 503 with `upgrade` hint; on-device features continue |
| Gemini 5xx / timeout (20 s) | Retry once with jitter; refund usage counter; 502 `upstream_error` |

## Prompts

All prompt text, schemas and examples: [`docs/PROMPTS.md`](../PROMPTS.md).
