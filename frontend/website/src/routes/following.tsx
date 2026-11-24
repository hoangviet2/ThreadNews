import { smartTime, useAuth, useFollows } from "@threadnews/shared";
import { EmptyState, ErrorState, MEMBER_BENEFITS, Skeleton, StatusBadge, UpgradePrompt } from "@threadnews/shared/ui";
import { Bell, CloudOff } from "lucide-react";
import { Link } from "react-router";
import { Container, usePageTitle } from "../components/site-chrome";

export function FollowingPage() {
  usePageTitle("Following");
  const { tier } = useAuth();
  const follows = useFollows();

  return (
    <Container className="flex max-w-3xl! flex-col gap-6 py-10">
      <h1 className="m-0 text-[32px] font-bold tracking-[-0.6px]">Following</h1>
      {tier === "guest" ? (
        <UpgradePrompt title="Sign in to follow stories and hear when they move again" benefits={MEMBER_BENEFITS} />
      ) : follows.isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : follows.isError ? (
        <ErrorState icon={CloudOff} onRetry={() => void follows.refetch()}>
          Couldn't load the stories you follow.
        </ErrorState>
      ) : !follows.data?.length ? (
        <EmptyState icon={Bell} action={<Link to="/">Check an article</Link>}>
          You're not following any stories yet. Follow one from a check result or an explainer.
        </EmptyState>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {follows.data.map((f) => (
            <li key={f.storyId}>
              <Link to={`/story/${f.storyId}`} className="flex items-start gap-3 rounded-xl border border-line p-4 text-fg no-underline hover:bg-surface-2 hover:text-fg">
                <span aria-hidden className={`mt-2 size-2 shrink-0 rounded-full ${f.unread ? "bg-primary" : "bg-transparent"}`} />
                <div className="flex min-w-0 flex-col gap-1.5">
                  <StatusBadge status={f.status} />
                  <span className="text-base font-semibold">{f.title}</span>
                  <span className="text-[13px] text-muted">
                    Updated {smartTime(f.lastUpdatedAt)}
                    {f.unread && <span className="sr-only"> · New update</span>}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
