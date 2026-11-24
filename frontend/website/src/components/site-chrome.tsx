import { BRAND, useAuth, useMe, usePlatform } from "@threadnews/shared";
import { AccountChip, Button, checksLeft, QuotaMeter, Wordmark } from "@threadnews/shared/ui";
import { Info, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { CheckInput } from "./check-input";

export const Container = ({ className = "", children }: { className?: string; children: React.ReactNode }) => <div className={`mx-auto w-full max-w-[1120px] px-6 ${className}`}>{children}</div>;

export function DemoBanner() {
  const { api } = usePlatform();
  if (api.mode !== "demo") return null;
  return (
    <div role="note" className="border-b border-line bg-primary-tint">
      <Container className="flex items-center gap-2 py-2 text-xs text-fg-2">
        <Info size={14} aria-hidden className="shrink-0 text-primary" />
        <span>
          Preview mode: not connected to the ThreadNews API yet, so online checks work for the sample stories only. On-device summaries work for any text.
        </span>
      </Container>
    </div>
  );
}

const navCls = ({ isActive }: { isActive: boolean }) => `rounded px-0.5 no-underline hover:text-fg ${isActive ? "font-semibold text-fg" : "text-fg-2"}`;

/** Design: header with a search toggle that opens "Check another article" (link, text or keywords). */
export function SiteHeader() {
  const { tier, signIn, unavailableReason, kind } = useAuth();
  const me = useMe();
  const q = checksLeft(me.data);
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const onHome = pathname === "/";

  return (
    <header className="border-b border-line">
      <Container className="flex flex-wrap items-center justify-between gap-4 py-3.5">
        <Link to="/" className="rounded no-underline" aria-label={`${BRAND.name} home`}>
          <Wordmark size="lg" />
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {!onHome && (
            <button
              type="button"
              aria-label="Check another article"
              aria-expanded={open}
              aria-controls="check-panel"
              onClick={() => setOpen((v) => !v)}
              className={`inline-flex size-11 items-center justify-center rounded-full border text-primary ${open ? "border-primary-line bg-primary-soft" : "border-line bg-bg hover:bg-primary-tint"}`}
            >
              <Search size={20} aria-hidden />
            </button>
          )}
          {tier === "guest" ? (
            <>
              {q && !onHome && <span className="tnum text-[13px] text-muted">{`${q.left} ${q.left === 1 ? "check" : "checks"} left`}</span>}
              <Button variant="secondary" className="h-10 px-[18px]" loading={signIn.isPending} disabled={!!unavailableReason} onClick={() => signIn.mutate()}>
                {kind === "demo" ? "Sign in (demo)" : "Sign in"}
              </Button>
              <Button className="h-10 px-[18px]" disabled={!!unavailableReason || signIn.isPending} onClick={() => signIn.mutate()}>
                Sign up
              </Button>
            </>
          ) : (
            <>
              <NavLink to="/following" className={navCls}>
                Following
              </NavLink>
              <QuotaMeter />
              <AccountChip settingsHref="/settings" size={36} />
            </>
          )}
        </nav>
      </Container>
      {open && (
        <div id="check-panel" className="border-t border-line bg-surface-2">
          <Container className="flex flex-col gap-2.5 pt-4 pb-5">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="check-q" className="text-[15px] font-bold">
                Check another article
              </label>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface">
                <X size={18} aria-hidden />
              </button>
            </div>
            <CheckInput id="check-q" autoFocus hint="Works with a link, pasted text or keywords — we figure out which. Pasted text is read on your device first." onDone={() => setOpen(false)} />
          </Container>
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <Container className="flex flex-wrap justify-between gap-4 py-6 text-[13px] text-muted">
        <span>{BRAND.name} · Built with Firebase AI Logic</span>
        <nav aria-label="Footer" className="flex gap-4">
          <Link to="/about#privacy" className="text-muted">
            Privacy
          </Link>
          <Link to="/about" className="text-muted">
            About
          </Link>
          <Link to="/settings" className="text-muted">
            Settings
          </Link>
        </nav>
      </Container>
    </footer>
  );
}

/** Sets the document title for a page. */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · ${BRAND.name}`;
  }, [title]);
}
