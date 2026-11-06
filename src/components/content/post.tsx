"use client";
import { useEffect, useMemo, useState } from "react";
import { X, Copy, Sparkles, Repeat2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useWorkspace, fmtDay, today } from "@/lib/workspace";
import { useToast, haptic } from "@/components/toaster";
import { Threads } from "@/components/threads";
import { askExtension, parseJSON } from "@/lib/bridge";
import { FORMATS, reshareFallback } from "@/lib/campaigns";
import { cap, fullNameOf, firstNameOf, companyOf, roleOf, pillarsOf, possessive, initialsOf, PROFILE_CHANNEL, type Channel } from "@/lib/persona";
import { claimsCheck, povText, parseCount, hasResults, engagementRate, linksOut, firstLink, parsePrep, repurposeLabel, type Prep } from "@/lib/content";
import { type Post, type Campaign, StatusPill, ChannelFlag, statusOf, logActivity, syncApprovalSession, Modal } from "./shared";
import { usePostImage } from "./media";
import type { ContentSettings } from "./settings";

const when = (p: Post) => (p.publish_date ? `${fmtDay(p.publish_date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}${p.planned_time ? `, ${p.planned_time}` : ""}` : "Not planned");
const stamp = (s: string | null) => (s ? new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

/** Read-only view of a post, opened from Library, Plan and campaign rows. */
export function PostView({ post, campaigns, members, posts = [], onClose, onEdit, onRepurpose }: { post: Post; campaigns: Campaign[]; members: Record<string, string>; posts?: Post[]; onClose: () => void; onEdit: () => void; onRepurpose?: (p: Post) => void }) {
  const { ws, can } = useWorkspace();
  const first = firstNameOf(ws), name = fullNameOf(ws), company = companyOf(ws);
  const camp = campaigns.find((c) => c.id === post.campaign_id);
  const st = statusOf(post.status);
  const img = usePostImage(post.image_path);
  const from = post.repurposed_from ? posts.find((p) => p.id === post.repurposed_from) : null;
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="flex justify-between gap-3 border-b border-line py-2 text-body last:border-0"><span className="text-muted">{k}</span><span className="text-right font-medium">{v}</span></div>;
  return (
    <Modal title={post.title || "Untitled post"} onClose={onClose} wide footer={<>{can("editor") && st === "Posted" && onRepurpose && <button className="btn" onClick={() => onRepurpose(post)}><Repeat2 size={14} /> Repurpose</button>}{can("editor") && <button className="btn btn-primary" onClick={onEdit}>Edit</button>}<button className="btn" onClick={onClose}>Close</button></>}>
      {post.channel === "company" && <p className="m-0 mb-4 rounded-xl bg-surface-2 px-3.5 py-2.5 text-body font-semibold text-ink">Company content, not for {possessive(first)} profile</p>}
      <div className="grid gap-5 md:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <div className="label mb-2">Draft, as it reads on LinkedIn</div>
          <div className="overflow-hidden rounded-xl border border-line bg-white shadow-[var(--shadow)]">
            <div className="p-4">
              <div className="mb-3 flex items-center gap-2.5"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#141414] text-body font-semibold text-white">{initialsOf(post.channel === "company" ? companyOf(ws, "") : fullNameOf(ws, ""))}</span><span className="flex flex-col"><span className="text-body font-semibold">{post.channel === "company" ? cap(company) : cap(name)}</span><span className="text-meta text-muted">{post.channel === "company" ? "Company page" : ws.headline || "LinkedIn profile"}</span></span></div>
              <p className="m-0 whitespace-pre-wrap text-body leading-relaxed">{post.draft || <span className="text-muted">No draft yet.</span>}</p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- a signed Storage link, not a static asset */}
            {post.image_path && (img ? <img src={img} alt="Post visual" className="block w-full border-t border-line" /> : <div className="aspect-[4/3] w-full animate-pulse border-t border-line bg-surface-2" aria-label="Loading the image" />)}
          </div>
          {(st === "Ready" || st === "Posted") && <PrepBlock post={post} />}
          <div className="mt-5"><Threads refTable="posts" refId={post.id} /></div>
        </div>
        <aside>
          {post.angle && <p className="m-0 mb-3 rounded-xl bg-surface-2 px-3.5 py-2.5 text-body leading-snug text-ink"><b className="font-semibold">Angle</b> {post.angle}</p>}
          {st === "Posted" && <ResultsBlock post={post} />}
          {post.source_kind === "discovery" && <Row k="From" v={`Discovery Studio${post.discovery?.rank ? ` · #${post.discovery.rank}` : ""}${post.discovery?.score != null ? ` · ${post.discovery.score}` : ""}`} />}
          {post.source_kind === "repurpose" && <Row k="From" v={`${repurposeLabel(post.source_ref ?? "")} of ${from ? `"${from.title}"` : "a posted piece"}`} />}
          <Row k="Campaign" v={camp ? <span className="text-[#d64545]">{camp.name}</span> : "Independent"} />
          <Row k="Type" v={post.format || "Text post"} />
          <Row k="Where" v={post.channel === "company" ? <ChannelFlag p={post} /> : `${possessive(cap(first))} profile`} />
          {post.newsletter && <Row k="Newsletter" v="Yes" />}
          <Row k="Pillar" v={post.pillar || post.topic || "Not set"} />
          <Row k="Status" v={<StatusPill s={post.status} />} />
          <Row k="Planned" v={when(post)} />
          {post.phase && <Row k="Phase" v={post.phase} />}
          <div className="label mb-1.5 mt-4">Approval history</div>
          {!post.requested_at && !post.decided_at ? <p className="text-body text-muted">Not sent for approval.</p> : (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-body">
              {post.requested_at && <li>Sent for approval by {members[post.requested_by ?? ""] || "the team"}, {stamp(post.requested_at)}</li>}
              {post.decided_at && <li>{post.decision === "approved" ? "Approved" : "Changes asked"} by {members[post.decided_by ?? ""] || first}, {stamp(post.decided_at)}</li>}
              {post.decision_note && <li className="rounded-lg bg-surface-2 px-2.5 py-1.5">&ldquo;{post.decision_note}&rdquo;</li>}
            </ul>
          )}
        </aside>
      </div>
    </Modal>
  );
}

/** Edit a post: text, type, pillar, campaign, AI draft, approval, plan, hand off, reshare notes. Never posts. */
export function PostEditor({ post, campaigns, posts, settings, companies, onClose }: { post: Post; campaigns: Campaign[]; posts: Post[]; settings?: ContentSettings; companies?: string[]; onClose: () => void }) {
  const { ws, can, userId } = useWorkspace();
  const first = firstNameOf(ws), company = companyOf(ws), pillars = pillarsOf(ws);
  const who = { name: fullNameOf(ws), first, role: roleOf(ws) };
  const toast = useToast();
  const [f, setF] = useState<Post>(post);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [reshare, setReshare] = useState<{ page: string; notes: { name: string; text: string }[] } | null>(null);
  const owner = can("owner"), editable = can("editor");
  const camp = campaigns.find((c) => c.id === f.campaign_id);
  const paused = campaigns.filter((c) => c.status === "paused").map((c) => c.id);
  const st = statusOf(f.status);
  const [ack, setAck] = useState(!!post.claims_ack);
  const flags = useMemo(() => claimsCheck(f.draft, { companies, permitted: settings?.pov.clients ?? [] }), [f.draft, companies, settings?.pov.clients]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const set = <K extends keyof Post>(k: K, v: Post[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save(patch: Partial<Post> = {}, msg = "Saved", undo?: Partial<Post>) {
    const next = { ...f, ...patch };
    const body = { title: next.title, format: next.format, pillar: next.pillar, campaign_id: next.campaign_id, draft: next.draft, publish_date: next.publish_date || null, planned_time: next.planned_time, status: next.status,
      requested_by: next.requested_by, requested_at: next.requested_at, decided_by: next.decided_by, decided_at: next.decided_at, decision: next.decision, decision_note: next.decision_note, phase: next.phase,
      channel: next.channel ?? PROFILE_CHANNEL, newsletter: next.format === "Article" && !!next.newsletter, claims_ack: ack };
    const { error } = await supabase().from("posts").update(body).eq("id", post.id);
    if (error) { toast(error.message); return false; }
    setF(next); haptic();
    if ("status" in patch) await syncApprovalSession(ws.id, ws.slug, posts.map((p) => (p.id === post.id ? next : p)), paused);
    toast(msg, undo ? async () => { await supabase().from("posts").update(undo).eq("id", post.id); setF((x) => ({ ...x, ...undo })); await syncApprovalSession(ws.id, ws.slug, posts.map((p) => (p.id === post.id ? { ...next, ...undo } : p)), paused); } : undefined);
    return true;
  }

  async function aiDraft() {
    setBusy("draft");
    try {
      const brief = camp?.brief;
      const out = await askExtension<string>("ai", { kind: "studio", user: `Write a LinkedIn ${f.format || "text post"} for this profile.\nTitle or idea: ${f.title}\nPillar: ${f.pillar || f.topic}\n${brief ? `Campaign: ${camp!.name}. Phase: ${f.phase || "any"}. Core message: ${brief.message}. Call to action: ${brief.cta}. Keywords: ${brief.keywords.join(", ")}.` : ""}\n${settings ? povText(settings.pov, first) + "\n" : ""}${f.channel === "company" ? `Write it for the ${company} company page, as the company.\n` : ""}${f.draft ? `Current draft to improve:\n${f.draft}\n` : ""}Open with a line under 140 characters that stands alone. 120 to 220 words for a text post; for a carousel give slide lines; for a video give a short script with what to say and show. Use only facts given here.\nReturn only JSON: {"draft": "..."}` });
      const j = parseJSON<{ draft: string }>(out);
      if (!j?.draft) throw new Error("No draft came back. Try again.");
      const prev = f.draft;
      setF((x) => ({ ...x, draft: j.draft }));
      toast(`Draft written in ${possessive(first)} voice`, () => setF((x) => ({ ...x, draft: prev })));
    } catch (e) { toast((e as Error).message); }
    setBusy("");
  }

  async function sendForApproval() {
    if (!f.draft.trim()) { toast("Write the draft first"); return; }
    if (flags.length && !ack) { toast("Read the claims check and tick that you checked them"); return; }
    const undo = { status: f.status, requested_by: f.requested_by, requested_at: f.requested_at, decision: f.decision, decision_note: f.decision_note };
    if (await save({ status: "In review", requested_by: userId, requested_at: new Date().toISOString(), decision: "", decision_note: "" }, `Sent to ${first}. It is in the weekly approval session on Today.`, undo))
      logActivity(ws.id, "approval", `Sent for approval: ${f.title}`, post.id);
  }
  async function decide(approved: boolean) {
    if (!approved && !note.trim()) { toast("Add a short note so the team knows what to change"); return; }
    if (approved && flags.length && !ack) { toast("Read the claims check and tick that you checked them"); return; }
    const undo = { status: f.status, decided_by: f.decided_by, decided_at: f.decided_at, decision: f.decision, decision_note: f.decision_note };
    if (await save({ status: approved ? "Ready" : "Drafting", decided_by: userId, decided_at: new Date().toISOString(), decision: approved ? "approved" : "changes", decision_note: note.trim() }, approved ? "Approved. It is Ready." : "Changes asked. The team sees your note.", undo)) {
      logActivity(ws.id, "approval", `${approved ? "Approved" : "Changes asked"}: ${f.title}`, post.id); setNote("");
    }
  }
  async function handOff() {
    try { await navigator.clipboard.writeText(f.draft); } catch {}
    window.open("https://www.linkedin.com/feed/", "_blank", "noopener");
    toast("Copied. LinkedIn is open in a new tab: paste, then press Post there.");
  }
  async function genReshare() {
    const colleagues = camp?.brief.colleagues ?? [];
    setBusy("reshare");
    try {
      const out = await askExtension<string>("ai", { kind: "studio", user: `${fullNameOf(ws)} is posting this on LinkedIn:\n${f.draft || f.title}\n\nWrite (1) a short version for the ${company} company page that credits ${first}, and (2) one reshare note of under 40 words for each colleague: ${colleagues.join(", ") || "none"}. Calm B2B tone.\nReturn only JSON: {"page": "...", "notes": [{"name": "...", "text": "..."}]}` });
      const j = parseJSON<{ page: string; notes: { name: string; text: string }[] }>(out);
      setReshare(j?.page ? { page: j.page, notes: j.notes ?? [] } : reshareFallback(f.title, colleagues, who));
    } catch { setReshare(reshareFallback(f.title, colleagues, who)); toast("No AI key: standard notes written instead"); }
    setBusy("");
  }
  const copy = async (t: string, label: string) => { try { await navigator.clipboard.writeText(t); } catch {} haptic(); toast(`${label} copied`); };

  return (
    <div className="fixed inset-0 z-[56] flex justify-end bg-black/30" onMouseDown={onClose}>
      <aside role="dialog" aria-label="Edit post" className="cs flex h-full w-full max-w-[560px] flex-col border-l border-line bg-white shadow-[var(--shadow-lg)]" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2"><StatusPill s={f.status} /><ChannelFlag p={f} /><span className="truncate text-body text-muted">{camp ? camp.name : "Independent"}</span></div>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="flex-1 overflow-auto px-5 py-4">
          <fieldset disabled={!editable} className="m-0 grid grid-cols-2 gap-3 border-0 p-0">
            <label className="col-span-2 flex flex-col gap-1"><span className="label">Title or idea</span><input className="field" value={f.title} onChange={(e) => set("title", e.target.value)} /></label>
            <label className="flex flex-col gap-1"><span className="label">Type</span><select className="field" value={f.format || "Text post"} onChange={(e) => set("format", e.target.value)}>{FORMATS.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className="flex flex-col gap-1"><span className="label">Pillar</span><select className="field" value={f.pillar} onChange={(e) => set("pillar", e.target.value)}><option value="">Not set</option>{pillars.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className="flex flex-col gap-1"><span className="label">Where it goes</span><select className="field" value={f.channel ?? PROFILE_CHANNEL} onChange={(e) => set("channel", e.target.value as Channel)}><option value={PROFILE_CHANNEL}>{possessive(first)} own profile</option><option value="company">{cap(company)} company page</option></select></label>
            <label className="flex items-end gap-2 pb-2 text-body">{f.format === "Article" && settings?.newsletter.name ? <><input type="checkbox" checked={!!f.newsletter} onChange={(e) => set("newsletter", e.target.checked)} />Part of {settings.newsletter.name}</> : null}</label>
            {f.channel === "company" && <p className="col-span-2 m-0 rounded-lg bg-surface-2 px-3 py-2 text-meta font-semibold text-ink">Company content, not for {possessive(first)} profile</p>}
            <label className="col-span-2 flex flex-col gap-1"><span className="label">Campaign</span><select className="field" value={f.campaign_id ?? ""} onChange={(e) => set("campaign_id", e.target.value || null)}><option value="">Independent</option>{campaigns.filter((c) => !c.template).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <div className="col-span-2 flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2"><span className="label">Draft</span>{post.id && f.draft.trim().length > 80 && <a className="ml-auto text-meta font-semibold underline underline-offset-2" href={`/w/${ws.slug}/citations?draft=${post.id}`} title="Test whether AI tools would cite this draft. Save first.">Is this citable?</a>}<button type="button" className="btn btn-dark h-7 text-meta" disabled={!!busy} onClick={aiDraft}><Sparkles size={13} /> {busy === "draft" ? "Writing" : f.draft ? "Improve with AI" : "AI draft"}</button></div>
              <textarea className="field min-h-[220px] text-body" value={f.draft} onChange={(e) => set("draft", e.target.value)} placeholder={`Write here, or press AI draft. ${cap(possessive(first))} voice and locked rules apply.`} />
              <span className="num text-right text-meta text-muted">{Array.from(f.draft).length.toLocaleString()} / 3000</span>
            </div>
            <label className="flex flex-col gap-1"><span className="label">Day</span><input type="date" className="field" value={f.publish_date ?? ""} onChange={(e) => set("publish_date", e.target.value || null)} /></label>
            <label className="flex flex-col gap-1"><span className="label">Time, Dubai</span><input type="time" className="field" value={f.planned_time} onChange={(e) => set("planned_time", e.target.value)} /></label>
          </fieldset>
          {editable && <div className="mt-3 flex justify-end"><button className="btn btn-primary" onClick={() => save({}, "Saved")}>Save</button></div>}

          {!!flags.length && st !== "Posted" && <section className="mt-5 rounded-xl border-2 border-[#d64545] p-4">
            <div className="mb-2 text-body font-semibold">Claims check before approval</div>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{flags.map((x, i) => <li key={i} className="text-body"><span className="font-semibold text-[#d64545]">{x.kind === "returns" ? "Returns" : x.kind === "timeline" ? "Timeline" : x.kind === "client" ? "Client named" : x.kind === "regulator" ? "Regulator" : "Confidential"}</span> · &ldquo;{x.text}&rdquo;<span className="block text-meta text-muted">{x.why}</span></li>)}</ul>
            <label className="mt-2.5 flex items-center gap-2 text-body"><input type="checkbox" checked={ack} disabled={!editable} onChange={(e) => setAck(e.target.checked)} />I checked these and they are fine to publish</label>
          </section>}

          <section className="mt-5 rounded-xl border border-line p-4">
            <div className="mb-2 flex items-center justify-between"><span className="label">Approval</span><StatusPill s={f.status} /></div>
            {st === "In review" ? (owner ? (
              <div className="flex flex-col gap-2">
                <p className="m-0 text-body">Waiting for your decision.</p>
                <textarea className="field text-body" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the team (needed when asking for changes)" />
                <div className="flex gap-2"><button className="btn btn-primary" onClick={() => decide(true)}>Approve</button><button className="btn" onClick={() => decide(false)}>Ask for changes</button></div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="m-0 text-body">With {first} since {stamp(f.requested_at)}.</p>
                {editable && <button className="btn" onClick={() => save({ status: "Drafting", requested_at: null, requested_by: null }, `Withdrawn. ${cap(first)} no longer sees it.`, { status: "In review", requested_at: f.requested_at, requested_by: f.requested_by })}>Withdraw</button>}</div>
            )) : st === "Ready" || st === "Posted" ? (
              <p className="m-0 text-body">{f.decision === "approved" ? `Approved ${stamp(f.decided_at)}.` : st === "Posted" ? "Posted." : "Ready to post."}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {f.decision === "changes" && f.decision_note && <p className="m-0 rounded-lg bg-surface-2 px-3 py-2 text-body">{cap(first)} asked for changes: &ldquo;{f.decision_note}&rdquo;</p>}
                <p className="m-0 text-body text-muted">{cap(first)} approves team drafts in one weekly session on Today.</p>
                {editable && <div><button className="btn btn-primary" onClick={sendForApproval}>Send to {first}</button>{owner && <button className="btn btn-ghost ml-1" onClick={() => decide(true)}>Approve it myself</button>}</div>}
              </div>
            )}
          </section>

          {(st === "Ready" || st === "Posted") && (
            <section className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line p-4">
              <button className="btn btn-primary" onClick={handOff}><Copy size={14} /> Copy and open LinkedIn</button>
              {st !== "Posted" && editable && <button className="btn" onClick={() => save({ status: "Posted", publish_date: f.publish_date || new Date().toISOString().slice(0, 10) }, "Marked as posted", { status: f.status, publish_date: f.publish_date })}>Mark as posted</button>}
              <span className="text-meta text-muted">Prax never posts. {cap(first)} presses Post on LinkedIn.</span>
            </section>
          )}

          <section className="mt-3 rounded-xl border border-line p-4">
            <div className="mb-2 flex items-center justify-between"><span className="label">Company page and reshare notes</span><button className="btn h-7 text-meta" disabled={!!busy} onClick={genReshare}>{busy === "reshare" ? "Writing" : reshare ? "Write again" : "Write them"}</button></div>
            {!reshare ? <p className="m-0 text-meta text-muted">A version for the {company} page and a short note for each colleague named in the campaign. Copy them by hand; nothing is posted.</p> : (
              <div className="flex flex-col gap-2">
                <div className="rounded-lg bg-surface-2 p-3 text-body"><div className="label mb-1">{cap(company)} page</div><p className="m-0 whitespace-pre-wrap">{reshare.page}</p><div className="mt-2 flex gap-2"><button className="btn h-7 text-meta" onClick={() => copy(reshare.page, "Page text")}>Copy</button><button className="btn btn-ghost h-7 text-meta" onClick={() => { logActivity(ws.id, "reshare", `${cap(company)} page shared: ${f.title}`, post.id); toast(`Logged as shared on the ${company} page`); }}>Log as shared</button></div></div>
                {reshare.notes.map((n) => (
                  <div key={n.name} className="rounded-lg bg-surface-2 p-3 text-body"><div className="label mb-1">{n.name}</div><p className="m-0">{n.text}</p><div className="mt-2 flex gap-2"><button className="btn h-7 text-meta" onClick={() => copy(n.text, `Note for ${n.name}`)}>Copy</button><button className="btn btn-ghost h-7 text-meta" onClick={() => { logActivity(ws.id, "reshare", `${n.name} reshared: ${f.title}`, post.id); toast(`Logged: ${n.name} reshared`); }}>Log as reshared</button></div></div>
                ))}
                {!reshare.notes.length && <p className="m-0 text-meta text-muted">Add colleagues to the campaign to get reshare notes.</p>}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

const n0 = (v: number | null | undefined) => (v == null ? "" : String(v));
const FIELDS = [["impressions", "Impressions"], ["reactions", "Reactions"], ["comments", "Comments"], ["reposts", "Reposts"]] as const;
type Field = (typeof FIELDS)[number][0];

/** Results of a posted piece (CS29): typed in here from LinkedIn's analytics, or read by the extension (db/022). */
function ResultsBlock({ post }: { post: Post }) {
  const { can } = useWorkspace();
  const toast = useToast();
  const editable = can("editor");
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Record<Field, string>>({ impressions: "", reactions: "", comments: "", reposts: "" });
  const [day, setDay] = useState(today());
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const has = hasResults(post);
  const rate = engagementRate(post);
  const bad = FIELDS.filter(([k]) => v[k].trim() && parseCount(v[k]) == null).map(([k]) => k as Field);
  const start = () => { setV({ impressions: n0(post.impressions), reactions: n0(post.reactions), comments: n0(post.comments), reposts: n0(post.reposts) }); setDay(post.results_at || today()); setLink(post.url || ""); setOpen(true); };
  async function save() {
    if (bad.length) return;
    const next = { impressions: parseCount(v.impressions), reactions: parseCount(v.reactions), comments: parseCount(v.comments), reposts: parseCount(v.reposts) };
    const body = { ...next, results_at: Object.values(next).some((x) => x != null) ? day || today() : null, results_source: "manual", url: link.trim() };
    const prev = { impressions: post.impressions, reactions: post.reactions, comments: post.comments, reposts: post.reposts ?? null, results_at: post.results_at ?? null, results_source: post.results_source ?? "", url: post.url };
    setBusy(true);
    const { error } = await supabase().from("posts").update(body).eq("id", post.id);
    setBusy(false);
    if (error) { toast(error.message); return; }
    haptic(); setOpen(false);
    toast("Results saved. What works and the campaign report use them.", async () => { await supabase().from("posts").update(prev).eq("id", post.id); });
  }
  return (
    <section className="mb-4 rounded-xl border border-line bg-white p-3.5" aria-label="Results">
      <div className="mb-2 flex items-center justify-between gap-2"><span className="text-body font-semibold">Results</span>{editable && !open && <button className="btn btn-quiet h-7 text-meta" onClick={start}>{has ? "Edit" : "Add results"}</button>}</div>
      {open ? (
        <form className="flex flex-col gap-2.5" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="grid grid-cols-2 gap-2">
            {FIELDS.map(([k, l], i) => (
              <label key={k} className="flex min-w-0 flex-col gap-1"><span className="text-meta text-muted">{l}</span>
                <input className="field num h-9" inputMode="decimal" autoFocus={i === 0} value={v[k]} placeholder="0" aria-invalid={bad.includes(k)} onChange={(e) => setV({ ...v, [k]: e.target.value })} style={bad.includes(k) ? { borderColor: "#d64545" } : undefined} />
              </label>
            ))}
          </div>
          {!!bad.length && <p className="m-0 text-meta text-[#9e1c1c]">Use whole numbers, or the short form LinkedIn shows, such as 2.1K.</p>}
          <label className="flex flex-col gap-1"><span className="text-meta text-muted">Measured on</span><input type="date" className="field h-9" value={day} max={today()} onChange={(e) => setDay(e.target.value)} /></label>
          <label className="flex flex-col gap-1"><span className="text-meta text-muted">Post link on LinkedIn</span><input type="url" className="field h-9" value={link} placeholder="https://www.linkedin.com/feed/update/..." onChange={(e) => setLink(e.target.value)} /></label>
          <p className="m-0 text-meta leading-snug text-muted">With the link saved, the extension can fill these in when the analytics page of the post is open.</p>
          <div className="flex gap-2"><button type="submit" className="btn btn-dark h-8" disabled={busy || !!bad.length}>{busy ? "Saving" : "Save results"}</button><button type="button" className="btn btn-ghost h-8" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      ) : has ? (
        <>
          <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-2">
            {FIELDS.map(([k, l]) => <div key={k} className="flex flex-col"><dt className="text-meta text-muted">{l}</dt><dd className="num m-0 text-title font-semibold">{post[k] == null ? <span className="text-body font-normal text-muted">Not added</span> : (post[k] as number).toLocaleString("en-GB")}</dd></div>)}
          </dl>
          <p className="m-0 mt-2.5 text-meta leading-snug text-muted">{rate != null ? `${rate} interactions per 100 impressions. ` : ""}{post.results_at ? `Measured ${fmtDay(post.results_at, { day: "numeric", month: "short" })}` : "Measured"}{post.results_source === "extension" ? ", read by the extension." : ", added by hand."}</p>
        </>
      ) : <p className="m-0 text-meta leading-snug text-muted">No numbers yet. Add them from the analytics of the post on LinkedIn, two days or more after posting, when they have settled.</p>}
    </section>
  );
}

/** First comment (only when the post links out) and three likely replies with answers (CS31). Copy only; Prax never posts. */
function PrepBlock({ post }: { post: Post }) {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const first = firstNameOf(ws);
  const [busy, setBusy] = useState(false);
  const prep: Prep | null = post.prep && (post.prep.first || post.prep.replies?.length) ? { first: post.prep.first ?? "", replies: post.prep.replies ?? [], at: post.prep.at } : null;
  const link = linksOut(post.draft) ? firstLink(post.draft) : "";
  async function make() {
    if (!post.draft.trim()) { toast("Write the draft first"); return; }
    setBusy(true);
    try {
      const out = await askExtension<string>("ai", { kind: "studio", user: `${fullNameOf(ws)} is posting this on LinkedIn:\n${post.draft}\n\n${link ? `The post links to ${link}. Write the first comment ${first} adds right after posting: one or two sentences on why the link is worth opening, then the link.\n` : "The post does not link out, so no first comment is needed: leave \"first\" empty.\n"}Then write the 3 replies most likely from senior readers (a question, a push back, a request for detail) and ${possessive(first)} answer to each, 30 to 60 words, "I think" or "In my view" where it fits. Use only facts in the post. No dashes, no contractions, no hashtags.\nReturn only JSON: {"first": "...", "replies": [{"q": "...", "a": "..."}]}` }, 90000);
      const p = parsePrep(parseJSON(out), link);
      if (!p.replies.length && !p.first) throw new Error("Nothing usable came back. Try again.");
      const { error } = await supabase().from("posts").update({ prep: { ...p, at: new Date().toISOString() } }).eq("id", post.id);
      if (error) throw new Error(error.message);
      haptic(); toast(link ? "First comment and replies ready to copy" : "Replies ready to copy");
    } catch (e) { toast((e as Error).message); }
    setBusy(false);
  }
  const copy = async (t: string, label: string) => { try { await navigator.clipboard.writeText(t); } catch {} haptic(); toast(`${label} copied`); };
  return (
    <section className="mt-4 rounded-xl border border-line bg-white p-4" aria-label="First comment and replies">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-body font-semibold">{link ? "First comment and replies" : "Replies to prepare"}</span>
        {can("editor") && <button className="btn h-8 text-meta" disabled={busy} onClick={make}><Sparkles size={13} /> {busy ? "Writing" : prep ? "Prepare again" : "Prepare"}</button>}
      </div>
      {!prep ? <p className="m-0 mt-1.5 text-meta leading-snug text-muted">{link ? `The post links out, so the link reads better in a first comment. Prax drafts it, plus the three replies ${first} is most likely to get and an answer for each.` : `The three replies ${first} is most likely to get, each with an answer ready. No first comment is needed: the post does not link out.`} Copy them by hand; nothing is posted.</p> : (
        <div className="mt-3 flex flex-col gap-3">
          {prep.first && <div className="rounded-lg bg-surface-2 p-3"><div className="mb-1 flex items-center justify-between gap-2"><span className="text-meta font-semibold">First comment</span><button className="btn btn-quiet h-7 text-meta" onClick={() => copy(prep.first, "First comment")}><Copy size={12} /> Copy</button></div><p className="m-0 break-words text-body leading-relaxed">{prep.first}</p></div>}
          <ol className="m-0 flex list-none flex-col p-0">
            {prep.replies.map((r, i) => (
              <li key={i} className={`flex flex-col gap-1 py-2.5 ${i ? "border-t border-line" : ""}`}>
                <span className="text-meta text-muted">If someone says</span>
                <span className="text-body leading-snug">&ldquo;{r.q}&rdquo;</span>
                <span className="mt-1 flex items-center justify-between gap-2"><span className="text-meta text-muted">{cap(first)} can answer</span><button className="btn btn-quiet h-7 text-meta" onClick={() => copy(r.a, "Answer")}><Copy size={12} /> Copy</button></span>
                <span className="text-body leading-relaxed">{r.a}</span>
              </li>
            ))}
          </ol>
          {prep.at && <p className="m-0 text-meta text-muted">Prepared {stamp(prep.at)}</p>}
        </div>
      )}
    </section>
  );
}
