"use client";
// The runs behind Discovery Studio. AI search goes page → extension → provider with the user's key and web
// search on; only sources the AI cites are kept, and each one's date is confirmed by reading the page on the
// server. Crawl asks the server to read each link of the lists, one call per link, so statuses land live.
// The AI check then rescores new findings on the rubric. Nothing here ever touches linkedin.com.
import { useCallback, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { askExtension, parseJSON } from "@/lib/bridge";
import { parseEngine, type Engine } from "@/lib/citations";
import { type Finding, type PlannedSearch, searchPrompt, parseSearchItems, ruleScore, sourceTypeOf, opportunityOf, scorePrompt, parseScores, linkKey, PACK_LABEL } from "@/lib/discovery";
import type { Link, LogRow } from "./shared";

// pillars, who ("Name, Role at Company"), geos and region come from the profile, see src/lib/persona.ts.
type Ctx = { wsId: string; today: string; windowDays: number; findings: Finding[]; competitors: string[]; targets: string[]; pillars: string[]; who: string; geos: string[]; region: string; buyers?: string[] };
const mentions = (text: string, names: string[]) => names.find((n) => n.length > 2 && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) ?? "";

export function useRunner(ctx: Ctx, toast: (t: string, undo?: () => void) => void) {
  const ref = useRef(ctx); ref.current = ctx;
  const stopAi = useRef(false), stopCrawl = useRef(false);
  const [ai, setAi] = useState<{ running: boolean; done: number; total: number; log: LogRow[]; phase: string }>({ running: false, done: 0, total: 0, log: [], phase: "" });
  const [crawl, setCrawl] = useState<{ running: boolean; done: number; total: number; status: Record<string, string> }>({ running: false, done: 0, total: 0, status: {} });
  const [scoring, setScoring] = useState(false);

  /** The AI check: rescore findings on the rubric with the main AI key, eight at a time. */
  const score = useCallback(async (rows?: Finding[]) => {
    const c = ref.current;
    const todo = (rows ?? c.findings.filter((f) => f.scored_by !== "ai")).filter((f) => f.status !== "dismissed").slice(0, 48);
    if (!todo.length) return 0;
    setScoring(true);
    let n = 0;
    try {
      for (let i = 0; i < todo.length; i += 8) {
        const batch = todo.slice(i, i + 8);
        const out = await askExtension<string>("ai", { plain: true, kind: "studio", rules: "You score news for a business leader's LinkedIn. Be strict and literal. Never invent facts.", user: scorePrompt(batch.map((f) => ({ id: f.id, title: f.title, publisher: f.publisher, date: f.confirmed ? f.published ?? "" : "", excerpt: f.excerpt })), c.pillars, c.who, c.geos, c.buyers) }, 120000);
        const got = parseScores(parseJSON(out), c.geos);
        for (const f of batch) {
          const s = got[f.id]; if (!s) continue;
          const orgs = [...new Set([...f.orgs, ...s.orgs])].slice(0, 10);
          await supabase().from("discovery_findings").update({ scores: s.scores, scored_by: "ai", pillar: c.pillars.includes(s.pillar) ? s.pillar : f.pillar, geo: s.geo || f.geo, service: s.service || f.service, kind: s.kind || f.kind, why: s.why, angle: s.angle, orgs, competitor: f.competitor || mentions(`${f.title} ${orgs.join(" ")}`, c.competitors), target: f.target || !!mentions(orgs.join(" "), c.targets) }).eq("id", f.id);
          n++;
        }
      }
    } catch (e) { toast(`The AI check stopped: ${(e as Error).message}`); }
    setScoring(false);
    return n;
  }, [toast]);

  const runAi = useCallback(async (plan: PlannedSearch[], engines: Engine[], trigger = "manual") => {
    if (!plan.length || !engines.length) return;
    const c = ref.current;
    stopAi.current = false;
    const queue = plan.flatMap((p) => engines.map((e) => ({ p, e })));
    const log: LogRow[] = queue.map(({ p, e }) => ({ id: `${p.id}:${e}`, q: p.query, pack: p.pack, engine: e }));
    setAi({ running: true, done: 0, total: queue.length, log, phase: "Searching" });
    const { data: run } = await supabase().from("discovery_runs").insert({ workspace_id: c.wsId, kind: "ai", trigger, window_days: c.windowDays }).select("id").single();
    const known = new Map(c.findings.map((f) => [linkKey(f.url), f]));
    const added: Finding[] = [];
    let done = 0;
    const one = async (i: number) => {
      const { p, e } = queue[i];
      const row = log[i];
      try {
        const res = await askExtension<{ model: string; raws: Record<string, unknown>[] }>("search", { engine: e, prompt: searchPrompt(p.query, c.windowDays, c.today, c.region), country: "" }, 240000);
        const parsed = parseEngine(e, res.raws);
        const { returned, items } = parseSearchItems(parsed.answer, parsed.sources);
        row.returned = returned; row.cited = items.length; row.confirmed = 0; row.urls = items.map((x) => x.url);
        for (const it of items.slice(0, 6)) {
          const page = await fetch("/api/discovery/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: it.url }) }).then((r) => r.json()).catch(() => ({}));
          if (page.confirmed) row.confirmed!++;
          const old = known.get(linkKey(it.url));
          const found = { engine: e, pack: PACK_LABEL[p.pack], query: p.query };
          if (old) {
            if (!old.found_by.includes("ai")) { await supabase().from("discovery_findings").update({ found_by: [...old.found_by, "ai"], found: { ...old.found, ai: found } }).eq("id", old.id); old.found_by = [...old.found_by, "ai"]; }
            continue;
          }
          const title = (page.title || it.title || it.url).slice(0, 300), excerpt = [it.summary, page.excerpt].filter(Boolean).join("\n\n").slice(0, 1800);
          const published = page.published || it.date || null, confirmed = !!page.confirmed;
          const st = sourceTypeOf(it.url), rs = ruleScore({ url: it.url, title, excerpt, published, confirmed, source_type: st }, c.today, c.pillars, c.buyers), opp = opportunityOf(title, excerpt, c.today);
          const orgs = it.orgs;
          const { data, error } = await supabase().from("discovery_findings").insert({
            workspace_id: c.wsId, run_id: run?.id ?? null, url: it.url, title, publisher: it.publisher || page.publisher || "", source_type: st, published, confirmed, excerpt,
            found_by: ["ai"], found: { ai: found }, scores: rs.scores, scored_by: "rules", pillar: rs.pillar, geo: rs.geo, service: rs.service, kind: rs.kind, orgs,
            competitor: mentions(`${title} ${orgs.join(" ")}`, c.competitors), target: !!mentions(orgs.join(" "), c.targets), gap: p.pack === "gap", opp: opp ?? {},
          }).select("*").single();
          if (!error && data) { known.set(linkKey(it.url), data as Finding); added.push(data as Finding); }
        }
      } catch (err) { row.error = (err as Error).message.slice(0, 200); }
      done++;
      setAi((s) => ({ ...s, done, log: [...log] }));
    };
    // Three at a time, so no provider is hit in a burst.
    let next = 0;
    await Promise.all([0, 1, 2].map(async () => { while (next < queue.length && !stopAi.current) await one(next++); }));
    const stats = { searches: done, results: log.reduce((a, r) => a + (r.returned ?? 0), 0), cited: log.reduce((a, r) => a + (r.cited ?? 0), 0), confirmed: log.reduce((a, r) => a + (r.confirmed ?? 0), 0), added: added.length, failed: log.filter((r) => r.error).length };
    if (run) await supabase().from("discovery_runs").update({ status: stopAi.current ? "cancelled" : "done", finished_at: new Date().toISOString(), stats, log }).eq("id", run.id);
    setAi((s) => ({ ...s, phase: "Scoring" }));
    if (!stopAi.current && added.length) await score(added);
    setAi((s) => ({ ...s, running: false, phase: "" }));
    toast(stopAi.current ? "AI search stopped. What it found is kept." : `AI search done: ${added.length} new findings from ${stats.cited} cited sources.`);
  }, [score, toast]);

  const runCrawl = useCallback(async (links: Link[], trigger = "manual") => {
    if (!links.length) return;
    const c = ref.current;
    stopCrawl.current = false;
    setCrawl({ running: true, done: 0, total: links.length, status: {} });
    const { data: run } = await supabase().from("discovery_runs").insert({ workspace_id: c.wsId, kind: "crawl", trigger }).select("id").single();
    const log: LogRow[] = [];
    let done = 0, added = 0, next = 0;
    await Promise.all([0, 1, 2].map(async () => {
      while (next < links.length && !stopCrawl.current) {
        const l = links[next++];
        setCrawl((s) => ({ ...s, status: { ...s.status, [l.id]: "reading" } }));
        const r = await fetch("/api/discovery/crawl", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ linkId: l.id, runId: run?.id, today: c.today }) }).then((x) => x.json()).catch(() => ({ status: "failed", articles: 0, added: 0 }));
        added += r.added ?? 0; done++;
        log.push({ link: l.url, name: l.name, status: r.status ?? "failed", articles: r.articles ?? 0 });
        setCrawl((s) => ({ ...s, done, status: { ...s.status, [l.id]: r.status ?? "failed" } }));
      }
    }));
    const count = (s: string) => log.filter((x) => x.status === s).length;
    const stats = { links: links.length, read: count("read") + count("list"), list: count("list"), gated: count("gated"), blocked: count("blocked"), failed: count("failed"), articles: log.reduce((a, x) => a + (x.articles ?? 0), 0), added };
    if (run) await supabase().from("discovery_runs").update({ status: stopCrawl.current ? "cancelled" : "done", finished_at: new Date().toISOString(), stats, log }).eq("id", run.id);
    setCrawl((s) => ({ ...s, running: false }));
    toast(`Crawl done: ${stats.links} links, ${stats.articles} articles. ${stats.gated} gated and ${stats.blocked} blocked are listed, not skipped.`);
  }, [toast]);

  return { ai, crawl, scoring, runAi, runCrawl, score, stopAi: () => { stopAi.current = true; }, stopCrawl: () => { stopCrawl.current = true; } };
}
