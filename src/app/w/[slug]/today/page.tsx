"use client";
// Today: the day as a focused agenda. Progress, what is due or overdue, then the plan grouped in a fixed order
// (Comment, Post, Follow up, Connect, Other). Each row has one action, Done and Skip. J and K move, X ticks, S skips.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Check, Link2, Trash2, ArrowUpRight } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useWorkspace, today, addDays, fmtDay, isWeekday, KINDS } from "@/lib/workspace";
import { Section, ProgressRing, CountUp, reveal, type TourStep } from "@/components/shell";
import { useToast, haptic } from "@/components/toaster";
import { agenda, progressOf, isSkipped, skipNote, unskipNote, typeLabel, primaryAction, whenLabel, GROUPS, groupOf } from "@/lib/dashboard";

type Item = { id: string; day: string; kind: string; idx: number; title: string; done: boolean; link: string; note: string; done_at: string | null };
type Due = { id: string; name: string; company: string; stage: string; next_action: string; next_date: string | null };
type DuePost = { id: string; title: string; format: string; status: string; publish_date: string | null };

const TODAY_TOUR: TourStep[] = [
  { target: "header", title: "What Today is for", body: "The plan for one day: the comments, posts, follow-ups and connections that move the pipeline. Prax suggests the work; you do the posting and sending on LinkedIn yourself." },
  { target: "days", title: "Other days", body: "Step back or forward a day. Each day keeps its own plan, built from the daily quota the first time it is opened." },
  { target: "progress", title: "Progress", body: "The ring fills as you clear the day. Done and skipped both clear an item; only done counts on the dashboard." },
  { target: "due", title: "Due and overdue", body: "Pipeline follow-ups whose date has arrived and posts whose planned date has come. Overdue ones are marked in red." },
  { target: "agenda", title: "The plan, in order", body: "Comment first, then posts, follow-ups, connection requests and anything else. Each group shows how much of it is done." },
  { target: "row", title: "One task", body: "The type, who or what it concerns, a link once you have one, one action, and Done or Skip. Undo is in the message bottom right." },
  { target: "add", title: "One-off tasks", body: "Add anything that is not part of the daily quota. It sits under Other." },
  { target: "keys", title: "Keyboard", body: "J and K move between tasks, X marks done, S skips. Command K jumps anywhere in Prax." },
];

export default function Today() {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const [day, setDay] = useState(today());
  const { rows, setRows, loading, reload } = useLive<Item>("daily_items", ws.id, { filter: (q) => q.eq("day", day), order: "idx" });
  const editable = can("editor");
  const [focus, setFocus] = useState(0);
  const [justDone, setJustDone] = useState<string | null>(null);
  const t = today();
  const due = useLive<Due>("prospects", ws.id, { filter: (q) => q.lte("next_date", t).not("stage", "in", "(Won,Parked)").order("next_date") });
  const duePosts = useLive<DuePost>("posts", ws.id, { filter: (q) => q.lte("publish_date", t).not("status", "in", "(Posted,Published,\"On hold\")").order("publish_date") });

  // Generate the day's plan from the profile's quotas the first time it is opened.
  useEffect(() => {
    if (!editable || loading) return;
    if (rows.some((r) => r.kind !== "custom")) return;
    const want: Record<string, unknown>[] = [];
    for (const k of KINDS) {
      const n = k.key === "inmail" && !isWeekday(day) ? 0 : (ws.quotas as Record<string, number>)[k.key] ?? 0;
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

  const groups = useMemo(() => agenda(rows), [rows]);
  const ordered = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const prog = progressOf(rows);

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
    // Ticking a skipped item clears the skip, so the note goes back to what it was.
    patch(it.id, isSkipped(it.note) ? { done: next, note: unskipNote(it.note) } : { done: next });
    if (next) toast(`${typeLabel(it)} done`, () => patch(it.id, { done: false, note: it.note }));
  }, [editable, patch, toast]);

  const skip = useCallback((it: Item) => {
    if (!editable || it.done) return;
    if (isSkipped(it.note)) { patch(it.id, { note: unskipNote(it.note) }); return; }
    haptic(4);
    patch(it.id, { note: skipNote(it.note) });
    toast(`${typeLabel(it)} skipped`, () => patch(it.id, { note: it.note }));
  }, [editable, patch, toast]);

  // Keyboard: j/k move, x toggles done, s skips.
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j") setFocus((f) => Math.min(f + 1, ordered.length - 1));
      if (e.key === "k") setFocus((f) => Math.max(f - 1, 0));
      if (e.key === "x" && ordered[focus]) toggle(ordered[focus]);
      if (e.key === "s" && ordered[focus]) skip(ordered[focus]);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [ordered, focus, toggle, skip]);
  useEffect(() => { list.current?.querySelector(`[data-i="${focus}"]`)?.scrollIntoView({ block: "nearest" }); }, [focus]);

  async function addCustom() {
    const { data } = await supabase().from("daily_items").insert({ workspace_id: ws.id, day, kind: "custom", idx: Math.max(1000, ...rows.filter((r) => r.kind === "custom" && r.idx < 2000).map((r) => r.idx)) + 1, title: "" }).select().single();
    if (data) { setRows((rs) => [...rs, data as Item]); setTimeout(() => document.getElementById(`t-${(data as Item).id}`)?.focus(), 50); }
  }

  const dueCount = due.rows.length + duePosts.rows.length;
  const isToday = day === t;
  const firstOpen = ordered.find((r) => !r.done && !isSkipped(r.note)) ?? ordered[0];
  return (
    <Section id="today" title="Today" status={fmtDay(day, { weekday: "long", day: "numeric", month: "long" }) + (isToday ? "" : " · not today")}
      entryStatus={prog.total ? `${prog.left} of ${prog.total} tasks left. ${dueCount} due or overdue.` : `${dueCount} due or overdue. The plan builds from the daily quota when you open it.`}
      steps={TODAY_TOUR}
      actions={<>
        <div data-tour="days" className="flex items-center gap-1 rounded-xl">
          <button className="btn btn-ghost h-10" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}><ChevronLeft size={16} /></button>
          <button className="btn h-10" onClick={() => setDay(t)} disabled={isToday}>Today</button>
          <button className="btn btn-ghost h-10" aria-label="Next day" onClick={() => setDay(addDays(day, 1))}><ChevronRight size={16} /></button>
        </div>
        {editable && <button data-tour="add" className="btn btn-dark h-10 px-3.5" onClick={addCustom}><Plus size={14} /> Add task</button>}
      </>}>

      {loading ? <Skeleton /> : (<>
        {prog.state === "complete" ? <DaySummary prog={prog} rows={rows} isToday={isToday} slug={ws.slug} onNext={() => setDay(addDays(day, 1))} /> : (
          <section data-tour="progress" {...reveal(0)} className={`panel ${reveal(0).className} flex flex-wrap items-center gap-x-8 gap-y-5 p-5`}>
            <ProgressRing pct={prog.pct} size={112} stroke={9} label={`${prog.pct}% of the day cleared`}>
              <span className="num text-[30px] font-semibold tracking-[-0.03em]"><CountUp value={prog.done} /></span>
              <span className="mt-1 text-[11.5px] text-muted">of {prog.total} done</span>
            </ProgressRing>
            <div className="flex min-w-[200px] flex-col gap-1">
              <span className="tile-label">{isToday ? "Today's progress" : fmtDay(day, { weekday: "long" })}</span>
              <span className="text-[22px] font-[650] leading-tight tracking-[-0.02em]">{prog.total === 0 ? "No plan for this day" : `${prog.left} left`}</span>
              <span className="text-[13px] text-muted">{prog.total === 0 ? (editable ? "It builds from the daily quota in a moment." : "An editor opens it to build the plan.") : `${prog.done} done${prog.skipped ? ` · ${prog.skipped} skipped` : ""} · ${prog.pct}% cleared`}</span>
            </div>
            {groups.length > 0 && (
              <div className="ml-auto grid min-w-[260px] max-w-[460px] flex-1 grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2.5">
                {groups.map((g, i) => { const p = progressOf(g.items); return (
                  <GroupBar key={g.key} i={i} label={g.label} done={p.done + p.skipped} total={p.total} />
                ); })}
              </div>
            )}
          </section>
        )}

        <DueStrip slug={ws.slug} t={t} people={due.rows} posts={duePosts.rows} />

        {prog.total === 0 && !editable ? (
          <div className="panel p-10 text-center text-[13px] text-muted">No plan for this day yet. An editor opens it to build the quota.</div>
        ) : (
          <div ref={list} data-tour="agenda" className="flex flex-col gap-4 rounded-2xl">
            {groups.map((g, gi) => { const p = progressOf(g.items); return (
              <section key={g.key} {...reveal(gi + 2)} className={`panel ${reveal(gi + 2).className}`}>
                <header className="flex items-center gap-3 px-[18px] py-3">
                  <h2 className="text-[14px] font-semibold">{g.label}</h2>
                  <span className="hidden truncate text-[12px] text-muted sm:block">{g.hint}</span>
                  <span className="ml-auto flex items-center gap-2.5">
                    <span className="hidden h-1 w-20 overflow-hidden rounded-full bg-[#ececec] sm:block"><span className="block h-full rounded-full bg-[#141414] transition-[width] duration-300" style={{ width: `${p.pct}%` }} /></span>
                    <span className="num text-[12px] text-muted">{p.done + p.skipped}/{p.total}</span>
                  </span>
                </header>
                <ul className="border-t border-line">
                  {g.items.map((it) => { const i = ordered.indexOf(it); return (
                    <Row key={it.id} it={it} i={i} slug={ws.slug} tour={it === firstOpen ? "row" : undefined} focused={i === focus} pop={justDone === it.id} editable={editable}
                      onToggle={() => { setFocus(i); toggle(it); }} onSkip={() => { setFocus(i); skip(it); }} onPatch={patch} />
                  ); })}
                </ul>
                {g.key === "other" && editable && <button onClick={addCustom} className="flex w-full items-center gap-2 border-t border-line px-[18px] py-2.5 text-left text-[13px] text-muted hover:bg-[#fafafa] hover:text-ink"><Plus size={14} /> Add a one-off task</button>}
              </section>
            ); })}
            {editable && !groups.some((g) => g.key === "other") && (
              <button onClick={addCustom} className="flex items-center gap-2 rounded-2xl border border-dashed border-line-strong px-[18px] py-3 text-left text-[13px] text-muted hover:border-ink hover:text-ink"><Plus size={14} /> Add a one-off task for this day</button>
            )}
            <p data-tour="keys" className="flex flex-wrap items-center justify-center gap-1.5 rounded-xl pb-2 text-center text-[12px] text-faint">
              <span className="kbd">J</span><span className="kbd">K</span> move <span className="mx-1.5 text-line-strong">|</span>
              <span className="kbd">X</span> done <span className="mx-1.5 text-line-strong">|</span>
              <span className="kbd">S</span> skip <span className="mx-1.5 text-line-strong">|</span>
              <span className="kbd">⌘</span><span className="kbd">K</span> jump anywhere
            </p>
          </div>
        )}
      </>)}
    </Section>
  );
}

function GroupBar({ i, label, done, total }: { i: number; label: string; done: number; total: number }) {
  const pct = total ? (done / total) * 100 : 0;
  return (
    <>
      <span className="text-[12.5px] font-medium text-ink-2">{label}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-[#ececec]">
        <span className="bar-grow block h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: done >= total ? "#141414" : "#d64545", "--i": i } as React.CSSProperties} />
      </span>
      <span className="num text-right text-[12px] text-muted">{done}/{total}</span>
    </>
  );
}

function DueStrip({ slug, t, people, posts }: { slug: string; t: string; people: Due[]; posts: DuePost[] }) {
  const cards = [
    ...people.map((p) => ({ key: p.id, due: p.next_date!, kind: "Follow up", title: `${p.name}${p.company ? `, ${p.company}` : ""}`, sub: p.next_action || p.stage, href: `/w/${slug}/pipeline?p=${p.id}` })),
    ...posts.map((p) => ({ key: p.id, due: p.publish_date!, kind: "Post", title: p.title || "Untitled post", sub: `${p.format} · ${p.status}`, href: `/w/${slug}/studio-content?tab=plan` })),
  ].sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  const overdue = cards.filter((c) => c.due < t).length;
  return (
    <section data-tour="due" {...reveal(1)} className={`panel ${reveal(1).className}`}>
      <div className="panel-head">
        <span className="flex items-center gap-2">Due and overdue{cards.length > 0 && <span className="count-badge">{cards.length}</span>}</span>
        <span className="text-[12px] font-normal text-muted">{cards.length ? `${overdue} overdue · ${cards.length - overdue} due today` : ""}</span>
      </div>
      {cards.length === 0 ? <p className="border-t border-line px-[18px] py-4 text-[13px] text-muted">Nothing due or overdue. Follow-ups and posts show here on their date.</p> : (
        <div className="flex gap-3 overflow-x-auto border-t border-line p-3 [scrollbar-width:thin]">
          {cards.map((c) => { const late = c.due < t; return (
            <Link key={c.key} href={c.href} className={`hover-lift flex w-[236px] shrink-0 flex-col gap-1 rounded-xl border bg-surface px-3.5 py-3 border-line`}>
              <span className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[.05em] text-faint">{c.kind}</span>
                <span className={`num text-[11.5px] ${late ? "font-semibold text-[#9e1c1c]" : "text-muted"}`}>{whenLabel(c.due, t)}</span>
              </span>
              <span className="truncate text-[13.5px] font-semibold">{c.title}</span>
              <span className="truncate text-[12px] text-muted">{c.sub}</span>
            </Link>
          ); })}
        </div>
      )}
    </section>
  );
}

function DaySummary({ prog, rows, isToday, slug, onNext }: { prog: ReturnType<typeof progressOf>; rows: Item[]; isToday: boolean; slug: string; onNext: () => void }) {
  const by = GROUPS.map((g) => { const items = rows.filter((r) => groupOf(r) === g.key); return { label: g.label, done: items.filter((r) => r.done).length, total: items.length }; }).filter((g) => g.total);
  return (
    <section data-tour="progress" className="reveal flex flex-wrap items-center gap-x-8 gap-y-5 rounded-2xl bg-[#141414] p-6 text-white">
      <ProgressRing pct={100} size={112} stroke={9} tone="light" label="Day complete">
        <Check size={30} strokeWidth={2.4} />
      </ProgressRing>
      <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
        <span className="text-[11.5px] font-semibold uppercase tracking-[.06em] text-[#bdbdbd]">{isToday ? "Day complete" : "This day is complete"}</span>
        <span className="text-[24px] font-[650] leading-tight tracking-[-0.02em]">{prog.done} done{prog.skipped ? `, ${prog.skipped} skipped` : ""}.</span>
        <span className="text-[13px] text-[#cfcfcf]">Every tick is already on the dashboard. Anything extra today is a bonus.</span>
        <span className="mt-2 flex flex-wrap gap-2">
          {by.map((g) => <span key={g.label} className="num inline-flex h-6 items-center gap-1.5 rounded-md bg-white/10 px-2 text-[11.5px]"><span className="font-sans font-semibold">{g.label}</span>{g.done}/{g.total}</span>)}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="h-10 rounded-lg border border-white/25 px-4 text-[13px] font-semibold hover:bg-white/10" onClick={onNext}>See the next day</button>
        <Link href={`/w/${slug}`} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#d64545] px-4 text-[13px] font-semibold text-white hover:bg-[#c43c3c]">Dashboard <ArrowUpRight size={14} /></Link>
      </div>
    </section>
  );
}

function Row({ it, i, slug, tour, focused, pop, editable, onToggle, onSkip, onPatch }: { it: Item; i: number; slug: string; tour?: string; focused: boolean; pop: boolean; editable: boolean; onToggle: () => void; onSkip: () => void; onPatch: (id: string, p: Partial<Item>) => void }) {
  const [title, setTitle] = useState(it.title);
  const [link, setLink] = useState(it.link);
  useEffect(() => { setTitle(it.title); setLink(it.link); }, [it.title, it.link]);
  const skipped = !it.done && isSkipped(it.note);
  const cleared = it.done || skipped;
  const kind = KINDS.find((k) => k.key === it.kind);
  const placeholder = it.kind === "custom" ? "What needs doing" : `${kind ? kind.unit[0].toUpperCase() + kind.unit.slice(1) : "Task"} ${it.idx}: who or what`;
  const act = primaryAction(it, slug);
  return (
    <li data-i={i} data-tour={tour} className={`group relative flex items-center gap-3 border-b border-line px-[18px] py-2.5 last:border-b-0 transition-colors ${focused ? "bg-[#fafafa]" : "hover:bg-[#fcfcfc]"} ${pop ? "anim-flash" : ""}`}>
      {focused && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-[#d64545]" aria-hidden="true" />}
      <button disabled={!editable} onClick={onToggle} aria-label={it.done ? "Mark not done" : "Mark done"}
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border-[1.5px] transition-all duration-150 active:scale-90 ${it.done ? "border-[#141414] bg-[#141414] text-white" : "border-line-strong bg-surface hover:border-[#141414]"}`}>
        {it.done && <Check size={13} strokeWidth={3} className={pop ? "anim-pop" : ""} />}
      </button>
      <span className={`hidden w-[88px] shrink-0 truncate text-[11px] font-semibold uppercase tracking-[.05em] sm:block ${cleared ? "text-faint" : "text-muted"}`}>{typeLabel(it)}</span>
      <input id={`t-${it.id}`} disabled={!editable} value={title} placeholder={placeholder} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== it.title && onPatch(it.id, { title })}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} aria-label="Who or what"
        className={`min-w-0 flex-1 bg-transparent text-[13.5px] outline-none transition-colors placeholder:text-faint ${it.done ? "text-muted line-through decoration-faint" : skipped ? "text-faint" : ""}`} />
      {skipped && <span className="count-badge muted shrink-0">Skipped</span>}
      <div className="hidden w-[30%] max-w-[300px] items-center gap-1.5 text-faint md:flex">
        <Link2 size={13} className="shrink-0" />
        <input id={`l-${it.id}`} disabled={!editable} value={link} placeholder="Paste link" onChange={(e) => setLink(e.target.value)} onBlur={() => link !== it.link && onPatch(it.id, { link })} aria-label="Link"
          className="min-w-0 flex-1 bg-transparent text-[12px] text-ink-2 outline-none placeholder:text-faint" />
      </div>
      {/* Fixed-width action slots so every row lines up, whatever it offers. */}
      <span className="flex shrink-0 items-center justify-end sm:w-[150px]">
        {act && !cleared && (act.external
          ? <a href={act.href} target="_blank" rel="noopener noreferrer" className="btn h-8 whitespace-nowrap px-2.5 text-[12.5px]">{act.label}<ArrowUpRight size={13} /></a>
          : <Link href={act.href} className="btn h-8 whitespace-nowrap px-2.5 text-[12.5px]">{act.label}<ChevronRight size={13} /></Link>)}
      </span>
      <span className="flex shrink-0 items-center justify-end gap-0.5 sm:w-[112px]">
        {editable && !it.done && (
          <button type="button" onClick={onSkip} className={`btn btn-ghost h-8 px-2 text-[12.5px] ${skipped || focused ? "" : "sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"}`}>{skipped ? "Undo skip" : "Skip"}</button>
        )}
        {it.kind === "custom" && editable && (
          <button className="btn btn-ghost h-8 px-2 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100" aria-label="Delete task" onClick={() => supabase().from("daily_items").delete().eq("id", it.id)}><Trash2 size={14} /></button>
        )}
      </span>
    </li>
  );
}

function Skeleton() {
  return <div className="flex flex-col gap-4" aria-busy="true">{[132, 96, 220, 180].map((h, k) => <div key={k} className="animate-pulse rounded-2xl bg-[#ececec]" style={{ height: h }} />)}</div>;
}
