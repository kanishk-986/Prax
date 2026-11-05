import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { readPage } from "@/lib/crawl";

export const runtime = "nodejs";

// Confirms an AI search result by reading the page itself: its title and the date written on it. Nothing is stored.
export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { url } = await req.json().catch(() => ({ url: "" }));
  const p = await readPage(String(url ?? ""));
  return NextResponse.json({ status: p.status, url: p.url, title: p.title, publisher: p.publisher, published: p.published, confirmed: p.confirmed, excerpt: p.excerpt, error: p.error });
}
