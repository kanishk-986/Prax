"use client";
// The profiles page list. Archived profiles (db/016) stay out of the grid; Show archived lists them with
// Restore for their owners. Restoring is the only thing this list changes, and only when pressed.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { NewWorkspace, type NewProfile } from "./new-workspace";
import { DemoTag } from "./sidebar";
import { ProfileOverview } from "./profile-overview";
import type { OverviewRow } from "@/lib/weekly";

export type ProfileRow = { id: string; slug: string; name: string; headline: string; company?: string; role: string; archived_at?: string | null; is_demo?: boolean };

export function ProfileList({ list, stats, onRestore, onCreate }: {
  list: ProfileRow[];
  /** This week's numbers per profile id (D11). With them, live profiles show as overview rows instead of cards. */
  stats?: Record<string, OverviewRow | null>;
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
      {stats && live.length > 0 && <div className="mt-6"><p className="mb-2 text-meta text-muted">This week so far, from Monday. Conversations counts people who moved into a conversation stage or sent a message.</p><ProfileOverview list={live} stats={stats} /></div>}
      <div className={`grid gap-3 sm:grid-cols-2 ${stats && live.length ? "mt-3" : "mt-6"}`}>
        {!stats && live.map((w) => (
          <Link key={w.id} href={`/w/${w.slug}`} className="card p-4 transition-colors hover:border-line-strong">
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-1.5"><span className="truncate font-semibold">{w.name}</span>{w.is_demo && <DemoTag />}</span>
              <span className="chip shrink-0 capitalize">{w.role}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-body text-muted">{[w.headline, w.company].filter(Boolean).join(" · ") || "LinkedIn profile"}</p>
          </Link>
        ))}
        {stats && live.length ? <div className="grid sm:col-span-2"><NewWorkspace onCreate={onCreate} /></div> : <NewWorkspace onCreate={onCreate} />}
      </div>
      {!live.length && <p className="mt-3 text-body text-muted">No profiles yet. Add the first one to start: name, role, company and LinkedIn link.</p>}

      {archived.length > 0 && (
        <div className="mt-8">
          <button type="button" className="btn btn-ghost -ml-3 h-9" aria-expanded={showArchived} onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? "Hide archived" : "Show archived"} <span className="count-badge muted">{archived.length}</span>
          </button>
          {showArchived && (
            <ul className="anim-rise card mt-2 list-none divide-y divide-line p-0">
              {archived.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0"><span className="flex min-w-0 items-center gap-1.5"><span className="truncate font-semibold">{w.name}</span>{w.is_demo && <DemoTag />}</span>
                    <span className="block text-meta text-muted">Archived {new Date(w.archived_at!).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · data kept</span></span>
                  {w.role === "owner" ? <button className="btn h-9 px-3" onClick={() => restore(w.id)}><RotateCcw size={14} /> Restore</button>
                    : <span className="text-meta text-muted">An owner can restore it</span>}
                </li>
              ))}
            </ul>
          )}
          {err && <p className="mt-2 text-body text-bad">{err}</p>}
        </div>
      )}
    </>
  );
}
