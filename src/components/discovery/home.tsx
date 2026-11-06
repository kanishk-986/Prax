"use client";
import { KpiTiles } from "@/components/shell";
import { type Finding, BANDS, PACK_LABEL, daysBetween } from "@/lib/discovery";
import { BandPill, type Data, type Run } from "./shared";

export type Deadline = { id: string; title: string; due: number; kind: string; finding: Finding };

/** Home: the week's counts by band, fast response, top findings, coming deadlines and coverage of the last run. */
export function HomeTab({ d, today, go, openFinding, sendFast, planDeadline, openRun, remind, reminded, lastAi, lastCrawl }: {
  d: Data; today: string; go: (tab: string, band?: string) => void; openFinding: (f: Finding) => void; sendFast: (f: Finding) => void; planDeadline: (x: Deadline) => void;
  openRun: () => void; remind: () => void; reminded: boolean; lastAi: Run | null; lastCrawl: Run | null;
}) {
  const live = d.findings.filter((f) => f.status !== "dismissed" && daysBetween(f.found_at.slice(0, 10), today) <= 7);
  const count = (b: string) => live.filter((f) => d.band(f) === b).length;
  const fast = live.filter((f) => f.source_type === "Regulator" && f.opp?.kind !== "sales" && f.confirmed && f.published && daysBetween(f.published, today) <= 3 && d.band(f) !== "Dropped");
  const top = [...live].filter((f) => d.band(f) !== "Dropped").sort((a, b) => d.total(b) - d.total(a)).slice(0, 3);
  const deadlines: Deadline[] = d.findings.filter((f) => f.status !== "dismissed" && typeof f.opp?.due === "number" && f.opp.due! <= 45 && f.opp.kind === "pitch")
    .map((f) => ({ id: f.id, title: f.title, due: Math.max(0, f.opp.due! - daysBetween(f.found_at.slice(0, 10), today)), kind: f.opp.kind ?? "", finding: f })).sort((a, b) => a.due - b.due).slice(0, 5);
  const topics = d.digest.top.length + d.digest.list.length;

  // Coverage: every pass reports, even when it finds nothing. Blocked is not the same as empty.
  const packs = ["pillar", "entity", "event", "gap", "custom"] as const;
  const aiRows = packs.map((p) => {
    const rows = (lastAi?.log ?? []).filter((r) => r.pack === p);
    return { name: PACK_LABEL[p], ran: rows.length, ok: rows.filter((r) => (r.cited ?? 0) > 0).length, empty: rows.filter((r) => !r.error && !(r.cited ?? 0)).length, blocked: rows.filter((r) => r.error).length, gated: 0 };
  }).filter((r) => r.ran);
  const cl = lastCrawl?.stats ?? {};
  const coverage = [...aiRows, ...(lastCrawl ? [{ name: "Link lists", ran: cl.links ?? 0, ok: cl.read ?? 0, empty: cl.failed ?? 0, blocked: cl.blocked ?? 0, gated: cl.gated ?? 0 }] : [])];
  const flow = [
    { n: "1", step: "Run", title: "AI search and Crawl", sub: `${lastAi ? lastAi.stats.searches ?? 0 : 0} AI searches on your keys last run, and ${d.links.length} links in your lists read on the server.`, tab: "ai" },
    { n: "2", step: "Findings", title: `${live.length} articles`, sub: "Each one scored on seven measures, with where it was found.", tab: "findings" },
    { n: "3", step: "Digest", title: `${topics} priority topics`, sub: "Articles merged into topics and ranked, plus speaking, press and sales.", tab: "digest" },
  ];
  const weekDone = !!lastAi && daysBetween(lastAi.started_at.slice(0, 10), today) < 7;

  return (
    <div className="anim-rise flex flex-col gap-4">
      <div data-tour="flow" className="grid gap-2.5 rounded-2xl sm:grid-cols-3">
        {flow.map((f, i) => {
          const last = i === 2;
          return (
            <button key={f.n} type="button" onClick={() => go(f.tab)} className="flex flex-col items-start gap-1.5 rounded-[14px] border px-4 py-3.5 text-left transition-colors hover:border-ink" style={{ background: last ? "#d64545" : "#fff", color: last ? "#fff" : "#141414", borderColor: last ? "#d64545" : "#e8e8e8" }}>
              <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[.05em]"><span className="num grid h-5 w-5 place-items-center rounded-full text-[11px]" style={{ background: last ? "#fff" : "#d64545", color: last ? "#d64545" : "#fff" }}>{f.n}</span>{f.step}</span>
              <span className="text-[15px] font-[650]">{f.title}</span><span className="text-[12.5px] leading-snug opacity-80">{f.sub}</span>
            </button>
          );
        })}
      </div>
      <KpiTiles tour="counts" items={BANDS.map((b, i) => ({ label: b, value: count(b), sub: ["ideas for Content Studio", "for Comment Studio", "kept, not routed", "old, weak or excluded"][i], onClick: () => go("findings", b) }))} />
      <section data-tour="fast" className="flex flex-col gap-2.5 rounded-2xl bg-[#141414] px-[18px] py-4 text-white">
        <span className="flex flex-wrap items-center justify-between gap-2.5"><span className="text-[12px] font-semibold uppercase tracking-[.06em] text-[#ff8a80]">Fast response · regulators, last 72 hours</span><span className="text-[12px] text-[#cfcfcf]">Draft within 48 hours for approval</span></span>
        {fast.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-2.5">
            <button type="button" className="flex min-w-0 flex-1 basis-[240px] flex-col gap-0.5 text-left" onClick={() => openFinding(f)}><span className="text-[14px] font-semibold leading-snug">{f.title}</span><span className="text-[12px] text-[#cfcfcf]">{f.publisher} · score {d.total(f)}</span></button>
            {d.editable && <button type="button" className="btn btn-primary h-8 shrink-0" disabled={f.status === "sent"} onClick={() => sendFast(f)}>{f.status === "sent" ? "Sent" : "Fast response"}</button>}
          </div>
        ))}
        {!fast.length && <p className="m-0 border-t border-white/10 pt-2.5 text-[13px] text-[#cfcfcf]">None. No regulator news with a confirmed date in the last 72 hours.</p>}
      </section>
      <div className="flex flex-wrap items-stretch gap-4">
        <section className="flex min-w-0 flex-[3_1_520px] flex-col gap-2.5">
          <span className="label text-ink">Top findings this week</span>
          {top.map((f) => (
            <button key={f.id} type="button" onClick={() => openFinding(f)} className="flex w-full items-center gap-3.5 rounded-[14px] border border-line bg-white px-4 py-3.5 text-left transition-colors hover:border-ink">
              <span className="num grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#141414] text-[15px] text-white">{d.total(f)}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-[14px] font-semibold leading-snug">{f.title}</span><span className="line-clamp-2 text-[12.5px] text-muted">{f.why || `${f.publisher} · ${f.pillar || "No pillar yet"}`}</span><span className="mt-1 sm:hidden"><BandPill b={d.band(f)} /></span></span>
              <span className="hidden sm:inline-flex"><BandPill b={d.band(f)} /></span>
            </button>
          ))}
          {!top.length && <p className="m-0 rounded-[14px] border border-dashed border-line-strong bg-white p-5 text-center text-[13px] text-muted">No findings yet. Run discovery to see this week&apos;s findings.</p>}
          <div data-tour="upcoming" className="flex-1 overflow-hidden rounded-2xl border border-line bg-white">
            <div className="px-[18px] py-3.5"><div className="font-semibold">Coming up</div><div className="mt-0.5 text-[12.5px] text-muted">Deadlines and events found in this week&apos;s items.</div></div>
            {deadlines.map((u) => {
              const day = new Date(Date.parse(today + "T12:00:00") + u.due * 864e5);
              return (
                <div key={u.id} className="flex flex-wrap items-center gap-3 border-t border-[#ececec] px-[18px] py-2.5">
                  <span className="num w-[46px] shrink-0 text-center text-[12px] leading-tight"><b className="block text-[16px]">{day.getDate()}</b>{day.toLocaleDateString("en-GB", { month: "short" })}</span>
                  <span className="min-w-0 flex-1 basis-[160px] text-[13px] leading-snug">{u.title}</span>
                  {d.editable && <button type="button" className="btn h-[30px] shrink-0 px-2.5 text-[12px]" disabled={u.finding.status === "sent"} onClick={() => planDeadline(u)}>{u.finding.status === "sent" ? "Planned" : "Plan a post"}</button>}
                </div>
              );
            })}
            {!deadlines.length && <p className="m-0 border-t border-[#ececec] px-[18px] py-4 text-[13px] text-muted">None found yet.</p>}
          </div>
        </section>
        <aside className="flex min-w-0 flex-[2_1_320px] flex-col gap-4">
          <div data-tour="coverage" className="overflow-hidden rounded-2xl border border-line bg-white">
            <div className="px-[18px] py-3.5"><div className="font-semibold">Coverage, last run</div><div className="mt-0.5 text-[12.5px] text-muted">Every pass reports, even when it finds nothing. Blocked is not the same as empty.</div></div>
            {coverage.map((p) => (
              <div key={p.name} className="grid grid-cols-[minmax(0,1fr)_repeat(4,auto)] items-center gap-x-3 gap-y-1 border-t border-[#ececec] px-[18px] py-2.5 text-[12.5px]">
                <span className="truncate font-semibold">{p.name}</span><span className="whitespace-nowrap">{p.ok} ok</span><span className="whitespace-nowrap text-muted">{p.empty} empty</span><span className="whitespace-nowrap text-[#d64545]">{p.blocked} blocked</span><span className="whitespace-nowrap text-[#9e1c1c]">{p.gated} gated</span>
              </div>
            ))}
            {!coverage.length && <p className="m-0 border-t border-[#ececec] px-[18px] py-4 text-[13px] text-muted">No run yet.</p>}
          </div>
          <div className="flex flex-1 flex-col gap-2.5 rounded-2xl border-2 border-[#d64545] bg-white p-[18px]">
            <span className="font-[650]">{weekDone ? "This week's run is done" : "Weekly run due"}</span>
            <span className="text-[12.5px] leading-relaxed text-muted">Crawl runs on the Prax server every {d.settings.run_day}. AI search runs in this browser with your keys, over the last {d.settings.window_days === 3 ? "72 hours" : "7 days"}, so Today reminds you when the week is up.</span>
            {d.editable && <span className="flex flex-wrap gap-2"><button type="button" className="btn btn-primary h-[34px]" onClick={openRun}>Run now</button><button type="button" className="btn h-[34px]" disabled={reminded} onClick={remind}>{reminded ? "On Today" : "Remind me on Today"}</button></span>}
          </div>
        </aside>
      </div>
    </div>
  );
}
