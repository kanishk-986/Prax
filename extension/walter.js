// Walter AI (beta): an optional second fixer for drafts Pangram still flags after Prax's own two rewrite rounds.
// Loaded by background.js with importScripts. Everything about Walter's API lives in this one file.
//
// TODO(walter): confirm against Walter's official API docs before switching it on. Walter's API is early access; its
// pages (walterwrites.ai/api/, walterwrites.ai/ai-humanizer-api/) were behind a Cloudflare block on 6 Nov 2026, so the
// endpoint, auth header, request and response below are NOT verified. Until someone with early access confirms them:
//   1. set WALTER.confirmed = true,
//   2. fix WALTER.endpoint, the headers, the body and readText() to the documented shape,
//   3. move the host from optional_host_permissions to host_permissions in manifest.json.
// While confirmed is false Prax never calls Walter, and says "Walter (beta) is waiting for its API to be confirmed".
// The key is read from extension storage (cfg.checkers.walter) by background.js and sent only to Walter.

const WALTER = {
  confirmed: false,
  // UNVERIFIED guesses, kept in one place so they are easy to correct.
  endpoint: "https://api.walterwrites.ai/v1/humanize",
  headers: (key) => ({ "content-type": "application/json", authorization: "Bearer " + key }),
  body: (text) => ({ text }),
  readText: (j) => String(j?.humanized_text ?? j?.output ?? j?.text ?? ""),

  /** Rewrites one piece of text. Throws a plain message on any failure. */
  async humanize(key, text) {
    if (!this.confirmed) throw new Error("Walter (beta) is waiting for its API to be confirmed. Prax did not call it.");
    if (!key) throw new Error("No Walter key in this browser. Add one in Prax, Settings, Humanization.");
    let r;
    try { r = await fetch(this.endpoint, { method: "POST", headers: this.headers(key), body: JSON.stringify(this.body(text)) }); }
    catch { throw new Error("Walter could not be reached. Check the internet connection and try again."); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Walter did not accept the key." : `Walter returned ${r.status}.`);
    const out = this.readText(j).trim();
    if (!out) throw new Error("Walter sent no text back.");
    return out;
  },
};
