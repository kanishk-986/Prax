"use client";
// The Notes tab of the Playbook (S5): the team's shared scratchpad, with who wrote each note and when.
import { useState } from "react";
import { RecordList, AddButton } from "@/components/record-list";
import { useLive } from "@/lib/live";
import { useWorkspace } from "@/lib/workspace";

/** The Notes tab's header parts and body, for the Playbook's one Section. */
export function useNotesTab() {
  const { ws } = useWorkspace();
  const { rows } = useLive<{ id: string; created_at: string }>("notes", ws.id, { filter: (q) => q.eq("kind", "note"), order: "created_at", asc: false });
  const [adding, setAdding] = useState(false);
  const body = (
    <div data-tour="notes">
      <RecordList table="notes" order="created_at" asc={false} filter={(q) => q.eq("kind", "note")} defaults={{ kind: "note" }} empty="No notes yet." adding={adding} onAdding={setAdding} author
        cols={[{ key: "title", label: "Title", className: "font-medium w-[240px]" }, { key: "body", label: "", className: "text-ink-2", render: (r) => <span className="line-clamp-2">{r.body}</span> }]}
        fields={[{ key: "title", label: "Title", wide: true }, { key: "body", label: "Note", type: "textarea" }]} />
    </div>
  );
  return {
    count: rows.length,
    status: "A shared scratchpad for the team.",
    entryStatus: `${rows.length} notes shared with the team.`,
    actions: <AddButton label="Add note" onClick={() => setAdding(true)} />,
    body,
  };
}
