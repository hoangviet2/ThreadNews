const DAY = 86_400_000;

/** "Nov 22, 3:10 PM" in the user's locale (DESIGN.md §2). */
export function formatDateTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatTime(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "just now", "2 min ago", "3 h ago", "3 days ago". */
export function relativeTime(iso?: string, now = Date.now()): string {
  if (!iso) return "";
  const diff = now - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  if (diff < DAY) return `${Math.round(diff / 3_600_000)} h ago`;
  const days = Math.round(diff / DAY);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/** Relative for < 24 h, else absolute (DESIGN.md §2). */
export function smartTime(iso?: string): string {
  if (!iso) return "";
  return Date.now() - new Date(iso).getTime() < DAY ? relativeTime(iso) : formatDateTime(iso);
}

export const hostname = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** SHA-256 hex of the canonical URL — the only URL identity stored with checks. */
export async function urlHash(url: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url.trim().toLowerCase()));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Headline guess from a URL slug, for link-only checks (docs/WEBSITE.md "Paste-a-link flow"). */
export function headlineFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean).reverse().find((s) => /[a-z]-[a-z]/i.test(s)) ?? u.hostname;
    const words = decodeURIComponent(seg).replace(/\.\w+$/, "").replace(/[-_]+/g, " ").replace(/\b\d{5,}\b/g, "").trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
  } catch {
    return url.slice(0, 120);
  }
}

export const nextUtcMidnight = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();

export const utcDay = (now = new Date()) => now.toISOString().slice(0, 10);
