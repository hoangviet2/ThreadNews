import { z } from "zod";
import { Change, Claim } from "./core";

/** GATEKEEPER_V1 output (docs/PROMPTS.md §1). */
export const GatekeeperResult = z.object({
  isNews: z.boolean(),
  timeSensitive: z.boolean(),
  needsCheck: z.boolean(),
  topic: z.string().max(120),
  claims: z.array(Claim).max(8),
  entities: z.array(z.string()).max(10),
  reason: z.string().max(240),
});
export type GatekeeperResult = z.infer<typeof GatekeeperResult>;

/** GRAPH_CHECK_V1 output — on-device graph check never says not_news. */
export const CheckResult = z.object({
  status: z.enum(["current", "moved_on", "disputed"]),
  summary: z.string().max(300),
  changes: z.array(Change).max(5),
});
export type CheckResult = z.infer<typeof CheckResult>;

export const AskRoute = z.object({ mode: z.enum(["local", "global"]) });
export type AskRoute = z.infer<typeof AskRoute>;

export const AskAnswer = z.object({
  answer: z.string().max(1200),
  citations: z.array(z.string()).max(12),
  confident: z.boolean(),
});
export type AskAnswer = z.infer<typeof AskAnswer>;
