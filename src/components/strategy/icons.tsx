import { Target, Users, Columns3, Globe, ListChecks, CalendarDays, MessageSquareText, Split, Zap, StickyNote } from "lucide-react";
import type { NodeType } from "@/lib/strategy";

const ICONS: Record<NodeType, React.ElementType> = {
  goal: Target, audience: Users, pillars: Columns3, regions: Globe, quota: ListChecks, content: CalendarDays,
  comments: MessageSquareText, condition: Split, action: Zap, note: StickyNote,
};
export function NodeIcon({ type, size = 16 }: { type: NodeType; size?: number }) {
  const I = ICONS[type];
  return <I size={size} strokeWidth={2} aria-hidden="true" />;
}
/** Settings nodes are ink, conditions red (the branch points), actions white on a hairline, notes grey. */
export function badgeStyle(type: NodeType): React.CSSProperties {
  if (type === "condition") return { background: "#d64545", color: "#fff" };
  if (type === "action") return { background: "#fff", color: "#141414", border: "1.5px solid #141414" };
  if (type === "note") return { background: "#ececec", color: "#2b2b2b" };
  return { background: "#141414", color: "#fff" };
}
