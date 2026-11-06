// Runs only on the Prax web app. Lets the Extension page set up this browser: connect it,
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

  async function status() {
    const c = (await chrome.storage.local.get("cfg")).cfg || {};
    // Which engines AI citations can use: an extra search key, or the main key when it is for that provider.
    const main = c.provider || "claude";
    const searchKeys = Object.fromEntries(["claude", "openai", "gemini", "perplexity"].map((p) => [p, !!((c.keys && c.keys[p]) || (main === p && c.apiKey))]));
    // Google AI answers and Microsoft Copilot are read through SerpApi: one SerpApi key (keys.serpapi) serves both.
    searchKeys.google_ai = searchKeys.copilot = !!(c.keys && c.keys.serpapi);
    return { installed: true, version: VERSION, connected: !!c.praxToken, provider: main, model: c.model || "", hasKey: !!c.apiKey, quiet: !!c.quiet, searchKeys, extraKeys: Object.keys(c.keys || {}).filter((p) => c.keys[p]),
      // Humanization keys (Pangram, Walter): only whether one is saved, never the key.
      checkerKeys: { pangram: !!(c.checkers && c.checkers.pangram), walter: !!(c.checkers && c.checkers.walter) } };
  }

  // Comment Studio on the Prax site asks for AI work and the local draft history through here.
  // The request goes to the extension's background, which calls the AI with the key kept in this browser.
  const ASK = { ai: (d) => ({ type: "draft", rules: d.rules || "", user: String(d.user || ""), kind: d.kind || "studio", plain: !!d.plain }), history: () => ({ type: "history" }), clearHistory: () => ({ type: "clearHistory" }),
    search: (d) => ({ type: "search", engine: String(d.engine || ""), prompt: String(d.prompt || ""), country: String(d.country || "") }),
    image: (d) => ({ type: "image", provider: String(d.provider || "openai"), prompt: String(d.prompt || "").slice(0, 4000), size: String(d.size || "") }),
    // Humanization (db/031): plan, check with Pangram, or rewrite with Walter (beta). The keys stay in the background.
    humanize: (d) => ({ type: "humanize", op: ["plan", "check", "walter"].includes(d.op) ? d.op : "plan", kind: String(d.kind || "post"), texts: (Array.isArray(d.texts) ? d.texts : []).slice(0, 60).map((t) => String(t || "").slice(0, 60000)), local: Number(d.local) || 0, confirm: !!d.confirm, rounds: Number(d.rounds) || 0, failing: !!d.failing, section: String(d.section || ""), profile: String(d.profile || "") }) };

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
    }
    if (type === "disconnect") { delete c.praxToken; }
    if (type !== "status") await chrome.storage.local.set({ cfg: c });
    out({ id, ok: true, data: await status() });
  }

  status().then((s) => out({ type: "hello", data: s })).catch(() => {});
})();
