---
name: grounded-results
description: Mandatory display rules for Google Search grounded results in ThreadNews — any response with groundingMetadata / a `grounding` object must render Search suggestions (searchEntryPoint.renderedContent in a sandboxed iframe) and sources (groundingChunks) via <SourceList>. Use when building or changing SourceList, result/explainer/ask views, or API responses that carry grounding.
---

# Grounded results (ThreadNews)

Source of truth: `docs/API.md` → *Grounding object*, `DESIGN.md` → `SourceList`, `docs/architecture/02-hybrid-ai.md` → *Grounding display obligations*. CLAUDE.md hard rule 6.

## The rule

If a response has grounding (API: `grounding` non-null, Gemini: `groundingMetadata`), the UI **must** render both of these, every time:

1. **Google Search suggestions.** Render `grounding.searchEntryPointHtml` (from `searchEntryPoint.renderedContent`) as-is inside a **sandboxed iframe**: `sandbox="allow-popups allow-popups-to-escape-sandbox"`, no `allow-scripts`, using `srcdoc`. Never use `dangerouslySetInnerHTML` in the app DOM, and never restyle or strip it.
2. **Sources.** Render `grounding.chunks[].{uri,title}` (from `groundingChunks[].web`) as `SourceList` items. Use `supports` (from `groundingSupports`) for inline citation chips `[n]` in `ExplainerSection`.

**Never hide either one** behind a toggle, accordion, "show sources" button or tooltip. Collapsing a long list after the first few items is fine. The suggestions block always stays visible.

## Pipeline

- `apps/api` passes grounding through **unchanged** (only the shape mapping above). It never drops it, even on cached results. If storing grounded output is restricted, re-render on demand (see `06-security-privacy.md`).
- `packages/shared/schemas` defines `Grounding` in Zod. Clients render it only through `<SourceList>` in `packages/ui`.
- Ungrounded responses (`grounding: null`, e.g. on-device checks) show graph sources only, with no empty suggestions box.

## Done when

- A `SourceList` test covers: grounded → iframe present with the correct `sandbox` attr + N source links; ungrounded → no iframe.
- Every view that receives grounding (check result, explainer, cloud Ask) renders `SourceList` with it. Verify in both the website and the extension at 360px.
