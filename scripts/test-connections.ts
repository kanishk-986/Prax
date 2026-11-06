// Checks Connections (C1, db/032): the catalog, route resolution with fallback (the web app's rule and the extension's
// copy agree), usage aggregation by tool, job and section, caps, settings cleaning, each wired tool's request and reply
// mapping against replies saved from the vendors' own docs (scripts/fixtures/connections), and that db/032, the
// extension and the web app agree. Run: node scripts/test-connections.ts
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import {
  TOOLS, SECTIONS, JOBS, BUILT_IN, APP_SECTION_IDS, PRICES, routeFor, resolveRoute, jobsUsing, cardState, eventsOf, filterEvents, breakdown, totalsOf, daily,
  capState, capLine, blockedTools, mergeConnSettings, filterCatalog, neighbours, usageLine, spendLine, tokenCost, keyTool, toolOf,
  type ExtUsageRow, type HumanizeRow, type Route,
} from "../src/lib/connections.ts";
import { PRICE } from "../src/lib/providers.ts";
import { mapGptzero, mapOriginality, DETECTORS, detection } from "../src/lib/humanize.ts";

const require = createRequire(import.meta.url);
const X = require("../extension/tools.js");
const file = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const fx = (name: string) => JSON.parse(file(`scripts/fixtures/connections/${name}.json`)).response;

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const throws = (name: string, fn: () => unknown, re: RegExp) => { let m = ""; try { fn(); } catch (e) { m = (e as Error).message; } eq(name, re.test(m), true); };

// ---------- catalog ----------
eq("20 to 25 tools", TOOLS.length >= 20 && TOOLS.length <= 25, true);
eq("tool ids are unique", new Set(TOOLS.map((t) => t.id)).size, TOOLS.length);
eq("seven sections, in order", SECTIONS.map((s) => s.id), ["writing", "citations", "humanize", "data", "media", "meetings", "mcp"]);
eq("every section has a tool", SECTIONS.every((s) => TOOLS.some((t) => t.section === s.id)), true);
eq("writing models", TOOLS.filter((t) => t.section === "writing").map((t) => t.id), ["claude", "openai", "gemini", "perplexity", "mistral", "deepseek", "groq", "grok"]);
eq("humanization and detection", TOOLS.filter((t) => t.section === "humanize").map((t) => t.id), ["pangram", "walter", "gptzero", "originality"]);
eq("data and discovery", TOOLS.filter((t) => t.section === "data").map((t) => t.id).sort(), ["apify", "crunchbase", "exa", "firecrawl", "newsapi", "tavily"]);
eq("images", TOOLS.filter((t) => t.section === "media").map((t) => t.id), ["openai_images", "gemini_images"]);
eq("Prax MCP is coming later, with what it will do", [toolOf("prax_mcp")?.coming, !!toolOf("prax_mcp")?.later], [true, true]);
eq("Walter is beta", toolOf("walter")?.beta, true);
eq("every tool links to https docs", TOOLS.every((t) => /^https:\/\//.test(t.docs)), true);
eq("every job a tool lists exists", TOOLS.every((t) => t.jobs.every((j) => JOBS.some((x) => x.id === j))), true);
eq("listed-only tools say what they will be used for", TOOLS.filter((t) => !t.jobs.length).every((t) => !!t.later), true);
eq("every routed job's tools are catalog tools or built in", JOBS.every((j) => j.tools.every((t) => !!toolOf(t) || t in BUILT_IN)), true);
eq("a job's tools list the job back", JOBS.every((j) => j.tools.every((t) => t in BUILT_IN || toolOf(t)!.jobs.includes(j.id))), true);
eq("no tool is described as reading LinkedIn", TOOLS.every((t) => !/scrap\w* linkedin|crawl\w* linkedin|read\w* linkedin/i.test(`${t.about} ${t.uses.join(" ")} ${t.later ?? ""}`)), true);
eq("images share the writing keys", [keyTool("openai_images"), keyTool("gemini_images"), keyTool("exa")], ["openai", "gemini", "exa"]);
eq("Claude prices match providers.ts", Object.entries(PRICE).every(([m, p]) => JSON.stringify(PRICES[m]) === JSON.stringify(p)), true);
eq("cost from list price", tokenCost("deepseek-flash", 1_000_000, 1_000_000), 1.5);
eq("no price, no cost", tokenCost("unknown-model", 10, 10), null);

// Brand files: every logo the catalog serves from /public/brand exists and is an SVG.
for (const f of ["apify", "groq", "newsapi", "serpapi", "tavily"]) eq(`public/brand/${f}.svg is an svg`, /<svg/.test(file(`public/brand/${f}.svg`)), true);
const marks = file("src/lib/connections-marks.ts");
eq("each simple-icons mark names its source", (marks.match(/source: "simple-icons 16\.36\.0/g) ?? []).length, 5);
eq("names without a legitimate mark stay name only", ["gptzero", "originality", "firecrawl", "exa"].every((id) => !new RegExp(`\\b${id}:`).test(marks)), true);

// Catalog filters, combined, and Previous and Next.
const on = new Set(["claude", "pangram", "exa"]);
const used = (id: string) => (id === "claude" ? ["comment" as const] : []);
eq("filter by section", filterCatalog(TOOLS, { q: "", section: "humanize", status: "", job: "" }, (id) => on.has(id), used).length, 4);
eq("section plus not connected", filterCatalog(TOOLS, { q: "", section: "humanize", status: "not", job: "" }, (id) => on.has(id), used).map((t) => t.id), ["walter", "gptzero", "originality"]);
eq("section, status and job together", filterCatalog(TOOLS, { q: "", section: "humanize", status: "not", job: "humanize_rewrite" }, (id) => on.has(id), used).map((t) => t.id), ["walter"]);
eq("in use", filterCatalog(TOOLS, { q: "", section: "", status: "used", job: "" }, (id) => on.has(id), used).map((t) => t.id), ["claude"]);
eq("search", filterCatalog(TOOLS, { q: "images", section: "", status: "", job: "" }, () => false, used).map((t) => t.id), ["openai_images", "gemini_images"]);
eq("no match is empty", filterCatalog(TOOLS, { q: "zzzz", section: "", status: "", job: "" }, () => false, used).length, 0);
eq("not connected leaves out Prax MCP", filterCatalog(TOOLS, { q: "", section: "mcp", status: "not", job: "" }, () => false, used).length, 0);
eq("next wraps at the end", neighbours("prax_mcp").next.id, "claude");
eq("previous wraps at the start", neighbours("claude").prev.id, "prax_mcp");
eq("previous and next inside a filtered walk", (() => { const l = TOOLS.filter((t) => t.section === "data"); const n = neighbours("exa", l); return [n.prev.id, n.next.id]; })(), ["apify", "tavily"]);

// ---------- routes ----------
eq("writing jobs default to the drafting model in this browser", routeFor("comment", {}, "gemini"), { primary: "gemini", fallback: "" });
eq("fetch defaults to Prax's reader", routeFor("discovery_fetch", {}), { primary: "prax_reader", fallback: "" });
eq("check defaults to Pangram", routeFor("humanize_check", {}), { primary: "pangram", fallback: "" });
eq("rewrite: Prax first, then Walter", routeFor("humanize_rewrite", {}), { primary: "prax_rewrite", fallback: "walter" });
eq("images: OpenAI, then Gemini", routeFor("image", {}), { primary: "openai_images", fallback: "gemini_images" });
eq("a saved route wins", routeFor("comment", { comment: { primary: "openai", fallback: "claude" } }, "gemini"), { primary: "openai", fallback: "claude" });
eq("a saved route with a tool the job cannot use falls back to the default", routeFor("comment", { comment: { primary: "exa", fallback: "" } }, "claude"), { primary: "claude", fallback: "" });
eq("a fallback equal to the primary is dropped", routeFor("post", { post: { primary: "claude", fallback: "claude" } }), { primary: "claude", fallback: "" });

const R: Route = { primary: "openai", fallback: "claude" };
const cases: [string, Route, string[], string[], unknown][] = [
  ["primary with a key", R, ["openai", "claude"], [], { tool: "openai", usedFallback: false, reason: "" }],
  ["primary without a key uses the fallback", R, ["claude"], [], { tool: "claude", usedFallback: true, reason: "" }],
  ["primary at its cap uses the fallback", R, ["openai", "claude"], ["openai"], { tool: "claude", usedFallback: true, reason: "" }],
  ["both capped", R, ["openai", "claude"], ["openai", "claude"], { tool: null, usedFallback: false, reason: "cap" }],
  ["no keys", R, [], [], { tool: null, usedFallback: false, reason: "no-key" }],
  ["built in needs no key", { primary: "prax_reader", fallback: "firecrawl" }, [], [], { tool: "prax_reader", usedFallback: false, reason: "" }],
  ["no route", { primary: "", fallback: "" }, [], [], { tool: null, usedFallback: false, reason: "none" }],
];
for (const [name, route, keys, blocked, want] of cases) {
  const a = resolveRoute(route, (t) => keys.includes(t), (t) => blocked.includes(t));
  const b = X.resolve(route, (t: string) => keys.includes(t), (t: string) => blocked.includes(t));
  eq(`route: ${name}`, { tool: a.tool, usedFallback: a.usedFallback, reason: a.reason }, want);
  eq(`route: ${name} (extension agrees)`, b, a);
}
// The extension's defaults for unsaved routes match the web app's.
const bg = file("extension/background.js");
const jd = JSON.parse(bg.match(/const JOB_DEFAULT = (\{[^\n]+\});/)![1].replace(/(\w+):/g, '"$1":'));
for (const j of ["discovery_search", "discovery_fetch", "humanize_check", "humanize_rewrite", "image"] as const) eq(`extension default route for ${j}`, jd[j], routeFor(j, {}));
eq("extension writing jobs", /const WRITING_JOBS = \["comment", "post", "analysis"\];/.test(bg), true);

// Honest card lines from the routes.
const claude = toolOf("claude")!, exa = toolOf("exa")!, mcp = toolOf("prax_mcp")!;
eq("card: used by 2 jobs", cardState(claude, true, jobsUsing("claude", {}, "claude")).line, "Connected · used by 3 jobs");
eq("card: connected but not routed", cardState(exa, true, jobsUsing("exa", { discovery_search: { primary: "tavily", fallback: "" } })).line, "Connected · not used by any job yet");
eq("card: never connected without a key", cardState(claude, false, ["comment"]).line, "Not connected");
eq("card: coming later", cardState(mcp, false, []).line, "Coming later");
eq("citations engines count only when ticked", jobsUsing("perplexity", {}, "claude", ["perplexity"]), ["citations"]);
eq("SerpApi counts for Google AI and Copilot", jobsUsing("serpapi", {}, "claude", ["google_ai"]), ["citations"]);

// ---------- settings ----------
eq("settings are cleaned", mergeConnSettings({ routes: { comment: { primary: "openai", fallback: "openai" }, post: { primary: "exa", fallback: "" }, nope: { primary: "claude" } }, caps: { claude: { limit: 10, unit: "calls" }, exa: { limit: 0 }, fake: { limit: 5 } }, advanced: { comment: true, post: "yes" } }),
  { routes: { comment: { primary: "openai", fallback: "" } }, caps: { claude: { limit: 10, unit: "calls" } }, advanced: { comment: true } });
eq("an empty row", mergeConnSettings(null), { routes: {}, caps: {}, advanced: {} });

// ---------- usage ----------
const NOW = "2026-11-06";
const ext: ExtUsageRow[] = [
  { id: 1, at: `${NOW}T09:00:00Z`, kind: "comment", provider: "claude", model: "claude-opus-5-5", input_tokens: 1000, output_tokens: 500, job: "comment", section: "linkedin_bar", ok: true },
  { id: 2, at: `${NOW}T09:05:00Z`, kind: "studio", provider: "claude", model: "claude-opus-5-5", input_tokens: 2000, output_tokens: 1000, job: "post", section: "content_studio", ok: true },
  { id: 3, at: `${NOW}T09:10:00Z`, kind: "search", provider: "exa", model: "", input_tokens: 0, output_tokens: 0, job: "discovery_search", section: "discovery", units: 1, cost: 0.007, ok: true },
  { id: 4, at: `${NOW}T09:20:00Z`, kind: "comment", provider: "openai", model: "gpt-5", input_tokens: 0, output_tokens: 0, job: "comment", section: "comment_studio", ok: false },
  { id: 5, at: `${NOW}T09:30:00Z`, kind: "citation", provider: "google_ai", model: "google_ai_overview", input_tokens: 0, output_tokens: 0 },
  { id: 6, at: `${NOW}T09:31:00Z`, kind: "scores", provider: "claude", model: "", input_tokens: 0, output_tokens: 0 },
  { id: 7, at: `${NOW}T09:40:00Z`, kind: "image", provider: "gemini", model: "gemini-2.5-flash-image", input_tokens: 0, output_tokens: 0 },
  { id: 8, at: "2026-10-20T09:00:00Z", kind: "reply", provider: "claude", model: "claude-opus-5-5", input_tokens: 100, output_tokens: 100 },
  { id: 9, at: `${NOW}T10:00:00Z`, kind: "test", provider: "tavily", model: "", input_tokens: 0, output_tokens: 0, job: "test", section: "connections", ok: true },
];
const hum: HumanizeRow[] = [
  { id: "a", day: NOW, created_at: `${NOW}T11:00:00Z`, service: "pangram", words: 300, cost: 0.15, job: "humanize_check", section: "content_write", result: "passed" },
  { id: "b", day: NOW, created_at: `${NOW}T11:05:00Z`, service: "gptzero", words: 100, cost: 0.046, job: "humanize_check", section: "comment_studio", result: "needs work" },
];
const ev = eventsOf(ext, hum);
eq("score reports carry no call", ev.length, 10);
eq("SerpApi engines count as SerpApi", ev.find((e) => e.id === "e5")?.tool, "serpapi");
eq("SerpApi rows count a search", ev.find((e) => e.id === "e5")?.units, 1);
eq("images are their own tool", ev.find((e) => e.id === "e7")?.tool, "gemini_images");
eq("old rows get a job from their kind", [ev.find((e) => e.id === "e8")?.job, ev.find((e) => e.id === "e5")?.job, ev.find((e) => e.id === "e7")?.job], ["comment", "citations", "image"]);
eq("old rows get a section from their kind", ev.find((e) => e.id === "e8")?.section, "linkedin_bar");
eq("reported cost is kept", ev.find((e) => e.id === "e3")?.cost, 0.007);
eq("token cost from the list price", ev.find((e) => e.id === "e1")?.cost, 0.014);
eq("an unpriced model has no cost", ev.find((e) => e.id === "e4")?.cost, null);
eq("humanize rows: words and job", [ev.find((e) => e.id === "ha")?.units, ev.find((e) => e.id === "ha")?.job, ev.find((e) => e.id === "hb")?.tool], [300, "humanize_check", "gptzero"]);
const month = filterEvents(ev, { month: "2026-11" });
eq("this month only", month.length, 9);
eq("last 30 days", filterEvents(ev, { days: 30, now: new Date(`${NOW}T12:00:00Z`) }).length, 10);
const t = totalsOf(month);
const sum = (rows: ReturnType<typeof breakdown>) => ({ calls: rows.reduce((s, r) => s + r.totals.calls, 0), cost: Math.round(rows.reduce((s, r) => s + r.totals.cost, 0) * 1e6) / 1e6 });
eq("totals agree across tool, job and section", [sum(breakdown(month, "tool")), sum(breakdown(month, "job")), sum(breakdown(month, "section"))].map((x) => JSON.stringify(x)).every((x) => x === JSON.stringify({ calls: t.calls, cost: Math.round(t.cost * 1e6) / 1e6 })), true);
eq("failed calls are counted", t.failed, 1);
eq("by job", breakdown(month, "job").map((r) => [r.key, r.totals.calls]), [["comment", 2], ["humanize_check", 2], ["citations", 1], ["discovery_search", 1], ["image", 1], ["post", 1], ["test", 1]]);
eq("by section for one tool, with shares", breakdown(filterEvents(month, { tool: "claude" }), "section").map((r) => [r.key, r.share]), [["content_studio", 0.5], ["linkedin_bar", 0.5]]);
eq("section filter", filterEvents(month, { section: "discovery" }).map((e) => e.tool), ["exa"]);
eq("job filter", filterEvents(month, { job: "humanize_check" }).map((e) => e.tool), ["gptzero", "pangram"]);
eq("daily trend", daily(month, 3, new Date(`${NOW}T12:00:00Z`)).map((d) => d.calls), [0, 0, 9]);
eq("usage line", usageLine(totalsOf(filterEvents(month, { tool: "claude" }))), "2 calls · 4.5k tokens · $0.04");
eq("usage line with no calls", usageLine(totalsOf([])), "None this month");
eq("spend line, not priced", spendLine(totalsOf(filterEvents(month, { tool: "serpapi" }))), "Not priced");

// ---------- caps ----------
const claudeMonth = totalsOf(filterEvents(month, { tool: "claude" }));
eq("no cap", capState(undefined, claudeMonth).state, "none");
eq("under 80%", capState({ limit: 10, unit: "calls" }, claudeMonth).state, "ok");
eq("80% warns", capState({ limit: 2.5, unit: "calls" }, claudeMonth).state, "warn");
eq("100% stops", capState({ limit: 2, unit: "calls" }, claudeMonth).state, "stop");
eq("usd cap", capState({ limit: 0.05, unit: "usd" }, claudeMonth).state, "warn");
eq("words cap", capState({ limit: 300, unit: "words" }, totalsOf(filterEvents(month, { tool: "pangram" }))).state, "stop");
eq("100 calls with 80 used warns (QA path 8)", capState({ limit: 100, unit: "calls" }, { calls: 80, tokens: 0, units: 0, cost: 0, priced: 0, failed: 0 }).state, "warn");
eq("cap line", capLine(capState({ limit: 2.5, unit: "calls" }, claudeMonth)), "80% of the cap used: 2 calls of 3 calls. Paid calls stop at 100%.");
eq("blocked tools", blockedTools({ claude: { limit: 2, unit: "calls" }, exa: { limit: 1, unit: "usd" } }, ev, "2026-11"), ["claude"]);

// ---------- requests ----------
const hdr = (r: { init: { headers: Record<string, string> } }) => r.init.headers;
eq("Claude chat uses x-api-key and the browser header", [hdr(X.chatRequest("claude", "k", "", "s", "u"))["x-api-key"], hdr(X.chatRequest("claude", "k", "", "s", "u"))["anthropic-dangerous-direct-browser-access"]], ["k", "true"]);
for (const [tool, url] of [["openai", "https://api.openai.com/v1/chat/completions"], ["mistral", "https://api.mistral.ai/v1/chat/completions"], ["deepseek", "https://api.deepseek.com/chat/completions"], ["groq", "https://api.groq.com/openai/v1/chat/completions"], ["grok", "https://api.x.ai/v1/chat/completions"]]) {
  const r = X.chatRequest(tool, "k", "", "SYS", "USER");
  eq(`${tool} chat endpoint and bearer`, [r.url, hdr(r).authorization, JSON.parse(r.init.body).messages.map((m: { role: string }) => m.role)], [url, "Bearer k", ["system", "user"]]);
}
eq("DeepSeek turns thinking off", JSON.parse(X.chatRequest("deepseek", "k", "", "s", "u").init.body).thinking, { type: "disabled" });
eq("DeepSeek default model is deepseek-flash", JSON.parse(X.chatRequest("deepseek", "k", "", "s", "u").init.body).model, "deepseek-flash");
eq("Perplexity uses the Agent API with instructions", (() => { const r = X.chatRequest("perplexity", "k", "", "SYS", "USER"); const b = JSON.parse(r.init.body); return [r.url, b.effort, b.instructions, b.input]; })(), ["https://api.perplexity.ai/v1/agent", "fast", "SYS", "USER"]);
eq("Exa search asks for text", JSON.parse(X.searchRequest("exa", "k", "q", 5).init.body), { query: "q", numResults: 5, type: "auto", contents: { text: { maxCharacters: 1200 } } });
eq("Tavily search asks for usage", JSON.parse(X.searchRequest("tavily", "k", "q", 5).init.body).include_usage, true);
eq("Firecrawl scrape asks for markdown", JSON.parse(X.fetchRequest("firecrawl", "k", "https://example.com/a").init.body).formats, ["markdown"]);
throws("data tools never read LinkedIn", () => X.fetchRequest("firecrawl", "k", "https://www.linkedin.com/in/someone"), /never reads LinkedIn/);
eq("GPTZero header", hdr(X.detectRequest("gptzero", "k", "text"))["x-api-key"], "k");
eq("Originality.ai checks AI only", (() => { const b = JSON.parse(X.detectRequest("originality", "k", "text").init.body); return [b.check_ai, b.check_plagiarism, b.storeScan]; })(), [true, false, false]);
eq("SerpApi test uses the free account call", X.testRequest("serpapi", "k").url, "https://serpapi.com/account.json?api_key=k");
eq("every wired tool has a test call", ["claude", "openai", "gemini", "perplexity", "mistral", "deepseek", "groq", "grok", "serpapi", "exa", "tavily", "firecrawl", "gptzero", "originality", "pangram", "newsapi", "apify", "crunchbase", "calendly", "openai_images", "gemini_images"].every((t) => !!X.testRequest(t, "k").url), true);
throws("Walter has no test call yet", () => X.testRequest("walter", "k"), /no test call/);

// Every host the extension calls is in the manifest.
const manifest = JSON.parse(file("extension/manifest.json"));
const hosts = new Set<string>();
for (const t of ["claude", "openai", "gemini", "perplexity", "mistral", "deepseek", "groq", "grok"]) { hosts.add(new URL(X.chatRequest(t, "k", "", "s", "u").url).host); hosts.add(new URL(X.testRequest(t, "k").url).host); }
for (const t of ["exa", "tavily", "firecrawl"]) { hosts.add(new URL(X.searchRequest(t, "k", "q").url).host); hosts.add(new URL(X.fetchRequest(t, "k", "https://example.com").url).host); }
for (const t of ["gptzero", "originality"]) hosts.add(new URL(X.detectRequest(t, "k", "x").url).host);
for (const t of ["serpapi", "tavily", "firecrawl", "gptzero", "originality", "pangram", "newsapi", "apify", "crunchbase", "calendly"]) hosts.add(new URL(X.testRequest(t, "k").url).host);
eq("manifest covers every host", [...hosts].filter((h) => !manifest.host_permissions.includes(`https://${h}/*`)), []);
eq("no host permission for LinkedIn beyond the page itself", manifest.host_permissions.filter((h: string) => /linkedin/.test(h)), ["https://www.linkedin.com/*"]);
eq("tools.js loads before bridge.js on Prax", manifest.content_scripts.find((c: { js: string[] }) => c.js.includes("bridge.js")).js, ["tools.js", "bridge.js"]);
eq("background imports tools.js", /importScripts\("tools\.js"\)/.test(bg), true);
const bridge = file("extension/bridge.js");
const bridgeTools = JSON.parse(bridge.match(/const TOOL_IDS = (\[[^\]]+\]);/)![1]);
eq("the bridge knows every connectable tool", bridgeTools.sort(), TOOLS.filter((x) => !x.coming).map((x) => x.id).sort());
const bridgeJobs = JSON.parse(bridge.match(/const JOB_IDS = (\[[^\]]+\]);/)![1]);
eq("the bridge knows every job", bridgeJobs.sort(), JOBS.map((j) => j.id).sort());
eq("status never returns a key", /tools: Object\.fromEntries\(TOOL_IDS\.map\(\(t\) => \[t, !!PRAX_TOOLS\.keyOf/.test(bridge), true);
eq("extension version is 0.9.7 and matches LATEST_EXT", [manifest.version, /LATEST_EXT = "0\.9\.7"/.test(file("src/lib/bridge.ts"))], ["0.9.7", true]);

// keyOf: a per-job key, the tool's own key, then the older slots.
const cfg = { provider: "claude", apiKey: "main", keys: { openai: "o", serpapi: "s" }, checkers: { pangram: "p" }, jobKeys: { comment: { tool: "claude", key: "jk" } } };
eq("keyOf", [X.keyOf(cfg, "claude", "comment"), X.keyOf(cfg, "claude", "post"), X.keyOf(cfg, "openai_images", ""), X.keyOf(cfg, "pangram", ""), X.keyOf(cfg, "mistral", "")], ["jk", "main", "o", "p", ""]);

// ---------- replies, from the vendors' docs ----------
eq("OpenAI chat", X.mapChat("openai", fx("openai-chat")), { text: "Hello! How can I assist you today?", input_tokens: 19, output_tokens: 10, cost: null });
eq("DeepSeek chat", X.mapChat("deepseek", fx("deepseek-chat")).input_tokens, 7);
eq("Groq chat", [X.mapChat("groq", fx("groq-chat")).output_tokens, X.mapChat("groq", fx("groq-chat")).text.length > 0], [556, true]);
eq("xAI chat", X.mapChat("grok", fx("xai-chat")), { text: "101 multiplied by 3 is 303.", input_tokens: 32, output_tokens: 9, cost: null });
eq("Mistral chat (the docs' placeholder reply) maps to empty, not a crash", X.mapChat("mistral", fx("mistral-chat")), { text: "", input_tokens: 0, output_tokens: 0, cost: null });
eq("xAI cost ticks", X.mapChat("grok", { choices: [{ message: { content: "x" } }], usage: { prompt_tokens: 1, completion_tokens: 1, cost_in_usd_ticks: 2e8 } }).cost, 0.02);
// Perplexity's docs show no example reply for /v1/agent; this is built from its documented fields (output_text, usage.cost.total_cost).
eq("Perplexity agent (documented fields)", X.mapChat("perplexity", { output_text: "OK", usage: { input_tokens: 4, output_tokens: 1, cost: { total_cost: 0.0004 } } }), { text: "OK", input_tokens: 4, output_tokens: 1, cost: 0.0004 });
throws("Claude refusal", () => X.mapChat("claude", { stop_reason: "refusal" }), /declined/);
const exaS = X.mapSearch("exa", fx("exa-search"));
eq("Exa search: items and cost", [exaS.items.length > 0, exaS.items[0].url, exaS.cost], [true, fx("exa-search").results[0].url, 0.007]);
const tvS = X.mapSearch("tavily", fx("tavily-search"));
eq("Tavily search: items, date and credits", [tvS.items[0].title, tvS.items[0].date, tvS.units], ["Lionel Messi Facts | Britannica", "Tue, 11 Mar 2025 17:00:00 GMT", 1]);
const fcS = X.mapSearch("firecrawl", fx("firecrawl-search"));
eq("Firecrawl search: web, then news", [fcS.items[0].url, fcS.items.at(-1).url.includes("techcrunch.com"), fcS.items.length], [fx("firecrawl-search").data.web[0].url, true, fx("firecrawl-search").data.web.length + fx("firecrawl-search").data.news.length]);
eq("search drops LinkedIn links", X.mapSearch("exa", { results: [{ url: "https://www.linkedin.com/posts/x" }, { url: "https://example.com/a", title: "A" }] }).items.map((i: { url: string }) => i.url), ["https://example.com/a"]);
eq("Exa contents", (() => { const r = X.mapFetch("exa", fx("exa-contents"), "https://exa.ai/blog/dynamic-highlights"); return [r.title, r.cost]; })(), ["Dynamic Highlights", 0.001]);
eq("Tavily extract", X.mapFetch("tavily", fx("tavily-extract"), "https://example.com/article").text, "Example extracted article content.");
eq("Firecrawl scrape", (() => { const r = X.mapFetch("firecrawl", fx("firecrawl-scrape"), "https://firecrawl.dev"); return [r.title, r.url, r.text.length > 0]; })(), ["Home - Firecrawl", "https://firecrawl.dev", true]);
throws("Tavily extract failure", () => X.mapFetch("tavily", { results: [], failed_results: [{ url: "u", error: "Failed to retrieve content" }] }, "u"), /Failed to retrieve/);

// Test connection lines.
eq("test: OpenAI models", X.mapTest("openai", fx("openai-models")), `Key works. ${fx("openai-models").data.length} models available.`);
eq("test: Anthropic models", /^Key works\. \d+ models available\.$/.test(X.mapTest("claude", fx("anthropic-models"))), true);
eq("test: SerpApi never repeats the key", (() => { const l = X.mapTest("serpapi", fx("serpapi-account")); return [l, l.includes("SECRET_API_KEY")]; })(), ["Key works. Big Data Plan, 5,958 searches left this month.", false]);
eq("test: Tavily usage", X.mapTest("tavily", fx("tavily-usage")), "Key works. 150 of 1,000 credits used on Bootstrap.");
eq("test: Firecrawl credits", X.mapTest("firecrawl", fx("firecrawl-credits")), "Key works. 1,000 credits left this period.");
eq("test: GPTZero words", X.mapTest("gptzero", fx("gptzero-usage")), "Key works. 429,569 words left on Professional.");
eq("test: Originality.ai credits", X.mapTest("originality", fx("originality-balance")), "Key works. 8,646 credits left.");
eq("test: Groq, DeepSeek, Mistral, xAI models", ["groq", "deepseek", "mistral", "grok"].map((t) => /^Key works\./.test(X.mapTest(t, fx(`${t === "grok" ? "xai" : t}-models`)))), [true, true, true, true]);
eq("errors use the vendor's words", X.errorOf("", 401, { error: { message: "Incorrect API key provided" } }), "Incorrect API key provided");
eq("errors without words", X.errorOf("", 429, {}), "The service is rate limiting this key.");

// Detectors: the extension slims the reply, Prax maps it.
const gz = X.slimDetect("gptzero", fx("gptzero-predict"));
const gzr = mapGptzero(gz);
eq("GPTZero: human score from class_probabilities", [gzr.score, gzr.prediction, gzr.flagged.length > 0], [0, "ai", true]);
eq("GPTZero: no text echoed beyond sentences", Object.keys(gz).sort(), ["class_probabilities", "confidence_category", "predicted_class", "result_message", "sentences", "version"]);
eq("GPTZero detection verdict", detection("gptzero", gzr).verdict, "ai");
const oa = mapOriginality(X.slimDetect("originality", fx("originality-scan")));
eq("Originality.ai: 100 minus ai_assisted_percent", [oa.score, oa.prediction], [96, "human"]);
throws("GPTZero without a score", () => mapGptzero({}), /no score/);
eq("detectors registered beside Pangram", Object.keys(DETECTORS), ["pangram", "gptzero", "originality"]);
eq("extension registers them too", /gptzero: \{ check:/.test(bg) && /originality: \{ check:/.test(bg), true);

// Every fixture is used and names its source.
const fixtures = readdirSync(new URL("./fixtures/connections/", import.meta.url));
eq("every fixture names its docs source", fixtures.every((f) => /^https:\/\//.test(JSON.parse(file(`scripts/fixtures/connections/${f}`)).source)), true);

// ---------- db/032 ----------
const sql = file("db/032_connections.sql");
eq("032 is re-runnable", [/create table if not exists connection_settings/.test(sql), (sql.match(/add column if not exists/g) ?? []).length, /drop policy if exists cs_r/.test(sql), (sql.match(/create or replace function/g) ?? []).length], [true, 6, true, 4]);
eq("032 has RLS by has_role", [/alter table connection_settings enable row level security/.test(sql), /has_role\(workspace_id, 'viewer'\)/.test(sql), /has_role\(workspace_id, 'editor'\)/.test(sql)], [true, true, true]);
eq("032 holds no key column", /\b(api_key|secret|key text|token text)\b/i.test(sql.replace(/--.*$/gm, "")), false);
const sqlJobs = sql.match(/p->>'job' in \(([^)]+)\)/)![1].match(/'(\w+)'/g)!.map((x) => x.slice(1, -1));
eq("032 job tags match the jobs", sqlJobs.sort(), [...JOBS.map((j) => j.id), "test"].sort());
const sqlSections = sql.match(/p->>'section' in \(([^)]+)\)/)![1].match(/'(\w+)'/g)!.map((x) => x.slice(1, -1));
eq("032 section tags match the app sections", sqlSections.sort(), [...APP_SECTION_IDS].sort());
eq("032 lets the detectors record usage", /service in \('pangram', 'walter', 'gptzero', 'originality'\)/.test(sql), true);
eq("032 security definer functions fix search_path", (sql.match(/security definer set search_path = public, pg_catalog/g) ?? []).length, 3);
eq("the extension door answers connections", /case "connections":/.test(file("src/app/api/ext/[action]/route.ts")), true);

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log("\nall connections checks pass");
