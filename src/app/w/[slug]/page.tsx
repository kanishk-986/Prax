"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { ArrowUpRight, Activity as ActivityIcon } from "lucide-react";
import { useLive } from "@/lib/live";
import { useWorkspace, today, addDays, weekStart, fmtDay, STAGES, SEGMENTS, KINDS } from "@/lib/workspace";
import { PageHeader } from "@/components/page-header";

type Item = { day: string; kind: string; done: boolean };
type Prospect = { id: string; name: string; company: string; stage: string; segment: string; next_action: string; next_date: string | null };
type Snap = { metric: string; value: number; captured_at: string; source: string };
type Act = { id: number; at: string; kind: string; label: string };

const REACH = [
  { key: "impressions_7d", label: "Post impressions", sub: "last 7 days" },
  { key: "followers", label: "Followers", sub: "total" },
  { key: "profile_views_90d", label: "Profile viewers", sub: "last 90 days" },
  { key: "search_appearances", label: "Search appearances", sub: "last week" },
];

export default function Dashboard() {
  const { ws } = useWorkspace();
  const t = today();
  const since = addDays(t, -27);
  const items = useLive<Item>("daily_items", ws.id, { filter: (q) => q.gte("day", since) });
  const prospects = useLive<Prospect>("prospects", ws.id);
  const snaps = useLive<Snap>("snapshots", ws.id, { order: "captured_at", asc: false });
  const acts = useLive<Act>("activity", ws.id, { order: "at", asc: false, filter: (q) => q.limit(25) });
  const posts = useLive<{ id: string; title: string; format: string; publish_date: string | null; status: string }>("posts", ws.id, { order: "publish_date", filter: (q) => q.gte("publish_date", t).lte("publish_date", addDays(t, 7)) });

  // Open prospects with a linked connection or a connection at their company (db/006_network.sql).
  const [warm, setWarm] = useState<number | null>(null);
  useEffect(() => { supabase().rpc("network_warm_count", { ws: ws.id }).then(({ data, error }: { data: unknown; error: unknown }) => setWarm(error ? null : (data as number))); }, [ws.id, prospects.rows.length]);

  const wk = weekStart(t);
  const stats = useMemo(() => {
    const rows = items.rows;
    const tod = rows.filter((r) => r.day === t);
    const week = rows.filter((r) => r.day >= wk && r.day <= t);
    const by = (k: string, arr: Item[]) => ({ done: arr.filter((r) => r.kind === k && r.done).length, total: arr.filter((r) => r.kind === k).length });
    const days = Array.from({ length: 14 }, (_, i) => addDays(t, i - 13)).map((d) => { const a = rows.filter((r) => r.day === d); return { d, done: a.filter((r) => r.done).length, total: a.length }; });
    let streak = 0;
    for (let i = days.length - 1; i >= 0; i--) { const x = days[i]; if (x.total && x.done / x.total >= 0.8) streak++; else if (x.d !== t) break; }
    return { today: { done: tod.filter((r) => r.done).length, total: tod.length }, comment: by("comment", week), request: by("request", week), dm: by("dm", week), days, streak };
  }, [items.rows, t, wk]);

  const pipe = useMemo(() => {
    const counts = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<string, number>;
    prospects.rows.forEach((p) => { counts[p.stage] = (counts[p.stage] ?? 0) + 1; });
    const reached = (s: string) => { const i = STAGES.indexOf(s as (typeof STAGES)[number]); return prospects.rows.filter((p) => STAGES.indexOf(p.stage as (typeof STAGES)[number]) >= i && p.stage !== "Parked").length; };
    const due = prospects.rows.filter((p) => p.next_date && p.next_date <= t && !["Parked", "Won"].includes(p.stage)).sort((a, b) => (a.next_date! < b.next_date! ? -1 : 1));
    return { counts, total: prospects.rows.length, conv: reached("In conversation"), calls: reached("Call booked"), due };
  }, [prospects.rows, t]);

  const latest = useMemo(() => {
    const m: Record<string, { now?: Snap; prev?: Snap }> = {};
    snaps.rows.forEach((s) => { const e = (m[s.metric] ||= {}); if (!e.now) e.now = s; else if (!e.prev) e.prev = s; });
    return m;
  }, [snaps.rows]);

  const q = ws.quotas;
  const wkDays = Math.min(5, Math.round((new Date(t + "T12:00:00").getTime() - new Date(wk + "T12:00:00").getTime()) / 864e5) + 1);
  const hour = new Date().getHours();

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader title={`Good ${hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"}`} sub={`${ws.name} · ${fmtDay(t, { weekday: "long", day: "numeric", month: "long" })}`}>
        <Link href={`/w/${ws.slug}/today`} className="btn btn-primary">Open today’s checklist <ArrowUpRight size={14} /></Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Kpi label="Today" value={`${stats.today.done}/${stats.today.total || 0}`} foot={stats.today.total ? `${Math.round((stats.today.done / stats.today.total) * 100)}% done` : "Not opened yet"} tone={stats.today.total && stats.today.done >= stats.today.total ? "good" : undefined} />
        <Kpi label="Comments this week" value={stats.comment.done} foot={`target ${q.comment * wkDays}`} />
        <Kpi label="Requests this week" value={stats.request.done} foot={`target ${q.request * wkDays}`} />
        <Kpi label="In conversation" value={pipe.conv} foot={`of ${pipe.total} in pipeline`} />
        <Kpi label="Calls booked" value={pipe.calls} foot="all time" tone={pipe.calls ? "good" : undefined} />
        <Kpi label="Streak" value={`${stats.streak}d`} foot="days at 80%+ of quota" />
        <Link href={`/w/${ws.slug}/network`} className="contents"><Kpi label="Warm paths" value={warm ?? "–"} foot={warm == null ? "upload the export" : "open prospects"} tone={warm ? "good" : undefined} /></Link>
      </div>

      <NextActions slug={ws.slug} todayLeft={stats.today.total - stats.today.done} todayTotal={stats.today.total} due={pipe.due.length}
        ready={prospects.rows.filter((p) => p.stage === "Warming").length} posts={posts.rows.filter((p) => !["Posted", "Ready", "On hold", "Published", "Approved", "Scheduled"].includes(p.status))} />

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <div className="flex items-baseline justify-between"><h2 className="text-[14px] font-semibold">Daily execution</h2><span className="text-[12px] text-muted">last 14 days · items done vs planned</span></div>
          <Bars days={stats.days} today={t} />
        </section>
        <section className="card p-5">
          <div className="flex items-baseline justify-between"><h2 className="text-[14px] font-semibold">Pipeline</h2><Link href={`/w/${ws.slug}/pipeline`} className="text-[12px] text-accent">Open</Link></div>
          <Funnel counts={pipe.counts} />
        </section>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <div className="flex items-baseline justify-between"><h2 className="text-[14px] font-semibold">LinkedIn reach</h2><span className="text-[12px] text-muted">captured from LinkedIn with the Prax extension</span></div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {REACH.map((r) => { const e = latest[r.key]; const delta = e?.now && e?.prev ? e.now.value - e.prev.value : null; return (
              <div key={r.key}>
                <div className="label">{r.label}</div>
                <div className="num mt-1 text-[22px] font-semibold">{e?.now ? Number(e.now.value).toLocaleString() : "—"}</div>
                <div className="text-[12px] text-muted">{e?.now ? <>{delta !== null && <span className={delta >= 0 ? "text-good" : "text-bad"}>{delta >= 0 ? "+" : ""}{delta.toLocaleString()} </span>}{r.sub} · {fmtDay(e.now.captured_at.slice(0, 10), { day: "numeric", month: "short" })}</> : "Capture from LinkedIn analytics"}</div>
              </div>
            ); })}
          </div>
        </section>
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold"><ActivityIcon size={14} /> Live activity</h2>
          <ul className="mt-3 flex max-h-[220px] flex-col gap-2 overflow-auto">
            {acts.rows.length === 0 && <li className="text-[13px] text-muted">Ticks on Today and pipeline moves appear here as they happen.</li>}
            {acts.rows.map((a) => (
              <li key={a.id} className="flex items-start gap-2 text-[13px]">
                <span className="dot mt-[7px]" style={{ background: a.kind === "stage" ? "var(--accent)" : "var(--good)" }} />
                <span className="min-w-0 flex-1"><span className="text-ink-2">{labelFor(a)}</span><span className="block text-[11px] text-faint">{new Date(a.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card mt-3 p-5">
        <div className="flex items-baseline justify-between"><h2 className="text-[14px] font-semibold">Follow-ups due</h2><span className="text-[12px] text-muted">{pipe.due.length} people</span></div>
        {pipe.due.length === 0 ? <p className="mt-3 text-[13px] text-muted">Nothing due. People whose next-action date has arrived show here.</p> : (
          <ul className="mt-2 divide-y divide-line">
            {pipe.due.slice(0, 8).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-2 text-[13px]">
                <span className="h-2 w-2 rounded-full" style={{ background: SEGMENTS[p.segment]?.color ?? "var(--faint)" }} />
                <span className="font-medium">{p.name}</span><span className="text-muted">{p.company}</span>
                <span className="chip">{p.stage}</span>
                <span className="min-w-0 flex-1 truncate text-ink-2">{p.next_action}</span>
                <span className="num text-[12px] text-muted">{fmtDay(p.next_date!, { day: "numeric", month: "short" })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function labelFor(a: Act) {
  if (a.kind === "stage") return a.label;
  const k = KINDS.find((x) => x.key === a.kind);
  return `${k ? k.label.replace(/s$/, "") : "Task"} done${a.label && a.label !== a.kind ? `: ${a.label}` : ""}`;
}

function NextActions({ slug, todayLeft, todayTotal, due, ready, posts }: { slug: string; todayLeft: number; todayTotal: number; due: number; ready: number; posts: { id: string; title: string; format: string; publish_date: string | null; status: string }[] }) {
  const base = `/w/${slug}`;
  const acts: { tone: string; title: string; sub: string; href: string; cta: string }[] = [];
  if (!todayTotal) acts.push({ tone: "var(--accent)", title: "Open today's checklist", sub: "It generates from your daily quota", href: `${base}/today`, cta: "Start" });
  else if (todayLeft > 0) acts.push({ tone: "var(--accent)", title: `${todayLeft} items left today`, sub: "Comments, requests and messages", href: `${base}/today`, cta: "Continue" });
  if (due > 0) acts.push({ tone: "var(--bad)", title: `${due} follow-ups due`, sub: "People whose next step is today or overdue", href: `${base}/pipeline`, cta: "Review" });
  if (ready > 0) acts.push({ tone: "var(--warn)", title: `${ready} people warming up`, sub: "Comment twice, then send the note", href: `${base}/pipeline`, cta: "Open" });
  posts.slice(0, 2).forEach((p) => acts.push({ tone: "var(--accent)", title: `${p.format} due ${p.publish_date ? fmtDay(p.publish_date, { weekday: "short", day: "numeric" }) : "soon"}`, sub: `${p.title} · ${p.status}`, href: `${base}/content`, cta: "Draft" }));
  if (!acts.length) return null;
  return (
    <section className="mt-3">
      <div className="label mb-2">Next best actions</div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {acts.slice(0, 4).map((a, k) => (
          <Link key={k} href={a.href} className="card lift anim-rise group flex items-center gap-3 p-4" style={{ animationDelay: `${k * 40}ms` }}>
            <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: a.tone }} />
            <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">{a.title}</span><span className="block truncate text-[12px] text-muted">{a.sub}</span></span>
            <span className="text-[12px] font-semibold text-accent opacity-70 transition-opacity group-hover:opacity-100">{a.cta} →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Kpi({ label, value, foot, tone }: { label: string; value: React.ReactNode; foot: string; tone?: "good" }) {
  return (
    <div className="card lift p-4">
      <div className="label">{label}</div>
      <div className={`num mt-1.5 text-[24px] font-semibold leading-none ${tone === "good" ? "text-good" : ""}`}>{value}</div>
      <div className="mt-1.5 text-[12px] text-muted">{foot}</div>
    </div>
  );
}

function Bars({ days, today: t }: { days: { d: string; done: number; total: number }[]; today: string }) {
  const W = 680, H = 190, pl = 28, pb = 22, pt = 8;
  const max = Math.max(10, ...days.map((d) => d.total));
  const top = Math.ceil(max / 10) * 10;
  const bw = (W - pl) / days.length;
  const y = (v: number) => pt + (H - pt - pb) * (1 - v / top);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-auto w-full" role="img" aria-label="Items done and planned per day, last 14 days">
      {[0, top / 2, top].map((v) => (
        <g key={v}><line x1={pl} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={pl - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--faint)" className="num">{v}</text></g>
      ))}
      {days.map((d, i) => {
        const x = pl + i * bw + bw * 0.22, w = bw * 0.56;
        return (
          <g key={d.d}>
            {d.total > 0 && <rect x={x} y={y(d.total)} width={w} height={y(0) - y(d.total)} rx="3" fill="var(--surface-2)" />}
            {d.done > 0 && <rect x={x} y={y(d.done)} width={w} height={y(0) - y(d.done)} rx="3" fill={d.done >= d.total ? "var(--good)" : "var(--accent)"} />}
            <text x={x + w / 2} y={H - 6} textAnchor="middle" fontSize="10" fill={d.d === t ? "var(--ink)" : "var(--faint)"} fontWeight={d.d === t ? 600 : 400}>{new Date(d.d + "T12:00:00").getDate()}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Funnel({ counts }: { counts: Record<string, number> }) {
  const stages = STAGES.filter((s) => s !== "Parked");
  const max = Math.max(1, ...stages.map((s) => counts[s] ?? 0));
  return (
    <ul className="mt-4 flex flex-col gap-2">
      {stages.map((s) => (
        <li key={s} className="grid grid-cols-[110px_1fr_28px] items-center gap-2 text-[12px]">
          <span className="truncate text-ink-2">{s}</span>
          <span className="h-[8px] rounded-full bg-surface-2"><span className="block h-full rounded-full" style={{ width: `${((counts[s] ?? 0) / max) * 100}%`, background: s === "Call booked" || s === "Won" ? "var(--good)" : "var(--accent)" }} /></span>
          <span className="num text-right text-muted">{counts[s] ?? 0}</span>
        </li>
      ))}
    </ul>
  );
}
