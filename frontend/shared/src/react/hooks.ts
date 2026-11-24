import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getOnDeviceStatus, type OnDeviceStatus } from "../ai/ondevice";
import { initialFlowState, runCheckFlow, type FlowInput, type FlowState } from "../flow/check-flow";
import { utcDay } from "../format";
import type { ApiError, AskCitation, Explainer, Inference, Me, Tier, Usage } from "../schemas";
import { usePlatform, useSettings, type AuthUser } from "./platform";

/* ---------- auth ---------- */

export function useAuth() {
  const { auth } = usePlatform();
  const user = useSyncExternalStore(
    useCallback((cb) => auth.subscribe(cb), [auth]),
    () => auth.current(),
  );
  const qc = useQueryClient();
  const signIn = useMutation({
    mutationFn: () => auth.signInWithGoogle(),
    onSuccess: () => qc.invalidateQueries(),
  });
  const signOut = useMutation({ mutationFn: () => auth.signOut(), onSuccess: () => qc.clear() });
  const tier: Tier = user && !user.isAnonymous ? "member" : "guest";
  return { user, tier, ready: user !== null, signIn, signOut, unavailableReason: auth.signInUnavailableReason, kind: auth.kind };
}

export const initials = (u: AuthUser | null) =>
  (u?.displayName ?? u?.email ?? "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/* ---------- me / quota ---------- */

export function useMe() {
  const { api } = usePlatform();
  const { user } = useAuth();
  return useQuery({
    queryKey: ["me", user?.uid, user?.isAnonymous],
    queryFn: async () => {
      const r = await api.me();
      if (!r.ok) throw r.error;
      return r.data;
    },
    enabled: !!user,
    staleTime: 60_000,
  });
}

/** Apply a `usage` echo from an AI endpoint to the cached /v1/me (docs/API.md "Usage echo"). */
export function usePatchUsage() {
  const qc = useQueryClient();
  return useCallback(
    (u?: Usage) => {
      if (!u || u.feature === "follows") return;
      qc.setQueriesData<Me>({ queryKey: ["me"] }, (me) => (me ? { ...me, usage: { ...me.usage, [u.feature]: u.used } } : me));
    },
    [qc],
  );
}

/* ---------- on-device AI ---------- */

export function useOnDevice() {
  const { ai } = usePlatform();
  const [status, setStatus] = useState<OnDeviceStatus | "checking">("checking");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => setStatus(await getOnDeviceStatus()), []);
  useEffect(() => void refresh(), [refresh]);

  /** Must be called from a click handler (user gesture). */
  const initialize = useCallback(async () => {
    setError(null);
    setProgress(0);
    setStatus("downloading");
    try {
      await ai.initializeDeviceModel((f) => setProgress(Math.round(f * 100)));
      setProgress(100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start on-device AI.");
    } finally {
      await refresh();
    }
  }, [ai, refresh]);

  return { status, progress, error, initialize, canInitialize: ai.hasEngine };
}

/* ---------- device run counter (footer) ---------- */

const runListeners = new Set<() => void>();
export function useDeviceRuns(): [number, () => void] {
  const { store } = usePlatform();
  const key = `tn.deviceRuns.${utcDay()}`;
  const count = useSyncExternalStore(
    (cb) => {
      runListeners.add(cb);
      return () => void runListeners.delete(cb);
    },
    () => Number(store.get(key) ?? 0),
  );
  const bump = useCallback(() => {
    store.set(key, String(Number(store.get(key) ?? 0) + 1));
    runListeners.forEach((l) => l());
  }, [store, key]);
  return [count, bump];
}

/* ---------- check flow ---------- */

export function useCheckFlow() {
  const p = usePlatform();
  const [settings] = useSettings();
  const [state, setState] = useState<FlowState>(initialFlowState);
  const abort = useRef<AbortController | null>(null);
  const patchUsage = usePatchUsage();
  const qc = useQueryClient();
  const [, bumpRuns] = useDeviceRuns();

  const run = useCallback(
    async (input: Omit<FlowInput, "readingLevel">) => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      const final = await runCheckFlow(
        { ...input, readingLevel: settings.readingLevel },
        { ai: p.ai, api: p.api, saveCheck: p.saveCheck, onDeviceRun: bumpRuns },
        (s) => !ctrl.signal.aborted && setState(s),
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      patchUsage(final.usage);
      if (final.error?.code === "quota_exceeded") void qc.invalidateQueries({ queryKey: ["me"] });
    },
    [p, settings.readingLevel, patchUsage, qc, bumpRuns],
  );

  const reset = useCallback(() => {
    abort.current?.abort();
    setState(initialFlowState);
  }, []);

  /** Show a previously finished state (e.g. the side panel's per-URL cache) without re-running. */
  const restore = useCallback((s: FlowState) => {
    abort.current?.abort();
    setState(s);
  }, []);

  useEffect(() => () => abort.current?.abort(), []);
  return { state, run, reset, restore };
}

/* ---------- story / explainer ---------- */

export function useStory(storyId: string | undefined) {
  const { stories } = usePlatform();
  const { user } = useAuth();
  return useQuery({
    queryKey: ["story", storyId],
    queryFn: () => stories.getStory(storyId!),
    enabled: !!storyId && !!user,
    staleTime: 60_000,
  });
}

export function useRecentStories(n = 4) {
  const { stories } = usePlatform();
  const { user } = useAuth();
  return useQuery({ queryKey: ["recent", n], queryFn: () => stories.recent(n), enabled: !!user, staleTime: 5 * 60_000 });
}

export function useExplainer(storyId: string | undefined) {
  const { api } = usePlatform();
  const { user } = useAuth();
  const qc = useQueryClient();
  const patchUsage = usePatchUsage();
  const query = useQuery<Explainer, ApiError>({
    queryKey: ["explainer", storyId, user?.isAnonymous],
    queryFn: async () => {
      const r = await api.getExplainer(storyId!);
      if (!r.ok) throw r.error;
      return r.data;
    },
    enabled: !!storyId && !!user,
    retry: false,
  });
  const generate = useMutation<Explainer, ApiError>({
    mutationFn: async () => {
      const r = await api.generateExplainer(storyId!);
      if (!r.ok) throw r.error;
      return r.data;
    },
    onSuccess: (data) => {
      patchUsage(data.usage);
      qc.setQueryData(["explainer", storyId, user?.isAnonymous], data);
    },
  });
  return { ...query, generate };
}

/* ---------- ask ---------- */

export type AskResult = {
  answer: string;
  citations: { label: string; href?: string }[];
  inference: Inference;
  mode: "local" | "global";
  confident: boolean;
  /** Guest asked a "bigger picture" question — answered locally if possible, offer sign-in. */
  upgradeForGlobal?: boolean;
};

function citationLabel(c: AskCitation): { label: string; href?: string } {
  return "nodeId" in c ? { label: c.label } : { label: new URL(c.sourceUrl).hostname.replace(/^www\./, ""), href: c.sourceUrl };
}

export function useAsk(storyId: string | null | undefined) {
  const { ai, api, config } = usePlatform();
  const { tier } = useAuth();
  const patchUsage = usePatchUsage();
  const [, bumpRuns] = useDeviceRuns();

  return useMutation<AskResult, ApiError, string>({
    mutationFn: async (question) => {
      if (!storyId) throw { code: "not_found", message: "Check a story first.", status: 404 } satisfies ApiError;
      const route = config.enable_global_search ? await ai.askRoute(question) : "local";

      if (route === "global" && tier === "member") {
        const r = await api.ask({ storyId, question, mode: "global" });
        if (!r.ok) throw r.error;
        patchUsage(r.data.usage);
        return { answer: r.data.answer, citations: r.data.citations.map(citationLabel), inference: "cloud", mode: "global", confident: true };
      }

      const ret = await api.retrieve({ mode: "local", headline: "", claims: [], entities: [], question, storyId, budget: "device" });
      if (!ret.ok) throw ret.error;
      const r = await ai.askLocal(question, ret.data.context ?? "");
      if (r.inference === "on_device") bumpRuns();
      return {
        answer: r.value.answer,
        citations: r.value.citations.map((id) => ({ label: id })),
        inference: r.inference,
        mode: "local",
        confident: r.value.confident,
        upgradeForGlobal: route === "global" && tier === "guest",
      };
    },
  });
}

/* ---------- follows ---------- */

export function useFollows() {
  const { api } = usePlatform();
  const { tier, user } = useAuth();
  return useQuery({
    queryKey: ["follows", user?.uid],
    queryFn: async () => {
      const r = await api.follows();
      if (!r.ok) throw r.error;
      return r.data.items;
    },
    enabled: tier === "member",
    refetchInterval: 5 * 60_000,
  });
}

export function useFollow(storyId: string | null | undefined, articleUrl = "") {
  const { api } = usePlatform();
  const follows = useFollows();
  const qc = useQueryClient();
  const following = !!follows.data?.some((f) => f.storyId === storyId);
  const toggle = useMutation<void, ApiError>({
    mutationFn: async () => {
      if (!storyId) return;
      const r = following ? await api.unfollow(storyId) : await api.follow({ storyId, articleUrl });
      if (!r.ok && r.error.code !== "conflict") throw r.error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["follows"] }),
  });
  return { following, toggle, loading: follows.isLoading };
}
