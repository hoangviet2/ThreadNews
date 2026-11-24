/**
 * Cloud Functions (2nd gen) entry — deployed with `pnpm deploy:api` (scripts/build-functions.mjs + firebase deploy).
 * Runs as the project's service identity: no service-account key. Secrets come from Secret Manager.
 */
import { getRequestListener } from "@hono/node-server";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { app } from "./app";

const secrets = [defineSecret("GEMINI_API_KEY"), defineSecret("CRON_SECRET")];
const base = { region: "us-central1", memory: "512MiB", secrets } as const;

export const api = onRequest({ ...base, timeoutSeconds: 60, invoker: "public", concurrency: 80 }, getRequestListener(app.fetch));

/** Cloud Scheduler → the same /internal/cron/* routes, in-process (replaces the GitHub Actions cron). */
const cron = (job: string, schedule: string) =>
  onSchedule({ ...base, schedule, timeZone: "UTC", timeoutSeconds: 120, retryCount: 0 }, async () => {
    const r = await app.request(`/internal/cron/${job}`, { method: "POST", headers: { "X-Cron-Secret": process.env.CRON_SECRET ?? "" } });
    console.log(JSON.stringify({ msg: "cron", job, status: r.status, body: (await r.text()).slice(0, 200) }));
    if (!r.ok) throw new Error(`cron ${job} → ${r.status}`);
  });

export const cronCommunities = cron("communities", "7 * * * *");
export const cronRecheck = cron("recheck", "17 */6 * * *");
export const cronCleanup = cron("cleanup", "27 4 * * *");
