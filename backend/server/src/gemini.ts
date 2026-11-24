/** Gemini via @google/genai (ADR-008). Every failure surfaces as `upstream_error` (502). */
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { Grounding } from "@threadnews/shared/schemas";
import { ApiError } from "./errors";
import { env } from "./env";
import type { Rc } from "./rc";

let client: GoogleGenAI | undefined;
const ai = () => (client ??= new GoogleGenAI({ apiKey: env().GEMINI_API_KEY, httpOptions: { timeout: 20_000 } }));

type UsageMeta = { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; toolUsePromptTokenCount?: number };
export type Meter = { model: string; input: number; output: number; thoughts: number; tool: number; searches: number };
/** Every call's token use goes to the log (cost visibility); `onMeter` lets the cost eval collect them. */
export let onMeter: ((m: Meter) => void) | undefined;
export const setMeter = (fn?: (m: Meter) => void) => void (onMeter = fn);
function meter(model: string, u: UsageMeta | undefined, searches = 0) {
  const m: Meter = { model, input: u?.promptTokenCount ?? 0, output: u?.candidatesTokenCount ?? 0, thoughts: u?.thoughtsTokenCount ?? 0, tool: u?.toolUsePromptTokenCount ?? 0, searches };
  console.log(JSON.stringify({ msg: "gemini usage", ...m }));
  onMeter?.(m);
}

const upstream = (e: unknown): never => {
  if (e instanceof ApiError) throw e;
  console.error(JSON.stringify({ msg: "gemini failed", err: String(e) }));
  throw new ApiError("upstream_error");
};

/** Grounded free text + Google Search metadata (CHECK_RESEARCH / EXPLAINER research). */
/** Grounding chunks are vertexaisearch redirect links that differ per call; follow one hop to the article URL. */
async function resolveUrl(uri: string): Promise<string> {
  try {
    const r = await fetch(uri, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(3000) });
    return r.headers.get("location") ?? uri;
  } catch {
    return uri;
  }
}

export type Found = { url: string; title: string };

export async function grounded(model: string, prompt: string, temperature = 0.2, thinking: Thinking = "LOW"): Promise<{ text: string; grounding: Grounding | null; found: Found[] }> {
  try {
    const r = await ai().models.generateContent({
      model,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }], temperature, maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: thinking as never } },
    });
    const gm = r.candidates?.[0]?.groundingMetadata;
    meter(model, r.usageMetadata, gm?.webSearchQueries?.length ?? 0);
    const chunks = (gm?.groundingChunks ?? []).flatMap((c) => (c.web?.uri ? [{ uri: c.web.uri, title: c.web.title ?? c.web.domain ?? "" }] : []));
    const found = await Promise.all(chunks.map(async (c) => ({ url: await resolveUrl(c.uri), title: c.title })));
    // Chunks carry the resolved article URLs too, so sources and chunks dedupe in <SourceList> (rule 6 still shows both).
    chunks.forEach((c, i) => (c.uri = found[i]!.url));
    return {
      found,
      text: r.text ?? "",
      grounding: gm
        ? {
            searchEntryPointHtml: gm.searchEntryPoint?.renderedContent,
            chunks,
            supports: (gm.groundingSupports ?? []).map((s) => ({ start: s.segment?.startIndex ?? 0, end: s.segment?.endIndex ?? 0, chunkIndices: s.groundingChunkIndices ?? [] })),
          }
        : null,
    };
  } catch (e) {
    return upstream(e);
  }
}

type JsonSchema = { [k: string]: unknown; properties?: Record<string, JsonSchema>; items?: JsonSchema; anyOf?: JsonSchema[]; maxItems?: number; maxLength?: number };
const LIMITS = new Set(["maxLength", "minLength", "maxItems", "minItems", "additionalProperties", "$schema"]);

/** Gemini rejects schemas with many length/size limits ("too many states"): send the shape only. */
const shapeOnly = (s: unknown): unknown =>
  Array.isArray(s) ? s.map(shapeOnly) : s && typeof s === "object" ? Object.fromEntries(Object.entries(s).filter(([k]) => !LIMITS.has(k)).map(([k, v]) => [k, shapeOnly(v)])) : s;

/** Trim model output to the schema's limits before Zod validates it. */
function clamp(v: unknown, s: JsonSchema | undefined): unknown {
  if (!s) return v;
  if (s.anyOf) {
    const pick = s.anyOf.find((o) => Object.entries(o.properties ?? {}).every(([k, p]) => !("const" in p) || (v as Record<string, unknown>)?.[k] === p.const));
    return clamp(v, pick ?? s.anyOf[0]);
  }
  if (typeof v === "string") return s.maxLength ? v.slice(0, s.maxLength) : v;
  if (Array.isArray(v)) return v.slice(0, s.maxItems ?? v.length).map((x) => clamp(x, s.items));
  if (v && typeof v === "object" && s.properties) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clamp(x, s.properties![k])]));
  return v;
}

export type Thinking = "MINIMAL" | "LOW" | "MEDIUM" | "HIGH";

/** Structured output: JSON schema from Zod, validated with Zod, one retry (CLAUDE.md conventions). */
export async function json<T>(schema: z.ZodType<T>, model: string, prompt: string, temperature = 0.1, thinking: Thinking = "LOW"): Promise<T> {
  const full = z.toJSONSchema(schema) as JsonSchema;
  const responseJsonSchema = shapeOnly(full);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await ai().models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json", responseJsonSchema, temperature, thinkingConfig: { thinkingLevel: thinking as never } },
      });
      meter(model, r.usageMetadata);
      let raw: unknown;
      try {
        raw = clamp(JSON.parse(r.text ?? ""), full);
      } catch {
        continue;
      }
      const parsed = schema.safeParse(raw);
      if (parsed.success) return parsed.data;
    }
  } catch (e) {
    return upstream(e);
  }
  throw new ApiError("upstream_error", undefined, "The AI returned an unexpected format.");
}

const normalize = (v: number[]) => {
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
};

export async function embed(model: string, dims: number, texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  try {
    for (let i = 0; i < texts.length; i += 100) {
      // One Content per text: gemini-embedding-2 merges a plain string[] into a single vector.
      const contents = texts.slice(i, i + 100).map((text) => ({ role: "user", parts: [{ text }] }));
      const r = await ai().models.embedContent({ model, contents, config: { outputDimensionality: dims } });
      out.push(...(r.embeddings ?? []).map((e) => normalize(e.values ?? [])));
    }
  } catch (e) {
    return upstream(e);
  }
  if (out.length !== texts.length) {
    console.error(JSON.stringify({ msg: "embedding count mismatch", want: texts.length, got: out.length }));
    throw new ApiError("upstream_error");
  }
  return out;
}

export const embedder = (cfg: Rc) => (texts: string[]) => embed(cfg.model_embedding, cfg.embedding_dims, texts);
