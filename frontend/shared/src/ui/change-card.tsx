import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { formatDate, hostname } from "../format";
import type { Change, Source } from "../schemas";
import { cx } from "./primitives";
import { ReasonChip } from "./status";

/** One changed fact: ~~old~~ → **new**, reason chip, source + date. Expandable (DESIGN.md §5). */
export function ChangeCard({ change, sources = [], size = "md", citeIndex }: { change: Change; sources?: Source[]; size?: "md" | "lg"; citeIndex?: number }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const src = change.sourceUrl ? sources.find((s) => s.url === change.sourceUrl) : undefined;
  const publisher = src?.publisher ?? (change.sourceUrl ? hostname(change.sourceUrl) : undefined);
  const date = formatDate(change.date ?? src?.publishedAt);
  return (
    <article className={cx("flex flex-col gap-1.5 rounded-xl border border-line", size === "lg" ? "px-4 py-3.5" : "px-3.5 py-3")}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold tracking-[0.4px] text-muted uppercase">{change.fact}</span>
        <ReasonChip reason={change.reason} />
      </div>
      <div className={cx("tnum flex flex-wrap items-baseline gap-2", size === "lg" ? "text-lg" : "text-base")} aria-label={`was ${change.oldValue}, now ${change.newValue}`}>
        <span aria-hidden className="text-muted line-through">
          {change.oldValue}
        </span>
        <span aria-hidden className="text-muted">
          →
        </span>
        <span aria-hidden className="font-bold">
          {change.newValue}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">
          {[publisher, date].filter(Boolean).join(" · ")}
          {citeIndex !== undefined && (
            <>
              {" "}
              <a href={`#source-${citeIndex}`}>[{citeIndex + 1}]</a>
            </>
          )}
        </span>
        {change.sourceUrl && (
          <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)} className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-xs font-medium text-primary hover:bg-primary-tint">
            Details
            <ChevronDown size={14} aria-hidden className={cx("transition-transform duration-150", open && "rotate-180")} />
          </button>
        )}
      </div>
      {open && change.sourceUrl && (
        <div id={id} className="border-t border-line pt-2 text-xs leading-relaxed text-fg-2">
          {publisher ?? "A source"} reported "{change.newValue}"{date ? ` on ${date}` : ""}, replacing "{change.oldValue}".{" "}
          <a href={change.sourceUrl} target="_blank" rel="noopener noreferrer">
            {src?.title ?? "Read the report"}
          </a>
        </div>
      )}
    </article>
  );
}
