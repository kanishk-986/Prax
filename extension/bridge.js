// Runs only on the Prax web app. Lets Connections set up this browser: connect it,
// save the AI provider and key, switch Quiet mode. The key goes into extension storage
// here in the browser; it is never sent to the Prax server, and it is never read back.

(() => {
  // Added again by the background after an update: the newest copy answers, older ones step aside.
  if (window.__praxBridge) window.__praxBridge.abort();
  const life = new AbortController();
  window.__praxBridge = life;
  const VERSION = chrome.runtime.getManifest().version;
  const STALE = "The Prax extension was updated or reloaded. Reload this page.";
  const alive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };
  const out = (msg) => window.postMessage({ praxExt: true, version: VERSION, ...msg }, location.origin);

  const TOOL_IDS = ["claude", "openai", "gemini", "perplexity", "mistral", "deepseek", "groq", "grok", "serpapi", "pangram", "walter", "gptzero", "originality", "exa", "tavily", "firecrawl", "newsapi", "crunchbase", "apify", "openai_images", "gemini_images", "calendly"];
  const JOB_IDS = ["comment", "post", "analysis", "discovery_search", "discovery_fetch", "citations", "humanize_check", "humanize_rewrite", "image"];
  const clean = (x, n) => String(x || "").trim().slice(0, n);
  async function status() {
    const c = (await chrome.storage.local.get("cfg")).cfg || {};
    // Which engines AI citations can use: an extra search key, or the main key when it is for that provider.
    const main = c.provider || "claude";
    const searchKeys = Object.fromEntries(["claude", "openai", "gemini", "perplexity"].map((p) => [p, !!((c.keys && c.keys[p]) || (main === p && c.apiKey))]));
    // Google AI answers and Microsoft Copilot are read through SerpApi: one SerpApi key (keys.serpapi) serves both.
    searchKeys.google_ai = searchKeys.copilot = !!(c.keys && c.keys.serpapi);
    return { installed: true, version: VERSION, connected: !!c.praxToken, provider: main, model: c.model || "", hasKey: !!c.apiKey, quiet: !!c.quiet, searchKeys, extraKeys: Object.keys(c.keys || {}).filter((p) => c.keys[p]),
      // Humanization keys (Pangram, Walter): only whether one is saved, never the key.
      checkerKeys: { pangram: !!(c.checkers && c.checkers.pangram), walter: !!(c.checkers && c.checkers.walter) },
      // Connections (0.9.7): whether each tool has a key here (tools.js keyOf, the same lookup the background uses),
      // which jobs have a separate key under Advanced and for which tool, and the model set per tool. Never a key.
      tools: Object.fromEntries(TOOL_IDS.map((t) => [t, !!PRAX_TOOLS.keyOf(c, t, "")])),
      jobKeys: Object.fromEntries(Object.entries(c.jobKeys || {}).filter(([, v]) => v && v.key).map(([j, v]) => [j, v.tool])),
      models: { ...(c.models || {}) } };
  }

  // Comment Studio on the Prax site asks for AI work and the local draft history through here.
  // The request goes to the extension's background, which calls the AI with the key kept in this browser.
  const ASK = { ai: (d) => ({ type: "draft", rules: d.rules || "", user: String(d.user || ""), kind: d.kind || "studio", plain: !!d.plain, job: clean(d.job, 40), section: clean(d.section, 40) }), history: () => ({ type: "history" }), clearHistory: () => ({ type: "clearHistory" }),
    search: (d) => ({ type: "search", engine: String(d.engine || ""), prompt: String(d.prompt || ""), country: String(d.country || ""), job: clean(d.job, 40), section: clean(d.section, 40) }),
    // Connections: Test connection (with the saved key, or a key typed into the panel for this one call), and
    // Discovery search and fetch on their routes. The key never comes back to the page.
    tool: (d) => ({ type: "tool", op: ["test", "search", "fetch"].includes(d.op) ? d.op : "test", tool: clean(d.tool, 40), key: clean(d.key, 400), job: clean(d.job, 40), query: clean(d.query, 400), url: clean(d.url, 2000), n: Number(d.n) || 0, section: clean(d.section, 40) }),
    image: (d) => ({ type: "image", provider: String(d.provider || "openai"), prompt: String(d.prompt || "").slice(0, 4000), size: String(d.size || ""), section: clean(d.section, 40) }),
    // Humanization (db/031): plan, check with Pangram, or rewrite with Walter (beta). The keys stay in the background.
    humanize: (d) => ({ type: "humanize", op: ["plan", "check", "walter"].includes(d.op) ? d.op : "plan", kind: String(d.kind || "post"), texts: (Array.isArray(d.texts) ? d.texts : []).slice(0, 60).map((t) => String(t || "").slice(0, 60000)), local: Number(d.local) || 0, confirm: !!d.confirm, rounds: Number(d.rounds) || 0, failing: !!d.failing, section: String(d.section || ""), profile: String(d.profile || ""), detector: clean(d.detector, 20) }) };

  window.addEventListener("message", async (e) => {
    if (e.source !== window || e.origin !== location.origin || !e.data?.praxWeb) return;
    const { id, type, data = {} } = e.data;
    // A copy cut off by an update cannot reach the extension; the newer copy answers instead.
    if (!alive()) return;
    if (ASK[type]) {
      try {
        chrome.runtime.sendMessage(ASK[type](data), (r) => out({ id, result: true, ok: !!r?.ok, data: r?.data, error: r?.error || chrome.runtime.lastError?.message || (r ? "" : "The extension did not answer. Try again.") }));
      } catch (err) { out({ id, result: true, ok: false, error: /invalidated/i.test(err.message) ? STALE : err.message }); }
      return;
    }
    try { await handle(id, type, data); }
    catch (err) { out({ id, ok: false, error: /invalidated/i.test(err.message) ? STALE : err.message }); }
  }, { signal: life.signal });

  async function handle(id, type, data) {
    const c = (await chrome.storage.local.get("cfg")).cfg || {};
    if (type === "connect") Object.assign(c, { praxUrl: location.origin, praxToken: String(data.token || "") });
    if (type === "settings") {
      if (data.provider) c.provider = data.provider;
      if (typeof data.model === "string") c.model = data.model.trim();
      if (typeof data.quiet === "boolean") c.quiet = data.quiet;
      if (data.apiKey) c.apiKey = String(data.apiKey).trim();
      if (data.clearKey) delete c.apiKey;
      // Extra keys for AI citations, one per provider. Saved here only, never read back to the page.
      if (data.searchKey && data.searchKey.provider && data.searchKey.key) c.keys = { ...(c.keys || {}), [data.searchKey.provider]: String(data.searchKey.key).trim() };
      if (data.clearSearchKey && c.keys) delete c.keys[data.clearSearchKey];
      // Pangram and Walter keys for humanization, saved here only and never read back to the page.
      if (data.checkerKey && ["pangram", "walter"].includes(data.checkerKey.service) && data.checkerKey.key) c.checkers = { ...(c.checkers || {}), [data.checkerKey.service]: String(data.checkerKey.key).trim() };
      if (data.clearCheckerKey && c.checkers) delete c.checkers[data.clearCheckerKey];
      // Connections: one key per tool (Q136). Pangram and Walter keep their 031 slot; every other tool is keys.<tool>.
      // OpenAI Images and Gemini Images use the OpenAI and Gemini keys. Removing the drafting provider's key also clears
      // the older main key, so a removed key is gone everywhere.
      const slot = (t) => ({ openai_images: "openai", gemini_images: "gemini" })[t] || t;
      if (data.toolKey && TOOL_IDS.includes(data.toolKey.tool) && data.toolKey.key) {
        const t = slot(data.toolKey.tool), k = String(data.toolKey.key).trim();
        if (t === "pangram" || t === "walter") c.checkers = { ...(c.checkers || {}), [t]: k };
        else c.keys = { ...(c.keys || {}), [t]: k };
      }
      if (data.clearTool && TOOL_IDS.includes(data.clearTool)) {
        const t = slot(data.clearTool);
        if (c.checkers) delete c.checkers[t];
        if (c.keys) delete c.keys[t];
        if ((c.provider || "claude") === t) delete c.apiKey;
        if (c.jobKeys) for (const j of Object.keys(c.jobKeys)) if (c.jobKeys[j]?.tool === t) delete c.jobKeys[j];
      }
      // A separate key for one job (Advanced), for the tool that job uses.
      if (data.jobKey && JOB_IDS.includes(data.jobKey.job) && TOOL_IDS.includes(data.jobKey.tool) && data.jobKey.key) c.jobKeys = { ...(c.jobKeys || {}), [data.jobKey.job]: { tool: slot(data.jobKey.tool), key: String(data.jobKey.key).trim() } };
      if (data.clearJobKey && c.jobKeys) delete c.jobKeys[data.clearJobKey];
      // The model a writing tool uses (Edit on its Connections page); empty goes back to the default.
      if (data.toolModel && TOOL_IDS.includes(data.toolModel.tool)) { c.models = { ...(c.models || {}) }; const m = clean(data.toolModel.model, 120); if (m) c.models[data.toolModel.tool] = m; else delete c.models[data.toolModel.tool]; }
    }
    if (type === "disconnect") { delete c.praxToken; }
    if (type !== "status") await chrome.storage.local.set({ cfg: c });
    out({ id, ok: true, data: await status() });
  }

  status().then((s) => out({ type: "hello", data: s })).catch(() => {});
})();
