// Checks the campaign plan, date slots, re-plan, time budget, balance warnings, mid-campaign check and report.
// Run: node scripts/test-campaigns.ts
import { OBJECTIVES, defaultBrief, applyObjective, slotDates, proposePlan, replanUnwritten, weeklyLoad, commentsPerWeek, balanceWarnings, midCheck, report, fastPlan, fastBrief, eventPlan, eventFollowUps, weekCommentTasks, phaseFor, PHASES } from "../src/lib/campaigns.ts";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const TODAY = "2026-11-06"; // a Friday

// Slots: Mon, Wed, Fri; never before the start.
eq("slots from a Monday, 2 a week", slotDates("2026-11-09", 2, 2), ["2026-11-09", "2026-11-11", "2026-11-16", "2026-11-18"]);
eq("slots from a Wednesday skip Monday", slotDates("2026-11-11", 1, 3), ["2026-11-11", "2026-11-13", "2026-11-16"]);
eq("default start is next Monday", defaultBrief(TODAY).start, "2026-11-09");

// Every objective yields a full plan with valid phases, and its weights shape the phases.
for (const o of OBJECTIVES) {
  const b = applyObjective({ ...defaultBrief(TODAY), keywords: ["reconciliation"] }, o.key);
  const plan = proposePlan(b);
  const ok = plan.length === b.weeks * b.ppw && plan.every((p) => PHASES.includes(p.phase) && b.mix.includes(p.format));
  eq(`plan for ${o.key}: ${b.weeks}x${b.ppw}, phases and formats valid`, ok, true);
}
eq("AI-answers objective has no Ask phase", proposePlan(applyObjective(defaultBrief(TODAY), "ai")).some((p) => p.phase === "Ask"), false);
eq("conversations objective ends on Ask", proposePlan(applyObjective(defaultBrief(TODAY), "conversations")).slice(-1)[0].phase, "Ask");
eq("phases run in order", ["Open", "Prove", "Deepen", "Ask"].indexOf(phaseFor(0, 8, [1, 1, 1, 1])) <= ["Open", "Prove", "Deepen", "Ask"].indexOf(phaseFor(7, 8, [1, 1, 1, 1])), true);
eq("keywords reach the titles", proposePlan({ ...defaultBrief(TODAY), keywords: ["stablecoin settlement"] })[0].title.includes("stablecoin settlement"), true);
eq("objective resets mix and ask, keeps name fields", (() => { const b = applyObjective({ ...defaultBrief(TODAY), message: "keep me" }, "launch"); return [b.mix[0], b.cta, b.message]; })(), ["Video", "Ask for a briefing or demo", "keep me"]);

// Re-plan: only future unwritten ideas are replaced, and no date is double booked.
const b4 = { ...defaultBrief(TODAY), start: "2026-11-02", weeks: 2, ppw: 2 };
const posts = [
  { id: "a", status: "Posted", publish_date: "2026-11-02" },
  { id: "b", status: "Drafting", publish_date: "2026-11-04" },
  { id: "c", status: "Idea", publish_date: "2026-11-09" },
  { id: "d", status: "Idea", publish_date: "2026-11-11" },
  { id: "e", status: "Idea", publish_date: "2026-11-03" },
];
const rp = replanUnwritten(posts, b4, TODAY);
eq("re-plan removes only future ideas", rp.remove, ["c", "d"]);
eq("re-plan adds future dates only, none taken", rp.add.every((x) => x.date >= TODAY && x.date !== "2026-11-04"), true);

// Time budget.
const tb = { ...defaultBrief(TODAY), mix: ["Text post"], ppw: 2, minutes: 45 };
eq("load: 2 text posts and 5 comments", weeklyLoad(tb, 5).minutes, 2 * 7 + 5 * 4);
eq("comments that fit 45 minutes", commentsPerWeek(tb, 40), Math.floor((45 - 14) / 4));
eq("comments never exceed targets", commentsPerWeek(tb, 3), 3);
const over = weeklyLoad({ ...tb, mix: ["Video"], ppw: 2, minutes: 30 }, 0);
eq("video plan over budget warns", [over.over, over.advice.includes("video")], [true, true]);

// Comment tasks for Today: within the campaign weeks only, stable keys.
const camp = { ...defaultBrief(TODAY), start: "2026-11-02", weeks: 4 };
const targets = Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, name: `Person ${i}`, linkedin: `https://www.linkedin.com/in/p${i}` }));
const tasks = weekCommentTasks("c1", "Reconciliation first", targets, camp, TODAY);
eq("comment tasks this week, from today", [tasks.length > 0, tasks.every((t) => t.day >= TODAY)], [true, true]);
eq("comment task keys are stable", weekCommentTasks("c1", "x", targets, camp, TODAY).map((t) => t.idx), tasks.map((t) => t.idx));
eq("no tasks outside the campaign", weekCommentTasks("c1", "x", targets, { ...camp, start: "2026-12-01" }, TODAY).length, 0);

// Balance warnings.
const w = balanceWarnings([{ date: "2026-11-10", campaign: "A", pillar: "Agentic Finance" }, { date: "2026-11-10", campaign: "B", pillar: "Agentic Finance" }, { date: "2026-11-12", campaign: "A", pillar: "Agentic Finance" }, { date: "2026-11-14", campaign: null, pillar: "Build, Buy or Partner" }], TODAY);
eq("same-day clash and pillar above half both warn", [w.some((x) => x.includes("2 campaigns post on 2026-11-10")), w.some((x) => x.startsWith("Agentic Finance is 75 percent"))], [true, true]);
eq("no warnings when balanced", balanceWarnings([{ date: "2026-11-10", campaign: "A", pillar: "A" }, { date: "2026-11-11", campaign: "A", pillar: "B" }, { date: "2026-11-12", campaign: "A", pillar: "C" }, { date: "2026-11-13", campaign: "A", pillar: "D" }], TODAY), []);

// Mid-campaign check.
const mid = midCheck({ ...camp, start: "2026-10-23", weeks: 4 }, [
  { id: "1", status: "Posted", publish_date: "2026-10-26", format: "Text post", phase: "Open" },
  { id: "2", status: "Idea", publish_date: "2026-10-28", format: "Text post", phase: "Open" },
  { id: "3", status: "Drafting", publish_date: "2026-11-02", format: "Carousel", phase: "Prove" },
  { id: "4", status: "Idea", publish_date: "2026-11-12", format: "Text post", phase: "Deepen" },
], targets, new Set(["t0"]), TODAY);
eq("mid check due at halfway", mid.due, true);
eq("mid check suggestions", mid.suggestions.map((s) => s.key), ["push", "poll", "ask"]);
eq("mid check landing line", mid.landing, "1 of 3 posts out so far, 1 of 6 target accounts engaged.");

// Report.
const rep = report(camp, { posts: [{ id: "1", status: "Posted", publish_date: "x", format: "Text post" }, { id: "2", status: "Idea", publish_date: "y", format: "Text post" }], replies: 3, conversations: 2, requests: [{ sent: true }, { sent: false }], stageMoves: 4, targets: 6, engaged: 2, citations: { before: 10, after: 25 } });
eq("report numbers", [rep.planned, rep.posted, rep.rate], [2, 1, 50]);
eq("report lines", rep.lines[3], "2 people asked for the resource; 1 have been sent it.");
eq("report citation line", rep.lines[4].includes("25 percent"), true);
eq("report without citation data", report(camp, { posts: [], replies: 0, conversations: 0, requests: [], stageMoves: 0, targets: 0, engaged: 0 }).lines[4], "AI citation change is not available yet for this topic.");

// Fast response and events.
const fb = fastBrief(TODAY, "https://example.com/rule", "the new reserve rule");
eq("fast response: first take within 48 hours", fastPlan(fb)[0].date, "2026-11-08");
const ev = { ...defaultBrief(TODAY, "event"), event: { name: "GITEX", start: "2026-12-07", end: "2026-12-09" } };
const ep = eventPlan(ev);
eq("event plan: before, 3 days, after", [ep.length, ep[0].date, ep[ep.length - 1].date], [6, "2026-11-27", "2026-12-11"]);
eq("event follow-ups the day after", eventFollowUps("c1", ev, targets.slice(0, 2)).map((t) => t.day), ["2026-12-10", "2026-12-10"]);

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
