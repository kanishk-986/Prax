"use client";
import { Section, type TourStep } from "@/components/shell";
import { RecordList } from "@/components/record-list";
import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useLive } from "@/lib/live";
import { useWorkspace, fmtDay, SEGMENTS, today, weekStart, addDays } from "@/lib/workspace";

type C = { id: string; day: string; author: string; segment: string; mode: string; url: string; reply: boolean; prospect_id: string | null; source: string };

const ENG_TOUR: TourStep[] = [
  { target: "header", title: "What came of every comment", body: "Engagement fills itself from comments logged with the extension, so you can see which ones earn replies.", tab: "home" },
  { target: "kpis", title: "The numbers that matter", body: "Comments this week against the quota, the reply rate over 30 days, and prospects engaged.", tab: "home" },
  { target: "modes", title: "Which modes earn replies", body: "Each mode of comment with its share of replies. Lean on the ones that work.", tab: "home" },
  { target: "waiting", title: "Waiting for a reply", body: "Posts from the last 7 days with no reply yet. Open one, then press Check replies in the extension.", tab: "home" },
  { target: "drafting", title: "Drafting", body: "What the extension drafted in 30 days: counts and scores only, never the text.", tab: "home" },
  { target: "log", title: "The full log", body: "Every comment, with its author, segment, mode and reply. Add one by hand if it was posted without the extension.", tab: "log" },
];

export default function CommentLog() {
  const { ws } = useWorkspace();
  const [tab, setTab] = useState("home");
  const wk = weekStart(today());
  const { rows } = useLive<C>("comment_log", ws.id, { filter: (q) => q.gte("day", wk) });
  return (
    <Section id="engagement" title="Engagement" status="Fills itself from comments logged with the extension. Replies are marked when you check a thread."
      entryStatus={`${rows.length} comments this week, ${rows.filter((r) => r.reply).length} with a reply.`}
      tabs={[{ id: "home", label: "Home" }, { id: "log", label: "Log" }]} tab={tab} onTab={setTab} steps={ENG_TOUR}>
      {tab === "home" ? <><Insights /><div data-tour="drafting" className="rounded-2xl"><Drafting /></div></> : <div data-tour="log" className="rounded-2xl"><RecordList table="comment_log" order="created_at" asc={false} empty="No comments logged yet. Comments posted with the Prax extension appear here automatically."
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
        ]} /></div>}
    </Section>
  );
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

type U = { at: string; kind: string; style: string; human: number | null; impact: number | null };

/** What the extension drafted in the last 30 days: counts and scores only, never the text. */
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
  if (use.loading) return null;
  const peak = Math.max(1, ...s.days.map((d) => d.n));
  return (
    <div className="mb-6 grid gap-4 md:grid-cols-3">
      <div className="card p-4 md:col-span-2">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-5 gap-y-2">
          <span className="label">Drafting, 30 days</span>
          {[["Drafts written", s.drafts], ["Used and posted", s.used], ["Avg Human", s.human ?? "None"], ["Avg Impact", s.impact ?? "None"], ["Day streak", s.streak]].map(([l, v]) => <span key={l as string} className="text-[12px] text-muted">{l} <b className="num text-[15px] text-ink">{v}</b></span>)}
        </div>
        <div className="flex h-16 items-end gap-1.5" role="img" aria-label={`Drafts per day: ${s.days.map((d) => d.n).join(", ")}`}>
          {s.days.map((d) => <div key={d.d} className="flex flex-1 flex-col items-center gap-1"><div title={`${fmtDay(d.d)}: ${d.n}`} className="w-full rounded-sm" style={{ height: `${Math.max(3, (d.n / peak) * 52)}px`, background: d.n ? "var(--accent)" : "var(--line)" }} /><span className="num text-[10px] text-faint">{d.d.slice(8)}</span></div>)}
        </div>
      </div>
      <div className="card p-4">
        <div className="label mb-2">Style usage</div>
        {s.styles.length === 0 ? <p className="text-[13px] text-muted">No drafts yet.</p> : s.styles.map(([k, n]) => (
          <div key={k} className="mb-2"><div className="flex justify-between text-[12px]"><span className="truncate">{k}</span><span className="num text-muted">{n}</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${pct(n, s.styles[0][1])}%` }} /></div></div>
        ))}
      </div>
    </div>
  );
}

function Insights() {
  const { ws } = useWorkspace();
  const { rows, loading } = useLive<C>("comment_log", ws.id, { order: "created_at", asc: false });
  const t = today(), wk = weekStart(t), d30 = addDays(t, -30), d7 = addDays(t, -7);
  const s = useMemo(() => {
    const week = rows.filter((r) => r.day >= wk);
    const month = rows.filter((r) => r.day >= d30);
    const group = (key: "mode" | "segment") => Object.entries(month.reduce((m: Record<string, { n: number; r: number }>, x) => {
      const k = x[key] || "None"; (m[k] ||= { n: 0, r: 0 }).n++; if (x.reply) m[k].r++; return m;
    }, {})).sort((a, b) => b[1].n - a[1].n);
    const authors = Object.entries(month.reduce((m: Record<string, number>, x) => { if (x.author) m[x.author] = (m[x.author] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return {
      week: week.length, quota: ws.quotas.comment * 5, month: month.length, replies: month.filter((r) => r.reply).length,
      prospects: new Set(month.map((r) => r.prospect_id).filter(Boolean)).size, ext: pct(month.filter((r) => r.source === "extension").length, month.length),
      modes: group("mode"), segs: group("segment"), authors,
      waiting: rows.filter((r) => !r.reply && r.url && r.day >= d7).slice(0, 6),
    };
  }, [rows, wk, d30, d7, ws.quotas.comment]);
  if (loading) return <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="card h-[74px] animate-pulse bg-surface-2" />)}</div>;
  const kpi: [string, string, string][] = [
    ["This week", `${s.week}/${s.quota}`, "comments vs quota"],
    ["Reply rate", `${pct(s.replies, s.month)}%`, `${s.replies} of ${s.month} in 30 days`],
    ["Prospects engaged", String(s.prospects), "in pipeline, 30 days"],
    ["Logged by extension", `${s.ext}%`, "of the last 30 days"],
  ];
  const Bars = ({ title, data, color }: { title: string; data: [string, { n: number; r: number }][]; color?: (k: string) => string }) => (
    <div className="card flex-1 p-4">
      <div className="label mb-2">{title}</div>
      {data.length === 0 ? <p className="text-[13px] text-muted">No data yet.</p> : data.slice(0, 7).map(([k, v]) => (
        <div key={k} className="mb-2">
          <div className="flex justify-between text-[12px]"><span className="truncate">{k}</span><span className="num text-muted">{v.n} · {pct(v.r, v.n)}% replied</span></div>
          <div className="mt-1 h-1.5 rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${pct(v.n, data[0][1].n)}%`, background: color?.(k) ?? "var(--accent)" }} /></div>
        </div>
      ))}
    </div>
  );
  return (
    <div className="mb-6 flex flex-col gap-4">
      <div data-tour="kpis" className="grid grid-cols-2 gap-3 rounded-2xl md:grid-cols-4">
        {kpi.map(([l, v, h]) => <div key={l} className="card px-4 py-3"><div className="label">{l}</div><div className="num mt-1 text-[20px] font-semibold">{v}</div><div className="text-[11px] text-muted">{h}</div></div>)}
      </div>
      {/* Two stacked columns: modes over segments on the left, the waiting list on the right, so heights never leave gaps. */}
      <div className="grid items-stretch gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div data-tour="modes" className="flex flex-col rounded-2xl"><Bars title="Which modes earn replies" data={s.modes} /></div>
          <Bars title="By segment" data={s.segs} color={(k) => SEGMENTS[k]?.color ?? "var(--stroke)"} />
        </div>
        <div data-tour="waiting" className="card flex flex-col p-4">
          <div className="label mb-2">Waiting for a reply (7 days)</div>
          {s.waiting.length === 0 ? <p className="text-[13px] text-muted">Nothing waiting.</p> : s.waiting.map((r) => (
            <a key={r.id} href={r.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-md py-1.5 text-[13px] hover:text-accent">
              <span className="truncate">{r.author || "Post"}</span><span className="flex shrink-0 items-center gap-1 text-[11px] text-muted">{fmtDay(r.day, { day: "numeric", month: "short" })}<ExternalLink size={11} /></span>
            </a>
          ))}
          <p className="mt-auto pt-2 text-[12px] text-muted">Open the post, then press Check replies in the extension.</p>
        </div>
      </div>
      {s.authors.length > 0 && (
        <div className="card p-4"><div className="label mb-2">Most engaged authors, 30 days</div>
          <div className="flex flex-wrap gap-1.5">{s.authors.map(([a, n]) => <span key={a} className="chip">{a} <span className="num text-muted">{n}</span></span>)}</div></div>
      )}
    </div>
  );
}
