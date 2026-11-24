import { errorCopy, smartTime, useAuth, usePlatform } from "@threadnews/shared";
import { buttonClass, EmptyState, ErrorState, Skeleton, StatusBadge } from "@threadnews/shared/ui";
import { useQuery } from "@tanstack/react-query";
import { CloudOff, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { CheckInput } from "../components/check-input";
import { Container, usePageTitle } from "../components/site-chrome";

/** Explore by keywords: stories we already know, then "look up the latest" (a cloud check on the keywords). */
export function ExplorePage() {
  const [params] = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  usePageTitle(q ? `“${q}”` : "Explore");
  const { api } = usePlatform();
  const { user, tier } = useAuth();
  const res = useQuery({
    queryKey: ["search", q],
    queryFn: async () => {
      const r = await api.search(q);
      if (!r.ok) throw r.error;
      return r.data.items;
    },
    enabled: !!user && q.length >= 2,
    staleTime: 60_000,
    retry: false,
  });
  const lookUp = `/check?k=${encodeURIComponent(q)}`;

  return (
    <Container className="flex flex-col gap-8 pt-8 pb-16">
      <div className="flex flex-col gap-5">
        <h1 className="m-0 text-[32px] leading-tight font-bold tracking-[-0.6px] max-sm:text-[26px]">{q ? <>Stories about “{q}”</> : "Explore a topic"}</h1>
        <div className="max-w-[720px]">
          <CheckInput id="explore-q" hint="Type keywords to explore, or paste a link or article text to check it." />
        </div>
      </div>

      {!q ? null : res.isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : res.isError ? (
        <ErrorState icon={CloudOff} onRetry={() => void res.refetch()}>
          {errorCopy(res.error as never, tier)}
        </ErrorState>
      ) : (
        <>
          {res.data && res.data.length > 0 ? (
            <section aria-label="Stories we know" className="flex flex-col gap-4">
              <span className="text-sm text-muted">
                {res.data.length} {res.data.length === 1 ? "story" : "stories"} in the story map
              </span>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
                {res.data.map((s) => (
                  <Link key={s.storyId} to={`/story/${s.storyId}`} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-bg p-[18px] text-fg no-underline hover:bg-surface-2 hover:text-fg">
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge status={s.status} />
                      <span className="text-xs text-muted">Updated {smartTime(s.lastUpdatedAt)}</span>
                    </div>
                    <span className="text-[17px] leading-[1.3] font-bold">{s.title}</span>
                    {s.summary && <span className="line-clamp-3 text-sm leading-normal text-fg-2">{s.summary}</span>}
                  </Link>
                ))}
              </div>
            </section>
          ) : (
            <EmptyState icon={Search}>We don't have stories about “{q}” yet.</EmptyState>
          )}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-primary-soft p-6">
            <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-1">
              <span className="text-lg font-bold">{res.data?.length ? "Not the story you're after?" : "Look it up now"}</span>
              <span className="text-sm text-fg-2">We'll search for the latest reports on “{q}” and add the story to the map. Uses one of today's cloud checks.</span>
            </div>
            <Link to={lookUp} className={buttonClass("primary", "lg")}>
              Look up the latest
            </Link>
          </div>
        </>
      )}
    </Container>
  );
}
