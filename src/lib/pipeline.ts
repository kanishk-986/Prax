// Pipeline logic: templates, heat, Do next ranking, the move gate, days per stage and the touch plan.
// Pure functions with no imports, so `node scripts/test-pipeline.ts` can check them. db/015_pipelines.sql holds
// the same Outreach stages and stage mapping; keep them identical.

export type Prospect = {
  id: string; name: string; role: string; company: string; segment: string; region: string; stage: string; warmth: string;
  value: number; next_action: string; next_date: string | null; linkedin: string; why: string; notes: string; stage_changed_at: string; created_at: string;
  pipeline_id?: string | null; lost_reason?: string; owner?: string | null;
};
export type Pipeline = { id: string; name: string; template: string; stages: string[]; won_stage: string; lost_stage: string; sort: number };
export type StageMove = { id: string; prospect_id: string; kind: "move" | "done" | "backfill"; from_stage: string; to_stage: string; prev_action: string; next_action: string; next_date: string | null; reason: string; at: string };

export const OUTREACH_STAGES = ["Target", "Warming", "Requested", "Connected", "In conversation", "Resource sent", "Call booked", "Won", "Parked"];

export const TEMPLATES: { key: string; name: string; stages: string[]; won: string; lost: string }[] = [
  { key: "outreach", name: "Outreach", stages: OUTREACH_STAGES, won: "Won", lost: "Parked" },
  { key: "banks", name: "Bank partners", stages: ["Identified", "Intro", "Discovery call", "Proposal", "Pilot", "Signed", "Parked"], won: "Signed", lost: "Parked" },
  { key: "investors", name: "Investors", stages: ["Researched", "Intro", "First meeting", "Diligence", "Committed", "Passed"], won: "Committed", lost: "Passed" },
  { key: "events", name: "Events and speakers", stages: ["Spotted", "Pitched", "Accepted", "Prepared", "Delivered", "Declined"], won: "Delivered", lost: "Declined" },
  { key: "blank", name: "Blank", stages: ["New", "In progress", "Done", "Parked"], won: "Done", lost: "Parked" },
];

export const DEFAULT_LOST_REASONS = ["Timing: budget next year", "No need right now", "Chose another vendor", "No reply after three touches", "Not the decision maker"];

/** Used before db/015 has run: one Outreach pipeline holding everyone. */
export const FALLBACK_PIPELINE: Pipeline = { id: "outreach", name: "Outreach", template: "outreach", stages: OUTREACH_STAGES, won_stage: "Won", lost_stage: "Parked", sort: 0 };

/** A name for a new pipeline from a template: "Investors", then "Investors 2", "Investors 3". */
export function newPipelineName(template: string, existing: string[]): string {
  const n = existing.filter((x) => x === template || x.startsWith(template + " ")).length;
  return n ? `${template} ${n + 1}` : template;
}

/** Same as map_outreach_stage in db/015: matched ignoring case and spaces, anything else becomes Target. */
export function mapStage(s: string | null | undefined): string {
  const k = (s ?? "").replace(/\s+/g, "").toLowerCase();
  return OUTREACH_STAGES.find((x) => x.replace(/ /g, "").toLowerCase() === k) ?? "Target";
}

// ---------- dates ----------
const dayMs = 864e5;
const noon = (s: string) => new Date(s.slice(0, 10) + "T12:00:00").getTime();
/** Whole days from a to b (positive when b is later). */
export const daysBetween = (a: string, b: string) => Math.round((noon(b) - noon(a)) / dayMs);
export const addDays = (s: string, n: number) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const fmtShort = (s: string) => new Date(s.slice(0, 10) + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** "3 days overdue", "1 day overdue", "Today", "Tomorrow", "Mon 9 Nov"; "No date" without one. */
export function dueText(due: string | null | undefined, today: string): string {
  if (!due) return "No date";
  const d = daysBetween(today, due);
  if (d < 0) return -d === 1 ? "1 day overdue" : `${-d} days overdue`;
  return d === 0 ? "Today" : d === 1 ? "Tomorrow" : fmtShort(due);
}
/** Longer form for the lead panel. */
export function dueLong(due: string | null | undefined, today: string): string {
  if (!due) return "No date set";
  const d = daysBetween(today, due);
  if (d < 0) return `${dueText(due, today)}, was due ${fmtShort(due)}`;
  return d === 0 ? "Due today" : d === 1 ? "Due tomorrow" : `Due ${fmtShort(due)}`;
}
export type DueTone = "overdue" | "today" | "later" | "none";
export function dueTone(due: string | null | undefined, today: string): DueTone {
  if (!due) return "none";
  return due < today ? "overdue" : due === today ? "today" : "later";
}

// ---------- stages ----------
export const isClosed = (p: Pipeline, stage: string) => stage === p.won_stage || stage === p.lost_stage;

/** The stage one step forward (d = 1) or back (d = -1). Forward never lands on the lost stage. */
export function stepStage(p: Pipeline, stage: string, d: 1 | -1): string | null {
  const i = p.stages.indexOf(stage);
  if (i < 0) return d > 0 ? p.stages[0] ?? null : null;
  const s = p.stages[i + d];
  if (!s) return null;
  if (d > 0 && s === p.lost_stage) return null;
  return s;
}

export type MoveInput = { to: string; action: string; date: string; reason: string };
/** Every change needs the next action and a due date; moving into the lost stage also needs a reason. */
export function moveGate(m: MoveInput, p: Pipeline, from: string): { ok: boolean; need: ("stage" | "action" | "date" | "reason")[]; needsReason: boolean } {
  const needsReason = m.to === p.lost_stage && m.to !== from;
  const need: ("stage" | "action" | "date" | "reason")[] = [];
  if (!p.stages.includes(m.to)) need.push("stage");
  if (!m.action.trim()) need.push("action");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date)) need.push("date");
  if (needsReason && !m.reason.trim()) need.push("reason");
  return { ok: need.length === 0, need, needsReason };
}

/** Days spent in each stage, from the stage history. Revisits add up; the current stage runs to now. */
export function daysPerStage(moves: Pick<StageMove, "kind" | "from_stage" | "to_stage" | "at">[], lead: Pick<Prospect, "stage" | "created_at" | "stage_changed_at">, now: string): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (s: string, a: string, b: string) => { if (!s) return; out[s] = (out[s] ?? 0) + Math.max(0, Math.floor((Date.parse(b) - Date.parse(a)) / dayMs)); };
  const ms = moves.filter((m) => m.kind !== "done").slice().sort((a, b) => a.at.localeCompare(b.at));
  if (!ms.length) { add(lead.stage, lead.stage_changed_at || lead.created_at, now); return out; }
  let held = ms[0].from_stage, since = lead.created_at;
  for (const m of ms) { if (held && since < m.at) add(held, since, m.at); held = m.to_stage; since = m.at; }
  // The stamp on the lead is the most reliable start for where they are now.
  add(lead.stage, held === lead.stage ? since : lead.stage_changed_at, now);
  return out;
}

export const daysIn = (lead: Pick<Prospect, "stage_changed_at" | "created_at">, now: string) => Math.max(0, Math.floor((Date.parse(now) - Date.parse(lead.stage_changed_at || lead.created_at)) / dayMs));

// ---------- heat ----------
export type HeatBand = "Hot" | "Warm" | "Cold";
/** warm: 1 connected, 2 talked before, 3 knows someone there, 0 none (the levels from Network's warm paths). */
export type HeatInput = { comments: number; replies: number; warm: 0 | 1 | 2 | 3; lastTouch: string | null };
export type Signal = { label: string; sub: string; pts: number };

/** Score 0 to 100 from your comments, their replies, the warm path and how recent the last touch was. */
export function heatOf(h: HeatInput, today: string): { score: number; band: HeatBand; signals: Signal[] } {
  const ago = h.lastTouch ? Math.max(0, daysBetween(h.lastTouch, today)) : null;
  const signals: Signal[] = [
    { label: "Your comments", sub: `${h.comments} on their posts`, pts: Math.min(h.comments * 8, 32) },
    { label: "Their replies", sub: h.replies ? `${h.replies} ${h.replies === 1 ? "reply" : "replies"} to you` : "no replies yet", pts: Math.min(h.replies * 12, 36) },
    { label: "Warm path", sub: h.warm === 1 ? "direct connection" : h.warm === 2 ? "you have talked before" : h.warm === 3 ? "you know someone there" : "none yet", pts: h.warm === 1 || h.warm === 2 ? 20 : h.warm === 3 ? 12 : 0 },
    { label: "Last touch", sub: ago == null ? "none yet" : ago === 0 ? "today" : ago === 1 ? "yesterday" : `${ago} days ago`, pts: ago == null ? 0 : ago <= 3 ? 12 : ago <= 10 ? 6 : 0 },
  ];
  const score = Math.min(100, signals.reduce((a, s) => a + s.pts, 0));
  return { score, band: score >= 70 ? "Hot" : score >= 40 ? "Warm" : "Cold", signals };
}

// ---------- Do next ----------
type Due = Pick<Prospect, "id" | "name" | "stage" | "next_date">;
/** Open leads due today or earlier, overdue first (oldest first), then today; at most n. */
export function doNext<T extends Due>(leads: T[], p: Pipeline, today: string, n = 5) {
  const open = leads.filter((l) => !isClosed(p, l.stage));
  const due = open.filter((l) => l.next_date && l.next_date <= today).sort((a, b) => a.next_date!.localeCompare(b.next_date!) || a.name.localeCompare(b.name));
  const upcoming = open.filter((l) => l.next_date && l.next_date > today).sort((a, b) => a.next_date!.localeCompare(b.next_date!))[0] ?? null;
  return { rows: due.slice(0, n), more: Math.max(0, due.length - n), overdue: due.filter((l) => l.next_date! < today).length, today: due.filter((l) => l.next_date === today).length, open: open.length, upcoming };
}

// ---------- touch plan and messages ----------
const PLAN: Record<string, string[]> = {
  "Target": ["Read their last five posts", "Comment on a recent post"],
  "Warming": ["Comment on a post (1 of 2)", "Comment on a post (2 of 2)", "Send the connection request with a short note"],
  "Requested": ["Check the request after three days", "If not accepted, comment once more"],
  "Connected": ["Send the first message within 48 hours", "Share one relevant resource"],
  "In conversation": ["Answer their question with a specific example", "Offer the resource or a short call"],
  "Resource sent": ["Follow up three days after the resource", "Ask for a 20-minute call"],
  "Call booked": ["Send the agenda the day before", "Log the call notes"],
};
/** The steps for a stage. Closed stages have none; stages outside Outreach get two general steps. */
export function planFor(p: Pipeline, stage: string): string[] {
  if (isClosed(p, stage)) return [];
  return PLAN[stage] ?? ["Send the recap of the last conversation", "Book the next step"];
}
/** The Today item key for one step, kept in daily_items.note. */
export const stepKey = (prospectId: string, stage: string, i: number) => `pipeline:${prospectId}:${stage}:${i}`;

/** What to ask the AI for, in Prax's voice rules. The reply is copied and sent by hand.
 *  who: the sender, whoLine of the profile in src/lib/persona.ts ("Name, Role at Company"). */
export function messagePrompt(l: Pick<Prospect, "name" | "role" | "company" | "why" | "notes">, stage: string, pipeline: string, who: string): string {
  return `Draft one short LinkedIn direct message from ${who} to ${l.name}${l.role ? `, ${l.role}` : ""}${l.company ? ` at ${l.company}` : ""}.
Pipeline: ${pipeline}. Stage: ${stage}. ${l.why ? `Why they fit: ${l.why}. ` : ""}${l.notes ? `Notes: ${l.notes.slice(0, 600)}. ` : ""}
Rules: under 70 words, plain and specific, no pitch, no em dashes, no contractions, no emoji, one clear ask that suits the stage. Return only the message text.`;
}
/** A plain fallback when the extension is not there. */
/** company: the profile's company, empty when unknown. */
export function templateMessage(l: Pick<Prospect, "name">, stage: string, company = ""): string {
  const f = l.name.split(/\s+/)[0] || l.name;
  if (stage === "Target" || stage === "Warming") return `Hi ${f}, I have been following your posts. We work on similar problems${company ? ` at ${company}` : ""}, and I would value being connected.`;
  if (stage === "Connected") return `Thanks for connecting, ${f}. Your recent point matched what we keep seeing in our own work. Happy to share a short note on how others handled it, if useful.`;
  if (stage === "In conversation") return `${f}, here is the short note I mentioned. Two pages, no pitch. Would a 20-minute call next week help?`;
  if (stage === "Resource sent") return `${f}, did the note help? If a 20-minute call would be useful, I can do Tuesday or Wednesday.`;
  return `${f}, following up on our last conversation. Is there a good time this week for a short call?`;
}

// ---------- grouping ----------
/** Companies with the most people first, then by name. Leads without a company sit under "No company". */
export function byCompany<T extends Pick<Prospect, "company">>(leads: T[]): { company: string; people: T[] }[] {
  const m = new Map<string, T[]>();
  for (const l of leads) { const k = l.company.trim() || "No company"; const a = m.get(k); if (a) a.push(l); else m.set(k, [l]); }
  return [...m.entries()].map(([company, people]) => ({ company, people })).sort((a, b) => b.people.length - a.people.length || a.company.localeCompare(b.company));
}

/** Average whole days in stage, or null for an empty group. */
export function avgDays(leads: Pick<Prospect, "stage_changed_at" | "created_at">[], now: string): number | null {
  return leads.length ? Math.round(leads.reduce((a, l) => a + daysIn(l, now), 0) / leads.length) : null;
}
