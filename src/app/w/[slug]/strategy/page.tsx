"use client";
import { Section, KpiTiles } from "@/components/shell";
import { useState } from "react";
import { RecordList, AddButton } from "@/components/record-list";
import { useLive } from "@/lib/live";
import { useWorkspace, fmtDay } from "@/lib/workspace";

export default function Strategy() {
  const { ws } = useWorkspace();
  const { rows } = useLive<{ id: string; body: string; created_at: string }>("notes", ws.id, { filter: (q) => q.eq("kind", "strategy"), order: "created_at", asc: false });
  const words = rows.reduce((s, r) => s + (r.body ?? "").split(/\s+/).filter(Boolean).length, 0);
  const [adding, setAdding] = useState(false);
  return (
    <Section id="strategy" title="Strategy" status="The agreed plan for this profile." entryStatus={`${rows.length} sections in the agreed plan.`}
      actions={<AddButton label="Add section" onClick={() => setAdding(true)} />}>
      <KpiTiles items={[
        { label: "Sections", value: rows.length, sub: "in the plan" },
        { label: "Words", value: words, sub: "across all sections" },
        { label: "Latest section", value: rows[0] ? fmtDay(rows[0].created_at.slice(0, 10), { day: "numeric", month: "short" }) : "None", sub: rows[0] ? "added" : "nothing added yet" },
      ]} />
      <RecordList table="notes" order="sort" filter={(q) => q.eq("kind", "strategy")} defaults={{ kind: "strategy", sort: 0 }} empty="No strategy sections yet." adding={adding} onAdding={setAdding}
        cols={[{ key: "title", label: "Section", className: "font-medium w-[240px]" }, { key: "body", label: "", className: "text-ink-2 whitespace-pre-line", render: (r) => <span className="line-clamp-4">{r.body}</span> }]}
        fields={[{ key: "title", label: "Section title", wide: true }, { key: "sort", label: "Order", type: "number" }, { key: "body", label: "Text", type: "textarea" }]} />
    </Section>
  );
}
