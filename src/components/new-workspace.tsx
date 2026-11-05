"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

export function NewWorkspace() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [headline, setHeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const sb = supabase();
    const { data: { user } } = await sb.auth.getUser();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Math.random().toString(36).slice(2, 6);
    const { error } = await sb.from("workspaces").insert({ name, headline, slug, created_by: user?.id });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    router.push(`/w/${slug}`);
    router.refresh();
  }

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="card flex items-center justify-center gap-2 p-4 text-muted hover:text-ink border-dashed">
        <Plus size={16} /> Add a profile
      </button>
    );
  return (
    <form onSubmit={create} className="card flex flex-col gap-2 p-4">
      <input id="ws-name" className="field" required placeholder="Name, e.g. Shashi Pal" value={name} onChange={(e) => setName(e.target.value)} />
      <input id="ws-headline" className="field" placeholder="Headline (optional)" value={headline} onChange={(e) => setHeadline(e.target.value)} />
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy}>Create profile</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {err && <p className="text-bad text-[13px]">{err}</p>}
    </form>
  );
}
