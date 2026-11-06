// Checks the weekly report (D10) and the profiles overview (D11): the week window, what went out, who engaged,
// who moved stage, new conversations, overdue, AI citations movement, top topics, next week's plan and the
// sentences. Run: node scripts/test-weekly.ts
import { weeklyReport, overviewOf, perDayMax, list, mondayOf, weekRange, type WeekInput } from "../src/lib/weekly.ts";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const noDash = (name: string, s: string) => eq(`${name}: no em or en dashes, no contractions`, /[–—]|\b\w+'(t|s|re|ve|ll|d)\b/.test(s.replace(/Discovery's/g, "")), false);

// helpers
eq("monday of a friday", mondayOf("2026-11-06"), "2026-11-02");
eq("list of one, two, three", [list(["A"]), list(["A", "B"]), list(["A", "B", "C"])], ["A", "A and B", "A, B and C"]);
eq("per day max", perDayMax(["2026-11-02", "2026-11-02", "2026-11-03"], ["2026-11-02", "2026-11-03", "2026-11-03", "2026-11-03", "2026-10-30"], "2026-11-02", "2026-11-08"), 5);
eq("week range in one month", weekRange("2026-11-02"), "2 to 8 Nov 2026");
eq("week range across months", weekRange("2026-10-26"), "26 Oct to 1 Nov 2026");

const empty: WeekInput = {
  week: "2026-11-02", today: "2026-11-06", name: "Layla", commentTarget: 25, posts: [], commentTicks: [], commentLogs: [], requestTicks: [], moves: [], leads: [],
  replies: [], messages: [], conversationStages: ["Connected", "In conversation", "Resource sent", "Call booked"], closedStages: ["Won", "Parked"],
  citations: { now: null, prev: null, named: 0, total: 0, share28: null }, topics: [], pillars: [],
};
const e = weeklyReport(empty);
eq("empty: window", [e.week, e.end, e.isCurrent], ["2026-11-02", "2026-11-08", true]);
eq("empty: out", e.lines.out, "Nothing went out from Layla this week.");
eq("empty: engaged", e.lines.engaged, "No replies, messages or accepted requests were recorded this week.");
eq("empty: moved", e.lines.moved, "Nobody moved stage this week.");
eq("empty: citations", e.lines.citations, "AI citations were not run this week.");
eq("empty: topics", e.lines.topics, "Discovery had no Digest this week.");
eq("empty: next", e.lines.next, "Next week has no posts planned yet, no follow-ups due and a target of 25 comments.");
eq("a week given mid-week starts on its Monday", weeklyReport({ ...empty, week: "2026-11-05" }).week, "2026-11-02");
eq("a past week is not current", weeklyReport({ ...empty, week: "2026-10-26" }).isCurrent, false);

const leads = [
  { id: "a", name: "Mariam Khan", company: "Gulf Bank", stage: "In conversation", next_action: "Send the paper", next_date: "2026-11-04" },
  { id: "b", name: "Omar Said", company: "Desert Pay", stage: "Connected", next_action: "", next_date: "2026-11-12" },
  { id: "c", name: "Ana Ruiz", company: "", stage: "Requested", next_action: "", next_date: "2026-11-20" },
  { id: "d", name: "Old Lead", company: "", stage: "Parked", next_action: "", next_date: "2026-10-01" },
  { id: "e", name: "Dana Lee", company: "", stage: "Warming", next_action: "", next_date: "2026-11-10" },
];
const full: WeekInput = {
  ...empty,
  posts: [
    { title: "Stablecoin settlement in the Gulf", status: "Posted", publish_date: "2026-11-03" },
    { title: "Custody rules", status: "Published", publish_date: "2026-11-05" },
    { title: "Last week post", status: "Posted", publish_date: "2026-10-30" },
    { title: "Drafted only", status: "Draft", publish_date: "2026-11-04" },
    { title: "Monday piece", status: "Ready", publish_date: "2026-11-09" },
    { title: "Thursday piece", status: "Draft", publish_date: "2026-11-12" },
    { title: "Held", status: "On hold", publish_date: "2026-11-10" },
    { title: "Too far", status: "Idea", publish_date: "2026-11-17" },
  ],
  commentTicks: ["2026-11-02", "2026-11-02", "2026-11-03", "2026-11-06", "2026-10-31"],
  commentLogs: ["2026-11-02", "2026-11-03", "2026-11-03", "2026-11-09"],
  requestTicks: ["2026-11-03"],
  moves: [
    { prospect_id: "c", kind: "move", from_stage: "Warming", to_stage: "Requested", at: "2026-11-03T10:00:00" },
    { prospect_id: "c", kind: "move", from_stage: "Warming", to_stage: "Requested", at: "2026-11-04T10:00:00" },
    { prospect_id: "b", kind: "move", from_stage: "Requested", to_stage: "Connected", at: "2026-11-04T09:00:00" },
    { prospect_id: "a", kind: "move", from_stage: "Connected", to_stage: "In conversation", at: "2026-11-05T09:00:00" },
    { prospect_id: "a", kind: "done", from_stage: "In conversation", to_stage: "In conversation", at: "2026-11-06T09:00:00" },
    { prospect_id: "e", kind: "move", from_stage: "Target", to_stage: "Warming", at: "2026-10-30T09:00:00" },
    { prospect_id: "zz", kind: "move", from_stage: "Target", to_stage: "Warming", at: "2026-11-05T09:00:00" },
  ],
  leads,
  replies: ["2026-11-02T08:00:00", "2026-11-05T08:00:00", "2026-10-28T08:00:00"],
  messages: [{ at: "2026-11-05T12:00:00", person: "Mariam Khan", prospect_id: "a" }, { at: "2026-11-06T12:00:00", person: "New Person" }, { at: "2026-10-29T12:00:00", person: "Older" }],
  citations: { now: 22, prev: 18, named: 4, total: 18, share28: 20 },
  topics: [{ title: "UAE dirham stablecoin", rank: 2 }, { title: "Bank custody", rank: 1 }, { title: "Rising only", rank: null, rising: true }, { title: "Tokenised deposits", rank: 3 }, { title: "Fourth", rank: 4 }],
  pillars: ["Stablecoin infrastructure", "Bank tokenisation"],
};
const r = weeklyReport(full);
eq("posts out this week only, posted or published", [r.out.posts, r.out.titles], [2, ["Stablecoin settlement in the Gulf", "Custody rules"]]);
eq("comments: per day the larger count, inside the week", r.out.comments, 5);
eq("requests: ticks and Requested moves, per day max", r.out.requests, 2);
eq("engaged: replies and messages in the week, accepts are moves to Connected", r.engaged, { replies: 2, messages: 2, accepts: 1 });
eq("moved: one row per known person, newest first, Done and other weeks left out", r.moved.map((m) => [m.name, m.from, m.to]), [["Mariam Khan", "Connected", "In conversation"], ["Ana Ruiz", "Warming", "Requested"], ["Omar Said", "Requested", "Connected"]]);
eq("new conversations: moved into a conversation stage, plus a message from someone new", r.conversations, 3);
eq("overdue: open leads due before today", r.overdue, 1);
eq("citations change in points", r.citations.change, 4);
eq("top three topics by rank", r.topics, ["Bank custody", "UAE dirham stablecoin", "Tokenised deposits"]);
eq("next week posts: dated next week, not posted or held", r.next.posts, [{ title: "Monday piece", date: "2026-11-09" }, { title: "Thursday piece", date: "2026-11-12" }]);
eq("next week follow-ups: due by next Sunday, overdue included, closed left out", [r.next.followups, r.next.names], [3, ["Mariam Khan", "Dana Lee", "Omar Said"]]);
eq("focus from the strategy pillars", r.next.focus, ["Stablecoin infrastructure", "Bank tokenisation"]);

eq("out sentence", r.lines.out, "Layla published 2 posts and left 5 comments against a target of 25. 2 connection requests went out.");
eq("engaged sentence", r.lines.engaged, "2 people replied to comments, 2 messages came in and 1 request was accepted.");
eq("moved sentence", r.lines.moved, "3 people moved stage: Mariam Khan to In conversation, Ana Ruiz to Requested and Omar Said to Connected.");
eq("citations sentence", r.lines.citations, "AI answers named Layla in 22% of prompts this week, up 4 points on last week.");
eq("topics sentence", r.lines.topics, "Discovery's top topics were Bank custody, UAE dirham stablecoin and Tokenised deposits.");
eq("next sentence", r.lines.next, "Next week has 2 posts planned, 3 follow-ups due and a target of 25 comments. The focus stays on Stablecoin infrastructure and Bank tokenisation.");
eq("summary", r.summary, "Layla published 2 posts and left 5 comments against a target of 25. 2 people replied to comments, 2 messages came in and 1 request was accepted. AI answers named Layla in 22% of prompts this week, up 4 points on last week.");
Object.entries(r.lines).forEach(([k, v]) => noDash(k, v));

eq("citations: down and same", [weeklyReport({ ...full, citations: { ...full.citations, now: 15 } }).lines.citations, weeklyReport({ ...full, citations: { ...full.citations, now: 18 } }).lines.citations],
  ["AI answers named Layla in 15% of prompts this week, down 3 points on last week.", "AI answers named Layla in 18% of prompts this week, the same as last week."]);
eq("citations: one point, no previous week", [weeklyReport({ ...full, citations: { ...full.citations, now: 19 } }).lines.citations, weeklyReport({ ...full, citations: { ...full.citations, prev: null } }).lines.citations],
  ["AI answers named Layla in 19% of prompts this week, up 1 point on last week.", "AI answers named Layla in 22% of prompts this week."]);
eq("citations: not run this week falls back to 28 days", weeklyReport({ ...full, citations: { now: null, prev: 18, named: 0, total: 0, share28: 20 } }).lines.citations, "AI citations were not run this week. Over the last 28 days AI answers named Layla in 20% of prompts.");
eq("one topic", weeklyReport({ ...full, topics: [{ title: "Only", rank: 1 }] }).lines.topics, "Discovery's top topic was Only.");
eq("more than four moves are summed up", weeklyReport({ ...full, leads: [...leads, ...["p", "q", "s"].map((id) => ({ id, name: id.toUpperCase(), company: "", stage: "Warming", next_action: "", next_date: null }))],
  moves: [...full.moves, ...["p", "q", "s"].map((id, i) => ({ prospect_id: id, kind: "move", from_stage: "Target", to_stage: "Warming", at: `2026-11-0${2 + i}T08:00:00` }))] }).lines.moved,
  "6 people moved stage: Mariam Khan to In conversation, Ana Ruiz to Requested, Omar Said to Connected, S to Warming and 2 others.");
eq("no target: no target words", weeklyReport({ ...full, commentTarget: 0 }).lines.out, "Layla published 2 posts and left 5 comments. 2 connection requests went out.");

// overview
eq("overview row", overviewOf(r), { comments: 5, commentTarget: 25, posts: 2, conversations: 3, overdue: 1, citations: 22 });
eq("overview citations fall back to 28 days", overviewOf(weeklyReport({ ...full, citations: { now: null, prev: null, named: 0, total: 0, share28: 31 } })).citations, 31);
eq("overview with nothing", overviewOf(e), { comments: 0, commentTarget: 25, posts: 0, conversations: 0, overdue: 0, citations: null });

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
