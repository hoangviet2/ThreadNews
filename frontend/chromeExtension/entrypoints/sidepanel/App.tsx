import { BRAND, useAuth, useCheckFlow, useDeviceRuns, useFollows, usePlatform, type FlowState } from "@threadnews/shared";
import { AccountChip, AskBox, Button, CheckResultView, EmptyState, LogoMark, OfflineBanner, OnDeviceSetup, QuotaMeter } from "@threadnews/shared/ui";
import { FileText, Info, LockKeyhole, RefreshCw, Settings, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getCached, putCached } from "../../components/result-cache";
import { SettingsView } from "../../components/SettingsView";
import { requestAllSites, useActiveTab } from "../../components/use-active-tab";
import { send } from "../../messages";

export function App() {
  const [view, setView] = useState<"main" | "settings">("main");
  const { tier } = useAuth();
  const { api } = usePlatform();
  const [runs] = useDeviceRuns();

  return (
    <div className="flex h-screen min-w-[320px] flex-col bg-bg text-sm text-fg">
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <button type="button" onClick={() => setView("main")} className="flex items-center gap-2 rounded" aria-label={`${BRAND.name} — back to the check`}>
          <LogoMark size={28} />
          <span className="text-base font-bold tracking-[-0.2px]">{BRAND.name}</span>
        </button>
        <div className="flex items-center gap-2.5">
          {tier === "member" && <QuotaMeter />}
          <AccountChip onSettings={() => setView("settings")} />
        </div>
      </header>
      {tier === "guest" && (
        <div className="border-b border-line px-4 py-2.5">
          <QuotaMeter variant="bar" />
        </div>
      )}
      <OfflineBanner message="You're offline. Summaries still work on this device." />
      {api.mode === "demo" && (
        <div role="note" className="flex items-start gap-2 border-b border-line bg-primary-tint px-4 py-2 text-xs text-fg-2">
          <Info size={14} aria-hidden className="mt-px shrink-0 text-primary" />
          Preview build: not connected to the ThreadNews API, so online checks work for sample stories only.
        </div>
      )}

      <main className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">{view === "settings" ? <SettingsView onBack={() => setView("main")} /> : <MainView />}</main>

      <footer className="flex items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <Zap size={13} aria-hidden className="text-current" />
          {runs} {runs === 1 ? "check" : "checks"} ran on this device today
        </span>
        {view === "main" && (
          <button type="button" onClick={() => setView("settings")} className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-xs text-muted hover:bg-surface hover:text-fg">
            <Settings size={13} aria-hidden /> Settings
          </button>
        )}
      </footer>
    </div>
  );
}

function MainView() {
  const { websiteUrl } = usePlatform();
  const { state: tab, refresh } = useActiveTab();
  const { state, run, restore, reset } = useCheckFlow();
  const current = useRef<string | null>(null);
  useFollowBadge();

  // New article in the active tab → cached result or a fresh check.
  useEffect(() => {
    if (tab.kind !== "ready") {
      if (tab.kind !== "loading") (current.current = null), reset();
      return;
    }
    const a = tab.article;
    if (current.current === a.url) return;
    current.current = a.url;
    void getCached(a.url).then((cached) => (cached ? restore(cached) : run({ article: a })));
  }, [tab, run, restore, reset]);

  useEffect(() => {
    if (state.phase === "done" && current.current) void putCached(current.current, state);
  }, [state]);

  const recheck = () => {
    if (tab.kind === "ready") void run({ article: tab.article });
  };

  return (
    <>
      <OnDeviceSetup />
      {tab.kind === "loading" && state.phase === "idle" && <Loading />}
      {tab.kind === "no-tab" && <EmptyState icon={FileText}>Open a news article, then click the {BRAND.name} icon.</EmptyState>}
      {tab.kind === "restricted" && <EmptyState icon={LockKeyhole}>{BRAND.name} can't read this page. Open a news article to check it.</EmptyState>}
      {tab.kind === "needs-permission" && <PermissionCard onGranted={() => void refresh(true)} />}
      {tab.kind === "error" && (
        <EmptyState icon={FileText} action={<Button variant="secondary" size="sm" onClick={() => void refresh(true)}>Try again</Button>}>
          Couldn't read this page. Reload it and try again.
        </EmptyState>
      )}
      {tab.kind === "ready" && (
        <>
          <CheckResultView state={state} layout="panel" explainerNewTab explainerHref={(id) => `${websiteUrl}/story/${id}?u=${encodeURIComponent(tab.article.url)}`} onRetry={recheck} />
          {state.phase === "done" && state.result && state.result.status !== "not_news" && <RecheckLink state={state} onClick={recheck} />}
          <AskBox storyId={state.result?.storyId} />
        </>
      )}
      <p className="m-0 text-xs leading-normal text-muted">
        {BRAND.privacyLine}{" "}
        <a href={`${websiteUrl}/about#privacy`} target="_blank" rel="noopener">
          How it works
        </a>
      </p>
    </>
  );
}

function RecheckLink({ state, onClick }: { state: FlowState; onClick: () => void }) {
  if (!state.result) return null;
  return (
    <button type="button" onClick={onClick} className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline">
      <RefreshCw size={12} aria-hidden /> Check again
    </button>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-3" aria-busy aria-label="Reading the page">
      <div className="h-10 rounded-lg bg-skeleton" />
      <div className="h-24 rounded-xl bg-skeleton" />
    </div>
  );
}

/** activeTab didn't cover this tab: ask (with explanation) for the optional host permission. */
function PermissionCard({ onGranted }: { onGranted: () => void }) {
  const [denied, setDenied] = useState(false);
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <span className="text-base font-bold">Check this page</span>
      <p className="m-0 text-[13px] leading-normal text-fg-2">
        Click the {BRAND.name} icon in the toolbar to let it read this article once. Or allow it on all sites so it re-checks automatically when you switch tabs. The article is read on your
        computer and never stored.
      </p>
      <Button variant="secondary" onClick={onGranted}>
        Check this page
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={async () => {
          const ok = await requestAllSites();
          setDenied(!ok);
          if (ok) onGranted();
        }}
      >
        Allow on all sites
      </Button>
      {denied && <span className="text-xs text-muted">No problem — click the toolbar icon on any article to check it.</span>}
    </section>
  );
}

/** Members: keep the toolbar badge in sync with unread follows (docs/EXTENSION.md "Badge & updates"). */
function useFollowBadge() {
  const follows = useFollows();
  useEffect(() => {
    if (follows.data) void send({ type: "badge:set", count: follows.data.filter((f) => f.unread).length });
  }, [follows.data]);
}
