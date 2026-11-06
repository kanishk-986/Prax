"use client";
// The parts of AI citations built on top of the runs: alerts, next moves, profile consistency, question sets,
// suggested questions, recommendations with lift, the draft test, Ask, the facts sheet, share links,
// comment targets and the tone and fact check. AI work goes through the extension with the user's own key.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Send } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useWorkspace, useWho, today } from "@/lib/workspace";
import { cap, possessive, pillarsOf, regionText, whoLine } from "@/lib/persona";
import { useToast, haptic } from "@/components/toaster";
import { askExtension, parseJSON, useExtension } from "@/lib/bridge";
import { ProviderMark } from "@/components/provider-mark";
import { upsertToday } from "@/components/content/shared";
import { useCitationScope } from "@/lib/citation-profile";
import { type ReportSnapshot } from "@/components/citations-report";
import {
  ENGINES, alerts, recommend, lift, shareOfVoice, profileConsistency, starterQuestions, askContext, judgePrompt, parseJudge, factIssues,
  parseEngine, detect, setRollup, citationGaps, changes, linkedinCited, expiryFrom, owns, EMPTY_FACTS, scoped, withProfile, postProfile,
  type Run, type Question, type Entity, type Facts, type Rec, type Engine,
} from "@/lib/citations";
import { Card, Empty, Status, Side, cx } from "./ui";
import s from "./citations.module.css";
export { Side };

const LIVE = ENGINES.filter((e) => e.live);
// The draft test sends the draft inside the prompt, which only an AI model can read; search engines (through SerpApi) are left out.
const DRAFT_LIVE = LIVE.filter((e) => !e.via);
const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (t: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));


export type RecRow = { id: string; kind: "profile" | "elsewhere"; title: string; detail: string; question_ids: string[]; status: string; baseline: { named: number; total: number } | null; accepted_at: string | null; post_id: string | null };
export type SetRow = { id: string; name: string; sort: number };
const isRow = (r: Rec | RecRow): r is RecRow => "id" in r;

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
const ALERT_TONE: Record<string, "red" | "ink" | "ring" | "grey"> = { new: "red", dropped: "ink", wrong_fact: "ring", overtook: "ink" };
const ALERT_LABEL: Record<string, string> = { new: "Newly named", dropped: "Dropped out", wrong_fact: "Wrong fact", overtook: "Overtaken" };
export function AlertsCard({ runs, qs, self, rivals }: { runs: Run[]; qs: Question[]; self: Entity; rivals: Entity[] }) {
  const list = useMemo(() => alerts(runs, qs, self, rivals), [runs, qs, self, rivals]);
  return (
    <Card title="Changes" meta="Since the previous run">
      {!list.length ? <div className={s.rowsTop}><Empty title="Nothing changed" body={`Shows when an answer starts or stops naming ${self.name}, or a peer overtakes.`} /></div> : (
        <ul className={cx(s.rows, s.rowsTop)}>{list.slice(0, 6).map((a, i) => (
          <li key={i} className={cx(s.row, "items-start py-2.5")}>
            <span className="w-[104px] shrink-0 pt-px"><Status tone={ALERT_TONE[a.kind]}>{ALERT_LABEL[a.kind]}</Status></span>
            <span className="min-w-0 flex-1 text-[13px]">{a.text.replace(/^(Newly named|Dropped out): /, "")}{a.engine && <span className={cx(s.small, "block")}>{ENGINES.find((e) => e.id === a.engine)?.name}</span>}</span>
          </li>
        ))}</ul>
      )}
    </Card>
  );
}

export function NextMoves({ recs, computed, onAll }: { recs: RecRow[]; computed: Rec[]; onAll: () => void }) {
  const open = [...recs.filter((r) => r.status === "open" || r.status === "accepted"), ...computed.filter((c) => !recs.some((r) => r.title === c.title)).map((c) => ({ ...c, status: "suggested" }))].slice(0, 3);
  return (
    <Card title="Next moves" action={<button className={s.link} onClick={onAll}>All actions</button>}>
      {!open.length ? <div className={s.rowsTop}><Empty title="No moves yet" body="Suggested from your gaps and sources after a run." /></div> : (
        <ul className={cx(s.rows, s.rowsTop)}>{open.map((r, i) => (
          <li key={i} className={s.rowStack}><span className={s.small}>{r.kind === "profile" ? "On LinkedIn" : "Elsewhere"}{r.status === "accepted" ? " · Accepted" : ""}</span><div className="mt-0.5 line-clamp-2 text-[13px] font-medium">{r.title}</div></li>
        ))}</ul>
      )}
    </Card>
  );
}

export function ProfileCard({ facts, onFacts }: { facts: Partial<Facts>; onFacts: () => void }) {
  const { ws } = useWorkspace();
  const who = useWho();
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    supabase().from("profile_docs").select("raw_text").eq("workspace_id", ws.id).eq("subject", "self").order("created_at", { ascending: false }).limit(1)
      .then(({ data }: { data: { raw_text: string }[] | null }) => setText(`${ws.headline}\n${data?.[0]?.raw_text ?? ""}`));
  }, [ws.id, ws.headline]);
  const rows = useMemo(() => (text == null ? [] : profileConsistency(facts, text)), [facts, text]);
  const missing = rows.filter((r) => !r.found);
  const hasFacts = Object.values(facts).some((v) => v && String(v).trim());
  return (
    <Card title={`${cap(possessive(who.first))} LinkedIn profile`} meta={hasFacts && rows.length ? `${rows.length - missing.length} of ${rows.length} facts` : undefined} action={<Link href={`/w/${ws.slug}/profile`} className={s.link}>Profile Studio</Link>}>
      <div className={s.rowsTop}>
        {!hasFacts ? <Empty title="No facts to check" body="The headline and About should match the facts sheet." action={<button className={cx(s.btn, s.sm)} onClick={onFacts}>Open facts sheet</button>} />
          : !rows.length ? <Empty title="Nothing to check yet" body="Add titles, products or regions to the facts sheet." />
          : missing.length === 0 ? <Empty title="Profile matches the facts" />
          : <ul className={s.rows}>{missing.slice(0, 5).map((r) => <li key={r.fact + r.value} className={cx(s.row, "py-2.5 text-[13px]")}><span className="w-20 shrink-0 text-[#5f5f5f]">{r.fact}</span><span className="min-w-0 flex-1 font-medium">{r.value}</span><span className={s.small}>Missing</span></li>)}</ul>}
      </div>
    </Card>
  );
}

// ---------------- questions: quick setup, suggestions, sets ----------------
/** region: the profile's focus regions as text (regionText in src/lib/persona.ts), empty for a mix. */
async function draftQuestions(n: number, existing: string[], topics: string[], headline: string, region: string) {
  const out = await askExtension<string>("ai", { plain: true, kind: "studio", rules: "You write the questions a senior buyer types into an AI assistant when looking for a partner, a vendor or an expert. Never mention any company by name.", user: `Profile: ${headline}\nTopics: ${topics.join(", ")}\nAlready tracked:\n${existing.slice(0, 60).join("\n") || "(none)"}\n\nWrite ${n} new questions a buyer would ask, spread across these topics, ${region ? `mostly about ${region}, a few global` : "across regions, some global"}. Plain words, no brand names. Return only JSON: {"questions": [{"question": "...", "topic": "one of the topics", "region": "UAE"}]}` });
  const j = parseJSON<{ questions: { question: string; topic: string; region?: string }[] }>(out);
  return (j?.questions ?? []).filter((q) => q.question && !existing.some((e) => e.toLowerCase() === q.question.toLowerCase())).slice(0, n);
}

export function QuickSetup({ count }: { count: number }) {
  const { ws } = useWorkspace();
  const { scope } = useCitationScope();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    let rows: { question: string; topic: string; region?: string }[] = [], source = "ai";
    const pillars = pillarsOf(ws), region = regionText(ws);
    if (!pillars.length) { setBusy(false); toast("Add pillars in Settings first, or write your own prompts.", undefined, { info: true }); return; }
    try { rows = await draftQuestions(20, [], pillars, ws.headline, region); } catch { /* no key: use the starter list */ }
    if (!rows.length) { rows = starterQuestions(pillars, region); source = "starter"; }
    const { error } = await supabase().from("citation_questions").insert(rows.map((q, i) => withProfile({ workspace_id: ws.id, question: q.question, topic: q.topic, region: q.region && q.region !== "Global" ? q.region : "", language: "English", status: "suggested", source, sort: count + i + 1 }, scope)));
    setBusy(false);
    if (error) toast(error.message); else { haptic(); toast(`${rows.length} prompts drafted. Approve the ones to track.`); }
  }
  return (
    <Card>
      <Empty title="No prompts yet" body="Draft 20 buyer prompts from the profile, or write your own. Nothing is tracked until approved."
        action={<button className={cx(s.btn, s.red)} disabled={busy} onClick={run}>{busy ? "Drafting" : "Draft 20 prompts"}</button>} />
    </Card>
  );
}

export function Suggested({ qs }: { qs: (Question & { sort: number })[] }) {
  const { ws, can } = useWorkspace();
  const { scope } = useCitationScope();
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
      const rows = await draftQuestions(8, qs.map((q) => q.question), pillarsOf(ws), ws.headline, regionText(ws));
      if (!rows.length) throw new Error("No new prompts came back. Try again.");
      const { error } = await supabase().from("citation_questions").insert(rows.map((q, i) => withProfile({ workspace_id: ws.id, question: q.question, topic: q.topic, region: q.region && q.region !== "Global" ? q.region : "", language: "English", status: "suggested", source: "ai", sort: qs.length + i + 1 }, scope)));
      if (error) throw error;
      haptic(); toast(`${rows.length} prompts suggested`);
    } catch (e) { toast((e as Error).message); }
    setBusy(false);
  }
  if (!can("editor") && !sug.length) return null;
  if (!sug.length) return null;
  return (
    <Card title="Suggested prompts" meta={`${sug.length} waiting`}
      action={can("editor") && <>{sug.length > 1 && <button className={cx(s.btn, s.sm)} onClick={() => setStatus(sug.map((q) => q.id), "active")}>Approve all</button>}<button className={cx(s.btn, s.ghost, s.sm)} disabled={busy} onClick={more}>{busy ? "Thinking" : "Suggest more"}</button></>}>
      <ul className={cx(s.rows, s.rowsTop)}>{sug.map((q) => (
        <li key={q.id} className={cx(s.row, "flex-wrap py-2.5")}>
          <span className="min-w-0 flex-1 basis-[260px]"><span className="block text-[13px] font-medium">{q.question}</span><span className={s.small}>{[q.topic, q.region].filter(Boolean).join(" · ")}</span></span>
          {can("editor") && <span className="flex gap-1"><button className={cx(s.btn, s.sm)} onClick={() => setStatus([q.id], "active")}>Approve</button><button className={cx(s.btn, s.ghost, s.sm)} onClick={() => setStatus([q.id], "archived")}>Dismiss</button></span>}
        </li>
      ))}</ul>
    </Card>
  );
}

export function SetsBar({ sets, qs, runs, self, value, onChange }: { sets: SetRow[]; qs: Question[]; runs: Run[]; self: Entity; value: string; onChange: (v: string) => void }) {
  const { ws, can } = useWorkspace();
  const { scope } = useCitationScope();
  const toast = useToast();
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const active = qs.filter((q) => q.status === "active");
  const chips = [{ id: "all", name: "All prompts", r: shareOfVoice(runs, active, self, self) }, ...sets.map((x) => ({ id: x.id, name: x.name, r: setRollup(active, x.id, runs, self) })), ...(sets.length ? [{ id: "none", name: "No group", r: setRollup(active, null, runs, self) }] : [])];
  async function add() {
    const { error } = await supabase().from("citation_sets").insert(withProfile({ workspace_id: ws.id, name: name.trim(), sort: sets.length + 1 }, scope));
    if (error) toast(error.message); else { haptic(); toast("Group added"); setName(""); setAdding(false); }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className={cx(s.seg, "max-w-full overflow-x-auto")} role="group" aria-label="Prompt groups">
        {chips.map((c) => (
          <button key={c.id} onClick={() => onChange(c.id)} aria-pressed={value === c.id}>
            {c.name}{c.r.total > 0 && <span className={cx(s.tnum, "ml-1.5 font-normal text-[#5f5f5f]")}>{c.r.named}/{c.r.total}</span>}
          </button>
        ))}
      </div>
      {can("editor") && (adding
        ? <span className="flex gap-1.5"><input autoFocus aria-label="Group name" className={cx(s.field, "h-8 w-44")} placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) add(); if (e.key === "Escape") setAdding(false); }} /><button className={cx(s.btn, s.sm)} disabled={!name.trim()} onClick={add}>Add</button><button className={cx(s.btn, s.ghost, s.sm)} onClick={() => setAdding(false)}>Cancel</button></span>
        : <button className={cx(s.btn, s.ghost, s.sm)} onClick={() => setAdding(true)}>New group</button>)}
    </div>
  );
}

// ---------------- actions: recommendations with lift ----------------
export function Actions({ recs, runs, qs, self, rivals }: { recs: RecRow[]; runs: Run[]; qs: Question[]; self: Entity; rivals: Entity[] }) {
  const { ws, can } = useWorkspace();
  const { scope } = useCitationScope();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const computed = useMemo(() => recommend(runs, qs, self, rivals), [runs, qs, self, rivals]);
  const fresh = computed.filter((c) => !recs.some((r) => r.title === c.title));
  const scoreOn = (ids: string[]) => shareOfVoice(runs, qs.filter((q) => ids.includes(q.id)), self, self);

  async function accept(r: Rec | RecRow) {
    const base = scoreOn(r.question_ids);
    let postId: string | null = null;
    if (r.kind === "profile") {
      const { data } = await supabase().from("posts").insert({ workspace_id: ws.id, title: r.title.replace(/^Publish a LinkedIn article that answers: /, "LinkedIn article: "), format: "Article", status: "Idea", topic: "AI citations", resource: r.detail, ...postProfile(scope) }).select("id").single();
      postId = data?.id ?? null;
    } else {
      await upsertToday([{ day: today(), kind: "custom", idx: 3700 + (Math.abs([...r.title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % 100), title: r.title, note: "citations:rec" }], ws.id);
    }
    const row = { status: "accepted", baseline: { named: base.named, total: base.total }, accepted_at: new Date().toISOString(), post_id: postId };
    const { error } = isRow(r) ? await supabase().from("citation_recs").update(row).eq("id", r.id) : await supabase().from("citation_recs").insert(withProfile({ workspace_id: ws.id, kind: r.kind, title: r.title, detail: r.detail, question_ids: r.question_ids, ...row }, scope));
    if (error) toast(error.message); else { haptic(); toast(r.kind === "profile" ? "Accepted. The idea is in Content Studio." : "Accepted. It is on Today."); }
  }
  async function setStatus(r: Rec | RecRow, status: string) {
    const { error } = isRow(r) ? await supabase().from("citation_recs").update({ status }).eq("id", r.id) : await supabase().from("citation_recs").insert(withProfile({ workspace_id: ws.id, kind: r.kind, title: r.title, detail: r.detail, question_ids: r.question_ids, status }, scope));
    if (error) toast(error.message); else { haptic(); toast(status === "done" ? "Marked done" : "Dismissed", isRow(r) ? () => { supabase().from("citation_recs").update({ status: r.status }).eq("id", r.id).then(); } : undefined); }
  }
  async function more() {
    setBusy(true);
    try {
      const ctx = askContext(runs, qs, self, rivals);
      const out = await askExtension<string>("ai", { plain: true, kind: "studio", rules: `You advise ${whoLine(ws)} on getting named by AI assistants. Recommend concrete actions only: things to publish on their LinkedIn, and places to be mentioned elsewhere. Never suggest spam, paid placements disguised as editorial, or anything against a regulator.`, user: `DATA:\n${ctx}\n\nGive up to 5 new recommendations. Return only JSON: {"recs": [{"kind": "profile", "title": "short action", "detail": "one or two sentences why"}]}` });
      const j = parseJSON<{ recs: { kind: string; title: string; detail: string }[] }>(out);
      const rows = (j?.recs ?? []).filter((x) => x.title && (x.kind === "profile" || x.kind === "elsewhere"));
      if (!rows.length) throw new Error("No recommendations came back. Try again.");
      const { error } = await supabase().from("citation_recs").insert(rows.map((x) => withProfile({ workspace_id: ws.id, kind: x.kind, title: x.title, detail: x.detail, question_ids: [], status: "open" }, scope)));
      if (error) throw error;
      haptic(); toast(`${rows.length} recommendations added`);
    } catch (e) { toast((e as Error).message); }
    setBusy(false);
  }

  const groups = (["profile", "elsewhere"] as const).map((k) => ({ k, items: [...recs.filter((r) => r.kind === k && r.status !== "dismissed"), ...fresh.filter((c) => c.kind === k)] }));
  if (!runs.length && !recs.length) return <Card><Empty title="Actions appear after the first run" body="What to publish and where to be mentioned, tied to the prompts it should move." /></Card>;
  return (
    <div className="flex flex-col gap-4">
      {can("editor") && <div className="flex justify-end"><button className={cx(s.btn, s.sm)} disabled={busy} onClick={more}>{busy ? "Thinking" : "Suggest more with AI"}</button></div>}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {groups.map(({ k, items }) => (
          <Card key={k} title={k === "profile" ? "On LinkedIn" : "Elsewhere"} meta={items.length ? String(items.length) : undefined}>
            {!items.length ? <div className={s.rowsTop}><Empty title="Nothing here yet" body={k === "profile" ? "Posts and articles to publish, from your gaps." : "Sites to be mentioned on, from your site gaps."} /></div> : (
              <ul className={cx(s.rows, s.rowsTop)}>{items.map((r, i) => {
                const row = isRow(r) ? r : null, l = row?.status === "accepted" || row?.status === "done" ? lift(row.baseline, scoreOn(r.question_ids)) : null;
                const st = row ? row.status[0].toUpperCase() + row.status.slice(1) : "Suggested";
                return (
                  <li key={row?.id ?? i} className="px-[18px] py-3.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><Status tone={row?.status === "accepted" ? "red" : row?.status === "done" ? "ink" : "grey"}>{st}</Status>{r.question_ids.length > 0 && <span className={s.small}>{r.question_ids.length} prompt{r.question_ids.length > 1 ? "s" : ""}</span>}{l && <span className={cx(s.small, s.tnum, "font-semibold text-[#141414]")}>{l.before}% to {l.after}% named</span>}</div>
                    <div className="mt-1.5 text-[13.5px] font-semibold leading-snug">{r.title}</div>
                    <p className={cx(s.small, "mt-0.5 line-clamp-2")}>{r.detail}</p>
                    {can("editor") && <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {(!row || row.status === "open") && <button className={cx(s.btn, s.sm)} onClick={() => accept(r)}>Accept</button>}
                      {row?.status === "accepted" && <button className={cx(s.btn, s.sm)} onClick={() => setStatus(r, "done")}>Mark done</button>}
                      {row?.post_id && <Link className={cx(s.btn, s.ghost, s.sm)} href={`/w/${ws.slug}/studio-content?tab=library`}>Open the idea</Link>}
                      {(!row || row.status === "open") && <button className={cx(s.btn, s.ghost, s.sm)} onClick={() => setStatus(r, "dismissed")}>Dismiss</button>}
                    </div>}
                  </li>
                );
              })}</ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------- draft test ----------------
export function DraftTest({ qs, self, initial, onClose }: { qs: Question[]; self: Entity; initial?: string; onClose: () => void }) {
  const { ws } = useWorkspace();
  const who = useWho();
  const { status } = useExtension();
  const toast = useToast();
  const active = qs.filter((q) => q.status === "active" && !findBrand(q, self));
  const [draft, setDraft] = useState(initial ?? "");
  const [pickQ, setPickQ] = useState<string[]>([]);
  const ready = DRAFT_LIVE.filter((e) => status?.searchKeys?.[e.id]).map((e) => e.id);
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
      const prompt = `${q.question}\n\nAmong the sources you may use, consider this new piece by ${who.name}${who.company ? ` of ${who.company}` : ""}:\n"""\n${draft.slice(0, 6000)}\n"""`;
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
    <Side title="Is this citable?" sub={`Asks your prompts with the draft as a source. Each prompt and AI tool is one paid run. Nothing is saved.`} onClose={onClose} wide
      foot={<><span className={cx(s.small, "mr-auto self-center")}>API with web search</span><button className={cx(s.btn, s.red)} disabled={busy || !draft.trim() || !pickQ.length || !engines.length} onClick={run}>{busy ? "Testing" : `Test ${pickQ.length * engines.length} runs`}</button></>}>
      <label className={s.label} htmlFor="draft-box">Draft</label>
      <textarea id="draft-box" className={cx(s.field, "mt-1.5 h-auto min-h-[180px] py-2 leading-relaxed")} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Paste the draft" />
      <div className="mt-4"><div className={s.label}>Prompts to test</div>
        <div className="mt-1.5 grid max-h-[200px] gap-1.5 overflow-auto rounded-lg border border-[#e8e8e8] p-3">{active.map((q) => (
          <label key={q.id} className="flex items-start gap-2 text-[13px]"><input type="checkbox" checked={pickQ.includes(q.id)} onChange={(e) => setPickQ(e.target.checked ? [...pickQ, q.id].slice(-5) : pickQ.filter((x) => x !== q.id))} /> {q.question}</label>
        ))}{!active.length && <span className={s.small}>Approve prompts first.</span>}</div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3"><span className={s.label}>AI tools</span>{DRAFT_LIVE.map((e) => (
        <label key={e.id} className={cx("flex items-center gap-1.5 text-[13px]", !ready.includes(e.id) && "opacity-50")}><input type="checkbox" disabled={!ready.includes(e.id)} checked={engines.includes(e.id)} onChange={(ev) => setPickE(ev.target.checked ? [...engines, e.id] : engines.filter((x) => x !== e.id))} /><ProviderMark id={e.id} bold={false} /></label>
      ))}{!ready.length && <Link href={`/w/${ws.slug}/extension#search-keys`} className={cx(s.btn, s.sm)}>Add a key</Link>}</div>
      {res && res.length > 0 && (
        <div className={cx(s.box, "mt-4 overflow-x-auto")}>
          <table className={s.table}><thead><tr><th>Prompt</th><th>AI tool</th><th>Result</th></tr></thead>
            <tbody>{res.map((r, i) => <tr key={i}><td className="max-w-[340px]">{r.q}</td><td className={s.small}><ProviderMark id={r.engine} short bold={false} className="text-[#141414]" /></td><td><span title={r.answer.slice(0, 400)}><Status tone={r.named ? "red" : "grey"}>{r.answer.startsWith("Failed") ? "Failed" : r.named ? "Would be named" : "Not named"}</Status></span></td></tr>)}</tbody>
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
  const STARTERS = ["Which prompts did we lose since the last run?", "Where do peers beat us, and on which AI tool?", "What should we publish next to get named more?"];
  async function ask(text: string) {
    if (!text.trim()) return;
    const history = [...msgs, { who: "you" as const, text }];
    setMsgs(history); setQ(""); setBusy(true);
    try {
      const out = await askExtension<string>("ai", { plain: true, kind: "studio", rules: `You answer questions about AI citation results for ${self.name}. Use only the DATA given. Be short, specific and plain. If the data does not answer the question, say so. No dashes.`, user: `DATA:\n${ctx}\n\nCONVERSATION:\n${history.slice(-6).map((m) => `${m.who === "you" ? "User" : "Prax"}: ${m.text}`).join("\n")}\n\nAnswer the last question.` });
      setMsgs([...history, { who: "prax", text: out.trim() }]);
    } catch (e) { setMsgs([...history, { who: "prax", text: (e as Error).message }]); }
    setBusy(false);
  }
  return (
    <Side title="Ask your results" sub="Answers use only your own runs, through your AI key." onClose={onClose}>
      <button className={s.link} onClick={() => setShowData(!showData)}>{showData ? "Hide the data" : "See the data it uses"}</button>
      {showData && <pre className={cx(s.box, "mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap p-3 text-[11.5px]")}>{ctx}</pre>}
      <div className="mt-4 flex flex-col gap-3">
        {!msgs.length && <div className="flex flex-wrap gap-1.5">{STARTERS.map((x) => <button key={x} className={cx(s.btn, s.sm)} onClick={() => ask(x)}>{x}</button>)}</div>}
        {msgs.map((m, i) => <div key={i} className={cx("max-w-[92%] whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-[13.5px] leading-relaxed", m.who === "you" ? "self-end bg-[#141414] text-white" : "self-start border border-[#e8e8e8] bg-white")}>{m.text}</div>)}
        {busy && <div className="self-start text-[12.5px] text-faint">Thinking</div>}
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
export function FactsDrawer({ facts, names, onClose }: { facts: Partial<Facts>; names: { first: string; company: string }; onClose: () => void }) {
  const { ws, can } = useWorkspace();
  const { scope } = useCitationScope();
  const toast = useToast();
  const [f, setF] = useState<Facts>({ ...EMPTY_FACTS, ...facts });
  const who = useWho();
  // Two tabs, the person and the company; the placeholders come from the profile, never from another one.
  const [side, setSide] = useState<"person" | "company">("person");
  const ALL: Record<"person" | "company", [keyof Facts, string, string][]> = {
    person: [["titles", "Titles", who.role || "For example: Founder and CEO"], ["other", "Other true facts", ""]],
    company: [["company", "Company names", names.company], ["products", "Products and services", ""], ["licences", "Licences and registrations", ""], ["regions", "Regions served", regionText(ws)], ["founded", "Founded", ""]],
  };
  const FIELDS = ALL[side];
  async function save() {
    // One facts sheet per tracked profile since db/017; one per workspace before it.
    const row = withProfile({ workspace_id: ws.id, facts: f, updated_at: new Date().toISOString() }, scope);
    const { error } = await supabase().from("citation_facts").upsert(row, { onConflict: row.profile_id ? "profile_id" : "workspace_id" });
    if (error) toast(error.message); else { haptic(); toast("Facts saved. New checks use them."); onClose(); }
  }
  return (
    <Side title="Facts sheet" sub="What answers are checked against. Separate items with commas." onClose={onClose}
      foot={can("editor") ? <><button className={s.btn} onClick={onClose}>Cancel</button><button className={cx(s.btn, s.red)} onClick={save}>Save facts</button></> : undefined}>
      <div className={s.seg} role="group" aria-label="Facts about">{(["person", "company"] as const).map((t) => <button key={t} aria-pressed={side === t} onClick={() => setSide(t)}>{t === "person" ? names.first : names.company}</button>)}</div>
      <div className="mt-4 grid gap-4">{FIELDS.map(([k, label, ph]) => (
        <label key={k} className="grid gap-1.5"><span className={s.label}>{label}</span>
          {k === "other" ? <textarea className={cx(s.field, "h-auto min-h-[80px] py-2")} value={f[k]} disabled={!can("editor")} onChange={(e) => setF({ ...f, [k]: e.target.value })} /> : <input className={s.field} placeholder={ph} value={f[k]} disabled={!can("editor")} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}
        </label>
      ))}</div>
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
    leaderboard: [self, ...rivals].map((e) => { const x = shareOfVoice(runs, qs, e, self); return { name: e.name, named: x.named, total: x.total, you: e.kind === "self" }; }).sort((a, b) => b.named - a.named),
    recs: recs.filter((r) => r.status !== "dismissed").map((r) => { const l = lift(r.baseline, scoreOn(r.question_ids)); return { kind: r.kind, title: r.title, status: r.status, lift: l ? `${l.before}% to ${l.after}% named` : "" }; }),
  };
}

type ShareRow = { token_hash: string; expires_at: string; revoked: boolean; created_at: string };
export function ShareDialog({ snap, onClose }: { snap: ReportSnapshot; onClose: () => void }) {
  const { ws } = useWorkspace();
  const { scope } = useCitationScope();
  const toast = useToast();
  const [days, setDays] = useState(7);
  const [link, setLink] = useState("");
  const [rows, setRows] = useState<ShareRow[]>([]);
  const load = () => scoped(supabase().from("citation_shares").select("token_hash,expires_at,revoked,created_at").eq("workspace_id", ws.id), scope).order("created_at", { ascending: false }).then(({ data }: { data: ShareRow[] | null }) => setRows(data ?? []));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function create() {
    const raw = hex(crypto.getRandomValues(new Uint8Array(24)));
    const { error } = await supabase().from("citation_shares").insert(withProfile({ token_hash: await sha(raw), workspace_id: ws.id, snapshot: snap, expires_at: expiryFrom(days) }, scope));
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
    <Side title="Share a view-only report" sub="Shows this report as it is now, without signing in. Turn it off at any time." onClose={onClose}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1.5"><span className={s.label}>Expires after</span><select className={cx(s.field, "w-40")} value={days} onChange={(e) => setDays(Number(e.target.value))}>{[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>)}</select></label>
        <button className={cx(s.btn, s.red)} onClick={create}>Make link</button>
      </div>
      {link && <div className={cx(s.box, "mt-3 break-all p-3 text-[13px]")}>{link}</div>}
      {rows.length > 0 && <div className="mt-5"><div className={s.label}>Links</div>
        <ul className="mt-2 grid gap-1.5">{rows.map((r) => { const live = !r.revoked && Date.parse(r.expires_at) > Date.now(); return (
          <li key={r.token_hash} className="flex items-center gap-2 border-t border-[#ececec] pt-2 text-[13px]"><span className="w-16 shrink-0"><Status tone={live ? "red" : "grey"}>{live ? "Live" : r.revoked ? "Off" : "Expired"}</Status></span><span className="flex-1">Made {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, expires {new Date(r.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>{live && <button className={cx(s.btn, s.sm)} onClick={() => revoke(r.token_hash)}>Turn off</button>}</li>
        ); })}</ul></div>}
    </Side>
  );
}

// ---------------- comment targets ----------------
/** LinkedIn people and pages the AI cites on the profile's topics: worth commenting on, so they become VIPs and Today tasks. */
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
  const who = useWho();
  const toast = useToast();
  const list = useMemo(() => commentTargets(runs, self).slice(0, 12), [runs, self]);
  const [done, setDone] = useState<Set<string>>(new Set());
  async function addVip(t: { name: string; url: string }) {
    const { data } = await supabase().from("studio_settings").select("safety").eq("workspace_id", ws.id).maybeSingle();
    const safety = { ...(data?.safety ?? {}) } as { vips?: string[] };
    const vips = [...new Set([...(safety.vips ?? []), t.name])];
    const { error } = await supabase().from("studio_settings").upsert({ workspace_id: ws.id, safety: { ...safety, vips }, updated_at: new Date().toISOString() });
    await upsertToday([{ day: today(), kind: "custom", idx: 3800 + (Math.abs([...t.name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % 100), title: `Comment on a recent post by ${t.name} (AI tools cite them on ${possessive(who.first)} topics)`, link: t.url, note: "citations:target" }], ws.id);
    if (error) toast(error.message); else { haptic(); setDone(new Set([...done, t.url])); toast(`${t.name} is a VIP in Comment Studio and on Today`); }
  }
  return (
    <Card title="Comment targets" meta={list.length ? String(list.length) : undefined}>
      {!list.length ? <div className={s.rowsTop}><Empty title="None cited yet" body="LinkedIn people and pages AI cites on your topics." /></div> : <ul className={cx(s.rows, s.rowsTop)}>{list.map((t) => (
        <li key={t.url} className={cx(s.row, "py-2.5 text-[13px]")}>
          <span className="min-w-0 flex-1"><a href={t.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">{t.name}</a><span className={cx(s.small, "block")}>{t.kind} · cited {t.n} time{t.n > 1 ? "s" : ""}</span></span>
          {can("editor") && <button className={cx(s.btn, s.sm)} disabled={done.has(t.url)} onClick={() => addVip(t)}>{done.has(t.url) ? "Added" : "Add as VIP"}</button>}
        </li>
      ))}</ul>}
    </Card>
  );
}
