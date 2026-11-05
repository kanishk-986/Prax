"use client";
import { useState } from "react";
import { Section, KpiTiles } from "@/components/shell";
import { RecordList, AddButton } from "@/components/record-list";
import { useLive } from "@/lib/live";
import { useWorkspace } from "@/lib/workspace";

// The type column stores short words; people read these names. Resource replies and call offers were saved as
// messages before they had their own type, so their names place them too.
const KIND_LABEL: Record<string, string> = { note: "Connection note", message: "Message", inmail: "InMail", reply: "Reply", post: "Post", resource: "Resource reply", call: "Call offer" };
const GROUPS = ["Connection notes", "Messages", "Replies and posts", "Resource replies", "Call offers"];
const groupOf = (r: { kind?: string; name?: string }) => {
  const n = (r.name ?? "").toLowerCase();
  if (r.kind === "resource" || n.startsWith("resource reply")) return "Resource replies";
  if (r.kind === "call" || n.startsWith("call offer")) return "Call offers";
  if (r.kind === "note") return "Connection notes";
  if (r.kind === "reply" || r.kind === "post") return "Replies and posts";
  return "Messages";
};

export default function Templates() {
  const { ws } = useWorkspace();
  const { rows } = useLive<{ id: string; kind: string; name: string }>("templates", ws.id, {});
  const [adding, setAdding] = useState(false);
  const n = (g: string) => rows.filter((r) => groupOf(r) === g).length;
  return (
    <Section id="templates" title="Templates" status="Connection notes, first messages, resource replies and call offers." entryStatus={`${rows.length} templates ready to copy.`}
      actions={<AddButton label="Add template" onClick={() => setAdding(true)} />}>
      <KpiTiles items={[
        { label: "Templates", value: rows.length, sub: "in total", tone: "dark" },
        { label: "Connection notes", value: n("Connection notes") },
        { label: "Messages", value: n("Messages"), sub: `${n("Resource replies") + n("Call offers")} resource replies and call offers` },
        { label: "Replies and posts", value: n("Replies and posts") },
      ]} />
      <RecordList table="templates" order="sort" groupBy={groupOf} groupOrder={GROUPS} empty="No templates yet." defaults={{ kind: "note", sort: 0 }} adding={adding} onAdding={setAdding}
        cols={[{ key: "name", label: "Name", className: "font-medium w-[240px]" }, { key: "body", label: "Text", className: "text-ink-2", render: (r) => <span className="line-clamp-2">{r.body}</span> }]}
        fields={[{ key: "name", label: "Name", wide: true }, { key: "kind", label: "Type", type: "select", options: Object.keys(KIND_LABEL), optionLabels: KIND_LABEL }, { key: "sort", label: "Order", type: "number" }, { key: "body", label: "Text", type: "textarea" }]} />
    </Section>
  );
}
