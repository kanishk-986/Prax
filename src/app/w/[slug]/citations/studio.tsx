"use client";
// The AI citations studio: keys, the first run, Home, gaps, the company view, the weekly report, keywords and the
// guided tour. Everything is computed from stored runs; nothing here is sample data. Names in copy come from the
// tracked profile (who()), never hard-coded.
import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useWorkspace } from "@/lib/workspace";
import { possessive } from "@/lib/persona";
import { useToast, haptic } from "@/components/toaster";
import { useExtension } from "@/lib/bridge";
import { useCitationScope } from "@/lib/citation-profile";
import { KpiTiles } from "@/components/shell";
import { ProviderMark, ProviderLogo, KeyRow, useProviderUsage } from "@/components/provider-mark";
import { providerName, providerOf, MARKS } from "@/lib/providers";
import { buildPdf, downloadFile, type PdfDoc, type PdfMark, type PdfSection } from "@/lib/pdf";
import {
  ENGINES, isSerp, keySlot, scored, latestBatches, aggregate, shareOfVoice, citationGaps, owns, linkedinCited, changes, factIssues, recommend,
  subjectShare, detectPerson, weeklyTrend, sameDirection, promptGaps, gapTopic, keywordStats, runWeeks, runsInWeek, shiftWeek, audienceOf, AUDIENCE_LABEL, postProfile,
  type Engine, type Entity, type Run, type Question, type Facts, type PromptGap,
} from "@/lib/citations";
import { Card, Empty, Status, TrackedNames, usePeerSuggestions, cx, who, type EntRow } from "./ui";
import s from "./citations.module.css";

const shortDate = (iso: string) => new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const when = (t: string) => new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const engineLabel = (e: string) => providerName(e, true);
const keyName = (e: string) => (isSerp(e) ? "SerpApi" : providerName(e));
export type Ctx = { runs: Run[]; qs: Question[]; person?: Entity; company?: Entity; selfAll: Entity; rivals: Entity[]; experts: Entity[]; firms: Entity[]; ctx: string[] };
const names = (c: Pick<Ctx, "person" | "company">) => who(c.person, c.company);

// ---------------- keys ----------------
export function KeysModal({ onClose }: { onClose: () => void }) {
  const { status, send } = useExtension();
  const toast = useToast();
  const usage = useProviderUsage();
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  async function save(e: Engine, key: string) {
    try { await send("settings", { searchKey: { provider: keySlot(e), key } }); haptic(); toast(`${keyName(e)} key saved in this browser`); } catch (err) { toast((err as Error).message); throw err; }
  }
  async function remove(e: Engine) {
    try { await send("settings", { clearSearchKey: keySlot(e) }); haptic(); toast(`${keyName(e)} key removed from this browser`); } catch (err) { toast((err as Error).message); throw err; }
  }
  return (
    <div className={s.center} onMouseDown={onClose}>
      <div className={cx(s.dialog, "max-h-[calc(100dvh-32px)] max-w-[640px] overflow-y-auto p-0")} role="dialog" aria-modal="true" aria-label="AI keys" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-6 pb-4 pt-5">
          <div><h2 className="text-[17px] font-semibold">AI keys</h2><p className={cx(s.small, "mt-0.5")}>Saved only in this browser. Sent only to that provider, or to SerpApi for Google AI answers and Copilot.</p></div>
          <button className={cx(s.btn, s.ghost, s.sm, "w-7 px-0")} onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>
        {status && !status.installed ? <p className="border-t border-[#ececec] px-6 py-4 text-[13.5px] text-[#9e1c1c]">Install the Prax extension from the Extension page first.</p> : (
          <div className="@container border-t border-[#ececec]">{ENGINES.map((e) => {
            const u = usage.of(e.id), extra = !!status?.extraKeys?.includes(keySlot(e.id));
            return <KeyRow key={e.id} id={e.id} connected={!!status?.searchKeys?.[e.id]} model={u.lastModel || e.model} usage={u} disabled={!status?.installed}
              note={e.via ? "Through SerpApi" : status?.searchKeys?.[e.id] && !extra ? "Uses your drafting key" : undefined} removable={extra} onSave={(k) => save(e.id, k)} onRemove={() => remove(e.id)} />;
          })}</div>
        )}
        <div className="flex justify-end gap-2 border-t border-[#ececec] px-6 py-4"><button className={s.btn} onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}

// ---------------- chart ----------------
type Series = { key: string; label: string; color: string; dash?: boolean; values: (number | null)[]; unit?: string };
/** How many weeks have a value on any series. A line needs two. */
export const weeksWithData = (series: Series[]) => series[0] ? series[0].values.filter((_, i) => series.some((x) => x.values[i] != null)).length : 0;
export function TrendChart({ weeks, series, aria }: { weeks: string[]; series: Series[]; aria: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((x) => x.values).filter((v): v is number => v != null);
  const max = Math.max(4, ...all);
  const px = (i: number) => 34 + i * (596 / Math.max(1, weeks.length - 1)), py = (v: number) => 172 - (v / max) * 156, hw = 596 / Math.max(1, weeks.length - 1);
  const pts = (vals: (number | null)[]) => vals.map((v, i) => (v == null ? null : `${px(i).toFixed(0)},${py(v).toFixed(0)}`)).filter(Boolean).join(" ");
  const ticks = [0, Math.round(max / 2), max];
  const left = hover != null && hover > weeks.length / 2;
  return (
    <div className={s.chartWrap} onMouseLeave={() => setHover(null)}>
      <svg viewBox="0 0 640 196" width="100%" role="img" aria-label={aria} className="block overflow-visible">
        {ticks.map((t) => <g key={t}><line x1="34" x2="630" y1={py(t)} y2={py(t)} stroke={t ? "#f1f1f1" : "#dcdcdc"} /><text x="26" y={py(t) + 4} textAnchor="end" fontSize="11" fill="#6b6b6b" style={{ fontVariantNumeric: "tabular-nums" }}>{t}</text></g>)}
        {hover != null && <line x1={px(hover)} x2={px(hover)} y1="12" y2="172" stroke="#b5b5b5" strokeDasharray="3 3" />}
        {series.map((x) => <polyline key={x.key} points={pts(x.values)} fill="none" stroke={x.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={x.dash ? "4 4" : undefined} />)}
        {series.map((x) => x.values.map((v, i) => v != null && <circle key={x.key + i} cx={px(i)} cy={py(v)} r={hover === i ? 4 : 2.5} fill={hover === i ? "#fff" : x.color} stroke={x.color} strokeWidth="2" />))}
        {weeks.map((w, i) => <text key={w} x={px(i)} y="192" textAnchor="middle" fontSize="11" fill={hover === i ? "#141414" : "#6b6b6b"} fontWeight={hover === i ? 600 : 400}>{shortDate(w)}</text>)}
        {weeks.map((w, i) => <rect key={w} x={px(i) - hw / 2} y="8" width={hw} height="172" fill="transparent" style={{ cursor: "pointer" }} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />)}
      </svg>
      {hover != null && (
        <div className={s.tip} role="status" style={left ? { right: `${100 - (px(hover) / 640) * 100 + 3}%` } : { left: `${(px(hover) / 640) * 100 + 2}%` }}>
          <b>Week of {shortDate(weeks[hover])}</b>
          {series.map((x) => <span key={x.key} className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5"><span className={s.sw} style={{ background: x.color }} />{x.label}</span><b className={s.tnum}>{x.values[hover] == null ? "No run" : `${x.values[hover]}${x.unit ?? ""}`}</b></span>)}
        </div>
      )}
    </div>
  );
}
function Legend({ series }: { series: Series[] }) {
  return <div className={s.legend}>{series.map((l) => <span key={l.key} className="flex items-center gap-1.5"><span style={{ width: 14, borderTop: `2px ${l.dash ? "dashed" : "solid"} ${l.color}` }} />{l.label}</span>)}</div>;
}

// ---------------- first run ----------------
/** Before anything has run: a short checklist with the next step's button, and what will be compared. */
export function FirstRun({ c, keys, editable, onKeys, onRun, onTab }: { c: Ctx; keys: number; editable: boolean; onKeys: () => void; onRun: () => void; onTab: (t: string) => void }) {
  const w = names(c);
  const active = c.qs.filter((q) => q.status === "active"), sug = c.qs.filter((q) => q.status === "suggested").length;
  const steps: { title: string; sub: string; done: boolean; act?: React.ReactNode }[] = [
    { title: `Tracking ${w.person} and ${w.company}`, sub: "Names and sites the answers are checked for.", done: true, act: <button className={s.link} onClick={() => onTab("Competitors")}>Edit</button> },
    { title: active.length ? `${active.length} prompts ready` : "Approve your prompts", sub: active.length ? "Asked as written, with web search on." : sug ? `${sug} suggested prompts are waiting.` : "Draft buyer prompts or write your own.", done: !!active.length,
      act: !active.length ? <button className={cx(s.btn, s.sm)} onClick={() => onTab("Prompts")}>Review prompts</button> : <button className={s.link} onClick={() => onTab("Prompts")}>View</button> },
    { title: keys ? `${keys} AI tool${keys > 1 ? "s" : ""} connected` : "Connect an AI key", sub: "Keys stay in this browser.", done: keys > 0, act: <button className={cx(keys ? s.link : cx(s.btn, s.sm))} onClick={onKeys}>{keys ? "Manage" : "Connect AI keys"}</button> },
    { title: "Run your prompts", sub: "Results fill every tab.", done: false, act: editable && active.length && keys ? <button className={cx(s.btn, s.sm)} onClick={onRun}>Run prompts</button> : undefined },
  ];
  const now = steps.findIndex((x) => !x.done);
  const by = (a: string) => active.filter((q) => audienceOf(q) === a).length;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <Card id="tour-kpis" title="Get your first results" meta={`${steps.filter((x) => x.done).length} of ${steps.length} done`}>
        <ol className={cx(s.rows, s.rowsTop)}>{steps.map((x, i) => (
          <li key={x.title} className={s.step}>
            <span className={cx(s.stepMark, x.done && s.stepDone, i === now && s.stepNow)} aria-hidden>{x.done ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
            <span className="min-w-0 flex-1"><span className={cx("block text-[13.5px] font-semibold", !x.done && i !== now && "text-[#5f5f5f]")}>{x.title}</span><span className={s.small}>{x.sub}</span></span>
            {(x.done || i === now) && x.act}
          </li>
        ))}</ol>
      </Card>
      <div className="grid gap-4">
        <Card title="Prompts" meta={`${active.length} active`} action={<button className={s.link} onClick={() => onTab("Prompts")}>Open</button>}>
          <div className={cx(s.rows, s.rowsTop)}>{(["expert", "vendor", "leadership"] as const).map((a) => (
            <div key={a} className={cx(s.row, "py-2.5")}><span className="flex-1 text-[13px]">{AUDIENCE_LABEL[a]} <span className={s.small}>scores {a === "expert" ? w.first : a === "vendor" ? w.company : "both"}</span></span><span className={cx(s.tnum, "text-[13px] font-semibold", !by(a) && s.none)}>{by(a) || "None"}</span></div>
          ))}</div>
        </Card>
        <Card title="Compared with" action={<button className={s.link} onClick={() => onTab("Competitors")}>Manage</button>}>
          <div className={cx(s.rows, s.rowsTop)}>
            {[["Peer firms", c.firms], ["Peer experts", c.experts]].map(([l, xs]) => (
              <div key={l as string} className={cx(s.row, "py-2.5")}><span className="w-28 shrink-0 text-[13px]">{l as string}</span><span className={cx("min-w-0 flex-1 truncate text-right text-[13px]", !(xs as Entity[]).length && s.none)}>{(xs as Entity[]).map((e) => e.name).join(", ") || "None"}</span></div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------------- home ----------------
const ENGINE_COLOR: Record<string, string> = { openai: "#141414", gemini: "#9a9a9a", claude: "#d64545", perplexity: "#9e1c1c", google_ai: "#5f5f5f", copilot: "#c9c9c9" };
export function Home({ c, keys, onTab, onOpenRun, onKeys, slots }: { c: Ctx; keys: Record<string, boolean>; onTab: (t: string) => void; onOpenRun: (id: string) => void; onKeys: () => void; slots: { alerts: React.ReactNode; moves: React.ReactNode; profile: React.ReactNode } }) {
  const { runs, qs, person, company, selfAll, rivals, ctx } = c;
  const w = names(c);
  const P = useMemo(() => subjectShare(runs, qs, "person", person, company, ctx, ["expert", "leadership"]), [runs, qs, person, company, ctx]);
  const C = useMemo(() => subjectShare(runs, qs, "company", company, company, ctx, ["vendor", "leadership"]), [runs, qs, company, ctx]);
  const trend = useMemo(() => weeklyTrend(runs, qs, person, company, rivals, ctx), [runs, qs, person, company, rivals, ctx]);
  const gaps = useMemo(() => promptGaps(runs, qs, person, company, c.experts, c.firms, ctx), [runs, qs, person, company, c.experts, c.firms, ctx]);
  const board = useMemo(() => [{ name: `${w.first} and ${w.company}`, me: true, n: shareOfVoice(runs, qs, selfAll, selfAll).named }, ...rivals.map((r) => ({ name: r.name, me: false, n: shareOfVoice(runs, qs, r, selfAll).named }))].sort((a, b) => b.n - a.n), [runs, qs, selfAll, rivals, w.first, w.company]);
  const rank = board.findIndex((b) => b.me) + 1;
  const top = Math.max(1, ...board.map((b) => b.n));
  const latest = runs.slice(0, 6);
  const mix = useMemo(() => {
    const m = { third: 0, rival: 0, owned: 0, li: 0 }, sites = new Map<string, number>();
    const rivalDomains = rivals.flatMap((r) => r.domains), liDomains = (person?.domains ?? []).filter((d) => /linkedin\.com/i.test(d));
    latestBatches(runs).forEach(({ now }) => now.forEach((r) => r.sources.forEach((x) => {
      if (owns(x.url, liDomains)) m.li++; else if (owns(x.url, [...(company?.domains ?? []), ...(person?.domains ?? [])])) m.owned++; else if (owns(x.url, rivalDomains)) m.rival++; else m.third++;
      if (x.domain) sites.set(x.domain, (sites.get(x.domain) ?? 0) + 1);
    })));
    const sum = m.third + m.rival + m.owned + m.li;
    return { parts: ([["Third party", m.third, "#141414"], ["Peers", m.rival, "#bdbdbd"], [`${w.company} sites`, m.owned, "#d64545"], [`${w.first} on LinkedIn`, m.li, "#9e1c1c"]] as [string, number, string][]).filter((p) => p[1] > 0), sum, top: [...sites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4) };
  }, [runs, rivals, person, company, w.company, w.first]);
  const outcome = (r: Run): [string, "red" | "ink" | "ring" | "grey"] => {
    if (r.status === "failed") return ["Failed", "grey"];
    if (r.status === "no_answer") return ["No AI answer", "grey"];
    const p = person ? detectPerson(r, person, company, ctx) : null;
    if (p?.named) return [`${w.first} named`, "red"];
    if (company && aggregate([r], company)?.named) return [`${w.company} named`, "ink"];
    if (p?.review) return ["Needs review", "ring"];
    return ["Not named", "grey"];
  };
  const lines: Series[] = [
    ...ENGINES.map((e) => ({ key: e.id, label: engineLabel(e.id), color: ENGINE_COLOR[e.id], values: trend.map((t) => t.engines[e.id] ?? null) })),
    { key: "median", label: "Peer median", color: "#bdbdbd", dash: true, values: trend.map((t) => t.median) },
  ].filter((x) => x.values.some((v) => v != null));
  const enough = weeksWithData(lines) >= 2;
  return (
    <div className="flex flex-col gap-4">
      <div id="tour-kpis"><KpiTiles items={[
        { label: `${w.first} named`, value: P.total ? P.named : "None", of: P.total ? `of ${P.total}` : undefined, sub: P.review ? `${P.review} to review` : "Expert prompts", onClick: () => onTab("Answers") },
        { label: `${w.company} named`, value: C.total ? C.named : "None", of: C.total ? `of ${C.total}` : undefined, sub: C.total ? `Linked in ${C.linked}` : "Vendor prompts", onClick: () => onTab("Company") },
        { label: "Rank", value: rivals.length ? `#${rank}` : "None", of: rivals.length ? `of ${board.length}` : undefined, sub: rivals.length ? "Share of voice" : "Add peers to rank", onClick: () => onTab("Competitors") },
        { label: "Open gaps", value: gaps.length, sub: "Peer named, you not", onClick: () => onTab("Gaps") },
      ]} /></div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card id="tour-trend" title="Named per AI tool" meta="Last 8 weeks">
            {enough ? <div className="grid gap-3 px-[18px] pb-[18px]"><TrendChart weeks={trend.map((t) => t.week)} series={lines} aria={`Prompts naming ${w.first} or ${w.company} per week and AI tool, against the peer median`} /><Legend series={lines} /></div>
              : <Empty title="The trend starts after a second weekly run" body="One point per week for each AI tool, with the peer median." />}
          </Card>
          <Card id="tour-engines" title="AI tools" action={<button className={s.link} onClick={onKeys}>Manage keys</button>}>
            <div className="overflow-x-auto"><table className={s.table}>
              <thead><tr><th>AI tool</th><th className={s.r}>{w.first}</th><th className={s.r}>{w.company}</th><th>Key</th></tr></thead>
              <tbody>{ENGINES.map((e) => {
                const p = subjectShare(runs, qs, "person", person, company, ctx, ["expert", "leadership"], e.id), co = subjectShare(runs, qs, "company", company, company, ctx, ["vendor", "leadership"], e.id);
                // Asked, but the search engine showed no AI answer on any of these prompts: say so instead of "Not run".
                const empty = (aud: string[]) => runs.some((r) => r.engine === e.id && r.status === "no_answer" && aud.includes(audienceOf(qs.find((q) => q.id === r.question_id) ?? { question: "" })))
                  ? <span className={cx(s.none, "whitespace-nowrap")}>No AI answer</span> : <span className={cx(s.none, "whitespace-nowrap")}>Not run</span>;
                return <tr key={e.id}>
                  <td><ProviderMark id={e.id} short /></td>
                  <td className={cx(s.r, s.tnum)}>{p.total ? `${p.named} of ${p.total}` : empty(["expert", "leadership"])}</td>
                  <td className={cx(s.r, s.tnum)}>{co.total ? `${co.named} of ${co.total}` : empty(["vendor", "leadership"])}</td>
                  <td>{keys[e.id] ? <Status tone="ink">Connected</Status> : <Status tone="grey"><span className={s.none}>No key</span></Status>}</td>
                </tr>;
              })}</tbody>
            </table></div>
          </Card>
          <Card id="tour-activity" title="Recent answers" action={<button className={s.link} onClick={() => onTab("Answers")}>All answers</button>}>
            <div className={cx(s.rows, s.rowsTop)}>{latest.map((r) => { const [t, tone] = outcome(r); const q = qs.find((x) => x.id === r.question_id); return (
              <button key={r.id} onClick={() => onOpenRun(r.id)} className={cx(s.row, s.rowHit)}>
                <span className="w-[22px] shrink-0"><ProviderLogo id={r.engine} size={16} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{q?.question ?? ""}</span><span className={cx(s.small, s.tnum)}>{engineLabel(r.engine)} · {when(r.run_at)}</span></span>
                <Status tone={tone}>{t}</Status>
              </button>
            ); })}</div>
          </Card>
          {slots.alerts}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Card id="tour-standing" title="Rank" meta={rivals.length ? `#${rank} of ${board.length}` : undefined} action={rivals.length ? <button className={s.link} onClick={() => onTab("Competitors")}>Leaderboard</button> : undefined}>
            {rivals.length ? <div className={cx("grid gap-2.5 px-[18px] pb-[18px] pt-1")}>{board.slice(0, 6).map((b) => (
              <div key={b.name} className="grid grid-cols-[minmax(0,1fr)_88px_28px] items-center gap-3 text-[13px]">
                <span className={cx("truncate", b.me ? "font-semibold" : "")}>{b.name}</span>
                <span className={s.bar}><span className={cx(s.barFill, b.me && s.barMe, "block")} style={{ width: `${Math.round((b.n / top) * 100)}%` }} /></span>
                <span className={cx(s.tnum, "text-right")}>{b.n}</span>
              </div>
            ))}</div> : <Empty title="No peers to compare" body="Add peer firms or experts to see your rank." action={<button className={cx(s.btn, s.sm)} onClick={() => onTab("Competitors")}>Add peers</button>} />}
          </Card>
          <Card id="tour-gapscard" title={<>Open gaps {gaps.length > 0 && <span className="count-badge ml-1.5">{gaps.length}</span>}</>} action={gaps.length ? <button className={s.link} onClick={() => onTab("Gaps")}>Review</button> : undefined}>
            {gaps.length ? <div className={cx(s.rows, s.rowsTop)}>{gaps.slice(0, 3).map((g) => (
              <div key={g.question.id} className={s.rowStack}><div className="line-clamp-2 text-[13px] font-medium">{g.question.question}</div><div className={s.small}>{g.rivals.join(", ")}</div></div>
            ))}</div> : <Empty title="No open gaps" body="A gap is a prompt where a peer is named and you are not." />}
          </Card>
          {slots.moves}
          <Card id="tour-sources" title="Where answers come from">
            {mix.sum ? <div className="px-[18px] pb-[18px]">
              <div className="flex h-2 gap-[2px] overflow-hidden rounded-full">{mix.parts.map(([l, n, col]) => <span key={l} style={{ width: `${(n / mix.sum) * 100}%`, background: col }} />)}</div>
              <div className={cx(s.legend, "mt-2.5")}>{mix.parts.map(([l, n, col]) => <span key={l} className="flex items-center gap-1.5"><span className={s.sw} style={{ background: col }} />{l} <b className={cx(s.tnum, "font-semibold text-[#141414]")}>{Math.round((n / mix.sum) * 100)}%</b></span>)}</div>
              <div className="mt-3">{mix.top.map(([d, n]) => <div key={d} className="flex justify-between gap-2 border-t border-[#efefef] py-2 text-[13px]"><span className="truncate">{d}</span><span className={cx(s.tnum, "text-[#5f5f5f]")}>{n}</span></div>)}</div>
            </div> : <Empty title="No sources yet" body="The sites behind each answer appear here." />}
          </Card>
          {slots.profile}
        </div>
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
// The idea keeps the tracked profile it came from, so Content Studio lists it with that profile's gap topics.
async function sendGap(wsId: string, g: PromptGap, scope: string | null, w: { first: string; company: string }) {
  const resource = `From AI citations. Prompt: "${g.question.question}". Named instead: ${g.rivals.join(", ")}. On: ${g.engines.map(engineLabel).join(", ")}.${g.channel === "company" ? ` ${w.company} content, not for ${possessive(w.first)} profile.` : ""}`;
  return supabase().from("posts").insert({ workspace_id: wsId, title: gapTopic(g, w.first), format: g.channel === "company" ? "Article" : "Text post", status: "Idea", topic: "AI citations", pillar: g.question.topic || "", resource, channel: g.channel, citation_question_id: g.question.id, ...postProfile(scope) }).select("id").single();
}

function GapRows({ gaps, sent, editable, w }: { gaps: PromptGap[]; sent: SentPost[]; editable: boolean; w: ReturnType<typeof who> }) {
  const { ws } = useWorkspace();
  const { scope } = useCitationScope();
  const toast = useToast();
  const isSent = (g: PromptGap) => sent.some((p) => p.citation_question_id === g.question.id);
  async function send(g: PromptGap) {
    const { data, error } = await sendGap(ws.id, g, scope, w);
    if (error) { toast(error.message); return; }
    haptic(); toast("Sent to Content Studio as an idea", async () => { await supabase().from("posts").delete().eq("id", data.id); });
  }
  return <div className={cx(s.rows, s.rowsTop)}>{gaps.map((g) => (
    <div key={g.question.id} className="flex flex-col gap-3 px-[18px] py-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold leading-snug">{g.question.question}</div>
        <div className={cx(s.small, "mt-1")}>Named instead <b className="font-semibold text-[#141414]">{g.rivals.join(", ")}</b> on {g.engines.map(engineLabel).join(", ")}</div>
        <div className="mt-2"><span className={cx(s.pill, s.pDark)}>{g.channel === "company" ? `${w.company} content` : `For ${w.first}`}</span></div>
      </div>
      {editable && (isSent(g) ? <span className={cx(s.status, "text-[#5f5f5f]")}><Check size={14} aria-hidden /> Sent</span> : <button className={cx(s.btn, s.sm, "self-start sm:self-center")} onClick={() => send(g)}>Send to Content Studio</button>)}
    </div>
  ))}</div>;
}

export function Gaps({ c, editable, siteGaps, onTab }: { c: Ctx; editable: boolean; siteGaps: React.ReactNode; onTab: (t: string) => void }) {
  const { ws } = useWorkspace();
  const { scope } = useCitationScope();
  const toast = useToast();
  const sent = useSent();
  const w = names(c);
  const gaps = useMemo(() => promptGaps(c.runs, c.qs, c.person, c.company, c.experts, c.firms, c.ctx), [c]);
  const open = gaps.filter((g) => !sent.rows.some((p) => p.citation_question_id === g.question.id));
  async function sendAll() {
    const ids: string[] = [];
    for (const g of open) { const { data, error } = await sendGap(ws.id, g, scope, w); if (error) { toast(error.message); break; } ids.push(data.id); }
    if (ids.length) { haptic(); toast(`${ids.length} topics sent to Content Studio`, async () => { await supabase().from("posts").delete().in("id", ids); }); }
  }
  const empty = !c.runs.length ? <Empty title="Gaps appear after the first run" body="A gap is a prompt where a peer is named and you are not." />
    : !c.rivals.length ? <Empty title="Add a peer to find gaps" body="Gaps compare you with the peer firms and experts you track." action={<button className={cx(s.btn, s.sm)} onClick={() => onTab("Competitors")}>Add peers</button>} />
    : <Empty title="No open gaps" body={`Every prompt that names a peer also names ${w.first} or ${w.company}.`} />;
  return (
    <div className="flex flex-col gap-4">
      <Card id="tour-gapshead" title="Prompt gaps" meta={gaps.length ? `${gaps.length} open` : undefined}
        action={editable && gaps.length > 0 ? <button className={cx(s.btn, s.sm)} disabled={!open.length} onClick={sendAll}>{open.length ? `Send all ${open.length}` : "All sent"}</button> : undefined}>
        {gaps.length ? <GapRows gaps={gaps} sent={sent.rows} editable={editable} w={w} /> : <div className={s.rowsTop}>{empty}</div>}
      </Card>
      {c.runs.length > 0 && siteGaps}
    </div>
  );
}

// ---------------- company ----------------
export function Company({ c, ents, editable, facts, onFacts }: { c: Ctx; ents: EntRow[]; editable: boolean; facts: Partial<Facts>; onFacts: () => void }) {
  const sent = useSent();
  const { runs, qs, person, company, ctx } = c;
  const w = names(c);
  const C = useMemo(() => subjectShare(runs, qs, "company", company, company, ctx, ["vendor", "leadership"]), [runs, qs, company, ctx]);
  const trend = useMemo(() => weeklyTrend(runs, qs, person, company, c.rivals, ctx), [runs, qs, person, company, c.rivals, ctx]);
  const gaps = useMemo(() => promptGaps(runs, qs, person, company, c.experts, c.firms, ctx).filter((g) => g.channel === "company"), [runs, qs, person, company, c.experts, c.firms, ctx]);
  const firmRank = useMemo(() => !company ? 0 : [{ me: true, n: C.named }, ...c.firms.map((f) => ({ me: false, n: shareOfVoice(runs, qs, f, company).named }))].sort((a, b) => b.n - a.n).findIndex((x) => x.me) + 1, [runs, qs, company, c.firms, C.named]);
  const attributed = useMemo(() => person ? runs.filter((r) => scored(r) && detectPerson(r, person, company, ctx).attributed).length : 0, [runs, person, company, ctx]);
  const pages = useMemo(() => { const m = new Map<string, number>(); runs.forEach((r) => r.sources.forEach((x) => { if (company && owns(x.url, company.domains)) m.set(x.url, (m.get(x.url) ?? 0) + 1); })); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5); }, [runs, company]);
  const wrongFacts = useMemo(() => company ? runs.flatMap((r) => factIssues(r.answer, facts, company.aliases)).slice(0, 3) : [], [runs, facts, company]);
  const dir = sameDirection(trend.map((t) => t.person), trend.map((t) => t.company));
  const series: Series[] = [
    { key: "c", label: `${w.company}, vendor prompts`, color: "#141414", values: trend.map((t) => t.company) },
    { key: "p", label: `${w.first}, expert prompts`, color: "#d64545", values: trend.map((t) => t.person) },
  ];
  const peers = usePeerSuggestions(runs, qs, ents);
  const ran = runs.length > 0;
  if (!ran) return (
    <div id="tour-company" className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <Card title={`${w.company} in AI answers`}>
        <div className={s.rowsTop}><Empty title="Company results appear after the first run" body={`How often vendor prompts name ${w.company}, whether answers link its sites, its rank among peer firms and the gaps to close.`} /></div>
      </Card>
      <TrackedNames ents={ents} pools={["company", "firms"]} editable={editable} peers={peers} />
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <div id="tour-company"><KpiTiles items={[
        { label: `${w.company} named`, value: C.total ? C.named : "None", of: C.total ? `of ${C.total}` : undefined, sub: "Vendor prompts" },
        { label: "Linked to its sites", value: C.total ? C.linked : "None", sub: "Answers citing owned domains" },
        { label: "Rank among firms", value: c.firms.length && C.total ? `#${firmRank}` : "None", of: c.firms.length && C.total ? `of ${c.firms.length + 1}` : undefined, sub: c.firms.length ? "Peer firms only" : "Add peer firms" },
        { label: `${w.first} tied to ${w.company}`, value: ran ? attributed : "None", sub: "Same paragraph" },
      ]} /></div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Direction" meta="Last 8 weeks" action={dir != null ? <span className={cx(s.pill, dir ? s.pDark : s.pRed)}>{dir ? "Moving together" : "Moving apart"}</span> : undefined}>
            {weeksWithData(series) >= 2 ? <div className="grid gap-3 px-[18px] pb-[18px]"><TrendChart weeks={trend.map((t) => t.week)} aria={`${w.first} on expert prompts and ${w.company} on vendor prompts, per week`} series={series} /><Legend series={series} /></div>
              : <Empty title="Direction shows after two weekly runs" body={`Whether ${w.first} and ${w.company} are named more, week on week.`} />}
          </Card>
          <Card title="Company gaps" meta={gaps.length ? `${gaps.length} open` : undefined}>
            {gaps.length ? <GapRows gaps={gaps} sent={sent.rows} editable={editable} w={w} />
              : <div className={s.rowsTop}><Empty title={ran ? "No company gaps" : "Company gaps appear after the first run"} body={`Vendor prompts where a peer firm is named and ${w.company} is not.`} /></div>}
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Pages AI cites">
              {pages.length ? <div className={cx(s.rows, s.rowsTop)}>{pages.map(([u, n]) => <div key={u} className={cx(s.row, "py-2.5 text-[13px]")}><span className="min-w-0 flex-1 truncate">{u.replace(/^https?:\/\/(www\.)?/, "")}</span><span className={cx(s.tnum, "text-[#5f5f5f]")}>{n}</span></div>)}</div>
                : <div className={s.rowsTop}><Empty title="None cited yet" body={company?.domains.length ? `Pages on ${company.domains[0]} appear when an answer cites them.` : "Add the company's domains to track its pages."} /></div>}
            </Card>
            <Card title="Facts check" action={<button className={s.link} onClick={onFacts}>Facts sheet</button>}>
              <div className={s.rowsTop}>
                {!facts.company && !facts.founded ? <Empty title="No company facts yet" body="Answers are checked against the facts sheet." />
                  : wrongFacts.length ? <div className={s.rows}>{wrongFacts.map((x, i) => <div key={i} className={cx(s.rowStack, "text-[13px]")}><span className="font-semibold">{x.fact}</span><span className={cx(s.small, "block")}>Said: {x.said}</span></div>)}</div>
                  : <Empty title="No wrong facts" body={ran ? `No answer contradicts the ${w.company} facts.` : "Checked after each run."} />}
              </div>
            </Card>
          </div>
        </div>
        <TrackedNames ents={ents} pools={["company", "firms"]} editable={editable} peers={peers} />
      </div>
    </div>
  );
}

// ---------------- keywords ----------------
export function KeywordsPanel({ c, value, onPick }: { c: Ctx; value: string; onPick: (k: string) => void }) {
  const stats = useMemo(() => keywordStats(c.runs, c.qs, c.person, c.company, c.ctx), [c]);
  const ran = c.runs.length > 0;
  return (
    <Card id="tour-keywords" title="Keywords" meta={ran ? "Named on" : undefined}>
      {stats.length ? <div className={cx(s.rows, s.rowsTop)}>{stats.map((k) => (
        <button key={k.keyword} onClick={() => onPick(value === k.keyword ? "" : k.keyword)} aria-pressed={value === k.keyword} className={cx(s.row, s.rowHit, "justify-between py-2.5 text-[13px]", value === k.keyword && "bg-[#f3f3f3]")}>
          <span className="font-medium">{k.keyword}</span><span className={cx(s.tnum, "text-[#5f5f5f]")}>{ran ? `${k.named} of ${k.prompts}` : `${k.prompts} prompt${k.prompts > 1 ? "s" : ""}`}</span>
        </button>
      ))}</div> : <div className={s.rowsTop}><Empty title="No keywords" body="Add keywords to prompts to track them." /></div>}
    </Card>
  );
}

// ---------------- weekly report ----------------
// Provider marks in the PDF, keyed by the full and the short names the report tables use; a dot when there is no mark.
const PDF_MARKS: Record<string, PdfMark> = Object.fromEntries(ENGINES.flatMap((e) => {
  const p = providerOf(e.id), m = p ? MARKS[p.id] : null, mark: PdfMark = { path: m?.path ?? null, color: m?.color ?? "#5f5f5f" };
  return [[e.name, mark], [engineLabel(e.id), mark]];
}));
export function buildWeekReport(c: Ctx, week: string, profile: string, facts: Partial<Facts>): PdfDoc {
  const { qs, person, company, selfAll, rivals, ctx } = c;
  const w = names(c);
  const now = runsInWeek(c.runs, week), prev = runsInWeek(c.runs, shiftWeek(week, -1));
  const P = subjectShare(now, qs, "person", person, company, ctx, ["expert", "leadership"]), Pp = subjectShare(prev, qs, "person", person, company, ctx, ["expert", "leadership"]);
  const C = subjectShare(now, qs, "company", company, company, ctx, ["vendor", "leadership"]), Cp = subjectShare(prev, qs, "company", company, company, ctx, ["vendor", "leadership"]);
  const gaps = promptGaps(now, qs, person, company, c.experts, c.firms, ctx);
  const ch = (a: number, b: number) => (a - b > 0 ? `+${a - b}` : String(a - b));
  const failed = now.filter((r) => r.status === "failed").length;
  const qName = (q: Question) => (/[^\x00-\xFF]/.test(q.question) ? `${q.topic || "Prompt"} (${q.language})` : q.question);
  const cell = (q: Question, e: Engine) => { const b = latestBatches(now).get(`${q.id}|${e}`); if (!b) return "Not run"; const u = b.now.filter(scored); if (!u.length) return b.now.some((r) => r.status === "no_answer") ? "No AI answer" : "Failed"; if (person && audienceOf(q) !== "vendor" && u.some((r) => detectPerson(r, person, company, ctx).named)) return w.first; if (company && aggregate(u, company)?.named) return w.company; return "Not named"; };
  const usedEngines = ENGINES.filter((e) => now.some((r) => r.engine === e.id));
  const both = `${w.first} and ${w.company}`;
  const board = [{ name: both, n: shareOfVoice(now, qs, selfAll, selfAll).named, p: shareOfVoice(prev, qs, selfAll, selfAll).named }, ...rivals.map((r) => ({ name: r.name, n: shareOfVoice(now, qs, r, selfAll).named, p: shareOfVoice(prev, qs, r, selfAll).named }))].sort((a, b) => b.n - a.n);
  const sitesGap = citationGaps(now, selfAll, rivals).slice(0, 6);
  const li = person ? linkedinCited(now, person).length : 0;
  const issues = company ? now.flatMap((r) => [...(r.fact_issues ?? []), ...factIssues(r.answer, facts, company.aliases)]) : [];
  const ch2 = changes(c.runs.filter((r) => r.run_at <= week + "T99"), selfAll).filter((x) => x.at.slice(0, 10) >= week).length;
  const label = `Week of ${shortDate(week)}`;
  const sections: PdfSection[] = [
    { title: "Executive summary", lead: `${w.person} was named in ${P.named} of ${P.total} expert prompts (${ch(P.named, Pp.named)} on the week before). ${w.company} was named in ${C.named} of ${C.total} vendor prompts (${ch(C.named, Cp.named)}). ${gaps.length} gaps are open.`,
      findings: [gaps[0] ? `Largest gap: "${qName(gaps[0].question)}". Named instead: ${gaps[0].rivals.join(", ")}.` : "No open gaps this week.", P.review ? `${P.review} answers name a "${w.person}" without context and need review.` : "Every full-name match had clear context.", failed ? `${failed} runs failed and are not counted as misses.` : "Every run completed.", `${ch2} prompts changed state against the run before.`] },
    { title: "Scorecard", lead: "Week-on-week movement. Counts come before percentages.", tables: [{ head: ["Measure", "This week", "Week before", "Change"], widths: [.46, .18, .18, .18], rows: [
      [`${w.first} named, expert prompts`, `${P.named} of ${P.total}`, `${Pp.named} of ${Pp.total}`, ch(P.named, Pp.named)],
      [`${w.company} named, vendor prompts`, `${C.named} of ${C.total}`, `${Cp.named} of ${Cp.total}`, ch(C.named, Cp.named)],
      [`Linked to ${w.company} pages`, String(C.linked), String(Cp.linked), ch(C.linked, Cp.linked)],
      ["Open gaps", String(gaps.length), String(promptGaps(prev, qs, person, company, c.experts, c.firms, ctx).length), ""],
      ["Runs, failed", `${now.length}, ${failed}`, `${prev.length}, ${prev.filter((r) => r.status === "failed").length}`, ""],
    ] }] },
    { title: "Results by AI tool", tables: [{ head: ["AI tool", w.first, w.company, "Runs", "Failed"], widths: [.24, .2, .2, .18, .18], rows: usedEngines.map((e) => { const p = subjectShare(now, qs, "person", person, company, ctx, ["expert", "leadership"], e.id), co = subjectShare(now, qs, "company", company, company, ctx, ["vendor", "leadership"], e.id); const er = now.filter((r) => r.engine === e.id); return [e.name, `${p.named} of ${p.total}`, `${co.named} of ${co.total}`, String(er.length), String(er.filter((r) => r.status === "failed").length)]; }) }] },
    { title: "Gaps, in priority order", lead: "Ranked by how many AI tools name a peer on the prompt.", tables: [{ head: ["Prompt", "Named instead", "For", "AI tools"], widths: [.44, .24, .14, .18], rows: gaps.map((g) => [qName(g.question), g.rivals.join(", "), g.channel === "company" ? w.company : w.first, g.engines.map(engineLabel).join(", ")]) }] },
    { title: "Competitive position", lead: "Share of voice on the same prompts; branded prompts left out.", tables: [{ head: ["Name", "Named", "Week before", "Change"], widths: [.46, .18, .18, .18], rows: board.map((b) => [b.name, String(b.n), String(b.p), ch(b.n, b.p)]) }] },
    { title: "Sources the AI relies on", paras: [`${possessive(w.first)} LinkedIn was cited ${li} times this week.`], tables: sitesGap.length ? [{ caption: `Sites that cite peers and never ${w.company}`, head: ["Site", "Answers", "Names instead"], widths: [.4, .16, .44], rows: sitesGap.map((g) => [g.domain, String(g.runs), g.competitors.join(", ")]) }] : [] },
    { title: "Accuracy and tone", paras: [issues.length ? `Wrong facts found: ${issues.length}. First: ${issues[0].fact}, where the answer said "${issues[0].said.slice(0, 160)}".` : "No answer contradicted the facts sheet.", `Tone among answers naming ${w.first}: ${["positive", "neutral", "negative"].map((t) => `${now.filter((r) => r.sentiment === t).length} ${t}`).join(", ")}.`] },
    { title: "Results by audience", lead: `Expert prompts score ${w.first}, vendor prompts score ${w.company}, leadership prompts score both.`, tables: [{ head: ["Audience", "Prompts run", `${w.first} named`, `${w.company} named`], widths: [.31, .23, .23, .23], rows: (["expert", "vendor", "leadership"] as const).map((a) => { const p = subjectShare(now, qs, "person", person, company, ctx, [a]), co = subjectShare(now, qs, "company", company, company, ctx, [a]); return [AUDIENCE_LABEL[a], String(Math.max(p.total, co.total)), a === "vendor" ? "Not scored" : `${p.named} of ${p.total}`, a === "expert" ? "Not scored" : `${co.named} of ${co.total}`]; }) }] },
    { title: "Company view", lead: `${w.company} named in ${C.named} of ${C.total} vendor prompts, linked in ${C.linked}.` },
    { title: "Next moves", lead: "From this week's gaps and sources.", findings: recommend(now, qs, selfAll, rivals).slice(0, 5).map((r) => `${r.title}. ${r.detail}`).concat(gaps.length ? [] : ["No gap this week; keep the weekly run going."]) },
    { title: "Appendix: every prompt", tables: [{ head: ["Prompt", "For", ...usedEngines.map((e) => engineLabel(e.id))], widths: [.42, .14, ...usedEngines.map(() => .44 / Math.max(1, usedEngines.length))], rows: qs.filter((q) => q.status === "active").map((q) => [qName(q), AUDIENCE_LABEL[audienceOf(q)], ...usedEngines.map((e) => cell(q, e.id))]) }] },
    { title: "Method and data quality", paras: ["Each prompt is asked through each AI tool's API with web search on, from the user's browser with their own keys. Answers and sources are stored; keys are not.", `${w.first} counts as named only by the full name next to context (${w.company}, the role or one of the topics); other matches wait for review. Branded prompts are left out of scores. Failed runs are not counted as misses. Repeats use the majority answer.`, `This week: ${now.length} runs, ${now.length - failed} completed. Results reflect API answers with web search, which can differ from the consumer apps.`] },
  ];
  return { kicker: "AI CITATIONS REPORT", title: `${w.person} and ${w.company} in AI answers`, subtitle: `${label}. How often AI tools name, link and rank ${w.first} and ${w.company} when buyers ask.`, coverMeta: [["Prepared for", `${profile}`], ["Period", label], ["Runs", `${now.length} on ${usedEngines.length} AI tools`], ["Method", "API with web search"]], footer: `Prax - AI citations report - ${label} - Confidential`, coverNote: "Confidential. Prepared from API answers with web search, run from the user's browser with their own keys.", sections, marks: PDF_MARKS };
}

export function Report({ c, onShare, facts }: { c: Ctx; onShare: () => void; facts: Partial<Facts> }) {
  const { ws } = useWorkspace();
  const prepared = useCitationScope().current?.name ?? ws.name;
  const weeks = useMemo(() => runWeeks(c.runs), [c.runs]);
  const [week, setWeek] = useState<string>("");
  const wk = week || weeks[0];
  const doc = useMemo(() => (wk ? buildWeekReport(c, wk, prepared, facts) : null), [c, wk, prepared, facts]);
  if (!wk || !doc) return <Card><Empty title="The first report appears after the first run" body="One report for each week your prompts run, as PDF and CSV." /></Card>;
  const file = `ai-citations-week-of-${wk}`;
  const csv = () => { const rows = [["Section", "Item", "Value"], ...doc.sections.flatMap((sc) => (sc.tables ?? []).flatMap((t) => t.rows.map((r) => [sc.title, r[0], r.slice(1).join(" | ")])))]; return rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n"); };
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <Card title="Weeks" meta={String(weeks.length)}>
        <nav className="grid gap-0.5 px-2 pb-2" aria-label="Weekly reports">
          {weeks.map((x, i) => <button key={x} onClick={() => setWeek(x)} aria-current={x === wk} className={s.weekItem}><span>Week of {shortDate(x)}</span>{i === 0 && <span className={s.small}>Latest</span>}</button>)}
        </nav>
      </Card>
      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap justify-end gap-2">
          <button className={s.btn} onClick={onShare}>Share link</button>
          <button className={s.btn} onClick={() => downloadFile(`${file}.csv`, csv(), "text/csv")}>CSV</button>
          <button className={cx(s.btn, s.dark)} onClick={() => downloadFile(`${file}.pdf`, buildPdf(doc), "application/pdf")}>Download PDF</button>
        </div>
        <article className={s.report}>
          <div className={s.reportCover}>
            <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.02em]">{doc.title}</h2>
            <p className="mt-1.5 text-[14px] text-[#5f5f5f]">{doc.subtitle}</p>
            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-[#ececec] pt-4 text-[13px] md:grid-cols-4">{doc.coverMeta.map(([k, v]) => <div key={k}><dt className="text-[12px] font-semibold text-[#5f5f5f]">{k}</dt><dd className="mt-0.5">{v}</dd></div>)}</dl>
          </div>
          <div className="border-y border-[#ececec] bg-[#fafafa] px-6 py-4 md:px-10"><div className={s.label}>Contents</div><ol className="mt-2 grid gap-x-6 gap-y-1 text-[13px] md:grid-cols-2">{doc.sections.map((sc, i) => <li key={sc.title}><span className={cx(s.tnum, "inline-block w-6 text-[#6b6b6b]")}>{i + 1}</span>{sc.title}</li>)}</ol></div>
          <div className="px-6 pb-10 md:px-10">{doc.sections.map((sc, i) => (
            <section key={sc.title} className="flex flex-col gap-2.5 pt-8">
              <h3 className="text-[17px] font-semibold tracking-[-0.01em]"><span className={cx(s.tnum, "mr-2 text-[#6b6b6b]")}>{i + 1}</span>{sc.title}</h3>
              {sc.lead && <p className="max-w-[72ch] text-[14px] text-[#2b2b2b]">{sc.lead}</p>}
              {sc.findings?.map((f) => <div key={f} className={s.finding}>{f}</div>)}
              {sc.paras?.map((p) => <p key={p} className="max-w-[72ch] text-[13.5px]">{p}</p>)}
              {sc.tables?.map((t, k) => (
                <div key={k} className="overflow-x-auto rounded-lg border border-[#ececec]">
                  {t.caption && <div className={cx(s.small, "px-3.5 py-2 font-semibold")}>{t.caption}</div>}
                  <table className={s.table}><thead><tr>{t.head.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{t.rows.length ? t.rows.map((r, j) => <tr key={j}>{r.map((x, m) => <td key={m} className={m ? s.tnum : undefined}>{x}</td>)}</tr>) : <tr><td colSpan={t.head.length} className={s.small}>Nothing this week.</td></tr>}</tbody></table>
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
export type TourItem = { tab: string; id: string; title: string; body: string };
export function makeTour(person?: Entity, company?: Entity): TourItem[] {
  const w = who(person, company);
  return [
    { tab: "Home", id: "tour-kpis", title: "The four numbers that matter", body: `${w.first} on expert prompts, ${w.company} on vendor prompts, rank against peers, and open gaps.` },
    { tab: "Home", id: "tour-trend", title: "The trend", body: "Eight weeks per AI tool against the peer median. Hover a week to read it." },
    { tab: "Home", id: "tour-engines", title: "Each AI tool", body: "Results per AI tool and whether its key is in this browser." },
    { tab: "Home", id: "tour-activity", title: "Recent answers", body: "What the latest runs found. Open one to read the full answer." },
    { tab: "Home", id: "tour-standing", title: "Rank", body: "Where you stand among the names you track." },
    { tab: "Home", id: "tour-gapscard", title: "Open gaps", body: `Prompts where a peer is named and ${w.first} or ${w.company} is not.` },
    { tab: "Gaps", id: "tour-gapshead", title: "Gaps become topics", body: `Send a gap to Content Studio. Vendor gaps go as ${w.company} content.` },
    { tab: "Prompts", id: "tour-keywords", title: "Prompts and keywords", body: "Every prompt the AI tools are asked, who it scores, and its keywords." },
    { tab: "Answers", id: "tour-answers", title: "Every answer", body: "Prompt by AI tool. Open a cell for the answer, its sources, tone and facts." },
    { tab: "Sources", id: "tour-sourcestab", title: "Sources", body: "The sites AI relies on, and the people it quotes on your topics." },
    { tab: "Competitors", id: "tour-competitors", title: "Competitors", body: `Peer experts for ${w.first} and peer firms for ${w.company}. Add, edit and remove them here.` },
    { tab: "Actions", id: "tour-actions", title: "Actions", body: "What to publish and where to be mentioned, with the lift once it runs." },
    { tab: "Company", id: "tour-company", title: "The company view", body: `${w.company} on vendor prompts, its peer firms and its sites.` },
    { tab: "Home", id: "tour-run", title: "Run, Ask and the facts sheet", body: "Run prompts with your own keys, ask your results in plain words, and keep the facts sheet true." },
  ];
}
export function Tour({ steps, step, done, onStep, onClose }: { steps: TourItem[]; step: number; done: number; onStep: (i: number, markDone: boolean) => void; onClose: () => void }) {
  const t = steps[step];
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
        <div className="flex items-center justify-between gap-2"><span className="text-[12px] font-semibold text-[#cfcfcf]">Step {step + 1} of {steps.length}</span><button className="text-[12.5px] font-semibold text-[#cfcfcf] hover:text-white" onClick={onClose}>Skip tour</button></div>
        <span className="block h-1 overflow-hidden rounded-full bg-white/15"><span className="block h-full bg-[#d64545] transition-all" style={{ width: `${Math.round((done / steps.length) * 100)}%` }} /></span>
        <span className="text-[16px] font-semibold">{t.title}</span>
        <span className="text-[13px] leading-relaxed text-[#d6d6d6]">{t.body}</span>
        <div className="mt-1 flex items-center gap-2">
          <button className={s.ghostDark} disabled={!step} onClick={() => onStep(step - 1, false)}>Back</button>
          <button className={s.ghostDark} onClick={() => onStep(step + 1, false)}>Skip step</button>
          <button className={cx(s.btn, s.sm, s.red, "ml-auto")} onClick={() => onStep(step + 1, true)}>{step === steps.length - 1 ? "Finish" : "Next"}</button>
        </div>
      </div>
    </>
  );
}
