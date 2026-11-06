"use client";
// Overview tab: this month's spend by tool and by job, the warnings (caps at 80% and 100%, routes with no key here),
// and the routes table: one row per job with its primary tool, its fallback and its spend. Advanced holds an
// optional separate key per job (Q136), kept in the extension like every other key.
import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Info, ChevronDown } from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import { useToast, haptic } from "@/components/toaster";
import { JOBS, TOOLS, breakdown, totalsOf, filterEvents, spendLine, money, toolName, jobOf, sectionName, type JobId, type Job } from "@/lib/connections";
import { type Conn } from "./use-connections";
import { useKeyActions, oldExtension } from "./keys";
import { ToolInline, Bar, cx } from "./ui";

export function Overview({ conn, onTools }: { conn: Conn; onTools: () => void }) {
  const { ws } = useWorkspace();
  const month = useMemo(() => totalsOf(conn.monthEvents), [conn.monthEvents]);
  const byTool = useMemo(() => breakdown(conn.monthEvents, "tool"), [conn.monthEvents]);
  const byJob = useMemo(() => breakdown(conn.monthEvents.filter((e) => e.job !== "test"), "job"), [conn.monthEvents]);
  const bySection = useMemo(() => breakdown(conn.monthEvents.filter((e) => e.job !== "test"), "section"), [conn.monthEvents]);
  const connectedN = TOOLS.filter((t) => !t.coming && conn.connected(t.id)).length;
  const maxCost = Math.max(0.0001, ...byTool.map((r) => r.totals.cost));
  const stamp = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div className="flex flex-col gap-4">
      <div data-tour="spend" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Spend this month", conn.usageLoading ? null : month.priced ? money(month.cost) : month.calls ? "Not priced" : "None", `${stamp}, list prices`],
          ["Calls this month", conn.usageLoading ? null : month.calls.toLocaleString("en-GB"), month.failed ? `${month.failed} failed` : "All jobs and sections"],
          ["Tools connected", conn.status === null ? null : `${connectedN} of ${TOOLS.filter((t) => !t.coming).length}`, conn.status?.installed ? "In this browser" : "Prax for Chrome is not installed"],
          ["Warnings", String(conn.warnings.length), conn.warnings.length ? "See below" : "Nothing needs you"],
        ].map(([label, v, sub], i) => (
          <div key={String(label)} className="cx-in card flex flex-col gap-1 p-4" style={{ ["--i" as string]: i }}>
            <span className="label">{label}</span>
            {v == null ? <span className="cx-skel h-8 w-24" /> : <span className="num text-page font-semibold tracking-[-0.02em]">{v}</span>}
            <span className="text-meta text-muted">{sub}</span>
          </div>
        ))}
      </div>

      {conn.warnings.length > 0 && (
        <section aria-label="Warnings" className="card divide-y divide-line">
          {conn.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3 text-body">
              {w.level === "info" ? <Info size={16} className="mt-0.5 shrink-0 text-muted" /> : <AlertTriangle size={16} className={cx("mt-0.5 shrink-0", w.level === "stop" ? "text-dark-red" : "text-accent")} />}
              <span className="min-w-0 flex-1">{w.text}</span>
              {w.tool && <Link href={`/w/${ws.slug}/connections/${w.tool}`} className="btn btn-quiet h-8 shrink-0">Open</Link>}
            </div>
          ))}
        </section>
      )}

      <Routes conn={conn} />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5" aria-labelledby="by-tool">
          <h2 id="by-tool" className="text-body font-semibold">Spend this month by tool</h2>
          {conn.usageLoading ? <div className="cx-skel mt-3 h-32" /> : conn.usageError ? <p className="mt-3 text-body text-muted">Usage could not load. <button className="font-medium text-ink underline" onClick={conn.reloadUsage}>Try again</button></p> : !byTool.length ? (
            <p className="mt-3 text-body text-muted">None this month. Calls show here as soon as a draft, search or check runs.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {byTool.slice(0, 8).map((r) => (
                <li key={r.key} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3 text-body"><Link href={`/w/${ws.slug}/connections/${r.key}`} className="min-w-0 hover:underline"><ToolInline id={r.key} /></Link><span className="num shrink-0 text-meta text-muted">{r.totals.calls} {r.totals.calls === 1 ? "call" : "calls"} · <span className="font-medium text-ink">{spendLine(r.totals)}</span></span></div>
                  <Bar value={r.totals.priced ? r.totals.cost / maxCost : r.share} label={`${toolName(r.key)} share`} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card p-5" aria-labelledby="by-job">
          <h2 id="by-job" className="text-body font-semibold">By job and by section</h2>
          {conn.usageLoading ? <div className="cx-skel mt-3 h-32" /> : !byJob.length ? <p className="mt-3 text-body text-muted">None this month.</p> : (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <ul className="flex flex-col gap-2.5">{byJob.map((r) => <Share key={r.key} label={jobOf(r.key)?.name ?? "Untagged"} share={r.share} right={spendLine(r.totals)} />)}</ul>
              <ul className="flex flex-col gap-2.5">{bySection.map((r) => <Share key={r.key} label={sectionName(r.key)} share={r.share} right={`${Math.round(r.share * 100)}%`} />)}</ul>
            </div>
          )}
        </section>
      </div>
      <p className="text-meta text-muted">You pay each provider directly. Costs are estimates from list prices, or the cost the provider reports. Prax stores call counts, tokens and costs, never the text. <button type="button" className="font-medium text-ink underline decoration-line-strong underline-offset-2" onClick={onTools}>See all tools</button></p>
    </div>
  );
}

function Share({ label, share, right }: { label: string; share: number; right: string }) {
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-meta"><span className="truncate text-ink">{label}</span><span className="num shrink-0 text-muted">{right}</span></div>
      <Bar value={share} label={`${label} share of calls`} />
    </li>
  );
}

function Routes({ conn }: { conn: Conn }) {
  const { ws } = useWorkspace();
  const toast = useToast();
  const keys = useKeyActions(conn.send, toast);
  const [adv, setAdv] = useState(false);
  const can = conn.editor && !conn.missing;
  async function set(job: Job, next: { primary: string; fallback: string }) {
    try {
      const prev = await conn.save({ routes: { ...conn.settings.routes, [job.id]: next } });
      if (job.id === "comment" && next.primary) await conn.send("settings", { provider: next.primary }).catch(() => {});
      haptic();
      toast(`${job.name}: ${toolName(next.primary)}${next.fallback ? `, then ${toolName(next.fallback)}` : ""}`, async () => { await conn.save({ routes: prev.routes }); });
    } catch (e) { toast((e as Error).message); }
  }
  const label = (t: string) => `${toolName(t)}${t.startsWith("prax_") ? " (built in)" : conn.connected(t) ? "" : " (no key here)"}`;
  return (
    <section data-tour="routes" className="card overflow-hidden" aria-labelledby="routes-h">
      <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-4 pb-3">
        <div><h2 id="routes-h" className="text-body font-semibold">Routes</h2><p className="mt-0.5 text-meta text-muted">Each job runs on its primary tool, or on the fallback when the primary has no key here, reaches its cap, or fails.</p></div>
        {conn.missing && <span className="text-meta text-muted">Run <code className="kbd">db/032_connections.sql</code> to change routes.</span>}
        {!conn.editor && <span className="text-meta text-muted">Editors and owners change routes.</span>}
      </div>
      <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_110px] gap-4 border-y border-line bg-surface-2 px-5 py-2 text-meta font-medium text-muted md:grid">
        <span>Job</span><span>Primary</span><span>Fallback</span><span className="text-right">This month</span>
      </div>
      {JOBS.map((j) => {
        const r = conn.route(j.id);
        const t = totalsOf(filterEvents(conn.monthEvents, { job: j.id }));
        return (
          <div key={j.id} className="cx-row grid grid-cols-2 items-center gap-x-4 gap-y-2 border-b border-line px-5 py-3 last:border-b-0 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_110px]">
            <div className="col-span-2 min-w-0 md:col-span-1"><div className="text-body font-medium">{j.name}</div><div className="truncate text-meta text-muted">{j.where}</div></div>
            {j.routed ? (
              <>
                <label className="flex min-w-0 flex-col gap-1"><span className="text-meta text-muted md:sr-only">Primary</span>
                  <select className="cx-select w-full" disabled={!can} value={r.primary} onChange={(e) => set(j, { primary: e.target.value, fallback: r.fallback === e.target.value ? "" : r.fallback })}>
                    {j.tools.map((x) => <option key={x} value={x}>{label(x)}</option>)}
                  </select></label>
                <label className="flex min-w-0 flex-col gap-1"><span className="text-meta text-muted md:sr-only">Fallback</span>
                  <select className="cx-select w-full" disabled={!can} value={r.fallback} onChange={(e) => set(j, { primary: r.primary, fallback: e.target.value })}>
                    <option value="">None</option>
                    {j.tools.filter((x) => x !== r.primary).map((x) => <option key={x} value={x}>{label(x)}</option>)}
                  </select></label>
              </>
            ) : (
              <div className="col-span-2 text-meta text-muted md:col-span-2">The engines ticked in <Link href={`/w/${ws.slug}/citations`} className="font-medium text-ink underline decoration-line-strong underline-offset-2">AI citations</Link>, each with its own key.</div>
            )}
            <div className="col-span-2 flex items-baseline justify-between gap-2 md:col-span-1 md:block md:text-right"><span className="text-meta text-muted md:hidden">This month</span><span className="num text-body">{spendLine(t)}</span></div>
          </div>
        );
      })}
      <div className="border-t border-line">
        <button type="button" className="flex w-full items-center justify-between gap-2 px-5 py-3 text-left text-body font-medium hover:bg-surface-2" aria-expanded={adv} onClick={() => setAdv(!adv)}>
          <span>Advanced: a separate key for one job</span><ChevronDown size={16} className={cx("transition-transform", adv && "rotate-180")} />
        </button>
        {adv && <Advanced conn={conn} keys={keys} />}
      </div>
    </section>
  );
}

function Advanced({ conn, keys }: { conn: Conn; keys: ReturnType<typeof useKeyActions> }) {
  const toast = useToast();
  const [open, setOpen] = useState<JobId | null>(null);
  const [key, setKey] = useState("");
  const old = oldExtension(conn.status);
  const jobs = JOBS.filter((j) => j.routed && j.id !== "humanize_rewrite");
  if (!conn.status?.installed) return <p className="px-5 pb-4 text-meta text-muted">Prax for Chrome is needed: per-job keys stay in the extension too.</p>;
  return (
    <div className="flex flex-col gap-0 px-5 pb-4">
      <p className="mb-2 text-meta text-muted">For example a separate Claude key for comment drafts, billed apart from the key every other job uses. Saved only in this browser.{old && " Update Prax for Chrome to use this."}</p>
      {jobs.map((j) => {
        const r = conn.route(j.id), tool = r.primary;
        const has = conn.status?.jobKeys?.[j.id];
        if (tool.startsWith("prax_")) return null;
        return (
          <div key={j.id} className="border-t border-line py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-body">
              <span className="min-w-0 flex-1"><span className="font-medium">{j.name}</span> <span className="text-meta text-muted">on {toolName(tool)}</span></span>
              <span className="text-meta text-muted">{has ? `Separate ${toolName(has, true)} key` : "Uses the tool's key"}</span>
              <button type="button" className="btn h-8" disabled={old} onClick={() => { setOpen(open === j.id ? null : j.id); setKey(""); }}>{open === j.id ? "Cancel" : has ? "Replace" : "Add a key"}</button>
              {has && <button type="button" className="btn btn-ghost h-8 hover:text-bad" onClick={() => keys.clearJobKey(j.id).catch((e) => toast((e as Error).message))}>Remove</button>}
            </div>
            {open === j.id && (
              <form className="anim-rise mt-2 flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); if (!key.trim()) return; try { await keys.saveJobKey(j.id, tool, key); setKey(""); setOpen(null); conn.save({ advanced: { ...conn.settings.advanced, [j.id]: true } }).catch(() => {}); } catch (err) { toast((err as Error).message); } }}>
                <label htmlFor={`jk-${j.id}`} className="sr-only">{toolName(tool)} key for {j.name}</label>
                <input id={`jk-${j.id}`} autoFocus type="password" autoComplete="off" spellCheck={false} className="field h-9 min-w-0 flex-[1_1_240px] font-mono text-meta" placeholder={`Paste a ${toolName(tool)} key for this job`} value={key} onChange={(e) => setKey(e.target.value)} />
                <button type="submit" className="btn btn-dark h-9" disabled={!key.trim()}>Save to this browser</button>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
