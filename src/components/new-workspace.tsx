"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

/** A LinkedIn profile link, or nothing; anything else is refused before it is saved. */
export const linkedinOk = (u: string) => !u.trim() || /^(https?:\/\/)?([a-z]{2,3}\.)?(www\.)?linkedin\.com\/in\/[^/\s]+\/?$/i.test(u.trim());

export type NewProfile = { name: string; headline: string; company: string; linkedin_url: string };

export function NewWorkspace({ onCreate }: { onCreate?: (f: NewProfile) => Promise<string | null> }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", headline: "", company: "", linkedin_url: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const badLink = !linkedinOk(f.linkedin_url);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim() || badLink) return;
    setBusy(true); setErr("");
    const clean = { name: f.name.trim(), headline: f.headline.trim(), company: f.company.trim(), linkedin_url: f.linkedin_url.trim() };
    // The preview passes its own handler; the app writes the profile and opens its Dashboard.
    if (onCreate) { const e2 = await onCreate(clean); setBusy(false); if (e2) setErr(e2); return; }
    const sb = supabase();
    const { data: { user } } = await sb.auth.getUser();
    const slug = clean.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Math.random().toString(36).slice(2, 6);
    const { error } = await sb.from("workspaces").insert({ ...clean, slug, created_by: user?.id });
    if (error) { setBusy(false); setErr(error.message); return; }
    router.push(`/w/${slug}`);
    router.refresh();
  }

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="card flex min-h-[86px] items-center justify-center gap-2 border-dashed p-4 text-muted transition-colors hover:border-line-strong hover:text-ink">
        <Plus size={16} /> Add a profile
      </button>
    );
  return (
    <form onSubmit={create} className="card anim-rise flex flex-col gap-4 p-5 sm:col-span-2" aria-labelledby="new-profile-title">
      <div>
        <h2 id="new-profile-title" className="text-title font-semibold">New profile</h2>
        <p className="mt-0.5 text-body text-muted">One LinkedIn presence with its own plan, pipeline and team. It starts empty; you set the strategy next.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1"><span className="label">Full name</span><input id="ws-name" className="field h-10" required autoFocus autoComplete="off" value={f.name} onChange={set("name")} placeholder="First and last name" /></label>
        <label className="flex flex-col gap-1"><span className="label">Role or headline</span><input id="ws-headline" className="field h-10" value={f.headline} onChange={set("headline")} placeholder="For example: Co-Founder and COO" /></label>
        <label className="flex flex-col gap-1"><span className="label">Company</span><input id="ws-company" className="field h-10" value={f.company} onChange={set("company")} placeholder="Company name" /></label>
        <label className="flex flex-col gap-1"><span className="label">LinkedIn URL</span><input id="ws-li" className="field h-10" inputMode="url" value={f.linkedin_url} onChange={set("linkedin_url")} placeholder="linkedin.com/in/their-name" aria-invalid={badLink} />
          {badLink && <span className="text-meta text-bad">Use the profile link, for example linkedin.com/in/their-name</span>}</label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-primary h-10 px-4" disabled={busy || !f.name.trim() || badLink}>{busy ? "Creating" : "Create profile"}</button>
        <button type="button" className="btn btn-ghost h-10" onClick={() => { setOpen(false); setErr(""); }}>Cancel</button>
        <span className="text-meta text-muted">Only the name is needed now. Everything can be changed in Settings.</span>
      </div>
      {err && <p className="text-bad text-body">{err}</p>}
    </form>
  );
}
