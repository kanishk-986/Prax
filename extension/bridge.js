// Runs only on the Prax web app. Lets the Extension page set up this browser: connect it,
// save the AI provider and key, switch Quiet mode. The key goes into extension storage
// here in the browser; it is never sent to the Prax server, and it is never read back.

(() => {
  const VERSION = chrome.runtime.getManifest().version;
  const out = (msg) => window.postMessage({ praxExt: true, version: VERSION, ...msg }, location.origin);

  async function status() {
    const c = (await chrome.storage.local.get("cfg")).cfg || {};
    return { installed: true, version: VERSION, connected: !!c.praxToken, provider: c.provider || "claude", model: c.model || "", hasKey: !!c.apiKey, quiet: !!c.quiet };
  }

  // Comment Studio on the Prax site asks for AI work and the local draft history through here.
  // The request goes to the extension's background, which calls the AI with the key kept in this browser.
  const ASK = { ai: (d) => ({ type: "draft", rules: d.rules || "", user: String(d.user || ""), kind: d.kind || "studio", plain: !!d.plain }), history: () => ({ type: "history" }), clearHistory: () => ({ type: "clearHistory" }) };

  window.addEventListener("message", async (e) => {
    if (e.source !== window || e.origin !== location.origin || !e.data?.praxWeb) return;
    const { id, type, data = {} } = e.data;
    if (ASK[type]) {
      chrome.runtime.sendMessage(ASK[type](data), (r) => out({ id, result: true, ok: !!r?.ok, data: r?.data, error: r?.error || chrome.runtime.lastError?.message }));
      return;
    }
    const c = (await chrome.storage.local.get("cfg")).cfg || {};
    if (type === "connect") Object.assign(c, { praxUrl: location.origin, praxToken: String(data.token || "") });
    if (type === "settings") {
      if (data.provider) c.provider = data.provider;
      if (typeof data.model === "string") c.model = data.model.trim();
      if (typeof data.quiet === "boolean") c.quiet = data.quiet;
      if (data.apiKey) c.apiKey = String(data.apiKey).trim();
      if (data.clearKey) delete c.apiKey;
    }
    if (type === "disconnect") { delete c.praxToken; }
    if (type !== "status") await chrome.storage.local.set({ cfg: c });
    out({ id, ok: true, data: await status() });
  });

  status().then((s) => out({ type: "hello", data: s }));
})();
