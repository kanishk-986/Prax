"use client";
// The Dashboard's first-run guide for a new profile: what to do first, in order, each step ticked from real
// data (Settings filled in, the extension connected in this browser, the LinkedIn export imported, the first
// people in Pipeline). It shows only while the profile has nobody in Pipeline, and goes once every step is done.
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";

export type SetupStep = { key: string; title: string; line: string; href: string; done: boolean };

export function GetStarted({ name, steps }: { name: string; steps: SetupStep[] }) {
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done)?.key;
  if (done === steps.length) return null;
  return (
    <section data-tour="setup" className="panel" aria-labelledby="setup-title">
      <div className="panel-head">
        <span id="setup-title" className="flex min-w-0 items-center gap-2">Set up {name}</span>
        <span className="num text-meta font-normal text-muted">{done} of {steps.length} done</span>
      </div>
      <div className="h-[3px] bg-track" aria-hidden="true"><div className="bar-grow h-full bg-accent" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ol className="m-0 list-none p-0">
        {steps.map((s, i) => (
          <li key={s.key} className="border-t border-line first:border-0">
            <Link href={s.href} className="row-hit group" aria-label={`${s.title}${s.done ? ", done" : ""}`}>
              <span className={`num grid h-7 w-7 shrink-0 place-items-center rounded-full text-meta font-semibold ${s.done ? "bg-ink text-white" : s.key === next ? "bg-accent text-white" : "border border-line-strong text-muted"}`}>
                {s.done ? <Check size={14} strokeWidth={2.5} aria-hidden="true" /> : i + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={`text-body font-semibold ${s.done ? "text-muted" : ""}`}>{s.title}</span>
                <span className="text-meta text-muted">{s.line}</span>
              </span>
              {s.key === next && <span className="hidden whitespace-nowrap text-meta font-semibold text-accent sm:inline">Do this next</span>}
              <ChevronRight size={15} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The four first steps for a profile, from what Prax already knows about it. */
export function setupSteps(o: { base: string; first: string; hasStrategy: boolean; extConnected: boolean; people: number; prospects: number }): SetupStep[] {
  return [
    { key: "settings", title: "Fill in the profile", line: `Role, company, pillars, focus regions and the comment voice, so every draft sounds like ${o.first}.`, href: `${o.base}/settings`, done: o.hasStrategy },
    { key: "extension", title: "Connect the Chrome extension", line: "It drafts comments on LinkedIn and logs what is posted. The AI key stays in this browser.", href: `${o.base}/connections?tab=chrome`, done: o.extConnected },
    { key: "network", title: "Import the LinkedIn export", line: "The connections zip from LinkedIn. Warm paths and segments come from it; message text is never saved.", href: `${o.base}/network`, done: o.people > 0 },
    { key: "pipeline", title: "Add the first people to Pipeline", line: "From the Network import, a CSV or one by one. Today then plans comments and follow-ups for them.", href: `${o.base}/pipeline`, done: o.prospects > 0 },
  ];
}
