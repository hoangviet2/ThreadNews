import { CloudOff, X, Zap } from "lucide-react";
import { useState } from "react";
import { useOnDevice } from "../react/hooks";
import { usePlatform } from "../react/platform";
import { Button } from "./primitives";

/**
 * One-time card: "Enable on-device AI" (needs a user gesture → initializeDeviceModel), download
 * progress, or "We'll use the cloud instead" (DESIGN.md §5 OnDeviceSetup). Hidden once Nano is ready.
 */
export function OnDeviceSetup() {
  const { store } = usePlatform();
  const { status, progress, error, initialize, canInitialize } = useOnDevice();
  const [dismissed, setDismissed] = useState(() => store.get("tn.ondevice.dismissed") === "1");
  const dismiss = () => {
    store.set("tn.ondevice.dismissed", "1");
    setDismissed(true);
  };

  if (status === "checking" || status === "available") return null;

  if (status === "unsupported" || status === "unavailable" || !canInitialize) {
    if (dismissed) return null;
    return (
      <section className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3.5">
        <CloudOff size={18} aria-hidden className="mt-0.5 shrink-0 text-muted" />
        <p className="m-0 flex-1 text-[13px] leading-normal text-fg-2">
          {!canInitialize
            ? "On-device AI isn't set up in this build, so summaries use a basic on-device method and checks use the cloud."
            : "This device can't run on-device AI. We'll use the cloud instead — only the headline and key claims are sent for checks."}
        </p>
        <button type="button" aria-label="Dismiss" onClick={dismiss} className="-m-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface">
          <X size={16} aria-hidden />
        </button>
      </section>
    );
  }

  const downloading = status === "downloading" || (progress !== null && progress < 100);
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-primary-line bg-primary-tint p-4">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary-soft">
          <Zap size={18} aria-hidden className="text-primary" />
        </span>
        <span className="text-base font-bold">Enable on-device AI</span>
      </div>
      <p className="m-0 text-[13px] leading-normal text-fg-2">Checks run on your computer with Gemini Nano. The article never leaves your browser.</p>
      {downloading ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-fg-2">Downloading model…</span>
            <span className="tnum text-muted">{progress ?? 0}%</span>
          </div>
          <div role="progressbar" aria-label="Model download" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? 0} className="h-1.5 rounded-full bg-primary-soft">
            <div className="h-1.5 rounded-full bg-primary transition-[width] duration-200" style={{ width: `${progress ?? 0}%` }} />
          </div>
          <span className="text-xs text-muted">You can keep reading. We'll use the cloud until it's ready.</span>
        </div>
      ) : (
        <Button onClick={() => void initialize()}>Enable on-device AI</Button>
      )}
      {error && <span className="text-xs text-disputed">Couldn't start on-device AI. We'll use the cloud for now.</span>}
    </section>
  );
}
