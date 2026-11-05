"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Check, Link2, Trash2, PartyPopper } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useWorkspace, today, addDays, fmtDay, isWeekday, KINDS } from "@/lib/workspace";
import { Section, NeedsYou, KpiTiles, type TourStep, type Need } from "@/components/shell";
import { useToast, haptic } from "@/components/toaster";

type Item = { id: string; day: string; kind: string; idx: number; title: string; done: boolean; link: string; note: string; done_at: string | null };
const SECTIONS = [...KINDS, { key: "custom", label: "Other tasks", unit: "task", hint: "One-off tasks for this day" }];
type Due = { id: string; name: string; company: string; stage: string; next_action: string; next_date: string | null };
const TODAY_TOUR: TourStep[] = [
  { target: "progress", title: "The day at a glance", body: "Done against planned for the day, with each kind of work shown separately.", tab: "home" },
  { target: "left", title: "What is left", body: "Items still open by kind. Click one to jump to the checklist.", tab: "home" },
  { target: "needs", title: "Needs you", body: "Follow-ups whose date has arrived and one-off tasks, such as campaign comments or the weekly AI citation run.", tab: "home" },
  { target: "days", title: "Other days", body: "Step back or forward a day. Each day keeps its own checklist.", tab: "home" },
  { target: "checklist", title: "The checklist", body: "Tick items as you do them. J and K move, X ticks. Every tick updates the dashboard live.", tab: "list" },
  { target: "custom", title: "One-off tasks", body: "Add anything that is not part of the daily quota.", tab: "list" },
];

export default function Today() {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const [day, setDay] = useState(today());
  const { rows, setRows, loading, reload } = useLive<Item>("daily_items", ws.id, { filter: (q) => q.eq("day", day), order: "idx" });
  const editable = can("editor");
  const [focus, setFocus] = useState(0);
  const [justDone, setJustDone] = useState<string | null>(null);
  const [tab, setTab] = useState("home");
  const due = useLive<Due>("prospects", ws.id, { filter: (q) => q.lte("next_date", today()).not("stage", "in", "(Won,Parked)").order("next_date") });

  // Generate the day's checklist from the profile's quotas the first time it is opened.
  useEffect(() => {
    if (!editable || loading) return;
    if (rows.some((r) => r.kind !== "custom")) return;
    const want: Record<string, unknown>[] = [];
    for (const k of KINDS) {
      const n = k.key === "inmail" && !isWeekday(day) ? 0 : (ws.quotas as any)[k.key] ?? 0;
      for (let i = 1; i <= n; i++) want.push({ workspace_id: ws.id, day, kind: k.key, idx: i, title: "" });
    }
    if (want.length) supabase().from("daily_items").upsert(want, { onConflict: "workspace_id,day,kind,idx", ignoreDuplicates: true }).then(() => reload());
  }, [day, loading, rows, editable, ws, reload]);

  // AI citation runs need this browser open, so once a week Today asks for one (one task, never repeated).
  useEffect(() => {
    if (!editable || loading || day !== today()) return;
    if (rows.some((r) => r.kind === "custom" && r.idx === 3600)) return;
    (async () => {
      const { count } = await supabase().from("citation_questions").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).eq("status", "active");
      if (!count) return;
      const { data } = await supabase().from("citation_runs").select("run_at").eq("workspace_id", ws.id).order("run_at", { ascending: false }).limit(1);
      const last = data?.[0]?.run_at as string | undefined;
      const days = last ? Math.floor((Date.now() - Date.parse(last)) / 864e5) : null;
      if (days != null && days < 7) return;
      await supabase().from("daily_items").upsert({ workspace_id: ws.id, day, kind: "custom", idx: 3600, title: days == null ? `Run the ${count} AI citation questions for the first time` : `Run the AI citation questions (last run ${days} days ago)`, link: `/w/${ws.slug}/citations`, note: "citations:weekly" }, { onConflict: "workspace_id,day,kind,idx", ignoreDuplicates: true });
      reload();
    })();
  }, [day, loading, rows, editable, ws.id, ws.slug, reload]);

  const ordered = useMemo(() => SECTIONS.flatMap((s) => rows.filter((r) => r.kind === s.key).sort((a, b) => a.idx - b.idx)), [rows]);
  const total = rows.length, done = rows.filter((r) => r.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const patch = useCallback(async (id: string, p: Partial<Item>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
    const { error } = await supabase().from("daily_items").update(p).eq("id", id);
    if (error) { toast("Could not save. Check your connection."); reload(); }
  }, [setRows, toast, reload]);

  const toggle = useCallback((it: Item) => {
    if (!editable) return;
    const next = !it.done;
    haptic(next ? 10 : 4);
    if (next) setJustDone(it.id);
    patch(it.id, { done: next });
    const label = KINDS.find((k) => k.key === it.kind)?.unit ?? "task";
    if (next) toast(`${label[0].toUpperCase() + label.slice(1)} ${it.idx} done`, () => patch(it.id, { done: false }));
  }, [editable, patch, toast]);

  // Keyboard: j/k move, x toggles.
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (tab !== "list") return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey) return;
      if (e.key === "j") setFocus((f) => Math.min(f + 1, ordered.length - 1));
      if (e.key === "k") setFocus((f) => Math.max(f - 1, 0));
      if (e.key === "x" && ordered[focus]) toggle(ordered[focus]);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [ordered, focus, toggle, tab]);
  useEffect(() => { list.current?.querySelector(`[data-i="${focus}"]`)?.scrollIntoView({ block: "nearest" }); }, [focus]);

  async function addCustom() {
    const { data } = await supabase().from("daily_items").insert({ workspace_id: ws.id, day, kind: "custom", idx: 1000 + rows.filter((r) => r.kind === "custom").length + 1, title: "" }).select().single();
    if (data) { setRows((rs) => [...rs, data as Item]); setTimeout(() => document.getElementById(`t-${(data as Item).id}`)?.focus(), 50); }
  }

  const open = rows.filter((r) => !r.done);
  const needs: Need[] = [
    ...due.rows.slice(0, 5).map((p) => ({ title: `${p.name}${p.company ? `, ${p.company}` : ""}`, sub: `${p.stage} · ${p.next_action || "Next step due"} · ${fmtDay(p.next_date!, { day: "numeric", month: "short" })}`, cta: "Open", href: `/w/${ws.slug}/pipeline?p=${p.id}`, tone: "red" as const })),
    ...open.filter((r) => r.kind === "custom" && r.title).slice(0, 5).map((r) => ({ title: r.title, sub: r.link ? "Has a link" : "One-off task", cta: r.link ? "Open" : "Go", ...(r.link ? { href: r.link } : { onClick: () => setTab("list") }), tone: "dark" as const })),
  ];
  return (
    <Section id="today" title="Today" status={fmtDay(day, { weekday: "long", day: "numeric", month: "long" }) + (day === today() ? "" : " · not today")}
      entryStatus={total ? `${total - done} of ${total} items left. ${due.rows.length} follow-ups due.` : `${due.rows.length} follow-ups due. The checklist builds from the daily quota when you open it.`}
      tabs={[{ id: "home", label: "Home" }, { id: "list", label: "Checklist", count: total - done || undefined }]} tab={tab} onTab={setTab} steps={TODAY_TOUR}
      actions={<div data-tour="days" className="flex items-center gap-1 rounded-xl">
          <button className="btn btn-ghost h-10" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}><ChevronLeft size={16} /></button>
          <button className="btn h-10" onClick={() => setDay(today())} disabled={day === today()}>Today</button>
          <button className="btn btn-ghost h-10" aria-label="Next day" onClick={() => setDay(addDays(day, 1))}><ChevronRight size={16} /></button>
        </div>}>

      <section data-tour="progress" className={`card overflow-hidden ${pct >= 100 ? "ring-1 ring-good/40" : ""}`}>
        <div className="flex flex-wrap items-center gap-6 p-5">
          <Ring pct={pct} />
          <div className="min-w-[180px]">
            <div className="label">Day progress</div>
            <div className="num mt-1 text-[28px] font-semibold leading-none">{done}<span className="text-[16px] text-faint"> / {total}</span></div>
            <div className="mt-1.5 text-[13px] text-muted">{pct >= 100 ? "Quota met for today." : `${total - done} left · every tick updates the dashboard live`}</div>
          </div>
          <div className="flex flex-1 flex-wrap gap-2">
            {KINDS.map((k) => { const g = rows.filter((r) => r.kind === k.key); const d = g.filter((x) => x.done).length; return g.length ? (
              <span key={k.key} className="chip transition-colors" style={d === g.length ? { background: "var(--good-soft)", color: "var(--good)" } : undefined}>{d === g.length && <Check size={12} strokeWidth={3} />}{k.label} <span className="num">{d}/{g.length}</span></span>
            ) : null; })}
          </div>
        </div>
        <div className="h-1 bg-surface-2"><div className="h-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${pct}%`, background: pct >= 100 ? "var(--good)" : undefined }} /></div>
        {pct >= 100 && <div className="anim-rise flex items-center gap-2 border-t border-line bg-good-soft px-5 py-2.5 text-[13px] text-good"><PartyPopper size={15} /> Quota met. Anything extra today is a bonus.</div>}
      </section>

      {tab === "home" && (
        <div className="flex flex-col gap-4">
          <KpiTiles tour="left" items={SECTIONS.filter((k) => rows.some((r) => r.kind === k.key)).slice(0, 4).map((k) => { const g = rows.filter((r) => r.kind === k.key); const d = g.filter((x) => x.done).length; return { label: k.label, value: g.length - d, of: "left", sub: `${d} of ${g.length} done`, onClick: () => setTab("list"), tone: d === g.length ? "dark" as const : undefined }; })} />
          <NeedsYou tour="needs" items={needs} empty="Nothing waiting. Follow-ups with a due date and one-off tasks show here." />
        </div>
      )}

      {tab === "list" && (loading ? <Skeleton /> : total === 0 && !editable ? (
        <div className="card p-10 text-center text-[13px] text-muted">No checklist for this day yet. An editor opens it to generate the quota.</div>
      ) : (
        <div ref={list} data-tour="checklist" className="flex flex-col gap-4 rounded-2xl">
          {SECTIONS.map((s) => {
            const g = rows.filter((r) => r.kind === s.key).sort((a, b) => a.idx - b.idx);
            if (!g.length && s.key !== "custom") return null;
            const d = g.filter((x) => x.done).length;
            return (
              <section key={s.key} data-tour={s.key === "custom" ? "custom" : undefined} className="card overflow-hidden">
                <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
                  <h2 className="flex items-center gap-2 text-[13px] font-semibold">{s.label}{g.length > 0 && <span className="num text-[12px] font-normal text-muted">{d}/{g.length}</span>}</h2>
                  {s.key === "custom" && editable ? <button className="btn btn-ghost h-7" onClick={addCustom}><Plus size={14} /> Add task</button> : <span className="hidden text-[12px] text-muted sm:block">{s.hint}</span>}
                </header>
                {g.length === 0 ? <button onClick={addCustom} disabled={!editable} className="w-full px-4 py-3 text-left text-[13px] text-muted hover:bg-surface-2">+ Add a one-off task for this day</button> : (
                  <ul>{g.map((it) => { const i = ordered.indexOf(it); return <Row key={it.id} it={it} i={i} focused={i === focus} pop={justDone === it.id} unit={s.unit} editable={editable} onToggle={() => { setFocus(i); toggle(it); }} onPatch={patch} />; })}</ul>
                )}
              </section>
            );
          })}
          <p className="pb-2 text-center text-[12px] text-faint">Keyboard: <span className="kbd">J</span> <span className="kbd">K</span> to move, <span className="kbd">X</span> to tick, <span className="kbd">⌘</span><span className="kbd">K</span> to jump anywhere</p>
        </div>
      ))}
    </Section>
  );
}

function Row({ it, i, focused, pop, unit, editable, onToggle, onPatch }: { it: Item; i: number; focused: boolean; pop: boolean; unit: string; editable: boolean; onToggle: () => void; onPatch: (id: string, p: Partial<Item>) => void }) {
  const [title, setTitle] = useState(it.title);
  const [link, setLink] = useState(it.link);
  useEffect(() => { setTitle(it.title); setLink(it.link); }, [it.title, it.link]);
  const placeholder = it.kind === "custom" ? "What needs doing" : `${unit[0].toUpperCase() + unit.slice(1)} ${it.idx}: who or what`;
  return (
    <li data-i={i} className={`group flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0 transition-colors ${focused ? "bg-accent-soft/50" : "hover:bg-surface-2/60"} ${pop ? "anim-flash" : ""}`}>
      <button disabled={!editable} onClick={onToggle} aria-label={it.done ? "Mark not done" : "Mark done"}
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border-[1.5px] transition-all duration-150 active:scale-90 ${it.done ? "border-good bg-good text-white" : "border-line-strong bg-surface hover:border-accent"}`}>
        {it.done && <Check size={13} strokeWidth={3} className={pop ? "anim-pop" : ""} />}
      </button>
      <input id={`t-${it.id}`} disabled={!editable} value={title} placeholder={placeholder} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== it.title && onPatch(it.id, { title })}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className={`min-w-0 flex-1 bg-transparent text-[13px] outline-none transition-colors placeholder:text-faint ${it.done ? "text-muted line-through decoration-faint" : ""}`} />
      <div className="hidden w-[36%] items-center gap-1.5 text-faint sm:flex">
        <Link2 size={13} />
        <input id={`l-${it.id}`} disabled={!editable} value={link} placeholder="Paste link" onChange={(e) => setLink(e.target.value)} onBlur={() => link !== it.link && onPatch(it.id, { link })}
          className="min-w-0 flex-1 bg-transparent text-[12px] text-ink-2 outline-none placeholder:text-faint" />
        {it.link && <a href={it.link} target="_blank" rel="noopener" className="text-[12px] font-medium text-accent hover:underline">Open</a>}
      </div>
      {it.kind === "custom" && editable && (
        <button className="btn btn-ghost h-7 px-2 opacity-0 transition-opacity group-hover:opacity-100" aria-label="Delete task" onClick={() => supabase().from("daily_items").delete().eq("id", it.id)}><Trash2 size={14} /></button>
      )}
    </li>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 28, c = 2 * Math.PI * r;
  return (
    <svg width="74" height="74" viewBox="0 0 74 74" aria-label={`${pct}% done`}>
      <circle cx="37" cy="37" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="7" />
      <circle cx="37" cy="37" r={r} fill="none" stroke={pct >= 100 ? "var(--good)" : "var(--accent)"} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 37 37)" style={{ transition: "stroke-dasharray .5s ease-out" }} />
      <text x="37" y="41" textAnchor="middle" fontSize="14" fontWeight="600" fill="var(--ink)" style={{ fontFamily: "var(--font-mono)" }}>{pct}%</text>
    </svg>
  );
}

function Skeleton() {
  return <div className="flex flex-col gap-4">{[0, 1, 2].map((k) => <div key={k} className="card h-[140px] animate-pulse bg-surface-2/50" />)}</div>;
}
