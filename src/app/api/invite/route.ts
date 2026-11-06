import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { emailError, ROLES } from "@/lib/auth";

export const runtime = "nodejs";

// Invite a teammate (Q113: invite only). The caller must be an owner of the workspace. The invite row is what
// grants access (claim_invites on first sign-in); the Supabase invite email lets a new person set a password.
// The service role key stays on the server.
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

  // Written as the owner, so the invites RLS policy still applies.
  const { error: rowError } = await sb.from("invites").upsert({ workspace_id: body.workspace_id, email, role });
  if (rowError) return NextResponse.json({ error: rowError.message }, { status: 500 });

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "Invite saved, but no email was sent: SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 500 });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${new URL(req.url).origin}/login/reset?mode=invite` });
  // Someone who already has an account gets access the next time they sign in; no email is needed.
  if (error && (error.code === "email_exists" || /already been registered/i.test(error.message))) return NextResponse.json({ sent: false, existing: true });
  if (error) return NextResponse.json({ error: `Invite saved, but the email failed: ${error.message}` }, { status: 500 });
  return NextResponse.json({ sent: true });
}
