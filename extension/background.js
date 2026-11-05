// Prax background: the one place that talks to Prax and to your AI provider.
// The on-page buttons and the side panel send it messages; nothing here runs on its own.

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

const PRAX = "https://prax-gamma.vercel.app";

// First install opens the Extension page in Prax, where all setup happens.
chrome.runtime.onInstalled.addListener((d) => { if (d.reason === "install") chrome.tabs.create({ url: PRAX + "/extension?welcome=1" }); });

const DEFAULT_MODEL = { claude: "claude-opus-5-5", openai: "gpt-5", grok: "grok-4", gemini: "gemini-2.5-pro" };
let meCache = null;

async function cfg() { return (await chrome.storage.local.get("cfg")).cfg || {}; }

async function prax(action, body = {}) {
  const c = await cfg();
  if (!c.praxUrl || !c.praxToken) throw new Error("Connect this browser in Prax: open Prax, Extension, Connect this browser.");
  const r = await fetch(c.praxUrl.replace(/\/$/, "") + "/api/ext/" + action, {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + c.praxToken }, body: JSON.stringify(body),
  });
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
  };
  const job = jobs[msg.type];
  if (!job) return false;
  job().then((data) => reply({ ok: true, data }), (e) => reply({ ok: false, error: e.message }));
  return true;
});

chrome.storage.onChanged.addListener((ch) => { if (ch.cfg) meCache = null; });
