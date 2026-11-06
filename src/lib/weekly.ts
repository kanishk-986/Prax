// Weekly report (D10) and the profiles overview (D11): one aggregation of a Monday to Sunday week.
// What went out, who engaged, who moved stage, AI citations movement, Discovery's top topics and next week's
// plan, written as short plain sentences for an executive. Pure functions with no imports, so
// `node scripts/test-weekly.ts` can check them. src/lib/weekly-data.ts loads the rows.

export type WeekPost = { title: string; status: string; publish_date: string | null; format?: string };
export type WeekMove = { prospect_id: string; kind: string; from_stage: string; to_stage: string; at: string };
export type WeekLead = { id: string; name: string; company: string; stage: string; next_action: string; next_date: string | null };
export type WeekTopic = { title: string; rank: number | null; rising?: boolean };
export type WeekCitations = { now: number | null; prev: number | null; named: number; total: number; share28: number | null };

export type WeekInput = {
  week: string; today: string;
  /** First name of the profile, for the sentences. */
  name: string;
  commentTarget: number;
  posts: WeekPost[];
  /** Days (YYYY-MM-DD) of comment items ticked on Today, and of comments logged. */
  commentTicks: string[]; commentLogs: string[];
  /** Days of connection request items ticked on Today. */
  requestTicks: string[];
  moves: WeekMove[];
  leads: WeekLead[];
  /** When replies to logged comments came in (ISO), and when captured messages were received (ISO), with who sent them. */
  replies: string[];
  messages: { at: string; person: string; prospect_id?: string | null }[];
  /** Stages that count as a conversation, for "new conversations". */
  conversationStages: string[];
  closedStages: string[];
  citations: WeekCitations;
  topics: WeekTopic[];
  pillars: string[];
};

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const shift = (s: string, n: number) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return ymd(d); };
export const mondayOf = (s: string) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
/** The local day of an ISO time, or the date itself. */
export const dayOf = (iso: string) => (iso.length <= 10 ? iso : ymd(new Date(iso)));
const within = (day: string, from: string, to: string) => day >= from && day <= to;

const POSTED = ["Posted", "Published"];
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
/** "A", "A and B", "A, B and C". */
export function list(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
/** Per day, whichever is more of two counts (Today ticks and log rows), summed over the days given. */
export function perDayMax(a: string[], b: string[], from: string, to: string): number {
  const ca = new Map<string, number>(), cb = new Map<string, number>();
  a.filter((d) => within(d, from, to)).forEach((d) => ca.set(d, (ca.get(d) ?? 0) + 1));
  b.filter((d) => within(d, from, to)).forEach((d) => cb.set(d, (cb.get(d) ?? 0) + 1));
  let n = 0;
  new Set([...ca.keys(), ...cb.keys()]).forEach((d) => { n += Math.max(ca.get(d) ?? 0, cb.get(d) ?? 0); });
  return n;
}

export type Moved = { name: string; company: string; from: string; to: string; at: string };
export type WeekReport = {
  week: string; end: string; isCurrent: boolean;
  out: { posts: number; titles: string[]; comments: number; commentTarget: number; requests: number };
  engaged: { replies: number; messages: number; accepts: number };
  moved: Moved[];
  conversations: number; overdue: number;
  citations: WeekCitations & { change: number | null };
  topics: string[];
  next: { week: string; posts: { title: string; date: string }[]; followups: number; names: string[]; commentTarget: number; focus: string[] };
  /** The report as sentences, one per section, in order. */
  lines: { out: string; engaged: string; moved: string; citations: string; topics: string; next: string };
  summary: string;
};

export function weeklyReport(x: WeekInput): WeekReport {
  const wk = mondayOf(x.week), end = shift(wk, 6), nextWk = shift(wk, 7), nextEnd = shift(wk, 13);
  const n = x.name || "The profile";
  const posts = x.posts.filter((p) => POSTED.includes(p.status) && p.publish_date && within(p.publish_date, wk, end));
  const comments = perDayMax(x.commentTicks, x.commentLogs, wk, end);
  const movesIn = x.moves.filter((m) => m.kind === "move" && within(dayOf(m.at), wk, end));
  const requests = perDayMax(x.requestTicks, movesIn.filter((m) => m.to_stage === "Requested").map((m) => dayOf(m.at)), wk, end);
  const accepts = movesIn.filter((m) => m.to_stage === "Connected").length;
  const replies = x.replies.filter((r) => within(dayOf(r), wk, end)).length;
  const msgs = x.messages.filter((m) => within(dayOf(m.at), wk, end));

  // Latest move per person in the week, newest first.
  const lead = new Map(x.leads.map((l) => [l.id, l]));
  const last = new Map<string, WeekMove>(), first = new Map<string, WeekMove>();
  [...movesIn].sort((a, b) => a.at.localeCompare(b.at)).forEach((m) => { if (!first.has(m.prospect_id)) first.set(m.prospect_id, m); last.set(m.prospect_id, m); });
  const moved: Moved[] = [...last.values()].filter((m) => lead.has(m.prospect_id)).map((m) => {
    const l = lead.get(m.prospect_id)!;
    return { name: l.name, company: l.company, from: first.get(m.prospect_id)!.from_stage, to: m.to_stage, at: m.at };
  }).filter((m) => m.from !== m.to).sort((a, b) => b.at.localeCompare(a.at));

  // New conversations: people who moved into a conversation stage, or sent a captured message, this week.
  const talk = new Set<string>();
  movesIn.filter((m) => x.conversationStages.includes(m.to_stage) && !x.conversationStages.includes(m.from_stage)).forEach((m) => talk.add("p:" + m.prospect_id));
  msgs.forEach((m) => talk.add(m.prospect_id ? "p:" + m.prospect_id : "n:" + m.person.trim().toLowerCase()));
  // Overdue is the state today: past weeks do not keep their old due dates.
  const overdue = x.leads.filter((l) => l.next_date && l.next_date < x.today && !x.closedStages.includes(l.stage)).length;

  const change = x.citations.now != null && x.citations.prev != null ? x.citations.now - x.citations.prev : null;
  const topics = x.topics.filter((t) => t.rank != null).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).slice(0, 3).map((t) => t.title);

  const nextPosts = x.posts.filter((p) => p.publish_date && within(p.publish_date, nextWk, nextEnd) && !POSTED.includes(p.status) && p.status !== "On hold")
    .sort((a, b) => a.publish_date!.localeCompare(b.publish_date!)).map((p) => ({ title: p.title || "Untitled post", date: p.publish_date! }));
  // Follow-ups for next week: due in that week, plus anything already overdue that will still need doing.
  const due = x.leads.filter((l) => l.next_date && l.next_date <= nextEnd && !x.closedStages.includes(l.stage)).sort((a, b) => a.next_date!.localeCompare(b.next_date!));
  const focus = x.pillars.filter(Boolean).slice(0, 3);

  // ---------- sentences ----------
  const outLine = !posts.length && !comments && !requests ? `Nothing went out from ${n} this week.`
    : `${n} published ${posts.length ? plural(posts.length, "post") : "no posts"} and left ${plural(comments, "comment")}${x.commentTarget ? ` against a target of ${x.commentTarget}` : ""}. ${requests ? `${plural(requests, "connection request")} went out.` : "No connection requests went out."}`;
  const engaged: string[] = [];
  if (replies) engaged.push(`${plural(replies, "person", "people")} replied to comments`);
  if (msgs.length) engaged.push(`${plural(msgs.length, "message")} came in`);
  if (accepts) engaged.push(`${plural(accepts, "request")} ${accepts === 1 ? "was" : "were"} accepted`);
  const engagedLine = engaged.length ? cap(list(engaged)) + "." : "No replies, messages or accepted requests were recorded this week.";
  const movedLine = !moved.length ? "Nobody moved stage this week."
    : `${plural(moved.length, "person", "people")} moved stage: ${list([...moved.slice(0, 4).map((m) => `${m.name} to ${m.to}`), ...(moved.length > 4 ? [plural(moved.length - 4, "other")] : [])])}.`;
  const c = x.citations;
  const citLine = c.now == null ? (c.share28 == null ? "AI citations were not run this week." : `AI citations were not run this week. Over the last 28 days AI answers named ${n} in ${c.share28}% of prompts.`)
    : `AI answers named ${n} in ${c.now}% of prompts this week${change == null ? "" : change === 0 ? ", the same as last week" : `, ${change > 0 ? "up" : "down"} ${plural(Math.abs(change), "point")} on last week`}.`;
  const topicLine = topics.length ? `Discovery's top ${topics.length === 1 ? "topic was" : "topics were"} ${list(topics)}.` : "Discovery had no Digest this week.";
  const nextParts: string[] = [];
  nextParts.push(nextPosts.length ? `${plural(nextPosts.length, "post")} planned` : "no posts planned yet");
  nextParts.push(due.length ? `${plural(due.length, "follow-up")} due` : "no follow-ups due");
  if (x.commentTarget) nextParts.push(`a target of ${plural(x.commentTarget, "comment")}`);
  const nextLine = `Next week has ${list(nextParts)}.${focus.length ? ` The focus stays on ${list(focus)}.` : ""}`;

  const summary = [outLine.split(". ")[0].replace(/\.$/, "") + ".", engaged.length ? engagedLine : "", c.now != null ? citLine : ""].filter(Boolean).join(" ");

  return {
    week: wk, end, isCurrent: within(x.today, wk, end),
    out: { posts: posts.length, titles: posts.map((p) => p.title), comments, commentTarget: x.commentTarget, requests },
    engaged: { replies, messages: msgs.length, accepts },
    moved, conversations: talk.size, overdue,
    citations: { ...c, change }, topics,
    next: { week: nextWk, posts: nextPosts, followups: due.length, names: due.slice(0, 5).map((l) => l.name), commentTarget: x.commentTarget, focus },
    lines: { out: outLine, engaged: engagedLine, moved: movedLine, citations: citLine, topics: topicLine, next: nextLine },
    summary,
  };
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The compact numbers one profile shows on the profiles page. */
export type OverviewRow = { comments: number; commentTarget: number; posts: number; conversations: number; overdue: number; citations: number | null };
export function overviewOf(r: WeekReport): OverviewRow {
  return { comments: r.out.comments, commentTarget: r.out.commentTarget, posts: r.out.posts, conversations: r.conversations, overdue: r.overdue,
    citations: r.citations.now ?? r.citations.share28 };
}

/** "3 to 9 Nov 2026" or "27 Oct to 2 Nov 2026". */
export function weekRange(week: string): string {
  const a = new Date(week + "T12:00:00"), b = new Date(shift(week, 6) + "T12:00:00");
  const sameMonth = a.getMonth() === b.getMonth();
  const left = a.toLocaleDateString("en-GB", sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" });
  return `${left} to ${b.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}
