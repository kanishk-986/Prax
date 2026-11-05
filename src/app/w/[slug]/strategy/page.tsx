"use client";
import { PageHeader } from "@/components/page-header";
import { RecordList } from "@/components/record-list";

export default function Strategy() {
  return (
    <div className="mx-auto max-w-[1000px]">
      <PageHeader title="Strategy" sub="The agreed plan for this profile" />
      <RecordList table="notes" order="sort" filter={(q) => q.eq("kind", "strategy")} defaults={{ kind: "strategy", sort: 0 }} empty="No strategy sections yet."
        cols={[{ key: "title", label: "Section", className: "font-medium w-[240px]" }, { key: "body", label: "", className: "text-ink-2 whitespace-pre-line", render: (r) => <span className="line-clamp-4">{r.body}</span> }]}
        fields={[{ key: "title", label: "Section title", wide: true }, { key: "sort", label: "Order", type: "number" }, { key: "body", label: "Text", type: "textarea" }]} />
    </div>
  );
}
