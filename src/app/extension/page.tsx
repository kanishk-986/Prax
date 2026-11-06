import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

// The extension opens /extension after install (and its side panel links here); send the user to their first
// profile's Connections: the Prax for Chrome tab, or the Tools tab for "Manage keys in Prax" (?to=tools).
export default async function ExtensionRedirect({ searchParams }: { searchParams: Promise<{ welcome?: string; to?: string }> }) {
  const sb = await supabaseServer();
  const { data } = await sb.from("workspaces").select("slug").order("created_at").limit(1);
  const { welcome, to } = await searchParams;
  redirect(data?.[0] ? `/w/${data[0].slug}/connections?tab=${to === "tools" ? "tools" : "chrome"}${welcome ? "&welcome=1" : ""}` : "/");
}
