"use client";
// The Monday review (I2): a calm page to read last week and decide the next one. Three sentences, what worked, what
// did not, who moved, then Keep, Change and Stop, and next week's plan with checkboxes. The page loads the rows and
// saves through `api`; this only shows the review and holds the edits until Save.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X, ArrowUpRight } from "lucide-react";
import { Section, type TourStep } from "@/components/shell";
import { useToast, haptic } from "@/components/toaster";
import { weekRange } from "@/lib/weekly";
import { mergePlan, type PlanItem, type Review } from "@/lib/review";

export type SavedReview = { keep: string; change: string; stop: string; plan: PlanItem[]; summary: string; saved_at: string };
export type ReviewApi = {
  save: (v: { keep: string; change: string; stop: string; plan: PlanItem[]; summary: string }) => Promise<string | null>;
  /** Ticks on the plan made for this week (in the previous week's review), saved on that review straight away. */
  tickLast: (plan: PlanItem[]) => Promise<string | null>;
};

const tour: TourStep[] = [
  { target: "header", title: "What the Monday review is for", body: "Ten quiet minutes on Monday: read how last week went, decide what to keep, change and stop, and set next week's plan." },
  { target: "review-read", title: "Read first", body: "Last week in three sentences, then what worked, what did not and who moved. The numbers stay on the Dashboard and the weekly report." },
  { target: "review-kcs", title: "Keep, Change, Stop", body: "A line or two each. They are saved with the week, so next Monday can look back at them." },
  { target: "review-plan", title: "Next week's plan", body: "Prefilled from posts planned in Content Studio, follow-ups due in Pipeline and the active strategy. Untick what you will not do, add your own, tick items off during the week." },
  { target: "review-save", title: "Save", body: "Saves this week's review. Past reviews stay below and open again from there." },
];

const savedAt = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function ReviewScreen({ week, review, loading, saved, last, past, base, canEdit, missing, onWeek, canNext, api }: {
  week: string; review: Review | null; loading: boolean; saved: SavedReview | null; last: { week: string; plan: PlanItem[] } | null;
  past: { week: string; saved_at: string }[]; base: string; canEdit: boolean; missing: boolean; onWeek: (dir: -1 | 1) => void; canNext: boolean; api: ReviewApi;
}) {
  const toast = useToast();
  const [keep, setKeep] = useState(""), [change, setChange] = useState(""), [stop, setStop] = useState("");
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [lastPlan, setLastPlan] = useState<PlanItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState("");
  const addRef = useRef<HTMLInputElement>(null);

  // A new week, or its rows arriving, resets the form from what was saved, else from the fresh review.
  const seed = `${week}|${saved?.saved_at ?? ""}|${review ? "r" : ""}`;
  useEffect(() => {
    if (!review) return;
    setKeep(saved?.keep ?? ""); setChange(saved?.change ?? ""); setStop(saved?.stop ?? "");
    setPlan(mergePlan(saved?.plan, review.plan)); setDirty(false);
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setLastPlan(last?.plan ?? []); }, [last]);

  // Leaving with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const editable = canEdit && !missing;
  const summary = saved?.summary || review?.sentences.join(" ") || "";
  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); };

  async function save() {
    if (!editable || busy) return;
    setBusy(true);
    const err = await api.save({ keep: keep.trim(), change: change.trim(), stop: stop.trim(), plan, summary: review?.sentences.join(" ") ?? summary });
    setBusy(false);
    if (err) return toast(`Could not save the review. ${err}`, undefined, { info: true });
    haptic(10); setDirty(false); toast(saved ? "Review updated" : "Review saved");
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const tick = (id: string) => touch(setPlan)(plan.map((p) => (p.id === id ? { ...p, done: !p.done } : p)));
  const remove = (it: PlanItem) => {
    const before = plan;
    touch(setPlan)(plan.filter((p) => p.id !== it.id));
    toast("Removed from the plan", () => { setPlan(before); });
  };
  const add = () => {
    const text = adding.trim();
    if (!text) return addRef.current?.focus();
    touch(setPlan)([...plan, { id: `added:${Date.now().toString(36)}`, text: text.slice(0, 300), source: "Added", done: false }]);
    setAdding(""); addRef.current?.focus();
  };
  async function tickLast(id: string) {
    if (!editable) return;
    const before = lastPlan;
    const next = lastPlan.map((p) => (p.id === id ? { ...p, done: !p.done } : p));
    setLastPlan(next);
    const err = await api.tickLast(next);
    if (err) { setLastPlan(before); toast(`Could not save the tick. ${err}`, undefined, { info: true }); }
  }

  const doneCount = plan.filter((p) => p.done).length;
  const status = loading ? "Loading last week." : `${weekRange(week)}. ${saved ? `Saved ${savedAt(saved.saved_at)}${dirty ? ", with changes not saved yet" : ""}.` : "Not saved yet."}`;
  const range = weekRange(week);
  const pastOther = useMemo(() => past.filter((p) => p.week !== week), [past, week]);

  return (
    <Section id="review" title="Monday review" status={status} steps={tour}
      before={
        <span className="flex items-center gap-1">
          <button type="button" className="btn h-10 w-10 p-0" aria-label="Previous week" onClick={() => onWeek(-1)}><ChevronLeft size={16} /></button>
          <button type="button" className="btn h-10 w-10 p-0" aria-label="Next week" disabled={!canNext} onClick={() => onWeek(1)}><ChevronRight size={16} /></button>
        </span>
      }
      actions={<Link href={`${base}/weekly?week=${week}`} className="btn h-10 px-3.5">Weekly report</Link>}
      primary={<button type="button" data-tour="review-save" className="btn btn-primary h-10 px-4" disabled={!editable || busy || (!dirty && !!saved) || !review} onClick={save}>
        {busy ? "Saving" : saved ? (dirty ? "Save changes" : "Saved") : "Save review"}</button>}>
      {missing && <p className="mx-auto w-full max-w-[880px] rounded-xl border border-line bg-surface px-4 py-3 text-body text-muted">Reviews can be read but not saved yet: the database update for reviews (db/027) has not been run.</p>}
      {loading || !review ? <Skeleton /> : (<>
        <article className="panel mx-auto w-full max-w-[880px]">
          <div data-tour="review-read" className="px-6 pb-6 pt-7 md:px-10 md:pt-9">
            <p className="text-meta font-medium text-muted">Last week, {range}</p>
            <p className="mt-2 max-w-[680px] text-title leading-[1.6] text-ink">{saved?.summary || review.sentences.join(" ")}</p>
          </div>
          <div className="flex flex-col border-t border-line px-6 md:px-10">
            {last && lastPlan.length > 0 && (
              <Part title="Planned for the week" line={`${lastPlan.filter((p) => p.done).length} of ${lastPlan.length} ticked off, from the review the Monday before. Ticks save on that review.`}>
                <Checklist items={lastPlan} onTick={tickLast} disabled={!editable} />
              </Part>
            )}
            <Part title="What worked" line={review.worked.length ? undefined : "Nothing stood out yet. Results added to posts in Content Studio and replies read with Check replies show here."}>
              {review.worked.length > 0 && <Bullets items={review.worked} tone="ink" />}
            </Part>
            <Part title="What did not" line={review.didnt.length ? undefined : "Nothing slipped."}>
              {review.didnt.length > 0 && <Bullets items={review.didnt} tone="red" />}
            </Part>
            <Part title="Who moved" line={review.moves.length ? undefined : "Nobody moved stage."} link={[`${base}/pipeline`, "Pipeline"]}>
              {review.moves.length > 0 && (
                <table className="w-full text-left text-body">
                  <thead className="sr-only"><tr><th>Person</th><th>Move</th></tr></thead>
                  <tbody>{review.moves.slice(0, 8).map((m) => (
                    <tr key={m.name + m.at} className="border-t border-line first:border-t-0">
                      <td className="py-2 pr-3 align-top"><span className="font-medium">{m.name}</span>{m.company && <span className="block text-meta text-muted sm:inline sm:text-body"><span className="hidden sm:inline">, </span>{m.company}</span>}</td>
                      <td className="py-2 text-right align-top text-meta text-muted"><span className="whitespace-nowrap">{m.from || "New"} to</span> <span className="whitespace-nowrap font-semibold text-ink">{m.to}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </Part>
            <Part title="Keep, Change, Stop" tour="review-kcs">
              <div className="grid gap-4 md:grid-cols-3">
                <Note label="Keep" hint="What to keep doing" value={keep} onChange={touch(setKeep)} disabled={!editable} />
                <Note label="Change" hint="What to do differently" value={change} onChange={touch(setChange)} disabled={!editable} />
                <Note label="Stop" hint="What to stop doing" value={stop} onChange={touch(setStop)} disabled={!editable} />
              </div>
            </Part>
            <Part title="Next week" tour="review-plan" last
              line={plan.length ? `${plan.length} ${plan.length === 1 ? "item" : "items"}${doneCount ? `, ${doneCount} done` : ""}. From the plan in Content Studio, Pipeline follow-ups and the active strategy.` : "Nothing planned yet. Add what matters most next week."}>
              {plan.length > 0 && <Checklist items={plan} onTick={tick} onRemove={editable ? remove : undefined} disabled={!editable} />}
              {editable && (
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
                  <label htmlFor="review-add" className="sr-only">Add to next week&apos;s plan</label>
                  <input id="review-add" ref={addRef} className="field h-10 min-w-0 flex-1" placeholder="Add to next week's plan" value={adding} onChange={(e) => setAdding(e.target.value)} maxLength={300} />
                  <button type="submit" className="btn h-10 shrink-0 px-3.5"><Plus size={15} />Add</button>
                </form>
              )}
            </Part>
          </div>
        </article>
        {pastOther.length > 0 && (
          <section className="panel mx-auto w-full max-w-[880px]">
            <div className="panel-head"><span>Past reviews</span></div>
            <ul className="border-t border-line">
              {pastOther.slice(0, 12).map((p) => (
                <li key={p.week} className="border-t border-line first:border-t-0">
                  <Link href={`${base}/review?week=${p.week}`} className="row-hit group">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-body font-semibold">{weekRange(p.week)}</span><span className="text-meta text-muted">Saved {savedAt(p.saved_at)}</span></span>
                    <ChevronRight size={15} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </>)}
    </Section>
  );
}

function Part({ title, line, link, children, tour, last }: { title: string; line?: string; link?: [string, string]; children?: React.ReactNode; tour?: string; last?: boolean }) {
  return (
    <section data-tour={tour} className={`grid gap-2 py-6 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8 ${last ? "" : "border-b border-line"}`}>
      <h2 className="text-body font-semibold">{title}</h2>
      <div className="flex min-w-0 flex-col gap-3">
        {line && <p className="max-w-[600px] text-body leading-[1.65] text-ink-2">{line}</p>}
        {children}
        {link && <Link href={link[0]} className="w-fit text-meta font-medium text-muted underline decoration-line-strong underline-offset-[3px] hover:text-ink hover:decoration-ink">Open {link[1]}</Link>}
      </div>
    </section>
  );
}

function Bullets({ items, tone }: { items: string[]; tone: "ink" | "red" }) {
  return (
    <ul className="flex list-none flex-col gap-2 p-0">
      {items.map((t) => (
        <li key={t} className="flex gap-3 text-body leading-[1.6] text-ink-2">
          <span className={`mt-[9px] h-[6px] w-[6px] shrink-0 rounded-full ${tone === "ink" ? "bg-ink" : "border-[1.5px] border-dark-red"}`} aria-hidden="true" />
          <span className="min-w-0">{t}</span>
        </li>
      ))}
    </ul>
  );
}

function Note({ label, hint, value, onChange, disabled }: { label: string; hint: string; value: string; onChange: (v: string) => void; disabled: boolean }) {
  const id = `review-${label.toLowerCase()}`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-meta font-semibold text-ink">{label}</label>
      <textarea id={id} className="field min-h-[112px] resize-y py-2 leading-[1.55]" placeholder={hint} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} maxLength={2000} />
    </div>
  );
}

function Checklist({ items, onTick, onRemove, disabled }: { items: PlanItem[]; onTick: (id: string) => void; onRemove?: (it: PlanItem) => void; disabled: boolean }) {
  return (
    <ul className="flex list-none flex-col p-0">
      {items.map((it) => (
        <li key={it.id} className="group flex items-start gap-3 border-t border-line py-2.5 first:border-t-0">
          <input id={`plan-${it.id}`} type="checkbox" className="mt-[3px] h-4 w-4 shrink-0 cursor-pointer accent-[#141414]" checked={it.done} disabled={disabled} onChange={() => onTick(it.id)} />
          <label htmlFor={`plan-${it.id}`} className="min-w-0 flex-1 cursor-pointer text-body leading-[1.5]">
            <span className={it.done ? "text-muted line-through decoration-line-strong" : "text-ink"}>{it.text}</span>
            <span className="ml-2 inline-block whitespace-nowrap text-meta text-muted">{it.source}</span>
          </label>
          {it.href ? <Link href={it.href} className="btn btn-quiet h-7 w-7 shrink-0 p-0" aria-label={`Open: ${it.text}`}><ArrowUpRight size={14} /></Link> : <span className="w-7 shrink-0" aria-hidden="true" />}
          {onRemove && <button type="button" className="btn btn-quiet h-7 w-7 shrink-0 p-0" aria-label={`Remove: ${it.text}`} onClick={() => onRemove(it)}><X size={14} /></button>}
        </li>
      ))}
    </ul>
  );
}

function Skeleton() {
  return (
    <div className="panel mx-auto flex w-full max-w-[880px] flex-col gap-4 p-8" aria-busy="true">
      <span className="h-3 w-40 animate-pulse rounded bg-track" /><span className="h-4 w-11/12 animate-pulse rounded bg-track" /><span className="h-4 w-3/4 animate-pulse rounded bg-track" />
      <span className="mt-4 h-24 w-full animate-pulse rounded bg-track" />
    </div>
  );
}
