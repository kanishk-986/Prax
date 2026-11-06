"use client";
import { useMemo } from "react";
import { PenLine, CalendarRange, Type, Target } from "lucide-react";
import { useWorkspace, today, addDays, weekStart, fmtDay } from "@/lib/workspace";

import { firstNameOf } from "@/lib/persona";
import { StartCards } from "@/components/shell";
import { whatWorks, nextIssue, needsResults } from "@/lib/content";
import { inProfile } from "@/lib/citations";
import { useCitationProfile } from "@/lib/citation-profile";
import { type Post, type Campaign, StatusPill, ChannelFlag, statusOf } from "./shared";
import type { ContentSettings } from "./settings";

type Need = { id: string; label: string; sub: string; post: Post; act: "open" | "write" };

/** The first tab: what needs attention now, built only from real posts and campaigns. */
export function HomeTab({ posts, campaigns, settings, go, openPost, writeFrom, planCampaign }: {
  posts: Post[]; campaigns: Campaign[]; settings: ContentSettings; go: (tab: string) => void; openPost: (p: Post) => void; writeFrom: (p: Post) => void; planCampaign: () => void;
}) {
  const { ws, can } = useWorkspace();
  // AI citations gap topics show for the tracked profile in view there (db/017).
  const { scope: citScope } = useCitationProfile();
  const t = today(), tomorrow = addDays(t, 1), wk = weekStart(t), wkEnd = addDays(wk, 6);

  const s = (p: Post) => statusOf(p.status);
  const first = firstNameOf(ws);

  const tiles = [
    { k: "Due this week", v: posts.filter((p) => p.publish_date && p.publish_date >= t && p.publish_date <= wkEnd && s(p) !== "Posted").length, go: "plan" },
    { k: `Waiting for ${first}`, v: posts.filter((p) => s(p) === "In review").length, go: "library" },
    { k: "Ready to post", v: posts.filter((p) => s(p) === "Ready").length, go: "library" },
    { k: "Campaigns active", v: campaigns.filter((c) => !c.template && c.status !== "paused" && c.status !== "done").length, go: "campaigns" },
  ];

  const needs = useMemo<Need[]>(() => {
    const out: Need[] = [];
    for (const p of posts) {
      const st = statusOf(p.status);
      if (st === "In review") out.push({ id: p.id + "r", label: p.title, sub: can("owner") ? "Waiting for your approval" : `With ${first} for approval`, post: p, act: "open" });
      else if ((p.publish_date === t || p.publish_date === tomorrow) && st !== "Posted" && st !== "On hold") out.push({ id: p.id + "d", label: p.title, sub: `Due ${p.publish_date === t ? "today" : "tomorrow"}${p.planned_time ? `, ${p.planned_time}` : ""} · ${st}`, post: p, act: st === "Ready" ? "open" : "write" });
      else if (st === "Idea" && p.source_kind === "discovery") out.push({ id: p.id + "v", label: p.title, sub: `New topic from Discovery Studio${p.discovery?.rank ? ` · #${p.discovery.rank} this week` : ""}${p.discovery?.score != null ? ` · score ${p.discovery.score}` : ""}`, post: p, act: "write" });
      else if (st === "Idea" && (p.topic === "AI citations" || p.source_kind === "gap") && inProfile(p, citScope)) out.push({ id: p.id + "g", label: p.title, sub: "New topic from AI citations", post: p, act: "write" });
      else if (st === "Idea" && p.publish_date && p.publish_date <= addDays(t, 7)) out.push({ id: p.id + "i", label: p.title, sub: `Not written yet · planned ${fmtDay(p.publish_date, { day: "numeric", month: "short" })}`, post: p, act: "write" });
    }
    // Posted pieces whose numbers have settled but were never added (CS29): the last three, after everything above.
    if (can("editor")) for (const p of posts.filter((x) => needsResults({ ...x, status: statusOf(x.status) }, t) && x.publish_date && x.publish_date >= addDays(t, -30)).sort((a, b) => (b.publish_date ?? "").localeCompare(a.publish_date ?? "")).slice(0, 3))
      out.push({ id: p.id + "m", label: p.title, sub: `Posted ${fmtDay(p.publish_date!, { day: "numeric", month: "short" })} · add its results`, post: p, act: "open" });
    return out.slice(0, 8);
  }, [posts, t, tomorrow, can, first, citScope]);

  const ww = useMemo(() => whatWorks(posts.map((p) => ({ format: p.format, pillar: p.pillar, publish_date: p.publish_date, planned_time: p.planned_time, draft: p.draft, status: p.status, impressions: p.impressions, reactions: p.reactions, comments: p.comments, reposts: p.reposts ?? null }))), [posts]);
  const starts: [string, string, React.ElementType, () => void][] = [
    ["Write a post", "From an idea, a link, a PDF or a comment.", PenLine, () => go("write")],
    ["Plan a campaign", "A run of posts around one goal.", Target, planCampaign],
    ["See the week", "What is planned, and what has no day yet.", CalendarRange, () => go("plan")],
    ["Format any text", "Bold, lists and spacing for LinkedIn.", Type, () => go("formatter")],
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4" data-tour="tiles">
        {tiles.map((x) => <button key={x.k} type="button" className="tile hit" onClick={() => go(x.go)}>
          <span className="tile-label">{x.k}</span><span className="num tile-num">{x.v}</span></button>)}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <section className="flex min-w-0 flex-[3_1_520px] flex-col gap-2.5" data-tour="needs">
          <div className="panel">
            <div className="panel-head">Needs you</div>
            {needs.map((n) => (
              <div key={n.id} className="group flex items-center gap-3 border-t border-line px-4 py-3">
                <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="truncate text-body font-semibold">{n.label}</span><ChannelFlag p={n.post} /></span><span className="text-meta text-muted">{n.sub}</span></span>
                <StatusPill s={n.post.status} />
                <button className="btn btn-quiet row-act h-8 shrink-0" onClick={() => (n.act === "write" && can("editor") ? writeFrom(n.post) : openPost(n.post))}>{n.act === "write" && can("editor") ? "Write it" : "Open"}</button>
              </div>
            ))}
            {!needs.length && <p className="m-0 border-t border-line p-7 text-center text-body text-muted">Nothing needs you right now. Approvals, posts due soon and new topics show here.</p>}
          </div>
          {settings.newsletter.name && <p className="m-0 rounded-xl border border-line bg-white px-4 py-2.5 text-body"><span className="mr-2 font-semibold">Newsletter</span>Next issue of {settings.newsletter.name}: {fmtDay(nextIssue(settings.newsletter, t), { weekday: "long", day: "numeric", month: "short" })}</p>}
        </section>

        <aside className="flex min-w-0 flex-[2_1_320px] flex-col gap-2.5">
          <StartCards tour="start" items={starts.map(([title, sub, icon, run], i) => ({ title, sub, icon, onClick: run, primary: i === 0 }))} />
          <div className="panel" data-tour="works">
            <div className="panel-head">What works</div>
            <div className="border-t border-line p-4">
            {!ww.enough ? <p className="m-0 text-body text-muted">Not enough results yet. Add the numbers of {ww.need - ww.have} more posted {ww.need - ww.have === 1 ? "piece" : "pieces"} in each post view, and Prax shows which formats, pillars, days and openings work best.</p>
              : <div className="flex flex-col gap-2.5 text-body">
                {([["Format", ww.byFormat], ["Pillar", ww.byPillar], ["Day", ww.byDay], ["Time", ww.bySlot], ["Opening", ww.byHook]] as const).map(([k, g]) => g[0] && (
                  <div key={k} className="flex items-baseline gap-3"><span className="w-[64px] shrink-0 text-meta text-muted">{k}</span><span className="min-w-0 flex-1 font-semibold">{g[0].k}</span><span className="num text-meta text-muted">{g[0].avg} avg · {g[0].n} {g[0].n === 1 ? "post" : "posts"}</span></div>
                ))}
                <p className="m-0 text-meta text-faint">Based on {ww.have} posted pieces with results. Reactions, plus comments counted twice and reposts three times.</p>
              </div>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
