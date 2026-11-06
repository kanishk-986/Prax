"use client";
// The profiles page list. Archived profiles (db/016) stay out of the grid; Show archived lists them with
// Restore for their owners. Restoring is the only thing this list changes, and only when pressed.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { NewWorkspace, type NewProfile } from "./new-workspace";

export type ProfileRow = { id: string; slug: string; name: string; headline: string; company?: string; role: string; archived_at?: string | null };

export function ProfileList({ list, onRestore, onCreate }: {
  list: ProfileRow[];
  onRestore?: (id: string) => Promise<string | null>;
  onCreate?: (f: NewProfile) => Promise<string | null>;
}) {
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [err, setErr] = useState("");
  const live = list.filter((w) => !w.archived_at), archived = list.filter((w) => w.archived_at);
  async function restore(id: string) {
    setErr("");
    const e = onRestore ? await onRestore(id) : (await supabase().from("workspaces").update({ archived_at: null }).eq("id", id)).error?.message ?? null;
    if (e) setErr(e); else router.refresh();
  }
  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {live.map((w) => (
          <Link key={w.id} href={`/w/${w.slug}`} className="card p-4 transition-colors hover:border-line-strong">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate font-semibold">{w.name}</span>
              <span className="chip shrink-0 capitalize">{w.role}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-[13px] text-muted">{[w.headline, w.company].filter(Boolean).join(" · ") || "LinkedIn profile"}</p>
          </Link>
        ))}
        <NewWorkspace onCreate={onCreate} />
      </div>
      {!live.length && <p className="mt-3 text-[13px] text-muted">No profiles yet. Add the first one to start: name, role, company and LinkedIn link.</p>}

      {archived.length > 0 && (
        <div className="mt-8">
          <button type="button" className="btn btn-ghost -ml-3 h-9" aria-expanded={showArchived} onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? "Hide archived" : "Show archived"} <span className="count-badge muted">{archived.length}</span>
          </button>
          {showArchived && (
            <ul className="anim-rise card mt-2 list-none divide-y divide-line p-0">
              {archived.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0"><span className="block truncate font-semibold">{w.name}</span>
                    <span className="block text-[12.5px] text-muted">Archived {new Date(w.archived_at!).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · data kept</span></span>
                  {w.role === "owner" ? <button className="btn h-9 px-3" onClick={() => restore(w.id)}><RotateCcw size={14} /> Restore</button>
                    : <span className="text-[12.5px] text-muted">An owner can restore it</span>}
                </li>
              ))}
            </ul>
          )}
          {err && <p className="mt-2 text-[13px] text-bad">{err}</p>}
        </div>
      )}
    </>
  );
}
