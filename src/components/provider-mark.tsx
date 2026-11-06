"use client";
// How Prax shows an AI provider and its key, everywhere: the real logo beside the real name, the key state in
// plain words with a dot, the model in mono, the last use and this month's usage, and one action. The rules are
// written at the top of src/lib/providers.ts. Keys are never read back from the extension; at most "Saved ····".
import { useMemo, useState } from "react";
import Link from "next/link";
import { useLive } from "@/lib/live";
import { useExtension } from "@/lib/bridge";
import { useWorkspace, ymd, addDays, today } from "@/lib/workspace";
import { MARKS, PROVIDERS, KEY_STATE, SAVED_KEY, providerOf, usageFor, usageLine, lastUsedLabel, type ProviderId, type ProviderUsage, type UsageRow } from "@/lib/providers";

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

/** The provider's logo alone. Brand colour on light surfaces, white on dark ones. Grok has no mark, so it keeps the space. */
export function ProviderLogo({ id, size = 16, onDark = false }: { id: string; size?: number; onDark?: boolean }) {
  const p = providerOf(id), m = p ? MARKS[p.id] : null;
  if (!m) return <span aria-hidden="true" className="inline-block shrink-0" style={{ width: size, height: size }} />;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" className="shrink-0" style={{ fill: onDark ? "#ffffff" : m.color }}>
      <path d={m.path} />
    </svg>
  );
}

/** Logo and name. `short` gives "Claude" instead of "Anthropic Claude", for dense cells and logs. */
export function ProviderMark({ id, short = false, size, onDark = false, className, bold = true }: { id: string; short?: boolean; size?: number; onDark?: boolean; className?: string; bold?: boolean }) {
  const p = providerOf(id);
  const s = size ?? (short ? 14 : 16);
  return (
    <span className={cx("inline-flex min-w-0 items-center gap-2 whitespace-nowrap align-middle", bold && "font-semibold", className)}>
      <ProviderLogo id={id} size={s} onDark={onDark} />
      <span className="truncate">{p ? (short ? p.short : p.name) : id}</span>
    </span>
  );
}

/** A small status dot: solid when a key is in this browser, an empty ring when not. */
export function KeyDot({ on, onDark = false }: { on: boolean; onDark?: boolean }) {
  const c = onDark ? "#ffffff" : "#141414";
  return <span aria-hidden="true" className="inline-block h-[7px] w-[7px] shrink-0 rounded-full" style={on ? { background: c } : { boxShadow: `inset 0 0 0 1.5px ${onDark ? "#9e9e9e" : "#8c8c8c"}` }} />;
}

/** "Connected in this browser" or "No key in this browser", with the dot. */
export function KeyState({ on, onDark = false, className }: { on: boolean; onDark?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 whitespace-nowrap", className)} style={{ color: onDark ? (on ? "#ffffff" : "#cfcfcf") : on ? "#141414" : "#5f5f5f" }}>
      <KeyDot on={on} onDark={onDark} />{on ? KEY_STATE.on : KEY_STATE.off}
    </span>
  );
}

/** A model id in mono, such as claude-opus-5-5. */
export function ModelId({ model, className }: { model: string; className?: string }) {
  return <code className={cx("font-mono text-meta tracking-[-0.01em]", className)}>{model}</code>;
}

/** This user's AI calls from ext_usage over the last 60 days, summed per provider. Prax only stores token counts. */
export function useProviderUsage() {
  const { ws, userId } = useWorkspace();
  const usage = useLive<UsageRow & { user_id: string }>("ext_usage", ws.id, { order: "at", asc: false, filter: (q) => q.gte("at", addDays(today(), -60)) });
  return useMemo(() => {
    const mine = usage.rows.filter((r) => r.user_id === userId);
    const month = ymd(new Date()).slice(0, 7);
    return { loading: usage.loading, of: (id: string): ProviderUsage => usageFor(mine, id, month) };
  }, [usage.rows, usage.loading, userId]);
}

/** Which provider and model write the drafts in this browser, as one quiet row with a link to change it. */
export function DraftModelRow({ href, tour }: { href: string; tour?: string }) {
  const { status } = useExtension();
  const usage = useProviderUsage();
  const id = (status?.provider || "claude") as ProviderId;
  const p = PROVIDERS[id] ?? PROVIDERS.claude;
  const u = usage.of(p.id);
  const on = !!status?.hasKey;
  const fact = (label: string, v: React.ReactNode) => <span className="flex min-w-0 items-baseline gap-1.5"><span className="text-meta text-muted">{label}</span><span className="num truncate text-meta">{v}</span></span>;
  return (
    <section data-tour={tour} className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-line bg-surface px-[18px] py-3.5">
      <span className="flex min-w-0 flex-col gap-0.5"><span className="text-meta text-muted">Drafts are written by</span><ProviderMark id={p.id} className="text-body" /></span>
      {status === null ? <span className="h-4 w-48 animate-pulse rounded bg-surface-2" /> : !status.installed ? <span className="text-meta text-muted">The Prax extension is not installed in this browser.</span> : <>
        <KeyState on={on} className="text-meta" />
        {fact("Model", <ModelId model={status.model || p.model} />)}
        {fact("Last used", lastUsedLabel(u.last))}
        {fact("This month", usageLine(u))}
      </>}
      <Link href={href} className="btn ml-auto h-8">{on ? "Change" : "Connect"}</Link>
    </section>
  );
}

export type KeyRowProps = {
  id: ProviderId;
  connected: boolean;
  model: string;
  usage?: ProviderUsage;
  /** One quiet line under the name, such as "Writes your drafts". */
  note?: string;
  /** True when a key saved through this row can be removed here. */
  removable?: boolean;
  disabled?: boolean;
  onSave: (key: string) => Promise<unknown>;
  onRemove?: () => Promise<unknown>;
};

/** Column heads for KeyRow, shown only when the list is wide enough for columns. */
export function KeyRowHead() {
  return (
    <div className="hidden gap-4 border-b border-line px-4 pb-2 text-meta font-semibold text-muted @2xl:grid @2xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,.75fr)_minmax(0,1.45fr)_112px]">
      <span>Provider</span><span>Key</span><span>Model</span><span>Last used</span><span>This month</span><span className="sr-only">Action</span>
    </div>
  );
}

/**
 * One provider as a calm, factual row with a single action: Connect, or Replace key. Removing a key sits inside the
 * replace form, so a row never shows two competing buttons. Wrap rows in an element with the `@container` class:
 * wide containers get columns, narrow ones (a modal, a phone) get labelled pairs.
 */
export function KeyRow({ id, connected, model, usage, note, removable, disabled, onSave, onRemove }: KeyRowProps) {
  const p = PROVIDERS[id];
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!key.trim()) return;
    setBusy(true);
    try { await onSave(key.trim()); setKey(""); setOpen(false); } catch { /* the caller shows the toast */ }
    setBusy(false);
  }
  async function remove() {
    if (!onRemove) return;
    setBusy(true);
    try { await onRemove(); setOpen(false); } catch { /* the caller shows the toast */ }
    setBusy(false);
  }
  // Usage lines wrap instead of being cut off; the short cells stay on one line. Wide cells take a full line when narrow.
  const cell = (label: string, v: React.ReactNode, wrap = false, wide = false) => (
    <div className={cx("flex min-w-0 flex-col gap-0.5", wide && "col-span-2 @2xl:col-span-1")}><span className="text-meta text-muted @2xl:hidden">{label}</span><span className={cx("min-w-0 text-body", wrap ? "leading-snug" : "truncate")}>{v}</span></div>
  );
  return (
    <div className="border-b border-line last:border-b-0">
      <div className="grid grid-cols-2 items-center gap-x-4 gap-y-2.5 px-4 py-3 @2xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,.75fr)_minmax(0,1.45fr)_112px]">
        <div className="col-span-1 flex min-w-0 flex-col gap-0.5">
          <ProviderMark id={id} className="text-body" />
          {note && <span className="truncate pl-6 text-meta text-muted">{note}</span>}
        </div>
        <div className="col-span-1 flex justify-end @2xl:order-last">
          <button type="button" className={"btn h-8 w-[112px]"} disabled={disabled || busy} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? "Cancel" : connected ? "Replace key" : "Connect"}
          </button>
        </div>
        {cell("Key", <KeyState on={connected} />, false, true)}
        {cell("Model", <ModelId model={model} />)}
        {cell("Last used", <span className="num text-meta">{usage ? lastUsedLabel(usage.last) : "None"}</span>)}
        {cell("This month", <span className="num text-meta">{usage ? usageLine(usage) : "None"}</span>, true, true)}
      </div>
      {open && (
        <form className="anim-rise flex flex-wrap items-center gap-2 px-4 pb-3.5" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label htmlFor={`key-${id}`} className="sr-only">{p.name} key</label>
          <input id={`key-${id}`} autoFocus type="password" autoComplete="off" spellCheck={false} className="field h-9 min-w-0 flex-[1_1_240px] font-mono text-meta"
            placeholder={connected ? `${SAVED_KEY}  Paste a new key` : `Paste a key, it starts ${p.keyHint}`} value={key} onChange={(e) => setKey(e.target.value)} />
          <button type="submit" className="btn btn-primary h-9" disabled={busy || !key.trim()}>{busy ? "Saving" : "Save to this browser"}</button>
          {removable && onRemove && <button type="button" className="btn btn-ghost h-9 hover:text-bad" disabled={busy} onClick={remove}>Remove key</button>}
          <span className="basis-full text-meta text-muted">Saved only inside the Prax extension in this browser and sent only to {p.name.split(" ")[0]}. Prax never sees it.</span>
        </form>
      )}
    </div>
  );
}
