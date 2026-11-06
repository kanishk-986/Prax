"use client";
import { SwitchRow } from "@/components/switch";
import { useEffect, useMemo, useRef, useState } from "react";
import { X, Printer, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useWorkspace, useSegments, fmtDay, today, STAGES } from "@/lib/workspace";
import { useToast, haptic } from "@/components/toaster";
import { askExtension, parseJSON } from "@/lib/bridge";
import { warmPaths, indexPeople, type Person, type ProspectLite } from "@/lib/network";
import { campaignLift, scoped, type Run, type Question, type Entity, type Source } from "@/lib/citations";
import { useCitationProfile } from "@/lib/citation-profile";
import {
  OBJECTIVES, FORMATS, MEASURES, objective, defaultBrief, withPlan, applyObjective, proposePlan, replanUnwritten, weeklyLoad, commentsPerWeek, weekCommentTasks,
  midCheck, report, fastBrief, fastPlan, eventPlan, eventFollowUps, endOf, addDays, hashIdx, nextMonday, type Brief, type PlanItem,
} from "@/lib/campaigns";
import { type Post, type Campaign, type Target, type Request, StatusPill, statusOf, logActivity, upsertToday, Modal } from "./shared";
import { povText, resultsSummary, hasResults, engagementRate } from "@/lib/content";
import { cap, firstNameOf, pillarsOf, possessive, regionText } from "@/lib/persona";
import type { ContentSettings } from "./settings";

type Prospect = ProspectLite & { warmth: string };
type Comment = { id: string; author: string; reply: boolean; day: string; prospect_id: string | null };
type Props = { posts: Post[]; campaigns: Campaign[]; targets: Target[]; requests: Request[]; prospects: Prospect[]; comments: Comment[]; openPost: (p: Post) => void; editPost: (p: Post) => void; start?: { view: "brief" | "fast" | "event"; n: number }; settings?: ContentSettings };

const KEYS: Record<string, string[]> = {
  "Money That Moves Itself": ["stablecoin settlement", "reconciliation", "treasury operations", "tokenised deposits", "cross-border payments"],
  "The Liquid Balance Sheet": ["tokenised funds", "private credit", "real-world assets", "fund administration", "transfer restrictions"],
  "Regulation-to-Architecture": ["VARA", "CBUAE", "MiCA", "compliance by design", "travel rule"],
  "Production-Grade or Nothing": ["custody", "key management", "audit trail", "resilience", "post-quantum readiness"],
  "Agentic Finance": ["AI agents", "agentic payments", "know your intent", "payment mandates", "agent audit trail"],
  "Build, Buy or Partner": ["total cost of ownership", "build or buy", "time to value", "vendor risk", "business case"],
};
const chipCls = (on: boolean) => `h-8 rounded-full px-3 text-meta font-semibold transition-colors ${on ? "bg-[#141414] text-white" : "border border-line-strong bg-white text-ink hover:border-[#141414]"}`;
const Label = ({ children, req }: { children: React.ReactNode; req?: boolean }) => <span className="label">{children}{req && <span className="text-[#d64545]"> *</span>}</span>;

export function CampaignsTab({ posts, campaigns, targets, requests, prospects, comments, openPost, editPost, start, settings }: Props) {
  const segs = useSegments();
  const { ws, can } = useWorkspace();
  const first = firstNameOf(ws), pillars = pillarsOf(ws);
  const toast = useToast();
  const editable = can("editor");
  const live = campaigns.filter((c) => !c.template);
  const templates = campaigns.filter((c) => c.template);
  const [view, setView] = useState<"detail" | "brief" | "proposal">(live.length ? "detail" : "brief");
  const [sel, setSel] = useState<string | null>(live[0]?.id ?? null);
  const [kind, setKind] = useState<Campaign["kind"]>("standard");
  const [name, setName] = useState("");
  const [brief, setBrief] = useState<Brief>(() => withPlan(defaultBrief(today(), undefined, pillarsOf(ws)), settings?.plan));
  const [editing, setEditing] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState("");
  const [confirmDel, setConfirmDel] = useState<Campaign | null>(null);

  useEffect(() => { if (!sel && live[0]) setSel(live[0].id); }, [live, sel]);
  useEffect(() => { if (start) startNew(start.view === "brief" ? "standard" : start.view); }, [start?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  function startNew(k: Campaign["kind"]) {
    setKind(k); setName(""); setEditing(null); setTried(false); setPlan([]);
    // A standard campaign starts from the Strategy's Content system (days, posts a week, formats) when it has one.
    setBrief(k === "fast" ? fastBrief(today(), "", "", pillars) : k === "event" ? { ...defaultBrief(today(), "event", pillars), event: { name: "", start: "", end: "" } } : withPlan(defaultBrief(today(), undefined, pillars), settings?.plan));
    setView("brief");
  }
  function edit(c: Campaign) { setKind(c.kind); setName(c.name); setBrief({ ...defaultBrief(today()), ...c.brief }); setEditing(c.id); setTried(false); setView("brief"); }

  async function propose() {
    if (!name.trim()) { setTried(true); toast("Give the campaign a name first"); return; }
    if (kind === "event" && !brief.event?.start) { toast("Add the event dates first"); return; }
    const skeleton = kind === "fast" ? fastPlan(brief) : kind === "event" ? eventPlan(brief) : proposePlan(brief, undefined, pillars);
    setPlan(skeleton); setView("proposal");
    if (kind !== "standard") return;
    setBusy("propose");
    try {
      const o = objective(brief.objective);
      const out = await askExtension<string>("ai", { kind: "studio", user: `Plan LinkedIn post titles for a campaign by this profile.\nCampaign: ${name}. Objective: ${o.label} (${o.sub}). Topic: ${brief.topic}. Keywords: ${brief.keywords.join(", ") || "none"}. Audience segments: ${brief.segments.map((s) => segs[s]?.label ?? s).join(", ") || "any"}. Core message: ${brief.message || "not given"}. Call to action: ${brief.cta}.\nThere are ${skeleton.length} slots, in this order, each with a phase and a format:\n${skeleton.map((s, i) => `${i + 1}. ${s.phase}, ${s.format}`).join("\n")}\nOpen introduces the problem, Prove shows experience, Deepen gives a framework, Ask makes a calm offer. One specific title per slot, under 90 characters, no hashtags.\n${settings ? `${povText(settings.pov, first)}\n` : ""}Return only JSON: {"titles": ["...", "..."]}` }, 60000);
      const j = parseJSON<{ titles: string[] }>(out);
      if (j?.titles?.length) setPlan(skeleton.map((s, i) => ({ ...s, title: j.titles[i] || s.title })));
    } catch { toast("Planned without AI: connect the extension and a key for sharper titles"); }
    setBusy("");
  }

  async function suggestKeys() {
    setBusy("keys");
    let found: string[] = [];
    try {
      const out = await askExtension<string>("ai", { kind: "studio", user: `Suggest 6 short search keywords (2 to 4 words each) that buyers would use for a LinkedIn campaign named "${name}" on the topic "${brief.topic}".${regionText(ws) ? ` Buyers in ${regionText(ws)}.` : ""} Return only JSON: {"keywords": ["..."]}` }, 30000);
      found = parseJSON<{ keywords: string[] }>(out)?.keywords ?? [];
    } catch {}
    if (!found.length) found = KEYS[brief.topic] ?? [];
    const prev = brief.keywords;
    setBrief((b) => ({ ...b, keywords: [...new Set([...b.keywords, ...found])].slice(0, 10) }));
    toast(found.length ? "Keywords suggested" : "No suggestions for this topic", () => setBrief((b) => ({ ...b, keywords: prev })));
    setBusy("");
  }

  async function accept() {
    if (editing) return replan();
    const { data: c, error } = await supabase().from("campaigns").insert({ workspace_id: ws.id, name: name.trim(), kind, brief }).select().single();
    if (error || !c) { toast(error?.message ?? "Could not save"); return; }
    const rows = plan.map((p, i) => ({ workspace_id: ws.id, campaign_id: c.id, title: p.title, format: p.format, pillar: p.pillar, topic: p.pillar, phase: p.phase, publish_date: p.date, planned_time: p.time, status: kind === "fast" && i === 0 ? "Drafting" : "Idea" }));
    const { error: e2 } = await supabase().from("posts").insert(rows);
    if (e2) { toast(e2.message); return; }
    if (kind === "fast") await upsertToday([{ day: addDays(brief.start, 1), kind: "custom", idx: 3100 + hashIdx(c.id, 100), title: `Fast response: ${first} approves the first take by ${fmtDay(addDays(brief.start, 2))} · ${name}`, link: `/w/${ws.slug}/studio-content?tab=campaigns`, note: `campaign:${c.id}:fast` }], ws.id);
    logActivity(ws.id, "campaign", `Campaign started: ${name.trim()}`, c.id);
    haptic(12);
    toast(`${rows.length} posts added to the plan as ideas`, async () => { await supabase().from("campaigns").delete().eq("id", c.id); await supabase().from("posts").delete().eq("campaign_id", c.id); });
    setSel(c.id); setView("detail"); setPlan([]);
  }

  async function saveEdit(andReplan: boolean) {
    if (!name.trim()) { setTried(true); toast("The campaign needs a name"); return; }
    const old = campaigns.find((c) => c.id === editing)!;
    const { error } = await supabase().from("campaigns").update({ name: name.trim(), brief }).eq("id", editing!);
    if (error) { toast(error.message); return; }
    if (brief.topic !== old.brief.topic && pillars.includes(brief.topic))
      await supabase().from("posts").update({ pillar: brief.topic, topic: brief.topic }).eq("campaign_id", editing!).eq("status", "Idea");
    if (andReplan) {
      const mine = posts.filter((p) => p.campaign_id === editing);
      const { add } = replanUnwritten(mine, brief, today(), pillars);
      setPlan(add); setView("proposal"); return;
    }
    toast("Campaign saved", async () => { await supabase().from("campaigns").update({ name: old.name, brief: old.brief }).eq("id", old.id); });
    setSel(editing); setEditing(null); setView("detail");
  }

  async function replan() {
    const mine = posts.filter((p) => p.campaign_id === editing);
    const { remove } = replanUnwritten(mine, brief, today(), pillars);
    const removed = mine.filter((p) => remove.includes(p.id));
    if (remove.length) await supabase().from("posts").delete().in("id", remove);
    const { data, error } = await supabase().from("posts").insert(plan.map((p) => ({ workspace_id: ws.id, campaign_id: editing, title: p.title, format: p.format, pillar: p.pillar, topic: p.pillar, phase: p.phase, publish_date: p.date, planned_time: p.time, status: "Idea" }))).select("id");
    if (error) { toast(error.message); return; }
    const added = (data ?? []).map((r: { id: string }) => r.id);
    toast(`Re-planned: ${removed.length} unwritten ideas replaced by ${plan.length}`, async () => {
      if (added.length) await supabase().from("posts").delete().in("id", added);
      if (removed.length) await supabase().from("posts").insert(removed.map(({ id: _i, ...r }) => { void _i; return r; }));
    });
    setSel(editing); setEditing(null); setView("detail"); setPlan([]);
  }

  // Delete removes the campaign and its unwritten ideas; drafted, approved and posted ones stay in Library as Independent.
  // Undo puts everything back exactly, ids included.
  async function remove(c: Campaign) {
    setConfirmDel(null);
    const mine = posts.filter((p) => p.campaign_id === c.id);
    const ideas = mine.filter((p) => statusOf(p.status) === "Idea"), kept = mine.filter((p) => statusOf(p.status) !== "Idea");
    const tg = targets.filter((x) => x.campaign_id === c.id), rq = requests.filter((x) => x.campaign_id === c.id);
    if (ideas.length) await supabase().from("posts").delete().in("id", ideas.map((p) => p.id));
    const { error } = await supabase().from("campaigns").delete().eq("id", c.id);
    if (error) { toast(error.message); return; }
    logActivity(ws.id, "campaign", `Campaign deleted: ${c.name}`, null);
    if (sel === c.id) { setSel(null); setView(live.length > 1 ? "detail" : "brief"); }
    haptic();
    toast(`${c.name} deleted`, async () => {
      await supabase().from("campaigns").insert(c);
      if (ideas.length) await supabase().from("posts").insert(ideas);
      if (kept.length) await supabase().from("posts").update({ campaign_id: c.id }).in("id", kept.map((p) => p.id));
      if (tg.length) await supabase().from("campaign_targets").insert(tg.map((x) => ({ ...x, workspace_id: ws.id })));
      if (rq.length) await supabase().from("resource_requests").insert(rq.map((x) => ({ ...x, workspace_id: ws.id })));
      logActivity(ws.id, "campaign", `Campaign restored: ${c.name}`, c.id);
      setSel(c.id); setView("detail");
    });
  }

  async function saveTemplate(c: Campaign) {
    const { error } = await supabase().from("campaigns").insert({ workspace_id: ws.id, name: `${c.name} (template)`, kind: c.kind, brief: c.brief, template: true });
    if (error) toast(error.message); else { haptic(); toast("Saved as a template. Pick it when you start a new campaign."); }
  }
  function fromTemplate(id: string) {
    const t = templates.find((x) => x.id === id); if (!t) return;
    const days = Math.max(0, (new Date(nextMonday(today()) + "T12:00:00").getTime() - new Date(t.brief.start + "T12:00:00").getTime()) / 864e5);
    setKind(t.kind); setName(t.name.replace(/ \(template\)$/, ""));
    setBrief({ ...defaultBrief(today()), ...t.brief, start: nextMonday(today()), event: t.brief.event ? { ...t.brief.event, start: t.brief.event.start ? addDays(t.brief.event.start, days) : "", end: t.brief.event.end ? addDays(t.brief.event.end, days) : "" } : undefined });
    toast("Template loaded. Check the dates.");
  }

  const selected = live.find((c) => c.id === sel) ?? null;
  return (
    <div className="flex flex-wrap items-start gap-5">
      <aside className="flex min-w-0 flex-[1_1_240px] flex-col gap-2 md:max-w-[300px]">
        <div className="label">Campaigns</div>
        {live.map((c) => {
          const mine = posts.filter((p) => p.campaign_id === c.id), done = mine.filter((p) => statusOf(p.status) === "Posted").length;
          const on = view === "detail" && sel === c.id;
          return (
            <div key={c.id} className={`relative rounded-xl bg-white transition-colors ${on ? "border-2 border-[#d64545]" : "border border-line hover:border-[#141414]"}`}>
              <button onClick={() => { setSel(c.id); setView("detail"); setEditing(null); }} className="flex w-full flex-col items-start gap-1 p-3 pr-[68px] text-left">
                <span className="flex items-center gap-2 text-body font-semibold">{c.name}{c.status === "paused" && <span className="pill h-5 bg-[#ececec] px-2 text-meta text-ink">Paused</span>}</span>
                <span className="text-meta text-muted">{c.kind === "fast" ? "Fast response" : c.kind === "event" ? `Event · ${c.brief.event?.name ?? ""}` : objective(c.brief.objective).label} · from {fmtDay(c.brief.start, { day: "numeric", month: "short" })}</span>
                <span className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#ececec]"><span className="block h-full bg-[#d64545]" style={{ width: `${mine.length ? (done / mine.length) * 100 : 0}%` }} /></span>
                <span className="num text-meta text-muted">{done} of {mine.length} posted</span>
              </button>
              {editable && <span className="absolute right-2 top-2 flex gap-0.5">
                <button className="btn btn-ghost h-7 w-7 p-0" aria-label={`Edit ${c.name}`} title="Edit" onClick={() => { setSel(c.id); edit(c); }}><Pencil size={13} /></button>
                <button className="btn btn-ghost h-7 w-7 p-0 hover:text-[#d64545]" aria-label={`Delete ${c.name}`} title="Delete" onClick={() => setConfirmDel(c)}><Trash2 size={13} /></button>
              </span>}
            </div>
          );
        })}
        {editable && <>
          <button className="btn h-10 border-dashed" onClick={() => startNew("standard")}>New campaign</button>
          <div className="grid grid-cols-2 gap-2"><button className="btn" onClick={() => startNew("fast")}>Fast response</button><button className="btn" onClick={() => startNew("event")}>Event</button></div>
        </>}
      </aside>

      <section className="min-w-0 flex-[3_1_560px]">
        {view === "brief" && editable && (
          <BriefForm kind={kind} name={name} setName={setName} brief={brief} setBrief={setBrief} tried={tried} editing={!!editing} templates={templates} fromTemplate={fromTemplate}
            onPropose={propose} onSave={() => saveEdit(false)} onReplan={() => saveEdit(true)} onCancel={() => { setEditing(null); setView(live.length ? "detail" : "brief"); }} suggestKeys={suggestKeys} busy={busy} />
        )}
        {view === "proposal" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div><h2 className="m-0 text-page font-semibold">{name}</h2><p className="m-0 mt-1 text-body text-muted">{busy === "propose" ? `Writing titles in ${possessive(first)} voice` : `${plan.length} posts${editing ? " replace the unwritten ideas" : ""}. Change the format or remove any post, then accept.`}</p></div>
              <button className="btn" onClick={() => setView("brief")}>Edit the brief</button>
            </div>
            <div className="flex flex-wrap gap-1.5">{(["Open", "Prove", "Deepen", "Ask"] as const).map((ph, i) => <span key={ph} className="pill" style={{ background: ["#141414", "#9e1c1c", "#d64545", "#fff"][i], color: i === 3 ? "#141414" : "#fff", border: i === 3 ? "1px solid #d4d4d4" : undefined }}>{ph} · {plan.filter((p) => p.phase === ph).length}</span>)}</div>
            <div className="card overflow-hidden">
              {plan.map((p, i) => (
                <div key={i} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
                  <span className="flex w-[84px] shrink-0 flex-col"><span className="text-meta font-semibold">{fmtDay(p.date)}</span><span className="text-meta font-semibold text-[#d64545]">{p.phase}</span></span>
                  <span className="min-w-0 flex-1"><span className="block text-body font-semibold leading-snug">{p.title}</span><span className="text-meta text-muted">{p.pillar}</span></span>
                  <select className="field h-8 w-[124px] text-meta" value={p.format} onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, format: e.target.value } : x)))} aria-label="Format">{FORMATS.map((x) => <option key={x}>{x}</option>)}</select>
                  <button className="btn btn-ghost h-8 w-8 p-0" aria-label="Remove this post" onClick={() => setPlan(plan.filter((_, j) => j !== i))}><X size={14} /></button>
                </div>
              ))}
              {!plan.length && <p className="p-6 text-center text-body text-muted">No posts left. Edit the brief to plan again.</p>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-meta text-muted">Each post goes through the editor and {possessive(first)} approval as usual.</span><button className="btn btn-primary h-10 px-5" disabled={!plan.length || busy === "propose"} onClick={accept}>{editing ? "Replace unwritten ideas" : "Accept and add to Plan"}</button></div>
          </div>
        )}
        {view === "detail" && selected && <Detail c={selected} posts={posts.filter((p) => p.campaign_id === selected.id).sort((a, b) => (a.publish_date ?? "").localeCompare(b.publish_date ?? ""))} targets={targets.filter((t) => t.campaign_id === selected.id)} requests={requests.filter((r) => r.campaign_id === selected.id)} prospects={prospects} comments={comments} onEdit={() => edit(selected)} onTemplate={() => saveTemplate(selected)} openPost={openPost} editPost={editPost} />}
        {confirmDel && <Modal title={`Delete ${confirmDel.name}?`} onClose={() => setConfirmDel(null)} footer={<><button className="btn" onClick={() => setConfirmDel(null)}>Keep it</button><button className="btn btn-primary" onClick={() => remove(confirmDel)}>Delete</button></>}>
          <p className="m-0 text-body leading-relaxed">Delete {confirmDel.name}? Its unwritten ideas are removed. Posts already drafted, approved or posted stay in Library as Independent.</p>
        </Modal>}
        {view === "detail" && !selected && <div className="card grid min-h-[260px] place-items-center p-10 text-center"><div><p className="m-0 text-body text-muted">No campaigns yet.</p>{editable && <button className="btn btn-primary mt-3" onClick={() => startNew("standard")}>Plan a campaign</button>}</div></div>}
      </section>
    </div>
  );
}

function BriefForm({ kind, name, setName, brief, setBrief, tried, editing, templates, fromTemplate, onPropose, onSave, onReplan, onCancel, suggestKeys, busy }: {
  kind: Campaign["kind"]; name: string; setName: (s: string) => void; brief: Brief; setBrief: React.Dispatch<React.SetStateAction<Brief>>; tried: boolean; editing: boolean; templates: Campaign[]; fromTemplate: (id: string) => void;
  onPropose: () => void; onSave: () => void; onReplan: () => void; onCancel: () => void; suggestKeys: () => void; busy: string;
}) {
  const segs = useSegments();
  const { ws } = useWorkspace();
  const first = firstNameOf(ws), pillars = pillarsOf(ws);
  const [key, setKey] = useState("");
  const [colleague, setColleague] = useState("");
  const set = <K extends keyof Brief>(k: K, v: Brief[K]) => setBrief((b) => ({ ...b, [k]: v }));
  const toggle = (k: "segments" | "mix", v: string) => setBrief((b) => ({ ...b, [k]: b[k].includes(v) ? (k === "mix" && b.mix.length === 1 ? b.mix : b[k].filter((x) => x !== v)) : [...b[k], v] }));
  const addKey = () => { const k = key.trim(); if (k && !brief.keywords.includes(k)) set("keywords", [...brief.keywords, k]); setKey(""); };
  const load = weeklyLoad(brief, commentsPerWeek(brief, 20));
  const title = editing ? "Edit the campaign" : kind === "fast" ? "Fast response" : kind === "event" ? "Event campaign" : "Brief the campaign";
  const sub = editing ? "Save keeps the posts as they are. Re-plan replaces only the ideas not yet written." : kind === "fast" ? `Start from a rule change or a news link. A first take reaches ${first} for approval within 48 hours.` : kind === "event" ? "Before, during and after. Add the people to meet once it is created; their follow-ups land on Today the day after." : "Set the goal and the shape. Prax proposes the posts; you change anything before it goes on the plan.";
  return (
    <div className="flex flex-col gap-4">
      <div><h2 className="m-0 text-page font-semibold">{title}</h2><p className="m-0 mt-1 text-body text-muted">{sub}</p></div>
      <div className="card flex flex-col gap-4 p-5">
        {!editing && templates.length > 0 && kind === "standard" && (
          <label className="flex flex-col gap-1.5"><Label>Start from a template</Label><select className="field" defaultValue="" onChange={(e) => e.target.value && fromTemplate(e.target.value)}><option value="">No template</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        )}
        <label className="flex flex-col gap-1.5"><Label req>Campaign name</Label><input className="field h-10" style={tried && !name.trim() ? { borderColor: "#d64545" } : undefined} value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "fast" ? "For example: New reserve rule, first take" : "For example: Reconciliation first"} /></label>

        {kind === "fast" && <>
          <label className="flex flex-col gap-1.5"><Label req>Link to the rule or news</Label><input className="field h-10" type="url" value={brief.link ?? ""} onChange={(e) => set("link", e.target.value)} placeholder="https://" /></label>
          <label className="flex flex-col gap-1.5"><Label>{cap(possessive(first))} angle, in one line</Label><input className="field h-10" value={brief.message} onChange={(e) => set("message", e.target.value)} placeholder="What it means for the people building on it" /></label>
        </>}
        {kind === "event" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5 sm:col-span-3"><Label req>Event</Label><input className="field h-10" value={brief.event?.name ?? ""} onChange={(e) => set("event", { ...(brief.event ?? { start: "", end: "" }), name: e.target.value })} placeholder="For example: GITEX Global" /></label>
            <label className="flex flex-col gap-1.5"><Label req>First day</Label><input className="field" type="date" value={brief.event?.start ?? ""} onChange={(e) => set("event", { ...(brief.event ?? { name: "", end: "" }), start: e.target.value })} /></label>
            <label className="flex flex-col gap-1.5"><Label>Last day</Label><input className="field" type="date" value={brief.event?.end ?? ""} onChange={(e) => set("event", { ...(brief.event ?? { name: "", start: "" }), end: e.target.value })} /></label>
          </div>
        )}

        <label className="flex flex-col gap-1.5"><Label>Topic</Label>{pillars.length ? <select className="field h-10" value={brief.topic} onChange={(e) => set("topic", e.target.value)}>{[...new Set([...pillars, brief.topic].filter(Boolean))].map((p) => <option key={p}>{p}</option>)}</select>
          : <input className="field h-10" value={brief.topic} onChange={(e) => set("topic", e.target.value)} placeholder="A topic, or add pillars in Settings" />}</label>

        {kind !== "fast" && <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><Label>Keywords</Label><button type="button" className="btn btn-dark h-8 text-meta" disabled={busy === "keys"} onClick={suggestKeys}>{busy === "keys" ? "Thinking" : "Suggest from name and topic"}</button></div>
          <div className="flex flex-wrap gap-1.5">{brief.keywords.map((k) => <span key={k} className="pill h-8 gap-1 bg-[#ececec] pl-3 pr-2 text-ink">{k}<button type="button" aria-label={`Remove ${k}`} onClick={() => set("keywords", brief.keywords.filter((x) => x !== k))} className="grid h-5 w-5 place-items-center rounded-full hover:bg-white/15"><X size={12} /></button></span>)}{!brief.keywords.length && <span className="text-meta text-muted">None yet.</span>}</div>
          <div className="flex gap-2"><input className="field" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKey(); } }} placeholder="Add a keyword and press Enter" /><button type="button" className="btn" onClick={addKey}>Add</button></div>
        </div>}

        {kind === "standard" && <div className="flex flex-col gap-2"><Label>Objective</Label>
          <div className="grid gap-2 sm:grid-cols-2">{OBJECTIVES.map((o) => (
            <button key={o.key} type="button" onClick={() => setBrief((b) => applyObjective(b, o.key))} className={`flex flex-col items-start gap-0.5 rounded-xl bg-white p-3 text-left ${brief.objective === o.key ? "border-2 border-[#d64545]" : "border border-line hover:border-[#141414]"}`}>
              <span className="text-body font-semibold">{o.label}</span><span className="text-meta text-muted">{o.sub}</span>
            </button>
          ))}</div>
        </div>}

        {kind !== "fast" && <div className="flex flex-col gap-2"><Label>Who it is for</Label><div className="flex flex-wrap gap-1.5">{Object.entries(segs).map(([k, v]) => <button key={k} type="button" className={chipCls(brief.segments.includes(k))} onClick={() => toggle("segments", k)}>{k} · {v.label}</button>)}</div></div>}

        {kind === "standard" && <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1.5"><Label>Starts</Label><input className="field w-[160px]" type="date" value={brief.start} onChange={(e) => set("start", e.target.value)} /></label>
          <div className="flex flex-col gap-1.5"><Label>Duration</Label><div className="flex rounded-lg border border-line p-0.5">{[2, 4, 6, 8].map((w) => <button key={w} type="button" className={`h-8 rounded-md px-3 text-body font-semibold ${brief.weeks === w ? "bg-[#d64545] text-white" : "text-muted"}`} onClick={() => set("weeks", w)}>{w} weeks</button>)}</div></div>
          <div className="flex flex-col gap-1.5"><Label>Posts per week</Label><div className="flex items-center gap-1"><button type="button" className="btn h-8 w-8 p-0" aria-label="Fewer" onClick={() => set("ppw", Math.max(1, brief.ppw - 1))}>−</button><span className="num w-8 text-center text-title">{brief.ppw}</span><button type="button" className="btn h-8 w-8 p-0" aria-label="More" onClick={() => set("ppw", Math.min(5, brief.ppw + 1))}>+</button></div></div>
          <span className="num pb-2 text-meta text-muted">{brief.weeks * brief.ppw} posts{brief.days?.length ? ` on ${brief.days.slice(0, brief.ppw).map((d) => ["Mon", "Tue", "Wed", "Thu", "Fri"][d]).join(", ")}, from the strategy` : ""}</span>
        </div>}

        {kind === "standard" && <div className="flex flex-col gap-2"><Label>Mix of formats</Label><div className="flex flex-wrap gap-1.5">{FORMATS.map((f) => <button key={f} type="button" className={chipCls(brief.mix.includes(f))} onClick={() => toggle("mix", f)}>{f}</button>)}</div></div>}

        {kind !== "fast" && <>
          <label className="flex flex-col gap-1.5"><Label>Core message</Label><textarea className="field" rows={2} value={brief.message} onChange={(e) => set("message", e.target.value)} placeholder="The one idea every post comes back to" /></label>
          <label className="flex flex-col gap-1.5"><Label>What readers should do</Label><input className="field h-10" value={brief.cta} onChange={(e) => set("cta", e.target.value)} /></label>
          <label className="flex flex-col gap-1.5"><Label>How we will judge it</Label><select className="field h-10" value={brief.measure} onChange={(e) => set("measure", e.target.value)}>{[...new Set([...MEASURES, brief.measure].filter(Boolean))].map((m) => <option key={m}>{m}</option>)}</select></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5"><Label>Resource to offer (optional)</Label><input className="field" value={brief.resource.name} onChange={(e) => set("resource", { ...brief.resource, name: e.target.value })} placeholder="For example: Reconciliation checklist" /></label>
            <label className="flex flex-col gap-1.5"><Label>Resource link</Label><input className="field" type="url" value={brief.resource.link} onChange={(e) => set("resource", { ...brief.resource, link: e.target.value })} placeholder="https://" /></label>
          </div>
        </>}

        <div className="flex flex-col gap-2"><Label>Colleagues who reshare</Label>
          <div className="flex flex-wrap gap-1.5">{brief.colleagues.map((c) => <span key={c} className="pill h-8 gap-1 border border-line-strong bg-white pl-3 pr-2">{c}<button type="button" aria-label={`Remove ${c}`} onClick={() => set("colleagues", brief.colleagues.filter((x) => x !== c))}><X size={12} /></button></span>)}</div>
          <div className="flex gap-2"><input className="field" value={colleague} onChange={(e) => setColleague(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && colleague.trim()) { e.preventDefault(); set("colleagues", [...brief.colleagues, colleague.trim()]); setColleague(""); } }} placeholder="Name, then Enter" /></div>
        </div>

        <div className="rounded-xl bg-surface-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><Label>{cap(possessive(first))} time each week</Label><span className="num text-body">{brief.minutes} minutes</span></div>
          <input type="range" min={15} max={180} step={5} value={brief.minutes} onChange={(e) => set("minutes", Number(e.target.value))} className="mt-2 w-full accent-[#d64545]" aria-label="Minutes per week" />
          <p className="m-0 mt-1 text-meta text-muted">Posts take about {load.posts} minutes a week (reading, approving and posting{brief.mix.includes("Video") ? ", recording" : ""}). That leaves room for {commentsPerWeek(brief, 40)} comments on target accounts.{load.over ? ` ${load.advice}` : ""}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {editing ? <><button className="btn h-10" onClick={onCancel}>Cancel</button><button className="btn h-10" onClick={onReplan}>Save and re-plan unwritten posts</button><button className="btn btn-primary h-10 px-5" onClick={onSave}>Save changes</button></>
          : <><button className="btn h-10" onClick={onCancel}>Cancel</button><button className="btn btn-primary h-10 px-5" onClick={onPropose}>Propose the posts</button></>}
      </div>
    </div>
  );
}

const NEXT: Record<string, string> = { Idea: "Write", Drafting: "Continue", "In review": "In review", Ready: "Open", Posted: "Open" };

function Detail({ c, posts, targets, requests, prospects, comments, onEdit, onTemplate, openPost, editPost }: { c: Campaign; posts: Post[]; targets: Target[]; requests: Request[]; prospects: Prospect[]; comments: Comment[]; onEdit: () => void; onTemplate: () => void; openPost: (p: Post) => void; editPost: (p: Post) => void }) {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const editable = can("editor");
  const b = c.brief;
  const t = today();
  const [picker, setPicker] = useState(false);
  const [dm, setDm] = useState<Target | null>(null);
  const [reqForm, setReqForm] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [people, setPeople] = useState<Person[] | null>(null);
  const synced = useRef("");
  const end = c.kind === "event" ? addDays(b.event?.end || b.event?.start || b.start, 3) : endOf(b);
  const pById = useMemo(() => new Map(prospects.map((p) => [p.id, p])), [prospects]);

  // Network export rows, for warm paths of target accounts.
  useEffect(() => {
    let off = false;
    (async () => {
      const out: Person[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase().from("network_people").select("*").eq("workspace_id", ws.id).order("key").range(from, from + 999);
        if (error || !data?.length) break;
        out.push(...(data as Person[])); if (data.length < 1000) break;
      }
      if (!off) setPeople(out);
    })();
    return () => { off = true; };
  }, [ws.id]);
  const idx = useMemo(() => indexPeople(people ?? []), [people]);
  const warm = (tg: Target) => {
    const p = tg.prospect_id ? pById.get(tg.prospect_id) : null;
    if (p) return ["No warm path", "Connected", "Talked before", "Knows someone there"][warmPaths(p, people ?? [], idx, comments.map((x) => ({ author: x.author, reply: x.reply, day: x.day }))).level];
    const n = (people ?? []).find((x) => x.key === tg.person_key);
    return n?.is_connection ? "Connected" : "From Network";
  };

  // Engagement found in Prax's own records (replies to the profile's comments, resource requests) marks a target engaged and
  // puts a message task on Today. Nothing here reads LinkedIn.
  useEffect(() => {
    if (!editable || c.status === "paused") return;
    const key = targets.map((x) => x.id + (x.engaged_at ? 1 : 0)).join() + requests.length + comments.length;
    if (synced.current === key) return;
    synced.current = key;
    (async () => {
      for (const tg of targets.filter((x) => !x.engaged_at)) {
        const replied = tg.prospect_id && comments.some((x) => x.prospect_id === tg.prospect_id && x.reply && x.day >= b.start && x.day <= end);
        const asked = requests.some((r) => (tg.prospect_id && r.prospect_id === tg.prospect_id) || (tg.linkedin && r.linkedin && r.linkedin === tg.linkedin));
        if (replied || asked) await markEngaged(tg, replied ? `Replied to ${possessive(firstNameOf(ws))} comment` : "Asked for the resource", true);
      }
      const tasks = c.kind === "event" ? [] : weekCommentTasks(c.id, c.name, targets.map((x) => ({ ...x, linkedin: x.linkedin || (x.prospect_id ? pById.get(x.prospect_id)?.linkedin : "") || "" })), b, t);
      await upsertToday(tasks, ws.id);
    })();
  }, [targets, requests, comments]); // eslint-disable-line react-hooks/exhaustive-deps

  async function markEngaged(tg: Target, reason: string, quiet = false) {
    const at = new Date().toISOString();
    await supabase().from("campaign_targets").update({ engaged_at: at, engaged_reason: reason }).eq("id", tg.id);
    if (c.status !== "paused") await upsertToday([{ day: t, kind: "custom", idx: 4000 + hashIdx(c.id + tg.id), title: `Send a note to ${tg.name}: ${reason.toLowerCase()} · ${c.name}`, link: tg.linkedin, note: `campaign:${c.id}:dm:${tg.id}` }], ws.id);
    if (!quiet) { haptic(); toast(`${tg.name} marked as engaged. A message task is on Today.`, async () => { await supabase().from("campaign_targets").update({ engaged_at: null, engaged_reason: "" }).eq("id", tg.id); }); }
  }

  const paused = c.status === "paused";
  async function pause() {
    const at = new Date().toISOString();
    const { error } = await supabase().from("campaigns").update({ status: "paused", paused_at: at }).eq("id", c.id);
    if (error) { toast(error.message); return; }
    logActivity(ws.id, "campaign", `Campaign paused: ${c.name}`, c.id);
    haptic(); toast("Paused. No new Today tasks; its ideas are off the Plan until you resume.", async () => { await supabase().from("campaigns").update({ status: "active", paused_at: null }).eq("id", c.id); });
  }
  // Resume moves the unwritten ideas forward by the days paused, so nothing piles up as overdue.
  async function resume() {
    const from = (c.paused_at ?? new Date().toISOString()).slice(0, 10);
    const days = Math.max(0, Math.round((new Date(t + "T12:00:00").getTime() - new Date(from + "T12:00:00").getTime()) / 864e5));
    const ideas = posts.filter((p) => statusOf(p.status) === "Idea" && p.publish_date && p.publish_date >= from);
    if (days) for (const p of ideas) await supabase().from("posts").update({ publish_date: addDays(p.publish_date!, days) }).eq("id", p.id);
    await supabase().from("campaigns").update({ status: "active", paused_at: null }).eq("id", c.id);
    logActivity(ws.id, "campaign", `Campaign resumed: ${c.name}${days ? `, ideas moved ${days} days` : ""}`, c.id);
    haptic(); toast(days ? `Resumed. ${ideas.length} ideas moved ${days} days later.` : "Resumed", async () => {
      for (const p of ideas) await supabase().from("posts").update({ publish_date: p.publish_date }).eq("id", p.id);
      await supabase().from("campaigns").update({ status: "paused", paused_at: c.paused_at }).eq("id", c.id);
    });
  }
  const counts = ["Idea", "Drafting", "In review", "Ready", "Posted"].map((s) => [s, posts.filter((p) => statusOf(p.status) === s).length] as const);
  const res = resultsSummary(posts.filter((p) => statusOf(p.status) === "Posted"));
  const engagedIds = new Set(targets.filter((x) => x.engaged_at).map((x) => x.id));
  const mid = midCheck(b, posts.map((p) => ({ id: p.id, status: statusOf(p.status), publish_date: p.publish_date, format: p.format, phase: p.phase })), targets, engagedIds, t);
  const cpw = commentsPerWeek(b, targets.length);
  const load = weeklyLoad(b, cpw, targets.filter((x) => x.engaged_at).length ? 2 : 0);
  const nextIdea = posts.find((p) => statusOf(p.status) === "Idea" || statusOf(p.status) === "Drafting");

  async function applySuggestion(k: string) {
    const ideas = posts.filter((p) => statusOf(p.status) === "Idea" && p.publish_date && p.publish_date >= t);
    if (!ideas.length) return;
    if (k === "push") {
      for (const p of ideas) await supabase().from("posts").update({ publish_date: addDays(p.publish_date!, 7) }).eq("id", p.id);
      toast("Unwritten ideas moved one week later", async () => { for (const p of ideas) await supabase().from("posts").update({ publish_date: p.publish_date }).eq("id", p.id); });
    } else if (k === "poll") {
      const p = ideas[0]; await supabase().from("posts").update({ format: "Poll" }).eq("id", p.id);
      toast(`"${p.title}" is now a poll`, async () => { await supabase().from("posts").update({ format: p.format }).eq("id", p.id); });
    } else if (k === "ask") {
      const p = ideas[ideas.length - 1]; await supabase().from("posts").update({ phase: "Ask" }).eq("id", p.id);
      toast(`"${p.title}" is now an Ask post`, async () => { await supabase().from("posts").update({ phase: p.phase }).eq("id", p.id); });
    }
  }
  async function removeTarget(tg: Target) {
    await supabase().from("campaign_targets").delete().eq("id", tg.id);
    toast(`${tg.name} removed`, async () => { const { id: _i, ...r } = tg; void _i; await supabase().from("campaign_targets").insert({ ...r, workspace_id: ws.id }); });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="m-0 text-page font-semibold">{c.name}</h2>
          <p className="m-0 mt-1 text-body text-muted">{c.kind === "fast" ? "Fast response" : c.kind === "event" ? `Event: ${b.event?.name} · ${b.event?.start ? fmtDay(b.event.start, { day: "numeric", month: "short" }) : ""}` : objective(b.objective).label} · {b.topic} · {fmtDay(b.start, { day: "numeric", month: "short" })} to {fmtDay(end, { day: "numeric", month: "short" })}{b.segments.length ? ` · segments ${b.segments.join(", ")}` : ""}</p>
        </div>
        {editable && <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={paused ? resume : pause}>{paused ? "Resume" : "Pause campaign"}</button>
          <button className="btn" onClick={onTemplate}>Save as template</button>
          <button className="btn" onClick={onEdit}>Edit campaign</button>
          {nextIdea && <button className="btn btn-primary" onClick={() => editPost(nextIdea)}>Write the next post</button>}
        </div>}
      </div>

      {paused && <p className="m-0 rounded-xl bg-surface-2 px-4 py-3 text-body text-ink">Paused since {fmtDay((c.paused_at ?? "").slice(0, 10) || t, { day: "numeric", month: "short" })}. Today gets no tasks from it, and its ideas are hidden from Plan. Resume moves them forward by the days paused.</p>}
      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-white sm:grid-cols-4">
        {[["Write each post", "Open an idea; the brief and voice are already in."], [`${cap(firstNameOf(ws))} approves`, "All the week's drafts arrive in one approval session on Today."], ["Post on the day", "Prax sends a reminder. The post is copied, LinkedIn opens, and it is posted by hand."], ["See results", "Add each post's numbers in its view after posting. The report sums them."]].map(([h, s], i) => (
          <div key={h} className={`flex flex-col gap-1.5 p-4 ${i ? "border-l border-line" : ""}`}><span className="grid h-6 w-6 place-items-center rounded-full text-meta font-semibold text-white" style={{ background: i === 0 ? "#d64545" : "#141414" }}>{i + 1}</span><span className="text-body font-semibold">{h}</span><span className="text-meta leading-snug text-muted">{s}</span></div>
        ))}
      </div>

      {mid.due && (
        <div className="card p-4">
          <div className="mb-1 flex items-center justify-between"><span className="text-body font-semibold">Halfway check</span><span className="text-meta text-muted">{mid.landing}</span></div>
          {mid.quiet.length > 0 && <p className="m-0 mb-2 text-meta text-muted">Quiet so far: {mid.quiet.slice(0, 6).map((x) => x.name).join(", ")}{mid.quiet.length > 6 ? ` and ${mid.quiet.length - 6} more` : ""}.</p>}
          {mid.suggestions.length ? mid.suggestions.map((s) => (
            <div key={s.key} className="flex flex-wrap items-center gap-3 border-t border-line py-2.5"><span className="flex-1 text-body">{s.text}</span>{editable && <button className="btn h-8" onClick={() => applySuggestion(s.key)}>Accept</button>}</div>
          )) : <p className="m-0 text-body">On track. No changes suggested.</p>}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-5">
        {counts.map(([s, n]) => <div key={s} className="rounded-xl border border-line bg-white p-3"><div className="label">{s}</div><div className="num mt-1 text-page">{n}</div></div>)}
      </div>
      {res.measured > 0 && <p className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-body"><span className="font-semibold">Results so far</span><span className="num text-muted">{res.impressions.toLocaleString("en-GB")} impressions · {res.reactions.toLocaleString("en-GB")} reactions · {res.comments.toLocaleString("en-GB")} comments · {res.reposts.toLocaleString("en-GB")} reposts{res.rate != null ? ` · ${res.rate} per 100 impressions` : ""}</span><span className="text-meta text-muted">{res.measured} of {counts[4][1]} posted pieces measured</span></p>}

      <div className="card overflow-hidden">
        {posts.map((p, i) => {
          const s = statusOf(p.status);
          return (
            <div key={p.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${i ? "border-t border-line" : ""}`}>
              <span className="flex w-[84px] shrink-0 flex-col"><span className="text-meta font-semibold">{p.publish_date ? fmtDay(p.publish_date) : "No date"}</span><span className="text-meta font-semibold text-[#d64545]">{p.phase}</span></span>
              <button className="min-w-0 flex-1 text-left" onClick={() => openPost(p)}><span className="block text-body font-semibold leading-snug hover:underline">{p.title}</span><span className="text-meta text-muted">{p.format} · {p.pillar}{hasResults(p) ? <span className="num"> · {(p.impressions ?? 0).toLocaleString("en-GB")} impressions{engagementRate(p) != null ? `, ${engagementRate(p)} per 100` : ""}</span> : ""}</span></button>
              <StatusPill s={p.status} />
              <button className="btn h-8 min-w-[100px]" disabled={s === "In review" && !can("owner")} onClick={() => (s === "Ready" || s === "Posted" ? openPost(p) : editPost(p))}>{s === "In review" && can("owner") ? "Review" : NEXT[s]}</button>
            </div>
          );
        })}
        {!posts.length && <p className="p-6 text-center text-body text-muted">No posts in this campaign.</p>}
      </div>

      <section className="card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div><span className="text-body font-semibold">{c.kind === "event" ? "People to meet" : "Target accounts"}</span><span className="num ml-2 text-meta text-muted">{targets.length}</span></div>
          {editable && <button className="btn h-8" onClick={() => setPicker(true)}>Add people</button>}
        </div>
        <p className="m-0 mb-2 text-meta text-muted">{c.kind === "event" ? "Their follow-ups land on Today the day after the event." : `About ${cpw} comment tasks a week go on Today for these people, within ${possessive(firstNameOf(ws))} ${b.minutes} minutes. Comment Studio drafts each comment on their post; ${firstNameOf(ws)} posts it by hand.`}</p>
        {load.over && <p className="m-0 mb-2 rounded-lg bg-[#fbeaea] px-3 py-2 text-meta text-[#9e1c1c]">This week needs about {load.minutes} minutes against a budget of {b.minutes}. {load.advice}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-body">
            <thead><tr className="border-b border-line text-left">{["Person", "Warm path", "Stage", "Engaged", ""].map((h) => <th key={h} className="label px-2 py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{targets.map((tg) => {
              const p = tg.prospect_id ? pById.get(tg.prospect_id) : null;
              return (
                <tr key={tg.id} className="border-b border-line last:border-0">
                  <td className="px-2 py-2"><span className="font-medium">{tg.linkedin ? <a href={tg.linkedin} target="_blank" rel="noopener" className="text-ink hover:underline">{tg.name}</a> : tg.name}</span><span className="block text-meta text-muted">{tg.company}</span></td>
                  <td className="px-2 py-2 text-ink-2">{people ? warm(tg) : "…"}</td>
                  <td className="px-2 py-2 text-ink-2">{p?.stage ?? "Not in pipeline"}</td>
                  <td className="px-2 py-2">{tg.engaged_at ? <span className="text-meta">{tg.engaged_reason || "Yes"}</span> : editable ? <button className="btn btn-ghost h-7 text-meta" onClick={() => markEngaged(tg, "Engaged with a campaign post")}>They engaged</button> : <span className="text-muted">No</span>}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">{tg.engaged_at && editable && <button className="btn btn-quiet h-7 text-meta" onClick={() => setDm(tg)}>Draft message</button>}{editable && <button className="btn btn-ghost h-7 w-7 p-0" aria-label={`Remove ${tg.name}`} onClick={() => removeTarget(tg)}><X size={13} /></button>}</td>
                </tr>
              );
            })}</tbody>
          </table>
          {!targets.length && <p className="p-4 text-center text-body text-muted">No one added yet. Pick 15 to 40 people from Pipeline and Network.</p>}
        </div>
      </section>

      <section className="card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div><span className="text-body font-semibold">Resource requests</span><span className="num ml-2 text-meta text-muted">{requests.length}</span>{b.resource?.name && <span className="ml-2 text-meta text-muted">{b.resource.link ? <a href={b.resource.link} target="_blank" rel="noopener">{b.resource.name}</a> : b.resource.name}</span>}</div>
          {editable && <button className="btn h-8" onClick={() => setReqForm(true)}>Log a request</button>}
        </div>
        {requests.length ? requests.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 border-t border-line py-2 text-body">
            <span className="min-w-0 flex-1"><span className="font-medium">{r.name}</span>{r.company && <span className="text-muted">, {r.company}</span>}<span className="block text-meta text-muted">{posts.find((p) => p.id === r.post_id)?.title ?? "Post not named"} · {fmtDay(r.created_at.slice(0, 10))}</span></span>
            {r.sent ? <span className="pill bg-[#ececec] text-ink">Sent</span> : editable && <button className="btn h-7 text-meta" onClick={async () => { await supabase().from("resource_requests").update({ sent: true }).eq("id", r.id); logActivity(ws.id, "resource", `Resource sent to ${r.name}`, r.prospect_id); toast("Marked as sent", async () => { await supabase().from("resource_requests").update({ sent: false }).eq("id", r.id); }); }}>Mark sent</button>}
          </div>
        )) : <p className="m-0 text-meta text-muted">{b.resource?.name ? "When someone asks for it in a comment or message, log it here. They become a warm lead in Pipeline." : "Add a resource in Edit campaign to track who asks for it."}</p>}
      </section>

      <div className="flex justify-end"><button className="btn" onClick={() => setShowReport(true)}><Printer size={14} /> {t > end ? "End-of-campaign report" : "Report so far"}</button></div>

      {picker && <TargetPicker c={c} existing={targets} prospects={prospects} people={people} onClose={() => setPicker(false)} />}
      {dm && <DmDraft c={c} tg={dm} prospect={dm.prospect_id ? pById.get(dm.prospect_id) : undefined} onClose={() => setDm(null)} />}
      {reqForm && <RequestForm c={c} posts={posts} targets={targets} prospects={prospects} onClose={() => setReqForm(false)} />}
      {showReport && <Report c={c} end={end} posts={posts} targets={targets} requests={requests} comments={comments} onClose={() => setShowReport(false)} />}
    </div>
  );
}

function TargetPicker({ c, existing, prospects, people, onClose }: { c: Campaign; existing: Target[]; prospects: Prospect[]; people: Person[] | null; onClose: () => void }) {
  const { ws } = useWorkspace();
  const toast = useToast();
  const [src, setSrc] = useState<"pipeline" | "network">("pipeline");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Record<string, { prospect_id: string | null; person_key: string; name: string; company: string; linkedin: string }>>({});
  const have = new Set(existing.map((x) => x.prospect_id ?? x.person_key));
  const total = existing.length + Object.keys(picked).length;
  const match = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase());
  const segs = c.brief.segments;
  const pRows = prospects.filter((p) => !["Won", "Parked"].includes(p.stage) && !have.has(p.id) && match(`${p.name} ${p.company}`)).sort((a, b) => Number(segs.includes(b.segment)) - Number(segs.includes(a.segment))).slice(0, 80);
  const nRows = (people ?? []).filter((p) => p.is_connection && !have.has(p.key) && !p.prospect_id && match(`${p.name} ${p.company} ${p.position}`)).slice(0, 80);
  const toggle = (k: string, v: (typeof picked)[string]) => setPicked((x) => { const n = { ...x }; if (n[k]) delete n[k]; else n[k] = v; return n; });
  async function save() {
    const rows = Object.values(picked).map((v) => ({ workspace_id: ws.id, campaign_id: c.id, ...v }));
    if (!rows.length) return onClose();
    const { data, error } = await supabase().from("campaign_targets").insert(rows).select();
    if (error) { toast(error.message); return; }
    if (c.kind === "event") await upsertToday(eventFollowUps(c.id, c.brief, (data as Target[]).map((x) => ({ id: x.id, name: x.name, linkedin: x.linkedin }))), ws.id);
    haptic(); toast(`${rows.length} added`, async () => { await supabase().from("campaign_targets").delete().in("id", (data as Target[]).map((x) => x.id)); });
    onClose();
  }
  return (
    <Modal title={c.kind === "event" ? "People to meet" : "Add target accounts"} onClose={onClose} footer={<><span className={`mr-auto num text-meta ${total > 40 ? "text-[#d64545]" : "text-muted"}`}>{total} of 15 to 40</span><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Add {Object.keys(picked).length || ""}</button></>}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line p-0.5">{(["pipeline", "network"] as const).map((s) => <button key={s} className={`h-8 rounded-md px-3 text-body font-semibold ${src === s ? "bg-[#d64545] text-white" : "text-muted"}`} onClick={() => setSrc(s)}>{s === "pipeline" ? "Pipeline" : "Network"}</button>)}</div>
        <input className="field ml-auto h-8 w-full sm:w-56" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {src === "network" && !people ? <p className="text-body text-muted">Loading the network.</p> : (
        <ul className="m-0 flex list-none flex-col p-0">
          {(src === "pipeline" ? pRows.map((p) => ({ k: p.id, v: { prospect_id: p.id, person_key: "", name: p.name, company: p.company, linkedin: p.linkedin }, sub: `${p.role ? p.role + ", " : ""}${p.company} · ${p.stage}${p.segment ? ` · ${p.segment}` : ""}` }))
            : nRows.map((p) => ({ k: p.key, v: { prospect_id: null, person_key: p.key, name: p.name, company: p.company, linkedin: p.url }, sub: `${p.position ? p.position + ", " : ""}${p.company}` }))).map((r) => (
            <li key={r.k}><label className="flex cursor-pointer items-center gap-3 border-b border-line py-2 text-body"><input type="checkbox" checked={!!picked[r.k]} onChange={() => toggle(r.k, r.v)} className="accent-[#d64545]" /><span className="min-w-0"><span className="block font-medium">{r.v.name}</span><span className="block truncate text-meta text-muted">{r.sub}</span></span></label></li>
          ))}
        </ul>
      )}
      {src === "network" && people && !people.length && <p className="text-body text-muted">Upload the LinkedIn export on the Network page to pick from connections.</p>}
    </Modal>
  );
}

function DmDraft({ c, tg, prospect, onClose }: { c: Campaign; tg: Target; prospect?: Prospect; onClose: () => void }) {
  const { ws } = useWorkspace();
  const toast = useToast();
  const connected = !!prospect && STAGES.indexOf(prospect.stage as (typeof STAGES)[number]) >= STAGES.indexOf("Connected");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const out = await askExtension<string>("ai", { kind: "studio", user: `${connected ? "Write a short LinkedIn message (under 80 words)" : "Write a LinkedIn connection note, 300 characters maximum"} from this profile to ${tg.name}${tg.company ? ` at ${tg.company}` : ""}. Why now: ${tg.engaged_reason || "they engaged with a recent post"}. Campaign topic: ${c.brief.topic}. ${c.brief.resource?.name ? `Resource on offer: ${c.brief.resource.name}.` : ""} Reference the reason specifically, offer value first, no pitch, no flattery.\nReturn only JSON: {"text": "..."}` });
        const j = parseJSON<{ text: string }>(out);
        setText(j?.text ?? "");
      } catch { setText(`Thank you for engaging with my post on ${c.brief.topic.toLowerCase()}. I would value hearing how your team is approaching it.`); toast("No AI key: a plain draft is in the box"); }
      setBusy(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function sent() {
    await logActivity(ws.id, "dm", `${connected ? "Message" : "Connection note"} sent to ${tg.name} · ${c.name}`, tg.prospect_id);
    await supabase().from("daily_items").update({ done: true }).eq("workspace_id", ws.id).eq("note", `campaign:${c.id}:dm:${tg.id}`);
    haptic(); toast(`Logged on ${tg.name}'s timeline`); onClose();
  }
  return (
    <Modal title={`${connected ? "Message" : "Connection note"} to ${tg.name}`} onClose={onClose} footer={<><button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(text); } catch {} toast("Copied. Paste it on LinkedIn and press Send there."); if (tg.linkedin) window.open(tg.linkedin, "_blank", "noopener"); }}>Copy and open profile</button><button className="btn btn-primary" disabled={busy} onClick={sent}>I sent it</button></>}>
      <p className="m-0 mb-2 text-meta text-muted">Why now: {tg.engaged_reason || "they engaged"}. Prax drafts; you send it yourself on LinkedIn.</p>
      <textarea className="field min-h-[160px] text-body" value={busy ? `Writing in ${possessive(firstNameOf(ws))} voice` : text} disabled={busy} onChange={(e) => setText(e.target.value)} />
      {!connected && <p className={`num m-0 mt-1 text-right text-meta ${text.length > 300 ? "text-[#d64545]" : "text-muted"}`}>{text.length} / 300</p>}
    </Modal>
  );
}

function RequestForm({ c, posts, targets, prospects, onClose }: { c: Campaign; posts: Post[]; targets: Target[]; prospects: Prospect[]; onClose: () => void }) {
  const { ws } = useWorkspace();
  const toast = useToast();
  const [f, setF] = useState({ name: "", company: "", linkedin: "", post_id: "", sent: false });
  async function save() {
    if (!f.name.trim()) { toast("Add who asked"); return; }
    const norm = (u: string) => u.toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, "");
    let p = prospects.find((x) => (f.linkedin && x.linkedin && norm(x.linkedin) === norm(f.linkedin)) || x.name.toLowerCase() === f.name.trim().toLowerCase());
    let created = false;
    if (!p) {
      const { data } = await supabase().from("prospects").insert({ workspace_id: ws.id, name: f.name.trim(), company: f.company, linkedin: f.linkedin, stage: "Warming", warmth: "warm", segment: c.brief.segments[0] ?? "", why: `Asked for ${c.brief.resource?.name || "the resource"} (${c.name})` }).select().single();
      p = data as Prospect; created = true;
    } else if (p.stage === "Target") await supabase().from("prospects").update({ stage: "Warming", warmth: "warm" }).eq("id", p.id);
    else await supabase().from("prospects").update({ warmth: "warm" }).eq("id", p.id);
    const { error } = await supabase().from("resource_requests").insert({ workspace_id: ws.id, campaign_id: c.id, post_id: f.post_id || null, prospect_id: p?.id ?? null, name: f.name.trim(), company: f.company, linkedin: f.linkedin, sent: f.sent });
    if (error) { toast(error.message); return; }
    logActivity(ws.id, "resource", `${f.name.trim()} asked for ${c.brief.resource?.name || "the resource"}`, p?.id);
    const tg = targets.find((x) => (p && x.prospect_id === p.id) || (f.linkedin && x.linkedin === f.linkedin));
    if (tg && !tg.engaged_at) await supabase().from("campaign_targets").update({ engaged_at: new Date().toISOString(), engaged_reason: "Asked for the resource" }).eq("id", tg.id);
    haptic(); toast(created ? `${f.name.trim()} added to Pipeline as a warm lead` : `${f.name.trim()} warmed in Pipeline`); onClose();
  }
  return (
    <Modal title="Log a resource request" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Log it</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1"><span className="label">Who asked</span><input className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="flex flex-col gap-1"><span className="label">Company</span><input className="field" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></label>
        <label className="flex flex-col gap-1 sm:col-span-2"><span className="label">LinkedIn URL</span><input className="field" type="url" value={f.linkedin} onChange={(e) => setF({ ...f, linkedin: e.target.value })} placeholder="https://www.linkedin.com/in/" /></label>
        <label className="flex flex-col gap-1 sm:col-span-2"><span className="label">From which post</span><select className="field" value={f.post_id} onChange={(e) => setF({ ...f, post_id: e.target.value })}><option value="">Not sure</option>{posts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
        <SwitchRow className="sm:col-span-2" on={f.sent} onChange={(v) => setF({ ...f, sent: v })} label="Already sent" />
      </div>
    </Modal>
  );
}

function Report({ c, end, posts, targets, requests, comments, onClose }: { c: Campaign; end: string; posts: Post[]; targets: Target[]; requests: Request[]; comments: Comment[]; onClose: () => void }) {
  const { ws } = useWorkspace();
  const cit = useCitationProfile();
  const [extra, setExtra] = useState<{ conversations: number; moves: number; citations: { before: number | null; after: number | null } | null } | null>(null);
  const ids = targets.map((x) => x.prospect_id).filter(Boolean) as string[];
  useEffect(() => {
    if (!cit.ready) return;
    (async () => {
      let conversations = 0, moves = 0, citations: { before: number | null; after: number | null } | null = null;
      if (ids.length) {
        const { data } = await supabase().from("activity").select("label,at,ref_id").eq("workspace_id", ws.id).eq("kind", "stage").in("ref_id", ids).gte("at", c.brief.start).lte("at", addDays(end, 1));
        moves = (data ?? []).length; conversations = (data ?? []).filter((a: { label: string }) => /In conversation|Call booked/.test(a.label)).length;
      }
      // AI citations: the campaign's topic and keywords pick the questions; named share before and after the start.
      // Only the tracked profile in view on AI citations counts.
      const [runsQ, qsQ, entQ] = await Promise.all([
        scoped(supabase().from("citation_runs").select("*, citation_sources(url,title,domain,cited,sort)").eq("workspace_id", ws.id), cit.scope).order("run_at", { ascending: false }).limit(3000),
        scoped(supabase().from("citation_questions").select("*").eq("workspace_id", ws.id), cit.scope),
        scoped(supabase().from("citation_entities").select("*").eq("workspace_id", ws.id).eq("kind", "self"), cit.scope).limit(1),
      ]);
      const self = (entQ.data as Entity[] | null)?.[0];
      if (!runsQ.error && self && runsQ.data?.length) {
        const runs = (runsQ.data as (Run & { citation_sources: Source[] })[]).map((r) => ({ ...r, sources: r.citation_sources ?? [] }));
        const l = campaignLift(runs, (qsQ.data as Question[]) ?? [], self, { id: c.id, start: c.brief.start, topic: c.brief.topic, keywords: c.brief.keywords });
        if (l.questions) citations = { before: l.before, after: l.after };
      }
      setExtra({ conversations, moves, citations });
    })();
  }, [cit.ready, cit.scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const res = resultsSummary(posts.filter((p) => statusOf(p.status) === "Posted"));
  const replies = comments.filter((x) => x.reply && x.prospect_id && ids.includes(x.prospect_id) && x.day >= c.brief.start && x.day <= end).length;
  const r = report(c.brief, { posts: posts.map((p) => ({ id: p.id, status: statusOf(p.status), publish_date: p.publish_date, format: p.format })), replies, conversations: extra?.conversations ?? 0, requests, stageMoves: extra?.moves ?? 0, targets: targets.length, engaged: targets.filter((x) => x.engaged_at).length, citations: extra?.citations, results: res }, firstNameOf(ws));
  return (
    <Modal title={`${c.name}: report`} onClose={onClose} wide footer={<><button className="btn" onClick={() => window.print()}><Printer size={14} /> Print</button><button className="btn btn-primary" onClick={onClose}>Close</button></>}>
      <div className="print-area">
        <h3 className="m-0 text-page font-semibold">{c.name}</h3>
        <p className="m-0 mt-1 text-body text-muted">{objective(c.brief.objective).label} · {c.brief.topic} · {fmtDay(c.brief.start, { day: "numeric", month: "short" })} to {fmtDay(end, { day: "numeric", month: "short", year: "numeric" })} · judged by {c.brief.measure.toLowerCase()}</p>
        <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Posts out", `${r.posted} of ${r.planned}`], ["Impressions", res.measured ? res.impressions.toLocaleString("en-GB") : "Not added"], ["Engaged accounts", `${targets.filter((x) => x.engaged_at).length} of ${targets.length}`], ["Resource requests", String(requests.length)]].map(([k, v]) => <div key={k} className="rounded-xl border border-line p-3"><div className="label">{k}</div><div className="num mt-1 text-page">{v}</div></div>)}
        </div>
        {!extra ? <p className="text-body text-muted">Reading the activity.</p> : <ul className="m-0 flex flex-col gap-2 pl-5 text-body leading-relaxed">{r.lines.map((l) => <li key={l}>{l}</li>)}</ul>}
      </div>
    </Modal>
  );
}
