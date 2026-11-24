import { articleEventId, demoStory, formatDateTime, headlineFromUrl, relativeTime, useAuth, useCheckFlow, usePlatform, useStory, type Claim, type ExtractedArticle, type FlowState } from "@threadnews/shared";
import { AskBox, Button, buttonClass, ChangeCard, CheckResultView, EmptyState, FollowButton, InferenceBadge, SourceList, StatusBadge, SummaryBlock, Timeline } from "@threadnews/shared/ui";
import { CircleCheck, ExternalLink, Search, Share2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { parseInput, recordTopics } from "../components/check-input";
import { Container, usePageTitle } from "../components/site-chrome";

export { parseInput } from "../components/check-input";

type Run = { key: string; article: ExtractedArticle; preset?: { claims: Claim[]; entities: string[] }; keywords?: boolean };

export function CheckPage() {
  usePageTitle("Check an article");
  const [params] = useSearchParams();
  const location = useLocation();
  const { store } = usePlatform();
  const { state, run } = useCheckFlow();
  const [extra, setExtra] = useState("");

  const job = useMemo<Run | null>(() => {
    const example = params.get("example");
    const url = params.get("u");
    const keywords = params.get("k")?.trim();
    const text = (location.state as { text?: string } | null)?.text;
    if (example) {
      const d = demoStory(example);
      if (!d) return null;
      const a = d.article;
      return { key: `ex:${example}`, article: { url: a.url, title: a.title, publisher: a.publisher, publishedAt: a.publishedAt, text: a.text, isProbablyArticle: true }, preset: { claims: a.claims, entities: a.entities } };
    }
    // Keywords: "look up the latest" from /explore — a check on the topic itself, no article claims.
    if (keywords) return { key: `k:${keywords}`, article: { url: "keywords", title: keywords, text: "", isProbablyArticle: true }, preset: { claims: [], entities: [] }, keywords: true };
    if (text) {
      const p = parseInput(text);
      if (p?.kind === "text") return { key: `t:${text.length}:${text.slice(0, 40)}`, article: { url: "pasted-text", title: p.title, text: p.text, isProbablyArticle: true } };
    }
    if (url) return { key: `u:${url}`, article: { url, title: headlineFromUrl(url), text: "", isProbablyArticle: true } };
    return null;
  }, [params, location.state]);

  useEffect(() => {
    if (job) void run({ article: job.article, presetClaims: job.preset });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.key]);

  // "Your topics" on the homepage: the entities of what this reader checks, kept on this device.
  useEffect(() => {
    if (state.phase === "done" && state.gate?.isNews) recordTopics(store, job?.keywords ? [job.article.title] : state.gate.entities);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  const linkOnly = !!job && !job.article.text && !job.preset;
  const recheckWithText = (e: FormEvent) => {
    e.preventDefault();
    if (!job || extra.trim().length < 20) return;
    const p = parseInput(extra);
    void run({ article: { ...job.article, title: p?.kind === "text" ? p.title : job.article.title, text: extra.trim() } });
  };

  if (!job)
    return (
      <Container className="max-w-3xl! py-10">
        <EmptyState icon={Search} action={<Link to="/" className={buttonClass("primary", "sm")}>Go to the home page</Link>}>
          Paste a news link or text, or type keywords, to check whether the story has moved on.
        </EmptyState>
      </Container>
    );

  const done = state.phase === "done" && state.result && state.result.status !== "not_news";
  return (
    <Container className="flex flex-col gap-7 pt-8 pb-16">
      {linkOnly && !done && (
        <form onSubmit={recheckWithText} className="flex max-w-3xl flex-col gap-2 rounded-xl border border-primary-line bg-primary-tint p-4">
          <label htmlFor="extra" className="text-sm font-semibold">
            Paste the headline or first paragraph too for best results
          </label>
          <p className="m-0 text-[13px] text-fg-2">We can't open the link from your browser, and we never fetch article bodies. The text you paste is read on this device.</p>
          <textarea id="extra" rows={3} value={extra} onChange={(e) => setExtra(e.target.value)} className="rounded-xl border border-line bg-bg p-3 text-sm text-fg focus:border-primary focus:outline-none" />
          <Button type="submit" variant="secondary" size="sm" className="w-fit" disabled={extra.trim().length < 20}>
            Check with this text
          </Button>
        </form>
      )}
      {done ? (
        <ResultPage state={state} articleUrl={job.article.url} keywords={!!job.keywords} />
      ) : (
        <div className="max-w-3xl">
          <CheckResultView state={state} layout="page" explainerHref={(id) => `/story/${id}`} onRetry={() => void run({ article: job.article, presetClaims: job.preset })} />
        </div>
      )}
    </Container>
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 className="m-0 text-2xl font-bold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Design "Website · Still current" / result layout: status, title, actions; evidence left, numbered sources right. */
function ResultPage({ state, articleUrl, keywords }: { state: FlowState; articleUrl: string; keywords: boolean }) {
  const r = state.result!;
  const a = state.article!;
  const { tier } = useAuth();
  const story = useStory(r.storyId ?? undefined);
  const [shared, setShared] = useState<string | null>(null);
  const realUrl = /^https?:\/\//.test(articleUrl) ? articleUrl : null;
  const events = story.data?.events ?? [];
  const claims = [...new Map((state.gate?.claims ?? []).map((c) => [`${c.predicate}|${c.value}`.toLowerCase(), c])).values()].slice(0, 6);
  const nSources = r.sources.length + (r.grounding?.chunks.filter((c) => !r.sources.some((s) => s.url === c.uri)).length ?? 0);
  const title = keywords ? (story.data?.story.title ?? a.title) : a.title;

  const share = async () => {
    const url = r.storyId ? `${location.origin}/story/${r.storyId}` : location.href;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else {
        await navigator.clipboard.writeText(url);
        setShared("Link copied");
      }
    } catch {
      /* cancelled */
    }
  };

  return (
    <>
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={r.status} size="lg" />
          <InferenceBadge onWhite inference={r.inference} label={`${r.inference === "on_device" ? "Checked on-device" : "Cloud check"} · ${relativeTime(r.checkedAt)}`} />
        </div>
        <h1 className="m-0 text-[40px] leading-[1.15] font-bold tracking-[-0.8px] max-sm:text-[30px]">{title}</h1>
        <p className="m-0 text-sm text-muted">
          {[keywords ? `Latest on “${a.title}”` : [a.publisher, formatDateTime(a.publishedAt)].filter(Boolean).join(" · "), nSources > 0 && `${nSources} ${nSources === 1 ? "source" : "sources"}`].filter(Boolean).join(" · ")}
        </p>
        <div className="flex flex-wrap items-start gap-2.5">
          {r.storyId && (tier === "member" ? <FollowButton storyId={r.storyId} articleUrl={realUrl ?? ""} /> : null)}
          <Button variant="quiet" className="h-10" onClick={() => void share()}>
            <Share2 size={16} aria-hidden /> Share
          </Button>
          {r.storyId && (
            <Link to={`/story/${r.storyId}${realUrl ? `?u=${encodeURIComponent(realUrl)}` : ""}`} className={buttonClass(r.status === "current" ? "secondary" : "primary", "md", "h-10")}>
              Open full explainer <ExternalLink size={16} aria-hidden />
            </Link>
          )}
          {shared && (
            <span role="status" className="self-center text-[13px] text-muted">
              {shared}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-10">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-10">
          {r.status === "current" ? (
            <section className="flex flex-col gap-1.5 rounded-2xl bg-current-soft px-6 py-5">
              <h2 className="m-0 text-xl font-bold text-current">{keywords ? "Here's where this story stands" : "No major changes since this was published"}</h2>
              <p className="m-0 text-[15px] leading-[1.55] text-fg-2">{r.summary || "We compared the article's key facts with every newer report we know about. They still match."}</p>
            </section>
          ) : (
            <Section title={keywords ? "What changed recently" : "What changed since your article"}>
              {r.summary && <p className="m-0 max-w-[68ch] text-[17px] leading-[1.65] text-fg-2">{r.summary}</p>}
              {r.changes.length > 0 && (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
                  {r.changes.map((c, i) => (
                    <ChangeCard key={`${c.fact}-${i}`} change={c} sources={r.sources} size="lg" />
                  ))}
                </div>
              )}
            </Section>
          )}

          {r.status === "current" && claims.length > 0 && (
            <Section title="Key facts, checked">
              <ul className="m-0 flex list-none flex-col p-0">
                {claims.map((c, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold tracking-[0.4px] text-muted uppercase">{c.predicate}</span>
                      <span className="text-[17px] font-bold">{c.value}</span>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-[13px] text-current">
                      <CircleCheck size={14} aria-hidden />
                      Matches the latest reports
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {(state.summary.text || !state.summary.done) && (
            <div className="max-w-[68ch] [&_h2]:text-2xl [&_h2]:font-bold [&_p]:text-[17px] [&_p]:leading-[1.65]">
              <SummaryBlock text={state.summary.text} inference={state.summary.inference} done={state.summary.done} />
            </div>
          )}

          {/* Where the story started: shown whenever the story map has more than one event (any status). */}
          {events.length > 1 && (
            <Section title={r.status === "current" ? "How this story developed" : "Timeline"}>
              <Timeline events={events} claims={story.data?.claims ?? []} articleEventId={story.data ? articleEventId(story.data, realUrl) : undefined} />
            </Section>
          )}

          {r.storyId && (
            <Section title="Ask about this story">
              <AskBox storyId={r.storyId} size="page" />
            </Section>
          )}
        </div>

        <aside aria-label="Sources" className="flex min-w-0 flex-[1_1_300px] flex-col gap-5 lg:sticky lg:top-6">
          <SourceList variant="rail" sources={r.sources} grounding={r.grounding} />
        </aside>
      </div>
    </>
  );
}
