import type { ReactNode } from "react";
import { formatDate } from "../format";
import type { ClaimDoc, EventDoc } from "../schemas";
import { cx, Pill } from "./primitives";

/** Strike superseded values inside an event headline ("…after a ~~$4M~~ repair"). */
function strike(headline: string, values: string[]): ReactNode {
  const v = values.filter((x) => x && headline.includes(x)).sort((a, b) => headline.indexOf(a) - headline.indexOf(b));
  if (!v.length) return headline;
  const out: ReactNode[] = [];
  let rest = headline;
  v.forEach((x, k) => {
    const i = rest.indexOf(x);
    if (i < 0) return;
    out.push(rest.slice(0, i), <s key={k} className="text-muted" aria-label={`${x}, since revised`}>{x}</s>);
    rest = rest.slice(i + x.length);
  });
  out.push(rest);
  return <>{out}</>;
}

/**
 * The thread motif: vertical line, newest at the bottom, the reader's article marked
 * "You are here" (DESIGN.md §5 Timeline, §9 Brand).
 */
export function Timeline({ events, claims = [], articleEventId, compact = false }: { events: EventDoc[]; claims?: ClaimDoc[]; articleEventId?: string; compact?: boolean }) {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return <p className="m-0 text-sm text-muted">No events yet.</p>;
  const articleIdx = articleEventId ? sorted.findIndex((e) => e.id === articleEventId) : -1;
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {sorted.map((e, i) => {
        const last = i === sorted.length - 1;
        const here = i === articleIdx;
        const past = articleIdx >= 0 && i < articleIdx;
        const dot = last ? "bg-g-green" : here ? "bg-g-red" : past ? "bg-dot-past" : "bg-g-yellow";
        const superseded = claims.filter((c) => c.eventId === e.id && c.status === "superseded").map((c) => c.value);
        return (
          <li key={e.id} className="flex gap-4">
            <div className="flex w-4 flex-col items-center">
              <span aria-hidden className={cx("shrink-0 rounded-full", dot, last ? "mt-0.5 size-4" : here ? "mt-[3px] size-3.5" : "mt-1 size-3")} />
              {!last && <span aria-hidden className="w-0.5 flex-1 bg-g-blue" />}
            </div>
            <div className={cx("flex flex-col gap-1", !last && (compact ? "pb-4" : "pb-5"))}>
              <span className="text-[13px] text-muted">
                {formatDate(e.date)}
                {last && " · latest"}
              </span>
              <span className={cx("font-semibold", compact ? "text-sm" : "text-base")}>{strike(e.headline, superseded)}</span>
              {here && <Pill tone="primary">You are here</Pill>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
