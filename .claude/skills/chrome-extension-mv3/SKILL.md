---
name: chrome-extension-mv3
description: ThreadNews Chrome MV3 extension rules — WXT, side panel, on-demand extraction with activeTab+scripting, optional host permissions, Google sign-in via chrome.identity + firebase/auth/web-extension, stable manifest.key, no remote code/eval, release zip checklist. Use for any change in apps/extension or wxt.config.ts.
---

# Chrome extension MV3 (ThreadNews)

Source of truth: `docs/EXTENSION.md` (manifest, entry points, flow, release checklist). Auth code: `docs/architecture/04-auth-and-quotas.md`. Permissions rationale: `docs/architecture/06-security-privacy.md`. UI: `DESIGN.md` → Extension side panel.

## Rules

1. **WXT + React.** The manifest is generated from `wxt.config.ts`. Never hand-edit a `manifest.json`. Entry points live in `apps/extension/entrypoints/`.
2. **Side panel is the UI.** `background.ts` sets `openPanelOnActionClick: true`. The side panel owns Firebase (app, auth, AI Logic, App Check).
3. **On-demand extraction only.** `chrome.scripting.executeScript` injects the bundled `extractor.ts` into the active tab when the panel asks. It uses `activeTab` + `scripting`. No always-on content script (ADR-012). Extracted text stays in panel memory. Never write it to storage or send it to the API.
4. **Least privilege.** Permissions: `sidePanel, activeTab, scripting, storage, alarms, identity`. `host_permissions` only for the API origin. `optional_host_permissions` for sites, requested in-panel with an explanation, and everything must work without it. No `<all_urls>`, no `tabs`.
5. **Auth.** Import from `firebase/auth/web-extension`. Use anonymous sign-in first. For Google: `chrome.identity.getAuthToken({ interactive: true })` → `GoogleAuthProvider.credential(null, token)` → `linkWithCredential`. On `auth/credential-already-in-use`, fall back to `signInWithCredential`.
6. **Stable ID.** `manifest.key` (public key) must stay fixed. The OAuth client ID and the Firebase authorized domain `chrome-extension://<ID>` depend on it.
7. **No remote code** (hard rule 8): no CDN, no remote scripts, no `eval` / `new Function`. CSP: `script-src 'self'; object-src 'self'`. App Check uses the debug provider (see the `firebase-app-check` skill).
8. **Shared logic** (`useCheckFlow`, view models, message types) lives in `packages/shared`, not in the extension.

## Release checklist (before `pnpm --filter extension zip`)

- [ ] Grep `.output/chrome-mv3` for remote script loads, `eval`, `new Function`.
- [ ] Only the listed permissions are present.
- [ ] Works with Nano unavailable and offline (cache).
- [ ] Guest limits, member upgrade, quota-reached UI.
- [ ] Grounded results render Search suggestions + sources (`grounded-results` skill).
- [ ] 360px width: no horizontal scroll.
- [ ] `WXT_APPCHECK_DEBUG_TOKEN` comes from CI secrets, not the repo.
