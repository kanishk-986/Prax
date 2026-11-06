"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useWorkspace } from "@/lib/workspace";

type T = { id: string; author_email: string; body: string; created_at: string; ref_id: string; ref_table: string };

/** Discussion on any record. Commenters and up can post; everyone with access can read. */
export function Threads({ refTable, refId }: { refTable: string; refId: string }) {
  const { ws, can, email } = useWorkspace();
  const { rows } = useLive<T>("threads", ws.id, { order: "created_at", filter: (q) => q.eq("ref_id", refId) });
  const [body, setBody] = useState("");
  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    await supabase().from("threads").insert({ workspace_id: ws.id, ref_table: refTable, ref_id: refId, body: body.trim(), author_email: email });
    setBody("");
  }
  return (
    <section>
      <div className="label mb-2">Discussion</div>
      <ul className="flex flex-col gap-2">
        {rows.length === 0 && <li className="text-body text-muted">No comments yet.</li>}
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg bg-surface-2 px-3 py-2 text-body">
            <div className="text-meta text-muted">{r.author_email || "Someone"} · {new Date(r.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
            <div className="mt-0.5 whitespace-pre-wrap">{r.body}</div>
          </li>
        ))}
      </ul>
      {can("commenter") && (
        <form onSubmit={post} className="mt-2 flex gap-2">
          <input id={`th-${refId}`} className="field" placeholder="Add a comment" value={body} onChange={(e) => setBody(e.target.value)} />
          <button className="btn">Post</button>
        </form>
      )}
    </section>
  );
}
