"use client";
// The Extension page's key settings: the main key that writes drafts, and the extra keys AI search uses. Both talk
// to the extension through the bridge; the key goes into extension storage in this browser and is never read back.
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useToast, haptic } from "@/components/toaster";
import { type ExtStatus } from "@/lib/bridge";
import { ENGINES, keySlot } from "@/lib/citations";
import { PROVIDERS, DRAFT_PROVIDERS, SAVED_KEY, usageLine, lastUsedLabel, type ProviderId, type ProviderUsage } from "@/lib/providers";
import { ProviderMark, KeyRow, KeyRowHead, KeyState, ModelId } from "./provider-mark";

type Send = (type: string, data?: Record<string, unknown>) => Promise<ExtStatus>;

/** The main key: which provider writes the drafts, its state, model and usage, and one action. */
export function DraftModel({ status, send, usage }: { status: ExtStatus | null; send: Send; usage: (id: string) => ProviderUsage }) {
  const toast = useToast();
  const saved = (status?.provider || "claude") as ProviderId;
  const [pick, setPick] = useState<ProviderId | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ apiKey: "", model: "" });
  const [busy, setBusy] = useState(false);
  const id = pick ?? saved;
  const p = PROVIDERS[id] ?? PROVIDERS.claude;
  // A saved key belongs to the saved provider; choosing another one needs a new key.
  const on = !!status?.hasKey && id === saved;
  const u = usage(id);
  const model = (id === saved && status?.model) || p.model;
  const installed = !!status?.installed;
  const switching = id !== saved;
  async function save() {
    setBusy(true);
    try {
      await send("settings", { provider: id, model: form.model.trim(), ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}) });
      setForm({ apiKey: "", model: "" }); setOpen(false); setPick(null); haptic(); toast(`${p.name} saved in this browser`);
    } catch (e) { toast((e as Error).message); }
    setBusy(false);
  }
  async function remove() {
    try { await send("settings", { clearKey: true }); setOpen(false); haptic(); toast("Key removed from this browser"); } catch (e) { toast((e as Error).message); }
  }
  const row = (label: string, v: React.ReactNode) => <div className="flex items-baseline justify-between gap-4 border-t border-line py-2.5"><dt className="text-meta text-muted">{label}</dt><dd className="m-0 min-w-0 truncate text-right text-body">{v}</dd></div>;
  return (
    <section className="card flex flex-col p-5">
      <h2 className="flex items-center gap-2 text-body font-semibold"><KeyRound size={15} /> AI model</h2>
      <p className="mt-1 text-meta text-muted">Writes your drafts on LinkedIn and in the studios. Your own key, saved inside the extension in this browser and sent only to the provider. Prax never stores it.</p>
      <fieldset disabled={!installed} className="mt-3">
        <legend className="sr-only">Provider</legend>
        <div role="radiogroup" aria-label="Provider" className="grid gap-1.5 sm:grid-cols-2">
          {DRAFT_PROVIDERS.map((x) => (
            <button key={x} type="button" role="radio" aria-checked={id === x} onClick={() => { setPick(x === saved ? null : x); setOpen(x !== saved); }}
              className={`flex h-9 min-w-0 items-center rounded-lg border px-2.5 text-left text-body transition-colors ${id === x ? "border-ink bg-white shadow-[inset_0_0_0_1px_#141414]" : "border-line bg-white hover:border-stroke"}`}>
              <ProviderMark id={x} bold={id === x} />
            </button>
          ))}
        </div>
      </fieldset>
      <dl className="m-0 mt-3">
        {row("Key", <KeyState on={on} />)}
        {row("Model", <ModelId model={model} />)}
        {row("Last used", <span className="num">{lastUsedLabel(u.last)}</span>)}
        {row("This month", <span className="num">{usageLine(u)}</span>)}
      </dl>
      {open ? (
        <form className="anim-rise mt-1 grid gap-2.5 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label className="flex flex-col gap-1"><span className="label">{p.name} key</span>
            <input id="x-key" autoFocus type="password" autoComplete="off" spellCheck={false} className="field font-mono text-meta" placeholder={on ? `${SAVED_KEY}  Paste a new key` : `Paste a key, it starts ${p.keyHint}`} value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} /></label>
          <label className="flex flex-col gap-1"><span className="label">Model <span className="font-normal">(optional)</span></span>
            <input id="x-model" spellCheck={false} className="field font-mono text-meta" placeholder={model} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary" disabled={busy || (switching ? !form.apiKey.trim() : !form.apiKey.trim() && !form.model.trim())}>{busy ? "Saving" : "Save to this browser"}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setOpen(false); setPick(null); setForm({ apiKey: "", model: "" }); }}>Cancel</button>
            {on && <button type="button" className="btn btn-ghost ml-auto hover:text-bad" onClick={remove}>Remove key</button>}
          </div>
        </form>
      ) : (
        <div className="mt-auto flex border-t border-line pt-3">
          <button type="button" className="btn" disabled={!installed} onClick={() => setOpen(true)}>{on ? "Replace key" : "Connect"}</button>
        </div>
      )}
    </section>
  );
}

/** Extra keys so AI citations and Discovery can ask the same question on several engines. Kept in the extension only. */
export function SearchKeys({ status, send, usage }: { status: ExtStatus | null; send: Send; usage: (id: string) => ProviderUsage }) {
  const toast = useToast();
  const main = status?.provider || "claude";
  // Google AI answers and Copilot share one SerpApi key, stored as keys.serpapi.
  const label = (e: ProviderId) => PROVIDERS[e].via ?? PROVIDERS[e].name;
  async function save(e: ProviderId, key: string) {
    try { await send("settings", { searchKey: { provider: keySlot(e), key } }); haptic(); toast(`${label(e)} key saved in this browser`); } catch (err) { toast((err as Error).message); throw err; }
  }
  async function remove(e: ProviderId) {
    try { await send("settings", { clearSearchKey: keySlot(e) }); haptic(); toast(`${label(e)} key removed from this browser`); } catch (err) { toast((err as Error).message); throw err; }
  }
  return (
    <section id="search-keys" className="card md:col-span-2">
      <div className="p-5 pb-3">
        <h2 className="flex items-center gap-2 text-body font-semibold"><KeyRound size={15} /> Keys for AI search</h2>
        <p className="mt-1 text-meta text-muted">AI citations and Discovery Studio ask each question, with web search on, on every provider that has a key here. Your drafting key counts for its own provider. Image making in Content Studio uses the OpenAI or Google key. Google AI answers and Microsoft Copilot are read from search results through one SerpApi key, for AI citations only.</p>
      </div>
      <div className="@container">
        <KeyRowHead />
        {ENGINES.map((e) => {
          const ready = !!status?.searchKeys?.[e.id], extra = !!status?.extraKeys?.includes(keySlot(e.id));
          const u = usage(e.id);
          return (
            <KeyRow key={e.id} id={e.id} connected={ready} model={u.lastModel || e.model} usage={u} disabled={!status?.installed}
              note={e.via ? "Through SerpApi" : ready && !extra && main === e.id ? "Uses your drafting key" : undefined} removable={extra}
              onSave={(k) => save(e.id, k)} onRemove={() => remove(e.id)} />
          );
        })}
      </div>
    </section>
  );
}
