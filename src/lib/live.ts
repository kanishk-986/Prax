"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase/client";
import { WROTE } from "./writes";

/** Rows of one table for this workspace, kept live through Supabase Realtime. A change of `key` reloads (use it when
 *  `filter` depends on a value); `skip` waits without loading; `error` is true when the table could not be read. */
export function useLive<T = Record<string, unknown>>(table: string, wsId: string, opts: { order?: string; asc?: boolean; filter?: (q: any) => any; key?: string; skip?: boolean } = {}) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const key = opts.key ?? "", skip = !!opts.skip;

  const load = useCallback(async () => {
    if (skip) return;
    const n = ++seq.current;
    let q = supabase().from(table).select("*").eq("workspace_id", wsId);
    if (optsRef.current.filter) q = optsRef.current.filter(q);
    if (optsRef.current.order) q = q.order(optsRef.current.order, { ascending: optsRef.current.asc ?? true });
    const { data, error } = await q;
    if (n !== seq.current) return; // a newer load (another key) has started
    setRows((data as T[]) ?? []);
    setError(!!error);
    setLoading(false);
  }, [table, wsId, key, skip]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new key shows the loading state until its own rows arrive.
  useEffect(() => { if (key) setLoading(true); }, [key]);

  useEffect(() => {
    load();
    const ch = supabase()
      .channel(`${table}:${wsId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter: `workspace_id=eq.${wsId}` }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(load, 150);
      })
      .subscribe();
    // This browser's own writes reload at once, whether or not Realtime delivers them (it never delivers deletes here).
    const wrote = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== table) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(load, 150);
    };
    window.addEventListener(WROTE, wrote);
    return () => { supabase().removeChannel(ch); window.removeEventListener(WROTE, wrote); };
  }, [table, wsId, load]);

  return { rows, setRows, loading, error, reload: load };
}
