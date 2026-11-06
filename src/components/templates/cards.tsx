"use client";
import { useState } from "react";
import { Eye, Pencil, Trash2, Plus, Heart, UserPlus, MessageSquare, Mail, FileText, Phone, Send, Reply, Repeat2, Megaphone, Sparkle } from "lucide-react";
import { purposeOf, variablesOf, type Purpose, type Template } from "@/lib/templates";

/** Each purpose has its own accent from the Prax palette: red, dark red, ink and warm neutral tints. The badge carries
 *  it (tinted or solid), with a thin top edge and tinted variable chips to match. */
type Accent = { icon: React.ElementType; badge: string; edge: string; chip: string };
const RED = "#d64545", DARK = "#9e1c1c", INK = "#141414", SAND = "#b9a58c";
export const ACCENTS: Record<Purpose, Accent> = {
  Connect: { icon: UserPlus, badge: "bg-[#fbeaea] text-[#d64545]", edge: RED, chip: "bg-[#fbeaea] text-[#7a1717]" },
  "Follow-up": { icon: MessageSquare, badge: "bg-[#141414] text-white", edge: INK, chip: "bg-[#efefef] text-ink-2" },
  Message: { icon: Mail, badge: "bg-[#f1eeea] text-[#141414]", edge: INK, chip: "bg-[#f1eeea] text-ink-2" },
  "Thank you": { icon: Heart, badge: "bg-[#f6e4e1] text-[#9e1c1c]", edge: DARK, chip: "bg-[#f6e4e1] text-[#7a1717]" },
  Resource: { icon: FileText, badge: "bg-[#9e1c1c] text-white", edge: DARK, chip: "bg-[#f6e4e1] text-[#7a1717]" },
  Call: { icon: Phone, badge: "bg-[#d64545] text-white", edge: RED, chip: "bg-[#fbeaea] text-[#7a1717]" },
  InMail: { icon: Send, badge: "bg-[#f3ece4] text-[#9e1c1c]", edge: DARK, chip: "bg-[#f3ece4] text-[#5a4632]" },
  Reply: { icon: Reply, badge: "bg-[#efe7dc] text-[#5a4632]", edge: SAND, chip: "bg-[#f3ece4] text-[#5a4632]" },
  Reshare: { icon: Repeat2, badge: "bg-[#e9e4dd] text-[#141414]", edge: SAND, chip: "bg-[#f3ece4] text-[#5a4632]" },
  Prompt: { icon: Megaphone, badge: "bg-[#f3ece4] text-[#d64545]", edge: SAND, chip: "bg-[#f3ece4] text-[#5a4632]" },
  Post: { icon: Sparkle, badge: "bg-[#efe7dc] text-[#141414]", edge: SAND, chip: "bg-[#f3ece4] text-[#5a4632]" },
};
export const accentOf = (t: { kind?: string; name?: string }) => ACCENTS[purposeOf(t)];

export function Badge({ t, size = 36 }: { t: { kind?: string; name?: string }; size?: number }) {
  const a = accentOf(t), Icon = a.icon;
  return <span className={`tpl-badge grid shrink-0 place-items-center rounded-lg ${a.badge}`} style={{ width: size, height: size }} aria-hidden><Icon size={Math.round(size * 0.47)} strokeWidth={2} /></span>;
}

/** Variable chips: the first three, then a count of the rest. */
export function VarChips({ body, chip, max = 3 }: { body: string; chip: string; max?: number }) {
  const vars = variablesOf(body);
  if (!vars.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {vars.slice(0, max).map((v) => <span key={v} className={`inline-flex h-[22px] max-w-[150px] items-center truncate rounded-md px-1.5 text-meta font-medium ${chip}`} title={v}><span className="truncate">{v}</span></span>)}
      {vars.length > max && <span className="inline-flex h-[22px] items-center rounded-md px-1.5 text-meta font-medium text-muted">+{vars.length - max}</span>}
    </div>
  );
}

/** One template: icon badge, the one word, the name, two lines of text, variable chips, and View, Edit and Delete on
 *  hover or focus (always on touch). The whole card opens the pop-up; Delete asks first. */
export function TemplateCard({ t, index, intro, editable, onOpen, onEdit, onDelete }: {
  t: Template; index: number; intro: boolean; editable: boolean;
  onOpen: (el: HTMLElement) => void; onEdit: (el: HTMLElement) => void; onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const a = accentOf(t), word = purposeOf(t);
  const card = (e: React.MouseEvent) => (e.currentTarget as HTMLElement).closest("article") as HTMLElement;
  return (
    <article className={`tpl-card group relative flex min-h-[188px] flex-col gap-2.5 overflow-hidden rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow)] ${intro ? "tpl-in" : ""}`}
      style={{ "--i": Math.min(index, 11), "--edge": a.edge } as React.CSSProperties}>
      <button type="button" className="tpl-open absolute inset-0 z-0 rounded-xl" aria-label={`Open ${t.name}`} onClick={(e) => onOpen(card(e))} />
      <div className="pointer-events-none relative flex items-start justify-between gap-2">
        <Badge t={t} />
        <div className="row-act pointer-events-auto relative z-10 flex items-center gap-0.5">
          <IconBtn label={`View ${t.name}`} onClick={(e) => onOpen(card(e))}><Eye size={15} /></IconBtn>
          {editable && <IconBtn label={`Edit ${t.name}`} onClick={(e) => onEdit(card(e))}><Pencil size={15} /></IconBtn>}
          {editable && <IconBtn label={`Delete ${t.name}`} danger onClick={() => setConfirm(true)}><Trash2 size={15} /></IconBtn>}
        </div>
      </div>
      <div className="pointer-events-none relative flex min-w-0 flex-col gap-0.5">
        <h3 className="text-page font-semibold leading-tight tracking-[-0.02em] text-ink">{word}</h3>
        <p className="truncate text-meta text-muted" title={t.name}>{t.name}</p>
      </div>
      <p className="pointer-events-none relative line-clamp-2 text-body leading-snug text-ink-2">{t.body || <span className="text-faint">No text yet</span>}</p>
      <div className="pointer-events-none relative mt-auto"><VarChips body={t.body} chip={a.chip} /></div>
      {confirm && (
        <div className="tpl-confirm absolute inset-x-0 bottom-0 z-20 flex items-center justify-between gap-2 border-t border-line bg-surface px-4 py-3" role="alertdialog" aria-label={`Delete ${t.name}?`}
          onKeyDown={(e) => { if (e.key === "Escape") setConfirm(false); }}>
          <span className="text-body font-medium">Delete it?</span>
          <span className="flex gap-1.5">
            <button type="button" className="btn btn-quiet h-8" onClick={() => setConfirm(false)}>Keep</button>
            <button type="button" autoFocus className="btn h-8 text-bad" onClick={() => { setConfirm(false); onDelete(); }}>Delete</button>
          </span>
        </div>
      )}
    </article>
  );
}

function IconBtn({ label, onClick, danger, children }: { label: string; onClick: (e: React.MouseEvent) => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label.split(" ")[0]} onClick={(e) => { e.stopPropagation(); onClick(e); }}
      className={`grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink ${danger ? "hover:text-bad" : ""}`}>
      {children}
    </button>
  );
}

/** The Add card at the end of the grid. */
export function AddCard({ index, intro, onClick }: { index: number; intro: boolean; onClick: (el: HTMLElement) => void }) {
  return (
    <button type="button" onClick={(e) => onClick(e.currentTarget)} style={{ "--i": Math.min(index, 11) } as React.CSSProperties}
      className={`tpl-add group flex min-h-[188px] flex-col items-start justify-end gap-2.5 rounded-xl border border-dashed border-line-strong bg-transparent p-4 text-left ${intro ? "tpl-in" : ""}`}>
      <span className="tpl-badge grid h-9 w-9 place-items-center rounded-lg border border-line-strong bg-surface text-ink"><Plus size={17} /></span>
      <span className="flex flex-col gap-0.5"><span className="text-title font-semibold">Add template</span><span className="text-meta text-muted">A note, message, reply or offer</span></span>
    </button>
  );
}

export function CardSkeleton() {
  return (
    <div className="flex min-h-[188px] flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="h-9 w-9 animate-pulse rounded-lg bg-surface-2" />
      <div className="h-5 w-24 animate-pulse rounded bg-surface-2" />
      <div className="h-3 w-40 animate-pulse rounded bg-surface-2" />
      <div className="h-3 w-full animate-pulse rounded bg-surface-2" />
    </div>
  );
}
