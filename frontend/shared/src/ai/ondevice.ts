/** Chrome Prompt API global (Chrome 148+ desktop). Used only to *detect* Nano — inference goes through AI Logic. */
type Availability = "unavailable" | "downloadable" | "downloading" | "available";
declare global {
  // eslint-disable-next-line no-var
  var LanguageModel: { availability(opts?: unknown): Promise<Availability> } | undefined;
}

export type OnDeviceStatus = Availability | "unsupported";

const OPTS = { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] };

export async function getOnDeviceStatus(): Promise<OnDeviceStatus> {
  const lm = globalThis.LanguageModel;
  if (!lm?.availability) return "unsupported";
  try {
    return await lm.availability(OPTS);
  } catch {
    return "unavailable";
  }
}

/** ⚡ only when Nano is ready right now (docs/architecture/02-hybrid-ai.md "Knowing which path ran"). */
export const isOnDeviceReady = async () => (await getOnDeviceStatus()) === "available";
