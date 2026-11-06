"use client";
// Prax for Chrome tab: everything the Extension page had except the key forms, which now live in Tools (Q135, Q138):
// install, version and update, connect this browser and the connected browsers, Quiet mode, and drafting usage.
import { useMemo, useState } from "react";
import { Download, Check, Circle, Plug, Gauge, Moon, ExternalLink } from "lucide-react";
import { SwitchRow } from "@/components/switch";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useWorkspace, ymd, addDays, today, fmtDay } from "@/lib/workspace";
import { useToast, haptic } from "@/components/toaster";
import { LATEST_EXT } from "@/lib/bridge";
import { ProviderMark, ModelId } from "@/components/provider-mark";
import { PROVIDERS, PRICE, providerOf } from "@/lib/providers";
import { type Conn } from "./use-connections";
import { UsingLine } from "./sheet";

type Tok = { token_hash: string; label: string; created_at: string; last_used: string | null; user_id: string };
type Use = { id: number; at: string; kind: string; provider: string; model: string; input_tokens: number; output_tokens: number; user_id: string };
type Log = { id: string; day: string; source: string };
const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

export function ChromeTab({ conn, onTools }: { conn: Conn; onTools: () => void }) {
  const { ws, can, userId } = useWorkspace();
  const toast = useToast();
  const { status, send } = conn;
  const editor = can("editor");
  const toks = useLive<Tok>("ext_tokens", ws.id, { order: "created_at" });
  const usage = useLive<Use>("ext_usage", ws.id, { order: "at", asc: false, filter: (q) => q.gte("at", addDays(today(), -60)) });
  const logs = useLive<Log>("comment_log", ws.id, { filter: (q) => q.gte("day", addDays(today(), -30)) });
  const [busy, setBusy] = useState(false);
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
  async function revoke(h: string) {
    const { error } = await supabase().from("ext_tokens").delete().eq("token_hash", h);
    if (error) toast(error.message); else { haptic(); toast("Browser disconnected"); toks.reload(); }
  }

  const stats = useMemo(() => {
    const month = ymd(new Date()).slice(0, 7);
    const m = usage.rows.filter((u) => u.at.slice(0, 7) === month && u.kind !== "scores");
    const by: Record<string, { n: number; i: number; o: number; cost: number | null }> = {};
    const prov: Record<string, string> = {};
    m.forEach((u) => {
      const k = u.model || u.provider || "unknown";
      if (!prov[k]) prov[k] = u.provider;
      const p = PRICE[u.model];
      const r = (by[k] ||= { n: 0, i: 0, o: 0, cost: p ? 0 : null });
      r.n++; r.i += u.input_tokens; r.o += u.output_tokens;
      if (p && r.cost != null) r.cost += (u.input_tokens * p[0] + u.output_tokens * p[1]) / 1e6;
    });
    const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i - 13)).map((d) => ({ d, n: usage.rows.filter((u) => ymd(new Date(u.at)) === d).length }));
    const cost = Object.values(by).reduce((s, r) => s + (r.cost ?? 0), 0);
    return { prov, drafts: m.length, inTok: m.reduce((s, u) => s + u.input_tokens, 0), outTok: m.reduce((s, u) => s + u.output_tokens, 0), by, days, cost, priced: Object.values(by).some((r) => r.cost != null),
      logged: logs.rows.filter((l) => l.source === "extension").length };
  }, [usage.rows, logs.rows]);

  const installed = status?.installed;
  const anyKey = !!status && (!!status.hasKey || Object.values(status.tools ?? {}).some(Boolean) || Object.values(status.searchKeys ?? {}).some(Boolean));
  const steps: [string, boolean][] = [["Install the extension", !!installed], ["Connect this browser", !!status?.connected], ["Connect an AI tool", anyKey]];
  const mine = toks.rows.filter((t) => t.user_id === userId);
  const max = Math.max(1, ...stats.days.map((d) => d.n));
  const prov = providerOf(status?.provider || "claude") ?? PROVIDERS.claude;

  return (
    <div className="flex flex-col gap-4">
      {welcome && installed && <div className="anim-rise rounded-xl border border-good bg-good-soft px-4 py-3 text-body text-good">Prax for Chrome is installed. Connect this browser below, then connect an AI tool in Tools.</div>}
      <section data-tour="steps" className="card grid gap-3 p-4 sm:grid-cols-3">
        {steps.map(([l, ok], i) => (
          <div key={l} className="flex items-center gap-2.5">
            {status === null ? <span className="h-5 w-5 animate-pulse rounded-full bg-surface-2" /> : ok ? <Check size={18} className="anim-pop text-good" /> : <Circle size={18} className="text-faint" />}
            <div><div className="label">Step {i + 1}</div><div className={`text-body font-medium ${ok ? "" : "text-muted"}`}>{l}</div></div>
          </div>
        ))}
      </section>

      {status && !installed && (
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-body font-semibold"><Download size={15} /> Install</h2>
          <ol className="mt-3 flex flex-col gap-2 text-body text-ink-2">
            <li>1. Download the extension and double-click the zip. Keep the folder somewhere permanent, such as Documents.</li>
            <li>2. In Chrome, open <code className="kbd">chrome://extensions</code> and turn on Developer mode, top right.</li>
            <li>3. Click Load unpacked and choose the unzipped folder. Prax opens this page again to finish setup.</li>
          </ol>
          <a className="btn mt-3 w-fit" href="/prax-extension.zip" download><Download size={14} /> Download v{LATEST_EXT}</a>
        </section>
      )}
      {installed && status.version !== LATEST_EXT && (
        <div className="rounded-xl border border-warn bg-warn-soft px-4 py-3 text-body text-warn">This browser has version {status.version}. Download v{LATEST_EXT}, replace the folder, and press the reload arrow on Prax in chrome://extensions. <a className="font-semibold underline underline-offset-2" href="/prax-extension.zip" download>Download v{LATEST_EXT}</a></div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-body font-semibold"><Plug size={15} /> Connection</h2>
          <p className="mt-1 text-meta text-muted">Links this browser&apos;s extension to {ws.name}, so comments you post are logged here.</p>
          {status?.connected && <p className="mt-3 flex items-center gap-2 text-body text-good"><Check size={14} /> This browser is connected</p>}
          <button className="btn btn-primary mt-3" disabled={!installed || !editor || busy} onClick={connect}>{status?.connected ? "Reconnect this browser" : "Connect this browser"}</button>
          {!editor && <p className="mt-2 text-meta text-muted">Editors and owners can connect a browser.</p>}
          {mine.length > 0 && (
            <ul className="mt-4 divide-y divide-line border-t border-line">
              {mine.map((t) => (
                <li key={t.token_hash} className="flex items-center justify-between gap-2 py-2 text-body">
                  <span className="min-w-0">{t.label} <span className="text-meta text-muted">· {t.last_used ? `used ${new Date(t.last_used).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "not used yet"}</span></span>
                  <button className="btn btn-ghost hover:text-bad" onClick={() => revoke(t.token_hash)}>Disconnect</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card flex flex-col p-5">
          <h2 className="text-body font-semibold">AI tools in this browser</h2>
          <p className="mt-1 text-meta text-muted">Keys are connected, tested, replaced and deleted in Tools. They stay inside the extension in this browser and go only to each provider.</p>
          <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
            <UsingLine job="comment" label="Comment drafts use" />
            <UsingLine job="post" label="Post drafts use" />
          </div>
          <button type="button" className="btn mt-auto w-fit" style={{ marginTop: 14 }} onClick={onTools}>Open Tools</button>
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-body font-semibold"><Moon size={15} /> On LinkedIn</h2>
          <p className="mt-1 text-meta text-muted">Every post gets a Prax bar with the comment modes, or press Alt+P. Your own posts get Reply on comments, and the connection note box gets Prax note. Prax only suggests; you press Post or Send.</p>
          <SwitchRow className="mt-3" disabled={!installed} on={!!status?.quiet} onChange={(on) => { send("settings", { quiet: on }).then(() => { haptic(); toast(on ? "Quiet mode on: no bars on LinkedIn" : "Prax bars are back on LinkedIn"); }, (err: Error) => toast(err.message)); }}
            label="Quiet mode" hint="Hide the Prax bars and use the side panel only" />
          <p className="mt-3 text-meta text-muted">Version in this browser: <span className="num font-medium text-ink">{installed ? status.version : "not installed"}</span> · latest <span className="num">{LATEST_EXT}</span></p>
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-body font-semibold"><Gauge size={15} /> Drafting usage</h2>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div><div className="label">Calls this month</div><div className="num text-page font-semibold">{stats.drafts}</div></div>
            <div><div className="label">Tokens in / out</div><div className="num text-title font-semibold">{(stats.inTok / 1000).toFixed(1)}k / {(stats.outTok / 1000).toFixed(1)}k</div></div>
            <div><div className="label">Est. cost</div><div className="num text-page font-semibold">{stats.priced ? `$${stats.cost.toFixed(2)}` : "None"}</div></div>
          </div>
          <div className="mt-4 flex h-14 items-end gap-1" role="img" aria-label="Calls per day, last 14 days">
            {stats.days.map((d) => <div key={d.d} title={`${fmtDay(d.d)}: ${d.n}`} className="flex-1 rounded-sm bg-accent" style={{ height: `${Math.max(4, (d.n / max) * 100)}%`, opacity: d.n ? 0.85 : 0.18 }} />)}
          </div>
          <div className="mt-1 flex justify-between text-meta text-faint"><span>{fmtDay(stats.days[0].d, { day: "numeric", month: "short" })}</span><span>today</span></div>
          {Object.keys(stats.by).length > 0 && (
            <table className="mt-3 w-full text-meta"><tbody>{Object.entries(stats.by).map(([k, r]) => (
              <tr key={k} className="border-t border-line"><td className="py-1.5"><span className="flex min-w-0 items-center gap-2"><ProviderMark id={stats.prov[k] || k} short bold={false} className="w-[86px] shrink-0" /><ModelId model={k} className="truncate text-muted" /></span></td>{providerOf(stats.prov[k] || k)?.via
                ? <><td className="num whitespace-nowrap text-right text-muted">{r.n} {r.n === 1 ? "search" : "searches"}</td><td /></>
                : <><td className="num text-right text-muted">{r.n} {r.n === 1 ? "call" : "calls"}</td><td className="num text-right">{r.cost != null ? `$${r.cost.toFixed(2)}` : `${((r.i + r.o) / 1000).toFixed(1)}k tokens`}</td></>}</tr>
            ))}</tbody></table>
          )}
          <p className="mt-3 text-meta text-muted">{stats.logged} comments logged from LinkedIn in 30 days. You pay the provider directly; the estimate uses list prices. The Overview tab breaks spend down by tool, job and section.{" "}
            <a className="inline-flex items-center gap-1 text-accent hover:underline" href={prov.console} target="_blank" rel="noreferrer">Open {prov.name.split(" ")[0]} console <ExternalLink size={11} /></a></p>
        </section>
      </div>
      {/* Q118: the planned LinkedIn connection is one quiet line here, never a button. */}
      <p className="text-meta text-muted">A direct LinkedIn connection (LinkedIn MCP) is planned. Nothing is connected today, and Prax will never post or send for you.</p>
    </div>
  );
}
