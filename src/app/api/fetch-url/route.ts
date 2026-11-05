import { NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { supabaseServer } from "@/lib/supabase/server";
import { urlProblem, isPrivateIp, readable } from "@/lib/content";
import { decodePage } from "@/lib/text";

export const runtime = "nodejs";

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

// Reads one public web page for Write a post: its title and readable text. Nothing is stored.
// Never LinkedIn (rule 1), never a private address, at most 2 MB and 10 seconds, at most 3 redirects.
export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { url } = await req.json().catch(() => ({ url: "" }));
  let target = String(url ?? "").trim();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    for (let hop = 0; hop < 4; hop++) {
      const problem = urlProblem(target);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      const host = new URL(target).hostname.replace(/^\[|\]$/g, "");
      // Check what the name resolves to, so a public name cannot point at a private address.
      const addrs = await lookup(host, { all: true }).catch(() => []);
      if (!addrs.length) return NextResponse.json({ error: "That site could not be found." }, { status: 400 });
      if (addrs.some((a) => isPrivateIp(a.address))) return NextResponse.json({ error: "Private network addresses cannot be read." }, { status: 400 });
      const r = await fetch(target, { redirect: "manual", signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; PraxReader/1.0)", accept: "text/html,application/xhtml+xml,text/plain" } });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { target = new URL(r.headers.get("location")!, target).toString(); continue; }
      if (!r.ok) return NextResponse.json({ error: `The site answered ${r.status}.` }, { status: 400 });
      const type = r.headers.get("content-type") ?? "";
      if (!/text\/html|text\/plain|application\/xhtml/.test(type)) return NextResponse.json({ error: "That link is not a web page. Use the PDF option for files." }, { status: 400 });
      const reader = r.body?.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BYTES) { await reader.cancel(); break; }
        chunks.push(value);
      }
      const html = decodePage(new Uint8Array(Buffer.concat(chunks)), type);
      const { title, text } = type.includes("text/plain") ? { title: "", text: html } : readable(html);
      return NextResponse.json({ url: target, host: new URL(target).hostname, title, text: text.slice(0, 20000), truncated: size > MAX_BYTES || text.length > 20000 });
    }
    return NextResponse.json({ error: "Too many redirects." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).name === "AbortError" ? "The site took too long to answer." : "That page could not be read." }, { status: 400 });
  } finally {
    clearTimeout(timer);
  }
}
