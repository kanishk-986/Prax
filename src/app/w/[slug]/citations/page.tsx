"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { ActionMenu } from "@/components/content/shared";
import { AccountMenu } from "@/components/account-menu";
import { AlertsCard, NextMoves, ProfileCard, QuickSetup, Suggested, SetsBar, Actions, DraftTest, AskPanel, FactsDrawer, ShareDialog, CommentTargets, buildSnapshot, judgeRun, type RecRow, type SetRow } from "./extras";
import { KeysModal, Home, FirstRun, Gaps, Company, Report, KeywordsPanel, Tour, makeTour, type Ctx } from "./studio";
import { ProfileChip, ProfileMenu, DeleteProfile, useProfileActions } from "./profiles";
import { Card, Empty, Status, Side, TrackedNames, usePeerSuggestions, cx, who, type EntRow } from "./ui";
import { EntryMoment, useTour, type TourStep } from "@/components/shell";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useCitationProfile, useCitationScope, CitationProfileProvider } from "@/lib/citation-profile";
import { useWorkspace, fmtDay, ymd } from "@/lib/workspace";
import { companyOf, fullNameOf, possessive } from "@/lib/persona";
import { useToast, haptic } from "@/components/toaster";
import { askExtension, useExtension } from "@/lib/bridge";
import { ProviderMark, ProviderLogo, ModelId } from "@/components/provider-mark";
import {
  ENGINES, ESTIMATE, COUNTRY, LANGUAGES, parseEngine, statusOf, detect, isBranded, shareOfVoice, citationGaps, linkedinCited, latestBatches, aggregate, promptFor, findMatches, recommend, sentimentOf,
  detectPerson, personContext, promptGaps, audienceOf, AUDIENCE_LABEL, scoped, withProfile, postProfile, profileName, nextSort, archivedProfiles,
  type Profile, type Engine, type Entity, type Run, type Question, type Source, type Facts, type FactIssue, type Audience,
} from "@/lib/citations";
import s from "./citations.module.css";

type RunRow = Omit<Run, "sources"> & { error: string; question_text: string; input_tokens: number; output_tokens: number; citation_sources: (Source & { sort: number })[]; sentiment: string; fact_issues: FactIssue[] | null; judged_at: string | null };
type Manual = { question_id: string; week_start: string; tool: string; cited: boolean };
type Names = ReturnType<typeof who>;
const TABS = ["Home", "Gaps", "Prompts", "Answers", "Sources", "Competitors", "Actions", "Report", "Company"] as const;
type Tab = (typeof TABS)[number];
const OLD_TAB: Record<string, Tab> = { Overview: "Home", Questions: "Prompts" };
const LIVE = ENGINES.filter((e) => e.live);
const engineName = (e: string) => ENGINES.find((x) => x.id === e)?.name ?? e;
const list = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
const when = (t: string) => new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
// First run, before anything is tracked: the shell's guided tour over the setup page (the full tour needs tracking set up).
const SETUP_TOUR: TourStep[] = [
  { target: "header", title: "What AI citations does", body: "It asks AI tools the questions buyers ask, then checks whether the answers name and link the person and company you track." },
  { target: "setup", title: "Who should the AI name", body: "The full name, the LinkedIn profile, the company and the names and domains that count. All of it can be changed later." },
  { target: "next", title: "What happens next", body: "Pick the prompts, connect an AI key in your browser, then run. Every number comes from your own runs." },
];

export default function Citations() {
  const { ws, can, userId } = useWorkspace();
  const editable = can("editor");
  const toast = useToast();
  const { status } = useExtension();
  const keys = useMemo(() => status?.searchKeys ?? {}, [status]);
  const keyCount = LIVE.filter((e) => keys[e.id]).length;
  // The tracked profile in view (db/017). Every query below is limited to it; before 017 nothing is scoped.
  const prof = useCitationProfile();
  const { scope } = prof;
  const scopeOpts = { key: scope ?? "", skip: !prof.ready, filter: (q: any) => scoped(q, scope) };
  const profAct = useProfileActions(prof);
  const [creating, setCreating] = useState(false);
  const [del, setDel] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const params = useSearchParams();
  const asked = params.get("tab") ?? "";
  const [tab, setTab] = useState<Tab>((TABS as readonly string[]).includes(asked) ? (asked as Tab) : OLD_TAB[asked] ?? "Home");
  const sets = useLive<SetRow>("citation_sets", ws.id, { order: "sort", ...scopeOpts });
  const recs = useLive<RecRow>("citation_recs", ws.id, { order: "created_at", asc: false, ...scopeOpts });
  const [facts, setFacts] = useState<Partial<Facts>>({});
  const [panel, setPanel] = useState<"" | "ask" | "draft" | "facts" | "share" | "keys">("");
  const [tour, setTour] = useState<{ step: number; done: Set<number> } | null>(null);
  const [draftInit, setDraftInit] = useState("");
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  // On a phone, Guide, Ask and Draft test move into the three-dot menu so the header keeps one row of actions.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => { const m = window.matchMedia("(max-width: 767px)"); const f = () => setNarrow(m.matches); f(); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  const loadFacts = useCallback(() => { if (!prof.ready) return; scoped(supabase().from("citation_facts").select("facts").eq("workspace_id", ws.id), scope).maybeSingle().then(({ data }: { data: { facts: Partial<Facts> } | null }) => setFacts(data?.facts ?? {})); }, [ws.id, scope, prof.ready]);
  useEffect(() => { loadFacts(); }, [loadFacts]);
  // Content Studio's "Is this citable?" opens the draft test with that post's text.
  useEffect(() => {
    const id = params.get("draft");
    if (!id) return;
    supabase().from("posts").select("title,draft").eq("id", id).maybeSingle().then(({ data }: { data: { title: string; draft: string } | null }) => { if (data) { setDraftInit(data.draft || data.title); setPanel("draft"); } });
  }, [params]);
  const qs = useLive<Question & { sort: number }>("citation_questions", ws.id, { order: "sort", ...scopeOpts });
  const ents = useLive<EntRow>("citation_entities", ws.id, { order: "sort", ...scopeOpts });
  // Manual ticks predate profiles; they belong to whichever profile holds their prompt.
  const manualAll = useLive<Manual>("citation_results", ws.id, { order: "week_start", asc: false });
  const manual = useMemo(() => { const ids = new Set(qs.rows.map((q) => q.id)); return manualAll.rows.filter((m) => ids.has(m.question_id)); }, [manualAll.rows, qs.rows]);
  const [runRows, setRunRows] = useState<RunRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<RunRow | null>(null);
  const [runOpen, setRunOpen] = useState(false);

  // The last 90 days of runs with their sources; older runs stay in the database.
  const loadRuns = useCallback(async () => {
    if (!prof.ready) return;
    const since = new Date(Date.now() - 90 * 864e5).toISOString();
    const { data } = await scoped(supabase().from("citation_runs").select("*, citation_sources(url,title,domain,cited,sort)").eq("workspace_id", ws.id), scope).gte("run_at", since).order("run_at", { ascending: false }).limit(3000);
    setRunRows((data as RunRow[]) ?? []); setLoaded(true);
  }, [ws.id, scope, prof.ready]);
  // A switch starts from a clean page: no runs or drawer from the profile before.
  useEffect(() => { setLoaded(false); setRunRows([]); setOpen(null); loadRuns(); }, [loadRuns]);

  const runs: Run[] = useMemo(() => runRows.map((r) => ({ ...r, sources: [...(r.citation_sources ?? [])].sort((a, b) => a.sort - b.sort) })), [runRows]);
  // The person and the company are separate self rows since db/011. Older views that score "us" as one name use
  // selfAll, the two combined; the headline numbers use strict person matching.
  const selves = ents.rows.filter((e) => e.kind === "self");
  const person = selves.find((e) => e.subject === "person");
  const company = selves.find((e) => e.subject !== "person");
  const w = who(person, company);
  const self = useMemo<Entity | undefined>(() => (!person || !company ? company ?? person
    : { ...company, name: `${person.name} and ${company.name}`, aliases: [...new Set([...person.aliases, ...company.aliases])], domains: [...new Set([...person.domains, ...company.domains])] }), [person, company]);
  const rivals = useMemo(() => ents.rows.filter((e) => e.kind === "competitor" && e.status !== "suggested"), [ents.rows]);
  const active = qs.rows.filter((q) => q.status === "active");
  const qById = useMemo(() => new Map(qs.rows.map((q) => [q.id, q])), [qs.rows]);
  const c = useMemo<Ctx | null>(() => (!self ? null : {
    runs, qs: qs.rows, person, company, selfAll: self, rivals, ctx: personContext(qs.rows, company),
    experts: rivals.filter((e) => e.subject === "person"), firms: rivals.filter((e) => e.subject !== "person"),
  }), [runs, qs.rows, person, company, self, rivals]);
  const gapCount = useMemo(() => (c ? promptGaps(c.runs, c.qs, c.person, c.company, c.experts, c.firms, c.ctx).length : 0), [c]);
  const TOUR = useMemo(() => makeTour(person, company), [person, company]);

  // The tour starts by itself once per user, a moment after the entry screen; Guide reopens it.
  const tourKey = `prax-cit-tour-${userId}`;
  const ready = loaded && !!self;
  useEffect(() => {
    if (!ready) return;
    let seen = true; try { seen = localStorage.getItem(tourKey) === "1"; } catch {}
    if (seen) return;
    const t = setTimeout(() => { try { localStorage.setItem(tourKey, "1"); } catch {} setTab(TOUR[0].tab as Tab); setTour({ step: 0, done: new Set() }); }, 2900);
    return () => clearTimeout(t);
  }, [ready, tourKey, TOUR]);
  function tourStep(i: number, markDone: boolean) {
    if (!tour) return;
    const done = new Set(tour.done); if (markDone) done.add(tour.step);
    if (i >= TOUR.length) { setTour(null); if (markDone) toast("Tour finished. Guide opens it again."); return; }
    setTab(TOUR[Math.max(0, i)].tab as Tab); setTour({ step: Math.max(0, i), done });
  }

  const firstRun = !ents.loading && !self;
  // New opens the setup for another person without touching the profile in view; it is created on Start tracking.
  const setupView = creating || firstRun;
  const switchable = !prof.legacy && prof.ready;
  const setupTour = useTour("citations-setup", SETUP_TOUR);
  const moreBtn = <button className={cx(s.btn, s.menuBtn)} aria-label="More" aria-haspopup="menu" title="Tracked profiles, facts sheet and share link" onClick={(e) => setMenu(e.currentTarget)}><MoreHorizontal size={16} /></button>;
  const startTour = () => (setupView ? setupTour.start() : (setTab(TOUR[0].tab as Tab), setTour({ step: 0, done: new Set() })));
  const phoneItems = narrow ? [{ label: "Guide", run: startTour }, ...(self && !creating ? [...(runs.length ? [{ label: "Ask your results", run: () => setPanel("ask") }] : []), { label: "Draft test", run: () => { setDraftInit(""); setPanel("draft"); } }] : [])] : [];
  const extraItems = [...phoneItems, ...(self && !creating ? [{ label: "Facts sheet", run: () => setPanel("facts") }, { label: "AI keys", run: () => setPanel("keys") }, { label: "Weekly report", run: () => setTab("Report") }, { label: "Share a view-only link", run: () => setPanel("share") }] : [])];
  async function confirmDelete() {
    if (!del) return;
    setDeleting(true);
    const ok = await profAct.remove(del);
    setDeleting(false);
    if (ok) { setDel(null); setCreating(false); }
  }
  // One primary action: connect keys until one is saved, then run.
  const primary = !self || creating ? null : !keyCount
    ? <button className={cx(s.btn, s.red)} onClick={() => setPanel("keys")}>Connect AI keys</button>
    : editable ? <button className={cx(s.btn, s.red)} disabled={!active.length} title={!active.length ? "Approve prompts first" : undefined} onClick={() => setRunOpen(true)}>Run prompts</button> : null;
  return (
    <CitationProfileProvider value={prof}>
    <div className={cx("mx-auto max-w-[1180px]", s.root)}>
      <EntryMoment section="citations" title="AI citations" status={self ? `Whether AI answers name ${w.person} and ${w.company}.` : "Whether AI answers name the people and companies you track."} onDone={firstRun ? setupTour.autoStart : undefined} />
      <header data-tour="header" className={cx(s.head, "pl-10 md:pl-0")}>
        <div className={s.headText}>
          <h1 className={s.title}>AI citations</h1>
          <p className={s.sub}>{self && !creating ? `Whether AI answers name ${w.first} and ${w.company} when buyers ask.` : "Whether AI answers name the people and companies you track."}</p>
          {switchable && (creating || prof.current) && <ProfileChip name={creating ? "a new profile" : prof.current!.name} draft={creating} onOpen={setMenu} />}
        </div>
        <div id="tour-run" className={s.actions}>
          <button className={cx(s.btn, s.ghost, "max-md:hidden")} onClick={startTour}>Guide</button>
          {setupView && creating && prof.current && <button className={s.btn} onClick={() => setCreating(false)} title={`Back to ${prof.current.name}`}>Cancel</button>}
          {self && !creating && <>
            <button className={cx(s.btn, "max-md:hidden")} onClick={() => setPanel("ask")} disabled={!runs.length} title={!runs.length ? "Available after the first run" : undefined}>Ask</button>
            <button className={cx(s.btn, "max-md:hidden")} onClick={() => { setDraftInit(""); setPanel("draft"); }}>Draft test</button>
          </>}
          {(switchable || extraItems.length > 0) && moreBtn}
          {primary}
          <AccountMenu />
        </div>
      </header>
      {menu && (switchable
        ? <ProfileMenu anchor={menu} profiles={prof.profiles} currentId={creating ? null : prof.current?.id ?? null} editable={editable} owner={can("owner")} items={extraItems} onClose={() => setMenu(null)}
            onChoose={(p) => { setCreating(false); profAct.choose(p); }} onNew={() => { setCreating(true); setTab("Home"); }} onArchive={profAct.archive} onRestore={(p) => { setCreating(false); profAct.restore(p); }} onDelete={setDel} />
        : <ActionMenu anchor={menu} onClose={() => setMenu(null)} items={extraItems} />)}
      {del && <DeleteProfile profile={del} busy={deleting} onClose={() => setDel(null)} onConfirm={confirmDelete} />}
      {!setupView ? <nav className={s.tabs} role="tablist" aria-label="AI citations">
        {TABS.map((t) => {
          const sug = qs.rows.filter((q) => q.status === "suggested").length, openRecs = recs.rows.filter((r) => r.status === "open" || r.status === "accepted").length;
          const n = t === "Gaps" ? gapCount : t === "Prompts" ? active.length + sug : t === "Answers" ? runs.length : t === "Competitors" ? rivals.length : t === "Actions" ? openRecs : 0;
          return <button key={t} role="tab" aria-selected={tab === t} className={cx(s.tab, tab === t && s.tabOn)} onClick={() => setTab(t)}>{t}{n > 0 && <span className={cx(s.count, t === "Gaps" && s.countRed)}>{n}</span>}</button>;
        })}
      </nav> : <div className="mb-6" />}

      {setupView ? <Setup editable={editable} fresh={creating} onDone={() => setCreating(false)} />
        : !loaded || qs.loading || !self || !c ? <div className={cx(s.card, "h-64 animate-pulse")} />
        : tab === "Home" ? (!active.length && !qs.rows.some((q) => q.status === "suggested") ? <QuickSetup count={qs.rows.length} />
          : !runs.length ? <FirstRun c={c} keys={keyCount} editable={editable} onKeys={() => setPanel("keys")} onRun={() => setRunOpen(true)} onTab={(t) => setTab(t as Tab)} />
          : <Home c={c} keys={keys} onTab={(t) => setTab(t as Tab)} onOpenRun={(id) => { const r = runRows.find((x) => x.id === id); if (r) setOpen(r); }} onKeys={() => setPanel("keys")}
              slots={{ alerts: <AlertsCard runs={runs} qs={qs.rows} self={self} rivals={rivals} />, moves: <NextMoves recs={recs.rows} computed={recommend(runs, qs.rows, self, rivals)} onAll={() => setTab("Actions")} />, profile: <ProfileCard facts={facts} onFacts={() => setPanel("facts")} /> }} />)
        : tab === "Gaps" ? <Gaps c={c} editable={editable} onTab={(t) => setTab(t as Tab)} siteGaps={<SiteGaps runs={runs} self={self} rivals={rivals} editable={editable} w={w} />} />
        : tab === "Prompts" ? <Questions qs={qs.rows} sets={sets.rows} runs={runs} self={self} editable={editable} c={c} w={w} />
        : tab === "Answers" ? <div id="tour-answers"><Answers runs={runs} rows={runRows} qs={qs.rows} self={self} rivals={rivals} manual={manual} qById={qById} onOpen={setOpen} w={w} /></div>
        : tab === "Sources" ? <div id="tour-sourcestab"><Sources runs={runs} self={self} person={person} rivals={rivals} editable={editable} w={w} /></div>
        : tab === "Competitors" ? <div id="tour-competitors"><Competitors ents={ents.rows} runs={runs} qs={qs.rows} self={self} editable={editable} w={w} /></div>
        : tab === "Actions" ? <div id="tour-actions"><Actions recs={recs.rows} runs={runs} qs={qs.rows} self={self} rivals={rivals} /></div>
        : tab === "Report" ? <Report c={c} facts={facts} onShare={() => setPanel("share")} />
        : <Company c={c} ents={ents.rows} editable={editable} facts={facts} onFacts={() => setPanel("facts")} />}

      {open && self && <Evidence run={open} q={qById.get(open.question_id)} self={self} rivals={rivals} c={c} facts={facts} editable={editable} onJudged={loadRuns} onClose={() => setOpen(null)} w={w} />}
      {runOpen && self && <RunPanel qs={active} self={self} facts={facts} onKeys={() => setPanel("keys")} onClose={() => setRunOpen(false)} onDone={() => { loadRuns(); toast("Run finished"); }} />}
      {panel === "keys" && <KeysModal onClose={() => setPanel("")} />}
      {panel === "ask" && self && <AskPanel runs={runs} qs={qs.rows} self={self} rivals={rivals} onClose={() => setPanel("")} />}
      {panel === "draft" && self && <DraftTest qs={qs.rows} self={self} initial={draftInit} onClose={() => setPanel("")} />}
      {panel === "facts" && <FactsDrawer facts={facts} names={w} onClose={() => { setPanel(""); loadFacts(); }} />}
      {panel === "share" && self && <ShareDialog snap={buildSnapshot(runs, qs.rows, self, rivals, recs.rows, prof.current?.name ?? ws.name)} onClose={() => setPanel("")} />}
      {tour && <Tour steps={TOUR} step={tour.step} done={tour.done.size} onStep={tourStep} onClose={() => { setTour(null); toast("Tour closed. Guide opens it again."); }} />}
      {setupTour.node}
    </div>
    </CitationProfileProvider>
  );
}

// ---------------- setup ----------------
// fresh: a new tracked profile from the header menu, so nothing is filled in.
function Setup({ editable, fresh, onDone }: { editable: boolean; fresh: boolean; onDone: () => void }) {
  const { ws } = useWorkspace();
  const toast = useToast();
  const prof = useCitationScope();
  const li = ws.linkedin_url ? ws.linkedin_url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "") : "";
  // Starts from the profile's own name and company (Settings); a new tracked profile starts empty. All editable before tracking starts.
  const company = companyOf(ws, "");
  const [f, setF] = useState(fresh ? { name: "", aliases: "", domains: "", person: "", li: "" } : { name: company, aliases: company, domains: "", person: fullNameOf(ws, ""), li });
  const [busy, setBusy] = useState(false);
  const allArchived = !fresh && !prof.legacy && !prof.current && archivedProfiles(prof.profiles).length > 0;
  const fullName = f.person.trim().split(/\s+/).length >= 2;
  async function save() {
    setBusy(true);
    const name = profileName(f.person, f.name, ws.name);
    // Before db/017 there are no profiles. After it, the setup fills the profile in view, or makes a new one.
    let pid = prof.legacy || fresh ? null : prof.current?.id ?? null;
    if (!prof.legacy && !pid) {
      const { data, error } = await supabase().from("citation_profiles").insert({ workspace_id: ws.id, name, sort: nextSort(prof.profiles) }).select("id").single();
      if (error) { setBusy(false); toast(error.message); return; }
      pid = data.id as string;
    } else if (pid && prof.current?.name !== name) await supabase().from("citation_profiles").update({ name }).eq("id", pid);
    const { error } = await supabase().from("citation_entities").insert([
      withProfile({ workspace_id: ws.id, kind: "self", subject: "person", name: f.person.trim(), aliases: [f.person.trim()], domains: list(f.li), sort: 0 }, pid),
      withProfile({ workspace_id: ws.id, kind: "self", subject: "company", name: f.name.trim(), aliases: [...new Set([f.name.trim(), ...list(f.aliases)])], domains: list(f.domains), sort: 1 }, pid),
    ]);
    setBusy(false);
    if (error) { toast(error.message); return; }
    if (pid && pid !== prof.current?.id) await prof.choose(pid);
    prof.reload(); haptic(); onDone();
    toast(fresh ? `Now tracking ${name}. Add its prompts next.` : "Tracking set up");
  }
  const field = (k: keyof typeof f, label: string, ph: string, hint?: string) => (
    <label className="grid gap-1.5"><span className={s.label}>{label}</span><input className={s.field} placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />{hint && <span className={s.hint}>{hint}</span>}</label>
  );
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <Card tour="setup" title="Who should the AI name?">
        <div className="grid gap-5 border-t border-[#e8e8e8] p-[18px]">
          {(fresh || allArchived) && <p className={s.small}>{fresh ? "A new profile starts empty. The one you were viewing is unchanged." : "Every profile is archived. Restore one from the menu, or set up a new one."}</p>}
          <fieldset className="grid gap-3"><legend className="mb-2 text-[13px] font-semibold">Person</legend>
            {field("person", "Full name", "First and last name")}
            {field("li", "LinkedIn profile", "linkedin.com/in/their-profile", "Also covers their posts and articles.")}
          </fieldset>
          <div className="h-px bg-[#efefef]" /><fieldset className="grid gap-3"><legend className="mb-2 text-[13px] font-semibold">Company</legend>
            {field("name", "Company name", "Company")}
            {field("aliases", "Other names to match", "Company Ltd, company.com", "Separate with commas. Matched as whole words.")}
            {field("domains", "Owned domains", "company.com", "An answer citing one of these counts as linked.")}
          </fieldset>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-[#e8e8e8] px-[18px] py-3">
          {editable ? <button className={cx(s.btn, s.red)} onClick={save} disabled={busy || !fullName || !f.name.trim()}>{busy ? "Setting up" : "Start tracking"}</button> : <p className={s.small}>An editor sets this up.</p>}
        </div>
      </Card>
      <Card tour="next" title="What happens next">
        <ol className={cx(s.rows, s.rowsTop)}>
          {[["Pick the prompts", "Start from 20 buyer prompts or write your own."], ["Connect an AI key", "Claude, ChatGPT, Gemini or Perplexity. It stays in this browser."], ["Run and read the answers", "Who is named and linked, and which sites the AI trusted."]].map(([t, d], i) => (
            <li key={t} className={s.step}><span className={s.stepMark} aria-hidden>{i + 1}</span><span><b className="block text-[13.5px] font-semibold">{t}</b><span className={s.small}>{d}</span></span></li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

// ---------------- answers ----------------
function Legend3() {
  return <span className="flex flex-wrap gap-x-4 gap-y-1"><Status tone="red">Named, linked</Status><Status tone="ring">Named, not linked</Status><Status tone="grey"><span className={s.none}>Not named</span></Status></span>;
}
function Answers({ runs, rows, qs, qById, self, rivals, manual, onOpen, w }: { runs: Run[]; rows: RunRow[]; qs: Question[]; qById: Map<string, Question>; self: Entity; rivals: Entity[]; manual: Manual[]; onOpen: (r: RunRow) => void; w: Names }) {
  const active = qs.filter((q) => q.status === "active");
  const batches = useMemo(() => latestBatches(runs), [runs]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  if (!runs.length) return <Card><Empty title="Answers appear after the first run" body={`Each prompt on each AI tool, with whether ${w.first} or ${w.company} is named and linked.`} /></Card>;
  return (
    <div className="flex flex-col gap-4">
      <Card title="Latest answer per AI tool" action={<span className="hidden text-[12px] font-normal md:block"><Legend3 /></span>}>
        <div className="overflow-x-auto">
          <table className={s.table}>
            <thead><tr><th className="min-w-[200px] md:min-w-[280px]">Prompt</th>{LIVE.map((e) => <th key={e.id} className="w-[150px]"><span className="flex items-center gap-1.5"><ProviderLogo id={e.id} size={14} />{e.name.split(" ").pop()}</span></th>)}</tr></thead>
            <tbody>{active.map((q) => (
              <tr key={q.id}>
                <td><div className="font-medium leading-snug">{q.question}</div><div className={s.small}>{[AUDIENCE_LABEL[audienceOf(q)], q.region, q.language !== "English" && q.language, isBranded(q, self) && "Branded, not scored"].filter(Boolean).join(" · ")}</div></td>
                {LIVE.map((e) => {
                  const b = batches.get(`${q.id}|${e.id}`);
                  if (!b) return <td key={e.id}><span className={cx(s.cell, s.cEmpty)}>Not run</span></td>;
                  const a = aggregate(b.now, self), first = b.now.find((r) => r.status !== "failed") ?? b.now[0];
                  const rivalsNamed = rivals.filter((r) => aggregate(b.now, r)?.named).length;
                  const wrong = b.now.some((r) => (r.fact_issues ?? []).length);
                  const tone = first.sentiment || (a?.named ? sentimentOf(first.answer, self.aliases) : null);
                  const label = !a ? "Failed" : a.named ? `Named${a.position ? ` #${a.position}` : ""}` : "Not named";
                  const extra = [a && a.n > 1 ? `${a.k} of ${a.n} repeats` : "", a?.named && tone === "negative" ? "Negative tone" : "", rivalsNamed ? `${rivalsNamed} peer${rivalsNamed > 1 ? "s" : ""}` : "", wrong ? "Wrong fact" : ""].filter(Boolean).join(" · ");
                  return (
                    <td key={e.id}>
                      <button className={cx(s.cell, !a && s.cFailed, a?.named && (a.linked ? s.cNamed : s.cNamedNoLink), "flex-col items-start gap-0")} onClick={() => { const r = byId.get(first.id); if (r) onOpen(r); }} aria-label={`${q.question} on ${e.name}: ${label}${a?.named ? (a.linked ? ", linked" : ", not linked") : ""}`}>
                        <Status tone={!a ? "grey" : a.named ? (a.linked ? "red" : "ring") : "grey"}><span className={!a || !a.named ? s.none : undefined}>{label}</span></Status>
                        {extra && <span className={cx(s.small, "pl-[13px] text-[11.5px]", wrong && "text-[#9e1c1c]")}>{extra}</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
        {!active.length && <div className={s.rowsTop}><Empty title="No active prompts" /></div>}
        <div className="border-t border-[#e8e8e8] px-[18px] py-3 text-[12px] md:hidden"><Legend3 /></div>
      </Card>
      <Runs rows={rows} qById={qById} self={self} manual={manual} onOpen={onOpen} />
    </div>
  );
}

// ---------------- run panel ----------------
function RunPanel({ qs, self, facts, onKeys, onClose, onDone }: { qs: Question[]; self: Entity; facts: Partial<Facts>; onKeys: () => void; onClose: () => void; onDone: () => void }) {
  const { ws } = useWorkspace();
  const { scope } = useCitationScope();
  const { status } = useExtension();
  const toast = useToast();
  const ready = (e: Engine) => !!status?.searchKeys?.[e];
  const [pick, setPick] = useState<Engine[] | null>(null);
  const [prog, setProg] = useState<{ done: number; total: number; failed: number; stopped: boolean } | null>(null);
  const stop = useRef(false);
  const [check, setCheck] = useState(true);
  const reps = (q: Question) => Math.max(1, Math.min(3, q.repeats ?? 1));
  const nRuns = qs.reduce((a, q) => a + reps(q), 0);
  const chosen = pick ?? LIVE.map((e) => e.id).filter((e) => status?.searchKeys?.[e]);
  const total = nRuns * chosen.length;
  const est = chosen.reduce((a, e) => ({ inTok: a.inTok + ESTIMATE[e].inTok * nRuns, outTok: a.outTok + ESTIMATE[e].outTok * nRuns, usd: a.usd + ESTIMATE[e].usd * nRuns }), { inTok: 0, outTok: 0, usd: 0 });
  const missing = LIVE.filter((e) => !ready(e.id)).length;

  async function one(q: Question, engine: Engine, rep: number) {
    const prompt = promptFor(q, engine), country = engine === "gemini" ? "" : COUNTRY[q.region] ?? "";
    const base = withProfile({ workspace_id: ws.id, question_id: q.id, engine, web_search: true, question_text: prompt, region: q.region, language: q.language, repeat_index: rep }, scope);
    try {
      const res = await askExtension<{ model: string; raws: Record<string, unknown>[] }>("search", { engine, prompt, country }, 240000);
      const p = parseEngine(engine, res.raws);
      const st = statusOf(p);
      const { data, error } = await supabase().from("citation_runs").insert({ ...base, model: p.model || res.model, status: st, answer: p.answer, input_tokens: p.input_tokens, output_tokens: p.output_tokens, error: p.refused ? "The model declined to answer" : "" }).select("id").single();
      if (error) throw error;
      if (p.sources.length) await supabase().from("citation_sources").insert(p.sources.map((x, i) => ({ workspace_id: ws.id, run_id: data.id, url: x.url, title: x.title, domain: x.domain, cited: x.cited, sort: i })));
      // Tone and facts only matter when the tracked names appear; one small call on the main AI key.
      if (check && st !== "failed" && detect({ answer: p.answer, sources: p.sources, status: st }, self).named) await judgeRun({ id: data.id, answer: p.answer }, facts, self);
      return st !== "failed";
    } catch (e) {
      // A failed run is stored so it shows on the Runs tab; it never counts as "not named".
      await supabase().from("citation_runs").insert({ ...base, model: "", status: "failed", error: (e as Error).message.slice(0, 500) });
      return false;
    }
  }

  async function start() {
    stop.current = false;
    const queue = qs.flatMap((q) => chosen.flatMap((e) => Array.from({ length: reps(q) }, (_, i) => [q, e, i] as const)));
    const n = queue.length;
    let done = 0, failed = 0;
    setProg({ done, total: n, failed, stopped: false });
    // Three at a time, so no provider is hit in a burst.
    await Promise.all([0, 1, 2].map(async () => {
      while (queue.length && !stop.current) {
        const [q, e, i] = queue.shift()!;
        if (!(await one(q, e, i))) failed++;
        done++;
        setProg({ done, total: n, failed, stopped: stop.current });
      }
    }));
    setProg({ done, total: n, failed, stopped: stop.current });
    haptic(); onDone();
    if (failed) toast(`${failed} of ${done} runs failed. Answers shows why.`);
  }

  const running = !!prog && prog.done < prog.total && !prog.stopped;
  return (
    <Side title="Run prompts" sub={`${qs.length} active prompts, asked as written with web search on${nRuns > qs.length ? `, ${nRuns} asks per AI tool` : ""}.`} onClose={() => !running && onClose()}
      foot={running
        ? <button className={s.btn} onClick={() => { stop.current = true; setProg({ ...prog!, stopped: true }); }}>Stop after the current ones</button>
        : <button className={cx(s.btn, s.red)} disabled={!total} onClick={start}>{prog ? "Run again" : `Start ${total} runs`}</button>}>
      {status && !status.installed && <p className="mb-3 text-[13px] text-[#9e1c1c]">Install the Prax extension from the Extension page first.</p>}
      <Card title="AI tools" meta={`${chosen.length} selected`} action={missing ? <button className={s.link} onClick={onKeys}>Connect AI keys</button> : undefined}>
        <div className={cx(s.rows, s.rowsTop)}>{LIVE.map((e) => (
          <label key={e.id} className={cx(s.row, "cursor-pointer py-3", !ready(e.id) && "cursor-default")}>
            <input type="checkbox" className="accent-[#141414]" disabled={!ready(e.id) || !!prog} checked={chosen.includes(e.id)} onChange={(ev) => setPick(ev.target.checked ? [...chosen, e.id] : chosen.filter((x) => x !== e.id))} />
            <span className="min-w-0 flex-1"><ProviderMark id={e.id} /><span className={cx(s.small, "block pl-6")}>{ready(e.id) ? ESTIMATE[e.id].note : "No key in this browser"}</span></span>
          </label>
        ))}</div>
      </Card>
      <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-[#e8e8e8] p-3.5"><input type="checkbox" className="mt-0.5 accent-[#141414]" checked={check} disabled={!!prog} onChange={(e) => setCheck(e.target.checked)} /><span><span className="block text-[13.5px] font-semibold">Check tone and facts</span><span className={s.small}>One small call on your main AI key when a tracked name appears.</span></span></label>
      <dl className="mt-3 grid grid-cols-3 gap-3 rounded-xl bg-[#fafafa] p-3.5 text-[13px]">
        <div><dt className={s.small}>Runs</dt><dd className={cx(s.tnum, "font-semibold")}>{total}</dd></div>
        <div><dt className={s.small}>Tokens, about</dt><dd className={cx(s.tnum, "font-semibold")}>{Math.round(est.inTok / 1000)}k in, {Math.round(est.outTok / 1000)}k out</dd></div>
        <div><dt className={s.small}>List price, about</dt><dd className={cx(s.tnum, "font-semibold")}>${est.usd.toFixed(2)}</dd></div>
      </dl>
      <p className={cx(s.small, "mt-2")}>An estimate. You pay each provider directly.</p>
      {prog && (
        <div className="mt-4" role="status">
          <div className={s.bar}><div className={cx(s.barFill, s.barMe)} style={{ width: `${Math.round((prog.done / Math.max(1, prog.total)) * 100)}%` }} /></div>
          <p className={cx(s.small, s.tnum, "mt-1.5")}>{prog.done} of {prog.total} done{prog.failed ? `, ${prog.failed} failed` : ""}{prog.stopped ? ", stopped" : ""}</p>
        </div>
      )}
    </Side>
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

function Evidence({ run, q, self, rivals, c, facts, editable, onJudged, onClose, w }: { run: RunRow; q?: Question; self: Entity; rivals: Entity[]; c: Ctx | null; facts: Partial<Facts>; editable: boolean; onJudged: () => void; onClose: () => void; w: Names }) {
  const toast = useToast();
  const r: Run = { ...run, sources: [...(run.citation_sources ?? [])].sort((a, b) => a.sort - b.sort) };
  const d = detect(r, self);
  const [review, setReview] = useState(run.person_review ?? "");
  const p = c?.person ? detectPerson({ answer: run.answer, person_review: review }, c.person, c.company, c.ctx) : null;
  const co = c?.company ? detect(r, c.company) : null;
  async function decide(v: "confirmed" | "rejected" | "") {
    const before = review;
    const { error } = await supabase().from("citation_runs").update({ person_review: v }).eq("id", run.id);
    if (error) { toast(error.message); return; }
    setReview(v); haptic(); onJudged();
    toast(v === "confirmed" ? `Counted as ${w.first}` : v === "rejected" ? "Marked as someone else" : "Back to needs review", async () => { await supabase().from("citation_runs").update({ person_review: before }).eq("id", run.id); setReview(before); onJudged(); });
  }
  const [judged, setJudged] = useState<{ sentiment: string; issues: FactIssue[] } | null>(run.judged_at ? { sentiment: run.sentiment, issues: run.fact_issues ?? [] } : null);
  const [busy, setBusy] = useState(false);
  const tone = judged?.sentiment || (d.named ? sentimentOf(run.answer, self.aliases) : null);
  const facts2: [string, React.ReactNode][] = [
    [w.first, p ? <Status tone={p.named ? "red" : p.review ? "ring" : "grey"}>{p.named ? "Named" : p.review ? "Needs review" : "Not named"}</Status> : <Status tone={d.named ? "red" : "grey"}>{d.named ? "Named" : "Not named"}</Status>],
    [w.company, co ? <Status tone={co.named ? "red" : "grey"}>{co.named ? "Named" : "Not named"}</Status> : "None"],
    ["Linked", <Status key="l" tone={d.linked ? "red" : "grey"}>{d.linked ? "Yes" : d.linked === null ? "No sources given" : "No"}</Status>],
    ["Position", d.position ? <span className={s.tnum}>#{d.position}</span> : <span className={s.none}>None</span>],
    ["Peers named", rivals.filter((x) => detect(r, x).named).map((x) => x.name).join(", ") || <span className={s.none}>None</span>],
    ["Tone", d.named && tone ? `${tone[0].toUpperCase() + tone.slice(1)}${judged?.sentiment ? "" : ", quick read"}` : <span className={s.none}>Not read</span>],
  ];
  return (
    <Side title={q?.question ?? run.question_text} onClose={onClose}>
      <div className={cx(s.small, "-mt-2 flex flex-wrap items-center gap-x-1.5")}><ProviderMark id={run.engine} short className="text-[#141414]" /> · {run.model ? <ModelId model={run.model} /> : "Model unknown"} · <span className={s.tnum}>{when(run.run_at)}</span>{q && <> · {AUDIENCE_LABEL[audienceOf(q)]} prompt</>}</div>
      {run.status === "failed" && <p className="mt-3 text-[13px] font-semibold text-[#9e1c1c]">This run failed and is not counted.</p>}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-[#e8e8e8] p-4 text-[13px]">
        {facts2.map(([k, v]) => <div key={k} className="min-w-0"><dt className={s.small}>{k}</dt><dd className="mt-0.5 truncate">{v}</dd></div>)}
      </dl>
      {p && (p.review || review) && (
        <div className="mt-3 rounded-xl bg-[#fafafa] p-4">
          <div className="text-[13.5px] font-semibold">Is this {w.person} of {w.company}?</div>
          <p className={cx(s.small, "mt-0.5")}>{review === "confirmed" ? "You confirmed it." : review === "rejected" ? "You marked it as someone else." : "The full name appears without context nearby, so it is not counted until you decide."}</p>
          {editable && <div className="mt-3 flex gap-2">{review ? <button className={cx(s.btn, s.sm)} onClick={() => decide("")}>Undo decision</button> : <><button className={cx(s.btn, s.sm, s.dark)} onClick={() => decide("confirmed")}>Yes, count it</button><button className={cx(s.btn, s.sm)} onClick={() => decide("rejected")}>Someone else</button></>}</div>}
        </div>
      )}
      {d.named && (
        <div className="mt-3 rounded-xl border border-[#e8e8e8] p-4">
          <div className="flex items-center justify-between gap-2"><span className="text-[13.5px] font-semibold">Facts</span>{editable && run.status !== "failed" && <button className={cx(s.btn, s.sm)} disabled={busy} onClick={async () => { setBusy(true); setJudged(await judgeRun({ id: run.id, answer: run.answer }, facts, self)); setBusy(false); onJudged(); }}>{busy ? "Checking" : judged ? "Check again" : "Check tone and facts"}</button>}</div>
          {!judged ? <p className={cx(s.small, "mt-1")}>Not checked yet.</p>
            : judged.issues.length ? <ul className="mt-2 grid gap-2">{judged.issues.map((i, k) => <li key={k} className="text-[13px]"><Status tone="ring"><b>{i.fact}</b></Status><span className={cx(s.small, "block pl-[13px]")}>Said: {i.said}</span></li>)}</ul>
            : <p className="mt-1 text-[13px]">Nothing contradicts the facts sheet.</p>}
        </div>
      )}
      {q && run.question_text && run.question_text !== q.question && <p className={cx(s.small, "mt-3")}>Sent as: {run.question_text}</p>}
      <div className="mt-5"><div className="mb-2 text-[13.5px] font-semibold">Answer</div>{run.status === "failed" && !run.answer ? <p className={s.small}>{run.error || "No answer came back."}</p> : <Highlight text={run.answer} self={self} rivals={rivals} />}</div>
      <div className="mt-6">
        <div className="mb-2 text-[13.5px] font-semibold">Sources <span className={cx(s.faint, "font-normal")}>{r.sources.length}</span></div>
        {r.sources.length === 0 ? <p className={s.small}>No sources cited, so linking is unknown.</p> : (
          <ul className="grid">{r.sources.map((x) => (
            <li key={x.url} className="flex items-start gap-3 border-t border-[#efefef] py-2 text-[13px]">
              <span className="w-12 shrink-0 pt-px text-[12px] text-[#5f5f5f]">{x.cited ? "Cited" : "Read"}</span>
              <a href={x.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 break-words hover:underline"><span className="font-medium">{x.domain}</span> <span className={s.small}>{x.title}</span></a>
              {d.ownedSources.some((o) => o.url === x.url) && <span className={cx(s.pill, s.pRed)}>Owned</span>}
            </li>
          ))}</ul>
        )}
      </div>
    </Side>
  );
}

// ---------------- prompts ----------------
const AUDIENCES: Audience[] = ["expert", "vendor", "leadership"];
function KeywordsCell({ q, editable, onSave }: { q: Question; editable: boolean; onSave: (k: string[]) => void }) {
  const [v, setV] = useState((q.keywords ?? []).join(", "));
  const dirty = v !== (q.keywords ?? []).join(", ");
  if (!editable) return <span className="text-[12.5px] text-[#5f5f5f]">{(q.keywords ?? []).join(", ") || "None"}</span>;
  return <span className="flex gap-1"><input aria-label="Keywords" className={cx(s.field, "h-[30px] w-40 text-[12.5px]")} placeholder="None" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && dirty && onSave(list(v))} />{dirty && <button className={cx(s.btn, s.sm)} onClick={() => onSave(list(v))}>Save</button>}</span>;
}

function AddPrompt({ setId, count, w, onClose }: { setId: string | null; count: number; w: Names; onClose: () => void }) {
  const { ws } = useWorkspace();
  const { scope } = useCitationScope();
  const toast = useToast();
  const [f, setF] = useState({ question: "", topic: "", region: "Global", language: "English", audience: "vendor" as Audience, keywords: "" });
  const hint: Record<Audience, string> = { expert: `Who to listen to. Scores ${w.first}.`, vendor: `Who to hire. Scores ${w.company}.`, leadership: "Who leads it. Scores both." };
  async function add(e: React.FormEvent) {
    e.preventDefault(); if (!f.question.trim()) return;
    const { data, error } = await supabase().from("citation_questions").insert(withProfile({ workspace_id: ws.id, question: f.question.trim(), topic: f.topic, region: f.region === "Global" ? "" : f.region, language: f.language, audience: f.audience, keywords: list(f.keywords), status: "active", sort: count + 1, set_id: setId }, scope)).select("id").single();
    if (error) { toast(error.message); return; }
    haptic(); onClose(); toast("Prompt added", async () => { await supabase().from("citation_questions").delete().eq("id", data.id); });
  }
  return (
    <Side title="Add a prompt" sub={`Write it the way a buyer would. Prompts that name ${w.first} or ${w.company} are kept but not scored.`} onClose={onClose}
      foot={<><button className={s.btn} onClick={onClose}>Cancel</button><button type="submit" form="add-prompt" className={cx(s.btn, s.red)} disabled={!f.question.trim()}>Add prompt</button></>}>
      <form id="add-prompt" onSubmit={add} className="grid gap-4">
        <label className="grid gap-1.5"><span className={s.label}>Prompt</span><textarea autoFocus rows={3} className={s.field} placeholder="For example: Who are the best partners for this in our region?" value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} /></label>
        <label className="grid gap-1.5"><span className={s.label}>Who it scores</span><select className={s.field} value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value as Audience })}>{AUDIENCES.map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}</select><span className={s.hint}>{hint[f.audience]}</span></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5"><span className={s.label}>Region</span><select className={s.field} value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })}>{Object.keys(COUNTRY).filter(Boolean).map((r) => <option key={r}>{r}</option>)}</select></label>
          <label className="grid gap-1.5"><span className={s.label}>Language</span><select className={s.field} value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}>{LANGUAGES.map((l) => <option key={l}>{l}</option>)}</select></label>
        </div>
        <label className="grid gap-1.5"><span className={s.label}>Keywords</span><input className={s.field} placeholder="Two or three words, separated by commas" value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} /></label>
        <label className="grid gap-1.5"><span className={s.label}>Topic</span><input className={s.field} placeholder="Optional" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} /></label>
      </form>
    </Side>
  );
}

function Questions({ qs, sets, runs, self, editable, c, w }: { qs: (Question & { sort: number })[]; sets: SetRow[]; runs: Run[]; self: Entity; editable: boolean; c: Ctx; w: Names }) {
  const toast = useToast();
  const [setView, setSetView] = useState("all");
  const [kw, setKw] = useState("");
  const [adding, setAdding] = useState(false);
  async function patchQ(id: string, patch: Record<string, unknown>, msg: string) {
    const { error } = await supabase().from("citation_questions").update(patch).eq("id", id);
    if (error) toast(error.message); else { haptic(); toast(msg); }
  }
  const [show, setShow] = useState<"active" | "archived">("active");
  async function setStatus(id: string, status: string) {
    const { error } = await supabase().from("citation_questions").update({ status }).eq("id", id);
    if (error) toast(error.message); else { haptic(); toast(status === "archived" ? "Archived. Its past runs stay." : "Active again", status === "archived" ? () => setStatus(id, "active") : undefined); }
  }
  const shown = qs.filter((q) => (show === "active" ? q.status === "active" : q.status === "archived") && (setView === "all" || (setView === "none" ? !q.set_id : q.set_id === setView)) && (!kw || (q.keywords ?? []).includes(kw)));
  const sel = "h-[30px] text-[12.5px]";
  return (
    <div className="flex flex-col gap-4">
      {!qs.length && editable && <QuickSetup count={0} />}
      <Suggested qs={qs} />
      <SetsBar sets={sets} qs={qs} runs={runs} self={self} value={setView} onChange={setSetView} />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
        <Card title={<span className={s.seg} role="group" aria-label="Show">{(["active", "archived"] as const).map((v) => <button key={v} aria-pressed={show === v} onClick={() => setShow(v)}>{v === "active" ? "Active" : "Archived"}</button>)}</span>}
          meta={kw ? <button className={cx(s.pill, s.pDark)} onClick={() => setKw("")} aria-label={`Clear keyword ${kw}`}>{kw} ×</button> : undefined}
          action={editable && <button className={cx(s.btn, s.sm)} onClick={() => setAdding(true)}>Add prompt</button>}>
          <div className="overflow-x-auto">
            <table className={s.table}>
              <thead><tr><th className="min-w-[260px]">Prompt</th><th>Scores</th><th>Keywords</th><th>Region</th><th>Group</th><th>Asks</th><th /></tr></thead>
              <tbody>{shown.map((q) => (
                <tr key={q.id}>
                  <td><div className="font-medium leading-snug">{q.question}</div><div className={s.small}>{[q.topic, q.language !== "English" && q.language, isBranded(q, self) && "Branded, not scored"].filter(Boolean).join(" · ")}</div></td>
                  <td><select aria-label="Who it scores" className={cx(s.field, sel, "w-28")} disabled={!editable} value={audienceOf(q)} onChange={(e) => patchQ(q.id, { audience: e.target.value }, "Saved. Scores update.")}>{AUDIENCES.map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}</select></td>
                  <td><KeywordsCell key={(q.keywords ?? []).join("|")} q={q} editable={editable} onSave={(k) => patchQ(q.id, { keywords: k }, "Keywords saved")} /></td>
                  <td className="whitespace-nowrap text-[12.5px]">{q.region || "Global"}</td>
                  <td><select aria-label="Prompt group" className={cx(s.field, sel, "w-32")} disabled={!editable} value={q.set_id ?? ""} onChange={(e) => patchQ(q.id, { set_id: e.target.value || null }, "Moved")}><option value="">None</option>{sets.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
                  <td><select aria-label="Asks per run" title="Asking 2 or 3 times gives a steadier read and costs more" className={cx(s.field, sel, "w-16")} disabled={!editable} value={q.repeats ?? 1} onChange={(e) => patchQ(q.id, { repeats: Number(e.target.value) }, "Saved")}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></td>
                  <td className={s.r}>{editable && <button className={cx(s.btn, s.ghost, s.sm)} onClick={() => setStatus(q.id, q.status === "active" ? "archived" : "active")}>{q.status === "active" ? "Archive" : "Restore"}</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {!shown.length && <div className={s.rowsTop}><Empty title={kw ? "No prompt uses this keyword" : show === "active" ? "No active prompts" : "Nothing archived"} /></div>}
        </Card>
        <KeywordsPanel c={c} value={kw} onPick={setKw} />
      </div>
      {adding && <AddPrompt setId={setView !== "all" && setView !== "none" ? setView : null} count={qs.length} w={w} onClose={() => setAdding(false)} />}
    </div>
  );
}

// ---------------- runs ----------------
function Runs({ rows, qById, self, manual, onOpen }: { rows: RunRow[]; qById: Map<string, Question>; self: Entity; manual: Manual[]; onOpen: (r: RunRow) => void }) {
  const [shown, setShown] = useState(25);
  const weeks = useMemo(() => Object.entries(manual.reduce((m: Record<string, number>, r) => { if (r.cited) m[r.week_start] = (m[r.week_start] ?? 0) + 1; return m; }, {})).slice(0, 12), [manual]);
  return (
    <div className="flex flex-col gap-4">
      <Card title="Run history" meta={`${rows.length} in 90 days`}>
        <div className="overflow-x-auto">
          <table className={s.table}>
            <thead><tr><th>When</th><th className="min-w-[200px] md:min-w-[260px]">Prompt</th><th>AI tool</th><th>Result</th><th className={s.r}>Sources</th><th className={s.r}>Tokens</th></tr></thead>
            <tbody>{rows.slice(0, shown).map((r) => {
              const d = detect({ ...r, sources: r.citation_sources ?? [] }, self);
              return (
                <tr key={r.id}>
                  <td className={cx(s.tnum, "whitespace-nowrap text-[12.5px] text-[#5f5f5f]")}>{when(r.run_at)}</td>
                  <td className="max-w-[380px]"><button className="text-left font-medium hover:underline" onClick={() => onOpen(r)}>{qById.get(r.question_id)?.question ?? r.question_text}</button></td>
                  <td className="whitespace-nowrap"><ProviderMark id={r.engine} short className="text-[#141414]" /></td>
                  <td>{r.status === "failed" ? <span title={r.error}><Status tone="grey"><span className={s.none}>Failed</span></Status></span> : <Status tone={d.named ? "red" : "grey"}>{d.named ? `Named${d.position ? ` #${d.position}` : ""}` : <span className={s.none}>Not named</span>}</Status>}</td>
                  <td className={cx(s.r, s.tnum)}>{r.citation_sources?.length ?? 0}</td>
                  <td className={cx(s.r, s.tnum, "whitespace-nowrap text-[12.5px]")}>{r.input_tokens ? `${(r.input_tokens / 1000).toFixed(1)}k / ${(r.output_tokens / 1000).toFixed(1)}k` : <span className={s.none}>None</span>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        {rows.length > shown && <div className="border-t border-[#e8e8e8] p-2"><button className={cx(s.btn, s.ghost, s.sm, "w-full")} onClick={() => setShown(shown + 100)}>Show more</button></div>}
      </Card>
      {weeks.length > 0 && (
        <Card title="Manual history" meta="Entered by hand, not scored">
          <div className="flex flex-wrap gap-2 px-[18px] pb-[18px]">{weeks.map(([wk, n]) => <span key={wk} className={cx(s.pill, s.pDark)}>Week of {fmtDay(wk, { day: "numeric", month: "short" })}: {n} cited</span>)}</div>
        </Card>
      )}
    </div>
  );
}

// ---------------- sources ----------------
function Sources({ runs, self, person, rivals, editable, w }: { runs: Run[]; self: Entity; person?: Entity; rivals: Entity[]; editable: boolean; w: Names }) {
  const { ws } = useWorkspace();
  const { scope } = useCitationScope();
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
  const li = useMemo(() => linkedinCited(runs, self), [runs, self]);
  const owned = (d: string) => self.domains.some((x) => { const h = x.split("/")[0]; return !x.includes("/") && (d === h || d.endsWith("." + h)); });
  const hasLi = (person?.domains ?? []).some((d) => /linkedin\.com\//i.test(d));

  // The prompt the LinkedIn profile is cited for most often becomes an article idea.
  async function suggestArticle() {
    const counts = new Map<string, number>();
    li.forEach(({ run }) => { const t = run.question_id; counts.set(t, (counts.get(t) ?? 0) + 1); });
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const { data } = best ? await supabase().from("citation_questions").select("question,topic").eq("id", best).maybeSingle() : { data: null };
    const title = data ? `LinkedIn article: ${data.question}` : "LinkedIn article on the topic AI cites most";
    const { data: row, error } = await supabase().from("posts").insert({ workspace_id: ws.id, title, format: "Article", status: "Idea", topic: data?.topic || "AI citations", resource: "AI answers already cite this LinkedIn profile on the topic. A full article gives them more to cite.", ...postProfile(scope) }).select("id").single();
    if (error) { toast(error.message); return; }
    haptic(); setMade(new Set([...made, "li-article"]));
    toast("Article idea added in Content Studio", async () => { await supabase().from("posts").delete().eq("id", row.id); setMade((m) => { const n = new Set(m); n.delete("li-article"); return n; }); });
  }
  if (!runs.length) return <Card><Empty title="Sources appear after the first run" body="The sites each AI tool reads and cites, and which ones are yours." /></Card>;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <Card title="Sites the AI relies on" meta="Last 90 days">
        <div className="overflow-x-auto">
          <table className={s.table}>
            <thead><tr><th>Domain</th><th className={s.r}>Cited</th><th className={s.r}>Read only</th><th className={s.r}>Naming you</th></tr></thead>
            <tbody>{domains.map(([d, e]) => (
              <tr key={d}><td className="font-medium">{d}{owned(d) && <span className={cx(s.pill, s.pRed, "ml-2")}>Owned</span>}</td><td className={cx(s.r, s.tnum)}>{e.cited}</td><td className={cx(s.r, s.tnum)}>{e.read}</td><td className={cx(s.r, s.tnum)}>{e.selfNamed}</td></tr>
            ))}</tbody>
          </table>
        </div>
        {!domains.length && <div className={s.rowsTop}><Empty title="No sources yet" /></div>}
      </Card>
      <div className="flex min-w-0 flex-col gap-4">
        <Card title="LinkedIn in answers" meta={li.length ? String(li.length) : undefined}
          action={editable && li.length > 0 ? <button className={cx(s.btn, s.sm)} disabled={made.has("li-article")} onClick={suggestArticle}>{made.has("li-article") ? "Added" : "Suggest article"}</button> : undefined}>
          {li.length ? <ul className={cx(s.rows, s.rowsTop)}>{li.slice(0, 8).map(({ run, source }, i) => <li key={i} className={cx(s.rowStack, "text-[13px]")}><a className="font-medium hover:underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.title || source.url.replace(/^https?:\/\/(www\.)?/, "")}</a><span className={cx(s.small, "block")}>{engineName(run.engine)} · {fmtDay(ymd(new Date(run.run_at)), { day: "numeric", month: "short" })}</span></li>)}</ul>
            : <div className={s.rowsTop}><Empty title="Not cited yet" body={hasLi ? `No answer has cited ${possessive(w.first)} LinkedIn posts or articles.` : `Add ${possessive(w.first)} LinkedIn profile under Competitors to track it.`} /></div>}
        </Card>
        <SiteGaps runs={runs} self={self} rivals={rivals} editable={editable} w={w} />
        <CommentTargets runs={runs} self={self} />
      </div>
    </div>
  );
}

// Sites that cite peers and never you; shown on Sources and under the prompt gaps.
function SiteGaps({ runs, self, rivals, editable, w }: { runs: Run[]; self: Entity; rivals: Entity[]; editable: boolean; w: Names }) {
  const { ws } = useWorkspace();
  const { scope } = useCitationScope();
  const toast = useToast();
  const [made, setMade] = useState<Set<string>>(new Set());
  const gaps = useMemo(() => citationGaps(runs, self, rivals), [runs, self, rivals]);
  async function toIdea(g: { domain: string; competitors: string[] }) {
    const { data, error } = await supabase().from("posts").insert({ workspace_id: ws.id, title: `Earn a mention on ${g.domain}`, status: "Idea", topic: "AI citations", channel: "company", resource: `AI answers cite ${g.domain} when they name ${g.competitors.join(", ")}, and never when they name ${w.company}. Pitch a guest piece, a quote or data there, or post on the topic it covers. ${w.company} content, not for the personal profile.`, ...postProfile(scope) }).select("id").single();
    if (error) { toast(error.message); return; }
    haptic(); setMade(new Set([...made, g.domain]));
    toast("Added as an idea in Content Studio", async () => { await supabase().from("posts").delete().eq("id", data.id); setMade((m) => { const n = new Set(m); n.delete(g.domain); return n; }); });
  }
  return (
    <Card title="Site gaps" meta={gaps.length ? String(gaps.length) : undefined}>
      {!rivals.length ? <div className={s.rowsTop}><Empty title="Add peers to find site gaps" body="Sites that cite a peer and never you." /></div>
        : !gaps.length ? <div className={s.rowsTop}><Empty title="No site gaps" body="Every site citing a peer also cites you." /></div> : (
        <ul className={cx(s.rows, s.rowsTop)}>{gaps.slice(0, 10).map((g) => (
          <li key={g.domain} className={cx(s.row, "py-2.5 text-[13px]")}>
            <span className="min-w-0 flex-1"><span className="font-medium">{g.domain}</span><span className={cx(s.small, "block truncate")}>{g.runs} answer{g.runs > 1 ? "s" : ""} · {g.competitors.join(", ")}</span></span>
            {editable && <button className={cx(s.btn, s.sm)} disabled={made.has(g.domain)} onClick={() => toIdea(g)}>{made.has(g.domain) ? "Added" : "Make idea"}</button>}
          </li>
        ))}</ul>
      )}
    </Card>
  );
}

// ---------------- competitors ----------------
// Two separate pools: peer experts are compared with the person, peer firms with the company. Suggested rows track
// nothing until someone approves them.
function Competitors({ ents, runs, qs, self, editable, w }: { ents: EntRow[]; runs: Run[]; qs: Question[]; self: Entity; editable: boolean; w: Names }) {
  const rivals = ents.filter((e) => e.kind === "competitor" && e.status !== "suggested");
  const board = [self, ...rivals].map((e) => ({ e, sov: shareOfVoice(runs, qs, e, self), per: LIVE.map((x) => shareOfVoice(runs, qs, e, self, x.id)) })).sort((a, b) => b.sov.named - a.sov.named);
  const top = Math.max(1, ...board.map((b) => b.sov.named));
  const peers = usePeerSuggestions(runs, qs, ents);
  return (
    <div className="flex flex-col gap-4">
      <Card title="Leaderboard" meta={runs.length ? "Latest run, branded prompts left out" : undefined}>
        {!runs.length ? <div className={s.rowsTop}><Empty title="The leaderboard fills after the first run" body={`${w.first} and ${w.company} against ${rivals.length ? `${rivals.length} tracked peers` : "the peers you add"}, on the same prompts.`} /></div>
          : !rivals.length ? <div className={s.rowsTop}><Empty title="No peers yet" body="Add peer firms or experts to compare." /></div> : (
          <div className="overflow-x-auto">
            <table className={s.table}>
              <thead><tr><th>Name</th><th className="min-w-[160px]">All AI tools</th>{LIVE.map((x) => <th key={x.id} className={s.r}><span className="inline-flex items-center gap-1.5"><ProviderLogo id={x.id} size={13} />{x.name.split(" ").pop()}</span></th>)}</tr></thead>
              <tbody>{board.map(({ e, sov, per }) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap"><span className={e.kind === "self" ? "font-semibold" : "font-medium"}>{e.kind === "self" ? `${w.first} and ${w.company}` : e.name}</span> <span className={cx(s.small, "ml-1")}>{e.kind === "self" ? "You" : e.subject === "person" ? "Expert" : "Firm"}</span></td>
                  <td><div className="flex items-center gap-2.5"><span className={cx(s.bar, "w-24")}><span className={cx(s.barFill, e.kind === "self" && s.barMe, "block")} style={{ width: `${Math.round((sov.named / top) * 100)}%` }} /></span><span className={cx(s.tnum, "whitespace-nowrap")}>{sov.named} of {sov.total}</span></div></td>
                  {per.map((p, i) => <td key={i} className={cx(s.r, s.tnum)}>{p.total ? `${p.named}/${p.total}` : <span className={s.none}>Not run</span>}</td>)}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
      <TrackedNames ents={ents} pools={["person", "company", "firms", "experts"]} editable={editable} peers={peers} className="lg:grid-cols-3" />
    </div>
  );
}
