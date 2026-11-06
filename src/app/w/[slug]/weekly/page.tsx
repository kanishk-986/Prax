"use client";
// Weekly report (D10): this week by default, ?week=YYYY-MM-DD for another. Rows come from src/lib/weekly-data.ts,
// the same loader the profiles overview uses; the AI citations number follows the tracked profile in view there.
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useWorkspace, today as todayOf, weekStart, addDays, fmtDay } from "@/lib/workspace";
import { useCitationProfile } from "@/lib/citation-profile";
import { fullNameOf } from "@/lib/persona";
import { loadWeek } from "@/lib/weekly-data";
import type { WeekReport } from "@/lib/weekly";
import { WeeklyScreen } from "@/components/weekly/weekly-screen";

export default function WeeklyPage() {
  const { ws } = useWorkspace();
  const router = useRouter();
  const params = useSearchParams();
  const t = todayOf(), thisWeek = weekStart(t);
  const asked = params.get("week");
  const wk = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked <= t ? weekStart(asked) : thisWeek;
  const cit = useCitationProfile();
  const [report, setReport] = useState<{ week: string; r: WeekReport } | null>(null);
  useEffect(() => {
    if (!cit.ready) return;
    let live = true;
    loadWeek(supabase(), ws, wk, t, cit.scope).then((r) => { if (live) setReport({ week: wk, r }); });
    return () => { live = false; };
  }, [ws, wk, t, cit.ready, cit.scope]);
  const go = (dir: -1 | 1) => {
    const next = addDays(wk, dir * 7);
    router.push(next >= thisWeek ? `/w/${ws.slug}/weekly` : `/w/${ws.slug}/weekly?week=${next}`);
  };
  return <WeeklyScreen report={report?.week === wk ? report.r : null} loading={report?.week !== wk} name={fullNameOf(ws)} base={`/w/${ws.slug}`}
    prepared={fmtDay(t, { day: "numeric", month: "long", year: "numeric" })} onWeek={go} canNext={wk < thisWeek} />;
}
