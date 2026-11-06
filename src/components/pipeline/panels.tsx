"use client";
// The move dialog (every change asks for the next action and date), the Pipelines panel (switch, templates,
// stages, lost reasons), Import (from Network or a CSV read in the browser) and Add lead.
import { useEffect, useMemo, useRef, useState } from "react";
import { X, Check, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import Link from "next/link";
import { useWorkspace, useSegments, SEGMENTS, today as todayYmd } from "@/lib/workspace";
import { firstNameOf } from "@/lib/persona";
import { csvObjects, normCompany, normName, normUrl, seniority } from "@/lib/network";
import { TEMPLATES, addDays, isClosed, moveGate, newPipelineName, planFor, type MoveInput, type Pipeline, type Prospect } from "@/lib/pipeline";
import { useToast, haptic } from "@/components/toaster";
import type { PipelineApi, PipelineData } from "./types";

const QUICK: [number, string][] = [[1, "Tomorrow"], [3, "In 3 days"], [7, "Next week"]];
const label = "flex flex-col gap-1.5 text-meta font-semibold";

function useEscape(fn: () => void) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") fn(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [fn]);
}

function Box({ on, onClick, label: aria }: { on: boolean; onClick: () => void; label: string }) {
  return <button type="button" aria-label={aria} aria-pressed={on} onClick={onClick} className={`grid h-5 w-5 shrink-0 place-items-center rounded-md ${on ? "bg-[#d64545]" : "border-[1.5px] border-[#c4c4c4] bg-white"}`}>{on && <Check size={12} strokeWidth={3} className="text-white" />}</button>;
}

function SidePanel({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  useEscape(onClose);
  return (
    <>
      <div className="fixed inset-0 z-[54] bg-[rgba(20,20,20,.22)]" onClick={onClose} />
      <aside role="dialog" aria-label={title} className="pl-slide fixed inset-y-0 right-0 z-[55] flex w-[min(480px,100vw)] flex-col gap-[22px] overflow-y-auto bg-white p-[22px] shadow-[-12px_0_30px_rgba(20,20,20,.12)] max-sm:px-4">
        <span className="flex items-start justify-between gap-2.5">
          <span className="flex flex-col gap-[3px]"><span className="text-page font-semibold">{title}</span>{sub && <span className="text-body text-muted">{sub}</span>}</span>
          <button type="button" className="btn h-8! w-8! shrink-0 p-0!" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </span>
        {children}
      </aside>
    </>
  );
}

function DuePicker({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const t = todayYmd();
  return (
    <span className={label}>Due
      <span className="flex flex-wrap gap-1.5">
        {QUICK.map(([n, l]) => { const d = addDays(t, n); return <button key={n} type="button" onClick={() => setDate(d)} className={`pl-chip small ${date === d ? "on" : ""}`}>{l}</button>; })}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Due date" className="field h-8! w-auto! font-normal" />
      </span>
    </span>
  );
}

// ---------- move ----------
export function MoveDialog({ lead, pipe, to: start, reasons, onCancel, onConfirm }: { lead: Prospect; pipe: Pipeline; to: string; reasons: string[]; onCancel: () => void; onConfirm: (m: MoveInput) => void }) {
  const [m, setM] = useState<MoveInput>({ to: start, action: "", date: "", reason: "" });
  const ref = useRef<HTMLInputElement>(null);
  useEscape(onCancel);
  useEffect(() => { ref.current?.focus(); }, []);
  const stay = m.to === lead.stage;
  const gate = moveGate(m, pipe, lead.stage);
  const suggest = planFor(pipe, m.to)[0] ?? "";
  const confirm = () => { if (gate.ok) onConfirm({ ...m, action: m.action.trim(), reason: gate.needsReason ? m.reason : "" }); };
  return (
    <div className="fixed inset-0 z-[58] flex items-center justify-center bg-[rgba(20,20,20,.35)] p-4" onMouseDown={onCancel}>
      <form role="dialog" aria-label="Next action" onMouseDown={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); confirm(); }}
        className="pl-rise flex w-[min(460px,100%)] flex-col gap-3.5 rounded-2xl bg-white p-[22px] shadow-[0_24px_60px_rgba(20,20,20,.25)]">
        <span className="flex flex-col gap-[3px]"><span className="text-title font-semibold">{stay ? "Done. What happens next?" : `Move ${lead.name} to ${m.to}`}</span>
          <span className="text-body text-muted">Every change needs the next action and its date, so it shows on Today.</span></span>
        <label className={label}>Stage
          <select value={m.to} onChange={(e) => setM({ ...m, to: e.target.value })} className="field h-[38px]! font-normal">
            {pipe.stages.map((s) => <option key={s} value={s}>{s === lead.stage ? `${s} (current)` : s}</option>)}
          </select></label>
        <label className={label}>Next action
          <input ref={ref} value={m.action} onChange={(e) => setM({ ...m, action: e.target.value })} placeholder="What happens next" className="field h-[38px]! font-normal" /></label>
        {suggest && <button type="button" className="btn h-auto! min-h-[30px]! self-start px-2.5! py-1! text-left text-meta font-medium" disabled={m.action === suggest} onClick={() => setM({ ...m, action: suggest })}>Suggested: {suggest}</button>}
        <DuePicker date={m.date} setDate={(date) => setM({ ...m, date })} />
        {gate.needsReason && <label className={label}>Why it stopped
          <select value={m.reason} onChange={(e) => setM({ ...m, reason: e.target.value })} className="field h-[38px]! font-normal">
            <option value="">Choose a reason</option>{reasons.map((r) => <option key={r} value={r}>{r}</option>)}
          </select></label>}
        <span className="mt-0.5 flex justify-end gap-2">
          <button type="button" className="btn h-[38px]! px-3.5! font-semibold" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary h-[38px]! px-4! font-semibold" disabled={!gate.ok}>{stay ? "Save" : "Move"}</button>
        </span>
      </form>
    </div>
  );
}

// ---------- pipelines, stages, lost reasons ----------
export function PipelinesPanel({ data, api, current, leadsOf, onPick, onClose }: { data: PipelineData; api: PipelineApi; current: Pipeline; leadsOf: (p: Pipeline) => Prospect[]; onPick: (id: string) => void; onClose: () => void }) {
  const { can } = useWorkspace();
  const editable = can("editor") && data.ready;
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  async function create(t: (typeof TEMPLATES)[number]) {
    const r = await api.createPipeline({ name: newPipelineName(t.name, data.pipes.map((p) => p.name)), template: t.key, stages: t.stages, won_stage: t.won, lost_stage: t.lost, sort: data.pipes.length });
    if (!r.ok) { toast(r.error); return; }
    haptic(); const was = current.id; onPick(r.value.id);
    toast(`Pipeline created from the ${t.name} template`, async () => { await api.deletePipeline(r.value.id); onPick(was); });
  }
  async function addReason() {
    const v = reason.trim();
    if (!v || data.reasons.includes(v)) return;
    const r = await api.addReason(v);
    if (!r.ok) { toast(r.error); return; }
    setReason(""); toast("Lost reason added");
  }
  return (
    <SidePanel title="Pipelines" onClose={onClose}>
      <div className="flex flex-col gap-2">
        <span className="text-body font-semibold">Yours</span>
        {data.pipes.map((p) => {
          const n = leadsOf(p).length;
          return (
            <div key={p.id} className="flex flex-col gap-3 rounded-xl border border-[#ececec] px-3.5 py-3">
              <span className="flex items-center gap-3">
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]"><b className="text-body">{p.name} <span className="num font-normal text-muted">{n}</span></b><span className="text-meta leading-[1.45] text-muted">{p.stages.join(" · ")}</span></span>
                {editable && editing !== p.id && <button type="button" className="btn h-8! shrink-0 px-3! text-meta font-semibold" onClick={() => setEditing(p.id)}>Edit stages</button>}
                <button type="button" className="btn h-8! shrink-0 px-3! text-meta font-semibold" disabled={p.id === current.id} onClick={() => onPick(p.id)}>{p.id === current.id ? "Open now" : "Switch"}</button>
              </span>
              {editing === p.id && <StageEditor p={p} leads={leadsOf(p)} api={api} onDone={() => setEditing(null)} canDelete={!n && data.pipes.length > 1} onDeleted={() => { setEditing(null); if (p.id === current.id) onPick(data.pipes.find((x) => x.id !== p.id)!.id); }} />}
            </div>
          );
        })}
        {!data.ready && <span className="text-meta text-muted">More pipelines, stage edits and saved lost reasons need the database update in db/015_pipelines.sql.</span>}
        {data.ready && <span className="text-meta text-muted">Rename, add and reorder stages from Edit stages. Every lead stays where it is.</span>}
      </div>
      {editable && <div className="flex flex-col gap-2">
        <span className="text-body font-semibold">New from a template</span>
        {TEMPLATES.map((t) => (
          <span key={t.key} className="flex items-center gap-3 border-t border-[#f0f0f0] py-2.5">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5"><b className="text-body">{t.name}</b><span className="text-meta leading-[1.45] text-muted">{t.stages.join(" · ")}</span></span>
            <button type="button" className="btn h-8! shrink-0 px-3! text-meta font-semibold" onClick={() => create(t)}>Create</button>
          </span>
        ))}
      </div>}
      <div className="flex flex-col gap-2">
        <span className="flex flex-col gap-0.5"><span className="text-body font-semibold">Lost reasons</span><span className="text-meta text-muted">Asked whenever someone moves to Parked, Passed or Declined.</span></span>
        {data.reasons.map((r) => (
          <span key={r} className="flex items-center justify-between gap-2.5 border-t border-[#f0f0f0] py-2 text-body"><span>{r}</span><span className="num text-meta text-muted">{data.leads.filter((l) => l.lost_reason === r).length}</span></span>
        ))}
        {can("editor") && <span className="flex gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addReason()} placeholder="Add a reason" aria-label="New lost reason" className="field h-9! min-w-0 flex-1" />
          <button type="button" className="btn btn-dark h-9! px-3.5! font-semibold" disabled={!reason.trim()} onClick={addReason}>Add</button>
        </span>}
      </div>
    </SidePanel>
  );
}

function StageEditor({ p, leads, api, onDone, canDelete, onDeleted }: { p: Pipeline; leads: Prospect[]; api: PipelineApi; onDone: () => void; canDelete: boolean; onDeleted: () => void }) {
  const toast = useToast();
  const [items, setItems] = useState(p.stages.map((s) => ({ orig: s as string | null, name: s })));
  const [busy, setBusy] = useState(false);
  const names = items.map((x) => x.name.trim());
  const bad = names.some((n) => !n) || new Set(names).size !== names.length || names.length < 2;
  const swap = (i: number, j: number) => { const a = items.slice(); [a[i], a[j]] = [a[j], a[i]]; setItems(a); };
  async function save() {
    setBusy(true);
    const renames = items.filter((x) => x.orig && x.name.trim() !== x.orig).map((x) => [x.orig!, x.name.trim()] as [string, string]);
    const r = await api.saveStages(p, names, renames);
    setBusy(false);
    if (!r.ok) { toast(r.error); return; }
    haptic(); toast("Stages saved"); onDone();
  }
  async function del() {
    const r = await api.deletePipeline(p.id);
    if (!r.ok) { toast(r.error); return; }
    toast(`${p.name} deleted`); onDeleted();
  }
  return (
    <div className="flex flex-col gap-2 border-t border-[#f0f0f0] pt-3">
      {items.map((x, i) => {
        const used = x.orig ? leads.filter((l) => l.stage === x.orig).length : 0;
        return (
          <span key={i} className="flex items-center gap-1.5">
            <input value={x.name} onChange={(e) => setItems(items.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} aria-label={`Stage ${i + 1}`} className="field h-8! min-w-0 flex-1" />
            {x.orig === p.won_stage && <span className="text-meta text-muted">Won</span>}
            {x.orig === p.lost_stage && <span className="text-meta text-muted">Lost</span>}
            <button type="button" className="btn btn-ghost h-8! w-8! p-0!" aria-label="Move up" disabled={!i} onClick={() => swap(i, i - 1)}><ArrowUp size={14} /></button>
            <button type="button" className="btn btn-ghost h-8! w-8! p-0!" aria-label="Move down" disabled={i === items.length - 1} onClick={() => swap(i, i + 1)}><ArrowDown size={14} /></button>
            <button type="button" className="btn btn-ghost h-8! w-8! p-0!" aria-label={used ? `${used} leads are in this stage` : "Remove stage"} title={used ? `${used} leads are in this stage` : "Remove stage"} disabled={!!used} onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
          </span>
        );
      })}
      <span className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn h-8! px-3! text-meta font-semibold" onClick={() => setItems([...items, { orig: null, name: "" }])}>Add stage</button>
        {canDelete && <button type="button" className="btn btn-ghost h-8! px-3! text-meta hover:text-[#9e1c1c]" onClick={del}>Delete pipeline</button>}
        <span className="ml-auto flex gap-2">
          <button type="button" className="btn h-8! px-3! text-meta font-semibold" onClick={onDone}>Cancel</button>
          <button type="button" className="btn btn-primary h-8! px-3! text-meta font-semibold" disabled={bad || busy} onClick={save}>Save stages</button>
        </span>
      </span>
    </div>
  );
}

// ---------- import ----------
export function ImportPanel({ data, api, pipe, onClose }: { data: PipelineData; api: PipelineApi; pipe: Pipeline; onClose: () => void }) {
  const { ws } = useWorkspace();
  const toast = useToast();
  const first = pipe.stages[0];
  const t = todayYmd();
  const known = useMemo(() => {
    const urls = new Set(data.leads.map((l) => normUrl(l.linkedin)).filter(Boolean));
    const names = new Set(data.leads.map((l) => `${normName(l.name)}|${normCompany(l.company)}`));
    const plain = new Set(data.leads.map((l) => normName(l.name)));
    return { has: (name: string, company: string, url: string) => (!!url && urls.has(normUrl(url))) || names.has(`${normName(name)}|${normCompany(company)}`), plain };
  }, [data.leads]);
  const segOf = useMemo(() => new Map(data.leads.filter((l) => l.company).map((l) => [normCompany(l.company), { segment: l.segment, region: l.region }])), [data.leads]);

  // People you know at companies already in a pipeline, not in one themselves.
  const net = useMemo(() => data.network.filter((x) => x.is_connection && !x.prospect_id && segOf.has(normCompany(x.company)) && !known.plain.has(normName(x.name)))
    .sort((a, b) => seniority(a.position) - seniority(b.position) || a.name.localeCompare(b.name)).slice(0, 8), [data.network, segOf, known]);
  const [pick, setPick] = useState<string[]>([]);
  const [csv, setCsv] = useState<{ file: string; rows: Partial<Prospect>[]; skipped: number } | null>(null);
  const [csvErr, setCsvErr] = useState("");
  const base = (company: string): Partial<Prospect> => ({ stage: first, next_action: planFor(pipe, first)[0] ?? "", next_date: addDays(t, 1), ...(data.ready ? { pipeline_id: pipe.id } : {}), ...(segOf.get(normCompany(company)) ?? {}) });

  async function add(rows: Partial<Prospect>[], after?: (ids: string[]) => Promise<void>) {
    const r = await api.add(rows);
    if (!r.ok) { toast(r.error); return; }
    if (after) await after(r.value);
    haptic(); onClose();
    toast(`${r.value.length} ${r.value.length === 1 ? "person" : "people"} added to ${pipe.name} at ${first}`, () => { api.remove(r.value); });
  }
  function addNet() {
    const people = net.filter((x) => pick.includes(x.key));
    add(people.map((x) => ({ ...base(x.company), name: x.name, role: x.position, company: x.company, linkedin: x.url, warmth: "warm", why: "Added from Network" })),
      (ids) => api.linkNetwork(people.map((x, i) => ({ key: x.key, prospectId: ids[i] })).filter((x) => x.prospectId)));
  }
  function readCsv(f: File) {
    setCsvErr("");
    const rd = new FileReader();
    rd.onload = () => {
      const objs = csvObjects(String(rd.result), "name");
      if (!objs.length) { setCsv(null); setCsvErr(`${f.name}: no "name" column found.`); return; }
      const rows: Partial<Prospect>[] = []; let skipped = 0;
      for (const o of objs) {
        const name = o.name?.trim(); if (!name) { skipped++; continue; }
        const company = o.company ?? "", linkedin = o.linkedin || o["linkedin url"] || o.url || "";
        if (known.has(name, company, linkedin) || rows.some((r) => normName(r.name!) === normName(name) && normCompany(r.company ?? "") === normCompany(company))) { skipped++; continue; }
        const seg = (o.segment ?? "").trim().toUpperCase();
        rows.push({ ...base(company), name, role: o.role || o.title || o.position || "", company, linkedin, region: o.region ?? "", ...(SEGMENTS[seg] ? { segment: seg } : {}), why: "Imported from CSV" });
      }
      setCsv({ file: f.name, rows, skipped });
    };
    rd.onerror = () => setCsvErr("Could not read that file.");
    rd.readAsText(f);
  }
  return (
    <SidePanel title="Add leads" sub={`Into ${pipe.name}, at ${first}.`} onClose={onClose}>
      <div className="flex flex-col gap-2.5">
        <span className="flex flex-col gap-0.5"><span className="text-body font-semibold">From Network</span><span className="text-meta text-muted">People {firstNameOf(ws)} knows at target accounts who are not in a pipeline yet.</span></span>
        {!data.network.length ? <span className="text-body text-muted">No LinkedIn export yet. <Link href={`/w/${ws.slug}/network`} className="font-semibold text-ink underline">Upload it in Network</Link> to add people {firstNameOf(ws)} knows.</span>
          : !net.length ? <span className="text-body text-muted">None. Everyone {firstNameOf(ws)} knows at these companies is already in a pipeline.</span>
          : net.map((x) => {
            const on = pick.includes(x.key);
            return (
              <span key={x.key} className="flex items-center gap-2.5 rounded-[10px] border border-[#ececec] px-3 py-2.5">
                <Box on={on} label={`Select ${x.name}`} onClick={() => setPick(on ? pick.filter((k) => k !== x.key) : [...pick, x.key])} />
                <span className="min-w-0 flex-1"><b className="text-body">{x.name}</b><span className="block truncate text-meta text-muted">{x.position} · {x.company}</span></span>
                <span className="whitespace-nowrap text-meta text-muted">{x.msg_count ? `${x.msg_count} messages` : "Connected"}</span>
              </span>
            );
          })}
        {net.length > 0 && <button type="button" className="btn btn-primary h-9! self-start px-3.5! font-semibold" disabled={!pick.length} onClick={addNet}>{pick.length ? `Add ${pick.length} to ${first}` : "Select people to add"}</button>}
      </div>
      <span className="h-px bg-[#ececec]" />
      <div className="flex flex-col gap-2.5">
        <span className="flex flex-col gap-0.5"><span className="text-body font-semibold">From a CSV file</span><span className="text-meta text-muted">Columns: name (required), role, company, linkedin, segment, region. People already in a pipeline are skipped.</span></span>
        <label className="relative flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-[#d0d0d0] p-[22px] text-center focus-within:outline-2 focus-within:outline-[#d64545] hover:border-[#141414]">
          <span className="font-semibold">Choose a CSV file</span>
          <span className="text-meta text-muted">{csvErr || (csv ? `${csv.file}: ${csv.rows.length} new, ${csv.skipped} skipped.` : "Read here in your browser. Nothing is added until you confirm.")}</span>
          <input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) readCsv(f); e.target.value = ""; }} className="absolute h-px w-px opacity-0" />
        </label>
        {csv && csv.rows.length > 0 && <>
          <ul className="flex flex-col text-body">{csv.rows.slice(0, 6).map((r, i) => <li key={i} className="truncate border-t border-[#f0f0f0] py-1.5"><b className="font-semibold">{r.name}</b>{r.company ? <span className="text-muted"> · {r.company}</span> : null}</li>)}
            {csv.rows.length > 6 && <li className="border-t border-[#f0f0f0] py-1.5 text-muted">and {csv.rows.length - 6} more</li>}</ul>
          <button type="button" className="btn btn-primary h-9! self-start px-3.5! font-semibold" onClick={() => add(csv.rows)}>Add {csv.rows.length} to {first}</button>
        </>}
      </div>
    </SidePanel>
  );
}

// ---------- add one ----------
export function AddLeadPanel({ data, api, pipe, onClose, onAdded }: { data: PipelineData; api: PipelineApi; pipe: Pipeline; onClose: () => void; onAdded: (id: string) => void }) {
  const segs = useSegments();
  const toast = useToast();
  const open = pipe.stages.filter((s) => !isClosed(pipe, s));
  const [f, setF] = useState({ name: "", role: "", company: "", linkedin: "", segment: "", region: "", stage: open[0] ?? pipe.stages[0], next_action: "", next_date: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const suggest = planFor(pipe, f.stage)[0] ?? "";
  const ready = f.name.trim() && f.next_action.trim() && f.next_date;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    const r = await api.add([{ ...f, name: f.name.trim(), next_action: f.next_action.trim(), ...(data.ready ? { pipeline_id: pipe.id } : {}) }]);
    if (!r.ok) { toast(r.error); return; }
    haptic(); toast(`${f.name.trim()} added to ${pipe.name} at ${f.stage}`, () => { api.remove(r.value); });
    onAdded(r.value[0]);
  }
  return (
    <SidePanel title="Add lead" sub={`Into ${pipe.name}. The next action goes on Today.`} onClose={onClose}>
      <form onSubmit={save} className="grid grid-cols-2 gap-3">
        <label className={`${label} col-span-2`}>Name<input autoFocus className="field h-9! font-normal" value={f.name} onChange={set("name")} /></label>
        <label className={`${label} max-sm:col-span-2`}>Role<input className="field h-9! font-normal" value={f.role} onChange={set("role")} /></label>
        <label className={`${label} max-sm:col-span-2`}>Company<input className="field h-9! font-normal" value={f.company} onChange={set("company")} /></label>
        <label className={`${label} max-sm:col-span-2`}>Segment<select className="field h-9! font-normal" value={f.segment} onChange={set("segment")}><option value="">None</option>{Object.entries(segs).map(([k, v]) => <option key={k} value={k}>{v.label.replace("&", "and")}</option>)}</select></label>
        <label className={`${label} max-sm:col-span-2`}>Region<input className="field h-9! font-normal" value={f.region} onChange={set("region")} /></label>
        <label className={`${label} col-span-2`}>LinkedIn URL<input className="field h-9! font-normal" value={f.linkedin} onChange={set("linkedin")} placeholder="https://www.linkedin.com/in/" /></label>
        <label className={`${label} col-span-2`}>Stage<select className="field h-9! font-normal" value={f.stage} onChange={set("stage")}>{open.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className={`${label} col-span-2`}>Next action<input className="field h-9! font-normal" value={f.next_action} onChange={set("next_action")} placeholder="What happens next" /></label>
        {suggest && <button type="button" className="btn col-span-2 h-auto! min-h-[30px]! justify-self-start px-2.5! py-1! text-left text-meta font-medium" disabled={f.next_action === suggest} onClick={() => setF({ ...f, next_action: suggest })}>Suggested: {suggest}</button>}
        <span className="col-span-2"><DuePicker date={f.next_date} setDate={(next_date) => setF({ ...f, next_date })} /></span>
        <span className="col-span-2 flex justify-end gap-2">
          <button type="button" className="btn h-[38px]! px-3.5! font-semibold" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary h-[38px]! px-4! font-semibold" disabled={!ready}>Add lead</button>
        </span>
      </form>
    </SidePanel>
  );
}
