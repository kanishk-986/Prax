import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseProfile, auditProfile } from "@/lib/profile";
import { mergeStudio, tuningRules, voiceText, LOCKED_RULES, LENGTHS } from "@/lib/studio";
import { parseCount } from "@/lib/content";

// The Chrome extension's only door into Prax. Every call carries the user's extension token,
// which the database checks before it reads or writes anything.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: cors });

export function OPTIONS() { return new Response(null, { headers: cors }); }

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const tok = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (tok.length < 20) return json({ error: "Missing extension token" }, 401);
  const body = await req.json().catch(() => ({}));
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await sb.rpc(fn, { tok, ...args });
    if (error) throw new Error(error.message.includes("invalid token") ? "Token not recognised. Create a new one in Prax Settings." : error.message);
    return data;
  };
  try {
    switch (action) {
      case "me": {
        // The extension gets the studio settings merged with the defaults, plus ready-made rule text.
        const me = await rpc("ext_me", {});
        const studio = mergeStudio(me.studio);
        return json({ ...me, studio, rules: { tuning: tuningRules(studio.tuning), locked: LOCKED_RULES, voice: voiceText(studio.voice_profile), length: LENGTHS[studio.tuning.length] } });
      }
      case "save": return json({ id: await rpc("ext_save_draft", { p: body }) });
      case "log": return json(await rpc("ext_log_comment", { p: body }));
      case "request": return json(await rpc("ext_log_request", { p: body }));
      case "usage": return json({ ok: await rpc("ext_log_usage", { p: body }) });
      case "replies": return json({ marked: await rpc("ext_replies", { post_url: String(body.url ?? "") }) });
      // A post the user sent from the Prax bar while reading it: it lands in Discovery Studio as a finding.
      case "discovery": return json({ id: await rpc("ext_discovery_add", { p: { url: String(body.url ?? "").slice(0, 1000), title: String(body.title ?? "").slice(0, 300), text: String(body.text ?? "").slice(0, 6000), author: String(body.author ?? "").slice(0, 200), author_url: String(body.author_url ?? "").slice(0, 500), company: String(body.company ?? "").slice(0, 200) } }) });
      // A post's own analytics page, read while the user has it open (CS29, db/022). Matched by the activity id in the link.
      case "post_results": {
        const n = (x: unknown) => { const v = parseCount(String(x ?? "")); return v == null ? null : Math.min(v, 2_000_000_000); };
        return json({ post: await rpc("ext_post_results", { p: { url: String(body.url ?? "").slice(0, 1000), impressions: n(body.impressions), reactions: n(body.reactions), comments: n(body.comments), reposts: n(body.reposts) } }) });
      }
      // A LinkedIn message the user sent to the Inbox from a conversation they have open (user click only; db/026_step4.sql).
      case "inbox": return json(await rpc("ext_inbox_add", { p: { name: String(body.name ?? "").slice(0, 200), company: String(body.company ?? "").slice(0, 200), url: String(body.url ?? "").slice(0, 500), thread_url: String(body.thread_url ?? "").slice(0, 500), text: String(body.text ?? "").slice(0, 4000), received_at: String(body.received_at ?? "").slice(0, 40) } }));
      case "snapshot":return json({ saved: await rpc("ext_snapshot", { metrics: body.metrics ?? {} }) });
      case "capture": {
        const me = await rpc("ext_me", {});
        const raw = String(body.raw ?? "");
        const parsed = parseProfile(raw);
        const audit = auditProfile(parsed, me.topics ?? []);
        return json({ ...(await rpc("ext_capture", { p: { raw, url: body.url, self: !!body.self, parsed, audit } })), name: parsed.name, score: audit.score });
      }
      default: return json({ error: "Unknown action" }, 404);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
}
