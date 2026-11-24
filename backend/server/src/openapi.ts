/** Public OpenAPI 3.1 from the shared Zod schemas (docs/API.md). Internal routes are left out on purpose. */
import { z } from "zod";
import { ApiErrorBody, AskRequest, AskResponse, CheckRequest, CheckResponse, Explainer, FollowsResponse, Me, RetrieveRequest, RetrieveResponse, SearchRequest, SearchResponse } from "@threadnews/shared/schemas";

const Health = z.object({ ok: z.boolean(), version: z.string(), time: z.string() });
const StoryId = z.object({ storyId: z.string() });
const Follow = z.object({ storyId: z.string(), articleUrl: z.string() });

type Route = [method: string, path: string, summary: string, req: z.ZodType | null, res: z.ZodType, isPublic?: boolean];
const ROUTES: Route[] = [
  ["get", "/v1/health", "Health", null, Health, true],
  ["get", "/v1/me", "Tier, limits and today's usage", null, Me],
  ["post", "/v1/graph/retrieve", "GraphRAG retrieval (quota: retrieve)", RetrieveRequest, RetrieveResponse],
  ["post", "/v1/graph/search", "Explore stories by keywords (quota: retrieve)", SearchRequest, SearchResponse],
  ["post", "/v1/check", "Cloud check with Google Search (quota: check; cache hits free)", CheckRequest, CheckResponse],
  ["get", "/v1/explainer/{storyId}", "Cached explainer (any tier)", null, Explainer],
  ["post", "/v1/explainer", "Generate explainer (members, quota: explainer)", StoryId, Explainer],
  ["post", "/v1/ask", "Ask about a story (members, quota: ask)", AskRequest, AskResponse],
  ["get", "/v1/follows", "Followed stories (members)", null, FollowsResponse],
  ["post", "/v1/follows", "Follow a story (members)", Follow, z.object({ following: z.boolean(), count: z.number() })],
  ["delete", "/v1/follows/{storyId}", "Unfollow (members)", null, z.object({ following: z.boolean() })],
];

const schema = (s: z.ZodType) => {
  const { $schema: _, ...rest } = z.toJSONSchema(s, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  return rest;
};

let doc: unknown;
export function openApi() {
  if (doc) return doc;
  const error = { content: { "application/json": { schema: schema(ApiErrorBody) } } };
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [method, path, summary, req, res, isPublic] of ROUTES) {
    paths[path] ??= {};
    paths[path][method] = {
      summary,
      ...(isPublic ? { security: [] } : {}),
      ...(path.includes("{storyId}") ? { parameters: [{ name: "storyId", in: "path", required: true, schema: { type: "string" } }] } : {}),
      ...(req ? { requestBody: { required: true, content: { "application/json": { schema: schema(req) } } } } : {}),
      responses: { 200: { description: "OK", content: { "application/json": { schema: schema(res) } } }, default: { description: "Error", ...error } },
    };
  }
  return (doc = {
    openapi: "3.1.0",
    info: { title: "ThreadNews API", version: "1.0.0", description: "Is this article still current, or has the story moved on? Errors: `{ error: { code, message, details? } }`." },
    servers: [{ url: "https://us-central1-threadnews-4c8bd.cloudfunctions.net/api" }, { url: "http://localhost:8787" }],
    components: {
      securitySchemes: {
        idToken: { type: "http", scheme: "bearer", description: "Firebase ID token (guest or member)" },
        appCheck: { type: "apiKey", in: "header", name: "X-Firebase-AppCheck" },
      },
    },
    security: [{ idToken: [], appCheck: [] }],
    paths,
  });
}

export const DOCS_HTML = `<!doctype html><html><head><title>ThreadNews API</title><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><script id="api-reference" data-url="/v1/openapi.json"></script><script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script></body></html>`;
