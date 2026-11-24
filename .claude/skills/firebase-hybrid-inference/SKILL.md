---
name: firebase-hybrid-inference
description: ThreadNews rules for Firebase AI Logic hybrid inference (Gemini Nano on-device + cloud fallback) in apps/web and apps/extension. Use for any change touching firebase/ai, packages/shared/ai, on-device prompts, the ⚡/☁️ inference badge, OnDeviceSetup, or structured output from on-device jobs.
---

# Firebase hybrid inference (ThreadNews)

Source of truth: `docs/architecture/02-hybrid-ai.md` (jobs, limits, failure handling) and `docs/PROMPTS.md` (prompt text, schemas, token budgets). Read them before you change anything. This file lists only the rules.

## Rules

1. **Only through `packages/shared/ai`.** Use `getAI` / `getGenerativeModel` from `firebase/ai` with `mode: InferenceMode.PREFER_ON_DEVICE`. Never call the Prompt API (`LanguageModel.create`) directly for app jobs. The hackathon requires AI Logic to be called at runtime (CLAUDE.md hard rule 2).
2. **Cloud model from Remote Config.** `inCloudParams: { model: rc.model_fallback }`, with keys from `packages/shared/config/keys.ts`. Never hard-code a model name.
3. **Start the device model only from a user click.** Call `initializeDeviceModel()` only from the "Enable on-device AI" button in `OnDeviceSetup`. Never call it on load, in an effect or in the service worker. Show download progress.
4. **9,216-token hard cap.** Trim every on-device input with `packages/shared/ai/budget.ts` first (create it if it doesn't exist yet). Budgets: article ≤ 6k, graph context ≤ 1.5k, instructions ≤ 800 (see the table in PROMPTS.md).
5. **On-device limits.** Single-turn only (no chat history). No tools, no Google Search grounding, no URL context. Text and JPEG/PNG input only. Anything that needs these goes to `apps/api` (hard rule 3).
6. **⚡/☁️ badge.** Before each call, check `LanguageModel.availability()`. `"available"` + `PREFER_ON_DEVICE` → ⚡ On-device, anything else → ☁️ Cloud. Store the label with the result (`inference: "on_device" | "cloud"`).
7. **Structured output from Zod.** Pass the JSON schema generated from the Zod schema in `packages/shared/schemas/ai.ts`. On-device supports JSON + enums. Validate the response with Zod. On failure, retry once with "return valid JSON only", then return a typed error.
8. **Prompts are versioned constants** in `packages/shared/prompts/*.ts`. Article text goes in `<article>` tags and is treated as data. A prompt change means a version bump plus `pnpm eval`.
9. **Privacy.** Article text never leaves the device through our code (hard rule 5). The only exception is AI Logic's own cloud fallback, which the UI discloses.

## Done when

- Works with Nano **available** and **unavailable** (cloud fallback shows ☁️ + a one-time notice).
- A 429 on cloud fallback degrades gracefully (summary unavailable; heuristic gatekeeper still runs).
- `budget.ts` has a unit test proving inputs stay ≤ 9,216 tokens.
