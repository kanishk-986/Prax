import { redirect } from "next/navigation";

// The Extension section is now the Prax for Chrome tab of Connections (Q135). Old links keep working; an old
// "#search-keys" link keeps its hash through the redirect and Connections opens the Tools tab for it.
export default async function ExtensionMoved({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ welcome?: string }> }) {
  const { slug } = await params;
  const { welcome } = await searchParams;
  redirect(`/w/${slug}/connections?tab=chrome${welcome ? "&welcome=1" : ""}`);
}
