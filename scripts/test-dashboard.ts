// Checks the Dashboard and Today maths: progress and skips, deltas, week over week, daily series, count-up,
// agenda grouping, the row action, Needs you ranking and the copy helpers. Run: node scripts/test-dashboard.ts
import {
  plusDays, mondayOf, daysBetween, SKIP, isSkipped, skipNote, unskipNote, progressOf, deltaOf, weekOverWeek, dailySeries, countAt,
  groupOf, typeLabel, agenda, primaryAction, urgency, rankNeeds, whenLabel, weekSentence, relTime, countBetween, pointsDelta, settleOrder,
} from "../src/lib/dashboard.ts";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

// dates (6 Nov 2026 is a Friday)
const T = "2026-11-06";
eq("monday of a friday", mondayOf(T), "2026-11-02");
eq("monday of a sunday", mondayOf("2026-11-08"), "2026-11-02");
eq("monday of a monday", mondayOf("2026-11-02"), "2026-11-02");
eq("plus days across a month", plusDays("2026-10-30", 3), "2026-11-02");
eq("days between", daysBetween("2026-11-01", T), 5);

// skips
eq("skip prefixes the note", skipNote("Jane Doe"), SKIP + "Jane Doe");
eq("skip twice is a no-op", skipNote(skipNote("x")), SKIP + "x");
eq("unskip restores the note", unskipNote(skipNote("campaign:1:dm:2")), "campaign:1:dm:2");
eq("unskip of a plain note leaves it", unskipNote("plain"), "plain");
eq("empty note skips and restores", unskipNote(skipNote("")), "");
eq("null note is not skipped", isSkipped(null), false);

// progress
eq("empty day", progressOf([]), { done: 0, skipped: 0, total: 0, left: 0, pct: 0, state: "empty" });
eq("open day", progressOf([{ done: true }, { done: false }, { done: false, note: SKIP }, { done: false }]), { done: 1, skipped: 1, total: 4, left: 2, pct: 50, state: "open" });
eq("done and skipped makes complete", progressOf([{ done: true }, { done: false, note: SKIP + "x" }]), { done: 1, skipped: 1, total: 2, left: 0, pct: 100, state: "complete" });
eq("done wins over a skip note", progressOf([{ done: true, note: SKIP }]).skipped, 0);
eq("pct rounds", progressOf([{ done: true }, { done: false }, { done: false }]).pct, 33);

// deltas
eq("delta up", deltaOf(5, 2), { diff: 3, dir: "up", text: "+3" });
eq("delta down uses a minus sign", deltaOf(1, 4), { diff: -3, dir: "down", text: "−3" });
eq("delta flat", deltaOf(2, 2), { diff: 0, dir: "flat", text: "No change" });
eq("delta unknown", deltaOf(2, null), null);
eq("delta of NaN", deltaOf(NaN, 1), null);

// week over week: this week Mon 2 to Fri 6 against Mon 26 Oct to Fri 30 Oct
const dates = ["2026-11-02", "2026-11-06", "2026-11-06T09:30:00Z", "2026-10-26", "2026-10-30", "2026-10-31", "2026-10-25", null, "2026-11-07"];
eq("week over week, same span", weekOverWeek(dates, T), { now: 3, prev: 2 });
eq("week over week on a monday", weekOverWeek(["2026-11-02", "2026-10-26", "2026-10-27"], "2026-11-02"), { now: 1, prev: 1 });

// daily series
eq("daily series", dailySeries(["2026-11-06", "2026-11-06", "2026-11-04", "2026-11-01", "2026-12-01"], T, 3), [1, 0, 2]);
eq("daily series length", dailySeries([], T).length, 14);

// count-up
eq("count-up starts at 0", countAt(120, 0), 0);
eq("count-up lands exactly", countAt(120, 450), 120);
eq("count-up past the end", countAt(7, 9999), 7);
eq("count-up eases out (past half at half time)", countAt(100, 225) > 50, true);
eq("count-up with no duration", countAt(9, 0, 0), 9);

// agenda
eq("comment kind", groupOf({ kind: "comment", idx: 1 }), "comment");
eq("reply joins comment", groupOf({ kind: "reply", idx: 1 }), "comment");
eq("dm is follow up", groupOf({ kind: "dm", idx: 2 }), "followup");
eq("request is connect", groupOf({ kind: "request", idx: 1 }), "connect");
eq("campaign comment band", groupOf({ kind: "custom", idx: 2417 }), "comment");
eq("approval session is post", groupOf({ kind: "custom", idx: 3000 }), "post");
eq("fast response is post", groupOf({ kind: "custom", idx: 3150 }), "post");
eq("event follow-up band", groupOf({ kind: "custom", idx: 3210 }), "followup");
eq("campaign message band", groupOf({ kind: "custom", idx: 4321 }), "followup");
eq("citations task is other", groupOf({ kind: "custom", idx: 3600 }), "other");
eq("hand-added task is other", groupOf({ kind: "custom", idx: 1002 }), "other");
eq("type labels", [typeLabel({ kind: "custom", idx: 3000 }), typeLabel({ kind: "custom", idx: 3600 }), typeLabel({ kind: "custom", idx: 1001 }), typeLabel({ kind: "inmail", idx: 1 })], ["Approval", "AI citations", "Task", "InMail"]);
const ag = agenda([
  { kind: "request", idx: 1 }, { kind: "custom", idx: 1001 }, { kind: "custom", idx: 2005 }, { kind: "comment", idx: 2 },
  { kind: "comment", idx: 1 }, { kind: "reply", idx: 1 }, { kind: "custom", idx: 3000 }, { kind: "dm", idx: 1 },
]);
eq("agenda group order", ag.map((g) => g.key), ["comment", "post", "followup", "connect", "other"]);
eq("agenda order inside a group", ag[0].items.map((i) => `${i.kind}${i.idx}`), ["comment1", "comment2", "reply1", "custom2005"]);
eq("agenda leaves out empty groups", agenda([{ kind: "dm", idx: 1 }]).map((g) => g.key), ["followup"]);

// row action
eq("saved web link wins", primaryAction({ kind: "comment", idx: 1, link: "https://www.linkedin.com/posts/x" }, "s"), { label: "Open", href: "https://www.linkedin.com/posts/x", external: true });
eq("app link is internal", primaryAction({ kind: "custom", idx: 3600, link: "/w/s/citations" }, "s"), { label: "Open", href: "/w/s/citations", external: false });
eq("unsafe link is ignored", primaryAction({ kind: "custom", idx: 1001, link: "javascript:alert(1)" }, "s"), null);
eq("comment without link opens LinkedIn feed", primaryAction({ kind: "comment", idx: 1, link: "" }, "s")?.href, "https://www.linkedin.com/feed/");
eq("request goes to pipeline", primaryAction({ kind: "request", idx: 1 }, "s"), { label: "Who next", href: "/w/s/pipeline", external: false });
eq("plain task has no action", primaryAction({ kind: "custom", idx: 1001 }, "s"), null);

// needs ranking
eq("overdue follow-up grows with age", urgency({ kind: "followup", due: "2026-11-01" }, T) > urgency({ kind: "followup", due: "2026-11-05" }, T), true);
eq("overdue follow-up beats due today", urgency({ kind: "followup", due: "2026-11-05" }, T) > urgency({ kind: "followup", due: T }, T), true);
eq("post due today beats approval", urgency({ kind: "post", due: T }, T) > urgency({ kind: "approval" }, T), true);
eq("post in two days sits below approval", urgency({ kind: "post", due: "2026-11-08" }, T) < urgency({ kind: "approval" }, T), true);
eq("age is capped", urgency({ kind: "followup", due: "2025-01-01" }, T), 160);
const ranked = rankNeeds([
  { kind: "network" as const, id: "n" }, { kind: "today" as const, id: "t" }, { kind: "followup" as const, due: T, id: "f0" },
  { kind: "followup" as const, due: "2026-11-03", id: "f3" }, { kind: "citations" as const, id: "c" }, { kind: "approval" as const, id: "a" },
  { kind: "followup" as const, due: T, id: "f0b" },
], T);
eq("ranking order", ranked.map((r) => r.id), ["f3", "a", "f0", "f0b", "t", "c", "n"]);
eq("ranking keeps fields and adds score", [ranked[0].id, ranked[0].score], ["f3", 106]);

// copy
eq("when overdue", whenLabel("2026-11-03", T), "3 days overdue");
eq("when one day overdue", whenLabel("2026-11-05", T), "1 day overdue");
eq("when today", whenLabel(T, T), "Today");
eq("when tomorrow", whenLabel("2026-11-07", T), "Tomorrow");
eq("when later", whenLabel("2026-11-10", T), "In 4 days");
eq("when none", whenLabel(null, T), "");
eq("week sentence", weekSentence({ comments: 12, commentTarget: 25, posted: 1, planned: 3, overdue: 2, conversations: 4 }),
  "This week: 12 of 25 comments, 1 of 3 planned posts out, 2 follow-ups overdue. 4 people in conversation.");
eq("week sentence, quiet week", weekSentence({ comments: 0, commentTarget: 0, posted: 0, planned: 0, overdue: 0, conversations: 1 }),
  "This week: 0 comments, no posts planned, no follow-ups overdue. 1 person in conversation.");
const now = Date.parse("2026-11-06T15:00:00");
eq("rel just now", relTime(new Date(now - 20e3).toISOString(), now), "Just now");
eq("rel minutes", relTime(new Date(now - 12 * 6e4).toISOString(), now), "12m");
eq("rel hours", relTime(new Date(now - 3 * 36e5).toISOString(), now), "3h");
eq("rel yesterday", relTime(new Date(Date.parse("2026-11-05T10:00:00")).toISOString(), now), "Yesterday");
eq("rel older", relTime(new Date(Date.parse("2026-11-01T10:00:00")).toISOString(), now), "1 Nov");
eq("rel bad input", relTime("nope", now), "");

// count between (numbers that change after first view)
eq("count between starts at from", countBetween(4, 9, 0), 4);
eq("count between lands on to", countBetween(4, 9, 300), 9);
eq("count between going down", countBetween(9, 4, 9999), 4);
eq("count between moves toward to", countBetween(0, 10, 150) > 5, true);

// AI citations headline change in points
eq("points up", pointsDelta(40, 25), { diff: 15, dir: "up", text: "+15 pts" });
eq("points down", pointsDelta(10, 30), { diff: -20, dir: "down", text: "−20 pts" });
eq("points flat", pointsDelta(20, 20)?.text, "No change");
eq("points need both weeks", pointsDelta(20, null), null);

// settle order: open rows first, cleared rows sink, just-cleared rows wait
const rowsS = [{ id: "a", done: true }, { id: "b", done: false }, { id: "c", done: false, note: SKIP }, { id: "d", done: false }];
eq("settle sinks cleared rows", settleOrder(rowsS).map((r) => r.id), ["b", "d", "a", "c"]);
eq("settle holds a just-cleared row in place", settleOrder(rowsS, new Set(["a"])).map((r) => r.id), ["a", "b", "d", "c"]);
eq("settle keeps an all-open list", settleOrder([{ id: "x", done: false }, { id: "y", done: false }]).map((r) => r.id), ["x", "y"]);

console.log(fails ?`\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
