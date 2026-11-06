// Loads one profile's rows for the Monday review (src/lib/review.ts): the weekly report's input for the week reviewed,
// post results and What works, comment modes, replies, follow-ups, and the saved reviews (db/027). Tables missing before
// a migration runs read as empty; `missing` says the reviews table is not there yet.
import { loadWeekInput, type WeekProfile } from "./weekly-data";
import { weeklyReport, shift } from "./weekly";
import { whatWorks, type ResultPost } from "./content";
import { cleanPlan, type ReviewInput, type PlanItem } from "./review";
import { pillarsOf } from "./persona";

type Sb = any;
const iso = (day: string) => new Date(day + "T00:00:00").toISOString();
const rows = <T,>(r: { data: T[] | null; error: unknown }) => (r.error ? [] : r.data ?? []);
const top = (g: { k: string; n: number }[] | undefined) => g?.find((x) => x.k && x.k !== "Not set")?.k;

export type SavedRow = { week: string; keep: string; change: string; stop: string; plan: PlanItem[]; summary: string; saved_at: string };
export type ReviewData = { input: Omit<ReviewInput, "strategy">; ppw: number | null; saved: SavedRow | null; last: SavedRow | null; past: { week: string; saved_at: string }[]; missing: boolean };

export async function loadReview(sb: Sb, ws: WeekProfile & { slug: string }, wk: string, today: string, scope: string | null): Promise<ReviewData> {
  const end = shift(wk, 6), nextEnd = shift(wk, 13);
  const [weekInput, posts, posted, logs, replies, leads, cs, saved, last, past] = await Promise.all([
    loadWeekInput(sb, ws, wk, today, scope),
    sb.from("posts").select("title,status,publish_date,format,pillar,impressions,reactions,comments,reposts").eq("workspace_id", ws.id).gte("publish_date", wk).lte("publish_date", nextEnd),
    sb.from("posts").select("format,pillar,publish_date,planned_time,draft,status,impressions,reactions,comments,reposts").eq("workspace_id", ws.id).in("status", ["Posted", "Published"]).limit(500),
    sb.from("comment_log").select("day,mode,reply").eq("workspace_id", ws.id).gte("day", wk).lte("day", end),
    sb.from("replies").select("person,prospect_id,seen_at").eq("workspace_id", ws.id).gte("seen_at", iso(wk)).lt("seen_at", iso(shift(wk, 7))),
    sb.from("prospects").select("id,name,company,stage,next_action,next_date").eq("workspace_id", ws.id),
    sb.from("content_settings").select("plan").eq("workspace_id", ws.id).maybeSingle(),
    sb.from("weekly_reviews").select("*").eq("workspace_id", ws.id).eq("week", wk).maybeSingle(),
    sb.from("weekly_reviews").select("*").eq("workspace_id", ws.id).eq("week", shift(wk, -7)).maybeSingle(),
    sb.from("weekly_reviews").select("week,saved_at").eq("workspace_id", ws.id).order("week", { ascending: false }).limit(52),
  ]);
  const report = weeklyReport(weekInput);
  const works = whatWorks(rows<ResultPost>(posted));
  const row = (r: { data: Record<string, unknown> | null }): SavedRow | null => (r.data ? {
    week: String(r.data.week), keep: String(r.data.keep ?? ""), change: String(r.data.change ?? ""), stop: String(r.data.stop ?? ""),
    plan: cleanPlan(r.data.plan), summary: String(r.data.summary ?? ""), saved_at: String(r.data.saved_at ?? ""),
  } : null);
  const ppw = Number((cs.data?.plan as { ppw?: number } | undefined)?.ppw) || null;
  return {
    input: {
      week: wk, today, name: weekInput.name, slug: ws.slug,
      posts: rows(posts), logs: rows(logs), replies: rows(replies), moves: report.moved, leads: rows(leads),
      closedStages: weekInput.closedStages, commentTarget: weekInput.commentTarget, comments: report.out.comments,
      works: works.enough ? { format: top(works.byFormat), pillar: top(works.byPillar), day: top(works.byDay) } : null,
      lastPlan: row(last)?.plan ?? null, pillars: pillarsOf(ws),
    },
    ppw, saved: row(saved), last: row(last), past: rows<{ week: string; saved_at: string }>(past), missing: !!past.error,
  };
}
