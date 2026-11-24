import { z } from "zod";

export const Status = z.enum(["current", "moved_on", "disputed", "not_news"]);
export type Status = z.infer<typeof Status>;

/** UI-only statuses on top of `Status` (DESIGN.md §3). */
export type DisplayStatus = Status | "checking" | "unavailable";

export const Inference = z.enum(["on_device", "cloud"]);
export type Inference = z.infer<typeof Inference>;

export const Claim = z.object({
  subject: z.string().min(1).max(200),
  predicate: z.string().min(1).max(200),
  value: z.string().min(1).max(200),
  asOf: z.string().optional(),
});
export type Claim = z.infer<typeof Claim>;

export const ChangeReason = z.enum(["revised", "contradicted", "overtaken"]);
export type ChangeReason = z.infer<typeof ChangeReason>;

export const Change = z.object({
  fact: z.string(),
  oldValue: z.string(),
  newValue: z.string(),
  reason: ChangeReason,
  sourceUrl: z.string().optional(),
  date: z.string().optional(),
  citeIds: z.array(z.string()).optional(),
});
export type Change = z.infer<typeof Change>;

export const Source = z.object({
  url: z.string(),
  publisher: z.string(),
  title: z.string().optional(),
  publishedAt: z.string().optional(),
});
export type Source = z.infer<typeof Source>;

/** API grounding object (docs/API.md → Grounding object). */
export const Grounding = z.object({
  searchEntryPointHtml: z.string().optional(),
  chunks: z.array(z.object({ uri: z.string(), title: z.string() })),
  supports: z.array(z.object({ start: z.number(), end: z.number(), chunkIndices: z.array(z.number()) })).optional(),
});
export type Grounding = z.infer<typeof Grounding>;

/** Article metadata that may leave the device. Never includes article text (hard rule 5). */
export const ArticleMeta = z.object({
  url: z.string(),
  title: z.string(),
  publisher: z.string().optional(),
  publishedAt: z.string().optional(),
});
export type ArticleMeta = z.infer<typeof ArticleMeta>;

/** What the extractor / paste box produces. `text` stays in memory on the device. */
export type ExtractedArticle = ArticleMeta & {
  canonicalUrl?: string;
  lang?: string;
  text: string;
  isProbablyArticle: boolean;
};
