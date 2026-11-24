# DESIGN.md — UI & UX guidelines

Applies to `apps/web`, `apps/extension` and `packages/ui`. Claude Code: follow this for every screen and component.

## 1. Product feel

- **Calm, factual, fast.** A news reader's tool, not a social app. No hype, no confetti.
- **The answer first.** Every surface leads with the status ("Still current" / "Story has moved on"), then the evidence.
- **Show the machinery only where it builds trust:** sources, dates, ⚡ on-device vs ☁️ cloud, "based on 4 sources". Hide everything else.
- **Neutral voice.** We report what changed and who reported it. We never call an article true, false or fake.

## 2. Copy rules

| Do | Don't |
|---|---|
| "Still current — no major changes since this was published" | "Verified ✓", "True" |
| "Story has moved on — 2 facts changed" | "This article is wrong / fake" |
| "Backed by 4 sources, including Reuters and AP" | "Certified by trusted sources" |
| "Death toll: ~~12~~ → **30** (Reuters, Nov 22)" | Paragraphs explaining the change |
| "Limit reached — sign in for 50 checks a day" | "Error 429" |
| "Couldn't reach the server. Your summary still works on this device." | "Something went wrong" |

- Sentence case everywhere. Numbers as digits. Dates as "Nov 22, 3:10 PM" in the user's locale; relative ("3 h ago") for anything < 24 h.
- Max 2 lines per change card; detail on expand.
- Reading level for explainers: plain English, ~grade 8, short sentences, define terms in the glossary.

## 3. Status system (core visual language)

Every check ends in exactly one status. Never use color alone — always icon + label.

| Status | Label | Icon (lucide) | Token | Use |
|---|---|---|---|---|
| `current` | Still current | `CircleCheck` | `--status-current` (green 600 / dark: green 400) | Case A |
| `moved_on` | Story has moved on | `History` | `--status-moved` (amber 600 / dark: amber 400) | Case B |
| `disputed` | Sources disagree | `Scale` | `--status-disputed` (violet 600 / dark: violet 400) | claims with `DISPUTES` edges |
| `not_news` | Not a news article | `FileText` | `--status-muted` (slate 500) | gatekeeper said no |
| `checking` | Checking… | `Loader2` (spin) | `--status-muted` | in progress |
| `unavailable` | Can't check right now | `CloudOff` | `--status-muted` | API/budget down |

Inference badge (small, next to results): **⚡ On-device** (`Zap`) or **☁️ Cloud** (`Cloud`). Tooltip explains: "Ran on your computer — the article never left your browser."

## 4. Design tokens

Implemented as CSS variables in `packages/ui/styles/tokens.css`, mapped into Tailwind theme. Light + dark (follow `prefers-color-scheme`; the Google Search suggestion widget also adapts to it).

```css
:root {
  --bg: 0 0% 100%;          --fg: 222 47% 11%;
  --surface: 210 40% 98%;   --surface-2: 210 40% 96%;
  --border: 214 32% 91%;    --muted-fg: 215 16% 47%;
  --primary: 221 83% 53%;   --primary-fg: 0 0% 100%;   /* links, primary buttons */
  --status-current: 142 72% 29%;
  --status-moved: 32 95% 44%;
  --status-disputed: 262 83% 58%;
  --status-muted: 215 16% 47%;
  --radius: 0.625rem;
}
.dark { --bg: 222 47% 7%; --fg: 210 40% 98%; --surface: 222 40% 11%; --surface-2: 222 35% 14%;
        --border: 217 33% 20%; --muted-fg: 215 20% 65%;
        --status-current: 142 69% 58%; --status-moved: 38 92% 60%; --status-disputed: 263 90% 75%; }
```

- **Type:** Inter (bundled, not CDN) for UI; `font-feature-settings: "tnum"` for numbers. Explainer body may use a serif (Source Serif 4, bundled) at 17–18px / 1.6 for long reading.
- **Scale:** 12 / 14 / 16 / 20 / 24 / 32. Side panel base = 14px. Website base = 16px.
- **Spacing:** 4-pt grid (Tailwind default). Cards `p-4`, gaps `gap-3`.
- **Radius:** `--radius` for cards, full for pills/badges.
- **Elevation:** borders over shadows. One shadow level for popovers only.
- **Motion:** 150–200 ms ease-out for expand/collapse and status changes. Respect `prefers-reduced-motion`. No looping animation except the checking spinner.

## 5. Components (`packages/ui`)

| Component | Purpose / rules |
|---|---|
| `StatusBadge` | Status icon + label, large (hero) and small (inline) sizes. |
| `StatusHero` | Top of side panel / result page: badge, one-line summary, inference badge, "checked 2 min ago". |
| `ChangeCard` | One changed fact: `fact` label, ~~old value~~ → **new value**, reason chip (Revised / Contradicted / Overtaken), source + date. Expandable. |
| `SourceList` | Favicon, publisher, title, date per source. **Must also render Google Search suggestions** HTML (`renderedContent`) in a sandboxed container when grounded. Never hide it behind a toggle. |
| `SummaryBlock` | TL;DR + 5W rows; streaming text with a soft caret. |
| `Timeline` | Vertical, newest at bottom; article's own event highlighted "You are here". Superseded claims shown struck through on their event. |
| `ExplainerSection` | Heading + body + inline citation chips `[1]` linking to SourceList items. |
| `AskBox` | Single-turn question input, answer card with cited nodes; shows ⚡/☁️; disabled state with reason for guests when cloud is needed. |
| `GraphView` | Story graph (Cytoscape.js). Node shapes: event = circle, claim = rounded square, entity = hexagon. Color by community (max 6 hues, then grey). Click node → side sheet with details. Keyboard: arrows move focus between nodes. |
| `QuotaMeter` | "2 of 3 cloud checks left today" + thin progress bar; links to sign-in for guests. |
| `AccountChip` | Guest: "Guest · Sign in". Member: avatar + menu (Sign out). |
| `OnDeviceSetup` | One-time card: "Enable on-device AI" button (required user gesture), download progress, unsupported-device message with "We'll use the cloud instead". |
| `UpgradePrompt` | Inline card, never a modal: benefit-first copy + "Sign in with Google". |
| `EmptyState` / `ErrorState` | Icon, one sentence, one action. |
| `Skeleton` | For every async block; match final layout height to avoid jumps. |

shadcn/ui primitives allowed: Button, Card, Badge, Tooltip, Popover, Sheet, Tabs, Input, Textarea, Skeleton, Separator, Progress, Toast (sonner).

## 6. Surfaces

### Extension side panel (360–420px wide)
Order, top to bottom:
1. Header: logo mark, `AccountChip`, `QuotaMeter` (compact).
2. `OnDeviceSetup` (only until Nano is ready or marked unsupported).
3. `StatusHero`.
4. Case A: `SummaryBlock` → `SourceList` → Follow button (member) / UpgradePrompt (guest).
   Case B: top 2 `ChangeCard`s → "See all changes" → **Open full explainer** (primary button) → `SourceList`.
   Not news: `SummaryBlock` only + muted note.
5. `AskBox` (collapsed by default).
6. Footer: "⚡ 3 checks ran on this device today" (small, muted).

Rules: no horizontal scroll; everything fits 360px; primary action always visible without scrolling on a 800px-tall window.

### Website
- **Home:** one input ("Paste a news link or text"), example chips with 3 seeded stories, short explainer of how it works (3 steps), install-extension CTA.
- **Result** (`/check/:id`): same structure as side panel, wider (max-w-3xl).
- **Explainer** (`/story/:storyId`): two-column ≥1024px (content max-w-2xl + sticky right rail with Timeline mini-map & sources); single column below. Section order: What changed → Background → Bigger picture → Timeline → Known vs disputed → Glossary → Ask about this story → Story graph.
- **Followed** (`/following`): list of stories with status badge, "updated 2 h ago", unread dot.
- Max content width 72ch for reading text.

## 7. States checklist (every async surface)

loading (skeleton) · success · empty · error (retry) · offline (on-device still works) · guest-limited (UpgradePrompt) · quota reached · global budget reached ("High demand — on-device features still work") · Nano unavailable (cloud fallback notice once).

## 8. Accessibility

- WCAG 2.2 AA contrast for text and status colors on both themes.
- All interactive elements reachable by keyboard; visible focus ring (`ring-2 ring-primary`).
- Status changes announced via `aria-live="polite"`.
- Strikethrough old values also get `aria-label="was 12, now 30"`.
- GraphView has a list alternative ("View as list").
- Hit targets ≥ 32px in side panel, ≥ 40px on web.

## 9. Brand

- Name: **ThreadNews** — one word, capital T and N. Defined once in `packages/shared/config/brand.ts`.
- Idea behind the name: every story is a **thread** of events; we show where your article sits on it and what came after.
- Logo mark: a single thread line running through three dots (past → your article → now), the last dot filled. Monochrome, works at 16px (toolbar icon). Icons at 16/32/48/128 for the extension.
- The thread motif can repeat in the UI: the `Timeline` is drawn as the same line, with "You are here" on the article's dot.
- Primary color = `--primary` blue; status colors are never used for branding.
