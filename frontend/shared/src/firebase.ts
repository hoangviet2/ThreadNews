/**
 * Firebase helpers shared by the website and the extension. Auth functions are injected because the
 * extension must use `firebase/auth/web-extension` while the website uses `firebase/auth`.
 */
import type { FirebaseApp, FirebaseOptions } from "firebase/app";
import type { Firestore } from "firebase/firestore";
import { RC_DEFAULTS, RC_FETCH_INTERVAL_MS, type RemoteConfigValues } from "./config/keys";
import type { KeyValueStore } from "./demo/api";
import type { AuthAdapter, AuthUser } from "./react/platform";
import type { ClientCheckDoc } from "./schemas";

export function firebaseOptionsFromEnv(env: Record<string, string | undefined>, prefix: "VITE_" | "WXT_"): FirebaseOptions | null {
  const o = {
    apiKey: env[`${prefix}FIREBASE_API_KEY`],
    authDomain: env[`${prefix}FIREBASE_AUTH_DOMAIN`],
    projectId: env[`${prefix}FIREBASE_PROJECT_ID`],
    appId: env[`${prefix}FIREBASE_APP_ID`],
  };
  return o.apiKey && o.projectId && o.appId ? o : null;
}

/** Fills `values` in place (callers keep one object; consumers read it at call time). */
export async function loadRemoteConfig(app: FirebaseApp | null, values: RemoteConfigValues = { ...RC_DEFAULTS }): Promise<RemoteConfigValues> {
  if (!app) return values;
  try {
    const { fetchAndActivate, getRemoteConfig, getValue } = await import("firebase/remote-config");
    const rc = getRemoteConfig(app);
    rc.settings.minimumFetchIntervalMillis = RC_FETCH_INTERVAL_MS;
    rc.defaultConfig = { ...RC_DEFAULTS };
    await Promise.race([fetchAndActivate(rc), new Promise((r) => setTimeout(r, 3000))]);
    for (const key of Object.keys(RC_DEFAULTS) as (keyof RemoteConfigValues)[]) {
      const v = getValue(rc, key);
      const d = RC_DEFAULTS[key];
      (values as Record<string, unknown>)[key] = typeof d === "boolean" ? v.asBoolean() : typeof d === "number" ? v.asNumber() || d : v.asString() || d;
    }
  } catch {
    /* defaults */
  }
  return values;
}

type FbUser = { uid: string; isAnonymous: boolean; displayName: string | null; email: string | null; photoURL: string | null; getIdToken(): Promise<string> };

export type FirebaseAuthDeps<A> = {
  auth: A;
  onAuthStateChanged: (auth: A, cb: (u: FbUser | null) => void) => () => void;
  signInAnonymously: (auth: A) => Promise<unknown>;
  signOut: (auth: A) => Promise<void>;
  currentUser: () => FbUser | null;
  /** Link the current guest to Google (falls back to sign-in if the account already exists). */
  signInWithGoogle: () => Promise<void>;
  signInUnavailableReason?: string | null;
};

/** Anonymous bootstrap (everyone is signed in) + Google upgrade (docs/architecture/04-auth-and-quotas.md). */
export function createFirebaseAuthAdapter<A>(d: FirebaseAuthDeps<A>): AuthAdapter & { getIdToken(): Promise<string | null> } {
  let user: AuthUser | null = null;
  const subs = new Set<(u: AuthUser | null) => void>();
  const toUser = (u: FbUser): AuthUser => ({ uid: u.uid, isAnonymous: u.isAnonymous, displayName: u.displayName, email: u.email, photoURL: u.photoURL });
  let markReady!: () => void;
  const ready = new Promise<void>((r) => (markReady = r));
  const emit = () => {
    markReady();
    subs.forEach((cb) => cb(user));
  };

  d.onAuthStateChanged(d.auth, (u) => {
    if (!u) {
      d.signInAnonymously(d.auth).catch(() => {
        // Anonymous provider disabled → keep the app usable as a local guest (API calls will 401 in live mode).
        user = { uid: `local-${Math.random().toString(36).slice(2, 10)}`, isAnonymous: true };
        emit();
      });
      return;
    }
    user = toUser(u);
    emit();
  });

  return {
    kind: "firebase",
    current: () => user,
    subscribe(cb) {
      subs.add(cb);
      return () => void subs.delete(cb);
    },
    signInWithGoogle: d.signInWithGoogle,
    async signOut() {
      await d.signOut(d.auth); // onAuthStateChanged → anonymous again
    },
    signInUnavailableReason: d.signInUnavailableReason ?? null,
    /** Waits for the first user (restored or anonymous) so calls made at page load aren't sent unauthenticated. */
    async getIdToken() {
      await ready;
      return (await d.currentUser()?.getIdToken()) ?? null;
    },
  };
}

/** Stand-in auth when Firebase isn't configured: a local guest that can toggle to a demo member. */
export function createDemoAuth(store: KeyValueStore): AuthAdapter {
  const KEY = "tn.demo.auth";
  const load = (): AuthUser => {
    try {
      const v = JSON.parse(store.get(KEY) ?? "null") as AuthUser | null;
      if (v?.uid) return v;
    } catch {
      /* new guest */
    }
    const g: AuthUser = { uid: `demo-${Math.random().toString(36).slice(2, 10)}`, isAnonymous: true };
    store.set(KEY, JSON.stringify(g));
    return g;
  };
  let user = load();
  const subs = new Set<(u: AuthUser | null) => void>();
  const set = (u: AuthUser) => {
    user = u;
    store.set(KEY, JSON.stringify(u));
    subs.forEach((cb) => cb(user));
  };
  return {
    kind: "demo",
    current: () => user,
    subscribe(cb) {
      subs.add(cb);
      return () => void subs.delete(cb);
    },
    async signInWithGoogle() {
      set({ ...user, isAnonymous: false, displayName: "Demo Member", email: null });
    },
    async signOut() {
      set({ uid: user.uid, isAnonymous: true });
    },
    signInUnavailableReason: null,
  };
}

/** users/{uid}/checks writer for on-device results (fields match `validCheck` in firestore.rules). */
export function createCheckWriter(getDb: () => Promise<Firestore>, getUser: () => AuthUser | null) {
  return async (docData: ClientCheckDoc) => {
    const u = getUser();
    if (!u || u.uid.startsWith("local-")) return;
    const [db, { addDoc, collection, serverTimestamp }] = await Promise.all([getDb(), import("firebase/firestore")]);
    await addDoc(collection(db, "users", u.uid, "checks"), { ...docData, createdAt: serverTimestamp() });
  };
}
