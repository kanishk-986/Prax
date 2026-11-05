"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, LayoutGrid, List, Flame, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useWorkspace, STAGES, SEGMENTS, today, fmtDay } from "@/lib/workspace";
import { Section, KpiTiles, NeedsYou, type TourStep } from "@/components/shell";
import { ProspectDrawer, type Prospect } from "@/components/prospect-drawer";
import { useToast, haptic } from "@/components/toaster";

const OPEN = STAGES.filter((s) => s !== "Parked");
const PIPE_TOUR: TourStep[] = [
  { target: "kpis", title: "Where the pipeline stands", body: "People in the pipeline, conversations, calls booked and follow-ups that are overdue.", tab: "home" },
  { target: "stages", title: "Every stage", body: "How many people sit in each stage. Click a stage to see those people.", tab: "home" },
  { target: "needs", title: "Needs you", body: "Overdue follow-ups first, then people warming up who are ready for a note.", tab: "home" },
  { target: "rates", title: "Conversion between stages", body: "Where people stall: from warming to request, request to connection, connection to conversation, and conversation to call.", tab: "people" },
  { target: "filters", title: "Find people", body: "Search, filter by segment or warm only, and switch between the board and the table.", tab: "people" },
  { target: "board", title: "Open a person", body: "Click anyone to open their record, warm path and notes.", tab: "people" },
];

export default function Pipeline() {
  const { ws, can } = useWorkspace();
  const { rows, setRows, loading } = useLive<Prospect>("prospects", ws.id, { order: "created_at" });
  const toast = useToast();
  const [view, setView] = useState<"board" | "table">("board");
  const [q, setQ] = useState("");
  const [seg, setSeg] = useState("");
  const [warm, setWarm] = useState(false);
  const [sel, setSel] = useState<Prospect | "new" | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const editable = can("editor");
  const t = today();
  const [tab, setTab] = useState("home");
  const [warmN, setWarmN] = useState<number | null>(null);
  useEffect(() => { supabase().rpc("network_warm_count", { ws: ws.id }).then(({ data, error }: { data: unknown; error: unknown }) => setWarmN(error ? null : (data as number))); }, [ws.id, rows.length]);
  // Open a person's drawer when arriving from the command menu (?p=<id>).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("p");
    if (!id || !rows.length) return;
    const hit = rows.find((r) => r.id === id);
    if (hit) { setSel(hit); window.history.replaceState(null, "", window.location.pathname); }
  }, [rows]);

  const list = useMemo(() => rows.filter((p) => (!seg || p.segment === seg) && (!warm || p.warmth === "warm") && (!q || `${p.name} ${p.company} ${p.role} ${p.region}`.toLowerCase().includes(q.toLowerCase()))), [rows, seg, warm, q]);
  const by = (s: string) => list.filter((p) => p.stage === s);
  const reached = (s: string) => rows.filter((p) => p.stage !== "Parked" && STAGES.indexOf(p.stage as never) >= STAGES.indexOf(s as never)).length;
  const conv = (a: string, b: string) => { const x = reached(a); return x ? Math.round((reached(b) / x) * 100) : 0; };

  async function move(id: string, stage: string, undo = true) {
    const from = rows.find((r) => r.id === id);
    if (!editable || !from || from.stage === stage) return;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, stage } : r)));
    haptic(10);
    const { error } = await supabase().from("prospects").update({ stage }).eq("id", id);
    if (error) { setRows((rs) => rs.map((r) => (r.id === id ? from : r))); toast(error.message); return; }
    if (undo) toast(`${from.name} moved to ${stage}`, () => move(id, from.stage, false));
  }

  const overdue = rows.filter((p) => p.next_date && p.next_date < t && !["Won", "Parked"].includes(p.stage)).sort((a, b) => (a.next_date! < b.next_date! ? -1 : 1));
  const dueToday = rows.filter((p) => p.next_date === t && !["Won", "Parked"].includes(p.stage));
  const warming = rows.filter((p) => p.stage === "Warming");
  return (
    <Section id="pipeline" title="Pipeline" wide status={`${rows.length} people · ${reached("In conversation")} in conversation · ${reached("Call booked")} calls`}
      entryStatus={`${overdue.length} follow-ups overdue, ${dueToday.length} due today. ${reached("In conversation")} people in conversation.`}
      tabs={[{ id: "home", label: "Home" }, { id: "people", label: "People", count: rows.length || undefined }]} tab={tab} onTab={setTab} steps={PIPE_TOUR}
      actions={editable ? <button className="btn btn-primary h-10 px-4" onClick={() => setSel("new")}><Plus size={14} /> Add prospect</button> : undefined}>

      {tab === "home" && (
        <div className="flex flex-col gap-4">
          <KpiTiles tour="kpis" items={[
            { label: "In the pipeline", value: rows.filter((p) => p.stage !== "Parked").length, sub: "open and won", tone: "dark", onClick: () => setTab("people") },
            { label: "In conversation", value: reached("In conversation"), sub: "or further" },
            { label: "Calls booked", value: reached("Call booked"), sub: "or further" },
            { label: "Overdue", value: overdue.length, sub: `${dueToday.length} due today`, tone: overdue.length ? "red" : undefined },
          ]} />
          <div className="flex flex-wrap gap-4">
            <section data-tour="stages" className="min-w-0 flex-[3_1_520px] overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="flex items-baseline justify-between px-[18px] py-3.5"><span className="font-semibold">Stages</span><span className="text-[12px] text-muted">{warmN == null ? "Import the LinkedIn export in Network for warm paths" : `${warmN} open prospects have a warm path`}</span></div>
              {[...OPEN, "Parked"].map((s) => { const n = rows.filter((p) => p.stage === s).length; const max = Math.max(1, ...[...OPEN, "Parked"].map((x) => rows.filter((p) => p.stage === x).length)); return (
                <button key={s} type="button" onClick={() => { setTab("people"); setView("table"); setQ(""); }} className="grid w-full grid-cols-[150px_1fr_40px] items-center gap-3 border-t border-line px-[18px] py-2.5 text-left text-[13px] hover:bg-[#fafafa]">
                  <span className="font-medium">{s}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-[#ececec]"><span className="block h-full rounded-full" style={{ width: `${(n / max) * 100}%`, background: s === "Parked" ? "var(--stroke)" : s === "Won" || s === "Call booked" ? "#9e1c1c" : "#d64545" }} /></span>
                  <span className="num text-right">{n}</span>
                </button>
              ); })}
            </section>
            <div className="min-w-0 flex-[2_1_320px]">
              <NeedsYou tour="needs" empty="Nothing overdue and nobody waiting. People whose next step is due show here."
                items={[
                  ...overdue.slice(0, 6).map((p) => ({ title: `${p.name}${p.company ? `, ${p.company}` : ""}`, sub: `Overdue since ${fmtDay(p.next_date!, { day: "numeric", month: "short" })} · ${p.next_action || p.stage}`, cta: "Open", onClick: () => setSel(p), tone: "red" as const })),
                  ...dueToday.slice(0, 4).map((p) => ({ title: `${p.name}${p.company ? `, ${p.company}` : ""}`, sub: `Due today · ${p.next_action || p.stage}`, cta: "Open", onClick: () => setSel(p), tone: "dark" as const })),
                  ...warming.slice(0, 4).map((p) => ({ title: `${p.name}${p.company ? `, ${p.company}` : ""}`, sub: "Warming: comment twice, then send the note", cta: "Open", onClick: () => setSel(p), tone: "dim" as const })),
                ]} />
            </div>
          </div>
        </div>
      )}

      {tab === "people" && <>
      <div data-tour="rates" className="mb-4 grid grid-cols-2 gap-3 rounded-2xl md:grid-cols-4">
        {[["Warmed → requested", conv("Warming", "Requested")], ["Requested → connected", conv("Requested", "Connected")], ["Connected → conversation", conv("Connected", "In conversation")], ["Conversation → call", conv("In conversation", "Call booked")]].map(([l, v]) => (
          <div key={l as string} className="card px-4 py-3"><div className="label">{l}</div><div className="num mt-1 text-[20px] font-semibold">{v}%</div></div>
        ))}
      </div>

      <div data-tour="filters" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl">
        <div className="relative w-full sm:max-w-[260px]"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" /><input id="p-search" className="field pl-8" placeholder="Search people, companies" aria-label="Search people" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select id="p-seg" className="field w-auto" value={seg} onChange={(e) => setSeg(e.target.value)} aria-label="Segment">
          <option value="">All segments</option>{Object.entries(SEGMENTS).map(([k, v]) => <option key={k} value={k}>{k} · {v.label}</option>)}
        </select>
        <button className={`btn ${warm ? "border-warn text-warn" : ""}`} onClick={() => setWarm(!warm)}><Flame size={14} /> Warm only</button>
        <div className="ml-auto flex rounded-lg border border-line-strong bg-surface p-0.5">
          <button className={`btn h-7 border-0 ${view === "board" ? "bg-surface-2" : "bg-transparent"}`} onClick={() => setView("board")}><LayoutGrid size={14} /> Board</button>
          <button className={`btn h-7 border-0 ${view === "table" ? "bg-surface-2" : "bg-transparent"}`} onClick={() => setView("table")}><List size={14} /> Table</button>
        </div>
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-hidden">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-[320px] w-[260px] shrink-0 animate-pulse rounded-xl bg-surface-2" />)}</div>
      ) : view === "board" ? (
        <Board>
          {[...OPEN, "Parked"].map((s) => {
            const items = by(s);
            return (
              <section key={s} onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(s); } }} onDragLeave={() => setOver(null)}
                onDrop={(e) => { e.preventDefault(); setOver(null); if (drag) move(drag, s); setDrag(null); }}
                className={`flex w-[260px] shrink-0 flex-col rounded-xl border p-2 transition-colors ${over === s ? "border-accent bg-accent-soft" : "border-line bg-surface-2/60"}`}>
                <header className="flex items-center justify-between px-1.5 pb-2 pt-1">
                  <span className="flex items-center gap-2 text-[12px] font-semibold"><span className="dot" style={{ background: s === "Call booked" || s === "Won" ? "var(--good)" : s === "Parked" ? "var(--faint)" : "var(--accent)" }} />{s}</span>
                  <span className="num rounded-md bg-surface px-1.5 text-[11px] text-muted ring-1 ring-line">{items.length}</span>
                </header>
                <div className="flex min-h-[80px] flex-col gap-2">
                  {items.map((p) => <Card key={p.id} p={p} t={t} draggable={editable} onDrag={setDrag} onOpen={() => setSel(p)} />)}
                </div>
              </section>
            );
          })}
        </Board>
      ) : (
        <div data-tour="board" className="card overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-line text-left">{["Name", "Company", "Segment", "Region", "Stage", "Next action", "Due"].map((h) => <th key={h} className="label px-3 py-2.5 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{list.map((p) => (
              <tr key={p.id} onClick={() => setSel(p)} className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2">
                <td className="px-3 py-2 font-medium">{p.name}<div className="text-[12px] font-normal text-muted">{p.role}</div></td>
                <td className="px-3 py-2">{p.company}</td>
                <td className="px-3 py-2"><SegTag s={p.segment} /></td>
                <td className="px-3 py-2 text-muted">{p.region}</td>
                <td className="px-3 py-2"><span className="chip">{p.stage}</span></td>
                <td className="max-w-[280px] truncate px-3 py-2 text-ink-2">{p.next_action}</td>
                <td className={`num px-3 py-2 ${p.next_date && p.next_date < t ? "text-bad" : "text-muted"}`}>{p.next_date ? fmtDay(p.next_date, { day: "numeric", month: "short" }) : ""}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      </>}
      {sel && <ProspectDrawer p={sel === "new" ? null : sel} onClose={() => setSel(null)} />}
    </Section>
  );
}

/** The stage board scrolls sideways inside its own area: a visible scrollbar, and arrows that say how far along you are. */
function Board({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const b = box.current; if (!b) return;
    setEdge({ left: b.scrollLeft > 4, right: b.scrollLeft + b.clientWidth < b.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);
  const go = (dir: number) => { const b = box.current; if (b) b.scrollBy({ left: dir * Math.max(280, b.clientWidth * 0.8), behavior: "smooth" }); };
  return (
    <div data-tour="board" className="flex flex-col gap-2 rounded-xl">
      {(edge.left || edge.right) && (
        <div className="flex items-center justify-end gap-2 text-[12px] text-muted">
          <span>{edge.right ? "More stages to the right" : "End of the board"}</span>
          <button type="button" className="btn" style={{ width: 32, padding: 0 }} onClick={() => go(-1)} disabled={!edge.left} aria-label="Earlier stages"><ChevronLeft size={15} /></button>
          <button type="button" className="btn" style={{ width: 32, padding: 0 }} onClick={() => go(1)} disabled={!edge.right} aria-label="Later stages"><ChevronRight size={15} /></button>
        </div>
      )}
      <div ref={box} onScroll={measure} className="flex gap-3 overflow-x-auto overscroll-x-contain rounded-xl pb-3">{children}</div>
    </div>
  );
}

function SegTag({ s }: { s: string }) {
  const m = SEGMENTS[s];
  return m ? <span className="chip" style={{ background: m.color + "1a", color: m.color }}>{s} · {m.label}</span> : null;
}

function Card({ p, t, draggable, onDrag, onOpen }: { p: Prospect; t: string; draggable: boolean; onDrag: (id: string | null) => void; onOpen: () => void }) {
  const color = SEGMENTS[p.segment]?.color ?? "var(--faint)";
  const initials = p.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  const days = Math.max(0, Math.floor((Date.now() - new Date(p.stage_changed_at).getTime()) / 864e5));
  const overdue = p.next_date && p.next_date < t;
  return (
    <article draggable={draggable} onDragStart={() => onDrag(p.id)} onDragEnd={() => onDrag(null)} onClick={onOpen}
      className="card lift cursor-pointer p-3 active:scale-[.985]">
      <div className="flex items-start gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white" style={{ background: color }}>{initials}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{p.name}</div>
          <div className="truncate text-[12px] text-muted">{p.role}{p.company ? ` · ${p.company}` : ""}</div>
        </div>
        {p.warmth === "warm" && <Flame size={14} className="shrink-0 text-warn" aria-label="Warm" />}
      </div>
      {p.next_action && <p className="mt-2 line-clamp-2 text-[12px] text-ink-2">{p.next_action}</p>}
      <div className="mt-2 flex items-center justify-between text-[11px] text-faint">
        <span>{p.region || SEGMENTS[p.segment]?.label || ""}</span>
        <span className="num">{p.next_date ? <span className={overdue ? "text-bad" : ""}>{fmtDay(p.next_date, { day: "numeric", month: "short" })}</span> : `${days}d in stage`}</span>
      </div>
    </article>
  );
}
