// Dashboard and Today maths: progress, skips, week-over-week deltas, the agenda grouping, and the ranking of
// "Needs you now". Pure functions with no imports, so scripts/test-dashboard.ts can check them in Node.

// ---------- dates (local calendar days, YYYY-MM-DD) ----------
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const plusDays = (s: string, n: number) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return ymd(d); };
export const mondayOf = (s: string) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
/** Whole days from a to b (b later is positive). */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00") - Date.parse(a + "T12:00:00")) / 864e5);

// ---------- progress and skips ----------
/** A skipped item keeps its note behind this prefix, so un-skipping restores it exactly. */
export const SKIP = "skip:";
export const isSkipped = (note: string | null | undefined) => (note ?? "").startsWith(SKIP);
export const skipNote = (note: string | null | undefined) => (isSkipped(note) ? (note as string) : SKIP + (note ?? ""));
export const unskipNote = (note: string | null | undefined) => (isSkipped(note) ? (note as string).slice(SKIP.length) : note ?? "");

export type Progress = { done: number; skipped: number; total: number; left: number; pct: number; state: "empty" | "open" | "complete" };
/** Done and skipped both clear an item off the day; only done counts as done. pct is the share cleared. */
export function progressOf(items: { done: boolean; note?: string | null }[]): Progress {
  const total = items.length;
  const done = items.filter((i) => i.done).length;
  const skipped = items.filter((i) => !i.done && isSkipped(i.note)).length;
  const left = total - done - skipped;
  const pct = total ? Math.round(((done + skipped) / total) * 100) : 0;
  return { done, skipped, total, left, pct, state: total === 0 ? "empty" : left === 0 ? "complete" : "open" };
}

// ---------- deltas ----------
export type Delta = { diff: number; dir: "up" | "down" | "flat"; text: string };
/** Change from prev to now; null when either side is unknown. Uses a true minus sign, never a dash. */
export function deltaOf(now: number | null | undefined, prev: number | null | undefined): Delta | null {
  if (now == null || prev == null || Number.isNaN(now) || Number.isNaN(prev)) return null;
  const diff = now - prev;
  return { diff, dir: diff > 0 ? "up" : diff < 0 ? "down" : "flat", text: diff > 0 ? `+${diff}` : diff < 0 ? `−${Math.abs(diff)}` : "No change" };
}

/** This week Monday to today against last week Monday to the same weekday, so a part week is compared fairly. */
export function weekOverWeek(dates: (string | null | undefined)[], today: string): { now: number; prev: number } {
  const wk = mondayOf(today);
  const span = daysBetween(wk, today);
  const lastWk = plusDays(wk, -7), lastEnd = plusDays(lastWk, span);
  let now = 0, prev = 0;
  for (const raw of dates) {
    if (!raw) continue;
    const d = raw.slice(0, 10);
    if (d >= wk && d <= today) now++;
    else if (d >= lastWk && d <= lastEnd) prev++;
  }
  return { now, prev };
}

/** Counts per day for the n days ending today, oldest first. */
export function dailySeries(dates: (string | null | undefined)[], today: string, n = 14): number[] {
  const out = Array.from({ length: n }, () => 0);
  const first = plusDays(today, -(n - 1));
  for (const raw of dates) {
    if (!raw) continue;
    const i = daysBetween(first, raw.slice(0, 10));
    if (i >= 0 && i < n) out[i]++;
  }
  return out;
}

// ---------- count-up ----------
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
/** The value a count-up shows after elapsed ms; lands exactly on target. */
export function countAt(target: number, elapsed: number, duration = 450): number {
  if (duration <= 0 || elapsed >= duration) return target;
  return Math.round(target * easeOut(Math.max(0, elapsed) / duration));
}
/** Same easing between two values, for numbers that change after first view (a task cleared). */
export function countBetween(from: number, to: number, elapsed: number, duration = 300): number {
  if (duration <= 0 || elapsed >= duration) return to;
  return Math.round(from + (to - from) * easeOut(Math.max(0, elapsed) / duration));
}

// ---------- AI citations headline ----------
/** Change between two shares in percentage points; null when either week has no answers. */
export function pointsDelta(now: number | null | undefined, prev: number | null | undefined): Delta | null {
  const d = deltaOf(now, prev);
  if (!d) return null;
  return { ...d, text: d.dir === "flat" ? "No change" : `${d.text} pts` };
}

// ---------- Today agenda ----------
export type GroupKey = "comment" | "post" | "followup" | "connect" | "other";
export const GROUPS: { key: GroupKey; label: string; hint: string }[] = [
  { key: "comment", label: "Comment", hint: "Comments on other posts, and replies on his own" },
  { key: "post", label: "Post", hint: "Approvals and posts going out" },
  { key: "followup", label: "Follow up", hint: "Messages and notes to people already in touch" },
  { key: "connect", label: "Connect", hint: "Connection requests, after two comments on their posts" },
  { key: "other", label: "Other", hint: "One-off tasks for this day" },
];
type AgendaItem = { kind: string; idx: number };

/** Campaign items are kind custom in fixed index bands (see src/lib/campaigns.ts): 2000s comments, 3000 approval,
 *  3100 fast response, 3200s event follow-ups, 4000s messages. 3600 is the weekly AI citation run. */
export function groupOf(it: AgendaItem): GroupKey {
  switch (it.kind) {
    case "comment": case "reply": return "comment";
    case "post": return "post";
    case "dm": case "inmail": return "followup";
    case "request": return "connect";
  }
  if (it.idx >= 2000 && it.idx < 3000) return "comment";
  if (it.idx >= 3000 && it.idx < 3200) return "post";
  if ((it.idx >= 3200 && it.idx < 3300) || (it.idx >= 4000 && it.idx < 5000)) return "followup";
  return "other";
}

export function typeLabel(it: AgendaItem): string {
  const k: Record<string, string> = { comment: "Comment", reply: "Replies", request: "Request", dm: "Message", inmail: "InMail", post: "Post" };
  if (k[it.kind]) return k[it.kind];
  if (it.idx >= 2000 && it.idx < 3000) return "Comment";
  if (it.idx === 3000) return "Approval";
  if (it.idx >= 3100 && it.idx < 3200) return "Fast take";
  if (it.idx >= 3200 && it.idx < 3300) return "Follow up";
  if (it.idx === 3600) return "AI citations";
  if (it.idx >= 4000 && it.idx < 5000) return "Message";
  return "Task";
}

const KIND_ORDER = ["comment", "reply", "post", "dm", "inmail", "request", "custom"];
/** Groups in a fixed order (Comment, Post, Follow up, Connect, Other); quota kinds before campaign tasks, then by index. Empty groups are left out. */
export function agenda<T extends AgendaItem>(items: T[]): { key: GroupKey; label: string; hint: string; items: T[] }[] {
  const rank = (k: string) => { const i = KIND_ORDER.indexOf(k); return i < 0 ? KIND_ORDER.length : i; };
  return GROUPS.map((g) => ({ ...g, items: items.filter((i) => groupOf(i) === g.key).sort((a, b) => rank(a.kind) - rank(b.kind) || a.idx - b.idx) })).filter((g) => g.items.length);
}

/** Open items first, then cleared ones (done or skipped), each keeping its order. Ids in `holding` were just
 *  cleared and stay where they are for a moment, so the tick shows before the row settles to the bottom. */
export function settleOrder<T extends { id: string; done: boolean; note?: string | null }>(items: T[], holding: Set<string> = new Set()): T[] {
  const cleared = (i: T) => (i.done || isSkipped(i.note)) && !holding.has(i.id);
  return [...items.filter((i) => !cleared(i)), ...items.filter(cleared)];
}

/** The one button a row offers. A saved link wins; otherwise where the work is done. Never posts or sends anything. */
export function primaryAction(it: AgendaItem & { link?: string | null }, slug: string): { label: string; href: string; external: boolean } | null {
  const link = (it.link ?? "").trim();
  if (link && (link.startsWith("/") || /^https?:\/\//i.test(link))) return { label: "Open", href: link, external: !link.startsWith("/") };
  if (it.kind === "comment" || it.kind === "reply") return { label: "Open LinkedIn", href: "https://www.linkedin.com/feed/", external: true };
  if (it.kind === "request") return { label: "Who next", href: `/w/${slug}/pipeline`, external: false };
  if (it.kind === "dm" || it.kind === "inmail") return { label: "Pipeline", href: `/w/${slug}/pipeline`, external: false };
  return null;
}

// ---------- one weekly comment count ----------
/** Comments are counted once, the same way on the Dashboard and on Engagement: per day, the larger of the comment
 *  ticks on Today and the comments logged (by the extension or by hand), so a comment that was logged and ticked
 *  counts once, and one that was only ticked or only logged still counts. Returns one date per comment. */
export function commentDays(ticks: (string | null | undefined)[], logged: (string | null | undefined)[]): string[] {
  const per = (xs: (string | null | undefined)[]) => xs.reduce((m, d) => { if (d) { const k = d.slice(0, 10); m.set(k, (m.get(k) ?? 0) + 1); } return m; }, new Map<string, number>());
  const a = per(ticks), b = per(logged);
  return [...new Set([...a.keys(), ...b.keys()])].sort().flatMap((d) => Array.from({ length: Math.max(a.get(d) ?? 0, b.get(d) ?? 0) }, () => d));
}
/** The weekly comment target: the daily quota for five working days. */
export const weeklyCommentTarget = (dailyQuota: number) => Math.max(0, dailyQuota || 0) * 5;

// ---------- Today prefill ----------
export type PrefillLead = { id: string; name: string; company: string; stage: string; next_action: string; next_date: string | null; linkedin: string };
export type PrefillFinding = { id: string; title: string; url: string; source_type: string; status: string; comment_target: boolean; found_at: string; found?: { linkedin?: { author?: string } } };
export type PrefillPost = { id: string; title: string; status: string; publish_date: string | null; url: string };
/** why: the strategy rule behind the suggestion ("From strategy: <rule>" on the row), when one shaped it. */
export type Suggestion = { title: string; href: string; external: boolean; prospect_id: string | null; why?: string };

const STAGE_KINDS: Record<string, string[]> = {
  comment: ["Target", "Warming"],
  request: ["Warming", "Target"],
  dm: ["Connected", "In conversation", "Resource sent", "Call booked"],
  inmail: ["Target", "Warming"],
};
const withWhy = (w: string | undefined) => (w ? { why: w } : {});
const posessive = (n: string) => (n.endsWith("s") ? `${n}'` : `${n}'s`);
const profileActivity = (url: string) => (url ? `${url.replace(/\/+$/, "")}/recent-activity/all/` : "https://www.linkedin.com/feed/");

/** Real people and posts for the empty rows of a day, in Pipeline's Do next order (overdue, then today, then the
 *  nearest dates), then Discovery's LinkedIn findings for comments. Messages go to people already connected,
 *  comments to Target and Warming people, requests to whoever is left. Each person is used once per day, a row that
 *  already has a title or a person keeps it, and cleared rows are left alone. Returns a suggestion per item id;
 *  rows without one keep the "who or what" placeholder. Nothing here posts or sends. */
export function prefillToday(
  items: { id: string; kind: string; idx: number; title: string; done: boolean; note?: string | null; prospect_id?: string | null }[],
  src: { leads: PrefillLead[]; findings?: PrefillFinding[]; posts?: PrefillPost[]; slug: string; today: string; closed?: string[];
    /** The strategy (src/lib/strategy.ts): a lead's rank (rule-raised and segment weight, higher first) breaks date ties
     *  and orders leads without a date; advice gives the connection note template a rule picked for a lead. */
    rank?: (l: PrefillLead) => number; advice?: (l: PrefillLead) => { template?: { name: string; rule: string }; priority?: { rule: string } } | null },
): Record<string, Suggestion> {
  const closed = new Set(src.closed ?? ["Won", "Parked"]);
  const rank = src.rank ?? (() => 0);
  const order = (a: PrefillLead, b: PrefillLead) => (a.next_date ?? "9999").localeCompare(b.next_date ?? "9999") || rank(b) - rank(a) || a.name.localeCompare(b.name);
  const open = src.leads.filter((l) => !closed.has(l.stage) && l.name.trim()).sort(order);
  const why = (l: PrefillLead, kind: string) => { const a = src.advice?.(l); return kind === "request" && a?.template ? a.template.rule : a?.priority?.rule; };
  const used = new Set(items.map((i) => i.prospect_id).filter(Boolean) as string[]);
  const usedFindings = new Set<string>();
  const out: Record<string, Suggestion> = {};
  const findings = (src.findings ?? []).filter((f) => f.status !== "dismissed" && f.url && (f.comment_target || f.source_type === "LinkedIn") && daysBetween(f.found_at.slice(0, 10), src.today) <= 7)
    .sort((a, b) => Number(b.comment_target) - Number(a.comment_target) || b.found_at.localeCompare(a.found_at));
  const replies = (src.posts ?? []).filter((p) => (p.status === "Posted" || p.status === "Published") && p.publish_date && p.publish_date <= src.today && daysBetween(p.publish_date, src.today) <= 7)
    .sort((a, b) => (b.publish_date ?? "").localeCompare(a.publish_date ?? ""));
  let reply = 0;
  const pick = (kind: string) => { const l = open.find((x) => !used.has(x.id) && (STAGE_KINDS[kind] ?? []).includes(x.stage)); if (l) used.add(l.id); return l; };
  // People in conversation are followed up first, then comments warm the next people, then requests take who is left.
  const KIND_FILL = ["dm", "comment", "request", "inmail", "reply"];
  const slots = items.filter((i) => KIND_FILL.includes(i.kind)).sort((a, b) => KIND_FILL.indexOf(a.kind) - KIND_FILL.indexOf(b.kind) || a.idx - b.idx);
  for (const it of slots) {
    if (it.done || isSkipped(it.note) || it.title.trim() || it.prospect_id) continue;
    if (it.kind === "comment") {
      const l = pick("comment");
      if (l) { out[it.id] = { title: l.next_action && /comment/i.test(l.next_action) ? `${l.name}: ${l.next_action}` : `Comment on ${posessive(l.name)} latest post`, href: profileActivity(l.linkedin), external: true, prospect_id: l.id, ...withWhy(why(l, "comment")) }; continue; }
      const f = findings.find((x) => !usedFindings.has(x.id));
      if (f) { usedFindings.add(f.id); const a = f.found?.linkedin?.author; out[it.id] = { title: a ? `Comment on ${posessive(a)} post: ${f.title}` : `Comment on: ${f.title}`, href: f.url, external: true, prospect_id: null }; }
    } else if (it.kind === "request") {
      const l = pick("request");
      const tpl = l ? src.advice?.(l)?.template : undefined;
      if (l) out[it.id] = { title: `Send ${l.name}${l.company ? `, ${l.company},` : ""} a connection request${tpl ? ` with the "${tpl.name}" note` : ""}`, href: l.linkedin || `/w/${src.slug}/pipeline?p=${l.id}`, external: !!l.linkedin, prospect_id: l.id, ...withWhy(why(l, "request")) };
    } else if (it.kind === "dm" || it.kind === "inmail") {
      const l = pick(it.kind);
      if (l) out[it.id] = { title: `${it.kind === "inmail" ? "InMail" : "Message"} ${l.name}${l.next_action ? `: ${l.next_action}` : ""}`, href: `/w/${src.slug}/pipeline?p=${l.id}`, external: false, prospect_id: l.id, ...withWhy(why(l, it.kind)) };
    } else if (it.kind === "reply") {
      const p = replies[reply++];
      if (p) out[it.id] = { title: `Reply to the comments on "${p.title}"`, href: p.url || `/w/${src.slug}/studio-content?tab=library`, external: !!p.url, prospect_id: null };
    }
  }
  return out;
}

/** A Prax address as the page name ("/w/x/citations" is "AI citations"); other links stay as they are. */
export function pageName(link: string | null | undefined, slug: string, nav: { href: string; label: string }[]): string {
  const l = (link ?? "").trim();
  const base = `/w/${slug}`;
  if (!l.startsWith(base)) return l;
  const path = l.slice(base.length).split(/[?#]/)[0].replace(/\/+$/, "");
  const hit = [...nav].sort((a, b) => b.href.length - a.href.length).find((n) => (n.href === "" ? path === "" : path === n.href || path.startsWith(n.href + "/")));
  return hit ? hit.label : l;
}

// ---------- Needs you now ----------
export type NeedKind = "followup" | "post" | "approval" | "today" | "discovery" | "citations" | "warming" | "network";
export type NeedInput = { kind: NeedKind; due?: string | null; count?: number };

/** Higher is more urgent. Overdue follow-ups and posts lead and grow with age; housekeeping sits at the bottom. */
export function urgency(n: NeedInput, today: string): number {
  const late = n.due ? daysBetween(n.due, today) : 0; // positive when overdue
  switch (n.kind) {
    case "followup": return late > 0 ? 100 + Math.min(late, 30) * 2 : late === 0 ? 80 : 50 - Math.min(-late, 20);
    case "post": return late > 0 ? 105 + Math.min(late, 30) : 92 + late * 6; // due today 92, tomorrow 86, in two days 80
    case "approval": return 88;
    case "today": return 72;
    case "discovery": return 45;
    case "citations": return 40;
    case "warming": return 30;
    case "network": return 20;
  }
}

/** Sorted most urgent first; ties go to the earlier due date, then to the input order. */
export function rankNeeds<T extends NeedInput>(items: T[], today: string): (T & { score: number })[] {
  return items.map((n, i) => ({ n: { ...n, score: urgency(n, today) }, i }))
    .sort((a, b) => b.n.score - a.n.score || (a.n.due ?? "9999").localeCompare(b.n.due ?? "9999") || a.i - b.i)
    .map((x) => x.n);
}

/** "3 days overdue", "Today", "Tomorrow", "In 4 days"; empty without a date. */
export function whenLabel(due: string | null | undefined, today: string): string {
  if (!due) return "";
  const d = daysBetween(today, due);
  if (d < 0) return `${-d} day${d === -1 ? "" : "s"} overdue`;
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  return `In ${d} days`;
}

// ---------- copy ----------
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
/** One honest sentence about the week for the Dashboard header. */
export function weekSentence(s: { comments: number; commentTarget: number; posted: number; planned: number; overdue: number; conversations: number }): string {
  const parts = [
    s.commentTarget ? `${s.comments} of ${s.commentTarget} comments` : plural(s.comments, "comment"),
    s.planned ? `${s.posted} of ${s.planned} planned posts out` : s.posted ? `${plural(s.posted, "post")} out` : "no posts planned",
    s.overdue ? `${plural(s.overdue, "follow-up")} overdue` : "no follow-ups overdue",
  ];
  return `This week: ${parts.join(", ")}. ${s.conversations ? `${plural(s.conversations, "person", "people")} in conversation.` : "Nobody in conversation yet."}`;
}

/** Short time for activity rows: "Just now", "12m", "3h", "Yesterday", or "3 Nov". */
export function relTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const m = Math.floor((now - t) / 6e4);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const a = new Date(t), b = new Date(now);
  const sameDay = a.toDateString() === b.toDateString();
  if (sameDay) return `${h}h`;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (a.toDateString() === y.toDateString()) return "Yesterday";
  return a.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Live activity without repeats: back-to-back rows of the same kind and the same action ("Comment done", or
 *  "Connection request done" before the colon) become one row with a count. The parts after the colon, when they
 *  differ, become the detail ("Igor Pesin, Prajit Nanu"). Pipeline moves only merge when they are identical.
 *  Order and the newest row's time are kept. */
export function collapseActivity<T extends { kind: string; text: string }>(rows: T[]): (T & { count: number; detail?: string })[] {
  const split = (t: string) => { const i = t.indexOf(": "); return i < 0 ? [t, ""] : [t.slice(0, i), t.slice(i + 2)]; };
  const out: { row: T; count: number; tails: string[] }[] = [];
  for (const r of rows) {
    const [head, tail] = split(r.text);
    const last = out[out.length - 1];
    if (last && last.row.kind === r.kind && split(last.row.text)[0] === head && (r.kind !== "stage" || last.row.text === r.text)) {
      last.count++;
      if (tail && !last.tails.includes(tail)) last.tails.push(tail);
      continue;
    }
    out.push({ row: r, count: 1, tails: tail ? [tail] : [] });
  }
  return out.map(({ row, count, tails }) => count === 1 ? { ...row, count }
    : { ...row, count, text: row.kind === "stage" ? row.text : split(row.text)[0], ...(tails.length && row.kind !== "stage" ? { detail: tails.join(", ") } : {}) });
}

/** First name for greetings: the member's own profile name, else a readable email name ("kanishk.raj" gives
 *  "Kanishk"), else nothing. */
export function firstName(name: string | null | undefined, email: string | null | undefined): string {
  const n = (name ?? "").trim().split(/\s+/)[0];
  if (n) return n;
  const local = (email ?? "").split("@")[0].split(/[._\-+0-9]/)[0];
  return /^[a-z]{2,}$/i.test(local) ? local[0].toUpperCase() + local.slice(1).toLowerCase() : "";
}

/** "Good morning, Alok" before noon, afternoon until five, then evening. Without a name: "Good morning". */
export function greeting(hour: number, name: string): string {
  return `Good ${hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"}${name ? `, ${name}` : ""}`;
}
