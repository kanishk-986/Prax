// Checks humanization (db/031): the Pangram response mapping against the docs' own sample replies, the paid-check
// decision table (every branch), the approval gate, Walter's gate, the cache key, the monthly caps, paragraph diffing for
// articles, highlighting and the rewrite review, the detector interface, the brand mark copies, and that db/031, the
// extension and the route agree. Run: node scripts/test-humanize.ts
import { readFileSync } from "node:fs";
import {
  mapPangram, isDone, combine, decide, gate, gateLabel, walterAllowed, meter, monthUsage, textHash, normText, wordCount, costOf, money,
  paragraphsOf, paragraphDiff, highlight, flaggedSentences, sentencesOf, parseChanges, applyChanges, rewriteAsk, badgeText, chipText, stateOf, libState,
  pangramVerdict, localVerdict, mergeSettings, levelFor, kindOfFormat, isFreeOnly, detection, DETECTORS, sectionOf, PRESETS, NEAR, LONG_WORDS,
  toCache, fromCache, versionAtLeast, HUMANIZE_EXT, HUMANIZE_WAIT_MS,
  type PlanInput, type Result,
} from "../src/lib/humanize.ts";
import { CHECKERS } from "../src/lib/providers.ts";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const throws = (name: string, fn: () => unknown, re: RegExp) => { let m = ""; try { fn(); } catch (e) { m = (e as Error).message; } eq(name, re.test(m), true); };
const fx = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/pangram/${f}`, import.meta.url), "utf8"));
const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

// ---------- the Pangram response (fixtures copied from docs.pangram.com) ----------
const mixed = mapPangram(fx("task-mixed.json"));
eq("mixed: human % is round(fraction_human x 100)", mixed.score, 40);
eq("mixed: only the non-human window is flagged", mixed.flagged.map((f) => [f.text, f.label, f.ai, f.confidence, f.start, f.end]), [["AI-assisted passage.", "AI-Assisted", 0.55, "High", 0, 21]]);
eq("mixed: words are the windows' word_count", mixed.words, 4);
eq("mixed: prediction and version kept", [mixed.prediction, mixed.version, mixed.headline], ["Mixed", "4.0", "AI Assisted"]);
const human = mapPangram(fx("task-human.json"));
eq("human: 100% and nothing flagged", [human.score, human.flagged.length, human.words], [100, 0, 4]);
throws("failed stage throws with Pangram's headline", () => mapPangram(fx("task-failed.json")), /no valid text after preprocessing/);
throws("in-progress is not a result", () => mapPangram(fx("task-in-progress.json")), /not finished/);
throws("no score at all", () => mapPangram({ stage: "STAGE_SUCCESS", windows: [] }), /no score/);
eq("deprecated root endpoint: 100 minus ai_likelihood", mapPangram({ text: "The text to analyze", prediction: "Likely AI", ai_likelihood: 0.92 }).score, 8);
eq("words fall back to the text when there are no windows", mapPangram({ text: "one two three", fraction_human: 1 }).words, 3);
eq("task stages: done only on success or failure", [isDone(fx("task-mixed.json")), isDone(fx("task-failed.json")), isDone(fx("task-in-progress.json")), isDone(fx("task-created.json"))], [true, true, false, false]);
eq("models fixture lists default", fx("models.json").models.includes("default"), true);
const art = combine([{ ...mixed, words: 100 }, { ...human, words: 300 }])!;
eq("article: human share weighted by words, flags kept", [art.score, art.words, art.flagged.length, art.prediction], [85, 400, 1, "Mixed"]);
eq("combine of nothing", combine([]), null);

// ---------- the detector interface ----------
eq("Pangram is a detector; GPTZero and Originality.ai plug in later", Object.keys(DETECTORS), ["pangram"]);
eq("check gives a score and a verdict", (({ detector, score, verdict }) => [detector, score, verdict])(detection("pangram", DETECTORS.pangram!.map(fx("task-mixed.json")))), ["pangram", 40, "mixed"]);
eq("verdict from the score when there is no prediction", [detection("pangram", { ...human, prediction: "" }).verdict, detection("pangram", { ...human, score: 10, prediction: "" }).verdict], ["human", "ai"]);
eq("usage sections", [sectionOf("comment_studio"), sectionOf("linkedin_bar"), sectionOf("content_write"), sectionOf("content_editor"), sectionOf("x")], ["comment_studio", "linkedin_bar", "content_write", "content_editor", ""]);

// ---------- the decision table (every branch, in order) ----------
const base: PlanInput = { kind: "comment", level: 90, local: 95, words: 60, cached: false, hasKey: true, cap: 10000, used: 0, confirmed: false, costPer100: 0.05 };
const act = (p: Partial<PlanInput>) => decide({ ...base, ...p });
eq("nothing to check", act({ words: 0 }).action, "empty");
eq("level 0 never calls Pangram, even with key and cap", act({ level: 0 }).action, "off");
eq("cached text costs nothing", act({ cached: true, words: 0 }).action, "cached");
eq("free score too far under the level: fix first, no paid check", act({ local: 79 }), { action: "local-low", need: 80 });
eq("free score just within NEAR still checks", act({ local: 90 - NEAR }).action, "check");
eq("no Pangram key: free score only", act({ hasKey: false }).action, "no-key");
eq("no monthly cap entered: free score only", act({ cap: 0 }).action, "no-cap");
eq("cap would be passed: stop", act({ used: 9950, words: 60 }).action, "cap-reached");
eq("exactly at the cap still allowed", act({ used: 9940, words: 60 }).action, "check");
eq("article asks before checking (cost shown)", act({ kind: "article", words: 900 }), { action: "confirm", words: 900, cost: 0.45, meter: meter(0, 10000) });
eq("long post asks before checking", act({ kind: "post", words: LONG_WORDS + 1 }).action, "confirm");
eq("post at the long limit checks", act({ kind: "post", words: LONG_WORDS }).action, "check");
eq("confirmed article checks", act({ kind: "article", words: 900, confirmed: true }).action, "check");
const chk = act({ used: 7900, words: 200 });
eq("check with the 80% warning", chk.action === "check" && [chk.cost, chk.warn, chk.meter.state], [0.1, true, "warn"]);
eq("check without warning", (act({}) as { warn: boolean }).warn, false);
eq("article with some paragraphs cached: only the rest is counted", act({ kind: "article", cached: true, words: 120, confirmed: true }).action, "check");
eq("free-only outcomes", ["no-ext", "old-ext", "no-key", "no-cap", "cap-reached", "local-low", "check"].map((a) => isFreeOnly(a as never)), [true, true, true, true, true, false, false]);
eq("no Prax for Chrome: free score only, never a paid check", act({ ext: "none" }).action, "no-ext");
eq("Prax for Chrome older than 0.9.6: free score only", act({ ext: "old" }).action, "old-ext");
eq("extension state is checked before the key", act({ ext: "none", hasKey: false }).action, "no-ext");
eq("a current extension checks as before", act({ ext: "ok" }).action, "check");
eq("level 0 stays off without an extension", act({ ext: "none", level: 0 }).action, "off");

// ---------- Walter (beta) ----------
const w = { hasKey: true, ready: true, cap: 5000, used: 0, words: 40, rounds: 2, failing: true };
eq("Walter only when still failing", walterAllowed({ ...w, failing: false }), { ok: false, why: "passing" });
eq("Walter only after both local rounds", [walterAllowed({ ...w, rounds: 0 }), walterAllowed({ ...w, rounds: 1 })], [{ ok: false, why: "not-yet" }, { ok: false, why: "not-yet" }]);
eq("Walter needs its key", walterAllowed({ ...w, hasKey: false }), { ok: false, why: "no-key" });
eq("Walter needs its API confirmed", walterAllowed({ ...w, ready: false }), { ok: false, why: "not-ready" });
eq("Walter needs a cap", walterAllowed({ ...w, cap: 0 }), { ok: false, why: "no-cap" });
eq("Walter stops at its cap", walterAllowed({ ...w, used: 4980 }), { ok: false, why: "cap-reached" });
eq("Walter allowed", walterAllowed(w), { ok: true });

// ---------- the verdict, the badge and the gate ----------
const H = "h1";
const pass = pangramVerdict({ ...human, score: 94 }, 90, H, "2026-11-07T10:00:00Z");
const fail = pangramVerdict({ ...mixed, score: 72 }, 90, H, "2026-11-07T10:00:00Z");
eq("badge passed, word for word", badgeText(pass, 90), "Pangram: 94% human · passed (your level: 90%)");
eq("badge needs work", badgeText(fail, 90), "Pangram: 72% human · needs work (your level: 90%)");
eq("badge not verified", [badgeText(null, 90), badgeText(localVerdict(95, 90, H, "no-key"), 90)], ["Not verified, free score only", "Not verified, free score only"]);
eq("badge off at level 0", badgeText(pass, 0), "Humanization off");
eq("never promises 100% human beyond Pangram's own words", /guarantee|100% human(?! ·)/.test(badgeText(pangramVerdict({ ...human }, 90, H), 90)), false);
eq("states", [stateOf(pass, 90), stateOf(fail, 90), stateOf(null, 90), stateOf(pass, 0)], ["passed", "needs", "free", "off"]);
eq("chips", [chipText(pass), chipText(localVerdict(80, 90, H, "no-key")), chipText(null)], ["Pangram 94%", "Not verified", "Not checked"]);
eq("Library filter states", [libState(pass), libState(fail), libState(null), libState(localVerdict(99, 90, H, "no-cap"))], ["passed", "needs", "unchecked", "unchecked"]);
eq("gate: comments never wait", gate("comment", 90, null, H), { ok: true, why: "" });
eq("gate: level 0 always passes", gate("post", 0, null, H), { ok: true, why: "" });
eq("gate: never checked", gate("post", 90, null, H), { ok: false, why: "check" });
eq("gate: text changed since the check", gate("post", 90, pass, "other"), { ok: false, why: "check" });
eq("gate: Pangram at or above the level", gate("article", 90, pass, H), { ok: true, why: "" });
eq("gate: Pangram below the level", gate("post", 90, fail, H), { ok: false, why: "below" });
eq("gate: Pangram unusable, free score at level passes", gate("post", 90, localVerdict(92, 90, H, "cap-reached"), H), { ok: true, why: "" });
eq("gate: Pangram unusable, free score under level", gate("post", 90, localVerdict(85, 90, H, "no-key"), H), { ok: false, why: "below" });
eq("gate: no extension, free score at level passes (Not verified)", gate("post", 90, localVerdict(92, 90, H, "no-ext"), H), { ok: true, why: "" });
eq("gate: old extension, free score under level is held back", gate("article", 90, localVerdict(80, 90, H, "old-ext"), H), { ok: false, why: "below" });
eq("gate: free score too low to pay for a check", gate("post", 90, localVerdict(60, 90, H, "local-low"), H), { ok: false, why: "below" });
eq("gate: a free verdict for another reason needs a check", gate("post", 90, localVerdict(95, 90, H, "confirm"), H), { ok: false, why: "check" });
eq("gate label", gateLabel(90), "Fix to reach 90% first");

// ---------- settings ----------
eq("defaults before db/031: everything off", mergeSettings(null), { level_comment: 0, level_post: 0, level_article: 0, pangram_cap: 0, walter_cap: 0, pangram_cost_100: 0.05, walter_cost_100: 0 });
eq("levels clamp, numbers from Postgres strings", mergeSettings({ level_post: 140, level_article: -5, pangram_cost_100: "0.07" as unknown as number }).level_post, 100);
eq("level per kind", levelFor(mergeSettings({ level_comment: 70, level_post: 90, level_article: 100 }), "article"), 100);
eq("format to kind", [kindOfFormat("Article"), kindOfFormat("Carousel"), kindOfFormat("")], ["article", "post", "post"]);
eq("presets", [...PRESETS], [20, 50, 70, 90, 100]);

// ---------- the cache key ----------
eq("normalised text", normText("  In my view\n\n the  rail\tmatters. "), "In my view the rail matters.");
eq("same text, other spacing, same hash", await textHash("In my view  the rail\nmatters."), await textHash("In my view the rail matters. ".trim()));
eq("a changed word is a new hash", (await textHash("In my view the rail matters.")) === (await textHash("In my view the rails matter.")), false);
eq("hash is hex SHA-256", /^[0-9a-f]{64}$/.test(await textHash("x")), true);
eq("known SHA-256 of 'abc'", await textHash("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");

// ---------- caps and cost ----------
eq("meter: no cap", meter(500, 0).state, "none");
eq("meter: fine, warn at 80%, stop at 100%", [meter(799, 1000).state, meter(800, 1000).state, meter(999, 1000).state, meter(1000, 1000).state, meter(1200, 1000).state], ["ok", "warn", "warn", "stop", "stop"]);
eq("cost per 100 words", [costOf(250, 0.05), costOf(0, 0.05), costOf(100, 0)], [0.125, 0, 0]);
eq("money", [money(0.125), money(0.004), money(0)], ["$0.13", "under $0.01", "$0.00"]);
const mu = monthUsage([
  { service: "pangram", words: 300, cost: "0.15", day: "2026-11-02" }, { service: "pangram", words: 200, cost: 0.1, day: "2026-11-06" },
  { service: "pangram", words: 900, cost: 0.45, day: "2026-10-30" }, { service: "walter", words: 50, cost: 0, day: "2026-11-03" },
], "2026-11");
eq("this month's use per service, last month left out", [mu.pangram.words, mu.pangram.cost, mu.pangram.checks, mu.walter.words], [500, 0.25, 2, 50]);

// ---------- words, paragraphs, diffing ----------
eq("word count", [wordCount(""), wordCount("  one  two\nthree ")], [0, 3]);
const article = "Why settlement decides it\n\nBanks in the region have spent two years on pilots that never reach a ledger of record.\n\nThe second paragraph is about controls and the people who sign off on each release.\n\nShort close.";
const ps = paragraphsOf(article);
eq("paragraphs: a heading joins the next block, a short close joins the last", ps.length, 2);
eq("paragraphs keep the heading text", ps[0].startsWith("Why settlement decides it\n\nBanks"), true);
eq("paragraphs: the short close is kept", ps[1].endsWith("Short close."), true);
eq("one long block is one paragraph", paragraphsOf("one two three four five six seven eight nine").length, 1);
eq("a lone short text is kept", paragraphsOf("Hi there").length, 1);
const edited = article.replace("controls and the people", "controls and the teams");
eq("diff: only the edited paragraph is checked again", paragraphDiff(paragraphsOf(article), paragraphsOf(edited)), { changed: [1], kept: [0] });
eq("diff: whitespace is not an edit", paragraphDiff(ps, ps.map((p) => p.replace(/ /g, "  "))), { changed: [], kept: [0, 1] });
eq("diff: a repeated paragraph counts once each", paragraphDiff(["a b"], ["a b", "a b"]), { changed: [1], kept: [0] });
eq("diff: first check sends everything", paragraphDiff([], ps), { changed: [0, 1], kept: [] });

// ---------- highlighting and the rewrite review ----------
const draft = "In my view the rail matters. It is a pivotal shift that will reshape the landscape. Banks still need controls.";
const flag = [{ text: "It is a pivotal shift that will reshape the landscape." }];
const hl = highlight(draft, flag);
eq("highlight finds the window", hl.filter((p) => p.flagged).map((p) => p.text), ["It is a pivotal shift that will reshape the landscape."]);
eq("highlight pieces join back exactly", hl.map((p) => p.text).join(""), draft);
eq("a normalised window is found sentence by sentence", highlight(draft, [{ text: "It is a pivotal shift that will reshape the landscape.  Banks still need controls." }]).filter((p) => p.flagged).length, 2);
eq("flagged sentences really in the draft", flaggedSentences(draft, [{ text: "Not in the draft at all." }, ...flag]), ["It is a pivotal shift that will reshape the landscape."]);
eq("sentences", sentencesOf("One. Two? Three!"), ["One.", "Two?", "Three!"]);
const changes = parseChanges({ changes: [
  { before: "It is a pivotal shift that will reshape the landscape.", after: "It changes who owns the ledger." },
  { before: "Not in the draft.", after: "x" }, { before: "Banks still need controls.", after: "Banks still need controls." }, { before: "", after: "y" },
] }, draft);
eq("only applicable, real changes are kept", changes.length, 1);
eq("nothing applied until accepted", applyChanges(draft, changes, [false]), draft);
eq("accepted change applied", applyChanges(draft, changes, [true]), "In my view the rail matters. It changes who owns the ledger. Banks still need controls.");
eq("bad model reply gives no changes", [parseChanges(null, draft), parseChanges({ changes: "x" }, draft)], [[], []]);
eq("rewrite ask: only the flagged sentences, house rules, JSON", [rewriteAsk(draft, ["A."], 1).includes("1. A."), /No dashes, no contractions/.test(rewriteAsk(draft, ["A."], 1)), rewriteAsk(draft, ["A."], 2).includes("second try")], [true, true, true]);

// ---------- brand marks: one copy in the app, the same in the extension ----------
const marks = read("extension/marks.js");
const pm = CHECKERS.pangram.mark;
eq("Pangram mark is its own favicon SVG", "paths" in pm && pm.source, "https://www.pangram.com/favicon.svg");
eq("every Pangram path is in the extension copy", "paths" in pm && pm.paths.every((p) => marks.includes(`["${p.d}", "${p.fill}"`)), true);
eq("Walter mark is its own site icon, not a drawn look-alike", "image" in CHECKERS.walter.mark && /walterwrites\.ai\/wp-content\/uploads\/.*Walter-Alterated-Logo_Icon/.test(CHECKERS.walter.mark.source), true);
eq("Walter is labelled beta everywhere", [CHECKERS.walter.label, /label: "Walter \(beta\)"/.test(marks)], ["Walter (beta)", true]);

// ---------- db/031, the route and the extension agree ----------
const sql = read("db/031_humanize.sql");
eq("031 is re-runnable", [/create table if not exists humanize_settings/, /create table if not exists humanize_usage/, /create table if not exists humanize_results/, /add column if not exists humanize jsonb/, /drop policy if exists hs_r/].every((r) => r.test(sql)), true);
eq("031 RLS by has_role", (sql.match(/has_role\(workspace_id, '(viewer|editor|owner)'\)/g) ?? []).length >= 6, true);
eq("031 usage is tagged with job and section", [/job text not null default 'humanize_check'/, /'humanize_rewrite'/, /section text not null default ''/].every((r) => r.test(sql)), true);
eq("031 default cost 0.05 per 100 words", /pangram_cost_100 numeric\(10,4\) not null default 0\.05/.test(sql), true);
eq("031 levels 0 to 100", /level_comment between 0 and 100/.test(sql), true);
eq("031 ext functions check the token", (sql.match(/select \* into a from ext_auth\(tok\)/g) ?? []).length, 3);
const bg = read("extension/background.js"), bridge = read("extension/bridge.js"), route = read("src/app/api/ext/[action]/route.ts");
const manifest = JSON.parse(read("extension/manifest.json"));
eq("extension 0.9.6 in manifest and LATEST_EXT", [manifest.version, /LATEST_EXT = "0\.9\.6"/.test(read("src/lib/bridge.ts"))], ["0.9.6", true]);
eq("manifest allows the documented Pangram host only", [manifest.host_permissions.includes("https://text.external-api.pangram.com/*"), manifest.optional_host_permissions], [true, ["https://api.walterwrites.ai/*"]]);
eq("background uses the documented x-api-key, /task and /models", [/"x-api-key": key/.test(bg), /pangramFetch\("\/task"/.test(bg), /"\/task\/" \+ encodeURIComponent/.test(bg), /pangramFetch\("\/models"/.test(bg)], [true, true, true, true]);
const toPrax = bg.slice(bg.indexOf("async function humanize"), bg.indexOf("chrome.runtime.onMessage"));
eq("no key is ever sent to Prax (only whether one exists)", (toPrax.match(/prax\("humanize", \{[^}]*\}/g) ?? []).some((m) => /(?<!!!)keys\.|apiKey/.test(m)), false);
eq("every paid call is tagged with its job", [/job: "humanize_check"/.test(toPrax), /job: "humanize_rewrite"/.test(toPrax)], [true, true]);
eq("Walter is only called through its adapter", [/WALTER\.humanize\(keys\.walter/.test(bg), /importScripts\("walter\.js"\)/.test(bg), /confirmed: false/.test(read("extension/walter.js"))], [true, true, true]);
eq("the bridge never reads a checker key back", /checkers\.pangram\b(?!\))/.test(bridge.slice(bridge.indexOf("async function status"), bridge.indexOf("const ASK"))), false);
eq("the route maps with the detector, not the extension", /DETECTORS\[service\]/.test(route), true);
eq("the LinkedIn bar loads the marks", [manifest.content_scripts[0].js.includes("marks.js"), /"dom\.js", "marks\.js", "content\.js"/.test(bg)], [true, true]);

// ---------- QA fixes (7 Nov): cache without text, versions, waits, trust, profile ----------
throws("a score outside 0 to 1 is refused", () => mapPangram({ stage: "STAGE_SUCCESS", fraction_human: 1.7, windows: [] }), /out of range/);
throws("a negative score is refused", () => mapPangram({ stage: "STAGE_SUCCESS", fraction_human: -0.1, windows: [] }), /out of range/);
throws("a non-number score is refused", () => mapPangram({ stage: "STAGE_SUCCESS", fraction_human: Number.NaN, windows: [] }), /no score/);
const ctext = "In my view the rail matters.  It is a pivotal shift that will reshape the landscape. Banks still need controls.";
const cres: Result = { score: 61, words: 20, prediction: "Mixed", headline: "AI Assisted", version: "4.0", flagged: [{ text: "It is a pivotal shift that will reshape the landscape.", label: "AI-Generated", ai: 0.9, confidence: "High", start: 29, end: 83 }] };
const cached = toCache(cres, ctext);
eq("the cache holds no text, only offsets", [JSON.stringify(cached).includes("pivotal"), JSON.stringify(cached).includes("rail"), "text" in cached.flagged[0]], [false, false, false]);
eq("cache offsets are into the normalised text", cached.flagged[0], { start: 29, end: 83, label: "AI-Generated", ai: 0.9, confidence: "High" });
const back = fromCache(cached, ctext.replace("  ", " "))!;
eq("the same text (other spacing) cuts the flagged sentence back out", [back.score, back.flagged.map((f) => f.text)], [61, ["It is a pivotal shift that will reshape the landscape."]]);
eq("a sentence not found in the text is not cached", toCache({ ...cres, flagged: [{ ...cres.flagged[0], text: "Never written here." }] }, ctext).flagged, []);
eq("bad cache rows give nothing", [fromCache(null, "x"), fromCache({ words: 3 } as never, "x")], [null, null]);
eq("offsets outside the text are dropped", fromCache({ ...cached, flagged: [{ start: 5, end: 9999, label: "AI", ai: 1, confidence: "" }] }, ctext)!.flagged, []);
eq("versions", [versionAtLeast("0.9.6", HUMANIZE_EXT), versionAtLeast("0.9.10", HUMANIZE_EXT), versionAtLeast("1.0", HUMANIZE_EXT), versionAtLeast("0.9.5", HUMANIZE_EXT), versionAtLeast("0.8.9", HUMANIZE_EXT), versionAtLeast("", HUMANIZE_EXT), versionAtLeast(undefined, HUMANIZE_EXT)], [true, true, true, false, false, false, false]);
eq("no humanize ask waits more than 20 s", HUMANIZE_WAIT_MS <= 20000, true);
const hook = read("src/components/humanize/use-humanize.ts");
eq("every humanize ask from a page uses the 20 s limit", (hook.match(/askExtension<[^>]+>\("humanize"[\s\S]*?\}, (\w+)\)/g) ?? []).every((m) => /HUMANIZE_WAIT_MS\)$/.test(m)) && !/180000/.test(hook), true);
eq("pages send the profile on screen", [/profile: ws\.id/.test(hook), /profile: String\(d\.profile/.test(bridge), /profile_id, kind, texts/.test(bg)], [true, true, true]);
eq("the background hashes text the same way as Prax", [/replace\(\/\\s\+\/g, " "\)\.trim\(\)/.test(bg.slice(bg.indexOf("async function textHash"))), /hash: await textHash\(texts\[i\]\)/.test(bg)], [true, true]);
eq("the route refuses a hash that does not match the text, and says the score is an accepted risk", [/String\(body\.hash \?\? ""\) !== hash/.test(route), /ACCEPTED RISK during the proof of concept/.test(route)], [true, true]);
eq("the route caches offsets, not text", /result: toCache\(result, text\)/.test(route), true);
eq("a rejected key points to Settings, not the Extension page", [/401: "[^"]*Settings → Humanization/.test(bg), /401: "[^"]*Extension page/.test(bg)], [true, false]);
eq("Pangram polling stops before the 20 s page limit", /spent < 18000/.test(bg), true);
eq("Walter's ready flag matches its adapter", [CHECKERS.walter.ready, /confirmed: false/.test(read("extension/walter.js"))], [false, true]);
eq("031 checks the profile against the token's user", [/function ext_humanize_ws/, /has_role_of\(pid::uuid, tok_uid, 'editor'\)/, /pw := ext_humanize_ws\(a\.ws, a\.uid, p\)/g].map((r) => (sql.match(r) ?? []).length), [1, 1, 2]);
eq("031 range-checks the score and requires a real hash", [/score out of range/.test(sql), /bad text hash/.test(sql)], [true, true]);

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
