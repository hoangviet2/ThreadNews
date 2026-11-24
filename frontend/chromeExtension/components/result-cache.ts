import { urlHash, type FlowState } from "@threadnews/shared";

/** Last 20 finished checks per URL hash in chrome.storage.session (instant re-open; cleared with the browser session). */
const KEY = "tn.results";
const MAX = 20;
const TTL_MS = 30 * 60_000;

type Entry = { at: number; state: FlowState };

export async function getCached(url: string): Promise<FlowState | null> {
  const all = ((await chrome.storage.session.get(KEY))[KEY] ?? {}) as Record<string, Entry>;
  const e = all[await urlHash(url)];
  return e && Date.now() - e.at < TTL_MS ? e.state : null;
}

export async function putCached(url: string, state: FlowState) {
  if (state.phase !== "done") return;
  const all = ((await chrome.storage.session.get(KEY))[KEY] ?? {}) as Record<string, Entry>;
  all[await urlHash(url)] = { at: Date.now(), state };
  const trimmed = Object.fromEntries(Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, MAX));
  await chrome.storage.session.set({ [KEY]: trimmed });
}
