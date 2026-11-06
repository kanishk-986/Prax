// Checks the Dashboard and Today maths: progress and skips, deltas, week over week, daily series, count-up,
// agenda grouping, the row action, Needs you ranking and the copy helpers. Run: node scripts/test-dashboard.ts
import {
  plusDays, mondayOf, daysBetween, SKIP, isSkipped, skipNote, unskipNote, progressOf, deltaOf, weekOverWeek, dailySeries, countAt,
  groupOf, typeLabel, agenda, primaryAction, commentDays, weeklyCommentTarget, prefillToday, pageName, urgency, rankNeeds, whenLabel, weekSentence, relTime, countBetween, pointsDelta, settleOrder, collapseActivity, firstName, greeting, activitySentence, activityFeed, postTiming, dubaiNow,
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
eq("unsent Discovery topics sit below today, above the citations reminder", urgency({ kind: "discovery" }, T) < urgency({ kind: "today" }, T) && urgency({ kind: "discovery" }, T) > urgency({ kind: "citations" }, T), true);
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

const acts = [
  { kind: "comment", text: "Comment done", when: "2m" }, { kind: "comment", text: "Comment done", when: "5m" }, { kind: "comment", text: "Comment done", when: "9m" },
  { kind: "stage", text: "Jimena moved to Warming", when: "10m" },
  { kind: "request", text: "Connection request done: Igor Pesin", when: "11m" }, { kind: "request", text: "Connection request done: Prajit Nanu", when: "12m" },
  { kind: "request", text: "Connection request done: Igor Pesin", when: "13m" },
  { kind: "stage", text: "Jimena moved to Warming", when: "14m" }, { kind: "stage", text: "Igor moved to Connected", when: "15m" },
];
const col = collapseActivity(acts);
eq("repeats collapse to one row each", col.map((r) => [r.text, r.count]), [["Comment done", 3], ["Jimena moved to Warming", 1], ["Connection request done", 3], ["Jimena moved to Warming", 1], ["Igor moved to Connected", 1]]);
eq("the newest time is kept", col[0].when, "2m");
eq("the detail lists who, once each", col[2].detail, "Igor Pesin, Prajit Nanu");
eq("identical rows have no detail", col[0].detail, undefined);
eq("a single row keeps its full text", collapseActivity([{ kind: "request", text: "Connection request done: Igor Pesin" }])[0].text, "Connection request done: Igor Pesin");
eq("first name from the profile", firstName("Alok Diwan", "diwan.alok@antiersolutions.com"), "Alok");
eq("first name from the email", firstName("", "kanishk.raj@antiersolutions.com"), "Kanishk");
eq("no name from an unreadable email", firstName("", "x1@antier.com"), "");
eq("greeting with a name", greeting(9, "Alok"), "Good morning, Alok");
eq("greeting in the afternoon", greeting(13, "Alok"), "Good afternoon, Alok");
eq("greeting without a name", greeting(20, ""), "Good evening");

// one weekly comment count (Dashboard and Engagement)
eq("ticked and logged on the same day count once", commentDays(["2026-11-05", "2026-11-05"], ["2026-11-05"]), ["2026-11-05", "2026-11-05"]);
eq("only logged still counts", commentDays([], ["2026-11-04T10:00:00Z"]), ["2026-11-04"]);
eq("days merge in order", commentDays(["2026-11-06"], ["2026-11-03", "2026-11-03"]), ["2026-11-03", "2026-11-03", "2026-11-06"]);
eq("the audit case: 5 ticks and 0 logs is 5 on both screens", weekOverWeek(commentDays(Array(5).fill("2026-11-05"), []), T).now, 5);
eq("weekly target is five working days", weeklyCommentTarget(6), 30);
eq("no quota, no target", weeklyCommentTarget(0), 0);

// Today prefill
{
  const L = (id: string, name: string, stage: string, next_date: string | null, next_action = "", linkedin = "") => ({ id, name, company: "Bank " + id, stage, next_action, next_date, linkedin });
  const leads = [
    L("a", "Jimena Santillán", "Warming", "2026-11-04", "Comment on her post about stablecoin rails", "https://www.linkedin.com/in/jimena/"),
    L("b", "Kirill Gertman", "Connected", "2026-11-05", "Send the first message"),
    L("c", "Priya Raman", "Warming", "2026-11-06"),
    L("d", "Omar Haddad", "Target", "2026-11-09"),
    L("e", "Old Lead", "Parked", "2026-11-01"),
  ];
  const it = (id: string, kind: string, idx: number, extra: Record<string, unknown> = {}) => ({ id, kind, idx, title: "", done: false, note: "", prospect_id: null, ...extra });
  const items = [it("c1", "comment", 1), it("c2", "comment", 2), it("c3", "comment", 3), it("c4", "comment", 4), it("r1", "request", 1), it("r2", "request", 2), it("m1", "dm", 1), it("m2", "dm", 2), it("p1", "reply", 1)];
  const findings = [{ id: "f1", title: "Stablecoin rails in the GCC", url: "https://www.linkedin.com/posts/x", source_type: "LinkedIn", status: "new", comment_target: true, found_at: "2026-11-05T08:00:00Z", found: { linkedin: { author: "Ali Khan" } } },
    { id: "f2", title: "Old news", url: "https://example.com/a", source_type: "Major media", status: "new", comment_target: false, found_at: "2026-11-05T08:00:00Z" }];
  const posts = [{ id: "po", title: "Why GCC banks will not lose to stablecoins", status: "Posted", publish_date: "2026-11-03", url: "https://www.linkedin.com/feed/update/1" }];
  const s = prefillToday(items, { leads, findings, posts, slug: "x", today: T });
  eq("first comment is the most overdue person, with the next action", s.c1?.title, "Jimena Santillán: Comment on her post about stablecoin rails");
  eq("the comment opens their recent activity", s.c1?.href, "https://www.linkedin.com/in/jimena/recent-activity/all/");
  eq("next comments follow Do next order, skipping people to message", [s.c2?.title, s.c3?.title], ["Comment on Priya Raman's latest post", "Comment on Omar Haddad's latest post"]);
  eq("people run out, then Discovery's LinkedIn finding", s.c4?.title, "Comment on Ali Khan's post: Stablecoin rails in the GCC");
  eq("each person once a day: nobody left for requests", s.r1, undefined);
  eq("messages go to connected people", [s.m1?.title, s.m2], ["Message Kirill Gertman: Send the first message", undefined]);
  eq("parked leads are never suggested", Object.values(s).some((x) => x.title.includes("Old Lead")), false);
  eq("replies point at the latest own post", s.p1?.title, 'Reply to the comments on "Why GCC banks will not lose to stablecoins"');
  const s2 = prefillToday([it("r1", "request", 1), it("m1", "dm", 1), it("c1", "comment", 1)], { leads, slug: "x", today: T });
  eq("comments take the first Warming person", s2.c1?.title, "Jimena Santillán: Comment on her post about stablecoin rails");
  eq("requests take the next one left", s2.r1?.title, "Send Priya Raman, Bank c, a connection request");
  eq("messages take Connected people", s2.m1?.title, "Message Kirill Gertman: Send the first message");
  eq("a message links to the lead in Pipeline", s2.m1?.href, "/w/x/pipeline?p=b");
  const kept = prefillToday([it("c1", "comment", 1, { title: "My own plan" }), it("c2", "comment", 2, { done: true }), it("c3", "comment", 3, { note: "skip:" }), it("c4", "comment", 4, { prospect_id: "a" })], { leads, slug: "x", today: T });
  eq("typed, done, skipped and linked rows are left alone", Object.keys(kept), []);
  eq("a person already on a row is not suggested again", prefillToday([it("c1", "comment", 1), it("c2", "comment", 2, { prospect_id: "a" })], { leads, slug: "x", today: T }).c1?.title, "Comment on Priya Raman's latest post");
  eq("no data keeps the placeholder", prefillToday(items, { leads: [], slug: "x", today: T }), {});
}

// page names instead of raw addresses
{
  const nav = [{ href: "", label: "Dashboard" }, { href: "/today", label: "Today" }, { href: "/studio", label: "Comment Studio" }, { href: "/studio-content", label: "Content Studio" }, { href: "/citations", label: "AI citations" }];
  eq("a Prax address becomes the page name", pageName("/w/shashi-pal-p16q/citations", "shashi-pal-p16q", nav), "AI citations");
  eq("a query string is ignored", pageName("/w/s/studio-content?tab=plan", "s", nav), "Content Studio");
  eq("studio is not studio-content", pageName("/w/s/studio", "s", nav), "Comment Studio");
  eq("the workspace root is the Dashboard", pageName("/w/s", "s", nav), "Dashboard");
  eq("outside links stay as they are", pageName("https://www.linkedin.com/feed/", "s", nav), "https://www.linkedin.com/feed/");
  eq("empty stays empty", pageName("", "s", nav), "");
}

// ---------- D5: activity as sentences ----------
{
  const t = (kind: string, label: string) => activitySentence({ kind, label });
  eq("accepted request is a win", [t("stage", "Thomas Pinter → Connected").text, t("stage", "Thomas Pinter → Connected").win], ["Thomas Pinter accepted your connection request", true]);
  eq("call booked is a win", t("stage", "Hessa Al Marri → Call booked").text, "Hessa Al Marri booked a call with you");
  eq("parked is not a win", [t("stage", "Omar Saleh → Parked").text, t("stage", "Omar Saleh → Parked").win], ["You parked Omar Saleh for now", false]);
  eq("a custom stage", t("stage", "Ana Ruiz → Pilot").text, "Ana Ruiz moved to Pilot");
  eq("signed is a win", t("stage", "Ana Ruiz → Signed").win, true);
  eq("their reply is a win", [t("reply", "Hessa Al Marri replied").text, t("reply", "Hessa Al Marri replied").win], ["Hessa Al Marri replied to your comment", true]);
  eq("a logged comment names the person", t("comment", "Commented on Arjun Mehta").text, "You commented on Arjun Mehta's post");
  eq("possessive of a name ending in s", t("comment", "Commented on James").text, "You commented on James' post");
  eq("a Today comment tick with a person", t("comment", "Comment on Daniel Okafor's latest post").text, "You commented on Daniel Okafor's post");
  eq("a Today comment tick without a title", [t("comment", "comment").text, t("comment", "comment").detail], ["You left a comment", ""]);
  eq("a request tick", t("request", "Send Rania Khoury, Qasr Digital Bank, a connection request").text, "You sent Rania Khoury a connection request");
  eq("a message tick", t("dm", "Message Arjun Mehta: share the note").text, "You messaged Arjun Mehta");
  eq("a reply round", t("reply", "reply").text, "You answered the comments on your post");
  eq("a custom task keeps its title as detail", [t("custom", "Pitch the panel").text, t("custom", "Pitch the panel").detail], ["You finished a task on Today", "Pitch the panel"]);
  const feed = activityFeed([
    { kind: "comment", label: "Commented on Daniel Okafor" }, { kind: "comment", label: "comment" },
    { kind: "comment", label: "Commented on Hessa Al Marri" }, { kind: "comment", label: "comment" },
    { kind: "stage", label: "Hessa Al Marri → Connected" }, { kind: "stage", label: "Hessa Al Marri → Connected" },
    { kind: "request", label: "request" },
  ]);
  eq("a logged comment and its tick count once", [feed[0].text, feed[0].count, feed[0].detail], ["You commented on 2 posts", 2, "Daniel Okafor, Hessa Al Marri"]);
  eq("identical stage rows show once", [feed[1].text, feed.length], ["Hessa Al Marri accepted your connection request", 3]);
  eq("a single row keeps its sentence", feed[2].text, "You sent a connection request");
  eq("one comment logged and ticked reads as one", activityFeed([{ kind: "comment", label: "Commented on Ann Lee" }, { kind: "comment", label: "comment" }])[0].text, "You commented on Ann Lee's post");
}

// ---------- T6: post reminders at the planned time ----------
{
  const p = (d: string | null, time: string, status = "Ready") => ({ status, publish_date: d, planned_time: time });
  const now = { day: T, hm: "09:00" };
  eq("at its time it is due now", postTiming(p(T, "09:00"), now), "now");
  eq("ten minutes before is soon", postTiming(p(T, "09:10"), now), "soon");
  eq("an hour before is later", postTiming(p(T, "10:00"), now), "later");
  eq("within the hour after is still now", postTiming(p(T, "08:00"), now), "now");
  eq("more than an hour after is late", postTiming(p(T, "07:30"), now), "late");
  eq("an earlier day is late", postTiming(p("2026-11-05", "18:00"), now), "late");
  eq("no time set is dated", postTiming(p(T, ""), now), "dated");
  eq("posted is done", postTiming(p(T, "09:00", "Posted"), now), "done");
  eq("on hold is done", postTiming(p(T, "09:00", "On hold"), now), "done");
  eq("Dubai clock is UTC+4", dubaiNow(new Date("2026-11-06T22:30:00Z")), { day: "2026-11-07", hm: "02:30" });
}

console.log(fails ?`\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
