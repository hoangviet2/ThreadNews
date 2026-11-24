import { BRAND, demoStories, smartTime, useAuth, useFollow, useFollows, usePlatform, useRecentStories, type FollowItem } from "@threadnews/shared";
import { buttonClass, Pill, Skeleton, STATUS, StatusBadge } from "@threadnews/shared/ui";
import { ArrowRight, History, Search, Sparkles, Zap } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { CheckInput, topTopics } from "../components/check-input";
import { Container, usePageTitle } from "../components/site-chrome";

const EXAMPLE_LABELS: Record<string, string> = {
  "harbor-bridge": "Harbor Bridge reopening",
  "riverton-library": "Riverton library expansion",
  "valley-flood": "Valley flood estimate",
};

export function HomePage() {
  usePageTitle(BRAND.tagline);
  const { tier } = useAuth();
  return tier === "member" ? <MemberHome /> : <Landing />;
}

/* ---------------- Guest: landing (design "Website · Landing") ---------------- */

function Landing() {
  return (
    <>
      <section>
        <Container className="flex flex-wrap items-center gap-14 pt-18 pb-14 max-sm:pt-10">
          <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-5">
            <h1 className="m-0 text-[52px] leading-[1.08] font-bold tracking-[-1.2px] max-sm:text-[40px]">
              Is this article
              <br />
              still true?
            </h1>
            <p className="m-0 max-w-[52ch] text-lg leading-[1.55] text-fg-2">
              Paste a news link or text, or search by keywords. {BRAND.name} checks whether the story has moved on since it was published — and shows exactly what changed.
            </p>
            <div className="max-w-[560px]">
              <CheckInput id="q" label="Link, text or keywords" />
            </div>
            <Examples />
          </div>
          <ThreadCard />
        </Container>
      </section>

      <section id="how" className="scroll-mt-4 border-y border-line bg-surface-2">
        <Container className="flex flex-col gap-8 py-16">
          <h2 className="m-0 text-[32px] font-bold tracking-[-0.6px]">How it works</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5">
            <Step icon={<Zap size={20} aria-hidden className="text-current" />} tint="bg-current-soft" title="1. Read on your device">
              Gemini Nano in Chrome reads the article, summarizes it and picks out the facts that could change. The article stays in your browser.
            </Step>
            <Step icon={<Search size={20} aria-hidden className="text-primary" />} tint="bg-primary-soft" title="2. Check what happened since">
              If we already know the story, the check runs on your device. If not, we search for newer reports and add them to our story map.
            </Step>
            <Step icon={<History size={20} aria-hidden className="text-moved" />} tint="bg-moved-soft" title="3. Catch up in one page">
              See what changed, the timeline and the bigger picture, with every source linked. Follow a story to hear when it moves again.
            </Step>
          </div>
        </Container>
      </section>

      <section>
        <Container className="py-16">
          <div className="flex flex-wrap items-center justify-between gap-6 rounded-[20px] bg-primary-soft p-10 max-sm:p-6">
            <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-2">
              <h2 className="m-0 text-[28px] font-bold tracking-[-0.5px]">Check any article in one click</h2>
              <p className="m-0 text-base leading-[1.55] text-fg-2">The Chrome extension opens beside the page you're reading. Free, no account needed to start.</p>
            </div>
            <Link to="/about#install" className={buttonClass("primary", "lg")}>
              Get the extension
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}

function Examples() {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] text-muted">Try an example</span>
      <div className="flex flex-wrap gap-2">
        {demoStories().map((d) => (
          <Link
            key={d.story.id}
            to={`/check?example=${d.story.id}`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] text-fg-2 no-underline hover:bg-surface-2 hover:text-fg"
          >
            <span aria-hidden className="size-2 rounded-full" style={{ background: d.chipColor }} />
            {EXAMPLE_LABELS[d.story.id] ?? d.story.title}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Step({ icon, tint, title, children }: { icon: React.ReactNode; tint: string; title: string; children: string }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-bg p-6">
      <span className={`inline-flex size-10 items-center justify-center rounded-full ${tint}`}>{icon}</span>
      <h3 className="m-0 text-lg font-bold">{title}</h3>
      <p className="m-0 text-[15px] leading-[1.55] text-fg-2">{children}</p>
    </div>
  );
}

/** Illustration of the thread motif, using the Harbor Bridge sample story. */
function ThreadCard() {
  const d = demoStories()[0]!;
  const [ledger, dot, dispatch] = [d.sources[2]!, d.sources[1]!, d.sources[0]!];
  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");
  const rows = [
    { color: "bg-g-red", meta: `${fmt(ledger.publishedAt)} · ${ledger.publisher}`, text: "Bridge to reopen March 3", here: true },
    { color: "bg-g-yellow", meta: `${fmt(dot.publishedAt)} · ${dot.publisher}`, text: "Repair cost rises to $11M" },
    { color: "bg-g-green", meta: `${fmt(dispatch.publishedAt)} · ${dispatch.publisher}`, text: "Reopening moved to June 10", last: true },
  ];
  return (
    <figure aria-label="Example: the thread of a story" className="m-0 flex min-w-0 flex-[1_1_380px] flex-col rounded-[20px] border border-line p-7">
      <figcaption className="mb-[18px] text-xs font-semibold tracking-[0.6px] text-muted uppercase">The thread of a story</figcaption>
      {rows.map((r) => (
        <div key={r.text} className="flex gap-4">
          <div className="flex w-4 flex-col items-center">
            <span aria-hidden className={`shrink-0 rounded-full ${r.color} ${r.last ? "size-4" : "size-3.5"}`} />
            {!r.last && <span aria-hidden className="w-0.5 flex-1 bg-g-blue" />}
          </div>
          <div className={`flex flex-col gap-1 ${r.last ? "" : "pb-[22px]"}`}>
            <span className="text-xs text-muted">{r.meta}</span>
            <span className="text-[15px] font-semibold">{r.text}</span>
            {r.here && <Pill tone="primary">You are here</Pill>}
          </div>
        </div>
      ))}
      <div className="mt-[22px] flex items-center gap-2 rounded-xl bg-moved-soft px-3.5 py-3">
        <History size={18} aria-hidden className="text-moved" />
        <span className="text-sm font-semibold text-moved">Story has moved on — 2 facts changed</span>
      </div>
    </figure>
  );
}

/* ---------------- Member: homepage (design "Website · Homepage") ---------------- */

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

function SectionHead({ id, title, note, aside }: { id: string; title: React.ReactNode; note?: string; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="m-0 flex items-center gap-2 text-2xl font-bold">
          {title}
        </h2>
        {note && <span className="text-sm text-muted">{note}</span>}
      </div>
      {aside}
    </div>
  );
}

function MemberHome() {
  const { user } = useAuth();
  const { store } = usePlatform();
  const follows = useFollows();
  const recent = useRecentStories(4);
  const items = follows.data ?? [];
  const updates = items.filter((f) => f.unread);
  const topics = topTopics(store);
  const first = user?.displayName?.split(" ")[0];

  return (
    <Container className="flex flex-col gap-12 pt-10 pb-18">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-4xl leading-[1.15] font-bold tracking-[-0.7px] max-sm:text-[30px]">
            {greeting()}
            {first ? `, ${first}` : ""}
          </h1>
          <p className="m-0 text-[17px] text-fg-2">
            {follows.isLoading
              ? " "
              : updates.length
                ? `${updates.length} ${updates.length === 1 ? "story you follow has" : "stories you follow have"} moved since you last looked.`
                : items.length
                  ? "Nothing new in the stories you follow."
                  : "Check an article or explore a topic, then follow stories to hear when they move."}
          </p>
        </div>
        <div className="max-w-[720px]">
          <CheckInput id="home-q" label="Link, text or keywords" />
        </div>
      </div>

      {updates.length > 0 && (
        <section aria-labelledby="h-updates" className="flex flex-col gap-4">
          <SectionHead id="h-updates" title="Updates on stories you follow" aside={<span className="text-[13px] text-muted">Shown only when a followed story changes</span>} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
            {updates.map((f) => (
              <Link key={f.storyId} to={`/story/${f.storyId}`} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-bg p-[18px] text-fg no-underline hover:bg-surface-2 hover:text-fg">
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={f.status} />
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                    <span aria-hidden className="size-2 rounded-full bg-primary" />
                    {smartTime(f.lastUpdatedAt)}
                  </span>
                </div>
                <span className="text-[17px] leading-[1.3] font-bold">{f.title}</span>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  See what changed <ArrowRight size={16} aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {topics.length > 0 && (
        <section aria-labelledby="h-topics" className="flex flex-col gap-4">
          <SectionHead id="h-topics" title="Your topics" note="Based on the articles you check most, kept on this device" />
          <div className="flex flex-wrap gap-2.5">
            {topics.map((t) => (
              <Link
                key={t.name}
                to={`/explore?q=${encodeURIComponent(t.name)}`}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-bg px-4 text-sm font-medium text-fg no-underline hover:bg-surface-2 hover:text-fg"
              >
                {t.name}
                <span className="text-xs text-muted">
                  {t.count} {t.count === 1 ? "check" : "checks"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="h-recent" className="flex flex-col gap-4">
        <SectionHead id="h-recent" title={<><Sparkles size={22} aria-hidden className="text-g-red" />Recently updated stories</>} note={`Stories that moved most recently across ${BRAND.name}`} />
        {recent.isLoading ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
            {(recent.data ?? []).map((s) => (
              <article key={s.id} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-bg p-[18px]">
                <span className="text-xs text-muted">Updated {smartTime(s.lastUpdatedAt)}</span>
                <span className="text-[17px] leading-[1.3] font-bold">{s.title}</span>
                {s.summary && <span className="line-clamp-3 text-sm leading-normal text-fg-2">{s.summary}</span>}
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                  <Pill tone={s.status === "moved_on" ? "moved" : s.status === "disputed" ? "disputed" : "current"} className="px-2.5 py-[3px] text-xs">
                    {STATUS[s.status].label}
                  </Pill>
                  <Link to={`/story/${s.id}`} className="text-sm font-semibold no-underline hover:underline">
                    See the latest
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <FollowedList items={items} loading={follows.isLoading} />
    </Container>
  );
}

const TABS = [
  { key: "all", label: "All" },
  { key: "moved_on", label: "Moved on" },
  { key: "current", label: "Still current" },
] as const;

function FollowedList({ items, loading }: { items: FollowItem[]; loading: boolean }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const shown = tab === "all" ? items : items.filter((f) => f.status === tab);
  return (
    <section aria-labelledby="h-following" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="h-following" className="m-0 text-2xl font-bold">
          All followed stories <span className="text-base font-medium text-muted">· {items.length}</span>
        </h2>
        <div role="tablist" aria-label="Filter followed stories" className="inline-flex rounded-full bg-surface p-[3px]">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`h-9 rounded-full px-4 text-[13px] font-semibold ${tab === t.key ? "bg-bg text-fg shadow-sm" : "text-muted hover:text-fg"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : shown.length === 0 ? (
        <p className="m-0 rounded-2xl border border-dashed border-line p-6 text-sm text-fg-2">
          {items.length ? "No followed stories in this view." : "You're not following any stories yet. Follow one from a check result or an explainer."}
        </p>
      ) : (
        <ul className="m-0 list-none overflow-hidden rounded-2xl border border-line p-0">
          {shown.map((f, i) => (
            <FollowRow key={f.storyId} f={f} first={i === 0} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FollowRow({ f, first }: { f: FollowItem; first: boolean }) {
  const { toggle } = useFollow(f.storyId);
  return (
    <li className={`flex flex-wrap items-center gap-4 bg-bg px-5 py-4 ${first ? "" : "border-t border-line"}`}>
      <span className="inline-flex min-w-[156px] shrink-0">
        <StatusBadge status={f.status} />
      </span>
      <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-0.5">
        <Link to={`/story/${f.storyId}`} className="text-base font-semibold text-fg no-underline hover:underline">
          {f.title}
        </Link>
        <span className="text-[13px] text-muted">Updated {smartTime(f.lastUpdatedAt)}</span>
      </div>
      <div className="flex items-center gap-3">
        {f.unread && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
            <span aria-hidden className="size-2 rounded-full bg-primary" />
            New
          </span>
        )}
        <button
          type="button"
          aria-label={`Unfollow ${f.title}`}
          disabled={toggle.isPending}
          onClick={() => toggle.mutate()}
          className="h-9 rounded-full border border-line bg-bg px-3 text-[13px] font-medium text-fg-2 hover:bg-surface-2 disabled:opacity-60"
        >
          Unfollow
        </button>
      </div>
    </li>
  );
}
