"use client";
import { KpiTiles, NotStarted, NeedsYou } from "@/components/shell";
import { type Finding, BANDS, PACK_LABEL, daysBetween } from "@/lib/discovery";
import { BandPill, type Data, type Run } from "./shared";

export type Deadline = { id: string; title: string; due: number; kind: string; finding: Finding };

/** Home: the week's counts by band, fast response, top findings, coming deadlines and coverage of the last run. */
export type News = { finding: Finding; prospect: { id: string; name: string; company: string } };

export function HomeTab({ d, today, go, openFinding, sendFast, planDeadline, remind, reminded, lastAi, lastCrawl, news = [], slug = "" }: {
  d: Data; today: string; go: (tab: string, band?: string) => void; openFinding: (f: Finding) => void; sendFast: (f: Finding) => void; planDeadline: (x: Deadline) => void;
  openRun: () => void; remind: () => void; reminded: boolean; lastAi: Run | null; lastCrawl: Run | null; news?: News[]; slug?: string;
}) {
  const live = d.findings.filter((f) => f.status !== "dismissed" && daysBetween(f.found_at.slice(0, 10), today) <= 7);
  const count = (b: string) => live.filter((f) => d.band(f) === b).length;
  const fast = live.filter((f) => f.source_type === "Regulator" && f.opp?.kind !== "sales" && f.confirmed && f.published && daysBetween(f.published, today) <= 3 && d.band(f) !== "Dropped");
  const top = [...live].filter((f) => d.band(f) !== "Dropped").sort((a, b) => d.total(b) - d.total(a)).slice(0, 3);
  const deadlines: Deadline[] = d.findings.filter((f) => f.status !== "dismissed" && typeof f.opp?.due === "number" && f.opp.due! <= 45 && f.opp.kind === "pitch")
    .map((f) => ({ id: f.id, title: f.title, due: Math.max(0, f.opp.due! - daysBetween(f.found_at.slice(0, 10), today)), kind: f.opp.kind ?? "", finding: f })).sort((a, b) => a.due - b.due).slice(0, 5);


  // Coverage: every pass reports, even when it finds nothing. Blocked is not the same as empty.
  const packs = ["pillar", "entity", "event", "gap", "custom"] as const;
  const aiRows = packs.map((p) => {
    const rows = (lastAi?.log ?? []).filter((r) => r.pack === p);
    return { name: PACK_LABEL[p], ran: rows.length, ok: rows.filter((r) => (r.cited ?? 0) > 0).length, empty: rows.filter((r) => !r.error && !(r.cited ?? 0)).length, blocked: rows.filter((r) => r.error).length, gated: 0 };
  }).filter((r) => r.ran);
  const cl = lastCrawl?.stats ?? {};
  const coverage = [...aiRows, ...(lastCrawl ? [{ name: "Link lists", ran: cl.links ?? 0, ok: cl.read ?? 0, empty: cl.failed ?? 0, blocked: cl.blocked ?? 0, gated: cl.gated ?? 0 }] : [])];
  const weekDone = !!lastAi && daysBetween(lastAi.started_at.slice(0, 10), today) < 7;
  const lastRun = [lastAi, lastCrawl].filter(Boolean).map((r) => r!.started_at).sort().pop();
  const runLine = `Last run: ${lastRun ? new Date(lastRun).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "never"}. Crawl runs on the Prax server every ${d.settings.run_day}; AI search runs in this browser with your keys${weekDone ? ", and this week's run is done." : "."}`;

  // Not started: no run and no findings. One sentence and the action in the header, no tiles of zeros.
  if (!lastRun && !d.findings.length) return (
    <div className="flex flex-col gap-4">
      <NotStarted tour="counts" title="Not started"
        body={<>Nothing has run yet. Discovery reads your link lists and searches the news with your AI keys, then scores every article on seven measures and ranks the week&apos;s topics in the Digest. Press Run discovery to start; {d.links.length ? `${d.links.length} links are ready in your lists.` : "add link lists in Sources first for the Crawl."}</>}
        action={d.editable && <button type="button" className="btn h-10 px-4" disabled={reminded} onClick={remind}>{reminded ? "On Today" : "Remind me on Today"}</button>} />
    </div>
  );

  return (
    <div className="anim-rise flex flex-col gap-4">
      <p data-tour="flow" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body text-muted">
        <span>{runLine}</span>
        {d.editable && !weekDone && <button type="button" className="font-medium text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink disabled:text-muted disabled:no-underline" disabled={reminded} onClick={remind}>{reminded ? "Reminder is on Today" : "Remind me on Today"}</button>}
      </p>
      <KpiTiles tour="counts" items={BANDS.map((b, i) => ({ label: b, value: count(b), sub: ["ideas for Content Studio", "for Comment Studio", "kept, not routed", "old, weak or excluded"][i], onClick: () => go("findings", b) }))} />
      {fast.length > 0 && (
        <section data-tour="fast" className="panel">
          <div className="panel-head"><span>Fast response: regulators, last 72 hours</span><span className="text-meta font-normal text-muted">Draft within 48 hours for approval</span></div>
          {fast.map((f) => (
            <div key={f.id} className="group flex flex-wrap items-center gap-3 border-t border-line px-[18px] py-3">
              <button type="button" className="flex min-w-0 flex-1 basis-[240px] flex-col gap-0.5 text-left" onClick={() => openFinding(f)}><span className="text-body font-semibold leading-snug">{f.title}</span><span className="text-meta text-muted">{f.publisher} · score {d.total(f)}</span></button>
              {d.editable && <button type="button" className="btn btn-quiet row-act h-8 shrink-0" disabled={f.status === "sent"} onClick={() => sendFast(f)}>{f.status === "sent" ? "Sent" : "Draft a fast response"}</button>}
            </div>
          ))}
        </section>
      )}
      <div className="flex flex-wrap items-stretch gap-4">
        <section className="flex min-w-0 flex-[3_1_520px] flex-col gap-2.5">
          <h2 className="text-body font-semibold">Top findings this week</h2>
          {top.map((f) => (
            <button key={f.id} type="button" onClick={() => openFinding(f)} className="flex w-full items-center gap-3.5 rounded-xl border border-line bg-white px-4 py-3.5 text-left transition-colors hover:border-stroke">
              <span className="num grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-2 text-body font-semibold text-ink" aria-label={`Score ${d.total(f)}`}>{d.total(f)}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-body font-semibold leading-snug">{f.title}</span><span className="line-clamp-2 text-meta text-muted">{f.why || `${f.publisher} · ${f.pillar || "No pillar yet"}`}</span><span className="mt-1 sm:hidden"><BandPill b={d.band(f)} /></span></span>
              <span className="hidden sm:inline-flex"><BandPill b={d.band(f)} /></span>
            </button>
          ))}
          {!top.length && <p className="m-0 rounded-xl border border-line bg-white p-5 text-body text-muted">No findings this week. The last run found nothing new in the window.</p>}
          <div data-tour="upcoming" className="panel flex-1">
            <div className="px-[18px] py-3.5"><h2 className="text-body font-semibold">Coming up</h2><div className="mt-0.5 text-meta text-muted">Deadlines and events found in this week&apos;s items.</div></div>
            {deadlines.map((u) => {
              const day = new Date(Date.parse(today + "T12:00:00") + u.due * 864e5);
              return (
                <div key={u.id} className="flex flex-wrap items-center gap-3 border-t border-[#ececec] px-[18px] py-2.5">
                  <span className="num w-[46px] shrink-0 text-center text-meta leading-tight"><b className="block text-title">{day.getDate()}</b>{day.toLocaleDateString("en-GB", { month: "short" })}</span>
                  <span className="min-w-0 flex-1 basis-[160px] text-body leading-snug">{u.title}</span>
                  {d.editable && <button type="button" className="btn h-[30px] shrink-0 px-2.5 text-meta" disabled={u.finding.status === "sent"} onClick={() => planDeadline(u)}>{u.finding.status === "sent" ? "Planned" : "Plan a post"}</button>}
                </div>
              );
            })}
            {!deadlines.length && <p className="m-0 border-t border-[#ececec] px-[18px] py-4 text-body text-muted">None found yet.</p>}
          </div>
        </section>
        <aside className="flex min-w-0 flex-[2_1_320px] flex-col gap-4">
          {/* DS16: a target account in the news. The dated note is already on the prospect in Pipeline. */}
          <NeedsYou tour="news" title="Needs you" empty="No target account in the news in the last 14 days."
            items={news.slice(0, 5).map((x) => ({ title: `${x.prospect.company} is in the news`, sub: `${x.finding.title} · note added to ${x.prospect.name} in Pipeline`, cta: "Open", href: `/w/${slug}/pipeline?p=${x.prospect.id}`, tone: "red" as const, when: new Date(x.finding.found_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) }))}
            count={news.length} />
          <div data-tour="coverage" className="panel">
            <div className="px-[18px] py-3.5"><h2 className="text-body font-semibold">Coverage, last run</h2><div className="mt-0.5 text-meta text-muted">Every pass reports, even when it finds nothing. Blocked is not the same as empty.</div></div>
            {coverage.map((p) => (
              <div key={p.name} className="grid grid-cols-[minmax(0,1fr)_repeat(4,auto)] items-center gap-x-3 gap-y-1 border-t border-[#ececec] px-[18px] py-2.5 text-meta">
                <span className="truncate font-semibold">{p.name}</span><span className="whitespace-nowrap">{p.ok} ok</span><span className="whitespace-nowrap text-muted">{p.empty} empty</span><span className="whitespace-nowrap text-dark-red">{p.blocked} blocked</span><span className="whitespace-nowrap text-[#9e1c1c]">{p.gated} gated</span>
              </div>
            ))}
            {!coverage.length && <p className="m-0 border-t border-[#ececec] px-[18px] py-4 text-body text-muted">No run yet.</p>}
          </div>

        </aside>
      </div>
    </div>
  );
}
