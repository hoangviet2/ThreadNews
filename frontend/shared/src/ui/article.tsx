import { formatDateTime, relativeTime } from "../format";
import type { ArticleMeta } from "../schemas";
import { cx } from "./primitives";

const TINTS = ["bg-primary-soft text-primary", "bg-current-soft text-current", "bg-disputed-soft text-disputed", "bg-moved-soft text-moved", "bg-surface text-muted"];

/** Publisher square — a local stand-in for favicons (no remote image requests). */
export function Favicon({ name, size = 16 }: { name: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span aria-hidden style={{ width: size, height: size, fontSize: Math.round(size * 0.6) }} className={cx("inline-flex shrink-0 items-center justify-center rounded font-bold leading-none", TINTS[h % TINTS.length])}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function ArticleRow({ article }: { article: ArticleMeta }) {
  const meta = [article.publisher, formatDateTime(article.publishedAt), relativeTime(article.publishedAt)].filter(Boolean).join(" · ");
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5">
        <Favicon name={article.publisher ?? article.title} size={20} />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        {meta && <span className="text-xs text-muted">{meta}</span>}
        <span className="text-sm leading-[1.35] font-semibold break-words">{article.title}</span>
      </div>
    </div>
  );
}
