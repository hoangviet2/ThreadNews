/**
 * Typed client for apps/api (docs/API.md). Every request carries the Firebase ID token and the
 * App Check token (CLAUDE.md hard rule 4). Responses are validated with the shared Zod schemas.
 */
import { z } from "zod";
import {
  ApiErrorBody,
  AskResponse,
  CheckResponse,
  ErrorCode,
  Explainer,
  FollowsResponse,
  Me,
  RetrieveResponse,
  SearchResponse,
  type ApiError,
  type AskRequest,
  type CheckRequest,
  type RetrieveRequest,
} from "../schemas";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export type ThreadNewsApi = {
  mode: "live" | "demo";
  me(): Promise<ApiResult<Me>>;
  retrieve(req: RetrieveRequest): Promise<ApiResult<RetrieveResponse>>;
  search(query: string): Promise<ApiResult<SearchResponse>>;
  check(req: CheckRequest): Promise<ApiResult<CheckResponse>>;
  getExplainer(storyId: string): Promise<ApiResult<Explainer>>;
  generateExplainer(storyId: string): Promise<ApiResult<Explainer>>;
  ask(req: AskRequest): Promise<ApiResult<AskResponse>>;
  follow(req: { storyId: string; articleUrl: string }): Promise<ApiResult<{ following: boolean; count: number }>>;
  unfollow(storyId: string): Promise<ApiResult<{ following: boolean }>>;
  follows(): Promise<ApiResult<FollowsResponse>>;
};

export type HttpApiOptions = {
  baseUrl: string;
  getIdToken: () => Promise<string | null>;
  getAppCheckToken: () => Promise<string | null>;
  timeoutMs?: number;
};

const FollowResult = z.object({ following: z.boolean(), count: z.number() });
const UnfollowResult = z.object({ following: z.boolean() });

export function createHttpApi(o: HttpApiOptions): ThreadNewsApi {
  const base = o.baseUrl.replace(/\/+$/, "");

  async function call<T>(schema: z.ZodType<T>, method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 30_000);
    try {
      const [idToken, appCheck] = await Promise.all([o.getIdToken(), o.getAppCheckToken()]);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (idToken) headers.Authorization = `Bearer ${idToken}`;
      if (appCheck) headers["X-Firebase-AppCheck"] = appCheck;
      const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
      const json: unknown = await res.json().catch(() => undefined);
      if (!res.ok) {
        const parsed = ApiErrorBody.safeParse(json);
        const code = ErrorCode.safeParse(parsed.data?.error.code);
        return {
          ok: false,
          error: {
            code: code.success ? code.data : res.status >= 500 ? "upstream_error" : "invalid_argument",
            message: parsed.data?.error.message ?? `Request failed (${res.status})`,
            status: res.status,
            details: parsed.data?.error.details,
          },
        };
      }
      const data = schema.safeParse(json);
      if (!data.success) return { ok: false, error: { code: "upstream_error", message: "Unexpected response from the server.", status: res.status } };
      return { ok: true, data: data.data };
    } catch {
      return { ok: false, error: { code: "network", message: "Couldn't reach the server.", status: 0 } };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    mode: "live",
    me: () => call(Me, "GET", "/v1/me"),
    retrieve: (req) => call(RetrieveResponse, "POST", "/v1/graph/retrieve", req),
    search: (query) => call(SearchResponse, "POST", "/v1/graph/search", { query }),
    check: (req) => call(CheckResponse, "POST", "/v1/check", req),
    getExplainer: (id) => call(Explainer, "GET", `/v1/explainer/${encodeURIComponent(id)}`),
    generateExplainer: (id) => call(Explainer, "POST", "/v1/explainer", { storyId: id }),
    ask: (req: AskRequest) => call(AskResponse, "POST", "/v1/ask", req),
    follow: (req) => call(FollowResult, "POST", "/v1/follows", req),
    unfollow: (id) => call(UnfollowResult, "DELETE", `/v1/follows/${encodeURIComponent(id)}`),
    follows: () => call(FollowsResponse, "GET", "/v1/follows"),
  };
}

/** Copy for every error state (DESIGN.md §2: never "Error 429" / "Something went wrong"). */
export function errorCopy(e: ApiError, tier: "guest" | "member" = "guest"): string {
  switch (e.code) {
    case "quota_exceeded":
      return tier === "guest" ? "Limit reached — sign in for 50 checks a day." : "You've used today's checks. They reset tomorrow.";
    case "budget_exhausted":
      return "High demand — on-device features still work.";
    case "tier_required":
      return "Sign in with Google to use this — it's free.";
    case "network":
      return "Couldn't reach the server. Your summary still works on this device.";
    case "maintenance":
      return "ThreadNews is being updated. On-device features still work.";
    case "rate_limited":
      return "Too many requests. Try again in a minute.";
    case "demo_unavailable":
      return "This preview isn't connected to the ThreadNews API yet, so only the sample stories can be checked online.";
    case "not_found":
      return "We don't know this story yet.";
    default:
      return "Couldn't check this story right now. Try again.";
  }
}
