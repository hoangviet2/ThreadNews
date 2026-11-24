/** Hono app: middleware chain + routes (docs/API.md). Runtime-agnostic (ADR-009): Cloud Functions (src/functions.ts), Vercel (src/vercel.ts), Node (src/dev.ts). */
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { timeout } from "hono/timeout";
import { ApiError, onError } from "./errors";
import { env } from "./env";
import { log, maintenance, rateLimit, verifyAppCheck, verifyIdToken, type AppEnv } from "./middleware";
import { DOCS_HTML, openApi } from "./openapi";
import { check } from "./routes/check";
import { graph } from "./routes/graph";
import { internal } from "./routes/internal";
import { story } from "./routes/story";
import { user } from "./routes/user";

export const app = new Hono<AppEnv>();

app.use(requestId({ headerName: "X-Request-Id" }));
app.use(log);
app.use(
  cors({
    origin: (o) => (env().ALLOWED_ORIGINS.split(",").map((s) => s.trim()).includes(o) ? o : null),
    allowHeaders: ["Authorization", "X-Firebase-AppCheck", "Content-Type", "X-Request-Id"],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    exposeHeaders: ["X-Request-Id"],
    maxAge: 600,
  }),
);
app.use(bodyLimit({ maxSize: 32 * 1024 }));
app.onError(onError);
app.notFound(() => {
  throw new ApiError("not_found");
});

// Public
app.get("/v1/health", (c) => c.json({ ok: true, version: "1.0.0", time: new Date().toISOString() }));
app.get("/v1/openapi.json", (c) => c.json(openApi()));
app.get("/docs", (c) => c.html(DOCS_HTML));

// Internal (cron secret)
app.route("/internal", internal);

// Everything else under /v1: maintenance → App Check → ID token → burst limit. Quotas run inside handlers, after cache checks.
app.use("/v1/*", timeout(30_000), maintenance, verifyAppCheck, verifyIdToken, rateLimit);
app.route("/v1", user);
app.route("/v1/graph", graph);
app.route("/v1/check", check);
app.route("/v1", story);
