import { z } from "zod";
import { Change, Claim, Inference, Status } from "./core";

/** Mirrors docs/architecture/03-data-model.md. Timestamps are converted to ISO strings on read. */
export const StoryDoc = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  status: Status,
  lastUpdatedAt: z.string(),
  lastCheckedAt: z.string().optional(),
  followerCount: z.number().optional(),
  communityId: z.string().optional(),
  entityIds: z.array(z.string()).default([]),
});
export type StoryDoc = z.infer<typeof StoryDoc>;

export const EventDoc = z.object({
  id: z.string(),
  storyId: z.string(),
  date: z.string(),
  headline: z.string(),
  description: z.string().optional(),
  sourceIds: z.array(z.string()).default([]),
});
export type EventDoc = z.infer<typeof EventDoc>;

export const ClaimDoc = z.object({
  id: z.string(),
  storyId: z.string(),
  eventId: z.string(),
  claimKey: z.string(),
  subject: z.string(),
  predicate: z.string(),
  value: z.string(),
  asOf: z.string().optional(),
  status: z.enum(["current", "superseded", "disputed"]),
  supersededBy: z.string().optional(),
  reason: z.enum(["revised", "contradicted", "overtaken"]).optional(),
  sourceIds: z.array(z.string()).default([]),
});
export type ClaimDoc = z.infer<typeof ClaimDoc>;

export const EntityDoc = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["person", "org", "place", "thing"]),
  description: z.string().optional(),
  communityId: z.string().optional(),
});
export type EntityDoc = z.infer<typeof EntityDoc>;

export const SourceDoc = z.object({
  id: z.string(),
  url: z.string(),
  publisher: z.string(),
  title: z.string().optional(),
  publishedAt: z.string().optional(),
  storyId: z.string().optional(),
});
export type SourceDoc = z.infer<typeof SourceDoc>;

/** What a client may write to users/{uid}/checks (matches `validCheck` in firestore.rules). */
export const ClientCheckDoc = z.object({
  articleUrl: z.string().max(2048),
  urlHash: z.string(),
  headline: z.string().max(300),
  publisher: z.string().optional(),
  publishedAt: z.string().optional(),
  claims: z.array(Claim).max(30),
  entities: z.array(z.string()).max(20),
  storyId: z.string().nullable(),
  result: z.object({ status: Status, changes: z.array(Change), summary: z.string().optional() }),
  inference: Inference,
  source: z.enum(["graph_check", "gatekeeper_only"]),
});
export type ClientCheckDoc = z.infer<typeof ClientCheckDoc>;

export const UserSettings = z.object({
  onDeviceEnabled: z.boolean(),
  readingLevel: z.enum(["standard", "simple"]),
  theme: z.enum(["system", "light", "dark"]),
});
export type UserSettings = z.infer<typeof UserSettings>;
