import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/";
  if (code) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) {
      await sb.rpc("claim_invites");
      return NextResponse.redirect(new URL(next.startsWith("/") ? next : "/", url.origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
