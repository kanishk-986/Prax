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

// Draft with the profile's voice plus the task-specific rules the caller sends.
async function draft({ rules, user, kind }) {
  const m = await me();
  const system = `${m.voice || "Write thoughtful, specific LinkedIn comments."}\n\nTarget topics for this profile: ${(m.topics || []).join(", ")}.\n\n${rules || ""}`;
  const r = await callModel(system, user);
  // Token counts go to Prax for the usage overview; the text does not.
  prax("usage", { kind: kind || "draft", provider: r.provider, model: r.model, input_tokens: r.input_tokens || 0, output_tokens: r.output_tokens || 0 }).catch(() => {});
  return r.text;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const jobs = {
    me: () => me(msg.fresh),
    prax: () => prax(msg.action, msg.body),
    draft: () => draft(msg),
  };
  const job = jobs[msg.type];
  if (!job) return false;
  job().then((data) => reply({ ok: true, data }), (e) => reply({ ok: false, error: e.message }));
  return true;
});

chrome.storage.onChanged.addListener((ch) => { if (ch.cfg) meCache = null; });
