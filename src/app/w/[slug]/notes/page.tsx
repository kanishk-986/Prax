// Notes is now a tab of the Playbook (S5); old links land there.
import { redirect } from "next/navigation";
import { playbookHref } from "@/lib/shell";

export default async function NotesRedirect({ params }: { params: Promise<{ slug: string }> }) {
  redirect(playbookHref((await params).slug, "notes"));
}
