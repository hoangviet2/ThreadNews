/**
 * Injected on demand into the active tab with chrome.scripting.executeScript (activeTab + scripting).
 * Runs Readability on a cloned DOM and returns an ExtractedArticle. Bundled — no remote code.
 * The text is returned to the side panel only; it is never stored or sent to our API.
 */
import { isProbablyReaderable, Readability } from "@mozilla/readability";
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";

const MAX_CHARS = 24_000; // ≈ 6k tokens

function meta(...names: string[]): string | undefined {
  for (const n of names) {
    const el = document.querySelector<HTMLMetaElement>(`meta[property="${n}"], meta[name="${n}"], meta[itemprop="${n}"]`);
    const v = el?.content?.trim();
    if (v) return v;
  }
  return undefined;
}

function jsonLd(): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const v = JSON.parse(s.textContent ?? "null") as unknown;
      const items = Array.isArray(v) ? v : (v as { "@graph"?: unknown[] })?.["@graph"] ?? [v];
      for (const it of items) if (it && typeof it === "object") out.push(it as Record<string, unknown>);
    } catch {
      /* ignore malformed */
    }
  }
  return out;
}

export default defineUnlistedScript(() => {
  const ld = jsonLd().find((x) => /Article|Report|Posting/i.test(String(x["@type"] ?? "")));
  const ldPublisher = ld?.publisher as { name?: string } | undefined;
  const publishedAt =
    (typeof ld?.datePublished === "string" ? ld.datePublished : undefined) ??
    meta("article:published_time", "datePublished", "pubdate", "date") ??
    document.querySelector("time[datetime]")?.getAttribute("datetime") ??
    undefined;

  const readerable = isProbablyReaderable(document);
  const parsed = new Readability(document.cloneNode(true) as Document).parse();
  const text = (parsed?.textContent ?? document.body?.innerText ?? "").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_CHARS);
  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;

  return {
    url: location.href,
    canonicalUrl: canonical && canonical.startsWith("http") ? canonical : undefined,
    title: (meta("og:title", "twitter:title") ?? parsed?.title ?? document.title ?? "").trim().slice(0, 300),
    publisher: (ldPublisher?.name ?? meta("og:site_name", "application-name") ?? parsed?.siteName ?? location.hostname.replace(/^www\./, ""))?.trim(),
    publishedAt: publishedAt && !Number.isNaN(Date.parse(publishedAt)) ? new Date(publishedAt).toISOString() : undefined,
    lang: document.documentElement.lang || undefined,
    text,
    isProbablyArticle: readerable || meta("og:type") === "article" || !!ld,
  };
});
