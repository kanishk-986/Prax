"use client";
// Inbox (X7): loads the three sources live and hands them to the Inbox screen. See src/lib/inbox.ts.
import { useMemo } from "react";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { askExtension } from "@/lib/bridge";
import { useWorkspace, today as todayOf, addDays } from "@/lib/workspace";
import { whoLine } from "@/lib/persona";
import { buildInbox, replyPrompt, type InboxDm, type InboxLead, type InboxPipeline, type InboxReply, type InboxState } from "@/lib/inbox";
import { InboxScreen, type InboxApi } from "@/components/inbox/inbox-screen";

const DM_RULES = "You draft short LinkedIn direct messages for a senior executive. Plain, specific and warm, never salesy. No em dashes, no contractions, no emoji.";

export default function InboxPage() {
  const { ws } = useWorkspace();
  const t = todayOf();
  const leads = useLive<InboxLead>("prospects", ws.id);
  const pipes = useLive<InboxPipeline>("pipelines", ws.id);
  const moves = useLive<{ prospect_id: string; at: string }>("stage_moves", ws.id, { filter: (q) => q.gte("at", new Date(addDays(t, -120) + "T00:00:00").toISOString()) });
  const replies = useLive<InboxReply>("comment_log", ws.id, { filter: (q) => q.eq("reply", true).gte("day", addDays(t, -60)) });
  const dms = useLive<InboxDm>("inbox_messages", ws.id, { order: "received_at", asc: false, filter: (q) => q.limit(500) });
  const states = useLive<InboxState>("inbox_state", ws.id);

  const lastTouch = useMemo(() => {
    const m: Record<string, string> = {};
    moves.rows.forEach((x) => { if (!m[x.prospect_id] || x.at > m[x.prospect_id]) m[x.prospect_id] = x.at; });
    return m;
  }, [moves.rows]);
  const result = useMemo(() => buildInbox({ leads: leads.rows, pipelines: pipes.error ? [] : pipes.rows, replies: replies.rows, dms: dms.error ? [] : dms.rows, states: states.error ? [] : states.rows, lastTouch, today: t }),
    [leads.rows, pipes.rows, pipes.error, replies.rows, dms.rows, dms.error, states.rows, states.error, lastTouch, t]);

  const api: InboxApi = useMemo(() => ({
    async mark(keys, patch) {
      const at = new Date().toISOString();
      const { error } = await supabase().from("inbox_state").upsert(keys.map((key) => ({ workspace_id: ws.id, key, ...patch, updated_at: at })), { onConflict: "workspace_id,key" });
      if (!error) states.reload();
      return error ? error.message : null;
    },
    async add(m) {
      const { error } = await supabase().from("inbox_messages").insert({ workspace_id: ws.id, ...m, source: "manual" });
      if (!error) dms.reload();
      return error ? error.message : null;
    },
    draft: (it) => {
      const lead = it.prospectId ? leads.rows.find((l) => l.id === it.prospectId) : undefined;
      return askExtension<string>("ai", { plain: true, kind: "pipeline", rules: DM_RULES, user: replyPrompt(it, whoLine(ws), lead?.next_action ? `Planned next step: ${lead.next_action}` : "") });
    },
    fallback: (it) => `Hi ${it.person.split(/\s+/)[0]}, thank you for your message. `,
  }), [ws, leads.rows, states, dms]);

  return <InboxScreen api={api} data={{ result, loading: leads.loading || replies.loading, missing: dms.error || states.error, today: t,
    leads: leads.rows.map((l) => ({ id: l.id, name: l.name, company: l.company, linkedin: l.linkedin })) }} />;
}
