"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal, Compass, Quote } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useWorkspace, today, fmtDay, addDays, weekStart } from "@/lib/workspace";
import { useToast, haptic } from "@/components/toaster";
import { FORMATS, balanceWarnings } from "@/lib/campaigns";
import { type Post, type Campaign, type Target, type Request, StatusPill, ChannelFlag, statusOf, DayPopover, ActionMenu, Modal } from "@/components/content/shared";
import { PostView, PostEditor } from "@/components/content/post";
import { CampaignsTab } from "@/components/content/campaigns";
import { HomeTab } from "@/components/content/home";
import { WriteFlow } from "@/components/content/write";
import { Formatter } from "@/components/content/formatter";
import { EntryMoment, Tour, tourPending, type TourStep } from "@/components/content/guide";
import { useContentSettings, PovModal, type ContentSettings } from "@/components/content/settings";
import { nextIssue, postSource, type PostSource } from "@/lib/content";
import { SidePanel, Tag } from "@/components/discovery/shared";
import Link from "next/link";
import type { ProspectLite } from "@/lib/network";

const TABS = [["home", "Home"], ["write", "Write a post"], ["campaigns", "Campaigns"], ["plan", "Plan"], ["library", "Library"], ["formatter", "Formatter"]] as const;
type Tab = (typeof TABS)[number][0];
const SUB: Record<Tab, string> = {
  home: "What needs you today, and where to start.",
  campaigns: "Plan a run of posts around one goal, aimed at the people who matter.",
  plan: "The week as it stands today. Prax reminds Shashi on Today at each planned time.",
  library: "Every idea, draft and posted piece, with its campaign and status.",
  write: "Eight steps from any starting point to a post Shashi approves.",
  formatter: "Bold, italic, lists and spacing that survive the paste into LinkedIn.",
};

export default function ContentStudio() {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const editable = can("editor");
  const [tab, setTab] = useState<Tab>("home");
  const { settings, save: saveSettings } = useContentSettings();
  const [seed, setSeed] = useState<Post | null>(null);
  const [pov, setPov] = useState(false);
  const [tour, setTour] = useState(false);
  const onTab = useCallback((t: string) => setTab(t as Tab), []);
  const clearSeed = useCallback(() => setSeed(null), []);
  // The tour starts once per browser, after the entry moment has cleared.
  useEffect(() => { if (!tourPending("content-studio")) return; const t = setTimeout(() => setTour(true), 2700); return () => clearTimeout(t); }, []);
  const [startCamp, setStartCamp] = useState<{ view: "brief"; n: number } | undefined>();
  const posts = useLive<Post>("posts", ws.id, { order: "publish_date" });
  const campaigns = useLive<Campaign>("campaigns", ws.id, { order: "created_at" });
  const targets = useLive<Target>("campaign_targets", ws.id, { order: "created_at" });
  const requests = useLive<Request>("resource_requests", ws.id, { order: "created_at", asc: false });
  const prospects = useLive<ProspectLite & { warmth: string }>("prospects", ws.id, { order: "name" });
  const comments = useLive<{ id: string; author: string; reply: boolean; day: string; prospect_id: string | null }>("comment_log", ws.id);
  const companies = useMemo(() => [...new Set(prospects.rows.map((p) => p.company).filter(Boolean))], [prospects.rows]);
  const [members, setMembers] = useState<Record<string, string>>({});
  const [view, setView] = useState<Post | null>(null);
  const [edit, setEdit] = useState<Post | null>(null);
  const [libStatus, setLibStatus] = useState("all");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get("tab") as Tab | null;
    if (t && TABS.some(([k]) => k === t)) setTab(t);
    if (q.get("status")) setLibStatus(q.get("status")!);
    supabase().from("members").select("user_id,email").eq("workspace_id", ws.id).then(({ data }: { data: { user_id: string; email: string }[] | null }) =>
      setMembers(Object.fromEntries((data ?? []).map((m) => [m.user_id, m.email.split("@")[0]]))));
  }, [ws.id]);

  // Keep the open view and editor in step with live changes.
  const fresh = (p: Post | null) => (p ? posts.rows.find((x) => x.id === p.id) ?? p : null);

  async function newPost() {
    const { data, error } = await supabase().from("posts").insert({ workspace_id: ws.id, title: "New post", format: "Text post", status: "Idea" }).select().single();
    if (error) { toast(error.message); return; }
    haptic(); setTab("library"); setEdit(data as Post);
  }
  const writeFrom = (p: Post) => { setSeed(p); setTab("write"); };
  const planCampaign = () => { setTab("campaigns"); setStartCamp({ view: "brief", n: Date.now() }); };

  return (
    <div className="cs -mx-4 -my-6 min-h-screen bg-[var(--canvas)] px-4 py-6 md:-mx-10 md:-my-8 md:px-10 md:py-8">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
        <header className="flex flex-col gap-4 pl-10 md:pl-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h1 className="m-0 text-[26px] font-semibold tracking-tight">Content Studio</h1><p className="m-0 mt-1 text-[14px] text-muted">{SUB[tab]}</p></div>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-ghost h-10 px-3" data-tour="guide" onClick={() => setTour(true)}><Compass size={15} /> Guide</button>
              <button className="btn h-10 px-4" data-tour="pov" onClick={() => setPov(true)}><Quote size={14} /> Point of view</button>
              {editable && <button className="btn h-10 px-4" onClick={planCampaign}>Plan a campaign</button>}
              {editable && <button className="btn btn-primary h-10 px-4" onClick={() => { setSeed(null); setTab("write"); }}>Write a post</button>}
            </div>
          </div>
          <div role="tablist" aria-label="Content Studio" data-tour="tabs" className="flex flex-wrap gap-6 border-b border-line">
            {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className="tab" onClick={() => setTab(k)}>{l}{k === "library" && <span className="num ml-1.5 rounded-full bg-[#ececec] px-1.5 text-[11px] text-muted">{posts.rows.length}</span>}</button>)}
          </div>
        </header>

        {posts.loading || campaigns.loading ? <div className="card h-64 animate-pulse bg-surface-2" />
          : tab === "home" ? <HomeTab posts={posts.rows} campaigns={campaigns.rows} settings={settings} go={onTab} openPost={setView} writeFrom={writeFrom} planCampaign={planCampaign} />
          : tab === "write" ? <WriteFlow posts={posts.rows} campaigns={campaigns.rows} settings={settings} seed={seed} clearSeed={clearSeed} openPost={setView} />
          : tab === "formatter" ? <Formatter />
          : tab === "campaigns" ? <div data-tour="campaigns"><CampaignsTab posts={posts.rows} campaigns={campaigns.rows} targets={targets.rows} requests={requests.rows} prospects={prospects.rows} comments={comments.rows} openPost={setView} editPost={setEdit} start={startCamp} settings={settings} /></div>
          : tab === "plan" ? <PlanTab posts={posts.rows} campaigns={campaigns.rows} openPost={setView} settings={settings} />
          : <LibraryTab posts={posts.rows} campaigns={campaigns.rows} openPost={setView} status={libStatus} setStatus={setLibStatus} newPost={newPost} />}
      </div>
      {view && <PostView post={fresh(view)!} campaigns={campaigns.rows} members={members} onClose={() => setView(null)} onEdit={() => { setEdit(fresh(view)); setView(null); }} />}
      {edit && <PostEditor post={fresh(edit)!} campaigns={campaigns.rows} posts={posts.rows} settings={settings} companies={companies} onClose={() => setEdit(null)} />}
      {pov && <PovModal settings={settings} save={saveSettings} onClose={() => setPov(false)} />}
      <EntryMoment id="content-studio" title="Content Studio" line="Posts, campaigns and the plan for Shashi's profile, in one place." />
      <Tour id="content-studio" steps={STEPS} open={tour} onClose={() => setTour(false)} onTab={onTab} />
    </div>
  );
}

function PlanTab({ posts, campaigns, openPost, settings }: { posts: Post[]; campaigns: Campaign[]; openPost: (p: Post) => void; settings: ContentSettings }) {
  const { can } = useWorkspace();
  const toast = useToast();
  const t = today();
  const [week, setWeek] = useState(weekStart(t));
  const [day, setDay] = useState(t);
  const [pop, setPop] = useState<{ post: Post; el: HTMLElement } | null>(null);
  const [drag, setDrag] = useState<Post | null>(null);
  const paused = new Set(campaigns.filter((c) => c.status === "paused").map((c) => c.id));
  // Ideas of paused campaigns stay in Library but leave the Plan.
  const visible = posts.filter((p) => statusOf(p.status) !== "On hold" && !(p.campaign_id && paused.has(p.campaign_id) && statusOf(p.status) === "Idea"));
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const inWeek = visible.filter((p) => p.publish_date && p.publish_date >= week && p.publish_date <= days[6]).sort((a, b) => `${a.publish_date}${a.planned_time}`.localeCompare(`${b.publish_date}${b.planned_time}`));
  // Q94: undated Discovery and AI citations topics come first in the To plan tray.
  const topicFirst = (p: Post) => (postSource(p) === "discovery" ? 0 : postSource(p) === "citations" ? 1 : 2);
  const unplanned = visible.filter((p) => !p.publish_date && statusOf(p.status) !== "Posted").sort((a, b) => topicFirst(a) - topicFirst(b));
  const tagOf = (p: Post) => (postSource(p) === "discovery" ? `From Discovery${p.discovery?.rank ? ` · #${p.discovery.rank}` : ""}${p.discovery?.score != null ? ` · ${p.discovery.score}` : ""}` : postSource(p) === "citations" ? "From AI citations" : "");
  const campName = (id: string | null) => campaigns.find((c) => c.id === id)?.name ?? "Independent";
  const warnings = useMemo(() => balanceWarnings(visible.filter((p) => p.publish_date).map((p) => ({ date: p.publish_date!, campaign: p.campaign_id, pillar: p.pillar })), t), [visible, t]);

  async function planIt(p: Post, d: string, time: string) {
    setPop(null);
    const { error } = await supabase().from("posts").update({ publish_date: d, planned_time: time }).eq("id", p.id);
    if (error) { toast(error.message); return; }
    haptic(); toast(`Planned for ${fmtDay(d)}, ${time}`, async () => { await supabase().from("posts").update({ publish_date: p.publish_date, planned_time: p.planned_time }).eq("id", p.id); });
  }
  return (
    <div className="flex flex-wrap items-start gap-5">
      <section className="flex min-w-0 flex-[3_1_560px] flex-col gap-3" data-tour="plan">
        <div className="flex items-center justify-between gap-2">
          <button className="btn h-9 w-9 p-0" aria-label="Previous week" onClick={() => setWeek(addDays(week, -7))}><ChevronLeft size={16} /></button>
          <span className="flex flex-col items-center"><span className="text-[16px] font-semibold">Week of {fmtDay(week, { day: "numeric", month: "long" })}</span>{week !== weekStart(t) && <button className="text-[12px] font-semibold text-[#d64545]" onClick={() => { setWeek(weekStart(t)); setDay(t); }}>Back to this week</button>}</span>
          <button className="btn h-9 w-9 p-0" aria-label="Next week" onClick={() => setWeek(addDays(week, 7))}><ChevronRight size={16} /></button>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((d) => {
            const has = inWeek.some((p) => p.publish_date === d), on = d === day, isToday = d === t, past = d < t;
            return (
              <button key={d} onClick={() => setDay(d)} className="flex flex-col items-center gap-0.5 rounded-xl border py-2.5 transition-colors"
                onDragOver={(e) => { if (drag && !past) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); const p = drag; setDrag(null); if (p && !past) { setDay(d); planIt(p, d, "09:30"); } }}
                aria-label={drag && !past ? `Plan on ${fmtDay(d)}` : undefined}
                style={{ background: on ? "#d64545" : isToday ? "#141414" : "#fff", color: on || isToday ? "#fff" : past ? "#a8a8a8" : "#141414", borderColor: drag && !past ? "#d64545" : on || isToday ? "transparent" : "#e8e8e8", borderStyle: drag && !past ? "dashed" : "solid", borderWidth: drag && !past ? 2 : 1 }}>
                <span className="text-[11.5px] font-semibold">{fmtDay(d, { weekday: "short" })}</span><span className="num text-[17px]">{d.slice(8)}</span>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: has ? (on || isToday ? "#fff" : past ? "#a8a8a8" : "#d64545") : "transparent" }} />
              </button>
            );
          })}
        </div>
        <div className="card overflow-hidden">
          {inWeek.map((p, i) => {
            const past = (p.publish_date ?? "") < t, s = past && statusOf(p.status) !== "Posted" ? "Missed" : statusOf(p.status);
            return (
              <button key={p.id} onClick={() => openPost(p)} className={`flex w-full items-center gap-4 px-4 py-3.5 text-left hover:bg-[#fafafa] ${i ? "border-t border-line" : ""}`} style={p.publish_date === day ? { boxShadow: "inset 3px 0 0 #d64545" } : undefined}>
                <span className="flex w-[74px] shrink-0 flex-col"><span className="text-[12px] font-semibold" style={{ color: p.publish_date === t ? "#d64545" : past ? "#8c8c8c" : "#141414" }}>{p.publish_date === t ? "Today" : fmtDay(p.publish_date!, { weekday: "short", day: "numeric" })}</span><span className="num text-[12px] text-muted">{p.planned_time}</span></span>
                <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className={`truncate text-[14px] font-semibold ${past ? "text-muted" : ""}`}>{p.title}</span><ChannelFlag p={p} /></span><span className="text-[12px] text-muted">{p.format}{p.newsletter ? " · Newsletter" : ""} · {p.pillar || "No pillar"} · {campName(p.campaign_id)}</span></span>
                {s === "Missed" ? <span className="pill border border-[#d4d4d4] bg-white text-muted">Not posted</span> : <StatusPill s={s} />}
              </button>
            );
          })}
          {!inWeek.length && <p className="p-7 text-center text-[13px] text-muted">Nothing planned this week.</p>}
        </div>
        {settings.newsletter.name && (() => {
          const next = nextIssue(settings.newsletter, t), has = posts.some((p) => p.newsletter && p.publish_date && p.publish_date >= t && statusOf(p.status) !== "Posted");
          return <p className="m-0 rounded-xl border border-line bg-white px-4 py-2.5 text-[13px]"><span className="mr-2 font-semibold text-[#d64545]">Newsletter</span>{settings.newsletter.name}, every {settings.newsletter.cadence === "weekly" ? "week" : settings.newsletter.cadence === "fortnightly" ? "two weeks" : "four weeks"}. Next issue {fmtDay(next, { weekday: "long", day: "numeric", month: "short" })}{has ? ", an article is planned." : ", no article planned for it yet."}</p>;
        })()}
        {warnings.map((w) => <p key={w} className="m-0 rounded-xl border border-line bg-white px-4 py-2.5 text-[13px]"><span className="mr-2 font-semibold text-[#d64545]">Balance</span>{w}</p>)}
      </section>
      <aside className="flex min-w-0 flex-[2_1_300px] flex-col gap-2">
        <div className="rounded-xl bg-[#141414] p-4 text-white">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-[#ff8a80]">{week === weekStart(t) ? "This week" : "That week"}</div>
          <div className="mt-2 flex gap-6"><span><b className="num block text-[24px] font-medium">{inWeek.length}</b><span className="text-[12px] text-[#cfcfcf]">posts planned</span></span><span><b className="num block text-[24px] font-medium">{new Set(inWeek.map((p) => p.pillar).filter(Boolean)).size}/6</b><span className="text-[12px] text-[#cfcfcf]">pillars covered</span></span></div>
        </div>
        <div className="mt-2 flex flex-col gap-0.5" data-tour="toplan"><span className="label text-ink">To plan</span><span className="text-[12px] text-muted">Drag a topic onto a day, or press Pick a date. Discovery Studio and AI citations topics come first.</span></div>
        {unplanned.map((p) => (
          <div key={p.id} draggable={can("editor")} onDragStart={(e) => { setDrag(p); try { e.dataTransfer.setData("text/plain", p.id); e.dataTransfer.effectAllowed = "move"; } catch {} }} onDragEnd={() => setDrag(null)}
            className={`flex items-center gap-3 rounded-xl border bg-white px-3.5 py-3 ${can("editor") ? "cursor-grab active:cursor-grabbing" : ""}`} style={{ borderColor: drag?.id === p.id ? "#d64545" : "#e8e8e8" }}>
            <button className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left" onClick={() => openPost(p)}><span className="flex max-w-full items-center gap-2"><span className="truncate text-[13.5px] font-semibold">{p.title}</span><ChannelFlag p={p} /></span><span className="text-[12px] text-muted">{p.format} · {campName(p.campaign_id)}</span>{tagOf(p) && <span className="text-[11.5px] font-semibold text-[#d64545]">{tagOf(p)}</span>}</button>
            {can("editor") && <button className="btn btn-primary h-8 shrink-0" onClick={(e) => setPop({ post: p, el: e.currentTarget })}>Pick a date</button>}
          </div>
        ))}
        {!unplanned.length && <p className="m-0 rounded-xl border border-dashed border-line-strong bg-white p-4 text-center text-[13px] text-muted">Every idea has a day.</p>}
      </aside>
      {pop && <DayPopover anchor={pop.el} initial={pop.post.publish_date} onClose={() => setPop(null)} onPick={(d, time) => planIt(pop.post, d, time)} />}
    </div>
  );
}

function LibraryTab({ posts, campaigns, openPost, status, setStatus, newPost }: { posts: Post[]; campaigns: Campaign[]; openPost: (p: Post) => void; status: string; setStatus: (s: string) => void; newPost: () => void }) {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const editable = can("editor");
  const [type, setType] = useState("all");
  const [camp, setCamp] = useState("all");
  const [source, setSource] = useState<"all" | PostSource>("all");
  const [disc, setDisc] = useState<Post | null>(null);
  const [q, setQ] = useState("");
  const [pop, setPop] = useState<{ post: Post; el: HTMLElement } | null>(null);
  const [menu, setMenu] = useState<{ post: Post; el: HTMLElement } | null>(null);
  const [del, setDel] = useState<Post | null>(null);
  const [extra, setExtra] = useState<Post[]>([]);
  const [gone, setGone] = useState<string[]>([]);
  const campName = (id: string | null) => campaigns.find((c) => c.id === id)?.name;
  // Copies show at once and deletions vanish at once, before Realtime catches up.
  const all = [...posts, ...extra.filter((x) => !posts.some((p) => p.id === x.id))].filter((p) => !gone.includes(p.id));

  async function hold(p: Post) {
    const prev = statusOf(p.status);
    const { error } = await supabase().from("posts").update({ status: "On hold", hold_status: prev }).eq("id", p.id);
    if (error) { toast(error.message); return; }
    haptic(); toast("On hold. It is off the Plan until you resume it.", async () => { await supabase().from("posts").update({ status: prev, hold_status: "" }).eq("id", p.id); });
  }
  async function resume(p: Post) {
    const back = p.hold_status || "Idea";
    const { error } = await supabase().from("posts").update({ status: back, hold_status: "" }).eq("id", p.id);
    if (error) { toast(error.message); return; }
    haptic(); toast(`Resumed as ${back}`, async () => { await supabase().from("posts").update({ status: "On hold", hold_status: back }).eq("id", p.id); });
  }
  // Delete removes the post and its team comments; Undo restores both exactly.
  async function remove(p: Post) {
    setDel(null);
    const { data: th } = await supabase().from("threads").select("*").eq("workspace_id", ws.id).eq("ref_table", "posts").eq("ref_id", p.id);
    await supabase().from("threads").delete().eq("workspace_id", ws.id).eq("ref_table", "posts").eq("ref_id", p.id);
    const { error } = await supabase().from("posts").delete().eq("id", p.id);
    if (error) { toast(error.message); return; }
    setGone((g) => [...g, p.id]); haptic();
    toast(`Deleted "${p.title}"`, async () => {
      await supabase().from("posts").insert(p);
      if (th?.length) await supabase().from("threads").insert(th);
      setGone((g) => g.filter((x) => x !== p.id));
    });
  }
  const rows = all.filter((p) => (status === "all" || statusOf(p.status) === status) && (source === "all" || postSource(p) === source) && (type === "all" || (p.format || "Text post") === type) && (camp === "all" || (camp === "none" ? !p.campaign_id : p.campaign_id === camp))
    && (!q || `${p.title} ${p.pillar} ${p.topic}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (b.publish_date ?? "9999").localeCompare(a.publish_date ?? "9999"));
  const count = (s: string) => all.filter((p) => s === "all" || statusOf(p.status) === s).length;

  async function duplicate(p: Post) {
    const { id: _id, created_at: _c, ...rest } = p; void _id; void _c;
    const copy = { ...rest, title: `${p.title} (copy)`, status: "Idea", publish_date: null, planned_time: "", requested_by: null, requested_at: null, decided_by: null, decided_at: null, decision: "", decision_note: "", url: "", impressions: null, reactions: null, comments: null };
    const { data, error } = await supabase().from("posts").insert(copy).select().single();
    if (error) { toast(error.message); return; }
    setExtra((x) => [...x, data as Post]); haptic();
    toast("Duplicated as a new idea", async () => { await supabase().from("posts").delete().eq("id", (data as Post).id); setExtra((x) => x.filter((y) => y.id !== (data as Post).id)); });
  }
  async function planIt(p: Post, d: string, time: string) {
    setPop(null);
    const { error } = await supabase().from("posts").update({ publish_date: d, planned_time: time }).eq("id", p.id);
    if (error) { toast(error.message); return; }
    haptic(); toast(`${p.publish_date ? "Moved" : "Planned"} to ${fmtDay(d)}, ${time}`, async () => { await supabase().from("posts").update({ publish_date: p.publish_date, planned_time: p.planned_time }).eq("id", p.id); });
  }
  const cols = "grid-cols-[minmax(0,2.4fr)_minmax(0,.9fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,.9fr)_minmax(0,1.1fr)_212px]";
  return (
    <div className="flex flex-col gap-3" data-tour="library">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-lg border border-line bg-white p-0.5">
          {[["all", "All"], ["Idea", "Ideas"], ["Drafting", "Drafting"], ["In review", "In review"], ["Ready", "Ready"], ["Posted", "Posted"], ["On hold", "On hold"]].map(([k, l]) => (
            <button key={k} className={`h-8 rounded-md px-3 text-[13px] font-semibold ${status === k ? "bg-[#d64545] text-white" : "text-muted"}`} onClick={() => setStatus(k)}>{l} <span className="num text-[11px] opacity-75">{count(k)}</span></button>
          ))}
        </div>
        <select className="field h-9 w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type"><option value="all">All types</option>{FORMATS.map((f) => <option key={f}>{f}</option>)}</select>
        <select className="field h-9 w-auto" value={source} onChange={(e) => setSource(e.target.value as "all" | PostSource)} aria-label="Source"><option value="all">All sources</option><option value="discovery">Discovery Studio</option><option value="citations">AI citations</option><option value="campaign">Campaign</option><option value="here">Written here</option></select>
        <select className="field h-9 w-auto" value={camp} onChange={(e) => setCamp(e.target.value)} aria-label="Campaign"><option value="all">All campaigns</option><option value="none">Independent</option>{campaigns.filter((c) => !c.template).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input className="field ml-auto h-9 w-full sm:w-64" placeholder="Search posts and pillars" value={q} onChange={(e) => setQ(e.target.value)} />
        {editable && <button className="btn h-9" onClick={newPost}>Blank post</button>}
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[1040px]">
            <div className={`grid ${cols} gap-3 bg-[#141414] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white`}><span>Post</span><span>Type</span><span>Pillar</span><span>Campaign</span><span>Status</span><span>Planned or posted</span><span className="text-right">Actions</span></div>
            {rows.map((p) => {
              const s = statusOf(p.status), cn = campName(p.campaign_id);
              return (
                <div key={p.id} className={`grid ${cols} items-center gap-3 border-t border-line px-4 py-3 text-[13px] hover:bg-[#fafafa]`}>
                  <span className="flex min-w-0 flex-col items-start gap-1"><span className="flex max-w-full items-center gap-2"><span className="truncate font-semibold">{p.title}</span><ChannelFlag p={p} /></span>
                    {postSource(p) === "discovery" && <button type="button" className="pill h-[22px] border border-[#d64545] bg-white px-2 text-[11.5px] text-[#d64545] hover:bg-[#fbeaea]" onClick={() => setDisc(p)}>From Discovery{p.discovery?.rank ? ` · #${p.discovery.rank}` : ""}{p.discovery?.score != null ? ` · ${p.discovery.score}` : ""}</button>}</span>
                  <span>{p.format || "Text post"}</span>
                  <span className="truncate text-muted">{p.pillar || p.topic || "Not set"}</span>
                  <span className="truncate text-[12.5px] font-semibold" style={{ color: cn ? "#d64545" : "#8c8c8c" }}>{cn ?? "Independent"}</span>
                  <span><StatusPill s={s} /></span>
                  <span className="num text-[12px] text-muted">{p.publish_date ? `${s === "Posted" ? "Posted" : "Planned"} ${fmtDay(p.publish_date, { day: "numeric", month: "short" })}${p.planned_time ? `, ${p.planned_time}` : ""}` : "Not planned"}</span>
                  <span className="flex justify-end gap-1">
                    <button className="btn btn-dark h-7 px-3 text-[12px]" onClick={() => openPost(p)}>Open</button>
                    {editable && <button className="btn h-7 w-7 p-0" aria-label={`More actions for ${p.title}`} aria-haspopup="menu" title="More actions" onClick={(e) => { const el = e.currentTarget; setMenu((m) => (m?.post.id === p.id ? null : { post: p, el })); }}><MoreHorizontal size={15} /></button>}
                  </span>
                </div>
              );
            })}
            {!rows.length && <p className="border-t border-line p-7 text-center text-[13px] text-muted">Nothing matches. Clear the search or the filters.</p>}
          </div>
        </div>
      </div>
      {pop && <DayPopover anchor={pop.el} initial={pop.post.publish_date} onClose={() => setPop(null)} onPick={(d, time) => planIt(pop.post, d, time)} />}
      {menu && (() => {
        const p = menu.post, s = statusOf(p.status), el = menu.el;
        const items = s === "Posted" ? [{ label: "Duplicate", run: () => duplicate(p) }, { label: "Delete", danger: true, run: () => setDel(p) }]
          : [
            ...(s === "On hold" ? [] : [{ label: p.publish_date ? "Move" : "Plan", run: () => setPop({ post: p, el }) }]),
            { label: "Duplicate", run: () => duplicate(p) },
            s === "On hold" ? { label: "Resume", run: () => resume(p) } : { label: "Put on hold", run: () => hold(p) },
            { label: "Delete", danger: true, run: () => setDel(p) },
          ];
        return <ActionMenu anchor={el} items={items} onClose={() => setMenu(null)} />;
      })()}
      {disc && <SidePanel width={460} kicker={<span className="text-[#d64545]">From Discovery Studio{disc.discovery?.rank ? ` · #${disc.discovery.rank} this week` : ""}{disc.discovery?.score != null ? ` · score ${disc.discovery.score}` : ""}</span>} title={disc.title} onClose={() => setDisc(null)}>
        <span className="rounded-xl bg-[#141414] px-3.5 py-2.5 text-[13px] leading-snug text-white"><b className="text-[#ff8a80]">Suggested angle</b> {disc.discovery?.angle || disc.angle || "None given"}</span>
        {disc.discovery?.service && <span className="text-[12.5px]"><b>Antier service</b> <span className="text-muted">{disc.discovery.service}</span>{disc.discovery.campaign ? <><b className="ml-2">Campaign</b> <span className="text-muted">{disc.discovery.campaign}</span></> : null}</span>}
        <span className="label text-ink">{disc.discovery?.sources?.length ?? 0} sources</span>
        {(disc.discovery?.sources ?? []).map((r) => <div key={r.url} className="flex min-w-0 items-center gap-2 rounded-[10px] border border-[#ececec] px-2.5 py-2 text-[12.5px]"><Tag tone={r.via === "AI" ? "dark" : r.via === "Crawl" ? "white" : "red"}>{r.via}</Tag><span className="min-w-0 flex-1 truncate"><b>{r.pub}</b> {r.url.startsWith("linkedin:") ? <span className="text-muted">sent from the Prax bar</span> : <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-ink">{r.url}</a>}</span></div>)}
        {!disc.discovery?.sources?.length && <span className="text-[13px] text-muted">None stored with this idea.</span>}
        <Link href={`/w/${ws.slug}/discovery?tab=digest`} className="text-[13px] font-semibold underline underline-offset-[3px]">Open the topic in Discovery Studio</Link>
      </SidePanel>}
      {del && <Modal title={`Delete "${del.title}"?`} onClose={() => setDel(null)} footer={<><button className="btn" onClick={() => setDel(null)}>Keep it</button><button className="btn btn-primary" onClick={() => remove(del)}>Delete</button></>}>
        <p className="m-0 text-[13.5px] leading-relaxed">Delete &ldquo;{del.title}&rdquo;? Its comments go too.{statusOf(del.status) === "Posted" ? " This only removes the Prax record; the post stays on LinkedIn." : ""}</p>
      </Modal>}
    </div>
  );
}

const STEPS: TourStep[] = [
  { target: "tabs", tab: "home", title: "Six parts, one studio", body: "Home, Write a post, Campaigns, Plan, Library and Formatter. Everything about Shashi's posts lives here." },
  { target: "tiles", tab: "home", title: "The week at a glance", body: "What is due, what waits for Shashi, what is ready and which campaigns are running. Press any number to go there." },
  { target: "needs", tab: "home", title: "Needs you", body: "Approvals, posts due today or tomorrow, ideas not written yet and new topics from Discovery Studio and AI citations." },
  { target: "start", tab: "home", title: "Start something", body: "Write a post, plan a campaign, check the week or format any text." },
  { target: "works", tab: "home", title: "What works", body: "Once five posted pieces have results, this shows the formats, pillars, days and openings that work best." },
  { target: "steps", tab: "write", title: "Eight steps to a post", body: "Start, type, idea, angle, hook, draft, visual and plan. The angle step comes before the opening line: four suggested angles or your own, and it steers the hooks and drafts. A Discovery or AI citations topic opens straight at the angle, with Discovery's suggestion preselected." },
  { target: "sources", tab: "write", title: "Start from anything", body: "An idea, a link, a PDF, a rough draft, one of his comments or a topic gap. Links are read by Prax, never LinkedIn pages." },
  { target: "preview", tab: "write", title: "The live preview", body: "The post as it reads in the feed, on mobile or desktop, with the real see more cut at 140 or 210 characters." },
  { target: "campaigns", tab: "campaigns", title: "Campaigns", body: "A run of posts around one goal, aimed at named people, with a time budget Shashi can keep." },
  { target: "plan", tab: "plan", title: "The plan", body: "The week as it stands, and Today reminds Shashi at each planned time. Undated Discovery and AI citations topics wait in To plan: drag one onto a day, or press Pick a date." },
  { target: "library", tab: "library", title: "The library", body: "Every idea, draft and posted piece. Filter by source (Discovery Studio, AI citations, Campaign, Written here); the From Discovery tag opens the topic's sources. Company content is flagged so it never goes on Shashi's profile." },
  { target: "formatter", tab: "formatter", title: "The formatter", body: "Bold, italic, lists and spacing that survive the paste into LinkedIn, with shortcuts and a 3,000 counter." },
  { target: "pov", title: "Point of view", body: "His stances, cleared proof points and the numbers he allows. Every draft uses only what is here." },
  { target: "guide", title: "Open this again any time", body: "The Guide button replays this tour. Prax never posts for Shashi; he presses Post on LinkedIn himself." },
];
