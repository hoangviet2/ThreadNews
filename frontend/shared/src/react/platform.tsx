import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AiJobs } from "../ai/jobs";
import type { ThreadNewsApi } from "../api/client";
import type { RemoteConfigValues } from "../config/keys";
import type { StorySource } from "../data/story-source";
import type { KeyValueStore } from "../demo/api";
import type { ClientCheckDoc, UserSettings } from "../schemas";

export type AuthUser = { uid: string; isAnonymous: boolean; displayName?: string | null; email?: string | null; photoURL?: string | null };

export type AuthAdapter = {
  kind: "firebase" | "demo";
  current(): AuthUser | null;
  subscribe(cb: (u: AuthUser | null) => void): () => void;
  /** Guest → member, keeping the same uid when possible (linkWithPopup / linkWithCredential). */
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  /** Why Google sign-in can't run here (e.g. missing OAuth client), or null. */
  signInUnavailableReason: string | null;
};

export type Platform = {
  surface: "web" | "extension";
  api: ThreadNewsApi;
  ai: AiJobs;
  auth: AuthAdapter;
  stories: StorySource;
  config: RemoteConfigValues;
  store: KeyValueStore;
  saveCheck?: (doc: ClientCheckDoc) => Promise<void>;
  /** Base URL of the website, for "Open full explainer" links. */
  websiteUrl: string;
};

const Ctx = createContext<Platform | null>(null);

export function PlatformProvider({ value, children }: { value: Platform; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlatform(): Platform {
  const p = useContext(Ctx);
  if (!p) throw new Error("PlatformProvider missing");
  return p;
}

/* ---------- settings (local, per device) ---------- */

export const DEFAULT_SETTINGS: UserSettings = { onDeviceEnabled: true, readingLevel: "standard", theme: "system" };
const SETTINGS_KEY = "tn.settings";
const listeners = new Set<() => void>();

export function readSettings(store: KeyValueStore): UserSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(store.get(SETTINGS_KEY) ?? "{}") as Partial<UserSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings(): [UserSettings, (patch: Partial<UserSettings>) => void] {
  const { store } = usePlatform();
  const [s, setS] = useState(() => readSettings(store));
  useEffect(() => {
    const l = () => setS(readSettings(store));
    listeners.add(l);
    return () => void listeners.delete(l);
  }, [store]);
  const update = (patch: Partial<UserSettings>) => {
    store.set(SETTINGS_KEY, JSON.stringify({ ...readSettings(store), ...patch }));
    listeners.forEach((l) => l());
  };
  return [s, update];
}

/** Applies the theme setting to <html> (tokens follow prefers-color-scheme unless forced). */
export function useApplyTheme() {
  const [{ theme }] = useSettings();
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("dark", theme === "dark");
    el.classList.toggle("light", theme === "light");
  }, [theme]);
}
