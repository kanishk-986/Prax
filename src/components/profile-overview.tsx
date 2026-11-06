// The multi-profile overview (D11): one compact row per live profile with this week's numbers and a way in.
// Numbers come from the weekly report's aggregation (src/lib/weekly.ts), so they match each profile's report.
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { DemoTag } from "./sidebar";
import type { OverviewRow } from "@/lib/weekly";
import type { ProfileRow } from "./profile-list";

const COLS = "md:grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,0.8fr))_20px]";

export function ProfileOverview({ list, stats }: { list: ProfileRow[]; stats: Record<string, OverviewRow | null> }) {
  return (
    <section className="panel" aria-label="This week across profiles">
      <div className={`hidden items-center gap-4 px-[18px] py-2.5 text-meta text-muted md:grid ${COLS}`} aria-hidden="true">
        <span>Profile</span><span className="text-right">Comments</span><span className="text-right">Posts</span><span className="text-right" title="People who moved into a conversation stage or sent a message this week">Conversations</span><span className="text-right">Overdue</span><span className="text-right">AI citations</span><span />
      </div>
      <ul className="list-none p-0">
        {list.map((w) => {
          const s = stats[w.id] ?? null;
          return (
            <li key={w.id}>
              <Link href={`/w/${w.slug}`} className={`group grid grid-cols-[minmax(0,1fr)_20px] items-center gap-x-4 gap-y-3 border-t border-line px-[18px] py-3.5 transition-colors hover:bg-[#fafafa] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:first:border-t md:py-3 ${COLS}`}>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-1.5"><span className="truncate text-body font-semibold">{w.name}</span>{w.is_demo && <DemoTag />}<span className="chip ml-1 shrink-0 capitalize">{w.role}</span></span>
                  <span className="truncate text-meta text-muted">{[w.headline, w.company].filter(Boolean).join(", ") || "LinkedIn profile"}</span>
                </span>
                <ChevronRight size={15} className="col-start-2 row-start-1 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink md:col-start-7" aria-hidden="true" />
                {s ? (
                  <dl className="col-span-2 grid grid-cols-3 gap-x-4 gap-y-2 md:contents">
                    <Num label="Comments" value={`${s.comments}`} of={s.commentTarget ? `of ${s.commentTarget}` : undefined} bar={s.commentTarget ? s.comments / s.commentTarget : undefined} />
                    <Num label="Posts" value={`${s.posts}`} />
                    <Num label="Conversations" value={`${s.conversations}`} />
                    <Num label="Overdue" value={`${s.overdue}`} alert={s.overdue > 0} />
                    <Num label="AI citations" value={s.citations == null ? "None" : `${s.citations}%`} quiet={s.citations == null} />
                  </dl>
                ) : <span className="col-span-2 text-meta text-muted md:col-span-5 md:text-right">This week&apos;s numbers could not be read.</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Num({ label, value, of, bar, alert, quiet }: { label: string; value: string; of?: string; bar?: number; alert?: boolean; quiet?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 md:items-end">
      <dt className="text-meta text-muted md:sr-only">{label}</dt>
      <dd className="flex items-baseline gap-1 md:justify-end">
        <span className={`num whitespace-nowrap ${quiet ? "text-body text-muted" : "text-title font-semibold"} ${alert ? "text-dark-red" : ""}`}>{value}</span>
        {of && <span className="num whitespace-nowrap text-meta text-muted">{of}</span>}
      </dd>
      {bar != null && <span aria-hidden="true" className="mt-1 h-[3px] w-full max-w-[64px] md:self-end overflow-hidden rounded-full bg-track"><span className="block h-full rounded-full bg-ink" style={{ width: `${Math.min(100, Math.round(bar * 100))}%` }} /></span>}
    </div>
  );
}
