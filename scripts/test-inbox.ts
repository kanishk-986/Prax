// Checks the Inbox (X7): which leads count as in conversation, the three sources, folding a person's sources
// into one row, Done and Snooze by key, the ranking, and the labels. Run: node scripts/test-inbox.ts
import { buildInbox, inConversation, itemKey, scoreOf, waitLabel, dueLabel, snoozeDates, matchLead, daysSince, replyPrompt, WEIGHT, type InboxPipeline, type InboxLead } from "../src/lib/inbox.ts";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

const T = "2026-11-06"; // a Friday
const outreach: InboxPipeline = { id: "p1", template: "outreach", stages: ["Target", "Warming", "Requested", "Connected", "In conversation", "Resource sent", "Call booked", "Won", "Parked"], won_stage: "Won", lost_stage: "Parked" };
const banks: InboxPipeline = { id: "p2", template: "banks", stages: ["Identified", "Intro", "Discovery call", "Proposal", "Pilot", "Signed", "Parked"], won_stage: "Signed", lost_stage: "Parked" };

// in conversation
eq("outreach: Target is not a conversation", inConversation(outreach, "Target"), false);
eq("outreach: Requested is not a conversation", inConversation(outreach, "Requested"), false);
eq("outreach: Connected is", inConversation(outreach, "Connected"), true);
eq("outreach: Call booked is", inConversation(outreach, "Call booked"), true);
eq("outreach: Won is closed", inConversation(outreach, "Won"), false);
eq("outreach: Parked is closed", inConversation(outreach, "Parked"), false);
eq("banks: first stage is not", inConversation(banks, "Identified"), false);
eq("banks: Intro is", inConversation(banks, "Intro"), true);
eq("banks: Signed is closed", inConversation(banks, "Signed"), false);
eq("unknown stage is not", inConversation(banks, "Nope"), false);
eq("no pipeline: Outreach names", [inConversation(undefined, "In conversation"), inConversation(undefined, "Warming")], [true, false]);

// days and labels
eq("days since a date", daysSince("2026-11-01", T), 5);
eq("days since an ISO time", daysSince("2026-11-05T10:00:00", T), 1);
eq("future is zero", daysSince("2026-11-09", T), 0);
eq("wait labels", [0, 1, 4, 13, 14, 30].map(waitLabel), ["Today", "1 day", "4 days", "13 days", "2 weeks", "4 weeks"]);
eq("due labels", [dueLabel({ due: T, overdue: 0 }), dueLabel({ due: "2026-11-05", overdue: 1 }), dueLabel({ due: "2026-11-01", overdue: 5 }), dueLabel({ due: null, overdue: 0 })], ["Due today", "1 day overdue", "5 days overdue", ""]);
eq("snooze dates from a Friday", snoozeDates(T).map((s) => s.date), ["2026-11-07", "2026-11-08", "2026-11-09"]);
eq("snooze from a Monday goes a full week", snoozeDates("2026-11-02")[2].date, "2026-11-09");

// matching
const L = (id: string, o: Partial<InboxLead> = {}): InboxLead => ({ id, name: id, company: "", stage: "In conversation", next_action: "", next_date: null, linkedin: "", pipeline_id: "p1", stage_changed_at: "2026-11-01T09:00:00", created_at: "2026-10-01T09:00:00", ...o });
const leads = [L("a", { name: "Mariam Khan", linkedin: "https://www.linkedin.com/in/mariam-khan/" }), L("b", { name: "Omar Said" })];
eq("match by stored prospect", matchLead(leads, "b", "", "")?.id, "b");
eq("match by profile slug", matchLead(leads, null, "linkedin.com/in/Mariam-Khan?x=1", "")?.id, "a");
eq("match by full name, any case", matchLead(leads, null, "", " omar said ")?.id, "b");
eq("no match", matchLead(leads, null, "", "Someone Else"), undefined);

// sources
const base = { pipelines: [outreach, banks], replies: [], dms: [], states: [], today: T };
const r1 = buildInbox({ ...base, leads: [
  L("due", { name: "Due Today", next_date: T, next_action: "Send the agenda" }),
  L("late", { name: "Three Late", next_date: "2026-11-03" }),
  L("future", { name: "Not Yet", next_date: "2026-11-09" }),
  L("cold", { name: "Still Target", stage: "Target", next_date: "2026-11-01" }),
  L("won", { name: "Won Already", stage: "Won", next_date: "2026-11-01" }),
  L("none", { name: "No Date" }),
] });
eq("only conversation leads due today or earlier", r1.open.map((i) => i.person).sort(), ["Due Today", "Three Late"]);
eq("lead snippet is the next step", r1.open.find((i) => i.person === "Due Today")?.snippet, "Next step: Send the agenda");
eq("lead overdue days", r1.open.map((i) => [i.person, i.overdue]), [["Three Late", 3], ["Due Today", 0]]);
eq("lead key carries the due date", r1.open[0].key, itemKey.lead("late", "2026-11-03"));
eq("last touch sets the wait", buildInbox({ ...base, leads: [L("x", { next_date: T })], lastTouch: { x: "2026-10-27T10:00:00" } }).open[0].waited, 10);

const r2 = buildInbox({ ...base, leads: [], replies: [
  { id: "c1", author: "Ana Ruiz", author_url: "", url: "https://linkedin.com/feed/update/1", text: "I think settlement finality is the real gate here.", reply: true, replied_at: "2026-11-04T08:00:00", created_at: "2026-11-02T08:00:00" },
  { id: "c2", author: "No Reply", author_url: "", url: "", text: "x", reply: false, created_at: "2026-11-04T08:00:00" },
  { id: "c3", author: "Too Old", author_url: "", url: "", text: "x", reply: true, replied_at: "2026-09-01T08:00:00", created_at: "2026-09-01T08:00:00" },
  { id: "c4", author: "Before 026", author_url: "", url: "", text: "", reply: true, created_at: "2026-11-05T08:00:00" },
] });
eq("replies: only replied and recent", r2.open.map((i) => i.person), ["Ana Ruiz", "Before 026"]);
eq("reply waits from replied_at", r2.open[0].waited, 2);
eq("reply without replied_at waits from created_at", r2.open[1].waited, 1);
eq("reply snippet quotes the comment", r2.open[0].snippet.startsWith('Replied to your comment: "I think'), true);
eq("reply links to the post", r2.open[0].link, "https://linkedin.com/feed/update/1");

// folding: a lead with a due follow-up, a reply and a message is one row speaking as the message
const r3 = buildInbox({ ...base, leads: [L("a", { name: "Mariam Khan", company: "Gulf Bank", linkedin: "https://linkedin.com/in/mariam-khan", next_date: "2026-11-05" })],
  replies: [{ id: "c1", author: "Mariam Khan", author_url: "", url: "u", text: "x", reply: true, replied_at: "2026-11-02T08:00:00", created_at: "2026-11-01T08:00:00" }],
  dms: [{ id: "m1", person: "Mariam Khan", company: "", linkedin: "linkedin.com/in/mariam-khan/", thread_url: "https://linkedin.com/messaging/thread/9", body: "Could you share the custody paper?", received_at: "2026-11-05T09:00:00" },
        { id: "m2", person: "New Person", company: "Acme", linkedin: "", thread_url: "", body: "Hello", received_at: "2026-11-06T09:00:00" }] });
eq("one row per person", r3.open.map((i) => i.person).sort(), ["Mariam Khan", "New Person"]);
const mk = r3.open.find((i) => i.person === "Mariam Khan")!;
eq("folded row holds every key", mk.keys.sort(), [itemKey.dm("m1"), itemKey.lead("a", "2026-11-05"), itemKey.reply("c1")].sort());
eq("folded row speaks as the message", [mk.source, mk.snippet, mk.link], ["dm", "Could you share the custody paper?", "https://linkedin.com/messaging/thread/9"]);
eq("folded row waits from the earliest source (the last touch, 1 Nov)", mk.waited, 5);
eq("folded row keeps the company and lead", [mk.company, mk.prospectId], ["Gulf Bank", "a"]);
eq("folded row is overdue", mk.overdue, 1);
eq("folding adds weight", mk.score, scoreOf({ source: "dm", waited: 5, overdue: 1, sources: ["lead", "reply", "dm"] }));
eq("a message from a lead with nothing due takes the lead", buildInbox({ ...base, leads: [L("a", { name: "Mariam Khan", stage: "Warming" })], dms: [{ id: "m1", person: "Mariam Khan", company: "", linkedin: "", thread_url: "", body: "Hi", received_at: "2026-11-05T09:00:00" }] }).open[0].prospectId, "a");

// ranking: a message outranks an overdue follow-up of the same age, which outranks a reply; age adds
const r4 = buildInbox({ ...base,
  leads: [L("f", { name: "Follow Up", next_date: "2026-11-04", stage_changed_at: "2026-11-04T09:00:00" })],
  replies: [{ id: "c", author: "Reply Old", author_url: "", url: "", text: "", reply: true, replied_at: "2026-10-27T09:00:00", created_at: "2026-10-27T09:00:00" },
            { id: "d", author: "Reply New", author_url: "", url: "", text: "", reply: true, replied_at: "2026-11-04T09:00:00", created_at: "2026-11-04T09:00:00" }],
  dms: [{ id: "m", person: "Message", company: "", linkedin: "", thread_url: "", body: "", received_at: "2026-11-04T09:00:00" }] });
eq("ranking order", r4.open.map((i) => i.person), ["Reply Old", "Message", "Follow Up", "Reply New"]);
eq("scores", r4.open.map((i) => i.score), [WEIGHT.reply + 30, WEIGHT.dm + 6, WEIGHT.lead + 6 + 8, WEIGHT.reply + 6]);
eq("ties go to the longest wait, then name", buildInbox({ ...base, leads: [], dms: [
  { id: "1", person: "Zed", company: "", linkedin: "", thread_url: "", body: "", received_at: "2026-11-05T09:00:00" },
  { id: "2", person: "Amy", company: "", linkedin: "", thread_url: "", body: "", received_at: "2026-11-05T10:00:00" },
  { id: "3", person: "Bob", company: "", linkedin: "", thread_url: "", body: "", received_at: "2026-11-05T09:00:00" }] }).open.map((i) => i.person), ["Bob", "Zed", "Amy"]);
eq("the wait caps at 30 days", scoreOf({ source: "reply", waited: 90, overdue: 0, sources: ["reply"] }), WEIGHT.reply + 90);

// done and snooze
const dm = (id: string, person: string) => ({ id, person, company: "", linkedin: "", thread_url: "", body: "", received_at: "2026-11-05T09:00:00" });
const r5 = buildInbox({ ...base, leads: [], dms: [dm("1", "Done Person"), dm("2", "Snoozed Person"), dm("3", "Woke Up"), dm("4", "Open Person")], states: [
  { key: itemKey.dm("1"), done_at: "2026-11-05T12:00:00", snoozed_until: null },
  { key: itemKey.dm("2"), done_at: null, snoozed_until: "2026-11-09" },
  { key: itemKey.dm("3"), done_at: null, snoozed_until: T },
] });
eq("done rows leave", r5.done, 1);
eq("snoozed rows wait in Snoozed", r5.snoozed.map((i) => [i.person, i.until]), [["Snoozed Person", "2026-11-09"]]);
eq("a snooze ending today is open again", r5.open.map((i) => i.person).sort(), ["Open Person", "Woke Up"]);
const leadDone = buildInbox({ ...base, leads: [L("a", { next_date: T })], states: [{ key: itemKey.lead("a", "2026-11-05"), done_at: "2026-11-05T12:00:00", snoozed_until: null }] });
eq("a new due date brings a done lead back", leadDone.open.length, 1);
const partly = buildInbox({ ...base, leads: [L("a", { name: "Mariam Khan", next_date: T })], dms: [{ ...dm("m", "Mariam Khan") }], states: [{ key: itemKey.dm("m"), done_at: "2026-11-05T12:00:00", snoozed_until: null }] });
eq("a folded row stays while a source is open", [partly.open.length, partly.open[0]?.keys], [1, [itemKey.lead("a", T)]]);

// the AI prompt
const pr = replyPrompt({ person: "Mariam Khan", company: "Gulf Bank", source: "dm", snippet: "Could you share the paper?", stage: "In conversation" }, "Layla Haddad, Head of Digital Assets at Example");
eq("prompt names both people", pr.includes("from Layla Haddad, Head of Digital Assets at Example to Mariam Khan at Gulf Bank"), true);
eq("prompt quotes the message", pr.includes('They wrote: "Could you share the paper?"'), true);
eq("prompt keeps the voice rules", /no em dashes, no contractions/.test(pr), true);

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
