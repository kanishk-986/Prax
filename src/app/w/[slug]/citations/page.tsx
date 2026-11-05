"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useWorkspace, fmtDay, ymd } from "@/lib/workspace";
import { useToast, haptic } from "@/components/toaster";
import { askExtension, useExtension } from "@/lib/bridge";
import {
  ENGINES, ESTIMATE, COUNTRY, LANGUAGES, parseEngine, statusOf, detect, isBranded, shareOfVoice, changes, citationGaps, linkedinCited, latestPairs, promptFor, findMatches,
  type Engine, type Entity, type Run, type Question, type Source,
} from "@/lib/citations";
import s from "./citations.module.css";

type RunRow = Omit<Run, "sources"> & { error: string; question_text: string; input_tokens: number; output_tokens: number; citation_sources: (Source & { sort: number })[] };
type Manual = { question_id: string; week_start: string; tool: string; cited: boolean };
const TABS = ["Overview", "Questions", "Runs", "Sources", "Competitors"] as const;
type Tab = (typeof TABS)[number];
const LIVE = ENGINES.filter((e) => e.live);
const engineName = (e: string) => ENGINES.find((x) => x.id === e)?.name ?? e;
const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");
const list = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
const when = (t: string) => new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function Citations() {
  const { ws, can } = useWorkspace();
  const editable = can("editor");
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("Overview");
  const qs = useLive<Question & { sort: number }>("citation_questions", ws.id, { order: "sort" });
  const ents = useLive<Entity & { sort: number }>("citation_entities", ws.id, { order: "sort" });
  const manual = useLive<Manual>("citation_results", ws.id, { order: "week_start", asc: false });
  const [runRows, setRunRows] = useState<RunRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<RunRow | null>(null);
  const [runOpen, setRunOpen] = useState(false);

  // The last 90 days of runs with their sources; older runs stay in the database.
  const loadRuns = useCallback(async () => {
    const since = new Date(Date.now() - 90 * 864e5).toISOString();
    const { data } = await supabase().from("citation_runs").select("*, citation_sources(url,title,domain,cited,sort)").eq("workspace_id", ws.id).gte("run_at", since).order("run_at", { ascending: false }).limit(3000);
    setRunRows((data as RunRow[]) ?? []); setLoaded(true);
  }, [ws.id]);
  useEffect(() => { loadRuns(); }, [loadRuns]);

  const runs: Run[] = useMemo(() => runRows.map((r) => ({ ...r, sources: [...(r.citation_sources ?? [])].sort((a, b) => a.sort - b.sort) })), [runRows]);
  const self = ents.rows.find((e) => e.kind === "self");
  const rivals = ents.rows.filter((e) => e.kind === "competitor");
  const active = qs.rows.filter((q) => q.status === "active");
  const qById = useMemo(() => new Map(qs.rows.map((q) => [q.id, q])), [qs.rows]);

  return (
    <div className={cx("mx-auto max-w-[1180px]", s.root)}>
      <header className="flex flex-wrap items-center justify-between gap-3 pl-10 md:pl-0">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">AI citations</h1>
          <p className={s.sub}>Whether AI models name and link Shashi and Antier when buyers ask. Every result is the model&apos;s API with web search on: close to, not the same as, what someone sees in the app.</p>
        </div>
        {editable && <button className={cx(s.btn, s.red)} disabled={!self || !active.length} onClick={() => setRunOpen(true)}>Run questions</button>}
      </header>
      <nav className={s.tabs} role="tablist" aria-label="AI citations">
        {TABS.map((t) => {
          const n = t === "Questions" ? active.length : t === "Runs" ? runs.length : t === "Competitors" ? rivals.length : 0;
          return <button key={t} role="tab" aria-selected={tab === t} className={cx(s.tab, tab === t && s.tabOn)} onClick={() => setTab(t)}>{t}{n > 0 && <span className={s.count}>{n}</span>}</button>;
        })}
      </nav>

      {!ents.loading && !self ? <Setup editable={editable} />
        : !loaded || qs.loading || !self ? <div className={cx(s.box, "h-64 animate-pulse")} />
        : tab === "Overview" ? <Overview runs={runs} qs={qs.rows} self={self} rivals={rivals} onOpen={(id) => setOpen(runRows.find((r) => r.id === id) ?? null)} onRun={() => setRunOpen(true)} editable={editable} />
        : tab === "Questions" ? <Questions qs={qs.rows} self={self} editable={editable} />
        : tab === "Runs" ? <Runs rows={runRows} qById={qById} self={self} manual={manual.rows} onOpen={setOpen} />
        : tab === "Sources" ? <Sources runs={runs} self={self} rivals={rivals} editable={editable} />
        : <Competitors ents={ents.rows} runs={runs} qs={qs.rows} self={self} editable={editable} />}

      {open && self && <Evidence run={open} q={qById.get(open.question_id)} self={self} rivals={rivals} onClose={() => setOpen(null)} />}
      {runOpen && self && <RunPanel qs={active} onClose={() => setRunOpen(false)} onDone={() => { loadRuns(); toast("Run finished"); }} />}
    </div>
  );
}

// ---------------- setup ----------------
function Setup({ editable }: { editable: boolean }) {
  const { ws } = useWorkspace();
  const toast = useToast();
  const li = ws.linkedin_url ? ws.linkedin_url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "") : "";
  const [f, setF] = useState({ name: "Shashi Pal and Antier", aliases: "Shashi Pal, Antier, Antier Solutions, antiersolutions.com", domains: ["antiersolutions.com", li].filter(Boolean).join(", ") });
  async function save() {
    const { error } = await supabase().from("citation_entities").insert({ workspace_id: ws.id, kind: "self", name: f.name, aliases: list(f.aliases), domains: list(f.domains), sort: 0 });
    if (error) toast(error.message); else { haptic(); toast("Tracking set up"); }
  }
  return (
    <div className={cx(s.box, "max-w-[720px] p-5")}>
      <h2 className="text-[18px] font-semibold">Who should the AI name?</h2>
      <p className={s.small}>Names are matched as whole words, so &quot;Antier&quot; never matches &quot;Antiers&quot;. Domains count as linked when an answer cites them; a LinkedIn profile path also covers his posts and articles. All of this can be changed later under Competitors.</p>
      <div className="mt-4 grid gap-3">
        <label className="grid gap-1.5"><span className={s.label}>Name</span><input className={s.field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="grid gap-1.5"><span className={s.label}>Names to look for, separated by commas</span><input className={s.field} value={f.aliases} onChange={(e) => setF({ ...f, aliases: e.target.value })} /></label>
        <label className="grid gap-1.5"><span className={s.label}>Owned domains and profiles</span><input className={s.field} value={f.domains} onChange={(e) => setF({ ...f, domains: e.target.value })} /></label>
        {editable ? <div><button className={cx(s.btn, s.red)} onClick={save} disabled={!f.name.trim() || !list(f.aliases).length}>Start tracking</button></div> : <p className={s.small}>An editor sets this up.</p>}
      </div>
    </div>
  );
}

// ---------------- overview ----------------
function Overview({ runs, qs, self, rivals, onOpen, onRun, editable }: { runs: Run[]; qs: Question[]; self: Entity; rivals: Entity[]; onOpen: (id: string) => void; onRun: () => void; editable: boolean }) {
  const active = qs.filter((q) => q.status === "active");
  const pairs = useMemo(() => latestPairs(runs), [runs]);
  const ch = useMemo(() => changes(runs, self), [runs, self]);
  const li = useMemo(() => linkedinCited(runs, self), [runs, self]);
  const qText = (id: string) => qs.find((q) => q.id === id)?.question ?? "Removed question";

  if (!runs.length) return (
    <div className={cx(s.box, "grid min-h-[240px] place-items-center p-8 text-center")}>
      <div className="max-w-[460px]">
        <p className="font-semibold">No runs yet</p>
        <p className={s.small}>{active.length ? `Run your ${active.length} active questions on the engines you have keys for. Each answer is saved with its sources so you can read the evidence.` : "Add buyer questions first, under Questions."}</p>
        {editable && active.length > 0 && <button className={cx(s.btn, s.red, "mt-4")} onClick={onRun}>Run questions</button>}
      </div>
    </div>
  );
  const all = shareOfVoice(runs, qs, self, self);
  const byEngine = LIVE.map((e) => ({ e, sov: shareOfVoice(runs, qs, self, self, e.id) }));
  return (
    <div className="flex flex-col gap-5">
      <section className={cx(s.panel, "flex flex-wrap items-end gap-x-10 gap-y-4 p-5")}>
        <div>
          <div className={s.label} style={{ color: "#ff8a80" }}>Named, latest run</div>
          <div className="mt-1 text-[30px] font-semibold leading-tight"><span className={s.num}>{all.named}</span> <span className="text-[18px] font-medium text-[#cfcfcf]">of {all.total} answers</span></div>
          <div className="text-[12.5px] text-[#cfcfcf]">{all.pct != null ? `${all.pct}%` : "No usable runs"} · each question on each engine, branded questions and failed runs left out</div>
        </div>
        <div><div className={s.label} style={{ color: "#ff8a80" }}>Linked to his sites</div><div className="mt-1 text-[22px] font-semibold"><span className={s.num}>{all.linked}</span> <span className="text-[14px] font-medium text-[#cfcfcf]">of {all.total}</span></div></div>
        <div><div className={s.label} style={{ color: "#ff8a80" }}>His LinkedIn cited</div><div className="mt-1 text-[22px] font-semibold"><span className={s.num}>{li.length}</span> <span className="text-[14px] font-medium text-[#cfcfcf]">times</span></div></div>
        <div className="ml-auto text-right text-[12.5px] text-[#cfcfcf]">Last run {when(runs[0].run_at)}<br />API with web search</div>
      </section>

      <section className={cx(s.box, "overflow-x-auto")}>
        <table className={s.table}>
          <thead><tr><th>Engine</th><th>Named</th><th>Linked</th><th>Best position</th><th>Changes since last run</th></tr></thead>
          <tbody>{byEngine.map(({ e, sov }) => {
            const best = Math.min(...[...pairs.values()].filter((p) => p.now.engine === e.id && p.now.status !== "failed").map((p) => detect(p.now, self).position ?? Infinity));
            const c = ch.filter((x) => x.engine === e.id), nNew = c.filter((x) => x.kind === "new").length, nDrop = c.length - nNew;
            return (
              <tr key={e.id}>
                <td className="font-semibold">{e.name}</td>
                <td>{sov.total ? <><span className={s.num}>{sov.named}</span> of {sov.total} questions</> : <span className={s.faint}>Not run</span>}</td>
                <td>{sov.total ? <><span className={s.num}>{sov.linked}</span> of {sov.total}</> : ""}</td>
                <td className={s.num}>{Number.isFinite(best) ? `#${best}` : "–"}</td>
                <td>{c.length ? <span className="flex flex-wrap gap-1.5">{nNew > 0 && <span className={cx(s.pill, s.pRed)}>{nNew} newly named</span>}{nDrop > 0 && <span className={cx(s.pill, s.pDark)}>{nDrop} dropped out</span>}</span> : <span className={s.faint}>None</span>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </section>

      {ch.length > 0 && (
        <section className={cx(s.box, "p-4")}>
          <div className={s.label}>Dropped out and newly named</div>
          <ul className="mt-2 grid gap-1.5">{ch.slice(0, 8).map((c) => (
            <li key={c.question_id + c.engine} className="flex flex-wrap items-center gap-2 text-[13px]"><span className={cx(s.pill, c.kind === "new" ? s.pRed : s.pDark)}>{c.kind === "new" ? "Newly named" : "Dropped out"}</span><span className="font-medium">{qText(c.question_id)}</span><span className={s.small}>on {engineName(c.engine)}</span></li>
          ))}</ul>
        </section>
      )}

      <section className={cx(s.box, "overflow-x-auto")}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"><span className="font-semibold">Every question, latest answer</span><span className={s.small}>Red: named and linked. Red outline: named, not linked. Click a cell to read the answer.</span></div>
        <table className={s.table}>
          <thead><tr><th>Question</th>{LIVE.map((e) => <th key={e.id} style={{ width: 150 }}>{e.name.split(" ")[0]}</th>)}</tr></thead>
          <tbody>{active.map((q) => (
            <tr key={q.id}>
              <td><div className="font-medium">{q.question}</div><div className={s.small}>{[q.region, q.language !== "English" && q.language, isBranded(q, self) && "Branded, not counted"].filter(Boolean).join(" · ")}</div></td>
              {LIVE.map((e) => {
                const p = pairs.get(`${q.id}|${e.id}`);
                if (!p) return <td key={e.id}><span className={cx(s.cell, s.cEmpty, "inline-block cursor-default")}>Not run</span></td>;
                const d = detect(p.now, self), rivalsNamed = rivals.filter((r) => detect(p.now, r).named).length;
                const label = p.now.status === "failed" ? "Failed" : d.named ? `Named${d.position ? ` #${d.position}` : ""}${d.linked ? " · linked" : d.linked === null ? " · no sources" : ""}` : "Not named";
                return (
                  <td key={e.id}>
                    <button className={cx(s.cell, p.now.status === "failed" && s.cFailed, d.named && (d.linked ? s.cNamed : s.cNamedNoLink))} onClick={() => onOpen(p.now.id)} aria-label={`${q.question} on ${e.name}: ${label}`}>
                      {label}{rivalsNamed > 0 && <span className="block opacity-75">{rivalsNamed} competitor{rivalsNamed > 1 ? "s" : ""}</span>}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}</tbody>
        </table>
      </section>
    </div>
  );
}

// ---------------- run panel ----------------
function RunPanel({ qs, onClose, onDone }: { qs: Question[]; onClose: () => void; onDone: () => void }) {
  const { ws } = useWorkspace();
  const { status } = useExtension();
  const toast = useToast();
  const ready = (e: Engine) => !!status?.searchKeys?.[e];
  const [pick, setPick] = useState<Engine[] | null>(null);
  const [prog, setProg] = useState<{ done: number; total: number; failed: number; stopped: boolean } | null>(null);
  const stop = useRef(false);
  const chosen = pick ?? LIVE.map((e) => e.id).filter((e) => status?.searchKeys?.[e]);
  const total = qs.length * chosen.length;
  const est = chosen.reduce((a, e) => ({ inTok: a.inTok + ESTIMATE[e].inTok * qs.length, outTok: a.outTok + ESTIMATE[e].outTok * qs.length, usd: a.usd + ESTIMATE[e].usd * qs.length }), { inTok: 0, outTok: 0, usd: 0 });

  async function one(q: Question, engine: Engine) {
    const prompt = promptFor(q, engine), country = engine === "gemini" ? "" : COUNTRY[q.region] ?? "";
    const base = { workspace_id: ws.id, question_id: q.id, engine, web_search: true, question_text: prompt, region: q.region, language: q.language };
    try {
      const res = await askExtension<{ model: string; raws: Record<string, unknown>[] }>("search", { engine, prompt, country }, 240000);
      const p = parseEngine(engine, res.raws);
      const st = statusOf(p);
      const { data, error } = await supabase().from("citation_runs").insert({ ...base, model: p.model || res.model, status: st, answer: p.answer, input_tokens: p.input_tokens, output_tokens: p.output_tokens, error: p.refused ? "The model declined to answer" : "" }).select("id").single();
      if (error) throw error;
      if (p.sources.length) await supabase().from("citation_sources").insert(p.sources.map((x, i) => ({ workspace_id: ws.id, run_id: data.id, url: x.url, title: x.title, domain: x.domain, cited: x.cited, sort: i })));
      return st !== "failed";
    } catch (e) {
      // A failed run is stored so it shows on the Runs tab; it never counts as "not named".
      await supabase().from("citation_runs").insert({ ...base, model: "", status: "failed", error: (e as Error).message.slice(0, 500) });
      return false;
    }
  }

  async function start() {
    stop.current = false;
    const queue = qs.flatMap((q) => chosen.map((e) => [q, e] as const));
    const n = queue.length;
    let done = 0, failed = 0;
    setProg({ done, total: n, failed, stopped: false });
    // Three at a time, so no provider is hit in a burst.
    await Promise.all([0, 1, 2].map(async () => {
      while (queue.length && !stop.current) {
        const [q, e] = queue.shift()!;
        if (!(await one(q, e))) failed++;
        done++;
        setProg({ done, total: n, failed, stopped: stop.current });
      }
    }));
    setProg({ done, total: n, failed, stopped: stop.current });
    haptic(); onDone();
    if (failed) toast(`${failed} of ${done} runs failed. The Runs tab shows why.`);
  }

  const running = !!prog && prog.done < prog.total && !prog.stopped;
  return (
    <div className={s.scrim} onMouseDown={() => !running && onClose()}>
      <aside className={s.drawer} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Run questions">
        <div className="flex items-center justify-between"><h2 className="text-[19px] font-semibold">Run questions</h2><button className={cx(s.btn, s.sm)} onClick={onClose} disabled={running} aria-label="Close"><X size={14} /></button></div>
        <p className={s.small}>Each of the {qs.length} active questions is asked as written, with web search on, from this browser with your own keys. Answers and sources are saved; keys are not.</p>
        <div className="mt-4 grid gap-2">
          {ENGINES.map((e) => (
            <label key={e.id} className={cx(s.box, "flex items-center gap-3 p-3", (!e.live || !ready(e.id)) && "opacity-60")}>
              <input type="checkbox" disabled={!e.live || !ready(e.id) || !!prog} checked={chosen.includes(e.id)} onChange={(ev) => setPick(ev.target.checked ? [...chosen, e.id] : chosen.filter((x) => x !== e.id))} />
              <span className="flex-1"><span className="block font-semibold">{e.name}</span><span className={s.small}>{!e.live ? "Not connected yet" : ready(e.id) ? ESTIMATE[e.id].note : "No key in this browser"}</span></span>
              {e.live && !ready(e.id) && <Link href={`/w/${ws.slug}/extension#search-keys`} className={cx(s.btn, s.sm)}>Add key</Link>}
            </label>
          ))}
        </div>
        {status && !status.installed && <p className="mt-3 text-[13px] text-[#d64545]">The Prax extension is not installed in this browser. Install 0.5.0 from the Extension page.</p>}
        <div className={cx(s.box, "mt-4 p-4")}>
          <div className={s.label}>Before you start</div>
          <p className="mt-1 text-[13.5px]"><span className={s.num}>{total}</span> runs · about <span className={s.num}>{Math.round(est.inTok / 1000)}k</span> input and <span className={s.num}>{Math.round(est.outTok / 1000)}k</span> output tokens · roughly <span className={s.num}>${est.usd.toFixed(2)}</span> on list prices</p>
          <p className={s.small}>A rough estimate. Web search pulls result pages into the input, so real costs vary. You pay each provider directly.</p>
        </div>
        {prog && (
          <div className="mt-4">
            <div className={s.bar}><div className={s.barFill} style={{ width: `${Math.round((prog.done / Math.max(1, prog.total)) * 100)}%` }} /></div>
            <p className={cx(s.small, "mt-1")}>{prog.done} of {prog.total} done{prog.failed ? ` · ${prog.failed} failed` : ""}{prog.stopped ? " · stopped" : ""}</p>
          </div>
        )}
        <div className="mt-5 flex gap-2">
          {running
            ? <button className={cx(s.btn, s.dark)} onClick={() => { stop.current = true; setProg({ ...prog!, stopped: true }); }}>Stop after the current ones</button>
            : <button className={cx(s.btn, s.red)} disabled={!total} onClick={start}>{prog ? "Run again" : `Start ${total} runs`}</button>}
        </div>
      </aside>
    </div>
  );
}

// ---------------- evidence ----------------
function Highlight({ text, self, rivals }: { text: string; self: Entity; rivals: Entity[] }) {
  const marks = [...findMatches(text, self.aliases).map((m) => ({ ...m, self: true })), ...rivals.flatMap((r) => findMatches(text, r.aliases).map((m) => ({ ...m, self: false })))].sort((a, b) => a.index - b.index);
  const out: React.ReactNode[] = []; let at = 0;
  marks.forEach((m, i) => { if (m.index < at) return; out.push(text.slice(at, m.index)); out.push(<mark key={i} className={m.self ? s.mark : s.markRival}>{m.text}</mark>); at = m.index + m.text.length; });
  out.push(text.slice(at));
  return <div className={s.answer}>{out}</div>;
}

function Evidence({ run, q, self, rivals, onClose }: { run: RunRow; q?: Question; self: Entity; rivals: Entity[]; onClose: () => void }) {
  const r: Run = { ...run, sources: [...(run.citation_sources ?? [])].sort((a, b) => a.sort - b.sort) };
  const d = detect(r, self);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className={s.scrim} onMouseDown={onClose}>
      <aside className={s.drawer} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Answer and sources">
        <div className="flex items-start justify-between gap-3">
          <div><div className={s.small}>{engineName(run.engine)} · {run.model || "model unknown"} · API with web search · {when(run.run_at)}</div><h2 className="mt-1 text-[17px] font-semibold">{q?.question ?? run.question_text}</h2></div>
          <button className={cx(s.btn, s.sm)} onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className={cx(s.pill, d.named ? s.pRed : s.pLine)}>{d.named ? "Named" : "Not named"}</span>
          <span className={cx(s.pill, d.linked ? s.pRed : s.pLine)}>{d.linked ? "Linked" : d.linked === null ? "No sources given" : "Not linked"}</span>
          {d.position && <span className={cx(s.pill, s.pDark)}>Position #{d.position}</span>}
          {rivals.filter((x) => detect(r, x).named).map((x) => <span key={x.id} className={cx(s.pill, s.pDark)}>{x.name}</span>)}
          {run.status === "failed" && <span className={cx(s.pill, s.pDark)}>Failed</span>}
        </div>
        {q && run.question_text && run.question_text !== q.question && <p className={cx(s.small, "mt-2")}>Sent as: {run.question_text}</p>}
        <div className={cx(s.box, "mt-4 p-4")}>{run.status === "failed" && !run.answer ? <p className={s.small}>{run.error || "No answer came back."}</p> : <Highlight text={run.answer} self={self} rivals={rivals} />}</div>
        <div className="mt-4">
          <div className={s.label}>Sources <span className={s.faint}>({r.sources.length})</span></div>
          {r.sources.length === 0 ? <p className={s.small}>The answer cited no sources, so whether it links to his sites is unknown.</p> : (
            <ul className="mt-2 grid gap-1.5">{r.sources.map((x) => (
              <li key={x.url} className="flex items-start gap-2 text-[13px]">
                <span className={cx(s.pill, x.cited ? s.pDark : s.pLine)}>{x.cited ? "Cited" : "Read"}</span>
                <a href={x.url} target="_blank" rel="noopener noreferrer" className="min-w-0 break-words hover:underline"><span className="font-medium">{x.domain}</span> <span className={s.small}>{x.title}</span></a>
                {d.ownedSources.some((o) => o.url === x.url) && <span className={cx(s.pill, s.pRed)}>Owned</span>}
              </li>
            ))}</ul>
          )}
        </div>
      </aside>
    </div>
  );
}

// ---------------- questions ----------------
function Questions({ qs, self, editable }: { qs: (Question & { sort: number })[]; self: Entity; editable: boolean }) {
  const { ws } = useWorkspace();
  const toast = useToast();
  const [f, setF] = useState({ question: "", topic: "", region: "Global", language: "English" });
  const [show, setShow] = useState<"active" | "archived">("active");
  async function add(e: React.FormEvent) {
    e.preventDefault(); if (!f.question.trim()) return;
    const { error } = await supabase().from("citation_questions").insert({ workspace_id: ws.id, question: f.question.trim(), topic: f.topic, region: f.region === "Global" ? "" : f.region, language: f.language, status: "active", sort: qs.length + 1 });
    if (error) toast(error.message); else { haptic(); toast("Question added"); setF({ ...f, question: "" }); }
  }
  async function setStatus(id: string, status: string) {
    const { error } = await supabase().from("citation_questions").update({ status }).eq("id", id);
    if (error) toast(error.message); else { haptic(); toast(status === "archived" ? "Archived. Its past runs stay." : "Active again", status === "archived" ? () => setStatus(id, "active") : undefined); }
  }
  const shown = qs.filter((q) => (show === "active" ? q.status === "active" : q.status !== "active"));
  return (
    <div className="flex flex-col gap-4">
      {editable && (
        <form onSubmit={add} className={cx(s.box, "grid gap-3 p-4 md:grid-cols-[1fr_160px_150px_130px_auto] md:items-end")}>
          <label className="grid gap-1.5"><span className={s.label}>Buyer question</span><input className={s.field} placeholder="Who builds stablecoin payment infrastructure for banks in the UAE?" value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} /></label>
          <label className="grid gap-1.5"><span className={s.label}>Topic</span><input className={s.field} value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} /></label>
          <label className="grid gap-1.5"><span className={s.label}>Region</span><select className={s.field} value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })}>{Object.keys(COUNTRY).filter(Boolean).map((r) => <option key={r}>{r}</option>)}</select></label>
          <label className="grid gap-1.5"><span className={s.label}>Language</span><select className={s.field} value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}>{LANGUAGES.map((l) => <option key={l}>{l}</option>)}</select></label>
          <button className={cx(s.btn, s.red)} disabled={!f.question.trim()}>Add</button>
          <p className={cx(s.small, "md:col-span-5")}>Write the question the way a buyer would, in its language. Region sets the search location for ChatGPT and Claude; Gemini takes no location, so it gets the region as a short hint. Questions that already name Shashi or Antier are kept but left out of the scores.</p>
        </form>
      )}
      <div className="flex gap-2">{(["active", "archived"] as const).map((v) => <button key={v} className={cx(s.btn, s.sm, show === v && s.dark)} onClick={() => setShow(v)}>{v === "active" ? "Active" : "Archived"}</button>)}</div>
      <div className={cx(s.box, "overflow-x-auto")}>
        <table className={s.table}>
          <thead><tr><th>Question</th><th>Topic</th><th>Region</th><th>Language</th><th /></tr></thead>
          <tbody>{shown.map((q) => (
            <tr key={q.id}>
              <td className="font-medium">{q.question}{isBranded(q, self) && <span className={cx(s.pill, s.pLine, "ml-2")}>Branded, not scored</span>}</td>
              <td className={s.small}>{q.topic}</td><td className={s.small}>{q.region || "Global"}</td><td className={s.small}>{q.language}</td>
              <td className="text-right">{editable && <button className={cx(s.btn, s.sm)} onClick={() => setStatus(q.id, q.status === "active" ? "archived" : "active")}>{q.status === "active" ? "Archive" : "Restore"}</button>}</td>
            </tr>
          ))}</tbody>
        </table>
        {!shown.length && <p className={cx(s.small, "p-6 text-center")}>{show === "active" ? "No active questions yet." : "Nothing archived."}</p>}
      </div>
    </div>
  );
}

// ---------------- runs ----------------
function Runs({ rows, qById, self, manual, onOpen }: { rows: RunRow[]; qById: Map<string, Question>; self: Entity; manual: Manual[]; onOpen: (r: RunRow) => void }) {
  const [shown, setShown] = useState(60);
  const weeks = useMemo(() => Object.entries(manual.reduce((m: Record<string, number>, r) => { if (r.cited) m[r.week_start] = (m[r.week_start] ?? 0) + 1; return m; }, {})).slice(0, 12), [manual]);
  return (
    <div className="flex flex-col gap-4">
      <div className={cx(s.box, "overflow-x-auto")}>
        <table className={s.table}>
          <thead><tr><th>When</th><th>Question</th><th>Engine</th><th>Result</th><th>Sources</th><th>Tokens</th></tr></thead>
          <tbody>{rows.slice(0, shown).map((r) => {
            const d = detect({ ...r, sources: r.citation_sources ?? [] }, self);
            return (
              <tr key={r.id}>
                <td className={cx(s.num, "whitespace-nowrap text-[12px]")}>{when(r.run_at)}</td>
                <td className="max-w-[380px]"><button className="text-left font-medium hover:underline" onClick={() => onOpen(r)}>{qById.get(r.question_id)?.question ?? r.question_text}</button></td>
                <td className={s.small}>{engineName(r.engine)}<br /><span className={s.faint}>{r.model}</span></td>
                <td>{r.status === "failed" ? <span className={cx(s.pill, s.pDark)} title={r.error}>Failed</span> : <span className={cx(s.pill, d.named ? s.pRed : s.pLine)}>{d.named ? `Named${d.position ? ` #${d.position}` : ""}` : "Not named"}</span>}{r.status === "failed" && r.error && <div className={cx(s.small, "mt-1 max-w-[260px]")}>{r.error}</div>}</td>
                <td className={s.num}>{r.citation_sources?.length ?? 0}</td>
                <td className={cx(s.num, "text-[12px]")}>{r.input_tokens ? `${(r.input_tokens / 1000).toFixed(1)}k / ${(r.output_tokens / 1000).toFixed(1)}k` : "–"}</td>
              </tr>
            );
          })}</tbody>
        </table>
        {!rows.length && <p className={cx(s.small, "p-6 text-center")}>No runs in the last 90 days.</p>}
        {rows.length > shown && <div className="p-2"><button className={cx(s.btn, s.sm, "w-full")} onClick={() => setShown(shown + 100)}>Show more</button></div>}
      </div>
      {weeks.length > 0 && (
        <div className={cx(s.box, "p-4")}>
          <div className={s.label}>Manual history</div>
          <p className={s.small}>Ticks entered by hand before automated runs, kept for reference and not mixed into the scores.</p>
          <div className="mt-2 flex flex-wrap gap-2">{weeks.map(([w, n]) => <span key={w} className={cx(s.pill, s.pLine)}>Week of {fmtDay(w, { day: "numeric", month: "short" })}: {n} cited</span>)}</div>
        </div>
      )}
    </div>
  );
}

// ---------------- sources ----------------
function Sources({ runs, self, rivals, editable }: { runs: Run[]; self: Entity; rivals: Entity[]; editable: boolean }) {
  const { ws } = useWorkspace();
  const toast = useToast();
  const [made, setMade] = useState<Set<string>>(new Set());
  const domains = useMemo(() => {
    const m = new Map<string, { cited: number; read: number; selfNamed: number }>();
    for (const r of runs) {
      if (r.status === "failed") continue;
      const named = detect(r, self).named;
      for (const x of r.sources) { const e = m.get(x.domain) ?? { cited: 0, read: 0, selfNamed: 0 }; if (x.cited) e.cited++; else e.read++; if (named) e.selfNamed++; m.set(x.domain, e); }
    }
    return [...m.entries()].sort((a, b) => b[1].cited - a[1].cited || b[1].read - a[1].read).slice(0, 60);
  }, [runs, self]);
  const gaps = useMemo(() => citationGaps(runs, self, rivals), [runs, self, rivals]);
  const li = useMemo(() => linkedinCited(runs, self), [runs, self]);
  const owned = (d: string) => self.domains.some((x) => { const h = x.split("/")[0]; return !x.includes("/") && (d === h || d.endsWith("." + h)); });

  async function toIdea(g: { domain: string; competitors: string[] }) {
    const { error } = await supabase().from("posts").insert({ workspace_id: ws.id, title: `Earn a mention on ${g.domain}`, status: "Idea", topic: "AI citations", resource: `AI answers cite ${g.domain} when they name ${g.competitors.join(", ")}, and never when they name Antier. Pitch a guest piece, a quote or data there, or post on the topic it covers.` });
    if (error) toast(error.message); else { haptic(); setMade(new Set([...made, g.domain])); toast("Added as an idea in Content"); }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className={cx(s.box, "overflow-x-auto")}>
        <div className="px-4 py-3"><span className="font-semibold">Sites the AI relies on</span> <span className={s.small}>last 90 days</span></div>
        <table className={s.table}>
          <thead><tr><th>Domain</th><th>Cited</th><th>Read only</th><th>In answers naming him</th></tr></thead>
          <tbody>{domains.map(([d, e]) => (
            <tr key={d}><td className="font-medium">{d}{owned(d) && <span className={cx(s.pill, s.pRed, "ml-2")}>Owned</span>}</td><td className={s.num}>{e.cited}</td><td className={s.num}>{e.read}</td><td className={s.num}>{e.selfNamed}</td></tr>
          ))}</tbody>
        </table>
        {!domains.length && <p className={cx(s.small, "p-6 text-center")}>No sources yet.</p>}
      </div>
      <div className="flex flex-col gap-4">
        <section className={cx(s.box, "p-4")}>
          <div className={s.label}>Citation gaps</div>
          <p className={s.small}>Sites the AI cites when it names a competitor, and never when it names Antier.</p>
          {!rivals.length ? <p className={cx(s.small, "mt-2")}>Add competitors to see gaps.</p> : !gaps.length ? <p className={cx(s.small, "mt-2")}>No gaps found yet.</p> : (
            <ul className="mt-2 grid gap-2">{gaps.slice(0, 12).map((g) => (
              <li key={g.domain} className="flex items-center gap-2 border-t border-[#ececec] pt-2 text-[13px]">
                <span className="min-w-0 flex-1"><span className="font-medium">{g.domain}</span><span className={cx(s.small, "block")}>{g.runs} answer{g.runs > 1 ? "s" : ""} · {g.competitors.join(", ")}</span></span>
                {editable && <button className={cx(s.btn, s.sm, s.red)} disabled={made.has(g.domain)} onClick={() => toIdea(g)}>{made.has(g.domain) ? "Added" : "Make an idea"}</button>}
              </li>
            ))}</ul>
          )}
        </section>
        <section className={cx(s.box, "p-4")}>
          <div className={s.label}>His LinkedIn in AI answers</div>
          {li.length ? <ul className="mt-2 grid gap-1.5">{li.slice(0, 10).map(({ run, source }, i) => <li key={i} className="text-[13px]"><a className="font-medium hover:underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.title || source.url.replace(/^https?:\/\/(www\.)?/, "")}</a><span className={cx(s.small, "block")}>{engineName(run.engine)} · {fmtDay(ymd(new Date(run.run_at)), { day: "numeric", month: "short" })}</span></li>)}</ul>
            : <p className={cx(s.small, "mt-1")}>No answer has cited his LinkedIn posts or articles yet. His profile URL must be in the owned list under Competitors.</p>}
        </section>
      </div>
    </div>
  );
}

// ---------------- competitors ----------------
function Competitors({ ents, runs, qs, self, editable }: { ents: (Entity & { sort: number })[]; runs: Run[]; qs: Question[]; self: Entity; editable: boolean }) {
  const { ws } = useWorkspace();
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, { name: string; aliases: string; domains: string }>>({});
  const [nf, setNf] = useState({ name: "", aliases: "", domains: "" });
  const rivals = ents.filter((e) => e.kind === "competitor");
  const board = [self, ...rivals].map((e) => ({ e, sov: shareOfVoice(runs, qs, e, self), per: LIVE.map((x) => shareOfVoice(runs, qs, e, self, x.id)) })).sort((a, b) => b.sov.named - a.sov.named);
  const val = (e: Entity) => draft[e.id] ?? { name: e.name, aliases: e.aliases.join(", "), domains: e.domains.join(", ") };

  async function save(e: Entity) {
    const v = val(e);
    const { error } = await supabase().from("citation_entities").update({ name: v.name.trim() || e.name, aliases: list(v.aliases), domains: list(v.domains) }).eq("id", e.id);
    if (error) toast(error.message); else { haptic(); toast("Saved. Every past run is re-scored."); setDraft((d) => { const n = { ...d }; delete n[e.id]; return n; }); }
  }
  async function add() {
    const { error } = await supabase().from("citation_entities").insert({ workspace_id: ws.id, kind: "competitor", name: nf.name.trim(), aliases: list(nf.aliases || nf.name), domains: list(nf.domains), sort: rivals.length + 1 });
    if (error) toast(error.message); else { haptic(); toast("Competitor added"); setNf({ name: "", aliases: "", domains: "" }); }
  }
  async function remove(e: Entity) {
    const { error } = await supabase().from("citation_entities").delete().eq("id", e.id);
    if (error) toast(error.message); else { haptic(); toast(`${e.name} removed`); }
  }
  return (
    <div className="flex flex-col gap-4">
      <section className={cx(s.box, "overflow-x-auto")}>
        <div className="px-4 py-3"><span className="font-semibold">Leaderboard</span> <span className={s.small}>named on the same questions, latest run; branded questions and failed runs left out</span></div>
        <table className={s.table}>
          <thead><tr><th>Who</th><th>All engines</th>{LIVE.map((x) => <th key={x.id}>{x.name.split(" ")[0]}</th>)}</tr></thead>
          <tbody>{board.map(({ e, sov, per }) => (
            <tr key={e.id}>
              <td className="font-semibold">{e.name}{e.kind === "self" && <span className={cx(s.pill, s.pRed, "ml-2")}>You</span>}</td>
              <td><span className={s.num}>{sov.named}</span> of {sov.total}{sov.pct != null && <span className={s.small}> · {sov.pct}%</span>}<div className={cx(s.bar, "mt-1 w-28")}><div className={s.barFill} style={{ width: `${sov.pct ?? 0}%`, background: e.kind === "self" ? "#d64545" : "#141414" }} /></div></td>
              {per.map((p, i) => <td key={i} className={s.num}>{p.total ? `${p.named}/${p.total}` : "–"}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </section>
      <section className={cx(s.box, "p-4")}>
        <div className={s.label}>Who is tracked</div>
        <p className={s.small}>Names match as whole words. Owned domains count as linked when cited; a LinkedIn profile path covers that person&apos;s posts too. Edits re-score every past run. Up to 8 competitors keeps the comparison readable.</p>
        <div className="mt-3 grid gap-3">
          {ents.map((e) => {
            const v = val(e);
            return (
              <div key={e.id} className="grid gap-2 border-t border-[#ececec] pt-3 md:grid-cols-[180px_1fr_1fr_auto] md:items-end">
                <label className="grid gap-1"><span className={s.label}>{e.kind === "self" ? "You" : "Competitor"}</span><input className={s.field} disabled={!editable} value={v.name} onChange={(ev) => setDraft({ ...draft, [e.id]: { ...v, name: ev.target.value } })} /></label>
                <label className="grid gap-1"><span className={s.label}>Names</span><input className={s.field} disabled={!editable} value={v.aliases} onChange={(ev) => setDraft({ ...draft, [e.id]: { ...v, aliases: ev.target.value } })} /></label>
                <label className="grid gap-1"><span className={s.label}>Owned domains</span><input className={s.field} disabled={!editable} value={v.domains} onChange={(ev) => setDraft({ ...draft, [e.id]: { ...v, domains: ev.target.value } })} /></label>
                {editable && <span className="flex gap-1.5">{draft[e.id] && <button className={cx(s.btn, s.sm, s.red)} onClick={() => save(e)}>Save</button>}{e.kind === "competitor" && <button className={cx(s.btn, s.sm)} onClick={() => remove(e)}>Remove</button>}</span>}
              </div>
            );
          })}
          {editable && rivals.length < 8 && (
            <div className="grid gap-2 border-t border-[#ececec] pt-3 md:grid-cols-[180px_1fr_1fr_auto] md:items-end">
              <label className="grid gap-1"><span className={s.label}>New competitor</span><input className={s.field} placeholder="Company or founder" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} /></label>
              <label className="grid gap-1"><span className={s.label}>Names</span><input className={s.field} placeholder="Defaults to the name" value={nf.aliases} onChange={(e) => setNf({ ...nf, aliases: e.target.value })} /></label>
              <label className="grid gap-1"><span className={s.label}>Owned domains</span><input className={s.field} placeholder="example.com" value={nf.domains} onChange={(e) => setNf({ ...nf, domains: e.target.value })} /></label>
              <button className={cx(s.btn, s.sm, s.dark)} disabled={!nf.name.trim()} onClick={add}>Add</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
