/** Normalization helpers for ingest + search (docs/GRAPHRAG.md §3.2). */
import { createHash } from "node:crypto";
import { slug } from "@threadnews/shared/graph";

const TRACKING = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$|cmpid$|ocid$)/i;

export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    return u.toString().replace(/\/$/, "");
  } catch {
    return raw.trim();
  }
}

export const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);
export const urlHash = (url: string) => sha(canonicalUrl(url));

const HONORIFICS = /\b(president|prime minister|pm|mr|mrs|ms|dr|sir|minister|ceo|senator|gov|governor)\b\.?/g;

export const normName = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(HONORIFICS, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Synonym → canonical predicate. ponytail: tiny hand list, grow it from eval misses. */
const PREDICATES: Record<string, string> = {
  deaths: "death toll", fatalities: "death toll", killed: "death toll", dead: "death toll", "number of deaths": "death toll",
  injured: "injuries", wounded: "injuries",
  cost: "price", "price tag": "price",
  "deal status": "status", outcome: "status",
  "chief executive": "ceo", "chief executive officer": "ceo",
};
export const canonicalPredicate = (p: string) => {
  const n = normName(p);
  return PREDICATES[n] ?? n;
};

/** Identity of a fact across time (docs/architecture/03-data-model.md). */
export const factKey = (c: { subject: string; predicate: string }) => `${slug(c.subject)}::${slug(canonicalPredicate(c.predicate))}`;

export const normValue = (v: string) => v.toLowerCase().replace(/[\s,]+/g, " ").replace(/^\$/, "").trim();

export function cosine(a?: number[], b?: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export const jaccard = <T>(a: Iterable<T>, b: Iterable<T>) => {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 0;
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return n / (A.size + B.size - n);
};

/** |A∩B| / min(|A|,|B|): fair when one side (a story's accumulated entities) keeps growing. */
export const overlap = <T>(a: Iterable<T>, b: Iterable<T>) => {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return n / Math.min(A.size, B.size);
};

/** ~4 chars per token (docs/GRAPHRAG.md §4.5). */
export const tokens = (s: string) => Math.ceil(s.length / 4);

/** Firestore Timestamp | Date | string → ISO string. */
export const iso = (v: unknown): string | undefined =>
  v == null ? undefined : typeof v === "string" ? v : v instanceof Date ? v.toISOString() : typeof (v as { toDate?: unknown }).toDate === "function" ? (v as { toDate(): Date }).toDate().toISOString() : undefined;
