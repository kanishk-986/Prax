"use client";
// How Prax shows an AI provider and its key, everywhere: the real logo beside the real name, the key state in
// plain words with a dot, the model in mono, the last use and this month's usage, and one action. The rules are
// written at the top of src/lib/providers.ts. Keys are never read back from the extension; at most "Saved ····".
import { useMemo } from "react";
import { useLive } from "@/lib/live";
import { useWorkspace, ymd, addDays, today } from "@/lib/workspace";
import { MARKS, KEY_STATE, CHECKERS, providerOf, usageFor, type ProviderUsage, type UsageRow, type CheckerId } from "@/lib/providers";

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

/** The provider's logo alone. Brand colour on light surfaces, white on dark ones. Grok and Copilot have no mark, so they keep the space. */
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

/** Pangram's or Walter's own mark, unaltered (sources in src/lib/providers.ts). */
export function CheckerLogo({ id, size = 16 }: { id: CheckerId; size?: number }) {
  const m = CHECKERS[id].mark;
  if ("image" in m) {
    // eslint-disable-next-line @next/next/no-img-element -- a 64px brand icon from /public, not worth next/image
    return <img src={m.image} width={size} height={size} alt="" aria-hidden="true" className="shrink-0 rounded-[3px]" style={{ width: size, height: size }} />;
  }
  return (
    <svg viewBox={m.viewBox} width={size} height={size} aria-hidden="true" focusable="false" className="shrink-0">
      {m.paths.map((p, i) => <path key={i} d={p.d} fill={p.fill} fillRule={p.evenodd ? "evenodd" : undefined} clipRule={p.evenodd ? "evenodd" : undefined} />)}
    </svg>
  );
}
/** Logo and name: "Pangram", "Walter (beta)". */
export function CheckerName({ id, size = 16, className, bold = true }: { id: CheckerId; size?: number; className?: string; bold?: boolean }) {
  return (
    <span className={cx("inline-flex min-w-0 items-center gap-2 whitespace-nowrap align-middle", bold && "font-semibold", className)}>
      <CheckerLogo id={id} size={size} /><span className="truncate">{CHECKERS[id].label}</span>
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

