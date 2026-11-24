/** Graph-side AI structured output (docs/GRAPHRAG.md §3.1). Client schemas live in @threadnews/shared/schemas. */
import { z } from "zod";
import { ChangeReason } from "@threadnews/shared/schemas";

const s = (max: number) => z.string().max(max);

export const GraphExtraction = z.object({
  story: z.object({ title: s(200), summary: s(400) }),
  events: z.array(z.object({ tempId: s(20), date: s(30), headline: s(300), description: s(400), sourceUrls: z.array(s(2048)).max(10) })).max(10),
  claims: z
    .array(
      z.object({
        tempId: s(20),
        eventTempId: s(20),
        subject: s(200),
        predicate: s(200),
        value: s(200),
        asOf: s(30).optional(),
        sourceUrls: z.array(s(2048)).max(10),
        disputedBy: z.array(s(2048)).max(10).optional(),
        replaces: z.object({ value: s(200), reason: ChangeReason }).optional(),
      }),
    )
    .max(30),
  entities: z
    .array(z.object({ tempId: s(20), name: s(120), type: z.enum(["person", "org", "place", "thing"]), description: s(300), aliases: z.array(s(120)).max(5) }))
    .max(20),
  mentions: z.array(z.object({ claimTempId: s(20).optional(), eventTempId: s(20).optional(), entityTempId: s(20) })).max(100),
  relations: z.array(z.object({ a: s(20), b: s(20), relation: s(80) })).max(40),
  sources: z.array(z.object({ url: s(2048), publisher: s(200), title: s(300), publishedAt: s(30).optional() })).max(15),
});
export type GraphExtraction = z.infer<typeof GraphExtraction>;

export const CommunitySummary = z.object({ title: s(80), summary: s(1000) });
export type CommunitySummary = z.infer<typeof CommunitySummary>;
