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
  await chrome.scripting.executeScript({ target: { tabId }, files: ["dom.js", "content.js"] });
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
  // The Prax site's bridge, so the Extension page answers without a reload after an update.
  const web = await chrome.tabs.query({ url: PRAX + "/*" }).catch(() => []);
  await Promise.all(web.map((t) => chrome.scripting.executeScript({ target: { tabId: t.id }, files: ["bridge.js"] }).catch(() => {})));
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!LINKEDIN.test(tab.url || info.url || "")) return;
  if (info.url) tabSay(tabId, "prax:nav").then((s) => { if (!s?.alive) return ensureBar(tabId); }).catch(() => {});
  // The manifest script runs at document_idle; give it a moment before checking.
  if (info.status === "complete") wait(1500).then(() => ensureBar(tabId)).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => { ensureAllTabs(); });
// First install opens the Extension page in Prax, where all setup happens.
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

const DEFAULT_MODEL = { claude: "claude-opus-5-5", openai: "gpt-5", grok: "grok-4", gemini: "gemini-2.5-pro" };
let meCache = null;

async function cfg() { return (await chrome.storage.local.get("cfg")).cfg || {}; }

async function prax(action, body = {}) {
  const c = await cfg();
  if (!c.praxUrl || !c.praxToken) throw new Error("Connect this browser in Prax: open Prax, Extension, Connect this browser.");
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

async function callModel(system, user) {
  const c = await cfg();
  const provider = c.provider || "claude";
  const model = c.model || DEFAULT_MODEL[provider];
  if (!c.apiKey) throw new Error("Add your AI key in Prax: open Prax, Extension, AI model.");
  let r, j;
  if (provider === "claude") {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      // Server-side fallback lets Anthropic retry on another model if this one declines.
      headers: { "content-type": "application/json", "x-api-key": c.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true", "anthropic-beta": "server-side-fallback-2026-07-01" },
      body: JSON.stringify({ model, max_tokens: 4000, system, messages: [{ role: "user", content: user }], output_config: { effort: "medium" }, fallbacks: "default" }),
    });
    j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || "Claude error " + r.status);
    if (j.stop_reason === "refusal") throw new Error("The model declined this one. Try another mode.");
    return { text: (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join(""), provider, model, input_tokens: j.usage?.input_tokens, output_tokens: j.usage?.output_tokens };
  }
  if (provider === "gemini") {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": c.apiKey },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }] }),
    });
    j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || "Gemini error " + r.status);
    return { text: (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join(""), provider, model, input_tokens: j.usageMetadata?.promptTokenCount, output_tokens: j.usageMetadata?.candidatesTokenCount };
  }
  const base = provider === "grok" ? "https://api.x.ai/v1" : "https://api.openai.com/v1";
  r = await fetch(base + "/chat/completions", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + c.apiKey },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || "Model error " + r.status);
  return { text: j.choices?.[0]?.message?.content || "", provider, model, input_tokens: j.usage?.prompt_tokens, output_tokens: j.usage?.completion_tokens };
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
async function draft({ rules, user, kind, meta, plain }) {
  const m = await me();
  await countUse(kind);
  // Plain requests (Voice Lab analysis) skip the voice and house rules, which would colour the result.
  const system = plain ? rules || "You analyse writing." : [m.voice || "Write thoughtful, specific LinkedIn comments.", m.rules?.voice, `Target topics for this profile: ${(m.topics || []).join(", ")}.`, m.rules?.locked, rules].filter(Boolean).join("\n\n");
  const r = await callModel(system, user);
  // Token counts, style, post type and scores go to Prax for the overview; the text does not.
  prax("usage", { kind: kind || "draft", provider: r.provider, model: r.model, input_tokens: r.input_tokens || 0, output_tokens: r.output_tokens || 0, ...(meta || {}) }).catch(() => {});
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

async function search({ engine, prompt, country }) {
  if (SERP_ENGINES[engine]) return serpSearch({ engine, prompt, country });
  const c = await cfg();
  const key = keyFor(c, engine);
  if (!key) throw new Error(`No ${KEY_NAME[engine] || engine} key in this browser. Add one on the AI citations page or the Extension page.`);
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
  prax("usage", { kind: "citation", provider: engine, model: raws[raws.length - 1]?.model || model, input_tokens: tok("input_tokens"), output_tokens: tok("output_tokens") }).catch(() => {});
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

async function serpSearch({ engine, prompt, country }) {
  const c = await cfg();
  const key = (c.keys && c.keys.serpapi) || "";
  if (!key) throw new Error("No SerpApi key in this browser. Add one on the Prax Extension page, Keys for AI search.");
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
  for (let i = 0; i < searches; i++) prax("usage", { kind: "citation", provider: engine, model: SERP_ENGINES[engine], input_tokens: 0, output_tokens: 0 }).catch(() => {});
  return { engine, model: SERP_ENGINES[engine], raws, searches };
}

// ---------- Content Studio images ----------
// One image from a short brief, with the OpenAI or Google key saved in this browser. Returns a data URL; nothing is stored.
const IMAGE_MODEL = { openai: "gpt-image-1", gemini: "gemini-2.5-flash-image" };
async function image({ provider, prompt, size }) {
  const c = await cfg();
  const p = provider === "gemini" ? "gemini" : "openai";
  const key = keyFor(c, p);
  if (!key) throw new Error(`No ${p === "openai" ? "OpenAI" : "Google"} key in this browser. Add one on the Prax Extension page.`);
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
  prax("usage", { kind: "image", provider: p, model, input_tokens: 0, output_tokens: 0 }).catch(() => {});
  return { provider: p, model, url };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const jobs = {
    me: () => me(msg.fresh),
    prax: () => prax(msg.action, msg.body),
    draft: () => draft(msg),
    scored: () => scored(msg.meta),
    remember: () => remember(msg.items || []),
    history: async () => (await chrome.storage.local.get("history")).history || [],
    clearHistory: async () => { await chrome.storage.local.remove("history"); return []; },
    search: () => search(msg),
    image: () => image(msg),
    // The side panel's Prax bar status and Fix bars: checks (and if needed adds) the bar in that tab.
    barStatus: () => ensureBar(msg.tabId, !!msg.rescan),
  };
  const job = jobs[msg?.type];
  if (!job) return false;
  hold();
  Promise.resolve().then(job).then((data) => reply({ ok: true, data }), (e) => reply({ ok: false, error: String(e?.message || e || "Something went wrong") })).finally(release);
  return true;
});

chrome.storage.onChanged.addListener((ch) => { if (ch.cfg) meCache = null; });
