import { Bell, BellOff, ExternalLink } from "lucide-react";
import { useState } from "react";
import { errorCopy } from "../api/client";
import type { FlowState } from "../flow/check-flow";
import { relativeTime } from "../format";
import { useAuth, useFollow, useMe } from "../react/hooks";
import { MEMBER_BENEFITS, UpgradePrompt } from "./account";
import { ArticleRow } from "./article";
import { ChangeCard } from "./change-card";
import { Button, ButtonLink, cx, Skeleton } from "./primitives";
import { SourceList } from "./source-list";
import { InferenceBadge, StatusHero } from "./status";
import { SummaryBlock } from "./summary";

const PHASE_NOTE: Partial<Record<FlowState["phase"], string>> = {
  gatekeeping: "Reading the article on this device…",
  retrieving: "Looking for this story in the story map…",
  graph_checking: "Comparing with the latest known facts on this device…",
  cloud_checking: "Searching for newer reports…",
};

export function FollowButton({ storyId, articleUrl }: { storyId: string; articleUrl: string }) {
  const { tier } = useAuth();
  const { following, toggle } = useFollow(storyId, articleUrl);
  if (tier === "guest") return <UpgradePrompt compact title="Sign in to follow this story and hear when it moves again" />;
  return (
    <div className="flex flex-col gap-1">
      <Button variant="secondary" loading={toggle.isPending} onClick={() => toggle.mutate()} aria-pressed={following}>
        {following ? <BellOff size={16} aria-hidden /> : <Bell size={16} aria-hidden />}
        {following ? "Following · Unfollow" : "Follow this story"}
      </Button>
      {toggle.isError && <span className="text-center text-xs text-disputed">{errorCopy(toggle.error, tier)}</span>}
    </div>
  );
}

/**
 * Full check result: status first, then the evidence (DESIGN.md §6). Same structure in the
 * side panel (`layout="panel"`) and on the website's /check page (`layout="page"`).
 */
export function CheckResultView({
  state,
  layout = "panel",
  explainerHref,
  explainerNewTab = false,
  onRetry,
}: {
  state: FlowState;
  layout?: "panel" | "page";
  explainerHref?: (storyId: string) => string;
  explainerNewTab?: boolean;
  onRetry?: () => void;
}) {
  const { tier } = useAuth();
  const me = useMe();
  const [allChanges, setAllChanges] = useState(false);
  const page = layout === "page";
  const { phase, article, result, error, summary } = state;
  if (phase === "idle" || !article) return null;

  const summaryBlock = (summary.text || !summary.done) && <SummaryBlock text={summary.text} inference={summary.inference} done={summary.done} />;
  const explainerLink = (label = "Open full explainer", variant: "primary" | "secondary" = "primary") =>
    result?.storyId && explainerHref ? (
      <ButtonLink href={explainerHref(result.storyId)} variant={variant} {...(explainerNewTab ? { target: "_blank", rel: "noopener" } : {})}>
        {label}
        <ExternalLink size={16} aria-hidden />
      </ButtonLink>
    ) : null;

  const body = (() => {
    // Running
    if (phase !== "done" && phase !== "error")
      return (
        <>
          <StatusHero status="checking" label="Checking if the story moved on…" summary={<span className="text-xs text-muted">{PHASE_NOTE[phase]}</span>}>
            <Skeleton className="h-2.5 w-[85%]" />
            <Skeleton className="h-2.5 w-[60%]" />
          </StatusHero>
          {summaryBlock}
        </>
      );

    // Errors — the on-device summary stays (docs/architecture/05-request-flows.md §8)
    if (phase === "error" && error) {
      if (error.code === "quota_exceeded") {
        const limit = Number(error.details?.limit ?? me.data?.limits.check ?? 3);
        const resetAt = typeof error.details?.resetAt === "string" ? error.details.resetAt : me.data?.resetAt;
        return (
          <>
            <StatusHero status="unavailable" label="Not checked online yet" summary="Checking whether this story moved on needs a cloud search." />
            {tier === "guest" ? (
              <UpgradePrompt title={`You've used today's ${limit} cloud checks`} benefits={MEMBER_BENEFITS} resetAt={resetAt} />
            ) : (
              <div className="rounded-xl border border-line p-4 text-sm text-fg-2">You've used today's cloud checks. They reset tomorrow.</div>
            )}
            {summaryBlock}
            <span className="text-xs text-muted">Summaries and checks of stories we already know keep working on this device.</span>
          </>
        );
      }
      return (
        <>
          <StatusHero status="unavailable" summary={errorCopy(error, tier)}>
            {onRetry && error.code !== "demo_unavailable" && (
              <Button variant="secondary" size="sm" className="mt-1 w-fit" onClick={onRetry}>
                Try again
              </Button>
            )}
          </StatusHero>
          {summaryBlock}
        </>
      );
    }
    if (!result) return null;

    const meta = (
      <>
        <InferenceBadge onWhite inference={result.inference} label={result.inference === "on_device" ? "On-device check" : "Cloud check"} />
        <span className="text-xs text-muted">{result.inference === "on_device" && !result.grounding ? (result.storyId ? "Story known · no cloud call" : "Ran on this device") : `Checked ${relativeTime(result.checkedAt)}`}</span>
      </>
    );
    const hero = <StatusHero status={result.status} summary={result.summary} meta={result.status === "not_news" ? undefined : meta} />;
    const sources = <SourceList sources={result.sources} grounding={result.grounding} initial={page ? 5 : 3} />;
    const shownChanges = allChanges ? result.changes : result.changes.slice(0, 2);
    const changes = result.changes.length > 0 && (
      <div className="flex flex-col gap-2.5">
        <div className={cx("grid gap-2.5", page && "sm:grid-cols-2")}>
          {shownChanges.map((c, i) => (
            <ChangeCard key={`${c.fact}-${i}`} change={c} sources={result.sources} size={page ? "lg" : "md"} />
          ))}
        </div>
        {result.changes.length > 2 && (
          <button type="button" onClick={() => setAllChanges((v) => !v)} className="w-fit text-[13px] font-medium text-primary hover:underline">
            {allChanges ? "Show fewer changes" : `See all ${result.changes.length} changes`}
          </button>
        )}
      </div>
    );
    const follow = result.storyId && <FollowButton storyId={result.storyId} articleUrl={article.url} />;

    switch (result.status) {
      case "moved_on":
        return (
          <>
            {hero}
            {changes}
            {explainerLink()}
            {sources}
          </>
        );
      case "disputed":
        return (
          <>
            {hero}
            {changes}
            {summaryBlock}
            {explainerLink("See what's known and disputed", "secondary")}
            {sources}
            {follow}
          </>
        );
      case "current":
        return (
          <>
            {hero}
            {summaryBlock}
            {follow}
            {sources}
          </>
        );
      case "not_news":
        return (
          <>
            {hero}
            {summaryBlock}
            <p className="m-0 text-xs text-muted">ThreadNews checks news reports. Open a news article to see whether its story has moved on.</p>
          </>
        );
    }
  })();

  return (
    <div className={cx("flex flex-col", page ? "gap-5" : "gap-4")}>
      <ArticleRow article={article} />
      {body}
    </div>
  );
}
