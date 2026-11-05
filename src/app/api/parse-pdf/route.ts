import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Extracts the text of an uploaded LinkedIn "Save to PDF" file. Nothing is stored here.
export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "PDF is larger than 8 MB" }, { status: 413 });
  try {
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: false });
    return NextResponse.json({ text: (text as string[]).join("\n"), pages: (text as string[]).length });
  } catch {
    return NextResponse.json({ error: "This file could not be read as a PDF" }, { status: 422 });
  }
}
