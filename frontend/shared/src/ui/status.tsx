import { CircleCheck, Cloud, CloudOff, FileText, History, LoaderCircle, Scale, Zap, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { ChangeReason, DisplayStatus, Inference } from "../schemas";
import { cx, Pill } from "./primitives";

/** Status system: always icon + label, never color alone (DESIGN.md §3). No truth verdicts. */
export const STATUS: Record<DisplayStatus, { label: string; Icon: LucideIcon; fg: string; bg: string; spin?: boolean }> = {
  current: { label: "Still current", Icon: CircleCheck, fg: "text-current", bg: "bg-current-soft" },
  moved_on: { label: "Story has moved on", Icon: History, fg: "text-moved", bg: "bg-moved-soft" },
  disputed: { label: "Sources disagree", Icon: Scale, fg: "text-disputed", bg: "bg-disputed-soft" },
  not_news: { label: "Not a news article", Icon: FileText, fg: "text-muted", bg: "bg-surface" },
  checking: { label: "Checking…", Icon: LoaderCircle, fg: "text-muted", bg: "bg-surface", spin: true },
  unavailable: { label: "Can't check right now", Icon: CloudOff, fg: "text-muted", bg: "bg-surface" },
};

export function StatusBadge({ status, size = "sm" }: { status: DisplayStatus; size?: "sm" | "lg" }) {
  const s = STATUS[status];
  return (
    <span className={cx("inline-flex w-fit items-center gap-1.5 rounded-full font-semibold", s.bg, s.fg, size === "lg" ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs")}>
      <s.Icon size={size === "lg" ? 16 : 14} aria-hidden className={s.spin ? "animate-spin" : undefined} />
      {s.label}
    </span>
  );
}

const INFERENCE_TIP: Record<Inference, string> = {
  on_device: "Ran on your computer — the article never left your browser.",
  cloud: "Ran in the cloud. Only the headline and key claims were sent.",
};

export function InferenceBadge({ inference, onWhite = false, label }: { inference: Inference; onWhite?: boolean; label?: string }) {
  const device = inference === "on_device";
  const Icon = device ? Zap : Cloud;
  return (
    <span
      title={INFERENCE_TIP[inference]}
      className={cx(
        "inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        onWhite ? "bg-bg" : device ? "bg-current-soft" : "bg-primary-soft",
        device ? "text-current" : "text-primary",
      )}
    >
      <Icon size={12} aria-hidden />
      {label ?? (device ? "On-device" : "Cloud")}
      <span className="sr-only">. {INFERENCE_TIP[inference]}</span>
    </span>
  );
}

const REASON: Record<ChangeReason, { label: string; tone: "moved" | "disputed" | "primary" }> = {
  revised: { label: "Revised", tone: "moved" },
  contradicted: { label: "Contradicted", tone: "disputed" },
  overtaken: { label: "Overtaken", tone: "primary" },
};

export function ReasonChip({ reason }: { reason: ChangeReason }) {
  const r = REASON[reason];
  return <Pill tone={r.tone}>{r.label}</Pill>;
}

/** Top of the side panel / result page (DESIGN.md §5 StatusHero). */
export function StatusHero({ status, label, summary, meta, children }: { status: DisplayStatus; label?: string; summary?: ReactNode; meta?: ReactNode; children?: ReactNode }) {
  const s = STATUS[status];
  const big = status === "current" || status === "moved_on" || status === "disputed";
  return (
    <section aria-live="polite" className={cx("flex flex-col gap-2 rounded-xl p-4", s.bg)}>
      <div className="flex items-center gap-2">
        <s.Icon size={big ? 22 : 20} aria-hidden className={cx(s.fg, s.spin && "animate-spin")} />
        <span className={cx(big ? "text-lg font-bold" : "text-base font-semibold text-fg-2", big && s.fg)}>{label ?? s.label}</span>
      </div>
      {summary && <p className="m-0 text-sm leading-[1.45] text-fg-2">{summary}</p>}
      {meta && <div className="flex flex-wrap items-center gap-1.5">{meta}</div>}
      {children}
    </section>
  );
}
