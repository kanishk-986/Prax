"use client";
import { useEffect, useState } from "react";
import { X, Copy, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useWorkspace, fmtDay } from "@/lib/workspace";
import { useToast, haptic } from "@/components/toaster";
import { Threads } from "@/components/threads";
import { askExtension, parseJSON } from "@/lib/bridge";
import { FORMATS, PILLARS, reshareFallback } from "@/lib/campaigns";
import { type Post, type Campaign, StatusPill, statusOf, logActivity, syncApprovalSession, Modal } from "./shared";

const when = (p: Post) => (p.publish_date ? `${fmtDay(p.publish_date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}${p.planned_time ? `, ${p.planned_time}` : ""}` : "Not planned");
const stamp = (s: string | null) => (s ? new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

/** Read-only view of a post, opened from Library, Plan and campaign rows. */
export function PostView({ post, campaigns, members, onClose, onEdit }: { post: Post; campaigns: Campaign[]; members: Record<string, string>; onClose: () => void; onEdit: () => void }) {
  const { can } = useWorkspace();
  const camp = campaigns.find((c) => c.id === post.campaign_id);
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="flex justify-between gap-3 border-b border-line py-2 text-[13px] last:border-0"><span className="text-muted">{k}</span><span className="text-right font-medium">{v}</span></div>;
  return (
    <Modal title={post.title || "Untitled post"} onClose={onClose} wide footer={<>{can("editor") && <button className="btn btn-primary" onClick={onEdit}>Edit</button>}<button className="btn" onClick={onClose}>Close</button></>}>
      <div className="grid gap-5 md:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <div className="label mb-2">Draft, as it reads on LinkedIn</div>
          <div className="rounded-xl border border-line bg-white p-4 shadow-[var(--shadow)]">
            <div className="mb-3 flex items-center gap-2.5"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#141414] text-[13px] font-semibold text-white">SP</span><span className="flex flex-col"><span className="text-[14px] font-semibold">Shashi Pal</span><span className="text-[12px] text-muted">Co-Founder and COO, Antier</span></span></div>
            <p className="m-0 whitespace-pre-wrap text-[14px] leading-relaxed">{post.draft || <span className="text-muted">No draft yet.</span>}</p>
          </div>
          <div className="mt-5"><Threads refTable="posts" refId={post.id} /></div>
        </div>
        <aside>
          <Row k="Campaign" v={camp ? <span className="text-[#d64545]">{camp.name}</span> : "Independent"} />
          <Row k="Type" v={post.format || "Text post"} />
          <Row k="Pillar" v={post.pillar || post.topic || "Not set"} />
          <Row k="Status" v={<StatusPill s={post.status} />} />
          <Row k="Planned" v={when(post)} />
          {post.phase && <Row k="Phase" v={post.phase} />}
          <div className="label mb-1.5 mt-4">Approval history</div>
          {!post.requested_at && !post.decided_at ? <p className="text-[13px] text-muted">Not sent for approval.</p> : (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
              {post.requested_at && <li>Sent for approval by {members[post.requested_by ?? ""] || "the team"}, {stamp(post.requested_at)}</li>}
              {post.decided_at && <li>{post.decision === "approved" ? "Approved" : "Changes asked"} by {members[post.decided_by ?? ""] || "Shashi"}, {stamp(post.decided_at)}</li>}
              {post.decision_note && <li className="rounded-lg bg-surface-2 px-2.5 py-1.5">&ldquo;{post.decision_note}&rdquo;</li>}
            </ul>
          )}
        </aside>
      </div>
    </Modal>
  );
}

/** Edit a post: text, type, pillar, campaign, AI draft, approval, plan, hand off, reshare notes. Never posts. */
export function PostEditor({ post, campaigns, posts, onClose }: { post: Post; campaigns: Campaign[]; posts: Post[]; onClose: () => void }) {
  const { ws, can, userId } = useWorkspace();
  const toast = useToast();
  const [f, setF] = useState<Post>(post);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [reshare, setReshare] = useState<{ page: string; notes: { name: string; text: string }[] } | null>(null);
  const owner = can("owner"), editable = can("editor");
  const camp = campaigns.find((c) => c.id === f.campaign_id);
  const paused = campaigns.filter((c) => c.status === "paused").map((c) => c.id);
  const st = statusOf(f.status);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const set = <K extends keyof Post>(k: K, v: Post[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save(patch: Partial<Post> = {}, msg = "Saved", undo?: Partial<Post>) {
    const next = { ...f, ...patch };
    const body = { title: next.title, format: next.format, pillar: next.pillar, campaign_id: next.campaign_id, draft: next.draft, publish_date: next.publish_date || null, planned_time: next.planned_time, status: next.status,
      requested_by: next.requested_by, requested_at: next.requested_at, decided_by: next.decided_by, decided_at: next.decided_at, decision: next.decision, decision_note: next.decision_note, phase: next.phase };
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
      const out = await askExtension<string>("ai", { kind: "studio", user: `Write a LinkedIn ${f.format || "text post"} for this profile.\nTitle or idea: ${f.title}\nPillar: ${f.pillar || f.topic}\n${brief ? `Campaign: ${camp!.name}. Phase: ${f.phase || "any"}. Core message: ${brief.message}. Call to action: ${brief.cta}. Keywords: ${brief.keywords.join(", ")}.` : ""}\n${f.draft ? `Current draft to improve:\n${f.draft}\n` : ""}Open with a line under 140 characters that stands alone. 120 to 220 words for a text post; for a carousel give slide lines; for a video give a short script with what to say and show. Use only facts given here.\nReturn only JSON: {"draft": "..."}` });
      const j = parseJSON<{ draft: string }>(out);
      if (!j?.draft) throw new Error("No draft came back. Try again.");
      const prev = f.draft;
      setF((x) => ({ ...x, draft: j.draft }));
      toast("Draft written in Shashi's voice", () => setF((x) => ({ ...x, draft: prev })));
    } catch (e) { toast((e as Error).message); }
    setBusy("");
  }

  async function sendForApproval() {
    if (!f.draft.trim()) { toast("Write the draft first"); return; }
    const undo = { status: f.status, requested_by: f.requested_by, requested_at: f.requested_at, decision: f.decision, decision_note: f.decision_note };
    if (await save({ status: "In review", requested_by: userId, requested_at: new Date().toISOString(), decision: "", decision_note: "" }, "Sent to Shashi. It is in his weekly approval session on Today.", undo))
      logActivity(ws.id, "approval", `Sent for approval: ${f.title}`, post.id);
  }
  async function decide(approved: boolean) {
    if (!approved && !note.trim()) { toast("Add a short note so the team knows what to change"); return; }
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
      const out = await askExtension<string>("ai", { kind: "studio", user: `Shashi is posting this on LinkedIn:\n${f.draft || f.title}\n\nWrite (1) a short version for the Antier company page that credits him, and (2) one reshare note of under 40 words for each colleague: ${colleagues.join(", ") || "none"}. Calm B2B tone.\nReturn only JSON: {"page": "...", "notes": [{"name": "...", "text": "..."}]}` });
      const j = parseJSON<{ page: string; notes: { name: string; text: string }[] }>(out);
      setReshare(j?.page ? { page: j.page, notes: j.notes ?? [] } : reshareFallback(f.title, colleagues));
    } catch { setReshare(reshareFallback(f.title, colleagues)); toast("No AI key: standard notes written instead"); }
    setBusy("");
  }
  const copy = async (t: string, label: string) => { try { await navigator.clipboard.writeText(t); } catch {} haptic(); toast(`${label} copied`); };

  return (
    <div className="fixed inset-0 z-[56] flex justify-end bg-black/30" onMouseDown={onClose}>
      <aside role="dialog" aria-label="Edit post" className="cs flex h-full w-full max-w-[560px] flex-col border-l border-line bg-white shadow-[var(--shadow-lg)]" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2"><StatusPill s={f.status} /><span className="truncate text-[13px] text-muted">{camp ? camp.name : "Independent"}</span></div>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="flex-1 overflow-auto px-5 py-4">
          <fieldset disabled={!editable} className="m-0 grid grid-cols-2 gap-3 border-0 p-0">
            <label className="col-span-2 flex flex-col gap-1"><span className="label">Title or idea</span><input className="field" value={f.title} onChange={(e) => set("title", e.target.value)} /></label>
            <label className="flex flex-col gap-1"><span className="label">Type</span><select className="field" value={f.format || "Text post"} onChange={(e) => set("format", e.target.value)}>{FORMATS.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className="flex flex-col gap-1"><span className="label">Pillar</span><select className="field" value={f.pillar} onChange={(e) => set("pillar", e.target.value)}><option value="">Not set</option>{PILLARS.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className="col-span-2 flex flex-col gap-1"><span className="label">Campaign</span><select className="field" value={f.campaign_id ?? ""} onChange={(e) => set("campaign_id", e.target.value || null)}><option value="">Independent</option>{campaigns.filter((c) => !c.template).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <div className="col-span-2 flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2"><span className="label">Draft</span>{post.id && f.draft.trim().length > 80 && <a className="ml-auto text-[12px] font-semibold underline underline-offset-2" href={`/w/${ws.slug}/citations?draft=${post.id}`} title="Test whether AI tools would cite this draft. Save first.">Is this citable?</a>}<button type="button" className="btn btn-dark h-7 text-[12px]" disabled={!!busy} onClick={aiDraft}><Sparkles size={13} /> {busy === "draft" ? "Writing" : f.draft ? "Improve with AI" : "AI draft"}</button></div>
              <textarea className="field min-h-[220px] text-[14px]" value={f.draft} onChange={(e) => set("draft", e.target.value)} placeholder="Write here, or press AI draft. Shashi's voice and locked rules apply." />
              <span className="num text-right text-[11.5px] text-muted">{Array.from(f.draft).length.toLocaleString()} / 3000</span>
            </div>
            <label className="flex flex-col gap-1"><span className="label">Day</span><input type="date" className="field" value={f.publish_date ?? ""} onChange={(e) => set("publish_date", e.target.value || null)} /></label>
            <label className="flex flex-col gap-1"><span className="label">Time, Dubai</span><input type="time" className="field" value={f.planned_time} onChange={(e) => set("planned_time", e.target.value)} /></label>
          </fieldset>
          {editable && <div className="mt-3 flex justify-end"><button className="btn btn-primary" onClick={() => save({}, "Saved")}>Save</button></div>}

          <section className="mt-5 rounded-xl border border-line p-4">
            <div className="mb-2 flex items-center justify-between"><span className="label">Approval</span><StatusPill s={f.status} /></div>
            {st === "In review" ? (owner ? (
              <div className="flex flex-col gap-2">
                <p className="m-0 text-[13px]">Waiting for your decision.</p>
                <textarea className="field text-[13px]" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the team (needed when asking for changes)" />
                <div className="flex gap-2"><button className="btn btn-primary" onClick={() => decide(true)}>Approve</button><button className="btn" onClick={() => decide(false)}>Ask for changes</button></div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="m-0 text-[13px]">With Shashi since {stamp(f.requested_at)}.</p>
                {editable && <button className="btn" onClick={() => save({ status: "Drafting", requested_at: null, requested_by: null }, "Withdrawn. Shashi no longer sees it.", { status: "In review", requested_at: f.requested_at, requested_by: f.requested_by })}>Withdraw</button>}</div>
            )) : st === "Ready" || st === "Posted" ? (
              <p className="m-0 text-[13px]">{f.decision === "approved" ? `Approved ${stamp(f.decided_at)}.` : st === "Posted" ? "Posted." : "Ready to post."}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {f.decision === "changes" && f.decision_note && <p className="m-0 rounded-lg bg-surface-2 px-3 py-2 text-[13px]">Shashi asked for changes: &ldquo;{f.decision_note}&rdquo;</p>}
                <p className="m-0 text-[13px] text-muted">Shashi approves team drafts in one weekly session on his Today list.</p>
                {editable && <div><button className="btn btn-primary" onClick={sendForApproval}>Send to Shashi</button>{owner && <button className="btn btn-ghost ml-1" onClick={() => decide(true)}>Approve it myself</button>}</div>}
              </div>
            )}
          </section>

          {(st === "Ready" || st === "Posted") && (
            <section className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line p-4">
              <button className="btn btn-primary" onClick={handOff}><Copy size={14} /> Copy and open LinkedIn</button>
              {st !== "Posted" && editable && <button className="btn" onClick={() => save({ status: "Posted", publish_date: f.publish_date || new Date().toISOString().slice(0, 10) }, "Marked as posted", { status: f.status, publish_date: f.publish_date })}>Mark as posted</button>}
              <span className="text-[12px] text-muted">Prax never posts. Shashi presses Post on LinkedIn.</span>
            </section>
          )}

          <section className="mt-3 rounded-xl border border-line p-4">
            <div className="mb-2 flex items-center justify-between"><span className="label">Company page and reshare notes</span><button className="btn h-7 text-[12px]" disabled={!!busy} onClick={genReshare}>{busy === "reshare" ? "Writing" : reshare ? "Write again" : "Write them"}</button></div>
            {!reshare ? <p className="m-0 text-[12.5px] text-muted">A version for the Antier page and a short note for each colleague named in the campaign. Copy them by hand; nothing is posted.</p> : (
              <div className="flex flex-col gap-2">
                <div className="rounded-lg bg-surface-2 p-3 text-[13px]"><div className="label mb-1">Antier page</div><p className="m-0 whitespace-pre-wrap">{reshare.page}</p><div className="mt-2 flex gap-2"><button className="btn h-7 text-[12px]" onClick={() => copy(reshare.page, "Page text")}>Copy</button><button className="btn btn-ghost h-7 text-[12px]" onClick={() => { logActivity(ws.id, "reshare", `Antier page shared: ${f.title}`, post.id); toast("Logged as shared on the Antier page"); }}>Log as shared</button></div></div>
                {reshare.notes.map((n) => (
                  <div key={n.name} className="rounded-lg bg-surface-2 p-3 text-[13px]"><div className="label mb-1">{n.name}</div><p className="m-0">{n.text}</p><div className="mt-2 flex gap-2"><button className="btn h-7 text-[12px]" onClick={() => copy(n.text, `Note for ${n.name}`)}>Copy</button><button className="btn btn-ghost h-7 text-[12px]" onClick={() => { logActivity(ws.id, "reshare", `${n.name} reshared: ${f.title}`, post.id); toast(`Logged: ${n.name} reshared`); }}>Log as reshared</button></div></div>
                ))}
                {!reshare.notes.length && <p className="m-0 text-[12.5px] text-muted">Add colleagues to the campaign to get reshare notes.</p>}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
