"use client";
// Pipeline data: loads leads, pipelines and the signals behind heat from Supabase, and builds the actions the
// screen and the lead page take. Used by /pipeline and /pipeline/[id]; the logic is src/lib/pipeline.ts.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useWorkspace, today } from "@/lib/workspace";
import { askExtension } from "@/lib/bridge";
import type { Person } from "@/lib/network";
import { FALLBACK_PIPELINE, TEMPLATES, DEFAULT_LOST_REASONS, type Pipeline, type Prospect, type StageMove } from "@/lib/pipeline";
import type { DayItem, LeadComment, LeadDetail, Member, Note, PipelineApi, PipelineData, Result } from "./types";

const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const DM_RULES = "You draft short LinkedIn direct messages for a senior executive. Plain, specific and warm, never salesy. No em dashes, no contractions, no emoji.";
const NET_COLS = "key,url,name,company,position,is_connection,connected_on,msg_count,msg_last,msg_last_from,prospect_id,not_prospects";

async function loadNetwork(wsId: string): Promise<Person[]> {
  const out: Person[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase().from("network_people").select(NET_COLS).eq("workspace_id", wsId).order("key").range(from, from + 999);
    if (error || !data?.length) break;
    out.push(...(data as unknown as Person[]));
    if (data.length < 1000) break;
  }
  return out;
}

export function usePipeline(): { data: PipelineData; api: PipelineApi } {
  const { ws, can, email } = useWorkspace();
  const editable = can("editor");
  const { rows, setRows, loading } = useLive<Prospect>("prospects", ws.id, { order: "created_at" });
  const comments = useLive<LeadComment>("comment_log", ws.id, { filter: (q) => q.select("id,prospect_id,author,reply,day") });
  const [pipes, setPipes] = useState<Pipeline[] | null>(null);
  const [ready, setReady] = useState(false);
  const [reasons, setReasons] = useState<string[]>(DEFAULT_LOST_REASONS);
  const [members, setMembers] = useState<Member[]>([]);
  const [network, setNetwork] = useState<Person[]>([]);

  // Pipelines from db/015; before it has run, everyone sits in one Outreach pipeline.
  const loadPipes = useCallback(async () => {
    const { data, error } = await supabase().from("pipelines").select("*").eq("workspace_id", ws.id).order("sort").order("created_at");
    if (error) { setReady(false); setPipes([FALLBACK_PIPELINE]); return; }
    let list = (data as Pipeline[]) ?? [];
    if (!list.length && editable) {
      const t = TEMPLATES[0];
      const r = await supabase().from("pipelines").insert({ workspace_id: ws.id, name: t.name, template: t.key, stages: t.stages, won_stage: t.won, lost_stage: t.lost, sort: 0 }).select().single();
      if (r.data) list = [r.data as Pipeline];
    }
    setReady(true); setPipes(list.length ? list : [FALLBACK_PIPELINE]);
    const lr = await supabase().from("lost_reasons").select("label").eq("workspace_id", ws.id).order("sort").order("created_at");
    if (!lr.error && lr.data?.length) setReasons((lr.data as { label: string }[]).map((x) => x.label));
  }, [ws.id, editable]);
  useEffect(() => { loadPipes(); }, [loadPipes]);
  useEffect(() => {
    supabase().from("members").select("user_id,email").eq("workspace_id", ws.id).then(({ data }: { data: unknown }) => setMembers((data as Member[]) ?? []));
    loadNetwork(ws.id).then(setNetwork);
  }, [ws.id]);

  const data: PipelineData = useMemo(() => ({
    ready, loading: loading || !pipes, leads: rows, pipes: pipes ?? [FALLBACK_PIPELINE], reasons, members, comments: comments.rows, network,
  }), [ready, loading, rows, pipes, reasons, members, comments.rows, network]);

  const patchRow = useCallback((id: string, patch: Partial<Prospect>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r))), [setRows]);

  const api: PipelineApi = useMemo(() => ({
    async update(id, patch) {
      const was = rows.find((r) => r.id === id);
      patchRow(id, patch);
      const { error } = await supabase().from("prospects").update(patch).eq("id", id);
      if (error) { if (was) patchRow(id, was); return fail(error.message); }
      return ok(null);
    },

    async move(l, m, p) {
      const stay = m.to === l.stage, lost = m.to === p.lost_stage;
      const prev: Partial<Prospect> = { stage: l.stage, next_action: l.next_action, next_date: l.next_date, notes: l.notes, ...(ready ? { lost_reason: l.lost_reason ?? "" } : {}) };
      const patch: Partial<Prospect> = { stage: m.to, next_action: m.action.trim(), next_date: m.date };
      if (ready) patch.lost_reason = lost ? (stay ? l.lost_reason ?? "" : m.reason) : "";
      else if (lost && !stay && m.reason) patch.notes = `${l.notes ? l.notes + "\n\n" : ""}${m.to} ${today()}: ${m.reason}`;
      patchRow(l.id, { ...patch, ...(stay ? {} : { stage_changed_at: new Date().toISOString() }) });
      const { error } = await supabase().from("prospects").update(patch).eq("id", l.id);
      if (error) { patchRow(l.id, { ...prev, stage_changed_at: l.stage_changed_at }); return fail(error.message); }
      // The trigger logs a move; a Done is logged here. Undo removes the log and anything after it.
      let since: string | null = null;
      if (ready) {
        if (stay) {
          const r = await supabase().from("stage_moves").insert({ workspace_id: ws.id, prospect_id: l.id, pipeline_id: l.pipeline_id ?? p.id, kind: "done", from_stage: l.stage, to_stage: l.stage, prev_action: l.next_action ?? "", next_action: patch.next_action, next_date: m.date }).select("at").single();
          since = (r.data as { at: string } | null)?.at ?? null;
        } else {
          const r = await supabase().from("stage_moves").select("at").eq("prospect_id", l.id).order("at", { ascending: false }).limit(1);
          since = (r.data as { at: string }[] | null)?.[0]?.at ?? null;
        }
      }
      return ok(async () => {
        patchRow(l.id, { ...prev, stage_changed_at: l.stage_changed_at });
        await supabase().from("prospects").update(prev).eq("id", l.id);
        if (!stay) await supabase().from("prospects").update({ stage_changed_at: l.stage_changed_at }).eq("id", l.id);
        if (since) await supabase().from("stage_moves").delete().eq("prospect_id", l.id).gte("at", since);
      });
    },

    async add(list) {
      const { data: made, error } = await supabase().from("prospects").insert(list.map((r) => ({ ...r, workspace_id: ws.id }))).select("id");
      if (error) return fail(error.message);
      return ok(((made as { id: string }[]) ?? []).map((x) => x.id));
    },
    async remove(ids) {
      setRows((rs) => rs.filter((r) => !ids.includes(r.id)));
      const { error } = await supabase().from("prospects").delete().in("id", ids);
      return error ? fail(error.message) : ok(null);
    },
    async linkNetwork(pairs) {
      for (const x of pairs) await supabase().from("network_people").update({ prospect_id: x.prospectId }).eq("workspace_id", ws.id).eq("key", x.key).is("prospect_id", null);
      setNetwork((n) => n.map((p) => { const hit = pairs.find((x) => x.key === p.key); return hit ? { ...p, prospect_id: hit.prospectId } : p; }));
    },

    async createPipeline(p) {
      const { data: made, error } = await supabase().from("pipelines").insert({ ...p, workspace_id: ws.id }).select().single();
      if (error) return fail(error.message);
      setPipes((ps) => [...(ps ?? []), made as Pipeline]);
      return ok(made as Pipeline);
    },
    async deletePipeline(id) {
      const { error } = await supabase().from("pipelines").delete().eq("id", id);
      if (error) return fail(error.message);
      setPipes((ps) => (ps ?? []).filter((p) => p.id !== id));
      return ok(null);
    },
    async saveStages(p, stages, renames) {
      for (const [a, b] of renames) {
        const { error } = await supabase().rpc("rename_pipeline_stage", { pid: p.id, old_name: a, new_name: b });
        if (error) return fail(error.message);
      }
      const won = stages.includes(p.won_stage) ? p.won_stage : renames.find(([a]) => a === p.won_stage)?.[1] ?? "";
      const lost = stages.includes(p.lost_stage) ? p.lost_stage : renames.find(([a]) => a === p.lost_stage)?.[1] ?? "";
      const { error } = await supabase().from("pipelines").update({ stages, won_stage: won, lost_stage: lost }).eq("id", p.id);
      if (error) return fail(error.message);
      setPipes((ps) => (ps ?? []).map((x) => (x.id === p.id ? { ...x, stages, won_stage: won, lost_stage: lost } : x)));
      if (renames.length) setRows((rs) => rs.map((r) => { const hit = (r.pipeline_id ?? "") === p.id && renames.find(([a]) => a === r.stage); return hit ? { ...r, stage: hit[1] } : r; }));
      return ok(null);
    },
    async addReason(label) {
      if (ready) {
        const { error } = await supabase().from("lost_reasons").insert({ workspace_id: ws.id, label, sort: reasons.length + 1 });
        if (error) return fail(error.message);
      }
      setReasons((r) => [...r, label]);
      return ok(null);
    },

    async detail(l) {
      const [mv, it, nt] = await Promise.all([
        ready ? supabase().from("stage_moves").select("*").eq("prospect_id", l.id).order("at")
          : supabase().from("activity").select("id,label,at").eq("workspace_id", ws.id).eq("kind", "stage").eq("ref_id", l.id).order("at"),
        supabase().from("daily_items").select("id,day,kind,title,done,note,done_at,created_at").eq("workspace_id", ws.id).eq("prospect_id", l.id).limit(300),
        supabase().from("threads").select("id,author_email,body,created_at").eq("workspace_id", ws.id).eq("ref_id", l.id).order("created_at"),
      ]);
      const moves: StageMove[] = ready ? ((mv.data as StageMove[]) ?? [])
        : ((mv.data as { id: string; label: string; at: string }[]) ?? []).map((a, i, all) => ({ id: a.id, prospect_id: l.id, kind: "backfill", from_stage: i ? all[i - 1].label.replace(/^.* → /, "") : "", to_stage: a.label.replace(/^.* → /, ""), prev_action: "", next_action: "", next_date: null, reason: "", at: a.at }));
      return { moves, items: (it.data as DayItem[]) ?? [], notes: (nt.data as Note[]) ?? [] } satisfies LeadDetail;
    },

    async step(l, key, title, done) {
      const { data: have } = await supabase().from("daily_items").select("id,done").eq("workspace_id", ws.id).in("note", [key, `skip:${key}`]).limit(1);
      let id = (have as { id: string }[] | null)?.[0]?.id;
      if (!id) {
        // Comment steps sit with comments on Today, the rest with follow-ups (see groupOf in src/lib/dashboard.ts).
        let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
        const base = /comment/i.test(title) ? 2000 : 4000;
        for (let n = 0; n < 6 && !id; n++) {
          const r = await supabase().from("daily_items").insert({ workspace_id: ws.id, day: today(), kind: "custom", idx: base + ((h + n) % 1000), title: `${title}: ${l.name}${l.company ? `, ${l.company}` : ""}`, link: `/w/${ws.slug}/pipeline?p=${l.id}`, note: key, prospect_id: l.id }).select("id").single();
          if (r.error && r.error.code !== "23505") return fail(r.error.message);
          id = (r.data as { id: string } | null)?.id;
        }
        if (!id) return fail("Today is full for this slot. Try again.");
      }
      if (done != null) {
        const { error } = await supabase().from("daily_items").update({ done }).eq("id", id);
        if (error) return fail(error.message);
      }
      return ok(null);
    },
    async addNote(l, body) {
      const { error } = await supabase().from("threads").insert({ workspace_id: ws.id, ref_table: "prospects", ref_id: l.id, body, author_email: email });
      return error ? fail(error.message) : ok(null);
    },
    draft: (prompt) => askExtension<string>("ai", { job: "comment", section: "pipeline", plain: true, kind: "pipeline", rules: DM_RULES, user: prompt }),
  }), [rows, ready, ws.id, ws.slug, email, reasons.length, patchRow, setRows]);

  return { data, api };
}
