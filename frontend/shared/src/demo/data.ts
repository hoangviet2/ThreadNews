/**
 * Fictional seed stories for demo mode (no API / Firebase configured) and the example chips.
 * Outlets and places are invented; URLs use the reserved `.example` TLD.
 * Dates are relative to "now" so freshness and "2 h ago" labels stay meaningful.
 */
import type { Claim, ClaimDoc, EntityDoc, EventDoc, Explainer, Grounding, SourceDoc, Status, StoryDoc } from "../schemas";

const at = (daysAgo: number, hour = 9, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() > Date.now()) d.setTime(Date.now() - 2 * 3_600_000);
  return d.toISOString();
};
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const day = (iso: string) => iso.slice(0, 10);

export type DemoStory = {
  story: StoryDoc;
  events: EventDoc[];
  claims: ClaimDoc[];
  sources: SourceDoc[];
  entities: EntityDoc[];
  /** The older article a reader would have open. Text stays on the device. */
  article: { url: string; title: string; publisher: string; publishedAt: string; text: string; claims: Claim[]; entities: string[] };
  keywords: string[];
  checkSummary: string;
  grounding: Grounding;
  explainer: Omit<Explainer, "usage">;
  explainerReadyByDefault: boolean;
  community: { id: string; title: string; summary: string };
  chipColor: string;
};

const suggestions = (queries: string[]) => `<style>
:root{color-scheme:light dark}
body{margin:0;font:13px/1.4 Inter,system-ui,sans-serif}
.container{display:flex;flex-wrap:nowrap;overflow-x:auto;gap:6px;padding:2px;scrollbar-width:thin}
.chip{flex:none;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;border:1px solid #DADCE0;border-radius:999px;padding:5px 12px;color:#202124;text-decoration:none;background:#fff}
.chip:hover{background:#F1F3F4}
.g{font-weight:700;color:#4285F4}
@media (prefers-color-scheme:dark){.chip{background:#202124;color:#E8EAED;border-color:#5F6368}.chip:hover{background:#303134}}
</style><div class="container">${queries
  .map((q) => `<a class="chip" target="_blank" rel="noopener" href="https://www.google.com/search?q=${encodeURIComponent(q)}"><span class="g">G</span>${q}</a>`)
  .join("")}</div>`;

function harbor(): DemoStory {
  const s = {
    dispatch: { id: "s1", url: "https://coastdispatch.example/2026/harbor-bridge-reopening-june-10", publisher: "Coast Dispatch", title: "Harbor Bridge reopening pushed to June 10 as repair cost climbs to $11M", publishedAt: at(0, 7, 40) },
    dot: { id: "s2", url: "https://transportation.state.example/news/harbor-bridge-repair-update", publisher: "State Transportation Dept.", title: "Harbor Bridge repair update", publishedAt: at(1, 16, 0) },
    ledger: { id: "s3", url: "https://rivertonledger.example/news/harbor-bridge-to-reopen-march-3", publisher: "Riverton Ledger", title: "Harbor Bridge to reopen March 3 after $4M repair", publishedAt: at(3, 9, 0) },
    courier: { id: "s4", url: "https://valleycourier.example/regional-bridge-repairs-fall-behind", publisher: "Valley Courier", title: "Regional bridge repairs fall behind schedule", publishedAt: at(4, 11, 0) },
    times: { id: "s5", url: "https://harbortimes.example/ferry-to-run-until-bridge-reopens", publisher: "Harbor Times", title: "Ferry to run until the bridge reopens", publishedAt: at(0, 6, 15) },
  };
  const sources: SourceDoc[] = Object.values(s).map((x) => ({ ...x, storyId: "harbor-bridge" }));
  const claim = (c: Omit<ClaimDoc, "storyId" | "claimKey">): ClaimDoc => ({
    ...c,
    storyId: "harbor-bridge",
    claimKey: `${c.subject}::${c.predicate}`.toLowerCase().replace(/[^a-z0-9:]+/g, "-"),
  });
  return {
    story: {
      id: "harbor-bridge",
      title: "Harbor Bridge repairs: reopening delayed to June",
      summary: "Repairs to the Harbor Bridge will take longer and cost more than first planned. The state now expects it to reopen on June 10.",
      status: "moved_on",
      lastUpdatedAt: s.dispatch.publishedAt,
      lastCheckedAt: minutesAgo(20),
      followerCount: 14,
      communityId: "comm-bridges",
      entityIds: ["n1", "n2", "n3", "n4", "n5", "n6"],
    },
    events: [
      { id: "e1", storyId: "harbor-bridge", date: day(at(5)), headline: "Bridge closes after cracked welds are found", sourceIds: ["s3"] },
      { id: "e2", storyId: "harbor-bridge", date: day(s.ledger.publishedAt), headline: "City says the bridge will reopen March 3 after a $4M repair", sourceIds: ["s3"] },
      { id: "e3", storyId: "harbor-bridge", date: day(s.dot.publishedAt), headline: "State survey finds more corrosion; cost raised to $11M", sourceIds: ["s2"] },
      { id: "e4", storyId: "harbor-bridge", date: day(s.dispatch.publishedAt), headline: "Reopening moved to June 10", sourceIds: ["s1", "s5"] },
    ],
    claims: [
      claim({ id: "c1", eventId: "e2", subject: "Harbor Bridge", predicate: "reopening date", value: "March 3", asOf: day(s.ledger.publishedAt), status: "superseded", supersededBy: "c3", reason: "revised", sourceIds: ["s3"] }),
      claim({ id: "c3", eventId: "e4", subject: "Harbor Bridge", predicate: "reopening date", value: "June 10", asOf: day(s.dispatch.publishedAt), status: "current", sourceIds: ["s1", "s5"] }),
      claim({ id: "c2", eventId: "e2", subject: "Harbor Bridge", predicate: "repair cost", value: "$4M", asOf: day(s.ledger.publishedAt), status: "superseded", supersededBy: "c4", reason: "revised", sourceIds: ["s3"] }),
      claim({ id: "c4", eventId: "e3", subject: "Harbor Bridge", predicate: "repair cost", value: "$11M", asOf: day(s.dot.publishedAt), status: "current", sourceIds: ["s2"] }),
      claim({ id: "c5", eventId: "e1", subject: "Harbor Bridge", predicate: "closure cause", value: "cracked welds", asOf: day(at(5)), status: "current", sourceIds: ["s3"] }),
      claim({ id: "c6", eventId: "e4", subject: "Coast ferry", predicate: "weekday frequency", value: "every 30 minutes", asOf: day(s.times.publishedAt), status: "current", sourceIds: ["s5"] }),
      claim({ id: "c7", eventId: "e3", subject: "Harbor Bridge", predicate: "damage flagged in earlier inspection", value: "yes | no", status: "disputed", sourceIds: ["s4", "s2"] }),
    ],
    sources,
    entities: [
      { id: "n1", name: "Harbor Bridge", type: "thing", description: "Road bridge across Riverton harbor.", communityId: "comm-bridges" },
      { id: "n2", name: "State Transportation Dept.", type: "org", description: "State agency now running the repair.", communityId: "comm-bridges" },
      { id: "n3", name: "Riverton city council", type: "org", description: "City government that announced the first schedule." },
      { id: "n4", name: "Riverton", type: "place", description: "Coastal city served by the bridge." },
      { id: "n5", name: "Coast Ferry Service", type: "org", description: "Runs the temporary ferry during the closure." },
      { id: "n6", name: "Riverton harbor", type: "place", description: "Harbor crossed by the bridge." },
    ],
    article: {
      url: s.ledger.url,
      title: s.ledger.title,
      publisher: s.ledger.publisher,
      publishedAt: s.ledger.publishedAt,
      text: `The Harbor Bridge will reopen on March 3 after a $4M repair, city officials said on Thursday.

The bridge closed last week after a routine inspection found cracked welds on two support beams. Riverton city council approved emergency funding for the work at a special meeting.

"We expect traffic back on the bridge by March 3," the city's public works director said. A temporary ferry will run every 30 minutes on weekdays until then.

Drivers are being directed to the north crossing, which adds about 20 minutes to most trips.`,
      claims: [
        { subject: "Harbor Bridge", predicate: "reopening date", value: "March 3" },
        { subject: "Harbor Bridge", predicate: "repair cost", value: "$4M" },
        { subject: "Harbor Bridge", predicate: "closure cause", value: "cracked welds" },
      ],
      entities: ["Harbor Bridge", "Riverton city council", "Riverton"],
    },
    keywords: ["harbor", "bridge", "riverton", "reopen", "reopening", "repair", "welds", "ferry", "corrosion"],
    checkSummary: "The state pushed the reopening to June 10 and raised the repair cost to $11M.",
    grounding: {
      searchEntryPointHtml: suggestions(["harbor bridge reopening date", "riverton bridge repair cost"]),
      chunks: [s.dispatch, s.dot, s.ledger, s.times].map((x) => ({ uri: x.url, title: x.publisher })),
      supports: [],
    },
    explainer: {
      storyId: "harbor-bridge",
      generatedAt: minutesAgo(90),
      basedOnEventId: "e4",
      stale: false,
      sections: [
        { id: "what_changed", title: "What changed since your article", body: "The state now expects the bridge to reopen on June 10, not March 3. The repair budget rose from $4M to $11M after a deeper survey.", citations: [0, 1] },
        {
          id: "background",
          title: "Background",
          body: "The Harbor Bridge closed after a routine inspection found cracked welds on two support beams. The city first planned a short repair. A deeper survey then found more corrosion than expected, so the state took over the work and set a new schedule.",
          citations: [1, 2],
        },
        {
          id: "bigger_picture",
          title: "The bigger picture",
          topic: "Aging bridges in the region",
          body: "This is the third bridge in the region with repairs extended this year. In each case, inspections found more corrosion than first reported, and schedules moved by several months.",
          citations: [3],
        },
        {
          id: "known_disputed",
          title: "What's known and what's disputed",
          items: [
            { text: "The bridge stays closed to all traffic until repairs finish.", state: "known" },
            { text: "A temporary ferry runs every 30 minutes on weekdays.", state: "known" },
            { text: "Whether the damage was flagged in an earlier inspection — the city and the contractor give different accounts.", state: "disputed" },
          ],
        },
        {
          id: "glossary",
          title: "Glossary",
          items: [
            { term: "Corrosion", definition: "Damage to metal caused by water and air over time — rust, in steel." },
            { term: "Weld", definition: "A joint where two metal parts are melted together." },
            { term: "Support beam", definition: "A main horizontal part that carries the weight of the road deck." },
          ],
        },
      ],
      grounding: {
        searchEntryPointHtml: suggestions(["harbor bridge reopening date", "riverton ferry schedule"]),
        chunks: [s.dispatch, s.dot, s.ledger, s.courier].map((x) => ({ uri: x.url, title: x.publisher })),
        supports: [],
      },
    },
    explainerReadyByDefault: true,
    community: {
      id: "comm-bridges",
      title: "Aging bridges in the region",
      summary: "Three bridges in the region had repairs extended this year after inspections found more corrosion than first reported. The state took over two of the projects.",
    },
    chipColor: "#FBBC04",
  };
}

function library(): DemoStory {
  const src = [
    { id: "s1", url: "https://rivertonledger.example/news/library-expansion-approved", publisher: "Riverton Ledger", title: "Riverton library expansion approved; new wing to open in fall 2027", publishedAt: at(2, 18, 30) },
    { id: "s2", url: "https://coastdispatch.example/2026/library-contract-awarded", publisher: "Coast Dispatch", title: "Builder chosen for Riverton library wing", publishedAt: at(1, 12, 10) },
    { id: "s3", url: "https://riverton.city.example/council/minutes-library", publisher: "Riverton city council", title: "Council minutes: library expansion vote", publishedAt: at(2, 21, 0) },
  ];
  const ck = (p: string) => `riverton-library::${p.replace(/\s+/g, "-")}`;
  return {
    story: {
      id: "riverton-library",
      title: "Riverton library expansion",
      summary: "The city approved an $18M wing for the main library, due to open in fall 2027.",
      status: "current",
      lastUpdatedAt: src[1]!.publishedAt,
      lastCheckedAt: minutesAgo(45),
      followerCount: 3,
      entityIds: ["n1", "n2", "n3"],
    },
    events: [
      { id: "e1", storyId: "riverton-library", date: day(src[0]!.publishedAt), headline: "Council approves $18M library wing", sourceIds: ["s1", "s3"] },
      { id: "e2", storyId: "riverton-library", date: day(src[1]!.publishedAt), headline: "Builder chosen; schedule unchanged", sourceIds: ["s2"] },
    ],
    claims: [
      { id: "c1", storyId: "riverton-library", eventId: "e1", claimKey: ck("budget"), subject: "Riverton library", predicate: "budget", value: "$18M", status: "current", sourceIds: ["s1", "s2", "s3"] },
      { id: "c2", storyId: "riverton-library", eventId: "e1", claimKey: ck("opening date"), subject: "Riverton library", predicate: "opening date", value: "fall 2027", status: "current", sourceIds: ["s1", "s2"] },
      { id: "c3", storyId: "riverton-library", eventId: "e1", claimKey: ck("new wing size"), subject: "Riverton library", predicate: "new wing size", value: "12,000 square feet", status: "current", sourceIds: ["s1"] },
    ],
    sources: src.map((x) => ({ ...x, storyId: "riverton-library" })),
    entities: [
      { id: "n1", name: "Riverton Public Library", type: "org", description: "The city's main library." },
      { id: "n2", name: "Riverton city council", type: "org", description: "Approved the expansion." },
      { id: "n3", name: "Riverton", type: "place", description: "Coastal city." },
    ],
    article: {
      url: src[0]!.url,
      title: src[0]!.title,
      publisher: src[0]!.publisher,
      publishedAt: src[0]!.publishedAt,
      text: `Riverton city council voted 6-1 on Tuesday to approve an $18M expansion of the main library.

The new wing will add 12,000 square feet, including a children's floor and study rooms. Construction is expected to start in the spring, and the wing should open in fall 2027.

Council members said the project is funded by a state grant and a bond approved by voters last year.`,
      claims: [
        { subject: "Riverton library", predicate: "budget", value: "$18M" },
        { subject: "Riverton library", predicate: "opening date", value: "fall 2027" },
        { subject: "Riverton library", predicate: "new wing size", value: "12,000 square feet" },
      ],
      entities: ["Riverton city council", "Riverton Public Library"],
    },
    keywords: ["riverton", "library", "expansion", "wing", "council"],
    checkSummary: "No major changes since this was published.",
    grounding: { searchEntryPointHtml: suggestions(["riverton library expansion"]), chunks: src.map((x) => ({ uri: x.url, title: x.publisher })), supports: [] },
    explainer: {
      storyId: "riverton-library",
      generatedAt: minutesAgo(5),
      basedOnEventId: "e2",
      stale: false,
      sections: [
        { id: "what_changed", title: "What changed since your article", body: "Nothing material. A builder was chosen, and the city says the budget and the fall 2027 opening are unchanged.", citations: [1] },
        { id: "background", title: "Background", body: "The main library has outgrown its building. Voters approved a bond for the project last year, and a state grant covers the rest.", citations: [0, 2] },
        { id: "bigger_picture", title: "The bigger picture", body: "Several cities in the region are expanding libraries as community spaces, adding study rooms and children's areas.", citations: [] },
        { id: "known_disputed", title: "What's known and what's disputed", items: [{ text: "The wing is budgeted at $18M and planned to open in fall 2027.", state: "known" }] },
        { id: "glossary", title: "Glossary", items: [{ term: "Bond", definition: "Money a city borrows and repays over time, often approved by voters." }] },
      ],
      grounding: { searchEntryPointHtml: suggestions(["riverton library expansion"]), chunks: src.map((x) => ({ uri: x.url, title: x.publisher })), supports: [] },
    },
    explainerReadyByDefault: false,
    community: { id: "comm-civic", title: "Riverton civic projects", summary: "Riverton has three major civic projects under way: the library wing, a harbor walkway and a new fire station." },
    chipColor: "#34A853",
  };
}

function flood(): DemoStory {
  const src = [
    { id: "s1", url: "https://valleycourier.example/flood-damage-estimated-40m", publisher: "Valley Courier", title: "Valley flood damage estimated at $40M", publishedAt: at(3, 15, 0) },
    { id: "s2", url: "https://emergency.state.example/valley-flood-assessment", publisher: "State Emergency Office", title: "Valley flood assessment", publishedAt: at(1, 10, 0) },
    { id: "s3", url: "https://countyherald.example/county-stands-by-flood-estimate", publisher: "County Herald", title: "County stands by its flood estimate", publishedAt: at(1, 17, 30) },
  ];
  const ck = (p: string) => `valley-flood::${p.replace(/\s+/g, "-")}`;
  return {
    story: {
      id: "valley-flood",
      title: "Valley flood damage estimate",
      summary: "County and state estimates of the flood damage differ: $40M versus $65M.",
      status: "disputed",
      lastUpdatedAt: src[2]!.publishedAt,
      lastCheckedAt: at(2, 8, 0),
      followerCount: 6,
      entityIds: ["n1", "n2", "n3"],
    },
    events: [
      { id: "e1", storyId: "valley-flood", date: day(src[0]!.publishedAt), headline: "County estimates flood damage at $40M", sourceIds: ["s1"] },
      { id: "e2", storyId: "valley-flood", date: day(src[1]!.publishedAt), headline: "State assessment puts damage at $65M", sourceIds: ["s2"] },
      { id: "e3", storyId: "valley-flood", date: day(src[2]!.publishedAt), headline: "County stands by its estimate", sourceIds: ["s3"] },
    ],
    claims: [
      { id: "c1", storyId: "valley-flood", eventId: "e2", claimKey: ck("damage estimate"), subject: "Valley flood", predicate: "damage estimate", value: "$40M | $65M", status: "disputed", sourceIds: ["s1", "s3", "s2"] },
      { id: "c2", storyId: "valley-flood", eventId: "e1", claimKey: ck("homes damaged"), subject: "Valley flood", predicate: "homes damaged", value: "300", status: "current", sourceIds: ["s1", "s2"] },
    ],
    sources: src.map((x) => ({ ...x, storyId: "valley-flood" })),
    entities: [
      { id: "n1", name: "Valley County", type: "place", description: "County hit by the flood." },
      { id: "n2", name: "State Emergency Office", type: "org", description: "Published the state assessment." },
      { id: "n3", name: "Mill River", type: "place", description: "River that flooded." },
    ],
    article: {
      url: src[0]!.url,
      title: src[0]!.title,
      publisher: src[0]!.publisher,
      publishedAt: src[0]!.publishedAt,
      text: `Damage from last week's flood in Valley County is estimated at $40M, county officials said on Monday.

About 300 homes were damaged when the Mill River rose over its banks. The county has asked the state for emergency aid.

Officials said the estimate could change as inspectors reach the hardest-hit areas.`,
      claims: [
        { subject: "Valley flood", predicate: "damage estimate", value: "$40M" },
        { subject: "Valley flood", predicate: "homes damaged", value: "300" },
      ],
      entities: ["Valley County", "Mill River"],
    },
    keywords: ["valley", "flood", "county", "damage", "mill", "river", "estimate"],
    checkSummary: "County and state estimates of the damage differ: $40M versus $65M.",
    grounding: { searchEntryPointHtml: suggestions(["valley flood damage estimate", "valley county flood aid"]), chunks: src.map((x) => ({ uri: x.url, title: x.publisher })), supports: [] },
    explainer: {
      storyId: "valley-flood",
      generatedAt: at(1, 18, 0),
      basedOnEventId: "e3",
      stale: false,
      sections: [
        { id: "what_changed", title: "What changed since your article", body: "The state published its own assessment putting damage at $65M. The county stands by its $40M figure.", citations: [1, 2] },
        { id: "background", title: "Background", body: "The Mill River flooded after three days of heavy rain. About 300 homes were damaged.", citations: [0] },
        { id: "bigger_picture", title: "The bigger picture", body: "Early damage estimates after floods often change as inspectors reach more areas, and agencies count different costs.", citations: [] },
        {
          id: "known_disputed",
          title: "What's known and what's disputed",
          items: [
            { text: "About 300 homes were damaged.", state: "known" },
            { text: "The total cost of the damage — the county says $40M, the state says $65M.", state: "disputed" },
          ],
        },
        { id: "glossary", title: "Glossary", items: [{ term: "Damage assessment", definition: "An official count of what was destroyed and what it costs to fix." }] },
      ],
      grounding: { searchEntryPointHtml: suggestions(["valley flood damage estimate"]), chunks: src.map((x) => ({ uri: x.url, title: x.publisher })), supports: [] },
    },
    explainerReadyByDefault: true,
    community: { id: "comm-weather", title: "Severe weather in the valley", summary: "Two floods and a windstorm hit the valley this autumn. Damage estimates for each were revised as inspections continued." },
    chipColor: "#EA4335",
  };
}

let cache: DemoStory[] | undefined;
export const demoStories = (): DemoStory[] => (cache ??= [harbor(), library(), flood()]);
export const demoStory = (id: string) => demoStories().find((d) => d.story.id === id);

export const STATUS_ORDER: Status[] = ["moved_on", "disputed", "current", "not_news"];
