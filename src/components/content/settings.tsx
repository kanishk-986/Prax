"use client";
import { useCallback, useEffect, useState } from "react";
import { X, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useWorkspace, fmtDay, today } from "@/lib/workspace";
import { useToast, haptic } from "@/components/toaster";
import { type Pov, type Newsletter, mergePov, DEFAULT_NEWSLETTER, nextIssue } from "@/lib/content";
import { Modal } from "./shared";

export type ContentSettings = { pov: Pov; newsletter: Newsletter };

/** The profile's point-of-view bank and newsletter, kept in content_settings. */
export function useContentSettings() {
  const { ws } = useWorkspace();
  const [s, setS] = useState<ContentSettings>({ pov: mergePov(null), newsletter: DEFAULT_NEWSLETTER });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase().from("content_settings").select("pov,newsletter").eq("workspace_id", ws.id).maybeSingle()
      .then(({ data }: { data: { pov: Partial<Pov>; newsletter: Partial<Newsletter> } | null }) => {
        setS({ pov: mergePov(data?.pov), newsletter: { ...DEFAULT_NEWSLETTER, ...(data?.newsletter ?? {}) } }); setReady(true);
      });
  }, [ws.id]);
  const save = useCallback(async (next: ContentSettings) => {
    const { error } = await supabase().from("content_settings").upsert({ workspace_id: ws.id, pov: next.pov, newsletter: next.newsletter, updated_at: new Date().toISOString() });
    if (!error) setS(next);
    return error?.message ?? null;
  }, [ws.id]);
  return { settings: s, ready, save };
}

/** Point-of-view bank: what Shashi believes, what he can prove, the numbers and clients he allows. Drafts use only this. */
export function PovModal({ settings, save, onClose }: { settings: ContentSettings; save: (s: ContentSettings) => Promise<string | null>; onClose: () => void }) {
  const { can } = useWorkspace();
  const toast = useToast();
  const ed = can("editor");
  const [p, setP] = useState<Pov>(settings.pov);
  const [n, setN] = useState<Newsletter>(settings.newsletter);
  const [add, setAdd] = useState({ stance: "", proof: "", num: "", ctx: "", client: "" });
  async function done() {
    const err = await save({ pov: p, newsletter: n });
    if (err) { toast(err); return; }
    haptic(); toast("Point of view saved. New drafts use it."); onClose();
  }
  const List = ({ items, onRemove }: { items: React.ReactNode[]; onRemove: (i: number) => void }) => (
    <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">{items.map((x, i) => (
      <li key={i} className="flex items-start gap-2 rounded-lg border border-line bg-white px-3 py-2 text-[13px]"><span className="min-w-0 flex-1">{x}</span>{ed && <button className="text-muted hover:text-[#d64545]" aria-label="Remove" onClick={() => onRemove(i)}><X size={14} /></button>}</li>
    ))}{!items.length && <li className="text-[12.5px] text-muted">Nothing yet.</li>}</ul>
  );
  return (
    <Modal title="Point of view" wide onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button>{ed && <button className="btn btn-primary" onClick={done}>Save</button>}</>}>
      <p className="m-0 mb-4 text-[13px] leading-relaxed text-muted">What Shashi believes, what he can prove and the numbers he allows. Every draft and campaign plan uses only what is here, so nothing is made up. Proof points must be ticked as cleared before the AI may use them.</p>
      <div className="grid gap-5 md:grid-cols-2">
        <section>
          <div className="label">Stances</div>
          <List items={p.stances} onRemove={(i) => setP({ ...p, stances: p.stances.filter((_, j) => j !== i) })} />
          {ed && <div className="mt-2 flex gap-2"><input className="field" placeholder="For example: reconciliation decides who moves first" value={add.stance} onChange={(e) => setAdd({ ...add, stance: e.target.value })} /><button className="btn" aria-label="Add stance" onClick={() => { if (add.stance.trim()) { setP({ ...p, stances: [...p.stances, add.stance.trim()] }); setAdd({ ...add, stance: "" }); } }}><Plus size={14} /></button></div>}
        </section>
        <section>
          <div className="label">Proof points</div>
          <List items={p.proofs.map((x, i) => <label key={i} className="flex items-start gap-2"><input type="checkbox" disabled={!ed} checked={x.cleared} onChange={(e) => setP({ ...p, proofs: p.proofs.map((y, j) => (j === i ? { ...y, cleared: e.target.checked } : y)) })} /><span>{x.text} <span className="text-[11.5px] font-semibold" style={{ color: x.cleared ? "#141414" : "#d64545" }}>{x.cleared ? "Cleared" : "Not cleared"}</span></span></label>)} onRemove={(i) => setP({ ...p, proofs: p.proofs.filter((_, j) => j !== i) })} />
          {ed && <div className="mt-2 flex gap-2"><input className="field" placeholder="For example: Antier since 2011" value={add.proof} onChange={(e) => setAdd({ ...add, proof: e.target.value })} /><button className="btn" aria-label="Add proof point" onClick={() => { if (add.proof.trim()) { setP({ ...p, proofs: [...p.proofs, { text: add.proof.trim(), cleared: false }] }); setAdd({ ...add, proof: "" }); } }}><Plus size={14} /></button></div>}
        </section>
        <section>
          <div className="label">Numbers he allows</div>
          <List items={p.numbers.map((x) => <span key={x.value}><b className="num">{x.value}</b> <span className="text-muted">{x.context}</span></span>)} onRemove={(i) => setP({ ...p, numbers: p.numbers.filter((_, j) => j !== i) })} />
          {ed && <div className="mt-2 flex gap-2"><input className="field w-[110px]" placeholder="38 seconds" value={add.num} onChange={(e) => setAdd({ ...add, num: e.target.value })} /><input className="field" placeholder="What it measures, and the source" value={add.ctx} onChange={(e) => setAdd({ ...add, ctx: e.target.value })} /><button className="btn" aria-label="Add number" onClick={() => { if (add.num.trim()) { setP({ ...p, numbers: [...p.numbers, { value: add.num.trim(), context: add.ctx.trim() }] }); setAdd({ ...add, num: "", ctx: "" }); } }}><Plus size={14} /></button></div>}
        </section>
        <section>
          <div className="label">Clients he may name</div>
          <List items={p.clients} onRemove={(i) => setP({ ...p, clients: p.clients.filter((_, j) => j !== i) })} />
          {ed && <div className="mt-2 flex gap-2"><input className="field" placeholder="Only with their permission" value={add.client} onChange={(e) => setAdd({ ...add, client: e.target.value })} /><button className="btn" aria-label="Add client" onClick={() => { if (add.client.trim()) { setP({ ...p, clients: [...p.clients, add.client.trim()] }); setAdd({ ...add, client: "" }); } }}><Plus size={14} /></button></div>}
        </section>
      </div>
      <section className="mt-6 rounded-xl border border-line p-4">
        <div className="label">LinkedIn newsletter</div>
        <p className="m-0 mt-1 text-[12.5px] text-muted">Articles marked for the newsletter get their own rhythm in Plan. Subscribers are notified, and long articles are what AI tools cite most.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1"><span className="label">Name</span><input className="field" disabled={!ed} placeholder="Operator Notes" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} /></label>
          <label className="flex flex-col gap-1"><span className="label">Every</span><select className="field" disabled={!ed} value={n.cadence} onChange={(e) => setN({ ...n, cadence: e.target.value as Newsletter["cadence"], start: n.start || today() })}><option value="weekly">Week</option><option value="fortnightly">Two weeks</option><option value="monthly">Four weeks</option></select></label>
          <label className="flex flex-col gap-1"><span className="label">On</span><select className="field" disabled={!ed} value={n.weekday} onChange={(e) => setN({ ...n, weekday: Number(e.target.value), start: n.start || today() })}>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></label>
        </div>
        {n.name && <p className="m-0 mt-2 text-[12.5px]">Next issue: <b>{fmtDay(nextIssue(n, today()), { weekday: "long", day: "numeric", month: "long" })}</b></p>}
      </section>
    </Modal>
  );
}
