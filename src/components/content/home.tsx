"use client";
import { useMemo } from "react";
import { PenLine, CalendarRange, Type, Target } from "lucide-react";
import { useWorkspace, today, addDays, weekStart, fmtDay } from "@/lib/workspace";
import { whatWorks, nextIssue } from "@/lib/content";
import { type Post, type Campaign, StatusPill, ChannelFlag, statusOf } from "./shared";
import type { ContentSettings } from "./settings";

type Need = { id: string; label: string; sub: string; post: Post; act: "open" | "write" };

/** The first tab: what needs attention now, built only from real posts and campaigns. */
export function HomeTab({ posts, campaigns, settings, go, openPost, writeFrom, planCampaign }: {
  posts: Post[]; campaigns: Campaign[]; settings: ContentSettings; go: (tab: string) => void; openPost: (p: Post) => void; writeFrom: (p: Post) => void; planCampaign: () => void;
}) {
  const { ws, email, can } = useWorkspace();
  const t = today(), tomorrow = addDays(t, 1), wk = weekStart(t), wkEnd = addDays(wk, 6);
  const hour = new Date().getHours();
  const name = email.split("@")[0].split(/[._-]/)[0];
  const greet = `${hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}${name ? `, ${name[0].toUpperCase()}${name.slice(1)}` : ""}`;
  const s = (p: Post) => statusOf(p.status);

  const tiles = [
    { k: "Due this week", v: posts.filter((p) => p.publish_date && p.publish_date >= t && p.publish_date <= wkEnd && s(p) !== "Posted").length, go: "plan" },
    { k: "Waiting for Shashi", v: posts.filter((p) => s(p) === "In review").length, go: "library" },
    { k: "Ready to post", v: posts.filter((p) => s(p) === "Ready").length, go: "library" },
    { k: "Campaigns active", v: campaigns.filter((c) => !c.template && c.status !== "paused" && c.status !== "done").length, go: "campaigns" },
  ];

  const needs = useMemo<Need[]>(() => {
    const out: Need[] = [];
    for (const p of posts) {
      const st = statusOf(p.status);
      if (st === "In review") out.push({ id: p.id + "r", label: p.title, sub: can("owner") ? "Waiting for your approval" : "With Shashi for approval", post: p, act: "open" });
      else if ((p.publish_date === t || p.publish_date === tomorrow) && st !== "Posted" && st !== "On hold") out.push({ id: p.id + "d", label: p.title, sub: `Due ${p.publish_date === t ? "today" : "tomorrow"}${p.planned_time ? `, ${p.planned_time}` : ""} · ${st}`, post: p, act: st === "Ready" ? "open" : "write" });
      else if (st === "Idea" && (p.topic === "AI citations" || p.source_kind === "gap")) out.push({ id: p.id + "g", label: p.title, sub: "New topic from AI citations", post: p, act: "write" });
      else if (st === "Idea" && p.publish_date && p.publish_date <= addDays(t, 7)) out.push({ id: p.id + "i", label: p.title, sub: `Not written yet · planned ${fmtDay(p.publish_date, { day: "numeric", month: "short" })}`, post: p, act: "write" });
    }
    return out.slice(0, 8);
  }, [posts, t, tomorrow, can]);

  const ww = useMemo(() => whatWorks(posts.map((p) => ({ format: p.format, pillar: p.pillar, publish_date: p.publish_date, planned_time: p.planned_time, draft: p.draft, status: p.status, impressions: p.impressions, reactions: p.reactions, comments: p.comments }))), [posts]);
  const starts: [string, string, React.ElementType, () => void][] = [
    ["Write a post", "From an idea, a link, a PDF or a comment.", PenLine, () => go("write")],
    ["Plan a campaign", "A run of posts around one goal.", Target, planCampaign],
    ["See the week", "What is planned, and what has no day yet.", CalendarRange, () => go("plan")],
    ["Format any text", "Bold, lists and spacing for LinkedIn.", Type, () => go("formatter")],
  ];

  return (
    <div className="flex flex-col gap-5">
      <div><h2 className="m-0 text-[22px] font-semibold tracking-tight">{greet}</h2><p className="m-0 mt-1 text-[13.5px] text-muted">{fmtDay(t, { weekday: "long", day: "numeric", month: "long" })} · {ws.name}</p></div>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4" data-tour="tiles">
        {tiles.map((x, i) => <button key={x.k} className="card card-hover flex flex-col items-start gap-1 p-4 text-left" style={i === 1 && x.v ? { background: "#141414", color: "#fff", borderColor: "#141414" } : undefined} onClick={() => go(x.go)}>
          <span className="num text-[28px] font-medium leading-none">{x.v}</span><span className="text-[12.5px] font-semibold" style={{ color: i === 1 && x.v ? "#ff8a80" : "#5f5f5f" }}>{x.k}</span></button>)}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <section className="flex min-w-0 flex-[3_1_520px] flex-col gap-2.5" data-tour="needs">
          <div className="label">Needs you</div>
          <div className="card overflow-hidden">
            {needs.map((n, i) => (
              <div key={n.id} className={`flex items-center gap-3 px-4 py-3 ${i ? "border-t border-line" : ""}`}>
                <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="truncate text-[14px] font-semibold">{n.label}</span><ChannelFlag p={n.post} /></span><span className="text-[12.5px] text-muted">{n.sub}</span></span>
                <StatusPill s={n.post.status} />
                <button className={`btn h-8 shrink-0 ${n.act === "write" ? "btn-primary" : "btn-dark"}`} onClick={() => (n.act === "write" && can("editor") ? writeFrom(n.post) : openPost(n.post))}>{n.act === "write" && can("editor") ? "Write it" : "Open"}</button>
              </div>
            ))}
            {!needs.length && <p className="m-0 p-7 text-center text-[13px] text-muted">Nothing needs you right now. Approvals, posts due soon and new topics show here.</p>}
          </div>
          {settings.newsletter.name && <p className="m-0 rounded-xl border border-line bg-white px-4 py-2.5 text-[13px]"><span className="mr-2 font-semibold text-[#d64545]">Newsletter</span>Next issue of {settings.newsletter.name}: {fmtDay(nextIssue(settings.newsletter, t), { weekday: "long", day: "numeric", month: "short" })}</p>}
        </section>

        <aside className="flex min-w-0 flex-[2_1_320px] flex-col gap-2.5">
          <div className="label">Start something</div>
          <div className="grid grid-cols-2 gap-2.5" data-tour="start">
            {starts.map(([title, sub, Icon, run]) => <button key={title} className="card card-hover flex flex-col items-start gap-1.5 p-3.5 text-left" onClick={run}>
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#141414] text-white"><Icon size={15} /></span><span className="text-[13.5px] font-semibold">{title}</span><span className="text-[12px] leading-snug text-muted">{sub}</span></button>)}
          </div>
          <div className="label mt-2">What works</div>
          <div className="card p-4" data-tour="works">
            {!ww.enough ? <p className="m-0 text-[13px] text-muted">Not enough results yet. Add the reactions and comments of {ww.need - ww.have} more posted {ww.need - ww.have === 1 ? "piece" : "pieces"} and Prax shows which formats, pillars, days and openings work best.</p>
              : <div className="flex flex-col gap-2.5 text-[13px]">
                {([["Format", ww.byFormat], ["Pillar", ww.byPillar], ["Day", ww.byDay], ["Time", ww.bySlot], ["Opening", ww.byHook]] as const).map(([k, g]) => g[0] && (
                  <div key={k} className="flex items-baseline gap-3"><span className="w-[64px] shrink-0 text-[12px] text-muted">{k}</span><span className="min-w-0 flex-1 font-semibold">{g[0].k}</span><span className="num text-[12px] text-muted">{g[0].avg} avg · {g[0].n} posts</span></div>
                ))}
                <p className="m-0 text-[11.5px] text-faint">Based on {ww.have} posted pieces. Reactions plus twice the comments.</p>
              </div>}
          </div>
        </aside>
      </div>
    </div>
  );
}
