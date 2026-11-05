"use client";
// The parts of AI citations built on top of the runs: alerts, next moves, profile consistency, question sets,
// suggested questions, recommendations with lift, the draft test, Ask, the facts sheet, share links,
// comment targets and the tone and fact check. AI work goes through the extension with the user's own key.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { X, Send } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useWorkspace, today } from "@/lib/workspace";
import { useToast, haptic } from "@/components/toaster";
import { askExtension, parseJSON, useExtension } from "@/lib/bridge";
import { upsertToday } from "@/components/content/shared";
import { type ReportSnapshot } from "@/components/citations-report";
import {
  ENGINES, alerts, recommend, lift, shareOfVoice, profileConsistency, starterQuestions, askContext, judgePrompt, parseJudge, factIssues,
  parseEngine, detect, setRollup, citationGaps, changes, linkedinCited, expiryFrom, owns, EMPTY_FACTS,
  type Run, type Question, type Entity, type Facts, type Rec, type Engine,
} from "@/lib/citations";
import s from "./citations.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");
const LIVE = ENGINES.filter((e) => e.live);
const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (t: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));
const PILLARS = ["Money That Moves Itself", "The Liquid Balance Sheet", "Regulation-to-Architecture", "Production-Grade or Nothing", "Agentic Finance", "Build, Buy or Partner"];

export type RecRow = { id: string; kind: "profile" | "elsewhere"; title: string; detail: string; question_ids: string[]; status: string; baseline: { named: number; total: number } | null; accepted_at: string | null; post_id: string | null };
export type SetRow = { id: string; name: string; sort: number };
const isRow = (r: Rec | RecRow): r is RecRow => "id" in r;

// ---------------- side panel and modal frames ----------------
export function Side({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className={s.scrim} onMouseDown={onClose}>
      <aside className={s.drawer} style={wide ? { maxWidth: 760 } : undefined} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-[19px] font-semibold">{title}</h2><button className={cx(s.btn, s.sm)} onClick={onClose} aria-label="Close"><X size={14} /></button></div>
        {children}
      </aside>
    </div>
  );
}

// ---------------- the tone and fact check ----------------
/** One small call on the main AI key after a run; the founding-year check runs without AI too. */
export async function judgeRun(run: { id: string; answer: string }, facts: Partial<Facts>, self: Entity) {
  let sentiment = "", issues = factIssues(run.answer, facts, self.aliases);
  try {
    const out = await askExtension<string>("ai", { plain: true, kind: "studio", rules: "You check AI answers about a company for tone and factual errors. Be literal and strict. Never invent issues.", user: judgePrompt(run.answer, facts, self.name) });
    const j = parseJudge(out);
    if (j) { sentiment = j.sentiment; const seen = new Set(issues.map((i) => i.said)); issues = [...issues, ...j.issues.filter((i) => !seen.has(i.said))]; }
  } catch { /* no key or no extension: keep the check Prax can do alone */ }
  await supabase().from("citation_runs").update({ sentiment, fact_issues: issues, judged_at: new Date().toISOString() }).eq("id", run.id);
  return { sentiment, issues };
}

// ---------------- overview cards ----------------
const ALERT_PILL: Record<string, string> = { new: s.pRed, dropped: s.pDark, wrong_fact: s.pRed, overtook: s.pDark };
const ALERT_LABEL: Record<string, string> = { new: "Newly named", dropped: "Dropped out", wrong_fact: "Wrong fact", overtook: "Overtaken" };
export function AlertsCard({ runs, qs, self, rivals }: { runs: Run[]; qs: Question[]; self: Entity; rivals: Entity[] }) {
  const list = useMemo(() => alerts(runs, qs, self, rivals), [runs, qs, self, rivals]);
  return (
    <section className={cx(s.box, "p-4")}>
      <div className="flex items-center justify-between"><span className={s.label}>Alerts</span><span className={s.small}>since the previous run</span></div>
      {!list.length ? <p className={cx(s.small, "mt-2")}>Nothing changed. Alerts appear when an answer stops or starts naming him, gets a fact wrong, or a competitor overtakes.</p> : (
        <ul className="mt-2 grid gap-2">{list.slice(0, 8).map((a, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px]"><span className={cx(s.pill, ALERT_PILL[a.kind])}>{ALERT_LABEL[a.kind]}</span><span className="min-w-0 pt-0.5">{a.text.replace(/^(Newly named|Dropped out): /, "")}{a.engine && <span className={s.small}> · {ENGINES.find((e) => e.id === a.engine)?.name}</span>}</span></li>
        ))}</ul>
      )}
    </section>
  );
}

export function NextMoves({ recs, computed, onAll }: { recs: RecRow[]; computed: Rec[]; onAll: () => void }) {
  const open = [...recs.filter((r) => r.status === "open" || r.status === "accepted"), ...computed.filter((c) => !recs.some((r) => r.title === c.title)).map((c) => ({ ...c, status: "suggested" }))].slice(0, 3);
  return (
    <section className={cx(s.box, "p-4")}>
      <div className="flex items-center justify-between"><span className={s.label}>Your next moves</span><button className={cx(s.btn, s.sm)} onClick={onAll}>All actions</button></div>
      {!open.length ? <p className={cx(s.small, "mt-2")}>No actions yet. They appear once questions have been run.</p> : (
        <ul className="mt-2 grid gap-2.5">{open.map((r, i) => (
          <li key={i} className="border-t border-[#ececec] pt-2.5 first:border-0 first:pt-0"><span className={cx(s.pill, r.kind === "profile" ? s.pRed : s.pDark)}>{r.kind === "profile" ? "On his profile" : "Elsewhere"}</span><div className="mt-1 text-[13.5px] font-medium">{r.title}</div></li>
        ))}</ul>
      )}
    </section>
  );
}

export function ProfileCard({ facts, onFacts }: { facts: Partial<Facts>; onFacts: () => void }) {
  const { ws } = useWorkspace();
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    supabase().from("profile_docs").select("raw_text").eq("workspace_id", ws.id).eq("subject", "self").order("created_at", { ascending: false }).limit(1)
      .then(({ data }: { data: { raw_text: string }[] | null }) => setText(`${ws.headline}\n${data?.[0]?.raw_text ?? ""}`));
  }, [ws.id, ws.headline]);
  const rows = useMemo(() => (text == null ? [] : profileConsistency(facts, text)), [facts, text]);
  const missing = rows.filter((r) => !r.found);
  const hasFacts = Object.values(facts).some((v) => v && String(v).trim());
  return (
    <section className={cx(s.box, "p-4")}>
      <div className="flex items-center justify-between"><span className={s.label}>His LinkedIn profile</span><Link href={`/w/${ws.slug}/profile`} className={cx(s.btn, s.sm)}>Profile Studio</Link></div>
      <p className={cx(s.small, "mt-1")}>AI tools read his headline and About section. They should say the same things as the facts sheet.</p>
      {!hasFacts ? <button className={cx(s.btn, s.sm, s.dark, "mt-3")} onClick={onFacts}>Fill in the facts sheet</button>
        : !rows.length ? <p className={cx(s.small, "mt-2")}>Add titles, products or regions to the facts sheet to check them.</p>
        : missing.length === 0 ? <p className="mt-2 text-[13px] font-medium">Every fact appears on his profile.</p>
        : <ul className="mt-2 grid gap-1">{missing.slice(0, 6).map((r) => <li key={r.fact + r.value} className="text-[13px]"><span className={cx(s.pill, s.pLine)}>{r.fact}</span> <span className="font-medium">{r.value}</span> <span className={s.small}>is not on his profile</span></li>)}</ul>}
    </section>
  );
}

// ---------------- questions: quick setup, suggestions, sets ----------------
async function draftQuestions(n: number, existing: string[], topics: string[], headline: string) {
  const out = await askExtension<string>("ai", { plain: true, kind: "studio", rules: "You write the questions a senior buyer at a bank, fintech or asset manager types into an AI assistant when looking for a technology partner or expert. Never mention any company by name.", user: `Profile: ${headline}\nTopics: ${topics.join(", ")}\nAlready tracked:\n${existing.slice(0, 60).join("\n") || "(none)"}\n\nWrite ${n} new questions a buyer would ask, spread across these topics, mostly about the UAE, Saudi Arabia and India, a few global. Plain words, no brand names. Return only JSON: {"questions": [{"question": "...", "topic": "one of the topics", "region": "UAE"}]}` });
  const j = parseJSON<{ questions: { question: string; topic: string; region?: string }[] }>(out);
  return (j?.questions ?? []).filter((q) => q.question && !existing.some((e) => e.toLowerCase() === q.question.toLowerCase())).slice(0, n);
}

export function QuickSetup({ count }: { count: number }) {
  const { ws } = useWorkspace();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    let rows: { question: string; topic: string; region?: string }[] = [], source = "ai";
    try { rows = await draftQuestions(20, [], PILLARS, ws.headline); } catch { /* no key: use the starter list */ }
    if (!rows.length) { rows = starterQuestions("the UAE").map((q) => ({ ...q, region: "UAE" })); source = "starter"; }
    const { error } = await supabase().from("citation_questions").insert(rows.map((q, i) => ({ workspace_id: ws.id, question: q.question, topic: q.topic, region: q.region && q.region !== "Global" ? q.region : "", language: "English", status: "suggested", source, sort: count + i + 1 })));
    setBusy(false);
    if (error) toast(error.message); else { haptic(); toast(`${rows.length} questions drafted. Approve the ones to track.`); }
  }
  return (
    <section className={cx(s.panel, "flex flex-wrap items-center gap-4 p-5")}>
      <div className="min-w-[240px] flex-1"><div className="text-[17px] font-semibold">Start with 20 buyer questions</div><p className="text-[13px] text-[#cfcfcf]">Prax drafts them from his pillars and profile with your AI key, or uses a ready list if no key is set. Nothing is tracked until you approve it.</p></div>
      <button className={cx(s.btn, s.red)} disabled={busy} onClick={run}>{busy ? "Drafting" : "Draft 20 questions"}</button>
    </section>
  );
}

export function Suggested({ qs }: { qs: (Question & { sort: number })[] }) {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const sug = qs.filter((q) => q.status === "suggested");
  async function setStatus(ids: string[], status: string) {
    const { error } = await supabase().from("citation_questions").update({ status }).in("id", ids);
    if (error) toast(error.message); else { haptic(); toast(status === "active" ? `${ids.length} approved` : `${ids.length} dismissed`, () => { supabase().from("citation_questions").update({ status: "suggested" }).in("id", ids).then(); }); }
  }
  async function more() {
    setBusy(true);
    try {
      const rows = await draftQuestions(8, qs.map((q) => q.question), PILLARS, ws.headline);
      if (!rows.length) throw new Error("No new questions came back. Try again.");
      const { error } = await supabase().from("citation_questions").insert(rows.map((q, i) => ({ workspace_id: ws.id, question: q.question, topic: q.topic, region: q.region && q.region !== "Global" ? q.region : "", language: "English", status: "suggested", source: "ai", sort: qs.length + i + 1 })));
      if (error) throw error;
      haptic(); toast(`${rows.length} questions suggested`);
    } catch (e) { toast((e as Error).message); }
    setBusy(false);
  }
  if (!can("editor") && !sug.length) return null;
  return (
    <section className={cx(s.box, "p-4")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><span className={s.label}>Suggested questions</span> <span className={s.small}>{sug.length ? `${sug.length} waiting for approval` : "none waiting"}</span></div>
        {can("editor") && <span className="flex gap-1.5">{sug.length > 1 && <button className={cx(s.btn, s.sm, s.red)} onClick={() => setStatus(sug.map((q) => q.id), "active")}>Approve all</button>}<button className={cx(s.btn, s.sm)} disabled={busy} onClick={more}>{busy ? "Thinking" : "Suggest more"}</button></span>}
      </div>
      {sug.length > 0 && <ul className="mt-2 grid gap-1.5">{sug.map((q) => (
        <li key={q.id} className="flex flex-wrap items-center gap-2 border-t border-[#ececec] pt-1.5 text-[13px]">
          <span className="min-w-0 flex-1 font-medium">{q.question}<span className={s.small}> · {q.topic}{q.region ? ` · ${q.region}` : ""}</span></span>
          {can("editor") && <><button className={cx(s.btn, s.sm, s.dark)} onClick={() => setStatus([q.id], "active")}>Approve</button><button className={cx(s.btn, s.sm)} onClick={() => setStatus([q.id], "archived")}>Dismiss</button></>}
        </li>
      ))}</ul>}
    </section>
  );
}

export function SetsBar({ sets, qs, runs, self, value, onChange }: { sets: SetRow[]; qs: Question[]; runs: Run[]; self: Entity; value: string; onChange: (v: string) => void }) {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const active = qs.filter((q) => q.status === "active");
  const chips = [{ id: "all", name: "All questions", r: shareOfVoice(runs, active, self, self) }, ...sets.map((x) => ({ id: x.id, name: x.name, r: setRollup(active, x.id, runs, self) })), { id: "none", name: "No set", r: setRollup(active, null, runs, self) }];
  async function add() {
    const { error } = await supabase().from("citation_sets").insert({ workspace_id: ws.id, name: name.trim(), sort: sets.length + 1 });
    if (error) toast(error.message); else { haptic(); toast("Set added"); setName(""); setAdding(false); }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button key={c.id} onClick={() => onChange(c.id)} className={cx(s.btn, s.sm, value === c.id && s.dark)} aria-pressed={value === c.id}>
          {c.name}<span className={cx(s.num, "ml-1 opacity-75")}>{c.r.total ? `${c.r.named}/${c.r.total}` : "–"}</span>
        </button>
      ))}
      {can("editor") && (adding
        ? <span className="flex gap-1.5"><input autoFocus className={cx(s.field, "h-[30px] w-44")} placeholder="Set name, e.g. GCC banks" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) add(); if (e.key === "Escape") setAdding(false); }} /><button className={cx(s.btn, s.sm, s.red)} disabled={!name.trim()} onClick={add}>Add</button></span>
        : <button className={cx(s.btn, s.sm)} onClick={() => setAdding(true)}>+ New set</button>)}
    </div>
  );
}

// ---------------- actions: recommendations with lift ----------------
export function Actions({ recs, runs, qs, self, rivals }: { recs: RecRow[]; runs: Run[]; qs: Question[]; self: Entity; rivals: Entity[] }) {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const computed = useMemo(() => recommend(runs, qs, self, rivals), [runs, qs, self, rivals]);
  const fresh = computed.filter((c) => !recs.some((r) => r.title === c.title));
  const scoreOn = (ids: string[]) => shareOfVoice(runs, qs.filter((q) => ids.includes(q.id)), self, self);

  async function accept(r: Rec | RecRow) {
    const base = scoreOn(r.question_ids);
    let postId: string | null = null;
    if (r.kind === "profile") {
      const { data } = await supabase().from("posts").insert({ workspace_id: ws.id, title: r.title.replace(/^Publish a LinkedIn article that answers: /, "LinkedIn article: "), format: "Article", status: "Idea", topic: "AI citations", resource: r.detail }).select("id").single();
      postId = data?.id ?? null;
    } else {
      await upsertToday([{ day: today(), kind: "custom", idx: 3700 + (Math.abs([...r.title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % 100), title: r.title, note: "citations:rec" }], ws.id);
    }
    const row = { status: "accepted", baseline: { named: base.named, total: base.total }, accepted_at: new Date().toISOString(), post_id: postId };
    const { error } = isRow(r) ? await supabase().from("citation_recs").update(row).eq("id", r.id) : await supabase().from("citation_recs").insert({ workspace_id: ws.id, kind: r.kind, title: r.title, detail: r.detail, question_ids: r.question_ids, ...row });
    if (error) toast(error.message); else { haptic(); toast(r.kind === "profile" ? "Accepted. The idea is in Content Studio, Library." : "Accepted. It is on Today."); }
  }
  async function setStatus(r: Rec | RecRow, status: string) {
    const { error } = isRow(r) ? await supabase().from("citation_recs").update({ status }).eq("id", r.id) : await supabase().from("citation_recs").insert({ workspace_id: ws.id, kind: r.kind, title: r.title, detail: r.detail, question_ids: r.question_ids, status });
    if (error) toast(error.message); else { haptic(); toast(status === "done" ? "Marked done" : "Dismissed"); }
  }
  async function more() {
    setBusy(true);
    try {
      const ctx = askContext(runs, qs, self, rivals);
      const out = await askExtension<string>("ai", { plain: true, kind: "studio", rules: "You advise a founder of a B2B fintech engineering firm on getting named by AI assistants. Recommend concrete actions only: things to publish on his LinkedIn, and places to be mentioned elsewhere. Never suggest spam, paid placements disguised as editorial, or anything against a regulator.", user: `DATA:\n${ctx}\n\nGive up to 5 new recommendations. Return only JSON: {"recs": [{"kind": "profile", "title": "short action", "detail": "one or two sentences why"}]}` });
      const j = parseJSON<{ recs: { kind: string; title: string; detail: string }[] }>(out);
      const rows = (j?.recs ?? []).filter((x) => x.title && (x.kind === "profile" || x.kind === "elsewhere"));
      if (!rows.length) throw new Error("No recommendations came back. Try again.");
      const { error } = await supabase().from("citation_recs").insert(rows.map((x) => ({ workspace_id: ws.id, kind: x.kind, title: x.title, detail: x.detail, question_ids: [], status: "open" })));
      if (error) throw error;
      haptic(); toast(`${rows.length} recommendations added`);
    } catch (e) { toast((e as Error).message); }
    setBusy(false);
  }

  const groups = (["profile", "elsewhere"] as const).map((k) => ({ k, items: [...recs.filter((r) => r.kind === k && r.status !== "dismissed"), ...fresh.filter((c) => c.kind === k)] }));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={s.small}>What to publish and where to be mentioned, each tied to the questions it should move. Lift compares the named share on those questions when you accepted it with now.</p>
        {can("editor") && <button className={cx(s.btn, s.sm, s.dark)} disabled={busy} onClick={more}>{busy ? "Thinking" : "Suggest more with AI"}</button>}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map(({ k, items }) => (
          <section key={k} className={cx(s.box, "p-4")}>
            <div className={s.label}>{k === "profile" ? "On his profile" : "Elsewhere"}</div>
            {!items.length ? <p className={cx(s.small, "mt-2")}>Nothing here yet.</p> : (
              <ul className="mt-2 grid gap-3">{items.map((r, i) => {
                const row = isRow(r) ? r : null, l = row?.status === "accepted" || row?.status === "done" ? lift(row.baseline, scoreOn(r.question_ids)) : null;
                return (
                  <li key={row?.id ?? i} className="border-t border-[#ececec] pt-3 first:border-0 first:pt-0">
                    <div className="flex flex-wrap items-center gap-1.5"><span className={cx(s.pill, row?.status === "accepted" ? s.pRed : row?.status === "done" ? s.pDark : s.pLine)}>{row ? row.status[0].toUpperCase() + row.status.slice(1) : "Suggested"}</span>{r.question_ids.length > 0 && <span className={s.small}>{r.question_ids.length} question{r.question_ids.length > 1 ? "s" : ""}</span>}{l && <span className={cx(s.small, "font-semibold")} style={{ color: l.delta > 0 ? "#d64545" : undefined }}>{l.before}% to {l.after}% named</span>}</div>
                    <div className="mt-1 text-[13.5px] font-semibold">{r.title}</div>
                    <p className={s.small}>{r.detail}</p>
                    {can("editor") && <div className="mt-2 flex flex-wrap gap-1.5">
                      {(!row || row.status === "open") && <button className={cx(s.btn, s.sm, s.red)} onClick={() => accept(r)}>Accept</button>}
                      {row?.status === "accepted" && <button className={cx(s.btn, s.sm, s.dark)} onClick={() => setStatus(r, "done")}>Mark done</button>}
                      {row?.post_id && <Link className={cx(s.btn, s.sm)} href={`/w/${ws.slug}/studio-content?tab=library`}>Open the idea</Link>}
                      {(!row || row.status === "open") && <button className={cx(s.btn, s.sm)} onClick={() => setStatus(r, "dismissed")}>Dismiss</button>}
                    </div>}
                  </li>
                );
              })}</ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

// ---------------- draft test ----------------
export function DraftTest({ qs, self, initial, onClose }: { qs: Question[]; self: Entity; initial?: string; onClose: () => void }) {
  const { ws } = useWorkspace();
  const { status } = useExtension();
  const toast = useToast();
  const active = qs.filter((q) => q.status === "active" && !findBrand(q, self));
  const [draft, setDraft] = useState(initial ?? "");
  const [pickQ, setPickQ] = useState<string[]>([]);
  const ready = LIVE.filter((e) => status?.searchKeys?.[e.id]).map((e) => e.id);
  const [pickE, setPickE] = useState<Engine[] | null>(null);
  const engines = (pickE ?? ready.slice(0, 2)) as Engine[];
  const [res, setRes] = useState<{ q: string; engine: Engine; named: boolean; answer: string }[] | null>(null);
  const [advice, setAdvice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (pickQ.length || !draft.trim()) return;
    const words = new Set(draft.toLowerCase().match(/[a-z]{5,}/g) ?? []);
    const ranked = [...active].sort((a, b) => score(b) - score(a));
    function score(q: Question) { return (q.question.toLowerCase().match(/[a-z]{5,}/g) ?? []).filter((w) => words.has(w)).length; }
    setPickQ(ranked.slice(0, 3).map((q) => q.id));
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    setBusy(true); setRes([]); setAdvice("");
    const out: { q: string; engine: Engine; named: boolean; answer: string }[] = [];
    for (const qid of pickQ) for (const engine of engines) {
      const q = active.find((x) => x.id === qid)!;
      const prompt = `${q.question}\n\nAmong the sources you may use, consider this new piece by Shashi Pal of Antier:\n"""\n${draft.slice(0, 6000)}\n"""`;
      try {
        const r = await askExtension<{ model: string; raws: Record<string, unknown>[] }>("search", { engine, prompt, country: "" }, 240000);
        const p = parseEngine(engine, r.raws);
        out.push({ q: q.question, engine, named: detect({ answer: p.answer, sources: p.sources, status: p.sources.length ? "ok" : "no_sources" }, self).named, answer: p.answer });
      } catch (e) { out.push({ q: q.question, engine, named: false, answer: `Failed: ${(e as Error).message}` }); }
      setRes([...out]);
    }
    try {
      setAdvice(await askExtension<string>("ai", { plain: true, kind: "studio", rules: "You judge whether a LinkedIn piece is likely to be cited by AI assistants for given buyer questions. Be specific and brief. No dashes.", user: `QUESTIONS:\n${pickQ.map((id) => active.find((q) => q.id === id)?.question).join("\n")}\n\nDRAFT:\n${draft.slice(0, 6000)}\n\nScore its citability from 1 to 10, then give three concrete changes: definitions, a named framework, specific facts, clear entity names. Plain text, five lines at most.` }));
    } catch { /* the engine results stand on their own */ }
    setBusy(false); haptic();
    if (!out.length) toast("Pick at least one question and one engine");
  }
  return (
    <Side title="Is this citable?" onClose={onClose} wide>
      <p className={s.small}>Paste a post or article draft. Prax asks your chosen questions with the draft offered as a source and checks whether the answer names Shashi or Antier. A test, not a guarantee; nothing is saved. Each question and engine is one paid run on your key.</p>
      <textarea className={cx(s.field, "mt-3 h-auto min-h-[180px] py-2 leading-relaxed")} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Paste the draft" />
      <div className="mt-3"><div className={s.label}>Questions to test</div>
        <div className="mt-1.5 grid max-h-[180px] gap-1 overflow-auto">{active.map((q) => (
          <label key={q.id} className="flex items-start gap-2 text-[13px]"><input type="checkbox" checked={pickQ.includes(q.id)} onChange={(e) => setPickQ(e.target.checked ? [...pickQ, q.id].slice(-5) : pickQ.filter((x) => x !== q.id))} /> {q.question}</label>
        ))}{!active.length && <span className={s.small}>Add and approve questions first.</span>}</div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3"><span className={s.label}>Engines</span>{LIVE.map((e) => (
        <label key={e.id} className={cx("flex items-center gap-1.5 text-[13px]", !ready.includes(e.id) && "opacity-50")}><input type="checkbox" disabled={!ready.includes(e.id)} checked={engines.includes(e.id)} onChange={(ev) => setPickE(ev.target.checked ? [...engines, e.id] : engines.filter((x) => x !== e.id))} />{e.name}</label>
      ))}{!ready.length && <Link href={`/w/${ws.slug}/extension#search-keys`} className={cx(s.btn, s.sm)}>Add a key</Link>}</div>
      <div className="mt-4 flex items-center gap-3"><button className={cx(s.btn, s.red)} disabled={busy || !draft.trim() || !pickQ.length || !engines.length} onClick={run}>{busy ? "Testing" : `Test ${pickQ.length * engines.length} runs`}</button><span className={s.small}>API with web search</span></div>
      {res && res.length > 0 && (
        <div className={cx(s.box, "mt-4 overflow-x-auto")}>
          <table className={s.table}><thead><tr><th>Question</th><th>Engine</th><th>Result</th></tr></thead>
            <tbody>{res.map((r, i) => <tr key={i}><td className="max-w-[340px]">{r.q}</td><td className={s.small}>{ENGINES.find((e) => e.id === r.engine)?.name}</td><td><span className={cx(s.pill, r.named ? s.pRed : s.pLine)} title={r.answer.slice(0, 400)}>{r.answer.startsWith("Failed") ? "Failed" : r.named ? "Would name him" : "Not named"}</span></td></tr>)}</tbody>
          </table>
        </div>
      )}
      {advice && <div className={cx(s.box, "mt-3 whitespace-pre-wrap p-4 text-[13.5px]")}>{advice}</div>}
    </Side>
  );
}
const findBrand = (q: Question, self: Entity) => self.aliases.some((a) => a && q.question.toLowerCase().includes(a.toLowerCase()));

// ---------------- ask ----------------
export function AskPanel({ runs, qs, self, rivals, onClose }: { runs: Run[]; qs: Question[]; self: Entity; rivals: Entity[]; onClose: () => void }) {
  const ctx = useMemo(() => askContext(runs, qs, self, rivals), [runs, qs, self, rivals]);
  const [msgs, setMsgs] = useState<{ who: "you" | "prax"; text: string }[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [showData, setShowData] = useState(false);
  const STARTERS = ["Which questions did we lose since the last run?", "Where do competitors beat us, and on which engine?", "What should Shashi publish next to get named more?"];
  async function ask(text: string) {
    if (!text.trim()) return;
    const history = [...msgs, { who: "you" as const, text }];
    setMsgs(history); setQ(""); setBusy(true);
    try {
      const out = await askExtension<string>("ai", { plain: true, kind: "studio", rules: "You answer questions about AI citation results for Shashi Pal and Antier. Use only the DATA given. Be short, specific and plain. If the data does not answer the question, say so. No dashes.", user: `DATA:\n${ctx}\n\nCONVERSATION:\n${history.slice(-6).map((m) => `${m.who === "you" ? "User" : "Prax"}: ${m.text}`).join("\n")}\n\nAnswer the last question.` });
      setMsgs([...history, { who: "prax", text: out.trim() }]);
    } catch (e) { setMsgs([...history, { who: "prax", text: (e as Error).message }]); }
    setBusy(false);
  }
  return (
    <Side title="Ask your results" onClose={onClose}>
      <p className={s.small}>Answers come only from your own runs, through your AI key. <button className="underline" onClick={() => setShowData(!showData)}>{showData ? "Hide" : "See"} the data it uses</button></p>
      {showData && <pre className={cx(s.box, "mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap p-3 text-[11.5px]")}>{ctx}</pre>}
      <div className="mt-4 flex flex-col gap-3">
        {!msgs.length && <div className="flex flex-wrap gap-1.5">{STARTERS.map((x) => <button key={x} className={cx(s.btn, s.sm)} onClick={() => ask(x)}>{x}</button>)}</div>}
        {msgs.map((m, i) => <div key={i} className={cx("max-w-[92%] whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-[13.5px] leading-relaxed", m.who === "you" ? "self-end bg-[#141414] text-white" : "self-start border border-[#e8e8e8] bg-white")}>{m.text}</div>)}
        {busy && <div className="self-start text-[12.5px] text-[#8c8c8c]">Thinking</div>}
      </div>
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <label htmlFor="ask-box" className="sr-only">Ask a question</label>
        <input id="ask-box" className={s.field} placeholder="Ask about your results" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={cx(s.btn, s.red)} disabled={busy || !q.trim()} aria-label="Send"><Send size={14} /></button>
      </form>
    </Side>
  );
}

// ---------------- facts sheet ----------------
export function FactsDrawer({ facts, onClose }: { facts: Partial<Facts>; onClose: () => void }) {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const [f, setF] = useState<Facts>({ ...EMPTY_FACTS, ...facts });
  const [side, setSide] = useState<"Shashi" | "Antier">("Shashi");
  const ALL: Record<"Shashi" | "Antier", [keyof Facts, string, string][]> = {
    Shashi: [["titles", "His titles", "Co-Founder and COO"], ["other", "Other true facts about him", ""]],
    Antier: [["company", "Company names", "Antier, Antier Solutions"], ["products", "Products and services", "Stablecoin infrastructure, tokenisation platforms"], ["licences", "Licences and registrations", ""], ["regions", "Regions served", "UAE, Saudi Arabia, India"], ["founded", "Founded", "2011"]],
  };
  const FIELDS = ALL[side];
  async function save() {
    const { error } = await supabase().from("citation_facts").upsert({ workspace_id: ws.id, facts: f, updated_at: new Date().toISOString() });
    if (error) toast(error.message); else { haptic(); toast("Facts saved. New checks use them."); onClose(); }
  }
  return (
    <Side title="Facts sheet" onClose={onClose}>
      <p className={s.small}>The true facts AI answers are checked against, and what his LinkedIn profile should say. Separate items with commas.</p>
      <div className="mt-3 flex gap-2" role="tablist">{(["Shashi", "Antier"] as const).map((t) => <button key={t} role="tab" aria-selected={side === t} className={cx(s.btn, s.sm, side === t && s.dark)} onClick={() => setSide(t)}>{t}</button>)}</div>
      <div className="mt-3 grid gap-3">{FIELDS.map(([k, label, ph]) => (
        <label key={k} className="grid gap-1.5"><span className={s.label}>{label}</span>
          {k === "other" ? <textarea className={cx(s.field, "h-auto min-h-[80px] py-2")} value={f[k]} disabled={!can("editor")} onChange={(e) => setF({ ...f, [k]: e.target.value })} /> : <input className={s.field} placeholder={ph} value={f[k]} disabled={!can("editor")} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}
        </label>
      ))}</div>
      {can("editor") && <div className="mt-4"><button className={cx(s.btn, s.red)} onClick={save}>Save facts</button></div>}
    </Side>
  );
}

// ---------------- report and share links ----------------
export function buildSnapshot(runs: Run[], qs: Question[], self: Entity, rivals: Entity[], recs: RecRow[], name: string): ReportSnapshot {
  const h = shareOfVoice(runs, qs, self, self);
  const qText = (id: string) => qs.find((q) => q.id === id)?.question ?? "a removed question";
  const scoreOn = (ids: string[]) => shareOfVoice(runs, qs.filter((q) => ids.includes(q.id)), self, self);
  return {
    generated_at: new Date().toISOString(), name,
    headline: { named: h.named, linked: h.linked, total: h.total },
    engines: LIVE.map((e) => { const x = shareOfVoice(runs, qs, self, self, e.id); return { name: e.name, named: x.named, total: x.total }; }),
    linkedin: linkedinCited(runs, self).length,
    changes: changes(runs, self).slice(0, 8).map((c) => `${c.kind === "new" ? "Newly named" : "Dropped out"} on ${ENGINES.find((e) => e.id === c.engine)?.name}: ${qText(c.question_id)}`),
    alerts: alerts(runs, qs, self, rivals).filter((a) => a.kind === "wrong_fact" || a.kind === "overtook").slice(0, 4).map((a) => a.text),
    gaps: citationGaps(runs, self, rivals).slice(0, 8).map((g) => ({ domain: g.domain, competitors: g.competitors })),
    leaderboard: [self, ...rivals].map((e) => { const x = shareOfVoice(runs, qs, e, self); return { name: e.kind === "self" ? "Antier" : e.name, named: x.named, total: x.total, you: e.kind === "self" }; }).sort((a, b) => b.named - a.named),
    recs: recs.filter((r) => r.status !== "dismissed").map((r) => { const l = lift(r.baseline, scoreOn(r.question_ids)); return { kind: r.kind, title: r.title, status: r.status, lift: l ? `${l.before}% to ${l.after}% named` : "" }; }),
  };
}

type ShareRow = { token_hash: string; expires_at: string; revoked: boolean; created_at: string };
export function ShareDialog({ snap, onClose }: { snap: ReportSnapshot; onClose: () => void }) {
  const { ws } = useWorkspace();
  const toast = useToast();
  const [days, setDays] = useState(7);
  const [link, setLink] = useState("");
  const [rows, setRows] = useState<ShareRow[]>([]);
  const load = () => supabase().from("citation_shares").select("token_hash,expires_at,revoked,created_at").eq("workspace_id", ws.id).order("created_at", { ascending: false }).then(({ data }: { data: ShareRow[] | null }) => setRows(data ?? []));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function create() {
    const raw = hex(crypto.getRandomValues(new Uint8Array(24)));
    const { error } = await supabase().from("citation_shares").insert({ token_hash: await sha(raw), workspace_id: ws.id, snapshot: snap, expires_at: expiryFrom(days) });
    if (error) { toast(error.message); return; }
    const url = `${location.origin}/share/${raw}`;
    setLink(url); try { await navigator.clipboard.writeText(url); } catch {}
    haptic(); toast("Link made and copied. It shows this report only, read-only."); load();
  }
  async function revoke(h: string) {
    const { error } = await supabase().from("citation_shares").update({ revoked: true }).eq("token_hash", h);
    if (error) toast(error.message); else { haptic(); toast("Link turned off"); load(); }
  }
  return (
    <Side title="Share a view-only report" onClose={onClose}>
      <p className={s.small}>Anyone with the link sees this report as it is now, without logging in. It shows nothing else from Prax and no keys. You can turn it off at any time.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="grid gap-1.5"><span className={s.label}>Expires after</span><select className={cx(s.field, "w-40")} value={days} onChange={(e) => setDays(Number(e.target.value))}>{[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>)}</select></label>
        <button className={cx(s.btn, s.red)} onClick={create}>Make the link</button>
      </div>
      {link && <div className={cx(s.box, "mt-3 break-all p-3 text-[13px]")}>{link}</div>}
      {rows.length > 0 && <div className="mt-5"><div className={s.label}>Links</div>
        <ul className="mt-2 grid gap-1.5">{rows.map((r) => { const live = !r.revoked && Date.parse(r.expires_at) > Date.now(); return (
          <li key={r.token_hash} className="flex items-center gap-2 border-t border-[#ececec] pt-1.5 text-[13px]"><span className={cx(s.pill, live ? s.pRed : s.pLine)}>{live ? "Live" : r.revoked ? "Off" : "Expired"}</span><span className="flex-1">Made {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, expires {new Date(r.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>{live && <button className={cx(s.btn, s.sm)} onClick={() => revoke(r.token_hash)}>Turn off</button>}</li>
        ); })}</ul></div>}
    </Side>
  );
}

// ---------------- comment targets ----------------
/** LinkedIn people and pages the AI cites on his topics: worth commenting on, so they become VIPs and Today tasks. */
export function commentTargets(runs: Run[], self: Entity) {
  const m = new Map<string, { url: string; name: string; kind: string; n: number }>();
  for (const r of runs) for (const x of r.sources) {
    if (!x.domain.endsWith("linkedin.com") || owns(x.url, self.domains)) continue;
    const path = (() => { try { return new URL(x.url).pathname; } catch { return ""; } })();
    const hit = path.match(/^\/(in|company)\/([^/]+)/) ?? path.match(/^\/(pulse|posts)\/([^/]+)/);
    if (!hit) continue;
    const key = hit[1] === "posts" || hit[1] === "pulse" ? hit[2].split("_")[0] : hit[2];
    const name = (x.title.split(/ [|–-] /)[0] || key).trim();
    const kind = hit[1] === "company" ? "Page" : "Person";
    const e = m.get(key) ?? { url: hit[1] === "in" || hit[1] === "company" ? `https://www.linkedin.com/${hit[1]}/${hit[2]}/` : x.url, name, kind, n: 0 };
    e.n++; m.set(key, e);
  }
  return [...m.values()].sort((a, b) => b.n - a.n);
}

export function CommentTargets({ runs, self }: { runs: Run[]; self: Entity }) {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const list = useMemo(() => commentTargets(runs, self).slice(0, 12), [runs, self]);
  const [done, setDone] = useState<Set<string>>(new Set());
  async function addVip(t: { name: string; url: string }) {
    const { data } = await supabase().from("studio_settings").select("safety").eq("workspace_id", ws.id).maybeSingle();
    const safety = { ...(data?.safety ?? {}) } as { vips?: string[] };
    const vips = [...new Set([...(safety.vips ?? []), t.name])];
    const { error } = await supabase().from("studio_settings").upsert({ workspace_id: ws.id, safety: { ...safety, vips }, updated_at: new Date().toISOString() });
    await upsertToday([{ day: today(), kind: "custom", idx: 3800 + (Math.abs([...t.name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % 100), title: `Comment on a recent post by ${t.name} (AI tools cite them on his topics)`, link: t.url, note: "citations:target" }], ws.id);
    if (error) toast(error.message); else { haptic(); setDone(new Set([...done, t.url])); toast(`${t.name} is a VIP in Comment Studio and on Today`); }
  }
  return (
    <section className={cx(s.box, "p-4")}>
      <div className={s.label}>Comment targets</div>
      <p className={s.small}>LinkedIn people and pages the AI cites on his topics. Thoughtful comments on their posts put his name next to sources AI already trusts.</p>
      {!list.length ? <p className={cx(s.small, "mt-2")}>None cited yet.</p> : <ul className="mt-2 grid gap-2">{list.map((t) => (
        <li key={t.url} className="flex items-center gap-2 border-t border-[#ececec] pt-2 text-[13px]">
          <span className="min-w-0 flex-1"><a href={t.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">{t.name}</a><span className={cx(s.small, "block")}>{t.kind} · cited {t.n} time{t.n > 1 ? "s" : ""}</span></span>
          {can("editor") && <button className={cx(s.btn, s.sm, s.red)} disabled={done.has(t.url)} onClick={() => addVip(t)}>{done.has(t.url) ? "Added" : "Add as VIP"}</button>}
        </li>
      ))}</ul>}
    </section>
  );
}
