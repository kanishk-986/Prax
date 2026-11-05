"use client";
import { Section, KpiTiles } from "@/components/shell";
import { useState } from "react";
import { RecordList, AddButton } from "@/components/record-list";
import { useLive } from "@/lib/live";
import { useWorkspace, fmtDay, addDays, today } from "@/lib/workspace";

export default function Notes() {
  const { ws } = useWorkspace();
  const { rows } = useLive<{ id: string; created_at: string }>("notes", ws.id, { filter: (q) => q.eq("kind", "note"), order: "created_at", asc: false });
  const d7 = addDays(today(), -7);
  const [adding, setAdding] = useState(false);
  return (
    <Section id="notes" title="Notes" status="A shared scratchpad for the team." entryStatus={`${rows.length} notes shared with the team.`}
      actions={<AddButton label="Add note" onClick={() => setAdding(true)} />}>
      <KpiTiles items={[
        { label: "Notes", value: rows.length, sub: "in total" },
        { label: "This week", value: rows.filter((r) => r.created_at.slice(0, 10) >= d7).length, sub: "last 7 days" },
        { label: "Latest note", value: rows[0] ? fmtDay(rows[0].created_at.slice(0, 10), { day: "numeric", month: "short" }) : "None", sub: rows[0] ? "added" : "nothing added yet" },
      ]} />
      <RecordList table="notes" order="created_at" asc={false} filter={(q) => q.eq("kind", "note")} defaults={{ kind: "note" }} empty="No notes yet." adding={adding} onAdding={setAdding}
        cols={[{ key: "title", label: "Title", className: "font-medium w-[240px]" }, { key: "body", label: "", className: "text-ink-2", render: (r) => <span className="line-clamp-2">{r.body}</span> }]}
        fields={[{ key: "title", label: "Title", wide: true }, { key: "body", label: "Note", type: "textarea" }]} />
    </Section>
  );
}
