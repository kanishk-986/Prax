// Checks the Strategy canvas logic: the if/else rules engine, the layout of lanes and branches, the keyboard moves,
// zoom and fit, insert order, the write-through to settings, templates and copy. Run: node scripts/test-strategy.ts
import { readFileSync } from "node:fs";
import {
  testCondition, evaluate, adviceFor, commentTasks, preferredAngle, raisedCompanies, strategySteps, orderLeads, commentTarget,
  layout, nearest, fitView, zoomAt, insertSort, laneOf, descendants, CARD, GAP,
  writesFor, mergeWrites, applyWrites, readFromSettings, valuesOf, cleanConfig, templateNodes, flatten, copyNodes, strategyName, addable,
  affectsOf, affectsLine, subtitleOf, conditionText, strategyNote, ruleFromNote, isStrategyNote, hiddenFor, TEMPLATES,
  type StrategyNode, type LiveSettings, type LeadFacts,
  RAISE_POINTS,
} from "../src/lib/strategy.ts";
import { buyersOf, buyerWords, ruleScore, scorePrompt, priority } from "../src/lib/discovery.ts";
import { withPlan, defaultBrief, slotDates } from "../src/lib/campaigns.ts";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const FRI = "2026-11-06", MON = "2026-11-09";
const N = (id: string, type: StrategyNode["type"], config: Record<string, any> = {}, o: Partial<StrategyNode> = {}): StrategyNode =>
  ({ id, strategy_id: "s", type, title: o.title ?? "", parent_id: o.parent_id ?? null, branch: o.branch ?? "", sort: o.sort ?? 0, config, editor_only: false });
const lead = (id: string, o: Partial<LeadFacts> = {}): LeadFacts => ({ id, name: id, company: o.company ?? "", segment: o.segment ?? "", region: o.region ?? "", stage: o.stage ?? "Target", heat: o.heat ?? "Cold", warm: o.warm ?? false, overdue: o.overdue ?? false });

// ---------- conditions ----------
const L1 = lead("a", { segment: "A", region: "UAE", stage: "Warming", heat: "Warm", company: "First Abu Dhabi Bank", warm: true, overdue: true });
eq("segment is A", testCondition({ fact: "segment", op: "is", value: "A" }, { day: FRI, lead: L1 }), true);
eq("segment is one of B, C", testCondition({ fact: "segment", op: "is", value: "B, C" }, { day: FRI, lead: L1 }), false);
eq("segment is not B", testCondition({ fact: "segment", op: "not", value: "B" }, { day: FRI, lead: L1 }), true);
eq("region ignores case", testCondition({ fact: "region", op: "is", value: "uae" }, { day: FRI, lead: L1 }), true);
eq("company contains", testCondition({ fact: "company", op: "contains", value: "abu dhabi" }, { day: FRI, lead: L1 }), true);
eq("stage is Warming", testCondition({ fact: "stage", op: "is", value: "Warming" }, { day: FRI, lead: L1 }), true);
eq("heat at least Warm for Warm", testCondition({ fact: "heat", op: "atleast", value: "Warm" }, { day: FRI, lead: L1 }), true);
eq("heat at least Hot for Warm", testCondition({ fact: "heat", op: "atleast", value: "Hot" }, { day: FRI, lead: L1 }), false);
eq("warm path yes", testCondition({ fact: "warm", op: "is", value: "yes" }, { day: FRI, lead: L1 }), true);
eq("warm path no", testCondition({ fact: "warm", op: "is", value: "no" }, { day: FRI, lead: L1 }), false);
eq("overdue yes", testCondition({ fact: "overdue", op: "is", value: "yes" }, { day: FRI, lead: L1 }), true);
eq("day is Fri on a Friday", testCondition({ fact: "day", op: "is", value: "Mon, Fri" }, { day: FRI }), true);
eq("day is Friday spelt out", testCondition({ fact: "day", op: "is", value: "Friday" }, { day: FRI }), true);
eq("day is not Mon on a Monday", testCondition({ fact: "day", op: "not", value: "Mon" }, { day: MON }), false);
eq("a lead fact without a lead is unknown", testCondition({ fact: "segment", op: "is", value: "A" }, { day: FRI }), null);
eq("a bad fact falls back to segment", cleanConfig("condition", { fact: "nope", op: "zz" }), { fact: "segment", op: "is", value: "" });

// ---------- evaluate ----------
const flow: StrategyNode[] = [
  N("q", "quota", {}, { sort: 1 }),
  N("c1", "condition", { fact: "segment", op: "is", value: "A" }, { sort: 2, title: "Fintech buyers" }),
  N("y1", "action", { kind: "comments", count: 2 }, { parent_id: "c1", branch: "yes", sort: 1 }),
  N("y2", "action", { kind: "template", template: "Fintech intro" }, { parent_id: "c1", branch: "yes", sort: 2 }),
  N("n1", "action", { kind: "next", text: "Read their last posts" }, { parent_id: "c1", branch: "no", sort: 1 }),
  N("c2", "condition", { fact: "day", op: "is", value: "Mon" }, { sort: 3 }),
  N("y3", "action", { kind: "angle", text: "The Monday operator view" }, { parent_id: "c2", branch: "yes", sort: 1 }),
  N("m1", "action", { kind: "priority" }, { sort: 4, title: "Raise everyone" }),
  N("note", "note", { text: "hi" }, { sort: 5 }),
];
const fA = evaluate(flow, { day: FRI, lead: L1 });
eq("Yes lane fires in order, with the condition's name", fA.map((f) => [f.node, f.rule]), [["y1", "Fintech buyers"], ["y2", "Fintech buyers"], ["m1", "Raise everyone"]]);
const fB = evaluate(flow, { day: MON, lead: lead("b", { segment: "B" }) });
eq("No lane fires; an unnamed condition is named by its test", fB.map((f) => [f.node, f.rule]), [["n1", "Fintech buyers"], ["y3", "If day of the week is Mon"], ["m1", "Raise everyone"]]);
eq("without a lead, lead conditions are skipped (neither lane)", evaluate(flow, { day: MON }).map((f) => f.node), ["y3", "m1"]);
const adv = adviceFor(flow, { day: FRI, lead: L1 });
eq("advice: template, comments and priority", [adv.template?.name, adv.comments?.[0].count, adv.priority?.rule, adv.next], ["Fintech intro", 2, "Raise everyone", undefined]);
eq("advice: the next action on the No lane", adviceFor(flow, { day: FRI, lead: lead("b", { segment: "B" }) }).next, { text: "Read their last posts", rule: "Fintech buyers" });
eq("touch plan steps from the rules", strategySteps(adv).map((s) => s.text), ['Send the connection request with the "Fintech intro" template', "Comment on a recent post before the next step"]);
const nested: StrategyNode[] = [
  N("c", "condition", { fact: "segment", op: "is", value: "A" }, { sort: 1, title: "Outer" }),
  N("cc", "condition", { fact: "heat", op: "is", value: "Hot" }, { parent_id: "c", branch: "yes", sort: 1, title: "Inner" }),
  N("x", "action", { kind: "priority" }, { parent_id: "cc", branch: "yes", sort: 1 }),
  N("z", "action", { kind: "comments", count: 1 }, { parent_id: "cc", branch: "no", sort: 1 }),
];
eq("nested condition: inner rule name", evaluate(nested, { day: FRI, lead: lead("h", { segment: "A", heat: "Hot" }) }).map((f) => [f.node, f.rule]), [["x", "Inner"]]);
eq("nested condition: outer No skips the inner one", evaluate(nested, { day: FRI, lead: lead("h", { segment: "B", heat: "Hot" }) }), []);

// ---------- comment tasks, angle, raised ----------
const leads = [lead("l1", { segment: "A" }), lead("l2", { segment: "B" }), lead("l3", { segment: "A" }), lead("l4", { segment: "A" })];
eq("comment tasks: count per action, matching leads in order", commentTasks(flow, leads, FRI).map((t) => [t.lead.id, t.rule]), [["l1", "Fintech buyers"], ["l3", "Fintech buyers"]]);
eq("comment tasks skip leads already on Today", commentTasks(flow, leads, FRI, new Set(["l1"])).map((t) => t.lead.id), ["l3", "l4"]);
eq("preferred angle on a Monday", preferredAngle(flow, MON), { text: "The Monday operator view", rule: "If day of the week is Mon" });
eq("no preferred angle on a Friday", preferredAngle(flow, FRI), null);
eq("raised companies", [...raisedCompanies(flow, [lead("r", { company: "Mashreq Bank" }), lead("s")], FRI).entries()], [["mashreq bank", "Raise everyone"]]);
eq("order: raised first, then segment weight, else as given", orderLeads([{ id: "1", segment: "B" }, { id: "2", segment: "A" }, { id: "3", segment: "C", company: "Wio" }], { A: 40, B: 10 }, new Map([["wio", "r"]])).map((x) => x.id), ["3", "2", "1"]);
eq("weekly comment target from the goal", commentTarget({ comments_week: 30 }, 8), 30);
eq("weekly comment target falls back to quota x 5", commentTarget(null, 8), 40);

// ---------- Today notes ----------
const note = strategyNote("y1", "Fintech buyers");
eq("note carries the rule name", [ruleFromNote(note), ruleFromNote("skip:" + note), isStrategyNote("skip:" + note), ruleFromNote("pipeline:x:y:0")], ["Fintech buyers", "Fintech buyers", true, ""]);

// ---------- layout ----------
const line = [N("a", "goal", {}, { sort: 1 }), N("b", "quota", {}, { sort: 2 }), N("c", "note", {}, { sort: 3 })];
const L = layout(line);
eq("main flow: one column, a gap between cards", L.nodes.map((n) => [n.x, n.y]), [[0, GAP], [0, GAP + CARD.h + GAP], [0, GAP + 2 * (CARD.h + GAP)]]);
eq("a + above the first node and after every node", L.plus.map((p) => [p.index, p.lane]), [[0, false], [1, false], [2, false], [3, false]]);
eq("the + between two nodes is centred on the connector", [L.plus[1].x, L.plus[1].y], [CARD.w / 2, GAP + CARD.h + GAP / 2]);
eq("width is one card", L.width, CARD.w);
const br = layout([N("c", "condition", {}, { sort: 1 }), N("y", "action", {}, { parent_id: "c", branch: "yes", sort: 1 }), N("z", "note", {}, { sort: 2 })]);
const pos = Object.fromEntries(br.nodes.map((n) => [n.id, n]));
eq("Yes lane sits left of the condition, empty No lane right", [pos.y.x < pos.c.x, br.plus.some((p) => p.branch === "no" && p.empty)], [true, true]);
eq("lane width: two lanes and the gap", br.width, CARD.w * 2 + 56);
eq("node after the condition sits below both lanes, centred", [pos.z.x, pos.z.y > pos.y.y + CARD.h], [pos.c.x, true]);
eq("fork edges are labelled Yes and No", br.edges.filter((e) => e.label).map((e) => e.label), ["Yes", "No"]);
eq("the rejoin edge exists", br.edges.some((e) => e.key === "e:c:join"), true);
const right = layout(line, "right");
eq("left to right puts the flow on x", [right.nodes[1].x > right.nodes[0].x, right.nodes[0].y === right.nodes[1].y], [true, true]);
eq("lane helpers", [laneOf(flow, "c1", "yes").map((n) => n.id), descendants("c1", flow).map((n) => n.id)], [["y1", "y2"], ["y1", "y2", "n1"]]);

// ---------- keyboard, zoom, fit ----------
eq("down from the condition goes to a lane", ["y"].includes(nearest(br.nodes, "c", "ArrowDown") ?? ""), true);
eq("down from the lane goes to the node after", nearest(br.nodes, "y", "ArrowDown"), "z");
eq("nothing to the left of the Yes lane", nearest(br.nodes, "y", "ArrowLeft"), null);
eq("no selection picks the top node", nearest(br.nodes, null, "ArrowDown"), "c");
const fv = fitView({ width: 600, height: 2000 }, { width: 1000, height: 800 });
eq("fit: height decides, never under 0.25", fv.z, 0.352);
eq("fit: never above 100%", fitView({ width: 100, height: 100 }, { width: 1000, height: 800 }).z, 1);
const zv = zoomAt({ x: 0, y: 0, z: 1 }, 1.25, { x: 100, y: 100 });
eq("zoom keeps the point under the cursor still", [zv.z, zv.x, zv.y], [1.25, -25, -25]);
eq("zoom is clamped", zoomAt({ x: 0, y: 0, z: 1.6 }, 2, { x: 0, y: 0 }).z, 1.6);
eq("insert at the end", insertSort([1024, 2048], 2), { sort: 3072, renumber: null });
eq("insert between", insertSort([1024, 2048], 1), { sort: 1536, renumber: null });
eq("insert first", insertSort([1024], 0), { sort: 0, renumber: null });
eq("insert with no room renumbers", insertSort([5, 6], 1), { sort: 2048, renumber: [1024, 3072] });

// ---------- write-through ----------
const S: LiveSettings = { quotas: { comment: 8, request: 15, dm: 5, inmail: 1, reply: 1 }, pillars: ["Agentic Finance"], regions: ["GCC", "India"], segments: { A: "Fintech & payments" }, segment_weights: { A: 50 },
  voice: "Rules", tuning: { length: "medium", tone: "balanced", question: "sometimes", creativity: 0.5 }, safety: { dailyCap: 40, vips: ["X"] }, plan: {} };
eq("quota writes workspaces.quotas", writesFor("quota", { comment: 3, request: 99, dm: "2", inmail: -1, reply: 1 }, S), [{ table: "workspaces", patch: { quotas: { comment: 3, request: 50, dm: 2, inmail: 0, reply: 1 } } }]);
eq("pillars write a clean list", writesFor("pillars", { pillars: [" A ", "A", "B", ""] }, S), [{ table: "workspaces", patch: { pillars: ["A", "B"] } }]);
eq("audience writes names and weights, blanks left out", writesFor("audience", { segments: { A: { name: "Banks", weight: 60 }, B: { name: "", weight: 40 } } }, S),
  [{ table: "workspaces", patch: { segments: { A: "Banks" }, segment_weights: { A: 60, B: 40 } } }]);
eq("comment rules keep the other tuning and safety fields", writesFor("comments", { voice: "V", length: "short", tone: "warm", question: "never", dailyCap: 20 }, S)[1].patch,
  { tuning: { length: "short", tone: "warm", question: "never", creativity: 0.5 }, safety: { dailyCap: 20, vips: ["X"] } });
eq("content writes content_settings.plan; days decide posts a week", writesFor("content", { ppw: 5, days: [4, 0, 2], formats: ["Carousel", "Nope"] }, S), [{ table: "content_settings", patch: { plan: { ppw: 3, days: [0, 2, 4], formats: ["Carousel"] } } }]);
eq("goal, condition, action and note write nothing", ["goal", "condition", "action", "note"].map((t) => writesFor(t as never, {}, S).length), [0, 0, 0, 0]);
eq("writes merge per table", mergeWrites([...writesFor("quota", S.quotas, S), ...writesFor("pillars", { pillars: ["P"] }, S)]).map((w) => [w.table, Object.keys(w.patch)]), [["workspaces", ["quotas", "pillars"]]]);
const after = applyWrites(S, writesFor("quota", { comment: 2, request: 1, dm: 1, inmail: 0, reply: 0 }, S));
eq("after a save, the app reads the new quota", [after.quotas.comment, readFromSettings("quota", after)?.comment], [2, 2]);
eq("round trip: what is read back is what was written", readFromSettings("audience", applyWrites(S, writesFor("audience", { segments: { C: { name: "Partners", weight: 25 } } }, S)))?.segments.C, { name: "Partners", weight: 25 });
eq("active strategy shows live settings, a draft its own", [valuesOf({ type: "quota", config: { comment: 1 } }, true, S).comment, valuesOf({ type: "quota", config: { comment: 1 } }, false, S).comment], [8, 1]);

// ---------- templates and copy ----------
let k = 0; const id = () => `n${++k}`;
const tpl = flatten(templateNodes("outreach", S), "s1", id);
eq("outreach template: a condition with a Yes and a No action", tpl.filter((n) => n.parent_id).map((n) => [n.branch, n.config.kind]), [["yes", "next"], ["no", "comments"]]);
eq("templates keep the profile's pillars", templateNodes("authority", S).find((d) => d.type === "pillars")?.config.pillars, ["Agentic Finance"]);
eq("templates keep the profile's segment names", templateNodes("authority", S).find((d) => d.type === "audience")?.config.segments.A, { name: "Fintech & payments", weight: 40 });
const cur = templateNodes("current", S, [{ title: "Who does what", body: "Alok runs it" }, { title: "Positioning", body: "Text" }]);
eq("from current settings: live quota and the notes, team note editor only", [cur.find((d) => d.type === "quota")?.config.comment, cur.filter((d) => d.type === "note").map((d) => [d.title, !!d.editor_only])], [8, [["Who does what", true], ["Positioning", false]]]);
eq("every template has a goal", TEMPLATES.map((t) => templateNodes(t.key, S)[0].type), ["goal", "goal", "goal", "goal", "goal"]);
const cp = copyNodes(tpl, "s2", id);
eq("duplicate remaps parents", cp.filter((n) => n.parent_id).every((n) => cp.some((p) => p.id === n.parent_id)), true);
eq("names: Authority builder 2", strategyName("Authority builder", ["Authority builder"]), "Authority builder 2");
eq("singletons once; lanes take conditions, actions and notes", [addable([{ type: "quota" }], false).includes("quota"), addable([], true)], [false, ["condition", "action", "note"]]);
eq("affects: settings node", affectsLine(affectsOf({ id: "q", type: "quota", config: {} })), "Affects: Today quota · Dashboard");
eq("affects: a condition affects what its actions affect", affectsOf(flow[1], flow), ["Today", "Pipeline touch plan", "Pipeline next step"]);
eq("affects: a note affects nothing", affectsLine(affectsOf({ id: "x", type: "note", config: {} })), "Affects nothing in the app");
eq("subtitles", [subtitleOf("quota", S.quotas), subtitleOf("content", { days: [0, 2] }), subtitleOf("pillars", { pillars: [] })], ["8 comments · 15 requests · 5 messages · 1 InMail · 1 reply round", "2 posts a week on Mon, Wed", "None yet"]);
eq("condition text uses segment names", conditionText({ fact: "segment", op: "is", value: "A" }, { A: "Fintech & payments" }), "If segment is Fintech & payments");
eq("team notes hidden from viewers only", [hiddenFor({ editor_only: false, title: "Who does what" }, false), hiddenFor({ editor_only: true, title: "x" }, true)], [true, false]);

// ---------- the sections that read what the canvas writes ----------
const after2 = applyWrites(S, writesFor("audience", { segments: { A: { name: "Fintech & payments", weight: 60 }, B: { name: "Gulf banks", weight: 30 }, C: { name: "Media", weight: 0 } } }, S));
const buyers = buyersOf(after2.segments, after2.segment_weights);
eq("Discovery buyers: weighted segments, heaviest first, zero left out", buyers, ["Fintech & payments", "Gulf banks"]);
eq("Discovery buyer words", buyerWords(buyers), ["fintech", "payments", "gulf", "banks"]);
const art = { url: "https://example.com/a", title: "Remittance operators in Kenya face a new licence regime", excerpt: "", published: FRI, confirmed: true };
eq("buyer fit rises when the Audience names the buyer", [ruleScore(art, FRI, ["Agentic Finance"]).scores[0], ruleScore(art, FRI, ["Agentic Finance"], ["Remittance operators"]).scores[0]], [4, 5]);
eq("the AI scoring prompt names the buyers", scorePrompt([], [], "X", [], buyers).includes("Fintech & payments, Gulf banks in that order of weight"), true);
const facts = { ai: 1, crawl: 0, li: 0, pubs: 1, grow: 0, quality: 3, fit: 50, gap: false, warm: 0, due: null, posted: false, crowded: false };
eq("a raised company lifts Digest priority by RAISE_POINTS", priority({ ...facts, lift: RAISE_POINTS }) - priority(facts), RAISE_POINTS);
const planWs = writesFor("content", { days: [1, 3], formats: ["Carousel"] }, S)[0].patch.plan as never;
const brief = withPlan(defaultBrief("2026-11-06"), planWs);
eq("campaigns start from the Content system: posts a week, days, formats", [brief.ppw, brief.mix, slotDates(brief.start, 1, brief.ppw, brief.days)], [2, ["Carousel"], ["2026-11-10", "2026-11-12"]]);
eq("an empty plan leaves a brief as it was", withPlan(defaultBrief("2026-11-06"), {}).ppw, defaultBrief("2026-11-06").ppw);

// ---------- db/021 matches ----------
const sql = readFileSync(new URL("../db/021_strategy_canvas.sql", import.meta.url), "utf8");
eq("021: both tables, RLS through has_role, one active per profile", ["create table if not exists strategies", "create table if not exists strategy_nodes", "has_role(workspace_id, ''viewer'')", "where status = 'active'"].map((s) => sql.includes(s)), [true, true, true, true]);
eq("021: node types match the code", ["goal", "audience", "pillars", "regions", "quota", "content", "comments", "condition", "action", "note"].every((t) => sql.includes(`'${t}'`)), true);
eq("021: notes become Note nodes and nothing is deleted", [sql.includes("from notes"), /\bdelete\s+from\b/i.test(sql), /\bdrop\s+table\b/i.test(sql)], [true, false, false]);

console.log(fails ? `\n${fails} failed` : "\nall passed");
if (fails) process.exit(1);
