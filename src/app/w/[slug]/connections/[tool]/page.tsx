"use client";
import { useParams } from "next/navigation";
import { notFound } from "next/navigation";
import { toolOf } from "@/lib/connections";
import { ToolPage } from "@/components/connections/tool-page";

export default function ConnectionTool() {
  const { tool } = useParams<{ tool: string }>();
  const t = toolOf(String(tool || ""));
  if (!t) notFound();
  return <ToolPage key={t.id} id={t.id} />;
}
