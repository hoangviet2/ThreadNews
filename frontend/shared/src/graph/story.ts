import type { StoryBundle } from "../data/story-source";
import type { Change, ClaimDoc } from "../schemas";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "What changed" = superseded claim chains, root (oldest) value → current head (docs/WEBSITE.md "Explainer page"). */
export function storyChanges(b: StoryBundle): Change[] {
  const byId = new Map(b.claims.map((c) => [c.id, c]));
  const targeted = new Set(b.claims.map((c) => c.supersededBy).filter(Boolean));
  const changes: Change[] = [];
  for (const root of b.claims) {
    if (root.status !== "superseded" || !root.supersededBy || targeted.has(root.id)) continue;
    let head: ClaimDoc = root;
    for (let i = 0; i < 20 && head.supersededBy && byId.has(head.supersededBy); i++) head = byId.get(head.supersededBy)!;
    if (head === root) continue;
    const src = b.sources.find((s) => head.sourceIds.includes(s.id));
    changes.push({ fact: cap(root.predicate), oldValue: root.value, newValue: head.value, reason: root.reason ?? "revised", sourceUrl: src?.url, date: head.asOf ?? src?.publishedAt });
  }
  return changes;
}

/** The event the reader's article reported, for "You are here". */
export function articleEventId(b: StoryBundle, articleUrl?: string | null): string | undefined {
  if (!articleUrl) return undefined;
  const src = b.sources.find((s) => s.url === articleUrl);
  if (!src) return undefined;
  // The latest event this source reported on or before its publish date.
  const day = (src.publishedAt ?? "9999").slice(0, 10);
  const mine = [...b.events].filter((e) => e.sourceIds.includes(src.id)).sort((x, y) => x.date.localeCompare(y.date));
  return (mine.filter((e) => e.date <= day).pop() ?? mine[0])?.id;
}
