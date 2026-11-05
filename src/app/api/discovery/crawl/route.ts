import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { crawlLink, saveCrawl } from "@/lib/crawl";

export const runtime = "nodejs";
export const maxDuration = 60;

// Crawl one link of a Discovery list for the signed-in editor. The browser calls this link by link, so the
// Crawl tab shows each status as it lands. Row-level security decides whether this user may write.
export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { linkId, runId, today } = await req.json().catch(() => ({}));
  const { data: link } = await sb.from("discovery_links").select("id,workspace_id,url,name,list_id").eq("id", String(linkId ?? "")).maybeSingle();
  if (!link) return NextResponse.json({ error: "That link is not in your lists." }, { status: 404 });
  const { data: list } = await sb.from("discovery_lists").select("name").eq("id", link.list_id).maybeSingle();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(today)) ? String(today) : new Date().toISOString().slice(0, 10);
  const res = await crawlLink(link.url);
  const added = await saveCrawl(sb, link, list?.name ?? "", runId ? String(runId) : null, res, day);
  return NextResponse.json({ status: res.status, articles: res.articles.length, added, error: res.error });
}
