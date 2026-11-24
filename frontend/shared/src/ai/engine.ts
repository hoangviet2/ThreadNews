/**
 * The only place that talks to Firebase AI Logic (CLAUDE.md hard rule 2).
 * Every model is hybrid: InferenceMode.PREFER_ON_DEVICE, cloud model from Remote Config.
 */
import type { FirebaseApp } from "firebase/app";
import type { GenerativeModel } from "firebase/ai";
import { z } from "zod";
import type { Inference } from "../schemas";
import { fitOnDevice } from "./budget";
import { isOnDeviceReady } from "./ondevice";

export class AiError extends Error {
  constructor(
    readonly kind: "invalid" | "rate_limited" | "unavailable",
    message: string,
  ) {
    super(message);
  }
}

export type AiEngine = {
  json<T>(schema: z.ZodType<T>, prompt: string, opts?: { temperature?: number; maxOutputTokens?: number }): Promise<{ value: T; inference: Inference }>;
  stream(prompt: string, onText: (fullText: string) => void, opts?: { temperature?: number }): Promise<{ text: string; inference: Inference }>;
  initializeDeviceModel(onProgress: (fraction: number) => void): Promise<void>;
};

/** JSON schema for Gemini (`responseJsonSchema`) and the Prompt API (`responseConstraint`). */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  return rest;
}

const DEVICE_LANG = {
  expectedInputs: [{ type: "text" as const, languages: ["en"] }],
  expectedOutputs: [{ type: "text" as const, languages: ["en"] }],
};

/** `cloudModel` is read per call so a Remote Config fetch that lands later still applies. */
export function createFirebaseAiEngine(app: FirebaseApp, opts: { cloudModel: () => string }): AiEngine {
  // firebase/ai is loaded on first use (keeps it out of the initial bundle).
  let sdk: Promise<{ ai: import("firebase/ai").AI; mod: typeof import("firebase/ai") }> | undefined;
  const load = () =>
    (sdk ??= import("firebase/ai").then((mod) => ({ mod, ai: mod.getAI(app, { backend: new mod.GoogleAIBackend() }) })));

  const model = async (cfg: { temperature?: number; maxOutputTokens?: number; jsonSchema?: Record<string, unknown> }): Promise<GenerativeModel> => {
    const { ai, mod } = await load();
    return mod.getGenerativeModel(ai, {
      mode: mod.InferenceMode.PREFER_ON_DEVICE,
      inCloudParams: {
        model: opts.cloudModel(),
        generationConfig: {
          temperature: cfg.temperature,
          maxOutputTokens: cfg.maxOutputTokens,
          ...(cfg.jsonSchema ? { responseMimeType: "application/json", responseJsonSchema: cfg.jsonSchema } : {}),
        },
      },
      onDeviceParams: {
        createOptions: { ...DEVICE_LANG, ...(cfg.temperature !== undefined ? { temperature: cfg.temperature, topK: 3 } : {}) },
        ...(cfg.jsonSchema ? { promptOptions: { responseConstraint: cfg.jsonSchema } } : {}),
      },
    });
  };

  const label = async (source: string | undefined): Promise<Inference> =>
    source === "on_device" ? "on_device" : source === "in_cloud" ? "cloud" : (await isOnDeviceReady()) ? "on_device" : "cloud";

  const wrap = (e: unknown): AiError => {
    const msg = e instanceof Error ? e.message : String(e);
    if (/429|quota|rate/i.test(msg)) return new AiError("rate_limited", msg);
    return new AiError("unavailable", msg);
  };

  return {
    async json(schema, prompt, o = {}) {
      const jsonSchema = toJsonSchema(schema);
      const m = await model({ temperature: o.temperature ?? 0.2, maxOutputTokens: o.maxOutputTokens, jsonSchema });
      let p = fitOnDevice(prompt, o.maxOutputTokens);
      for (let attempt = 0; attempt < 2; attempt++) {
        let res;
        try {
          res = await m.generateContent(p);
        } catch (e) {
          throw wrap(e);
        }
        const parsed = schema.safeParse(parseJson(res.response.text()));
        if (parsed.success) return { value: parsed.data, inference: await label(res.response.inferenceSource) };
        p = `${p}\nReturn valid JSON only.`;
      }
      throw new AiError("invalid", "Model output did not match the schema");
    },

    async stream(prompt, onText, o = {}) {
      const m = await model({ temperature: o.temperature ?? 0.3 });
      let text = "";
      let source: string | undefined;
      try {
        const res = await m.generateContentStream(fitOnDevice(prompt));
        for await (const chunk of res.stream) {
          source ??= chunk.inferenceSource;
          text += chunk.text();
          onText(text);
        }
      } catch (e) {
        throw wrap(e);
      }
      return { text, inference: await label(source) };
    },

    async initializeDeviceModel(onProgress) {
      // Must run from a user gesture (button click) — the caller guarantees that.
      await (await model({})).initializeDeviceModel(onProgress);
    },
  };
}

function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}
