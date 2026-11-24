import { useStory, type StoryBundle } from "@threadnews/shared";
import { Button, EmptyState, Skeleton } from "@threadnews/shared/ui";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import { ArrowLeft, List, Network, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useParams } from "react-router";
import { Container, usePageTitle } from "../components/site-chrome";

type NodeKind = "story" | "event" | "claim" | "entity";
type GNode = { id: string; kind: NodeKind; label: string; detail: string; community?: string; status?: string };

const HUES = ["#4285F4", "#34A853", "#FBBC04", "#EA4335", "#A142F4", "#24C1E0"];
const SHAPE: Record<NodeKind, string> = { story: "ellipse", event: "ellipse", claim: "round-rectangle", entity: "hexagon" };
/** Concentric rings: story in the middle, then events, facts, people/places. */
const RING: Record<NodeKind, number> = { story: 4, event: 3, claim: 2, entity: 1 };

function toGraph(b: StoryBundle): { nodes: GNode[]; edges: { s: string; t: string; type: string }[] } {
  const nodes: GNode[] = [{ id: b.story.id, kind: "story", label: b.story.title, detail: b.story.summary ?? "", community: b.story.communityId }];
  const edges: { s: string; t: string; type: string }[] = [];
  for (const e of b.events) {
    nodes.push({ id: e.id, kind: "event", label: e.headline, detail: `${e.date} — ${e.headline}`, community: b.story.communityId });
    edges.push({ s: b.story.id, t: e.id, type: "HAS_EVENT" });
  }
  for (const c of b.claims) {
    nodes.push({ id: c.id, kind: "claim", label: `${c.predicate}: ${c.value}`, detail: `${c.subject} — ${c.predicate} = ${c.value}${c.asOf ? ` (as of ${c.asOf})` : ""} · ${c.status}`, community: b.story.communityId, status: c.status });
    if (b.events.some((e) => e.id === c.eventId)) edges.push({ s: c.eventId, t: c.id, type: "ASSERTS" });
    if (c.supersededBy) edges.push({ s: c.supersededBy, t: c.id, type: "SUPERSEDES" });
  }
  for (const n of b.entities) {
    nodes.push({ id: n.id, kind: "entity", label: n.name, detail: `${n.name} (${n.type})${n.description ? ` — ${n.description}` : ""}`, community: n.communityId });
    if (b.story.entityIds.includes(n.id)) edges.push({ s: b.story.id, t: n.id, type: "MENTIONS" });
    const name = n.name.toLowerCase();
    for (const c of b.claims) if (c.subject.toLowerCase().includes(name) || name.includes(c.subject.toLowerCase())) edges.push({ s: c.id, t: n.id, type: "ABOUT" });
    for (const e of b.events) if (e.headline.toLowerCase().includes(name)) edges.push({ s: e.id, t: n.id, type: "INVOLVES" });
  }
  return { nodes, edges };
}

/** Story graph: event = circle, claim = rounded square, entity = hexagon, color by community (DESIGN.md §5 GraphView). */
export default function StoryGraphPage() {
  const { storyId } = useParams();
  const story = useStory(storyId);
  const [asList, setAsList] = useState(false);
  const [selected, setSelected] = useState<GNode | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const cy = useRef<Core | null>(null);
  const graph = useMemo(() => (story.data ? toGraph(story.data) : null), [story.data]);
  usePageTitle(story.data ? `Story map: ${story.data.story.title}` : "Story map");

  useEffect(() => {
    if (!graph || asList || !box.current) return;
    const communities = [...new Set(graph.nodes.map((n) => n.community).filter(Boolean))];
    const color = (c?: string) => (c && communities.indexOf(c) < 6 ? HUES[communities.indexOf(c)]! : "#9AA0A6");
    const css = getComputedStyle(document.documentElement);
    const fg = css.getPropertyValue("--tn-fg").trim() || "#202124";
    const line = css.getPropertyValue("--tn-border").trim() || "#DADCE0";
    const bg = css.getPropertyValue("--tn-surface-2").trim() || "#F8F9FA";
    const elements: ElementDefinition[] = [
      ...graph.nodes.map((n) => ({ data: { id: n.id, label: n.label.length > 32 ? `${n.label.slice(0, 30)}…` : n.label, color: n.status === "superseded" ? "#9AA0A6" : color(n.community), shape: SHAPE[n.kind], kind: n.kind, status: n.status ?? "" } })),
      ...graph.edges.map((e, i) => ({ data: { id: `x${i}`, source: e.s, target: e.t, type: e.type } })),
    ];
    const inst = cytoscape({
      container: box.current,
      elements,
      layout: { name: "concentric", animate: false, padding: 40, minNodeSpacing: 56, startAngle: (3 / 2) * Math.PI, concentric: (n: cytoscape.NodeSingular) => RING[n.data("kind") as NodeKind], levelWidth: () => 1 } as cytoscape.LayoutOptions,
      style: [
        { selector: "node", style: { "background-color": "data(color)", shape: "data(shape)" as never, label: "data(label)", color: fg, "font-size": 11, "font-family": "Inter Variable, Inter, sans-serif", "text-valign": "bottom", "text-margin-y": 4, "text-wrap": "wrap", "text-max-width": "110px", "text-background-color": bg, "text-background-opacity": 0.9, "text-background-padding": "2px", "min-zoomed-font-size": 8, width: 22, height: 22 } },
        { selector: 'node[kind = "story"]', style: { width: 36, height: 36, "font-weight": "bold" } },
        { selector: 'node[status = "superseded"]', style: { "border-width": 2, "border-style": "dashed", "border-color": "#5F6368" } },
        { selector: 'node[status = "disputed"]', style: { "border-width": 3, "border-color": "#C5221F" } },
        { selector: "edge", style: { width: 1.5, "line-color": line, "curve-style": "bezier" } },
        { selector: 'edge[type = "MENTIONS"]', style: { "line-style": "dotted", opacity: 0.6 } },
        { selector: 'edge[type = "SUPERSEDES"]', style: { "line-style": "dashed", "target-arrow-shape": "triangle", "target-arrow-color": line } },
        { selector: "node:selected", style: { "border-width": 4, "border-color": "#1A73E8" } },
      ],
    });
    inst.on("tap", "node", (ev) => setSelected(graph.nodes.find((n) => n.id === ev.target.id()) ?? null));
    cy.current = inst;
    return () => {
      inst.destroy();
      cy.current = null;
    };
  }, [graph, asList]);

  // Keyboard: arrows move focus between nodes, Enter opens details, Esc closes.
  const [focusIdx, setFocusIdx] = useState(0);
  const onKey = (e: KeyboardEvent) => {
    if (!graph) return;
    if (e.key === "Escape") return setSelected(null);
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (delta) {
      e.preventDefault();
      const next = (focusIdx + delta + graph.nodes.length) % graph.nodes.length;
      setFocusIdx(next);
      cy.current?.elements().unselect();
      cy.current?.getElementById(graph.nodes[next]!.id).select();
    } else if (e.key === "Enter") setSelected(graph.nodes[focusIdx] ?? null);
  };

  if (story.isLoading)
    return (
      <Container className="py-8">
        <Skeleton className="h-[520px] rounded-2xl" />
      </Container>
    );
  if (!graph || !story.data)
    return (
      <Container className="py-10">
        <EmptyState icon={Network}>We don't know this story yet.</EmptyState>
      </Container>
    );

  return (
    <Container className="flex flex-col gap-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link to={`/story/${story.data.story.id}`} className="inline-flex items-center gap-1 text-sm no-underline">
            <ArrowLeft size={14} aria-hidden /> Back to the story
          </Link>
          <h1 className="m-0 text-2xl font-bold">Story map</h1>
        </div>
        <Button variant="quiet" size="sm" aria-pressed={asList} onClick={() => (setAsList((v) => !v), setSelected(null))}>
          {asList ? <Network size={16} aria-hidden /> : <List size={16} aria-hidden />}
          {asList ? "View as map" : "View as list"}
        </Button>
      </div>
      <p className="m-0 text-sm text-muted">
        Circles are events, rounded squares are facts, hexagons are people, places and organizations. Dashed facts were replaced by newer reports.
      </p>

      <div className="relative">
        {asList ? (
          <div className="grid gap-6 sm:grid-cols-3">
            {(["event", "claim", "entity"] as const).map((k) => (
              <section key={k} className="flex flex-col gap-2">
                <h2 className="m-0 text-sm font-semibold">{k === "event" ? "Events" : k === "claim" ? "Facts" : "People, places and organizations"}</h2>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
                  {graph.nodes
                    .filter((n) => n.kind === k)
                    .map((n) => (
                      <li key={n.id} className={n.status === "superseded" ? "text-muted line-through" : undefined}>
                        {n.detail}
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <div
            ref={box}
            tabIndex={0}
            role="application"
            aria-label="Story map. Use arrow keys to move between nodes and Enter to open details."
            onKeyDown={onKey}
            className="h-[560px] w-full rounded-2xl border border-line bg-surface-2 max-sm:h-[420px]"
          />
        )}
        {selected && !asList && (
          <aside aria-label="Node details" className="absolute top-3 right-3 flex w-72 max-w-[calc(100%-24px)] flex-col gap-2 rounded-xl border border-line bg-bg p-4 shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-semibold text-muted uppercase">{selected.kind === "claim" ? "Fact" : selected.kind}</span>
              <button type="button" aria-label="Close details" onClick={() => setSelected(null)} className="-m-1 inline-flex size-8 items-center justify-center rounded-full hover:bg-surface">
                <X size={16} aria-hidden />
              </button>
            </div>
            <p className="m-0 text-sm text-fg">{selected.detail}</p>
          </aside>
        )}
      </div>
    </Container>
  );
}
