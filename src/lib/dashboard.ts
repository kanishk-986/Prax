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

/** The one button a row offers. A saved link wins; otherwise where the work is done. Never posts or sends anything. */
export function primaryAction(it: AgendaItem & { link?: string | null }, slug: string): { label: string; href: string; external: boolean } | null {
  const link = (it.link ?? "").trim();
  if (link && (link.startsWith("/") || /^https?:\/\//i.test(link))) return { label: "Open", href: link, external: !link.startsWith("/") };
  if (it.kind === "comment" || it.kind === "reply") return { label: "Open LinkedIn", href: "https://www.linkedin.com/feed/", external: true };
  if (it.kind === "request") return { label: "Who next", href: `/w/${slug}/pipeline`, external: false };
  if (it.kind === "dm" || it.kind === "inmail") return { label: "Pipeline", href: `/w/${slug}/pipeline`, external: false };
  return null;
}

// ---------- Needs you now ----------
export type NeedKind = "followup" | "post" | "approval" | "today" | "citations" | "warming" | "network";
export type NeedInput = { kind: NeedKind; due?: string | null; count?: number };

/** Higher is more urgent. Overdue follow-ups and posts lead and grow with age; housekeeping sits at the bottom. */
export function urgency(n: NeedInput, today: string): number {
  const late = n.due ? daysBetween(n.due, today) : 0; // positive when overdue
  switch (n.kind) {
    case "followup": return late > 0 ? 100 + Math.min(late, 30) * 2 : late === 0 ? 80 : 50 - Math.min(-late, 20);
    case "post": return late > 0 ? 105 + Math.min(late, 30) : 92 + late * 6; // due today 92, tomorrow 86, in two days 80
    case "approval": return 88;
    case "today": return 72;
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
