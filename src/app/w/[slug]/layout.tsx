import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { WorkspaceProvider, type Role, type Workspace } from "@/lib/workspace";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "@/components/toaster";
import { CommandMenu } from "@/components/command-menu";
import { PreviewShell } from "./preview-shell";

export default async function WsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (process.env.PRAX_PREVIEW === "1") return <PreviewShell slug={slug}>{children}</PreviewShell>;
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: ws } = await sb.from("workspaces").select("*").eq("slug", slug).maybeSingle();
  if (!ws) notFound();
  const { data: me } = await sb.from("members").select("role").eq("workspace_id", ws.id).eq("user_id", user.id).maybeSingle();
  const role = (me?.role ?? "viewer") as Role;
  // The member's own name for greetings: the name on their sign-in profile, if any; the email is the fallback.
  const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
  return <Shell ws={ws as Workspace} role={role} userId={user.id} email={user.email ?? ""} name={meta.full_name || meta.name || ""}>{children}</Shell>;
}

function Shell({ ws, role, userId, email, name, children }: { ws: Workspace; role: Role; userId: string; email: string; name: string; children: React.ReactNode }) {
  return (
    <WorkspaceProvider ws={ws} role={role} userId={userId} email={email} name={name}>
      <Toaster>
        <div className="flex min-h-full">
          <Sidebar />
          <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">{children}</main>
        </div>
        <CommandMenu />
      </Toaster>
    </WorkspaceProvider>
  );
}
