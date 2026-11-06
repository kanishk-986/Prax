"use client";
// Shared AI citations parts: the card, empty state and status marks, and the tracked names manager (edit the person
// and company, add and remove peer firms and peer experts) with its side panel, remove confirm and Undo toasts.
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { useToast, haptic } from "@/components/toaster";
import { useCitationScope } from "@/lib/citation-profile";
import { withProfile, type Entity } from "@/lib/citations";
import s from "./citations.module.css";

export const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");
const list = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
export type EntRow = Entity & { sort: number };

/** Names for copy: never hard-coded, always the tracked profile's. */
export function who(person?: Pick<Entity, "name">, company?: Pick<Entity, "name">) {
  const full = person?.name?.trim() || "the person";
  return { person: full, first: full.split(/\s+/)[0], company: company?.name?.trim() || "the company" };
}

export function Card({ id, title, meta, action, children, className, tour }: { id?: string; title?: React.ReactNode; meta?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; tour?: string }) {
  return (
    <section id={id} data-tour={tour} className={cx(s.card, className)}>
      {(title || action) && (
        <div className={s.cardHead}>
          <div className={s.cardTitle}><span className="min-w-0">{title}</span>{meta != null && <span className={s.cardMeta}>{meta}</span>}</div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className={s.empty}>
      <span className={s.emptyTitle}>{title}</span>
      {body && <span className={s.emptyBody}>{body}</span>}
      {action && <span className="mt-3 flex flex-wrap justify-center gap-2">{action}</span>}
    </div>
  );
}

export function Status({ tone, children }: { tone: "red" | "ring" | "ink" | "grey"; children: React.ReactNode }) {
  return <span className={s.status}><span className={cx(s.dot, tone === "red" && s.dotRed, tone === "ring" && s.dotRing, tone === "ink" && s.dotInk)} aria-hidden />{children}</span>;
}

/** A right-side panel. Escape and the scrim close it. */
export function Side({ title, sub, onClose, children, foot, wide }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; foot?: React.ReactNode; wide?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className={s.scrim} onMouseDown={onClose}>
      <aside className={s.drawer} style={wide ? { maxWidth: 760 } : undefined} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className={s.drawerHead}>
          <div className="min-w-0"><h2 className={s.drawerTitle}>{title}</h2>{sub && <p className={cx(s.small, "mt-1")}>{sub}</p>}</div>
          <button className={cx(s.btn, s.ghost, s.sm, "w-7 px-0")} onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>
        <div className="flex-1">{children}</div>
        {foot && <div className={s.drawerFoot}>{foot}</div>}
      </aside>
    </div>
  );
}

export function Confirm({ title, body, cta, busy, onClose, onConfirm }: { title: string; body: string; cta: string; busy?: boolean; onClose: () => void; onConfirm: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className={s.center} onMouseDown={onClose}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="cf-title" aria-describedby="cf-body" className={s.dialog} onMouseDown={(e) => e.stopPropagation()}>
        <h2 id="cf-title" className="text-[16px] font-semibold">{title}</h2>
        <p id="cf-body" className={cx(s.small, "mt-1.5 text-[13.5px]")}>{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button className={s.btn} onClick={onClose} autoFocus>Cancel</button>
          <button className={cx(s.btn, s.danger)} disabled={busy} onClick={onConfirm}>{busy ? "Removing" : cta}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- tracked names ----------------
const cleanLi = (v: string) => v.trim().replace(/^https?:\/\/(www\.)?/i, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
const isLi = (d: string) => /(^|\.)linkedin\.com\//i.test(d);
export type Pool = "person" | "company" | "experts" | "firms";
const POOL: Record<Pool, { kind: "self" | "competitor"; subject: "person" | "company"; noun: string }> = {
  person: { kind: "self", subject: "person", noun: "person" },
  company: { kind: "self", subject: "company", noun: "company" },
  experts: { kind: "competitor", subject: "person", noun: "peer expert" },
  firms: { kind: "competitor", subject: "company", noun: "peer firm" },
};
export const MAX_PEERS = 8;

type Draft = { name: string; aliases: string; li: string; domains: string };
function toDraft(e: Entity | null, subject: "person" | "company"): Draft {
  if (!e) return { name: "", aliases: "", li: "", domains: "" };
  const others = e.aliases.filter((a) => a.trim().toLowerCase() !== e.name.trim().toLowerCase());
  if (subject === "company") return { name: e.name, aliases: others.join(", "), li: "", domains: e.domains.join(", ") };
  const li = e.domains.find(isLi) ?? "";
  return { name: e.name, aliases: others.join(", "), li, domains: e.domains.filter((d) => d !== li).join(", ") };
}
function fromDraft(d: Draft, subject: "person" | "company") {
  const name = d.name.trim();
  const aliases = [...new Set([name, ...list(d.aliases)].filter(Boolean))];
  const domains = [...new Set([...(subject === "person" && d.li.trim() ? [cleanLi(d.li)] : []), ...list(d.domains).map(cleanLi)])];
  return { name, aliases, domains };
}

/** Add or edit one tracked name. Saving re-scores every past run, because detection runs at display time. */
export function EntityPanel({ pool, entity, onClose }: { pool: Pool; entity: EntRow | null; onClose: () => void }) {
  const { ws } = useWorkspace();
  const { scope } = useCitationScope();
  const toast = useToast();
  const cfg = POOL[pool], person = cfg.subject === "person";
  const [d, setD] = useState<Draft>(() => toDraft(entity, cfg.subject));
  const [busy, setBusy] = useState(false);
  const fullName = !person || d.name.trim().split(/\s+/).length >= 2;
  const ok = !!d.name.trim() && fullName;
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!ok || busy) return;
    setBusy(true);
    const v = fromDraft(d, cfg.subject);
    if (entity) {
      const before = { name: entity.name, aliases: entity.aliases, domains: entity.domains };
      const { error } = await supabase().from("citation_entities").update(v).eq("id", entity.id);
      setBusy(false);
      if (error) { toast(error.message); return; }
      haptic(); onClose();
      toast(`${v.name} saved. Past answers are re-scored.`, async () => { await supabase().from("citation_entities").update(before).eq("id", entity.id); });
    } else {
      const { data, error } = await supabase().from("citation_entities").insert(withProfile({ workspace_id: ws.id, kind: cfg.kind, subject: cfg.subject, status: "active", ...v, sort: Date.now() % 100000 }, scope)).select("id").single();
      setBusy(false);
      if (error) { toast(error.message); return; }
      haptic(); onClose();
      toast(`${v.name} added as a ${cfg.noun}`, async () => { await supabase().from("citation_entities").delete().eq("id", data.id); });
    }
  }
  const title = entity ? `Edit ${entity.name}` : `Add a ${cfg.noun}`;
  return (
    <Side title={title} sub={person ? "Counted only by a full name with context nearby." : "Matched as whole words in each answer."} onClose={onClose}
      foot={<><button type="button" className={s.btn} onClick={onClose}>Cancel</button><button type="submit" form="ent-form" className={cx(s.btn, s.red)} disabled={!ok || busy}>{busy ? "Saving" : entity ? "Save" : "Add"}</button></>}>
      <form id="ent-form" onSubmit={save} className="grid gap-4">
        <label className="grid gap-1.5"><span className={s.label}>{person ? "Full name" : "Company name"}</span>
          <input autoFocus className={s.field} value={d.name} placeholder={person ? "First and last name" : "Company"} onChange={(e) => setD({ ...d, name: e.target.value })} />
          {person && d.name.trim() && !fullName && <span className="text-[12px] text-[#9e1c1c]">Use the first and last name.</span>}
        </label>
        <label className="grid gap-1.5"><span className={s.label}>{person ? "Other full names" : "Other names to match"}</span>
          <input className={s.field} value={d.aliases} placeholder={person ? "Optional, separated by commas" : "Company Ltd, company.com"} onChange={(e) => setD({ ...d, aliases: e.target.value })} />
          <span className={s.hint}>Separate with commas. The name above is always included.</span>
        </label>
        {person && <label className="grid gap-1.5"><span className={s.label}>LinkedIn profile</span>
          <input className={s.field} value={d.li} placeholder="linkedin.com/in/their-profile" onChange={(e) => setD({ ...d, li: e.target.value })} />
          <span className={s.hint}>Also covers their posts and articles.</span>
        </label>}
        <label className="grid gap-1.5"><span className={s.label}>{person ? "Other owned sites" : "Owned domains"}</span>
          <input className={s.field} value={d.domains} placeholder={person ? "Optional, e.g. their-site.com" : "company.com"} onChange={(e) => setD({ ...d, domains: e.target.value })} />
          <span className={s.hint}>An answer that cites one of these counts as linked.</span>
        </label>
      </form>
    </Side>
  );
}

function summary(e: Entity) {
  const others = e.aliases.filter((a) => a.trim().toLowerCase() !== e.name.trim().toLowerCase());
  return [others.length ? `Also ${others.join(", ")}` : "", e.domains.join(", ")].filter(Boolean).join(" · ") || "No sites yet";
}

/** The tracked names, grouped. Company view shows the company and peer firms; Competitors shows all four. */
export function TrackedNames({ ents, pools, editable, id, className }: { ents: EntRow[]; pools: Pool[]; editable: boolean; id?: string; className?: string }) {
  const toast = useToast();
  const [panel, setPanel] = useState<{ pool: Pool; e: EntRow | null } | null>(null);
  const [gone, setGone] = useState<EntRow | null>(null);
  const [busy, setBusy] = useState(false);
  const members = (p: Pool) => ents.filter((e) => e.kind === POOL[p].kind && (POOL[p].subject === "person" ? e.subject === "person" : e.subject !== "person"));
  async function remove() {
    if (!gone) return;
    setBusy(true);
    const row = { ...gone };
    const { error } = await supabase().from("citation_entities").delete().eq("id", row.id);
    setBusy(false); setGone(null);
    if (error) { toast(error.message); return; }
    haptic();
    toast(`${row.name} removed`, async () => { const { error: e2 } = await supabase().from("citation_entities").insert(row); if (e2) toast(e2.message); });
  }
  async function setStatus(e: EntRow, status: "active" | "suggested") {
    const { error } = await supabase().from("citation_entities").update({ status }).eq("id", e.id);
    if (error) { toast(error.message); return; }
    haptic(); toast(status === "active" ? `${e.name} is now tracked` : `${e.name} back in suggestions`, () => { supabase().from("citation_entities").update({ status: status === "active" ? "suggested" : "active" }).eq("id", e.id).then(); });
  }
  const groups: { title: string; pools: Pool[] }[] = [];
  if (pools.includes("person") || pools.includes("company")) groups.push({ title: "Tracked", pools: pools.filter((p) => p === "person" || p === "company") });
  pools.filter((p) => p === "firms" || p === "experts").forEach((p) => groups.push({ title: p === "firms" ? "Peer firms" : "Peer experts", pools: [p] }));
  return (
    <div id={id} className={cx("grid items-start gap-4", className)}>
      {groups.map((g) => {
        const peer = g.pools[0] === "firms" || g.pools[0] === "experts";
        const rows = g.pools.flatMap((p) => members(p).map((e) => ({ p, e })));
        const tracked = rows.filter((r) => r.e.status !== "suggested"), suggested = rows.filter((r) => r.e.status === "suggested");
        const full = peer && tracked.length >= MAX_PEERS;
        return (
          <Card key={g.title} title={g.title} meta={peer ? `${tracked.length} of ${MAX_PEERS}` : undefined}
            action={peer && editable ? <button className={cx(s.btn, s.sm)} disabled={full} title={full ? `Up to ${MAX_PEERS} keeps the comparison readable` : undefined} onClick={() => setPanel({ pool: g.pools[0], e: null })}>{g.pools[0] === "firms" ? "Add peer firm" : "Add peer expert"}</button> : undefined}>
            <div className={cx(s.rows, s.rowsTop)}>
              {tracked.map(({ p, e }) => (
                <div key={e.id} className={s.row}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{e.name}</span>{!peer && <span className={cx(s.pill, s.pDark)}>{e.subject === "person" ? "Person" : "Company"}</span>}</div>
                    <div className={cx(s.small, "mt-0.5 truncate")}>{summary(e)}</div>
                  </div>
                  {editable && <div className="flex shrink-0 gap-1">
                    <button className={cx(s.btn, s.sm)} onClick={() => setPanel({ pool: p, e })} aria-label={`Edit ${e.name}`}>Edit</button>
                    {peer && <button className={cx(s.btn, s.ghost, s.sm)} onClick={() => setGone(e)} aria-label={`Remove ${e.name}`}>Remove</button>}
                  </div>}
                </div>
              ))}
              {!tracked.length && <Empty title={g.pools[0] === "firms" ? "No peer firms" : g.pools[0] === "experts" ? "No peer experts" : "Nothing tracked"} body={g.pools[0] === "experts" ? "Add the people buyers might hear from instead. Prax never guesses names." : g.pools[0] === "firms" ? "Add the firms buyers compare you with. Gaps and rank need at least one." : undefined} />}
              {suggested.map(({ e }) => (
                <div key={e.id} className={cx(s.row, "bg-[#fafafa]")}>
                  <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="font-semibold">{e.name}</span><span className={cx(s.pill, s.pLine)}>Suggested</span></div><div className={cx(s.small, "mt-0.5 truncate")}>Not tracked until approved</div></div>
                  {editable && <div className="flex shrink-0 gap-1"><button className={cx(s.btn, s.sm)} disabled={full} onClick={() => setStatus(e, "active")}>Approve</button><button className={cx(s.btn, s.ghost, s.sm)} onClick={() => setGone(e)}>Dismiss</button></div>}
                </div>
              ))}
            </div>
          </Card>
        );
      })}
      {panel && <EntityPanel pool={panel.pool} entity={panel.e} onClose={() => setPanel(null)} />}
      {gone && <Confirm title={`Remove ${gone.name}?`} body="It stops counting in rank, gaps and the report. Past answers are kept." cta="Remove" busy={busy} onClose={() => setGone(null)} onConfirm={remove} />}
    </div>
  );
}
