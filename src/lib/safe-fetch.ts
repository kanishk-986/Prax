// Server only. Reads one public web page with the same rules as /api/fetch-url: http and https only, never
// LinkedIn, never a private or local address (checked after DNS and again on every redirect), a time limit and
// a size cap. Used by the Discovery crawl, its Monday cron and the date check for AI search results.
import { lookup } from "node:dns/promises";
import { urlProblem, isPrivateIp } from "@/lib/content";

export type Fetched = { ok: boolean; status: number; url: string; html: string; type: string; error: string; refused?: boolean };

export async function safeFetch(raw: string, { timeoutMs = 8000, maxBytes = 2 * 1024 * 1024, hops = 3 } = {}): Promise<Fetched> {
  let target = String(raw ?? "").trim();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const fail = (error: string, status = 0, refused = false): Fetched => ({ ok: false, status, url: target, html: "", type: "", error, refused });
  try {
    for (let hop = 0; hop <= hops; hop++) {
      const problem = urlProblem(target);
      if (problem) return fail(problem, 0, true);
      const host = new URL(target).hostname.replace(/^\[|\]$/g, "");
      const addrs = await lookup(host, { all: true }).catch(() => []);
      if (!addrs.length) return fail("That site could not be found.");
      if (addrs.some((a) => isPrivateIp(a.address))) return fail("Private network addresses cannot be read.", 0, true);
      const r = await fetch(target, { redirect: "manual", signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; PraxReader/1.0)", accept: "text/html,application/xhtml+xml,text/plain" } });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { target = new URL(r.headers.get("location")!, target).toString(); continue; }
      const type = r.headers.get("content-type") ?? "";
      const reader = r.body?.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) { await reader.cancel(); break; }
        chunks.push(value);
      }
      const html = /text\/|xhtml|xml/.test(type) || !type ? new TextDecoder().decode(Buffer.concat(chunks)) : "";
      return { ok: r.ok, status: r.status, url: target, html, type, error: r.ok ? "" : `The site answered ${r.status}.` };
    }
    return fail("Too many redirects.");
  } catch (e) {
    return fail((e as Error).name === "AbortError" ? "The site took too long to answer." : "That page could not be read.");
  } finally {
    clearTimeout(timer);
  }
}
