import { WifiOff, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "./primitives";

/** Icon, one sentence, one action (DESIGN.md §5 EmptyState / ErrorState). */
export function EmptyState({ icon: Icon, children, action }: { icon: LucideIcon; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line px-6 py-8 text-center">
      <Icon size={24} aria-hidden className="text-muted" />
      <p className="m-0 max-w-[40ch] text-sm text-fg-2">{children}</p>
      {action}
    </div>
  );
}

export function ErrorState({ icon, children, onRetry }: { icon: LucideIcon; children: ReactNode; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={icon}
      action={
        onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )
      }
    >
      {children}
    </EmptyState>
  );
}

export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    addEventListener("online", on);
    addEventListener("offline", off);
    return () => {
      removeEventListener("online", on);
      removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function OfflineBanner({ message = "You're offline. Summaries of pasted text still work on this device." }: { message?: string }) {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="flex items-center gap-2 bg-surface px-4 py-2 text-xs text-fg-2">
      <WifiOff size={14} aria-hidden /> {message}
    </div>
  );
}
