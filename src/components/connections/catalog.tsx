"use client";
// Tools tab: the catalog of real tools in seven sections, with a search box and filter chips by section, status and
// job. Each card says, from the real routes, whether Prax uses the tool today, and opens its full page.
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X, ArrowUpRight } from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import { TOOLS, SECTIONS, JOBS, filterCatalog, spendLine, jobOf, type CatalogFilter, type Tool, type SectionId, type JobId } from "@/lib/connections";
import { type Conn } from "./use-connections";
import { ToolSheet } from "./sheet";
import { LogoTile, Dot, ToolInline, cx } from "./ui";
import { useKeyActions } from "./keys";
import { useToast } from "@/components/toaster";

export const EMPTY_FILTER: CatalogFilter = { q: "", section: "", status: "", job: "" };
/** The filter as URL query, so a tool page's Back, Previous and Next keep it. */
export function filterQuery(f: CatalogFilter): string {
  const p = new URLSearchParams();
  if (f.section) p.set("section", f.section);
  if (f.status) p.set("status", f.status);
  if (f.job) p.set("job", f.job);
  if (f.q.trim()) p.set("q", f.q.trim());
  const s = p.toString();
  return s ? `?${s}` : "";
}
export function filterFrom(sp: URLSearchParams | null): CatalogFilter {
  const sec = sp?.get("section") ?? "", st = sp?.get("status") ?? "", job = sp?.get("job") ?? "";
  return {
    q: sp?.get("q") ?? "",
    section: SECTIONS.some((s) => s.id === sec) ? (sec as SectionId) : "",
    status: st === "connected" || st === "not" || st === "used" ? st : "",
    job: JOBS.some((j) => j.id === job) ? (job as JobId) : "",
  };
}

const STATUS: { id: CatalogFilter["status"]; label: string }[] = [{ id: "", label: "Any status" }, { id: "connected", label: "Connected" }, { id: "used", label: "In use" }, { id: "not", label: "Not connected" }];

export function Catalog({ conn, filter, setFilter, intro }: { conn: Conn; filter: CatalogFilter; setFilter: (f: CatalogFilter) => void; intro: boolean }) {
  const { ws } = useWorkspace();
  const [sheet, setSheet] = useState<string | null>(null);
  const toast = useToast();
  const { removing } = useKeyActions(conn.send, toast);
  const isOn = (id: string) => conn.connected(id) && !removing.includes(id);
  const list = useMemo(() => filterCatalog(TOOLS, filter, isOn, conn.usedBy), [filter, conn, removing]); // eslint-disable-line react-hooks/exhaustive-deps
  const bySection = SECTIONS.map((s) => ({ s, tools: list.filter((t) => t.section === s.id) })).filter((g) => g.tools.length);
  const counts = useMemo(() => Object.fromEntries(SECTIONS.map((s) => [s.id, filterCatalog(TOOLS, { ...filter, section: s.id }, isOn, conn.usedBy).length])), [filter, conn, removing]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = !!(filter.q.trim() || filter.section || filter.status || filter.job);
  const q = filterQuery(filter);
  let i = 0;

  return (
    <div className="flex flex-col gap-5">
      <div data-tour="filters" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="cx-search min-w-0 flex-[1_1_320px]">
            <Search size={15} className="shrink-0 text-muted" aria-hidden="true" />
            <span className="sr-only">Search tools</span>
            <input type="search" value={filter.q} placeholder="Search tools, for example search or images" onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
            {filter.q && <button type="button" aria-label="Clear search" className="grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink" onClick={() => setFilter({ ...filter, q: "" })}><X size={13} /></button>}
          </label>
          <label className="flex min-w-0 items-center gap-2 text-meta text-muted"><span className="shrink-0">Job</span>
            <select className="cx-select w-[220px]" value={filter.job} onChange={(e) => setFilter({ ...filter, job: e.target.value as JobId | "" })}>
              <option value="">Any job</option>
              {JOBS.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Section">
          <button type="button" className="cx-filter" aria-pressed={!filter.section} onClick={() => setFilter({ ...filter, section: "" })}>All sections <span className="cx-n">{filterCatalog(TOOLS, { ...filter, section: "" }, isOn, conn.usedBy).length}</span></button>
          {SECTIONS.map((s) => <button key={s.id} type="button" className="cx-filter" aria-pressed={filter.section === s.id} onClick={() => setFilter({ ...filter, section: filter.section === s.id ? "" : s.id })}>{s.name} <span className="cx-n">{counts[s.id]}</span></button>)}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Status">
          {STATUS.map((s) => <button key={s.id || "any"} type="button" className="cx-filter" aria-pressed={filter.status === s.id} onClick={() => setFilter({ ...filter, status: s.id })}>{s.label}</button>)}
          {active && <button type="button" className="btn btn-ghost ml-1 h-8" onClick={() => setFilter(EMPTY_FILTER)}>Clear filters</button>}
        </div>
      </div>

      {!list.length && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line-strong bg-white px-5 py-8">
          <span className="text-title font-semibold">No tools match these filters</span>
          <span className="text-body text-muted">Try another section or status, or clear the filters to see all {TOOLS.length} tools.</span>
          <button type="button" className="btn h-9" onClick={() => setFilter(EMPTY_FILTER)}>Clear filters</button>
        </div>
      )}

      {bySection.map(({ s, tools }) => (
        <section key={s.id} aria-labelledby={`sec-${s.id}`} className="flex flex-col gap-3 pt-1">
          <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id={`sec-${s.id}`} className="flex items-baseline gap-2 text-title font-semibold">{s.name}<span className="num text-body font-medium text-muted">{tools.length}</span></h2>
            <p className="text-meta text-muted">{s.sub}</p>
          </header>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {tools.map((t) => <ToolCard key={t.id} t={t} conn={conn} on={isOn(t.id)} href={`/w/${ws.slug}/connections/${t.id}${q}`} i={intro ? i++ : 0} intro={intro} onConnect={() => setSheet(t.id)} />)}
          </div>
          {s.id === "citations" && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-surface-2 px-4 py-3 text-meta text-muted">
              <span>AI citations also asks the writing models, with web search on:</span>
              {["claude", "openai", "gemini", "perplexity"].map((id) => <Link key={id} href={`/w/${ws.slug}/connections/${id}${q}`} className="font-medium text-ink hover:underline"><ToolInline id={id} short /></Link>)}
              <Link href={`/w/${ws.slug}/citations`} className="ml-auto inline-flex items-center gap-1 font-medium text-ink hover:underline">Choose engines in AI citations <ArrowUpRight size={12} /></Link>
            </p>
          )}
        </section>
      ))}
      {sheet && <ToolSheet tool={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}

function ToolCard({ t, conn, on, href, i, intro, onConnect }: { t: Tool; conn: Conn; on: boolean; href: string; i: number; intro: boolean; onConnect: () => void }) {
  const jobs = on ? conn.usedBy(t.id) : [];
  const line = t.coming ? "Coming later" : !on ? "Not connected" : jobs.length ? `Connected · used by ${jobs.length} ${jobs.length === 1 ? "job" : "jobs"}` : "Connected · not used by any job yet";
  const cap = conn.cap(t.id);
  const month = conn.monthTotals(t.id);
  return (
    <article className={cx("cx-card p-4", on && "on", t.coming && "soon", intro && "cx-in")} style={{ ["--i" as string]: i }}>
      <Link href={href} className="cx-hit" aria-label={`${t.name}: ${line}`} />
      <div className="flex items-start gap-3">
        <LogoTile id={t.id} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate text-body font-semibold">{t.name}</h3>
            {t.beta && <span className="cx-chip">Beta</span>}
            {t.coming && <span className="cx-chip">Coming later</span>}
          </div>
          <p className="mt-0.5 line-clamp-2 text-meta leading-relaxed text-muted">{t.purpose}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-meta">
        {!t.coming && <Dot on={on} warn={cap.state === "warn" || cap.state === "stop"} />}
        <span className={cx("min-w-0 truncate", on ? "font-medium text-ink" : "text-muted")}>{line}</span>
      </div>
      {on && jobs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Used by">
          {jobs.map((j) => <span key={j} className="cx-chip">{jobOf(j)?.name}</span>)}
        </div>
      )}
      {!on && !t.coming && !t.jobs.length && t.later && <p className="mt-2 line-clamp-2 text-meta text-muted">Planned: {t.later}</p>}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3" style={{ marginTop: 14 }}>
        <span className="min-w-0 truncate text-meta text-muted">{t.coming ? "Nothing to connect yet" : <>This month <span className={cx("num font-medium", month.calls ? "text-ink" : "")}>{spendLine(month)}</span>{(cap.state === "warn" || cap.state === "stop") && <span className="cx-chip red ml-1.5">{cap.state === "stop" ? "Cap reached" : `${Math.round((cap.pct ?? 0) * 100)}% of cap`}</span>}</>}</span>
        {t.coming ? <Link href={href} className="btn cx-above h-8">Learn more</Link>
          : on ? <Link href={href} className="btn cx-above h-8">Manage</Link>
          : <button type="button" className="btn cx-above h-8" onClick={onConnect}>Connect</button>}
      </div>
    </article>
  );
}
