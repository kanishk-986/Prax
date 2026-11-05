"use client";
// Discovery Studio building blocks: the data every tab reads, side panels, pills and small helpers.
import { useEffect } from "react";
import { X } from "lucide-react";
import { type Finding, type Band, type Settings, type Topic, hostOf } from "@/lib/discovery";

export type Run = { id: string; kind: "ai" | "crawl"; trigger: string; status: string; window_days: number; stats: Record<string, number>; log: LogRow[]; started_at: string; finished_at: string | null };
export type LogRow = { id?: string; q?: string; pack?: string; engine?: string; returned?: number; cited?: number; confirmed?: number; urls?: string[]; error?: string; link?: string; name?: string; status?: string; articles?: number };
export type List = { id: string; name: string; file_name: string; created_at: string };
export type Link = { id: string; list_id: string; url: string; name: string; type: string; priority: string; access: string; region: string; notes: string; status: string; articles: number; error: string; last_read: string | null };
export type TopicRow = { id: string; week: string; key: string; title: string; finding_ids: string[]; score: number; rank: number | null; merge_with: string | null; merge_state: string; parts: Record<string, unknown>; post_id: string | null; sent_at: string | null; campaign_id: string | null };
export type Ranked = Topic & { score: number };

/** Everything the tabs share, loaded once by the page. */
export type Data = {
  findings: Finding[]; runs: Run[]; lists: List[]; links: Link[]; topicRows: TopicRow[]; settings: Settings;
  warm: (orgs: string[]) => number; band: (f: Finding) => Band; total: (f: Finding) => number;
  digest: { top: Ranked[]; list: Ranked[]; rising: Ranked[]; rest: Ranked[]; all: Topic[] };
  engines: { id: string; name: string; ready: boolean }[]; editable: boolean;
};

export const BAND_STYLE: Record<Band, React.CSSProperties> = {
  "Post-worthy": { background: "#d64545", color: "#fff" },
  "Comment-worthy": { background: "#141414", color: "#fff" },
  Watch: { background: "#fff", color: "#141414", border: "1px solid #d0d0d0" },
  Dropped: { background: "#fff", color: "#8c8c8c", border: "1px solid #d0d0d0" },
};
export const BandPill = ({ b }: { b: Band }) => <span className="pill shrink-0" style={BAND_STYLE[b]}>{b}</span>;
export const Tag = ({ children, tone = "grey", title }: { children: React.ReactNode; tone?: "grey" | "dark" | "red" | "deep" | "white"; title?: string }) => (
  <span title={title ?? (typeof children === "string" ? children : undefined)} className="pill h-[22px] min-w-0 max-w-full shrink-0 px-2 text-[11.5px]" style={tone === "dark" ? { background: "#141414", color: "#fff" } : tone === "red" ? { background: "#d64545", color: "#fff" } : tone === "deep" ? { background: "#9e1c1c", color: "#fff" } : tone === "white" ? { background: "#fff", color: "#141414", border: "1px solid #d0d0d0" } : { background: "#f0f0f0", color: "#141414" }}><span className="truncate">{children}</span></span>
);
export const STATUS_LABEL: Record<string, string> = { new: "Not read yet", read: "Read", list: "List page", gated: "Gated", blocked: "Blocked", failed: "Could not read" };
export const LinkStatus = ({ s }: { s: string }) => (
  <span className="pill shrink-0" style={s === "gated" ? { background: "#9e1c1c", color: "#fff" } : s === "blocked" ? { background: "#fff", color: "#d64545", border: "1px solid #d64545" } : s === "failed" || s === "new" ? { background: "#fff", color: "#5f5f5f", border: "1px solid #d0d0d0" } : s === "reading" ? { background: "#d64545", color: "#fff" } : { background: "#141414", color: "#fff" }}>{s === "reading" ? "Reading" : STATUS_LABEL[s] ?? s}</span>
);

/** "Found by": AI search with its query, Crawl with its list and link, or LinkedIn sent by the user. */
export function foundBy(f: Finding): string {
  const parts: string[] = [];
  if (f.found.ai) parts.push(`${f.found.ai.engine ? `${engineName(f.found.ai.engine)} web search` : "AI search"}${f.found.ai.query ? `, "${f.found.ai.query}"` : ""}`);
  if (f.found.crawl) parts.push(`Crawled: ${f.found.crawl.list || "a list"}, ${f.found.crawl.link ? hostOf(f.found.crawl.link) + (new URL(f.found.crawl.link).pathname.replace(/\/$/, "") || "") : ""}`);
  if (f.found_by.includes("linkedin")) parts.push(`LinkedIn, sent by you from the Prax bar${f.found.linkedin?.author ? ` (${f.found.linkedin.author})` : ""}`);
  return parts.join(" · ") || "None";
}
export const foundKinds = (f: Finding) => [f.found_by.includes("ai") && "AI search", f.found_by.includes("crawl") && "Crawl", f.found_by.includes("linkedin") && "LinkedIn"].filter(Boolean) as string[];
export const engineName = (e: string) => ({ claude: "Claude", openai: "ChatGPT", gemini: "Gemini", perplexity: "Perplexity" } as Record<string, string>)[e] ?? e;
export const warmLine = (n: number) => `Warm: you know ${n} ${n === 1 ? "person" : "people"} here, from Network. Comment first.`;
export const ago = (iso: string | null) => {
  if (!iso) return "never";
  const d = Math.round((Date.now() - Date.parse(iso)) / 864e5);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};
export const dateLabel = (f: Pick<Finding, "published" | "confirmed">) => (!f.confirmed ? "Unconfirmed date" : f.published ? new Date(f.published + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "No date");

/** A right-side panel with a backdrop, Escape and Close. */
export function SidePanel({ title, kicker, onClose, children, width = 520 }: { title: React.ReactNode; kicker?: React.ReactNode; onClose: () => void; children: React.ReactNode; width?: number }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <>
      <div className="fixed inset-0 z-[54] bg-[rgba(20,20,20,.25)]" onClick={onClose} />
      <aside role="dialog" aria-label={typeof title === "string" ? title : "Detail"} className="anim-rise fixed inset-y-0 right-0 z-[55] flex flex-col gap-3 overflow-y-auto bg-white p-[22px] shadow-[-12px_0_30px_rgba(20,20,20,.12)]" style={{ width: `min(${width}px, 100vw)` }}>
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex min-w-0 flex-col gap-1">{kicker && <span className="text-[12px] font-semibold text-muted">{kicker}</span>}<span className="text-[16px] font-[650] leading-snug">{title}</span></div>
          <button type="button" className="btn h-8 w-8 shrink-0 p-0" aria-label="Close" onClick={onClose}><X size={15} /></button>
        </div>
        {children}
      </aside>
    </>
  );
}
export const Box = ({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) => (
  <button type="button" role="checkbox" aria-checked={on} aria-label={label} onClick={onClick} className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[12px] text-white" style={{ background: on ? "#d64545" : "#fff", border: on ? 0 : "1.5px solid #d0d0d0" }}>{on ? "✓" : ""}</button>
);
export const H2 = ({ children, sub, right }: { children: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) => (
  <div className="flex flex-wrap items-start justify-between gap-2.5 px-[18px] py-3.5"><div className="min-w-0"><div className="font-semibold">{children}</div>{sub && <div className="mt-0.5 text-[12.5px] text-muted">{sub}</div>}</div>{right}</div>
);
