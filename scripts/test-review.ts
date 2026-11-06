// Checks the Monday review (I2): the week it is for, the three sentences, what worked and what did not, next week's
// plan from Content Studio, Pipeline and the strategy, carrying over last Monday's open items, and cleaning a saved
// plan. Run: node scripts/test-review.ts
import { buildReview, reviewWeek, cleanPlan, mergePlan, inWords, postScore, type ReviewInput, type PlanItem } from "../src/lib/review.ts";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

// the week
eq("on a Monday, last week", reviewWeek("2026-11-09", null), "2026-11-02");
eq("midweek, still last week", reviewWeek("2026-11-12", null), "2026-11-02");
eq("on a Sunday, the week before", reviewWeek("2026-11-08", null), "2026-10-26");
eq("an earlier week asked for, by any of its days", reviewWeek("2026-11-09", "2026-10-21"), "2026-10-19");
eq("this week or later is not reviewed yet", reviewWeek("2026-11-09", "2026-11-10"), "2026-11-02");
eq("a bad date falls back", reviewWeek("2026-11-09", "nonsense"), "2026-11-02");
eq("small counts in words", [inWords(0), inWords(3), inWords(12), inWords(13)], ["no", "three", "twelve", "13"]);
eq("post score", postScore({ title: "", status: "Posted", publish_date: null, reactions: 10, comments: 2, reposts: 1 }), 17);

const W = "2026-11-02";
const base: ReviewInput = {
  week: W, today: "2026-11-09", name: "Shashi", slug: "shashi",
  posts: [
    { title: "Banks will buy controls", status: "Posted", publish_date: "2026-11-03", format: "Carousel", pillar: "Tokenisation", impressions: 2000, reactions: 60, comments: 12, reposts: 3 },
    { title: "Custody is the gate", status: "Posted", publish_date: "2026-11-05", format: "Text post", pillar: "Custody", impressions: 900, reactions: 9, comments: 1, reposts: 0 },
    { title: "Stablecoin rails", status: "Ready", publish_date: "2026-11-06", format: "Text post" },
    { title: "Next week one", status: "Ready", publish_date: "2026-11-10" },
    { title: "Next week two", status: "Approved", publish_date: "2026-11-12" },
    { title: "Held", status: "On hold", publish_date: "2026-11-11" },
  ],
  logs: [
    { day: "2026-11-03", mode: "Question", reply: true }, { day: "2026-11-04", mode: "Question", reply: false },
    { day: "2026-11-04", mode: "Board lens", reply: false }, { day: "2026-11-05", mode: "Board lens", reply: false }, { day: "2026-11-06", mode: "Board lens", reply: false },
    { day: "2026-10-28", mode: "Data point", reply: true },
  ],
  replies: [{ person: "Priya Nair", prospect_id: "a", seen_at: "2026-11-04T09:00:00Z" }, { person: "Tom Becker", prospect_id: null, seen_at: "2026-11-05T09:00:00Z" }, { person: "Old", prospect_id: null, seen_at: "2026-10-20T09:00:00Z" }],
  moves: [{ name: "Omar Saleh", company: "Gulf Union", from: "Connected", to: "Call booked", at: "2026-11-05T10:00:00Z" }],
  leads: [
    { id: "a", name: "Priya Nair", company: "Northbank", stage: "In conversation", next_action: "Send the custody note", next_date: "2026-11-11" },
    { id: "b", name: "Lena Fischer", company: "", stage: "Connected", next_action: "", next_date: "2026-11-04" },
    { id: "c", name: "Won Person", company: "", stage: "Won", next_action: "x", next_date: "2026-11-04" },
  ],
  closedStages: ["Won", "Parked"],
  commentTarget: 20, comments: 15,
  works: { format: "Carousel", pillar: "Tokenisation", day: "Tuesday" },
  lastPlan: [{ id: "lead:b", text: "Lena: intro", source: "Pipeline", done: false }, { id: "y", text: "Call the custody team", source: "Added", done: false }, { id: "x", text: "Write the custody piece", source: "Added", done: true }],
  strategy: { comments_week: null, actions: [{ id: "n1", title: "Two comments a day on bank leaders" }, { id: "n2", title: " " }], ppw: 3 },
  pillars: ["Tokenisation", "Custody"],
};
const r = buildReview(base);
eq("sentence 1: posts against the plan and comments against the target, in words", r.sentences[0], "Two of the three planned posts went out, and comments came close to the weekly target.");
eq("sentence 2: who replied and who moved, by name", r.sentences[1], "Priya Nair and Tom Becker replied, and Omar Saleh moved to Call booked.");
eq("sentence 3: the strongest post", r.sentences[2], 'The strongest post was "Banks will buy controls", a carousel on Tokenisation.');
eq("no Dashboard numbers in the sentences", r.sentences.some((s) => /\d/.test(s)), false);
eq("what worked", r.worked, [
  '"Banks will buy controls" drew the most response, 3.8 interactions per 100 impressions.',
  "Question comments earned replies (1 of 2).",
  "Pipeline leads replied: Priya Nair.",
  "One person moved stage in Pipeline.",
  "Across all posts so far, carousel posts and posts on Tokenisation land best, most of all on Tuesday.",
  "One of the three things planned for the week was done.",
]);
eq("what did not", r.didnt, [
  'A planned post did not go out: "Stablecoin rails".',
  '"Custody is the gate" drew the least response.',
  "Board lens comments earned no replies.",
  "Follow-ups slipped: Lena Fischer.",
  "Two of the things planned for the week were not ticked off.",
]);
eq("plan: posts, the gap to the content plan, follow-ups, the strategy, focus, carry-over (not twice when already planned)", r.plan.map((p) => [p.source, p.text]), [
  ["Content Studio", 'Publish "Next week one" on Tue 10 Nov'],
  ["Content Studio", 'Publish "Next week two" on Thu 12 Nov'],
  ["Content Studio", "Plan one more post to reach three this week"],
  ["Pipeline", "Lena Fischer: follow up (overdue)"],
  ["Pipeline", "Priya Nair, Northbank: Send the custody note by Wed 11 Nov"],
  ["Strategy", "Comment every working day to meet the weekly target"],
  ["Strategy", "Two comments a day on bank leaders"],
  ["Strategy", "Keep the focus on Tokenisation and Custody"],
  ["Last week", "Call the custody team"],
]);
eq("plan items start unticked with links into Prax", [r.plan.every((p) => !p.done), r.plan.every((p) => !p.href || p.href.startsWith("/w/shashi/"))], [true, true]);
eq("plan ids are unique", new Set(r.plan.map((p) => p.id)).size, r.plan.length);

const quiet = buildReview({ ...base, posts: [], logs: [], replies: [], moves: [], leads: [], comments: 0, works: null, lastPlan: null, strategy: { actions: [] }, pillars: [], commentTarget: 0 });
eq("a quiet week", quiet.sentences, ["No posts went out, and no comments were left.", "Nobody replied or moved stage, so the work has not turned into conversations yet.", "There are no post results for the week yet, so there is little to learn from beyond what went out."]);
eq("a quiet week: nothing to list, nothing planned", [quiet.worked, quiet.didnt, quiet.plan], [[], [], []]);
const slip = buildReview({ ...base, posts: [], logs: [] });
eq("no results: the slipped follow-ups lead the third sentence", slip.sentences[2], "One follow-up slipped past its date.");
const met = buildReview({ ...base, comments: 25 });
eq("target met", met.sentences[0].endsWith("comments met the weekly target."), true);

// saved plans
const saved: PlanItem[] = [{ id: "a", text: "Mine", source: "Added", done: true }];
eq("a saved plan is kept as it is", mergePlan(saved, r.plan), saved);
eq("before saving the fresh plan is used", mergePlan([], r.plan).length, r.plan.length);
eq("clean a saved plan", cleanPlan([{ id: "a", text: " Keep ", source: "Pipeline", href: "/w/x/pipeline", done: 1 }, { text: "" }, null, { id: "b", text: "x", source: "Evil", href: "https://evil.example" }, "str"]),
  [{ id: "a", text: " Keep ", source: "Pipeline", href: "/w/x/pipeline", done: true }, { id: "b", text: "x", source: "Added", done: false }]);
eq("not a list", cleanPlan({ a: 1 }), []);

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
