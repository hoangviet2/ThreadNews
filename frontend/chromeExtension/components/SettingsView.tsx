import { useAuth, useOnDevice, usePlatform, useSettings, type UserSettings } from "@threadnews/shared";
import { Button } from "@threadnews/shared/ui";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { hasAllSites, removeAllSites, requestAllSites } from "./use-active-tab";

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b border-line pb-4">
      <h2 className="m-0 text-[13px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Choice<T extends string>({ name, value, options, onChange }: { name: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-1.5">
      {options.map(([v, label]) => (
        <label key={v} className={`inline-flex min-h-8 cursor-pointer items-center rounded-full border px-3 text-[13px] ${value === v ? "border-primary bg-primary-soft font-semibold text-primary" : "border-line text-fg-2"}`}>
          <input type="radio" name={name} className="sr-only" checked={value === v} onChange={() => onChange(v)} />
          {label}
        </label>
      ))}
    </div>
  );
}

export function SettingsView({ onBack }: { onBack: () => void }) {
  const [s, set] = useSettings();
  const { status, progress, initialize, canInitialize } = useOnDevice();
  const { tier, user, signIn, signOut, unavailableReason } = useAuth();
  const { websiteUrl } = usePlatform();
  const [allSites, setAllSites] = useState(false);
  useEffect(() => void hasAllSites().then(setAllSites), []);

  const ondevice: Record<string, string> = {
    checking: "Checking your device…",
    available: "Ready — runs on this computer.",
    downloadable: "Available. Enable it to download the model once.",
    downloading: `Downloading… ${progress ?? 0}%`,
    unavailable: "This device can't run it. We'll use the cloud instead.",
    unsupported: "Not supported in this browser. We'll use the cloud instead.",
  };

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="inline-flex w-fit items-center gap-1 text-[13px] font-medium text-primary hover:underline">
        <ArrowLeft size={14} aria-hidden /> Back
      </button>
      <h1 className="m-0 text-lg font-bold">Settings</h1>

      <Group title="On-device AI">
        <p className="m-0 text-[13px] text-fg-2">{canInitialize ? ondevice[status] : "Not set up in this build. Summaries use a basic on-device method."}</p>
        {canInitialize && status === "downloadable" && (
          <Button size="sm" className="w-fit" onClick={() => void initialize()}>
            Enable on-device AI
          </Button>
        )}
      </Group>

      <Group title="Read sites you visit">
        <p className="m-0 text-[13px] text-fg-2">Lets ThreadNews re-check automatically when you switch tabs while this panel is open. Without it, click the toolbar icon on an article.</p>
        <Button
          size="sm"
          variant={allSites ? "quiet" : "secondary"}
          className="w-fit"
          onClick={async () => setAllSites(allSites ? !(await removeAllSites()) : await requestAllSites())}
        >
          {allSites ? "Turn off" : "Allow on all sites"}
        </Button>
      </Group>

      <Group title="Reading level">
        <Choice<UserSettings["readingLevel"]> name="level" value={s.readingLevel} onChange={(v) => set({ readingLevel: v })} options={[["standard", "Standard"], ["simple", "Simpler"]]} />
      </Group>

      <Group title="Theme">
        <Choice<UserSettings["theme"]> name="theme" value={s.theme} onChange={(v) => set({ theme: v })} options={[["system", "System"], ["light", "Light"], ["dark", "Dark"]]} />
      </Group>

      <Group title="Account">
        <p className="m-0 text-[13px] text-fg-2">{tier === "member" ? `Signed in as ${user?.email ?? user?.displayName ?? "a member"}.` : "Guest — 3 cloud checks a day."}</p>
        {tier === "member" ? (
          <Button size="sm" variant="quiet" className="w-fit" onClick={() => signOut.mutate()}>
            Sign out
          </Button>
        ) : (
          <Button size="sm" className="w-fit" disabled={!!unavailableReason} loading={signIn.isPending} onClick={() => signIn.mutate()}>
            Sign in with Google
          </Button>
        )}
        {unavailableReason && <span className="text-xs text-muted">{unavailableReason}</span>}
      </Group>

      <p className="m-0 text-xs leading-normal text-muted">
        ThreadNews reads articles on your computer. When it checks a story online, only the headline and the key claims are sent. Without on-device AI, the summary is generated in the cloud.{" "}
        <a href={`${websiteUrl}/about#privacy`} target="_blank" rel="noopener">
          Details
        </a>
      </p>
    </div>
  );
}
