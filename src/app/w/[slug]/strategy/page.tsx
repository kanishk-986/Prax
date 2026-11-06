"use client";
import { Section } from "@/components/shell";
import { useState } from "react";
import { RecordList, AddButton } from "@/components/record-list";
import { useLive } from "@/lib/live";
import { useWorkspace } from "@/lib/workspace";

export default function Strategy() {
  const { ws, can } = useWorkspace();
  const { rows } = useLive<{ id: string; body: string; created_at: string }>("notes", ws.id, { filter: (q) => q.eq("kind", "strategy"), order: "created_at", asc: false });
  const [adding, setAdding] = useState(false);
  // The team's own operations ("Who does what") are for editors and owners; viewers and commenters see the plan only.
  const team = can("editor");
  return (
    <Section id="strategy" title="Strategy" status="The agreed plan for this profile." entryStatus={`${rows.length} sections in the agreed plan.`}
      actions={<AddButton label="Add section" onClick={() => setAdding(true)} />}>
      <RecordList table="notes" order="sort" filter={(q) => q.eq("kind", "strategy")} hide={team ? undefined : (r) => /^who does what/i.test(String(r.title ?? "").trim())} defaults={{ kind: "strategy", sort: 0 }} empty="No strategy sections yet." adding={adding} onAdding={setAdding} author
        cols={[{ key: "title", label: "Section", className: "font-medium w-[240px]" }, { key: "body", label: "", className: "text-ink-2 whitespace-pre-line", render: (r) => <span className="line-clamp-4">{r.body}</span> }]}
        fields={[{ key: "title", label: "Section title", wide: true }, { key: "sort", label: "Order", type: "number" }, { key: "body", label: "Text", type: "textarea" }]} />
    </Section>
  );
}
