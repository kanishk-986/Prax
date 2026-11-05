"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase/client";

/** Rows of one table for this workspace, kept live through Supabase Realtime. */
export function useLive<T = Record<string, unknown>>(table: string, wsId: string, opts: { order?: string; asc?: boolean; filter?: (q: any) => any } = {}) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    let q = supabase().from(table).select("*").eq("workspace_id", wsId);
    if (optsRef.current.filter) q = optsRef.current.filter(q);
    if (optsRef.current.order) q = q.order(optsRef.current.order, { ascending: optsRef.current.asc ?? true });
    const { data } = await q;
    setRows((data as T[]) ?? []);
    setLoading(false);
  }, [table, wsId]);

  useEffect(() => {
    load();
    const ch = supabase()
      .channel(`${table}:${wsId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter: `workspace_id=eq.${wsId}` }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(load, 150);
      })
      .subscribe();
    return () => { supabase().removeChannel(ch); };
  }, [table, wsId, load]);

  return { rows, setRows, loading, reload: load };
}
