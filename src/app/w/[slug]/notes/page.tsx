"use client";
import { PageHeader } from "@/components/page-header";
import { RecordList } from "@/components/record-list";

export default function Notes() {
  return (
    <div className="mx-auto max-w-[1000px]">
      <PageHeader title="Notes" sub="A shared scratchpad for the team" />
      <RecordList table="notes" order="created_at" asc={false} filter={(q) => q.eq("kind", "note")} defaults={{ kind: "note" }} empty="No notes yet."
        cols={[{ key: "title", label: "Title", className: "font-medium w-[240px]" }, { key: "body", label: "", className: "text-ink-2", render: (r) => <span className="line-clamp-2">{r.body}</span> }]}
        fields={[{ key: "title", label: "Title", wide: true }, { key: "body", label: "Note", type: "textarea" }]} />
    </div>
  );
}
