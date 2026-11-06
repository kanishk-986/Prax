import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { NewWorkspace } from "@/components/new-workspace";

export default async function Home() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  await sb.rpc("claim_invites");
  const { data: ws } = await sb.from("workspaces").select("id, slug, name, headline, members(role, user_id)").order("created_at");
  const list = (ws ?? []).map((w) => ({ ...w, role: (w.members as { role: string; user_id: string }[]).find((m) => m.user_id === user.id)?.role ?? "viewer" }));

  return (
    <main className="mx-auto max-w-[880px] px-4 py-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Logo /><span className="text-[15px] font-semibold tracking-tight">Prax</span></div>
        <form action="/auth/signout" method="post" className="flex min-w-0 items-center gap-3">
          <span className="truncate text-[13px] text-muted">{user.email}</span>
          <button className="btn btn-ghost">Sign out</button>
        </form>
      </div>
      <h1 className="mt-10 text-[24px] font-semibold tracking-tight">Profiles</h1>
      <p className="mt-1 text-muted">Each profile is one LinkedIn presence with its own plan, pipeline and team.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {list.map((w) => (
          <Link key={w.id} href={`/w/${w.slug}`} className="card p-4 hover:border-line-strong transition-colors">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{w.name}</span>
              <span className="chip capitalize">{w.role}</span>
            </div>
            <p className="mt-1 text-[13px] text-muted line-clamp-2">{w.headline || "LinkedIn profile"}</p>
          </Link>
        ))}
        <NewWorkspace />
      </div>
    </main>
  );
}
