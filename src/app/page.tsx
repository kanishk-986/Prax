import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { ProfileList, type ProfileRow } from "@/components/profile-list";

export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  await sb.rpc("claim_invites");
  // "*" so company and archived_at (db/016) come through when they exist and nothing breaks before it runs.
  const { data: ws } = await sb.from("workspaces").select("*, members(role, user_id)").order("created_at");
  const list: ProfileRow[] = (ws ?? []).map((w) => ({ id: w.id, slug: w.slug, name: w.name, headline: w.headline ?? "", company: w.company ?? "", archived_at: w.archived_at ?? null, is_demo: !!w.is_demo,
    role: (w.members as { role: string; user_id: string }[]).find((m) => m.user_id === user.id)?.role ?? "viewer" }));

  return (
    <main className="mx-auto max-w-[880px] px-4 py-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Logo /><span className="text-title font-semibold tracking-tight">Prax</span></div>
        <form action="/auth/signout" method="post" className="flex min-w-0 items-center gap-3">
          <span className="truncate text-body text-muted">{user.email}</span>
          <button className="btn btn-ghost">Sign out</button>
        </form>
      </div>
      <h1 className="mt-10 text-page font-semibold tracking-tight">Profiles</h1>
      <p className="mt-1 text-muted">Each profile is one LinkedIn presence with its own plan, pipeline and team.</p>
      {deleted && <p className="mt-4 rounded-xl border border-line-strong bg-white px-4 py-2.5 text-body" role="status">The profile and all its data were deleted.</p>}
      <ProfileList list={list} />
    </main>
  );
}
