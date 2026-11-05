"use client";
// The section shell every Prax area uses: an entry moment, a plain header, underline tabs, a guided tour,
// and the Home building blocks. Patterns match the approved Content Studio and AI citations designs.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { shouldPlayIntro, markIntro, shouldAutoTour, markTourSeen, moveTour, tourLabel, tourPercent, type TourState, type TourAction } from "@/lib/shell";

const safe = (pick: () => Storage) => { try { return pick(); } catch { return null; } };
const reducedMotion = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

// ---------- entry moment ----------
/** Blurred veil with the Prax mark, the section name and a live status line. Once per section per session. */
export function EntryMoment({ section, title, status, onDone }: { section: string; title: string; status?: string; onDone?: () => void }) {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);
  const started = useRef(false);
  const leave = useCallback(() => {
    if (done.current) return;
    done.current = true; setLeaving(true);
    setTimeout(() => { setShow(false); onDone?.(); }, 450);
  }, [onDone]);
  useEffect(() => {
    const ss = safe(() => window.sessionStorage);
    // started survives the double effect run of React strict mode, so the veil never sticks.
    if (!started.current) {
      if (!shouldPlayIntro(ss, section, reducedMotion())) { done.current = true; onDone?.(); return; }
      markIntro(ss, section); started.current = true; setShow(true);
    }
    if (done.current) return;
    const t = setTimeout(leave, 2300);
    const k = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === "Escape") leave(); };
    window.addEventListener("keydown", k);
    return () => { clearTimeout(t); window.removeEventListener("keydown", k); };
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!show) return null;
  return (
    <div className={`entry${leaving ? " leaving" : ""}`} onClick={leave} role="dialog" aria-label={`${title} opening`}>
      <div className="flex flex-col items-center gap-[18px] text-center">
        <svg className="mark" width="64" height="64" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="6" fill="#141414" /><rect x="6.5" y="7.5" width="8" height="3" rx="1.5" fill="#ffffff" /><rect x="9.5" y="13.5" width="8" height="3" rx="1.5" fill="#d64545" /></svg>
        <span className="l1 text-[34px] font-[650] tracking-[-0.03em] text-[#141414]">{title}</span>
        {status && <span className="l2 max-w-[460px] text-[15px] leading-relaxed text-[#5f5f5f]">{status}</span>}
        <span className="l3 mt-1.5 flex flex-col items-center gap-3">
          <button type="button" className="btn btn-primary h-11 px-6 text-[14.5px]" onClick={(e) => { e.stopPropagation(); leave(); }}>Enter</button>
          <span className="h-[2px] w-[140px] overflow-hidden rounded-sm bg-[#e3e3e3]"><span className="bar block h-full w-full bg-[#141414]" /></span>
          <span className="text-[12px] text-[#8c8c8c]">or press Enter</span>
        </span>
      </div>
    </div>
  );
}

// ---------- guided tour ----------
export type TourStep = { target: string; title: string; body: string; tab?: string };

/** Blurs the page, raises the element marked data-tour={target} above the blur, and scrolls it into view. */
export function useTour(section: string, steps: TourStep[], onTab?: (tab: string) => void) {
  const { userId } = useWorkspace();
  const [s, setS] = useState<TourState>({ index: null, done: [] });
  const go = useCallback((next: TourState) => {
    setS(next);
    if (next.index == null) markTourSeen(safe(() => window.localStorage), section, userId);
    else { const st = steps[next.index]; if (st?.tab) onTab?.(st.tab); }
  }, [section, userId, steps, onTab]);
  const start = useCallback(() => go({ index: 0, done: [] }), [go]);
  const act = (a: TourAction) => go(moveTour(s, a, steps.length));
  const autoStart = useCallback(() => { if (steps.length && shouldAutoTour(safe(() => window.localStorage), section, userId)) start(); }, [steps.length, section, userId, start]);

  useEffect(() => {
    document.querySelectorAll("[data-tour-active]").forEach((el) => el.removeAttribute("data-tour-active"));
    if (s.index == null) { document.body.classList.remove("touring"); return; }
    document.body.classList.add("touring");
    const target = steps[s.index]?.target;
    const t = setTimeout(() => {
      const el = target ? document.querySelector(`[data-tour="${target}"]`) : null;
      if (el) { el.setAttribute("data-tour-active", ""); el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" }); }
    }, 60);
    return () => clearTimeout(t);
  }, [s.index, steps]);
  useEffect(() => () => { document.body.classList.remove("touring"); document.querySelectorAll("[data-tour-active]").forEach((el) => el.removeAttribute("data-tour-active")); }, []);
  useEffect(() => {
    if (s.index == null) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") go(moveTour(s, "end", steps.length)); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [s, steps.length, go]);

  const step = s.index != null ? steps[s.index] : null;
  const node = step ? (
    <>
      <div className="tour-veil" aria-hidden="true" />
      <div className="tour-card anim-rise" role="dialog" aria-label="Guided tour">
        <span className="flex items-center justify-between gap-2.5"><span className="text-[12px] font-semibold text-[#ff8a80]">{tourLabel(s, steps.length)}</span>
          <button type="button" onClick={() => act("end")} className="text-[12.5px] font-semibold text-[#cfcfcf] hover:text-white">Skip tour</button></span>
        <span className="h-1 overflow-hidden rounded-full bg-white/15"><span className="block h-full bg-[#d64545] transition-[width] duration-200" style={{ width: `${tourPercent(s, steps.length)}%` }} /></span>
        <span className="text-[16px] font-[650] leading-snug">{step.title}</span>
        <span className="text-[13px] leading-relaxed text-[#d6d6d6]">{step.body}</span>
        <span className="mt-1 flex items-center gap-2">
          <button type="button" onClick={() => act("back")} disabled={s.index === 0} className="h-[34px] rounded-[9px] border border-white/25 px-3 text-[13px] font-semibold disabled:opacity-40">Back</button>
          <button type="button" onClick={() => act("skip")} className="h-[34px] rounded-[9px] border border-white/25 px-3 text-[13px] font-semibold">Skip step</button>
          <button type="button" onClick={() => act("next")} className="ml-auto h-[34px] rounded-[9px] bg-[#d64545] px-4 text-[13px] font-semibold text-white">{s.index === steps.length - 1 ? "Finish" : "Next"}</button>
        </span>
      </div>
    </>
  ) : null;
  return { start, autoStart, node, active: s.index != null };
}

// ---------- header, tabs, section ----------
export type TabDef = { id: string; label: string; count?: number; red?: boolean };

export function UnderlineTabs({ tabs, value, onChange, label }: { tabs: TabDef[]; value: string; onChange: (id: string) => void; label: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const key = (e: React.KeyboardEvent, i: number) => {
    const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (n == null) return; e.preventDefault();
    const t = tabs[(n + tabs.length) % tabs.length]; onChange(t.id); refs.current[t.id]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="tabs-row flex gap-[26px] overflow-x-auto border-b border-[#e3e3e3] md:flex-wrap md:overflow-visible">
      {tabs.map((t, i) => (
        <button key={t.id} ref={(el) => { refs.current[t.id] = el; }} type="button" role="tab" aria-selected={value === t.id} tabIndex={value === t.id ? 0 : -1}
          className="tab" onClick={() => onChange(t.id)} onKeyDown={(e) => key(e, i)}>
          {t.label}{t.count ? <span className={`tab-count${t.red ? " red" : ""}`}>{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** A whole section: entry moment, header with actions and Guide, tabs, content, tour. */
export function Section({ id, title, status, actions, tabs, tab, onTab, steps = [], entryStatus, children, wide }: {
  id: string; title: string; status?: React.ReactNode; actions?: React.ReactNode; tabs?: TabDef[]; tab?: string; onTab?: (id: string) => void;
  steps?: TourStep[]; entryStatus?: string; children: React.ReactNode; wide?: boolean;
}) {
  const tour = useTour(id, steps, onTab);
  return (
    <div className={`mx-auto flex flex-col gap-[18px] ${wide ? "max-w-[1280px]" : "max-w-[1180px]"}`}>
      <EntryMoment section={id} title={title} status={entryStatus} onDone={tour.autoStart} />
      <header data-tour="header" className="flex flex-col gap-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-3.5 pl-10 md:pl-0">
          <div className="min-w-0">
            <h1 className="text-[26px] font-[650] tracking-[-0.02em]">{title}</h1>
            {status && <p className="mt-1 text-[14px] text-muted">{status}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {steps.length > 0 && <button type="button" className="btn h-10 px-3.5" onClick={tour.start}>Guide</button>}
            {actions}
          </div>
        </div>
        {tabs && tab && onTab && <UnderlineTabs tabs={tabs} value={tab} onChange={onTab} label={title} />}
      </header>
      {children}
      {tour.node}
    </div>
  );
}

// ---------- Home building blocks ----------
type Go = { href?: string; onClick?: () => void };
function Hit({ href, onClick, className, children, label }: Go & { className: string; children: React.ReactNode; label?: string }) {
  if (href) return <Link href={href} className={className} aria-label={label}>{children}</Link>;
  return <button type="button" onClick={onClick} className={className} aria-label={label}>{children}</button>;
}

export type Kpi = Go & { label: string; value: React.ReactNode; of?: string; sub?: string; tone?: "dark" | "red" };
export function KpiTiles({ items, tour }: { items: Kpi[]; tour?: string }) {
  return (
    <div data-tour={tour} className="grid grid-cols-2 gap-2.5 rounded-2xl md:grid-cols-4">
      {items.map((k) => (
        <Hit key={k.label} href={k.href} onClick={k.onClick} className={`tile${k.tone ? " " + k.tone : ""}`}>
          <span className="text-[12px] font-semibold uppercase tracking-[.05em] opacity-80">{k.label}</span>
          <span className="flex items-baseline gap-1.5"><span className="num text-[30px] leading-[1.05]">{k.value}</span>{k.of && <span className="text-[13px] opacity-75">{k.of}</span>}</span>
          {k.sub && <span className="text-[12.5px] opacity-80">{k.sub}</span>}
        </Hit>
      ))}
    </div>
  );
}

export type Need = Go & { title: string; sub?: string; cta?: string; tone?: "red" | "dark" | "dim" };
export function NeedsYou({ items, empty = "Nothing waiting.", title = "Needs you", tour }: { items: Need[]; empty?: string; title?: string; tour?: string }) {
  return (
    <section data-tour={tour} className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="px-[18px] py-3.5 font-semibold">{title}</div>
      {items.length === 0 ? <p className="border-t border-line px-[18px] py-4 text-[13px] text-muted">{empty}</p> : items.map((n, i) => (
        <Hit key={i} href={n.href} onClick={n.onClick} className="flex w-full items-center gap-3 border-t border-line px-[18px] py-3 text-left hover:bg-[#fafafa]">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: n.tone === "dark" ? "#141414" : n.tone === "dim" ? "#8c8c8c" : "#d64545" }} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-[13.5px] font-semibold leading-snug">{n.title}</span>{n.sub && <span className="text-[12px] text-muted">{n.sub}</span>}</span>
          {n.cta && <span className="text-[12.5px] font-semibold text-accent">{n.cta}</span>}
        </Hit>
      ))}
    </section>
  );
}

export type Start = Go & { title: string; sub: string; icon: React.ElementType; primary?: boolean };
export function StartCards({ items, tour, title = "Start something" }: { items: Start[]; tour?: string; title?: string }) {
  return (
    <section data-tour={tour} className="flex flex-col gap-2.5 rounded-2xl">
      <span className="label text-ink">{title}</span>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {items.map((s) => (
          <Hit key={s.title} href={s.href} onClick={s.onClick} className="flex items-start gap-3.5 rounded-2xl border border-line bg-surface p-[18px] text-left transition-[border-color,transform] hover:-translate-y-0.5 hover:border-ink">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white ${s.primary ? "bg-accent" : "bg-[#141414]"}`}><s.icon size={18} strokeWidth={1.8} /></span>
            <span className="flex flex-col gap-1"><span className="text-[15px] font-semibold">{s.title}</span><span className="text-[13px] leading-relaxed text-muted">{s.sub}</span></span>
          </Hit>
        ))}
      </div>
    </section>
  );
}

export type ActivityRow = Go & { when: string; text: React.ReactNode; tag?: string };
export function Activity({ items, title = "Recent activity", empty = "No activity yet.", tour }: { items: ActivityRow[]; title?: string; empty?: string; tour?: string }) {
  return (
    <section data-tour={tour} className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="px-[18px] py-3.5 font-semibold">{title}</div>
      {items.length === 0 ? <p className="border-t border-line px-[18px] py-4 text-[13px] text-muted">{empty}</p> : items.map((a, i) => (
        <Hit key={i} href={a.href} onClick={a.onClick} className="flex w-full items-start gap-3 border-t border-line px-[18px] py-3 text-left hover:bg-[#fafafa]">
          <span className="num w-16 shrink-0 pt-0.5 text-[11.5px] text-faint">{a.when}</span>
          <span className="min-w-0 flex-1 text-[13.5px] leading-snug">{a.text}</span>
          {a.tag && <span className="pill shrink-0 bg-[#141414] text-white">{a.tag}</span>}
        </Hit>
      ))}
    </section>
  );
}

/** A dark summary card used on Homes for the one line that matters most. */
export function DarkCard({ kicker, children, tour }: { kicker: string; children: React.ReactNode; tour?: string }) {
  return (
    <section data-tour={tour} className="flex flex-col gap-3 rounded-2xl bg-[#141414] p-[18px] text-white">
      <span className="text-[12px] font-semibold uppercase tracking-[.06em] text-[#ff8a80]">{kicker}</span>
      {children}
    </section>
  );
}
