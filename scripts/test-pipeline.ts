// Checks the Pipeline logic: heat, Do next ranking, the move gate, template stages, days per stage and the
// migration mapping (against db/015_pipelines.sql). Run: node scripts/test-pipeline.ts
import { readFileSync } from "node:fs";
import {
  heatOf, doNext, moveGate, mapStage, daysPerStage, stepStage, planFor, dueText, newPipelineName, byCompany, avgDays,
  isLeadClosed, openLeads, CLOSED_STAGE_NAMES, sharedNextStep, lastTouch, agoText, accountMap,
  TEMPLATES, OUTREACH_STAGES, FALLBACK_PIPELINE, type Pipeline,
} from "../src/lib/pipeline.ts";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const T = "2026-11-06";
const P = FALLBACK_PIPELINE;

// ---------- heat ----------
eq("hot: 4 comments, 3 replies, direct, touched 2 days ago", heatOf({ comments: 4, replies: 3, warm: 1, lastTouch: "2026-11-04" }, T).band, "Hot");
eq("score caps comments at 32 and replies at 36", heatOf({ comments: 10, replies: 10, warm: 0, lastTouch: null }, T).score, 68);
eq("68 is warm, not hot", heatOf({ comments: 10, replies: 10, warm: 0, lastTouch: null }, T).band, "Warm");
eq("cold with nothing", [heatOf({ comments: 0, replies: 0, warm: 0, lastTouch: null }, T).score, heatOf({ comments: 0, replies: 0, warm: 0, lastTouch: null }, T).band], [0, "Cold"]);
eq("recency 3 days ago", heatOf({ comments: 0, replies: 0, warm: 0, lastTouch: "2026-11-03" }, T).signals[3].pts, 12);
eq("colleague path is 12 points", heatOf({ comments: 0, replies: 0, warm: 3, lastTouch: null }, T).signals[2].pts, 12);
eq("talked before counts like a connection", heatOf({ comments: 0, replies: 0, warm: 2, lastTouch: null }, T).signals[2].pts, 20);
eq("recency 10 days ago", heatOf({ comments: 0, replies: 0, warm: 0, lastTouch: "2026-10-27" }, T).signals[3].pts, 6);
eq("recency 11 days ago", heatOf({ comments: 0, replies: 0, warm: 0, lastTouch: "2026-10-26" }, T).signals[3].pts, 0);
eq("warm boundary at 40", heatOf({ comments: 1, replies: 1, warm: 1, lastTouch: null }, T).band, "Warm");
eq("one reply wording", heatOf({ comments: 0, replies: 1, warm: 0, lastTouch: null }, T).signals[1].sub, "1 reply to you");

// ---------- Do next ----------
const L = (id: string, stage: string, next_date: string | null, name = id) => ({ id, name, stage, next_date });
const leads = [L("a", "Warming", "2026-11-06"), L("b", "Connected", "2026-11-01"), L("c", "Won", "2026-10-01"), L("d", "Parked", "2026-10-02"),
  L("e", "Target", "2026-11-04"), L("f", "Requested", "2026-11-09"), L("g", "Target", null), L("h", "Target", "2026-11-06", "Aaron"),
  L("i", "Target", "2026-11-05"), L("j", "Target", "2026-11-03"), L("k", "Target", "2026-11-02")];
const dn = doNext(leads, P, T);
eq("overdue first, oldest first, then today by name; Won and Parked left out", dn.rows.map((r) => r.id), ["b", "k", "j", "e", "i"]);
eq("five at most, the rest counted", dn.more, 2);
eq("overdue and today counts", [dn.overdue, dn.today], [5, 2]);
eq("next up is the first future date", dn.upcoming?.id, "f");
eq("open excludes closed stages", dn.open, 9);
eq("nothing due", doNext([L("x", "Target", "2026-11-10")], P, T).rows.length, 0);

// ---------- move gate ----------
eq("needs action and date", moveGate({ to: "Connected", action: "", date: "", reason: "" }, P, "Requested").need, ["action", "date"]);
eq("ok with both", moveGate({ to: "Connected", action: "Send the first message", date: "2026-11-07", reason: "" }, P, "Requested").ok, true);
eq("parked needs a reason", moveGate({ to: "Parked", action: "Check in again in January", date: "2027-01-10", reason: "" }, P, "Connected").need, ["reason"]);
eq("parked with a reason is fine", moveGate({ to: "Parked", action: "Check in", date: "2027-01-10", reason: "No need right now" }, P, "Connected").ok, true);
eq("Done on a parked lead does not ask again", moveGate({ to: "Parked", action: "Check in", date: "2027-01-10", reason: "" }, P, "Parked").ok, true);
const events: Pipeline = { id: "e", name: "Events and speakers", template: "events", stages: TEMPLATES[3].stages, won_stage: "Delivered", lost_stage: "Declined", sort: 1 };
eq("declined needs a reason", moveGate({ to: "Declined", action: "Pitch next year", date: "2027-03-01", reason: "" }, events, "Pitched").needsReason, true);
eq("unknown stage refused", moveGate({ to: "Nowhere", action: "x", date: "2026-11-07", reason: "" }, P, "Target").need, ["stage"]);
eq("bad date refused", moveGate({ to: "Warming", action: "x", date: "7 Nov", reason: "" }, P, "Target").need, ["date"]);

// ---------- stage steps and plan ----------
eq("forward from Call booked is Won", stepStage(P, "Call booked", 1), "Won");
eq("forward never lands on Parked", stepStage(P, "Won", 1), null);
eq("back from Warming is Target", stepStage(P, "Warming", -1), "Target");
eq("back from Target is nothing", stepStage(P, "Target", -1), null);
eq("closed stages have no plan", [planFor(P, "Won").length, planFor(P, "Parked").length], [0, 0]);
eq("warming plan has three steps", planFor(P, "Warming").length, 3);
eq("other pipelines get the general steps", planFor(events, "Pitched"), ["Send the recap of the last conversation", "Book the next step"]);

// ---------- templates ----------
eq("five templates in order", TEMPLATES.map((t) => t.name), ["Outreach", "Bank partners", "Investors", "Events and speakers", "Blank"]);
eq("Outreach has today's nine stages", OUTREACH_STAGES, ["Target", "Warming", "Requested", "Connected", "In conversation", "Resource sent", "Call booked", "Won", "Parked"]);
eq("every template has its won and lost stage in the list", TEMPLATES.every((t) => t.stages.includes(t.won) && t.stages.includes(t.lost)), true);
eq("lost stages are Parked, Passed or Declined", [...new Set(TEMPLATES.map((t) => t.lost))].sort(), ["Declined", "Parked", "Passed"]);
eq("new names count up", [newPipelineName("Investors", []), newPipelineName("Investors", ["Investors"]), newPipelineName("Investors", ["Investors", "Investors 2", "Outreach"])], ["Investors", "Investors 2", "Investors 3"]);

// ---------- migration mapping, and the SQL agrees ----------
eq("exact stages kept", OUTREACH_STAGES.map(mapStage), OUTREACH_STAGES);
eq("case and spaces ignored", [mapStage("in conversation"), mapStage("CALLBOOKED"), mapStage(" resource  sent ")], ["In conversation", "Call booked", "Resource sent"]);
eq("unknown or empty becomes Target", [mapStage("Lost"), mapStage(""), mapStage(null)], ["Target", "Target", "Target"]);
const sql = readFileSync(new URL("../db/015_pipelines.sql", import.meta.url), "utf8");
const arrays = [...sql.matchAll(/array\[('Target'[^\]]*)\]/g)].map((m) => m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")));
eq("SQL lists the same nine stages in both places", arrays.length === 2 && arrays.every((a) => JSON.stringify(a) === JSON.stringify(OUTREACH_STAGES)), true);
eq("SQL keeps unmapped stage names in notes", /Stage before pipelines/.test(sql), true);
eq("SQL never deletes rows", /\bdelete\s+from\b|\bdrop\s+table\b|\btruncate\b/i.test(sql), false);
eq("SQL uses has_role for RLS", (sql.match(/has_role\(workspace_id/g) ?? []).length >= 2, true);
eq("SQL is re-runnable", /create table if not exists pipelines/.test(sql) && /add column if not exists pipeline_id/.test(sql), true);

// ---------- days per stage ----------
const lead = { stage: "Connected", created_at: "2026-10-01T10:00:00Z", stage_changed_at: "2026-11-01T10:00:00Z" };
const moves = [
  { kind: "backfill" as const, from_stage: "", to_stage: "Warming", at: "2026-10-01T10:00:00Z" },
  { kind: "move" as const, from_stage: "Warming", to_stage: "Requested", at: "2026-10-11T10:00:00Z" },
  { kind: "done" as const, from_stage: "Requested", to_stage: "Requested", at: "2026-10-15T10:00:00Z" },
  { kind: "move" as const, from_stage: "Requested", to_stage: "Connected", at: "2026-11-01T10:00:00Z" },
];
eq("days per stage from the history", daysPerStage(moves, lead, "2026-11-06T10:00:00Z"), { Warming: 10, Requested: 21, Connected: 5 });
eq("no history: the current stage only", daysPerStage([], lead, "2026-11-06T10:00:00Z"), { Connected: 5 });
eq("average days in stage", avgDays([lead, { ...lead, stage_changed_at: "2026-11-05T10:00:00Z" }], "2026-11-06T10:00:00Z"), 3);
eq("average of none", avgDays([], "2026-11-06T10:00:00Z"), null);

// ---------- copy and grouping ----------
eq("due text", [dueText("2026-11-05", T), dueText("2026-11-03", T), dueText(T, T), dueText("2026-11-07", T), dueText(null, T)], ["1 day overdue", "3 days overdue", "Today", "Tomorrow", "No date"]);
eq("later dates read as a day", dueText("2026-11-09", T), "Mon 9 Nov");
eq("group by company, biggest first", byCompany([{ company: "B" }, { company: "A" }, { company: "B" }, { company: "" }]).map((g) => `${g.company}:${g.people.length}`), ["B:2", "A:1", "No company:1"]);

// ---------- T7: closed stages of every pipeline stay off Today ----------
const pipes = TEMPLATES.map((x, i) => ({ id: x.key, won_stage: x.won, lost_stage: x.lost, name: x.name, sort: i }));
eq("every template's won and lost stage is a closed name", TEMPLATES.flatMap((x) => [x.won, x.lost]).every((s) => CLOSED_STAGE_NAMES.includes(s)), true);
for (const s of ["Won", "Parked", "Signed", "Committed", "Delivered", "Done", "Passed", "Declined"]) eq(`${s} is closed`, isLeadClosed({ stage: s, pipeline_id: "outreach" }, pipes), true);
eq("an open stage is open", isLeadClosed({ stage: "Pilot", pipeline_id: "banks" }, pipes), false);
const custom = [...pipes, { id: "c", won_stage: "Live", lost_stage: "Lost", name: "Custom", sort: 9 }];
eq("a custom pipeline's won stage is closed", isLeadClosed({ stage: "Live", pipeline_id: "c" }, custom), true);
eq("a custom pipeline's lost stage is closed", isLeadClosed({ stage: "Lost", pipeline_id: "c" }, custom), true);
eq("the same name is open in a pipeline where it is not flagged", isLeadClosed({ stage: "Live", pipeline_id: "banks" }, custom), false);
eq("no pipeline id: the first pipeline's flags apply", isLeadClosed({ stage: "Target", pipeline_id: null }, pipes), false);
eq("unknown pipeline: flagged closed anywhere counts", isLeadClosed({ stage: "Live", pipeline_id: "gone" }, custom), true);
eq("before db/015 (fallback pipeline only)", [isLeadClosed({ stage: "Signed" }, [FALLBACK_PIPELINE]), isLeadClosed({ stage: "Call booked" }, [FALLBACK_PIPELINE])], [true, false]);
eq("openLeads keeps only open leads", openLeads([{ id: 1, stage: "Signed", pipeline_id: "banks" }, { id: 2, stage: "Intro", pipeline_id: "investors" }, { id: 3, stage: "Passed", pipeline_id: "investors" }, { id: 4, stage: "Live", pipeline_id: "c" }], custom).map((l) => l.id), [2]);

// ---------- P18: one shared next step per stage ----------
eq("same step for everyone", sharedNextStep([{ next_action: "Comment on a recent post" }, { next_action: "comment on a recent post." }, { next_action: " Comment on a  recent post" }]), "Comment on a recent post");
eq("one different step: none shared", sharedNextStep([{ next_action: "Comment on a recent post" }, { next_action: "Send the request" }]), null);
eq("a single lead never shares", sharedNextStep([{ next_action: "Comment on a recent post" }]), null);
eq("empty steps are not shared", sharedNextStep([{ next_action: "" }, { next_action: "" }]), null);
eq("a missing step breaks it", sharedNextStep([{ next_action: "Call" }, { next_action: null }]), null);
eq("ago text", [agoText(T, T), agoText("2026-11-05", T), agoText("2026-11-01", T)], ["today", "yesterday", "5 days ago"]);
eq("ago text after a month names the day", agoText("2026-09-20", T).startsWith("on 20 "), true);
eq("last touch: comment newer", lastTouch({ lastComment: "2026-11-04", msgLast: "2026-10-30", msgFrom: "them" }, T), { text: "You commented 2 days ago", day: "2026-11-04" });
eq("last touch: their message newer", lastTouch({ lastComment: "2026-10-01", msgLast: "2026-11-05", msgFrom: "them" }, T), { text: "They wrote yesterday", day: "2026-11-05" });
eq("last touch: our message", lastTouch({ msgLast: T, msgFrom: "us" }, T).text, "You wrote today");
eq("last touch: none", lastTouch({}, T), { text: "No touch yet", day: null });

// ---------- P19: the account map ----------
const AL = (id: string, company: string, stage: string, next_date: string | null, closed = false, warm: 0 | 1 | 2 | 3 = 0) => ({ id, name: id, company, stage, next_action: `Step ${id}`, next_date, closed, warm });
const acc = accountMap([AL("a", "Qasr Bank", "Warming", "2026-11-09", false, 3), AL("b", "qasr bank ", "Connected", "2026-11-04", false, 1), AL("c", "Tamrah", "Target", "2026-11-10"),
  AL("d", "Closed Co", "Won", null, true), AL("e", "", "Target", "2026-11-01"), AL("f", "Tamrah", "Parked", null, true)], T);
eq("accounts: open by urgency, closed-only after, no company last", acc.map((a) => a.company), ["Qasr Bank", "Tamrah", "Closed Co", ""]);
eq("company match ignores case and spaces", acc[0].open.map((l) => l.id), ["b", "a"]);
eq("next is the most urgent open contact", acc[0].next?.id, "b");
eq("overdue count per account", acc[0].overdue, 1);
eq("best warm path wins (direct over a colleague)", acc[0].warm, 1);
eq("stages of open contacts", acc[0].stages, ["Connected", "Warming"]);
eq("closed contacts kept apart", [acc[1].open.map((l) => l.id), acc[1].closed.map((l) => l.id)], [["c"], ["f"]]);
eq("a closed-only account has no next", acc[2].next, null);

console.log(fails ? `\n${fails} failed` : "\nall passed");
if (fails) process.exit(1);
