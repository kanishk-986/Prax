"use client";
import { useEffect, useState } from "react";
import { X, ArrowUp } from "lucide-react";
import { type Settings, type Finding, DIMENSIONS, PRIORITY_FACTORS, DEFAULT_WEIGHTS, DEFAULT_PRIORITY, DEFAULT_PENALTIES, DEFAULT_BANDS, total, weightsOk, suggestWeights } from "@/lib/discovery";
import type { Data } from "./shared";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/** Criteria: how findings are scored and topics ranked. Weights must total 100; changes apply to the next run. */
export function CriteriaTab({ d, findings, save }: { d: Data; findings: Finding[]; save: (s: Partial<Settings>, note: string) => void }) {
  const [s, setS] = useState<Settings>(d.settings);
  const [skip, setSkip] = useState<string[]>([]);
  const [ex, setEx] = useState("");
  useEffect(() => setS(d.settings), [d.settings]);
  const wTotal = total(s.weights), pTotal = total(s.priority), wOk = weightsOk(s.weights), pOk = weightsOk(s.priority);
  const sug = suggestWeights(findings, d.settings.weights).filter((g) => !skip.includes(g.id));
  const dis = !d.editable;
  const Pill = ({ ok, n }: { ok: boolean; n: number }) => <span className="pill shrink-0" style={ok ? { background: "#141414", color: "#fff" } : { background: "#d64545", color: "#fff" }}>Total {n} of 100</span>;
  const Slider = ({ label, q, v, max, on }: { label: string; q: string; v: number; max: number; on: (n: number) => void }) => (
    <label className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_36px] items-center gap-3 text-[13px]">
      <span className="min-w-0"><b>{label}</b><span className="block text-[11.5px] leading-snug text-muted">{q}</span></span>
      <input type="range" min={0} max={max} step={1} value={v} disabled={dis} onChange={(e) => on(Number(e.target.value))} aria-label={label} className="w-full accent-[#d64545]" />
      <span className="num text-right">{v}</span>
    </label>
  );
  const runSteps = [
    [`${d.settings.run_day}: Crawl runs on the Prax server`, "Every link in your lists is read. Gated and blocked links are listed."],
    ["When you open Discovery that day: AI search starts in your browser", "Your keys never leave this browser, so AI search runs when Prax is open. You can watch it on the AI search tab."],
    ["After both: articles merge into topics", "Same story, names, events and dates. Unsure pairs show Possible merge."],
    ["Then: the Digest is ranked", "Top 10 topics, plus Rising for fast-growing new ones. Everything else stays in Findings."],
  ];
  return (
    <div className="anim-rise flex flex-wrap items-stretch gap-4">
      <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-4">
        <section data-tour="weights" className="flex flex-col gap-3 rounded-2xl border border-line bg-white px-5 py-[18px]">
          <span className="flex items-center justify-between gap-2.5"><span className="font-semibold">Scoring weights</span><Pill ok={wOk} n={wTotal} /></span>
          {DIMENSIONS.map(([label, q], j) => <Slider key={label} label={label} q={q} v={s.weights[j]} max={40} on={(n) => setS({ ...s, weights: s.weights.map((x, i) => (i === j ? n : x)) })} />)}
          <span className="text-[12.5px]" style={{ color: wOk ? "#5f5f5f" : "#d64545" }}>{wOk ? "Weights add up to 100." : `Weights must add up to exactly 100. ${wTotal > 100 ? `Take ${wTotal - 100} off.` : `Add ${100 - wTotal}.`}`}</span>
          {d.editable && <span className="flex gap-2"><button type="button" className="btn h-9" onClick={() => setS({ ...s, weights: DEFAULT_WEIGHTS })}>Reset</button><button type="button" className="btn btn-primary h-9" disabled={!wOk} onClick={() => save({ weights: s.weights, bands: s.bands }, "Criteria saved. They apply to the next run.")}>Save criteria</button></span>}
        </section>
        <section data-tour="pweights" className="flex flex-col gap-3 rounded-2xl border border-line bg-white px-5 py-[18px]">
          <span className="flex items-start justify-between gap-2.5"><span className="min-w-0"><span className="font-semibold">Topic priority in the Digest</span><span className="mt-0.5 block text-[12.5px] text-muted">Articles about the same story are merged into one topic, then ranked on these filters.</span></span><Pill ok={pOk} n={pTotal} /></span>
          {PRIORITY_FACTORS.map(([label, q], j) => <Slider key={label} label={label} q={q} v={s.priority[j]} max={60} on={(n) => setS({ ...s, priority: s.priority.map((x, i) => (i === j ? n : x)) })} />)}
          {([["posted", "Posted recently", "Points taken off when the profile posted on it in the last 14 days"], ["crowded", "Crowded", "Points taken off when peers already posted; the topic stays, marked for a different angle"]] as const).map(([k, label, q]) => (
            <label key={k} className="grid grid-cols-[minmax(0,1fr)_70px] items-center gap-3 text-[13px]"><span className="min-w-0"><b>{label} (minus)</b><span className="block text-[11.5px] leading-snug text-muted">{q}</span></span>
              <input type="number" min={0} max={40} className="field h-[34px]" disabled={dis} value={s.penalties[k]} onChange={(e) => setS({ ...s, penalties: { ...s.penalties, [k]: Math.max(0, Math.min(40, Number(e.target.value) || 0)) } })} aria-label={label} /></label>
          ))}
          <span className="text-[12.5px]" style={{ color: pOk ? "#5f5f5f" : "#d64545" }}>{pOk ? "Priority weights add up to 100." : `They must add up to exactly 100. ${pTotal > 100 ? `Take ${pTotal - 100} off.` : `Add ${100 - pTotal}.`}`}</span>
          {d.editable && <span className="flex gap-2"><button type="button" className="btn h-9" onClick={() => setS({ ...s, priority: DEFAULT_PRIORITY, penalties: DEFAULT_PENALTIES })}>Reset</button><button type="button" className="btn btn-primary h-9" disabled={!pOk} onClick={() => save({ priority: s.priority, penalties: s.penalties }, "Topic priority saved. It applies to the Digest now.")}>Save priority</button></span>}
        </section>
        <div data-tour="runnote" className="flex flex-1 flex-col gap-2 rounded-2xl bg-[#141414] p-[18px] text-white">
          <span className="font-[650]">The weekly run</span>
          {runSteps.map(([t, b], i) => <span key={t} className="flex gap-2.5 border-t border-white/10 pt-2 text-[13px] leading-relaxed"><b className="num text-[#ff8a80]">{i + 1}</b><span><b>{t}</b><span className="block text-[12.5px] text-[#cfcfcf]">{b}</span></span></span>)}
        </div>
      </div>
      <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
        <div data-tour="learn" className="flex flex-col gap-2.5 rounded-2xl border-2 border-[#d64545] bg-white p-[18px]">
          <span className="font-[650]">Suggested weight changes</span>
          <span className="text-[12.5px] leading-snug text-muted">Learned from what you dismissed and sent. Nothing changes until you accept.</span>
          {sug.map((g) => (
            <div key={g.id} className="flex flex-col gap-1.5 border-t border-[#ececec] pt-2.5">
              <b className="text-[13.5px]">{g.change}</b><span className="text-[12px] text-muted">{g.why}</span>
              {d.editable && <span className="flex gap-1.5"><button type="button" className="btn btn-primary h-[30px]" onClick={() => { save({ weights: g.next }, `Weights updated: ${g.change}`); setSkip([...skip, g.id]); }}>Accept</button><button type="button" className="btn h-[30px]" onClick={() => setSkip([...skip, g.id])}>Not now</button></span>}
            </div>
          ))}
          {!sug.length && <span className="text-[13px] text-muted">None yet. They appear after a few dismissals or sends.</span>}
        </div>
        <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-white p-[18px]">
          <span className="font-semibold">Bands</span>
          {([["post", "Post-worthy from"], ["comment", "Comment-worthy from (LinkedIn)"], ["target", "Comment-worthy, target author"], ["watch", "Watch from (below is dropped)"]] as const).map(([k, l]) => (
            <label key={k} className="flex items-center justify-between gap-2.5 text-[13px]"><span className="min-w-0">{l}</span><input type="number" min={0} max={100} disabled={dis} className="field h-[34px] shrink-0" style={{ width: 70 }} value={s.bands[k]} onChange={(e) => setS({ ...s, bands: { ...s.bands, [k]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } })} /></label>
          ))}
          <span className="text-[12px] text-muted">Post-worthy also needs freshness within 7 days and evidence 3 or more. Unconfirmed dates are capped at Watch.</span>
          {d.editable && <span className="flex gap-2"><button type="button" className="btn h-9" onClick={() => setS({ ...s, bands: DEFAULT_BANDS })}>Reset</button><button type="button" className="btn btn-primary h-9" onClick={() => save({ bands: s.bands }, "Bands saved")}>Save bands</button></span>}
        </div>
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-[18px]">
          <span className="font-semibold">Geography order</span>
          {s.geo.map((g, i) => (
            <span key={g} className="flex items-center gap-2 text-[13px]"><span className="num w-[18px] text-faint">{i + 1}</span><span className="min-w-0 flex-1">{g}</span>
              {d.editable && <button type="button" className="btn h-7 w-7 p-0" aria-label={`Move ${g} up`} disabled={!i} onClick={() => { const a = [...s.geo]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; save({ geo: a }, "Geography order saved"); }}><ArrowUp size={13} /></button>}</span>
          ))}
        </div>
        <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-white p-[18px]">
          <span className="font-semibold">Excluded topics</span>
          <span className="flex flex-wrap gap-1.5">
            {s.excluded.map((x) => <span key={x} className="inline-flex h-[30px] max-w-full items-center rounded-full bg-[#141414] pl-3 pr-1.5 text-[12.5px] font-semibold text-white"><span className="truncate">{x}</span>{d.editable && <button type="button" aria-label={`Remove ${x}`} className="ml-1 grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-white/15" onClick={() => save({ excluded: s.excluded.filter((y) => y !== x) }, `Removed ${x}`)}><X size={13} /></button>}</span>)}
            {!s.excluded.length && <span className="text-[13px] text-muted">None.</span>}
          </span>
          {d.editable && <span className="flex gap-2"><input className="field h-9 min-w-0 flex-1" value={ex} onChange={(e) => setEx(e.target.value)} placeholder="Add a topic to skip" aria-label="Add a topic to skip" onKeyDown={(e) => { if (e.key === "Enter" && ex.trim()) { save({ excluded: [...s.excluded, ex.trim()] }, "Topic excluded"); setEx(""); } }} />
            <button type="button" className="btn btn-dark h-9 shrink-0" disabled={!ex.trim()} onClick={() => { save({ excluded: [...s.excluded, ex.trim()] }, "Topic excluded"); setEx(""); }}>Add</button></span>}
        </div>
        <div className="flex flex-1 flex-col gap-2.5 rounded-2xl border border-line bg-white p-[18px]">
          <span className="font-semibold">Cadence and batch</span>
          <label className="flex items-center justify-between gap-2.5 text-[13px]">Weekly AI search day<select className="field h-[34px] shrink-0" style={{ width: "auto" }} disabled={dis} value={s.run_day} onChange={(e) => save({ run_day: e.target.value }, `AI search day set to ${e.target.value}`)}>{DAYS.map((x) => <option key={x}>{x}</option>)}</select></label>
          <span className="text-[12px] text-muted">The server crawl runs every Monday.</span>
          <label className="flex items-center justify-between gap-2.5 text-[13px]">Entities per run <b className="num">{s.batch}</b></label>
          <input type="range" min={5} max={30} step={1} disabled={dis} value={s.batch} onChange={(e) => setS({ ...s, batch: Number(e.target.value) })} onMouseUp={() => save({ batch: s.batch }, "Batch saved")} onTouchEnd={() => save({ batch: s.batch }, "Batch saved")} onKeyUp={() => save({ batch: s.batch }, "Batch saved")} aria-label="Entities per run" className="accent-[#d64545]" />
          <label className="flex items-center justify-between gap-2.5 text-[13px]">Window
            <span className="flex rounded-lg border border-line p-0.5">{[7, 3].map((w) => <button key={w} type="button" disabled={dis} className={`h-8 rounded-md px-3 text-[13px] font-semibold ${s.window_days === w ? "bg-[#d64545] text-white" : "text-muted"}`} onClick={() => save({ window_days: w }, `Window set to ${w === 3 ? "72 hours" : "7 days"}`)}>{w === 3 ? "72 hours" : "7 days"}</button>)}</span></label>
        </div>
      </aside>
    </div>
  );
}
