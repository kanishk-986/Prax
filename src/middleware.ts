import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie and sends signed-out visitors to /login.
export async function middleware(req: NextRequest) {
  if (process.env.PRAX_PREVIEW === "1") return NextResponse.next();
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await sb.auth.getUser();
  const p = req.nextUrl.pathname;
  // /share shows a view-only AI citations snapshot; the database checks the token. /api/cron checks CRON_SECRET itself.
  const open = p.startsWith("/login") || p.startsWith("/auth") || p.startsWith("/api/ext") || p.startsWith("/share/") || p.startsWith("/api/cron/");
  if (!user && !open) {
    const url = req.nextUrl.clone(); url.pathname = "/login"; url.searchParams.set("next", p);
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"] };
