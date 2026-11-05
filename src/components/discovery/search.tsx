"use client";
import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { ESTIMATE, type Engine } from "@/lib/citations";
import { type PlannedSearch, type Settings, type Finding, PACK_LABEL } from "@/lib/discovery";
import { type Data, type LogRow, type Run, SidePanel, BandPill, Tag, engineName } from "./shared";

export const PACKS: { id: keyof Settings["packs"]; label: string; sub: (n: number) => string }[] = [
  { id: "pillar", label: "By pillar", sub: () => "Six pillars with region" },
  { id: "entity", label: "By company or person", sub: (n) => `${n} this week, in rotation` },
  { id: "event", label: "By event word", sub: () => "launch, pilot, licence and more" },
  { id: "gap", label: "AI citations gaps", sub: (n) => (n ? "open gap prompts" : "No open gaps") },
];

/** AI search: what is searched, on which AI tools, and a live log of what each search found. */
export function SearchTab({ d, slug, plan, packCount, live, lastAi, running, chosen, onRun, onStop, saveSettings, findingsFor }: {
  d: Data; slug: string; plan: PlannedSearch[]; packCount: Record<string, number>; live: { log: LogRow[]; done: number; total: number; phase: string } | null; lastAi: Run | null;
  running: boolean; chosen: Engine[]; onRun: () => void; onStop: () => void; saveSettings: (s: Partial<Settings>, note: string) => void; findingsFor: (r: LogRow) => Finding[];
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState<LogRow | null>(null);
  const s = d.settings;
  const calls = plan.length * Math.max(1, chosen.length);
  const cost = plan.length * chosen.reduce((a, e) => a + ESTIMATE[e].usd, 0);
  const log = live?.log.length ? live.log : lastAi?.log ?? [];
  const add = () => { const v = draft.trim(); if (!v) return; saveSettings({ queries: [...s.queries, v] }, "Search added"); setDraft(""); };
  const cols = "grid-cols-[minmax(0,2.6fr)_minmax(0,.9fr)_minmax(0,.8fr)_repeat(3,minmax(0,.6fr))]";

  return (
    <div className="anim-rise flex flex-col gap-4">
      <div data-tour="ai" className="flex flex-wrap items-stretch gap-4 rounded-2xl">
        <section className="flex min-w-0 flex-[3_1_560px] flex-col gap-3 rounded-2xl border border-line bg-white px-5 py-[18px]">
          <span className="flex flex-wrap items-start justify-between gap-2.5"><span className="min-w-0"><span className="font-[650]">What the AI will search</span><span className="mt-0.5 block text-[12.5px] text-muted">Each search runs on every connected AI tool with web search on, over the last {s.window_days === 3 ? "72 hours" : "7 days"}. Only sources the AI actually cites are kept.</span></span><span className="num shrink-0 text-[13px]">{plan.length} searches</span></span>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {PACKS.map((k) => {
              const on = s.packs[k.id];
              return (
                <button key={k.id} type="button" aria-pressed={on} disabled={!d.editable} onClick={() => saveSettings({ packs: { ...s.packs, [k.id]: !on } }, on ? `${k.label} off` : `${k.label} on`)}
                  className="flex min-w-0 flex-col items-start gap-0.5 rounded-xl bg-white px-3.5 py-3 text-left" style={{ border: on ? "2px solid #d64545" : "1px solid #e8e8e8", color: on ? "#141414" : "#8c8c8c" }}>
                  <span className="text-[13.5px] font-semibold">{k.label}</span><span className="text-[12px] opacity-80">{k.sub(packCount[k.id] ?? 0)}</span><span className="num mt-auto pt-1 text-[18px]">{on ? packCount[k.id] ?? 0 : 0}</span>
                </button>
              );
            })}
          </div>
          <span className="label text-ink">Your own searches</span>
          <span className="flex flex-wrap gap-1.5">
            {s.queries.map((q, i) => (
              <span key={q + i} className="inline-flex h-[30px] max-w-full items-center rounded-full bg-[#141414] pl-3 pr-1.5 text-[12.5px] font-semibold text-white">
                <span className="truncate">{q}</span>
                {d.editable && <button type="button" aria-label={`Remove ${q}`} className="ml-1 grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-white/15" onClick={() => saveSettings({ queries: s.queries.filter((_, j) => j !== i) }, "Search removed")}><X size={13} /></button>}
              </span>
            ))}
            {!s.queries.length && <span className="text-[13px] text-muted">None yet.</span>}
          </span>
          {d.editable && <span className="flex gap-2"><label htmlFor="aiq" className="sr-only">Add a search</label><input id="aiq" className="field h-10 min-w-0 flex-1" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="For example: SAMA open banking rules for payment firms" /><button type="button" className="btn btn-dark h-10 shrink-0 px-4" onClick={add}>Add</button></span>}
        </section>
        <aside className="flex min-w-0 flex-[2_1_300px] flex-col gap-2.5 rounded-2xl bg-[#141414] p-[18px] text-white">
          <span className="text-[12px] font-semibold uppercase tracking-[.06em] text-[#ff8a80]">AI tools</span>
          {d.engines.map((e) => (
            <span key={e.id} className="flex items-center justify-between gap-2.5 border-t border-white/10 pt-2 text-[13px]">
              <span className="min-w-0"><b>{e.name}</b><span className="block text-[11.5px] text-[#cfcfcf]">{e.ready ? "Web search on, key in this browser" : "No key in this browser"}</span></span>
              {e.ready ? <span className="shrink-0 text-[12px] font-semibold">Ready</span> : <Link href={`/w/${slug}/extension#search-keys`} className="btn btn-primary h-7 shrink-0 px-2.5 text-[12px]">Add key</Link>}
            </span>
          ))}
          <span className="text-[12.5px] text-[#cfcfcf]">About {calls} calls · about ${cost.toFixed(2)} on your keys (list prices, rough)</span>
          {d.editable && (running ? <button type="button" className="btn mt-auto h-[42px] border-white/30 bg-transparent text-white hover:bg-white/10" onClick={onStop}>Stop · {live ? `${live.done} of ${live.total}` : ""}{live?.phase === "Scoring" ? " · scoring" : ""}</button>
            : <button type="button" className="btn btn-primary mt-auto h-[42px]" disabled={!chosen.length || !plan.length} onClick={onRun}>{chosen.length ? "Run AI search" : "Add a key first"}</button>)}
        </aside>
      </div>
      <div data-tour="ailog" className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-[18px] py-3.5"><span className="font-[650]">Search log</span><span className="text-[12px] text-muted">{live?.log.length ? `Running · ${live.done} of ${live.total}` : lastAi ? `Last run ${new Date(lastAi.started_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · ${log.length} searches` : "No run yet"}</span></div>
        {log.length ? (
          <div className="overflow-x-auto"><div className="min-w-[820px]">
            <div className={`grid ${cols} gap-2.5 bg-[#141414] px-[18px] py-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-white`}><span>Search</span><span>Group</span><span>AI tool</span><span>Results</span><span>Cited</span><span>Confirmed</span></div>
            {log.map((r, i) => {
              const done = r.returned != null || !!r.error, cur = !!live?.log.length && !done && i < (live?.done ?? 0) + 3;
              return (
                <button key={r.id ?? i} type="button" onClick={() => setOpen(r)} className={`grid w-full ${cols} items-center gap-2.5 border-t border-[#ececec] px-[18px] py-2.5 text-left text-[13px] hover:bg-[#fafafa]`}>
                  <span className="flex min-w-0 items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.error ? "#d64545" : cur ? "#d64545" : done ? ((r.cited ?? 0) ? "#141414" : "#b5b5b5") : "#e3e3e3" }} /><span className="truncate">{r.q}</span></span>
                  <span className="truncate text-muted">{PACK_LABEL[(r.pack ?? "custom") as keyof typeof PACK_LABEL]}</span><span className="truncate">{engineName(r.engine ?? "")}</span>
                  <span className="num">{r.error ? "Failed" : done ? r.returned : cur ? "…" : "None"}</span><span className="num">{done && !r.error ? r.cited : "None"}</span><span className="num">{done && !r.error ? r.confirmed : "None"}</span>
                </button>
              );
            })}
          </div></div>
        ) : <p className="m-0 border-t border-[#ececec] px-[18px] py-5 text-[13px] text-muted">No AI search has run yet. Connect a key on the Extension page, then press Run AI search. Each search shows here as it runs.</p>}
      </div>
      {open && (() => {
        const rows = findingsFor(open);
        return (
          <SidePanel kicker={`${PACK_LABEL[(open.pack ?? "custom") as keyof typeof PACK_LABEL]} · ${engineName(open.engine ?? "")} web search · last ${s.window_days === 3 ? "72 hours" : "7 days"}`} title={open.q} onClose={() => setOpen(null)}>
            <span className="text-[12.5px] leading-relaxed text-muted">{open.error ? `This search failed: ${open.error}` : `${open.returned ?? 0} results, ${open.cited ?? 0} with a cited source, ${open.confirmed ?? 0} confirmed by opening the page. Results without a cited source are not kept.`}</span>
            <span className="label text-ink">What it found</span>
            {rows.map((f) => <FoundRow key={f.id} f={f} d={d} />)}
            {!rows.length && <span className="text-[13px] text-muted">Nothing new kept. Searched, not skipped.</span>}
          </SidePanel>
        );
      })()}
    </div>
  );
}

export function FoundRow({ f, d }: { f: Finding; d: Data }) {
  const b = d.band(f);
  return (
    <div className="flex flex-col gap-1 rounded-[10px] border border-[#ececec] px-3 py-2.5">
      <span className="text-[13.5px] font-semibold leading-snug">{f.title}</span>
      <a href={f.url} target="_blank" rel="noopener noreferrer" className="truncate text-[12px] text-muted hover:text-ink">{f.url}</a>
      <span className="flex flex-wrap items-center gap-1.5">{f.confirmed ? <Tag tone="dark">Confirmed</Tag> : <Tag tone="white">Unconfirmed</Tag>}<BandPill b={b} /><span className="text-[12px]">{b === "Dropped" ? "Dropped: old, weak or off topic" : `Became a finding: ${b}`}</span></span>
    </div>
  );
}
