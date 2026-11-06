"use client";
// The lead panel: the next action and its buttons first, then the stage bar with days per stage, then
// collapsible sections. Full view widens it with every section open. Nothing here sends anything on LinkedIn.
import { useCallback, useEffect, useState } from "react";
import { X, ExternalLink, Check } from "lucide-react";
import { useWorkspace, useSegments, today as todayYmd } from "@/lib/workspace";
import { companyOf, whoLine } from "@/lib/persona";
import { normName } from "@/lib/network";
import { daysPerStage, daysIn, dueLong, dueTone, fmtShort, isClosed, planFor, stepStage, stepKey, messagePrompt, templateMessage, daysBetween, type Pipeline, type Prospect } from "@/lib/pipeline";
import { useToast, haptic } from "@/components/toaster";
import { HEAT_DOT, ownerName, type LeadInfo } from "./screen";
import type { LeadDetail, PipelineApi, PipelineData } from "./types";

type Ev = { at: string; text: string; strong: boolean };
const localDay = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const ago = (iso: string, t: string) => {
  const d = daysBetween(localDay(iso), t);
  return d <= 0 ? "Today" : d === 1 ? "Yesterday" : d < 30 ? `${d} days ago` : fmtShort(iso).replace(/^\w+ /, "");
};
const SECS = ["timeline", "warm", "plan", "heat", "notes", "msg", "details"] as const;
type Sec = (typeof SECS)[number];

export function LeadPanel({ lead, pipe, info, data, api, onMove, onClose, dialogOpen, logged }: {
  lead: Prospect; pipe: Pipeline; info?: LeadInfo; data: PipelineData; api: PipelineApi; onMove: (to: string) => void; onClose: () => void; dialogOpen: boolean; logged: number;
}) {
  const segs = useSegments();
  const { ws, can } = useWorkspace();
  const editable = can("editor");
  const toast = useToast();
  const t = todayYmd();
  const [wide, setWide] = useState(false);
  const [open, setOpen] = useState<Partial<Record<Sec, boolean>>>({});
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [note, setNote] = useState("");

  const reload = useCallback(() => { api.detail(lead).then(setDetail).catch(() => setDetail({ moves: [], items: [], notes: [] })); }, [api, lead]);
  useEffect(() => { setDetail(null); setDraft(""); setOpen({}); setNotes(lead.notes ?? ""); }, [lead.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [lead.id, logged]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !dialogOpen) onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose, dialogOpen]);

  const closed = isClosed(pipe, lead.stage);
  const next = stepStage(pipe, lead.stage, 1);
  const ci = pipe.stages.indexOf(lead.stage);
  const now = new Date().toISOString();
  const days = detail ? daysPerStage(detail.moves, lead, now) : {};
  const here = daysIn(lead, now);
  const first = lead.name.split(/\s+/)[0] || lead.name;
  const plan = planFor(pipe, lead.stage);
  const stepState = (i: number) => {
    const key = stepKey(lead.id, lead.stage, i);
    const it = detail?.items.find((x) => x.note === key || x.note === `skip:${key}`);
    return it ? (it.done ? "done" : "today") : null;
  };

  // Timeline, logged from what already happened: moves, Done, comments and replies, requests, steps, notes.
  const evs: Ev[] = [];
  for (const m of detail?.moves ?? []) {
    const nx = m.next_action ? ` Next: ${m.next_action}${m.next_date ? `, ${fmtShort(m.next_date)}` : ""}.` : "";
    if (m.kind === "done") evs.push({ at: m.at, text: `Done: ${m.prev_action || "the last step"}.${nx}`, strong: true });
    else if (m.kind === "move" && m.from_stage) evs.push({ at: m.at, text: `Moved from ${m.from_stage} to ${m.to_stage}.${nx}${m.reason ? ` Reason: ${m.reason}.` : ""}`, strong: true });
    else evs.push({ at: m.at, text: `Moved to ${m.to_stage}`, strong: true });
  }
  const nn = normName(lead.name);
  for (const c of data.comments.filter((c) => c.prospect_id === lead.id || (!!nn && normName(c.author) === nn))) {
    evs.push({ at: c.day + "T12:00:00", text: `You commented on ${first}'s post`, strong: false });
    if (c.reply) evs.push({ at: c.day + "T12:00:01", text: `${first} replied to your comment`, strong: false });
  }
  for (const it of detail?.items ?? []) {
    if (!it.done) continue;
    const at = it.done_at ?? it.created_at;
    if (it.kind === "request") evs.push({ at, text: "Connection request sent", strong: false });
    else if (it.note.replace(/^skip:/, "").startsWith("pipeline:")) evs.push({ at, text: `Step done: ${it.title.replace(/: [^:]*$/, "")}`, strong: false });
    else evs.push({ at, text: it.kind === "dm" || it.kind === "inmail" ? "Message sent" : it.kind === "comment" ? `You commented on ${first}'s post` : `Done on Today: ${it.title || "a task"}`, strong: false });
  }
  for (const n of detail?.notes ?? []) evs.push({ at: n.created_at, text: `Note${n.author_email ? ` from ${ownerName(n.author_email)}` : ""}: ${n.body}`, strong: false });
  if (lead.created_at) evs.push({ at: lead.created_at, text: "Added to Prax", strong: false });
  evs.sort((a, b) => b.at.localeCompare(a.at));

  const doneN = plan.filter((_, i) => stepState(i) === "done").length;
  const heat = info?.heat;
  const summary: Record<Sec, string> = {
    timeline: detail ? `${evs.length} ${evs.length === 1 ? "event" : "events"}` : "Loading",
    warm: info?.warm?.level === 1 ? "Direct" : info?.warm?.level === 2 ? "Talked before" : info?.warm?.level === 3 ? "Someone you know" : "None yet",
    plan: plan.length ? `${doneN} of ${plan.length} done` : "None at this stage",
    heat: heat ? `${heat.band}, ${heat.score} of 100` : "Cold",
    notes: lead.notes ? "Has notes" : "None",
    msg: draft ? "Drafted" : "Not drafted",
    details: [lead.region, segs[lead.segment]?.label.replace("&", "and")].filter(Boolean).join(" · ") || "None",
  };
  const LABEL: Record<Sec, string> = { timeline: "Timeline", warm: "Warm path", plan: "Touch plan", heat: "Heat", notes: "Notes", msg: "Message for this stage", details: "Details" };

  async function step(i: number, done: boolean | null) {
    const key = stepKey(lead.id, lead.stage, i);
    const r = await api.step(lead, key, plan[i], done);
    if (!r.ok) { toast(r.error); return; }
    haptic();
    toast(done == null ? "Added to Today. You do it on LinkedIn yourself." : done ? "Step done and logged on the timeline" : "Step reopened", done ? () => { api.step(lead, key, plan[i], false).then(reload); } : undefined);
    reload();
  }
  async function makeDraft() {
    setDrafting(true);
    try { setDraft((await api.draft(messagePrompt(lead, lead.stage, pipe.name, whoLine(ws)))).trim()); }
    catch (e) { setDraft(templateMessage(lead, lead.stage, companyOf(ws, ""))); toast(`${(e as Error).message} A plain template is in the box instead.`, undefined, { info: true }); }
    setDrafting(false);
  }
  async function saveNotes() {
    if (notes === (lead.notes ?? "")) return;
    const r = await api.update(lead.id, { notes });
    toast(r.ok ? "Notes saved" : r.error);
  }
  async function addNote() {
    if (!note.trim()) return;
    const r = await api.addNote(lead, note.trim());
    if (!r.ok) { toast(r.error); return; }
    setNote(""); reload();
  }

  const lostLine = lead.stage === pipe.lost_stage && lead.lost_reason ? `${pipe.lost_stage}: ${lead.lost_reason}` : "";
  const tone = dueTone(lead.next_date, t);
  return (
    <>
      <div className="fixed inset-0 z-[54] bg-[rgba(20,20,20,.22)]" onClick={onClose} />
      <aside role="dialog" aria-label={lead.name} className={`pl-slide fixed inset-y-0 right-0 z-[55] flex flex-col gap-[18px] overflow-y-auto bg-white px-6 py-[22px] shadow-[-12px_0_30px_rgba(20,20,20,.12)] transition-[width] duration-200 max-sm:px-4 ${wide ? "w-[min(860px,100vw)]" : "w-[min(480px,100vw)]"}`}>
        <span className="flex items-start gap-3">
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]"><span className="text-[18px] font-[650]">{lead.name}</span><span className="text-[13px] text-muted">{[lead.role, lead.company].filter(Boolean).join(" · ") || "No role or company"}</span></span>
          {lead.linkedin && <a href={lead.linkedin} target="_blank" rel="noopener" className="btn h-8! w-8! shrink-0 p-0!" aria-label="Open LinkedIn profile"><ExternalLink size={14} /></a>}
          <button type="button" className="btn h-8! shrink-0 whitespace-nowrap px-2.5! text-[12.5px] font-semibold max-sm:hidden!" onClick={() => setWide(!wide)}>{wide ? "Side view" : "Full view"}</button>
          <button type="button" className="btn h-8! w-8! shrink-0 p-0!" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </span>

        <div className="flex flex-col gap-2.5 rounded-[14px] bg-[#f7f7f7] p-[18px]">
          <span className="text-[12.5px] font-semibold text-muted">Next action</span>
          <span className={`text-[19px] font-[650] leading-[1.35] tracking-[-0.01em] ${lead.next_action ? "" : "text-muted"}`}>{lead.next_action || "No next action set"}</span>
          {lostLine && <span className="text-[13px] font-semibold">{lostLine}</span>}
          <span className={`text-[12.5px] ${tone === "overdue" ? "font-semibold text-[#d64545]" : tone === "today" ? "font-semibold" : "text-muted"}`}>{dueLong(lead.next_date, t)}</span>
          {editable && <span className="mt-1 flex flex-wrap gap-2">
            <button type="button" className="btn h-[38px]! px-4! text-[13.5px] font-semibold" onClick={() => onMove(lead.stage)}>Done</button>
            <button type="button" className="btn btn-primary h-[38px]! px-4! text-[13.5px] font-semibold" disabled={!next} onClick={() => next && onMove(next)}>{next ? `Move to ${next}` : "Last stage"}</button>
          </span>}
        </div>

        <div className="flex flex-col gap-2">
          <span className="flex gap-[3px]">
            {pipe.stages.map((s, i) => {
              const now_ = i === ci, past = i < ci && s !== pipe.lost_stage && !(lead.stage === pipe.lost_stage && s === pipe.won_stage), d = days[s];
              const title = `${s}${now_ ? ", now" : d != null ? `, ${d} ${d === 1 ? "day" : "days"}` : ""}`;
              return <button key={s} type="button" title={title} aria-label={title} disabled={!editable} onClick={() => s !== lead.stage && onMove(s)}
                className={`pl-seg h-2 flex-1 rounded-full ${now_ ? "bg-[#141414]" : past ? "bg-[#a3a3a3]" : "bg-[#e6e6e6]"}`} />;
            })}
          </span>
          <span className="text-[12.5px] text-muted">{lead.stage} · {here === 0 ? "new today" : `${here} ${here === 1 ? "day" : "days"} here`} · stage {ci + 1} of {pipe.stages.length} in {pipe.name}</span>
        </div>

        <div className="flex flex-col border-t border-[#ececec]">
          {SECS.map((k) => {
            const o = wide || !!open[k];
            return (
              <div key={k} className="border-b border-[#ececec]">
                <button type="button" aria-expanded={o} onClick={() => setOpen({ ...open, [k]: !open[k] })} className="pl-quiet flex min-h-[46px] w-full items-center gap-2.5 rounded-md px-1.5 text-left">
                  <svg className={`pl-chev shrink-0 ${o ? "rotate-90" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5f5f5f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                  <span className="text-[14px] font-semibold">{LABEL[k]}</span>
                  <span className="ml-auto max-w-[60%] truncate text-[12.5px] text-muted">{summary[k]}</span>
                </button>
                {o && <div className="flex flex-col gap-2.5 pb-4 pl-[30px] pr-1.5 pt-0.5">
                  {k === "timeline" && (!detail ? <span className="h-16 animate-pulse rounded-lg bg-surface-2" /> : (
                    <ol className="ml-1 flex flex-col border-l-2 border-[#ececec]">
                      {evs.map((e, i) => (
                        <li key={i} className="relative pb-3 pl-4 text-[13px] leading-[1.45]">
                          <span className="absolute -left-1.5 top-[5px] h-2.5 w-2.5 rounded-full shadow-[0_0_0_3px_#fff]" style={{ background: e.strong ? "#141414" : "#c4c4c4" }} />
                          <span className="num text-[11.5px] text-muted">{ago(e.at, t)}</span> {e.text}
                        </li>
                      ))}
                    </ol>
                  ))}
                  {k === "warm" && <span className="text-[13.5px] leading-normal">{info?.warmText ?? "None found in the LinkedIn export yet."}</span>}
                  {k === "plan" && (plan.length ? plan.map((s, i) => {
                    const st = stepState(i), done = st === "done";
                    return (
                      <span key={s} className="flex items-center gap-2.5">
                        <button type="button" aria-label={done ? "Mark not done" : "Mark done"} disabled={!editable} onClick={() => step(i, !done)}
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded-md ${done ? "bg-[#d64545]" : "border-[1.5px] border-[#c4c4c4] bg-white"}`}>{done && <Check size={12} strokeWidth={3} className="text-white" />}</button>
                        <span className={`min-w-0 flex-1 text-[13.5px] leading-snug ${done ? "text-muted line-through" : ""}`}>{s}</span>
                        {editable && <button type="button" className="btn h-[30px]! shrink-0 whitespace-nowrap px-2.5! text-[12px] font-semibold" disabled={!!st} onClick={() => step(i, null)}>{done ? "Done" : st === "today" ? "On Today" : "Add to Today"}</button>}
                      </span>
                    );
                  }) : <span className="text-[13px] text-muted">No steps at this stage.</span>)}
                  {k === "heat" && heat?.signals.map((g) => (
                    <span key={g.label} className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span><b className="font-semibold">{g.label}</b> <span className="text-muted">{g.sub}</span></span>
                      <span className="num whitespace-nowrap text-[12px] text-muted">{g.pts} pts</span>
                    </span>
                  ))}
                  {k === "heat" && heat && <span className="flex items-center gap-2 text-[12.5px] text-muted"><span className="h-2 w-2 rounded-full" style={{ background: HEAT_DOT[heat.band] }} />Hot from 70, warm from 40.</span>}
                  {k === "notes" && <>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} disabled={!editable} placeholder="What you know about them, what they care about" aria-label="Notes"
                      className="min-h-24 resize-y rounded-[10px] border border-[#e3e3e3] px-3 py-2.5 text-[13.5px] leading-normal focus-visible:outline-2 focus-visible:outline-[#d64545]" />
                    {can("commenter") && <span className="flex gap-2">
                      <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} placeholder="Add a note to the timeline" aria-label="Add a note to the timeline" className="field h-9! flex-1" />
                      <button type="button" className="btn h-9! px-3! font-semibold" disabled={!note.trim()} onClick={addNote}>Add</button>
                    </span>}
                  </>}
                  {k === "msg" && <>
                    {draft ? <textarea value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Message draft" className="min-h-[110px] resize-y rounded-[10px] border border-[#e3e3e3] px-3 py-2.5 text-[13.5px] leading-normal focus-visible:outline-2 focus-visible:outline-[#d64545]" />
                      : <span className="text-[13px] text-muted">Prax drafts a message that fits {lead.stage}. You copy it and send it yourself.</span>}
                    <span className="flex gap-2">
                      <button type="button" className="btn h-[34px]! px-3! font-semibold" disabled={drafting} onClick={makeDraft}>{drafting ? "Drafting" : draft ? "Draft again" : "Draft the message"}</button>
                      <button type="button" className="btn h-[34px]! px-3! font-semibold" disabled={!draft} onClick={() => { navigator.clipboard?.writeText(draft).catch(() => {}); toast("Copied. Paste it in LinkedIn and send it yourself."); }}>Copy</button>
                    </span>
                  </>}
                  {k === "details" && <Details lead={lead} data={data} api={api} onClose={onClose} />}
                </div>}
              </div>
            );
          })}
        </div>
        {closed && lead.stage === pipe.won_stage && <span className="text-[12.5px] text-muted">Won. The next action stays on Today until you mark it done.</span>}
      </aside>
    </>
  );
}

function F({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`flex flex-col gap-1 text-[12.5px] font-semibold ${wide ? "col-span-2" : "max-sm:col-span-2"}`}>{label}{children}</label>;
}

function Details({ lead, data, api, onClose }: { lead: Prospect; data: PipelineData; api: PipelineApi; onClose: () => void }) {
  const segs = useSegments();
  const { can } = useWorkspace();
  const editable = can("editor");
  const toast = useToast();
  const pick = (l: Prospect) => ({ name: l.name, role: l.role ?? "", company: l.company ?? "", segment: l.segment ?? "", region: l.region ?? "", linkedin: l.linkedin ?? "", why: l.why ?? "", owner: l.owner ?? "" });
  const [f, setF] = useState(pick(lead));
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { setF(pick(lead)); }, [lead.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = JSON.stringify(f) !== JSON.stringify(pick(lead));
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function save() {
    const { owner, ...rest } = f;
    const r = await api.update(lead.id, { ...rest, ...(data.ready ? { owner: owner || null } : {}) });
    toast(r.ok ? "Saved" : r.error);
  }
  async function del() {
    const r = await api.remove([lead.id]);
    if (!r.ok) { toast(r.error); return; }
    toast(`${lead.name} deleted`); onClose();
  }
  return (
    <fieldset disabled={!editable} className="grid grid-cols-2 gap-3">
      <F label="Name" wide><input className="field font-normal" value={f.name} onChange={set("name")} /></F>
      <F label="Role"><input className="field font-normal" value={f.role} onChange={set("role")} /></F>
      <F label="Company"><input className="field font-normal" value={f.company} onChange={set("company")} /></F>
      <F label="Segment"><select className="field font-normal" value={f.segment} onChange={set("segment")}><option value="">None</option>{Object.entries(segs).map(([k, v]) => <option key={k} value={k}>{v.label.replace("&", "and")}</option>)}</select></F>
      <F label="Region"><input className="field font-normal" value={f.region} onChange={set("region")} /></F>
      {data.ready && <F label="Owner" wide><select className="field font-normal" value={f.owner} onChange={set("owner")}><option value="">No owner</option>{data.members.map((m) => <option key={m.user_id} value={m.user_id}>{ownerName(m.email)}</option>)}</select></F>}
      <F label="LinkedIn URL" wide><input className="field font-normal" value={f.linkedin} onChange={set("linkedin")} placeholder="https://www.linkedin.com/in/" /></F>
      <F label="Why they fit" wide><textarea rows={3} className="field h-auto! py-2! font-normal" value={f.why} onChange={set("why")} /></F>
      {editable && <span className="col-span-2 flex flex-wrap items-center justify-between gap-2">
        {confirm ? <span className="flex items-center gap-2 text-[13px] text-[#9e1c1c]">Delete for everyone?<button type="button" className="btn h-8!" onClick={del}>Delete</button><button type="button" className="btn btn-ghost h-8!" onClick={() => setConfirm(false)}>Keep</button></span>
          : <button type="button" className="btn btn-ghost h-8! hover:text-[#9e1c1c]" onClick={() => setConfirm(true)}>Delete lead</button>}
        <button type="button" className="btn btn-primary h-8! font-semibold" disabled={!changed || !f.name.trim()} onClick={save}>Save details</button>
      </span>}
    </fieldset>
  );
}
