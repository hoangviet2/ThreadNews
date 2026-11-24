/**
 * Website wiring: Firebase (Auth, App Check with reCAPTCHA v3, Firestore, Remote Config, AI Logic)
 * when configured, otherwise demo mode (local guest, in-browser API, sample stories).
 */
import {
  createCheckWriter,
  createDemoApi,
  createDemoAuth,
  createFirebaseAiEngine,
  createFirebaseAuthAdapter,
  createFirestoreStorySource,
  createHttpApi,
  createAiJobs,
  demoStorySource,
  firebaseOptionsFromEnv,
  loadRemoteConfig,
  localStore,
  RC_DEFAULTS,
  type Platform,
  type RemoteConfigValues,
} from "@threadnews/shared";
import { initializeApp } from "firebase/app";
import { getToken, initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from "firebase/app-check";
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import type { Firestore } from "firebase/firestore";

declare global {
  // eslint-disable-next-line no-var
  var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined;
}

const env = import.meta.env;
const store = localStore();
const config: RemoteConfigValues = { ...RC_DEFAULTS };
const apiBase = env.VITE_API_BASE_URL?.trim();
const websiteUrl = typeof location === "undefined" ? "" : location.origin;

function build(): Platform {
  const options = firebaseOptionsFromEnv(env, "VITE_");

  if (!options) {
    const auth = createDemoAuth(store);
    const getUser = () => {
      const u = auth.current()!;
      return { uid: u.uid, tier: u.isAnonymous ? ("guest" as const) : ("member" as const) };
    };
    return { surface: "web", api: createDemoApi({ getUser, store }), ai: createAiJobs(null), auth, stories: demoStorySource, config, store, websiteUrl };
  }

  const app = initializeApp(options);

  let appCheck: AppCheck | null = null;
  if (env.DEV) globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true; // local dev: debug provider
  if (env.VITE_RECAPTCHA_V3_SITE_KEY) {
    appCheck = initializeAppCheck(app, { provider: new ReCaptchaV3Provider(env.VITE_RECAPTCHA_V3_SITE_KEY), isTokenAutoRefreshEnabled: true });
  }

  const fbAuth = getAuth(app);
  const emulators = env.VITE_USE_EMULATORS === "true";
  if (emulators) connectAuthEmulator(fbAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  // Firestore is only needed on story pages / history writes — load it on first use.
  let dbP: Promise<Firestore> | undefined;
  const getDb = () =>
    (dbP ??= import("firebase/firestore").then(({ getFirestore, connectFirestoreEmulator }) => {
      const db = getFirestore(app);
      if (emulators) connectFirestoreEmulator(db, "127.0.0.1", 8080);
      return db;
    }));

  const auth = createFirebaseAuthAdapter({
    auth: fbAuth,
    onAuthStateChanged,
    signInAnonymously,
    signOut,
    currentUser: () => fbAuth.currentUser,
    async signInWithGoogle() {
      const provider = new GoogleAuthProvider();
      const current = fbAuth.currentUser;
      if (!current) {
        await signInWithPopup(fbAuth, provider);
        return;
      }
      try {
        await linkWithPopup(current, provider); // same uid, guest data kept
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code !== "auth/credential-already-in-use") throw e;
        const cred = GoogleAuthProvider.credentialFromError(e as never);
        if (!cred) throw e;
        await signInWithCredential(fbAuth, cred); // existing member: switch accounts, drop guest data
      }
    },
  });

  void loadRemoteConfig(app, config);

  const live = !!apiBase;
  const getUser = () => {
    const u = auth.current();
    return { uid: u?.uid ?? "anon", tier: u && !u.isAnonymous ? ("member" as const) : ("guest" as const) };
  };

  return {
    surface: "web",
    api: live
      ? createHttpApi({
          baseUrl: apiBase,
          getIdToken: auth.getIdToken,
          getAppCheckToken: async () => (appCheck ? (await getToken(appCheck)).token : null),
        })
      : createDemoApi({ getUser, store }),
    ai: createAiJobs(createFirebaseAiEngine(app, { cloudModel: () => config.model_fallback })),
    auth,
    stories: live ? createFirestoreStorySource(getDb) : demoStorySource,
    saveCheck: live ? createCheckWriter(getDb, () => auth.current()) : undefined,
    config,
    store,
    websiteUrl,
  };
}

export const platform = build();
