// Server only. Crawl one link from a Discovery list: read it, and on a list page take the 5 newest articles.
// Gated and blocked links keep that status so the page lists them; nothing is hidden as a quiet week.
// Shared by /api/discovery/crawl (one link at a time, from the browser) and the Monday cron.
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeFetch } from "@/lib/safe-fetch";
import { gateOf, isListPage, articleLinks, newestArticles, pageDate, pageTitle, pagePublisher, urlDate, ruleScore, sourceTypeOf, opportunityOf } from "@/lib/discovery";
import { readable } from "@/lib/content";

export type ReadPage = { status: "read" | "gated" | "blocked" | "failed"; url: string; title: string; publisher: string; published: string | null; confirmed: boolean; excerpt: string; error: string; html?: string };

/** One page: its title, publisher, the date written on it (confirmed) or in its link (not confirmed), and some text. */
export async function readPage(url: string, keepHtml = false): Promise<ReadPage> {
  const r = await safeFetch(url);
  const base = { url: r.url || url, title: "", publisher: "", published: null as string | null, confirmed: false, excerpt: "" };
  if (r.refused) return { ...base, status: "blocked", error: r.error };
  const gate = gateOf(r.status, r.html);
  if (gate) return { ...base, status: gate, error: r.error || (gate === "gated" ? "Needs a login or a subscription." : "The site refused the request.") };
  if (!r.ok || !r.html) return { ...base, status: "failed", error: r.error || "The page had no readable text." };
  const onPage = pageDate(r.html);
  const text = readable(r.html).text;
  return { ...base, status: "read", title: pageTitle(r.html) || readable(r.html).title, publisher: pagePublisher(r.html, r.url), published: onPage ?? urlDate(r.url), confirmed: !!onPage, excerpt: text.slice(0, 1500), error: "", html: keepHtml ? r.html : undefined };
}

export type CrawlResult = { status: "read" | "list" | "gated" | "blocked" | "failed"; error: string; articles: ReadPage[] };
export async function crawlLink(url: string, take = 5): Promise<CrawlResult> {
  const page = await readPage(url, true);
  if (page.status !== "read") return { status: page.status, error: page.error, articles: [] };
  if (page.html && isListPage(page.html, page.url)) {
    const picks = newestArticles(articleLinks(page.html, page.url), take);
    const read: ReadPage[] = [];
    for (let i = 0; i < picks.length; i += 3) read.push(...(await Promise.all(picks.slice(i, i + 3).map((p) => readPage(p.url).then((a) => (a.title ? a : { ...a, title: p.title }))))));
    return { status: "list", error: "", articles: read.filter((a) => a.status === "read").sort((a, b) => (b.published ?? "").localeCompare(a.published ?? "")) };
  }
  return { status: "read", error: "", articles: [{ ...page, html: undefined }] };
}

type LinkRow = { id: string; workspace_id: string; url: string; name: string; list_id: string };
/** Store a crawl: the link's status and count, and each article as a finding with a first rules score. */
export async function saveCrawl(sb: SupabaseClient, link: LinkRow, listName: string, runId: string | null, res: CrawlResult, todayYmd: string) {
  await sb.from("discovery_links").update({ status: res.status, articles: res.articles.length, error: res.error.slice(0, 300), last_read: new Date().toISOString() }).eq("id", link.id);
  if (!res.articles.length) return 0;
  const urls = res.articles.map((a) => a.url);
  const { data: have } = await sb.from("discovery_findings").select("id,url,found_by,found").eq("workspace_id", link.workspace_id).in("url", urls);
  const byUrl = new Map(((have ?? []) as { id: string; url: string; found_by: string[]; found: Record<string, unknown> }[]).map((h) => [h.url, h]));
  const crawl = { list: listName, link: link.url, name: link.name };
  // The rules score uses this profile's pillars (db/016); before 016 the column is missing and the built-in words apply.
  const { data: ws } = await sb.from("workspaces").select("pillars").eq("id", link.workspace_id).maybeSingle();
  const pillars = Array.isArray(ws?.pillars) ? (ws.pillars as string[]) : undefined;
  let added = 0;
  for (const a of res.articles) {
    const old = byUrl.get(a.url);
    if (old) {
      if (!old.found_by.includes("crawl")) await sb.from("discovery_findings").update({ found_by: [...old.found_by, "crawl"], found: { ...old.found, crawl } }).eq("id", old.id);
      continue;
    }
    const st = sourceTypeOf(a.url), rs = ruleScore({ ...a, source_type: st }, todayYmd, pillars), opp = opportunityOf(a.title, a.excerpt, todayYmd);
    const { error } = await sb.from("discovery_findings").insert({
      workspace_id: link.workspace_id, run_id: runId, url: a.url, title: a.title.slice(0, 300) || a.url, publisher: a.publisher || link.name, source_type: st,
      published: a.published, confirmed: a.confirmed, excerpt: a.excerpt, found_by: ["crawl"], found: { crawl }, scores: rs.scores, scored_by: "rules",
      pillar: rs.pillar, geo: rs.geo, service: rs.service, kind: rs.kind, opp: opp ?? {},
    });
    if (!error) added++;
  }
  return added;
}
