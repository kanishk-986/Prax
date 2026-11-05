"use client";
import { PageHeader } from "@/components/page-header";
import { RecordList } from "@/components/record-list";

export default function Templates() {
  return (
    <div className="mx-auto max-w-[1000px]">
      <PageHeader title="Templates" sub="Connection notes, first messages, resource replies and call offers" />
      <RecordList table="templates" order="sort" groupBy="kind" empty="No templates yet." defaults={{ kind: "note", sort: 0 }}
        cols={[{ key: "name", label: "Name", className: "font-medium w-[240px]" }, { key: "body", label: "Text", className: "text-ink-2", render: (r) => <span className="line-clamp-2">{r.body}</span> }]}
        fields={[{ key: "name", label: "Name", wide: true }, { key: "kind", label: "Type", type: "select", options: ["note", "message", "inmail", "reply", "post"] }, { key: "sort", label: "Order", type: "number" }, { key: "body", label: "Text", type: "textarea" }]} />
    </div>
  );
}
