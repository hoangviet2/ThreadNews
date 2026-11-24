/**
 * Deterministic fallbacks used when AI Logic isn't configured or fails (no Firebase config,
 * cloud fallback rate-limited, …). Runs on the device; the article never leaves the browser.
 * ponytail: regex-grade NLP, only a safety net — Nano / the cloud model are the real path.
 */
import type { AskAnswer, Claim, GatekeeperResult } from "../schemas";
import type { ParsedContext } from "../graph/context";

const sentences = (text: string) =>
  text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z"“])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

const VALUE_RE = /(\$\s?\d[\d,.]*\s?(?:million|billion|M|B|bn|k)?|\d[\d,.]*\s?(?:%|percent|people|dead|injured|million|billion)|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}(?:, \d{4})?|\b\d{4}-\d{2}-\d{2}\b|\b\d[\d,.]+\b)/;
const STOP = new Set(["The", "A", "An", "In", "On", "At", "But", "And", "It", "He", "She", "They", "This", "That", "We", "I", "As", "If", "For", "Of"]);

export function heuristicEntities(text: string): string[] {
  const counts = new Map<string, number>();
  for (const m of text.matchAll(/(?<![.!?]\s)\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g)) {
    const name = m[1]!;
    if (STOP.has(name)) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n]) => n);
}

export function heuristicClaims(title: string, text: string): Claim[] {
  const out: Claim[] = [];
  for (const s of [title, ...sentences(text)]) {
    const m = VALUE_RE.exec(s);
    if (!m || m.index === undefined) continue;
    const before = s.slice(0, m.index).replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim().split(/\s+/);
    const predicate = before.slice(-4).join(" ").toLowerCase();
    if (predicate.length < 3) continue;
    out.push({ subject: (heuristicEntities(s)[0] ?? title).slice(0, 120), predicate: predicate.slice(0, 120), value: m[1]!.trim() });
    if (out.length >= 8) break;
  }
  return out;
}

export function heuristicGatekeeper(p: { title: string; text: string; isProbablyArticle?: boolean }): GatekeeperResult {
  const claims = heuristicClaims(p.title, p.text);
  const isNews = p.isProbablyArticle ?? p.text.length > 280;
  const timeSensitive = claims.length > 0;
  return {
    isNews,
    timeSensitive,
    needsCheck: isNews && timeSensitive,
    topic: p.title.split(/\s+/).slice(0, 8).join(" "),
    claims,
    entities: heuristicEntities(`${p.title}. ${p.text}`),
    reason: isNews ? (timeSensitive ? "Contains numbers or dates that later reports could change." : "No checkable facts found.") : "Doesn't look like a news report.",
  };
}

export function heuristicSummary(text: string): string {
  return sentences(text).slice(0, 2).join(" ") || text.slice(0, 280);
}

export function heuristicAskRoute(question: string): "local" | "global" {
  return /\b(why|pattern|trend|compare|comparison|other|region|elsewhere|bigger|history|keep happening|usually)\b/i.test(question) ? "global" : "local";
}

const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);

export function heuristicAskLocal(question: string, ctx: ParsedContext): AskAnswer {
  const q = words(question);
  const candidates = [
    ...ctx.claims.filter((c) => c.status !== "superseded").map((c) => ({ id: c.id, text: `${c.subject} — ${c.predicate}: ${c.value}${c.asOf ? ` (as of ${c.asOf})` : ""}.` })),
    ...ctx.events.map((e) => ({ id: e.id, text: `${e.date}: ${e.headline}.` })),
  ];
  let best: { id: string; text: string; score: number } | undefined;
  for (const c of candidates) {
    const w = words(c.text);
    const score = [...q].filter((x) => w.has(x)).length;
    if (score > (best?.score ?? 0)) best = { ...c, score };
  }
  if (!best || best.score < 1) return { answer: "I don't know from what we have.", citations: [], confident: false };
  return { answer: `From what we have: ${best.text}`, citations: [best.id], confident: best.score >= 2 };
}
