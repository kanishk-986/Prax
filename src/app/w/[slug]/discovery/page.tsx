"use client";
// Discovery Studio: what Shashi should post about, comment on or watch this week, and why.
// Tabs: Home, AI search, Crawl, Findings, Digest, Sources, Criteria. Logic in src/lib/discovery.ts.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useWorkspace, today as todayYmd, addDays, weekStart } from "@/lib/workspace";
import { useExtension } from "@/lib/bridge";
import { ENGINES, ESTIMATE, type Engine } from "@/lib/citations";
import { Section, type TourStep, type TabDef } from "@/components/shell";
import { useToast, haptic } from "@/components/toaster";
import { upsertToday, type Campaign } from "@/components/content/shared";
import {
  type Finding, type Settings, type LinkRow, mergeSettings, bandOf, totalScore, buildTopics, applyMerges, selectDigest, searchPlan, topicPost, matchCampaign,
  daysBetween, hostOf, RESEARCH_RESOURCES, PACK_LABEL,
} from "@/lib/discovery";
import { type Data, type Run, type List, type Link, type TopicRow, type LogRow, type Ranked, SidePanel, Box } from "@/components/discovery/shared";
import { useRunner } from "@/components/discovery/runner";
import { HomeTab, type Deadline } from "@/components/discovery/home";
import { SearchTab, PACKS } from "@/components/discovery/search";
import { CrawlTab, UploadModal } from "@/components/discovery/crawl";
import { FindingsTab, FindingPanel, DismissModal, NO_FILTERS, type Filters } from "@/components/discovery/findings";
import { DigestTab, type Opp } from "@/components/discovery/digest";
import { SourcesTab, type Entity } from "@/components/discovery/sources";
import { CriteriaTab } from "@/components/discovery/criteria";

type Tab = "home" | "ai" | "crawl" | "findings" | "digest" | "sources" | "criteria";
const HEAD: Record<Tab, string> = {
  home: "This week, what Shashi should post about, comment on, or watch, and why.",
  ai: "What the AI searches, on which tools, and what each search found.",
  crawl: "Every link in your lists, read from the server, with what each one gave.",
  findings: "Every finding, scored on seven measures for Shashi and his buyers.",
  digest: "Topics, not articles. Every article on the same story is merged into one topic and ranked.",
  sources: "Where discovery looks. LinkedIn only through posts you send from the Prax bar.",
  criteria: "How findings are scored and topics ranked. Changes apply to the next run.",
};
const STEPS: TourStep[] = [
  { target: "counts", tab: "home", title: "What discovery is for", body: "Each week it finds what Shashi should post about, comment on, or watch. These are the counts by band." },
  { target: "flow", tab: "home", title: "How it flows", body: "Run, then Findings, then the Digest. AI search and Crawl bring in articles, Findings scores each one, and the Digest merges them into ranked topics." },
  { target: "fast", tab: "home", title: "Fast response", body: "Regulator news from the last 72 hours lands here, ready for a quick draft and Shashi's approval." },
  { target: "coverage", tab: "home", title: "Coverage", body: "Every pass reports what it read. Blocked and gated sources are shown, never hidden as a quiet week." },
  { target: "ai", tab: "ai", title: "AI search", body: "By pillar, by company or person, by event word and by AI citations gap, plus your own searches. It runs in this browser on every AI tool you have a key for. Only cited sources are kept." },
  { target: "ailog", tab: "ai", title: "The search log", body: "Every search on every tool, live: results, cited sources and how many dates were confirmed by reading the page." },
  { target: "crawl", tab: "crawl", title: "Crawl", body: "Upload an Excel or CSV of links. The server reads each one every Monday, takes the 5 newest articles from list pages, and lists gated and blocked sites." },
  { target: "filters", tab: "findings", title: "Findings", body: "Single articles, filtered by band, pillar, region, source, engine, Antier service and where they were found." },
  { target: "card", tab: "findings", title: "A finding", body: "Seven scores, why it matters, a suggested angle, the warm line from Network, and where it can go: Content Studio, Comment Studio or an AI citations gap." },
  { target: "dtop", tab: "digest", title: "The Digest", body: "Articles on the same story merged into topics and ranked on fit, coverage, source quality, found both ways, gap, warm and timing. Top 3 here, #4 to #10 below." },
  { target: "opps", tab: "digest", title: "Beyond posts", body: "Speaking and pitch deadlines, journalist requests with a reply you send yourself, and tenders for sales only." },
  { target: "lists", tab: "sources", title: "Sources", body: "Your link lists, the Research Resources List, watched entities and the LinkedIn inbox." },
  { target: "linkedin", tab: "sources", title: "The LinkedIn rule", body: "Nothing is read from LinkedIn in the background. Only posts you send from the Prax bar while reading them." },
  { target: "weights", tab: "criteria", title: "Criteria", body: "Weights must add up to 100. Prax suggests changes from what you send and dismiss; nothing changes until you accept." },
];
const LIVE_ENGINES = ENGINES.filter((e) => e.live);
const hash = (s: string) => Math.abs([...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0));

export default function DiscoveryStudio() {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const editable = can("editor");
  const { status: ext } = useExtension();
  const today = todayYmd(), thisWeek = weekStart(today);
  const [tab, setTab] = useState<Tab>("home");
  const onTab = useCallback((t: string) => setTab(t as Tab), []);
  const findingsLive = useLive<Finding>("discovery_findings", ws.id, { order: "found_at", asc: false });
  const runs = useLive<Run>("discovery_runs", ws.id, { order: "started_at", asc: false });
  const lists = useLive<List>("discovery_lists", ws.id, { order: "created_at" });
  const links = useLive<Link>("discovery_links", ws.id, { order: "created_at" });
  const topicRows = useLive<TopicRow>("discovery_topics", ws.id, { order: "created_at" });
  const posts = useLive<{ id: string; title: string; status: string; publish_date: string | null; topic: string; source_kind?: string }>("posts", ws.id, { order: "publish_date" });
  const campaigns = useLive<Campaign>("campaigns", ws.id, { order: "created_at" });
  const [raw, setRaw] = useState<Partial<Settings> | null>(null);
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [targets, setTargets] = useState<string[]>([]);
  const [vips, setVips] = useState<string[]>([]);
  const [warmMap, setWarmMap] = useState<Map<string, number>>(new Map());
  const [hidden, setHidden] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [panel, setPanel] = useState<Finding | null>(null);
  const [dismissing, setDismissing] = useState<Finding | null>(null);
  const [upload, setUpload] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [week, setWeek] = useState(thisWeek);
  const [reminded, setReminded] = useState(false);
  const settings = useMemo(() => mergeSettings(raw), [raw]);
  const findings = useMemo(() => findingsLive.rows.filter((f) => !hidden.includes(f.id)), [findingsLive.rows, hidden]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (q && q in HEAD) setTab(q);
    supabase().from("discovery_settings").select("settings").eq("workspace_id", ws.id).maybeSingle().then(({ data }: { data: { settings: Partial<Settings> } | null }) => setRaw(data?.settings ?? {}));
    supabase().from("citation_entities").select("name,aliases,kind").eq("workspace_id", ws.id).eq("kind", "competitor").then(({ data }: { data: { name: string; aliases: string[] }[] | null }) => setCompetitors([...new Set((data ?? []).flatMap((e) => [e.name, ...(e.aliases ?? [])]))]));
    supabase().from("prospects").select("company,stage").eq("workspace_id", ws.id).neq("company", "").limit(500).then(({ data }: { data: { company: string; stage: string }[] | null }) => setTargets([...new Set((data ?? []).filter((p) => p.stage !== "Parked").map((p) => p.company))]));
    supabase().from("studio_settings").select("safety").eq("workspace_id", ws.id).maybeSingle().then(({ data }: { data: { safety?: { vips?: string[] } } | null }) => setVips(data?.safety?.vips ?? []));
  }, [ws.id]);

  // The warm line: connections at each organisation the findings name, from Network.
  const orgKey = useMemo(() => [...new Set(findings.flatMap((f) => f.orgs).map((o) => o.trim()).filter(Boolean))].sort().join("|"), [findings]);
  useEffect(() => {
    if (!orgKey) return;
    supabase().rpc("discovery_warm", { ws: ws.id, names: orgKey.split("|") }).then(({ data }: { data: { name: string; people: number }[] | null }) => setWarmMap(new Map((data ?? []).map((r) => [r.name.toLowerCase(), r.people]))));
  }, [orgKey, ws.id]);
  const warm = useCallback((orgs: string[]) => [...new Set(orgs.map((o) => o.toLowerCase().trim()))].reduce((a, o) => a + (warmMap.get(o) ?? 0), 0), [warmMap]);

  const band = useCallback((f: Finding) => bandOf(f, settings.weights, settings.bands), [settings]);
  const total = useCallback((f: Finding) => totalScore(f.scores, settings.weights), [settings]);
  const engines = LIVE_ENGINES.map((e) => ({ id: e.id, name: e.name.split(" ")[0], ready: !!ext?.searchKeys?.[e.id] }));

  // The Digest for the chosen week, with the merge decisions made on it.
  const digest = useMemo(() => {
    const day = week === thisWeek ? today : addDays(week, 6);
    const ctx = { weights: settings.weights, bands: settings.bands, today: day, warm, posts: posts.rows };
    const rows = topicRows.rows.filter((r) => r.week === week);
    const kept = new Set(rows.filter((r) => r.merge_state === "kept").map((r) => r.key));
    const merges = new Map(rows.filter((r) => r.merge_state === "merged" && typeof r.parts?.into === "string").map((r) => [r.key, r.parts.into as string]));
    const all = applyMerges(buildTopics(findings, ctx, kept, settings.excluded), findings, merges, ctx);
    return { ...selectDigest(all, settings.priority, settings.penalties), all };
  }, [findings, settings, warm, posts.rows, topicRows.rows, week, thisWeek, today]);

  const d: Data = { findings, runs: runs.rows, lists: lists.rows, links: links.rows, topicRows: topicRows.rows, settings, warm, band, total, digest, engines, editable };
  const lastAi = runs.rows.find((r) => r.kind === "ai" && r.status !== "running") ?? null;
  const lastCrawl = runs.rows.find((r) => r.kind === "crawl" && r.status !== "running") ?? null;

  // The search plan: pillars, a weekly batch of entities, event words, AI citations gaps and your own searches.
  const entities: Entity[] = useMemo(() => [
    ...targets.map((name) => ({ name, kind: "Target account" })), ...vips.map((name) => ({ name, kind: "VIP" })), ...competitors.map((name) => ({ name, kind: "Competitor" })),
    ...RESEARCH_RESOURCES.map(([name]) => ({ name, kind: "Research Resources List" })),
  ], [targets, vips, competitors]);
  const gaps = useMemo(() => posts.rows.filter((p) => p.topic === "AI citations" && (p.status === "Idea" || !p.status)).map((p) => p.title).slice(0, 8), [posts.rows]);
  const plan = useMemo(() => searchPlan({ packs: settings.packs, entities: entities.map((e) => e.name), batch: settings.batch, todayYmd: today, gaps, queries: settings.queries }), [settings, entities, today, gaps]);
  const packCount = Object.fromEntries(PACKS.map((p) => [p.id, searchPlan({ packs: { pillar: false, entity: false, event: false, gap: false, [p.id]: true }, entities: entities.map((e) => e.name), batch: settings.batch, todayYmd: today, gaps, queries: [] }).length]));
  const [pickEngines, setPickEngines] = useState<Engine[] | null>(null);
  const chosen = (pickEngines ?? engines.filter((e) => e.ready).map((e) => e.id as Engine)).filter((e) => engines.find((x) => x.id === e)?.ready);

  const runner = useRunner({ wsId: ws.id, today, windowDays: settings.window_days, findings, competitors, targets: [...targets, ...vips] }, toast);

  async function saveSettings(patch: Partial<Settings>, note: string) {
    const prev = raw ?? {}, next = { ...settings, ...patch };
    setRaw(next);
    const { error } = await supabase().from("discovery_settings").upsert({ workspace_id: ws.id, settings: next, updated_at: new Date().toISOString() });
    if (error) { setRaw(prev); toast(error.message); return; }
    haptic(); toast(note, async () => { setRaw(prev); await supabase().from("discovery_settings").upsert({ workspace_id: ws.id, settings: prev, updated_at: new Date().toISOString() }); });
  }

  // Q87: on the run day, AI search starts by itself once when Discovery is opened, with the keys in this browser.
  const autoTried = useRef(false);
  useEffect(() => {
    if (autoTried.current || !editable || !ext || runs.loading || raw == null || !chosen.length || !plan.length || runner.ai.running) return;
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], dayIdx = days.indexOf(settings.run_day);
    const runDate = addDays(thisWeek, Math.max(0, dayIdx));
    autoTried.current = true;
    if (today < runDate || runs.rows.some((r) => r.kind === "ai" && r.started_at.slice(0, 10) >= runDate)) return;
    try { if (sessionStorage.getItem(`prax:disc-auto:${ws.id}:${runDate}`)) return; sessionStorage.setItem(`prax:disc-auto:${ws.id}:${runDate}`, "1"); } catch {}
    toast(`This week's AI search started: ${plan.length} searches on your keys.`, () => runner.stopAi());
    runner.runAi(plan, chosen, "auto");
  }, [editable, ext, runs.loading, runs.rows, raw, chosen, plan, settings.run_day, thisWeek, today, ws.id, runner, toast]);

  useEffect(() => {
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const day = addDays(thisWeek, 7 + Math.max(0, days.indexOf(settings.run_day)));
    supabase().from("daily_items").select("id").eq("workspace_id", ws.id).eq("day", day).eq("kind", "custom").eq("idx", 5000).then(({ data }: { data: unknown[] | null }) => setReminded(!!data?.length));
  }, [ws.id, thisWeek, settings.run_day]);

  // ---------- actions ----------
  const setFinding = async (f: Finding, patch: Partial<Finding>, note: string, undoPatch?: Partial<Finding>) => {
    const { error } = await supabase().from("discovery_findings").update(patch).eq("id", f.id);
    if (error) { toast(error.message); return false; }
    haptic(); toast(note, async () => { await supabase().from("discovery_findings").update(undoPatch ?? Object.fromEntries(Object.keys(patch).map((k) => [k, f[k as keyof Finding]]))).eq("id", f.id); });
    return true;
  };
  const sourceOf = (f: Finding) => ({ via: f.found_by.includes("ai") ? "AI" : f.found_by.includes("crawl") ? "Crawl" : "LinkedIn", pub: f.publisher || hostOf(f.url), url: f.url });
  async function sendFinding(f: Finding, opts: { fast?: boolean; title?: string; date?: string | null } = {}) {
    const fast = opts.fast ?? f.source_type === "Regulator";
    const row = {
      workspace_id: ws.id, title: (opts.title ?? `${fast ? "Fast response: " : ""}${f.title}`).slice(0, 200), format: "Text post", status: "Idea", pillar: f.pillar, topic: "Discovery Studio", channel: "shashi",
      source_kind: "discovery", source_ref: f.id, angle: f.angle, publish_date: opts.date ?? null, resource: `${f.publisher || hostOf(f.url)}: ${f.url}`,
      discovery: { finding_id: f.id, rank: null, score: total(f), sources: [sourceOf(f)], service: f.service, angle: f.angle, campaign: "", move: band(f) === "Comment-worthy" ? "Comment" : "Post", fast },
    };
    const { data, error } = await supabase().from("posts").insert(row).select("id").single();
    if (error) { toast(error.message); return; }
    await supabase().from("discovery_findings").update({ status: "sent", post_id: data.id }).eq("id", f.id);
    if (fast) await upsertToday([{ day: today, kind: "custom", idx: 5100 + (hash(f.id) % 100), title: `Fast response: draft a post on "${f.title.slice(0, 80)}" within 48 hours`, link: `/w/${ws.slug}/studio-content?tab=library`, note: "discovery:fast" }], ws.id);
    haptic();
    toast(fast ? "Fast response sent to Content Studio and Today" : opts.date ? "A post idea is in Content Studio, dated before the deadline" : "Sent to Content Studio. It is in Library and Plan as an idea.", async () => {
      await supabase().from("posts").delete().eq("id", data.id);
      await supabase().from("discovery_findings").update({ status: f.status, post_id: f.post_id }).eq("id", f.id);
    });
  }
  async function commentTarget(f: Finding) {
    const who = f.found.linkedin?.author || f.publisher;
    const { data } = await supabase().from("studio_settings").select("safety").eq("workspace_id", ws.id).maybeSingle();
    const safety = { ...(data?.safety ?? {}) } as { vips?: string[] };
    if (who) await supabase().from("studio_settings").upsert({ workspace_id: ws.id, safety: { ...safety, vips: [...new Set([...(safety.vips ?? []), who])] }, updated_at: new Date().toISOString() });
    await upsertToday([{ day: today, kind: "custom", idx: 5300 + (hash(f.id) % 100), title: `Comment on ${who ? `${who}'s` : "this"} post: ${f.title.slice(0, 80)}`, link: f.url.startsWith("linkedin:") ? "" : f.url, note: "discovery:comment" }], ws.id);
    await setFinding(f, { comment_target: true }, "Added as a Comment Studio VIP and a Today comment task. Draft on LinkedIn with the Prax bar.");
  }
  async function dismiss(f: Finding, reason: string) {
    setDismissing(null); setHidden((h) => [...h, f.id]);
    const ok = await setFinding(f, { status: "dismissed", dismiss_reason: reason }, `Dismissed: ${reason.toLowerCase()}`, { status: f.status, dismiss_reason: f.dismiss_reason });
    if (!ok) setHidden((h) => h.filter((x) => x !== f.id));
    setTimeout(() => setHidden((h) => h.filter((x) => x !== f.id)), 5500);
  }
  const findingActions = {
    send: (f: Finding) => sendFinding(f),
    comment: commentTarget,
    gap: (f: Finding) => setFinding(f, { gap: true }, "Linked to the AI citations gap on this topic"),
    watch: (f: Finding) => setFinding(f, { status: f.status === "watched" ? "new" : "watched" }, f.status === "watched" ? "No longer watched" : "Watching. It shows up again if there is news."),
    dismiss: (f: Finding) => setDismissing(f),
  };
  const sentOf = (t: Ranked) => { const r = topicRows.rows.find((x) => x.week === week && x.key === t.key); return !!r?.post_id && posts.rows.some((p) => p.id === r.post_id); };
  const campaignFor = (t: Ranked) => matchCampaign(t.title, campaigns.rows.filter((c) => !c.template && c.status !== "done").map((c) => ({ ...c, topic: c.brief?.topic, keywords: c.brief?.keywords })));
  async function sendTopics(ts: Ranked[]) {
    if (!ts.length) return;
    const ten = [...digest.top, ...digest.list];
    const undo: (() => Promise<void>)[] = [];
    for (const t of ts) {
      const rank = ten.findIndex((x) => x.key === t.key) + 1 || null, camp = t.competitor ? campaignFor(t) : null;
      const { data: row, error } = await supabase().from("discovery_topics").upsert({ workspace_id: ws.id, week, key: t.key, title: t.title.slice(0, 300), finding_ids: t.ids, score: t.score, rank, parts: { ...t, sources: undefined }, campaign_id: camp?.id ?? null }, { onConflict: "workspace_id,week,key" }).select("id").single();
      if (error) { toast(error.message); break; }
      const { data: p, error: pe } = await supabase().from("posts").insert(topicPost(t, { workspace_id: ws.id, topic_id: row.id, rank, score: t.score, campaign: camp })).select("id").single();
      if (pe) { toast(pe.message); break; }
      await supabase().from("discovery_topics").update({ post_id: p.id, sent_at: new Date().toISOString() }).eq("id", row.id);
      const fresh = findings.filter((f) => t.ids.includes(f.id) && f.status === "new").map((f) => f.id);
      if (fresh.length) await supabase().from("discovery_findings").update({ status: "sent", post_id: p.id }).in("id", fresh);
      undo.push(async () => {
        await supabase().from("posts").delete().eq("id", p.id);
        await supabase().from("discovery_topics").update({ post_id: null, sent_at: null }).eq("id", row.id);
        if (fresh.length) await supabase().from("discovery_findings").update({ status: "new", post_id: null }).in("id", fresh);
      });
    }
    if (!undo.length) return;
    haptic(); toast(undo.length === 1 ? "Sent to Content Studio as an idea, with its angle" : `${undo.length} topics sent to Content Studio`, async () => { for (const u of undo) await u(); });
  }
  async function decide(t: Ranked, state: "merged" | "kept") {
    const into = t.possibleWith;
    const { data, error } = await supabase().from("discovery_topics").upsert({ workspace_id: ws.id, week, key: t.key, title: t.title.slice(0, 300), finding_ids: t.ids, score: t.score, merge_state: state, parts: state === "merged" ? { into } : {} }, { onConflict: "workspace_id,week,key" }).select("id").single();
    if (error) { toast(error.message); return; }
    const target = digest.all.find((x) => x.key === into);
    haptic(); toast(state === "merged" ? `Merged into "${target?.title.slice(0, 60) ?? "the topic"}"` : "Kept as a separate topic", async () => { await supabase().from("discovery_topics").update({ merge_state: "", parts: {} }).eq("id", data.id); });
  }
  const oppDone = (o: Opp, note: string) => setFinding(o.f, { opp: { ...o.f.opp, done: true } as Finding["opp"] }, note);
  const digestActions = {
    send: sendTopics, merge: (t: Ranked) => decide(t, "merged"), keep: (t: Ranked) => decide(t, "kept"), sentOf, campaignOf: (t: Ranked) => campaignFor(t)?.name ?? "",
    pitch: async (o: Opp) => { await upsertToday([{ day: today, kind: "custom", idx: 5200 + (hash(o.f.id) % 100), title: `Pitch: ${o.f.title.slice(0, 90)}${o.due != null ? ` (closes in ${o.due} days)` : ""}`, link: o.f.url.startsWith("linkedin:") ? "" : o.f.url, note: "discovery:pitch" }], ws.id); oppDone(o, "Pitch added to Today, due before the deadline"); },
    salesCopy: async (o: Opp) => { try { await navigator.clipboard.writeText(`${o.f.title} (${o.f.publisher}). ${o.due != null ? `Closes in ${o.due} days. ` : ""}${o.f.url}`); } catch {} oppDone(o, "Copied for the sales team. Tenders never become posts."); },
    replied: (o: Opp) => oppDone(o, "Reply copied. Send it yourself."),
    copy: async (text: string, note: string) => { try { await navigator.clipboard.writeText(text); toast(note); } catch { toast("Copying is blocked in this browser."); } },
  };
  const opps: Opp[] = findings.filter((f) => f.status !== "dismissed" && f.opp?.kind && daysBetween(f.found_at.slice(0, 10), today) <= 30)
    .map((f) => ({ f, kind: f.opp.kind as Opp["kind"], due: typeof f.opp.due === "number" ? f.opp.due - daysBetween(f.found_at.slice(0, 10), today) : null }))
    .filter((o) => o.due == null || o.due >= 0).sort((a, b) => (a.due ?? 99) - (b.due ?? 99));
  async function remind() {
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const day = addDays(thisWeek, 7 + Math.max(0, days.indexOf(settings.run_day)));
    const { error } = await upsertToday([{ day, kind: "custom", idx: 5000, title: "Run weekly discovery: AI search with your keys, then check the Digest", link: `/w/${ws.slug}/discovery`, note: "discovery:run" }], ws.id);
    if (error) { toast(error.message); return; }
    setReminded(true); haptic(); toast("Added to Today: run weekly discovery");
  }
  async function importList(name: string, fileName: string, rows: LinkRow[]) {
    const { data: list, error } = await supabase().from("discovery_lists").insert({ workspace_id: ws.id, name, file_name: fileName }).select("id").single();
    if (error) { toast(error.message); return; }
    for (let i = 0; i < rows.length; i += 200) {
      const { error: e2 } = await supabase().from("discovery_links").insert(rows.slice(i, i + 200).map((r) => ({ workspace_id: ws.id, list_id: list.id, ...r })));
      if (e2) { toast(e2.message); break; }
    }
    setUpload(false); haptic();
    toast(`${rows.length} links imported. Crawl now, or they are read on Monday.`, async () => { await supabase().from("discovery_lists").delete().eq("id", list.id); });
  }
  async function removeList(l: List) {
    const ls = links.rows.filter((x) => x.list_id === l.id);
    const { error } = await supabase().from("discovery_lists").delete().eq("id", l.id);
    if (error) { toast(error.message); return; }
    haptic(); toast(`Removed "${l.name}"`, async () => {
      await supabase().from("discovery_lists").insert({ id: l.id, workspace_id: ws.id, name: l.name, file_name: l.file_name, created_at: l.created_at });
      if (ls.length) await supabase().from("discovery_links").insert(ls.map((x) => ({ ...x, workspace_id: ws.id })));
    });
  }
  const findingsForLog = (r: LogRow) => findings.filter((f) => f.found.ai?.query === r.q && (!r.engine || f.found.ai?.engine === r.engine || r.urls?.includes(f.url)));
  const findingsForLink = (l: Link) => findings.filter((f) => f.found.crawl?.link === l.url);

  const newCount = findings.filter((f) => f.status === "new" && daysBetween(f.found_at.slice(0, 10), today) <= 7).length;
  const fastCount = findings.filter((f) => f.source_type === "Regulator" && f.opp?.kind !== "sales" && f.confirmed && f.published && daysBetween(f.published, today) <= 3 && band(f) !== "Dropped").length;
  const lastAny = runs.rows[0];
  const entryStatus = lastAny ? `Last run ${daysBetween(lastAny.started_at.slice(0, 10), today) || "today"}${daysBetween(lastAny.started_at.slice(0, 10), today) ? " days ago" : ""} · ${newCount} new this week · ${fastCount} fast response` : "No run yet. Upload a link list or connect an AI key, then run discovery.";
  const tabs: TabDef[] = [
    { id: "home", label: "Home" }, { id: "ai", label: "AI search" }, { id: "crawl", label: "Crawl", count: links.rows.length },
    { id: "findings", label: "Findings", count: findings.filter((f) => f.status !== "dismissed").length }, { id: "digest", label: "Digest", count: digest.top.length + digest.list.length, red: true },
    { id: "sources", label: "Sources" }, { id: "criteria", label: "Criteria" },
  ];
  const loading = findingsLive.loading || runs.loading || raw == null;

  return (
    <Section id="discovery" title="Discovery Studio" status={HEAD[tab]} entryStatus={entryStatus} tabs={tabs} tab={tab} onTab={onTab} steps={STEPS}
      actions={<><button type="button" className="btn h-10 px-3.5" onClick={() => setTab("sources")}>Sources</button>{editable && <button type="button" data-tour="run" className="btn btn-primary h-10 px-[18px]" onClick={() => setRunOpen(true)}>Run discovery</button>}</>}>
      {loading ? <div className="card h-64 animate-pulse bg-surface-2" />
        : tab === "home" ? <HomeTab d={d} today={today} go={(t, b) => { setTab(t as Tab); if (b) setFilters({ ...NO_FILTERS, band: b }); }} openFinding={setPanel} sendFast={(f) => sendFinding(f, { fast: true })}
            planDeadline={(x: Deadline) => sendFinding(x.finding, { fast: false, title: `Before the deadline: ${x.title}`, date: addDays(today, Math.max(0, x.due - 2)) })} openRun={() => setRunOpen(true)} remind={remind} reminded={reminded} lastAi={lastAi} lastCrawl={lastCrawl} />
        : tab === "ai" ? <SearchTab d={d} slug={ws.slug} plan={plan} packCount={packCount} live={runner.ai.log.length ? runner.ai : null} lastAi={lastAi} running={runner.ai.running} chosen={chosen} onRun={() => runner.runAi(plan, chosen)} onStop={runner.stopAi} saveSettings={saveSettings} findingsFor={findingsForLog} />
        : tab === "crawl" ? <CrawlTab d={d} running={runner.crawl.running} progress={runner.crawl} status={runner.crawl.status} onCrawl={() => runner.runCrawl(links.rows)} onStop={runner.stopCrawl} openUpload={() => setUpload(true)} lastCrawl={lastCrawl} findingsFor={findingsForLink} />
        : tab === "findings" ? <FindingsTab d={d} filters={filters} setFilters={setFilters} open={setPanel} act={findingActions} />
        : tab === "digest" ? <DigestTab d={d} week={week} weeks={[thisWeek, addDays(thisWeek, -7), addDays(thisWeek, -14)]} setWeek={setWeek} opps={opps} act={digestActions} />
        : tab === "sources" ? <SourcesTab d={d} entities={entities} batch={settings.batch} openUpload={() => setUpload(true)} removeList={removeList} openFinding={setPanel} />
        : <CriteriaTab d={d} findings={findings} save={saveSettings} />}
      {panel && <FindingPanel f={findings.find((f) => f.id === panel.id) ?? panel} d={d} onClose={() => setPanel(null)} />}
      {dismissing && <DismissModal onClose={() => setDismissing(null)} onPick={(r) => dismiss(dismissing, r)} />}
      {upload && <UploadModal onClose={() => setUpload(false)} onImport={importList} />}
      {runOpen && <RunPanel d={d} plan={plan} links={links.rows} chosen={chosen} setChosen={setPickEngines} runner={runner} saveWindow={(w) => saveSettings({ window_days: w }, `Window set to ${w === 3 ? "72 hours" : "7 days"}`)} onClose={() => setRunOpen(false)} />}
    </Section>
  );
}

/** Run discovery: both routes at once. Crawl on the server, AI search in this browser, then the AI check. */
function RunPanel({ d, plan, links, chosen, setChosen, runner, saveWindow, onClose }: {
  d: Data; plan: ReturnType<typeof searchPlan>; links: Link[]; chosen: Engine[]; setChosen: (e: Engine[]) => void; runner: ReturnType<typeof useRunner>; saveWindow: (w: number) => void; onClose: () => void;
}) {
  const [doCrawl, setDoCrawl] = useState(true), [doAi, setDoAi] = useState(true);
  const busy = runner.ai.running || runner.crawl.running || runner.scoring;
  const calls = doAi ? plan.length * chosen.length : 0;
  const cost = doAi ? plan.length * chosen.reduce((a, e) => a + ESTIMATE[e].usd, 0) : 0;
  const passes: [string, string][] = [
    ...(["pillar", "entity", "event", "gap", "custom"] as const).map((p, i) => {
      const rows = runner.ai.log.filter((r) => r.pack === p), done = rows.filter((r) => r.returned != null || r.error).length;
      return [`${i + 1} · ${PACK_LABEL[p]}`, !rows.length ? (plan.some((x) => x.pack === p) && doAi ? "waiting" : "not in this run") : done === rows.length ? `${rows.filter((r) => (r.cited ?? 0) > 0).length} ok · ${rows.filter((r) => !r.error && !r.cited).length} empty · ${rows.filter((r) => r.error).length} failed` : runner.ai.running ? `running ${done} of ${rows.length}` : `${done} of ${rows.length}`] as [string, string];
    }),
    ["Crawl link lists", runner.crawl.total ? (runner.crawl.running ? `running ${runner.crawl.done} of ${runner.crawl.total}` : `${runner.crawl.done} of ${runner.crawl.total} read`) : doCrawl && links.length ? "waiting" : "not in this run"],
    ["Group, score and challenge", runner.scoring ? "running" : runner.ai.total && !runner.ai.running ? "done" : "waiting"],
  ];
  const started = runner.ai.total > 0 || runner.crawl.total > 0;
  const prog = (() => { const t = runner.ai.total + runner.crawl.total; return t ? Math.round(((runner.ai.done + runner.crawl.done) / t) * 100) : 0; })();
  async function start() {
    await Promise.all([doCrawl && links.length ? runner.runCrawl(links) : null, doAi && chosen.length ? runner.runAi(plan, chosen) : null]);
  }
  return (
    <SidePanel title="Run discovery" onClose={onClose} width={480}>
      <span className="label text-ink">Sources</span>
      <span className="flex items-center gap-2.5 text-[13.5px]"><Box on={doCrawl} onClick={() => setDoCrawl(!doCrawl)} label="Link lists" />Link lists<span className="text-[12px] text-faint">{links.length} links, read on the server</span></span>
      <span className="flex items-center gap-2.5 text-[13.5px]"><Box on={doAi} onClick={() => setDoAi(!doAi)} label="AI search" />AI search<span className="text-[12px] text-faint">{plan.length} searches: pillars, entities, events, gaps, yours</span></span>
      <span className="flex items-center gap-2.5 text-[13.5px] text-muted"><span className="w-5" />LinkedIn inbox<span className="text-[12px] text-faint">{d.findings.filter((f) => f.found_by.includes("linkedin")).length} posts you sent, already in</span></span>
      <span className="label text-ink">AI tools</span>
      {d.engines.map((e) => (
        <span key={e.id} className="flex items-center gap-2.5 text-[13.5px]" style={{ color: e.ready ? "#141414" : "#8c8c8c" }}>
          <Box on={chosen.includes(e.id as Engine)} onClick={() => e.ready && setChosen(chosen.includes(e.id as Engine) ? chosen.filter((x) => x !== e.id) : [...chosen, e.id as Engine])} label={e.name} />{e.name}{!e.ready && <span className="ml-auto text-[12px]">No key in this browser</span>}
        </span>
      ))}
      <span className="label text-ink">Window</span>
      <span className="flex self-start rounded-[10px] border border-line p-[3px]">{[7, 3].map((w) => <button key={w} type="button" className={`h-[30px] rounded-lg px-3 text-[13px] font-semibold ${d.settings.window_days === w ? "bg-[#d64545] text-white" : "text-muted"}`} onClick={() => saveWindow(w)}>{w === 3 ? "Last 72 hours" : "Last 7 days"}</button>)}</span>
      <div className="rounded-[10px] border border-[#ececec] bg-[#fafafa] px-3.5 py-3 text-[13px]">About <b className="num">{calls}</b> AI calls · about <b className="num">${cost.toFixed(2)}</b> on your keys (list prices, rough). The crawl costs nothing.</div>
      {started && (
        <div className="flex flex-col gap-2 rounded-[10px] border border-[#ececec] px-3.5 py-3">
          <span className="h-1.5 overflow-hidden rounded-full bg-[#ececec]"><span className="block h-full bg-[#d64545] transition-[width] duration-200" style={{ width: `${prog}%` }} /></span>
          {passes.map(([n, s]) => <span key={n} className="flex items-center justify-between gap-2.5 text-[12.5px]"><span>{n}</span><span className="text-right text-[12px] font-semibold" style={{ color: s.startsWith("running") ? "#d64545" : s === "waiting" || s === "not in this run" ? "#8c8c8c" : "#141414" }}>{s}</span></span>)}
        </div>
      )}
      <span className="mt-auto flex justify-end gap-2">
        {busy ? <button type="button" className="btn h-10 px-4" onClick={() => { runner.stopAi(); runner.stopCrawl(); }}>Stop the run</button> : <button type="button" className="btn h-10 px-4" onClick={onClose}>Close</button>}
        <button type="button" className="btn btn-primary h-10 px-[18px]" disabled={busy || (!(doCrawl && links.length) && !(doAi && chosen.length && plan.length))} onClick={start}>{busy ? `Running ${prog}%` : started ? "Run again" : doAi && !chosen.length && !(doCrawl && links.length) ? "Add a key first" : "Run discovery"}</button>
      </span>
    </SidePanel>
  );
}
