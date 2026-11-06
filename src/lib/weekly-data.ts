// Loads one profile's rows for a week and turns them into the input of weeklyReport (src/lib/weekly.ts).
// Works with the browser client (the weekly report page) and the server client (the profiles overview), so
// both show the same numbers. Tables that are missing before a migration runs read as empty.
import { weeklyReport, shift, mondayOf, type WeekInput, type WeekReport } from "./weekly";
import { inConversation, type InboxPipeline } from "./inbox";
import { currentProfile, profileScope, scoped, subjectShare, personContext, runsInWeek, type Entity, type Question, type Run, type Profile } from "./citations";
import { OUTREACH_STAGES } from "./pipeline";
import { firstNameOf, pillarsOf, type Persona } from "./persona";

type Sb = any;
export type WeekProfile = Persona & { id: string; quotas?: { comment?: number } | null };

const iso = (day: string) => new Date(day + "T00:00:00").toISOString();
const rows = <T,>(r: { data: T[] | null; error: unknown }) => (r.error ? [] : r.data ?? []);

/** The AI citations scope the overview uses: the user's pick in AI citations, else the first live tracked profile; null before db/017. */
export async function citationScope(sb: Sb, wsId: string, userId: string): Promise<string | null> {
  const ps = await sb.from("citation_profiles").select("*").eq("workspace_id", wsId);
  if (ps.error) return null;
  const pick = await sb.from("citation_profile_picks").select("profile_id").eq("workspace_id", wsId).eq("user_id", userId).maybeSingle();
  return profileScope(false, currentProfile((ps.data ?? []) as Profile[], pick.data?.profile_id ?? null));
}

export async function loadWeekInput(sb: Sb, ws: WeekProfile, weekDay: string, today: string, scope: string | null): Promise<WeekInput> {
  const wk = mondayOf(weekDay), end = shift(wk, 6), nextEnd = shift(wk, 13), after = shift(wk, 7);
  const back = shift(wk, -60);
  const runFrom = shift(end, -27) < shift(wk, -7) ? shift(end, -27) : shift(wk, -7);
  const [posts, items, logs, moves, leads, pipes, msgs, topics, cq, ents, runs] = await Promise.all([
    sb.from("posts").select("title,status,publish_date,format").eq("workspace_id", ws.id).gte("publish_date", wk).lte("publish_date", nextEnd),
    sb.from("daily_items").select("day,kind").eq("workspace_id", ws.id).eq("done", true).in("kind", ["comment", "request"]).gte("day", wk).lte("day", end),
    sb.from("comment_log").select("*").eq("workspace_id", ws.id).gte("day", back),
    sb.from("stage_moves").select("prospect_id,kind,from_stage,to_stage,at").eq("workspace_id", ws.id).gte("at", iso(wk)).lt("at", iso(after)),
    sb.from("prospects").select("id,name,company,stage,next_action,next_date,pipeline_id").eq("workspace_id", ws.id),
    sb.from("pipelines").select("id,template,stages,won_stage,lost_stage").eq("workspace_id", ws.id),
    sb.from("inbox_messages").select("person,prospect_id,received_at").eq("workspace_id", ws.id).gte("received_at", iso(wk)).lt("received_at", iso(after)),
    sb.from("discovery_topics").select("title,rank,rising").eq("workspace_id", ws.id).eq("week", wk),
    scoped(sb.from("citation_questions").select("*").eq("workspace_id", ws.id), scope),
    scoped(sb.from("citation_entities").select("*").eq("workspace_id", ws.id), scope),
    scoped(sb.from("citation_runs").select("*, citation_sources(url,title,domain,cited,sort)").eq("workspace_id", ws.id), scope).gte("run_at", iso(runFrom)).lt("run_at", iso(after)).limit(2000),
  ]);

  const logRows = rows<{ day: string; reply: boolean; replied_at?: string | null; created_at: string }>(logs);
  const pipelines = rows<InboxPipeline>(pipes);
  const all = pipelines.length ? pipelines : [{ id: "outreach", template: "outreach", stages: OUTREACH_STAGES, won_stage: "Won", lost_stage: "Parked" }];
  const stages = [...new Set(all.flatMap((p) => p.stages))];
  const conversationStages = stages.filter((s) => all.some((p) => inConversation(p, s)));
  const closedStages = [...new Set(all.flatMap((p) => [p.won_stage, p.lost_stage]).filter(Boolean))];

  // AI citations: this week's runs against last week's, and the latest 28 days to the week's end (as the Dashboard tile).
  const qs = rows<Question>(cq), es = rows<Entity>(ents);
  const rs: Run[] = rows<Run & { citation_sources?: (Run["sources"][number] & { sort: number })[] }>(runs)
    .map((r) => ({ ...r, sources: [...(r.citation_sources ?? [])].sort((a, b) => a.sort - b.sort) }));
  const selves = es.filter((e) => e.kind === "self");
  const person = selves.find((e) => e.subject === "person"), company = selves.find((e) => e.subject !== "person");
  const ctx = personContext(qs, company);
  const share = (list: Run[]) => subjectShare(list, qs, "person", person, company, ctx, ["expert", "leadership"]);
  const nowS = share(runsInWeek(rs, wk));
  const s28 = share(rs.filter((r) => r.run_at >= iso(shift(end, -27))));

  return {
    week: wk, today, name: firstNameOf(ws), commentTarget: Math.max(0, ws.quotas?.comment ?? 0) * 5,
    posts: rows(posts),
    commentTicks: rows<{ day: string; kind: string }>(items).filter((i) => i.kind === "comment").map((i) => i.day),
    commentLogs: logRows.map((l) => l.day),
    requestTicks: rows<{ day: string; kind: string }>(items).filter((i) => i.kind === "request").map((i) => i.day),
    moves: rows(moves), leads: rows(leads),
    replies: logRows.filter((l) => l.reply).map((l) => l.replied_at ?? l.created_at),
    messages: rows<{ person: string; prospect_id: string | null; received_at: string }>(msgs).map((m) => ({ at: m.received_at, person: m.person, prospect_id: m.prospect_id })),
    conversationStages, closedStages,
    citations: { now: nowS.pct, prev: share(runsInWeek(rs, shift(wk, -7))).pct, named: nowS.named, total: nowS.total, share28: s28.pct },
    topics: rows(topics), pillars: pillarsOf(ws),
  };
}

export async function loadWeek(sb: Sb, ws: WeekProfile, weekDay: string, today: string, scope: string | null): Promise<WeekReport> {
  return weeklyReport(await loadWeekInput(sb, ws, weekDay, today, scope));
}
