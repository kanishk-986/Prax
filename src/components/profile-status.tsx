"use client";
// Settings, owners only: archive this profile (hidden from the profiles page, nothing deleted), restore it, or
// delete it for good once archived. Delete asks for the exact name and runs delete_profile() (db/016), which
// checks the owner role, the archive and the name again on the server. Nothing here ever runs by itself.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useWorkspace, fmtDay } from "@/lib/workspace";
import { useToast, haptic } from "@/components/toaster";

export function ProfileStatus() {
  const { ws } = useWorkspace();
  const router = useRouter();
  const toast = useToast();
  const [archivedAt, setArchivedAt] = useState<string | null>(ws.archived_at ?? null);
  async function setArchived(at: string | null) {
    const { error } = await supabase().from("workspaces").update({ archived_at: at }).eq("id", ws.id);
    if (error) { toast(error.message); return false; }
    setArchivedAt(at); router.refresh(); return true;
  }
  return (
    <ProfileStatusView name={ws.name} archivedAt={archivedAt}
      onArchive={async () => { const before = archivedAt; if (await setArchived(new Date().toISOString())) { haptic(); toast("Profile archived. It is hidden from the profiles page.", () => { setArchived(before); }); } }}
      onRestore={async () => { if (await setArchived(null)) { haptic(); toast("Profile restored"); } }}
      onDelete={async () => {
        const { error } = await supabase().rpc("delete_profile", { p_ws: ws.id, p_name: ws.name });
        if (error) { toast(error.message); return false; }
        router.push("/?deleted=1"); router.refresh(); return true;
      }} />
  );
}

/** The card itself, without data access, so it can be previewed. */
export function ProfileStatusView({ name, archivedAt, onArchive, onRestore, onDelete }: {
  name: string; archivedAt: string | null; onArchive: () => void; onRestore: () => void; onDelete: () => Promise<boolean>;
}) {
  const [step, setStep] = useState<"" | "archive" | "delete">("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const match = typed === name;
  return (
    <section className="card mt-4 min-w-0 p-5" aria-labelledby="status-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-[620px]">
          <h2 id="status-title" className="text-[14px] font-semibold">{archivedAt ? "This profile is archived" : "Archive this profile"}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">{archivedAt
            ? <>Archived on {fmtDay(archivedAt.slice(0, 10), { day: "numeric", month: "long", year: "numeric" })}. It is hidden from the profiles page and all its data is kept. Restore it to bring it back, or delete it for good.</>
            : <>Archiving hides {name} from the profiles page and keeps every record. Owners can restore it at any time from here or from Show archived on the profiles page.</>}</p>
        </div>
        {!step && (archivedAt
          ? <span className="flex flex-wrap gap-2"><button className="btn btn-primary h-10 px-4" onClick={onRestore}><RotateCcw size={14} /> Restore profile</button>
              <button className="btn h-10 px-4 text-bad hover:border-bad" onClick={() => { setTyped(""); setStep("delete"); }}><Trash2 size={14} /> Delete permanently</button></span>
          : <button className="btn h-10 px-4" onClick={() => setStep("archive")}><Archive size={14} /> Archive profile</button>)}
      </div>

      {step === "archive" && (
        <div className="anim-rise mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-strong bg-surface-2 px-4 py-3">
          <span className="text-[13px]">Archive {name}? Nothing is deleted, and you can restore it.</span>
          <span className="flex gap-2"><button className="btn btn-dark h-9 px-4" onClick={() => { setStep(""); onArchive(); }}>Archive</button><button className="btn btn-ghost h-9" onClick={() => setStep("")}>Keep it</button></span>
        </div>
      )}

      {step === "delete" && (
        <form className="anim-rise mt-4 rounded-xl border-2 border-bad px-4 py-4" onSubmit={async (e) => { e.preventDefault(); if (!match || busy) return; setBusy(true); const ok = await onDelete(); setBusy(false); if (!ok) setStep("delete"); }}>
          <p className="m-0 text-[13.5px] font-semibold text-bad">This deletes {name} and everything in it, for everyone.</p>
          <p className="m-0 mt-1 text-[13px] leading-relaxed text-ink-2">Pipeline, posts and campaigns, notes and strategy, the Network import, Comment Studio, AI citations, Discovery, Today and the team&apos;s access all go. It cannot be undone.</p>
          <label className="mt-3 flex flex-col gap-1.5"><span className="label">Type <b className="text-ink">{name}</b> to confirm</span>
            <input id="delete-name" className="field h-10 max-w-[360px]" autoFocus autoComplete="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} /></label>
          <span className="mt-3 flex flex-wrap gap-2">
            <button className="btn h-10 px-4 disabled:opacity-50" style={match ? { background: "#9e1c1c", borderColor: "#9e1c1c", color: "#fff" } : undefined} disabled={!match || busy}>{busy ? "Deleting" : "Delete for good"}</button>
            <button type="button" className="btn btn-ghost h-10" onClick={() => setStep("")}>Cancel</button>
          </span>
        </form>
      )}
    </section>
  );
}
