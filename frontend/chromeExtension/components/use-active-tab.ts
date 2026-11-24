import type { ExtractedArticle } from "@threadnews/shared";
import { useCallback, useEffect, useRef, useState } from "react";

export type TabState =
  | { kind: "loading" }
  | { kind: "no-tab" }
  | { kind: "restricted" }
  | { kind: "needs-permission"; tabId: number }
  | { kind: "error"; tabId: number; message: string }
  | { kind: "ready"; tabId: number; article: ExtractedArticle };

const RESTRICTED = /chrome:|chrome-extension:|extensions gallery|webstore|about:|devtools:|edge:|view-source:|file:|pdf/i;

/** Inject the bundled extractor into the tab (activeTab or optional host permission required). */
export async function extract(tabId: number): Promise<TabState> {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, files: ["/extractor.js"] });
    const article = res?.result as ExtractedArticle | undefined;
    if (!article?.url) return { kind: "error", tabId, message: "Couldn't read this page." };
    if (RESTRICTED.test(article.url.split("/")[0] ?? "")) return { kind: "restricted" };
    return { kind: "ready", tabId, article };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (RESTRICTED.test(msg)) return { kind: "restricted" };
    if (/permission|Cannot access contents/i.test(msg)) return { kind: "needs-permission", tabId };
    if (/No tab with id|Frame with ID 0 was removed|showing error page/i.test(msg)) return { kind: "restricted" };
    return { kind: "error", tabId, message: msg };
  }
}

const ALL_SITES = { origins: ["https://*/*", "http://*/*"] };
export const hasAllSites = () => chrome.permissions.contains(ALL_SITES);
/** Must be called from a click (user gesture). */
export const requestAllSites = () => chrome.permissions.request(ALL_SITES);
export const removeAllSites = () => chrome.permissions.remove(ALL_SITES);

/**
 * Tracks the active tab of the panel's window and extracts its article on demand.
 * Re-extracts on tab switch / navigation when Chrome lets us (activeTab for that tab, or the
 * optional "read sites you visit" permission). No always-on content script (ADR-012).
 */
export function useActiveTab() {
  const [state, setState] = useState<TabState>({ kind: "loading" });
  const lastUrl = useRef<string | null>(null);

  const refresh = useCallback(async (force = false) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return setState({ kind: "no-tab" });
    if (tab.url && RESTRICTED.test(tab.url.split("/")[0] ?? "")) {
      lastUrl.current = tab.url;
      return setState({ kind: "restricted" });
    }
    if (!force && tab.url && tab.url === lastUrl.current) return;
    setState((s) => (s.kind === "ready" && !force ? s : { kind: "loading" }));
    const next = await extract(tab.id);
    if (next.kind === "ready") {
      if (!force && next.article.url === lastUrl.current) return;
      lastUrl.current = next.article.url;
    }
    setState(next);
  }, []);

  useEffect(() => {
    void refresh();
    const onActivated = () => void refresh();
    const onUpdated = (_id: number, info: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => {
      if (tab.active && info.status === "complete") void refresh();
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [refresh]);

  return { state, refresh };
}
