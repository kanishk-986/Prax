import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { crawlLink, saveCrawl } from "@/lib/crawl";

export const runtime = "nodejs";
export const maxDuration = 300;

type Link = { id: string; workspace_id: string; url: string; name: string; list_id: string };

// Constant-time comparison; timingSafeEqual needs equal lengths, so a length mismatch is refused first.
function sameSecret(got: string, want: string) {
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

// The Monday crawl (vercel.json). Vercel sends Authorization: Bearer <CRON_SECRET>; anything else is refused.
// It reads every link in every workspace's lists on the server and records one crawl run per workspace.
// AI search is not run here: the AI keys live only in the user's browser.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !sameSecret(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 500 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
  const started = Date.now(), today = new Date().toISOString().slice(0, 10);
  const { data: links } = await sb.from("discovery_links").select("id,workspace_id,url,name,list_id");
  const { data: lists } = await sb.from("discovery_lists").select("id,name");
  const listName = new Map(((lists ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name]));
  const byWs = new Map<string, Link[]>();
  for (const l of (links ?? []) as Link[]) byWs.set(l.workspace_id, [...(byWs.get(l.workspace_id) ?? []), l]);
  const summary: Record<string, unknown>[] = [];
  for (const [ws, rows] of byWs) {
    const { data: run } = await sb.from("discovery_runs").insert({ workspace_id: ws, kind: "crawl", trigger: "cron", created_by: null }).select("id").single();
    const log: { link: string; name: string; status: string; articles: number }[] = [];
    let added = 0;
    const queue = [...rows];
    // Four at a time, stopping before the function's time limit; what is left is counted as skipped.
    await Promise.all([0, 1, 2, 3].map(async () => {
      while (queue.length && Date.now() - started < 270_000) {
        const l = queue.shift()!;
        const res = await crawlLink(l.url).catch(() => ({ status: "failed" as const, error: "That page could not be read.", articles: [] }));
        added += await saveCrawl(sb, l, listName.get(l.list_id) ?? "", run?.id ?? null, res, today);
        log.push({ link: l.url, name: l.name, status: res.status, articles: res.articles.length });
      }
    }));
    const count = (s: string) => log.filter((x) => x.status === s).length;
    const stats = { links: rows.length, read: count("read") + count("list"), list: count("list"), gated: count("gated"), blocked: count("blocked"), failed: count("failed"), articles: log.reduce((a, x) => a + x.articles, 0), added, skipped: queue.length };
    if (run) await sb.from("discovery_runs").update({ status: "done", finished_at: new Date().toISOString(), stats, log }).eq("id", run.id);
    summary.push({ workspace: ws, ...stats });
  }
  return NextResponse.json({ ok: true, workspaces: summary.length, summary });
}
