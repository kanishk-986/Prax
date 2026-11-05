"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { addDays, weekStart, fmtDay, today } from "@/lib/workspace";
import { type Brief, weekStart as wkStart } from "@/lib/campaigns";

export type Post = {
  id: string; workspace_id: string; title: string; format: string; publish_date: string | null; status: string; topic: string; draft: string; url: string;
  campaign_id: string | null; pillar: string; phase: string; planned_time: string; hold_status?: string;
  requested_by: string | null; requested_at: string | null; decided_by: string | null; decided_at: string | null; decision: string; decision_note: string;
  impressions: number | null; reactions: number | null; comments: number | null; created_at?: string;
  channel?: "shashi" | "company"; newsletter?: boolean; source_kind?: string; source_ref?: string; hook?: string;
  script?: { hook?: string; beats?: { say: string; show: string }[]; close?: string; caption?: string; cover?: string; captions?: string };
  visual?: { mode?: string; layout?: string; prompt?: string; slides?: { title: string; body: string }[] }; claims_ack?: boolean; resource?: string;
  angle?: string; discovery?: { topic_id?: string; finding_id?: string; rank?: number | null; score?: number; sources?: { via: string; pub: string; url: string }[]; service?: string; angle?: string; campaign?: string; move?: string };
};
export type Campaign = { id: string; workspace_id: string; name: string; kind: "standard" | "fast" | "event"; brief: Brief; template: boolean; status: string; paused_at: string | null; created_at: string };
export type Target = { id: string; campaign_id: string; prospect_id: string | null; person_key: string; name: string; company: string; linkedin: string; engaged_at: string | null; engaged_reason: string };
export type Request = { id: string; campaign_id: string; post_id: string | null; prospect_id: string | null; name: string; company: string; linkedin: string; sent: boolean; created_at: string };

/** Old status words from the first Content page map onto the Content Studio ones. */
export const statusOf = (s: string) => (s === "Approved" || s === "Scheduled" ? "Ready" : s === "Published" ? "Posted" : s || "Idea");

export function StatusPill({ s }: { s: string }) {
  const v = statusOf(s);
  const style = v === "Ready" ? { background: "#d64545", color: "#fff" } : v === "Drafting" ? { background: "#141414", color: "#fff" } : v === "Posted" ? { background: "#9e1c1c", color: "#fff" }
    : v === "In review" ? { background: "#fff", color: "#d64545", border: "1px solid #d64545" } : v === "On hold" ? { background: "#ececec", color: "#5f5f5f" } : { background: "#fff", color: "#141414", border: "1px solid #d4d4d4" };
  return <span className="pill" style={style}>{v}</span>;
}

/** Company content is never mistaken for Shashi's own post. */
export function ChannelFlag({ p, long }: { p: { channel?: string }; long?: boolean }) {
  if (p.channel !== "company") return null;
  return <span className="pill" style={{ background: "#141414", color: "#fff" }} title="Company content, not for Shashi's profile">{long ? "Company content, not for Shashi's profile" : "Company content"}</span>;
}

export const logActivity = (wsId: string, kind: string, label: string, refId?: string | null) =>
  supabase().from("activity").insert({ workspace_id: wsId, kind, label, ref_id: refId ?? null });

/** Generated Today items are kind "custom" with a fixed index band, so re-running never duplicates them. */
export const upsertToday = (rows: { day: string; kind: string; idx: number; title: string; link?: string; note?: string }[], wsId: string) =>
  rows.length ? supabase().from("daily_items").upsert(rows.map((r) => ({ workspace_id: wsId, ...r, link: r.link ?? "", note: r.note ?? "" })), { onConflict: "workspace_id,day,kind,idx", ignoreDuplicates: true }) : Promise.resolve({ error: null });

/** One weekly "Approval session" item on Today (Monday, or today if Monday has passed), listing the posts in review. */
export async function syncApprovalSession(wsId: string, slug: string, posts: Post[], pausedIds: string[] = []) {
  const t = today(), monday = weekStart(t), day = monday < t ? t : monday;
  const inReview = posts.filter((p) => statusOf(p.status) === "In review" && !(p.campaign_id && pausedIds.includes(p.campaign_id)));
  const row = { workspace_id: wsId, day, kind: "custom", idx: 3000, title: inReview.length ? `Approval session: ${inReview.length} post${inReview.length > 1 ? "s" : ""} in review (${inReview.slice(0, 3).map((p) => p.title).join("; ")}${inReview.length > 3 ? "; and more" : ""})` : "Approval session: nothing waiting", link: `/w/${slug}/studio-content?tab=library&status=In%20review`, note: "approvals" };
  return supabase().from("daily_items").upsert(row, { onConflict: "workspace_id,day,kind,idx" });
}

/** A small day and time picker anchored to the button that opened it; it flips above when there is no room below. */
export function DayPopover({ anchor, initial, onPick, onClose }: { anchor: HTMLElement; initial?: string | null; onPick: (day: string, time: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [week, setWeek] = useState(wkStart(initial && initial >= today() ? initial : today()));
  const [time, setTime] = useState("09:30");
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 });
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect(), h = ref.current?.offsetHeight ?? 160, w = ref.current?.offsetWidth ?? 320;
    const below = r.bottom + 6 + h < window.innerHeight;
    setPos({ top: below ? r.bottom + 6 : Math.max(8, r.top - 6 - h), left: Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) });
  }, [anchor]);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", down); window.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); window.removeEventListener("keydown", key); };
  }, [anchor, onClose]);
  const t = today();
  return (
    <div ref={ref} role="dialog" aria-label="Pick a day" className="card anim-rise fixed z-[70] w-[320px] p-3" style={{ top: pos.top, left: pos.left, boxShadow: "var(--shadow-lg)" }}>
      <div className="mb-2 flex items-center justify-between">
        <button className="btn btn-ghost h-7 w-7 p-0" aria-label="Previous week" onClick={() => setWeek(addDays(week, -7))} disabled={week <= weekStart(t)}><ChevronLeft size={14} /></button>
        <span className="text-[12.5px] font-semibold">Week of {fmtDay(week, { day: "numeric", month: "short" })}</span>
        <button className="btn btn-ghost h-7 w-7 p-0" aria-label="Next week" onClick={() => setWeek(addDays(week, 7))}><ChevronRight size={14} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }, (_, i) => addDays(week, i)).map((d) => (
          <button key={d} disabled={d < t} onClick={() => onPick(d, time)} className="flex flex-col items-center rounded-lg border border-line py-1.5 text-[12px] hover:border-[#d64545] disabled:opacity-40"
            style={d === t ? { background: "#141414", color: "#fff", borderColor: "#141414" } : undefined}>
            <span className="text-[10px] font-semibold">{fmtDay(d, { weekday: "short" })}</span><span className="num">{d.slice(8)}</span>
          </button>
        ))}
      </div>
      <label className="mt-2.5 flex items-center gap-2 text-[12.5px] text-muted">Time, Dubai<input type="time" className="field h-8 w-[110px]" value={time} onChange={(e) => setTime(e.target.value)} /></label>
    </div>
  );
}

/** A small menu anchored to its button with fixed positioning, so a table's scroll box never clips it. */
export function ActionMenu({ anchor, items, onClose }: { anchor: HTMLElement; items: { label: string; run: () => void; danger?: boolean }[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect(), h = ref.current?.offsetHeight ?? 160, w = ref.current?.offsetWidth ?? 190;
    setPos({ top: r.bottom + 4 + h < window.innerHeight ? r.bottom + 4 : Math.max(8, r.top - 4 - h), left: Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) });
  }, [anchor]);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", down); window.addEventListener("keydown", key); window.addEventListener("scroll", onClose, true);
    return () => { document.removeEventListener("mousedown", down); window.removeEventListener("keydown", key); window.removeEventListener("scroll", onClose, true); };
  }, [anchor, onClose]);
  useEffect(() => { ref.current?.querySelector("button")?.focus(); }, []);
  return (
    <div ref={ref} role="menu" className="card anim-rise fixed z-[70] min-w-[190px] p-1" style={{ top: pos.top, left: pos.left, boxShadow: "var(--shadow-lg)" }}>
      {items.map((it) => <button key={it.label} role="menuitem" onClick={() => { onClose(); it.run(); }} className={`flex w-full items-center rounded-md px-3 py-2 text-left text-[13px] font-medium hover:bg-surface-2 focus:bg-surface-2 focus:outline-none ${it.danger ? "text-[#d64545]" : "text-ink"}`}>{it.label}</button>)}
    </div>
  );
}

/** Modal frame: backdrop, Esc and Close. */
export function Modal({ title, onClose, children, wide, footer }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; footer?: React.ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-[55] grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-label={title} className={`card anim-rise flex max-h-[90vh] w-full flex-col overflow-hidden ${wide ? "max-w-[860px]" : "max-w-[560px]"}`} style={{ boxShadow: "var(--shadow-lg)" }} onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="m-0 min-w-0 truncate text-[16px] font-semibold">{title}</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">Close</button>
        </header>
        <div className="flex-1 overflow-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}
