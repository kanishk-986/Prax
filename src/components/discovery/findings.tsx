"use client";
import { useMemo } from "react";
import { type Finding, type Band, BANDS, DIMENSIONS, hostOf } from "@/lib/discovery";
import { Modal } from "@/components/content/shared";
import { type Data, BandPill, Tag, SidePanel, foundBy, foundKinds, engineName, warmLine, dateLabel } from "./shared";

export type Filters = { band: string; pillar: string; geo: string; type: string; engine: string; service: string; found: string; status: string; comp: boolean };
export const NO_FILTERS: Filters = { band: "All", pillar: "All", geo: "All", type: "All", engine: "All", service: "All", found: "All", status: "All", comp: false };
export type FindingActions = { send: (f: Finding) => void; comment: (f: Finding) => void; gap: (f: Finding) => void; watch: (f: Finding) => void; dismiss: (f: Finding) => void };

/** Findings: every single article, scored on seven measures, with where it was found and where it can go. */
export function FindingsTab({ d, filters, setFilters, open, act }: { d: Data; filters: Filters; setFilters: (f: Filters) => void; open: (f: Finding) => void; act: FindingActions }) {
  const live = useMemo(() => d.findings.filter((f) => f.status !== "dismissed"), [d.findings]);
  const opts = (k: (f: Finding) => string) => ["All", ...[...new Set(live.map(k).filter(Boolean))].sort()];
  const engine = (f: Finding) => (f.found.ai?.engine ? engineName(f.found.ai.engine) : f.found_by.includes("linkedin") ? "LinkedIn inbox" : "Crawl");
  const shown = live.filter((f) => (filters.band === "All" || d.band(f) === filters.band) && (filters.pillar === "All" || f.pillar === filters.pillar) && (filters.geo === "All" || f.geo === filters.geo)
    && (filters.type === "All" || f.source_type === filters.type) && (filters.engine === "All" || engine(f) === filters.engine) && (filters.service === "All" || f.service === filters.service)
    && (filters.found === "All" || foundKinds(f).includes(filters.found)) && (!filters.comp || !!f.competitor)
    && (filters.status === "All" || (filters.status === "New" ? f.status === "new" : filters.status === "Sent" ? f.status === "sent" : f.status === "watched")))
    .sort((a, b) => d.total(b) - d.total(a));
  const sel: [string, keyof Filters, string[]][] = [
    ["Band", "band", ["All", ...BANDS]], ["Pillar", "pillar", opts((f) => f.pillar)], ["Geography", "geo", opts((f) => f.geo)], ["Source", "type", opts((f) => f.source_type)],
    ["Engine", "engine", opts(engine)], ["Service", "service", opts((f) => f.service)], ["Found by", "found", ["All", "AI search", "Crawl", "LinkedIn"]], ["Status", "status", ["All", "New", "Sent", "Watched"]],
  ];
  return (
    <div className="anim-rise flex flex-col gap-3">
      <div data-tour="filters" className="grid grid-cols-2 gap-2 rounded-[14px] border border-line bg-white px-3.5 py-3 sm:flex sm:flex-wrap sm:items-center">
        {sel.map(([label, k, o]) => (
          <label key={k} className="flex min-w-0 flex-col gap-1 whitespace-nowrap text-[12.5px] font-semibold sm:flex-row sm:items-center sm:gap-1.5">{label}
            <select className="field h-[34px] sm:max-w-[190px]" value={String(filters[k])} onChange={(e) => setFilters({ ...filters, [k]: e.target.value })}>{o.map((x) => <option key={x}>{x}</option>)}</select>
          </label>
        ))}
        <button type="button" aria-pressed={filters.comp} className={`btn col-span-2 h-[34px] sm:col-span-1 ${filters.comp ? "btn-primary" : ""}`} onClick={() => setFilters({ ...filters, comp: !filters.comp })}>Competitor watch</button>
        <span className="col-span-2 text-[12.5px] text-muted sm:ml-auto">{shown.length} of {live.length} findings</span>
      </div>
      {shown.map((f, i) => <FindingCard key={f.id} f={f} d={d} first={i === 0} open={open} act={act} />)}
      {!shown.length && <div className="rounded-[14px] border border-dashed border-[#d0d0d0] bg-white p-7 text-center text-[13px] text-muted">{live.length ? "Nothing matches these filters." : "No findings yet. Run discovery: AI search and Crawl bring articles in, and each one is scored here."}</div>}
    </div>
  );
}

function FindingCard({ f, d, first, open, act }: { f: Finding; d: Data; first: boolean; open: (f: Finding) => void; act: FindingActions }) {
  const b = d.band(f), w = d.warm(f.orgs), li = f.found_by.includes("linkedin"), reg = f.source_type === "Regulator";
  const hrs = li ? Math.max(0, 24 - Math.round((Date.now() - Date.parse(f.found_at)) / 36e5)) : 0;
  return (
    <article data-tour={first ? "card" : undefined} className="flex flex-col gap-3 rounded-2xl bg-white px-[18px] py-4" style={{ border: b === "Post-worthy" ? "2px solid #d64545" : "1px solid #e8e8e8" }}>
      <div className="flex flex-wrap items-start gap-3.5">
        <button type="button" onClick={() => open(f)} className="flex min-w-0 flex-1 basis-[260px] flex-col gap-1.5 text-left">
          <span className="flex flex-wrap items-center gap-1.5">
            <BandPill b={b} />{f.kind && <Tag>{f.kind}</Tag>}<Tag>{f.source_type || "Publication"}</Tag>
            {f.gap && <Tag tone="deep">AI citations gap</Tag>}{li && hrs > 0 && <Tag tone="red">Fresh for {hrs}h · comment early</Tag>}{f.competitor && <Tag tone="white">Competitor move: {f.competitor}</Tag>}
            {f.status === "watched" && <Tag tone="dark">Watching</Tag>}
          </span>
          <span className="text-[15.5px] font-[650] leading-snug">{f.title}</span>
          <span className="text-[12.5px] text-muted">{f.publisher || hostOf(f.url)} · {dateLabel(f)} · {f.pillar || "No pillar"} · {f.geo || "No region"}</span>
          <span className="text-[12px]"><b>Found by</b> <span className="text-muted">{foundBy(f)}</span></span>
          {(f.service || w > 0) && <span className="flex flex-wrap items-center gap-1.5">{f.service && <Tag tone="white">{f.service}</Tag>}{w > 0 && <span className="text-[12px] font-semibold text-[#d64545]">{warmLine(w)}</span>}</span>}
        </button>
        <span className="flex shrink-0 flex-col items-end gap-0.5"><span className="num text-[26px] leading-none">{d.total(f)}</span><span className="text-[11px] text-faint">of 100</span></span>
      </div>
      <div data-tour={first ? "scores" : undefined} className="grid grid-cols-4 gap-2 rounded-[10px] sm:grid-cols-7">
        {DIMENSIONS.map(([label], j) => {
          const v = f.scores[j] ?? 0;
          return (
            <span key={label} className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-[10.5px] font-semibold text-muted" title={`${label} · weight ${d.settings.weights[j]}`}>{label} · {d.settings.weights[j]}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-[#ececec]"><span className="block h-full" style={{ width: `${(v / 5) * 100}%`, background: v >= 4 ? "#d64545" : v >= 2 ? "#141414" : "#b5b5b5" }} /></span>
              <span className="num text-[11px]">{v}/5</span>
            </span>
          );
        })}
      </div>
      <div data-tour={first ? "why" : undefined} className="grid gap-2.5 rounded-[10px] md:grid-cols-2">
        <span className="rounded-[10px] border-l-[3px] border-[#d64545] bg-[#fafafa] px-3 py-2.5 text-[13px] leading-snug"><b>Why it matters for Shashi.</b> {f.why || (f.scored_by === "ai" ? "None given." : "Scored by the page's words. The AI check adds the reason when it runs.")}</span>
        <span className="rounded-[10px] border-l-[3px] border-[#141414] bg-[#fafafa] px-3 py-2.5 text-[13px] leading-snug"><b>Suggested angle.</b> {f.angle || "None yet."}</span>
      </div>
      {d.editable && (
        <div data-tour={first ? "actions" : undefined} className="flex flex-wrap gap-1.5 rounded-[10px]">
          {f.opp?.kind === "sales" ? <span className="pill h-8 bg-[#141414] text-white">For sales only, never a post</span>
            : <button type="button" className={`btn h-8 ${f.status === "sent" ? "" : "btn-primary"}`} disabled={f.status === "sent"} onClick={() => act.send(f)}>{f.status === "sent" ? "Sent to Content Studio" : reg ? "Fast response" : "Send to Content Studio"}</button>}
          {li && <button type="button" className={`btn h-8 ${f.comment_target ? "" : "btn-dark"}`} disabled={f.comment_target} onClick={() => act.comment(f)}>{f.comment_target ? "Comment target added" : "Comment target"}</button>}
          <button type="button" className="btn h-8" disabled={f.gap} onClick={() => act.gap(f)}>{f.gap ? "Linked to gap" : "Link to gap"}</button>
          <button type="button" className="btn h-8" onClick={() => act.watch(f)}>{f.status === "watched" ? "Watching" : "Watch"}</button>
          <button type="button" className="btn h-8 text-[#d64545]" onClick={() => act.dismiss(f)}>Dismiss</button>
        </div>
      )}
    </article>
  );
}

const WHY = (f: Finding, j: number) => {
  const v = f.scores[j] ?? 0;
  return [v >= 4 ? "A buyer has a decision to make now." : "Interesting, no decision yet.", v >= 4 ? `Squarely in ${f.pillar || "a pillar"}.` : "Touches a pillar at most.", f.geo || "No region named.", v >= 4 ? "Matches a top Antier service." : "Partial service match.",
    f.confirmed ? dateLabel(f) : "Date not confirmed on the page.", v >= 4 ? "Primary or two independent sources." : v <= 2 ? "Vendor or single source only." : "One good source.", v >= 4 ? "He can speak from running it." : "Thin operator angle."][j];
};
export function FindingPanel({ f, d, onClose }: { f: Finding; d: Data; onClose: () => void }) {
  return (
    <SidePanel kicker={`${f.publisher || hostOf(f.url)} · ${dateLabel(f)}`} title={f.title} onClose={onClose}>
      <span className="flex flex-wrap items-center gap-1.5"><BandPill b={d.band(f) as Band} /><span className="num text-[13px]">{d.total(f)} of 100</span><span className="text-[12px] text-muted">· scored by {f.scored_by === "ai" ? "the AI check" : "the page's words"}</span></span>
      <span className="label text-ink">Evidence</span>
      <span className="flex min-w-0 items-center gap-2 text-[13px]"><Tag tone={f.source_type === "Regulator" ? "red" : f.source_type === "LinkedIn" ? "dark" : "white"}>{f.source_type || "Publication"}</Tag>
        {f.url.startsWith("linkedin:") ? <span className="text-muted">Sent from the Prax bar</span> : <a href={f.url} target="_blank" rel="noopener noreferrer" className="truncate text-muted hover:text-ink">{f.url}</a>}</span>
      <span className="text-[12px]"><b>Found by</b> <span className="text-muted">{foundBy(f)}</span></span>
      {f.excerpt && <p className="m-0 line-clamp-6 whitespace-pre-line text-[12.5px] leading-relaxed text-muted">{f.excerpt}</p>}
      {f.orgs.length > 0 && <span className="text-[12.5px]"><b>Named</b> <span className="text-muted">{f.orgs.join(", ")}</span>{d.warm(f.orgs) > 0 && <span className="mt-1 block font-semibold text-[#d64545]">{warmLine(d.warm(f.orgs))}</span>}</span>}
      <span className="label text-ink">Why it scored {d.total(f)}</span>
      {DIMENSIONS.map(([label], j) => <span key={label} className="grid grid-cols-[110px_36px_minmax(0,1fr)] gap-2 text-[13px]"><b>{label}</b><span className="num">{f.scores[j] ?? 0}/5</span><span className="text-muted">{WHY(f, j)}</span></span>)}
    </SidePanel>
  );
}

export const DISMISS_REASONS = ["Not relevant to his buyers", "Old news", "Weak source", "Already covered"];
export function DismissModal({ onPick, onClose }: { onPick: (r: string) => void; onClose: () => void }) {
  return (
    <Modal title="Why dismiss it?" onClose={onClose}>
      <div className="flex flex-col gap-2.5">
        <p className="m-0 text-[13px] text-muted">The reason teaches the criteria. Nothing is deleted; it moves to dismissed.</p>
        {DISMISS_REASONS.map((r) => <button key={r} type="button" className="btn h-10 justify-start px-3.5" onClick={() => onPick(r)}>{r}</button>)}
      </div>
    </Modal>
  );
}
