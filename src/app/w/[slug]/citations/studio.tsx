"use client";
// The AI citations studio: entry moment, keys, Home dashboard, gaps, company view, weekly report, keywords and the
// guided tour. Everything is computed from stored runs; nothing here is sample data.
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useWorkspace } from "@/lib/workspace";
import { useToast, haptic } from "@/components/toaster";
import { useExtension } from "@/lib/bridge";
import { buildPdf, downloadFile, type PdfDoc, type PdfSection } from "@/lib/pdf";
import {
  ENGINES, latestBatches, aggregate, shareOfVoice, citationGaps, owns, linkedinCited, changes, factIssues, recommend,
  subjectShare, detectPerson, weeklyTrend, sameDirection, promptGaps, gapTopic, keywordStats, runWeeks, runsInWeek, shiftWeek, audienceOf, AUDIENCE_LABEL,
  type Engine, type Entity, type Run, type Question, type Facts, type PromptGap,
} from "@/lib/citations";
import s from "./citations.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");
const shortDate = (iso: string) => new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const when = (t: string) => new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const engineLabel = (e: string) => ({ openai: "ChatGPT", gemini: "Gemini", claude: "Claude", perplexity: "Perplexity" }[e] ?? e);
export type Ctx = { runs: Run[]; qs: Question[]; person?: Entity; company?: Entity; selfAll: Entity; rivals: Entity[]; experts: Entity[]; firms: Entity[]; ctx: string[] };

// ---------------- entry moment ----------------
export function Intro({ line }: { line: string }) {
  const [show, setShow] = useState(false), [out, setOut] = useState(false);
  useEffect(() => {
    let seen = false; try { seen = sessionStorage.getItem("prax-cit-intro") === "1"; sessionStorage.setItem("prax-cit-intro", "1"); } catch {}
    if (seen) return;
    setShow(true);
    const t = setTimeout(() => leave(), 2300);
    const k = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === "Escape") leave(); };
    window.addEventListener("keydown", k);
    return () => { clearTimeout(t); window.removeEventListener("keydown", k); };
  }, []);
  function leave() { setOut(true); setTimeout(() => setShow(false), 450); }
  if (!show) return null;
  return (
    <div className={cx(s.veil, out && s.veilOut)} onClick={leave} role="dialog" aria-label="AI citations">
      <div className="flex flex-col items-center gap-4 text-center">
        <svg className={s.veilMark} width="64" height="64" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="5.5" fill="#141414" /><path d="M4.5 4.5H15V7.5H7.5V15H4.5Z" fill="#ffffff" /><path d="M19.5 19.5H9V16.5H16.5V9H19.5Z" fill="#d64545" /></svg>
        <span className={cx(s.veilL1, "text-[34px] font-semibold tracking-tight")}>AI citations</span>
        <span className={cx(s.veilL2, "max-w-[460px] text-[15px] text-[#5f5f5f]")}>{line}</span>
        <span className={cx(s.veilL3, "flex flex-col items-center gap-3")}>
          <button className={cx(s.btn, s.red)} onClick={(e) => { e.stopPropagation(); leave(); }}>Enter</button>
          <span className="block h-[2px] w-[140px] overflow-hidden rounded bg-[#e3e3e3]"><span className={s.veilBar} /></span>
        </span>
      </div>
    </div>
  );
}

// ---------------- keys ----------------
const KEYS: { id: Engine; name: string; hint: string; ph: string }[] = [
  { id: "openai", name: "OpenAI", hint: "for ChatGPT", ph: "sk-..." },
  { id: "gemini", name: "Google", hint: "for Gemini", ph: "AIza..." },
  { id: "claude", name: "Anthropic", hint: "for Claude", ph: "sk-ant-..." },
  { id: "perplexity", name: "Perplexity", hint: "for Perplexity Sonar", ph: "pplx-..." },
];
export function KeysModal({ onClose }: { onClose: () => void }) {
  const { status, send } = useExtension();
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const saved = (e: Engine) => !!status?.searchKeys?.[e];
  async function save() {
    setBusy(true); let n = 0;
    try { for (const k of KEYS) { const v = (draft[k.id] ?? "").trim(); if (v) { await send("settings", { searchKey: { provider: k.id, key: v } }); n++; } } }
    catch (e) { toast((e as Error).message); }
    setBusy(false); setDraft({});
    if (n) { haptic(); toast(`${n} key${n > 1 ? "s" : ""} saved in this browser`); onClose(); } else toast("No key entered");
  }
  async function remove(k: typeof KEYS[number]) {
    try { await send("settings", { clearSearchKey: k.id }); haptic(); toast(`${k.name} key removed from this browser`); } catch (e) { toast((e as Error).message); }
  }
  return (
    <div className="fixed inset-0 z-[58] flex items-center justify-center bg-black/35 p-4" onMouseDown={onClose}>
      <div className={cx(s.box, "w-full max-w-[520px] p-6 shadow-2xl")} role="dialog" aria-label="Connect AI keys" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-[17px] font-semibold">Connect AI keys</h2><p className={s.small}>Each key is saved only in this browser, inside the Prax extension. It goes only to that provider, never to Prax, and is never shown again.</p></div>
          <button className={cx(s.btn, s.sm)} onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>
        {status && !status.installed ? <p className="mt-4 text-[13.5px] text-[#d64545]">The Prax extension is not installed in this browser. Install it from the Extension page first.</p> : (
          <div className="mt-4 grid gap-3">{KEYS.map((k) => (
            <div key={k.id} className="grid gap-1.5 border-t border-[#ececec] pt-3">
              <div className="flex items-center justify-between gap-2"><label htmlFor={`key-${k.id}`} className="text-[13.5px] font-semibold">{k.name} <span className="font-normal text-faint">{k.hint}</span></label><span className={cx(s.pill, saved(k.id) ? s.pDark : s.pLine)}>{saved(k.id) ? "Saved" : "Not connected"}</span></div>
              <div className="flex gap-2">
                <input id={`key-${k.id}`} className={s.field} type="password" autoComplete="off" placeholder={saved(k.id) ? "Saved. Paste a new key to replace it" : k.ph} value={draft[k.id] ?? ""} onChange={(e) => setDraft({ ...draft, [k.id]: e.target.value })} />
                {saved(k.id) && <button className={cx(s.btn, "text-[#d64545]")} onClick={() => remove(k)}>Remove</button>}
              </div>
            </div>
          ))}</div>
        )}
        <div className="mt-5 flex justify-end gap-2"><button className={s.btn} onClick={onClose}>Cancel</button><button className={cx(s.btn, s.red)} disabled={busy || !status?.installed} onClick={save}>{busy ? "Saving" : "Save to this browser"}</button></div>
      </div>
    </div>
  );
}

// ---------------- chart ----------------
type Series = { key: string; label: string; color: string; dash?: boolean; values: (number | null)[]; unit?: string };
export function TrendChart({ weeks, series, aria }: { weeks: string[]; series: Series[]; aria: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((x) => x.values).filter((v): v is number => v != null);
  const max = Math.max(4, ...all);
  const px = (i: number) => 40 + i * (590 / Math.max(1, weeks.length - 1)), py = (v: number) => 180 - (v / max) * 160, hw = 590 / Math.max(1, weeks.length - 1);
  const pts = (vals: (number | null)[]) => vals.map((v, i) => (v == null ? null : `${px(i).toFixed(0)},${py(v).toFixed(0)}`)).filter(Boolean).join(" ");
  const ticks = [0, Math.round(max / 2), max];
  const left = hover != null && hover > weeks.length / 2;
  return (
    <div className={s.chartWrap} onMouseLeave={() => setHover(null)}>
      <svg viewBox="0 0 640 205" width="100%" role="img" aria-label={aria} className="block">
        {ticks.map((t) => <g key={t}><line x1="40" x2="630" y1={py(t)} y2={py(t)} stroke={t ? "#f0f0f0" : "#d0d0d0"} /><text x="32" y={py(t) + 4} textAnchor="end" fontSize="11" fill="#6b6b6b">{t}</text></g>)}
        {hover != null && <line x1={px(hover)} x2={px(hover)} y1="14" y2="180" stroke="#141414" strokeDasharray="3 3" />}
        {series.map((x) => <polyline key={x.key} points={pts(x.values)} fill="none" stroke={x.color} strokeWidth="2.5" strokeDasharray={x.dash ? "5 5" : undefined} />)}
        {hover != null && series.map((x) => x.values[hover] != null && <circle key={x.key} cx={px(hover)} cy={py(x.values[hover]!)} r="4.5" fill="#fff" stroke={x.color} strokeWidth="2.5" />)}
        {weeks.map((w, i) => <text key={w} x={px(i)} y="200" textAnchor="middle" fontSize="11" fill={hover === i ? "#141414" : "#6b6b6b"} fontWeight={hover === i ? 700 : 400}>{shortDate(w)}</text>)}
        {weeks.map((w, i) => <rect key={w} x={px(i) - hw / 2} y="10" width={hw} height="180" fill="transparent" style={{ cursor: "pointer" }} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />)}
      </svg>
      {hover != null && (
        <div className={s.tip} role="status" style={left ? { right: `${100 - (px(hover) / 640) * 100 + 3}%` } : { left: `${(px(hover) / 640) * 100 + 2}%` }}>
          <b>Week of {shortDate(weeks[hover])}</b>
          {series.map((x) => <span key={x.key} className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5"><span className={s.sw} style={{ background: x.color }} />{x.label}</span><b className={s.num}>{x.values[hover] == null ? "no run" : `${x.values[hover]}${x.unit ?? ""}`}</b></span>)}
        </div>
      )}
    </div>
  );
}

// ---------------- home ----------------
export function Home({ c, onTab, onOpenRun, onKeys, onRun, cards }: { c: Ctx; onTab: (t: string) => void; onOpenRun: (id: string) => void; onKeys: () => void; onRun: () => void; cards: React.ReactNode }) {
  const { status } = useExtension();
  const { runs, qs, person, company, selfAll, rivals, ctx } = c;
  const P = useMemo(() => subjectShare(runs, qs, "person", person, company, ctx, ["expert", "leadership"]), [runs, qs, person, company, ctx]);
  const C = useMemo(() => subjectShare(runs, qs, "company", company, company, ctx, ["vendor", "leadership"]), [runs, qs, company, ctx]);
  const trend = useMemo(() => weeklyTrend(runs, qs, person, company, rivals, ctx), [runs, qs, person, company, rivals, ctx]);
  const gaps = useMemo(() => promptGaps(runs, qs, person, company, c.experts, c.firms, ctx), [runs, qs, person, company, c.experts, c.firms, ctx]);
  const board = useMemo(() => [{ name: "Shashi and Antier", me: true, n: shareOfVoice(runs, qs, selfAll, selfAll).named }, ...rivals.map((r) => ({ name: r.name, me: false, n: shareOfVoice(runs, qs, r, selfAll).named }))].sort((a, b) => b.n - a.n), [runs, qs, selfAll, rivals]);
  const rank = board.findIndex((b) => b.me) + 1;
  const total = shareOfVoice(runs, qs, selfAll, selfAll).total;
  const latest = runs.slice(0, 6);
  const mix = useMemo(() => {
    const m = { third: 0, rival: 0, owned: 0, li: 0 }, sites = new Map<string, number>();
    const rivalDomains = rivals.flatMap((r) => r.domains), liDomains = (person?.domains ?? []).filter((d) => /linkedin\.com/i.test(d));
    latestBatches(runs).forEach(({ now }) => now.forEach((r) => r.sources.forEach((x) => {
      if (owns(x.url, liDomains)) m.li++; else if (owns(x.url, [...(company?.domains ?? []), ...(person?.domains ?? [])])) m.owned++; else if (owns(x.url, rivalDomains)) m.rival++; else m.third++;
      if (x.domain) sites.set(x.domain, (sites.get(x.domain) ?? 0) + 1);
    })));
    const sum = m.third + m.rival + m.owned + m.li;
    return { parts: [["Third party", m.third, "#141414"], ["Competitors", m.rival, "#b5b5b5"], ["Antier pages", m.owned, "#d64545"], ["His LinkedIn", m.li, "#9e1c1c"]] as [string, number, string][], sum, top: [...sites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4) };
  }, [runs, rivals, person, company]);
  const outcome = (r: Run) => {
    if (r.status === "failed") return ["Failed, not counted", s.pLine] as const;
    const p = person ? detectPerson(r, person, company, ctx) : null;
    if (p?.named) return ["Shashi named", s.pRed] as const;
    if (company && aggregate([r], company)?.named) return ["Antier named", s.pDark] as const;
    if (p?.review) return ["Needs review", s.pLine] as const;
    return ["Not named", s.pLine] as const;
  };
  const engineLines: Series[] = [
    { key: "openai", label: "ChatGPT", color: "#d64545", values: trend.map((t) => t.engines.openai ?? null) },
    { key: "gemini", label: "Gemini", color: "#5f5f5f", values: trend.map((t) => t.engines.gemini ?? null) },
    { key: "claude", label: "Claude", color: "#9e1c1c", values: trend.map((t) => t.engines.claude ?? null) },
    { key: "perplexity", label: "Perplexity", color: "#1f6f8b", values: trend.map((t) => t.engines.perplexity ?? null) },
    { key: "median", label: "Competitor median", color: "#b5b5b5", dash: true, values: trend.map((t) => t.median) },
  ].filter((x) => x.values.some((v) => v != null));
  return (
    <div className="flex flex-col gap-4">
      <div id="tour-kpis" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <button className={s.kpi} onClick={() => onTab("Answers")}><span className={s.label}>Shashi named</span><span><span className={s.big}>{P.named}</span> <span className="text-[13px] text-[#5f5f5f]">of {P.total} expert prompts</span></span><span className={s.small}>{P.review ? `${P.review} need review` : "full name with context"}</span></button>
        <button className={s.kpi} onClick={() => onTab("Company")}><span className={s.label}>Antier named</span><span><span className={s.big}>{C.named}</span> <span className="text-[13px] text-[#5f5f5f]">of {C.total} vendor prompts</span></span><span className={s.small}>linked in {C.linked}</span></button>
        <button className={s.kpi} onClick={() => onTab("Competitors")}><span className={s.label}>Standing</span><span><span className={s.big}>{total ? `#${rank}` : "–"}</span> <span className="text-[13px] text-[#5f5f5f]">of {board.length}</span></span><span className={s.small}>share of voice, branded prompts out</span></button>
        <button className={s.kpi} onClick={() => onTab("Gaps")}><span className={s.label}>Open gaps</span><span className={s.big}>{gaps.length}</span><span className={s.small}>a competitor named, he or Antier not</span></button>
      </div>
      <div className="flex flex-wrap gap-4">
        <section id="tour-trend" className={cx(s.box, "min-w-0 flex-[3_1_560px] p-5")}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">Named, last 8 weeks</span><span className="flex flex-wrap gap-3 text-[12px] text-[#5f5f5f]">{engineLines.map((l) => <span key={l.key} className="flex items-center gap-1.5"><span style={{ width: 16, borderTop: `2px ${l.dash ? "dashed" : "solid"} ${l.color}` }} />{l.label}</span>)}</span></div>
          {engineLines.length ? <TrendChart weeks={trend.map((t) => t.week)} series={engineLines} aria="Prompts naming Shashi or Antier per week and AI tool, against the competitor median" />
            : <p className={cx(s.small, "py-10 text-center")}>The trend fills in from your weekly runs.</p>}
          <p className={cx(s.small, "mt-1")}>Hover or click a week to read its values. Prompts naming Shashi or Antier, per AI tool. API with web search.</p>
        </section>
        <aside id="tour-standing" className={cx(s.panel, "min-w-0 flex-[2_1_300px] p-5")}>
          <div className={s.label} style={{ color: "#ff8a80" }}>Standing</div>
          <div className="mt-2 flex items-baseline gap-2"><span className={s.big} style={{ fontSize: 40 }}>{total ? `#${rank}` : "–"}</span><span className="text-[#cfcfcf]">of {board.length} tracked names</span></div>
          <div className="mt-3 grid gap-2">{board.slice(0, 6).map((b) => (
            <div key={b.name} className="grid grid-cols-[minmax(0,1fr)_70px_34px] items-center gap-2.5 text-[13px]"><span style={{ fontWeight: b.me ? 700 : 500, color: b.me ? "#ff8a80" : "#fff" }} className="truncate">{b.name}</span><span className="h-1.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full" style={{ width: `${total ? Math.round((b.n / total) * 100) : 0}%`, background: b.me ? "#d64545" : "#fff" }} /></span><span className={cx(s.num, "text-right")}>{b.n}</span></div>
          ))}</div>
          <button className={cx(s.ghostDark, "mt-4")} onClick={() => onTab("Competitors")}>Full leaderboard</button>
        </aside>
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <section className="flex min-w-0 flex-[3_1_560px] flex-col gap-4">
          <div id="tour-engines" className={cx(s.box, "overflow-x-auto")}>
            <table className={s.table}>
              <thead><tr><th>AI tool</th><th>Shashi</th><th>Antier</th><th>Key</th></tr></thead>
              <tbody>{ENGINES.map((e) => {
                const p = subjectShare(runs, qs, "person", person, company, ctx, ["expert", "leadership"], e.id), co = subjectShare(runs, qs, "company", company, company, ctx, ["vendor", "leadership"], e.id);
                const key = !!status?.searchKeys?.[e.id];
                return <tr key={e.id}><td><b>{e.name}</b><div className={s.small}>{key ? `${e.model} with web search` : "Add a key to run"}</div></td><td className={s.num}>{p.total ? `${p.named} of ${p.total}` : "–"}</td><td className={s.num}>{co.total ? `${co.named} of ${co.total}` : "–"}</td><td>{key ? <span className={cx(s.pill, s.pDark)}>Key saved</span> : <button className={cx(s.btn, s.sm, s.red)} onClick={onKeys}>Connect</button>}</td></tr>;
              })}</tbody>
            </table>
          </div>
          <div id="tour-activity" className={s.box}>
            <div className="flex items-center justify-between px-4 py-3"><span className="font-semibold">Recent activity</span><button className="text-[12.5px] font-semibold text-[#d64545]" onClick={() => onTab("Answers")}>All answers</button></div>
            {latest.length ? latest.map((r) => { const [t, pc] = outcome(r); const q = qs.find((x) => x.id === r.question_id); return (
              <button key={r.id} onClick={() => onOpenRun(r.id)} className="flex w-full items-start gap-3 border-t border-[#ececec] px-4 py-3 text-left hover:bg-[#fafafa]">
                <span className={cx(s.num, "w-[92px] shrink-0 pt-0.5 text-[11.5px] text-faint")}>{when(r.run_at)}</span>
                <span className="min-w-0 flex-1"><b>{engineLabel(r.engine)}</b> <span className={cx(s.small, "block truncate")}>{q?.question ?? ""}</span></span>
                <span className={cx(s.pill, pc)}>{t}</span>
              </button>
            ); }) : <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ececec] px-4 py-5"><span className={s.small}>Nothing has run yet.</span><span className="flex gap-2"><button className={cx(s.btn, s.sm)} onClick={onKeys}>Connect AI keys</button><button className={cx(s.btn, s.sm, s.red)} onClick={onRun}>Run prompts</button></span></div>}
          </div>
          {cards}
        </section>
        <aside className="flex min-w-0 flex-[2_1_320px] flex-col gap-4">
          <div id="tour-gapscard" className={cx(s.box, "p-4")} style={{ border: "2px solid #d64545" }}>
            <div className="flex items-center justify-between"><span className="font-semibold">Open gaps</span><span className={s.big} style={{ fontSize: 22, color: "#d64545" }}>{gaps.length}</span></div>
            <p className={s.small}>Prompts where a competitor is named and Shashi or Antier is not. Each one can become a topic in Content Studio.</p>
            {gaps.slice(0, 2).map((g) => <p key={g.question.id} className="mt-2 border-t border-[#ececec] pt-2 text-[13px]">{g.question.question}</p>)}
            <button className={cx(s.btn, s.sm, s.red, "mt-3")} onClick={() => onTab("Gaps")}>Review gaps</button>
          </div>
          <div id="tour-sources" className={cx(s.box, "p-4")}>
            <div className="font-semibold">Where answers come from</div>
            {mix.sum ? <>
              <div className="mt-2 flex h-2.5 overflow-hidden rounded-full">{mix.parts.map(([l, n, col]) => <span key={l} style={{ width: `${(n / mix.sum) * 100}%`, background: col }} />)}</div>
              <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-[#5f5f5f]">{mix.parts.map(([l, n, col]) => <span key={l} className="flex items-center gap-1.5"><span className={s.sw} style={{ background: col }} />{l} {Math.round((n / mix.sum) * 100)}%</span>)}</div>
              {mix.top.map(([d, n]) => <div key={d} className="mt-2 flex justify-between border-t border-[#ececec] pt-2 text-[13px]"><span className="truncate">{d}</span><span className={cx(s.num, "text-[#5f5f5f]")}>{n}</span></div>)}
            </> : <p className={s.small}>Sources appear after the first run.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ---------------- sending topics to Content Studio ----------------
type SentPost = { id: string; citation_question_id: string | null; title: string; channel: string };
function useSent() {
  const { ws } = useWorkspace();
  return useLive<SentPost>("posts", ws.id, { filter: (q) => q.not("citation_question_id", "is", null) });
}
async function sendGap(wsId: string, g: PromptGap) {
  const resource = `From AI citations. Prompt: "${g.question.question}". Named instead: ${g.rivals.join(", ")}. On: ${g.engines.map(engineLabel).join(", ")}.${g.channel === "company" ? " Company content, not for Shashi's profile." : ""}`;
  return supabase().from("posts").insert({ workspace_id: wsId, title: gapTopic(g), format: g.channel === "company" ? "Article" : "Text post", status: "Idea", topic: "AI citations", pillar: g.question.topic || "", resource, channel: g.channel, citation_question_id: g.question.id }).select("id").single();
}

function GapRows({ gaps, sent, editable }: { gaps: PromptGap[]; sent: SentPost[]; editable: boolean }) {
  const { ws } = useWorkspace();
  const toast = useToast();
  const isSent = (g: PromptGap) => sent.some((p) => p.citation_question_id === g.question.id);
  async function send(g: PromptGap) {
    const { data, error } = await sendGap(ws.id, g);
    if (error) { toast(error.message); return; }
    haptic(); toast("Sent to Content Studio. It is in Library and Plan as an idea.", async () => { await supabase().from("posts").delete().eq("id", data.id); });
  }
  if (!gaps.length) return <p className={cx(s.small, "p-6 text-center")}>No gaps right now. A gap appears when a tracked competitor is named on a prompt and Shashi or Antier is not.</p>;
  return <>{gaps.map((g) => (
    <div key={g.question.id} className="flex flex-wrap items-center gap-3 border-t border-[#ececec] px-4 py-4 first:border-0">
      <div className="min-w-[260px] flex-1">
        <div className="font-semibold">{g.question.question}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-[#5f5f5f]">Named instead: {g.rivals.map((r) => <span key={r} className={cx(s.pill, s.pDark)}>{r}</span>)} on {g.engines.map(engineLabel).join(", ")}</div>
        <div className={cx(s.small, "mt-1")}>Topic: <b className="text-[#141414]">{gapTopic(g)}</b> · {g.channel === "company" ? "Company content, not for Shashi's profile" : "For Shashi"}</div>
      </div>
      {editable && <button className={cx(s.btn, s.sm, !isSent(g) && s.red)} disabled={isSent(g)} onClick={() => send(g)}>{isSent(g) ? "Sent to Content Studio" : "Send to Content Studio"}</button>}
    </div>
  ))}</>;
}

export function Gaps({ c, editable, siteGaps }: { c: Ctx; editable: boolean; siteGaps: React.ReactNode }) {
  const { ws } = useWorkspace();
  const toast = useToast();
  const sent = useSent();
  const gaps = useMemo(() => promptGaps(c.runs, c.qs, c.person, c.company, c.experts, c.firms, c.ctx), [c]);
  const open = gaps.filter((g) => !sent.rows.some((p) => p.citation_question_id === g.question.id));
  async function sendAll() {
    const ids: string[] = [];
    for (const g of open) { const { data, error } = await sendGap(ws.id, g); if (error) { toast(error.message); break; } ids.push(data.id); }
    if (ids.length) { haptic(); toast(`${ids.length} topics sent to Content Studio`, async () => { await supabase().from("posts").delete().in("id", ids); }); }
  }
  return (
    <div className="flex flex-col gap-4">
      <div id="tour-gapshead" className={cx(s.box, "flex flex-wrap items-center justify-between gap-3 p-5")} style={{ border: "2px solid #d64545" }}>
        <div className="max-w-[640px]"><div className="text-[17px] font-semibold">{gaps.length} prompts where a competitor is named and Shashi or Antier is not</div><p className={s.small}>Each gap becomes a topic in Content Studio with the prompt, who is named instead and the AI tools, so the post answers what buyers are asking. Expert prompts go to Shashi; vendor prompts go as company content.</p></div>
        {editable && <button className={cx(s.btn, s.red)} disabled={!open.length} onClick={sendAll}>{open.length ? `Send all ${open.length} to Content Studio` : "All sent"}</button>}
      </div>
      <div className={s.box}><GapRows gaps={gaps} sent={sent.rows} editable={editable} /></div>
      {siteGaps}
    </div>
  );
}

// ---------------- company ----------------
export function Company({ c, editable, facts }: { c: Ctx; editable: boolean; facts: Partial<Facts> }) {
  const sent = useSent();
  const { runs, qs, person, company, ctx } = c;
  const C = useMemo(() => subjectShare(runs, qs, "company", company, company, ctx, ["vendor", "leadership"]), [runs, qs, company, ctx]);
  const trend = useMemo(() => weeklyTrend(runs, qs, person, company, c.rivals, ctx), [runs, qs, person, company, c.rivals, ctx]);
  const gaps = useMemo(() => promptGaps(runs, qs, person, company, c.experts, c.firms, ctx).filter((g) => g.channel === "company"), [runs, qs, person, company, c.experts, c.firms, ctx]);
  const firmRank = useMemo(() => !company ? 0 : [{ me: true, n: C.named }, ...c.firms.map((f) => ({ me: false, n: shareOfVoice(runs, qs, f, company).named }))].sort((a, b) => b.n - a.n).findIndex((x) => x.me) + 1, [runs, qs, company, c.firms, C.named]);
  const attributed = useMemo(() => person ? runs.filter((r) => r.status !== "failed" && detectPerson(r, person, company, ctx).attributed).length : 0, [runs, person, company, ctx]);
  const pages = useMemo(() => { const m = new Map<string, number>(); runs.forEach((r) => r.sources.forEach((x) => { if (company && owns(x.url, company.domains)) m.set(x.url, (m.get(x.url) ?? 0) + 1); })); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5); }, [runs, company]);
  const wrongFacts = useMemo(() => company ? runs.flatMap((r) => factIssues(r.answer, facts, company.aliases)).slice(0, 3) : [], [runs, facts, company]);
  const dir = sameDirection(trend.map((t) => t.person), trend.map((t) => t.company));
  if (!company) return <p className={cx(s.box, s.small, "p-6")}>Set up Antier as the company under Competitors to see the company view.</p>;
  return (
    <div className="flex flex-col gap-4">
      <div id="tour-company" className="flex flex-wrap gap-4">
        <section className={cx(s.panel, "min-w-0 flex-[2_1_320px] p-5")}>
          <div className={s.label} style={{ color: "#ff8a80" }}>Antier, the company</div>
          <div className="mt-2 flex items-baseline gap-2"><span className={s.big} style={{ fontSize: 40 }}>{C.named}</span><span className="text-[#cfcfcf]">of {C.total} vendor prompts name Antier</span></div>
          <div className="mt-3 flex flex-wrap gap-6 text-[13px]"><span><b className={cx(s.num, "block text-[20px]")}>{C.linked}</b>linked to its pages</span><span><b className={cx(s.num, "block text-[20px]")}>{c.firms.length ? `#${firmRank}` : "–"}</b>of {c.firms.length + 1} firms</span><span><b className={cx(s.num, "block text-[20px]")}>{attributed}</b>answers tie Shashi to Antier</span></div>
          <p className="mt-3 text-[13px] text-[#cfcfcf]">The company view supports Shashi&apos;s work. It checks that both move the same way: when buyers ask who builds the product, Antier should appear; when they ask who to listen to, Shashi should.</p>
        </section>
        <section className={cx(s.box, "min-w-0 flex-[3_1_520px] p-5")}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">Direction, last 8 weeks</span>{dir != null && <span className={cx(s.pill, dir ? s.pDark : s.pRed)}>{dir ? "Moving together" : "Moving apart"}</span>}</div>
          <TrendChart weeks={trend.map((t) => t.week)} aria="Shashi on expert prompts and Antier on vendor prompts, per week" series={[
            { key: "p", label: "Shashi, expert prompts", color: "#d64545", values: trend.map((t) => t.person) },
            { key: "c", label: "Antier, vendor prompts", color: "#141414", values: trend.map((t) => t.company) },
          ]} />
          <p className={s.small}>{dir == null ? "Needs at least two weeks of runs to show a direction." : dir ? "Both moved the same way over these weeks. The aim is for Shashi to lead and the company to follow." : "They are moving in different directions. Check that his posts tie him to Antier."}</p>
        </section>
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <section className={cx(s.box, "min-w-0 flex-[3_1_520px]")} style={{ border: "2px solid #141414" }}>
          <div className="px-4 py-3"><div className="font-semibold">Company gaps</div><p className={s.small}>Vendor prompts where a peer firm is named and Antier is not. These go to Content Studio as company content, never as Shashi&apos;s posts.</p></div>
          <GapRows gaps={gaps} sent={sent.rows} editable={editable} />
        </section>
        <aside className="flex min-w-0 flex-[2_1_300px] flex-col gap-4">
          <div className={cx(s.box, "p-4")}><div className="font-semibold">Company pages AI cites</div>{pages.length ? pages.map(([u, n]) => <div key={u} className="mt-2 flex justify-between gap-2 border-t border-[#ececec] pt-2 text-[13px]"><span className="truncate">{u.replace(/^https?:\/\/(www\.)?/, "")}</span><span className={cx(s.num, "text-[#5f5f5f]")}>{n}</span></div>) : <p className={s.small}>No Antier page cited yet.</p>}</div>
          <div className={cx(s.box, "p-4")}><div className="font-semibold">Company consistency</div>
            {!facts.company && !facts.founded ? <p className={s.small}>Add Antier&apos;s facts on the facts sheet (Antier tab) to check answers against them.</p>
              : wrongFacts.length ? wrongFacts.map((w, i) => <p key={i} className="mt-2 text-[13px]"><span className={cx(s.pill, s.pRed)}>Wrong</span> <b>{w.fact}</b><span className={cx(s.small, "block")}>It said: {w.said}</span></p>) : <p className="mt-1 text-[13px]">No answer contradicts the Antier facts.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ---------------- keywords ----------------
export function KeywordsPanel({ c, value, onPick }: { c: Ctx; value: string; onPick: (k: string) => void }) {
  const stats = useMemo(() => keywordStats(c.runs, c.qs, c.person, c.company, c.ctx), [c]);
  return (
    <div id="tour-keywords" className={s.box}>
      <div className="px-4 py-3"><div className="font-semibold">Keywords</div><p className={s.small}>Named in how many of the prompts that use each keyword. Click one to filter.</p></div>
      {stats.length ? stats.map((k) => (
        <button key={k.keyword} onClick={() => onPick(value === k.keyword ? "" : k.keyword)} className="flex w-full items-center justify-between gap-3 border-t border-[#ececec] px-4 py-2.5 text-left text-[13px] hover:bg-[#fafafa]" style={value === k.keyword ? { boxShadow: "inset 3px 0 0 #d64545", background: "#fafafa" } : undefined}>
          <b>{k.keyword}</b><span className={cx(s.num, "text-[#5f5f5f]")}>{k.named} of {k.prompts}</span>
        </button>
      )) : <p className={cx(s.small, "border-t border-[#ececec] px-4 py-4")}>Add keywords to prompts to track them here.</p>}
    </div>
  );
}

// ---------------- weekly report ----------------
export function buildWeekReport(c: Ctx, week: string, profile: string, facts: Partial<Facts>): PdfDoc {
  const { qs, person, company, selfAll, rivals, ctx } = c;
  const now = runsInWeek(c.runs, week), prev = runsInWeek(c.runs, shiftWeek(week, -1));
  const P = subjectShare(now, qs, "person", person, company, ctx, ["expert", "leadership"]), Pp = subjectShare(prev, qs, "person", person, company, ctx, ["expert", "leadership"]);
  const C = subjectShare(now, qs, "company", company, company, ctx, ["vendor", "leadership"]), Cp = subjectShare(prev, qs, "company", company, company, ctx, ["vendor", "leadership"]);
  const gaps = promptGaps(now, qs, person, company, c.experts, c.firms, ctx);
  const ch = (a: number, b: number) => (a - b > 0 ? `+${a - b}` : String(a - b));
  const failed = now.filter((r) => r.status === "failed").length;
  const qName = (q: Question) => (/[^\x00-\xFF]/.test(q.question) ? `${q.topic || "Prompt"} (${q.language})` : q.question);
  const cell = (q: Question, e: Engine) => { const b = latestBatches(now).get(`${q.id}|${e}`); if (!b) return "-"; const u = b.now.filter((r) => r.status !== "failed"); if (!u.length) return "Failed"; if (person && audienceOf(q) !== "vendor" && u.some((r) => detectPerson(r, person, company, ctx).named)) return "Shashi"; if (company && aggregate(u, company)?.named) return "Antier"; return "Not named"; };
  const usedEngines = ENGINES.filter((e) => now.some((r) => r.engine === e.id));
  const board = [{ name: "Shashi and Antier", n: shareOfVoice(now, qs, selfAll, selfAll).named, p: shareOfVoice(prev, qs, selfAll, selfAll).named }, ...rivals.map((r) => ({ name: r.name, n: shareOfVoice(now, qs, r, selfAll).named, p: shareOfVoice(prev, qs, r, selfAll).named }))].sort((a, b) => b.n - a.n);
  const sitesGap = citationGaps(now, selfAll, rivals).slice(0, 6);
  const li = person ? linkedinCited(now, person).length : 0;
  const issues = company ? now.flatMap((r) => [...(r.fact_issues ?? []), ...factIssues(r.answer, facts, company.aliases)]) : [];
  const ch2 = changes(c.runs.filter((r) => r.run_at <= week + "T99"), selfAll).filter((x) => x.at.slice(0, 10) >= week).length;
  const label = `Week of ${shortDate(week)}`;
  const sections: PdfSection[] = [
    { title: "Executive summary", lead: `Shashi was named in ${P.named} of ${P.total} expert prompts (${ch(P.named, Pp.named)} on the week before). Antier was named in ${C.named} of ${C.total} vendor prompts (${ch(C.named, Cp.named)}). ${gaps.length} gaps are open.`,
      findings: [gaps[0] ? `Largest gap: "${qName(gaps[0].question)}". Named instead: ${gaps[0].rivals.join(", ")}.` : "No open gaps this week.", P.review ? `${P.review} answers name a "Shashi Pal" without context and need review.` : "Every full-name match had clear context.", failed ? `${failed} runs failed and are not counted as misses.` : "Every run completed.", `${ch2} prompts changed state against the run before.`] },
    { title: "Scorecard", lead: "Week-on-week movement. Counts come before percentages.", tables: [{ head: ["Measure", "This week", "Week before", "Change"], widths: [.46, .18, .18, .18], rows: [
      ["Shashi named, expert prompts", `${P.named} of ${P.total}`, `${Pp.named} of ${Pp.total}`, ch(P.named, Pp.named)],
      ["Antier named, vendor prompts", `${C.named} of ${C.total}`, `${Cp.named} of ${Cp.total}`, ch(C.named, Cp.named)],
      ["Linked to Antier pages", String(C.linked), String(Cp.linked), ch(C.linked, Cp.linked)],
      ["Open gaps", String(gaps.length), String(promptGaps(prev, qs, person, company, c.experts, c.firms, ctx).length), ""],
      ["Runs, failed", `${now.length}, ${failed}`, `${prev.length}, ${prev.filter((r) => r.status === "failed").length}`, ""],
    ] }] },
    { title: "Results by AI tool", tables: [{ head: ["AI tool", "Shashi", "Antier", "Runs", "Failed"], widths: [.24, .2, .2, .18, .18], rows: usedEngines.map((e) => { const p = subjectShare(now, qs, "person", person, company, ctx, ["expert", "leadership"], e.id), co = subjectShare(now, qs, "company", company, company, ctx, ["vendor", "leadership"], e.id); const er = now.filter((r) => r.engine === e.id); return [e.name, `${p.named} of ${p.total}`, `${co.named} of ${co.total}`, String(er.length), String(er.filter((r) => r.status === "failed").length)]; }) }] },
    { title: "Gaps, in priority order", lead: "Ranked by how many AI tools name a rival on the prompt.", tables: [{ head: ["Prompt", "Named instead", "For", "AI tools"], widths: [.44, .24, .14, .18], rows: gaps.map((g) => [qName(g.question), g.rivals.join(", "), g.channel === "company" ? "Antier" : "Shashi", g.engines.map(engineLabel).join(", ")]) }] },
    { title: "Competitive position", lead: "Share of voice on the same prompts; branded prompts left out.", tables: [{ head: ["Name", "Named", "Week before", "Change"], widths: [.46, .18, .18, .18], rows: board.map((b) => [b.name, String(b.n), String(b.p), ch(b.n, b.p)]) }] },
    { title: "Sources the AI relies on", paras: [`His LinkedIn was cited ${li} times this week.`], tables: sitesGap.length ? [{ caption: "Sites that cite competitors and never Antier", head: ["Site", "Answers", "Names instead"], widths: [.4, .16, .44], rows: sitesGap.map((g) => [g.domain, String(g.runs), g.competitors.join(", ")]) }] : [] },
    { title: "Accuracy and tone", paras: [issues.length ? `Wrong facts found: ${issues.length}. First: ${issues[0].fact}, where the answer said "${issues[0].said.slice(0, 160)}".` : "No answer contradicted the facts sheet.", `Tone among answers naming him: ${["positive", "neutral", "negative"].map((t) => `${now.filter((r) => r.sentiment === t).length} ${t}`).join(", ")}.`] },
    { title: "Results by audience", lead: "Expert prompts score Shashi, vendor prompts score Antier, leadership prompts score both.", tables: [{ head: ["Audience", "Prompts run", "Shashi named", "Antier named"], widths: [.31, .23, .23, .23], rows: (["expert", "vendor", "leadership"] as const).map((a) => { const p = subjectShare(now, qs, "person", person, company, ctx, [a]), co = subjectShare(now, qs, "company", company, company, ctx, [a]); return [AUDIENCE_LABEL[a], String(Math.max(p.total, co.total)), a === "vendor" ? "-" : `${p.named} of ${p.total}`, a === "expert" ? "-" : `${co.named} of ${co.total}`]; }) }] },
    { title: "Company view", lead: `Antier named in ${C.named} of ${C.total} vendor prompts, linked in ${C.linked}.` },
    { title: "Next moves", lead: "From this week's gaps and sources.", findings: recommend(now, qs, selfAll, rivals).slice(0, 5).map((r) => `${r.title}. ${r.detail}`).concat(gaps.length ? [] : ["No gap this week; keep the weekly run going."]) },
    { title: "Appendix: every prompt", tables: [{ head: ["Prompt", "For", ...usedEngines.map((e) => engineLabel(e.id))], widths: [.42, .14, ...usedEngines.map(() => .44 / Math.max(1, usedEngines.length))], rows: qs.filter((q) => q.status === "active").map((q) => [qName(q), AUDIENCE_LABEL[audienceOf(q)], ...usedEngines.map((e) => cell(q, e.id))]) }] },
    { title: "Method and data quality", paras: ["Each prompt is asked through each AI tool's API with web search on, from the user's browser with their own keys. Answers and sources are stored; keys are not.", "Shashi counts as named only by his full name next to context (Antier, his role or one of his topics); other matches wait for review. Branded prompts are left out of scores. Failed runs are not counted as misses. Repeats use the majority answer.", `This week: ${now.length} runs, ${now.length - failed} completed. Results reflect API answers with web search, which can differ from the consumer apps.`] },
  ];
  return { kicker: "AI CITATIONS REPORT", title: "Shashi Pal and Antier in AI answers", subtitle: `${label}. How often AI tools name, link and rank Shashi and Antier when buyers ask, and what to do next.`, coverMeta: [["PREPARED FOR", `${profile}`], ["PERIOD", label], ["RUNS", `${now.length} runs on ${usedEngines.length} AI tools`], ["METHOD", "API with web search, user keys, branded prompts excluded"]], footer: `Prax - AI citations report - ${label} - Confidential`, coverNote: "Confidential. Prepared from API answers with web search, run from the user's browser with their own keys.", sections };
}

export function Report({ c, onShare, facts }: { c: Ctx; onShare: () => void; facts: Partial<Facts> }) {
  const { ws } = useWorkspace();
  const weeks = useMemo(() => runWeeks(c.runs), [c.runs]);
  const [week, setWeek] = useState<string>("");
  const wk = week || weeks[0];
  const doc = useMemo(() => (wk ? buildWeekReport(c, wk, ws.name, facts) : null), [c, wk, ws.name, facts]);
  if (!wk || !doc) return <p className={cx(s.box, s.small, "p-6 text-center")}>The first weekly report appears after the first run. A new one is made each week you run your prompts.</p>;
  const file = `ai-citations-week-of-${wk}`;
  const csv = () => { const rows = [["Section", "Item", "Value"], ...doc.sections.flatMap((sc) => (sc.tables ?? []).flatMap((t) => t.rows.map((r) => [sc.title, r[0], r.slice(1).join(" | ")])))]; return rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n"); };
  return (
    <div className="flex flex-wrap items-start gap-4">
      <aside className="flex w-full max-w-[260px] flex-col gap-2">
        <div className={s.label}>Weekly reports</div>
        {weeks.map((w, i) => <button key={w} onClick={() => setWeek(w)} className={cx(s.box, "px-3.5 py-3 text-left")} style={w === wk ? { border: "2px solid #d64545" } : undefined}><b className="block text-[13.5px]">Week of {shortDate(w)}</b><span className={s.small}>{i === 0 ? "Latest" : "Archived"}</span></button>)}
        <p className={s.small}>One report for each week your prompts were run. Today reminds you to run them weekly.</p>
      </aside>
      <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-3">
        <div className="flex flex-wrap justify-end gap-2">
          <button className={s.btn} onClick={onShare}>Share link</button>
          <button className={s.btn} onClick={() => downloadFile(`${file}.csv`, csv(), "text/csv")}>Download data (CSV)</button>
          <button className={cx(s.btn, s.red)} onClick={() => downloadFile(`${file}.pdf`, buildPdf(doc), "application/pdf")}>Download PDF</button>
        </div>
        <article className={s.report}>
          <div className={s.reportCover}>
            <div className={s.label} style={{ color: "#d64545" }}>AI citations report</div>
            <h2 className="mt-1 text-[28px] font-semibold leading-tight tracking-tight">{doc.title}</h2>
            <p className="mt-1 text-[#5f5f5f]">{doc.subtitle}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#ececec] pt-4 text-[12.5px] md:grid-cols-4">{doc.coverMeta.map(([k, v]) => <span key={k}><span className="block text-[12px] font-semibold text-faint">{k}</span>{v}</span>)}</div>
          </div>
          <div className="border-y border-[#ececec] bg-[#fafafa] px-11 py-4"><div className={s.label}>Contents</div><div className="mt-2 grid gap-x-6 gap-y-1 text-[13px] md:grid-cols-2">{doc.sections.map((sc, i) => <span key={sc.title}><b className={s.num} style={{ color: "#d64545" }}>{i + 1}.</b> {sc.title}</span>)}</div></div>
          <div className="px-11 pb-10">{doc.sections.map((sc, i) => (
            <section key={sc.title} className="flex flex-col gap-2.5 pt-7">
              <span className="h-[3px] w-7 bg-[#d64545]" />
              <h3 className="text-[18px] font-semibold"><span className={s.num} style={{ color: "#d64545" }}>{i + 1}.</span> {sc.title}</h3>
              {sc.lead && <p className="text-[14.5px] text-[#333]">{sc.lead}</p>}
              {sc.findings?.map((f) => <div key={f} className={s.finding}>{f}</div>)}
              {sc.paras?.map((p) => <p key={p} className="text-[13.5px]">{p}</p>)}
              {sc.tables?.map((t, k) => (
                <div key={k} className="overflow-x-auto">
                  {t.caption && <div className={cx(s.small, "mb-1 font-semibold")}>{t.caption}</div>}
                  <table className={s.table}><thead><tr>{t.head.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{t.rows.length ? t.rows.map((r, j) => <tr key={j}>{r.map((x, m) => <td key={m}>{x}</td>)}</tr>) : <tr><td colSpan={t.head.length} className={s.small}>Nothing this week.</td></tr>}</tbody></table>
                </div>
              ))}
            </section>
          ))}</div>
        </article>
      </section>
    </div>
  );
}

// ---------------- guided tour ----------------
export const TOUR: { tab: string; id: string; title: string; body: string }[] = [
  { tab: "Home", id: "tour-kpis", title: "The four numbers that matter", body: "Shashi on expert prompts, Antier on vendor prompts, his standing against competitors, and the open gaps." },
  { tab: "Home", id: "tour-trend", title: "The trend", body: "Eight weeks per AI tool against the competitor median. Hover or click a week to read its values." },
  { tab: "Home", id: "tour-standing", title: "Standing", body: "His rank among the names you track. The full leaderboard is one click away." },
  { tab: "Home", id: "tour-engines", title: "Each AI tool and its key", body: "Results per AI tool, and whether its key is saved in this browser. Connect any that are missing." },
  { tab: "Home", id: "tour-activity", title: "Recent activity", body: "What the latest runs found. Click a line to read the full answer." },
  { tab: "Home", id: "tour-gapscard", title: "Open gaps", body: "Prompts where a competitor is named and Shashi or Antier is not. New content pays off most here." },
  { tab: "Home", id: "tour-sources", title: "Where answers come from", body: "The mix of sources behind the answers, and the sites cited most." },
  { tab: "Gaps", id: "tour-gapshead", title: "Gaps become topics", body: "Send a gap to Content Studio as a topic, one at a time or all at once. Vendor gaps go as company content." },
  { tab: "Prompts", id: "tour-keywords", title: "Prompts and keywords", body: "Every prompt the AI tools are asked, who it is for, and the keywords it tracks. Click a keyword to filter." },
  { tab: "Answers", id: "tour-answers", title: "Every answer", body: "Prompt by AI tool. Open an answer to see the highlighted names, its sources, tone, facts and any match that needs review." },
  { tab: "Sources", id: "tour-sourcestab", title: "Sources and comment targets", body: "Which of his LinkedIn posts AI cites, and the people it quotes on his topics." },
  { tab: "Competitors", id: "tour-competitors", title: "Competitors", body: "Peer experts for Shashi and peer firms for Antier, kept in separate pools." },
  { tab: "Actions", id: "tour-actions", title: "Actions", body: "What to publish and where to be mentioned, with the before and after once it runs." },
  { tab: "Company", id: "tour-company", title: "The company view", body: "A short view of Antier, and whether Shashi and Antier are moving the same way." },
  { tab: "Home", id: "tour-run", title: "Run, Ask and the facts sheet", body: "Run your prompts with your own keys, ask your data in plain words, and keep the facts sheet true. That is the tour." },
];
export function Tour({ step, done, onStep, onClose }: { step: number; done: number; onStep: (i: number, markDone: boolean) => void; onClose: () => void }) {
  const t = TOUR[step];
  useEffect(() => {
    const el = document.getElementById(t.id);
    if (!el) return;
    el.classList.add(s.tourFocus);
    const timer = setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    return () => { clearTimeout(timer); el.classList.remove(s.tourFocus); };
  }, [t.id]);
  return (
    <>
      <div className={s.tourScrim} />
      <div className={s.tourCard} role="dialog" aria-label="Guided tour">
        <div className="flex items-center justify-between gap-2"><span className="text-[12px] font-semibold text-[#ff8a80]">Step {step + 1} of {TOUR.length} · {done} completed</span><button className="text-[12.5px] font-semibold text-[#cfcfcf]" onClick={onClose}>Skip tour</button></div>
        <span className="block h-1 overflow-hidden rounded-full bg-white/15"><span className="block h-full bg-[#d64545] transition-all" style={{ width: `${Math.round((done / TOUR.length) * 100)}%` }} /></span>
        <span className="text-[16px] font-semibold">{t.title}</span>
        <span className="text-[13px] leading-relaxed text-[#d6d6d6]">{t.body}</span>
        <div className="mt-1 flex items-center gap-2">
          <button className={s.ghostDark} disabled={!step} onClick={() => onStep(step - 1, false)}>Back</button>
          <button className={s.ghostDark} onClick={() => onStep(step + 1, false)}>Skip step</button>
          <button className={cx(s.btn, s.sm, s.red, "ml-auto")} onClick={() => onStep(step + 1, true)}>{step === TOUR.length - 1 ? "Finish" : "Next"}</button>
        </div>
      </div>
    </>
  );
}
