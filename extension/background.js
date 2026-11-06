// Prax background: the one place that talks to Prax and to your AI provider.
// The on-page buttons and the side panel send it messages; nothing here runs on its own.

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

const PRAX = "https://prax-gamma.vercel.app";

// ---------- keeping the Prax bar on LinkedIn tabs ----------
// Chrome does not put content scripts into tabs that were open before an install, update or reload,
// and the copy left in such a tab is cut off from the extension. So on install, update and browser
// start, and whenever a LinkedIn tab finishes loading or changes page (LinkedIn is a single-page
// app), Prax checks that its bar script answers in that tab and adds it if not. This only adds
// Prax's own buttons; it reads nothing from LinkedIn and does nothing on the page by itself.
const LINKEDIN = /^https:\/\/www\.linkedin\.com\//;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function tabSay(tabId, type) {
  try { const r = await chrome.tabs.sendMessage(tabId, { type }); return r?.ok ? r.data : null; } catch { return null; }
}
async function injectBar(tabId) {
  await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] }).catch(() => {});
  await chrome.scripting.executeScript({ target: { tabId }, files: ["dom.js", "marks.js", "content.js"] });
}
// Returns the bar status in that tab, adding the script first when it does not answer.
async function ensureBar(tabId, rescan) {
  let s = await tabSay(tabId, rescan ? "prax:rescan" : "prax:ping");
  if (!s || !s.alive) {
    await injectBar(tabId);
    for (let i = 0; i < 5 && !s?.alive; i++) { await wait(200); s = await tabSay(tabId, "prax:rescan"); }
  }
  if (!s) throw new Error("The Prax bar could not start in this tab. Reload the LinkedIn tab (Cmd+R).");
  return s;
}
async function ensureAllTabs() {
  const tabs = await chrome.tabs.query({ url: "https://www.linkedin.com/*" }).catch(() => []);
  await Promise.all(tabs.map((t) => (t.discarded ? null : ensureBar(t.id).catch(() => {}))));
  // The Prax site's bridge, so the Connections page answers without a reload after an update.
  const web = await chrome.tabs.query({ url: PRAX + "/*" }).catch(() => []);
  await Promise.all(web.map((t) => chrome.scripting.executeScript({ target: { tabId: t.id }, files: ["tools.js", "bridge.js"] }).catch(() => {})));
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!LINKEDIN.test(tab.url || info.url || "")) return;
  if (info.url) tabSay(tabId, "prax:nav").then((s) => { if (!s?.alive) return ensureBar(tabId); }).catch(() => {});
  // The manifest script runs at document_idle; give it a moment before checking.
  if (info.status === "complete") wait(1500).then(() => ensureBar(tabId)).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => { ensureAllTabs(); });
// First install opens Prax for Chrome in Connections, where all setup happens (the old /extension link redirects there).
chrome.runtime.onInstalled.addListener((d) => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  ensureAllTabs();
  if (d.reason === "install") chrome.tabs.create({ url: PRAX + "/extension?welcome=1" });
});

// A long AI call can outlast the service worker's 30 second idle timer. While a job runs, a cheap
// extension call every 20 seconds keeps it awake so the answer is not lost.
let running = 0, keepAlive = 0;
function hold() { if (running++ === 0) keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000); }
function release() { if (--running <= 0) { running = 0; clearInterval(keepAlive); } }

// Every tool call follows the routes set in Prax, Connections (db/032): a job (comment drafts, post drafts, scoring,
// Discovery search and fetch, the humanization check, images) runs on its primary tool, or on the fallback when the
// primary has no key here, is at its monthly cap, or fails. Requests and reply mapping for each tool live in tools.js.
importScripts("tools.js");
const T = PRAX_TOOLS;
const DEFAULT_MODEL = T.DEFAULT_MODEL;
let meCache = null;

async function cfg() { return (await chrome.storage.local.get("cfg")).cfg || {}; }

async function prax(action, body = {}) {
  const c = await cfg();
  if (!c.praxUrl || !c.praxToken) throw new Error("Connect this browser in Prax: open Prax, Connections, Prax for Chrome, Connect this browser.");
  let r;
  try {
    r = await fetch(c.praxUrl.replace(/\/$/, "") + "/api/ext/" + action, {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + c.praxToken }, body: JSON.stringify(body),
    });
  } catch { throw new Error("Prax could not be reached. Check the internet connection and try again."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Prax returned " + r.status);
  return j;
}

async function me(fresh) {
  if (!meCache || fresh) meCache = await prax("me");
  return meCache;
}

// ---------- routes, caps and usage tags ----------
// The saved routes and the tools at 100% of their monthly cap, from Prax, kept for a minute. Without Prax (not
// connected yet, or before db/032) every job uses its default: writing jobs use the drafting model chosen here.
let connCache = null, connAt = 0;
async function connections() {
  if (connCache && Date.now() - connAt < 60000) return connCache;
  try { connCache = await prax("connections"); } catch { connCache = { routes: {}, blocked: [] }; }
  connAt = Date.now();
  return connCache;
}
// The defaults match JOBS in src/lib/connections.ts (scripts/test-connections.ts checks them).
const WRITING_JOBS = ["comment", "post", "analysis"];
const JOB_DEFAULT = { discovery_search: { primary: "exa", fallback: "" }, discovery_fetch: { primary: "prax_reader", fallback: "" }, humanize_check: { primary: "pangram", fallback: "" }, humanize_rewrite: { primary: "prax_rewrite", fallback: "walter" }, image: { primary: "openai_images", fallback: "gemini_images" } };
async function routeOf(job) {
  const c = await cfg(), s = await connections();
  const saved = s.routes && s.routes[job];
  if (saved && saved.primary) return { primary: saved.primary, fallback: saved.fallback || "" };
  if (WRITING_JOBS.includes(job)) return { primary: c.provider || "claude", fallback: "" };
  return JOB_DEFAULT[job] || { primary: "", fallback: "" };
}
const NAME = { claude: "Claude", openai: "OpenAI", gemini: "Gemini", perplexity: "Perplexity", mistral: "Mistral", deepseek: "DeepSeek", groq: "Groq", grok: "Grok", exa: "Exa", tavily: "Tavily", firecrawl: "Firecrawl", pangram: "Pangram", gptzero: "GPTZero", originality: "Originality.ai", serpapi: "SerpApi", openai_images: "OpenAI", gemini_images: "Google" };
/** The tool for a job now and its key: the primary, else the fallback. Throws a plain message when neither can run. */
async function pick(job) {
  const c = await cfg(), s = await connections(), route = await routeOf(job);
  const blocked = new Set(s.blocked || []);
  const r = T.resolve(route, (t) => !!T.keyOf(c, t, job), (t) => blocked.has(t));
  if (!r.tool) {
    const name = NAME[route.primary] || route.primary || "an AI";
    throw new Error(r.reason === "cap" ? `The monthly cap for ${name} is reached. Raise it in Prax, Connections.` : `No ${name} key in this browser. Connect it in Prax, Connections.`);
  }
  const other = r.usedFallback ? "" : r.order.find((t) => t !== r.tool && !blocked.has(t) && (t.startsWith("prax_") || !!T.keyOf(c, t, job))) || "";
  return { tool: r.tool, key: T.keyOf(c, r.tool, job), fallback: other, route };
}
// One usage row per call, tagged with the job and the Prax section: counts, cost and time only, never the text.
function logUse(row) { prax("usage", row).catch(() => {}); }

async function send(req) {
  let r;
  try { r = await fetch(req.url, req.init); } catch { throw new Error(req.url.split("/")[2] + " could not be reached. Check the internet connection and try again."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(T.errorOf("", r.status, j)); e.status = r.status; throw e; }
  return j;
}

const modelFor = (c, tool) => (c.models && c.models[tool]) || ((c.provider || "claude") === tool && c.model) || DEFAULT_MODEL[tool];

/** One chat call for a writing job on the routed tool, trying the fallback once when the primary fails. */
async function callModel(system, user, job = "comment", section = "", kind = "draft", meta = {}, tagJob = job) {
  const c = await cfg();
  const first = await pick(job);
  const tryOn = async (tool, key) => {
    const model = modelFor(c, tool), t0 = Date.now();
    try {
      const out = T.mapChat(tool, await send(T.chatRequest(tool, key, model, system, user)));
      logUse({ kind, provider: tool, model, input_tokens: out.input_tokens, output_tokens: out.output_tokens, job: tagJob, section, cost: out.cost, ok: true, ms: Date.now() - t0, ...meta });
      return { ...out, provider: tool, model };
    } catch (e) {
      logUse({ kind, provider: tool, model, input_tokens: 0, output_tokens: 0, job: tagJob, section, ok: false, ms: Date.now() - t0 });
      throw e;
    }
  };
  try { return await tryOn(first.tool, first.key); }
  catch (e) {
    if (!first.fallback || /declined/.test(e.message)) throw e;
    return await tryOn(first.fallback, T.keyOf(c, first.fallback, job));
  }
}

// ---------- Connections: Test connection, Discovery search and Discovery fetch ----------
// test: the cheapest documented call for that tool, with the key saved here (or a key typed into the Connect panel,
// which is used for this one call and not kept). search and fetch run on the route for Discovery search or fetch;
// "prax_reader" means the page should use Prax's own server reader. Never for LinkedIn pages.
async function toolJob(msg) {
  const c = await cfg();
  const section = String(msg.section || "");
  if (msg.op === "test") {
    const tool = String(msg.tool || "");
    const key = String(msg.key || "").trim() || T.keyOf(c, tool, msg.job || "");
    if (!key) throw new Error("No key to test. Paste one, or connect the tool first.");
    const t0 = Date.now();
    try {
      const j = await send(T.testRequest(tool, key));
      const line = T.mapTest(tool, j);
      logUse({ kind: "test", provider: tool, model: "", input_tokens: 0, output_tokens: 0, job: "test", section: "connections", ok: true, ms: Date.now() - t0 });
      return { ok: true, line, ms: Date.now() - t0 };
    } catch (e) {
      logUse({ kind: "test", provider: tool, model: "", input_tokens: 0, output_tokens: 0, job: "test", section: "connections", ok: false, ms: Date.now() - t0 });
      throw new Error(`${NAME[tool] || tool}: ${e.message}`);
    }
  }
  if (msg.op === "search" || msg.op === "fetch") {
    const job = msg.op === "search" ? "discovery_search" : "discovery_fetch";
    const first = await pick(job);
    const run = async (tool, key) => {
      if (tool === "prax_reader") return { tool, server: true };
      const t0 = Date.now();
      try {
        const out = msg.op === "search" ? T.mapSearch(tool, await send(T.searchRequest(tool, key, String(msg.query || ""), Math.min(10, Number(msg.n) || 8))))
          : T.mapFetch(tool, await send(T.fetchRequest(tool, key, String(msg.url || ""))), String(msg.url || ""));
        logUse({ kind: msg.op, provider: tool, model: "", input_tokens: 0, output_tokens: 0, units: out.units || 1, cost: out.cost, job, section: section || "discovery", ok: true, ms: Date.now() - t0 });
        return { tool, ...out };
      } catch (e) {
        logUse({ kind: msg.op, provider: tool, model: "", input_tokens: 0, output_tokens: 0, job, section: section || "discovery", ok: false, ms: Date.now() - t0 });
        throw e;
      }
    };
    try { return await run(first.tool, first.key); }
    catch (e) { if (!first.fallback) throw e; return await run(first.fallback, T.keyOf(c, first.fallback, job)); }
  }
  throw new Error("Unknown tool request.");
}

// Drafts for LinkedIn count against the daily limit set in Comment Studio, Safety (0 = no limit).
const LIMITED = ["comment", "reply", "note"];
async function countUse(kind) {
  if (!LIMITED.includes(kind)) return;
  const cap = (await me()).studio?.safety?.dailyCap || 0;
  const day = new Date().toDateString();
  const u = (await chrome.storage.local.get("uses")).uses || {};
  const n = u.day === day ? u.n : 0;
  if (cap && n >= cap) throw new Error(`Daily limit of ${cap} drafts reached. Change it in Prax, Comment Studio, Safety.`);
  await chrome.storage.local.set({ uses: { day, n: n + 1 } });
}

// Draft with the profile's locked rules and voice, then the task-specific rules the caller sends.
// The job picks the route (comment drafts, post drafts, or scoring and analysis); older callers send only a kind.
const KIND_JOB = { comment: "comment", reply: "comment", note: "comment", repair: "comment", refine: "comment", pipeline: "comment", draft: "comment", voice: "analysis" };
const JOBS_OK = ["comment", "post", "analysis"];
async function draft({ rules, user, kind, meta, plain, job, section }) {
  const m = await me();
  await countUse(kind);
  // Plain requests (Voice Lab analysis) skip the voice and house rules, which would colour the result.
  const system = plain ? rules || "You analyse writing." : [m.voice || "Write thoughtful, specific LinkedIn comments.", m.rules?.voice, `Target topics for this profile: ${(m.topics || []).join(", ")}.`, m.rules?.locked, rules].filter(Boolean).join("\n\n");
  // Prax's own humanization rewrite runs on the post drafts route and is tagged as the humanization rewrite job.
  const j = JOBS_OK.includes(job) ? job : job === "humanize_rewrite" ? "post" : KIND_JOB[kind] || (plain ? "analysis" : "post");
  // Token counts, style, post type and scores go to Prax for the overview, tagged with the job and section; the text does not.
  const r = await callModel(system, user, j, section || "", kind || "draft", meta || {}, job === "humanize_rewrite" ? job : j);
  return r.text;
}

// Scores for the first draft arrive after it is written, so they are reported separately.
async function scored(meta) {
  const c = await cfg();
  prax("usage", { kind: "scores", provider: c.provider || "claude", model: "", input_tokens: 0, output_tokens: 0, ...meta }).catch(() => {});
}

// Unsaved draft history stays in this browser: the last 200.
async function remember(items) {
  const h = (await chrome.storage.local.get("history")).history || [];
  await chrome.storage.local.set({ history: [...items, ...h].slice(0, 200) });
}

// ---------- AI citations ----------
// Asks one buyer question on one engine with web search on, using that provider's key in this browser.
// Returns the raw provider response; the Prax page parses it. The question goes as written, with no system prompt.
const SEARCH_MODEL = { claude: "claude-opus-5-5", openai: "gpt-5", gemini: "gemini-3.8-flash", perplexity: "sonar" };
const KEY_NAME = { claude: "Claude", openai: "OpenAI", gemini: "Gemini", perplexity: "Perplexity" };
const keyFor = (c, p) => (c.keys && c.keys[p]) || ((c.provider || "claude") === p ? c.apiKey : "") || "";

async function post(url, headers, body) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `${url.split("/")[2]} returned ${r.status}`);
  return j;
}

async function search({ engine, prompt, country, job, section }) {
  const tag = { job: job === "discovery_search" ? "discovery_search" : "citations", section: section === "discovery" ? "discovery" : "citations" };
  if (SERP_ENGINES[engine]) return serpSearch({ engine, prompt, country, tag });
  const c = await cfg();
  const key = keyFor(c, engine);
  if (!key) throw new Error(`No ${KEY_NAME[engine] || engine} key in this browser. Connect it in Prax, Connections.`);
  const model = (c.searchModels && c.searchModels[engine]) || SEARCH_MODEL[engine];
  const loc = country ? { user_location: { type: "approximate", country } } : {};
  const raws = [];
  if (engine === "claude") {
    const messages = [{ role: "user", content: prompt }];
    for (let i = 0; i < 4; i++) {
      // Server-side fallback lets Anthropic retry on another model if this one declines; the served model is recorded.
      const j = await post("https://api.anthropic.com/v1/messages",
        { "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true", "anthropic-beta": "server-side-fallback-2026-07-01" },
        { model, max_tokens: 8000, messages, tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5, ...loc }], fallbacks: "default" });
      raws.push(j);
      if (j.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: j.content });
    }
  } else if (engine === "perplexity") {
    // Perplexity Chat Completions with Sonar: searches by default and returns search_results and citations.
    raws.push(await post("https://api.perplexity.ai/chat/completions", { authorization: "Bearer " + key }, { model, messages: [{ role: "user", content: prompt }] }));
  } else if (engine === "openai") {
    raws.push(await post("https://api.openai.com/v1/responses", { authorization: "Bearer " + key }, { model, input: prompt, tools: [{ type: "web_search", ...loc }] }));
  } else {
    raws.push(await post("https://generativelanguage.googleapis.com/v1beta/interactions", { "x-goog-api-key": key, "Api-Revision": "2026-05-20" }, { model, input: prompt, tools: [{ type: "google_search" }] }));
  }
  const tok = (k) => raws.reduce((s, j) => s + (j.usage?.[k] ?? 0), 0);
  logUse({ kind: "citation", provider: engine, model: raws[raws.length - 1]?.model || model, input_tokens: tok("input_tokens"), output_tokens: tok("output_tokens"), ...tag, ok: true });
  return { engine, model, raws };
}

// ---------- AI citations through SerpApi: Google AI answers and Microsoft Copilot ----------
// Google AI Overviews and Bing Copilot have no answer API, so their answers are read from search results through
// SerpApi with the user's own SerpApi key (cfg.keys.serpapi, one key for both). Docs: serpapi.com/ai-overview,
// serpapi.com/google-ai-overview-api, serpapi.com/bing-copilot-api, serpapi.com/api-status-and-error-codes.
// The key goes only to serpapi.com in the request; it is never sent to Prax, logged or returned to the page.
// Only the parts the Prax page parses are returned (the page reads text_blocks and references).
const SERP_ENGINES = { google_ai: "google_ai_overview", copilot: "bing_copilot" };
// SerpApi's Bing Copilot takes a place name for `location`; country level, from the region's country code.
const SERP_PLACE = { AE: "United Arab Emirates", SA: "Saudi Arabia", QA: "Qatar", BH: "Bahrain", KW: "Kuwait", OM: "Oman", IN: "India", US: "United States", GB: "United Kingdom", SG: "Singapore", HK: "Hong Kong", NG: "Nigeria", KE: "Kenya", ZA: "South Africa" };

async function serpGet(params, key) {
  const u = new URL("https://serpapi.com/search.json");
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  u.searchParams.set("api_key", key);
  let r;
  try { r = await fetch(u.toString(), { headers: { accept: "application/json" } }); } catch { throw new Error("SerpApi could not be reached. Check the internet connection and try again."); }
  const j = await r.json().catch(() => ({}));
  // Failed searches carry a top-level error with a non-200 status; empty results are 200 with Success and are not failures.
  if (!r.ok || j.search_metadata?.status === "Error") throw new Error(j.error ? `SerpApi: ${String(j.error).slice(0, 300)}` : `SerpApi returned ${r.status}`);
  return j;
}
const serpSlim = (j) => ({
  search_metadata: { status: j.search_metadata?.status || "" },
  search_parameters: { engine: j.search_parameters?.engine || "" },
  ...(j.ai_overview ? { ai_overview: { text_blocks: j.ai_overview.text_blocks, references: j.ai_overview.references, error: j.ai_overview.error } } : {}),
  ...(j.header || j.text_blocks ? { header: j.header, text_blocks: j.text_blocks, references: j.references } : {}),
  ...(j.error ? { error: String(j.error).slice(0, 300) } : {}),
});

async function serpSearch({ engine, prompt, country, tag }) {
  const c = await cfg();
  const key = (c.keys && c.keys.serpapi) || "";
  if (!key) throw new Error("No SerpApi key in this browser. Connect SerpApi in Prax, Connections.");
  const cc = String(country || "").toUpperCase();
  const raws = [];
  let searches = 0;
  if (engine === "google_ai") {
    // AI Overviews show for English searches (hl=en) in some countries. Sometimes Google sends the overview through a
    // second request: then ai_overview.page_token comes back, valid for about a minute, and is used at once.
    const first = await serpGet({ engine: "google", q: prompt, hl: "en", gl: cc.toLowerCase() }, key);
    searches++;
    raws.push(serpSlim(first));
    const token = first.ai_overview?.page_token;
    if (token && !(first.ai_overview.text_blocks || []).length) {
      raws.push(serpSlim(await serpGet({ engine: "google_ai_overview", page_token: token }, key)));
      searches++;
    }
  } else {
    raws.push(serpSlim(await serpGet({ engine: "bing_copilot", q: prompt, location: SERP_PLACE[cc] || "" }, key)));
    searches++;
  }
  // One usage row per SerpApi search, with no tokens: Prax shows a search count for these engines, never a cost.
  for (let i = 0; i < searches; i++) logUse({ kind: "citation", provider: engine, model: SERP_ENGINES[engine], input_tokens: 0, output_tokens: 0, units: 1, ...tag, ok: true });
  return { engine, model: SERP_ENGINES[engine], raws, searches };
}

// ---------- Content Studio images ----------
// One image from a short brief, with the OpenAI or Google key saved in this browser. Returns a data URL; nothing is stored.
// gpt-image-1 was shut down on 23 Oct 2026 (developers.openai.com/api/docs/models), so OpenAI uses gpt-image-2.5-flare.
const IMAGE_MODEL = { openai: "gpt-image-2.5-flare", gemini: "gemini-2.5-flash-image" };
async function image({ provider, prompt, size, section }) {
  const c = await cfg();
  const p = provider === "gemini" ? "gemini" : "openai";
  const key = keyFor(c, p);
  if (!key) throw new Error(`No ${p === "openai" ? "OpenAI" : "Google"} key in this browser. Connect it in Prax, Connections.`);
  const model = (c.imageModels && c.imageModels[p]) || IMAGE_MODEL[p];
  let url = "";
  if (p === "openai") {
    const j = await post("https://api.openai.com/v1/images/generations", { authorization: "Bearer " + key }, { model, prompt, size: size || "1024x1024", n: 1 });
    const d = j.data && j.data[0];
    url = d && d.b64_json ? "data:image/png;base64," + d.b64_json : (d && d.url) || "";
  } else {
    const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { "x-goog-api-key": key }, { contents: [{ role: "user", parts: [{ text: prompt }] }] });
    const part = (j.candidates?.[0]?.content?.parts || []).find((x) => x.inlineData);
    url = part ? `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}` : "";
  }
  if (!url) throw new Error("No image came back. Try a simpler description.");
  logUse({ kind: "image", provider: p, model, input_tokens: 0, output_tokens: 0, units: 1, job: "image", section: section || "content_write", ok: true });
  return { provider: p, model, url };
}

// ---------- Humanization: Pangram checks, Walter (beta) rewrites (db/031) ----------
// Self-contained: the Prax pages and the LinkedIn bar send { type: "humanize", op, kind, texts, ... } and get back the
// plan (level, decision, cached results, month use) or the checked results. Before any paid call Prax is asked for the
// plan (settings, the cache by text hash, the monthly cap); after it, the reply is recorded there. The Pangram and Walter
// keys (cfg.checkers) go only to Pangram and Walter, never to Prax, and are never returned.
// Pangram, as documented at docs.pangram.com/api-reference/ai-detection.md: POST /task with the x-api-key header, then
// GET /task/{task_id} until stage is STAGE_SUCCESS or STAGE_FAILED. Models from GET /models (docs .../models.md).
importScripts("walter.js");
const PANGRAM = "https://text.external-api.pangram.com";
const PANGRAM_ERR = { 400: "Pangram could not read the request.", 401: "Pangram did not accept the key. Check it in Prax, Connections.", 402: "The Pangram account has no credits left.", 403: "This Pangram key cannot use that model.", 404: "Pangram lost that check. Try again.", 413: "That text is too long for Pangram.", 422: "Pangram could not check that text.", 429: "Pangram is rate limiting this key. Wait a minute and try again.", 500: "Pangram had an error. Try again.", 503: "Pangram is busy. Try again shortly." };
let pangramModelCache = null;

async function pangramFetch(path, key, init = {}) {
  let r;
  try { r = await fetch(PANGRAM + path, { ...init, headers: { "x-api-key": key, ...(init.body ? { "content-type": "application/json" } : {}) } }); }
  catch { throw new Error("Pangram could not be reached. Check the internet connection and try again."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(PANGRAM_ERR[r.status] || `Pangram returned ${r.status}.`);
  return j;
}
// The docs ask integrations to send a selector returned by GET /models; "default" follows Pangram's current model.
async function pangramModel(key) {
  if (pangramModelCache) return pangramModelCache;
  const j = await pangramFetch("/models", key).catch(() => ({}));
  const list = Array.isArray(j.models) ? j.models : [];
  pangramModelCache = list.includes("default") ? "default" : list[0] || "default";
  return pangramModelCache;
}
async function pangramDetect(key, text) {
  const { task_id } = await pangramFetch("/task", key, { method: "POST", body: JSON.stringify({ text, model: await pangramModel(key), public_dashboard_link: false }) });
  if (!task_id) throw new Error("Pangram did not start the check.");
  // At most about 18 s per text: the Prax pages stop waiting at 20 s (HUMANIZE_WAIT_MS in src/lib/humanize.ts).
  for (let i = 0, wait = 700, spent = 0; spent < 18000; i++, spent += wait, wait = Math.min(2000, wait + 200)) {
    await new Promise((r) => setTimeout(r, wait));
    const j = await pangramFetch("/task/" + encodeURIComponent(task_id), key);
    if (j.stage === "STAGE_FAILED") throw new Error(`Pangram could not check this text: ${j.headline || "it failed"}`);
    if (j.stage === "STAGE_SUCCESS") {
      // Only the fields Prax maps (src/lib/humanize.ts mapPangram) go on to Prax.
      const w = (j.windows || []).map((x) => ({ text: x.text, label: x.label, ai_assistance_score: x.ai_assistance_score, confidence: x.confidence, start_index: x.start_index, end_index: x.end_index, word_count: x.word_count }));
      return { stage: j.stage, version: j.version, headline: j.headline, prediction_short: j.prediction_short, fraction_human: j.fraction_human, fraction_ai: j.fraction_ai, fraction_ai_assisted: j.fraction_ai_assisted, windows: w };
    }
  }
  throw new Error("Pangram took too long. Try again.");
}

// Detectors Prax can ask, each one function: check(key, text) returns the raw reply, which Prax maps (src/lib/humanize.ts
// DETECTORS). GPTZero or Originality.ai would add an entry here and one there; nothing else changes.
// GPTZero and Originality.ai (Connections): request and reply slimming in tools.js; Prax maps the reply (src/lib/humanize.ts).
async function otherDetect(tool, key, text) { return T.slimDetect(tool, await send(T.detectRequest(tool, key, text))); }
const DETECTORS = { pangram: { check: pangramDetect }, gptzero: { check: (k, t) => otherDetect("gptzero", k, t) }, originality: { check: (k, t) => otherDetect("originality", k, t) } };
// Every paid call is tagged for usage: the job (humanize_check, humanize_rewrite) is set by Prax from the service,
// and the section is where the call came from (comment_studio, linkedin_bar, content_write, content_editor).
const SECTIONS = ["comment_studio", "linkedin_bar", "content_write", "content_editor"];

// The same cache key as textHash in src/lib/humanize.ts: SHA-256 of the text with whitespace collapsed and trimmed.
// Prax checks it matches the text before it records a result.
async function textHash(t) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(t || "").replace(/\s+/g, " ").trim()));
  return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
}

async function humanize(msg) {
  const c = await cfg();
  const keys = c.checkers || {};
  const kind = ["comment", "post", "article"].includes(msg.kind) ? msg.kind : "post";
  const texts = (Array.isArray(msg.texts) ? msg.texts : [msg.text]).map((t) => String(t || "")).filter((t) => t.trim()).slice(0, 60);
  const section = SECTIONS.includes(msg.section) ? msg.section : "";
  // The profile on screen (a Prax page sends its workspace id); Prax checks this browser's user edits it. The LinkedIn
  // bar sends none, so the connected profile is used.
  const profile_id = /^[0-9a-f-]{36}$/i.test(String(msg.profile || "")) ? String(msg.profile) : "";
  if (msg.op === "walter") {
    const plan = await prax("humanize", { op: "plan", service: "walter", profile_id, kind, texts, has_key: !!keys.walter, ready: WALTER.confirmed, rounds: Number(msg.rounds) || 0, failing: !!msg.failing });
    if (!plan.walter?.ok) return { ...plan, texts: null };
    const out = [];
    for (const t of texts) {
      out.push(await WALTER.humanize(keys.walter, t));
      prax("humanize", { op: "record", service: "walter", job: "humanize_rewrite", section, profile_id, kind, text: t }).catch(() => {});
    }
    return { ...plan, texts: out };
  }
  // The detector comes from the humanization check route (Pangram unless Connections says otherwise); a detector at its
  // Connections cap, or with no key here, gives way to the fallback, and with neither the plan says no key.
  const conn = await connections();
  const route = await routeOf("humanize_check");
  const picked = T.resolve(route, (t) => !!T.keyOf(c, t, "humanize_check"), (t) => (conn.blocked || []).includes(t));
  // A page can ask one detector by id (src/components/humanize/use-humanize.ts detector()); otherwise the route decides.
  const service = DETECTORS[msg.detector] ? msg.detector : DETECTORS[picked.tool] ? picked.tool : "pangram";
  const detKey = T.keyOf(c, service, "humanize_check");
  const plan = await prax("humanize", { op: "plan", service, profile_id, kind, texts, local: Number(msg.local) || 0, has_key: !!detKey, confirm: !!msg.confirm });
  const base = { ...plan, walter: { hasKey: !!keys.walter, ready: WALTER.confirmed } };
  if (msg.op !== "check" || plan.decision?.action !== "check") return base;
  const results = plan.results.slice();
  let used = plan.used?.pangram || 0;
  for (let i = 0; i < texts.length; i++) {
    if (results[i]) continue;
    const raw = await DETECTORS[service].check(detKey, texts[i]);
    const rec = await prax("humanize", { op: "record", service, job: "humanize_check", section, profile_id, kind, text: texts[i], hash: await textHash(texts[i]), raw });
    results[i] = rec.result; used = rec.used ?? used;
  }
  return { ...base, detector: service, decision: { ...plan.decision, action: "checked" }, results, used: { ...plan.used, pangram: used } };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const jobs = {
    me: () => me(msg.fresh),
    prax: () => prax(msg.action, msg.body),
    draft: () => draft({ ...msg, section: msg.section || (sender.tab && LINKEDIN.test(sender.tab.url || "") ? "linkedin_bar" : sender.tab ? "" : "side_panel") }),
    scored: () => scored(msg.meta),
    remember: () => remember(msg.items || []),
    history: async () => (await chrome.storage.local.get("history")).history || [],
    clearHistory: async () => { await chrome.storage.local.remove("history"); return []; },
    search: () => search(msg),
    image: () => image(msg),
    humanize: () => humanize(msg),
    tool: () => toolJob(msg),
    // The side panel's Prax bar status and Fix bars: checks (and if needed adds) the bar in that tab.
    barStatus: () => ensureBar(msg.tabId, !!msg.rescan),
  };
  const job = jobs[msg?.type];
  if (!job) return false;
  hold();
  Promise.resolve().then(job).then((data) => reply({ ok: true, data }), (e) => reply({ ok: false, error: String(e?.message || e || "Something went wrong") })).finally(release);
  return true;
});

chrome.storage.onChanged.addListener((ch) => { if (ch.cfg) { meCache = null; connCache = null; } });
