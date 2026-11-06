"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Copy, Pencil, Trash2, Check } from "lucide-react";
import { KIND_LABEL, piecesOf, purposeOf, sampleFor, type Template } from "@/lib/templates";
import { Threads } from "@/components/threads";
import { Badge, accentOf } from "./cards";

export type Draft = Pick<Template, "name" | "kind" | "body">;

/** The template pop-up. It scales in from the card that opened it. View shows the full text with the variables marked,
 *  with Copy, Edit and Delete; edit mode keeps the same frame, with a live preview filled with sample values. */
export function TemplateDialog({ rec, origin, startEditing, editable, byline, onClose, onSave, onDelete, onCopy }: {
  rec: Template | null; origin: DOMRect | null; startEditing: boolean; editable: boolean; byline?: string;
  onClose: () => void; onSave: (d: Draft) => Promise<boolean>; onDelete: () => void; onCopy: (text: string) => void;
}) {
  const [editing, setEditing] = useState(startEditing || !rec);
  const [d, setD] = useState<Draft>(() => ({ name: rec?.name ?? "", kind: rec?.kind ?? "note", body: rec?.body ?? "" }));
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const shown = editing ? d : (rec ?? d);

  // Scale in from the card: the transform origin is the card's centre, in the dialog's own coordinates.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !origin) return;
    const r = el.getBoundingClientRect();
    el.style.transformOrigin = `${origin.left + origin.width / 2 - r.left}px ${origin.top + origin.height / 2 - r.top}px`;
  }, [origin]);

  // Escape closes (or leaves the delete question first); Tab stays inside the dialog.
  useEffect(() => {
    const key =(e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); if (confirm) setConfirm(false); else onClose(); return; }
      if (e.key !== "Tab" || !box.current) return;
      const f = [...box.current.querySelectorAll<HTMLElement>("button:not([disabled]), input, select, textarea, a[href]")];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); };
  }, [confirm, onClose]);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    (box.current?.querySelector<HTMLElement>(editing ? "#tpl-name" : "[data-autofocus]") ?? box.current)?.focus();
    return () => { prev?.focus?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!d.name.trim()) { box.current?.querySelector<HTMLElement>("#tpl-name")?.focus(); return; }
    setSaving(true);
    const ok = await onSave({ name: d.name.trim(), kind: d.kind, body: d.body });
    setSaving(false);
    if (ok && rec) setEditing(false);
  }

  const word = purposeOf(shown), a = accentOf(shown);
  // A portal to the body: the section's fade gives the page its own stacking layer, which would put the phone menu
  // button above the pop-up.
  return createPortal(
    <div className="tpl-veil fixed inset-0 z-50 flex items-end justify-center bg-[rgba(20,20,20,.32)] p-0 sm:items-center sm:p-6" onMouseDown={onClose}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="tpl-title" tabIndex={-1} onMouseDown={(e) => e.stopPropagation()}
        className={`tpl-pop relative flex max-h-[calc(100dvh-24px)] w-full flex-col overflow-hidden rounded-t-xl bg-surface shadow-[0_24px_64px_rgba(20,20,20,.22)] outline-none sm:max-h-[calc(100dvh-48px)] sm:rounded-xl ${editing ? "sm:max-w-[880px]" : "sm:max-w-[600px]"}`}
        style={{ "--edge": a.edge } as React.CSSProperties}>
        <span className="h-[3px] w-full shrink-0" style={{ background: a.edge }} aria-hidden />
        <header className="flex items-start gap-3 px-5 pt-4 pb-3 sm:px-6">
          <Badge t={shown} size={40} />
          <div className="min-w-0 flex-1">
            <h2 id="tpl-title" className="text-page font-semibold leading-tight tracking-[-0.02em]">{rec || d.name || d.body ? word : "New template"}</h2>
            <p className="truncate text-body text-muted">{editing ? (d.name || "Untitled") : rec?.name}{" "}<span className="text-faint">· {KIND_LABEL[shown.kind] ?? shown.kind}</span></p>
          </div>
          <button type="button" className="btn btn-ghost h-9 w-9 p-0" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">
          {editing ? (
            <div className="grid gap-5 md:grid-cols-[1fr_1fr]">
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1"><span className="label">Name</span>
                  <input id="tpl-name" className="field" value={d.name} placeholder="First message after they accept" onChange={(e) => setD({ ...d, name: e.target.value })} /></label>
                <label className="flex flex-col gap-1"><span className="label">Type</span>
                  <select className="field" value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value })}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                <label className="flex flex-col gap-1"><span className="label">Text</span>
                  <textarea className="field min-h-[160px] resize-y sm:min-h-[220px]" rows={9} value={d.body} placeholder="Hi [First name], ..." onChange={(e) => setD({ ...d, body: e.target.value })} /></label>
                <p className="m-0 text-meta text-muted">Put a variable in square brackets, such as [First name] or [topic].</p>
              </div>
              <div className="flex flex-col gap-1">
                <span className="label">Preview with sample values</span>
                <div className="min-h-[120px] flex-1 rounded-lg sm:min-h-[220px] border border-line bg-[#faf8f5] p-4" aria-live="polite">
                  {d.body.trim() ? <Body text={d.body} sample /> : <p className="m-0 text-body text-faint">The preview appears as you type.</p>}
                </div>
              </div>
            </div>
          ) : rec && (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-line bg-[#faf8f5] p-4"><Body text={rec.body} /></div>
              {byline && <p className="m-0 text-meta text-muted">{byline}</p>}
              <Threads refTable="templates" refId={rec.id} />
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 sm:px-6">
          {rec && editable ? (confirm
            ? <span className="flex flex-wrap items-center gap-2 text-body"><span className="font-medium">Delete for everyone?</span>
                <button type="button" className="btn h-9 text-bad" onClick={onDelete}>Delete</button>
                <button type="button" className="btn btn-ghost h-9" onClick={() => setConfirm(false)}>Keep</button></span>
            : <button type="button" className="btn btn-ghost h-9 hover:text-bad" onClick={() => setConfirm(true)}><Trash2 size={15} /> Delete</button>)
            : <span className="text-meta text-muted">{editable ? "" : "View only"}</span>}
          <span className="flex gap-2">
            {editing ? <>
              <button type="button" className="btn h-9" onClick={() => (rec ? (setD({ name: rec.name, kind: rec.kind, body: rec.body }), setEditing(false)) : onClose())}>Cancel</button>
              <button type="button" className="btn btn-primary h-9 px-4" disabled={saving || !d.name.trim()} onClick={save}><Check size={15} /> {rec ? "Save changes" : "Add template"}</button>
            </> : <>
              {editable && <button type="button" className="btn h-9" onClick={() => setEditing(true)}><Pencil size={15} /> Edit</button>}
              <button type="button" data-autofocus className="btn btn-primary h-9 px-4" onClick={() => rec && onCopy(rec.body)}><Copy size={15} /> Copy text</button>
            </>}
          </span>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/** The text with variables marked. With sample, known variables show a sample value; unknown ones stay marked. */
function Body({ text, sample }: { text: string; sample?: boolean }) {
  return (
    <p className="m-0 whitespace-pre-wrap break-words text-title leading-relaxed text-ink">
      {piecesOf(text).map((p, i) => {
        if (!p.variable) return <span key={i}>{p.text}</span>;
        const v = sample ? sampleFor(p.variable) : null;
        return v != null
          ? <mark key={i} className="tpl-sample" title={p.text}>{v}</mark>
          : <mark key={i} className="tpl-var">{p.text}</mark>;
      })}
    </p>
  );
}
