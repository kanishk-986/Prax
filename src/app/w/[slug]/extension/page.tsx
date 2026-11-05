"use client";
import { useMemo, useState } from "react";
import { Download, Check, Circle, KeyRound, Plug, Gauge, Moon, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useWorkspace, ymd, addDays, today, fmtDay } from "@/lib/workspace";
import { useToast, haptic } from "@/components/toaster";
import { useExtension, LATEST_EXT } from "@/lib/bridge";

type Tok = { token_hash: string; label: string; created_at: string; last_used: string | null; user_id: string };
type Use = { id: number; at: string; kind: string; provider: string; model: string; input_tokens: number; output_tokens: number; user_id: string };
type Log = { id: string; day: string; source: string };

const PROVIDERS = [
  { id: "claude", name: "Claude (Anthropic)", model: "claude-opus-5-5", console: "https://console.anthropic.com" },
  { id: "openai", name: "OpenAI", model: "gpt-5", console: "https://platform.openai.com/usage" },
  { id: "grok", name: "Grok (xAI)", model: "grok-4", console: "https://console.x.ai" },
  { id: "gemini", name: "Gemini (Google)", model: "gemini-2.5-pro", console: "https://aistudio.google.com" },
];
// List prices per million tokens (input, output) for the Claude models; other providers show tokens only.
const PRICE: Record<string, [number, number]> = { "claude-opus-5-5": [4, 20], "claude-sonnet-5-5": [2, 10], "claude-haiku-5-5": [0.1, 0.5], "claude-fable-5-1": [10, 50] };

const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

export default function ExtensionPage() {
  const { ws, can, userId } = useWorkspace();
  const toast = useToast();
  const { status, send } = useExtension();
  const editor = can("editor");
  const toks = useLive<Tok>("ext_tokens", ws.id, { order: "created_at" });
  const usage = useLive<Use>("ext_usage", ws.id, { order: "at", asc: false, filter: (q) => q.gte("at", addDays(today(), -60)) });
  const logs = useLive<Log>("comment_log", ws.id, { filter: (q) => q.gte("day", addDays(today(), -30)) });
  const [form, setForm] = useState({ provider: "", apiKey: "", model: "" });
  const [busy, setBusy] = useState(false);
  const provider = form.provider || status?.provider || "claude";
  const welcome = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("welcome");

  async function connect() {
    setBusy(true);
    try {
      const raw = "prx_" + hex(crypto.getRandomValues(new Uint8Array(24)));
      const hash = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)));
      const { error } = await supabase().from("ext_tokens").insert({ token_hash: hash, workspace_id: ws.id, label: `Chrome · ${navigator.platform || "browser"}` });
      if (error) throw error;
      await send("connect", { token: raw });
      haptic(12); toast(`This browser is connected to ${ws.name}`); toks.reload();
    } catch (e) { toast((e as Error).message); }
    setBusy(false);
  }
  async function saveAI() {
    try {
      await send("settings", { provider, model: form.model, ...(form.apiKey ? { apiKey: form.apiKey } : {}) });
      setForm({ provider: "", apiKey: "", model: "" }); haptic(); toast("AI settings saved in this browser");
    } catch (e) { toast((e as Error).message); }
  }
  async function revoke(h: string) {
    const { error } = await supabase().from("ext_tokens").delete().eq("token_hash", h);
    if (error) toast(error.message); else { haptic(); toast("Browser disconnected"); toks.reload(); }
  }

  const stats = useMemo(() => {
    const month = ymd(new Date()).slice(0, 7);
    const m = usage.rows.filter((u) => u.at.slice(0, 7) === month);
    const by: Record<string, { n: number; i: number; o: number; cost: number | null }> = {};
    m.forEach((u) => {
      const k = u.model || u.provider || "unknown";
      const p = PRICE[u.model];
      const r = (by[k] ||= { n: 0, i: 0, o: 0, cost: p ? 0 : null });
      r.n++; r.i += u.input_tokens; r.o += u.output_tokens;
      if (p && r.cost != null) r.cost += (u.input_tokens * p[0] + u.output_tokens * p[1]) / 1e6;
    });
    const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i - 13)).map((d) => ({ d, n: usage.rows.filter((u) => ymd(new Date(u.at)) === d).length }));
    const cost = Object.values(by).reduce((s, r) => s + (r.cost ?? 0), 0);
    return { drafts: m.length, inTok: m.reduce((s, u) => s + u.input_tokens, 0), outTok: m.reduce((s, u) => s + u.output_tokens, 0), by, days, cost, priced: Object.values(by).some((r) => r.cost != null),
      logged: logs.rows.filter((l) => l.source === "extension").length };
  }, [usage.rows, logs.rows]);

  const installed = status?.installed;
  const steps: [string, boolean][] = [
    ["Install the extension", !!installed],
    ["Connect this browser", !!status?.connected],
    ["Add your AI key", !!status?.hasKey],
  ];
  const mine = toks.rows.filter((t) => t.user_id === userId);
  const max = Math.max(1, ...stats.days.map((d) => d.n));
  const prov = PROVIDERS.find((p) => p.id === provider);

  return (
    <div className="mx-auto max-w-[980px]">
      <PageHeader title="Extension" sub="A Prax bar under every LinkedIn post: drafts in this profile's voice, you post. Everything is set up here.">
        <a className="btn" href="/prax-extension.zip" download><Download size={14} /> Download v{LATEST_EXT}</a>
      </PageHeader>

      {welcome && installed && <div className="anim-rise mb-4 rounded-xl border border-good bg-good-soft px-4 py-3 text-[13px] text-good">Extension installed. Connect this browser and add your AI key below, then open LinkedIn.</div>}

      <section className="card mb-4 grid gap-3 p-4 sm:grid-cols-3">
        {steps.map(([l, ok], i) => (
          <div key={l} className="flex items-center gap-2.5">
            {status === null ? <span className="h-5 w-5 animate-pulse rounded-full bg-surface-2" /> : ok ? <Check size={18} className="anim-pop text-good" /> : <Circle size={18} className="text-faint" />}
            <div><div className="label">Step {i + 1}</div><div className={`text-[13px] font-medium ${ok ? "" : "text-muted"}`}>{l}</div></div>
          </div>
        ))}
      </section>

      {status && !installed && (
        <section className="card mb-4 p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold"><Download size={15} /> Install</h2>
          <ol className="mt-3 flex flex-col gap-2 text-[13px] text-ink-2">
            <li>1. Download the extension (button above) and double-click the zip. Keep the folder somewhere permanent, such as Documents.</li>
            <li>2. In Chrome, open <code className="kbd">chrome://extensions</code> and turn on Developer mode, top right.</li>
            <li>3. Click Load unpacked and choose the unzipped folder. Prax opens this page again to finish setup.</li>
          </ol>
        </section>
      )}
      {installed && status.version !== LATEST_EXT && (
        <div className="mb-4 rounded-xl border border-warn bg-warn-soft px-4 py-3 text-[13px] text-warn">This browser has version {status.version}. Download v{LATEST_EXT}, replace the folder, and press the reload arrow on Prax in chrome://extensions.</div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold"><Plug size={15} /> Connection</h2>
          <p className="mt-1 text-[12px] text-muted">Links this browser&apos;s extension to {ws.name}, so comments you post are logged here.</p>
          {status?.connected && <p className="mt-3 flex items-center gap-2 text-[13px] text-good"><Check size={14} /> This browser is connected</p>}
          <button className="btn btn-primary mt-3" disabled={!installed || !editor || busy} onClick={connect}>{status?.connected ? "Reconnect this browser" : "Connect this browser"}</button>
          {!editor && <p className="mt-2 text-[12px] text-muted">Editors and owners can connect a browser.</p>}
          {mine.length > 0 && (
            <ul className="mt-4 divide-y divide-line border-t border-line">
              {mine.map((t) => (
                <li key={t.token_hash} className="flex items-center justify-between py-2 text-[13px]">
                  <span>{t.label} <span className="text-[12px] text-muted">· {t.last_used ? `used ${new Date(t.last_used).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "not used yet"}</span></span>
                  <button className="btn btn-ghost hover:text-bad" onClick={() => revoke(t.token_hash)}>Disconnect</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold"><KeyRound size={15} /> AI model</h2>
          <p className="mt-1 text-[12px] text-muted">Your own key. It is saved inside the extension in this browser and sent only to the provider. Prax never stores it.</p>
          <fieldset disabled={!installed} className="mt-3 grid gap-3">
            <label className="flex flex-col gap-1"><span className="label">Provider</span>
              <select id="x-provider" className="field" value={provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>{PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="flex flex-col gap-1"><span className="label">API key</span>
              <input id="x-key" type="password" autoComplete="off" className="field" placeholder={status?.hasKey ? "Saved in this browser. Type to replace." : "Paste your key"} value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} /></label>
            <label className="flex flex-col gap-1"><span className="label">Model</span>
              <input id="x-model" className="field" placeholder={status?.model || prov?.model} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></label>
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={saveAI}>Save</button>
              {status?.hasKey && <button className="btn btn-ghost hover:text-bad" onClick={() => send("settings", { clearKey: true }).then(() => toast("Key removed from this browser"))}>Remove key</button>}
            </div>
          </fieldset>
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold"><Moon size={15} /> On LinkedIn</h2>
          <p className="mt-1 text-[12px] text-muted">Every post gets a Prax bar with the comment modes, or press Alt+P. Your own posts get Reply on comments, and the connection note box gets Prax note. Prax only suggests; you press Post or Send.</p>
          <label className="mt-3 flex items-center gap-2 text-[13px]">
            <input id="x-quiet" type="checkbox" disabled={!installed} checked={!!status?.quiet} onChange={(e) => { const on = e.target.checked; send("settings", { quiet: on }).then(() => { haptic(); toast(on ? "Quiet mode on: no bars on LinkedIn" : "Prax bars are back on LinkedIn"); }); }} />
            Quiet mode: hide the Prax bars and use the side panel only
          </label>
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold"><Gauge size={15} /> Usage and billing</h2>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div><div className="label">Drafts this month</div><div className="num text-[20px] font-semibold">{stats.drafts}</div></div>
            <div><div className="label">Tokens in / out</div><div className="num text-[15px] font-semibold">{(stats.inTok / 1000).toFixed(1)}k / {(stats.outTok / 1000).toFixed(1)}k</div></div>
            <div><div className="label">Est. cost</div><div className="num text-[20px] font-semibold">{stats.priced ? `$${stats.cost.toFixed(2)}` : "n/a"}</div></div>
          </div>
          <div className="mt-4 flex h-14 items-end gap-1" role="img" aria-label="Drafts per day, last 14 days">
            {stats.days.map((d) => <div key={d.d} title={`${fmtDay(d.d)}: ${d.n}`} className="flex-1 rounded-sm bg-accent" style={{ height: `${Math.max(4, (d.n / max) * 100)}%`, opacity: d.n ? 0.85 : 0.18 }} />)}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-faint"><span>{fmtDay(stats.days[0].d, { day: "numeric", month: "short" })}</span><span>today</span></div>
          {Object.keys(stats.by).length > 0 && (
            <table className="mt-3 w-full text-[12px]"><tbody>{Object.entries(stats.by).map(([k, r]) => (
              <tr key={k} className="border-t border-line"><td className="py-1.5">{k}</td><td className="num text-right text-muted">{r.n} runs</td><td className="num text-right">{r.cost != null ? `$${r.cost.toFixed(2)}` : `${((r.i + r.o) / 1000).toFixed(1)}k tok`}</td></tr>
            ))}</tbody></table>
          )}
          <p className="mt-3 text-[12px] text-muted">{stats.logged} comments logged from LinkedIn in 30 days. You pay the provider directly; the estimate uses list prices.{" "}
            <a className="inline-flex items-center gap-1 text-accent hover:underline" href={prov?.console} target="_blank" rel="noreferrer">Open {prov?.name.split(" ")[0]} console <ExternalLink size={11} /></a></p>
        </section>
      </div>
    </div>
  );
}
