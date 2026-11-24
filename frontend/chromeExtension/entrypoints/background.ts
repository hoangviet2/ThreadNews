/**
 * Service worker: opens the side panel on toolbar click, and every 30 min checks followed stories
 * (GET /v1/follows) to badge the icon (docs/EXTENSION.md "Badge & updates").
 */
import { createHttpApi } from "@threadnews/shared/api";
import { firebaseOptionsFromEnv } from "@threadnews/shared/firebase";
import { defineBackground } from "wxt/utils/define-background";
import { BADGE_COLOR, type Msg } from "../messages";

const env = import.meta.env as Record<string, string | undefined>;

async function setBadge(count: number) {
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  await chrome.action.setBadgeText({ text: count > 0 ? String(Math.min(count, 99)) : "" });
}

/** Reads the persisted Firebase user (firebase/auth/web-extension) and asks the API for unread follows. */
async function refreshFollows() {
  const options = firebaseOptionsFromEnv(env, "WXT_");
  if (!options || !env.WXT_API_BASE_URL) return; // demo mode: the side panel sets the badge itself
  try {
    const [{ initializeApp, getApps }, { getAuth }] = await Promise.all([import("firebase/app"), import("firebase/auth/web-extension")]);
    const app = getApps()[0] ?? initializeApp(options);
    const auth = getAuth(app);
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user || user.isAnonymous) return setBadge(0);

    let appCheckToken: string | null = null;
    if (env.WXT_APPCHECK_DEBUG_TOKEN) {
      try {
        const { initializeAppCheck, getToken, CustomProvider } = await import("firebase/app-check");
        (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = env.WXT_APPCHECK_DEBUG_TOKEN;
        const ac = initializeAppCheck(app, { provider: new CustomProvider({ getToken: () => Promise.reject(new Error("debug provider only")) }) });
        appCheckToken = (await getToken(ac)).token;
      } catch {
        /* API will answer 401 app_check_failed; badge stays as is */
      }
    }

    const api = createHttpApi({ baseUrl: env.WXT_API_BASE_URL, getIdToken: () => user.getIdToken(), getAppCheckToken: async () => appCheckToken });
    const r = await api.follows();
    if (r.ok) await setBadge(r.data.items.filter((i) => i.unread).length);
  } catch {
    /* offline or not configured — try again on the next alarm */
  }
}

export default defineBackground(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void chrome.alarms.create("follows", { periodInMinutes: 30 });
  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === "follows") void refreshFollows();
  });
  chrome.runtime.onMessage.addListener((msg: Msg) => {
    if (msg.type === "badge:set") void setBadge(msg.count);
    if (msg.type === "follows:refresh") void refreshFollows();
  });
});
