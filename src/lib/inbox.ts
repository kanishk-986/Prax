// Inbox logic (X7): one list of people waiting on a reply, from three sources, ranked by who has waited longest.
//   lead:  a Pipeline lead in conversation whose next action is due today or overdue;
//   reply: someone who replied to a comment the profile left (comment_log.reply);
//   dm:    a LinkedIn message the user recorded by hand or sent from the extension on a click (inbox_messages).
// Several sources for the same lead fold into one row. Done and Snooze live in inbox_state by item key
// (db/026_step4.sql). Pure functions with no imports, so `node scripts/test-inbox.ts` can check them.

export type InboxSource = "lead" | "reply" | "dm";
export type InboxPipeline = { id: string; template: string; stages: string[]; won_stage: string; lost_stage: string };
export type InboxLead = { id: string; name: string; company: string; stage: string; next_action: string; next_date: string | null; linkedin: string; pipeline_id?: string | null; stage_changed_at?: string | null; created_at: string };
export type InboxReply = { id: string; author: string; author_url: string; url: string; text: string; reply: boolean; replied_at?: string | null; created_at: string; prospect_id?: string | null };
export type InboxDm = { id: string; person: string; company: string; linkedin: string; thread_url: string; body: string; received_at: string; prospect_id?: string | null };
export type InboxState = { key: string; done_at: string | null; snoozed_until: string | null };

export type InboxItem = {
  /** The row's own key (the strongest source); keys holds every folded source, so Done and Snooze cover all of them. */
  key: string; keys: string[]; source: InboxSource; sources: InboxSource[];
  person: string; company: string; snippet: string;
  /** When they started waiting (ISO) and the whole days since. */
  since: string; waited: number;
  /** Lead follow-ups only: the due date and the days past it (0 when due today). */
  due: string | null; overdue: number;
  prospectId: string | null; link: string; stage: string; score: number;
};

const DAY = 864e5;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Whole local days from an ISO time (or YYYY-MM-DD) to today. */
export function daysSince(iso: string, today: string): number {
  const day = iso.length <= 10 ? iso : ymd(new Date(iso));
  return Math.max(0, Math.round((Date.parse(today + "T12:00:00") - Date.parse(day + "T12:00:00")) / DAY));
}

export const itemKey = {
  lead: (id: string, due: string | null) => `lead:${id}:${due ?? ""}`,
  reply: (id: string) => `reply:${id}`,
  dm: (id: string) => `dm:${id}`,
};

/** Stages where a lead is talking with the profile: on Outreach, Connected and after; elsewhere every open stage after the first. Won and lost stages never count. */
export function inConversation(p: InboxPipeline | undefined, stage: string): boolean {
  if (!p) return ["Connected", "In conversation", "Resource sent", "Call booked"].includes(stage);
  if (stage === p.won_stage || stage === p.lost_stage) return false;
  const i = p.stages.indexOf(stage);
  if (i < 0) return false;
  if (p.template === "outreach") return i >= Math.max(0, p.stages.indexOf("Connected"));
  return i >= 1;
}

/** Ranking weights: a direct message outranks an overdue follow-up, which outranks a comment reply; every day waited adds. */
export const WEIGHT = { dm: 30, lead: 20, reply: 10, perDay: 3, perOverdueDay: 4, folded: 5 } as const;
export function scoreOf(i: Pick<InboxItem, "source" | "waited" | "overdue" | "sources">): number {
  return WEIGHT[i.source] + WEIGHT.perDay * Math.min(i.waited, 30) + WEIGHT.perOverdueDay * Math.min(i.overdue, 30) + (i.sources.length > 1 ? WEIGHT.folded : 0);
}

const slug = (u: string) => (u.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1] ?? "").toLowerCase();
/** The lead a message or reply belongs to: its stored prospect, else the same LinkedIn profile, else the same full name. */
export function matchLead<T extends Pick<InboxLead, "id" | "name" | "linkedin">>(leads: T[], prospectId: string | null | undefined, url: string, name: string): T | undefined {
  if (prospectId) { const l = leads.find((x) => x.id === prospectId); if (l) return l; }
  const s = slug(url);
  if (s) { const l = leads.find((x) => slug(x.linkedin) === s); if (l) return l; }
  const n = name.trim().toLowerCase();
  return n ? leads.find((x) => x.name.trim().toLowerCase() === n) : undefined;
}

const clip = (t: string, n = 180) => { const s = t.replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; };

export type InboxInput = {
  leads: InboxLead[]; pipelines: InboxPipeline[]; replies: InboxReply[]; dms: InboxDm[]; states: InboxState[];
  /** Last touch per lead (ISO), usually the latest stage move or Done. */
  lastTouch?: Record<string, string>;
  today: string;
  /** Replies older than this many days are left out (default 30). */
  replyDays?: number;
};
export type InboxResult = { open: InboxItem[]; snoozed: (InboxItem & { until: string })[]; done: number };

export function buildInbox(x: InboxInput): InboxResult {
  const state = new Map(x.states.map((s) => [s.key, s]));
  const pipes = new Map(x.pipelines.map((p) => [p.id, p]));
  const fallback = x.pipelines[0];
  const items: InboxItem[] = [];
  const byLead = new Map<string, InboxItem>();

  // 1. Leads in conversation with a next action due today or earlier.
  for (const l of x.leads) {
    if (!l.next_date || l.next_date > x.today) continue;
    const p = (l.pipeline_id && pipes.get(l.pipeline_id)) || fallback;
    if (!inConversation(p, l.stage)) continue;
    const since = x.lastTouch?.[l.id] ?? l.stage_changed_at ?? l.created_at;
    const it: InboxItem = { key: itemKey.lead(l.id, l.next_date), keys: [itemKey.lead(l.id, l.next_date)], source: "lead", sources: ["lead"], person: l.name, company: l.company,
      snippet: l.next_action ? `Next step: ${l.next_action}` : "Next step due", since, waited: daysSince(since, x.today), due: l.next_date, overdue: daysSince(l.next_date, x.today),
      prospectId: l.id, link: l.linkedin, stage: l.stage, score: 0 };
    items.push(it); byLead.set(l.id, it);
  }

  // 2 and 3. Captured messages and comment replies; folded into the lead's row when the person is a lead with one.
  const fold = (base: InboxItem, lead: InboxLead | undefined) => {
    const host = lead && byLead.get(lead.id);
    if (!host) {
      if (lead) { base.prospectId = lead.id; base.company ||= lead.company; base.stage = lead.stage; byLead.set(lead.id, base); }
      items.push(base); return;
    }
    host.keys.push(base.key);
    if (!host.sources.includes(base.source)) host.sources.push(base.source);
    // The row takes the strongest source's voice (a message beats a reply beats a follow-up) and the longest wait.
    if (WEIGHT[base.source] > WEIGHT[host.source]) { host.source = base.source; host.key = base.key; host.snippet = base.snippet; if (base.link) host.link = base.link; }
    if (base.since < host.since) { host.since = base.since; host.waited = base.waited; }
  };
  const replyFloor = x.replyDays ?? 30;
  for (const r of x.replies) {
    if (!r.reply) continue;
    const since = r.replied_at ?? r.created_at;
    if (daysSince(since, x.today) > replyFloor) continue;
    const lead = matchLead(x.leads, r.prospect_id, r.author_url, r.author);
    fold({ key: itemKey.reply(r.id), keys: [itemKey.reply(r.id)], source: "reply", sources: ["reply"], person: r.author || "Someone", company: lead?.company ?? "",
      snippet: r.text ? `Replied to your comment: "${clip(r.text, 140)}"` : "Replied to your comment", since, waited: daysSince(since, x.today), due: null, overdue: 0,
      prospectId: null, link: r.url, stage: "", score: 0 }, lead);
  }
  for (const m of x.dms) {
    const lead = matchLead(x.leads, m.prospect_id, m.linkedin, m.person);
    fold({ key: itemKey.dm(m.id), keys: [itemKey.dm(m.id)], source: "dm", sources: ["dm"], person: m.person, company: m.company || lead?.company || "",
      snippet: m.body ? clip(m.body) : "Sent a message", since: m.received_at, waited: daysSince(m.received_at, x.today), due: null, overdue: 0,
      prospectId: null, link: m.thread_url || m.linkedin, stage: "", score: 0 }, lead);
  }

  const open: InboxItem[] = [], snoozed: (InboxItem & { until: string })[] = [];
  let done = 0;
  for (const it of items) {
    const st = it.keys.map((k) => state.get(k));
    if (st.every((s) => s?.done_at)) { done++; continue; }
    // Keys already done drop out; the row stays for what is still open.
    it.keys = it.keys.filter((_, i) => !st[i]?.done_at);
    it.score = scoreOf(it);
    const until = st.map((s) => s?.snoozed_until ?? "").filter((u) => u > x.today).sort()[0];
    if (until && it.keys.every((k) => (state.get(k)?.snoozed_until ?? "") > x.today)) snoozed.push({ ...it, until });
    else open.push(it);
  }
  const rank = (a: InboxItem, b: InboxItem) => b.score - a.score || a.since.localeCompare(b.since) || a.person.localeCompare(b.person);
  open.sort(rank);
  snoozed.sort((a, b) => a.until.localeCompare(b.until) || rank(a, b));
  return { open, snoozed, done };
}

/** "Today", "1 day", "4 days", "2 weeks". */
export function waitLabel(days: number): string {
  if (days <= 0) return "Today";
  if (days < 14) return `${days} ${days === 1 ? "day" : "days"}`;
  const w = Math.floor(days / 7);
  return `${w} weeks`;
}

/** The due line of a follow-up: "Due today", "1 day overdue", "5 days overdue". */
export function dueLabel(it: Pick<InboxItem, "due" | "overdue">): string {
  if (!it.due) return "";
  return it.overdue === 0 ? "Due today" : `${it.overdue} ${it.overdue === 1 ? "day" : "days"} overdue`;
}

export const SOURCE_LABEL: Record<InboxSource, string> = { dm: "Message", reply: "Comment reply", lead: "Follow-up" };

/** Snooze choices: tomorrow, two days on, and next Monday. */
export function snoozeDates(today: string): { label: string; date: string }[] {
  const d = (n: number) => { const t = new Date(today + "T12:00:00"); t.setDate(t.getDate() + n); return ymd(t); };
  const dow = new Date(today + "T12:00:00").getDay();
  const toMonday = ((8 - dow) % 7) || 7;
  return [{ label: "Tomorrow", date: d(1) }, { label: "In two days", date: d(2) }, { label: "Next Monday", date: d(toMonday) }];
}

/** What the AI is asked for: one reply, copied and sent by the user. who is "Name, Role at Company". */
export function replyPrompt(it: Pick<InboxItem, "person" | "company" | "source" | "snippet" | "stage">, who: string, extra = ""): string {
  const what = it.source === "dm" ? `They wrote: "${it.snippet}"` : it.source === "reply" ? `They replied on LinkedIn to a comment ${who.split(",")[0]} left on their post. ${it.snippet}` : `This is a follow-up. ${it.snippet}`;
  return `Draft one short LinkedIn reply from ${who} to ${it.person}${it.company ? ` at ${it.company}` : ""}.
${what}
${it.stage ? `Pipeline stage: ${it.stage}. ` : ""}${extra ? `Notes: ${extra.slice(0, 600)}. ` : ""}
Rules: under 70 words, plain and specific, answer what they said first, no pitch, no em dashes, no contractions, no emoji, at most one question. Return only the message text.`;
}
