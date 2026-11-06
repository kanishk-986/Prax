import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Sign out: a plain form POST from the sidebar or the profiles page. Clears the Supabase cookies, then back to /login.
export async function POST(req: Request) {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
