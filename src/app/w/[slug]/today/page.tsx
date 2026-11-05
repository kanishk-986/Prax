"use client";
// Today: the day as a focused agenda. Progress, what is due or overdue, then the plan grouped in a fixed order
// (Comment, Post, Follow up, Connect, Other). Each row has one action, Done and Skip. J and K move, X ticks, S skips.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Check, Link2, Trash2, ArrowUpRight } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useWorkspace, today, addDays, fmtDay, isWeekday, KINDS } from "@/lib/workspace";
import { Section, ProgressRing, CountUp, reveal, useFlip, type TourStep } from "@/components/shell";
import { useToast, haptic } from "@/components/toaster";
import { agenda, progressOf, isSkipped, skipNote, unskipNote, typeLabel, primaryAction, whenLabel, settleOrder, GROUPS, groupOf } from "@/lib/dashboard";

const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
/** What a task type means, shown when hovering or focusing its type label. */
const hintFor = (it: { kind: string; idx: number }) => KINDS.find((k) => k.key === it.kind)?.hint ?? GROUPS.find((g) => g.key === groupOf(it))?.hint ?? "";
const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");

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

  // A cleared row holds its place for a moment (the tick shows), then settles below the open ones.
  const [holding, setHolding] = useState<Set<string>>(new Set());
  const hold = useCallback((id: string) => {
    setHolding((h) => new Set(h).add(id));
    setTimeout(() => setHolding((h) => { const n = new Set(h); n.delete(id); return n; }), 420);
  }, []);
  const groups = useMemo(() => agenda(rows).map((g) => ({ ...g, items: settleOrder(g.items, holding) })), [rows, holding]);
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
    if (next) { setJustDone(it.id); if (!isSkipped(it.note)) hold(it.id); }
    // Ticking a skipped item clears the skip, so the note goes back to what it was.
    patch(it.id, isSkipped(it.note) ? { done: next, note: unskipNote(it.note) } : { done: next });
    if (next) toast(`${typeLabel(it)} done`, () => patch(it.id, { done: false, note: it.note }));
  }, [editable, patch, toast, hold]);

  const skip = useCallback((it: Item) => {
    if (!editable || it.done) return;
    if (isSkipped(it.note)) { patch(it.id, { note: unskipNote(it.note) }); return; }
    haptic(4);
    hold(it.id);
    patch(it.id, { note: skipNote(it.note) });
    toast(`${typeLabel(it)} skipped`, () => patch(it.id, { note: it.note }));
  }, [editable, patch, toast, hold]);

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
  useEffect(() => { list.current?.querySelector(`[data-i="${focus}"]`)?.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" }); }, [focus]);
  useFlip(list);
  const jumpTo = (key: string) => {
    const g = groups.find((x) => x.key === key);
    const first = g?.items.find((r) => !r.done && !isSkipped(r.note)) ?? g?.items[0];
    if (first) setFocus(ordered.indexOf(first));
    document.getElementById(`group-${key}`)?.scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" });
  };

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
              <span className="num text-[30px] font-semibold tracking-[-0.03em]"><CountUp value={prog.done} live /></span>
              <span className="mt-1 text-[11.5px] text-muted">of {prog.total} done</span>
            </ProgressRing>
            <div className="flex min-w-[200px] flex-col gap-1">
              <span className="tile-label">{isToday ? "Today's progress" : fmtDay(day, { weekday: "long" })}</span>
              <span className="text-[22px] font-[650] leading-tight tracking-[-0.02em]">{prog.total === 0 ? "No plan for this day" : <><span className="num"><CountUp value={prog.left} live /></span> left</>}</span>
              <span className="text-[13px] text-muted">{prog.total === 0 ? (editable ? "It builds from the daily quota in a moment." : "An editor opens it to build the plan.") : `${prog.done} done${prog.skipped ? ` · ${prog.skipped} skipped` : ""} · ${prog.pct}% cleared`}</span>
            </div>
            {groups.length > 0 && (
              <div className="ml-auto flex w-full min-w-[240px] max-w-[460px] flex-1 flex-col">
                {groups.map((g, i) => { const p = progressOf(g.items); return (
                  <GroupBar key={g.key} i={i} label={g.label} done={p.done} skipped={p.skipped} total={p.total} onJump={() => jumpTo(g.key)} />
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
              <section key={g.key} id={`group-${g.key}`} {...reveal(gi + 2)} className={`panel scroll-mt-6 ${reveal(gi + 2).className}`}>
                <header className="flex items-center gap-3 px-[18px] py-3">
                  <h2 className="text-[14px] font-semibold">{g.label}</h2>
                  <span className="hidden truncate text-[12px] text-muted sm:block">{g.hint}</span>
                  <span className="ml-auto flex items-center gap-2.5">
                    <span className="hidden h-1 w-20 overflow-hidden rounded-full bg-[#ececec] sm:block"><span className="block h-full rounded-full transition-[width,background-color] duration-[400ms] ease-[cubic-bezier(.2,.8,.2,1)]" style={{ width: `${p.pct}%`, background: p.left ? "#d64545" : "#141414" }} /></span>
                    <span className="num text-[12px] text-muted"><CountUp value={p.done + p.skipped} live />/{p.total}</span>
                  </span>
                </header>
                <ul className="border-t border-line">
                  {g.items.map((it) => { const i = ordered.indexOf(it); return (
                    <Row key={it.id} it={it} i={i} slug={ws.slug} tour={it === firstOpen ? "row" : undefined} focused={i === focus} pop={justDone === it.id} editable={editable}
                      onToggle={() => { setFocus(i); toggle(it); }} onSkip={() => { setFocus(i); skip(it); }} onPatch={patch} onFocusRow={() => setFocus(i)} />
                  ); })}
                </ul>
                {g.key === "other" && editable && <button onClick={addCustom} className="flex w-full items-center gap-2 border-t border-line px-[18px] py-2.5 text-left text-[13px] text-muted hover:bg-[#fafafa] hover:text-ink"><Plus size={14} /> Add a one-off task</button>}
              </section>
            ); })}
            {editable && !groups.some((g) => g.key === "other") && (
              <button onClick={addCustom} className="flex items-center gap-2 rounded-2xl border border-dashed border-line-strong px-[18px] py-3 text-left text-[13px] text-muted hover:border-ink hover:text-ink"><Plus size={14} /> Add a one-off task for this day</button>
            )}
            <p data-tour="keys" className="hidden flex-wrap items-center justify-center gap-1.5 rounded-xl pb-2 sm:flex text-center text-[12px] text-faint">
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

/** One group's bar: done in red (dark when the group is clear), skipped as a lighter segment. Hover shows
 *  what is left; click jumps to the group and puts the keyboard on its first open task. */
function GroupBar({ i, label, done, skipped, total, onJump }: { i: number; label: string; done: number; skipped: number; total: number; onJump: () => void }) {
  const clear = done + skipped >= total;
  const left = total - done - skipped;
  return (
    <button type="button" onClick={onJump} className="group-bar group grid grid-cols-[84px_1fr_72px] items-center gap-3 rounded-lg px-2 py-[5px] text-left" aria-label={`${label}: ${done} done, ${skipped} skipped, ${left} left. Jump to ${label}`}>
      <span className="truncate text-[12.5px] font-medium text-ink-2 transition-colors group-hover:text-ink">{label}</span>
      <span className="flex h-1.5 overflow-hidden rounded-full bg-[#ececec] transition-[height] duration-200 group-hover:h-2">
        <span className="bar-grow block h-full transition-[width] duration-[400ms] ease-[cubic-bezier(.2,.8,.2,1)]" style={{ width: `${total ? (done / total) * 100 : 0}%`, background: clear ? "#141414" : "#d64545", "--i": i } as React.CSSProperties} />
        <span className="bar-grow block h-full transition-[width] duration-[400ms] ease-[cubic-bezier(.2,.8,.2,1)]" style={{ width: `${total ? (skipped / total) * 100 : 0}%`, background: clear ? "#8c8c8c" : "#c4c4c4", "--i": i } as React.CSSProperties} />
      </span>
      <span className="relative h-4 text-right text-[12px]">
        <span className="num absolute inset-0 text-muted transition-[opacity,transform] duration-200 group-hover:-translate-y-1 group-hover:opacity-0 group-focus-visible:-translate-y-1 group-focus-visible:opacity-0">{done + skipped}/{total}</span>
        <span className="absolute inset-0 translate-y-1 whitespace-nowrap font-semibold text-ink opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">{clear ? "Clear" : `${left} left`}</span>
      </span>
    </button>
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
        <span className="flex items-center gap-2 whitespace-nowrap">Due and overdue{cards.length > 0 && <span className="count-badge">{cards.length}</span>}</span>
        <span className="hidden whitespace-nowrap text-[12px] font-normal text-muted sm:inline">{cards.length ? `${overdue} overdue · ${cards.length - overdue} due today` : ""}</span>
      </div>
      {cards.length === 0 ? <p className="border-t border-line px-[18px] py-4 text-[13px] text-muted">Nothing due or overdue. Follow-ups and posts show here on their date.</p> : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 border-t border-line p-3">
          {cards.map((c) => { const late = c.due < t; return (
            <Link key={c.key} href={c.href} className="hover-lift flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-surface px-3.5 py-3">
              <span className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[.05em] text-faint">{c.kind}</span>
                <span className={`num text-[11.5px] ${late ? "font-semibold text-[#9e1c1c]" : "text-muted"}`}>{whenLabel(c.due, t)}</span>
              </span>
              <span className="line-clamp-2 text-[13.5px] font-semibold leading-snug">{c.title}</span>
              <span className="line-clamp-2 text-[12px] text-muted">{c.sub}</span>
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

function Row({ it, i, slug, tour, focused, pop, editable, onToggle, onSkip, onPatch, onFocusRow }: { it: Item; i: number; slug: string; tour?: string; focused: boolean; pop: boolean; editable: boolean; onToggle: () => void; onSkip: () => void; onPatch: (id: string, p: Partial<Item>) => void; onFocusRow: () => void }) {
  const [title, setTitle] = useState(it.title);
  const [link, setLink] = useState(it.link);
  useEffect(() => { setTitle(it.title); setLink(it.link); }, [it.title, it.link]);
  const skipped = !it.done && isSkipped(it.note);
  const cleared = it.done || skipped;
  const kind = KINDS.find((k) => k.key === it.kind);
  const placeholder = it.kind === "custom" ? "What needs doing" : `${kind ? kind.unit[0].toUpperCase() + kind.unit.slice(1) : "Task"} ${it.idx}: who or what`;
  const act = primaryAction(it, slug);
  const hint = hintFor(it);
  const hasActions = (act && !cleared) || (editable && !it.done) || (it.kind === "custom" && editable) || it.done;
  return (
    <li data-i={i} data-flip={it.id} data-tour={tour} onFocusCapture={onFocusRow} aria-current={focused ? "true" : undefined}
      className={`task-row group relative flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-[18px] py-2.5 last:border-b-0 sm:flex-nowrap ${focused ? "is-focused" : ""} ${cleared ? "is-cleared" : ""} ${pop ? "anim-flash" : ""}`}>
      <span className="task-rail" aria-hidden="true" />
      <button disabled={!editable} onClick={onToggle} aria-label={it.done ? "Mark not done" : "Mark done"} aria-pressed={it.done}
        className={`task-check grid h-5 w-5 shrink-0 place-items-center rounded-md border-[1.5px] ${it.done ? "is-done border-[#141414] bg-[#141414] text-white" : "border-line-strong bg-surface"}`}>
        <Check size={13} strokeWidth={3} className={`task-tick ${it.done ? "on" : ""}`} />
      </button>
      <span tabIndex={hint ? 0 : undefined} data-tip={hint || undefined} className={`tip hidden w-[88px] shrink-0 truncate rounded text-[11px] font-semibold uppercase tracking-[.05em] transition-colors sm:block ${cleared ? "text-faint" : "text-muted group-hover:text-ink"}`}>{typeLabel(it)}</span>
      <span className="relative flex min-w-0 flex-1 basis-[calc(100%-32px)] items-center sm:basis-auto">
        {/* A one-line textarea that grows with its text (field-sizing), so long campaign titles wrap instead of being cut off. */}
        <textarea id={`t-${it.id}`} rows={1} disabled={!editable} value={title} placeholder={placeholder} onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))} onBlur={() => title !== it.title && onPatch(it.id, { title })}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }} aria-label="Who or what"
          className={`task-title min-w-0 flex-1 resize-none rounded-md bg-transparent px-1 py-0.5 text-[13.5px] leading-snug outline-none [field-sizing:content] placeholder:text-faint ${it.done ? "is-done" : skipped ? "text-faint" : ""}`} />
      </span>
      {skipped && <span className="hidden sm:contents"><span className="count-badge muted shrink-0 whitespace-nowrap">Skipped</span></span>}
      <div className="hidden w-[30%] max-w-[300px] items-center gap-1.5 text-faint md:flex">
        <Link2 size={13} className="shrink-0" />
        <input id={`l-${it.id}`} disabled={!editable} value={link} placeholder="Paste link" onChange={(e) => setLink(e.target.value)} onBlur={() => link !== it.link && onPatch(it.id, { link })} aria-label="Link"
          className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-[12px] text-ink-2 outline-none placeholder:text-faint focus-visible:bg-[#f3f3f3]" />
      </div>
      {/* On phones the type and buttons sit on a second line; from sm up, fixed-width slots keep every row aligned. */}
      {hasActions && (
        <span className="flex w-full items-center gap-1 pl-8 sm:contents">
          <span className="mr-auto whitespace-nowrap text-[11px] font-semibold uppercase tracking-[.05em] text-faint sm:hidden">{typeLabel(it)}{skipped ? " · Skipped" : ""}</span>
          <span className="flex shrink-0 items-center justify-end sm:w-[150px]">
            {act && !cleared && (act.external
              ? <a href={act.href} target="_blank" rel="noopener noreferrer" className="btn task-act h-8 whitespace-nowrap px-2.5 text-[12.5px]">{act.label.startsWith("Open ") ? <><span className="hidden sm:inline">Open</span>{act.label.slice(5)}</> : act.label}<ArrowUpRight size={13} /></a>
              : <Link href={act.href} className="btn task-act h-8 whitespace-nowrap px-2.5 text-[12.5px]">{act.label}<ChevronRight size={13} /></Link>)}
            {it.done && <span className="num whitespace-nowrap text-[11.5px] text-faint">{it.done_at ? `Done ${clock(it.done_at)}` : "Done"}</span>}
          </span>
          <span className="flex shrink-0 items-center justify-end gap-0.5 sm:w-[112px]">
            {editable && !it.done && (
              <button type="button" onClick={onSkip} className={`btn btn-ghost h-8 whitespace-nowrap px-2 text-[12.5px] ${skipped || focused ? "" : "sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"}`}>{skipped ? "Undo skip" : "Skip"}</button>
            )}
            {it.kind === "custom" && editable && (
              <button className="btn btn-ghost h-8 px-2 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100" aria-label="Delete task" onClick={() => supabase().from("daily_items").delete().eq("id", it.id)}><Trash2 size={14} /></button>
            )}
          </span>
        </span>
      )}
    </li>
  );
}


function Skeleton() {
  return <div className="flex flex-col gap-4" aria-busy="true">{[132, 96, 220, 180].map((h, k) => <div key={k} className="animate-pulse rounded-2xl bg-[#ececec]" style={{ height: h }} />)}</div>;
}
