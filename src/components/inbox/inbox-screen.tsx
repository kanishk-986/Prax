"use client";
// The Inbox screen (X7): everyone waiting on a reply, longest wait first. Data and writes come in through
// `data` and `api` (the page wires Supabase and the extension), so the preview can render it with sample rows.
// Nothing here sends anything on LinkedIn: Draft reply copies text, Open goes to the thread or the lead.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, Clock, Copy, ExternalLink, MessageSquareText, X } from "lucide-react";
import { Section, KpiTiles, NotStarted, reveal, type TourStep } from "@/components/shell";
import { useToast } from "@/components/toaster";
import { useWorkspace } from "@/lib/workspace";
import { initialsOf, possessive, firstNameOf } from "@/lib/persona";
import { SOURCE_LABEL, dueLabel, snoozeDates, waitLabel, matchLead, type InboxItem, type InboxResult, type InboxSource } from "@/lib/inbox";

export type NewMessage = { person: string; company: string; linkedin: string; thread_url: string; body: string; received_at: string; prospect_id: string | null };
export type InboxData = { result: InboxResult; loading: boolean; missing: boolean; today: string; leads: { id: string; name: string; company: string; linkedin: string }[] };
export type InboxApi = {
  /** Writes Done or Snooze for every key of a row; null on success, else the error. */
  mark: (keys: string[], patch: { done_at?: string | null; snoozed_until?: string | null }) => Promise<string | null>;
  add: (m: NewMessage) => Promise<string | null>;
  /** The AI reply through the extension; throws when the extension is not there. */
  draft: (it: InboxItem) => Promise<string>;
  /** A plain reply when there is no AI. */
  fallback: (it: InboxItem) => string;
};

const tour = (n: string): TourStep[] => [
  { target: "header", title: "What the Inbox is for", body: `Everyone waiting on a reply from ${n}, in one list: messages you record, replies to comments, and Pipeline follow-ups that are due.` },
  { target: "inbox-kpis", title: "Filter by source", body: "Click a number to show only messages, comment replies or follow-ups. Click it again to see everyone." },
  { target: "inbox-list", title: "Longest wait first", body: "A message counts most, then an overdue follow-up, then a comment reply, and every day of waiting adds. One row per person, even when they wrote in more than one place." },
  { target: "inbox-actions", title: "Reply by hand", body: "Draft reply writes a suggestion with your own AI key in the extension. Copy it and send it yourself on LinkedIn. Prax never sends anything." },
  { target: "inbox-add", title: "Add a message", body: "Paste a LinkedIn message you received. With the extension, press Send to Prax Inbox on the conversation instead." },
];

export function InboxScreen({ data, api }: { data: InboxData; api: InboxApi }) {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const edit = can("editor");
  const [tab, setTab] = useState<"open" | "snoozed">("open");
  const [only, setOnly] = useState<InboxSource | null>(null);
  const [adding, setAdding] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const { open, snoozed } = data.result;
  const first = firstNameOf(ws);

  const visible = open.filter((i) => !hidden.has(i.key));
  const counts = useMemo(() => ({ dm: visible.filter((i) => i.source === "dm").length, reply: visible.filter((i) => i.source === "reply").length, lead: visible.filter((i) => i.due).length }), [visible]);
  const overdue = visible.filter((i) => i.overdue > 0).length;
  const list = (tab === "open" ? visible : snoozed).filter((i) => !only || (only === "lead" ? !!i.due : i.source === only));
  const oldest = visible.reduce((m, i) => Math.max(m, i.waited), 0);

  async function act(it: InboxItem, patch: { done_at?: string | null; snoozed_until?: string | null }, text: string, undoPatch: { done_at?: string | null; snoozed_until?: string | null }) {
    setHidden((h) => new Set(h).add(it.key));
    const err = await api.mark(it.keys, patch);
    if (err) { setHidden((h) => { const n = new Set(h); n.delete(it.key); return n; }); toast(err, undefined, { info: true }); return; }
    toast(text, async () => { const e = await api.mark(it.keys, undoPatch); setHidden((h) => { const n = new Set(h); n.delete(it.key); return n; }); if (e) toast(e, undefined, { info: true }); });
  }
  // Rows leave the hidden set once the live data drops them.
  useEffect(() => { setHidden((h) => (h.size ? new Set([...h].filter((k) => open.some((i) => i.key === k))) : h)); }, [open]);

  const status = data.loading ? "Loading who is waiting." : !visible.length ? "Nobody is waiting on a reply." : `${visible.length === 1 ? "One person is" : `${visible.length} people are`} waiting on a reply. The longest wait is ${waitLabel(oldest).toLowerCase()}.`;

  return (
    <Section id="inbox" title="Inbox" status={status} entryStatus={status} steps={tour(first)}
      tabs={[{ id: "open", label: "Needs reply", count: visible.length, red: overdue > 0 }, { id: "snoozed", label: "Snoozed", count: snoozed.length }]} tab={tab} onTab={(t) => setTab(t as "open" | "snoozed")}
      primary={edit && !data.missing ? <button data-tour="inbox-add" type="button" className="btn btn-primary h-10 px-4" onClick={() => setAdding(true)}><MessageSquareText size={15} /> Add message</button> : undefined}>

      {data.missing && <NotStarted compact title="The Inbox needs one database step" body="Run db/026_step4.sql in the Supabase SQL editor. Until then Pipeline follow-ups and comment replies show here, but messages cannot be added, and Done and Snooze cannot be saved." />}

      {adding && <AddMessage leads={data.leads} today={data.today} onClose={() => setAdding(false)} onSave={async (m) => { const e = await api.add(m); if (!e) { setAdding(false); toast(`Message from ${m.person} added`); } return e; }} />}

      <KpiTiles tour="inbox-kpis" items={[
        { label: "Waiting on a reply", value: visible.length, sub: visible.length ? `Longest ${waitLabel(oldest).toLowerCase()}` : "Nobody", onClick: () => setOnly(null), selected: only === null },
        { label: "Messages", value: counts.dm, sub: "recorded or captured", onClick: () => setOnly(only === "dm" ? null : "dm"), selected: only === "dm" },
        { label: "Comment replies", value: counts.reply, sub: "on comments you left", onClick: () => setOnly(only === "reply" ? null : "reply"), selected: only === "reply" },
        { label: "Follow-ups due", value: counts.lead, sub: overdue ? `${overdue} overdue` : "from Pipeline", tone: overdue ? "alert" : undefined, onClick: () => setOnly(only === "lead" ? null : "lead"), selected: only === "lead" },
      ]} />

      <section data-tour="inbox-list" className="panel" aria-busy={data.loading}>
        <div className="panel-head">
          <span>{tab === "open" ? "Longest wait first" : "Snoozed, back on the date shown"}</span>
          {only && <button type="button" className="panel-link" onClick={() => setOnly(null)}>Show everyone</button>}
        </div>
        {data.loading ? <Skeleton /> : !list.length ? (
          <p className="border-t border-line px-[18px] py-5 text-body text-muted">
            {tab === "snoozed" ? "Nothing is snoozed." : only ? "Nobody from this source is waiting." : `Nobody is waiting. Replies to ${possessive(first)} comments, messages you add and due Pipeline follow-ups appear here.`}
          </p>
        ) : (
          <ul className="list-none p-0">
            {list.map((it, i) => <Row key={it.key} it={it} i={i} edit={edit && !data.missing} draftable={edit} today={data.today} base={`/w/${ws.slug}`} api={api} act={act} snoozedUntil={"until" in it ? (it as InboxItem & { until: string }).until : undefined} tourRow={i === 0} />)}
          </ul>
        )}
      </section>
    </Section>
  );
}

function Row({ it, i, edit, draftable, today, base, api, act, snoozedUntil, tourRow }: {
  it: InboxItem; i: number; edit: boolean; draftable: boolean; today: string; base: string; api: InboxApi; tourRow: boolean; snoozedUntil?: string;
  act: (it: InboxItem, patch: { done_at?: string | null; snoozed_until?: string | null }, text: string, undo: { done_at?: string | null; snoozed_until?: string | null }) => void;
}) {
  const [draft, setDraft] = useState<{ state: "busy" | "ready" | "error"; text: string; error?: string } | null>(null);
  const r = reveal(Math.min(i, 8));
  const due = dueLabel(it);
  async function write() {
    setDraft({ state: "busy", text: "" });
    try { setDraft({ state: "ready", text: (await api.draft(it)).trim() }); }
    catch (e) { setDraft({ state: "error", text: api.fallback(it), error: (e as Error).message }); }
  }
  const external = it.link && /^https?:\/\//.test(it.link);
  return (
    <li className={`border-t border-line ${r.className}`} style={r.style}>
      <div className="flex flex-col gap-3 px-[18px] py-3.5 md:flex-row md:items-start md:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-meta font-semibold text-ink-2">{initialsOf(it.person)}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-body font-semibold">{it.person}</span>
              {it.company && <span className="text-meta text-muted">{it.company}</span>}
            </div>
            <p className="line-clamp-2 text-body text-ink-2">{it.snippet}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {it.sources.slice().sort((a, b) => (a === it.source ? -1 : b === it.source ? 1 : 0)).map((s) => <span key={s} className="chip">{SOURCE_LABEL[s]}</span>)}
              {it.stage && <span className="text-meta text-muted">{it.stage}</span>}
              {due && <span className={`num text-meta ${it.overdue ? "font-semibold text-dark-red" : "text-muted"}`}>{due}</span>}
              {snoozedUntil && <span className="num text-meta text-muted">Back {new Date(snoozedUntil + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span>}
            </div>
          </div>
          <Wait days={it.waited} late={it.overdue > 0} />
        </div>
        <div data-tour={tourRow ? "inbox-actions" : undefined} className="-ml-2 flex flex-wrap items-center gap-0.5 md:ml-0 md:w-[344px] md:shrink-0 md:flex-nowrap md:justify-end">
          {draftable && <button type="button" className="btn btn-quiet h-8 px-2.5" onClick={write} disabled={draft?.state === "busy"}>{draft?.state === "busy" ? "Drafting" : "Draft reply"}</button>}
          {edit && !snoozedUntil && <button type="button" className="btn btn-quiet h-8 px-2.5" onClick={() => act(it, { done_at: new Date().toISOString() }, `${it.person} marked done`, { done_at: null })}><Check size={14} /> Done</button>}
          {edit && (snoozedUntil
            ? <button type="button" className="btn btn-quiet h-8 px-2.5" onClick={() => act(it, { snoozed_until: null }, `${it.person} is back in Needs reply`, { snoozed_until: snoozedUntil })}>Wake now</button>
            : <Snooze today={today} onPick={(d) => act(it, { snoozed_until: d }, `${it.person} snoozed until ${new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}`, { snoozed_until: null })} />)}
          {it.prospectId ? <Link href={`${base}/pipeline?p=${it.prospectId}`} className="btn btn-quiet h-8 px-2.5" aria-label={`Open ${it.person} in Pipeline`}><span className="hidden sm:inline">Open lead</span><ArrowUpRight size={14} className="sm:hidden" /></Link>
            : external ? <a href={it.link} target="_blank" rel="noopener noreferrer" className="btn btn-quiet h-8 px-2.5" aria-label={`Open on LinkedIn`}><span className="hidden sm:inline">Open</span> <ExternalLink size={13} /></a> : null}
        </div>
      </div>
      {draft && <DraftBox draft={draft} base={base} person={it.person} onChange={(text) => setDraft({ ...draft, text })} onAgain={write} onClose={() => setDraft(null)} />}
    </li>
  );
}

/** The wait, in words, over a thin bar that fills across 14 days; dark red once a follow-up is overdue. */
function Wait({ days, late }: { days: number; late: boolean }) {
  const pct = Math.min(100, Math.round((Math.max(days, 0.4) / 14) * 100));
  return (
    <span className="flex w-[76px] shrink-0 flex-col items-end gap-1.5 pt-0.5" title={`Waiting ${waitLabel(days).toLowerCase()}`}>
      <span className={`num whitespace-nowrap text-body font-semibold ${late ? "text-dark-red" : "text-ink"}`}>{waitLabel(days)}</span>
      <span aria-hidden="true" className="h-[3px] w-full overflow-hidden rounded-full bg-track"><span className={`block h-full rounded-full ${late ? "bg-dark-red" : "bg-ink"}`} style={{ width: `${pct}%` }} /></span>
      <span className="sr-only">waiting</span>
    </span>
  );
}

function Snooze({ today, onPick }: { today: string; onPick: (date: string, label: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button type="button" className="btn btn-quiet h-8 px-2.5" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}><Clock size={14} /> Snooze</button>
      {open && (
        <div role="menu" className="absolute right-0 top-9 z-40 flex w-[200px] flex-col rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-lg)]">
          {snoozeDates(today).map((s) => (
            <button key={s.date} role="menuitem" type="button" className="flex h-9 items-center justify-between rounded-md px-2.5 text-body hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none" onClick={() => { setOpen(false); onPick(s.date, s.label); }}>
              {s.label}<span className="num text-meta text-muted">{new Date(s.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DraftBox({ draft, base, person, onChange, onAgain, onClose }: { draft: { state: "busy" | "ready" | "error"; text: string; error?: string }; base: string; person: string; onChange: (t: string) => void; onAgain: () => void; onClose: () => void }) {
  const toast = useToast();
  return (
    <div className="anim-rise mx-[18px] mb-4 flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-3 md:ml-[66px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-meta font-medium text-muted">{draft.state === "busy" ? "Drafting with your AI key in the extension" : draft.state === "error" ? "A plain reply to start from" : `Reply to ${person}. Copy it and send it yourself on LinkedIn.`}</span>
        <button type="button" className="btn btn-ghost h-7 w-7 p-0" aria-label="Close the draft" onClick={onClose}><X size={14} /></button>
      </div>
      {draft.state === "busy" ? <div className="flex flex-col gap-2 py-1" aria-busy="true"><span className="h-3 w-11/12 animate-pulse rounded bg-track" /><span className="h-3 w-3/4 animate-pulse rounded bg-track" /></div>
        : <textarea aria-label={`Reply to ${person}`} className="field min-h-[124px] bg-surface md:min-h-[96px]" value={draft.text} onChange={(e) => onChange(e.target.value)} />}
      {draft.state === "error" && <p className="text-meta text-muted">{draft.error} <Link className="font-medium text-ink underline decoration-line-strong underline-offset-[3px]" href={`${base}/extension`}>Set up the extension</Link></p>}
      {draft.state !== "busy" && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-dark h-8" onClick={async () => { try { await navigator.clipboard.writeText(draft.text); toast("Reply copied"); } catch { toast("Copy did not work. Select the text and copy it.", undefined, { info: true }); } }}><Copy size={14} /> Copy</button>
          <button type="button" className="btn h-8" onClick={onAgain}>Draft again</button>
        </div>
      )}
    </div>
  );
}

function AddMessage({ leads, today, onSave, onClose }: { leads: InboxData["leads"]; today: string; onSave: (m: NewMessage) => Promise<string | null>; onClose: () => void }) {
  const [f, setF] = useState({ person: "", company: "", linkedin: "", thread_url: "", body: "", day: today });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const lead = f.person.trim() || f.linkedin.trim() ? matchLead(leads, null, f.linkedin, f.person) : undefined;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const badThread = !!f.thread_url && !/^https:\/\/(www\.)?linkedin\.com\//i.test(f.thread_url.trim());
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (badThread) return;
    setBusy(true); setErr("");
    // A day in the past is noon that day; today is now, so the wait starts from when it was added.
    const at = f.day && f.day < today ? new Date(f.day + "T12:00:00").toISOString() : new Date().toISOString();
    const out = await onSave({ person: f.person.trim(), company: f.company.trim() || lead?.company || "", linkedin: f.linkedin.trim(), thread_url: f.thread_url.trim(), body: f.body.trim(), received_at: at, prospect_id: lead?.id ?? null });
    setBusy(false);
    if (out) setErr(out);
  }
  return (
    <form onSubmit={save} className="panel anim-rise flex flex-col gap-4 p-5" aria-labelledby="add-msg-title" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div>
        <h2 id="add-msg-title" className="text-title font-semibold">Add a message</h2>
        <p className="mt-0.5 text-body text-muted">Paste a LinkedIn message you received. It stays in the Inbox until you mark it done.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1"><span className="label">From</span><input className="field h-10" required autoFocus autoComplete="off" value={f.person} onChange={set("person")} placeholder="First and last name" /></label>
        <label className="flex flex-col gap-1"><span className="label">Company</span><input className="field h-10" autoComplete="off" value={f.company} onChange={set("company")} placeholder={lead?.company || "Optional"} /></label>
        <label className="flex flex-col gap-1"><span className="label">LinkedIn profile</span><input className="field h-10" inputMode="url" value={f.linkedin} onChange={set("linkedin")} placeholder="linkedin.com/in/their-name" /></label>
        <label className="flex flex-col gap-1"><span className="label">Conversation link</span><input className="field h-10" inputMode="url" value={f.thread_url} onChange={set("thread_url")} placeholder="https://www.linkedin.com/messaging/thread/..." aria-invalid={badThread} />
          {badThread && <span className="text-meta text-bad">Use the LinkedIn link of the conversation, or leave it empty.</span>}</label>
        <label className="flex flex-col gap-1 sm:col-span-2"><span className="label">Their last message</span><textarea className="field min-h-[88px]" required value={f.body} onChange={set("body")} placeholder="Paste what they wrote" /></label>
        <label className="flex flex-col gap-1"><span className="label">Received</span><input type="date" className="field h-10" max={today} value={f.day} onChange={set("day")} /></label>
        <p className="self-end pb-2.5 text-meta text-muted">{lead ? `Linked to ${lead.name}${lead.company ? `, ${lead.company}` : ""} in Pipeline.` : "Not a Pipeline lead yet."}</p>
      </div>
      {err && <p className="text-body text-bad" role="alert">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-dark h-10 px-4" disabled={busy || !f.person.trim() || !f.body.trim()}>{busy ? "Adding" : "Add to Inbox"}</button>
        <button type="button" className="btn h-10 px-4" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col" aria-hidden="true">
      {[0, 1, 2].map((k) => (
        <div key={k} className="flex items-start gap-3 border-t border-line px-[18px] py-4">
          <span className="h-9 w-9 animate-pulse rounded-full bg-track" />
          <span className="flex flex-1 flex-col gap-2"><span className="h-3 w-1/3 animate-pulse rounded bg-track" /><span className="h-3 w-3/4 animate-pulse rounded bg-track" /></span>
        </div>
      ))}
    </div>
  );
}
