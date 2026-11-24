/**
 * Parse + diff the packed GraphRAG context (docs/GRAPHRAG.md §4 "Context format").
 *
 *   STORY s_01 "Title" status=moved_on updated=… checked=…
 *   EVENT e1 2026-11-22 "Headline" src=s1,s2
 *   CLAIM c1 [superseded→c3] subject :: predicate = value (asOf 2026-11-22) src=s1 reason=revised
 *   CLAIM c3 [current] subject :: predicate = value (asOf 2026-11-23) src=s2
 *   CLAIM c5 [disputed] subject :: predicate = a | b src=s1|s6
 *   SOURCE s2 Reuters 2026-11-23 "Title" url=https://…
 *
 * `reason=` and `url=` are optional extensions; reason defaults to "revised".
 */
import type { Change, ChangeReason, Claim, Source } from "../schemas";

export type ContextClaim = {
  id: string;
  status: "current" | "superseded" | "disputed";
  supersededBy?: string;
  subject: string;
  predicate: string;
  value: string;
  asOf?: string;
  sourceIds: string[];
  reason?: ChangeReason;
};
export type ContextSource = { id: string; publisher: string; date?: string; title?: string; url?: string };
export type ContextEvent = { id: string; date: string; headline: string; sourceIds: string[] };
export type ParsedContext = {
  story?: { id: string; title: string; status: string };
  events: ContextEvent[];
  claims: ContextClaim[];
  sources: ContextSource[];
};

const CLAIM_RE = /^CLAIM (\S+) \[(current|superseded|disputed)(?:→(\S+?))?\] (.+?) :: (.+?) = (.+?)(?: \(asOf ([^)]+)\))?(?: src=(\S+))?(?: reason=(revised|contradicted|overtaken))?$/;
const SOURCE_RE = /^SOURCE (\S+) (.+?)(?: (\d{4}-\d{2}-\d{2}))?(?: "([^"]*)")?(?: url=(\S+))?$/;
const EVENT_RE = /^EVENT (\S+) (\S+) "([^"]*)"(?: src=(\S+))?/;
const STORY_RE = /^STORY (\S+) "([^"]*)" status=(\S+)/;

export function parseContext(context: string): ParsedContext {
  const out: ParsedContext = { events: [], claims: [], sources: [] };
  for (const raw of context.split("\n")) {
    const line = raw.trim();
    let m: RegExpExecArray | null;
    if ((m = STORY_RE.exec(line))) out.story = { id: m[1]!, title: m[2]!, status: m[3]! };
    else if ((m = EVENT_RE.exec(line))) out.events.push({ id: m[1]!, date: m[2]!, headline: m[3]!, sourceIds: splitIds(m[4]) });
    else if ((m = CLAIM_RE.exec(line)))
      out.claims.push({
        id: m[1]!,
        status: m[2] as ContextClaim["status"],
        supersededBy: m[3],
        subject: m[4]!,
        predicate: m[5]!,
        value: m[6]!,
        asOf: m[7],
        sourceIds: splitIds(m[8]),
        reason: m[9] as ChangeReason | undefined,
      });
    else if ((m = SOURCE_RE.exec(line))) out.sources.push({ id: m[1]!, publisher: m[2]!, date: m[3], title: m[4], url: m[5] });
  }
  return out;
}

const splitIds = (s?: string) => (s ? s.split(/[,|]/).filter(Boolean) : []);

export const slug = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");

/** Identity of a fact across time (docs/architecture/03-data-model.md). */
export const claimKey = (c: { subject: string; predicate: string }) => `${slug(c.subject)}::${slug(c.predicate)}`;

const norm = (v: string) => v.toLowerCase().replace(/[\s,]+/g, " ").replace(/^\$/, "").trim();

/** Follow a supersede chain to its current head. */
function head(claims: ContextClaim[], c: ContextClaim): ContextClaim {
  let cur = c;
  for (let i = 0; i < 20 && cur.supersededBy; i++) {
    const next = claims.find((x) => x.id === cur.supersededBy);
    if (!next) break;
    cur = next;
  }
  return cur;
}

const sourceFor = (ctx: ParsedContext, ids: string[]) => ctx.sources.find((s) => ids.includes(s.id));

function toChange(ctx: ParsedContext, oldValue: string, oldClaim: ContextClaim | undefined, cur: ContextClaim, factLabel: string): Change {
  const src = sourceFor(ctx, cur.sourceIds);
  return {
    fact: factLabel,
    oldValue,
    newValue: cur.value,
    reason: oldClaim?.reason ?? "revised",
    sourceUrl: src?.url,
    date: cur.asOf ?? src?.date,
    citeIds: [cur.id, ...(oldClaim ? [oldClaim.id] : [])],
  };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Deterministic diff, code before Nano (docs/GRAPHRAG.md §4 "On-device graph check").
 * 1. Article claim → claimKey → graph's current value differs ⇒ change.
 * 2. On-device only: a superseded value that appears verbatim in the article text ⇒ change.
 */
export function diffClaims(articleClaims: Claim[], ctx: ParsedContext, articleText?: string): { changes: Change[]; disputed: ContextClaim[] } {
  const changes: Change[] = [];
  const seen = new Set<string>();
  for (const ac of articleClaims) {
    const key = claimKey(ac);
    const matches = ctx.claims.filter((c) => claimKey(c) === key);
    if (!matches.length) continue;
    const cur = head(ctx.claims, matches.find((c) => c.status !== "superseded") ?? matches[0]!);
    if (cur.status === "disputed" || norm(cur.value) === norm(ac.value)) continue;
    const old = matches.find((c) => norm(c.value) === norm(ac.value));
    changes.push(toChange(ctx, ac.value, old, cur, capitalize(ac.predicate)));
    seen.add(key);
  }
  if (articleText) {
    const text = articleText.toLowerCase();
    for (const c of ctx.claims) {
      const key = claimKey(c);
      if (c.status !== "superseded" || seen.has(key)) continue;
      if (!text.includes(c.value.toLowerCase())) continue;
      const cur = head(ctx.claims, c);
      if (cur === c || norm(cur.value) === norm(c.value)) continue;
      changes.push(toChange(ctx, c.value, c, cur, capitalize(c.predicate)));
      seen.add(key);
    }
  }
  return { changes: changes.slice(0, 5), disputed: ctx.claims.filter((c) => c.status === "disputed") };
}

export function contextSources(ctx: ParsedContext): Source[] {
  return ctx.sources.map((s) => ({ url: s.url ?? "", publisher: s.publisher, title: s.title, publishedAt: s.date }));
}
