"use client";
// The section shell every Prax area uses: an entry moment, a plain header, underline tabs, a guided tour,
// and the Home building blocks. Patterns match the approved Content Studio and AI citations designs.
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUpRight, ArrowDownRight, ChevronRight } from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import { countAt, countBetween } from "@/lib/dashboard";
import { shouldPlayIntro, markIntro, shouldAutoTour, markTourSeen, moveTour, tourLabel, tourPercent, type TourState, type TourAction } from "@/lib/shell";

const safe = (pick: () => Storage) => { try { return pick(); } catch { return null; } };
const reducedMotion = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

// ---------- entry moment ----------
/** Blurred veil with the Prax mark, the section name and a live status line. Once per section per session. */
export function EntryMoment({ section, title, status, onDone }: { section: string; title: string; status?: string; onDone?: () => void }) {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);
  const leave = useCallback(() => {
    if (done.current) return;
    done.current = true; setLeaving(true);
    setTimeout(() => { setShow(false); onDone?.(); }, 450);
  }, [onDone]);
  const started = useRef(false);
  useEffect(() => {
    // Decide once per mount; a second effect run (React strict mode in dev) only re-arms the timer and keys.
    if (!started.current) {
      started.current = true;
      const ss = safe(() => window.sessionStorage);
      if (!shouldPlayIntro(ss, section, reducedMotion())) { done.current = true; onDone?.(); return; }
      markIntro(ss, section); setShow(true);
    } else if (done.current) return;
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
          <span className="text-[12px] text-faint">or press Enter</span>
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
    <div role="tablist" aria-label={label} className="tabs-row">
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
          <div className="min-w-0 flex-[1_1_360px]">
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

// ---------- motion helpers ----------
/** Counts up from 0 to the first non-zero value (450 ms, eased), so data that loads late still counts up.
 *  With live, later changes roll from the old value to the new one (300 ms); otherwise they land at once.
 *  Off with reduced motion. */
export function useCountUp(value: number, duration = 450, live = false) {
  const [shown, setShown] = useState(0);
  const played = useRef(false);
  const last = useRef(0);
  useEffect(() => {
    if (value === 0 && !played.current) { setShown(0); return; }
    const from = last.current;
    last.current = value;
    if (reducedMotion() || !Number.isFinite(value) || (played.current && (!live || from === value))) { played.current = true; setShown(value); return; }
    const first = !played.current;
    played.current = true;
    let raf = 0; const t0 = performance.now();
    const d = first ? duration : 300;
    const tick = (now: number) => { const e = now - t0; setShown(first ? countAt(value, e, d) : countBetween(from, value, e, d)); if (e < d) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); setShown(value); };
  }, [value, duration, live]);
  return shown;
}
export function CountUp({ value, format, live }: { value: number; format?: (n: number) => string; live?: boolean }) {
  const n = useCountUp(value, 450, live);
  return <>{format ? format(n) : n.toLocaleString("en-GB")}</>;
}

/** Smoothly slides children marked data-flip="<key>" to their new place when a list reorders (FLIP).
 *  Positions are measured against the container, so scrolling never triggers it. Off with reduced motion. */
export function useFlip(container: React.RefObject<HTMLElement | null>) {
  const prev = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const box = container.current;
    if (!box) return;
    const top = box.getBoundingClientRect().top;
    const rows = Array.from(box.querySelectorAll<HTMLElement>("[data-flip]"));
    const next = new Map<string, number>();
    rows.forEach((r) => next.set(r.dataset.flip!, r.getBoundingClientRect().top - top));
    if (!reducedMotion() && prev.current.size) {
      rows.forEach((r) => {
        const was = prev.current.get(r.dataset.flip!), now = next.get(r.dataset.flip!)!;
        if (was != null && Math.abs(was - now) > 1) r.animate?.([{ transform: `translateY(${was - now}px)` }, { transform: "none" }], { duration: 340, easing: "cubic-bezier(.2,.8,.2,1)" });
      });
    }
    prev.current = next;
  });
}
/** Staggered reveal: spread on each block in order; i sets the delay (45 ms a step). */
export const reveal = (i: number) => ({ className: "reveal", style: { "--i": i } as React.CSSProperties });

/** A ring that fills to pct on first view. Children sit in the middle. */
export function ProgressRing({ pct, size = 96, stroke = 8, tone = "red", children, label }: { pct: number; size?: number; stroke?: number; tone?: "red" | "dark" | "light"; children?: React.ReactNode; label?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const [p, setP] = useState(0);
  const box = useRef<HTMLSpanElement>(null);
  const was = useRef<number | null>(null);
  useEffect(() => {
    const t = requestAnimationFrame(() => setP(pct));
    // A small settle each time the ring gains ground (a task cleared), never on the first fill.
    if (was.current != null && pct > was.current && !reducedMotion()) box.current?.animate?.([{ transform: "scale(1)" }, { transform: "scale(1.045)" }, { transform: "scale(1)" }], { duration: 300, easing: "cubic-bezier(.2,.8,.2,1)" });
    was.current = pct;
    return () => cancelAnimationFrame(t);
  }, [pct]);
  const color = tone === "dark" ? "#141414" : tone === "light" ? "#ffffff" : "#d64545";
  const track = tone === "light" ? "rgba(255,255,255,.16)" : "#ececec";
  return (
    <span ref={box} className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={label ?? `${pct}% done`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeOpacity={p > 0 ? 1 : 0}
          strokeDashoffset={c * (1 - Math.min(100, p) / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} className="ring-fill" />
      </svg>
      <span className="relative flex flex-col items-center leading-none">{children}</span>
    </span>
  );
}

/** A quiet line of recent values; grey, with the latest point in red. */
export function Spark({ values, w = 84, h = 26, light }: { values: number[]; w?: number; h?: number; light?: boolean }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 6) + 3, h - 3 - (v / max) * (h - 6)]);
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={light ? "rgba(255,255,255,.45)" : "var(--stroke)"} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill="#d64545" />
    </svg>
  );
}

// ---------- Home building blocks ----------
type Go = { href?: string; onClick?: () => void };
function Hit({ href, onClick, className, children, label, style }: Go & { className: string; children: React.ReactNode; label?: string; style?: React.CSSProperties }) {
  if (href) return <Link href={href} className={className} aria-label={label} style={style}>{children}</Link>;
  if (!onClick) return <div className={className} aria-label={label} style={style}>{children}</div>;
  return <button type="button" onClick={onClick} className={className} aria-label={label} style={style}>{children}</button>;
}

/** good says whether the move is good news; it defaults to up being good. */
export type KpiDelta = { text: string; dir: "up" | "down" | "flat"; good?: boolean; label?: string };
export type Kpi = Go & { label: string; value: React.ReactNode; of?: string; sub?: string; tone?: "dark" | "red"; delta?: KpiDelta | null; spark?: number[] };
function DeltaChip({ d, dark }: { d: KpiDelta; dark?: boolean }) {
  const good = d.good ?? d.dir === "up";
  const cls = d.dir === "flat" ? (dark ? "bg-white/10 text-[#d6d6d6]" : "bg-[#f0f0f0] text-[#5f5f5f]")
    : good ? (dark ? "bg-white/15 text-white" : "bg-[#f0f0f0] text-[#141414]") : (dark ? "bg-[#d64545] text-white" : "bg-[#fbeaea] text-[#9e1c1c]");
  return (
    <span className={`num inline-flex h-5 items-center gap-0.5 rounded-md px-1.5 text-[11px] font-semibold ${cls}`}>
      {d.dir === "up" ? <ArrowUpRight size={11} strokeWidth={2.4} /> : d.dir === "down" ? <ArrowDownRight size={11} strokeWidth={2.4} /> : null}{d.text}
    </span>
  );
}
export function KpiTiles({ items, tour }: { items: Kpi[]; tour?: string }) {
  return (
    // Four tiles: 2 by 2, then one row. Five: phone 1 + 2 + 2 (lead tile full width), tablet 2 + 3, wide one row of five.
    <div data-tour={tour} className={`grid grid-cols-2 gap-3 rounded-2xl ${items.length === 5 ? "md:grid-cols-6 xl:grid-cols-5" : "md:grid-cols-4"}`}>
      {items.map((k, i) => {
        const r = reveal(i);
        const span = items.length !== 5 ? "" : i === 0 ? " col-span-2 md:col-span-3 xl:col-span-1" : i === 1 ? " md:col-span-3 xl:col-span-1" : " md:col-span-2 xl:col-span-1";
        return (
          <Hit key={k.label} href={k.href} onClick={k.onClick} className={`tile ${r.className}${span}${k.tone ? " " + k.tone : ""}${k.href || k.onClick ? " hit" : ""}`} style={r.style}>
            <span className="tile-label">{k.label}</span>
            <span className="flex w-full items-end justify-between gap-2">
              <span className="flex min-w-0 items-baseline gap-1.5"><span className="num tile-num">{typeof k.value === "number" ? <CountUp value={k.value} /> : k.value}</span>{k.of && <span className="num truncate text-[13px] opacity-60">{k.of}</span>}</span>
              {k.spark && <span className="hidden sm:block"><Spark values={k.spark} light={k.tone === "dark"} /></span>}
            </span>
            {(k.sub || k.delta) && (
              <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] opacity-80">
                {k.delta && <DeltaChip d={k.delta} dark={k.tone === "dark"} />}
                {k.delta?.label && <span>{k.delta.label}</span>}
                {k.sub && <span>{k.sub}</span>}
              </span>
            )}
          </Hit>
        );
      })}
    </div>
  );
}

export type Need = Go & { title: string; sub?: string; cta?: string; tone?: "red" | "dark" | "dim"; when?: string };
export function NeedsYou({ items, empty = "Nothing waiting.", title = "Needs you", tour, count }: { items: Need[]; empty?: string; title?: string; tour?: string; count?: number }) {
  const n = count ?? items.length;
  return (
    <section data-tour={tour} className="panel">
      <div className="panel-head"><span className="flex items-center gap-2">{title}{n > 0 && <span className="count-badge">{n}</span>}</span></div>
      {items.length === 0 ? <p className="border-t border-line px-[18px] py-4 text-[13px] text-muted">{empty}</p> : items.map((x, i) => {
        const r = reveal(i);
        return (
          <Hit key={i} href={x.href} onClick={x.onClick} className={`row-hit group ${r.className}`} style={r.style}>
            <span aria-hidden="true" className={`h-[7px] w-[7px] shrink-0 self-start rounded-full mt-[6px] ${x.tone === "dark" ? "bg-ink" : x.tone === "dim" ? "border-[1.5px] border-stroke" : "bg-accent"}`} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="line-clamp-2 text-[13.5px] font-semibold leading-snug">{x.title}</span>{x.sub && <span className="line-clamp-2 text-[12px] text-muted">{x.sub}</span>}</span>
            {x.when && <span className={`num hidden shrink-0 text-[11.5px] sm:block ${/overdue/.test(x.when) ? "font-semibold text-[#9e1c1c]" : "text-faint"}`}>{x.when}</span>}
            {x.cta && <span className="flex shrink-0 items-center gap-0.5 text-[12.5px] font-semibold text-ink">{x.cta}<ChevronRight size={14} className="text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink" /></span>}
          </Hit>
        );
      })}
    </section>
  );
}

export type Start = Go & { title: string; sub: string; icon: React.ElementType; primary?: boolean };
/** A compact list of actions: icon, name and one line, with a chevron. The primary action's icon is red. */
export function StartCards({ items, tour, title = "Start something", className = "" }: { items: Start[]; tour?: string; title?: string; className?: string }) {
  return (
    <section data-tour={tour} className={`panel ${className}`}>
      <div className="panel-head">{title}</div>
      {items.map((s, i) => { const r = reveal(i); return (
        <Hit key={s.title} href={s.href} onClick={s.onClick} className={`row-hit group ${r.className}`} style={r.style}>
          <s.icon size={16} strokeWidth={1.9} className={`shrink-0 ${s.primary ? "text-accent" : "text-ink"}`} aria-hidden="true" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-[13.5px] font-semibold">{s.title}</span><span className="text-[12.5px] leading-snug text-muted">{s.sub}</span></span>
          <ChevronRight size={15} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden="true" />
        </Hit>
      ); })}
    </section>
  );
}

/** count and detail come from collapsing repeats (collapseActivity in lib/dashboard): one row, how many, and what they were. */
export type ActivityRow = Go & { when: string; text: React.ReactNode; tag?: string; count?: number; detail?: string };
export function Activity({ items, title = "Recent activity", empty = "No activity yet.", tour, action }: { items: ActivityRow[]; title?: string; empty?: string; tour?: string; action?: { label: string; href: string } }) {
  return (
    <section data-tour={tour} className="panel">
      <div className="panel-head"><span>{title}</span>{action && <Link href={action.href} className="panel-link">{action.label}</Link>}</div>
      {items.length === 0 ? <p className="border-t border-line px-[18px] py-4 text-[13px] text-muted">{empty}</p> : (
        <ol className="border-t border-line py-1.5">
          {items.map((a, i) => { const r = reveal(i); return (
            <li key={i} className={r.className} style={r.style}>
              <Hit href={a.href} onClick={a.onClick} className="flex w-full items-start gap-3 px-[18px] py-2 text-left hover:bg-[#fafafa]">
                <span className="mt-[6px] h-[7px] w-[7px] shrink-0 rounded-full border-[1.5px] border-[#141414] bg-white" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-[13px] leading-snug text-ink-2">{a.text}{a.count && a.count > 1 ? <span className="num ml-1.5 text-[11.5px] font-semibold text-muted">×{a.count}</span> : null}</span>
                  {a.detail && <span className="truncate text-[12px] text-muted">{a.detail}</span>}</span>
                {a.tag && <span className="hidden sm:contents"><span className="count-badge muted shrink-0">{a.tag}</span></span>}
                <span className="num w-[68px] shrink-0 pt-px text-right text-[11.5px] text-faint">{a.when}</span>
              </Hit>
            </li>
          ); })}
        </ol>
      )}
    </section>
  );
}

/** A plain white panel with a title row and an optional link top right. */
export function Panel({ title, meta, action, tour, children, className = "" }: { title: React.ReactNode; meta?: React.ReactNode; action?: { label: string; href?: string; onClick?: () => void }; tour?: string; children: React.ReactNode; className?: string }) {
  return (
    <section data-tour={tour} className={`panel ${className}`}>
      <div className="panel-head">
        <span className="flex min-w-0 items-center gap-2">{title}</span>
        <span className="flex items-center gap-3">{meta && <span className="text-[12px] font-normal text-muted">{meta}</span>}
          {action && (action.href ? <Link href={action.href} className="panel-link">{action.label}</Link> : <button type="button" onClick={action.onClick} className="panel-link">{action.label}</button>)}</span>
      </div>
      {children}
    </section>
  );
}

/** A dark summary card used on Homes for the one line that matters most. */
export function DarkCard({ kicker, children, tour }: { kicker: string; children: React.ReactNode; tour?: string }) {
  return (
    <section data-tour={tour} className="flex flex-col gap-3 rounded-2xl bg-[#141414] p-[18px] text-white">
      <span className="text-[13px] font-semibold text-[#ff8a80]">{kicker}</span>
      {children}
    </section>
  );
}
