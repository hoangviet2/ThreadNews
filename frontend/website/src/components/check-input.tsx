import { buttonClass } from "@threadnews/shared/ui";
import { Search } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";

export type ParsedInput = { kind: "url"; url: string } | { kind: "text"; title: string; text: string } | { kind: "keywords"; query: string };

/** Link, pasted article text, or keywords to explore (docs/WEBSITE.md "Paste-a-link flow"). */
export function parseInput(raw: string): ParsedInput | null {
  const v = raw.trim();
  if (v.length < 2) return null;
  if (/^https?:\/\/\S+$/i.test(v)) {
    try {
      return { kind: "url", url: new URL(v).toString() };
    } catch {
      return null;
    }
  }
  // Short, single line, no sentence break → keywords (a lone headline explores too).
  if (!v.includes("\n") && v.split(/\s+/).length <= 12 && v.length <= 100 && !/[.!?]\s+\S/.test(v)) return { kind: "keywords", query: v };
  if (v.length < 20) return { kind: "keywords", query: v };
  const firstLine = v.split("\n")[0]!.trim();
  const title = firstLine.length <= 160 ? firstLine : (/^.{20,160}?[.!?](\s|$)/.exec(v)?.[0] ?? v.slice(0, 120)).trim();
  return { kind: "text", title, text: v };
}

export function inputTarget(p: ParsedInput): { to: string; state?: { text: string } } {
  if (p.kind === "url") return { to: `/check?u=${encodeURIComponent(p.url)}` };
  if (p.kind === "keywords") return { to: `/explore?q=${encodeURIComponent(p.query)}` };
  return { to: "/check", state: { text: p.text } };
}

/** The one input box: link, text or keywords (design: Landing hero + header "Check another article" panel). */
export function CheckInput({ id, label, hint, autoFocus, onDone }: { id: string; label?: string; hint?: string; autoFocus?: boolean; onDone?: () => void }) {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const p = parseInput(value);
    if (!p) return setError("Paste a news link or text, or type a few keywords.");
    const t = inputTarget(p);
    setValue("");
    onDone?.();
    navigate(t.to, { state: t.state });
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) submit();
  };

  return (
    <form role="search" onSubmit={submit} className="flex flex-col gap-2.5" noValidate>
      {label && (
        <label htmlFor={id} className="text-[13px] font-semibold">
          {label}
        </label>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-[1_1_280px] items-start gap-2.5 rounded-3xl border border-line bg-bg px-[18px] py-[13px] focus-within:border-primary">
          <Search size={20} aria-hidden className="mt-0.5 shrink-0 text-muted" />
          <textarea
            id={id}
            rows={2}
            value={value}
            autoFocus={autoFocus}
            onChange={(e) => (setValue(e.target.value), setError(null))}
            onKeyDown={onKey}
            placeholder="Paste a link or a paragraph, or type keywords"
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
            className="min-w-0 flex-1 resize-y border-none bg-transparent text-[15px] leading-normal text-fg outline-none placeholder:text-muted"
          />
        </div>
        <button type="submit" className={buttonClass("primary", "lg")}>
          Check
        </button>
      </div>
      {error ? (
        <span id={`${id}-error`} role="alert" className="text-[13px] text-disputed">
          {error}
        </span>
      ) : (
        hint && (
          <span id={`${id}-hint`} className="text-xs text-muted">
            {hint}
          </span>
        )
      )}
    </form>
  );
}

/** Topics the reader checks most, kept on this device (homepage "Your topics"). */
const TOPICS_KEY = "tn.topics";
export function recordTopics(store: { get(k: string): string | null; set(k: string, v: string): void }, entities: string[]) {
  if (!entities.length) return;
  let counts: Record<string, number> = {};
  try {
    counts = JSON.parse(store.get(TOPICS_KEY) ?? "{}") as Record<string, number>;
  } catch {
    /* reset */
  }
  for (const e of new Set(entities.map((x) => x.trim()).filter(Boolean))) counts[e] = (counts[e] ?? 0) + 1;
  store.set(TOPICS_KEY, JSON.stringify(counts));
}
export function topTopics(store: { get(k: string): string | null }, n = 6): { name: string; count: number }[] {
  try {
    return Object.entries(JSON.parse(store.get(TOPICS_KEY) ?? "{}") as Record<string, number>)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([name, count]) => ({ name, count }));
  } catch {
    return [];
  }
}
