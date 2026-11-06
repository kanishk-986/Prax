// The Monday review (I2): last week in three sentences, what worked, what did not, who moved, and next week's plan
// with checkboxes, prefilled from Content Studio's plan, Pipeline follow-ups and the active strategy. Saved per week in
// weekly_reviews (db/027_replies_review.sql). The sentences are in words and names, not the Dashboard's tiles again.
// Pure functions with no imports, so `node scripts/test-review.ts` can check them. The page loads the rows.

export type ReviewPost = { title: string; status: string; publish_date: string | null; format?: string; pillar?: string;
  impressions?: number | null; reactions?: number | null; comments?: number | null; reposts?: number | null };
export type ReviewLog = { day: string; mode: string; reply: boolean };
export type ReviewReply = { person: string; prospect_id: string | null; seen_at: string };
export type ReviewLead = { id: string; name: string; company: string; stage: string; next_action: string; next_date: string | null };
export type ReviewMove = { name: string; company: string; from: string; to: string; at: string };
/** The best group of each kind from What works (src/lib/content.ts), or null while there are too few results. */
export type ReviewWorks = { format?: string; pillar?: string; day?: string } | null;
export type PlanItem = { id: string; text: string; source: "Content Studio" | "Pipeline" | "Strategy" | "Last week" | "Added"; href?: string; done: boolean };
export type ReviewStrategy = { comments_week?: number | null; actions: { id: string; title: string }[]; ppw?: number | null };

export type ReviewInput = {
  week: string; today: string; name: string;
  posts: ReviewPost[];
  logs: ReviewLog[];
  replies: ReviewReply[];
  moves: ReviewMove[];
  leads: ReviewLead[];
  closedStages: string[];
  commentTarget: number;
  comments: number;
  works: ReviewWorks;
  /** The plan saved in the previous week's review, with its ticks. */
  lastPlan: PlanItem[] | null;
  strategy: ReviewStrategy;
  pillars: string[];
  slug: string;
};
export type Review = { sentences: [string, string, string]; worked: string[]; didnt: string[]; moves: ReviewMove[]; plan: PlanItem[] };

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shift = (s: string, n: number) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return ymd(d); };
const within = (d: string | null | undefined, a: string, b: string) => !!d && d.slice(0, 10) >= a && d.slice(0, 10) <= b;
const POSTED = ["Posted", "Published"];
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
/** Small counts in words ("two"), larger ones in digits. */
export const inWords = (n: number) => (n >= 0 && n < WORDS.length ? WORDS[n] : String(n));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export function list(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
const names = (xs: string[], max = 3) => { const u = [...new Set(xs.filter(Boolean))]; return u.length > max ? list([...u.slice(0, max), `${inWords(u.length - max)} ${u.length - max === 1 ? "other" : "others"}`]) : list(u); };
/** Reactions, plus comments twice and reposts three times, as What works counts them. */
export const postScore = (p: ReviewPost) => (p.reactions ?? 0) + 2 * (p.comments ?? 0) + 3 * (p.reposts ?? 0);
const hasResults = (p: ReviewPost) => [p.impressions, p.reactions, p.comments, p.reposts].some((x) => x != null);
const day = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const q = (t: string) => `"${t || "Untitled post"}"`;

export function buildReview(x: ReviewInput): Review {
  const wk = x.week, end = shift(wk, 6), nextWk = shift(wk, 7), nextEnd = shift(wk, 13);
  const planned = x.posts.filter((p) => within(p.publish_date, wk, end) && p.status !== "On hold");
  const posted = planned.filter((p) => POSTED.includes(p.status));
  const missed = planned.filter((p) => !POSTED.includes(p.status));
  const measured = posted.filter(hasResults).sort((a, b) => postScore(b) - postScore(a));
  const logs = x.logs.filter((l) => within(l.day, wk, end));
  const replies = x.replies.filter((r) => within(r.seen_at, wk, end));
  const moves = x.moves;
  const slipped = x.leads.filter((l) => within(l.next_date, wk, end) && l.next_date! < x.today && !x.closedStages.includes(l.stage));
  const modes = Object.entries(logs.reduce((m: Record<string, { n: number; r: number }>, l) => { const k = l.mode || ""; if (!k) return m; (m[k] ||= { n: 0, r: 0 }).n++; if (l.reply) m[k].r++; return m; }, {}));
  const bestMode = modes.filter(([, v]) => v.r > 0).sort((a, b) => b[1].r / b[1].n - a[1].r / a[1].n || b[1].r - a[1].r)[0];
  const quietModes = modes.filter(([, v]) => v.n >= 3 && v.r === 0).map(([k]) => k);
  const ratio = x.commentTarget ? x.comments / x.commentTarget : null;

  // ---------- three sentences ----------
  const out: string[] = [];
  if (planned.length) out.push(posted.length === planned.length ? `Every planned post went out` : posted.length ? `${cap(inWords(posted.length))} of the ${inWords(planned.length)} planned posts went out` : "None of the planned posts went out");
  else if (posted.length) out.push(`${cap(inWords(posted.length))} ${posted.length === 1 ? "post" : "posts"} went out without a plan`);
  else out.push("No posts went out");
  out.push(ratio == null ? (x.comments ? "comments kept going" : "no comments were left")
    : ratio >= 1 ? "comments met the weekly target" : ratio >= 0.7 ? "comments came close to the weekly target" : x.comments ? "comments fell short of the weekly target" : "no comments were left");
  const s1 = `${out[0]}, and ${out[1]}.`;

  const replied = names(replies.map((r) => r.person));
  const forward = moves.slice(0, 3).map((m) => `${m.name} moved to ${m.to}`);
  const s2 = replied && forward.length ? `${replied} replied, and ${list(forward)}.`
    : replied ? `${replied} replied, but nobody moved stage.`
    : forward.length ? `Nobody replied, but ${list(forward)}.`
    : "Nobody replied or moved stage, so the work has not turned into conversations yet.";

  const best = measured[0];
  const s3 = best ? `The strongest post was ${q(best.title)}${best.format ? `, a ${best.format.toLowerCase()}` : ""}${best.pillar ? ` on ${best.pillar}` : ""}.`
    : slipped.length ? `${cap(inWords(slipped.length))} ${slipped.length === 1 ? "follow-up slipped" : "follow-ups slipped"} past ${slipped.length === 1 ? "its" : "their"} date.`
    : bestMode ? `${bestMode[0]} comments earned the most replies.`
    : `There are no post results for the week yet, so there is little to learn from beyond what went out.`;

  // ---------- what worked ----------
  const worked: string[] = [];
  if (best) {
    const rate = best.impressions ? Math.round(((best.reactions ?? 0) + (best.comments ?? 0) + (best.reposts ?? 0)) / best.impressions * 1000) / 10 : null;
    worked.push(`${q(best.title)} drew the most response${rate != null ? `, ${rate} interactions per 100 impressions` : ""}.`);
  }
  if (bestMode) worked.push(`${bestMode[0]} comments earned replies (${bestMode[1].r} of ${bestMode[1].n}).`);
  const leadReplies = names(replies.filter((r) => r.prospect_id).map((r) => r.person));
  if (leadReplies) worked.push(`Pipeline leads replied: ${leadReplies}.`);
  if (moves.length) worked.push(`${cap(inWords(moves.length))} ${moves.length === 1 ? "person" : "people"} moved stage in Pipeline.`);
  if (x.works?.format || x.works?.pillar) worked.push(`Across all posts so far, ${[x.works.format && `${x.works.format.toLowerCase()} posts`, x.works.pillar && `posts on ${x.works.pillar}`].filter(Boolean).join(" and ")} land best${x.works.day ? `, most of all on ${x.works.day}` : ""}.`);
  const lastDone = (x.lastPlan ?? []).filter((p) => p.done);
  if (x.lastPlan?.length && lastDone.length) worked.push(`${cap(inWords(lastDone.length))} of the ${inWords(x.lastPlan.length)} things planned for the week ${lastDone.length === 1 ? "was" : "were"} done.`);

  // ---------- what did not ----------
  const didnt: string[] = [];
  if (missed.length) didnt.push(`${missed.length === 1 ? "A planned post did" : `${cap(inWords(missed.length))} planned posts did`} not go out: ${list(missed.slice(0, 3).map((p) => q(p.title)))}.`);
  if (measured.length >= 2) { const low = measured[measured.length - 1]; didnt.push(`${q(low.title)} drew the least response.`); }
  if (quietModes.length) didnt.push(`${list(quietModes)} comments earned no replies.`);
  if (slipped.length) didnt.push(`Follow-ups slipped: ${names(slipped.map((l) => l.name))}.`);
  const open = (x.lastPlan ?? []).filter((p) => !p.done);
  if (open.length) didnt.push(`${cap(inWords(open.length))} of the things planned for the week ${open.length === 1 ? "was" : "were"} not ticked off.`);

  // ---------- next week's plan ----------
  const plan: PlanItem[] = [];
  const base = `/w/${x.slug}`;
  const nextPosts = x.posts.filter((p) => within(p.publish_date, nextWk, nextEnd) && !POSTED.includes(p.status) && p.status !== "On hold").sort((a, b) => a.publish_date!.localeCompare(b.publish_date!));
  for (const p of nextPosts) plan.push({ id: `post:${p.publish_date}:${p.title}`, text: `Publish ${q(p.title)} on ${day(p.publish_date!)}`, source: "Content Studio", href: `${base}/studio-content?tab=plan`, done: false });
  if (x.strategy.ppw && nextPosts.length < x.strategy.ppw) {
    const gap = x.strategy.ppw - nextPosts.length;
    plan.push({ id: "post:gap", text: `Plan ${inWords(gap)} more ${gap === 1 ? "post" : "posts"} to reach ${inWords(x.strategy.ppw)} this week`, source: "Content Studio", href: `${base}/studio-content?tab=plan`, done: false });
  }
  const due = x.leads.filter((l) => l.next_date && l.next_date <= nextEnd && !x.closedStages.includes(l.stage)).sort((a, b) => a.next_date!.localeCompare(b.next_date!));
  for (const l of due.slice(0, 6)) plan.push({ id: `lead:${l.id}`, text: `${l.name}${l.company ? `, ${l.company}` : ""}: ${l.next_action || "follow up"}${l.next_date! < nextWk ? " (overdue)" : ` by ${day(l.next_date!)}`}`, source: "Pipeline", href: `${base}/pipeline?p=${l.id}`, done: false });
  if (due.length > 6) plan.push({ id: "lead:more", text: `${cap(inWords(due.length - 6))} more follow-ups in Pipeline`, source: "Pipeline", href: `${base}/pipeline`, done: false });
  const target = x.strategy.comments_week ?? x.commentTarget;
  if (target) plan.push({ id: "goal:comments", text: "Comment every working day to meet the weekly target", source: "Strategy", href: `${base}/today`, done: false });
  for (const a of x.strategy.actions.slice(0, 4)) if (a.title.trim()) plan.push({ id: `node:${a.id}`, text: a.title.trim(), source: "Strategy", href: `${base}/strategy`, done: false });
  const focus = x.pillars.filter(Boolean).slice(0, 3);
  if (focus.length) plan.push({ id: "pillars", text: `Keep the focus on ${list(focus)}`, source: "Strategy", href: `${base}/strategy`, done: false });
  for (const p of open.slice(0, 3)) if (!plan.some((y) => y.id === p.id)) plan.push({ ...p, id: `carry:${p.id.replace(/^carry:/, "")}`, source: "Last week", done: false });

  return { sentences: [s1, s2, s3], worked, didnt, moves, plan };
}

/** A saved plan merged with a fresh one: saved items keep their text and ticks, in their order, and nothing is added
 *  behind the user's back once the review is saved. Before saving the fresh plan is used as it is. */
export function mergePlan(saved: PlanItem[] | null | undefined, fresh: PlanItem[]): PlanItem[] {
  return saved && saved.length ? saved : fresh;
}

/** Clean what comes back from the database: an array of items with a text, at most 40. */
export function cleanPlan(raw: unknown): PlanItem[] {
  if (!Array.isArray(raw)) return [];
  const SOURCES = ["Content Studio", "Pipeline", "Strategy", "Last week", "Added"];
  return raw.filter((p) => p && typeof p === "object" && typeof (p as PlanItem).text === "string" && (p as PlanItem).text.trim())
    .slice(0, 40).map((p, i) => {
      const o = p as Partial<PlanItem>;
      return { id: String(o.id || `item:${i}`), text: String(o.text).slice(0, 300), source: (SOURCES.includes(String(o.source)) ? o.source : "Added") as PlanItem["source"],
        ...(typeof o.href === "string" && o.href.startsWith("/") ? { href: o.href } : {}), done: !!o.done };
    });
}

/** The week a review is for: the Monday of the week before `today`, or an earlier Monday asked for. */
export function reviewWeek(today: string, asked: string | null): string {
  const monday = (s: string) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
  const last = shift(monday(today), -7);
  if (asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && !Number.isNaN(Date.parse(asked + "T12:00:00"))) { const m = monday(asked); return m <= last ? m : last; }
  return last;
}
