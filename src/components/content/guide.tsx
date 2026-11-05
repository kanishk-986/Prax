"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * The entry moment: the page sits blurred behind a soft veil while the mark and the section name rise in,
 * then sharpens after about two seconds, or at once on Enter or the button. Once per browser session.
 * People who turn off motion skip it entirely.
 */
export function EntryMoment({ id, title, line }: { id: string; title: string; line: string }) {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const key = `prax-intro-${id}`;
  useEffect(() => {
    let seen = false, still = false;
    try { seen = sessionStorage.getItem(key) === "1"; } catch {}
    try { still = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch {}
    if (!seen && !still) setShow(true);
  }, [key]);
  const leave = useCallback(() => {
    setLeaving(true);
    try { sessionStorage.setItem(key, "1"); } catch {}
    setTimeout(() => setShow(false), 450);
  }, [key]);
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(leave, 2300);
    const k = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === "Escape") leave(); };
    window.addEventListener("keydown", k);
    return () => { clearTimeout(t); window.removeEventListener("keydown", k); };
  }, [show, leave]);
  if (!show) return null;
  return (
    <div className={`intro-veil fixed inset-0 z-[80] grid place-items-center p-6 ${leaving ? "intro-leaving" : ""}`} onClick={leave} role="dialog" aria-label={title}>
      <div className="flex flex-col items-center gap-4 text-center">
        <svg className="intro-mark" width="64" height="64" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="6" fill="#141414" /><rect x="6.5" y="7.5" width="8" height="3" rx="1.5" fill="#ffffff" /><rect x="9.5" y="13.5" width="8" height="3" rx="1.5" fill="#d64545" /></svg>
        <span className="intro-l1 text-[34px] font-semibold tracking-tight text-[#141414]">{title}</span>
        <span className="intro-l2 max-w-[460px] text-[15px] leading-relaxed text-[#5f5f5f]">{line}</span>
        <span className="intro-l3 mt-1 flex flex-col items-center gap-3">
          <button className="btn btn-primary h-11 px-6 text-[14.5px]" onClick={(e) => { e.stopPropagation(); leave(); }}>Enter workspace</button>
          <span className="h-0.5 w-[140px] overflow-hidden rounded bg-[#e3e3e3]"><span className="intro-bar block h-full w-full bg-[#141414]" /></span>
          <span className="text-[12px] text-[#8c8c8c]">or press Enter</span>
        </span>
      </div>
    </div>
  );
}

export type TourStep = { target: string; tab?: string; title: string; body: string };

/**
 * A guided tour. Each step opens its tab, scrolls the part it explains to the middle of the screen, and blurs
 * everything else with four panels around it, so the part stays sharp and clickable. "Step N of M, K completed",
 * with Back, Skip step, Next and Skip tour. Starts once per browser and reopens from the Guide button.
 */
export function Tour({ id, steps, open, onClose, onTab }: { id: string; steps: TourStep[]; open: boolean; onClose: () => void; onTab: (tab: string) => void }) {
  const [i, setI] = useState(0);
  const [done, setDone] = useState<number[]>([]);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const raf = useRef(0);
  useEffect(() => { if (open) { setI(0); setDone([]); } }, [open]);
  const step = open ? steps[i] : null;
  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);
  useEffect(() => {
    if (!step) return;
    if (step.tab) onTab(step.tab);
    // Wait for the tab to render, then bring the part into view.
    const t = setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(measure, 380);
    }, 90);
    return () => clearTimeout(t);
  }, [step, onTab, measure]);
  useLayoutEffect(() => {
    if (!step) return;
    const on = () => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(measure); };
    window.addEventListener("scroll", on, true); window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on, true); window.removeEventListener("resize", on); cancelAnimationFrame(raf.current); };
  }, [step, measure]);
  const finish = useCallback(() => { try { localStorage.setItem(`prax-tour-${id}`, "1"); } catch {} onClose(); }, [id, onClose]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [open, finish]);
  if (!step) return null;
  const go = (n: number, mark: boolean) => {
    if (mark && !done.includes(i)) setDone((d) => [...d, i]);
    if (n >= steps.length) { finish(); return; }
    setRect(null); setI(Math.max(0, n));
  };
  const pad = 8, r = rect ? { top: rect.top - pad, left: rect.left - pad, w: rect.width + pad * 2, h: rect.height + pad * 2 } : null;
  const veil = "fixed z-[65] bg-white/40 backdrop-blur-[5px]";
  return (
    <>
      {r ? (
        <>
          <div className={veil} style={{ top: 0, left: 0, right: 0, height: Math.max(0, r.top) }} />
          <div className={veil} style={{ top: r.top + r.h, left: 0, right: 0, bottom: 0 }} />
          <div className={veil} style={{ top: Math.max(0, r.top), left: 0, width: Math.max(0, r.left), height: r.h }} />
          <div className={veil} style={{ top: Math.max(0, r.top), left: r.left + r.w, right: 0, height: r.h }} />
          <div className="pointer-events-none fixed z-[66] rounded-2xl" style={{ top: r.top, left: r.left, width: r.w, height: r.h, boxShadow: "0 0 0 3px #d64545, 0 0 0 10px rgba(214,69,69,.18)" }} />
        </>
      ) : <div className={`${veil} inset-0`} />}
      <div role="dialog" aria-label="Guided tour" className="anim-rise fixed bottom-6 left-6 z-[72] flex w-[min(380px,calc(100vw-48px))] flex-col gap-2.5 rounded-2xl bg-[#141414] p-[18px] text-white shadow-[0_20px_50px_rgba(20,20,20,.35)]">
        <div className="flex items-center justify-between gap-2"><span className="text-[12px] font-semibold text-[#ff8a80]">Step {i + 1} of {steps.length} · {done.length} completed</span><button className="text-[12.5px] font-semibold text-[#cfcfcf] hover:text-white" onClick={finish}>Skip tour</button></div>
        <span className="h-1 overflow-hidden rounded-full bg-white/15"><span className="block h-full bg-[#d64545] transition-[width] duration-300" style={{ width: `${(done.length / steps.length) * 100}%` }} /></span>
        <span className="text-[16px] font-semibold leading-snug">{step.title}</span>
        <span className="text-[13px] leading-relaxed text-[#d6d6d6]">{step.body}</span>
        <div className="mt-1 flex items-center gap-2">
          <button className="h-[34px] rounded-lg border border-white/25 px-3 text-[13px] font-semibold disabled:opacity-40" disabled={i === 0} onClick={() => go(i - 1, false)}>Back</button>
          <button className="h-[34px] rounded-lg border border-white/25 px-3 text-[13px] font-semibold" onClick={() => go(i + 1, false)}>Skip step</button>
          <button className="ml-auto h-[34px] rounded-lg bg-[#d64545] px-4 text-[13px] font-semibold hover:bg-[#9e1c1c]" onClick={() => go(i + 1, true)}>{i === steps.length - 1 ? "Finish" : "Next"}</button>
        </div>
      </div>
    </>
  );
}

/** True when this browser has not finished or skipped the tour yet. */
export const tourPending = (id: string) => { try { return localStorage.getItem(`prax-tour-${id}`) !== "1"; } catch { return false; } };
