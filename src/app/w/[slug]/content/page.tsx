import { redirect } from "next/navigation";

// The first Content page grew into Content Studio; old links land there.
export default async function Content({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/w/${slug}/studio-content`);
}
