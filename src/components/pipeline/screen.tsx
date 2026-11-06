"use client";
// Pipeline on one screen: Do next (the five most urgent), then everyone grouped by stage or by company,
// a lead panel, a pipeline switcher with templates, stages and lost reasons, and import. No drag and drop:
// every move asks for the next action and its date, so it lands on Today. [ and ] move the focused row.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Check } from "lucide-react";
import { useWorkspace, useSegments, today as todayYmd } from "@/lib/workspace";
import { indexPeople, normName, warmPaths, type Warm } from "@/lib/network";
import { doNext, heatOf, isClosed, stepStage, dueText, dueTone, fmtShort, avgDays, byCompany, type HeatBand, type Pipeline, type Prospect } from "@/lib/pipeline";
import { Section, type TourStep } from "@/components/shell";
import { useToast, haptic } from "@/components/toaster";
import { LeadPanel } from "./lead-panel";
import { MoveDialog, PipelinesPanel, ImportPanel, AddLeadPanel } from "./panels";
import type { PipelineApi, PipelineData } from "./types";
import { useActiveStrategy, leadFacts } from "@/components/strategy/data";
import { adviceFor, type Advice } from "@/lib/strategy";

const TOUR: TourStep[] = [
  { target: "header", title: "What Pipeline is for", body: "Everyone this profile is building a relationship with, and the one next step for each. Prax suggests and drafts; you send every comment and message yourself." },
  { target: "donext", title: "Do next", body: "The few people who need you now: overdue first, then today. Open one to see the action and finish it." },
  { target: "tools", title: "Find people fast", body: "Search, or narrow to Overdue or Hot. Segment and owner sit under More filters. Group by company shows every contact at each bank together." },
  { target: "list", title: "Everyone, by stage", body: "Each stage folds open or closed. A row shows the next action and how warm the person is. Click anyone to open their panel." },
  { target: "pipemenu", title: "Pipelines", body: "Switch pipelines here, start a new one from a template, and manage stages and lost reasons." },
  { target: "actions", title: "Add people", body: "Add people from Network or a CSV. Every change of stage asks for the next action and its date, so nothing falls off Today." },
];

export type LeadInfo = { heat: ReturnType<typeof heatOf>; warm: Warm | null; warmText: string; comments: number; replies: number; lastComment: string };
export const HEAT_DOT: Record<HeatBand, string> = { Hot: "#d64545", Warm: "#9e1c1c", Cold: "#c4c4c4" };
const toneCls = (t: ReturnType<typeof dueTone>) => (t === "overdue" ? "font-semibold text-[#d64545]" : t === "today" ? "font-semibold text-ink" : "font-medium text-muted");
const store = () => { try { return window.localStorage; } catch { return null; } };
export const ownerName = (email: string) => (email.split("@")[0] || email).split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

/** The warm path in one sentence, from the LinkedIn export. */
function warmLine(w: Warm | null, company: string, hasExport: boolean): string {
  if (!hasExport) return "Upload the LinkedIn export in Network to see warm paths.";
  if (!w) return "None found in the LinkedIn export yet.";
  const bits: string[] = [];
  if (w.linked?.is_connection) bits.push(`You are connected directly${w.linked.connected_on ? `, since ${new Date(w.linked.connected_on + "T12:00:00").toLocaleDateString("en-GB", { month: "short", year: "numeric" })}` : ""}.`);
  if (w.msgs) bits.push(`${w.msgs.count} ${w.msgs.count === 1 ? "message" : "messages"}; ${w.msgs.from === "us" ? "waiting on them" : "they wrote last"}.`);
  if (w.colleagues.length) bits.push(`You know ${w.colleagues.slice(0, 3).map((c) => c.name).join(", ")}${w.colleagues.length > 3 ? ` and ${w.colleagues.length - 3} more` : ""} at ${company}.`);
  return bits.join(" ") || "None found in the LinkedIn export yet.";
}

export function PipelineScreen({ data, api }: { data: PipelineData; api: PipelineApi }) {
  const segs = useSegments();
  const { ws, can } = useWorkspace();
  const editable = can("editor");
  const toast = useToast();
  const t = todayYmd();
  const now = useMemo(() => new Date().toISOString(), [data.leads]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- current pipeline ----------
  const [pipeId, setPipeId] = useState<string | null>(null);
  useEffect(() => { setPipeId(store()?.getItem(`prax:pipe:${ws.id}`) ?? null); }, [ws.id]);
  const pickPipe = useCallback((id: string) => { setPipeId(id); try { store()?.setItem(`prax:pipe:${ws.id}`, id); } catch {} }, [ws.id]);
  const P: Pipeline = data.pipes.find((p) => p.id === pipeId) ?? data.pipes[0];
  const pipeOf = useCallback((l: Prospect) => (data.ready ? data.pipes.find((p) => p.id === l.pipeline_id) ?? data.pipes[0] : data.pipes[0]), [data.ready, data.pipes]);
  const inPipe = useMemo(() => data.leads.filter((l) => pipeOf(l).id === P.id), [data.leads, pipeOf, P.id]);

  // ---------- heat and warm paths from real signals ----------
  const idx = useMemo(() => indexPeople(data.network), [data.network]);
  const info = useMemo(() => {
    const lite = data.comments.map((c) => ({ author: c.author, reply: c.reply, day: c.day }));
    const m = new Map<string, LeadInfo>();
    for (const l of data.leads) {
      const nn = normName(l.name);
      const mine = data.comments.filter((c) => c.prospect_id === l.id || (!!nn && normName(c.author) === nn));
      const w = data.network.length ? warmPaths({ id: l.id, name: l.name, company: l.company, role: l.role, stage: l.stage, segment: l.segment, linkedin: l.linkedin }, data.network, idx, lite) : null;
      const lastComment = mine.map((c) => c.day).sort().pop() ?? "";
      const lastTouch = [lastComment, w?.msgs?.last ?? ""].filter(Boolean).sort().pop() ?? null;
      const replies = mine.filter((c) => c.reply).length;
      m.set(l.id, { heat: heatOf({ comments: mine.length, replies, warm: w?.level ?? 0, lastTouch }, t), warm: w, warmText: warmLine(w, l.company, data.network.length > 0), comments: mine.length, replies, lastComment });
    }
    return m;
  }, [data.leads, data.comments, data.network, idx, t]);
  const bandOf = useCallback((l: Prospect) => info.get(l.id)?.heat.band ?? "Cold", [info]);
  // The active strategy's rules for each lead (Q109): a suggested next action, a template and extra touch plan steps.
  const strat = useActiveStrategy();
  const advice = useMemo(() => new Map<string, Advice>(data.leads.map((l) => [l.id, adviceFor(strat.nodes, { day: t, lead: leadFacts(l, t, { heat: info.get(l.id)?.heat.band, warm: !!info.get(l.id)?.warm?.level }) })])), [data.leads, strat.nodes, t, info]);
  const nextOf = (l: Prospect) => {
    const s = advice.get(l.id)?.next;
    return l.next_action || !s ? l.next_action || "No next action set" : <>Suggested: {s.text}<span className="block text-meta text-muted">From strategy: {s.rule}</span></>;
  };

  // ---------- filters ----------
  const [q, setQ] = useState("");
  const [fOverdue, setFOverdue] = useState(false);
  const [fHot, setFHot] = useState(false);
  const [fSeg, setFSeg] = useState("");
  const [fOwner, setFOwner] = useState("");
  const [grouped, setGrouped] = useState(false);
  const [gx, setGx] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<"pipe" | "filters" | null>(null);
  const anyFilter = !!q || fOverdue || fHot || !!fSeg || !!fOwner;
  const clearFilters = () => { setQ(""); setFOverdue(false); setFHot(false); setFSeg(""); setFOwner(""); setMenu(null); };
  const filtered = useMemo(() => inPipe.filter((l) => (!q || `${l.name} ${l.company} ${l.role}`.toLowerCase().includes(q.toLowerCase()))
    && (!fOverdue || (!!l.next_date && l.next_date < t && !isClosed(P, l.stage))) && (!fHot || bandOf(l) === "Hot")
    && (!fSeg || l.segment === fSeg) && (!fOwner || (fOwner === "none" ? !l.owner : l.owner === fOwner))), [inPipe, q, fOverdue, fHot, fSeg, fOwner, t, P, bandOf]);

  // ---------- panels ----------
  const [sel, setSel] = useState<string | null>(null);
  const [move, setMove] = useState<{ id: string; to: string } | null>(null);
  const [side, setSide] = useState<"pipes" | "import" | "add" | null>(null);
  const [logged, setLogged] = useState(0); // bumps after a move or undo, so the open panel reloads its timeline
  const lead = sel ? data.leads.find((l) => l.id === sel) ?? null : null;
  const moving = move ? data.leads.find((l) => l.id === move.id) ?? null : null;
  const openLead = useCallback((id: string) => { setSel(id); setMenu(null); }, []);

  // Arriving from Today, the Dashboard, Network or the command menu (?p=<id>).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("p");
    if (!id || !data.leads.length) return;
    const hit = data.leads.find((r) => r.id === id);
    if (hit) { pickPipe(pipeOf(hit).id); setSel(hit.id); window.history.replaceState(null, "", window.location.pathname); }
  }, [data.leads, pipeOf, pickPipe]);
  useEffect(() => {
    if (!menu) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [menu]);

  const startMove = useCallback((l: Prospect, to: string) => { if (editable) setMove({ id: l.id, to }); }, [editable]);
  const onRowKey = (e: React.KeyboardEvent, l: Prospect) => {
    if (e.key !== "[" && e.key !== "]") return;
    const to = stepStage(pipeOf(l), l.stage, e.key === "]" ? 1 : -1);
    if (to) { e.preventDefault(); startMove(l, to); }
  };

  // ---------- Do next and groups ----------
  const dn = useMemo(() => doNext(inPipe, P, t), [inPipe, P, t]);
  type Group = { key: string; label: string; sub: string; dim: boolean; people: Prospect[]; second: (l: Prospect) => string; closedByDefault: boolean };
  const groups: Group[] = useMemo(() => {
    if (!grouped) return P.stages.map((s) => {
      const people = filtered.filter((l) => l.stage === s);
      const avg = avgDays(people, now);
      return { key: `s:${P.id}:${s}`, label: s, sub: avg == null ? "" : `Average ${avg} ${avg === 1 ? "day" : "days"} here`, dim: !people.length, people, second: (l: Prospect) => l.company, closedByDefault: !people.length || isClosed(P, s) };
    }).filter((g) => !anyFilter || g.people.length);
    return byCompany(filtered).map((g) => {
      const lv = g.people.map((l) => info.get(l.id)?.warm?.level ?? 0);
      const best = lv.some((x) => x === 1 || x === 2) ? "Direct path" : lv.some((x) => x === 3) ? "Warm path via a contact" : "No warm path yet";
      return { key: `c:${g.company}`, label: g.company, sub: best, dim: false, people: g.people, second: (l: Prospect) => l.stage, closedByDefault: false };
    });
  }, [grouped, filtered, P, anyFilter, info, now]);
  // Leads whose stage is not in this pipeline (renamed or removed) still show, so nobody disappears.
  const strays = grouped ? [] : filtered.filter((l) => !P.stages.includes(l.stage));

  const nFilters = (fSeg ? 1 : 0) + (fOwner ? 1 : 0);
  const status = data.loading ? "Loading" : `${dn.open} open in ${P.name} · ${dn.overdue ? `${dn.overdue} overdue · ` : ""}${dn.today} due today`;
  const entry = `${dn.overdue ? `${dn.overdue} overdue and ` : ""}${dn.today} due today, out of ${dn.open} open in ${P.name}.`;

  const heat = (b: HeatBand, cls: string) => <span className={`inline-flex shrink-0 items-center gap-[7px] text-meta ${cls}`}><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: HEAT_DOT[b] }} />{b}</span>;
  const row = (l: Prospect, second: string) => {
    const closed = isClosed(P, l.stage), b = bandOf(l), tone = dueTone(l.next_date, t);
    const lostLine = l.stage === P.lost_stage && l.lost_reason ? `${P.lost_stage}: ${l.lost_reason}` : "";
    return (
      <button key={l.id} type="button" onClick={() => openLead(l.id)} onKeyDown={(e) => onRowKey(e, l)} aria-label={`${l.name}, ${l.stage}`}
        className={`pl-row flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[#f0f0f0] py-[13px] pl-5 pr-5 text-left sm:gap-y-2 sm:pl-11 ${sel === l.id ? "bg-[#fff5f5]" : "bg-white"}`}>
        <span className="flex min-w-0 flex-[1_1_200px] flex-col gap-0.5">
          <span className="flex items-center justify-between gap-3"><span className="text-body font-semibold">{l.name}</span>{heat(b, "sm:hidden")}</span>
          <span className="truncate text-meta text-muted">{l.role || "No role"}<span className="sm:hidden">{second ? ` · ${second}` : ""}</span></span>
        </span>
        <span className="min-w-0 flex-[1_1_160px] truncate text-body max-sm:hidden">{second}</span>
        <span className="flex min-w-0 flex-[2_1_240px] flex-col gap-0.5">
          <span className={`text-body leading-snug ${l.next_action || lostLine ? "" : "text-muted"}`}>{lostLine || (closed ? l.next_action || "No next action set" : nextOf(l))}</span>
          {closed ? <span className="text-meta text-muted">{l.stage === P.won_stage ? P.won_stage : l.next_date ? `Check in ${fmtShort(l.next_date)}` : P.lost_stage}</span>
            : <span className={`whitespace-nowrap text-meta ${toneCls(tone)}`}>{dueText(l.next_date, t)}</span>}
        </span>
        {heat(b, "flex-[0_0_72px] max-sm:hidden")}
      </button>
    );
  };

  const header = (
    <span className="relative">
      <button type="button" data-tour="pipemenu" className="btn h-10 gap-2 px-3 text-body font-semibold" aria-haspopup="menu" aria-expanded={menu === "pipe"} onClick={() => setMenu(menu === "pipe" ? null : "pipe")}>
        <span className="text-meta font-medium text-muted">Pipeline</span>{P.name}<ChevronDown size={14} className="text-muted" />
      </button>
      {menu === "pipe" && <>
        <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
        <div role="menu" className="pl-pop absolute right-0 top-[46px] z-[41] flex w-[260px] flex-col rounded-xl border border-[#e3e3e3] bg-white p-1.5 shadow-[0_16px_40px_rgba(20,20,20,.14)] max-sm:left-0 max-sm:right-auto">
          {data.pipes.map((p) => (
            <button key={p.id} type="button" role="menuitem" className="pl-quiet flex h-[38px] items-center gap-2.5 rounded-lg px-2.5 text-left text-body" onClick={() => { pickPipe(p.id); setMenu(null); setSel(null); }}>
              <Check size={14} strokeWidth={2.5} className={`text-[#d64545] ${p.id === P.id ? "" : "opacity-0"}`} />
              <span className="flex-1 font-semibold">{p.name}</span>
              <span className="num text-meta text-muted">{data.leads.filter((l) => pipeOf(l).id === p.id && !isClosed(p, l.stage)).length}</span>
            </button>
          ))}
          <span className="mx-1 my-1.5 h-px bg-[#ececec]" />
          {data.ready && editable && <button type="button" role="menuitem" className="pl-quiet h-[38px] rounded-lg px-2.5 text-left text-body" onClick={() => { setSide("pipes"); setMenu(null); }}>New pipeline from a template</button>}
          <button type="button" role="menuitem" className="pl-quiet h-[38px] rounded-lg px-2.5 text-left text-body" onClick={() => { setSide("pipes"); setMenu(null); }}>Stages and lost reasons</button>
        </div>
      </>}
    </span>
  );

  return (
    <Section id="pipeline" title="Pipeline" status={status} entryStatus={data.loading ? undefined : entry} steps={TOUR} before={header}
      actions={editable ? <span data-tour="actions" className="inline-flex gap-2 rounded-xl">
        <button type="button" className="btn h-10 px-3.5" onClick={() => setSide("import")}>Import</button>
        <button type="button" className="btn btn-primary h-10 px-4" onClick={() => setSide("add")}>Add lead</button>
      </span> : undefined}>
      <div className="flex flex-col gap-7">
        <section data-tour="donext" className="pl-rise flex flex-col overflow-hidden rounded-2xl border border-line bg-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-3 pt-[18px]">
            <span className="flex flex-col gap-[3px]"><span className="text-title font-semibold">Do next</span><span className="text-body text-muted">Overdue first, then today.</span></span>
            {dn.more > 0 && <span className="text-meta text-muted">{dn.more} more due</span>}
          </div>
          {data.loading ? [0, 1, 2].map((i) => <div key={i} className="mx-5 mb-3 h-10 animate-pulse rounded-lg bg-surface-2" />)
            : dn.rows.length === 0 ? <span className="border-t border-[#f0f0f0] px-5 pb-[18px] pt-3.5 text-body text-muted">Nothing overdue or due today.{dn.upcoming ? ` Next up: ${dn.upcoming.name}, ${dueText(dn.upcoming.next_date, t)}.` : ""}</span>
            : dn.rows.map((l) => (
              <div key={l.id} className="pl-row flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#f0f0f0] px-5 py-3">
                <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5"><span className="text-body font-semibold">{l.name}</span><span className="text-meta text-muted">{l.company || "No company"}</span></span>
                <span className={`min-w-0 flex-[2_1_260px] text-body leading-snug ${l.next_action ? "" : "text-muted"}`}>{nextOf(l)}</span>
                <span className={`min-w-[104px] shrink-0 whitespace-nowrap text-right text-meta max-sm:text-left ${toneCls(dueTone(l.next_date, t))}`}>{dueText(l.next_date, t)}</span>
                <button type="button" className="btn h-[34px]! shrink-0 px-3.5! font-semibold" onClick={() => openLead(l.id)}>Open</button>
              </div>
            ))}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2.5">
            <span className="text-title font-semibold">Everyone</span>
            <span className="text-meta text-muted">{filtered.length} {filtered.length === 1 ? "person" : "people"}{anyFilter ? " match" : ""}</span>
          </div>
          <div data-tour="tools" className="flex flex-wrap items-center gap-2 rounded-xl">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people and companies" aria-label="Search people and companies"
              className="h-[38px] min-w-0 flex-[1_1_240px] rounded-[10px] border border-[#e3e3e3] bg-white px-3 text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d64545]" />
            <button type="button" aria-pressed={fOverdue} onClick={() => setFOverdue(!fOverdue)} className={`pl-chip ${fOverdue ? "on" : ""}`}>Overdue</button>
            <button type="button" aria-pressed={fHot} onClick={() => setFHot(!fHot)} className={`pl-chip ${fHot ? "on" : ""}`}>Hot</button>
            <span className="relative">
              <button type="button" aria-expanded={menu === "filters"} onClick={() => setMenu(menu === "filters" ? null : "filters")} className={`pl-chip ${nFilters ? "on" : ""}`}>{nFilters ? `More filters · ${nFilters}` : "More filters"}</button>
              {menu === "filters" && <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
                <div className="pl-pop absolute left-0 top-11 z-[41] flex w-[280px] max-w-[calc(100vw-32px)] flex-col gap-3 rounded-xl border border-[#e3e3e3] bg-white p-3.5 shadow-[0_16px_40px_rgba(20,20,20,.14)] max-sm:left-auto max-sm:right-0">
                  <label className="flex flex-col gap-1.5 text-meta font-semibold">Segment
                    <select value={fSeg} onChange={(e) => setFSeg(e.target.value)} className="field h-9! font-normal"><option value="">All</option>{Object.entries(segs).map(([k, v]) => <option key={k} value={k}>{v.label.replace("&", "and")}</option>)}</select></label>
                  <label className="flex flex-col gap-1.5 text-meta font-semibold">Owner
                    <select value={fOwner} onChange={(e) => setFOwner(e.target.value)} className="field h-9! font-normal"><option value="">All</option>{data.members.map((m) => <option key={m.user_id} value={m.user_id}>{ownerName(m.email)}</option>)}<option value="none">No owner</option></select></label>
                  <button type="button" className="btn h-8! self-start px-3! text-meta font-semibold" onClick={clearFilters}>Clear all filters</button>
                </div>
              </>}
            </span>
            <button type="button" role="switch" aria-checked={grouped} onClick={() => setGrouped(!grouped)} className="ml-auto inline-flex h-[38px] items-center gap-2.5 whitespace-nowrap rounded-lg px-1 text-body font-semibold focus-visible:outline-2 focus-visible:outline-[#d64545]">
              <span className={`relative h-5 w-[34px] shrink-0 rounded-full transition-colors ${grouped ? "bg-[#141414]" : "bg-[#d6d6d6]"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(20,20,20,.25)] transition-[left] duration-200 ${grouped ? "left-4" : "left-0.5"}`} /></span>
              Group by company
            </button>
          </div>

          <section data-tour="list" className="pl-rise overflow-hidden rounded-2xl border border-line bg-white">
            {data.loading ? <div className="flex flex-col gap-2 p-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-2" />)}</div> : <>
              {groups.map((g, i) => {
                const open = gx[g.key] ?? !g.closedByDefault;
                return (
                  <div key={g.key} className={i ? "border-t border-[#ececec]" : ""}>
                    <button type="button" aria-expanded={open} onClick={() => setGx({ ...gx, [g.key]: !open })} className="pl-quiet flex h-[46px] w-full items-center gap-2.5 px-5 text-left">
                      <ChevronRight size={14} className={`pl-chev shrink-0 text-muted ${open ? "rotate-90" : ""}`} />
                      <span className={`truncate text-body font-semibold ${g.dim ? "text-muted" : ""}`}>{g.label}</span>
                      <span className="num text-meta text-muted">{g.people.length}</span>
                      <span className="ml-auto hidden text-meta text-muted sm:inline">{g.sub}</span>
                    </button>
                    {open && g.people.slice().sort((a, b) => (a.next_date ?? "9999").localeCompare(b.next_date ?? "9999")).map((l) => row(l, g.second(l)))}
                  </div>
                );
              })}
              {strays.length > 0 && <div className="border-t border-[#ececec]">
                <div className="flex h-[46px] items-center gap-2.5 px-5 text-body font-semibold">Stage not in {P.name}<span className="num text-meta font-normal text-muted">{strays.length}</span></div>
                {strays.map((l) => row(l, l.stage))}
              </div>}
              {!groups.length && !strays.length && (anyFilter
                ? <span className="flex flex-wrap items-center gap-3 p-5 text-body text-muted">No one matches these filters.<button type="button" className="btn h-8! px-3! text-meta font-semibold text-ink" onClick={clearFilters}>Clear filters</button></span>
                : <span className="block p-5 text-body text-muted">No one in {P.name} yet. Add a lead or import from Network.</span>)}
            </>}
          </section>
        </section>
      </div>

      {lead && <LeadPanel lead={lead} pipe={pipeOf(lead)} info={info.get(lead.id)} advice={advice.get(lead.id)} data={data} api={api} onMove={(to) => startMove(lead, to)} onClose={() => setSel(null)} dialogOpen={!!move} logged={logged} />}
      {moving && move && <MoveDialog lead={moving} pipe={pipeOf(moving)} to={move.to} reasons={data.reasons} onCancel={() => setMove(null)}
        onConfirm={async (m) => {
          const p = pipeOf(moving), stay = m.to === moving.stage;
          setMove(null);
          const r = await api.move(moving, m, p);
          if (!r.ok) { toast(r.error); return; }
          haptic(10); setLogged((n) => n + 1);
          const when = isClosed(p, m.to) ? `Check in on ${fmtShort(m.date)}.` : `Next action is on Today for ${fmtShort(m.date)}.`;
          toast(stay ? `Logged. ${when}` : `${moving.name} moved to ${m.to}. ${when}`, () => { r.value().then(() => setLogged((n) => n + 1)); });
        }} />}
      {side === "pipes" && <PipelinesPanel data={data} api={api} current={P} leadsOf={(p) => data.leads.filter((l) => pipeOf(l).id === p.id)} onPick={(id) => { pickPipe(id); setSide(null); setSel(null); }} onClose={() => setSide(null)} />}
      {side === "import" && <ImportPanel data={data} api={api} pipe={P} onClose={() => setSide(null)} />}
      {side === "add" && <AddLeadPanel data={data} api={api} pipe={P} onClose={() => setSide(null)} onAdded={(id) => { setSide(null); setSel(id); }} />}
    </Section>
  );
}
