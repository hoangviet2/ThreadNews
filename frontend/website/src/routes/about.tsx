import { BRAND } from "@threadnews/shared";
import type { ReactNode } from "react";
import { Container, usePageTitle } from "../components/site-chrome";

const H2 = ({ id, children }: { id?: string; children: ReactNode }) => (
  <h2 id={id} className="m-0 scroll-mt-6 text-2xl font-bold">
    {children}
  </h2>
);
const P = ({ children }: { children: ReactNode }) => <p className="m-0 max-w-[68ch] text-base leading-[1.65] text-fg-2">{children}</p>;

const ROWS: [string, string, string][] = [
  ["Full article text", "No — read on your device. If on-device AI isn't available, the summary is generated in the cloud.", "Never"],
  ["Link, headline, publisher, date", "Yes, for checks", "Yes, with your check history"],
  ["Extracted claims and names", "Yes, for checks", "Yes, in checks and the story map"],
  ["Questions you ask", "Only for cloud answers", "No"],
  ["Your Google email and name", "Firebase Auth only", "Not copied to our database"],
];

export function AboutPage() {
  usePageTitle("About");
  return (
    <Container className="flex max-w-3xl! flex-col gap-10 py-10">
      <section className="flex flex-col gap-4">
        <h1 className="m-0 text-[40px] leading-[1.15] font-bold tracking-[-0.8px]">About {BRAND.name}</h1>
        <P>
          Every story is a thread of events. {BRAND.name} shows where the article you're reading sits on that thread, and what came after: a number that was revised, a plan that changed, a
          claim that sources now disagree on.
        </P>
        <P>We report what changed and who reported it. We never call an article true, false or fake.</P>
      </section>

      <section className="flex flex-col gap-4">
        <H2>On your device first</H2>
        <P>
          Gemini Nano runs in Chrome on your computer, through Firebase AI Logic. It reads the article, writes the summary, picks out facts that could change, and — when we already know the
          story — compares them with the latest facts without any cloud call. Look for the On-device badge.
        </P>
        <P>
          When a story is new to us, we search for newer reports in the cloud (Gemini with Google Search) and add what we find to the story map, so the next reader's check can run on their
          device. Those results carry the Cloud badge, Google Search suggestions and every source.
        </P>
      </section>

      <section className="flex flex-col gap-4">
        <H2 id="privacy">What we send and store</H2>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead className="bg-surface-2">
              <tr>
                <th scope="col" className="p-3 font-semibold">
                  Data
                </th>
                <th scope="col" className="p-3 font-semibold">
                  Leaves your device?
                </th>
                <th scope="col" className="p-3 font-semibold">
                  Stored?
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([a, b, c]) => (
                <tr key={a} className="border-t border-line">
                  <th scope="row" className="p-3 font-medium">
                    {a}
                  </th>
                  <td className="p-3 text-fg-2">{b}</td>
                  <td className="p-3 text-fg-2">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <P>Guests are signed in anonymously so limits work without an account. Check history keeps your last 100 checks.</P>
      </section>

      <section className="flex flex-col gap-4">
        <H2 id="install">Install the Chrome extension</H2>
        <ol className="m-0 flex max-w-[68ch] flex-col gap-2 pl-5 text-base leading-[1.6] text-fg-2">
          <li>Use Chrome 148 or later on a desktop computer. On-device AI needs about 22 GB of free disk space and a GPU with more than 4 GB of memory, or 16 GB of RAM and 4 CPU cores. Without it, everything still works through the cloud.</li>
          <li>Download the latest extension zip from the project's Releases page and unzip it.</li>
          <li>
            Open <code className="rounded bg-surface px-1">chrome://extensions</code>, turn on Developer mode, click <strong>Load unpacked</strong> and pick the unzipped folder.
          </li>
          <li>Open a news article and click the {BRAND.name} icon. The side panel opens. Click <strong>Enable on-device AI</strong> the first time.</li>
          <li>Try a check as a guest, then sign in with Google for higher limits.</li>
        </ol>
      </section>
    </Container>
  );
}
