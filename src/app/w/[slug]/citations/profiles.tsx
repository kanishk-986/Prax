"use client";
// Tracked profiles (Q107): the person, company and LinkedIn profile AI citations is tracking, in the header's
// three-dot menu. Switch, New, Archive with Restore from "Show archived", and an owner-only Delete that needs the
// name typed out. The menu and dialog take plain props; the Supabase work is in useProfileActions.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useToast, haptic } from "@/components/toaster";
import { type CitationProfile } from "@/lib/citation-profile";
import { liveProfiles, archivedProfiles, deleteConfirmed, type Profile } from "@/lib/citations";
import s from "./citations.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");
const day = (t: string) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** The header line that says which profile the page shows; it opens the same menu as the three dots. */
export function ProfileChip({ name, draft, onOpen }: { name: string; draft?: boolean; onOpen: (el: HTMLElement) => void }) {
  return (
    <button type="button" className={s.profileChip} onClick={(e) => onOpen(e.currentTarget)} aria-haspopup="menu" title="Switch tracked profile">
      <span className={s.profileDot} aria-hidden />
      <span className="min-w-0 truncate"><span className={s.faint}>Tracking </span><b className="font-semibold">{name}</b>{draft && <span className={s.faint}>, not saved yet</span>}</span>
      <ChevronDown size={14} aria-hidden className="shrink-0" />
    </button>
  );
}

type Item = { label: string; run: () => void; danger?: boolean };
export function ProfileMenu({ anchor, profiles, currentId, editable, owner, items, onClose, onChoose, onNew, onArchive, onRestore, onDelete }: {
  anchor: HTMLElement; profiles: Profile[]; currentId: string | null; editable: boolean; owner: boolean; items: Item[];
  onClose: () => void; onChoose: (p: Profile) => void; onNew: () => void; onArchive: (p: Profile) => void; onRestore: (p: Profile) => void; onDelete: (p: Profile) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  const live = liveProfiles(profiles), archived = archivedProfiles(profiles);
  const current = live.find((p) => p.id === currentId) ?? null;
  const [showArchived, setShowArchived] = useState(false);
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect(), h = ref.current?.offsetHeight ?? 320, w = ref.current?.offsetWidth ?? 300;
    setPos({ top: r.bottom + 6 + h < window.innerHeight ? r.bottom + 6 : Math.max(8, r.top - 6 - h), left: Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) });
  }, [anchor, showArchived]);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); anchor.focus(); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const all = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
      const i = all.indexOf(document.activeElement as HTMLButtonElement);
      all[(i + (e.key === "ArrowDown" ? 1 : all.length - 1)) % all.length]?.focus(); e.preventDefault();
    };
    document.addEventListener("mousedown", down); window.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); window.removeEventListener("keydown", key); };
  }, [anchor, onClose]);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>("[aria-checked=true]")?.focus(); }, []);
  const act = (f: () => void) => () => { onClose(); f(); };
  return (
    <div ref={ref} role="menu" aria-label="Tracked profiles and more" className={s.menu} style={{ top: pos.top, left: pos.left }}>
      <div className={s.menuHead}>Tracked profiles</div>
      {live.map((p) => (
        <button key={p.id} role="menuitemradio" aria-checked={p.id === currentId} className={cx(s.menuItem, p.id === currentId && s.menuOn)} onClick={act(() => onChoose(p))}>
          <span className={s.menuTick}>{p.id === currentId && <Check size={14} strokeWidth={2.6} />}</span>
          <span className="min-w-0 flex-1 break-words py-2">{p.name}</span>

        </button>
      ))}
      {!live.length && <p className={cx(s.small, "px-3 py-2")}>No live profile. Restore one or start a new one.</p>}
      {editable && <button role="menuitem" className={s.menuItem} onClick={act(onNew)}><span className={s.menuTick}><Plus size={14} /></span>New tracked profile</button>}
      {archived.length > 0 && (
        <button role="menuitem" aria-expanded={showArchived} className={s.menuItem} onClick={() => setShowArchived(!showArchived)}>
          <span className={s.menuTick}>{showArchived ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
          <span className="flex-1">{showArchived ? "Hide archived" : "Show archived"}</span><span className={cx(s.num, s.menuNote)}>{archived.length}</span>
        </button>
      )}
      {showArchived && archived.map((p) => (
        <div key={p.id} className={s.menuArchived}>
          <span className="block min-w-0 break-words font-medium">{p.name}</span><span className={s.small}>Archived {day(p.archived_at!)}</span>
          {(editable || owner) && <span className="mt-2 flex gap-1.5">
            {editable && <button role="menuitem" className={cx(s.btn, s.sm)} onClick={act(() => onRestore(p))} aria-label={`Restore ${p.name}`}>Restore</button>}
            {owner && <button role="menuitem" className={cx(s.btn, s.sm, s.dangerLine)} onClick={act(() => onDelete(p))} aria-label={`Delete ${p.name}`}>Delete</button>}
          </span>}
        </div>
      ))}
      {items.length > 0 && <div className={s.menuRule} role="separator" />}
      {items.map((it) => <button key={it.label} role="menuitem" className={cx(s.menuItem, it.danger && s.menuDanger)} onClick={act(it.run)}><span className={s.menuTick} />{it.label}</button>)}
      {current && (editable || owner) && <div className={s.menuRule} role="separator" />}
      {current && editable && <button role="menuitem" className={s.menuItem} onClick={act(() => onArchive(current))}><span className={s.menuTick} />Archive this profile</button>}
      {current && owner && <button role="menuitem" className={cx(s.menuItem, s.menuDanger)} onClick={act(() => onDelete(current))}><span className={s.menuTick} />Delete this profile</button>}
    </div>
  );
}

/** Permanent delete: the owner types the profile's name. Only that profile's rows go. */
export function DeleteProfile({ profile, busy, onClose, onConfirm }: { profile: Profile; busy?: boolean; onClose: () => void; onConfirm: () => void }) {
  const [typed, setTyped] = useState("");
  const ok = deleteConfirmed(typed, profile.name);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className={s.center} onMouseDown={onClose}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="del-title" aria-describedby="del-body" className={s.dialog} onMouseDown={(e) => e.stopPropagation()}>
        <h2 id="del-title" className="text-[18px] font-semibold">Delete {profile.name}?</h2>
        <div id="del-body" className="mt-2 grid gap-2 text-[13.5px]">
          <p>This removes everything tracked for this profile: its people and companies, prompts, runs and their sources, the facts sheet, recommendations, prompt groups and share links. It cannot be undone.</p>
          <p className={s.small}>Other tracked profiles are not touched. Ideas already sent to Content Studio stay there. To keep the data and only hide the profile, archive it instead.</p>
        </div>
        <form className="mt-4 grid gap-1.5" onSubmit={(e) => { e.preventDefault(); if (ok && !busy) onConfirm(); }}>
          <label htmlFor="del-name" className={s.label}>Type <span className="select-all font-semibold">{profile.name}</span> to confirm</label>
          <input id="del-name" autoFocus autoComplete="off" spellCheck={false} className={s.field} value={typed} onChange={(e) => setTyped(e.target.value)} />
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" className={s.btn} onClick={onClose}>Cancel</button>
            <button type="submit" className={cx(s.btn, s.red)} disabled={!ok || busy}>{busy ? "Deleting" : "Delete for good"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Switch, archive, restore and delete against Supabase, each with a toast and Undo where it can be undone. */
export function useProfileActions(p: CitationProfile) {
  const toast = useToast();
  const prev = p.current;
  async function choose(to: Profile) {
    if (to.id === prev?.id) return;
    const err = await p.choose(to.id);
    if (err) { toast(err.message); return; }
    haptic(); toast(`Now showing ${to.name}`, prev ? () => { p.choose(prev.id); } : undefined);
  }
  async function setArchived(to: Profile, at: string | null) {
    const { error } = await supabase().from("citation_profiles").update({ archived_at: at }).eq("id", to.id);
    if (error) toast(error.message);
    p.reload();
    return !error;
  }
  async function archive(to: Profile) {
    const next = liveProfiles(p.profiles).find((x) => x.id !== to.id);
    if (!(await setArchived(to, new Date().toISOString()))) return;
    if (to.id === prev?.id && next) await p.choose(next.id);
    haptic(); toast(`${to.name} archived. All its data is kept.`, async () => { await setArchived(to, null); await p.choose(to.id); });
  }
  async function restore(to: Profile) {
    if (!(await setArchived(to, null))) return;
    await p.choose(to.id);
    haptic(); toast(`${to.name} restored and in view`, async () => { await setArchived(to, to.archived_at ?? new Date().toISOString()); if (prev) await p.choose(prev.id); });
  }
  async function remove(to: Profile) {
    const { error } = await supabase().rpc("citation_profile_delete", { pid: to.id, confirm_name: to.name });
    if (error) { toast(error.message); return false; }
    p.reload(); haptic(); toast(`${to.name} deleted`);
    return true;
  }
  return { choose, archive, restore, remove };
}
