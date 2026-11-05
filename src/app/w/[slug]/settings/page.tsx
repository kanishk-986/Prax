"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useWorkspace, KINDS, type Role } from "@/lib/workspace";
import { PageHeader } from "@/components/page-header";
import { useToast, haptic } from "@/components/toaster";

type Member = { user_id: string; email: string; role: Role };
type Invite = { email: string; role: Role };
const ROLES: { r: Role; d: string }[] = [
  { r: "owner", d: "Everything, including team and settings" },
  { r: "editor", d: "Edit plans, pipeline, content and checklists" },
  { r: "commenter", d: "View everything and add comments" },
  { r: "viewer", d: "Read only" },
];

export default function Settings() {
  const { ws, can, userId } = useWorkspace();
  const owner = can("owner");
  const router = useRouter();
  const [f, setF] = useState({ name: ws.name, headline: ws.headline, linkedin_url: ws.linkedin_url, quotas: { ...ws.quotas }, voice: ws.voice ?? "" });
  const [saved, setSaved] = useState("");
  const members = useLive<Member>("members", ws.id);
  const invites = useLive<Invite>("invites", ws.id);
  const [inv, setInv] = useState({ email: "", role: "editor" as Role });
  const toast = useToast();
  const done = (error: { message: string } | null, ok: string) => { if (error) toast(error.message); else { haptic(); toast(ok); } };

  async function save() {
    const { error } = await supabase().from("workspaces").update(f).eq("id", ws.id);
    setSaved(error ? error.message : "Saved"); done(error, "Profile saved"); router.refresh(); setTimeout(() => setSaved(""), 2000);
  }
  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase().from("invites").upsert({ workspace_id: ws.id, email: inv.email.trim().toLowerCase(), role: inv.role });
    done(error, `Invite saved for ${inv.email.trim()}`);
    setInv({ email: "", role: "editor" }); invites.reload();
  }

  return (
    // Same page width as every other section; profile and quotas on the left, the team on the right.
    <div className="mx-auto max-w-[1180px]">
      <PageHeader title="Settings" sub="Profile, daily quotas and team access" />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <section className="card min-w-0 p-5">
        <h2 className="text-[14px] font-semibold">Profile</h2>
        <fieldset disabled={!owner} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1"><span className="label">Name</span><input id="s-name" className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="flex flex-col gap-1"><span className="label">LinkedIn URL</span><input id="s-li" className="field" value={f.linkedin_url} onChange={(e) => setF({ ...f, linkedin_url: e.target.value })} /></label>
          <label className="flex flex-col gap-1 sm:col-span-2"><span className="label">Headline</span><input id="s-hl" className="field" value={f.headline} onChange={(e) => setF({ ...f, headline: e.target.value })} /></label>
        </fieldset>
        <h3 className="mt-6 text-[13px] font-semibold">Daily quota</h3>
        <p className="text-[12px] text-muted">Each day&apos;s checklist is generated from these numbers the first time someone opens Today.</p>
        {/* Labels can wrap to two lines; each one sits at the top of its cell and every input shares the bottom line. */}
        <fieldset disabled={!owner} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {KINDS.map((k) => (
            <label key={k.key} className="flex flex-col justify-between gap-1"><span className="label leading-snug">{k.label}</span>
              <input id={`q-${k.key}`} type="number" min={0} max={50} className="field num" value={(f.quotas as any)[k.key]} onChange={(e) => setF({ ...f, quotas: { ...f.quotas, [k.key]: Number(e.target.value) } })} /></label>
          ))}
        </fieldset>
        <h3 className="mt-6 text-[13px] font-semibold">Comment voice</h3>
        <p className="text-[12px] text-muted">The rules the extension gives the AI model when it drafts comments for this profile.</p>
        <textarea id="s-voice" disabled={!owner} rows={10} className="field mt-2 py-2 text-[12px] leading-relaxed" value={f.voice} onChange={(e) => setF({ ...f, voice: e.target.value })} />
        {owner && <div className="mt-4 flex items-center gap-3"><button className="btn btn-primary" onClick={save}>Save</button><span className="text-[13px] text-good">{saved}</span></div>}
      </section>

      <section className="card min-w-0 p-5">
        <h2 className="text-[14px] font-semibold">Team</h2>
        <ul className="mt-3 divide-y divide-line">
          {members.rows.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
              <span className="truncate">{m.email}{m.user_id === userId && <span className="text-muted"> (you)</span>}</span>
              {owner && m.user_id !== userId ? (
                <span className="flex items-center gap-2">
                  <select id={`m-${m.user_id}`} className="field h-8 w-auto" value={m.role} onChange={async (e) => { const { error } = await supabase().from("members").update({ role: e.target.value }).eq("workspace_id", ws.id).eq("user_id", m.user_id); done(error, `${m.email} is now ${e.target.value}`); }} aria-label="Role">
                    {ROLES.map((x) => <option key={x.r} value={x.r}>{x.r}</option>)}
                  </select>
                  <button className="btn btn-ghost hover:text-bad" onClick={async () => { const { error } = await supabase().from("members").delete().eq("workspace_id", ws.id).eq("user_id", m.user_id); done(error, `${m.email} removed`); }}>Remove</button>
                </span>
              ) : <span className="chip capitalize">{m.role}</span>}
            </li>
          ))}
          {invites.rows.map((i) => (
            <li key={i.email} className="flex items-center justify-between py-2.5 text-[13px]"><span className="text-muted">{i.email} · invited</span><span className="chip capitalize">{i.role}</span></li>
          ))}
        </ul>
        {owner && (
          <form onSubmit={invite} className="mt-4 flex flex-wrap gap-2">
            <input id="inv-email" type="email" required className="field min-w-0 flex-1 basis-[220px]" placeholder="colleague@antiersolutions.com" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} />
            <select id="inv-role" className="field w-auto" value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value as Role })}>{ROLES.map((x) => <option key={x.r} value={x.r}>{x.r}</option>)}</select>
            <button className="btn btn-primary">Invite</button>
            <p className="w-full text-[12px] text-muted">They get access when they sign in to Prax with this email.</p>
          </form>
        )}
        <dl className="mt-5 grid gap-1 text-[12px] text-muted">{ROLES.map((x) => <div key={x.r}><span className="font-medium capitalize text-ink-2">{x.r}</span>: {x.d}</div>)}</dl>
      </section>
      </div>
    </div>
  );
}

