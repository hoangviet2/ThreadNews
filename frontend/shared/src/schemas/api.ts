import { z } from "zod";
import { Change, Claim, Grounding, Source, Status } from "./core";

export const Tier = z.enum(["guest", "member"]);
export type Tier = z.infer<typeof Tier>;

export const Feature = z.enum(["retrieve", "check", "explainer", "ask", "follows"]);
export type Feature = z.infer<typeof Feature>;

export const Usage = z.object({
  feature: Feature,
  used: z.number(),
  limit: z.number(),
  resetAt: z.string(),
});
export type Usage = z.infer<typeof Usage>;

export const Me = z.object({
  uid: z.string(),
  tier: Tier,
  limits: z.object({ retrieve: z.number(), check: z.number(), explainer: z.number(), ask: z.number(), follows: z.number() }),
  usage: z.object({ retrieve: z.number(), check: z.number(), explainer: z.number(), ask: z.number() }),
  resetAt: z.string(),
  features: z.object({ globalSearch: z.boolean(), graphView: z.boolean() }).partial().optional(),
});
export type Me = z.infer<typeof Me>;

export const RetrieveRequest = z.object({
  mode: z.enum(["local", "global"]),
  headline: z.string().max(300),
  claims: z.array(Claim).max(30),
  entities: z.array(z.string().max(120)).max(20),
  question: z.string().max(500).nullable(),
  storyId: z.string().nullable(),
  budget: z.enum(["device", "cloud"]),
});
export type RetrieveRequest = z.infer<typeof RetrieveRequest>;

export const RetrieveResponse = z.object({
  storyId: z.string().nullable(),
  matchScore: z.number().optional(),
  fresh: z.boolean().optional(),
  lastUpdatedAt: z.string().optional(),
  context: z.string().optional(),
  nodeIds: z.array(z.string()).optional(),
  tokenEstimate: z.number().optional(),
});
export type RetrieveResponse = z.infer<typeof RetrieveResponse>;

/** POST /v1/graph/search — explore stories by keywords (BACKEND.md §4). */
export const SearchRequest = z.object({ query: z.string().trim().min(2).max(200) });
export type SearchRequest = z.infer<typeof SearchRequest>;

export const SearchHit = z.object({
  storyId: z.string(),
  title: z.string(),
  summary: z.string(),
  status: Status,
  lastUpdatedAt: z.string(),
  score: z.number(),
});
export type SearchHit = z.infer<typeof SearchHit>;

export const SearchResponse = z.object({ items: z.array(SearchHit) });
export type SearchResponse = z.infer<typeof SearchResponse>;

export const CheckRequest = z.object({
  articleUrl: z.string().max(2048),
  headline: z.string().max(300),
  publisher: z.string().max(200).optional(),
  publishedAt: z.string().optional(),
  claims: z.array(Claim).max(30),
  entities: z.array(z.string().max(120)).max(20),
  storyId: z.string().optional(),
});
export type CheckRequest = z.infer<typeof CheckRequest>;

export const CheckResponse = z.object({
  storyId: z.string(),
  status: z.enum(["current", "moved_on", "disputed"]),
  summary: z.string(),
  changes: z.array(Change),
  sources: z.array(Source),
  grounding: Grounding.nullable(),
  cached: z.boolean(),
  checkedAt: z.string(),
  checkId: z.string().optional(),
  usage: Usage.optional(),
});
export type CheckResponse = z.infer<typeof CheckResponse>;

export const ExplainerSection = z.discriminatedUnion("id", [
  z.object({ id: z.literal("what_changed"), title: z.string(), body: z.string(), citations: z.array(z.number()) }),
  z.object({ id: z.literal("background"), title: z.string(), body: z.string(), citations: z.array(z.number()) }),
  z.object({ id: z.literal("bigger_picture"), title: z.string(), body: z.string(), citations: z.array(z.number()), topic: z.string().optional() }),
  z.object({ id: z.literal("known_disputed"), title: z.string(), items: z.array(z.object({ text: z.string(), state: z.enum(["known", "disputed"]) })) }),
  z.object({ id: z.literal("glossary"), title: z.string(), items: z.array(z.object({ term: z.string(), definition: z.string() })) }),
]);
export type ExplainerSection = z.infer<typeof ExplainerSection>;

export const Explainer = z.object({
  storyId: z.string(),
  generatedAt: z.string(),
  basedOnEventId: z.string(),
  stale: z.boolean(),
  sections: z.array(ExplainerSection),
  grounding: Grounding.nullable(),
  usage: Usage.optional(),
});
export type Explainer = z.infer<typeof Explainer>;

export const AskRequest = z.object({
  storyId: z.string(),
  question: z.string().min(1).max(500),
  mode: z.enum(["auto", "local", "global"]),
});
export type AskRequest = z.infer<typeof AskRequest>;

export const AskCitation = z.union([
  z.object({ nodeId: z.string(), label: z.string() }),
  z.object({ sourceUrl: z.string() }),
]);
export type AskCitation = z.infer<typeof AskCitation>;

export const AskResponse = z.object({
  answer: z.string(),
  mode: z.enum(["local", "global"]),
  citations: z.array(AskCitation),
  grounding: Grounding.nullable(),
  usage: Usage.optional(),
});
export type AskResponse = z.infer<typeof AskResponse>;

export const FollowItem = z.object({
  storyId: z.string(),
  title: z.string(),
  status: Status,
  lastUpdatedAt: z.string(),
  unread: z.boolean(),
});
export type FollowItem = z.infer<typeof FollowItem>;

export const FollowsResponse = z.object({ items: z.array(FollowItem) });
export type FollowsResponse = z.infer<typeof FollowsResponse>;

export const ErrorCode = z.enum([
  "invalid_argument",
  "unauthenticated",
  "app_check_failed",
  "tier_required",
  "not_found",
  "not_generated",
  "conflict",
  "quota_exceeded",
  "rate_limited",
  "upstream_error",
  "budget_exhausted",
  "maintenance",
  // client-side only
  "network",
  "demo_unavailable",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiErrorBody = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.record(z.string(), z.unknown()).optional() }),
});

export type ApiError = { code: ErrorCode; message: string; status: number; details?: Record<string, unknown> };
