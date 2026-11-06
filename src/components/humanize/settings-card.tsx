"use client";
// Settings, Humanization (db/031): the level for comments, posts and articles (0 to 100, presets 20, 50, 70, 90, 100;
// 0 never calls Pangram), the monthly word caps from the user's plans, the cost per 100 words, and this month's meters
// (a warning at 80%, paid checks stop at 100%). The owner changes them; everyone else reads them.
import { useEffect, useState } from "react";
import { UsingLine } from "@/components/connections/sheet";
import { supabase } from "@/lib/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { useToast, haptic } from "@/components/toaster";
import { CheckerLogo, CheckerName } from "@/components/provider-mark";
import { PRESETS, meter, money, clampLevel, type Settings, type Kind } from "@/lib/humanize";
import { useHumanizeSettings } from "./use-humanize";

const LEVELS: [Kind, keyof Settings, string, string][] = [
  ["comment", "level_comment", "Comments", "A badge only; comments are never held back."],
  ["post", "level_post", "Posts", "Must pass before going for approval."],
  ["article", "level_article", "Articles", "Must pass; only edited paragraphs are checked again."],
];

export function HumanizeSettings() {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const owner = can("owner");
  const { settings, loading, missing, usage } = useHumanizeSettings();
  const [f, setF] = useState<Settings>(settings);
  const [busy, setBusy] = useState(false);
  const key = JSON.stringify(settings);
  useEffect(() => { setF(JSON.parse(key)); }, [key]);
  const dirty = JSON.stringify(f) !== JSON.stringify(settings);
  const set = (k: keyof Settings, v: number) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    setBusy(true);
    const { error } = await supabase().from("humanize_settings").upsert({ workspace_id: ws.id, ...f, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) { toast(/humanize_settings/.test(error.message) ? "Run db/031_humanize.sql in Supabase first." : error.message); return; }
    const prev = settings;
    haptic(); toast("Humanization saved", async () => { await supabase().from("humanize_settings").upsert({ workspace_id: ws.id, ...prev, updated_at: new Date().toISOString() }); });
  }

  const Meter = ({ id, cap, used, cost }: { id: "pangram" | "walter"; cap: number; used: number; cost: number }) => {
    const m = meter(used, cap);
    const pct = m.pct == null ? 0 : Math.min(100, Math.round(m.pct * 100));
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2"><CheckerName id={id} className="text-meta" size={14} />
          <span className="num whitespace-nowrap text-meta text-muted">{used.toLocaleString()}{cap ? ` of ${cap.toLocaleString()}` : ""} words · {money(cost)}</span></div>
        <div className={`hz-meter ${m.state === "warn" ? "warn" : m.state === "stop" ? "stop" : ""}`} role="meter" aria-label={`${id === "pangram" ? "Pangram" : "Walter"} words this month`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{ width: `${pct}%` }} /></div>
        <span className={`text-meta ${m.state === "warn" || m.state === "stop" ? "font-semibold text-dark-red" : "text-muted"}`}>
          {m.state === "none" ? "No monthly cap entered, so no paid checks." : m.state === "stop" ? "Cap reached. Paid checks stopped; drafts show the free score only until next month." : m.state === "warn" ? `${pct}% used. Paid checks stop at 100%.` : `${pct}% used this month.`}
        </span>
      </div>
    );
  };

  return (
    <section id="humanization" className="card min-w-0 p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-body font-semibold">Humanization</h2>
        <span className="flex items-center gap-1.5 text-meta text-muted"><CheckerLogo id="pangram" size={14} /> Pangram judges <span aria-hidden="true">·</span> <CheckerLogo id="walter" size={14} /> Walter (beta) fixes</span>
      </div>
      <p className="mt-1 text-meta text-muted">Pangram checks only the final text, when the free Human score is near your level, and never the same text twice. At 0% Pangram is never called. The keys stay in the extension.</p>
      {missing && <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-meta text-ink">Run <code className="kbd">db/031_humanize.sql</code> in Supabase to turn this on. Until then nothing is checked or held back.</p>}
      {loading ? <div className="mt-4 h-40 animate-pulse rounded-xl bg-surface-2" /> : <>
        <fieldset disabled={!owner || missing} className="mt-4 flex flex-col gap-4">
          <legend className="sr-only">Levels</legend>
          {LEVELS.map(([k, key, label, hint]) => {
            const v = f[key] as number;
            return (
              <div key={k} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3"><label htmlFor={`hz-${k}`} className="text-body font-semibold">{label}</label><span className="num text-body font-semibold">{v ? `${v}% human` : "Off"}</span></div>
                <input id={`hz-${k}`} type="range" min={0} max={100} step={5} value={v} className="hz-range" aria-valuetext={v ? `${v} percent` : "Off"} onChange={(e) => set(key, clampLevel(e.target.value))} />
                <div className="flex flex-wrap items-center gap-1.5">
                  {[0, ...PRESETS].map((p) => <button key={p} type="button" aria-pressed={v === p} className={`num h-7 rounded-md border px-2.5 text-meta font-medium ${v === p ? "border-ink bg-ink text-white" : "border-line-strong bg-white text-ink-2 hover:border-ink"}`} onClick={() => set(key, p)}>{p ? `${p}%` : "Off"}</button>)}
                  <span className="text-meta text-muted">{hint}</span>
                </div>
              </div>
            );
          })}
          <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            {(["pangram", "walter"] as const).map((id) => (
              <div key={id} className="flex flex-col gap-2">
                <CheckerName id={id} className="text-body" />
                <label className="flex flex-col gap-1"><span className="label">Monthly words on your plan</span>
                  <input id={`hz-cap-${id}`} type="number" min={0} step={1000} inputMode="numeric" className="field num" value={f[`${id}_cap`] || ""} placeholder="Not entered" onChange={(e) => set(`${id}_cap`, Math.max(0, Math.round(Number(e.target.value) || 0)))} /></label>
                <label className="flex flex-col gap-1"><span className="label">Cost per 100 words, USD</span>
                  <input id={`hz-cost-${id}`} type="number" min={0} step={0.01} inputMode="decimal" className="field num" value={f[`${id}_cost_100`]} onChange={(e) => set(`${id}_cost_100`, Math.max(0, Number(e.target.value) || 0))} /></label>
              </div>
            ))}
          </div>
        </fieldset>
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
          <span className="label">This month</span>
          <Meter id="pangram" cap={settings.pangram_cap} used={usage.pangram.words} cost={usage.pangram.cost} />
          <Meter id="walter" cap={settings.walter_cap} used={usage.walter.words} cost={usage.walter.cost} />
        </div>
        {owner && !missing && <div className="mt-4 flex items-center gap-3"><button className="btn btn-dark" disabled={!dirty || busy} onClick={save}>{busy ? "Saving" : "Save humanization"}</button>{!dirty && <span className="text-meta text-muted">Saved</span>}</div>}
        {!owner && <p className="mt-3 text-meta text-muted">The profile owner sets these.</p>}
        <div id="checker-keys" className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
          <UsingLine job="humanize_check" label="Checks use" />
          <UsingLine job="humanize_rewrite" tool="walter" label="Second fixer" />
        </div>
      </>}
    </section>
  );
}

