import { useState } from "react";
import { formatDate, hostname } from "../format";
import type { Grounding, Source } from "../schemas";
import { Favicon } from "./article";
import { cx } from "./primitives";

/** Merge API sources with grounding chunks, deduped by URL. */
export function mergeSources(sources: Source[], grounding: Grounding | null): Source[] {
  const out = [...sources];
  for (const c of grounding?.chunks ?? []) if (!out.some((s) => s.url === c.uri)) out.push({ url: c.uri, publisher: c.title || hostname(c.uri) });
  return out;
}

/**
 * Google Search suggestions, rendered as-is in a sandboxed iframe: no scripts, popups allowed so
 * links open (CLAUDE.md hard rule 6, docs/architecture/06-security-privacy.md). Never behind a toggle.
 */
export function SearchSuggestions({ html, bordered = true }: { html: string; bordered?: boolean }) {
  return (
    <div className={cx("flex flex-col gap-2", bordered && "rounded-xl border border-line p-2.5")}>
      <span className="text-[11px] text-muted">Search suggestions</span>
      <iframe title="Google Search suggestions" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={html} className="h-12 w-full border-0 bg-transparent" referrerPolicy="no-referrer" />
    </div>
  );
}

/**
 * Sources + Search suggestions (DESIGN.md §5 SourceList). Grounded results always show both.
 * `variant="rail"` is the numbered list used beside explainers (citation chips link to #source-N).
 */
export function SourceList({ sources, grounding, initial = 3, variant = "compact" }: { sources: Source[]; grounding: Grounding | null; initial?: number; variant?: "compact" | "rail" }) {
  const all = mergeSources(sources, grounding);
  const [expanded, setExpanded] = useState(false);
  const shown = variant === "rail" || expanded ? all : all.slice(0, initial);
  const html = grounding?.searchEntryPointHtml;

  if (variant === "rail")
    return (
      <section aria-label="Sources" className="flex flex-col gap-3 rounded-2xl border border-line p-5">
        <h2 className="m-0 text-base font-bold">Sources</h2>
        {all.length === 0 ? (
          <p className="m-0 text-sm text-muted">No sources yet.</p>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-3 p-0 text-sm">
            {all.map((s, i) => (
              <li key={s.url || i} id={`source-${i}`} className="flex scroll-mt-24 gap-2.5">
                <span className="tnum w-5 shrink-0 text-muted">{i + 1}</span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-semibold no-underline hover:underline">
                      {s.publisher}
                    </a>
                  ) : (
                    <span className="font-semibold">{s.publisher}</span>
                  )}
                  <span className="text-xs text-muted">{[formatDate(s.publishedAt), s.title].filter(Boolean).join(" · ")}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
        {html && (
          <div className="border-t border-line pt-3">
            <SearchSuggestions html={html} bordered={false} />
          </div>
        )}
      </section>
    );

  return (
    <section aria-label="Sources" className="flex flex-col gap-2">
      <h2 className="m-0 text-[13px] font-semibold">{all.length ? `Backed by ${all.length} ${all.length === 1 ? "source" : "sources"}` : "Sources"}</h2>
      {all.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
          {shown.map((s, i) => (
            <li key={s.url || i} className="flex min-w-0 items-center gap-2">
              <Favicon name={s.publisher} />
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer" title={s.title} className="truncate font-medium text-fg no-underline hover:underline">
                  {s.publisher}
                </a>
              ) : (
                <span className="truncate font-medium">{s.publisher}</span>
              )}
              {s.publishedAt && <span className="shrink-0 text-muted">· {formatDate(s.publishedAt)}</span>}
            </li>
          ))}
        </ul>
      )}
      {all.length > initial && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="w-fit rounded px-0 text-left text-[13px] font-medium text-primary hover:underline">
          {expanded ? "Show fewer" : `See all ${all.length}`}
        </button>
      )}
      {html && <SearchSuggestions html={html} />}
    </section>
  );
}
