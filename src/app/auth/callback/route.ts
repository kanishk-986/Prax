import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth";

// Where email links land: magic link and password reset (?code=, PKCE), or an email template that sends
// ?token_hash=&type= (recovery, invite, magiclink). Recovery and invite links pass next=/login/reset.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  let next = safeNext(url.searchParams.get("next"));
  if (type === "invite" && !next.startsWith("/login/reset")) next = "/login/reset?mode=invite";
  if (type === "recovery" && !next.startsWith("/login/reset")) next = "/login/reset";
  const sb = await supabaseServer();
  const { error } = code
    ? await sb.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await sb.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("No code in the link") };
  if (!error) {
    await sb.rpc("claim_invites");
    return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
