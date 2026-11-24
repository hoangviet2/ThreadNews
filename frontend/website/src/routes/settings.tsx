import { useAuth, useOnDevice, usePlatform, useSettings, type UserSettings } from "@threadnews/shared";
import { Button } from "@threadnews/shared/ui";
import { CloudOff, Zap } from "lucide-react";
import { Link } from "react-router";
import { Container, usePageTitle } from "../components/site-chrome";

function Radio<T extends string>({ name, value, options, onChange }: { name: string; value: T; options: { v: T; label: string; hint?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((o) => (
        <label key={o.v} className="flex min-h-10 cursor-pointer items-start gap-3 rounded-lg px-1 py-1.5 hover:bg-surface-2">
          <input type="radio" name={name} checked={value === o.v} onChange={() => onChange(o.v)} className="mt-1 size-4 accent-(--tn-primary)" />
          <span className="flex flex-col">
            <span className="text-sm font-medium">{o.label}</span>
            {o.hint && <span className="text-[13px] text-muted">{o.hint}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-3 rounded-2xl border border-line p-5">
    <h2 className="m-0 text-lg font-bold">{title}</h2>
    {children}
  </section>
);

export function SettingsPage() {
  usePageTitle("Settings");
  const [s, set] = useSettings();
  const { status, progress, initialize, canInitialize, error } = useOnDevice();
  const { tier, user, signIn, signOut, kind } = useAuth();
  const { api } = usePlatform();

  const statusText: Record<string, string> = {
    checking: "Checking your device…",
    available: "Ready. Summaries and known-story checks run on this computer.",
    downloadable: "Available on this device. Enable it to download the model (one time).",
    downloading: `Downloading the model… ${progress ?? 0}%`,
    unavailable: "This device can't run on-device AI. We'll use the cloud instead.",
    unsupported: "This browser doesn't support on-device AI (needs desktop Chrome 148+). We'll use the cloud instead.",
  };

  return (
    <Container className="flex max-w-3xl! flex-col gap-6 py-10">
      <h1 className="m-0 text-[32px] font-bold tracking-[-0.6px]">Settings</h1>

      <Card title="On-device AI">
        <div className="flex items-start gap-2.5 text-sm text-fg-2">
          {status === "available" ? <Zap size={18} aria-hidden className="mt-0.5 text-current" /> : <CloudOff size={18} aria-hidden className="mt-0.5 text-muted" />}
          <span>{canInitialize ? statusText[status] : "On-device AI isn't set up in this build. Summaries use a basic on-device method."}</span>
        </div>
        {canInitialize && (status === "downloadable" || status === "downloading") && (
          <Button className="w-fit" loading={status === "downloading"} onClick={() => void initialize()}>
            Enable on-device AI
          </Button>
        )}
        {error && <span className="text-[13px] text-disputed">Couldn't start on-device AI. We'll use the cloud for now.</span>}
      </Card>

      <Card title="Reading level">
        <Radio<UserSettings["readingLevel"]>
          name="level"
          value={s.readingLevel}
          onChange={(v) => set({ readingLevel: v })}
          options={[
            { v: "standard", label: "Standard", hint: "Plain English summaries." },
            { v: "simple", label: "Simpler", hint: "Shorter sentences; hard words explained." },
          ]}
        />
      </Card>

      <Card title="Theme">
        <Radio<UserSettings["theme"]>
          name="theme"
          value={s.theme}
          onChange={(v) => set({ theme: v })}
          options={[
            { v: "system", label: "Match my device" },
            { v: "light", label: "Light" },
            { v: "dark", label: "Dark" },
          ]}
        />
      </Card>

      <Card title="Account">
        <p className="m-0 text-sm text-fg-2">
          {tier === "member" ? `Signed in as ${user?.email ?? user?.displayName ?? "a member"}.` : "You're using ThreadNews as a guest. Sign in with Google for 50 cloud checks a day, follows and full explainers."}
        </p>
        {tier === "member" ? (
          <Button variant="quiet" className="w-fit" loading={signOut.isPending} onClick={() => signOut.mutate()}>
            Sign out
          </Button>
        ) : (
          <Button className="w-fit" loading={signIn.isPending} onClick={() => signIn.mutate()}>
            {kind === "demo" ? "Sign in (demo)" : "Sign in with Google"}
          </Button>
        )}
      </Card>

      <Card title="Privacy">
        <p className="m-0 text-sm leading-relaxed text-fg-2">
          ThreadNews reads articles on your computer. When it checks a story online, only the headline and the key claims are sent. Without on-device AI, the summary is generated in the cloud.{" "}
          <Link to="/about#privacy">What we send and store</Link>
        </p>
        {api.mode === "demo" && <p className="m-0 text-[13px] text-muted">Preview mode: nothing is sent to a ThreadNews server. Sample data and limits are kept in this browser.</p>}
      </Card>
    </Container>
  );
}
