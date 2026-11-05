"use client";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useWorkspace, today, fmtDay, addDays, weekStart } from "@/lib/workspace";
import { useToast, haptic } from "@/components/toaster";
import { FORMATS, balanceWarnings } from "@/lib/campaigns";
import { type Post, type Campaign, type Target, type Request, StatusPill, statusOf, DayPopover, ActionMenu, Modal } from "@/components/content/shared";
import { PostView, PostEditor } from "@/components/content/post";
import { CampaignsTab } from "@/components/content/campaigns";
import type { ProspectLite } from "@/lib/network";

const TABS = [["campaigns", "Campaigns"], ["plan", "Plan"], ["library", "Library"], ["write", "Write"], ["formatter", "Formatter"]] as const;
type Tab = (typeof TABS)[number][0];
const SUB: Record<Tab, string> = {
  campaigns: "Plan a run of posts around one goal, aimed at the people who matter.",
  plan: "The week as it stands today. Prax reminds Shashi on Today at each planned time.",
  library: "Every idea, draft and posted piece, with its campaign and status.",
  write: "Write a post from any starting point.",
  formatter: "Bold, italic, lists and spacing that survive the paste into LinkedIn.",
};

export default function ContentStudio() {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const editable = can("editor");
  const [tab, setTab] = useState<Tab>("campaigns");
  const [startCamp, setStartCamp] = useState<{ view: "brief"; n: number } | undefined>();
  const posts = useLive<Post>("posts", ws.id, { order: "publish_date" });
  const campaigns = useLive<Campaign>("campaigns", ws.id, { order: "created_at" });
  const targets = useLive<Target>("campaign_targets", ws.id, { order: "created_at" });
  const requests = useLive<Request>("resource_requests", ws.id, { order: "created_at", asc: false });
  const prospects = useLive<ProspectLite & { warmth: string }>("prospects", ws.id, { order: "name" });
  const comments = useLive<{ id: string; author: string; reply: boolean; day: string; prospect_id: string | null }>("comment_log", ws.id);
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

  return (
    <div className="cs -mx-4 -my-6 min-h-screen bg-[var(--canvas)] px-4 py-6 md:-mx-10 md:-my-8 md:px-10 md:py-8">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
        <header className="flex flex-col gap-4 pl-10 md:pl-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h1 className="m-0 text-[26px] font-semibold tracking-tight">Content Studio</h1><p className="m-0 mt-1 text-[14px] text-muted">{SUB[tab]}</p></div>
            {editable && <div className="flex flex-wrap gap-2">
              <button className="btn h-10 px-4" onClick={() => { setTab("campaigns"); setStartCamp({ view: "brief", n: Date.now() }); }}>Plan a campaign</button>
              <button className="btn btn-primary h-10 px-4" onClick={newPost}>New post</button>
            </div>}
          </div>
          <div role="tablist" aria-label="Content Studio" className="flex flex-wrap gap-6 border-b border-line">
            {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className="tab" onClick={() => setTab(k)}>{l}{k === "library" && <span className="num ml-1.5 rounded-full bg-[#ececec] px-1.5 text-[11px] text-muted">{posts.rows.length}</span>}</button>)}
          </div>
        </header>

        {posts.loading || campaigns.loading ? <div className="card h-64 animate-pulse bg-surface-2" />
          : tab === "campaigns" ? <CampaignsTab posts={posts.rows} campaigns={campaigns.rows} targets={targets.rows} requests={requests.rows} prospects={prospects.rows} comments={comments.rows} openPost={setView} editPost={setEdit} start={startCamp} />
          : tab === "plan" ? <PlanTab posts={posts.rows} campaigns={campaigns.rows} openPost={setView} />
          : tab === "library" ? <LibraryTab posts={posts.rows} campaigns={campaigns.rows} openPost={setView} status={libStatus} setStatus={setLibStatus} />
          : <div className="card grid min-h-[240px] place-items-center p-10 text-center"><div><p className="m-0 text-[15px] font-semibold">Coming in the next build</p><p className="m-0 mt-1 max-w-[420px] text-[13px] text-muted">{tab === "write" ? "The seven-step Write a post flow: source, type, idea, hook, draft, visual and plan. Until then, New post opens the editor with an AI draft." : "The LinkedIn formatter for any text. Until then, write in the post editor."}</p></div></div>}
      </div>
      {view && <PostView post={fresh(view)!} campaigns={campaigns.rows} members={members} onClose={() => setView(null)} onEdit={() => { setEdit(fresh(view)); setView(null); }} />}
      {edit && <PostEditor post={fresh(edit)!} campaigns={campaigns.rows} posts={posts.rows} onClose={() => setEdit(null)} />}
    </div>
  );
}

function PlanTab({ posts, campaigns, openPost }: { posts: Post[]; campaigns: Campaign[]; openPost: (p: Post) => void }) {
  const { can } = useWorkspace();
  const toast = useToast();
  const t = today();
  const [week, setWeek] = useState(weekStart(t));
  const [day, setDay] = useState(t);
  const [pop, setPop] = useState<{ post: Post; el: HTMLElement } | null>(null);
  const paused = new Set(campaigns.filter((c) => c.status === "paused").map((c) => c.id));
  // Ideas of paused campaigns stay in Library but leave the Plan.
  const visible = posts.filter((p) => statusOf(p.status) !== "On hold" && !(p.campaign_id && paused.has(p.campaign_id) && statusOf(p.status) === "Idea"));
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const inWeek = visible.filter((p) => p.publish_date && p.publish_date >= week && p.publish_date <= days[6]).sort((a, b) => `${a.publish_date}${a.planned_time}`.localeCompare(`${b.publish_date}${b.planned_time}`));
  const unplanned = visible.filter((p) => !p.publish_date && statusOf(p.status) !== "Posted");
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
      <section className="flex min-w-0 flex-[3_1_560px] flex-col gap-3">
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
                style={{ background: on ? "#d64545" : isToday ? "#141414" : "#fff", color: on || isToday ? "#fff" : past ? "#a8a8a8" : "#141414", borderColor: on || isToday ? "transparent" : "#e8e8e8" }}>
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
                <span className="min-w-0 flex-1"><span className={`block truncate text-[14px] font-semibold ${past ? "text-muted" : ""}`}>{p.title}</span><span className="text-[12px] text-muted">{p.format} · {p.pillar || "No pillar"} · {campName(p.campaign_id)}</span></span>
                {s === "Missed" ? <span className="pill border border-[#d4d4d4] bg-white text-muted">Not posted</span> : <StatusPill s={s} />}
              </button>
            );
          })}
          {!inWeek.length && <p className="p-7 text-center text-[13px] text-muted">Nothing planned this week.</p>}
        </div>
        {warnings.map((w) => <p key={w} className="m-0 rounded-xl border border-line bg-white px-4 py-2.5 text-[13px]"><span className="mr-2 font-semibold text-[#d64545]">Balance</span>{w}</p>)}
      </section>
      <aside className="flex min-w-0 flex-[2_1_300px] flex-col gap-2">
        <div className="rounded-xl bg-[#141414] p-4 text-white">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-[#ff8a80]">{week === weekStart(t) ? "This week" : "That week"}</div>
          <div className="mt-2 flex gap-6"><span><b className="num block text-[24px] font-medium">{inWeek.length}</b><span className="text-[12px] text-[#cfcfcf]">posts planned</span></span><span><b className="num block text-[24px] font-medium">{new Set(inWeek.map((p) => p.pillar).filter(Boolean)).size}/6</b><span className="text-[12px] text-[#cfcfcf]">pillars covered</span></span></div>
        </div>
        <div className="label mt-2">Not yet planned</div>
        {unplanned.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-xl border border-line bg-white px-3.5 py-3">
            <button className="min-w-0 flex-1 text-left" onClick={() => openPost(p)}><span className="block truncate text-[13.5px] font-semibold">{p.title}</span><span className="text-[12px] text-muted">{p.format} · {campName(p.campaign_id)}</span></button>
            {can("editor") && <button className="btn btn-primary h-8 shrink-0" onClick={(e) => setPop({ post: p, el: e.currentTarget })}>Plan</button>}
          </div>
        ))}
        {!unplanned.length && <p className="m-0 rounded-xl border border-dashed border-line-strong bg-white p-4 text-center text-[13px] text-muted">Every idea has a day.</p>}
      </aside>
      {pop && <DayPopover anchor={pop.el} initial={pop.post.publish_date} onClose={() => setPop(null)} onPick={(d, time) => planIt(pop.post, d, time)} />}
    </div>
  );
}

function LibraryTab({ posts, campaigns, openPost, status, setStatus }: { posts: Post[]; campaigns: Campaign[]; openPost: (p: Post) => void; status: string; setStatus: (s: string) => void }) {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const editable = can("editor");
  const [type, setType] = useState("all");
  const [camp, setCamp] = useState("all");
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
  const rows = all.filter((p) => (status === "all" || statusOf(p.status) === status) && (type === "all" || (p.format || "Text post") === type) && (camp === "all" || (camp === "none" ? !p.campaign_id : p.campaign_id === camp))
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-lg border border-line bg-white p-0.5">
          {[["all", "All"], ["Idea", "Ideas"], ["Drafting", "Drafting"], ["In review", "In review"], ["Ready", "Ready"], ["Posted", "Posted"], ["On hold", "On hold"]].map(([k, l]) => (
            <button key={k} className={`h-8 rounded-md px-3 text-[13px] font-semibold ${status === k ? "bg-[#d64545] text-white" : "text-muted"}`} onClick={() => setStatus(k)}>{l} <span className="num text-[11px] opacity-75">{count(k)}</span></button>
          ))}
        </div>
        <select className="field h-9 w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type"><option value="all">All types</option>{FORMATS.map((f) => <option key={f}>{f}</option>)}</select>
        <select className="field h-9 w-auto" value={camp} onChange={(e) => setCamp(e.target.value)} aria-label="Campaign"><option value="all">All campaigns</option><option value="none">Independent</option>{campaigns.filter((c) => !c.template).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input className="field ml-auto h-9 w-full sm:w-64" placeholder="Search posts and pillars" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[1040px]">
            <div className={`grid ${cols} gap-3 bg-[#141414] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white`}><span>Post</span><span>Type</span><span>Pillar</span><span>Campaign</span><span>Status</span><span>Planned or posted</span><span className="text-right">Actions</span></div>
            {rows.map((p) => {
              const s = statusOf(p.status), cn = campName(p.campaign_id);
              return (
                <div key={p.id} className={`grid ${cols} items-center gap-3 border-t border-line px-4 py-3 text-[13px] hover:bg-[#fafafa]`}>
                  <span className="truncate font-semibold">{p.title}</span>
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
      {del && <Modal title={`Delete "${del.title}"?`} onClose={() => setDel(null)} footer={<><button className="btn" onClick={() => setDel(null)}>Keep it</button><button className="btn btn-primary" onClick={() => remove(del)}>Delete</button></>}>
        <p className="m-0 text-[13.5px] leading-relaxed">Delete &ldquo;{del.title}&rdquo;? Its comments go too.{statusOf(del.status) === "Posted" ? " This only removes the Prax record; the post stays on LinkedIn." : ""}</p>
      </Modal>}
    </div>
  );
}
