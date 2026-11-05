import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseProfile, auditProfile } from "@/lib/profile";
import { mergeStudio, tuningRules, voiceText, LOCKED_RULES, LENGTHS } from "@/lib/studio";

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
      case "snapshot": return json({ saved: await rpc("ext_snapshot", { metrics: body.metrics ?? {} }) });
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
