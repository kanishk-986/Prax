"use client";
// Monday review (I2): last week by default, ?week=YYYY-MM-DD for an earlier one. Rows come from src/lib/review-data.ts,
// the review from src/lib/review.ts, and the active strategy adds its goal and actions to next week's plan.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useWorkspace, today as todayOf, addDays } from "@/lib/workspace";
import { useCitationProfile } from "@/lib/citation-profile";
import { useActiveStrategy } from "@/components/strategy/data";
import { commentTarget } from "@/lib/strategy";
import { buildReview, reviewWeek } from "@/lib/review";
import { loadReview, type ReviewData } from "@/lib/review-data";
import { ReviewScreen, type ReviewApi } from "@/components/weekly/review-screen";

export default function ReviewPage() {
  const { ws, can } = useWorkspace();
  const router = useRouter();
  const params = useSearchParams();
  const t = todayOf();
  const latest = reviewWeek(t, null);
  const wk = reviewWeek(t, params.get("week"));
  const cit = useCitationProfile();
  const strat = useActiveStrategy();
  const [data, setData] = useState<{ week: string; d: ReviewData } | null>(null);
  const load = useCallback(() => {
    if (!cit.ready) return () => {};
    let live = true;
    loadReview(supabase(), ws, wk, t, cit.scope).then((d) => { if (live) setData({ week: wk, d }); });
    return () => { live = false; };
  }, [ws, wk, t, cit.ready, cit.scope]);
  useEffect(() => load(), [load]);

  const d = data?.week === wk ? data.d : null;
  const review = useMemo(() => {
    if (!d || !strat.ready) return null;
    const actions = strat.nodes.filter((n) => n.type === "action").map((n) => ({ id: n.id, title: n.title }));
    return buildReview({ ...d.input, commentTarget: commentTarget(strat.goal, ws.quotas.comment), strategy: { comments_week: strat.goal?.comments_week ?? null, actions, ppw: d.ppw } });
  }, [d, strat.ready, strat.nodes, strat.goal, ws.quotas.comment]);

  const api: ReviewApi = useMemo(() => ({
    async save(v) {
      const { error } = await supabase().from("weekly_reviews").upsert({ workspace_id: ws.id, week: wk, ...v }, { onConflict: "workspace_id,week" });
      if (!error) load();
      return error ? error.message : null;
    },
    async tickLast(plan) {
      const { error } = await supabase().from("weekly_reviews").update({ plan }).eq("workspace_id", ws.id).eq("week", addDays(wk, -7));
      if (!error) load();
      return error ? error.message : null;
    },
  }), [ws.id, wk, load]);

  const go = (dir: -1 | 1) => {
    const next = addDays(wk, dir * 7);
    router.push(next >= latest ? `/w/${ws.slug}/review` : `/w/${ws.slug}/review?week=${next}`);
  };
  return <ReviewScreen week={wk} review={review} loading={!d || !review} saved={d?.saved ?? null} last={d?.last ? { week: d.last.week, plan: d.last.plan } : null}
    past={d?.past ?? []} base={`/w/${ws.slug}`} canEdit={can("editor")} missing={!!d?.missing} onWeek={go} canNext={wk < latest} api={api} />;
}
