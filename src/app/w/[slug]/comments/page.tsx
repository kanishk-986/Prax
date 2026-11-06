"use client";
import Link from "next/link";
import { Section, NotStarted, type TourStep } from "@/components/shell";
import { RecordList } from "@/components/record-list";
import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useLive } from "@/lib/live";
import { useWorkspace, fmtDay, SEGMENTS, today, weekStart, addDays } from "@/lib/workspace";
import { commentDays, weekOverWeek, relTime } from "@/lib/dashboard";
import { isNewReply, REPLY_KIND_LABEL, type ReplyRow, type InboxState } from "@/lib/inbox";
import { useActiveStrategy } from "@/components/strategy/data";
import { commentTarget } from "@/lib/strategy";

type C = { id: string; day: string; author: string; segment: string; mode: string; url: string; reply: boolean; prospect_id: string | null; source: string };

const ENG_TOUR: TourStep[] = [
  { target: "header", title: "What came of every comment", body: "Engagement fills itself from comments logged with the extension, so you can see which ones earn replies.", tab: "home" },
  { target: "replies", title: "New replies", body: "Who replied to your comments, commented on your posts or mentioned you, read when you press Check replies on LinkedIn. A reply stays new until you answer or snooze it in the Inbox.", tab: "home" },
  { target: "kpis", title: "The numbers that matter", body: "Comments this week against the quota, the reply rate over 30 days, and prospects engaged.", tab: "home" },
  { target: "modes", title: "Which modes earn replies", body: "Each mode of comment with its share of replies. Lean on the ones that work.", tab: "home" },
  { target: "waiting", title: "Waiting for a reply", body: "Posts from the last 7 days with no reply yet. Open one, then press Check replies in the extension.", tab: "home" },
  { target: "drafting", title: "Drafting", body: "What the extension drafted in 30 days: counts and scores only, never the text.", tab: "home" },
  { target: "log", title: "The full log", body: "Every comment, with its author, segment, mode and reply. Add one by hand if it was posted without the extension.", tab: "log" },
];

export default function CommentLog() {
  const { ws } = useWorkspace();
  const [tab, setTab] = useState("home");
  const [replied, setReplied] = useState(false);
  const wk = weekStart(today());
  const { rows } = useLive<C>("comment_log", ws.id, { filter: (q) => q.gte("day", wk) });
  return (
    <Section id="engagement" title="Engagement" status="Fills itself from comments logged with the extension. Replies come in when you press Check replies on LinkedIn."
      entryStatus={`${rows.length} comments this week, ${rows.filter((r) => r.reply).length} with a reply.`}
      tabs={[{ id: "home", label: "Home" }, { id: "log", label: "Log" }]} tab={tab} onTab={setTab} steps={ENG_TOUR}>
      {tab === "home" ? <><NewReplies /><Insights /></> : <div data-tour="log" className="flex flex-col gap-3 rounded-2xl">
        <div role="group" aria-label="Show" className="flex w-fit rounded-lg border border-line p-0.5">
          {([[false, "All comments"], [true, "Replied"]] as const).map(([v, l]) => (
            <button key={l} type="button" aria-pressed={replied === v} onClick={() => setReplied(v)}
              className={`h-8 rounded-md px-3 text-meta font-medium transition-colors ${replied === v ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>{l}</button>
          ))}
        </div>
        <RecordList table="comment_log" order="created_at" asc={false} hide={replied ? (r) => !r.reply : undefined}
          empty={replied ? "No logged comment has a reply yet. Press Check replies in the extension on a post or on LinkedIn notifications." : "No comments logged yet. Comments posted with the Prax extension appear here automatically."}
        defaults={{ day: new Date().toISOString().slice(0, 10), source: "manual" }}
        cols={[
          { key: "day", label: "Date", className: "num whitespace-nowrap text-muted", render: (r) => fmtDay(r.day) },
          { key: "author", label: "Post author", className: "font-medium" },
          { key: "segment", label: "Segment", render: (r) => (SEGMENTS[r.segment] ? <span className="chip" style={{ color: SEGMENTS[r.segment].color }}>{r.segment}</span> : "") },
          { key: "mode", label: "Mode", render: (r) => (r.mode ? <span className="chip">{r.mode}</span> : "") },
          { key: "text", label: "Comment", className: "max-w-[420px] text-ink-2", render: (r) => <span className="line-clamp-2">{r.text}</span> },
          { key: "reply", label: "Reply", render: (r) => (r.reply ? <span className="chip" style={{ background: "var(--good-soft)", color: "var(--good)" }}>Replied</span> : "") },
        ]}
        fields={[
          { key: "day", label: "Date", type: "date" },
          { key: "author", label: "Post author" },
          { key: "segment", label: "Segment", type: "select", options: ["", ...Object.keys(SEGMENTS)] },
          { key: "mode", label: "Mode" },
          { key: "url", label: "Post URL", type: "url", wide: true },
          { key: "text", label: "Comment text", type: "textarea" },
          { key: "reply", label: "Reply received", type: "checkbox" },
        ]} />
      </div>}
    </Section>
  );
}

/** Replies read with Check replies (I1, db/027), newest first: the new ones (not done or snoozed in the Inbox) on top.
 *  Each row says who, where and what they wrote, with the post and the lead. Nothing shows before db/027 runs. */
function NewReplies() {
  const { ws } = useWorkspace();
  const t = today();
  const rows = useLive<ReplyRow>("replies", ws.id, { order: "seen_at", asc: false, filter: (q) => q.gte("seen_at", new Date(addDays(t, -30) + "T00:00:00").toISOString()).limit(60) });
  const states = useLive<InboxState>("inbox_state", ws.id, { filter: (q) => q.like("key", "reply:%") });
  const [all, setAll] = useState(false);
  const list = useMemo(() => rows.rows.map((r) => ({ ...r, fresh: isNewReply(r, states.error ? [] : states.rows, t) })), [rows.rows, states.rows, states.error, t]);
  if (rows.loading || rows.error) return null;
  const fresh = list.filter((r) => r.fresh);
  const shown = (all ? list : fresh).slice(0, all ? 20 : 6);
  const base = `/w/${ws.slug}`;
  return (
    <section data-tour="replies" className="panel">
      <div className="panel-head">
        <span className="flex items-center gap-2">New replies{fresh.length > 0 && <span className="count-badge">{fresh.length}</span>}</span>
        {list.length > fresh.length && <button type="button" className="text-meta font-medium text-muted hover:text-ink" onClick={() => setAll((v) => !v)}>{all ? "Only new" : "Last 30 days"}</button>}
      </div>
      {shown.length === 0 ? (
        <p className="border-t border-line px-[18px] py-4 text-body text-muted">{list.length ? "No new replies. Every reply has been answered or snoozed in the Inbox." : "None yet. On LinkedIn, open your notifications or a post and press Check replies in the extension."}</p>
      ) : (
        <ul className="border-t border-line">
          {shown.map((r) => (
            <li key={r.id} className="flex items-start gap-3 border-t border-line px-[18px] py-3 first:border-t-0">
              <span className={`mt-[7px] h-[7px] w-[7px] shrink-0 rounded-full ${r.fresh ? "bg-accent" : "border-[1.5px] border-line-strong bg-white"}`} aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-baseline gap-x-2 text-body">
                  <span className="font-semibold">{r.person}</span>
                  <span className="text-meta text-muted">{REPLY_KIND_LABEL[r.kind] ?? "Replied"}</span>
                  {r.fresh && <span className="sr-only">New.</span>}
                </span>
                {r.body && <span className="line-clamp-2 text-body text-ink-2">{r.body}</span>}
                <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-meta">
                  {r.post_url && <a href={r.post_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-muted hover:text-ink">Open the post <ExternalLink size={11} /></a>}
                  {r.prospect_id && <Link href={`${base}/pipeline?p=${r.prospect_id}`} className="font-medium text-muted hover:text-ink">Open lead</Link>}
                </span>
              </span>
              <span className="num shrink-0 whitespace-nowrap pt-px text-meta text-faint">{relTime(r.replied_at)}</span>
            </li>
          ))}
        </ul>
      )}
      {fresh.length > 0 && <div className="border-t border-line px-[18px] py-2.5"><Link href={`${base}/inbox`} className="text-meta font-medium text-muted underline decoration-line-strong underline-offset-[3px] hover:text-ink">Answer them in the Inbox</Link></div>}
    </section>
  );
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

type U = { at: string; kind: string; style: string; human: number | null; impact: number | null };

/** What the extension drafted in the last 30 days: counts and scores only, never the text. Nothing before the first draft. */
function Drafting() {
  const { ws } = useWorkspace();
  const d30 = addDays(today(), -30);
  const use = useLive<U>("ext_usage", ws.id, { filter: (q) => q.gte("at", d30) });
  const logs = useLive<C>("comment_log", ws.id, { filter: (q) => q.gte("day", d30) });
  const s = useMemo(() => {
    const drafts = use.rows.filter((u) => ["comment", "reply", "note"].includes(u.kind));
    const scored = use.rows.filter((u) => u.kind === "scores");
    const avg = (k: "human" | "impact") => { const v = scored.map((x) => x[k]).filter((x): x is number => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
    const used = logs.rows.filter((r) => r.source === "extension").length;
    const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i - 13)).map((d) => ({ d, n: drafts.filter((u) => u.at.slice(0, 10) === d).length }));
    const styles = Object.entries(scored.reduce((m: Record<string, number>, x) => { if (x.style) m[x.style] = (m[x.style] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 7);
    let streak = 0; for (let i = days.length - 1; i >= 0; i--) { if (days[i].n) streak++; else if (i !== days.length - 1) break; }
    return { drafts: drafts.length, used, human: avg("human"), impact: avg("impact"), days, styles, streak };
  }, [use.rows, logs.rows]);
  if (use.loading || !s.drafts) return null;
  const peak = Math.max(1, ...s.days.map((d) => d.n));
  const facts: [string, string | number][] = [["Drafts written", s.drafts], ["Used and posted", s.used], ...(s.human != null ? [["Average Human", s.human] as [string, number]] : []), ...(s.impact != null ? [["Average Impact", s.impact] as [string, number]] : []), ...(s.streak >= 2 ? [["Day streak", s.streak] as [string, number]] : [])];
  return (
    <div data-tour="drafting" className="mb-6 grid gap-4 md:grid-cols-3">
      <div className="card p-4 md:col-span-2">
        <h2 className="mb-1 text-body font-semibold">Drafting, 30 days</h2>
        <div className="mb-3 flex flex-wrap items-baseline gap-x-5 gap-y-2">
          {facts.map(([l, v]) => <span key={l} className="text-meta text-muted">{l} <b className="num text-title font-semibold text-ink">{v}</b></span>)}
        </div>
        <div className="flex h-16 items-end gap-1.5" role="img" aria-label={`Drafts per day: ${s.days.map((d) => d.n).join(", ")}`}>
          {s.days.map((d) => <div key={d.d} className="flex flex-1 flex-col items-center gap-1"><div title={`${fmtDay(d.d)}: ${d.n}`} className="w-full rounded-sm" style={{ height: `${Math.max(3, (d.n / peak) * 52)}px`, background: d.n ? "var(--ink)" : "var(--line)" }} /><span className="num text-meta text-faint">{d.d.slice(8)}</span></div>)}
        </div>
      </div>
      <div className="card p-4">
        <h2 className="mb-2 text-body font-semibold">Style usage</h2>
        {s.styles.length === 0 ? <p className="text-body text-muted">No scored drafts yet.</p> : s.styles.map(([k, n]) => (
          <div key={k} className="mb-2"><div className="flex justify-between text-meta"><span className="truncate">{k}</span><span className="num text-muted">{n}</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-surface-2"><div className="h-full rounded-full bg-ink" style={{ width: `${pct(n, s.styles[0][1])}%` }} /></div></div>
        ))}
      </div>
    </div>
  );
}

function Insights() {
  const { ws } = useWorkspace();
  const { rows, loading } = useLive<C>("comment_log", ws.id, { order: "created_at", asc: false });
  const t = today(), wk = weekStart(t), d30 = addDays(t, -30), d7 = addDays(t, -7);
  // The weekly count comes from the same place as the Dashboard's: comment ticks on Today and logged comments.
  const { goal } = useActiveStrategy();
  const ticks = useLive<{ day: string }>("daily_items", ws.id, { filter: (q) => q.gte("day", addDays(wk, -7)).eq("kind", "comment").eq("done", true) });
  const s = useMemo(() => {
    const month = rows.filter((r) => r.day >= d30);
    const group = (key: "mode" | "segment") => Object.entries(month.reduce((m: Record<string, { n: number; r: number }>, x) => {
      const k = x[key] || "None"; (m[k] ||= { n: 0, r: 0 }).n++; if (x.reply) m[k].r++; return m;
    }, {})).sort((a, b) => b[1].n - a[1].n);
    const authors = Object.entries(month.reduce((m: Record<string, number>, x) => { if (x.author) m[x.author] = (m[x.author] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return {
      week: weekOverWeek(commentDays(ticks.rows.map((x) => x.day), rows.map((r) => r.day)), t).now, quota: commentTarget(goal, ws.quotas.comment), month: month.length, replies: month.filter((r) => r.reply).length,
      prospects: new Set(month.map((r) => r.prospect_id).filter(Boolean)).size, ext: pct(month.filter((r) => r.source === "extension").length, month.length),
      modes: group("mode"), segs: group("segment"), authors,
      waiting: rows.filter((r) => !r.reply && r.url && r.day >= d7).slice(0, 6),
    };
  }, [rows, ticks.rows, t, d30, d7, ws.quotas.comment, goal]);
  if (loading || ticks.loading) return <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="card h-[74px] animate-pulse bg-surface-2" />)}</div>;
  // Not started: nothing logged in 30 days. One true line and the one action that fills the page.
  if (!s.month) return (
    <NotStarted tour="kpis" title="Not started"
      body={<>{s.week ? `${s.week} ${s.week === 1 ? "comment" : "comments"} ticked on Today this week, none logged yet. ` : ""}Engagement fills itself when comments are posted with the Prax extension: who you commented on, which modes earn replies, and who is still waiting for one. A comment posted without it can be added in the Log.</>}
      action={<Link href={`/w/${ws.slug}/connections?tab=chrome`} className="btn btn-primary h-10 px-4">Set up the extension</Link>} />
  );
  const kpi: [string, string, string][] = [
    ["This week", s.quota ? `${s.week} of ${s.quota}` : String(s.week), "comments against the weekly target"],
    ["Reply rate", `${pct(s.replies, s.month)}%`, `${s.replies} of ${s.month} in 30 days`],
    ["Prospects engaged", String(s.prospects), "in pipeline, 30 days"],
    ["Logged by extension", `${s.ext}%`, "of the last 30 days"],
  ];
  const Bars = ({ title, data, color }: { title: string; data: [string, { n: number; r: number }][]; color?: (k: string) => string }) => (
    <div className="card flex-1 p-4">
      <h2 className="mb-2 text-body font-semibold">{title}</h2>
      {data.length === 0 ? <p className="text-body text-muted">No data yet.</p> : data.slice(0, 7).map(([k, v]) => (
        <div key={k} className="mb-2">
          <div className="flex justify-between text-meta"><span className="truncate">{k}</span><span className="num text-muted">{v.n} · {pct(v.r, v.n)}% replied</span></div>
          <div className="mt-1 h-1.5 rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${pct(v.n, data[0][1].n)}%`, background: color?.(k) ?? "var(--ink)" }} /></div>
        </div>
      ))}
    </div>
  );
  return (
    <div className="mb-6 flex flex-col gap-4">
      <div data-tour="kpis" className="grid grid-cols-2 gap-3 rounded-2xl md:grid-cols-4">
        {kpi.map(([l, v, h]) => <div key={l} className="card px-4 py-3"><div className="label">{l}</div><div className="num mt-1 text-page font-semibold">{v}</div><div className="text-meta text-muted">{h}</div></div>)}
      </div>
      {/* Two stacked columns: modes over segments on the left, the waiting list on the right, so heights never leave gaps. */}
      <div className="grid items-stretch gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div data-tour="modes" className="flex flex-col rounded-2xl"><Bars title="Which modes earn replies" data={s.modes} /></div>
          <Bars title="By segment" data={s.segs} color={(k) => SEGMENTS[k]?.color ?? "var(--stroke)"} />
        </div>
        <div data-tour="waiting" className="card flex flex-col p-4">
          <h2 className="mb-2 text-body font-semibold">Waiting for a reply, 7 days</h2>
          {s.waiting.length === 0 ? <p className="text-body text-muted">Nothing waiting.</p> : s.waiting.map((r) => (
            <a key={r.id} href={r.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-md py-1.5 text-body hover:text-accent">
              <span className="truncate">{r.author || "Post"}</span><span className="flex shrink-0 items-center gap-1 text-meta text-muted">{fmtDay(r.day, { day: "numeric", month: "short" })}<ExternalLink size={11} /></span>
            </a>
          ))}
          <p className="mt-auto pt-2 text-meta text-muted">Open the post, then press Check replies in the extension.</p>
        </div>
      </div>
      {s.authors.length > 0 && (
        <div className="card p-4"><h2 className="mb-2 text-body font-semibold">Most engaged authors, 30 days</h2>
          <div className="flex flex-wrap gap-1.5">{s.authors.map(([a, n]) => <span key={a} className="chip">{a} <span className="num text-muted">{n}</span></span>)}</div></div>
      )}
      <Drafting />
    </div>
  );
}
