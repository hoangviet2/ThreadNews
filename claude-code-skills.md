# Claude Code skills for ThreadNews (repo-wide, all contributors)

Decided 2026-11-23. Scope: committed to the repo so every contributor gets the same setup.

## What we install

### Plugins (declared in `.claude/settings.json` → `extraKnownMarketplaces` + `enabledPlugins`)
| Plugin | Marketplace (repo) | Why |
|---|---|---|
| `firebase@firebase` | `firebase/agent-skills` | **Hackathon-suggested** Firebase Agent Skills (13 skills). We use: firebase-basics, firebase-local-env-setup, firebase-ai-logic-basics, firebase-auth-basics, firebase-firestore-standard, firestore-security-rules-auditor, firebase-remote-config-basics, firebase-hosting-basics. Ignore: analytics, crashlytics, data-connect, app-hosting, firestore-enterprise. |
| `frontend-design@claude-plugins-official` | Anthropic official (auto-registered) | Anthropic's frontend design skill. **DESIGN.md wins** if it conflicts (it tends to avoid Inter; we chose Inter + Chrome colors). |
| `chrome-devtools-mcp@chrome-devtools-plugins` | `ChromeDevTools/chrome-devtools-mcp` | Google's DevTools MCP + skills: debug the extension/website, console, network, performance. |

### Vendored skills (copied into `.claude/skills/`, committed)
| Skill(s) | Source | Why |
|---|---|---|
| Apple HIG: `hig-foundations`, `hig-patterns`, `hig-components-content`, `-controls`, `-dialogs`, `-layout`, `-menus`, `-search`, `-status` | `raintree-technology/apple-hig-skills` (community) | Apple design principles (clarity, hierarchy, controls, feedback). Platform-specific iOS/visionOS skills skipped. DESIGN.md wins on colors/fonts. |
| `vercel-react-best-practices`, `web-design-guidelines` | `vercel-labs/agent-skills` | React performance rules + web UI/accessibility audits (API is on Vercel; website is React). |

### Custom repo skills (we write them — no official skill exists)
| Skill | Covers |
|---|---|
| `firebase-hybrid-inference` | AI Logic hybrid on web/extension: `PREFER_ON_DEVICE`, `initializeDeviceModel` on user click, 9,216-token cap, `LanguageModel.availability()` for the ⚡/☁️ badge, structured output, budget trimming |
| `firebase-app-check` | reCAPTCHA v3 on web, debug token + CustomProvider in the extension (no remote script), `verifyToken` in the Hono API |
| `chrome-extension-mv3` | WXT, side panel, `activeTab`+`scripting` extraction, optional host permissions, `chrome.identity` + `firebase/auth/web-extension`, no remote code, release zip |
| `grounded-results` | Rendering `searchEntryPoint.renderedContent` + `groundingChunks` in `<SourceList>` (mandatory) |

### MCP servers (`.mcp.json`, project scope)
- `firebase` → `npx -y firebase-tools@latest mcp`
- Chrome DevTools MCP comes with its plugin.

## Contributor flow
1. Clone, `cd` into repo, run `claude`, trust the folder.
2. Run `./scripts/setup-claude.sh` once (installs the 3 plugins with `--scope project`; project settings alone may not prompt — known Claude Code issue).
3. Check: `/plugin` shows 3 enabled, `/skills` lists vendored + custom skills, `claude mcp list` shows firebase + chrome-devtools.

## Setup prompt (paste into Claude Code at the repo root)
See the chat reply of 2026-11-23 (also suitable to paste as-is).
