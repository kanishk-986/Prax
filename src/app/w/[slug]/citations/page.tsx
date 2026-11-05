"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Check } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useWorkspace, today, weekStart, addDays, fmtDay } from "@/lib/workspace";
import { PageHeader } from "@/components/page-header";
import { useToast, haptic } from "@/components/toaster";

type Q = { id: string; question: string; topic: string; region: string; sort: number };
type R = { question_id: string; week_start: string; tool: string; cited: boolean };
const TOOLS = [["chatgpt", "ChatGPT"], ["perplexity", "Perplexity"], ["gemini", "Gemini"], ["claude", "Claude"]] as const;

export default function Citations() {
  const { ws, can } = useWorkspace();
  const editable = can("editor");
  const [wk, setWk] = useState(weekStart(today()));
  const qs = useLive<Q>("citation_questions", ws.id, { order: "sort" });
  const rs = useLive<R>("citation_results", ws.id, { filter: (q) => q.eq("week_start", wk) });
  const [newQ, setNewQ] = useState("");
  const toast = useToast();
  const has = (qid: string, tool: string) => rs.rows.some((r) => r.question_id === qid && r.tool === tool && r.cited);
  const total = rs.rows.filter((r) => r.cited).length;

  async function toggle(qid: string, tool: string) {
    if (!editable) return;
    const cited = !has(qid, tool);
    rs.setRows((rows) => [...rows.filter((r) => !(r.question_id === qid && r.tool === tool)), { question_id: qid, tool, cited } as R]);
    haptic();
    const { error } = await supabase().from("citation_results").upsert({ workspace_id: ws.id, question_id: qid, week_start: wk, tool, cited });
    if (error) toast(error.message);
    rs.reload();
  }
  async function add(e: React.FormEvent) {
    e.preventDefault(); if (!newQ.trim()) return;
    const { error } = await supabase().from("citation_questions").insert({ workspace_id: ws.id, question: newQ.trim(), sort: qs.rows.length + 1 });
    if (error) { toast(error.message); return; }
    haptic(); toast("Question added"); setNewQ("");
  }

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader title="AI citations" sub="Run each buyer question in four AI tools every Friday and tick where this profile or its company is cited">
        <div className="flex items-center gap-1">
          <button className="btn btn-ghost" aria-label="Previous week" onClick={() => setWk(addDays(wk, -7))}><ChevronLeft size={16} /></button>
          <span className="text-[13px] font-medium">Week of {fmtDay(wk, { day: "numeric", month: "short" })}</span>
          <button className="btn btn-ghost" aria-label="Next week" onClick={() => setWk(addDays(wk, 7))}><ChevronRight size={16} /></button>
        </div>
      </PageHeader>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="card px-4 py-3"><div className="label">Cited this week</div><div className="num mt-1 text-[20px] font-semibold">{total}<span className="text-[14px] text-faint"> / {qs.rows.length * 4}</span></div></div>
        {TOOLS.map(([k, l]) => <div key={k} className="card px-4 py-3"><div className="label">{l}</div><div className="num mt-1 text-[20px] font-semibold">{rs.rows.filter((r) => r.tool === k && r.cited).length}</div></div>)}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-line text-left"><th className="label px-4 py-2.5">Buyer question</th><th className="label px-4 py-2.5">Topic</th><th className="label px-4 py-2.5">Region</th>{TOOLS.map(([k, l]) => <th key={k} className="label px-3 py-2.5 text-center">{l}</th>)}</tr></thead>
          <tbody>{qs.rows.map((q) => (
            <tr key={q.id} className="border-b border-line last:border-0">
              <td className="px-4 py-2.5 font-medium">{q.question}</td><td className="px-4 py-2.5 text-muted">{q.topic}</td><td className="px-4 py-2.5 text-muted">{q.region}</td>
              {TOOLS.map(([k, l]) => (
                <td key={k} className="px-3 py-2.5 text-center">
                  <button disabled={!editable} onClick={() => toggle(q.id, k)} aria-label={`${l} cites us`} className={`inline-grid h-6 w-6 place-items-center rounded-md border ${has(q.id, k) ? "border-good bg-good text-white" : "border-line-strong hover:border-ink-2"}`}>{has(q.id, k) && <Check size={13} strokeWidth={3} />}</button>
                </td>
              ))}
            </tr>
          ))}</tbody>
        </table>
        {editable && <form onSubmit={add} className="flex gap-2 border-t border-line p-3"><input id="nq" className="field" placeholder="Add a buyer question, e.g. Who builds stablecoin payment infrastructure for banks in the UAE?" value={newQ} onChange={(e) => setNewQ(e.target.value)} /><button className="btn"><Plus size={14} /> Add</button></form>}
      </div>
    </div>
  );
}
