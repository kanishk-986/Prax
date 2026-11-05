"use client";
import { useState } from "react";
import { Plus, X, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useWorkspace } from "@/lib/workspace";
import { repairFields } from "@/lib/text";
import { Threads } from "./threads";
import { useToast, haptic } from "./toaster";

export type Field = { key: string; label: string; type?: "text" | "textarea" | "date" | "select" | "number" | "checkbox" | "url"; options?: string[]; optionLabels?: Record<string, string>; wide?: boolean };
export type Col = { key: string; label: string; render?: (r: any) => React.ReactNode; className?: string };

/** A live table of records with an add/edit/delete drawer, role-aware.
 *  groupBy is a column or a function; groups follow groupOrder (unknown ones last) and show groupLabel's name.
 *  Pass adding and onAdding to put the Add button in the section header (AddButton) instead of above the table. */
export function RecordList({ table, fields, cols, order, asc = true, filter, defaults = {}, empty, groupBy, groupLabel, groupOrder, adding, onAdding }: {
  table: string; fields: Field[]; cols: Col[]; order?: string; asc?: boolean; filter?: (q: any) => any; defaults?: Record<string, unknown>; empty: string;
  groupBy?: string | ((r: any) => string); groupLabel?: (g: string) => string; groupOrder?: string[]; adding?: boolean; onAdding?: (v: boolean) => void;
}) {
  const { ws, can } = useWorkspace();
  const { rows, loading } = useLive<any>(table, ws.id, { order, asc, filter });
  const [sel, setSel] = useState<any | "new" | null>(null);
  const editable = can("editor");
  const keyOf = (r: any) => (typeof groupBy === "function" ? groupBy(r) : groupBy ? r[groupBy] : "") || "Other";
  const rank = (g: string) => { const i = groupOrder?.indexOf(g) ?? -1; return i < 0 ? 999 : i; };
  const groups: [string, any[]][] = groupBy ? Object.entries(rows.reduce((m: Record<string, any[]>, r) => { (m[keyOf(r)] ||= []).push(r); return m; }, {})).sort((a, b) => rank(a[0]) - rank(b[0])) as [string, any[]][] : [["", rows]];
  const controlled = !!onAdding;
  const open = controlled && adding ? "new" : sel;
  const close = () => { setSel(null); onAdding?.(false); };

  return (
    <>
      {!controlled && <div className="mb-3 flex justify-end">{editable && <button className="btn btn-primary" onClick={() => setSel("new")}><Plus size={14} /> Add</button>}</div>}
      {loading ? <div className="card flex flex-col gap-2 p-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-9 animate-pulse rounded-md bg-surface-2" />)}</div> : rows.length === 0 ? <div className="card p-10 text-center text-[13px] text-muted">{empty}</div> : (
        <div className="flex flex-col gap-4">
          {groups.map(([g, list]) => (
            <div key={g} className="card overflow-x-auto">
              {g && <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-[13.5px] font-semibold">{groupLabel ? groupLabel(g) : g}<span className="count-badge muted">{list.length}</span></div>}
              <table className="w-full text-[13px]">
                <thead><tr className="border-b border-line text-left">{cols.map((c) => <th key={c.key} className="label px-4 py-2.5 font-semibold">{c.label}</th>)}</tr></thead>
                <tbody>{list.map((r) => (
                  <tr key={r.id} onClick={() => setSel(r)} className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-surface-2 active:bg-surface-2">
                    {cols.map((c) => <td key={c.key} className={`px-4 py-2.5 align-top ${c.className ?? ""}`}>{c.render ? c.render(r) : String(r[c.key] ?? "")}</td>)}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ))}
        </div>
      )}
      {open && <Drawer table={table} fields={fields} rec={open === "new" ? null : open} defaults={defaults} onClose={close} />}
    </>
  );
}

/** The Add button for a section header, paired with RecordList's adding and onAdding. Hidden for viewers. */
export function AddButton({ onClick, label = "Add" }: { onClick: () => void; label?: string }) {
  const { can } = useWorkspace();
  return can("editor") ? <button className="btn btn-primary h-10 px-4" onClick={onClick}><Plus size={14} /> {label}</button> : null;
}

function Drawer({ table, fields, rec, defaults, onClose }: { table: string; fields: Field[]; rec: any | null; defaults: Record<string, unknown>; onClose: () => void }) {
  const { ws, can } = useWorkspace();
  const editable = can("editor");
  const [f, setF] = useState<Record<string, any>>(() => ({ ...defaults, ...(rec ?? {}) }));
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();
  async function save() {
    const body: Record<string, any> = {};
    fields.forEach((x) => { let v = f[x.key]; if (x.type === "number") v = v === "" || v == null ? null : Number(v); if (x.type === "date") v = v || null; body[x.key] = v ?? (x.type === "checkbox" ? false : x.type === "number" || x.type === "date" ? null : ""); });
    // Pasted text sometimes arrives as mojibake ("Santill√°n"); repair it before it is saved.
    const clean = repairFields(body);
    const { error } = rec ? await supabase().from(table).update(clean).eq("id", rec.id)
      : await supabase().from(table).insert({ ...defaults, ...clean, workspace_id: ws.id });
    if (error) { toast(error.message); return; }
    haptic(); toast(rec ? "Saved" : "Added"); onClose();
  }
  async function del() {
    const { error } = await supabase().from(table).delete().eq("id", rec.id);
    if (error) { toast(error.message); return; }
    haptic(); toast("Deleted"); onClose();
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/25" onMouseDown={onClose}>
      <aside className="flex h-full w-full max-w-[520px] flex-col border-l border-line bg-surface shadow-[var(--shadow-lg)]" onMouseDown={(e) => e.stopPropagation()} role="dialog">
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <span className="truncate text-[15px] font-semibold">{rec ? (rec.title || rec.name || rec.question || rec.author || "Edit") : "New"}</span>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="flex-1 overflow-auto px-5 py-4">
          <fieldset disabled={!editable} className="grid grid-cols-2 gap-3">
            {fields.map((x) => (
              <label key={x.key} className={`flex flex-col gap-1 ${x.wide || x.type === "textarea" ? "col-span-2" : ""} ${x.type === "checkbox" ? "flex-row items-center gap-2" : ""}`}>
                {x.type !== "checkbox" && <span className="label">{x.label}</span>}
                {x.type === "textarea" ? <textarea id={`f-${x.key}`} rows={x.key === "body" || x.key === "draft" || x.key === "text" ? 10 : 4} className="field" value={f[x.key] ?? ""} onChange={(e) => setF({ ...f, [x.key]: e.target.value })} />
                  : x.type === "select" ? <select id={`f-${x.key}`} className="field" value={f[x.key] ?? ""} onChange={(e) => setF({ ...f, [x.key]: e.target.value })}>{x.options!.map((o) => <option key={o} value={o}>{x.optionLabels?.[o] ?? o}</option>)}</select>
                  : x.type === "checkbox" ? <><input id={`f-${x.key}`} type="checkbox" checked={!!f[x.key]} onChange={(e) => setF({ ...f, [x.key]: e.target.checked })} /><span className="text-[13px]">{x.label}</span></>
                  : <input id={`f-${x.key}`} type={x.type ?? "text"} className="field" value={f[x.key] ?? ""} onChange={(e) => setF({ ...f, [x.key]: e.target.value })} />}
              </label>
            ))}
          </fieldset>
          {rec && <div className="mt-6"><Threads refTable={table} refId={rec.id} /></div>}
        </div>
        <footer className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
          {rec && editable ? (confirm ? <span className="flex items-center gap-2 text-[13px] text-bad">Delete for everyone? <button className="btn" onClick={del}>Delete</button><button className="btn btn-ghost" onClick={() => setConfirm(false)}>Keep</button></span>
            : <button className="btn btn-ghost hover:text-bad" onClick={() => setConfirm(true)}><Trash2 size={14} /> Delete</button>) : <span className="text-[12px] text-muted">{editable ? "" : "View only"}</span>}
          {editable && <button className="btn btn-primary" onClick={save}>{rec ? "Save changes" : "Add"}</button>}
        </footer>
      </aside>
    </div>
  );
}
