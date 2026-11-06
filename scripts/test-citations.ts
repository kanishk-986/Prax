// Checks AI citation parsing, detection and maths against sample responses shaped like each provider's API.
// Run: node scripts/test-citations.ts
import { parseClaude, parseOpenAI, parseGemini, statusOf, findMatches, positionOf, owns, detect, isBranded, shareOfVoice, changes, citationGaps, linkedinCited, promptFor, sentimentOf, parseJudge, factIssues, profileConsistency, latestBatches, aggregate, setRollup, lift, recommend, alerts, shareValid, expiryFrom, starterQuestions, campaignLift, detectPerson, personContext, audienceOf, subjectShare, keywordStats, weeklyTrend, sameDirection, promptGaps, gapTopic, runWeeks, parsePerplexity,
  peopleIn, suggestPeerExperts, liveProfiles, archivedProfiles, currentProfile, profileScope, scoped, withProfile, postProfile, inProfile, profileName, nextSort, deleteConfirmed, migrateRows, NO_PROFILE,
  parseGoogleAi, parseCopilot, serpText, scored, isSerp, keySlot, SERP_ENGINES, ESTIMATE, ENGINES, parseEngine,
  type Entity, type Run, type Question, type Profile } from "../src/lib/citations.ts";
import { readFileSync } from "node:fs";
import { buildPdf, svgPathToPdf, pdfRgb } from "../src/lib/pdf.ts";
import { MARKS } from "../src/lib/providers.ts";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

const self: Entity = { id: "s", kind: "self", name: "Shashi Pal / Antier", aliases: ["Shashi Pal", "Antier", "Antier Solutions", "antiersolutions.com"], domains: ["antiersolutions.com", "linkedin.com/in/shashipal"] };
const rival: Entity = { id: "c1", kind: "competitor", name: "Ledgerline", aliases: ["Ledgerline"], domains: ["ledgerline.io"] };

// ---------- alias matching ----------
eq("Antier's matches Antier", findMatches("Antier's team built it.", self.aliases).map((m) => m.text), ["Antier"]);
eq("Antiers is not Antier", findMatches("The Antiers group", self.aliases).length, 0);
eq("another Shashi is not Shashi Pal", findMatches("Shashi Kumar of a bank said", self.aliases).length, 0);
eq("Shashi Pal across a line break", findMatches("led by Shashi\nPal and team", self.aliases).length, 1);
eq("longest alias wins, no double count", findMatches("Antier Solutions builds rails", self.aliases).map((m) => m.text), ["Antier Solutions"]);
eq("domain alias in text", findMatches("see antiersolutions.com for more", self.aliases).length, 1);
eq("case-insensitive", findMatches("ANTIER and antier", self.aliases).length, 2);

// ---------- position ----------
const listed = "Top firms for stablecoin infrastructure:\n\n1. Ledgerline - payments\n2. Antier - delivery for banks\n3. Other Co\n\nLater text names Antier again.";
eq("numbered list rank", positionOf(listed, self.aliases), 2);
eq("bulleted list rank", positionOf("Options:\n- Alpha\n- Beta\n- Antier Solutions\n", self.aliases), 3);
eq("named outside any list has no position", positionOf("Antier is one option.", self.aliases), null);

// ---------- owned links ----------
eq("subdomain is owned", owns("https://blog.antiersolutions.com/post", self.domains), true);
eq("lookalike domain is not owned", owns("https://notantiersolutions.com", self.domains), false);
eq("his LinkedIn profile path is owned", owns("https://www.linkedin.com/in/shashipal/", self.domains), true);
eq("someone else's LinkedIn is not owned", owns("https://www.linkedin.com/in/shashipalmer", self.domains), false);

// ---------- providers ----------
const claudeRaw = [{ model: "claude-opus-5-5", stop_reason: "pause_turn", usage: { input_tokens: 12000, output_tokens: 300 }, content: [
  { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "stablecoin infrastructure banks UAE" } },
  { type: "web_search_tool_result", tool_use_id: "s1", content: [{ type: "web_search_result", url: "https://www.antiersolutions.com/stablecoin", title: "Antier stablecoin" }, { type: "web_search_result", url: "https://fintechreview.example/top-10", title: "Top 10" }] },
] }, { model: "claude-opus-5-5", stop_reason: "end_turn", usage: { input_tokens: 9000, output_tokens: 700 }, content: [
  { type: "text", text: "Several firms work with UAE banks. " },
  { type: "text", text: "Antier builds stablecoin rails for banks.", citations: [{ type: "web_search_result_location", url: "https://www.antiersolutions.com/stablecoin", title: "Antier stablecoin", cited_text: "..." }] },
] }];
const c = parseClaude(claudeRaw);
eq("claude answer joined", c.answer, "Several firms work with UAE banks. Antier builds stablecoin rails for banks.");
eq("claude sources: cited vs retrieved", c.sources.map((s) => [s.domain, s.cited]), [["antiersolutions.com", true], ["fintechreview.example", false]]);
eq("claude tokens summed over pause_turn", [c.input_tokens, c.output_tokens], [21000, 1000]);

const oa = parseOpenAI({ model: "gpt-5", usage: { input_tokens: 8000, output_tokens: 900 }, output: [
  { type: "web_search_call", status: "completed", action: { type: "search", queries: ["stablecoin banks UAE"] } },
  { type: "message", content: [{ type: "output_text", text: "Ledgerline and others lead here.", annotations: [{ type: "url_citation", start_index: 0, end_index: 10, url: "https://ledgerline.io/banks", title: "Ledgerline" }, { type: "url_citation", start_index: 0, end_index: 10, url: "https://fintechreview.example/top-10", title: "Top 10" }] }] },
] });
eq("openai answer and url_citation sources", [oa.answer, oa.sources.map((s) => s.domain)], ["Ledgerline and others lead here.", ["ledgerline.io", "fintechreview.example"]]);

const gm = parseGemini({ steps: [
  { type: "google_search_call", arguments: { queries: ["stablecoin banks UAE"] } },
  { type: "model_output", content: [{ type: "text", text: "Antier and Ledgerline both appear.", annotations: [{ type: "url_citation", url: "https://www.uefa.example/a", title: "uefa.example", start_index: 0, end_index: 5 }] }] },
] });
eq("gemini interactions annotations", [gm.answer, gm.sources.map((s) => s.domain)], ["Antier and Ledgerline both appear.", ["uefa.example"]]);
const gl = parseGemini({ candidates: [{ content: { parts: [{ text: "Older shape." }] }, groundingMetadata: { groundingChunks: [{ web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", title: "fintechreview.example" } }] } }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 10 } });
eq("gemini legacy grounding redirect uses title as domain", [gl.sources[0].domain, gl.input_tokens], ["fintechreview.example", 50]);
eq("status: no sources", statusOf({ ...oa, sources: [] }), "no_sources");
eq("status: refusal is failed", statusOf({ ...c, refused: true }), "failed");

// ---------- detection ----------
const run = (id: string, q: string, engine: Run["engine"], at: string, answer: string, sources: Run["sources"] = [], status: Run["status"] = "ok"): Run => ({ id, question_id: q, engine, model: "m", status, answer, run_at: at, sources });
const d1 = detect(run("r", "q", "claude", "t", c.answer, c.sources), self);
eq("named, linked, no list", [d1.named, d1.linked, d1.position], [true, true, null]);
const d2 = detect(run("r", "q", "openai", "t", "Antier is listed.", [], "no_sources"), self);
eq("no sources: linked is unknown, not false", d2.linked, null);
const d3 = detect(run("r", "q", "openai", "t", "See https://antiersolutions.com/x for detail.", [{ url: "https://x.example", title: "", domain: "x.example", cited: true }]), self);
eq("owned link written in the answer counts as linked", d3.linked, true);

// ---------- maths ----------
const qs: Question[] = [
  { id: "q1", question: "Who builds stablecoin rails for UAE banks?", topic: "", region: "UAE", language: "English", status: "active" },
  { id: "q2", question: "Which tokenisation firms do Gulf banks use?", topic: "", region: "", language: "English", status: "active" },
  { id: "q3", question: "What does Antier do?", topic: "", region: "", language: "English", status: "active" },
  { id: "q4", question: "Archived question", topic: "", region: "", language: "English", status: "archived" },
];
eq("branded question detected", qs.map((q) => isBranded(q, self)), [false, false, true, false]);
const runs: Run[] = [
  run("a", "q1", "claude", "2026-11-01", "Ledgerline only.", [{ url: "https://fintechreview.example/top", title: "", domain: "fintechreview.example", cited: true }]),
  run("b", "q1", "claude", "2026-11-06", "Antier and Ledgerline.", [{ url: "https://bankingnews.example/a", title: "", domain: "bankingnews.example", cited: true }]),
  run("c", "q2", "claude", "2026-11-01", "Antier leads."),
  run("d", "q2", "claude", "2026-11-06", "Ledgerline leads.", [{ url: "https://fintechreview.example/t2", title: "", domain: "fintechreview.example", cited: true }]),
  run("e", "q3", "claude", "2026-11-06", "Antier is a firm."),
  run("f", "q1", "openai", "2026-11-06", "", [], "failed"),
  run("g", "q4", "openai", "2026-11-06", "Antier."),
];
eq("share of voice: branded, archived and failed left out", shareOfVoice(runs, qs, self, self), { named: 1, linked: 0, total: 2, pct: 50 });
eq("share of voice per engine", shareOfVoice(runs, qs, self, self, "openai").total, 0);
eq("competitor share on the same questions", shareOfVoice(runs, qs, rival, self).named, 2);
eq("dropped and new", changes(runs, self).map((x) => `${x.question_id}:${x.kind}`).sort(), ["q1:new", "q2:dropped"]);
eq("citation gaps exclude domains that also name you", citationGaps(runs, self, [rival]).map((g) => g.domain), ["fintechreview.example"]);
const liRuns = [run("h", "q1", "gemini", "t", "x", [{ url: "https://www.linkedin.com/posts/shashipal_stablecoin-activity-1", title: "", domain: "linkedin.com", cited: true }, { url: "https://www.linkedin.com/posts/someoneelse_x", title: "", domain: "linkedin.com", cited: true }])];
eq("his LinkedIn post cited, others not", linkedinCited(liRuns, self).length, 1);
eq("region hint only for gemini", [promptFor(qs[0], "gemini").includes("UAE"), promptFor(qs[0], "openai")], [true, qs[0].question]);

// ---------- tone ----------
eq("tone from sentences naming him", sentimentOf("The weather is bad. Antier is a trusted and experienced partner.", self.aliases), "positive");
eq("negative tone", sentimentOf("Antier faced a lawsuit and complaints last year.", self.aliases), "negative");
eq("no tone when not named", sentimentOf("Ledgerline is a leader.", self.aliases), null);
eq("judge reply parsed", parseJudge('Sure. {"sentiment":"negative","issues":[{"fact":"Founded 2011","said":"Antier was founded in 2019"}]}'), { sentiment: "negative", issues: [{ fact: "Founded 2011", said: "Antier was founded in 2019" }] });
eq("judge: unknown sentiment becomes neutral, junk issues dropped", parseJudge('{"sentiment":"great","issues":[{"fact":""}]}'), { sentiment: "neutral", issues: [] });
eq("judge: unreadable reply is null", parseJudge("no json here"), null);

// ---------- facts ----------
eq("wrong founding year next to the name", factIssues("Antier was founded in 2019 in India. Others started in 2005.", { founded: "2011" }, self.aliases).map((x) => x.fact), ["Founded 2011"]);
eq("right founding year is fine", factIssues("Antier, established in 2011, builds rails.", { founded: "2011" }, self.aliases).length, 0);
eq("a year next to someone else is not his", factIssues("Ledgerline was founded in 2019.", { founded: "2011" }, self.aliases).length, 0);
eq("profile consistency", profileConsistency({ titles: "Co-Founder, COO", regions: "UAE, India" }, "Co-Founder and COO at Antier. Working across the UAE.").map((r) => `${r.value}:${r.found}`), ["Co-Founder:true", "COO:true", "UAE:true", "India:false"]);

// ---------- repeats ----------
const t0 = "2026-11-06T10:00:00Z", t1 = "2026-11-06T10:05:00Z", t2 = "2026-11-06T10:10:00Z";
const reps = [run("r1", "q1", "claude", t0, "Antier is one."), run("r2", "q1", "claude", t1, "Ledgerline only."), run("r3", "q1", "claude", t2, "Antier and Ledgerline.")];
eq("repeats form one batch", [...latestBatches(reps).values()][0].now.length, 3);
eq("majority of repeats: named 2 of 3, mixed", (({ named, k, n, mixed }) => ({ named, k, n, mixed }))(aggregate(reps, self)!), { named: true, k: 2, n: 3, mixed: true });
eq("a 1 of 2 split is not named", aggregate(reps.slice(0, 2), self)!.named, false);
eq("failed repeats are left out", aggregate([...reps.slice(0, 1), run("r4", "q1", "claude", t1, "", [], "failed")], self)!.n, 1);
eq("all repeats failed gives no verdict", aggregate([run("r5", "q1", "claude", t0, "", [], "failed")], self), null);
eq("share of voice counts the batch once", shareOfVoice(reps, qs, self, self).total, 1);
const older = [run("o1", "q1", "claude", "2026-10-30T10:00:00Z", "Ledgerline only."), run("o2", "q1", "claude", "2026-10-30T10:03:00Z", "Ledgerline again.")];
eq("previous batch kept apart", [...latestBatches([...reps, ...older]).values()][0].prev.length, 2);
eq("change between batches", changes([...reps, ...older], self).map((c) => c.kind), ["new"]);

// ---------- sets, lift, recommendations, alerts ----------
const qsSet: Question[] = [{ ...qs[0], set_id: "gcc" }, { ...qs[1], set_id: null }];
eq("set roll-up only counts its questions", setRollup(qsSet, "gcc", runs, self).total, setRollup(qsSet, "gcc", runs.filter((r) => r.question_id === qsSet[0].id), self).total);
eq("lift maths", lift({ named: 1, total: 4 }, { named: 3, total: 4 }), { before: 25, after: 75, delta: 50 });
eq("no lift without a baseline", lift(null, { named: 1, total: 2 }), null);
const recs = recommend(runs, qs, self, [rival]);
eq("recommends an article where he is never named", recs.some((r) => r.kind === "profile" && r.question_ids.includes("q2")), true);
eq("recommends earning a mention on a gap domain", recs.some((r) => r.kind === "elsewhere" && r.title.includes("fintechreview.example")), true);
const wrongRun = { ...run("w1", "q1", "openai", "2026-11-06T09:00:00Z", "Antier was founded in 2019."), fact_issues: [{ fact: "Founded 2011", said: "Antier was founded in 2019." }] };
const al = alerts([...runs, wrongRun], qs, self, [rival]);
eq("alerts include dropped, new and wrong fact", ["dropped", "new", "wrong_fact"].every((k) => al.some((a) => a.kind === k)), true);
const overtakeNow = [run("v1", "q1", "gemini", "2026-11-06T10:00:00Z", "Ledgerline leads."), run("v2", "q2", "gemini", "2026-11-06T10:00:00Z", "Ledgerline again.")];
const overtakeBefore = [run("v3", "q1", "gemini", "2026-10-20T10:00:00Z", "Antier leads."), run("v4", "q2", "gemini", "2026-10-20T10:00:00Z", "Antier again.")];
eq("competitor overtook", alerts([...overtakeNow, ...overtakeBefore], qs, self, [rival]).some((a) => a.kind === "overtook"), true);

// ---------- share links, starters, campaigns ----------
const nowMs = Date.parse("2026-11-06T12:00:00Z");
eq("share link live", shareValid({ expires_at: "2026-11-07T00:00:00Z", revoked: false }, nowMs), true);
eq("share link expired", shareValid({ expires_at: "2026-11-06T11:00:00Z", revoked: false }, nowMs), false);
eq("share link turned off", shareValid({ expires_at: "2026-11-09T00:00:00Z", revoked: true }, nowMs), false);
eq("expiry is capped at 30 days", expiryFrom(90, nowMs), new Date(nowMs + 30 * 864e5).toISOString());
const sixPillars = ["Money That Moves Itself", "The Liquid Balance Sheet", "Regulation-to-Architecture", "Production-Grade or Nothing", "Agentic Finance", "Build, Buy or Partner"];
eq("twenty starter questions, none branded", [starterQuestions(sixPillars, "the UAE").length, starterQuestions(sixPillars, "the UAE").some((q) => isBranded({ question: q.question }, self))], [20, false]);
eq("starter questions follow the profile's pillars and region", starterQuestions(["Hospital operations"], "Kenya").map((q) => q.question).slice(0, 2), ["Who are the leading experts on hospital operations in Kenya?", "Which companies are best at hospital operations in Kenya?"]);
eq("no pillars, no starter questions", starterQuestions([]).length, 0);
const campQs: Question[] = [{ ...qs[0], topic: "Agentic Finance" }, { ...qs[1], topic: "Custody" }];
const campRuns = [run("c1", campQs[0].id, "claude", "2026-10-01T10:00:00Z", "Ledgerline."), run("c2", campQs[0].id, "claude", "2026-11-03T10:00:00Z", "Antier.")];
eq("campaign lift before and after", campaignLift(campRuns, campQs, self, { id: "x", start: "2026-10-15", topic: "Agentic Finance" }), { questions: 1, before: 0, after: 100 });

// ---------- Perplexity ----------
const px = parsePerplexity({ model: "sonar", choices: [{ message: { content: " Antier builds rails [1]. " } }], search_results: [{ title: "Antier", url: "https://www.antiersolutions.com/a" }, { title: "Other", url: "https://ledgerline.io/b" }], citations: ["https://www.antiersolutions.com/a"], usage: { prompt_tokens: 12, completion_tokens: 30 } });
eq("Perplexity answer, model and tokens", [px.answer, px.model, px.input_tokens, px.output_tokens], ["Antier builds rails [1].", "sonar", 12, 30]);
eq("Perplexity sources, cited ones marked", px.sources.map((x) => [x.domain, x.cited]), [["antiersolutions.com", true], ["ledgerline.io", false]]);

// ---------- person and company ----------
const person: Entity = { id: "p", kind: "self", subject: "person", name: "Shashi Pal", aliases: ["Shashi Pal"], domains: ["linkedin.com/in/shashipal"] };
const company: Entity = { id: "co", kind: "self", subject: "company", name: "Antier", aliases: ["Antier", "Antier Solutions"], domains: ["antiersolutions.com"] };
const peer: Entity = { id: "x1", kind: "competitor", subject: "person", name: "Rina Okafor", aliases: ["Rina Okafor"], domains: [] };
const ctx = personContext([{ ...qs[0], keywords: ["Stablecoin rails"] }], company);
const say = (answer: string, person_review = "") => ({ answer, person_review });
const hit = (a: string, r = "") => { const h = detectPerson(say(a, r), person, company, ctx); return [h.named, h.review, h.attributed]; };
eq("full name with Antier: named and attributed", hit("Shashi Pal of Antier writes on this."), [true, false, true]);
eq("full name with his role: named, not attributed", hit("Shashi Pal, a co-founder, speaks often."), [true, false, false]);
eq("full name with one of his topics: named", hit("Shashi Pal writes about stablecoin rails."), [true, false, false]);
eq("full name, no context: needs review", hit("Shashi Pal is a cricket coach in Delhi."), [false, true, false]);
eq("context in another paragraph does not count", hit("Shashi Pal coaches cricket.\n\nAntier builds blockchain products."), [false, true, false]);
eq("Shashi alone never counts", hit("Shashi from Antier said so."), [false, false, false]);
eq("Pal alone never counts", hit("Pal at Antier, the co-founder, said so."), [false, false, false]);
eq("another Shashi Pal, confirmed by hand, counts", hit("Shashi Pal is a cricket coach.", "confirmed"), [true, false, false]);
eq("rejected by hand never counts", hit("Shashi Pal of Antier", "rejected"), [false, false, false]);
eq("a single-word alias is ignored for people", detectPerson(say("Shashi of Antier"), { aliases: ["Shashi", "Shashi Pal"] }, company, ctx).named, false);

eq("audience from stored value", audienceOf({ question: "Who builds rails?", audience: "expert" }), "expert");
eq("audience guessed: expert", audienceOf({ question: "Which experts should I follow on stablecoins?" }), "expert");
eq("audience guessed: leadership", audienceOf({ question: "Who leads Antier's delivery?" }), "leadership");
eq("audience guessed: vendor", audienceOf({ question: "Who builds tokenisation platforms for banks?" }), "vendor");

const pq: Question[] = [
  { id: "e1", question: "Which experts write about stablecoin rails in the UAE?", topic: "", region: "UAE", language: "English", status: "active", audience: "expert", keywords: ["stablecoin", "UAE"] },
  { id: "v1", question: "Who builds stablecoin rails for banks?", topic: "", region: "UAE", language: "English", status: "active", audience: "vendor", keywords: ["stablecoin"] },
];
const pr = [
  run("pa", "e1", "claude", "2026-11-03T10:00:00Z", "Shashi Pal, co-founder of Antier, writes on this. Rina Okafor too."),
  run("pb", "e1", "openai", "2026-11-03T10:00:00Z", "Rina Okafor is the best known voice."),
  run("pc", "v1", "claude", "2026-11-03T10:00:00Z", "Ledgerline builds these. Antier also does."),
  run("pd", "v1", "openai", "2026-11-03T10:00:00Z", "Ledgerline is the main vendor."),
  run("pe", "e1", "claude", "2026-10-27T10:00:00Z", "Rina Okafor leads this conversation."),
];
const ps = subjectShare(pr, pq, "person", person, company, ctx, ["expert", "leadership"]);
const cs = subjectShare(pr, pq, "company", company, company, ctx, ["vendor", "leadership"]);
eq("Shashi share counts expert prompts only", [ps.named, ps.total], [1, 2]);
eq("Antier share counts vendor prompts only", [cs.named, cs.total], [1, 2]);
eq("a company mention does not count as Shashi", subjectShare([run("pf", "e1", "gemini", "2026-11-03T10:00:00Z", "Antier is active here.")], pq, "person", person, company, ctx, ["expert"]).named, 0);
eq("keyword stats: named in X of Y", keywordStats(pr, pq, person, company, ctx), [{ keyword: "stablecoin", prompts: 2, named: 2 }, { keyword: "UAE", prompts: 1, named: 1 }]);

const tr = weeklyTrend(pr, pq, person, company, [rival, peer], ctx, new Date("2026-11-06T12:00:00Z"));
eq("trend has eight weeks ending this week", [tr.length, tr[7].week, tr[6].week], [8, "2026-11-02", "2026-10-26"]);
eq("trend per engine this week", [tr[7].engines.claude, tr[7].engines.openai, tr[7].engines.gemini], [2, 0, null]);
eq("trend last week, and empty weeks stay empty", [tr[6].engines.claude, tr[6].person, tr[0].engines.claude], [0, 0, undefined]);
eq("trend splits Shashi and Antier", [tr[7].person, tr[7].company], [1, 1]);
eq("competitor median", tr[7].median, 2);
eq("competitor median of an even pool", weeklyTrend(pr.filter((r) => r.id !== "pd"), pq, person, company, [rival, peer], ctx, new Date("2026-11-06T12:00:00Z"))[7].median, 1.5);
eq("moving together", sameDirection([0, 1], [1, 2]), true);
eq("moving apart", sameDirection([0, 2], [3, 1]), false);
eq("no direction from one week", sameDirection([null, 1], [null, 2]), null);

const gaps = promptGaps(pr, pq, person, company, [peer], [rival], ctx);
eq("gaps: vendor goes to company, expert to Shashi", gaps.map((g) => [g.question.id, g.channel, g.rivals, g.engines]), [["e1", "shashi", ["Rina Okafor"], ["openai"]], ["v1", "company", ["Ledgerline"], ["openai"]]]);
eq("gap topic wording", gaps.map((g) => gapTopic(g, "Shashi")), ["Answer it as Shashi: Which experts write about stablecoin rails in the UAE", "Company content: Who builds stablecoin rails for banks"]);
eq("weeks with runs, newest first", runWeeks(pr), ["2026-11-02", "2026-10-26"]);

// ---------- PDF ----------
const pdfText = (b: Uint8Array) => String.fromCharCode(...b);
const doc = { kicker: "AI CITATIONS REPORT", title: "Test report", subtitle: "A week", coverMeta: [["PERIOD", "Week of 2 Nov"]] as [string, string][], footer: "Prax test", sections: [{ title: "Summary", lead: "Shashi named in 1 of 2.", findings: ["One gap."] }, { title: "Table", tables: [{ head: ["A", "B"], widths: [0.5, 0.5], rows: [["1", "2"]] }] }] };
const small = pdfText(buildPdf(doc));
eq("PDF starts with %PDF and ends with %%EOF", [small.startsWith("%PDF-1.4"), small.trimEnd().endsWith("%%EOF")], [true, true]);
eq("PDF page count: cover, contents, sections", [(small.match(/\/Type \/Page /g) ?? []).length, /\/Count 3 /.test(small), small.includes("Page 3 of 3")], [3, true, true]);
const big = pdfText(buildPdf({ ...doc, sections: [{ title: "Long", tables: [{ head: ["A", "B"], widths: [0.5, 0.5], rows: Array.from({ length: 120 }, (_, i) => [`Row ${i}`, "x"]) }] }] }));
const pages = (big.match(/\/Type \/Page /g) ?? []).length;
eq("long tables flow onto more pages, numbered", [pages > 3, big.includes(`Page ${pages} of ${pages}`)], [true, true]);
eq("PDF text is escaped", pdfText(buildPdf({ ...doc, title: "A (b) c" })).includes("A \\(b\\) c"), true);

// ---------- tracked profiles (db/017) ----------
const prof = (id: string, sort: number, archived_at: string | null = null, created_at = "2026-11-01T00:00:00Z"): Profile => ({ id, name: `P ${id}`, sort, archived_at, created_at });
const pset = [prof("b", 1), prof("a", 0), prof("z", 2, "2026-11-05T00:00:00Z"), prof("y", 3, "2026-11-06T00:00:00Z")];
eq("live profiles in order, archived left out", liveProfiles(pset).map((p) => p.id), ["a", "b"]);
eq("archived profiles, newest first", archivedProfiles(pset).map((p) => p.id), ["y", "z"]);
eq("same sort: older first", liveProfiles([prof("n", 0, null, "2026-11-03T00:00:00Z"), prof("o", 0, null, "2026-11-02T00:00:00Z")]).map((p) => p.id), ["o", "n"]);
eq("the pick wins", currentProfile(pset, "b")?.id, "b");
eq("no pick: first live", currentProfile(pset, null)?.id, "a");
eq("archived pick falls back to first live", currentProfile(pset, "z")?.id, "a");
eq("deleted pick falls back to first live", currentProfile(pset, "gone")?.id, "a");
eq("all archived: none in view", currentProfile([prof("z", 0, "2026-11-05T00:00:00Z")], "z"), null);
eq("scope: before db/017 nothing is scoped", profileScope(true, null), null);
eq("scope: the profile in view", profileScope(false, prof("a", 0)), "a");
eq("scope: none live matches no row", profileScope(false, null), NO_PROFILE);
const calls: [string, string][] = [];
const fakeQ = { eq(col: string, v: string) { calls.push([col, v]); return fakeQ; } };
scoped(fakeQ, "a"); scoped(fakeQ, null);
eq("scoped adds one profile filter, none before db/017", calls, [["profile_id", "a"]]);
eq("inserts carry the profile", withProfile({ workspace_id: "w" }, "a"), { workspace_id: "w", profile_id: "a" });
eq("inserts before db/017 stay as they were", [withProfile({ workspace_id: "w" }, null), withProfile({ workspace_id: "w" }, NO_PROFILE)], [{ workspace_id: "w" }, { workspace_id: "w" }]);
eq("Content Studio ideas carry the profile", [postProfile("a"), postProfile(null)], [{ citation_profile_id: "a" }, {}]);
eq("gap topics: this profile and untagged show, another profile does not",
  [inProfile({ citation_profile_id: "a" }, "a"), inProfile({ citation_profile_id: null }, "a"), inProfile({ citation_profile_id: "b" }, "a"), inProfile({ citation_profile_id: "b" }, null)], [true, true, false, true]);
eq("profile name: person and company", profileName(" Jane Doe ", "Acme", "Workspace"), "Jane Doe, Acme");
eq("profile name: falls back to the workspace", [profileName("", "", "Shashi Pal"), profileName("", "", " ")], ["Shashi Pal", "Tracked profile"]);
eq("next sort after the highest", [nextSort(pset), nextSort([])], [4, 0]);
eq("delete needs the name typed", [deleteConfirmed("P a", "P a"), deleteConfirmed(" p A ", "P a"), deleteConfirmed("P", "P a"), deleteConfirmed("", "")], [true, true, false, false]);

// The migration mapping: every row goes to its workspace's default profile, a run to its prompt's profile, rows that
// already have one are untouched, and no row is dropped.
type MRow = { workspace_id: string; id?: string; question_id?: string | null; profile_id?: string | null };
const before: { table: string; row: MRow }[] = [
  { table: "citation_entities", row: { workspace_id: "w1", id: "e1" } },
  { table: "citation_questions", row: { workspace_id: "w1", id: "q1" } },
  { table: "citation_questions", row: { workspace_id: "w1", id: "q2", profile_id: "p9" } },
  { table: "citation_runs", row: { workspace_id: "w1", id: "r1", question_id: "q1" } },
  { table: "citation_runs", row: { workspace_id: "w1", id: "r2", question_id: "q2" } },
  { table: "citation_runs", row: { workspace_id: "w1", id: "r3", question_id: null } },
  { table: "citation_facts", row: { workspace_id: "w1" } },
  { table: "citation_recs", row: { workspace_id: "w2", id: "c1" } },
  { table: "citation_shares", row: { workspace_id: "w2", id: "s1", profile_id: "p8" } },
];
const after = migrateRows(before, { w1: "p1", w2: "p2" });
eq("migration keeps every row", after.length, before.length);
eq("migration: default profile per workspace, runs follow their prompt", after.map((x) => `${x.row.id ?? x.table}:${x.row.profile_id}`),
  ["e1:p1", "q1:p1", "q2:p9", "r1:p1", "r2:p9", "r3:p1", "citation_facts:p1", "c1:p2", "s1:p8"]);
eq("migration is re-runnable: a second pass changes nothing", JSON.stringify(migrateRows(after, { w1: "x", w2: "x" })), JSON.stringify(after));

const sql17 = readFileSync(new URL("../db/017_citation_profiles.sql", import.meta.url), "utf8");
const scopedTables = ["citation_entities", "citation_questions", "citation_runs", "citation_facts", "citation_recs", "citation_sets", "citation_shares"];
eq("SQL scopes every citation table", scopedTables.every((t) => sql17.includes(`'${t}'`) && new RegExp(`update ${t}\\b[^;]*profile_id`).test(sql17)), true);
eq("SQL: runs follow their prompt before the default", sql17.indexOf("from citation_questions q where r.question_id = q.id") > -1 && sql17.indexOf("from citation_questions q where r.question_id = q.id") < sql17.indexOf("update citation_runs set profile_id = citation_default_profile"), true);
eq("SQL only fills rows without a profile", (sql17.match(/^update citation_\w+ .*$/gm) ?? []).every((l) => /profile_id is null/.test(l)), true);
eq("SQL deletes only inside the owner-only delete", [...sql17.matchAll(/\bdelete\s+from\s+(\w+)/gi)].map((m) => m[1]), ["citation_profiles"]);
eq("SQL never drops a table or truncates", /\bdrop\s+table\b|\btruncate\b/i.test(sql17), false);
eq("SQL delete checks owner and the typed name", /has_role\(p\.workspace_id, 'owner'\)/.test(sql17) && /lower\(trim\(coalesce\(confirm_name/.test(sql17), true);
eq("SQL uses has_role for RLS", (sql17.match(/has_role\(workspace_id/g) ?? []).length >= 5, true);
eq("SQL is re-runnable", /create table if not exists citation_profiles/.test(sql17) && /add column if not exists profile_id/.test(sql17) && /drop trigger if exists/.test(sql17), true);
eq("SQL names the default profile like profileName", /concat_ws\(', '/.test(sql17), true);

// ---------- provider marks in the PDF (AC21) ----------
eq("SVG lines, relative and absolute, and close", svgPathToPdf("M0 0h10v10H0z"), "0 0 m 10 0 l 10 10 l 0 10 l h");
eq("implicit lineto after moveto, compact numbers", svgPathToPdf("m1 1 2 2-.5.5"), "1 1 m 3 3 l 2.5 3.5 l");
const half = svgPathToPdf("M0 0A5 5 0 0 1 10 0");
eq("a half circle arc becomes two cubics ending at the end point", [(half.match(/ c/g) ?? []).length, half.endsWith("10 0 c")], [2, true]);
eq("compact arc flags", svgPathToPdf("M0 0a5 5 0 0110 0").endsWith("10 0 c"), true);
eq("quadratic becomes a cubic", svgPathToPdf("M0 0Q3 3 6 0"), "0 0 m 2 2 4 2 6 0 c");
eq("every provider path converts to finite numbers", Object.values(MARKS).filter(Boolean).every((m) => { const o = svgPathToPdf(m!.path); return o.length > 50 && !/NaN|Infinity/.test(o); }), true);
eq("hex colour to PDF rgb", pdfRgb("#D97757"), "0.851 0.467 0.341");
const marked = pdfText(buildPdf({ ...doc, marks: { ChatGPT: { path: MARKS.openai!.path, color: MARKS.openai!.color }, Grok: { color: "#5f5f5f" } }, sections: [{ title: "Tools", tables: [{ head: ["AI tool", "ChatGPT"], widths: [0.5, 0.5], rows: [["ChatGPT", "1"], ["ChatGPT, Grok", "2"], ["Other", "3"]] }] }] }));
eq("marks drawn: head in white, body in colour, dot fallback", [(marked.match(/ cm /g) ?? []).length, marked.includes("q 1 1 1 rg"), marked.includes("q 0 0 0 rg"), marked.includes("q 0.373 0.373 0.373 rg")], [3, true, true, true]);
eq("names stay as text beside the marks", [marked.includes("(ChatGPT) Tj"), marked.includes("(Grok) Tj"), marked.includes("(Other) Tj")], [true, true, true]);

// ---------- suggested peer experts (AC15) ----------
eq("full name beside a role counts", peopleIn("Rina Okafor, CEO of Ledgerline, says rails matter."), ["Rina Okafor"]);
eq("role before the name, firm name dropped", peopleIn("Standard Chartered CEO Bill Winters spoke on tokenisation."), ["Bill Winters"]);
eq("markdown list with a dash and bold", peopleIn("1. **Omar Haddad** - Head of Digital Assets at Gulf Bank\n2. **Lena Vogel** (co-founder, Tokenrail)"), ["Omar Haddad", "Lena Vogel"]);
eq("honorific counts, particles kept", peopleIn("Dr Aisha bin Rashid has written on CBDCs."), ["Aisha bin Rashid"]);
eq("is the ... role counts", peopleIn("Marco De Luca is the managing partner at a fund."), ["Marco De Luca"]);
eq("no role nearby: not counted", peopleIn("Rina Okafor wrote a paper on stablecoins."), []);
eq("first name alone never counts", peopleIn("Rina, CEO of Ledgerline, agrees."), []);
eq("firms and places are not people", peopleIn("Abu Dhabi Global Market, the regulator, and Ledgerline Labs, a vendor, lead. Middle East Partners, a partner firm."), []);
eq("role in another sentence does not count", peopleIn("Rina Okafor writes often. The CEO of Ledgerline agrees."), []);
eq("possessive still finds the role", peopleIn("As chief economist Rina Okafor's view matters."), ["Rina Okafor"]);
eq("four-word runs are not one name", peopleIn("Jane Mary Ann Doe, CEO of Acme."), []);

const sq: Question[] = [
  { id: "x1", question: "Which experts speak on stablecoin rails?", topic: "t", region: "UAE", language: "English", status: "active", audience: "expert" },
  { id: "x2", question: "Who leads tokenisation at Gulf banks?", topic: "t", region: "UAE", language: "English", status: "active", audience: "leadership" },
  { id: "x3", question: "Who builds stablecoin rails?", topic: "t", region: "UAE", language: "English", status: "active", audience: "vendor" },
  { id: "x4", question: "What does Omar Haddad say about rails?", topic: "t", region: "UAE", language: "English", status: "active", audience: "expert" },
  { id: "x5", question: "Archived expert prompt", topic: "t", region: "UAE", language: "English", status: "archived", audience: "expert" },
];
const s0 = "2026-11-05T09:00:00Z", s1 = "2026-11-05T09:05:00Z";
const sr: Run[] = [
  run("a1", "x1", "openai", s0, "Rina Okafor, CEO of Ledgerline. Omar Haddad, head of digital assets at Gulf Bank."),
  run("a2", "x1", "gemini", s0, "Omar Haddad (managing director) and Lena Vogel, co-founder of Tokenrail."),
  run("a3", "x2", "openai", s0, "Omar Haddad, chief digital officer, leads it. Shashi Pal, co-founder of Antier, too."),
  run("a4", "x2", "claude", s0, "Lena Vogel, co-founder of Tokenrail, and Omar Haddad, head of digital."),
  run("a5", "x3", "openai", s0, "Vendor prompt: Piet Smit, CEO of Railco. Piet Smit again."),
  run("a6", "x3", "gemini", s0, "Piet Smit, CEO of Railco."),
  run("a7", "x4", "openai", s0, "Omar Haddad, head of digital, and Rina Okafor, CEO of Ledgerline."),
  run("a8", "x5", "openai", s0, "Piet Smit, CEO of Railco. Mia Chen, CTO."),
  run("a9", "x5", "gemini", s0, "Mia Chen, CTO of Railco."),
  run("b1", "x1", "claude", s0, "Mia Chen, CTO of Railco."),
  run("b2", "x1", "claude", s1, "No names here."),
  run("b3", "x1", "claude", s1, "Nothing either.", [], "failed"),
  run("c1", "x2", "gemini", s0, "Mia Chen, CTO of Railco.", [], "failed"),
  run("c2", "x2", "gemini", s0, "Mia Chen, CTO of Railco."),
];
const trackedEnts: Entity[] = [{ id: "p", kind: "self", subject: "person", name: "Shashi Pal", aliases: ["Shashi Pal"], domains: [] }, { id: "r", kind: "competitor", subject: "person", name: "Rina Okafor", aliases: ["Rina Okafor"], domains: [] }];
const sug = suggestPeerExperts(sr, sq, trackedEnts);
eq("ranked by answers, then AI tools; tracked, vendor, archived, failed and one-offs left out", sug.map((x) => [x.name, x.answers, x.engines]), [["Omar Haddad", 4, ["openai", "gemini", "claude"]], ["Lena Vogel", 2, ["gemini", "claude"]]]);
eq("the prompt's own name is not suggested from it", sug[0].answers, 4);
eq("dismissed names are left out, any case", suggestPeerExperts(sr, sq, trackedEnts, ["omar  haddad"]).map((x) => x.name), ["Lena Vogel"]);
eq("min and limit", [suggestPeerExperts(sr, sq, trackedEnts, [], { min: 1 }).map((x) => x.name), suggestPeerExperts(sr, sq, trackedEnts, [], { min: 1, limit: 1 }).length], [["Omar Haddad", "Lena Vogel", "Mia Chen"], 1]);
eq("a suggested row already stored is not offered twice", suggestPeerExperts(sr, sq, [...trackedEnts, { name: "Lena Vogel", aliases: ["Lena Vogel"] }]).map((x) => x.name), ["Omar Haddad"]);
eq("majority of repeats: one of two repeats is not enough", suggestPeerExperts([run("m1", "x1", "openai", s0, "Ana Ruiz, CEO of Coinrail."), run("m2", "x1", "openai", s1, "No one."), run("m3", "x2", "openai", s0, "Ana Ruiz, CEO of Coinrail.")], sq, []).map((x) => x.name), []);
const sql25 = readFileSync(new URL("../db/025_citations_backlog.sql", import.meta.url), "utf8");
eq("025 adds dismissed_peers, re-runnable, deletes nothing", [/add column if not exists dismissed_peers text\[\]/.test(sql25), /\b(delete|drop table|truncate)\b/i.test(sql25)], [true, false]);

// ---------- Google AI answers and Microsoft Copilot through SerpApi ----------
// Sample JSON saved from the SerpApi docs (each file names its page in "_source").
const serp = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/serpapi/${f}.json`, import.meta.url), "utf8"));
const gIn = parseGoogleAi([serp("google-ai-overview-inline")]);
const gLines = gIn.answer.split("\n");
eq("Google: paragraph, heading and list items as lines", gLines.slice(0, 4), [
  "Drop shipping is a retail model where an online store doesn't keep products in stock. When a customer buys something, the store orders it from a third-party supplier who then ships it directly to the customer. This allows businesses to operate without managing inventory or warehouse space, reducing initial investment and overhead.",
  "Here's a more detailed breakdown:",
  "- No Inventory: Drop shippers sell products without holding any inventory themselves.",
  "- Third-Party Fulfillment: They rely on a supplier (manufacturer, wholesaler, or another retailer) to handle warehousing, shipping, and fulfillment.",
]);
eq("Google: nested list items are indented", gLines.filter((l) => l.startsWith("  - ")).length, 2);
eq("Google: a list item's own blocks are read", gLines.includes("1. Tax provisions"), true);
eq("Google: model is the engine, usage has no tokens", [gIn.model, gIn.input_tokens, gIn.output_tokens, gIn.refused, !!gIn.noAnswer], ["google_ai_overview", 0, 0, false, false]);
eq("Google: references become sources, text fragments cut", gIn.sources.map((x) => [x.domain, x.url.includes("#:~:text"), x.cited]), [["en.wikipedia.org", false, true], ["michigan.gov", false, true], ["fedex.com", false, true], ["shopify.com", false, true], ["shopify.com", false, true]]);
eq("Google: its own search links are not sources", gIn.sources.some((x) => /google\./.test(x.domain)), false);
eq("Google: status ok", statusOf(gIn), "ok");
const gTok = parseGoogleAi([serp("google-page-token"), serp("google-ai-overview-api")]);
eq("Google: page_token flow reads the second response", [gTok.answer.split("\n")[0], gTok.sources.length, statusOf(gTok)], ["Android Runtime (ART) is the virtual machine that runs apps and some system services on Android devices. ART works by:", 3, "ok"]);
eq("Google: list titles kept", gTok.answer.includes("- Compiling code ahead of time ART uses Ahead of Time (AOT) compilation"), true);
eq("Google: parseEngine routes google_ai", parseEngine("google_ai", [serp("google-page-token"), serp("google-ai-overview-api")]).answer, gTok.answer);
const gErr = parseGoogleAi([serp("google-ai-overview-error")]);
eq("Google: ai_overview.error is no AI answer, not a failure", [statusOf(gErr), gErr.note], ["no_answer", "Google said: Can't generate an AI overview right now. Try again later."]);
const gNone = parseGoogleAi([serp("google-no-overview")]);
eq("Google: no ai_overview at all is no AI answer", [statusOf(gNone), gNone.note, gNone.sources.length], ["no_answer", "Google showed no AI Overview for this search.", 0]);
eq("Google: empty results (HTTP 200 with error) is no AI answer", statusOf(parseGoogleAi([serp("google-empty")])), "no_answer");
eq("Google: a token that was never fetched is no AI answer", statusOf(parseGoogleAi([serp("google-page-token")])), "no_answer");

const cTab = parseCopilot(serp("bing-copilot-table"));
const cLines = cTab.answer.split("\n");
eq("Copilot: header first, then the blocks", [cLines[0], cLines[2]], ["The United States has the largest nominal GDP at $27.72 trillion, followed by China at $17.79 trillion, with Germany, Japan, and India rounding out the top five.", "Top 20 Countries by Nominal GDP Worldometer+1"]);
eq("Copilot: table rows with the header row", cLines.filter((l) => l.includes(" | ")).slice(0, 2), ["Rank | Country | GDP (USD) | GDP Growth | Population | GDP per Capita | Share of World GDP", "1 | United States | $27,720,700,000,000 | 2.89% | 343,477,335 | $80,706 | 26.11%"]);
eq("Copilot: sources cited by reference_indexes, links in text not doubled", cTab.sources.map((x) => [x.domain, x.title, x.cited]), [["en.wikipedia.org", "wikipedia.org", true], ["worldometers.info", "GDP by Country - Worldometer", true], ["tradingeconomics.com", "GDP - Countries - List - TRADING ECONOMICS", true]]);
eq("Copilot: model, no tokens, ok", [cTab.model, cTab.input_tokens, statusOf(cTab)], ["bing_copilot", 0, "ok"]);
const cNest = parseCopilot(serp("bing-copilot-nested"));
eq("Copilot: nested lists indented by depth", cNest.answer.split("\n").filter((l) => /^\s*- /.test(l)).map((l) => l.match(/^\s*/)![0].length), [0, 2, 2, 4, 0, 2, 4]);
eq("Copilot: references no block points at are read, not cited", cNest.sources.map((x) => x.cited), [false, false, false]);
eq("Copilot: Bing redirect links take the site from a host-name source", cNest.sources.map((x) => x.domain), ["learncbse.in", "bing.com", "bing.com"]);
const cEmpty = parseCopilot({ search_metadata: { status: "Success" }, text_blocks: [], references: [] });
eq("Copilot: no text is no AI answer", [statusOf(cEmpty), cEmpty.note], ["no_answer", "Copilot gave no answer for this search."]);
eq("serpText: code and expandable blocks", serpText([{ type: "expandable", title: "Camera", text_blocks: [{ type: "paragraph", snippet: "Same lenses." }, { type: "comparison", product_labels: ["A", "B"], comparison: [{ feature: "Zoom", values: ["2x", "3x"] }] }] }, { type: "code_block", code: "x = 1" }]), "Camera\nSame lenses.\nA | B\nZoom | 2x | 3x\nx = 1");

// Naming, linking and ranking work unchanged on a mapped answer.
const serpSelf: Entity = { id: "w", kind: "self", name: "Worldometer", aliases: ["Worldometer"], domains: ["worldometers.info"] };
const dCop = detect({ answer: cTab.answer, sources: cTab.sources, status: statusOf(cTab) }, serpSelf);
eq("Copilot answer: named and linked", [dCop.named, dCop.linked], [true, true]);
const rankAns = parseCopilot({ text_blocks: [{ type: "list", list: [{ snippet: "Ledgerline for rails" }, { snippet: "Antier for delivery" }] }], references: [] });
eq("Copilot answer: list position ranks", positionOf(rankAns.answer, ["Antier"]), 2);

// No AI answer runs are kept but not scored.
const nq: Question = { id: "nq", question: "Best stablecoin vendors", topic: "", region: "", language: "English", status: "active" };
const nRuns: Run[] = [run("n1", "nq", "google_ai", "2026-11-05T10:00:00Z", "", [], "no_answer"), run("n2", "nq", "copilot", "2026-11-05T10:00:00Z", "Antier leads.")];
eq("no_answer is not scored; ok is", [scored(nRuns[0]), scored(nRuns[1]), scored({ status: "failed" }), scored({ status: "no_sources" })], [false, true, false, true]);
eq("share of voice leaves no-answer runs out of the total", [shareOfVoice(nRuns, [nq], self, self).total, shareOfVoice(nRuns, [nq], self, self, "google_ai").total], [1, 0]);
eq("aggregate of a no-answer batch is null", aggregate([nRuns[0]], self), null);

// Engines, keys and cost display.
eq("SerpApi engines and their names", ENGINES.filter((e) => e.via).map((e) => [e.id, e.name, e.model]), [["google_ai", "Google AI answers", "google_ai_overview"], ["copilot", "Microsoft Copilot", "bing_copilot"]]);
eq("one SerpApi key for both", [SERP_ENGINES, keySlot("google_ai"), keySlot("copilot"), keySlot("openai"), isSerp("claude")], [["google_ai", "copilot"], "serpapi", "serpapi", "openai", false]);
eq("SerpApi engines carry no dollar estimate, only searches", SERP_ENGINES.map((e) => [ESTIMATE[e].usd, ESTIMATE[e].inTok, ESTIMATE[e].searches]), [[0, 0, 2], [0, 0, 1]]);
eq("promptFor sends search engines the question as written", promptFor({ question: "Who leads?", region: "UAE" }, "copilot"), "Who leads?");

// The extension handler: SerpApi only, the key never leaves for Prax, and slim responses go back to the page.
const bg = readFileSync(new URL("../extension/background.js", import.meta.url), "utf8");
const handler = bg.slice(bg.indexOf("// ---------- AI citations through SerpApi"), bg.indexOf("// ---------- Content Studio images"));
eq("handler calls only serpapi.com", [...new Set(handler.match(/https:\/\/[a-z0-9.-]+/g))], ["https://serpapi.com"]);
eq("handler reads the key from keys.serpapi", /c\.keys && c\.keys\.serpapi/.test(handler), true);
eq("the usage report to Prax carries no key", /prax\("usage", \{[^}]*key/.test(handler), false);
eq("handler returns slim responses, never the request URL", [/raws\.push\(serpSlim\(/.test(handler), /json_endpoint|serpapi_link|api_key: /.test(handler.slice(handler.indexOf("const serpSlim"), handler.indexOf("async function serpSearch")))], [true, false]);
eq("handler uses page_token only when the overview is not inline", /token && !\(first\.ai_overview\.text_blocks \|\| \[\]\)\.length/.test(handler), true);
const manifest = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
eq("manifest allows serpapi.com", manifest.host_permissions.includes("https://serpapi.com/*"), true);
const bridgeJs = readFileSync(new URL("../extension/bridge.js", import.meta.url), "utf8");
eq("bridge reports both engines from the one SerpApi key, as booleans", /searchKeys\.google_ai = searchKeys\.copilot = !!\(c\.keys && c\.keys\.serpapi\)/.test(bridgeJs), true);
const sql28 = readFileSync(new URL("../db/028_citation_engines.sql", import.meta.url), "utf8");
eq("028 widens engine and status, re-runnable, deletes nothing", [/'google_ai'/.test(sql28) && /'copilot'/.test(sql28), /'no_answer'/.test(sql28), /drop constraint if exists/.test(sql28), /\b(delete from|drop table|truncate)\b/i.test(sql28)], [true, true, true, false]);

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
