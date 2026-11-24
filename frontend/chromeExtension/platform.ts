/**
 * Side panel wiring (docs/EXTENSION.md "Side panel architecture"): Firebase app, auth from
 * `firebase/auth/web-extension` + chrome.identity, App Check debug provider with a CustomProvider
 * (no remote script), Remote Config, AI Logic. Falls back to demo mode when not configured.
 */
import {
  createAiJobs,
  createCheckWriter,
  createDemoApi,
  createDemoAuth,
  createFirebaseAiEngine,
  createFirebaseAuthAdapter,
  createHttpApi,
  demoStorySource,
  firebaseOptionsFromEnv,
  loadRemoteConfig,
  localStore,
  RC_DEFAULTS,
  type Platform,
  type RemoteConfigValues,
} from "@threadnews/shared";
import { initializeApp } from "firebase/app";
import { CustomProvider, getToken, initializeAppCheck, type AppCheck } from "firebase/app-check";
import { getAuth, GoogleAuthProvider, linkWithCredential, onAuthStateChanged, signInAnonymously, signInWithCredential, signOut } from "firebase/auth/web-extension";
import type { Firestore } from "firebase/firestore";

declare global {
  // eslint-disable-next-line no-var
  var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined;
}

const env = import.meta.env as Record<string, string | undefined>;
const store = localStore();
const config: RemoteConfigValues = { ...RC_DEFAULTS };
export const WEBSITE_URL = (env.WXT_WEBSITE_URL || "http://localhost:5173").replace(/\/+$/, "");
const apiBase = env.WXT_API_BASE_URL?.trim();

const hasOAuthClient = () => !!chrome.runtime.getManifest().oauth2?.client_id;

function build(): Platform {
  const options = firebaseOptionsFromEnv(env, "WXT_");

  if (!options) {
    const auth = createDemoAuth(store);
    const getUser = () => {
      const u = auth.current()!;
      return { uid: u.uid, tier: u.isAnonymous ? ("guest" as const) : ("member" as const) };
    };
    return { surface: "extension", api: createDemoApi({ getUser, store }), ai: createAiJobs(null), auth, stories: demoStorySource, config, store, websiteUrl: WEBSITE_URL };
  }

  const app = initializeApp(options);

  // reCAPTCHA can't load in an extension page without remote code → debug provider (judge build only).
  let appCheck: AppCheck | null = null;
  if (env.WXT_APPCHECK_DEBUG_TOKEN) {
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = env.WXT_APPCHECK_DEBUG_TOKEN;
    appCheck = initializeAppCheck(app, {
      provider: new CustomProvider({ getToken: () => Promise.reject(new Error("App Check runs in debug mode in the extension")) }),
      isTokenAutoRefreshEnabled: true,
    });
  }

  const fbAuth = getAuth(app);
  const auth = createFirebaseAuthAdapter({
    auth: fbAuth,
    onAuthStateChanged,
    signInAnonymously,
    signOut,
    currentUser: () => fbAuth.currentUser,
    signInUnavailableReason: hasOAuthClient() ? null : "Google sign-in isn't set up in this build yet.",
    async signInWithGoogle() {
      const { token } = await chrome.identity.getAuthToken({ interactive: true });
      if (!token) throw new Error("No Google token");
      const cred = GoogleAuthProvider.credential(null, token);
      const current = fbAuth.currentUser;
      if (!current) {
        await signInWithCredential(fbAuth, cred);
        return;
      }
      try {
        await linkWithCredential(current, cred); // same uid, guest data kept
      } catch (e) {
        if ((e as { code?: string }).code !== "auth/credential-already-in-use") throw e;
        await signInWithCredential(fbAuth, cred);
      }
    },
  });

  void loadRemoteConfig(app, config);

  let dbP: Promise<Firestore> | undefined;
  const getDb = () => (dbP ??= import("firebase/firestore").then(({ getFirestore }) => getFirestore(app)));
  const live = !!apiBase;
  const getUser = () => {
    const u = auth.current();
    return { uid: u?.uid ?? "anon", tier: u && !u.isAnonymous ? ("member" as const) : ("guest" as const) };
  };

  return {
    surface: "extension",
    api: live
      ? createHttpApi({ baseUrl: apiBase, getIdToken: auth.getIdToken, getAppCheckToken: async () => (appCheck ? (await getToken(appCheck)).token : null) })
      : createDemoApi({ getUser, store }),
    ai: createAiJobs(createFirebaseAiEngine(app, { cloudModel: () => config.model_fallback })),
    auth,
    stories: demoStorySource, // the side panel never reads the graph directly
    saveCheck: live ? createCheckWriter(getDb, () => auth.current()) : undefined,
    config,
    store,
    websiteUrl: WEBSITE_URL,
  };
}

export const platform = build();
