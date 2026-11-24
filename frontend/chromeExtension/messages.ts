/** Typed messages between the side panel and the service worker (docs/EXTENSION.md "Messages"). */
export type Msg =
  | { type: "follows:refresh" } // panel → SW
  | { type: "badge:set"; count: number }; // panel → SW

export const send = (m: Msg) => chrome.runtime.sendMessage(m).catch(() => undefined);

export const BADGE_COLOR = "#B06000"; // --status-moved
