"use client";
// TEMPORARY browser check only (deleted before commit): a fake Prax for Chrome bridge and an in-memory Supabase, so
// the real Connections pages render with sample data. Fake keys only; nothing calls a provider.
import { WorkspaceProvider, type Workspace } from "@/lib/workspace";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "@/components/toaster";

type Row = Record<string, unknown>;
const W = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : null;
const WS = "ws-1";
const day = (n: number, h = 10) => new Date(Date.now() - n * 864e5 + h * 36e5 - 12 * 36e5).toISOString();

function seed(): Record<string, Row[]> {
  const ext: Row[] = [];
  let id = 1;
  const add = (n: number, r: Row) => { for (let i = 0; i < n; i++) ext.push({ id: id++, workspace_id: WS, user_id: "u1", at: day(r.recent ? i % 5 : (i * 7) % 28, 9 + (i % 8)), input_tokens: 0, output_tokens: 0, model: "", ok: true, units: 0, cost: null, ...r }); };
  add(26, { kind: "comment", provider: "claude", model: "claude-opus-5-5", input_tokens: 1800, output_tokens: 420, job: "comment", section: "linkedin_bar", ms: 4200 });
  add(9, { kind: "comment", provider: "claude", model: "claude-opus-5-5", input_tokens: 1600, output_tokens: 380, job: "comment", section: "comment_studio", ms: 3900 });
  add(12, { kind: "studio", provider: "claude", model: "claude-opus-5-5", input_tokens: 3200, output_tokens: 900, job: "post", section: "content_studio", ms: 9100 });
  add(7, { kind: "studio", provider: "openai", model: "gpt-5", input_tokens: 2100, output_tokens: 600, job: "analysis", section: "discovery", ms: 5200 });
  add(2, { kind: "comment", provider: "openai", model: "gpt-5", job: "comment", section: "comment_studio", ok: false, ms: 900 });
  add(84, { recent: true, kind: "search", provider: "exa", job: "discovery_search", section: "discovery", units: 1, cost: 0.007, ms: 1300 });
  add(10, { kind: "citation", provider: "google_ai", model: "google_ai_overview", job: "citations", section: "citations", units: 1 });
  add(4, { kind: "image", provider: "openai", model: "gpt-image-2.5-flare", job: "image", section: "content_write", units: 1 });
  ext.push({ id: id++, workspace_id: WS, user_id: "u1", at: day(40), kind: "reply", provider: "claude", model: "claude-opus-5-5", input_tokens: 900, output_tokens: 300 });
  const hum: Row[] = Array.from({ length: 14 }, (_, i) => ({ id: `h${i}`, workspace_id: WS, day: day(i * 2).slice(0, 10), created_at: day(i * 2), service: "pangram", words: 220 + i * 10, cost: 0.12, job: "humanize_check", section: i % 2 ? "content_write" : "comment_studio", result: "passed" }));
  return {
    connection_settings: [{ workspace_id: WS, routes: { comment: { primary: "claude", fallback: "openai" }, analysis: { primary: "openai", fallback: "claude" } }, caps: { claude: { limit: 5, unit: "usd" }, exa: { limit: 100, unit: "calls" } }, advanced: {} }],
    ext_usage: ext, humanize_usage: hum,
    humanize_settings: [{ workspace_id: WS, level_comment: 50, level_post: 70, level_article: 70, pangram_cap: 20000, walter_cap: 0, pangram_cost_100: 0.05, walter_cost_100: 0 }],
    ext_tokens: [{ token_hash: "abc", workspace_id: WS, label: "Chrome · MacIntel", created_at: day(20), last_used: day(0), user_id: "u1" }],
    comment_log: [],
  };
}

// ---------- in-memory Supabase ----------
function fakeSupabase() {
  const db = seed();
  const missing = typeof location !== "undefined" && new URLSearchParams(location.search).get("db") === "old";
  class Q {
    t: string; f: ((r: Row) => boolean)[] = []; op = "select"; payload: Row | Row[] | null = null; ord: [string, boolean] | null = null;
    constructor(t: string) { this.t = t; }
    select() { return this; }
    eq(k: string, v: unknown) { this.f.push((r) => r[k] === v); return this; }
    neq(k: string, v: unknown) { this.f.push((r) => r[k] !== v); return this; }
    gte(k: string, v: string) { this.f.push((r) => String(r[k] ?? "") >= v); return this; }
    lte(k: string, v: string) { this.f.push((r) => String(r[k] ?? "") <= v); return this; }
    in(k: string, v: unknown[]) { this.f.push((r) => v.includes(r[k])); return this; }
    order(k: string, o?: { ascending?: boolean }) { this.ord = [k, o?.ascending ?? true]; return this; }
    limit() { return this; }
    single() { return this; }
    maybeSingle() { return this; }
    upsert(p: Row) { this.op = "upsert"; this.payload = p; return this; }
    insert(p: Row | Row[]) { this.op = "insert"; this.payload = p; return this; }
    update(p: Row) { this.op = "update"; this.payload = p; return this; }
    delete() { this.op = "delete"; return this; }
    run() {
      if (missing && this.t === "connection_settings") return { data: null, error: { message: 'relation "connection_settings" does not exist' } };
      const rows = (db[this.t] ||= []);
      if (this.op === "upsert") {
        const p = this.payload as Row; const i = rows.findIndex((r) => r.workspace_id === p.workspace_id);
        if (i >= 0) rows[i] = { ...rows[i], ...p }; else rows.push(p);
        window.dispatchEvent(new CustomEvent("prax:wrote", { detail: this.t }));
        return { data: p, error: null };
      }
      if (this.op === "insert") { const list = Array.isArray(this.payload) ? this.payload : [this.payload!]; rows.push(...list); window.dispatchEvent(new CustomEvent("prax:wrote", { detail: this.t })); return { data: list[0], error: null }; }
      const hit = rows.filter((r) => this.f.every((f) => f(r)));
      if (this.op === "delete") { db[this.t] = rows.filter((r) => !hit.includes(r)); window.dispatchEvent(new CustomEvent("prax:wrote", { detail: this.t })); return { data: null, error: null }; }
      if (this.op === "update") { hit.forEach((r) => Object.assign(r, this.payload)); return { data: hit[0] ?? null, error: null }; }
      let out = [...hit];
      if (this.ord) { const [k, asc] = this.ord; out.sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : 1) * (asc ? 1 : -1)); }
      return { data: out, error: null };
    }
    then(res: (v: unknown) => void, rej?: (e: unknown) => void) { const delay = new URLSearchParams(location.search).get("slow") ? 1500 : 60; return new Promise((r) => setTimeout(r, delay)).then(() => this.run()).then(res, rej); }
  }
  const ch = { on() { return ch; }, subscribe() { return ch; } };
  return { from: (t: string) => new Q(t), channel: () => ch, removeChannel() {}, rpc: async () => ({ data: null, error: null }), auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } };
}

// ---------- fake Prax for Chrome bridge ----------
function fakeBridge() {
  const sp = new URLSearchParams(location.search);
  const state = sp.get("ext") ?? "ok";
  if (state === "none") return;
  const keys: Record<string, string> = { claude: "sk-ant-fake", openai: "sk-fake", serpapi: "fake", exa: "fake" };
  const checkers: Record<string, string> = { pangram: "fake" };
  const jobKeys: Record<string, { tool: string; key: string }> = {};
  const models: Record<string, string> = {};
  let provider = "claude", quiet = false;
  const ids = ["claude", "openai", "gemini", "perplexity", "mistral", "deepseek", "groq", "grok", "serpapi", "pangram", "walter", "gptzero", "originality", "exa", "tavily", "firecrawl", "newsapi", "crunchbase", "apify", "openai_images", "gemini_images", "calendly"];
  const slot = (t: string) => ({ openai_images: "openai", gemini_images: "gemini" } as Record<string, string>)[t] || t;
  const has = (t: string) => { const s = slot(t); return s === "pangram" || s === "walter" ? !!checkers[s] : !!keys[s]; };
  const status = () => ({
    installed: true, version: state === "old" ? "0.9.6" : "0.9.7", connected: true, provider, model: "", hasKey: !!keys[provider], quiet,
    searchKeys: { claude: has("claude"), openai: has("openai"), gemini: has("gemini"), perplexity: has("perplexity"), google_ai: has("serpapi"), copilot: has("serpapi") },
    extraKeys: Object.keys(keys), checkerKeys: { pangram: !!checkers.pangram, walter: !!checkers.walter },
    ...(state === "old" ? {} : { tools: Object.fromEntries(ids.map((t) => [t, has(t)])), jobKeys: Object.fromEntries(Object.entries(jobKeys).map(([j, v]) => [j, v.tool])), models: { ...models } }),
  });
  const out = (m: Row) => window.postMessage({ praxExt: true, version: "0.9.7", ...m }, location.origin);
  window.addEventListener("message", (e) => {
    const d = e.data as Row;
    if (e.source !== window || !d?.praxWeb) return;
    const { id, type } = d as { id: string; type: string }; const data = (d.data ?? {}) as Row;
    setTimeout(() => {
      if (type === "tool") {
        const key = String(data.key || "") || (has(String(data.tool)) ? "saved" : "");
        if (!key) return out({ id, result: true, ok: false, error: "No key to test. Paste one, or connect the tool first." });
        if (/bad/.test(key)) return out({ id, result: true, ok: false, error: `${data.tool}: Incorrect API key provided` });
        return out({ id, result: true, ok: true, data: { ok: true, line: data.tool === "serpapi" ? "Key works. Developer Plan, 4,120 searches left this month." : "Key works. 42 models available." } });
      }
      if (["ai", "search", "image", "humanize", "history"].includes(type)) return out({ id, result: true, ok: false, error: "Fake bridge: no AI calls in the preview." });
      if (type === "settings") {
        const tk = data.toolKey as { tool: string; key: string } | undefined;
        if (tk?.key) { const s = slot(tk.tool); if (s === "pangram" || s === "walter") checkers[s] = tk.key; else keys[s] = tk.key; }
        if (data.clearTool) { const s = slot(String(data.clearTool)); delete keys[s]; delete checkers[s]; }
        const jk = data.jobKey as { job: string; tool: string; key: string } | undefined;
        if (jk?.key) jobKeys[jk.job] = { tool: jk.tool, key: jk.key };
        if (data.clearJobKey) delete jobKeys[String(data.clearJobKey)];
        const tm = data.toolModel as { tool: string; model: string } | undefined;
        if (tm) { if (tm.model) models[tm.tool] = tm.model; else delete models[tm.tool]; }
        if (data.provider) provider = String(data.provider);
        if (typeof data.quiet === "boolean") quiet = data.quiet;
      }
      out({ id, ok: true, data: status() });
    }, type === "tool" ? 700 : 40);
  });
}

if (W && !W.__praxPreview) {
  W.__praxPreview = true;
  W.__praxFakeSupabase = fakeSupabase();
  fakeBridge();
}

export function PreviewShell({ slug, children }: { slug: string; children: React.ReactNode }) {
  const role = (typeof location !== "undefined" && new URLSearchParams(location.search).get("role")) || "owner";
  const ws = { id: WS, slug, name: "Layla Haddad", headline: "Head of Digital Assets", linkedin_url: "", start_date: "2026-09-01", quotas: { comment: 10, request: 5, dm: 5, inmail: 2, reply: 5 }, topics: ["tokenisation"], company: "Qasr Digital Bank" } as Workspace;
  return (
    <WorkspaceProvider ws={ws} role={role as "owner"} userId="u1" email="layla@example.com" name="Layla Haddad">
      <Toaster>
        <div className="flex min-h-full">
          <Sidebar />
          <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">{children}</main>
        </div>
      </Toaster>
    </WorkspaceProvider>
  );
}
