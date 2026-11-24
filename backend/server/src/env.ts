import { z } from "zod";

const Env = z.object({
  // On Google Cloud the runtime sets GCLOUD_PROJECT (FIREBASE_* names are reserved there).
  FIREBASE_PROJECT_ID: z.string().default(process.env.GCLOUD_PROJECT ?? "demo-threadnews"),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().default(""),
  CRON_SECRET: z.string().default(""),
  ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),
  APP_CHECK_ENFORCE: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
});
let cached: z.infer<typeof Env> | undefined;
export const env = () => (cached ??= Env.parse(process.env));
