import { LogOut, Settings } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatTime } from "../format";
import { initials, useAuth, useMe } from "../react/hooks";
import { Button, cx } from "./primitives";

export function checksLeft(me?: { limits: { check: number }; usage: { check: number } }) {
  if (!me) return null;
  return { left: Math.max(0, me.limits.check - me.usage.check), limit: me.limits.check };
}

/** "2 of 3 cloud checks left today" + thin bar (DESIGN.md §5 QuotaMeter). */
export function QuotaMeter({ variant = "text" }: { variant?: "text" | "bar" }) {
  const me = useMe();
  const q = checksLeft(me.data);
  if (variant === "text") {
    if (!q) return <span className="text-xs text-muted">&nbsp;</span>;
    return (
      <span className={cx("tnum text-xs", q.left === 0 ? "font-semibold text-disputed" : "text-muted")}>
        {q.left} of {q.limit} checks left
      </span>
    );
  }
  const pct = q ? (q.left / Math.max(1, q.limit)) * 100 : 100;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted">Cloud checks today</span>
        <span className={cx("tnum font-semibold", q?.left === 0 && "text-disputed")}>{q ? `${q.left} of ${q.limit} left` : "…"}</span>
      </div>
      <div
        role="progressbar"
        aria-label="Cloud checks left today"
        aria-valuemin={0}
        aria-valuemax={q?.limit ?? 0}
        aria-valuenow={q?.left ?? 0}
        className={cx("h-1 rounded-full", q?.left === 0 ? "bg-disputed-soft" : "bg-primary-soft")}
      >
        <div className="h-1 rounded-full bg-g-blue transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Guest: "Guest · Sign in". Member: avatar + menu (DESIGN.md §5 AccountChip). */
export function AccountChip({ settingsHref, onSettings, size = 32 }: { settingsHref?: string; onSettings?: () => void; size?: number }) {
  const { user, tier, signIn, signOut, unavailableReason, kind } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (tier === "guest")
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">Guest</span>
        <Button variant="secondary" size="sm" className="h-8 px-3" loading={signIn.isPending} disabled={!!unavailableReason} title={unavailableReason ?? undefined} onClick={() => signIn.mutate()}>
          {kind === "demo" ? "Sign in (demo)" : "Sign in"}
        </Button>
      </div>
    );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ width: size, height: size }}
        className="inline-flex items-center justify-center overflow-hidden rounded-full bg-primary-soft text-[13px] font-semibold text-primary"
      >
        {user?.photoURL ? <img src={user.photoURL} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : initials(user)}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-line bg-bg p-1.5 shadow-lg">
          <div className="px-2.5 py-2">
            <div className="truncate text-sm font-semibold">{user?.displayName ?? "Signed in"}</div>
            {user?.email && <div className="truncate text-xs text-muted">{user.email}</div>}
          </div>
          {(settingsHref || onSettings) && (
            <MenuItem href={settingsHref} onClick={() => (setOpen(false), onSettings?.())}>
              <Settings size={16} aria-hidden /> Settings
            </MenuItem>
          )}
          <MenuItem onClick={() => (setOpen(false), signOut.mutate())}>
            <LogOut size={16} aria-hidden /> Sign out
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({ href, onClick, children }: { href?: string; onClick?: () => void; children: ReactNode }) {
  const cls = "flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm text-fg no-underline hover:bg-surface-2 hover:text-fg";
  return href ? (
    <a role="menuitem" href={href} onClick={onClick} className={cls}>
      {children}
    </a>
  ) : (
    <button role="menuitem" type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

/** Inline card, never a modal: benefit-first copy + "Sign in with Google" (DESIGN.md §5 UpgradePrompt). */
export function UpgradePrompt({ title, benefits, resetAt, compact = false }: { title: string; benefits?: string[]; resetAt?: string; compact?: boolean }) {
  const { signIn, unavailableReason, kind } = useAuth();
  return (
    <section className={cx("flex flex-col rounded-xl border border-line", compact ? "gap-2.5 p-3.5" : "gap-3 p-4")}>
      <span className={cx("font-bold", compact ? "text-sm" : "text-base")}>{title}</span>
      {benefits && (
        <ul className="m-0 pl-[18px] text-[13px] leading-[1.6] text-fg-2">
          {benefits.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      <Button size={compact ? "sm" : "md"} loading={signIn.isPending} disabled={!!unavailableReason} onClick={() => signIn.mutate()}>
        {kind === "demo" ? "Sign in (demo) — free" : "Sign in with Google — free"}
      </Button>
      {unavailableReason && <span className="text-center text-xs text-muted">{unavailableReason}</span>}
      {signIn.isError && <span className="text-center text-xs text-disputed">Sign-in didn't finish. Try again.</span>}
      {resetAt && <span className="text-center text-xs text-muted">Or come back after {formatTime(resetAt)}, when guest checks reset.</span>}
    </section>
  );
}

export const MEMBER_BENEFITS = ["50 cloud checks a day", "Follow stories and get updates", "Full explainers and deeper answers"];
