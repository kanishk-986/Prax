"use client";
// Dashboard: the command centre. Greeting and one sentence on the week, four headline numbers, what needs
// doing now (ranked by urgency), the week across every section, LinkedIn reach and recent activity.
import { LinkedInMcp } from "@/components/linkedin-mcp";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useCitationProfile } from "@/lib/citation-profile";
import { useWorkspace, today, addDays, weekStart, fmtDay, STAGES } from "@/lib/workspace";
import { Section, KpiTiles, NeedsYou, Panel, CountUp, reveal, type TourStep, type Need } from "@/components/shell";

import { ProviderLogo } from "@/components/provider-mark";
import { providerName } from "@/lib/providers";
import { GetStarted, setupSteps } from "@/components/get-started";
import { useActiveStrategy } from "@/components/strategy/data";
import { commentTarget as strategyCommentTarget } from "@/lib/strategy";
import { useExtension } from "@/lib/bridge";
import { cap, firstNameOf, possessive, pillarsOf } from "@/lib/persona";
import { deltaOf, pointsDelta, weekOverWeek, rankNeeds, commentDays, whenLabel, weekSentence, relTime, activityFeed, agenda, isSkipped, typeLabel, greeting, firstName, type NeedInput } from "@/lib/dashboard";
import { isLeadClosed, FALLBACK_PIPELINE, type Pipeline } from "@/lib/pipeline";
import { ENGINES, personContext, promptGaps, subjectShare, runsInWeek, weekStartOf, shiftWeek, scoped, type Entity, type Question, type Run } from "@/lib/citations";

type Item = { id: string; day: string; kind: string; idx: number; title: string; note: string | null; done: boolean };
type Prospect = { id: string; name: string; company: string; stage: string; next_action: string; next_date: string | null; created_at: string; pipeline_id?: string | null };
type Snap = { metric: string; value: number; captured_at: string };
type Act = { id: number; at: string; kind: string; label: string; ref_id: string | null };
type Post = { id: string; title: string; format: string; publish_date: string | null; status: string; planned_time?: string };
type RunRow = Run & { citation_sources?: (Run["sources"][number] & { sort: number })[] };

const REACH = [
  { key: "impressions_7d", label: "Post impressions", sub: "last 7 days" },
  { key: "followers", label: "Followers", sub: "total" },
  { key: "profile_views_90d", label: "Profile viewers", sub: "last 90 days" },
  { key: "search_appearances", label: "Search appearances", sub: "last week" },
];

const dashTour = (n: string): TourStep[] => [
  { target: "header", title: "What the dashboard is for", body: "One place to see how the week is going for this profile and what to do next. Every number comes from the work logged in Prax." },
  { target: "kpis", title: "The five numbers that matter", body: `People in the pipeline, warm paths from Network, posts out this week, comments against the weekly target, and how often AI answers name ${n}. Small chips show the change on last week. Click a tile to open that section.` },
  { target: "needs", title: "Needs you now", body: "Everything waiting on you, most urgent first: overdue follow-ups and posts lead, then approvals, today's plan and housekeeping." },
  { target: "glance", title: "This week at a glance", body: "Where each part of Prax stands and the next thing in it: the next task on Today, the next post, the next follow-up, the export, the top Digest topic and the biggest AI citations gap. Click a line to go straight there." },
  { target: "reach", title: "LinkedIn reach", body: `Impressions, followers, profile viewers and search appearances, captured when you open ${possessive(n)} LinkedIn analytics with the extension.` },
  { target: "activity", title: "Recent activity", body: "What happened, newest first, in plain sentences. Wins such as replies, accepted requests and booked calls are marked in red." },
  { target: "open-today", title: "Start the day", body: "Open Today for the plan: comments, posts, follow-ups and connections, in that order." },
];

const NOT_POSTED = ["Posted", "On hold", "Published"];

export default function Dashboard() {
  const { ws, can, name, email } = useWorkspace();
  const first = firstNameOf(ws);
  const { status: ext } = useExtension();
  const t = today();
  const wk = weekStart(t);
  const lastWk = addDays(wk, -7);
  const items = useLive<Item>("daily_items", ws.id, { filter: (q) => q.gte("day", addDays(t, -27)) });
  const prospects = useLive<Prospect>("prospects", ws.id);
  const snaps = useLive<Snap>("snapshots", ws.id, { order: "captured_at", asc: false, filter: (q) => q.limit(200) });
  // Enough rows that repeats can collapse and still fill the panel.
  const acts = useLive<Act>("activity", ws.id, { order: "at", asc: false, filter: (q) => q.limit(40) });
  const posts = useLive<Post>("posts", ws.id, { filter: (q) => q.or(`publish_date.gte.${addDays(t, -28)},status.eq."In review"`) });
  const logged = useLive<{ day: string }>("comment_log", ws.id, { filter: (q) => q.gte("day", lastWk) });
  // The AI citations tile shows the tracked profile this user has in view there (db/017).
  const cit0 = useCitationProfile();
  const citOpts = { key: cit0.scope ?? "", skip: !cit0.ready, filter: (q: any) => scoped(q, cit0.scope) };
  const cq = useLive<Question>("citation_questions", ws.id, citOpts);
  const ents = useLive<Entity>("citation_entities", ws.id, citOpts);
  // This week's Digest (db/013_discovery.sql): ranked topics and the ones already sent to Content Studio.
  // Closed stages of every pipeline (db/015), so a check-in on a Signed or Passed lead is not shown as due.
  const pipes = useLive<Pipeline>("pipelines", ws.id);
  const imports = useLive<{ export_date: string | null; created_at: string }>("network_imports", ws.id, { order: "created_at", asc: false, filter: (q) => q.limit(1) });
  const topics = useLive<{ id: string; title: string; rank: number | null; rising: boolean; sent_at: string | null }>("discovery_topics", ws.id, { filter: (q) => q.eq("week", wk) });

  // Open prospects with a linked connection or a connection at their company (db/006_network.sql); null when there is no export.
  const [warm, setWarm] = useState<number | null>(null);
  useEffect(() => { supabase().rpc("network_warm_count", { ws: ws.id }).then(({ data, error }: { data: unknown; error: unknown }) => setWarm(error ? null : (data as number))); }, [ws.id, prospects.rows.length]);
  const [people, setPeople] = useState<number | null>(null);
  useEffect(() => { supabase().from("network_people").select("key", { count: "exact", head: true }).eq("workspace_id", ws.id).then(({ count, error }: { count: number | null; error: unknown }) => setPeople(error ? null : count ?? 0)); }, [ws.id]);
  const [runs, setRuns] = useState<Run[]>([]);
  useEffect(() => {
    if (!cit0.ready) return;
    const since = new Date(Date.now() - 28 * 864e5).toISOString();
    scoped(supabase().from("citation_runs").select("*, citation_sources(url,title,domain,cited,sort)").eq("workspace_id", ws.id), cit0.scope).gte("run_at", since).order("run_at", { ascending: false }).limit(1500)
      .then(({ data }: { data: RunRow[] | null }) => setRuns((data ?? []).map((r) => ({ ...r, sources: [...(r.citation_sources ?? [])].sort((a, b) => a.sort - b.sort) }))));
  }, [ws.id, cit0.ready, cit0.scope]);

  // The active strategy's goal sets the weekly comment target when it has one (Q109); else the daily quota for five days.
  const { goal } = useActiveStrategy();
  const commentTarget = strategyCommentTarget(goal, ws.quotas.comment);
  const week = useMemo(() => {
    const rows = items.rows;
    const tod = rows.filter((r) => r.day === t);
    // One count for the week, the same one Engagement shows: per day, ticks on Today or comments logged, whichever is more.
    const cw = weekOverWeek(commentDays(rows.filter((r) => r.kind === "comment" && r.done).map((r) => r.day), logged.rows.map((l) => l.day)), t);
    const days = Array.from({ length: 14 }, (_, i) => addDays(t, i - 13)).map((d) => { const a = rows.filter((r) => r.day === d); return { d, done: a.filter((r) => r.done).length, total: a.length }; });
    // The next open task on today's plan, in Today's order.
    const nextUp = agenda(tod).flatMap((g) => g.items).find((r) => !r.done && !isSkipped(r.note)) ?? null;
    const left = tod.filter((r) => !r.done && !isSkipped(r.note)).length;
    return { today: { done: tod.filter((r) => r.done).length, total: tod.length, left, nextUp }, comments: cw, days };
  }, [items.rows, logged.rows, t]);

  const pipe = useMemo(() => {
    const rows = prospects.rows;
    const reached = (s: string) => rows.filter((p) => p.stage !== "Parked" && STAGES.indexOf(p.stage as never) >= STAGES.indexOf(s as never)).length;
    const ps = pipes.rows.length ? pipes.rows : [FALLBACK_PIPELINE];
    const open = rows.filter((p) => !isLeadClosed(p, ps));
    const due = open.filter((p) => p.next_date && p.next_date <= t).sort((a, b) => (a.next_date! < b.next_date! ? -1 : 1));
    const upcoming = open.filter((p) => p.next_date && p.next_date > t).sort((a, b) => (a.next_date! < b.next_date! ? -1 : 1))[0] ?? null;
    return { open: rows.filter((p) => p.stage !== "Parked").length, added: weekOverWeek(rows.map((p) => p.created_at), t).now, conv: reached("In conversation"), calls: reached("Call booked"),
      due, upcoming, overdue: due.filter((p) => p.next_date! < t).length, warming: rows.filter((p) => p.stage === "Warming").length };
  }, [prospects.rows, pipes.rows, t]);

  const content = useMemo(() => {
    const rows = posts.rows;
    const end = addDays(wk, 6);
    const thisWeek = rows.filter((p) => p.publish_date && p.publish_date >= wk && p.publish_date <= end && p.status !== "On hold");
    const posted = weekOverWeek(rows.filter((p) => p.status === "Posted" || p.status === "Published").map((p) => p.publish_date), t);
    const soon = rows.filter((p) => p.publish_date && p.publish_date <= addDays(t, 2) && !NOT_POSTED.includes(p.status) && !(p.status === "Ready" && p.publish_date > t))
      .sort((a, b) => (a.publish_date! < b.publish_date! ? -1 : 1));
    const next = rows.filter((p) => p.publish_date && p.publish_date >= t && !NOT_POSTED.includes(p.status))
      .sort((a, b) => `${a.publish_date}${a.planned_time ?? ""}`.localeCompare(`${b.publish_date}${b.planned_time ?? ""}`))[0] ?? null;
    return { planned: thisWeek.length, posted, review: rows.filter((p) => p.status === "In review").length, soon, next };
  }, [posts.rows, wk, t]);

  const cit = useMemo(() => {
    const active = cq.rows.filter((q) => q.status === "active").length;
    const selves = ents.rows.filter((e) => e.kind === "self");
    const person = selves.find((e) => e.subject === "person");
    const company = selves.find((e) => e.subject !== "person");
    const ctx = personContext(cq.rows, company);
    const rivals = ents.rows.filter((e) => e.kind === "competitor" && e.status !== "suggested");
    const share = subjectShare(runs, cq.rows, "person", person, company, ctx, ["expert", "leadership"]);
    const gapList = promptGaps(runs, cq.rows, person, company, rivals.filter((e) => e.subject === "person"), rivals.filter((e) => e.subject !== "person"), ctx);
    const gaps = gapList.length;
    const last = runs[0]?.run_at;
    // Week on week: the share from each week's own runs only, so a week without runs gives no change.
    const wkNow = weekStartOf(new Date());
    const pctOf = (w: string) => subjectShare(runsInWeek(runs, w), cq.rows, "person", person, company, ctx, ["expert", "leadership"]).pct;
    // The AI tools that answered in the window, in the citations order, shown as small marks.
    const engines = ENGINES.map((e) => e.id).filter((e) => runs.some((r) => r.engine === e));
    return { active, share, gaps, topGap: gapList[0] ?? null, engines, change: pointsDelta(pctOf(wkNow), pctOf(shiftWeek(wkNow, -1))), lastDays: last ? Math.floor((Date.now() - Date.parse(last)) / 864e5) : null, last };
  }, [cq.rows, ents.rows, runs]);

  const reach = useMemo(() => {
    const m: Record<string, { now?: Snap; prev?: Snap }> = {};
    snaps.rows.forEach((s) => { const e = (m[s.metric] ||= {}); if (!e.now) e.now = s; else if (!e.prev) e.prev = s; });
    return m;
  }, [snaps.rows]);

  const disc = useMemo(() => {
    const ranked = topics.rows.filter((x) => x.rank != null).sort((x, y) => (x.rank ?? 99) - (y.rank ?? 99));
    return { ranked: ranked.length, sent: ranked.filter((x) => x.sent_at).length, open: ranked.filter((x) => !x.sent_at), rising: topics.rows.filter((x) => x.rising).length };
  }, [topics.rows]);

  const base = `/w/${ws.slug}`;
  const needs = useMemo(() => {
    const list: (NeedInput & Need)[] = [];
    pipe.due.forEach((p) => list.push({ kind: "followup", due: p.next_date, title: `${p.name}${p.company ? `, ${p.company}` : ""}`, sub: `${p.stage} · ${p.next_action || "Next step due"}`, cta: "Open", href: `${base}/pipeline?p=${p.id}`, tone: "red" }));
    content.soon.forEach((p) => list.push({ kind: "post", due: p.publish_date, title: p.title || "Untitled post", sub: `${p.format} · ${p.status}${p.publish_date && p.publish_date < t ? " · planned date has passed" : ""}`, cta: p.status === "Ready" ? "Open" : "Finish", href: `${base}/studio-content?tab=plan`, tone: "red" }));
    if (content.review) list.push({ kind: "approval", title: `${content.review} post${content.review > 1 ? "s" : ""} waiting for approval`, sub: can("owner") ? "Approve or ask for changes" : `Waiting for ${first} to approve`, cta: "Review", href: `${base}/studio-content?tab=library&status=In%20review`, tone: "dark" });
    if (!week.today.total) list.push({ kind: "today", title: "Open today's plan", sub: "It builds from the daily quota", cta: "Start", href: `${base}/today`, tone: "dark" });
    else if (week.today.done < week.today.total) list.push({ kind: "today", title: `${week.today.total - week.today.done} of ${week.today.total} tasks left today`, sub: "Comments, posts, follow-ups and connections", cta: "Continue", href: `${base}/today`, tone: "dark" });
    if (disc.open.length) list.push({ kind: "discovery", title: `${disc.open.length} Digest ${disc.open.length === 1 ? "topic" : "topics"} not sent yet`, sub: `Top: ${disc.open[0].title}`, cta: "Review", href: `${base}/discovery?tab=digest`, tone: "dim" });
    if (cit.active && (cit.lastDays == null || cit.lastDays >= 7)) list.push({ kind: "citations", title: "Run the AI citation prompts", sub: cit.lastDays == null ? `${cit.active} prompts have never been run` : `Last run ${cit.lastDays} days ago`, cta: "Run", href: `${base}/citations`, tone: "dim" });
    if (pipe.warming) list.push({ kind: "warming", title: `${pipe.warming} ${pipe.warming === 1 ? "person" : "people"} warming up`, sub: "Two comments each, then a connection note", cta: "Open", href: `${base}/pipeline`, tone: "dim" });
    // A new profile (nobody in Pipeline) has the import as a set-up step already, so it is not listed twice.
    if (warm == null && prospects.rows.length) list.push({ kind: "network", title: "Upload the LinkedIn export", sub: "Warm paths and segments come from it", cta: "Upload", href: `${base}/network`, tone: "dim" });
    return rankNeeds(list, t);
  }, [pipe, content, week.today, disc, cit, warm, base, t, can, first, prospects.rows.length]);
  // A new profile has nobody in Pipeline yet: show what to do first instead of leaving a row of zeros to read.
  const setup = setupSteps({ base, first, hasStrategy: pillarsOf(ws).length > 0 && !!ws.voice?.trim(), extConnected: !!ext?.connected, people: people ?? 0, prospects: prospects.rows.length });

  const hour = new Date().getHours();
  const exp = imports.rows[0];
  const exportAge = exp ? Math.floor((Date.parse(t + "T12:00:00") - Date.parse((exp.export_date ?? exp.created_at.slice(0, 10)) + "T12:00:00")) / 864e5) : null;
  const loading = items.loading || prospects.loading;
  const sentence = weekSentence({ comments: week.comments.now, commentTarget, posted: content.posted.now, planned: content.planned, overdue: pipe.overdue, conversations: pipe.conv });
  const commentDelta = deltaOf(week.comments.now, week.comments.prev);
  const postDelta = deltaOf(content.posted.now, content.posted.prev);

  return (
    <Section id="dashboard" title={greeting(hour, firstName(name, email))} status={loading ? `${ws.name} · ${fmtDay(t, { weekday: "long", day: "numeric", month: "long" })}` : sentence}
      entryStatus={loading ? `${ws.name}, ${fmtDay(t, { weekday: "long", day: "numeric", month: "long" })}.` : sentence}
      primary={<Link data-tour="open-today" href={`${base}/today`} className="btn btn-primary h-10 px-4">Open Today <ArrowUpRight size={14} /></Link>}
      actions={<><Link href={`${base}/weekly`} className="btn h-10 px-3.5">Weekly report</Link><LinkedInMcp /></>}
      steps={dashTour(first)}>

      {loading ? <Skeleton /> : (<>
        {!prospects.rows.length && <div className={reveal(0).className} style={reveal(0).style}><GetStarted name={possessive(first) + " profile"} steps={setup} /></div>}
        {/* A new profile shows the set-up card alone: no row of empty tiles under it. */}
        {prospects.rows.length > 0 && <KpiTiles tour="kpis" items={[
          { label: "In pipeline", value: pipe.open, href: `${base}/pipeline`,
            delta: pipe.added ? { text: `+${pipe.added}`, dir: "up", label: "added this week" } : null, sub: pipe.added ? undefined : `${pipe.conv} in conversation` },
          { label: "Warm paths", value: warm ?? "None", href: `${base}/network`, sub: warm == null ? "Upload the LinkedIn export" : "prospects with a way in" },
          { label: "Posts this week", value: content.posted.now, of: content.planned ? `of ${content.planned} planned` : undefined, href: `${base}/studio-content?tab=plan`,
            delta: postDelta && (content.posted.now || content.posted.prev) ? { ...postDelta, label: "vs last week" } : null, sub: content.planned || content.posted.now ? undefined : "Nothing planned yet" },
          { label: "Comments this week", value: week.comments.now, of: commentTarget ? `of ${commentTarget}` : undefined, href: `${base}/comments`,
            delta: commentDelta && (week.comments.now || week.comments.prev) ? { ...commentDelta, label: "vs last week" } : null, sub: week.comments.now || week.comments.prev ? undefined : "None yet this week" },
          // "<Name> named in X% of AI answers": latest answer per prompt and AI tool over 28 days, strict person matching.
          { label: `${cap(first)} in AI answers`, href: `${base}/citations`,
            value: cit.share.pct == null ? "None" : <><CountUp value={cit.share.pct} />%</>, of: cit.share.pct == null ? undefined : "named",
            sub: cit.share.pct == null ? (cit.active ? "No AI answers in 28 days" : "No prompts set up yet") : cit.change ? undefined : `${cit.share.named} of ${cit.share.total} answers`,
            delta: cit.change ? { ...cit.change, label: "vs last week" } : null },
        ]} />}

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className={`${reveal(4).className} flex min-w-0 flex-col [&>section]:flex-1`} style={reveal(4).style}>
            <NeedsYou tour="needs" title="Needs you now" items={needs.slice(0, 7).map((n) => ({ ...n, when: n.kind === "followup" || n.kind === "post" ? whenLabel(n.due, t) : undefined }))} count={needs.length}
              empty="Nothing is waiting on you. Overdue follow-ups, posts due and approvals show here first." />
          </div>
          <div className={`${reveal(5).className} flex min-w-0 flex-col [&>section]:flex-1`} style={reveal(5).style}>
            <Panel tour="glance" className="flex flex-col [&>a]:flex-1" title="This week at a glance" meta={`${fmtDay(wk, { day: "numeric", month: "short" })} to ${fmtDay(addDays(wk, 6), { day: "numeric", month: "short" })}`}>
              {/* Each line says where things stand and what is next, never the numbers the tiles already show. */}
              <Glance href={`${base}/today`} name="Today" aside={<MiniBars days={week.days} today={t} />}
                line={!week.today.total ? "Not opened yet. It builds from the daily quota when you open it." : !week.today.left ? "Cleared for today. Tomorrow builds when it is opened."
                  : `Next: ${week.today.nextUp ? (week.today.nextUp.title.trim() || `${typeLabel(week.today.nextUp)}, from the daily quota`) : "the next task"}`} />
              <Glance href={`${base}/studio-content?tab=plan`} name="Content Studio" alert={content.soon.some((p) => p.publish_date! < t)}
                line={content.next ? `Next post: ${content.next.title || "Untitled"}, ${content.next.publish_date === t ? "today" : fmtDay(content.next.publish_date!, { weekday: "short", day: "numeric", month: "short" })}${content.next.planned_time ? ` at ${content.next.planned_time}` : ""}`
                  : content.review ? "Waiting for approval before anything can be planned" : "Nothing planned from today on. Plan the next post."} />
              <Glance href={`${base}/studio`} name="Comment Studio"
                line={logged.rows.length ? `Last comment logged ${lastLogged(logged.rows.map((l) => l.day), t)}` : "No comments logged in the last two weeks"} />
              <Glance href={pipe.due[0] ? `${base}/pipeline?p=${pipe.due[0].id}` : pipe.upcoming ? `${base}/pipeline?p=${pipe.upcoming.id}` : `${base}/pipeline`} name="Pipeline" alert={pipe.overdue > 0}
                line={pipe.due[0] ? `${pipe.due[0].name}, ${whenLabel(pipe.due[0].next_date, t).toLowerCase()}: ${pipe.due[0].next_action || "next step due"}`
                  : pipe.upcoming ? `Nothing due. Next: ${pipe.upcoming.name}, ${whenLabel(pipe.upcoming.next_date, t).toLowerCase()}` : prospects.rows.length ? "No follow-ups planned" : "Nobody in Pipeline yet"} />
              <Glance href={`${base}/network`} name="Network" alert={exportAge != null && exportAge > 30}
                line={!people ? "No LinkedIn export uploaded yet" : exportAge == null ? `${people.toLocaleString("en-GB")} people from the LinkedIn export`
                  : exportAge > 30 ? `The export is ${exportAge} days old. Upload a fresh one.` : `${people.toLocaleString("en-GB")} people, export from ${fmtDay(imports.rows[0].export_date ?? imports.rows[0].created_at.slice(0, 10), { day: "numeric", month: "short" })}`} />
              <Glance href={`${base}/discovery?tab=digest`} name="Discovery Studio" alert={disc.open.length > 0}
                line={!disc.ranked ? "No Digest for this week yet" : disc.open.length ? `Top topic not sent yet: ${disc.open[0].title}` : "Every Digest topic is in Content Studio"} />
              <Glance href={`${base}/citations${cit.topGap ? "?tab=Gaps" : ""}`} name="AI citations" alert={cit.gaps > 0}
                line={!cit.active ? "No prompts set up yet" : !cit.share.total ? "No answers in the last 28 days" : cit.topGap ? `Biggest gap: ${cit.topGap.question.question}` : `No open gaps. ${cap(first)} holds every prompt checked.`}
                aside={cit.last ? <span className="flex shrink-0 items-center gap-2.5"><span className="flex items-center gap-1.5" role="img" aria-label={`Answers from ${cit.engines.map((e) => providerName(e)).join(", ")}`}>{cit.engines.map((e) => <span key={e} title={providerName(e)}><ProviderLogo id={e} size={13} /></span>)}</span><span className="num text-meta text-faint">{cit.lastDays === 0 ? "ran today" : `ran ${fmtDay(cit.last.slice(0, 10), { day: "numeric", month: "short" })}`}</span></span> : undefined} />
            </Panel>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className={`${reveal(6).className} flex min-w-0 flex-col [&>section]:flex-1`} style={reveal(6).style}>
            <ActivityFeed rows={acts.rows} base={base} />
          </div>
          <div className={`${reveal(7).className} flex min-w-0 flex-col [&>section]:flex-1`} style={reveal(7).style}>
            <Panel tour="reach" title="LinkedIn reach" meta={REACH.some((r) => reach[r.key]?.now) ? "captured with the extension" : undefined}>
              {/* One row per captured metric. Nothing captured yet: one honest line and where to start, no rows of "None". */}
              {!REACH.some((r) => reach[r.key]?.now) ? (
                <p className="border-t border-line px-[18px] py-4 text-body text-muted">Not started. Reach appears after the extension reads {possessive(first)} LinkedIn analytics page once. <Link href={`${base}/extension`} className="font-medium text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink">How to capture it</Link></p>
              ) : REACH.filter((r) => reach[r.key]?.now).map((r) => { const e = reach[r.key]; const d = e?.now && e?.prev ? deltaOf(Number(e.now.value), Number(e.prev.value)) : null; return (
                <div key={r.key} className="flex items-center gap-3 border-t border-line px-[18px] py-2.5">
                  <span className="flex min-w-0 flex-1 flex-col"><span className="text-body font-semibold">{r.label}</span>
                    <span className="truncate text-meta text-muted">{e?.now ? <>{d && d.dir !== "flat" && <span className={`num font-semibold ${d.dir === "up" ? "text-ink" : "text-dark-red"}`}>{d.text} </span>}{r.sub} · {fmtDay(e.now.captured_at.slice(0, 10), { day: "numeric", month: "short" })}</> : r.sub}</span></span>
                  <span className={`num shrink-0 text-right ${e?.now ? "text-page font-semibold tracking-[-0.02em]" : "text-body text-muted"}`}>{e?.now ? Number(e.now.value).toLocaleString("en-GB") : "None"}</span>
                </div>
              ); })}
            </Panel>
          </div>
        </div>
      </>)}
    </Section>
  );
}

/** "today", "yesterday" or "on 3 Nov" for the newest day in a list. */
function lastLogged(days: string[], t: string) {
  const d = days.map((x) => x.slice(0, 10)).sort().pop()!;
  return d === t ? "today" : d === addDays(t, -1) ? "yesterday" : `on ${fmtDay(d, { weekday: "short", day: "numeric", month: "short" })}`;
}

/** Recent activity in plain sentences, newest first. Wins (replies, accepted requests, conversations, calls, deals)
 *  get a red dot and stronger text; a row about a lead opens that lead. */
function ActivityFeed({ rows, base }: { rows: Act[]; base: string }) {
  const feed = activityFeed(rows).slice(0, 8);
  return (
    <section data-tour="activity" className="panel">
      <div className="panel-head"><span>Recent activity</span></div>
      {feed.length === 0 ? <p className="border-t border-line px-[18px] py-4 text-body text-muted">Nothing yet. What you do on Today and in Pipeline appears here as it happens.</p> : (
        <ol className="border-t border-line py-1.5">
          {feed.map((a, i) => {
            const r = reveal(i);
            const body = (<>
              <span className={`mt-[6px] h-[7px] w-[7px] shrink-0 rounded-full ${a.win ? "bg-accent" : "border-[1.5px] border-[#141414] bg-white"}`} aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={`text-body leading-snug ${a.win ? "font-semibold text-ink" : "text-ink-2"}`}>{a.win && <span className="sr-only">Win: </span>}{a.text}</span>
                {a.detail && <span className="truncate text-meta text-muted">{a.detail}</span>}
              </span>
              <span className="num w-[68px] shrink-0 pt-px text-right text-meta text-faint">{relTime(a.at)}</span>
            </>);
            const cls = "flex w-full items-start gap-3 px-[18px] py-2 text-left";
            return <li key={a.id} className={r.className} style={r.style}>{a.person && a.ref_id ? <Link href={`${base}/pipeline?p=${a.ref_id}`} className={`${cls} hover:bg-[#fafafa]`}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
          })}
        </ol>
      )}
    </section>
  );
}

function Glance({ href, name, line, aside, alert }: { href: string; name: string; line: string; aside?: React.ReactNode; alert?: boolean }) {
  return (
    <Link href={href} className="row-hit group">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-body font-semibold">{name}{alert && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label="needs attention" />}</span>
        <span className="text-meta text-muted">{line}</span>
      </span>
      {aside}
      <ChevronRight size={15} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
    </Link>
  );
}

/** Fourteen days of tasks done against planned, as tiny bars. */
function MiniBars({ days, today: t }: { days: { d: string; done: number; total: number }[]; today: string }) {
  const max = Math.max(1, ...days.map((d) => d.total));
  if (!days.some((d) => d.total)) return null; // no plan yet: no empty chart
  return (
    <svg width="84" height="26" viewBox="0 0 84 26" aria-label="Tasks done per day, last 14 days" role="img" className="shrink-0">
      {days.map((d, i) => { const x = i * 6, h = Math.max(2, (d.total / max) * 24), hd = d.total ? (d.done / d.total) * h : 0; return (
        <g key={d.d}>
          <rect x={x} y={26 - h} width="4" height={h} rx="1" fill="#ececec" />
          {hd > 0 && <rect x={x} y={26 - hd} width="4" height={hd} rx="1" fill={d.d === t ? "#d64545" : "#141414"} />}
        </g>
      ); })}
    </svg>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((k) => <div key={k} className="h-[118px] animate-pulse rounded-2xl bg-[#ececec]" />)}</div>
      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]"><div className="h-[320px] animate-pulse rounded-2xl bg-[#ececec]" /><div className="h-[320px] animate-pulse rounded-2xl bg-[#ececec]" /></div>
    </div>
  );
}
