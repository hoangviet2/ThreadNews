import {
  articleEventId,
  formatDate,
  formatDateTime,
  storyChanges,
  useAuth,
  useExplainer,
  usePlatform,
  useStory,
  type Explainer,
  type ExplainerSection,
  type Source,
} from "@threadnews/shared";
import {
  AskBox,
  Button,
  ChangeCard,
  EmptyState,
  ErrorState,
  FollowButton,
  MEMBER_BENEFITS,
  Pill,
  Skeleton,
  SourceList,
  StatusBadge,
  Timeline,
  UpgradePrompt,
} from "@threadnews/shared/ui";
import { CloudOff, Network, Share2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { Container, usePageTitle } from "../components/site-chrome";

function Cites({ ids }: { ids: number[] }) {
  if (!ids.length) return null;
  return (
    <>
      {ids.map((i) => (
        <a key={i} href={`#source-${i}`} className="tnum ml-1 text-[0.85em] no-underline hover:underline" aria-label={`Source ${i + 1}`}>
          [{i + 1}]
        </a>
      ))}
    </>
  );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-2xl font-bold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

const Body = ({ children }: { children: ReactNode }) => <p className="m-0 max-w-[68ch] text-[17px] leading-[1.65] text-fg-2">{children}</p>;

function section<T extends ExplainerSection["id"]>(e: Explainer | undefined, id: T) {
  return e?.sections.find((s): s is Extract<ExplainerSection, { id: T }> => s.id === id);
}

export function StoryPage() {
  const { storyId } = useParams();
  const [params] = useSearchParams();
  const articleUrl = params.get("u");
  const { config } = usePlatform();
  const { tier } = useAuth();
  const story = useStory(storyId);
  const explainer = useExplainer(storyId);
  const [shared, setShared] = useState<string | null>(null);
  usePageTitle(story.data?.story.title ?? "Story");

  if (story.isLoading || (!story.data && story.fetchStatus === "fetching"))
    return (
      <Container className="flex flex-col gap-4 py-10" >
        <Skeleton className="h-7 w-40 rounded-full" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      </Container>
    );
  if (story.isError)
    return (
      <Container className="py-10">
        <ErrorState icon={CloudOff} onRetry={() => void story.refetch()}>
          Couldn't load this story. Check your connection and try again.
        </ErrorState>
      </Container>
    );
  if (!story.data)
    return (
      <Container className="py-10">
        <EmptyState icon={Network} action={<Link to="/">Check an article</Link>}>
          We don't know this story yet.
        </EmptyState>
      </Container>
    );

  const b = story.data;
  const e = explainer.data;
  const changes = storyChanges(b);
  const you = articleUrl ? b.sources.find((s) => s.url === articleUrl) : undefined;

  // Rail order: grounding chunks first so explainer citation indices line up, then graph sources.
  const rail: Source[] = [];
  for (const c of e?.grounding?.chunks ?? []) rail.push({ url: c.uri, publisher: c.title, ...(b.sources.find((s) => s.url === c.uri) ?? {}) });
  for (const s of b.sources) if (!rail.some((r) => r.url === s.url)) rail.push(s);
  const railIndex = (url?: string) => (url ? rail.findIndex((r) => r.url === url) : -1);

  const share = async () => {
    const url = `${location.origin}/story/${b.story.id}`;
    try {
      if (navigator.share) await navigator.share({ title: b.story.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setShared("Link copied");
      }
    } catch {
      /* cancelled */
    }
  };

  const bg = section(e, "background");
  const bigger = section(e, "bigger_picture");
  const known = section(e, "known_disputed");
  const glossary = section(e, "glossary");
  const whatChanged = section(e, "what_changed");
  const disputedFromGraph = b.claims.filter((c) => c.status === "disputed");
  const notGenerated = explainer.error?.code === "not_generated";

  return (
    <Container className="flex flex-col gap-7 pt-8 pb-16">
      <div className="flex flex-col gap-3.5">
        <StatusBadge status={b.story.status} size="lg" />
        <h1 className="m-0 text-[40px] leading-[1.15] font-bold tracking-[-0.8px] max-sm:text-[30px]">{b.story.title}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span>Updated {formatDateTime(b.story.lastUpdatedAt)}</span>
          <span aria-hidden>·</span>
          <span>
            {b.sources.length} {b.sources.length === 1 ? "source" : "sources"}
          </span>
          {you && (
            <>
              <span aria-hidden>·</span>
              <span>
                You read: {you.publisher}, {formatDate(you.publishedAt)}
              </span>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-start gap-2.5">
          {tier === "member" && <FollowButton storyId={b.story.id} articleUrl={articleUrl ?? ""} />}
          <Button variant="quiet" className="h-10" onClick={() => void share()}>
            <Share2 size={16} aria-hidden /> Share
          </Button>
          {shared && (
            <span role="status" className="self-center text-[13px] text-muted">
              {shared}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-10">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-10">
          <Section title={you ? "What changed since your article" : "What changed"}>
            {changes.length ? (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
                {changes.map((c, i) => (
                  <ChangeCard key={i} change={c} sources={rail} size="lg" citeIndex={railIndex(c.sourceUrl) >= 0 ? railIndex(c.sourceUrl) : undefined} />
                ))}
              </div>
            ) : (
              <Body>No major changes since this story was first reported.</Body>
            )}
            {whatChanged && (
              <Body>
                {whatChanged.body}
                <Cites ids={whatChanged.citations} />
              </Body>
            )}
          </Section>

          {explainer.isLoading && (
            <div className="flex flex-col gap-3" aria-busy>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          )}

          {notGenerated &&
            (tier === "guest" ? (
              <UpgradePrompt title="Sign in to read the full explainer — background, the bigger picture and what's disputed" benefits={MEMBER_BENEFITS} />
            ) : (
              <div className="flex flex-col gap-3 rounded-xl border border-line p-5">
                <span className="text-base font-bold">No explainer for this story yet</span>
                <p className="m-0 text-sm text-fg-2">Generate one with background, the bigger picture and what's known versus disputed. It uses one of today's explainers.</p>
                <Button className="w-fit" loading={explainer.generate.isPending} onClick={() => explainer.generate.mutate()}>
                  Generate explainer
                </Button>
                {explainer.generate.isError && <span className="text-[13px] text-disputed">Couldn't generate the explainer right now. Try again later.</span>}
              </div>
            ))}
          {explainer.isError && !notGenerated && (
            <ErrorState icon={CloudOff} onRetry={() => void explainer.refetch()}>
              Couldn't load the explainer. The timeline and changes above still come from the story map.
            </ErrorState>
          )}

          {bg && (
            <Section title={bg.title}>
              <Body>
                {bg.body}
                <Cites ids={bg.citations} />
              </Body>
            </Section>
          )}

          {bigger && (
            <Section title={bigger.title} aside={bigger.topic && <Pill tone="primary" className="px-2.5 py-[3px] text-xs">Topic: {bigger.topic.toLowerCase()}</Pill>}>
              <Body>
                {bigger.body}
                <Cites ids={bigger.citations} />
              </Body>
            </Section>
          )}

          {b.events.length > 0 && (
            <Section title="Timeline">
              <Timeline events={b.events} claims={b.claims} articleEventId={articleEventId(b, articleUrl)} />
            </Section>
          )}

          {(known || disputedFromGraph.length > 0) && (
            <Section title={known?.title ?? "What's known and what's disputed"}>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {(known?.items ?? disputedFromGraph.map((c) => ({ text: `${c.subject} — ${c.predicate}: sources report ${c.value.replace(" | ", " and ")}.`, state: "disputed" as const }))).map((it, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-base leading-normal">
                    <Pill tone={it.state === "known" ? "current" : "disputed"} className="mt-0.5 px-2.5 py-[3px] text-xs">
                      {it.state === "known" ? "Known" : "Disputed"}
                    </Pill>
                    {it.text}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {glossary && glossary.items.length > 0 && (
            <Section title={glossary.title}>
              <dl className="m-0 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                {glossary.items.map((g) => (
                  <div key={g.term} className="contents">
                    <dt className="font-semibold">{g.term}</dt>
                    <dd className="m-0 text-fg-2">{g.definition}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          <Section title="Ask about this story">
            <AskBox storyId={b.story.id} size="page" />
          </Section>
        </div>

        <aside aria-label="Sources and story map" className="flex min-w-0 flex-[1_1_300px] flex-col gap-5 lg:sticky lg:top-6">
          <SourceList variant="rail" sources={rail} grounding={e?.grounding ?? null} />
          {config.enable_graph_view && (
            <section className="flex flex-col gap-3 rounded-2xl border border-line p-5">
              <h2 className="m-0 text-base font-bold">Story map</h2>
              <MiniMap />
              <span className="text-[13px] text-muted">
                {b.events.length} events · {b.claims.length} facts · {b.entities.length} people and places
              </span>
              <Link to={`/story/${b.story.id}/graph`} className="text-sm font-semibold">
                Open story map
              </Link>
            </section>
          )}
        </aside>
      </div>
    </Container>
  );
}

function MiniMap() {
  return (
    <svg viewBox="0 0 260 150" className="h-auto w-full" aria-hidden="true">
      <path d="M40 75 L130 40 M40 75 L130 110 M130 40 L220 30 M130 40 L220 80 M130 110 L220 80 M130 110 L220 125" stroke="var(--tn-border)" strokeWidth="2" />
      <circle cx="40" cy="75" r="14" fill="var(--tn-g-blue)" />
      <circle cx="130" cy="40" r="10" fill="var(--tn-g-yellow)" />
      <circle cx="130" cy="110" r="10" fill="var(--tn-g-green)" />
      <rect x="211" y="21" width="18" height="18" rx="4" fill="var(--tn-g-red)" />
      <rect x="211" y="71" width="18" height="18" rx="4" fill="var(--tn-g-yellow)" />
      <rect x="211" y="116" width="18" height="18" rx="4" fill="var(--tn-g-green)" />
    </svg>
  );
}
