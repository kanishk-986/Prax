"use client";
// Everything a Connections screen needs, live: which tools have a key in this browser (from the extension, never the
// key), the profile's routes and caps (connection_settings, db/032), and usage from ext_usage and humanize_usage
// tagged by job and section. Before db/032 runs the routes are the defaults and saving says to run it.
import { useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useWorkspace, addDays, today, ymd } from "@/lib/workspace";
import { useExtension, LATEST_EXT, type ExtStatus } from "@/lib/bridge";
import { useHumanizeSettings } from "@/components/humanize/use-humanize";
import {
  TOOLS, JOBS, mergeConnSettings, routeFor, jobsUsing, cardState, eventsOf, filterEvents, totalsOf, capState, keyTool,
  type ExtUsageRow, type HumanizeRow, type JobId, type Route, type Settings, type Cap, type Tool,
} from "@/lib/connections";

type Row = { workspace_id: string; routes: unknown; caps: unknown; advanced: unknown };
export type Conn = ReturnType<typeof useConnections>;

/** Whether a tool has a key in this browser, by the extension's own answer. Older extensions only know the older slots. */
export function hasKey(status: ExtStatus | null, id: string): boolean {
  if (!status?.installed) return false;
  const k = keyTool(id);
  if (status.tools && k in status.tools) return !!status.tools[k];
  if (k === "pangram" || k === "walter") return !!status.checkerKeys?.[k];
  if (k === "serpapi") return !!status.searchKeys?.google_ai;
  if (status.searchKeys && k in status.searchKeys) return !!status.searchKeys[k];
  return !!status.hasKey && (status.provider || "claude") === k;
}

export function useConnections(opts: { usage?: boolean } = {}) {
  const withUsage = opts.usage !== false;
  const { ws, can } = useWorkspace();
  const { status, send } = useExtension();
  const row = useLive<Row>("connection_settings", ws.id);
  const ext = useLive<ExtUsageRow>("ext_usage", ws.id, { order: "at", asc: false, skip: !withUsage, filter: (q) => q.gte("at", addDays(today(), -95)) });
  const hum = useLive<HumanizeRow>("humanize_usage", ws.id, { skip: !withUsage, filter: (q) => q.gte("day", addDays(today(), -95)) });
  const humanize = useHumanizeSettings();
  const settings: Settings = useMemo(() => mergeConnSettings(row.rows[0]), [row.rows]);
  const missing = row.error;
  const writer = status?.provider || "claude";
  const month = ymd(new Date()).slice(0, 7);
  const events = useMemo(() => eventsOf(ext.rows, hum.rows), [ext.rows, hum.rows]);
  const monthEvents = useMemo(() => filterEvents(events, { month }), [events, month]);
  const citationEngines = useMemo(() => ["claude", "openai", "gemini", "perplexity", "google_ai", "copilot"].filter((e) => status?.searchKeys?.[e]), [status]);

  const connected = useCallback((id: string) => hasKey(status, id), [status]);
  const route = useCallback((job: JobId): Route => routeFor(job, settings.routes, writer), [settings.routes, writer]);
  const usedBy = useCallback((id: string) => jobsUsing(id, settings.routes, writer, citationEngines), [settings.routes, writer, citationEngines]);
  const state = useCallback((t: Tool) => cardState(t, connected(t.id), connected(t.id) ? usedBy(t.id) : []), [connected, usedBy]);
  const month_ = useCallback((id: string) => totalsOf(filterEvents(monthEvents, { tool: id })), [monthEvents]);
  /** The cap that applies: Pangram and Walter keep their word caps in Settings, Humanization (db/031). */
  const capOf = useCallback((id: string): Cap | undefined => {
    if (id === "pangram") return humanize.settings.pangram_cap ? { limit: humanize.settings.pangram_cap, unit: "words" } : undefined;
    if (id === "walter") return humanize.settings.walter_cap ? { limit: humanize.settings.walter_cap, unit: "words" } : undefined;
    return settings.caps[id];
  }, [settings.caps, humanize.settings]);
  const cap = useCallback((id: string) => capState(capOf(id), month_(id)), [capOf, month_]);

  /** Saves part of the settings; returns the previous value for Undo. */
  const save = useCallback(async (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    const { error } = await supabase().from("connection_settings").upsert({ workspace_id: ws.id, routes: next.routes, caps: next.caps, advanced: next.advanced });
    if (error) throw new Error(/connection_settings/.test(error.message) ? "Run db/032_connections.sql in Supabase first." : error.message);
    return settings;
  }, [settings, ws.id]);
  const saveHumanizeCap = useCallback(async (id: "pangram" | "walter", limit: number) => {
    const { error } = await supabase().from("humanize_settings").upsert({ workspace_id: ws.id, ...humanize.settings, [`${id}_cap`]: Math.max(0, Math.round(limit)), updated_at: new Date().toISOString() });
    if (error) throw new Error(/humanize_settings/.test(error.message) ? "Run db/031_humanize.sql in Supabase first." : error.message);
    humanize.reload();
  }, [ws.id, humanize]);

  const warnings = useMemo(() => {
    const out: { tool: string; text: string; level: "warn" | "stop" | "info" }[] = [];
    for (const t of TOOLS) {
      const c = cap(t.id);
      if (c.state === "warn" || c.state === "stop") out.push({ tool: t.id, level: c.state, text: c.state === "stop" ? `${t.name} has reached its monthly cap. Paid calls stopped.` : `${t.name} is at ${Math.round((c.pct ?? 0) * 100)}% of its monthly cap.` });
    }
    if (status?.installed) for (const j of JOBS) {
      if (!j.routed) continue;
      const r = route(j.id);
      const okP = r.primary.startsWith("prax_") || connected(r.primary), okF = !r.fallback || r.fallback.startsWith("prax_") || connected(r.fallback);
      if (!okP && j.id !== "discovery_search") out.push({ tool: r.primary, level: "info", text: `${j.name} is routed to ${TOOLS.find((t) => t.id === r.primary)?.name ?? r.primary}, which has no key in this browser.` });
      else if (!okF) out.push({ tool: r.fallback, level: "info", text: `The fallback for ${j.name.toLowerCase()} has no key in this browser.` });
    }
    if (status?.installed && status.version !== LATEST_EXT) out.push({ tool: "", level: "info", text: `Prax for Chrome ${status.version} is older than ${LATEST_EXT}. Update it to use every tool here.` });
    return out;
  }, [cap, status, route, connected]);

  return {
    status, send, settings, missing, loading: row.loading || status === null, usageLoading: ext.loading || hum.loading, usageError: ext.error,
    editor: can("editor"), owner: can("owner"), events, monthEvents, month, writer,
    connected, route, usedBy, state, monthTotals: month_, cap, capOf, save, saveHumanizeCap, warnings, humanize: humanize.settings,
    reloadUsage: () => { ext.reload(); hum.reload(); },
  };
}
