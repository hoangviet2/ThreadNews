import { estimateTokens } from "../ai/budget";
import type { DemoStory } from "./data";

/** Pack a story subgraph into the GraphRAG context format (docs/GRAPHRAG.md §4). */
export function buildContext(d: DemoStory, budget: "device" | "cloud"): { context: string; nodeIds: string[]; tokenEstimate: number } {
  const maxTokens = budget === "device" ? 1500 : 8000;
  const { story, events, claims, sources, entities } = d;
  const lines: [string, string][] = [
    [story.id, `STORY ${story.id} "${story.title}" status=${story.status} updated=${story.lastUpdatedAt.slice(0, 16)}Z checked=${(story.lastCheckedAt ?? "").slice(0, 16)}Z`],
    ...[...events].sort((a, b) => a.date.localeCompare(b.date)).map((e): [string, string] => [e.id, `EVENT ${e.id} ${e.date} "${e.headline}" src=${e.sourceIds.join(",")}`]),
    ...claims.map((c): [string, string] => {
      const tag = c.status === "superseded" ? `superseded→${c.supersededBy}` : c.status;
      const src = c.status === "disputed" ? c.sourceIds.join("|") : c.sourceIds.join(",");
      return [c.id, `CLAIM ${c.id} [${tag}] ${c.subject} :: ${c.predicate} = ${c.value}${c.asOf ? ` (asOf ${c.asOf})` : ""} src=${src}${c.reason ? ` reason=${c.reason}` : ""}`];
    }),
    ...entities.map((n): [string, string] => [n.id, `ENTITY ${n.id} ${n.type} "${n.name}" — ${n.description ?? ""}`]),
    ...sources.map((s): [string, string] => [s.id, `SOURCE ${s.id} ${s.publisher} ${(s.publishedAt ?? "").slice(0, 10)} "${s.title ?? ""}" url=${s.url}`]),
  ];
  const out: string[] = [];
  const nodeIds: string[] = [];
  for (const [id, line] of lines) {
    if (estimateTokens([...out, line].join("\n")) > maxTokens) break;
    out.push(line);
    nodeIds.push(id);
  }
  const context = out.join("\n");
  return { context, nodeIds, tokenEstimate: estimateTokens(context) };
}
