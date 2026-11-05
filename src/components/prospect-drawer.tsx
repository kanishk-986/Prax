"use client";
import { useEffect, useState } from "react";
import { X, Trash2, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import Link from "next/link";
import { useWorkspace, STAGES, SEGMENTS, fmtDay } from "@/lib/workspace";
import { normCompany, seniority, type Person } from "@/lib/network";
import { Threads } from "./threads";
import { useToast, haptic } from "./toaster";

export type Prospect = {
  id: string; name: string; role: string; company: string; segment: string; region: string; stage: string; warmth: string;
  value: number; next_action: string; next_date: string | null; linkedin: string; why: string; notes: string; stage_changed_at: string;
};
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1"><span className="label">{label}</span>{children}</label>;
}
const EMPTY: Omit<Prospect, "id" | "stage_changed_at"> = { name: "", role: "", company: "", segment: "A", region: "", stage: "Target", warmth: "cold", value: 0, next_action: "", next_date: null, linkedin: "", why: "", notes: "" };

export function ProspectDrawer({ p, onClose }: { p: Prospect | null; onClose: () => void }) {
  const { ws, can } = useWorkspace();
  const editable = can("editor");
  const [f, setF] = useState<typeof EMPTY>(p ? { ...EMPTY, ...p } : EMPTY);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true);
    const body = { ...f, next_date: f.next_date || null, value: Number(f.value) || 0 };
    const { error } = p ? await supabase().from("prospects").update(body).eq("id", p.id)
      : await supabase().from("prospects").insert({ ...body, workspace_id: ws.id });
    setBusy(false);
    if (error) { toast(error.message); return; }
    haptic(); toast(p ? "Saved" : "Prospect added"); onClose();
  }
  async function del() {
    if (!p) return;
    const { error } = await supabase().from("prospects").delete().eq("id", p.id);
    if (error) { toast(error.message); return; }
    haptic(); toast("Prospect deleted"); onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/25" onMouseDown={onClose}>
      <aside className="flex h-full w-full max-w-[480px] flex-col border-l border-line bg-surface shadow-[var(--shadow-lg)]" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={p ? p.name : "New prospect"}>
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">{p ? p.name : "New prospect"}</div>
            {p && <div className="truncate text-[12px] text-muted">{p.role} · {p.company}</div>}
          </div>
          <div className="flex items-center gap-1">
            {p?.linkedin && <a className="btn btn-ghost" href={p.linkedin} target="_blank" rel="noopener" aria-label="Open LinkedIn profile"><ExternalLink size={15} /></a>}
            <button className="btn btn-ghost" onClick={onClose} aria-label="Close"><X size={16} /></button>
          </div>
        </header>
        <div className="flex-1 overflow-auto px-5 py-4">
          <fieldset disabled={!editable} className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><F label="Name"><input id="pd-name" className="field" value={f.name} onChange={set("name")} /></F></div>
            <F label="Role"><input id="pd-role" className="field" value={f.role} onChange={set("role")} /></F>
            <F label="Company"><input id="pd-company" className="field" value={f.company} onChange={set("company")} /></F>
            <F label="Segment"><select id="pd-seg" className="field" value={f.segment} onChange={set("segment")}>{Object.entries(SEGMENTS).map(([k, v]) => <option key={k} value={k}>{k} · {v.label}</option>)}</select></F>
            <F label="Region"><input id="pd-region" className="field" value={f.region} onChange={set("region")} /></F>
            <F label="Stage"><select id="pd-stage" className="field" value={f.stage} onChange={set("stage")}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></F>
            <F label="Warmth"><select id="pd-warm" className="field" value={f.warmth} onChange={set("warmth")}><option value="cold">Cold</option><option value="warm">Warm</option></select></F>
            <div className="col-span-2"><F label="Next action"><input id="pd-next" className="field" value={f.next_action} onChange={set("next_action")} /></F></div>
            <F label="Due"><input id="pd-due" type="date" className="field" value={f.next_date ?? ""} onChange={set("next_date")} /></F>
            <F label="Deal value (USD)"><input id="pd-val" type="number" min="0" className="field" value={f.value} onChange={set("value")} /></F>
            <div className="col-span-2"><F label="LinkedIn URL"><input id="pd-li" className="field" value={f.linkedin} onChange={set("linkedin")} placeholder="https://www.linkedin.com/in/…" /></F></div>
            <div className="col-span-2"><F label="Why they fit"><textarea id="pd-why" rows={3} className="field" value={f.why} onChange={set("why")} /></F></div>
            <div className="col-span-2"><F label="Notes"><textarea id="pd-notes" rows={3} className="field" value={f.notes} onChange={set("notes")} /></F></div>
          </fieldset>
          {p && <WarmLine p={p} />}
          {p && <div className="mt-6"><Threads refTable="prospects" refId={p.id} /></div>}
        </div>
        <footer className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
          {p && editable ? (confirm ? (
            <span className="flex items-center gap-2 text-[13px] text-bad">Delete for everyone? <button className="btn" onClick={del}>Delete</button><button className="btn btn-ghost" onClick={() => setConfirm(false)}>Keep</button></span>
          ) : <button className="btn btn-ghost hover:text-bad" onClick={() => setConfirm(true)}><Trash2 size={14} /> Delete</button>) : <span className="text-[12px] text-muted">{editable ? "" : "View only"}</span>}
          {editable && <button className="btn btn-primary" onClick={save} disabled={busy || !f.name.trim()}>{p ? "Save changes" : "Add prospect"}</button>}
        </footer>
      </aside>
    </div>
  );
}

/** The warm way in, from the LinkedIn export (Network page). */
function WarmLine({ p }: { p: Prospect }) {
  const { ws } = useWorkspace();
  const [rows, setRows] = useState<Person[] | null>(null);
  useEffect(() => {
    const cn = normCompany(p.company);
    supabase().from("network_people").select("*").eq("workspace_id", ws.id).or(cn ? `prospect_id.eq.${p.id},company_norm.eq.${cn}` : `prospect_id.eq.${p.id}`).limit(200)
      .then(({ data }: { data: unknown }) => setRows((data as Person[]) ?? []));
  }, [p.id, p.company, ws.id]);
  if (!rows) return null;
  const me = rows.find((r) => r.prospect_id === p.id);
  const others = rows.filter((r) => r !== me && r.is_connection).sort((a, b) => seniority(a.position) - seniority(b.position)).slice(0, 3);
  const bits: string[] = [];
  if (me?.is_connection) bits.push(`1st-degree connection${me.connected_on ? ` since ${fmtDay(me.connected_on, { month: "short", year: "numeric" })}` : ""}`);
  if (me?.msg_count) bits.push(`${me.msg_count} message${me.msg_count > 1 ? "s" : ""}, ${me.msg_last_from === "us" ? "waiting on them" : "they wrote last"}`);
  if (others.length) bits.push(`you know ${others.map((o) => o.name).join(", ")}${rows.filter((r) => r !== me && r.is_connection).length > 3 ? " and more" : ""} at ${p.company}`);
  return (
    <div className="mt-5 rounded-lg border border-line bg-surface-2/50 px-3 py-2.5">
      <div className="label mb-1">Warm path</div>
      <p className="text-[13px] text-ink-2">{bits.length ? bits.join(" · ") : "None found in the LinkedIn export yet."} <Link href={`/w/${ws.slug}/network`} className="text-muted hover:text-ink hover:underline">Network</Link></p>
    </div>
  );
}
