"use client";
// Strategy data for the canvas and for the sections it drives. The active strategy is read with useActiveStrategy;
// the settings it writes through to are read with useLiveSettings (workspaces, studio_settings, content_settings).
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useWorkspace, type Workspace } from "@/lib/workspace";
import { mergeWrites, cleanConfig, type LiveSettings, type Strategy, type StrategyNode, type Write, type GoalConfig, type LeadFacts } from "@/lib/strategy";

/** The profile's active strategy and its nodes; empty before db/021 or when none is active. */
export function useActiveStrategy() {
  const { ws } = useWorkspace();
  const s = useLive<Strategy>("strategies", ws.id, { filter: (q) => q.eq("status", "active") });
  const active = s.rows[0] ?? null;
  const n = useLive<StrategyNode>("strategy_nodes", ws.id, { filter: (q) => q.eq("strategy_id", active?.id ?? "00000000-0000-0000-0000-000000000000"), key: active?.id ?? "none", skip: !active });
  const nodes = useMemo(() => (active ? n.rows.filter((x) => x.strategy_id === active.id) : []), [active, n.rows]);
  const goal = useMemo(() => { const g = nodes.find((x) => x.type === "goal"); return g ? (cleanConfig("goal", g.config) as GoalConfig) : null; }, [nodes]);
  return { strategy: active, nodes, goal, ready: !s.loading && (!active || !n.loading) };
}

/** The settings the canvas reads and writes, from the profile and its Comment Studio and Content Studio rows. */
export function useLiveSettings() {
  const { ws } = useWorkspace();
  const [extra, setExtra] = useState<{ tuning: LiveSettings["tuning"]; safety: LiveSettings["safety"]; plan: LiveSettings["plan"] } | null>(null);
  const load = useCallback(async () => {
    const [st, cs] = await Promise.all([
      supabase().from("studio_settings").select("tuning,safety").eq("workspace_id", ws.id).maybeSingle(),
      supabase().from("content_settings").select("plan").eq("workspace_id", ws.id).maybeSingle(),
    ]);
    setExtra({ tuning: (st.data?.tuning ?? {}) as LiveSettings["tuning"], safety: (st.data?.safety ?? {}) as LiveSettings["safety"], plan: (cs.data?.plan ?? {}) as LiveSettings["plan"] });
  }, [ws.id]);
  useEffect(() => { load(); }, [load]);
  const s: LiveSettings | null = useMemo(() => (extra ? fromWorkspace(ws, extra) : null), [ws, extra]);
  return { s, reload: load, setExtra };
}
export const fromWorkspace = (ws: Workspace, extra: Pick<LiveSettings, "tuning" | "safety" | "plan">): LiveSettings => ({
  quotas: ws.quotas, pillars: ws.pillars ?? [], regions: ws.regions ?? [], segments: ws.segments ?? {}, segment_weights: ws.segment_weights ?? {}, voice: ws.voice ?? "", ...extra,
});

/** Write a set of settings changes; returns the first error, or null. */
export async function writeSettings(wsId: string, writes: Write[]): Promise<string | null> {
  for (const w of mergeWrites(writes)) {
    const res = w.table === "workspaces"
      ? await supabase().from("workspaces").update(w.patch).eq("id", wsId)
      : await supabase().from(w.table).upsert({ workspace_id: wsId, ...w.patch, updated_at: new Date().toISOString() });
    if (res.error) return res.error.message;
  }
  return null;
}

/** A lead as the rules engine sees it. Heat and the warm path come from Pipeline when it has them. */
export function leadFacts(l: { id: string; name: string; company?: string | null; segment?: string | null; region?: string | null; stage: string; next_date?: string | null; linkedin?: string | null },
  today: string, extra: { heat?: LeadFacts["heat"]; warm?: boolean } = {}): LeadFacts {
  return { id: l.id, name: l.name, company: l.company ?? "", segment: l.segment ?? "", region: l.region ?? "", stage: l.stage, overdue: !!l.next_date && l.next_date < today, linkedin: l.linkedin ?? "", ...extra };
}
