import type { Inference } from "../schemas";
import { Skeleton } from "./primitives";
import { InferenceBadge } from "./status";

const W = ["Who", "What", "When", "Where", "Why"] as const;

/** Split READER_V1 output into a TL;DR and the 5W rows. */
export function parseSummary(text: string): { tldr: string; rows: { k: string; v: string }[] } {
  const rows: { k: string; v: string }[] = [];
  const rest: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/^[\s*•-]+/, "").replace(/\*\*/g, "").trim();
    const m = /^(Who|What|When|Where|Why)\s*[:—–-]\s*(.+)$/i.exec(line);
    if (m) rows.push({ k: W.find((w) => w.toLowerCase() === m[1]!.toLowerCase())!, v: m[2]! });
    else if (line) rest.push(line);
  }
  return { tldr: rest.join(" "), rows };
}

/** TL;DR + 5W rows, streaming with a soft caret (DESIGN.md §5 SummaryBlock). */
export function SummaryBlock({ text, inference, done, title = "In short" }: { text: string; inference?: Inference; done: boolean; title?: string }) {
  const { tldr, rows } = parseSummary(text);
  return (
    <section className="flex flex-col gap-2.5" aria-busy={!done}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-[13px] font-semibold">{title}</h2>
        {inference && <InferenceBadge inference={inference} />}
      </div>
      {!text && !done ? (
        <div className="flex flex-col gap-2 py-1">
          <Skeleton className="h-2.5 w-[90%]" />
          <Skeleton className="h-2.5 w-[70%]" />
        </div>
      ) : (
        <p className="m-0 text-sm leading-normal text-fg-2">
          {tldr || (done ? "No summary available for this page." : "")}
          {!done && <span aria-hidden className="ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 bg-primary" />}
        </p>
      )}
      {rows.length > 0 && (
        <dl className="m-0 grid grid-cols-[64px_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-[13px]">
          {rows.map((r) => (
            <div key={r.k} className="contents">
              <dt className="text-muted">{r.k}</dt>
              <dd className="m-0">{r.v}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
