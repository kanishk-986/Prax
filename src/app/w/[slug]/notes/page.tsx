"use client";
import { Section } from "@/components/shell";
import { useState } from "react";
import { RecordList, AddButton } from "@/components/record-list";
import { useLive } from "@/lib/live";
import { useWorkspace } from "@/lib/workspace";

export default function Notes() {
  const { ws } = useWorkspace();
  const { rows } = useLive<{ id: string; created_at: string }>("notes", ws.id, { filter: (q) => q.eq("kind", "note"), order: "created_at", asc: false });
  const [adding, setAdding] = useState(false);
  return (
    <Section id="notes" title="Notes" status="A shared scratchpad for the team." entryStatus={`${rows.length} notes shared with the team.`}
      actions={<AddButton label="Add note" onClick={() => setAdding(true)} />}>
      <RecordList table="notes" order="created_at" asc={false} filter={(q) => q.eq("kind", "note")} defaults={{ kind: "note" }} empty="No notes yet." adding={adding} onAdding={setAdding} author
        cols={[{ key: "title", label: "Title", className: "font-medium w-[240px]" }, { key: "body", label: "", className: "text-ink-2", render: (r) => <span className="line-clamp-2">{r.body}</span> }]}
        fields={[{ key: "title", label: "Title", wide: true }, { key: "body", label: "Note", type: "textarea" }]} />
    </Section>
  );
}
