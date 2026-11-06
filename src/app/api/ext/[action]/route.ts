import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseProfile, auditProfile } from "@/lib/profile";
import { mergeStudio, tuningRules, voiceText, LOCKED_RULES, LENGTHS } from "@/lib/studio";
import { parseCount } from "@/lib/content";
import { normUrl } from "@/lib/network";
import { KINDS, DETECTORS, detection, sectionOf, decide, levelFor, mergeSettings, textHash, wordCount, costOf, walterAllowed, type Kind, type DetectorId } from "@/lib/humanize";
import { blockedTools, eventsOf, mergeConnSettings } from "@/lib/connections";

// The Chrome extension's only door into Prax. Every call carries the user's extension token,
// which the database checks before it reads or writes anything.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: cors });

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<any>;

/** plan: settings, this month's use, the cache and the decision for the texts (one, or an article's paragraphs).
 *  record: one paid call; a Pangram reply is mapped here (src/lib/humanize.ts) and cached by its text hash. */
async function humanizeOp(body: Record<string, unknown>, rpc: Rpc) {
  const kind: Kind = KINDS.includes(body.kind as Kind) ? (body.kind as Kind) : "post";
  // Pangram, or another registered detector routed in Connections (GPTZero, Originality.ai; db/032 accepts them), or Walter.
  const detector: DetectorId = typeof body.service === "string" && body.service in DETECTORS ? (body.service as DetectorId) : "pangram";
  const service = body.service === "walter" ? "walter" : detector;
  const section = sectionOf(body.section);
  if (body.op === "record") {
    const text = String(body.text ?? "").slice(0, 60000);
    const hash = await textHash(text);
    if (service === "walter") {
      const words = wordCount(text);
      return { words, job: "humanize_rewrite", ...(await rpc("ext_humanize_record", { p: { service, kind, hash, words, section } })) };
    }
    // The detector's reply is mapped by its own adapter (Pangram today; GPTZero or Originality.ai plug in the same way).
    const det = DETECTORS[service]!;
    const result = det.map(body.raw);
    const rec = await rpc("ext_humanize_record", { p: { service, kind, hash, words: result.words || wordCount(text), score: result.score, result, section } });
    return { result, detection: detection(det.id, result), hash, job: "humanize_check", ...rec };
  }
  const texts = (Array.isArray(body.texts) ? body.texts : []).slice(0, 60).map((t) => String(t ?? "").slice(0, 60000));
  const hashes = await Promise.all(texts.map(textHash));
  const st = await rpc("ext_humanize_state", { p: { hashes } });
  const settings = mergeSettings(st?.settings);
  const used = { pangram: Number(st?.usage?.pangram) || 0, walter: Number(st?.usage?.walter) || 0 };
  const results = hashes.map((h) => (st?.results?.[h]?.result && typeof st.results[h].result === "object" && "score" in st.results[h].result ? st.results[h].result : null));
  const words = texts.reduce((s, t, i) => s + (results[i] ? 0 : wordCount(t)), 0);
  const level = levelFor(settings, kind);
  const caps = { pangram: settings.pangram_cap, walter: settings.walter_cap };
  if (service === "walter") {
    const w = walterAllowed({ hasKey: !!body.has_key, ready: !!body.ready, cap: caps.walter, used: used.walter, words: texts.reduce((s, t) => s + wordCount(t), 0), rounds: Number(body.rounds) || 0, failing: !!body.failing });
    return { walter: w, level, used, caps, cost: costOf(texts.reduce((s, t) => s + wordCount(t), 0), settings.walter_cost_100) };
  }
  const decision = decide({ kind, level, local: Number(body.local) || 0, words, cached: results.some(Boolean), hasKey: !!body.has_key, cap: caps.pangram, used: used.pangram, confirmed: !!body.confirm, costPer100: settings.pangram_cost_100 });
  return { decision, level, hashes, results, used, caps, rate: settings.pangram_cost_100, walter_cap: caps.walter };
}

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
      // Replies, comments and mentions the user read with Check replies (I1, db/027): on the notifications page or on a
      // post they have open. Extension 0.9.3 and older send only { url }, which marks that post's logged comments as replied.
      case "replies": {
        if (!Array.isArray(body.replies)) return json({ marked: await rpc("ext_replies", { post_url: String(body.url ?? "") }) });
        const s = (x: unknown, n: number) => String(x ?? "").slice(0, n);
        const replies = body.replies.slice(0, 50).map((r: Record<string, unknown>) => ({
          kind: ["comment_reply", "post_comment", "mention"].includes(String(r?.kind)) ? String(r.kind) : "comment_reply",
          name: s(r?.name, 200), url: s(r?.url, 500), text: s(r?.text, 4000), post_url: s(r?.post_url, 1000), at: s(r?.at, 40), mine: s(r?.mine, 400),
        }));
        const day = /^\d{4}-\d{2}-\d{2}$/.test(String(body.day ?? "")) ? String(body.day) : "";
        return json(await rpc("ext_replies_add", { p: { replies, day } }));
      }
      // A post the user sent from the Prax bar while reading it: it lands in Discovery Studio as a finding.
      // kind "profile": a profile the user has open (DS15), with its headline and the activity shown on it.
      case "discovery": return json({ id: await rpc("ext_discovery_add", { p: { kind: body.kind === "profile" ? "profile" : "post", url: String(body.url ?? "").slice(0, 1000), title: String(body.title ?? "").slice(0, 300), text: String(body.text ?? "").slice(0, 6000), author: String(body.author ?? "").slice(0, 200), author_url: String(body.author_url ?? "").slice(0, 500), company: String(body.company ?? "").slice(0, 200) } }) });
      // Mutual connections and location read from a profile the user has open, when they press the Prax bar (N11, N12).
      case "profile": {
        const url = String(body.url ?? "").slice(0, 500);
        if (!/^https:\/\/www\.linkedin\.com\/in\/[^/?#]+\/?$/.test(url)) return json({ error: "Open a LinkedIn profile page first." }, 400);
        const count = Number.isInteger(body.mutual_count) && body.mutual_count >= 0 ? Math.min(body.mutual_count, 100000) : null;
        const names = Array.isArray(body.mutual_names) ? body.mutual_names.map((x: unknown) => String(x).slice(0, 120)).filter(Boolean).slice(0, 10) : [];
        return json(await rpc("ext_profile_save", { p: { url, key: normUrl(url), name: String(body.name ?? "").slice(0, 200), location: String(body.location ?? "").slice(0, 200), mutual_count: count, mutual_names: names } }));
      }
      // A post's own analytics page, read while the user has it open (CS29, db/022). Matched by the activity id in the link.
      case "post_results": {
        const n = (x: unknown) => { const v = parseCount(String(x ?? "")); return v == null ? null : Math.min(v, 2_000_000_000); };
        return json({ post: await rpc("ext_post_results", { p: { url: String(body.url ?? "").slice(0, 1000), impressions: n(body.impressions), reactions: n(body.reactions), comments: n(body.comments), reposts: n(body.reposts) } }) });
      }
      // A LinkedIn message the user sent to the Inbox from a conversation they have open (user click only; db/026_step4.sql).
      case "inbox": return json(await rpc("ext_inbox_add", { p: { name: String(body.name ?? "").slice(0, 200), company: String(body.company ?? "").slice(0, 200), url: String(body.url ?? "").slice(0, 500), thread_url: String(body.thread_url ?? "").slice(0, 500), text: String(body.text ?? "").slice(0, 4000), received_at: String(body.received_at ?? "").slice(0, 40) } }));
      // Humanization (db/031). The extension's background calls "plan" before any paid check and "record" after one;
      // the Pangram and Walter keys never come here. Text is hashed here for the cache and is not stored.
      case "humanize": return json(await humanizeOp(body, rpc));
      // Connections (db/032): the saved routes and the tools at 100% of their monthly cap, so the extension can route
      // each job and stop paid calls at the cap. Keys never come here. Before 032 runs this answers with no routes.
      case "connections": {
        const st = await rpc("ext_connection_state", {}).catch(() => null);
        if (!st) return json({ routes: {}, blocked: [] });
        const s = mergeConnSettings(st.settings);
        const month = new Date().toISOString().slice(0, 7);
        return json({ routes: s.routes, blocked: blockedTools(s.caps, eventsOf(st.usage ?? [], st.humanize ?? []), month) });
      }
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
