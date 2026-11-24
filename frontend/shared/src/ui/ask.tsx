import { ArrowRight } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { errorCopy } from "../api/client";
import { getOnDeviceStatus } from "../ai/ondevice";
import { useAsk, useAuth } from "../react/hooks";
import type { Inference } from "../schemas";
import { cx, Skeleton } from "./primitives";
import { InferenceBadge } from "./status";

/** Single-turn question about the current story; shows ⚡/☁️ (DESIGN.md §5 AskBox). */
export function AskBox({ storyId, size = "panel", initialQuestion = "" }: { storyId: string | null | undefined; size?: "panel" | "page"; initialQuestion?: string }) {
  const [q, setQ] = useState(initialQuestion);
  const ask = useAsk(storyId);
  const { tier, signIn } = useAuth();
  const id = useId();
  const [expected, setExpected] = useState<Inference>("cloud");
  useEffect(() => {
    void getOnDeviceStatus().then((s) => setExpected(s === "available" ? "on_device" : "cloud"));
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim() && storyId) ask.mutate(q.trim());
  };
  const page = size === "page";
  const disabled = !storyId;

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submit} className={cx("flex items-center gap-2 rounded-full border border-line focus-within:border-primary", page ? "h-13 pr-1.5 pl-[18px]" : "h-11 pr-1.5 pl-3.5")}>
        <label htmlFor={id} className="sr-only">
          Ask about this story
        </label>
        <input
          id={id}
          type="text"
          value={q}
          maxLength={500}
          onChange={(e) => setQ(e.target.value)}
          disabled={disabled}
          placeholder={disabled ? "Check a story to ask about it" : "Ask about this story…"}
          className={cx("min-w-0 flex-1 border-none bg-transparent text-fg outline-none placeholder:text-muted", page ? "text-[15px]" : "text-sm")}
        />
        {page ? (
          <button type="submit" disabled={disabled || !q.trim() || ask.isPending} className="h-10 shrink-0 rounded-full bg-primary px-[18px] text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-60">
            Ask
          </button>
        ) : (
          <>
            <InferenceBadge inference={ask.data?.inference ?? expected} />
            <button type="submit" aria-label="Ask" disabled={disabled || !q.trim() || ask.isPending} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-primary hover:bg-primary-tint disabled:opacity-40">
              <ArrowRight size={16} aria-hidden />
            </button>
          </>
        )}
      </form>

      {ask.isPending && (
        <div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-4" aria-busy>
          <Skeleton className="h-2.5 w-[85%]" />
          <Skeleton className="h-2.5 w-[60%]" />
        </div>
      )}
      {ask.isError && (
        <div className="rounded-xl bg-surface-2 p-4 text-sm text-fg-2">
          {ask.error.code === "tier_required" ? (
            <>
              Answers about the bigger picture need an account.{" "}
              <button type="button" className="font-semibold text-primary hover:underline" onClick={() => signIn.mutate()}>
                Sign in — free
              </button>
            </>
          ) : (
            errorCopy(ask.error, tier)
          )}
        </div>
      )}
      {ask.data && !ask.isPending && (
        <div aria-live="polite" className="flex flex-col gap-2 rounded-xl bg-surface-2 p-4">
          <div className="flex items-center gap-2">
            <InferenceBadge inference={ask.data.inference} />
            <span className="text-xs text-muted">{ask.data.mode === "global" ? "Answered from related stories" : "Answered from the story map"}</span>
          </div>
          <p className={cx("m-0 leading-relaxed text-fg-2", page ? "text-[15px]" : "text-sm")}>{ask.data.answer}</p>
          {ask.data.citations.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {ask.data.citations.map((c, i) =>
                c.href ? (
                  <a key={i} href={c.href} target="_blank" rel="noopener noreferrer" className="rounded-full border border-line px-2 py-0.5 text-[11px] text-fg-2 no-underline hover:bg-surface">
                    {c.label}
                  </a>
                ) : (
                  <span key={i} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
                    {c.label}
                  </span>
                ),
              )}
            </div>
          )}
          {ask.data.upgradeForGlobal && (
            <span className="text-xs text-muted">
              This looks like a bigger-picture question.{" "}
              <button type="button" className="font-semibold text-primary hover:underline" onClick={() => signIn.mutate()}>
                Sign in
              </button>{" "}
              for answers that look across related stories.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
