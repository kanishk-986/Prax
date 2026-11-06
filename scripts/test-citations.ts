// Checks AI citation parsing, detection and maths against sample responses shaped like each provider's API.
// Run: node scripts/test-citations.ts
import { parseClaude, parseOpenAI, parseGemini, statusOf, findMatches, positionOf, owns, detect, isBranded, shareOfVoice, changes, citationGaps, linkedinCited, promptFor, sentimentOf, parseJudge, factIssues, profileConsistency, latestBatches, aggregate, setRollup, lift, recommend, alerts, shareValid, expiryFrom, starterQuestions, campaignLift, detectPerson, personContext, audienceOf, subjectShare, keywordStats, weeklyTrend, sameDirection, promptGaps, gapTopic, runWeeks, parsePerplexity, type Entity, type Run, type Question } from "../src/lib/citations.ts";
import { buildPdf } from "../src/lib/pdf.ts";

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

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
