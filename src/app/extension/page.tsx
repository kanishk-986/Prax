import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

// The extension opens /extension after install; send the user to their first profile's Extension page.
export default async function ExtensionRedirect({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const sb = await supabaseServer();
  const { data } = await sb.from("workspaces").select("slug").order("created_at").limit(1);
  const { welcome } = await searchParams;
  redirect(data?.[0] ? `/w/${data[0].slug}/extension${welcome ? "?welcome=1" : ""}` : "/");
}
