"use client";
import { Section, KpiTiles } from "@/components/shell";
import { RecordList } from "@/components/record-list";
import { useLive } from "@/lib/live";
import { useWorkspace } from "@/lib/workspace";

export default function Templates() {
  const { ws } = useWorkspace();
  const { rows } = useLive<{ id: string; kind: string }>("templates", ws.id, {});
  const n = (k: string) => rows.filter((r) => r.kind === k).length;
  return (
    <Section id="templates" title="Templates" status="Connection notes, first messages, resource replies and call offers." entryStatus={`${rows.length} templates ready to copy.`}>
      <KpiTiles items={[
        { label: "Templates", value: rows.length, sub: "in total", tone: "dark" },
        { label: "Connection notes", value: n("note") },
        { label: "Messages", value: n("message") + n("inmail") },
        { label: "Replies and posts", value: n("reply") + n("post") },
      ]} />
      <RecordList table="templates" order="sort" groupBy="kind" empty="No templates yet." defaults={{ kind: "note", sort: 0 }}
        cols={[{ key: "name", label: "Name", className: "font-medium w-[240px]" }, { key: "body", label: "Text", className: "text-ink-2", render: (r) => <span className="line-clamp-2">{r.body}</span> }]}
        fields={[{ key: "name", label: "Name", wide: true }, { key: "kind", label: "Type", type: "select", options: ["note", "message", "inmail", "reply", "post"] }, { key: "sort", label: "Order", type: "number" }, { key: "body", label: "Text", type: "textarea" }]} />
    </Section>
  );
}
