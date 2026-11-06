"use client";
// Side panels for the Strategy canvas: View (the full description and every value), Edit (typed fields per node
// type), New strategy (templates), and the small confirm and rename dialogs.
import { SwitchRow } from "@/components/switch";
import Link from "next/link";
import { useEffect, useState } from "react";
import { X, Plus, ArrowUpRight } from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import { Modal } from "@/components/content/shared";
import {
  NODE_META, FACTS, OP_LABEL, ACTIONS, SEG_KEYS, WEEKDAYS, CONTENT_FORMATS, HEAT_ORDER, DAYS, TEMPLATES, cleanConfig, subtitleOf, affectsOf, affectsLine,
  type StrategyNode, type NodeType, type Quotas, type GoalConfig, type AudienceConfig, type ContentPlan, type CommentRules, type ConditionConfig, type ActionConfig,
} from "@/lib/strategy";
import { NodeIcon, badgeStyle } from "./icons";

const STAGES_ALL = ["Target", "Warming", "Requested", "Connected", "In conversation", "Resource sent", "Call booked", "Won", "Parked"];
/** Where each "Affects" item lives in Prax, for the View panel's links. */
const WHERE: Record<string, string> = {
  "Dashboard targets": "", Dashboard: "", "Today quota": "/today", Today: "/today", "Today order": "/today", "Pipeline segments": "/pipeline", "Pipeline next step": "/pipeline", "Pipeline touch plan": "/pipeline",
  "Discovery buyer fit": "/discovery", "Discovery priority": "/discovery", "Discovery geography": "/discovery", Discovery: "/discovery", "Content Studio": "/studio-content", "Content Studio angles": "/studio-content",
  "Content Studio angle": "/studio-content", "Content Studio plan": "/studio-content?tab=plan", Campaigns: "/studio-content?tab=campaigns", "AI citations": "/citations", "Comment Studio": "/studio", "Extension voice": "/extension",
};

function Panel({ title, kicker, type, onClose, children, footer }: { title: string; kicker: string; type: NodeType; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <>
      <div className="fixed inset-0 z-[54] bg-[rgba(20,20,20,.22)]" onClick={onClose} />
      <aside role="dialog" aria-label={title} className="pl-slide fixed inset-y-0 right-0 z-[55] flex w-[min(480px,100vw)] flex-col bg-white shadow-[-12px_0_30px_rgba(20,20,20,.12)]">
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={badgeStyle(type)}><NodeIcon type={type} size={16} /></span>
          <span className="flex min-w-0 flex-1 flex-col justify-center self-stretch">{kicker !== title && <span className="text-meta font-medium text-muted">{kicker}</span>}<span className="truncate text-title font-semibold leading-snug">{title}</span></span>
          <button type="button" className="btn h-8 w-8 shrink-0 p-0" aria-label="Close" onClick={onClose}><X size={15} /></button>
        </header>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </aside>
    </>
  );
}

const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[140px_1fr] gap-3 border-b border-line py-2.5 text-body last:border-0 max-sm:grid-cols-1 max-sm:gap-0.5"><span className="text-muted">{k}</span><span className="min-w-0 break-words">{children}</span></div>
);
const none = <span className="text-muted">None</span>;

/** Every value of a node, as rows. */
export function Details({ type, c, segNames }: { type: NodeType; c: Record<string, any>; segNames: Record<string, string> }) {
  switch (type) {
    case "goal": { const g = c as GoalConfig; return <><Row k="Goal">{g.text ? <span className="whitespace-pre-line">{g.text}</span> : none}</Row><Row k="Calls a month"><span className="num">{g.calls_month ?? "Not set"}</span></Row><Row k="Comments a week"><span className="num">{g.comments_week ?? "Daily quota × 5"}</span></Row><Row k="Posts a month"><span className="num">{g.posts_month ?? "Not set"}</span></Row></>; }
    case "audience": { const a = c as AudienceConfig; const total = SEG_KEYS.reduce((s, k) => s + a.segments[k].weight, 0); return <>{SEG_KEYS.map((k) => <Row key={k} k={`${k} · ${a.segments[k].name || segNames[k]}`}><span className="num">{a.segments[k].weight ? `${a.segments[k].weight}${total ? ` (${Math.round((a.segments[k].weight / total) * 100)}% of the weight)` : ""}` : "Not weighted"}</span></Row>)}</>; }
    case "pillars": return <Row k="Pillars">{c.pillars.length ? <span className="flex flex-wrap gap-1.5">{c.pillars.map((p: string) => <span key={p} className="chip">{p}</span>)}</span> : none}</Row>;
    case "regions": return <Row k="Regions">{c.regions.length ? <span className="flex flex-wrap gap-1.5">{c.regions.map((p: string) => <span key={p} className="chip">{p}</span>)}</span> : none}</Row>;
    case "quota": { const q = c as Quotas; return <><Row k="Comments"><span className="num">{q.comment}</span></Row><Row k="Connection requests"><span className="num">{q.request}</span></Row><Row k="Messages"><span className="num">{q.dm}</span></Row><Row k="InMail"><span className="num">{q.inmail}</span> <span className="text-muted">weekdays only</span></Row><Row k="Reply rounds"><span className="num">{q.reply}</span></Row></>; }
    case "content": { const p = c as ContentPlan; return <><Row k="Posts a week"><span className="num">{p.ppw}</span></Row><Row k="Days">{p.days.length ? p.days.map((d) => WEEKDAYS[d]).join(", ") : "Mon, Wed and Fri first"}</Row><Row k="Formats">{p.formats.length ? p.formats.join(", ") : "From the campaign objective"}</Row></>; }
    case "comments": { const r = c as CommentRules; return <><Row k="Length">{r.length === "short" ? "Short, 35 to 50 words" : r.length === "long" ? "Long, 70 to 90 words" : "Medium, 50 to 70 words"}</Row><Row k="Tone"><span className="capitalize">{r.tone}</span></Row><Row k="End with a question"><span className="capitalize">{r.question}</span></Row><Row k="Drafts a day, at most"><span className="num">{r.dailyCap}</span></Row><Row k="Voice">{r.voice ? <span className="line-clamp-6 whitespace-pre-line text-meta leading-relaxed">{r.voice}</span> : none}</Row></>; }
    case "condition": return <Row k="Test">{subtitleOf("condition", c, segNames)}</Row>;
    case "action": return <Row k="Does">{subtitleOf("action", c)}</Row>;
    case "note": return <Row k="Text">{c.text ? <span className="whitespace-pre-line">{c.text}</span> : none}</Row>;
  }
}

export function ViewPanel({ node, values, nodes, active, segNames, editable, onEdit, onClose }: { node: StrategyNode; values: Record<string, any>; nodes: StrategyNode[]; active: boolean; segNames: Record<string, string>; editable: boolean; onEdit: () => void; onClose: () => void }) {
  const { ws } = useWorkspace();
  const meta = NODE_META[node.type];
  const aff = affectsOf(node, nodes);
  return (
    <Panel title={node.title || meta.title} kicker={meta.label} type={node.type} onClose={onClose}
      footer={<><span className="text-meta text-muted">{meta.settings ? (active ? "Shows the live settings" : "Draft values, applied when set active") : node.type === "note" ? "For reference" : active ? "In use by the rules" : "Draft"}</span>{editable && <button type="button" className="btn h-9 px-3.5" onClick={onEdit}>Edit</button>}</>}>
      <p className="m-0 text-body leading-relaxed text-ink-2">{meta.describe}</p>
      <section><h3 className="mb-1 text-body font-semibold">Details</h3><div><Details type={node.type} c={values} segNames={segNames} /></div></section>
      <section>
        <h3 className="mb-2 text-body font-semibold">What it changes</h3>
        {aff.length ? <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{aff.map((a) => (
          <li key={a}><Link href={`/w/${ws.slug}${WHERE[a] ?? ""}`} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-body hover:border-line-strong hover:bg-surface-2">{a}<ArrowUpRight size={14} className="text-muted" /></Link></li>
        ))}</ul> : <p className="m-0 text-body text-muted">{affectsLine(aff)}.</p>}
        {!active && aff.length > 0 && <p className="mb-0 mt-2 text-meta text-muted">This strategy is a draft, so these change only once it is set active.</p>}
      </section>
    </Panel>
  );
}

// ---------- edit ----------
const F = ({ label, children, hint, wide = true }: { label: string; children: React.ReactNode; hint?: string; wide?: boolean }) => (
  <label className={`flex flex-col gap-1 ${wide ? "col-span-2" : "max-sm:col-span-2"}`}><span className="label">{label}</span>{children}{hint && <span className="text-meta text-muted">{hint}</span>}</label>
);
const num = (v: string) => (v === "" ? null : Number(v));

export function EditPanel({ node, nodes, values, active, ownerNeeded, templates, segNames, onSave, onClose }: {
  node: StrategyNode; nodes: StrategyNode[]; values: Record<string, any>; active: boolean; ownerNeeded: boolean; templates: string[]; segNames: Record<string, string>;
  onSave: (p: { title: string; config: Record<string, any>; editor_only: boolean }) => Promise<boolean>; onClose: () => void;
}) {
  const { can } = useWorkspace();
  const meta = NODE_META[node.type];
  const [title, setTitle] = useState(node.title || meta.title);
  const [c, setC] = useState<Record<string, any>>(values);
  const [eo, setEo] = useState(node.editor_only);
  const [busy, setBusy] = useState(false);
  const locked = ownerNeeded;
  const set = (k: string, v: unknown) => setC((x) => ({ ...x, [k]: v }));
  const clean = cleanConfig(node.type, c);
  const changed = title !== (node.title || meta.title) || eo !== node.editor_only || JSON.stringify(clean) !== JSON.stringify(cleanConfig(node.type, values));
  async function save() { setBusy(true); const ok = await onSave({ title: title.trim() || meta.title, config: clean, editor_only: eo }); setBusy(false); if (ok) onClose(); }
  const aff = affectsOf({ ...node, config: clean }, nodes);
  return (
    <Panel title={title || meta.title} kicker={`Edit ${meta.label.toLowerCase()}`} type={node.type} onClose={onClose}
      footer={<><span className="min-w-0 flex-1 text-meta text-muted">{locked ? "Only an owner can change profile settings." : meta.settings && active ? `Saving updates ${aff.join(", ")}.` : meta.settings ? "Saved to this draft. Applied when it is set active." : affectsLine(aff) + "."}</span>
        <span className="flex gap-2"><button type="button" className="btn h-9 px-3.5" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary h-9 px-3.5" disabled={!changed || busy || locked} onClick={save}>{busy ? "Saving" : "Save"}</button></span></>}>
      <fieldset disabled={locked} className="grid grid-cols-2 gap-3">
        <F label="Name" hint="The final name, shown on the card."><input className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} /></F>
        {node.type === "goal" && <>
          <F label="Goal"><textarea className="field h-auto py-2" rows={3} value={c.text} onChange={(e) => set("text", e.target.value)} placeholder="What this month is for, in a sentence" /></F>
          <F label="Calls a month" wide={false}><input type="number" min={0} className="field num" value={c.calls_month ?? ""} onChange={(e) => set("calls_month", num(e.target.value))} /></F>
          <F label="Comments a week" wide={false}><input type="number" min={0} className="field num" value={c.comments_week ?? ""} onChange={(e) => set("comments_week", num(e.target.value))} placeholder="Daily quota × 5" /></F>
          <F label="Posts a month" wide={false}><input type="number" min={0} className="field num" value={c.posts_month ?? ""} onChange={(e) => set("posts_month", num(e.target.value))} /></F>
        </>}
        {node.type === "audience" && <div className="col-span-2 flex flex-col gap-2">
          <span className="grid grid-cols-[16px_1fr_84px] gap-2 text-meta font-medium text-muted"><span /><span>Segment name</span><span>Weight</span></span>
          {SEG_KEYS.map((k) => (
            <span key={k} className="grid grid-cols-[16px_1fr_84px] items-center gap-2">
              <span className="num text-meta font-semibold text-muted">{k}</span>
              <input className="field" aria-label={`Segment ${k} name`} value={c.segments[k].name} placeholder={segNames[k]} onChange={(e) => set("segments", { ...c.segments, [k]: { ...c.segments[k], name: e.target.value } })} />
              <input type="number" min={0} max={100} className="field num" aria-label={`Segment ${k} weight`} value={c.segments[k].weight} onChange={(e) => set("segments", { ...c.segments, [k]: { ...c.segments[k], weight: Number(e.target.value) } })} />
            </span>
          ))}
          <span className="text-meta text-muted">Heavier segments come first on Today and count as buyers in Discovery. A weight of 0 leaves a segment out.</span>
        </div>}
        {(node.type === "pillars" || node.type === "regions") && <ListField label={node.type === "pillars" ? "Pillars" : "Focus regions"} items={c[node.type]} onChange={(xs) => set(node.type, xs)} placeholder={node.type === "pillars" ? "For example: Agentic Finance" : "For example: UAE"} />}
        {node.type === "quota" && [["comment", "Comments"], ["request", "Connection requests"], ["dm", "Messages"], ["inmail", "InMail"], ["reply", "Reply rounds"]].map(([k, l]) => (
          <F key={k} label={l} wide={false}><input type="number" min={0} max={50} className="field num" value={(c as Quotas)[k as keyof Quotas]} onChange={(e) => set(k, Number(e.target.value))} /></F>
        ))}
        {node.type === "content" && <>
          <div className="col-span-2 flex flex-col gap-1.5"><span className="label">Days</span>
            <span className="flex flex-wrap gap-1.5">{WEEKDAYS.map((d, i) => <Toggle key={d} on={c.days.includes(i)} onClick={() => set("days", c.days.includes(i) ? c.days.filter((x: number) => x !== i) : [...c.days, i].sort())}>{d}</Toggle>)}</span>
            <span className="text-meta text-muted">{c.days.length ? `${c.days.length} ${c.days.length === 1 ? "post" : "posts"} a week.` : "No days chosen: campaigns use Mon, Wed and Fri first."}</span></div>
          {!c.days.length && <F label="Posts a week" wide={false}><input type="number" min={1} max={5} className="field num" value={c.ppw} onChange={(e) => set("ppw", Number(e.target.value))} /></F>}
          <div className="col-span-2 flex flex-col gap-1.5"><span className="label">Formats</span>
            <span className="flex flex-wrap gap-1.5">{CONTENT_FORMATS.map((f) => <Toggle key={f} on={c.formats.includes(f)} onClick={() => set("formats", c.formats.includes(f) ? c.formats.filter((x: string) => x !== f) : [...c.formats, f])}>{f}</Toggle>)}</span></div>
        </>}
        {node.type === "comments" && <>
          <F label="Length" wide={false}><select className="field" value={c.length} onChange={(e) => set("length", e.target.value)}><option value="short">Short, 35 to 50 words</option><option value="medium">Medium, 50 to 70 words</option><option value="long">Long, 70 to 90 words</option></select></F>
          <F label="Tone" wide={false}><select className="field" value={c.tone} onChange={(e) => set("tone", e.target.value)}><option value="formal">Formal</option><option value="balanced">Balanced</option><option value="warm">Warm</option></select></F>
          <F label="End with a question" wide={false}><select className="field" value={c.question} onChange={(e) => set("question", e.target.value)}><option value="never">Never</option><option value="sometimes">Sometimes</option><option value="always">Always</option></select></F>
          <F label="Drafts a day, at most" wide={false}><input type="number" min={1} max={200} className="field num" value={c.dailyCap} onChange={(e) => set("dailyCap", Number(e.target.value))} /></F>
          {can("editor") && <F label="Comment voice" hint="The rules the extension gives the AI model. Same text as in Settings."><textarea className="field h-auto py-2 text-meta leading-relaxed" rows={8} value={c.voice} onChange={(e) => set("voice", e.target.value)} /></F>}
        </>}
        {node.type === "condition" && <ConditionFields c={c as ConditionConfig} set={set} segNames={segNames} />}
        {node.type === "action" && <ActionFields c={c as ActionConfig} set={set} templates={templates} />}
        {node.type === "note" && <>
          <F label="Text"><textarea className="field h-auto py-2" rows={10} value={c.text} onChange={(e) => set("text", e.target.value)} /></F>
          <SwitchRow className="col-span-2" on={eo} onChange={setEo} label="Editors and owners only" hint="Hidden from viewers and commenters" />
        </>}
      </fieldset>
      {(node.type === "condition" || node.type === "action") && <p className="m-0 rounded-lg bg-surface-2 px-3 py-2.5 text-meta leading-relaxed text-ink-2">{node.type === "condition" ? `${subtitleOf("condition", clean, segNames)}: the Yes lane runs, otherwise the No lane. Anything a rule adds shows "From strategy: ${title || "this rule"}".` : `${subtitleOf("action", clean)}. ${affectsLine(aff)}.`}</p>}
    </Panel>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={`h-8 rounded-lg border px-3 text-meta font-medium ${on ? "border-ink bg-ink text-white" : "border-line-strong bg-white text-ink-2 hover:border-ink"}`}>{children}</button>;
}

function ListField({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (xs: string[]) => void; placeholder: string }) {
  const [v, setV] = useState("");
  const add = () => { const t = v.trim(); if (t && !items.includes(t) && items.length < 8) onChange([...items, t]); setV(""); };
  return (
    <div className="col-span-2 flex flex-col gap-1.5"><span className="label">{label}</span>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{items.map((x, i) => (
        <li key={x} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-body"><span className="min-w-0 flex-1">{x}</span><button type="button" className="text-muted hover:text-[#9e1c1c]" aria-label={`Remove ${x}`} onClick={() => onChange(items.filter((_, j) => j !== i))}><X size={14} /></button></li>
      ))}{!items.length && <li className="text-meta text-muted">None yet.</li>}</ul>
      <span className="flex gap-2"><input className="field" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} aria-label={`Add to ${label.toLowerCase()}`} /><button type="button" className="btn h-[34px]" onClick={add} disabled={!v.trim() || items.length >= 8} aria-label="Add"><Plus size={14} /></button></span>
      <span className="text-meta text-muted">Up to 8.</span>
    </div>
  );
}

function ConditionFields({ c, set, segNames }: { c: ConditionConfig; set: (k: string, v: unknown) => void; segNames: Record<string, string> }) {
  const f = FACTS.find((x) => x.key === c.fact)!;
  const vals = c.value.split(",").map((s) => s.trim()).filter(Boolean);
  const pick = (opts: [string, string][], multi: boolean) => (
    <span className="flex flex-wrap gap-1.5">{opts.map(([v, l]) => <Toggle key={v} on={vals.includes(v)} onClick={() => set("value", multi ? (vals.includes(v) ? vals.filter((x) => x !== v) : [...vals, v]).join(", ") : v)}>{l}</Toggle>)}</span>
  );
  return <>
    <F label="Test" wide={false}><select className="field" value={c.fact} onChange={(e) => { const nf = FACTS.find((x) => x.key === e.target.value)!; set("fact", nf.key); set("op", nf.ops[0]); set("value", nf.key === "warm" || nf.key === "overdue" ? "yes" : ""); }}>{FACTS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></F>
    <F label="Compare" wide={false}><select className="field" value={c.op} onChange={(e) => set("op", e.target.value)} disabled={f.ops.length < 2}>{f.ops.map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}</select></F>
    <div className="col-span-2 flex flex-col gap-1.5"><span className="label">Value</span>
      {c.fact === "segment" ? pick(SEG_KEYS.map((k) => [k, segNames[k] ?? k]), true)
        : c.fact === "stage" ? pick(STAGES_ALL.map((s) => [s, s]), true)
        : c.fact === "heat" ? pick(HEAT_ORDER.map((h) => [h, h]), c.op === "is")
        : c.fact === "day" ? pick(DAYS.map((d) => [d, d]), true)
        : c.fact === "warm" || c.fact === "overdue" ? pick([["yes", "Yes"], ["no", "No"]], false)
        : <input className="field" value={c.value} onChange={(e) => set("value", e.target.value)} placeholder={c.fact === "region" ? "For example: UAE, Saudi Arabia" : "For example: Mashreq"} />}
      <span className="text-meta text-muted">{f.lead ? "Tested for each lead. Where there is no lead (Content Studio), this condition is skipped." : "Tested on the day."}{["segment", "stage", "day", "region", "company"].includes(c.fact) ? " Several values mean any of them." : ""}</span>
    </div>
  </>;
}

function ActionFields({ c, set, templates }: { c: ActionConfig; set: (k: string, v: unknown) => void; templates: string[] }) {
  return <>
    <F label="Does"><select className="field" value={c.kind} onChange={(e) => set("kind", e.target.value)}>{ACTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</select></F>
    {c.kind === "comments" && <F label="Comment tasks a day" wide={false} hint="Added to Today for the leads this lane runs for."><input type="number" min={1} max={20} className="field num" value={c.count ?? 2} onChange={(e) => set("count", Number(e.target.value))} /></F>}
    {c.kind === "template" && <F label="Template" hint={templates.length ? "From Templates. Shown on Today and in the touch plan." : "No templates yet. Add one in Templates."}>
      <select className="field" value={c.template ?? ""} onChange={(e) => set("template", e.target.value)}><option value="">Choose a template</option>{templates.map((t) => <option key={t} value={t}>{t}</option>)}</select></F>}
    {c.kind === "next" && <F label="Next action" hint="Suggested in Pipeline when a lead takes this lane."><input className="field" value={c.text ?? ""} onChange={(e) => set("text", e.target.value)} placeholder="For example: Offer a 20-minute call this week" /></F>}
    {c.kind === "angle" && <F label="Angle" hint="Offered first in Content Studio's angle step."><textarea className="field h-auto py-2" rows={2} value={c.text ?? ""} onChange={(e) => set("text", e.target.value)} placeholder="In one line: what to argue" /></F>}
    {c.kind === "priority" && <p className="col-span-2 m-0 text-meta text-muted">Leads on this lane come first on Today, and Discovery topics that name their company rank higher.</p>}
  </>;
}

// ---------- strategies ----------
export function NewStrategyPanel({ onCreate, onClose, busy }: { onCreate: (key: string, name: string) => void; onClose: () => void; busy: boolean }) {
  const [key, setKey] = useState("authority");
  const [name, setName] = useState("Authority builder");
  return (
    <Modal title="New strategy" onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={!name.trim() || busy} onClick={() => onCreate(key, name.trim())}>{busy ? "Creating" : "Create"}</button></>}>
      <div className="flex flex-col gap-4">
        <div role="radiogroup" aria-label="Start from" className="flex flex-col gap-1.5">
          {TEMPLATES.map((t) => (
            <button key={t.key} type="button" role="radio" aria-checked={key === t.key} onClick={() => { setKey(t.key); setName(t.key === "current" ? "Current settings" : t.name); }}
              className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left ${key === t.key ? "border-ink bg-[#fafafa]" : "border-line hover:border-line-strong"}`}>
              <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full" style={{ border: key === t.key ? "5px solid #d64545" : "1.5px solid #c0c0c0" }} />
              <span className="flex flex-col"><span className="text-body font-semibold">{t.name}</span><span className="text-meta text-muted">{t.sub}</span></span>
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1"><span className="label">Name</span><input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>
        <p className="m-0 text-meta text-muted">Pillars, regions, segment names and the comment voice come from this profile. A template starts as a draft and changes nothing until you set it active; when no strategy is active yet, From current settings and Blank start active, as they change nothing.</p>
      </div>
    </Modal>
  );
}

export function RenameDialog({ name, onSave, onClose }: { name: string; onSave: (n: string) => void; onClose: () => void }) {
  const [v, setV] = useState(name);
  return (
    <Modal title="Rename strategy" onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={!v.trim() || v.trim() === name} onClick={() => onSave(v.trim())}>Save</button></>}>
      <label className="flex flex-col gap-1"><span className="label">Name</span><input autoFocus className="field" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && v.trim()) onSave(v.trim()); }} maxLength={60} /></label>
    </Modal>
  );
}

export function ConfirmDialog({ title, body, confirm, onConfirm, onClose }: { title: string; body: React.ReactNode; confirm: string; onConfirm: () => void; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); onConfirm(); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onConfirm]);
  return (
    <Modal title={title} onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Keep</button><button type="button" autoFocus className="btn btn-dark" onClick={onConfirm}>{confirm}</button></>}>
      <div className="text-body leading-relaxed text-ink-2">{body}</div>
    </Modal>
  );
}
