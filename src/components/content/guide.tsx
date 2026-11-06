"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { tourPlace } from "@/lib/shell";

export type TourStep = { target: string; tab?: string; title: string; body: string };

/**
 * A guided tour. Each step opens its tab, scrolls the part it explains to the middle of the screen, and blurs
 * everything else with four panels around it, so the part stays sharp and clickable. The card sits next to the part
 * ("Step N of M", Back, Skip step, Next and Skip tour). Starts once per browser and reopens from the Guide button.
 */
export function Tour({ id, steps, open, onClose, onTab }: { id: string; steps: TourStep[]; open: boolean; onClose: () => void; onTab: (tab: string) => void }) {
  const [i, setI] = useState(0);
  const [done, setDone] = useState<number[]>([]);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const raf = useRef(0);
  const card = useRef<HTMLDivElement>(null);
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
  const size = { width: card.current?.offsetWidth ?? 380, height: card.current?.offsetHeight ?? 240 };
  const at = typeof window === "undefined" ? null : tourPlace(rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : null, size, { width: window.innerWidth, height: window.innerHeight }, 16);
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
      <div ref={card} role="dialog" aria-label="Guided tour" className="fixed z-[72] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2.5 rounded-xl bg-[#141414] p-[18px] text-white shadow-[0_20px_50px_rgba(20,20,20,.35)]"
        style={at ? { top: at.top, left: at.left, transition: "top .2s cubic-bezier(.16,1,.3,1), left .2s cubic-bezier(.16,1,.3,1)" } : { left: 24, bottom: 24 }}>
        <div className="flex items-center justify-between gap-2"><span className="text-meta font-medium text-[#cfcfcf]">Step {i + 1} of {steps.length}</span><button className="text-meta font-semibold text-[#cfcfcf] hover:text-white" onClick={finish}>Skip tour</button></div>
        <span className="h-1 overflow-hidden rounded-full bg-white/15"><span className="block h-full bg-[#d64545] transition-[width] duration-300" style={{ width: `${(done.length / steps.length) * 100}%` }} /></span>
        <span className="text-title font-semibold leading-snug">{step.title}</span>
        <span className="text-body leading-relaxed text-[#d6d6d6]">{step.body}</span>
        <div className="mt-1 flex items-center gap-2">
          <button className="h-[34px] rounded-lg border border-white/25 px-3 text-body font-semibold disabled:opacity-40" disabled={i === 0} onClick={() => go(i - 1, false)}>Back</button>
          <button className="h-[34px] rounded-lg border border-white/25 px-3 text-body font-semibold" onClick={() => go(i + 1, false)}>Skip step</button>
          <button className="ml-auto h-[34px] rounded-lg bg-[#d64545] px-4 text-body font-semibold hover:bg-[#9e1c1c]" onClick={() => go(i + 1, true)}>{i === steps.length - 1 ? "Finish" : "Next"}</button>
        </div>
      </div>
    </>
  );
}

/** True when this browser has not finished or skipped the tour yet. */
export const tourPending = (id: string) => { try { return localStorage.getItem(`prax-tour-${id}`) !== "1"; } catch { return false; } };
