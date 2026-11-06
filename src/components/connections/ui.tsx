"use client";
// Small pieces every Connections screen shares: the tool's real logo (or nothing, when it has no legitimate mark),
// the status dot and line, usage bars and the sparkline. Logos keep their brand colours.
import { CheckerLogo } from "@/components/provider-mark";
import { toolOf, BUILT_IN, type Totals } from "@/lib/connections";
import { markOf } from "@/lib/connections-marks";

export const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

/** The unaltered logo: a simple-icons path in its colour, the company's own SVG, or the humanize checkers' marks. */
export function ToolLogo({ id, size = 20 }: { id: string; size?: number }) {
  const m = markOf(id);
  if (!m) return null;
  if (m.kind === "checker") return <CheckerLogo id={m.id} size={size} />;
  // eslint-disable-next-line @next/next/no-img-element -- the company's own small SVG file from /public/brand, unaltered
  if (m.kind === "image") return <img src={m.src} width={size} height={size} alt="" aria-hidden="true" className="shrink-0" style={{ width: size, height: size }} />;
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" className="shrink-0" style={{ fill: m.mark.color }}><path d={m.mark.path} /></svg>;
}
export const hasLogo = (id: string) => !!markOf(id);

/** A logo tile for cards and headers; nothing when the tool has no legitimate mark (the name stands alone). */
export function LogoTile({ id, large }: { id: string; large?: boolean }) {
  if (!hasLogo(id)) return null;
  return <span className={cx("cx-tile", large && "lg")}><ToolLogo id={id} size={large ? 30 : 22} /></span>;
}

/** Logo and name inline, for tables and selects. Built-in options (Prax page reader) show their name. */
export function ToolInline({ id, short, className }: { id: string; short?: boolean; className?: string }) {
  const t = toolOf(id);
  const name = t ? (short ? t.short : t.name) : BUILT_IN[id]?.name ?? (id || "None");
  return <span className={cx("inline-flex min-w-0 items-center gap-2 whitespace-nowrap", className)}>{t && <ToolLogo id={id} size={16} />}<span className="truncate">{name}</span></span>;
}

export function Dot({ on, warn }: { on: boolean; warn?: boolean }) {
  return <span aria-hidden="true" className={cx("cx-dot", on && "on", warn && "warn")} />;
}

/** A thin bar; tone follows the cap state. */
export function Bar({ value, tone, label }: { value: number; tone?: "warn" | "stop" | ""; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return <div className={cx("cx-bar", tone)} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{ width: `${pct}%` }} /></div>;
}

/** Calls per day as a quiet line with the last point marked. Says so when there is nothing to draw. */
export function Spark({ points, label, width = 120, height = 32 }: { points: number[]; label: string; width?: number; height?: number }) {
  const max = Math.max(1, ...points);
  if (!points.some(Boolean)) return <span className="text-meta text-muted">No calls in this period</span>;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const xy = points.map((v, i) => [i * step, height - 3 - (v / max) * (height - 6)] as const);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = xy[xy.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="block overflow-visible">
      <path d={`${d} L${width} ${height} L0 ${height} Z`} fill="rgba(20,20,20,.05)" />
      <path d={d} fill="none" stroke="#141414" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill="#d64545" />
    </svg>
  );
}

export const fmtK = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 1e5 ? 0 : 1)}k` : String(n));
/** The amount column: tokens for models, words or credits for checkers and data tools, searches for SerpApi. */
export function amount(t: Totals, unit: string): string {
  if (unit === "tokens") return t.tokens ? `${fmtK(t.tokens)} tokens` : "None";
  if (unit === "words" || unit === "credits" || unit === "searches" || unit === "images") return t.units ? `${fmtK(t.units)} ${unit}` : "None";
  return "None";
}
