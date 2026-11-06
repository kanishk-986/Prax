// Content Studio campaigns: objectives, the proposed post plan, the profile owner's time budget, balance warnings,
// the mid-campaign check and the end-of-campaign report. Pure functions only, so the page and
// scripts/test-campaigns.ts run the same code. Dates are YYYY-MM-DD local calendar days.
// Pillars are per profile (workspaces.pillars, read with pillarsOf in src/lib/persona.ts) and passed in.

export const FORMATS = ["Text post", "Image post", "Carousel", "Video", "Poll", "Article"];
export const PHASES = ["Open", "Prove", "Deepen", "Ask"] as const;
export type Phase = (typeof PHASES)[number];
export const STATUSES = ["Idea", "Drafting", "In review", "Ready", "Posted"] as const;
export const MEASURES = ["Comments from target segments", "Conversations with target accounts", "Resource requests", "AI tools naming the profile on this topic", "New followers in target segments"];

/** Each objective sets the plan's defaults: how the phases are weighted, the format mix, cadence and the ask. */
export type Objective = { key: string; label: string; sub: string; weights: [number, number, number, number]; mix: string[]; ppw: number; weeks: number; cta: string };
export const OBJECTIVES: Objective[] = [
  { key: "authority", label: "Own a pillar", sub: "Be the name linked with one topic.", weights: [3, 3, 2, 1], mix: ["Article", "Carousel", "Text post"], ppw: 2, weeks: 6, cta: "Follow for the full series" },
  { key: "ai", label: "Get named in AI answers", sub: "Posts that define terms and frameworks; judged by AI citations.", weights: [1, 2, 5, 0], mix: ["Article", "Text post", "Carousel"], ppw: 2, weeks: 6, cta: "Read the full framework" },
  { key: "conversations", label: "Open conversations with target accounts", sub: "The ask starts by week 2.", weights: [1, 2, 2, 3], mix: ["Text post", "Poll", "Carousel"], ppw: 2, weeks: 4, cta: "Reply or send me a message" },
  { key: "market", label: "Enter a new market", sub: "Local rules and local proof for one region.", weights: [3, 3, 2, 1], mix: ["Text post", "Article", "Carousel"], ppw: 2, weeks: 8, cta: "Message me for the regional briefing" },
  { key: "launch", label: "Launch or announce", sub: "Product, partnership or report; before, launch day, after.", weights: [2, 2, 1, 2], mix: ["Video", "Carousel", "Text post"], ppw: 3, weeks: 3, cta: "Ask for a briefing or demo" },
  { key: "event", label: "Show up at an event", sub: "Before, during and after a conference.", weights: [2, 2, 1, 2], mix: ["Text post", "Image post", "Video"], ppw: 3, weeks: 3, cta: "Meet at the event" },
  { key: "moment", label: "Respond to regulation or news", sub: "Fast first take, then depth. Always constructive.", weights: [2, 2, 2, 1], mix: ["Text post", "Carousel"], ppw: 2, weeks: 2, cta: "Ask for the briefing note" },
  { key: "resource", label: "Share a resource", sub: "A report or checklist: prove, then offer it.", weights: [1, 3, 1, 2], mix: ["Carousel", "Text post", "Article"], ppw: 2, weeks: 4, cta: "Message me for the copy" },
  { key: "rewarm", label: "Re-warm the pipeline", sub: "Case proof and answers to common objections.", weights: [1, 3, 3, 1], mix: ["Text post", "Carousel"], ppw: 1, weeks: 4, cta: "Happy to walk you through it" },
];
export const objective = (key: string) => OBJECTIVES.find((o) => o.key === key) ?? OBJECTIVES[0];

export type Brief = {
  objective: string; topic: string; keywords: string[]; segments: string[]; start: string; weeks: number; ppw: number; mix: string[];
  message: string; cta: string; measure: string; minutes: number; resource: { name: string; link: string }; colleagues: string[];
  event?: { name: string; start: string; end: string }; link?: string;
  /** Weekdays to post on (0 is Monday), from the Strategy Content system node (content_settings.plan). */
  days?: number[];
};

// ---------- dates ----------
const D = (s: string) => new Date(s + "T12:00:00");
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (s: string, n: number) => { const d = D(s); d.setDate(d.getDate() + n); return ymd(d); };
export const weekStart = (s: string) => addDays(s, -((D(s).getDay() + 6) % 7));
export const daysBetween = (a: string, b: string) => Math.round((D(b).getTime() - D(a).getTime()) / 864e5);
export const nextMonday = (s: string) => addDays(weekStart(s), 7);
export const endOf = (b: Brief) => addDays(b.start, b.weeks * 7 - 1);

export function defaultBrief(todayYmd: string, objKey = "authority", pillars: string[] = []): Brief {
  const o = objective(objKey);
  return { objective: o.key, topic: pillars[0] ?? "", keywords: [], segments: [], start: nextMonday(todayYmd), weeks: o.weeks, ppw: o.ppw, mix: [...o.mix], message: "", cta: o.cta, measure: MEASURES[0], minutes: 45, resource: { name: "", link: "" }, colleagues: [] };
}

/** The profile's content plan (Strategy, Content system) over a brief: its days set how many posts a week and
 *  when, its formats set the mix. An empty plan changes nothing. */
export function withPlan(b: Brief, plan?: { ppw?: number; days?: number[]; formats?: string[] } | null): Brief {
  if (!plan) return b;
  const days = (plan.days ?? []).filter((d) => d >= 0 && d <= 4);
  return { ...b, ...(days.length ? { days, ppw: days.length } : plan.ppw ? { ppw: Math.max(1, Math.min(5, plan.ppw)) } : {}), ...(plan.formats?.length ? { mix: plan.formats.filter((f) => FORMATS.includes(f)) } : {}) };
}

/** Choosing an objective resets the parts it owns (mix, cadence, length, ask) and keeps the rest. */
export function applyObjective(b: Brief, objKey: string): Brief {
  const o = objective(objKey);
  return { ...b, objective: o.key, mix: [...o.mix], ppw: o.ppw, weeks: o.weeks, cta: o.cta };
}

/** Weekday slots: Mon, Wed, Fri first, then Tue, Thu; or the plan's own days (0 is Monday). Never before the start date. */
export function slotDates(start: string, weeks: number, ppw: number, days?: number[]): string[] {
  const own = [...new Set((days ?? []).filter((d) => d >= 0 && d <= 4))].sort();
  const order = (own.length ? own : [0, 2, 4, 1, 3]).slice(0, Math.max(1, Math.min(5, ppw))).sort();
  const ws = weekStart(start), out: string[] = [];
  for (let w = 0; w < weeks + 1 && out.length < weeks * ppw; w++)
    for (const s of order) { const d = addDays(ws, w * 7 + s); if (d >= start && out.length < weeks * ppw) out.push(d); }
  return out;
}

/** Phase for the i-th of n posts, from the objective's weights (a weight of 0 skips the phase). */
export function phaseFor(i: number, n: number, weights: number[]): Phase {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  for (let p = 0; p < 4; p++) { acc += weights[p] / total; if ((i + 0.5) / n <= acc + 1e-9) return PHASES[p]; }
  return PHASES[weights[3] ? 3 : weights[2] ? 2 : 1];
}

const TITLES: Record<Phase, string[]> = {
  Open: ["Why {k} is the question banks keep asking", "What most teams get wrong about {k}", "The part of {k} nobody budgets for", "Three things I watch in {k} this quarter"],
  Prove: ["What we learned shipping {k} for a regulated client", "The checklist we use before any {k} go-live", "Where {k} projects stall, and how to unblock them", "A {k} decision that saved a client months"],
  Deepen: ["A simple framework for {k}", "Five questions a board should ask about {k}", "How to read the risk in {k}", "{K}: what changes for operations"],
  Ask: ["If {k} is on your plan for next year, let us compare notes", "The questions I would ask before signing a {k} vendor", "What would make {k} easier for your team?", "Open offer: a working session on {k}"],
};
export type PlanItem = { title: string; format: string; pillar: string; phase: Phase; date: string; time: string };

/** The deterministic plan used when no AI key is set, and as the date and phase skeleton for the AI plan. */
export function proposePlan(b: Brief, max = 24, pillars: string[] = []): PlanItem[] {
  const dates = slotDates(b.start, b.weeks, b.ppw, b.days).slice(0, max);
  const o = objective(b.objective);
  const words = b.keywords.length ? b.keywords : [b.topic.toLowerCase() || "this topic"];
  const mix = b.mix.length ? b.mix : o.mix;
  const count: Record<string, number> = {};
  return dates.map((date, i) => {
    const phase = phaseFor(i, dates.length, o.weights);
    const n = (count[phase] = (count[phase] ?? 0) + 1) - 1;
    const k = words[i % words.length];
    const t = TITLES[phase][n % TITLES[phase].length];
    return { title: t.replace("{k}", k).replace("{K}", k[0].toUpperCase() + k.slice(1)), format: mix[i % mix.length], pillar: !pillars.length || pillars.includes(b.topic) ? b.topic : pillars[i % pillars.length], phase, date, time: "09:30" };
  });
}

/** Re-plan: ideas not yet written and still in the future are replaced; written posts and past posts stay. */
export type PostLite = { id: string; status: string; publish_date: string | null; campaign_id?: string | null; pillar?: string; title?: string; format?: string; phase?: string };
export function replanUnwritten(posts: PostLite[], b: Brief, todayYmd: string, pillars: string[] = []) {
  const remove = posts.filter((p) => p.status === "Idea" && (!p.publish_date || p.publish_date >= todayYmd)).map((p) => p.id);
  const taken = new Set(posts.filter((p) => !remove.includes(p.id) && p.publish_date).map((p) => p.publish_date));
  const add = proposePlan(b, 60, pillars).filter((x) => x.date >= todayYmd && !taken.has(x.date));
  return { remove, add };
}

// ---------- the profile owner's time ----------
/** Minutes of the profile owner's time per item: reading and approving, posting it, recording when it is a video. */
export const COST = { approve: 4, post: 3, video: 20, article: 10, comment: 4, dm: 3 };
export const postMinutes = (format: string) => COST.approve + COST.post + (format === "Video" ? COST.video : format === "Article" ? COST.article : 0);
export function weeklyLoad(b: Brief, commentsPerWeek: number, dmsPerWeek = 0) {
  const mix = b.mix.length ? b.mix : ["Text post"];
  const perPost = mix.reduce((s, f) => s + postMinutes(f), 0) / mix.length;
  const posts = Math.round(perPost * b.ppw), comments = commentsPerWeek * COST.comment, dms = dmsPerWeek * COST.dm;
  const minutes = posts + comments + dms;
  const over = minutes > b.minutes;
  let advice = "";
  if (over) {
    if (comments > 0 && posts <= b.minutes) advice = `Lower the comments to ${Math.max(0, Math.floor((b.minutes - posts - dms) / COST.comment))} a week to fit ${b.minutes} minutes.`;
    else if (mix.includes("Video")) advice = "Swap a video for a carousel, or post once less each week.";
    else advice = "Post once less each week, or raise the weekly minutes.";
  }
  return { minutes, posts, comments, dms, over, advice };
}
/** Comment tasks per week that fit the budget after the posts, up to 10 and never more than there are targets. */
export function commentsPerWeek(b: Brief, targets: number) {
  const left = b.minutes - weeklyLoad(b, 0).minutes;
  return Math.max(0, Math.min(10, targets, Math.floor(left / COST.comment)));
}

/** A small stable number for a key, so generated Today items can be upserted without duplicates. */
export function hashIdx(s: string, range = 900) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % range; }

/** This week's comment tasks: targets in rotation, spread over weekdays from today. */
export type TargetLite = { id: string; name: string; company?: string; linkedin?: string; prospect_id?: string | null; engaged_at?: string | null };
export function weekCommentTasks(campaignId: string, campaignName: string, targets: TargetLite[], b: Brief, todayYmd: string) {
  if (todayYmd < b.start || todayYmd > endOf(b) || !targets.length) return [];
  const n = commentsPerWeek(b, targets.length);
  const week = Math.floor(daysBetween(b.start, todayYmd) / 7);
  const days = [0, 1, 2, 3, 4].map((d) => addDays(weekStart(todayYmd), d)).filter((d) => d >= todayYmd);
  if (!days.length) return [];
  return Array.from({ length: n }, (_, i) => {
    const t = targets[(week * n + i) % targets.length];
    return { day: days[i % days.length], kind: "custom", idx: 2000 + hashIdx(campaignId + t.id + week), title: `Comment on a post by ${t.name}${t.company ? ` (${t.company})` : ""} · ${campaignName}`, link: t.linkedin ?? "", note: `campaign:${campaignId}:comment:${t.id}` };
  });
}

// ---------- warnings and checks ----------
export type PlanPost = { date: string; campaign?: string | null; pillar: string };
export function balanceWarnings(posts: PlanPost[], todayYmd: string): string[] {
  const out: string[] = [];
  const byDay: Record<string, Set<string>> = {};
  posts.filter((p) => p.campaign).forEach((p) => { (byDay[p.date] ||= new Set()).add(p.campaign!); });
  Object.entries(byDay).filter(([, s]) => s.size > 1).sort().slice(0, 3).forEach(([d, s]) => out.push(`${s.size} campaigns post on ${d}. Move one to keep the feed calm.`));
  const month = todayYmd.slice(0, 7), inMonth = posts.filter((p) => p.date.startsWith(month) && p.pillar);
  if (inMonth.length >= 4) {
    const c: Record<string, number> = {};
    inMonth.forEach((p) => (c[p.pillar] = (c[p.pillar] ?? 0) + 1));
    Object.entries(c).filter(([, n]) => n / inMonth.length > 0.5).forEach(([p, n]) => out.push(`${p} is ${Math.round((n / inMonth.length) * 100)} percent of this month's posts. Add another pillar for balance.`));
  }
  return out;
}

export type CampPost = { id: string; status: string; publish_date: string | null; format: string; phase?: string };
export function midCheck(b: Brief, posts: CampPost[], targets: TargetLite[], engagedIds: Set<string>, todayYmd: string) {
  const total = b.weeks * 7, elapsed = daysBetween(b.start, todayYmd);
  const due = elapsed >= Math.floor(total / 2) && todayYmd <= endOf(b);
  const shouldBe = posts.filter((p) => p.publish_date && p.publish_date < todayYmd).length;
  const posted = posts.filter((p) => p.status === "Posted").length;
  const quiet = targets.filter((t) => !t.engaged_at && !engagedIds.has(t.id));
  const suggestions: { key: string; text: string }[] = [];
  if (shouldBe - posted >= 2) suggestions.push({ key: "push", text: `${shouldBe - posted} planned posts have not gone out. Move the unwritten ideas one week later.` });
  if (targets.length && quiet.length / targets.length > 0.5) suggestions.push({ key: "poll", text: `${quiet.length} of ${targets.length} target accounts are quiet. Turn the next idea into a poll that asks them a direct question.` });
  const future = posts.filter((p) => p.status === "Idea" && p.publish_date && p.publish_date >= todayYmd);
  if (future.length && !future.some((p) => p.phase === "Ask")) suggestions.push({ key: "ask", text: "No ask is left in the plan. Make the last idea an Ask post." });
  const landing = `${posted} of ${shouldBe} posts out so far${targets.length ? `, ${targets.length - quiet.length} of ${targets.length} target accounts engaged` : ""}.`;
  return { due, landing, quiet, suggestions: suggestions.slice(0, 3) };
}

export type ReportInput = {
  posts: CampPost[]; replies: number; conversations: number; requests: { sent: boolean }[]; stageMoves: number; targets: number; engaged: number;
  citations?: { before: number | null; after: number | null } | null;
  /** Post results (CS29), summed by resultsSummary in src/lib/content.ts over the campaign's posts. */
  results?: { measured: number; impressions: number; reactions: number; comments: number; reposts: number; rate: number | null; best: { title: string } | null } | null;
};
const fmtN = (n: number) => n.toLocaleString("en-GB");
/** first: the profile's first name (firstNameOf in src/lib/persona.ts). */
export function report(b: Brief, r: ReportInput, first = "the profile") {
  const planned = r.posts.length, posted = r.posts.filter((p) => p.status === "Posted").length;
  const lines = [
    `${posted} of ${planned} planned posts went out over ${b.weeks} weeks.`,
    `${r.replies} replies came back on ${first}${/s$/i.test(first) ? "'" : "'s"} comments to target accounts, and ${r.engaged} of ${r.targets} target accounts engaged.`,
    `${r.conversations} new conversations started, and target accounts moved stage ${r.stageMoves} times.`,
    `${r.requests.length} people asked for the resource; ${r.requests.filter((x) => x.sent).length} have been sent it.`,
  ];
  if (r.citations && r.citations.before != null && r.citations.after != null)
    lines.push(`AI tools named ${first} on this topic in ${r.citations.after} percent of answers, from ${r.citations.before} percent before the campaign.`);
  else lines.push("AI citation change is not available yet for this topic.");
  const res = r.results;
  if (res && res.measured) {
    lines.push(`${res.measured} of ${posted} posted ${posted === 1 ? "piece has" : "pieces have"} results: ${fmtN(res.impressions)} impressions, ${fmtN(res.reactions)} reactions, ${fmtN(res.comments)} comments and ${fmtN(res.reposts)} reposts${res.rate != null ? `, ${res.rate} interactions per 100 impressions` : ""}.`);
    if (res.best?.title && res.measured > 1) lines.push(`The strongest post was "${res.best.title}".`);
  } else if (posted) lines.push("No post results yet. Add them in each posted piece's view.");
  return { planned, posted, rate: planned ? Math.round((posted / planned) * 100) : 0, lines };
}

// ---------- fast response and events ----------
/** The topic is the profile's regulation or policy pillar when it has one, else its first pillar. */
export function fastBrief(todayYmd: string, link: string, angle: string, pillars: string[] = []): Brief {
  return { ...defaultBrief(todayYmd, "moment"), topic: pillars.find((p) => /regulat|policy|rule/i.test(p)) ?? pillars[0] ?? "", start: todayYmd, weeks: 1, ppw: 2, mix: ["Text post", "Carousel"], message: angle, link };
}
/** A fast response: a first take for approval within 48 hours, then a deeper post a few days later. */
export function fastPlan(b: Brief): PlanItem[] {
  return [
    { title: `First take: ${b.message || "what this means"}`, format: "Text post", pillar: b.topic, phase: "Open", date: addDays(b.start, 2), time: "09:30" },
    { title: `What the rule asks institutions to build`, format: "Carousel", pillar: b.topic, phase: "Deepen", date: addDays(b.start, 6), time: "09:30" },
  ];
}
/** Before (two weeks), each event day, and a recap the day after. */
export function eventPlan(b: Brief): PlanItem[] {
  const e = b.event;
  if (!e?.start) return [];
  const end = e.end && e.end >= e.start ? e.end : e.start;
  const out: PlanItem[] = [
    { title: `Where I will be at ${e.name} and what I want to learn`, format: "Text post", pillar: b.topic, phase: "Open", date: addDays(e.start, -10), time: "09:30" },
    { title: `Three questions I am taking to ${e.name}`, format: "Carousel", pillar: b.topic, phase: "Prove", date: addDays(e.start, -3), time: "09:30" },
  ];
  for (let d = e.start, i = 0; d <= end && i < 4; d = addDays(d, 1), i++) out.push({ title: `From ${e.name}, day ${i + 1}: one thing worth sharing`, format: "Image post", pillar: b.topic, phase: "Deepen", date: d, time: "12:00" });
  out.push({ title: `What ${e.name} told us about the year ahead`, format: "Text post", pillar: b.topic, phase: "Ask", date: addDays(end, 2), time: "09:30" });
  return out;
}
/** Follow-up tasks for the people met at the event, the working day after it ends. */
export function eventFollowUps(campaignId: string, b: Brief, people: TargetLite[]) {
  const end = b.event?.end || b.event?.start;
  if (!end) return [];
  const day = addDays(end, 1);
  return people.map((p) => ({ day, kind: "custom", idx: 3200 + hashIdx(campaignId + p.id, 700), title: `Follow up with ${p.name} after ${b.event!.name}`, link: p.linkedin ?? "", note: `campaign:${campaignId}:event:${p.id}` }));
}

/** Reshare notes when no AI key is set: a company page version and one short note per colleague.
 *  who: the profile's full name, first name and role (src/lib/persona.ts). */
export function reshareFallback(title: string, colleagues: string[], who: { name: string; first: string; role: string }) {
  return {
    page: `${who.role ? `Our ${who.role} ${who.name}` : who.name} on ${title.toLowerCase()}. Worth a read for anyone working on this.`,
    notes: colleagues.map((c) => ({ name: c, text: `Sharing ${who.first}${/s$/i.test(who.first) ? "'" : "'s"} post on ${title.toLowerCase()}. It matches what we see in our work every week.` })),
  };
}
