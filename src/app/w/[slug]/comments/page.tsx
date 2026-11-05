"use client";
import { PageHeader } from "@/components/page-header";
import { RecordList } from "@/components/record-list";
import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { useLive } from "@/lib/live";
import { useWorkspace, fmtDay, SEGMENTS, today, weekStart, addDays } from "@/lib/workspace";

type C = { id: string; day: string; author: string; segment: string; mode: string; url: string; reply: boolean; prospect_id: string | null; source: string };

export default function CommentLog() {
  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader title="Engagement" sub="Fills itself from comments logged with the extension. Replies are marked when you check a thread." />
      <Insights />
      <RecordList table="comment_log" order="created_at" asc={false} empty="No comments logged yet. Comments posted with the Prax extension appear here automatically."
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
    </div>
  );
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

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
    <div className="card p-4">
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpi.map(([l, v, h]) => <div key={l} className="card px-4 py-3"><div className="label">{l}</div><div className="num mt-1 text-[20px] font-semibold">{v}</div><div className="text-[11px] text-muted">{h}</div></div>)}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Bars title="Which modes earn replies" data={s.modes} />
        <Bars title="By segment" data={s.segs} color={(k) => SEGMENTS[k]?.color ?? "var(--faint)"} />
        <div className="card p-4">
          <div className="label mb-2">Waiting for a reply (7 days)</div>
          {s.waiting.length === 0 ? <p className="text-[13px] text-muted">Nothing waiting.</p> : s.waiting.map((r) => (
            <a key={r.id} href={r.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-md py-1.5 text-[13px] hover:text-accent">
              <span className="truncate">{r.author || "Post"}</span><span className="flex shrink-0 items-center gap-1 text-[11px] text-muted">{fmtDay(r.day, { day: "numeric", month: "short" })}<ExternalLink size={11} /></span>
            </a>
          ))}
          <p className="mt-2 text-[11px] text-muted">Open the post, then press Check replies in the extension.</p>
        </div>
      </div>
      {s.authors.length > 0 && (
        <div className="card p-4"><div className="label mb-2">Most engaged authors, 30 days</div>
          <div className="flex flex-wrap gap-1.5">{s.authors.map(([a, n]) => <span key={a} className="chip">{a} <span className="num text-muted">{n}</span></span>)}</div></div>
      )}
    </div>
  );
}
