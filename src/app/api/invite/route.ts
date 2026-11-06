import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { emailError, ROLES } from "@/lib/auth";

export const runtime = "nodejs";

const INVITES_PER_HOUR = 20;
const SITE_URL = (process.env.SITE_URL || "https://prax-gamma.vercel.app").replace(/\/+$/, "");
const FAILED = "The invite could not be sent. Try again in a moment.";

// Invite a teammate (Q113: invite only). The caller must be an owner of the workspace. The invite row is what
// grants access (claim_invites on first sign-in); the Supabase invite email lets a new person set a password.
// The service role key stays on the server. The answer is the same whether or not the email already has an
// account, database errors stay in the server log, and each person can send at most 20 invites an hour
// (invite_log, db/020). The email link always points at SITE_URL, never at the request's own origin.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { workspace_id?: string; email?: string; role?: string };
  const email = (body.email ?? "").trim().toLowerCase();
  const role = body.role ?? "";
  if (!body.workspace_id || emailError(email) || !(ROLES as readonly string[]).includes(role))
    return NextResponse.json({ error: "Enter a valid email and role." }, { status: 400 });

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in again to invite people." }, { status: 401 });
  const { data: isOwner } = await sb.rpc("has_role", { ws: body.workspace_id, min_role: "owner" });
  if (!isOwner) return NextResponse.json({ error: "Only owners can invite people." }, { status: 403 });

  // Rate limit, checked before any admin call. The log is read and written as the caller (RLS: own rows only).
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await sb.from("invite_log").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
  if (countError) { console.error("invite: rate limit check failed", countError); return NextResponse.json({ error: FAILED }, { status: 500 }); }
  if ((count ?? 0) >= INVITES_PER_HOUR) return NextResponse.json({ error: "You have sent many invites this hour. Try again later." }, { status: 429 });
  const { error: logError } = await sb.from("invite_log").insert({ user_id: user.id, workspace_id: body.workspace_id });
  if (logError) { console.error("invite: log write failed", logError); return NextResponse.json({ error: FAILED }, { status: 500 }); }

  // Written as the owner, so the invites RLS policy still applies.
  const { error: rowError } = await sb.from("invites").upsert({ workspace_id: body.workspace_id, email, role });
  if (rowError) { console.error("invite: invites upsert failed", rowError); return NextResponse.json({ error: FAILED }, { status: 500 }); }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) { console.error("invite: SUPABASE_SERVICE_ROLE_KEY is not set"); return NextResponse.json({ error: FAILED }, { status: 500 }); }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${SITE_URL}/login/reset?mode=invite` });
  // Someone who already has an account gets access the next time they sign in. The answer does not say which.
  if (error && !(error.code === "email_exists" || /already been registered/i.test(error.message))) {
    console.error("invite: email failed", error);
    return NextResponse.json({ error: FAILED }, { status: 500 });
  }
  return NextResponse.json({ sent: true });
}
