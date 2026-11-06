"use client";
// One tool's full page (Q135): what it is and what Prax does with it, connect by key and the MCP details, Test
// connection, the jobs it can do with routing and fallback, usage by section with filters, the monthly cap with an
// 80% warning, the model (Edit), the call log (Review, no content), Replace and Delete with Undo, Back and Previous
// and Next through the catalog as filtered.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Copy, Check, AlertCircle, Loader2 } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { useWorkspace } from "@/lib/workspace";
import { useToast, haptic } from "@/components/toaster";
import {
  TOOLS, SECTIONS, JOBS, toolOf, jobOf, filterCatalog, neighbours, filterEvents, breakdown, totalsOf, daily, capLine, spendLine, money, sectionName, APP_SECTION_IDS, toolName,
  type JobId, type CapUnit, type UsageEvent,
} from "@/lib/connections";
import { useConnections, type Conn } from "./use-connections";
import { KeyPanel } from "./sheet";
import { filterFrom, filterQuery } from "./catalog";
import { useKeyActions, testTool, oldExtension, type TestResult } from "./keys";
import { LogoTile, Dot, Bar, Spark, ToolInline, amount, cx } from "./ui";

const PERIODS = [{ id: "month", label: "This month" }, { id: "30", label: "Last 30 days" }, { id: "90", label: "Last 90 days" }] as const;

export function ToolPage({ id }: { id: string }) {
  const t = toolOf(id)!;
  const { ws } = useWorkspace();
  const sp = useSearchParams();
  const conn = useConnections();
  const toast = useToast();
  const keys = useKeyActions(conn.send, toast);
  const filter = filterFrom(sp);
  const q = filterQuery(filter);
  const removing = keys.removing.includes(t.sharesKey ?? t.id);
  const on = conn.connected(t.id) && !removing;
  // Previous and Next walk the catalog as filtered on the Tools tab (the current tool always stays in the walk).
  const walk = useMemo(() => { const l = filterCatalog(TOOLS, filter, conn.connected, conn.usedBy); return l.some((x) => x.id === id) ? l : TOOLS; }, [filter, conn.connected, conn.usedBy, id]);
  const { prev, next } = neighbours(id, walk);
  const pos = walk.findIndex((x) => x.id === id) + 1;
  const jobs = on ? conn.usedBy(t.id) : [];
  const line = t.coming ? "Coming later" : !on ? "Not connected" : jobs.length ? `Connected · used by ${jobs.length} ${jobs.length === 1 ? "job" : "jobs"}` : "Connected · not used by any job yet";
  const [openSignal, setOpenSignal] = useState(0);
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const old = oldExtension(conn.status);
  const section = SECTIONS.find((s) => s.id === t.section)!;
  const filtered = !!(filter.section || filter.status || filter.job || filter.q);

  async function runTest() {
    setTesting(true); setTest(null);
    const r = await testTool(t.sharesKey ?? t.id);
    setTest(r); setTesting(false); if (r.ok) haptic();
  }

  return (
    <div className="page-fade mx-auto flex max-w-[1180px] flex-col gap-[18px]">
      <nav aria-label="Tools" className="flex flex-wrap items-center justify-between gap-2 pl-10 md:pl-0">
        <Link href={`/w/${ws.slug}/connections${q ? `${q}&tab=tools` : "?tab=tools"}`} className="btn btn-quiet h-9 -ml-2 px-2"><ArrowLeft size={15} /> Connections</Link>
        <div className="flex items-center gap-1.5">
          {filtered && <span className="hidden text-meta text-muted sm:inline">{pos} of {walk.length} filtered</span>}
          <Link href={`/w/${ws.slug}/connections/${prev.id}${q}`} className="btn h-9 max-w-[180px] px-2.5" aria-label={`Previous: ${prev.name}`}><ChevronLeft size={15} /><span className="hidden truncate sm:inline">{prev.short}</span></Link>
          <Link href={`/w/${ws.slug}/connections/${next.id}${q}`} className="btn h-9 max-w-[180px] px-2.5" aria-label={`Next: ${next.name}`}><span className="hidden truncate sm:inline">{next.short}</span><ChevronRight size={15} /></Link>
          <AccountMenu />
        </div>
      </nav>

      <header className={cx("cx-in card flex flex-wrap items-start gap-4 p-5 md:p-6", on && "border-ink")}>
        <LogoTile id={t.id} large />
        <div className="min-w-0 flex-[1_1_280px]">
          <span className="text-meta font-medium text-muted">{section.name}</span>
          <h1 className="mt-0.5 flex flex-wrap items-center gap-2 text-page font-semibold tracking-[-0.02em]">{t.name}{t.beta && <span className="cx-chip">Beta</span>}{t.coming && <span className="cx-chip">Coming later</span>}</h1>
          <p className="mt-1 text-body text-muted">{t.purpose}</p>
          <p className="mt-2.5 flex items-center gap-2 text-body"><Dot on={on} warn={conn.cap(t.id).state === "warn" || conn.cap(t.id).state === "stop"} /><span className={on ? "font-medium" : "text-muted"}>{conn.status === null ? "Checking this browser" : line}</span></p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!t.coming && on && t.test && <button type="button" className="btn h-10 px-3.5" disabled={testing || old} onClick={runTest}>{testing ? <><Loader2 size={14} className="animate-spin" /> Testing</> : "Test connection"}</button>}
          {!t.coming && !on && conn.status?.installed && <button type="button" className="btn btn-primary h-10 px-4" onClick={() => { setOpenSignal((n) => n + 1); document.getElementById("connect")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>Connect {t.short}</button>}
          <a href={t.docs} target="_blank" rel="noreferrer" className="btn btn-quiet h-10 px-3">Docs <ExternalLink size={13} /></a>
        </div>
        {test && (
          <p role="status" className={cx("anim-rise flex basis-full items-start gap-2 rounded-lg px-3 py-2 text-body", test.ok ? "bg-surface-2" : "bg-accent-soft text-dark-red")}>
            {test.ok ? <Check size={15} className="mt-0.5 shrink-0" /> : <AlertCircle size={15} className="mt-0.5 shrink-0" />}{test.line}
          </p>
        )}
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Overview" i={1}>
            <p className="text-body leading-relaxed text-ink-2">{t.about}</p>
            <h3 className="mt-4 text-meta font-semibold text-ink">Use cases in Prax</h3>
            <ul className="mt-1.5 flex flex-col gap-1.5">{t.uses.map((u) => <li key={u} className="flex gap-2 text-body"><span aria-hidden="true" className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-ink" />{u}</li>)}</ul>
            <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2.5 text-body">
              {t.coming ? <>Not available yet. It will: {t.later}</>
                : !t.jobs.length ? <><span className="font-semibold">Prax does not use {t.name} for any job yet.</span> It will be used for: {t.later}</>
                : jobs.length ? <><span className="font-semibold">Prax uses {t.name} today</span> for {jobs.map((j) => jobOf(j)?.name.toLowerCase()).join(", ")}.</>
                : on ? <><span className="font-semibold">Connected, but no job is routed to {t.name} yet.</span> Route a job to it below.</>
                : <>Connect a key, then route a job to it below.</>}
            </p>
          </Panel>

          <Panel title="Connect" id="connect" i={2} sub="One key per tool, saved only in this browser.">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="min-w-0">
                <h3 className="mb-2 text-meta font-semibold">API key</h3>
                <KeyPanel tool={t.id} conn={conn} openSignal={openSignal} onTested={setTest} />
              </div>
              <div className="min-w-0 border-t border-line pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-5">
                <h3 className="mb-2 text-meta font-semibold">MCP server</h3>
                {t.mcp ? (
                  <dl className="flex flex-col gap-2.5 text-body">
                    <div><dt className="text-meta text-muted">Endpoint</dt><dd className="mt-0.5 flex min-w-0 items-center gap-1.5"><code className="min-w-0 truncate font-mono text-meta">{t.mcp.url}</code>{t.mcp.url.startsWith("http") && <CopyButton text={t.mcp.url} />}</dd></div>
                    <div><dt className="text-meta text-muted">Auth</dt><dd className="mt-0.5 text-meta">{t.mcp.auth}</dd></div>
                    <div><dt className="text-meta text-muted">Transport</dt><dd className="mt-0.5 text-meta">Streamable HTTP</dd></div>
                    <dd><a href={t.mcp.docs} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-meta font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">MCP docs <ExternalLink size={11} /></a></dd>
                    <dd className="text-meta text-muted">For your own AI apps (Claude, ChatGPT). Prax itself calls the API with the key, from the extension.</dd>
                  </dl>
                ) : <p className="text-meta text-muted">{t.name} publishes no official MCP server. Prax uses its API.</p>}
              </div>
            </div>
          </Panel>

          <JobsPanel conn={conn} id={t.id} />
          <UsagePanel conn={conn} id={t.id} unit={t.unit} />
          <ReviewPanel conn={conn} id={t.id} />
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6">
          <MonthCard conn={conn} id={t.id} />
          <CapCard conn={conn} id={t.id} />
          {t.model && <EditCard conn={conn} id={t.id} />}
          <section className="card p-5">
            <h2 className="text-body font-semibold">Links</h2>
            <ul className="mt-2 flex flex-col gap-1.5 text-body">
              <li><a href={t.docs} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline">API docs <ExternalLink size={12} /></a></li>
              {t.priceUrl && <li><a href={t.priceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline">Pricing <ExternalLink size={12} /></a></li>}
              {t.console && <li><a href={t.console} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline">Keys and billing <ExternalLink size={12} /></a></li>}
            </ul>
            <p className="mt-3 text-meta text-muted">{t.price}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Panel({ title, sub, id, i, children, right }: { title: string; sub?: string; id?: string; i: number; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${title}-h`} className="cx-in card scroll-mt-6 p-5" style={{ ["--i" as string]: i }}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div><h2 id={`${title}-h`} className="text-title font-semibold">{title}</h2>{sub && <p className="mt-0.5 text-meta text-muted">{sub}</p>}</div>{right}
      </div>
      {children}
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" aria-label="Copy endpoint" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink" onClick={() => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); }, () => {}); }}>{done ? <Check size={13} /> : <Copy size={13} />}</button>;
}

function JobsPanel({ conn, id }: { conn: Conn; id: string }) {
  const t = toolOf(id)!;
  const toast = useToast();
  const { ws } = useWorkspace();
  const can = conn.editor && !conn.missing;
  const list = JOBS.filter((j) => t.jobs.includes(j.id));
  async function set(job: JobId, next: { primary: string; fallback: string }) {
    try {
      const prev = await conn.save({ routes: { ...conn.settings.routes, [job]: next } });
      if (job === "comment") await conn.send("settings", { provider: next.primary }).catch(() => {});
      haptic(); toast(`${jobOf(job)!.name}: ${toolName(next.primary)}${next.fallback ? `, then ${toolName(next.fallback)}` : ""}`, async () => { await conn.save({ routes: prev.routes }); });
    } catch (e) { toast((e as Error).message); }
  }
  return (
    <Panel title="Jobs and routes" i={3} sub={list.length ? "The jobs this tool can do. Each job has one primary tool and an optional fallback." : undefined}>
      {!list.length ? <p className="text-body text-muted">{t.coming ? "No jobs yet." : `Prax has no job for ${t.name} yet. ${t.later ?? ""}`}</p> : (
        <div className="flex flex-col">
          {list.map((j) => {
            const r = conn.route(j.id);
            const role = r.primary === id ? "Primary" : r.fallback === id ? "Fallback" : "";
            return (
              <div key={j.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line py-3 first:border-t-0 first:pt-0">
                <div className="min-w-0 flex-[1_1_220px]">
                  <div className="flex items-center gap-2 text-body font-medium">{j.name}{role && <span className={cx("cx-chip", role === "Primary" && "ink")}>{role}</span>}</div>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-meta text-muted">
                    {j.routed ? <><ToolInline id={r.primary} short className="text-ink" /><span className="cx-wire" aria-hidden="true" /><span>{r.fallback ? <ToolInline id={r.fallback} short className="text-ink" /> : "no fallback"}</span></> : <span>Engines are ticked in <Link href={`/w/${ws.slug}/citations`} className="font-medium text-ink underline decoration-line-strong underline-offset-2">AI citations</Link></span>}
                  </div>
                </div>
                {j.routed && (
                  <div className="flex flex-wrap gap-1.5">
                    {role !== "Primary" && <button type="button" className="btn h-8" disabled={!can} onClick={() => set(j.id, { primary: id, fallback: r.primary === id ? "" : r.primary })}>Make primary</button>}
                    {role === "" && <button type="button" className="btn btn-quiet h-8" disabled={!can} onClick={() => set(j.id, { primary: r.primary, fallback: id })}>Make fallback</button>}
                    {role === "Fallback" && <button type="button" className="btn btn-ghost h-8" disabled={!can} onClick={() => set(j.id, { primary: r.primary, fallback: "" })}>Remove fallback</button>}
                  </div>
                )}
              </div>
            );
          })}
          {conn.missing && <p className="mt-2 text-meta text-muted">Run <code className="kbd">db/032_connections.sql</code> in Supabase to change routes.</p>}
          {!conn.editor && <p className="mt-2 text-meta text-muted">Editors and owners change routes.</p>}
        </div>
      )}
    </Panel>
  );
}

function usePeriod(conn: Conn, id: string, period: string, sectionF: string, jobF: string) {
  return useMemo(() => {
    const now = new Date();
    const base = period === "month" ? filterEvents(conn.events, { month: conn.month }) : filterEvents(conn.events, { days: Number(period), now });
    const all = base.filter((e) => e.job !== "test");
    const mine = filterEvents(all, { tool: id, section: sectionF || "*", job: jobF || undefined });
    const days = period === "month" ? now.getDate() : Number(period);
    return { all, mine, days };
  }, [conn.events, conn.month, id, period, sectionF, jobF]);
}

function UsagePanel({ conn, id, unit }: { conn: Conn; id: string; unit: string }) {
  const [period, setPeriod] = useState("month");
  const [sectionF, setSectionF] = useState("");
  const [jobF, setJobF] = useState("");
  const { all, mine, days } = usePeriod(conn, id, period, sectionF, jobF);
  const tot = totalsOf(mine);
  const allTool = filterEvents(all, { tool: id });
  const share = all.length ? allTool.length / all.length : 0;
  const rows = breakdown(mine, "section");
  const spark = daily(mine, Math.max(2, days)).map((d) => d.calls);
  const t = toolOf(id)!;
  return (
    <Panel title="Usage" i={4} sub="By the Prax section each call came from. Counts, tokens and costs only." right={
      <div className="flex flex-wrap gap-1.5">
        <label className="sr-only" htmlFor="u-period">Period</label>
        <select id="u-period" className="cx-select" value={period} onChange={(e) => setPeriod(e.target.value)}>{PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        <label className="sr-only" htmlFor="u-section">Section</label>
        <select id="u-section" className="cx-select" value={sectionF} onChange={(e) => setSectionF(e.target.value)}><option value="">All sections</option>{APP_SECTION_IDS.map((s) => <option key={s} value={s}>{sectionName(s)}</option>)}</select>
        {t.jobs.length > 1 && <><label className="sr-only" htmlFor="u-job">Job</label>
          <select id="u-job" className="cx-select" value={jobF} onChange={(e) => setJobF(e.target.value)}><option value="">All jobs</option>{t.jobs.map((j) => <option key={j} value={j}>{jobOf(j)?.name}</option>)}</select></>}
      </div>
    }>
      {conn.usageLoading ? <div className="cx-skel h-40" /> : conn.usageError ? <p className="text-body text-muted">Usage could not load. <button className="font-medium text-ink underline" onClick={conn.reloadUsage}>Try again</button></p> : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Calls" v={tot.calls ? tot.calls.toLocaleString("en-GB") : "None"} />
            <Kpi label="Share of all calls" v={allTool.length ? `${Math.round(share * 100)}%` : "None"} />
            <Kpi label={unit === "tokens" ? "Tokens" : unit === "calls" ? "Failed" : unit[0].toUpperCase() + unit.slice(1)} v={unit === "calls" ? String(tot.failed) : amount(tot, unit).replace(/ \w+$/, "") || "None"} />
            <Kpi label="Cost" v={tot.calls ? (tot.priced ? money(tot.cost) : "Not priced") : "None"} />
          </div>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-lg border border-line px-3.5 py-3">
            <div><div className="label">Trend</div><div className="text-meta text-muted">Calls per day, {PERIODS.find((p) => p.id === period)?.label.toLowerCase()}</div></div>
            <Spark points={spark} width={220} height={36} label={`Calls per day for ${t.name}`} />
          </div>
          {!rows.length ? <p className="mt-4 text-body text-muted">None in this period{sectionF || jobF ? " for these filters" : ""}. Calls show here as soon as {t.name} runs a job.</p> : (
            <div className="mt-4">
              <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_70px_90px_80px] gap-3 border-b border-line pb-2 text-meta font-medium text-muted sm:grid">
                <span>Section</span><span>% of calls</span><span className="text-right">Calls</span><span className="text-right">{unit === "tokens" ? "Tokens" : "Amount"}</span><span className="text-right">Cost</span>
              </div>
              {rows.map((r) => (
                <div key={r.key} className="grid grid-cols-2 items-center gap-x-3 gap-y-1.5 border-b border-line py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_70px_90px_80px]">
                  <span className="col-span-2 truncate text-body font-medium sm:col-span-1">{sectionName(r.key)}</span>
                  <span className="col-span-2 flex items-center gap-2 sm:col-span-1"><span className="flex-1"><Bar value={r.share} label={`${sectionName(r.key)} share`} /></span><span className="num w-10 shrink-0 text-right text-meta">{Math.round(r.share * 100)}%</span></span>
                  <Pair label="Calls" v={String(r.totals.calls)} />
                  <Pair label={unit === "tokens" ? "Tokens" : "Amount"} v={amount(r.totals, unit)} />
                  <Pair label="Cost" v={r.totals.priced ? money(r.totals.cost) : "Not priced"} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
const Kpi = ({ label, v }: { label: string; v: string }) => <div className="rounded-lg bg-surface-2 px-3 py-2.5"><div className="label">{label}</div><div className="num mt-0.5 text-title font-semibold">{v}</div></div>;
const Pair = ({ label, v }: { label: string; v: string }) => <span className="flex items-baseline justify-between gap-2 sm:block sm:text-right"><span className="text-meta text-muted sm:hidden">{label}</span><span className="num text-meta">{v}</span></span>;

function ReviewPanel({ conn, id }: { conn: Conn; id: string }) {
  const [n, setN] = useState(15);
  const rows = conn.events.filter((e) => e.tool === id);
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const amountOf = (e: UsageEvent) => (e.tokens ? `${e.tokens.toLocaleString("en-GB")} tokens` : e.units ? `${e.units.toLocaleString("en-GB")} ${e.kind === "humanize" ? "words" : "units"}` : "");
  return (
    <Panel title="Review" i={5} sub="The last calls. Prax keeps no text: only the job, section, counts, cost and time.">
      {conn.usageLoading ? <div className="cx-skel h-24" /> : !rows.length ? <p className="text-body text-muted">No calls yet.</p> : (
        <>
          <ol className="flex flex-col">
            {rows.slice(0, n).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2 text-meta first:border-t-0">
                <span className="num w-[108px] shrink-0 text-muted">{when(e.at)}</span>
                <span className="min-w-0 flex-[1_1_140px] truncate font-medium text-ink">{e.job === "test" ? "Test connection" : jobOf(e.job)?.name ?? "Untagged"}<span className="font-normal text-muted"> · {sectionName(e.section)}</span></span>
                {e.model && <code className="truncate font-mono text-muted">{e.model}</code>}
                <span className="num text-muted">{amountOf(e)}</span>
                <span className="num">{e.cost != null ? money(e.cost) : ""}</span>
                {e.ms != null && <span className="num text-muted">{(e.ms / 1000).toFixed(1)} s</span>}
                <span className={cx("cx-chip", !e.ok && "red")}>{e.ok ? "OK" : "Failed"}</span>
              </li>
            ))}
          </ol>
          {rows.length > n && <button type="button" className="btn btn-quiet mt-2 h-8" onClick={() => setN(n + 30)}>Show more</button>}
        </>
      )}
    </Panel>
  );
}

function MonthCard({ conn, id }: { conn: Conn; id: string }) {
  const tot = conn.monthTotals(id);
  const t = toolOf(id)!;
  return (
    <section className="cx-in card p-5" style={{ ["--i" as string]: 2 }}>
      <h2 className="text-body font-semibold">This month</h2>
      {conn.usageLoading ? <div className="cx-skel mt-2 h-14" /> : (
        <>
          <div className="num mt-1.5 text-kpi font-semibold tracking-[-0.03em]">{spendLine(tot)}</div>
          <div className="mt-0.5 text-meta text-muted">{tot.calls ? `${tot.calls.toLocaleString("en-GB")} calls · ${amount(tot, t.unit)}` : "No calls yet this month"}</div>
          <div className="mt-3"><Spark points={daily(filterEvents(conn.monthEvents, { tool: id }), Math.max(2, new Date().getDate())).map((d) => d.calls)} width={290} height={34} label="Calls per day this month" /></div>
        </>
      )}
    </section>
  );
}

function CapCard({ conn, id }: { conn: Conn; id: string }) {
  const t = toolOf(id)!;
  const toast = useToast();
  const c = conn.cap(id);
  const words = id === "pangram" || id === "walter";
  const cur = conn.capOf(id);
  const [edit, setEdit] = useState(false);
  const [limit, setLimit] = useState(String(cur?.limit ?? ""));
  const [unit, setUnit] = useState<CapUnit>(cur?.unit ?? (words ? "words" : "usd"));
  const can = words ? conn.owner : conn.editor && !conn.missing;
  if (t.coming) return null;
  async function save(clear = false) {
    const n = clear ? 0 : Number(limit);
    try {
      if (words) { await conn.saveHumanizeCap(id as "pangram" | "walter", n); toast(n ? `${t.name} cap set to ${n.toLocaleString("en-GB")} words a month` : `${t.name} cap cleared`); }
      else {
        const caps = { ...conn.settings.caps };
        if (n > 0) caps[id] = { limit: n, unit }; else delete caps[id];
        const prev = await conn.save({ caps });
        toast(n > 0 ? `${t.name} cap saved` : `${t.name} cap cleared`, async () => { await conn.save({ caps: prev.caps }); });
      }
      haptic(); setEdit(false);
    } catch (e) { toast((e as Error).message); }
  }
  return (
    <section className="cx-in card p-5" style={{ ["--i" as string]: 3 }}>
      <div className="flex items-center justify-between gap-2"><h2 className="text-body font-semibold">Monthly cap</h2>{can && !edit && <button type="button" className="btn btn-quiet h-8" onClick={() => { setEdit(true); setLimit(String(cur?.limit ?? "")); setUnit(cur?.unit ?? (words ? "words" : "usd")); }}>{cur ? "Edit" : "Set a cap"}</button>}</div>
      {c.state !== "none" && <div className="mt-3"><Bar value={c.pct ?? 0} tone={c.state === "warn" ? "warn" : c.state === "stop" ? "stop" : ""} label={`${t.name} cap used`} /></div>}
      <p className={cx("mt-2 text-meta", c.state === "warn" || c.state === "stop" ? "font-semibold text-dark-red" : "text-muted")}>{c.state === "none" ? (words ? "No monthly word cap, so paid checks do not run. Set one from your plan." : "No cap. Prax warns at 80% and stops paid calls at 100%.") : capLine(c)}</p>
      {edit && (
        <form className="anim-rise mt-3 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="flex gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1"><span className="label">Limit</span><input autoFocus type="number" min={0} step="any" inputMode="decimal" className="field num" value={limit} onChange={(e) => setLimit(e.target.value)} /></label>
            {!words && <label className="flex w-[120px] flex-col gap-1"><span className="label">Unit</span><select className="cx-select h-[34px] w-full" value={unit} onChange={(e) => setUnit(e.target.value as CapUnit)}><option value="usd">US dollars</option><option value="calls">Calls</option>{(t.unit === "words" || t.unit === "credits") && <option value="words">Words</option>}</select></label>}
          </div>
          <div className="flex flex-wrap gap-2"><button type="submit" className="btn btn-dark h-9" disabled={!(Number(limit) > 0)}>Save cap</button>{cur && <button type="button" className="btn btn-ghost h-9" onClick={() => save(true)}>Clear</button>}<button type="button" className="btn btn-ghost h-9" onClick={() => setEdit(false)}>Cancel</button></div>
          {words && <span className="text-meta text-muted">The same cap as Settings, Humanization.</span>}
        </form>
      )}
      {!can && <p className="mt-2 text-meta text-muted">{words ? "The profile owner sets this cap." : conn.missing ? "Run db/032_connections.sql to set caps." : "Editors and owners set caps."}</p>}
    </section>
  );
}

function EditCard({ conn, id }: { conn: Conn; id: string }) {
  const t = toolOf(id)!;
  const toast = useToast();
  const keys = useKeyActions(conn.send, toast);
  const cur = conn.status?.models?.[id] || "";
  const [edit, setEdit] = useState(false);
  const [model, setModel] = useState(cur);
  const old = oldExtension(conn.status);
  const editable = !!conn.status?.installed && !old && !id.endsWith("_images");
  return (
    <section className="cx-in card p-5" style={{ ["--i" as string]: 4 }}>
      <div className="flex items-center justify-between gap-2"><h2 className="text-body font-semibold">Model</h2>{editable && !edit && <button type="button" className="btn btn-quiet h-8" onClick={() => { setModel(cur); setEdit(true); }}>Edit</button>}</div>
      <p className="mt-1.5"><code className="font-mono text-meta">{cur || t.model}</code> <span className="text-meta text-muted">{cur ? "set in this browser" : "default"}</span></p>
      {edit && (
        <form className="anim-rise mt-3 flex flex-col gap-2" onSubmit={async (e) => { e.preventDefault(); try { await keys.setModel(id, model.trim()); setEdit(false); haptic(); } catch (err) { toast((err as Error).message); } }}>
          <label className="flex flex-col gap-1"><span className="label">Model id</span><input autoFocus spellCheck={false} className="field font-mono text-meta" placeholder={t.model} value={model} onChange={(e) => setModel(e.target.value)} /></label>
          <div className="flex gap-2"><button type="submit" className="btn btn-dark h-9">Save</button><button type="button" className="btn btn-ghost h-9" onClick={() => setEdit(false)}>Cancel</button></div>
          <span className="text-meta text-muted">Any model id from {t.name}&apos;s docs. Empty goes back to {t.model}.</span>
        </form>
      )}
    </section>
  );
}
