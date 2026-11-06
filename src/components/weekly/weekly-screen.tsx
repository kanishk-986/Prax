"use client";
// The weekly report (D10): one short page for the executive, on screen and as a PDF. Plain sentences first,
// the few names and numbers behind them second. The page loads the report; this only shows it.
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Section, type TourStep } from "@/components/shell";
import { buildPdf, downloadFile, type PdfDoc } from "@/lib/pdf";
import { weekRange, type WeekReport } from "@/lib/weekly";

const fmt = (d: string, o: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", o);

const tour: TourStep[] = [
  { target: "header", title: "What the weekly report is for", body: "One page on the week for the profile owner: what went out, who engaged, who moved, how AI answers moved, and next week's plan." },
  { target: "weekly-summary", title: "The week in three sentences", body: "Read this first. Each section below gives the names and numbers behind it." },
  { target: "weekly-figures", title: "The numbers behind it", body: "Each section holds the figures and names behind the summary, counted Monday to Sunday. Open the section to act on it." },
  { target: "weekly-next", title: "Next week", body: "Posts planned in Content Studio, follow-ups due in Pipeline and the focus from Strategy." },
];

export function reportPdf(r: WeekReport, name: string, prepared: string): PdfDoc {
  const range = weekRange(r.week);
  return {
    kicker: "WEEKLY REPORT", title: `${name}, ${range}`, subtitle: r.summary,
    coverMeta: [["Profile", name], ["Week", range], ["Prepared", prepared]],
    footer: `Prax weekly report. ${name}, ${range}.`,
    coverNote: "Prepared in Prax from the work logged during the week. Confidential.",
    sections: [
      { title: "What went out", lead: r.lines.out, paras: r.out.titles.length ? [`Posts: ${r.out.titles.join("; ")}.`] : [] },
      { title: "Who engaged", lead: r.lines.engaged },
      { title: "Who moved stage", lead: r.lines.moved, tables: r.moved.length ? [{ head: ["Person", "Company", "From", "To"], widths: [0.3, 0.3, 0.2, 0.2], rows: r.moved.map((m) => [m.name, m.company || "None", m.from || "New", m.to]) }] : [] },
      { title: "AI citations", lead: r.lines.citations },
      { title: "Discovery", lead: r.lines.topics },
      { title: "Next week", lead: r.lines.next, paras: [
        ...(r.next.posts.length ? [`Posts: ${r.next.posts.map((p) => `${p.title} (${fmt(p.date)})`).join("; ")}.`] : []),
        ...(r.next.names.length ? [`Follow-ups: ${r.next.names.join(", ")}${r.next.followups > r.next.names.length ? ` and ${r.next.followups - r.next.names.length} more` : ""}.`] : []),
      ] },
    ],
  };
}

export function WeeklyScreen({ report, loading, name, base, prepared, onWeek, canNext }: {
  report: WeekReport | null; loading: boolean; name: string; base: string; prepared: string; onWeek: (dir: -1 | 1) => void; canNext: boolean;
}) {
  const r = report;
  const range = r ? weekRange(r.week) : "";
  const pdf = () => { if (r) downloadFile(`Prax weekly report ${name} ${r.week}.pdf`, buildPdf(reportPdf(r, name, prepared)), "application/pdf"); };
  return (
    <Section id="weekly" title="Weekly report" status={r ? `${name}, ${range}${r.isCurrent ? ". This week so far." : "."}` : name} entryStatus={r?.summary} steps={tour}
      before={
        <span className="flex items-center gap-1">
          <button type="button" className="btn h-10 w-10 p-0" aria-label="Previous week" onClick={() => onWeek(-1)}><ChevronLeft size={16} /></button>
          <button type="button" className="btn h-10 w-10 p-0" aria-label="Next week" disabled={!canNext} onClick={() => onWeek(1)}><ChevronRight size={16} /></button>
        </span>
      }
      primary={<button type="button" className="btn btn-primary h-10 px-4" disabled={!r} onClick={pdf}><Download size={15} /><span className="hidden sm:inline">Download</span> PDF</button>}>
      {loading || !r ? <Skeleton /> : (
        <article className="panel mx-auto w-full max-w-[880px]">
          <div data-tour="weekly-summary" className="px-6 pb-6 pt-7 md:px-10 md:pt-9">
            <p className="text-meta font-medium text-muted">{range}</p>
            <p className="mt-2 max-w-[680px] text-title leading-[1.6] text-ink">{r.summary}</p>
          </div>
          <div className="flex flex-col border-t border-line px-6 md:px-10">
            <Part n={1} title="What went out" link={[`${base}/studio-content?tab=plan`, "Content Studio"]} tour="weekly-figures">
              <Figs items={[["Posts", r.out.posts], ["Comments", r.out.comments, r.out.commentTarget ? `of ${r.out.commentTarget}` : undefined], ["Requests", r.out.requests]]} />
              {r.out.titles.length > 0 && <ul className="list-none p-0">{r.out.titles.map((t) => <li key={t} className="text-body text-ink-2">{t}</li>)}</ul>}
            </Part>
            <Part n={2} title="Who engaged" link={[`${base}/inbox`, "Inbox"]}>
              <Figs items={[["Replies", r.engaged.replies], ["Messages", r.engaged.messages], ["Accepted", r.engaged.accepts]]} />
            </Part>
            <Part n={3} title="Who moved stage" line={r.moved.length ? r.lines.moved.split(":")[0] + "." : r.lines.moved} link={[`${base}/pipeline`, "Pipeline"]}>
              {r.moved.length > 0 && (
                <table className="w-full text-left text-body">
                  <thead className="sr-only"><tr><th>Person</th><th>Move</th></tr></thead>
                  <tbody>{r.moved.slice(0, 8).map((m) => (
                    <tr key={m.name + m.at} className="border-t border-line first:border-t-0">
                      <td className="py-2 pr-3 align-top"><span className="font-medium">{m.name}</span>{m.company && <span className="block text-meta text-muted sm:inline sm:text-body"><span className="hidden sm:inline">, </span>{m.company}</span>}</td>
                      <td className="py-2 text-right align-top text-meta text-muted"><span className="whitespace-nowrap">{m.from || "New"} to</span> <span className="whitespace-nowrap font-semibold text-ink">{m.to}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
              {r.moved.length > 8 && <p className="text-meta text-muted">{r.moved.length - 8} more in Pipeline.</p>}
            </Part>
            <Part n={4} title="AI citations" link={[`${base}/citations`, "AI citations"]} line={r.citations.now == null ? r.lines.citations : undefined}>
              {r.citations.now != null && <Figs items={[["This week", `${r.citations.now}%`, r.citations.total ? `${r.citations.named} of ${r.citations.total}` : undefined], ["Last week", r.citations.prev == null ? "None" : `${r.citations.prev}%`], ["Last 28 days", r.citations.share28 == null ? "None" : `${r.citations.share28}%`]]} />}
            </Part>
            <Part n={5} title="Discovery" link={[`${base}/discovery?tab=digest`, "Discovery Studio"]} line={r.topics.length ? undefined : r.lines.topics}>
              {r.topics.length > 0 && <ol className="flex list-none flex-col gap-1.5 p-0">{r.topics.map((t, i) => <li key={t} className="flex gap-3 text-body"><span className="num w-4 shrink-0 text-meta font-semibold leading-[22px] text-muted">{i + 1}</span>{t}</li>)}</ol>}
            </Part>
            <Part n={6} title="Next week" line={r.lines.next} tour="weekly-next" last>
              {r.next.posts.length > 0 && <div><p className="text-meta font-medium text-muted">Posts planned</p>
                <ul className="mt-1 list-none p-0">{r.next.posts.map((p) => <li key={p.title + p.date} className="flex items-baseline justify-between gap-4 py-0.5 text-body"><span className="min-w-0">{p.title}</span><span className="num shrink-0 whitespace-nowrap text-meta text-muted">{fmt(p.date)}</span></li>)}</ul></div>}
              {r.next.names.length > 0 && <div><p className="text-meta font-medium text-muted">Follow-ups due</p>
                <p className="mt-1 text-body">{r.next.names.join(", ")}{r.next.followups > r.next.names.length ? ` and ${r.next.followups - r.next.names.length} more` : ""}</p></div>}
            </Part>
          </div>
        </article>
      )}
    </Section>
  );
}

/** A row of two or three small figures inside a section. */
function Figs({ items }: { items: [string, number | string, string?][] }) {
  return (
    <dl className="grid grid-cols-3 gap-4">
      {items.map(([label, value, of]) => (
        <div key={label} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-meta text-muted">{label}</dt>
          <dd className="flex flex-wrap items-baseline gap-x-1"><span className={`num font-semibold tracking-[-0.02em] ${value === "None" ? "text-body text-muted" : "text-page"}`}>{value}</span>{of && <span className="num text-meta text-muted">{of}</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

function Part({ n, title, line, link, children, tour, last }: { n: number; title: string; line?: string; link?: [string, string]; children?: React.ReactNode; tour?: string; last?: boolean }) {
  return (
    <section data-tour={tour} className={`grid gap-2 py-6 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8 ${last ? "" : "border-b border-line"}`}>
      <h2 className="flex items-baseline gap-2.5 text-body font-semibold"><span className="num text-meta font-semibold text-accent">{String(n).padStart(2, "0")}</span>{title}</h2>
      <div className="flex min-w-0 flex-col gap-3">
        {line && <p className="max-w-[600px] text-body leading-[1.65] text-ink-2">{line}</p>}
        {children}
        {link && <Link href={link[0]} className="w-fit text-meta font-medium text-muted underline decoration-line-strong underline-offset-[3px] hover:text-ink hover:decoration-ink">Open {link[1]}</Link>}
      </div>
    </section>
  );
}

function Skeleton() {
  return (
    <div className="panel mx-auto flex w-full max-w-[880px] flex-col gap-4 p-8" aria-busy="true">
      <span className="h-3 w-40 animate-pulse rounded bg-track" /><span className="h-4 w-11/12 animate-pulse rounded bg-track" /><span className="h-4 w-3/4 animate-pulse rounded bg-track" />
      <span className="mt-4 h-16 w-full animate-pulse rounded bg-track" />
    </div>
  );
}
