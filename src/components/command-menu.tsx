"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft, User, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useWorkspace } from "@/lib/workspace";

type Item = { id: string; label: string; hint?: string; icon: "page" | "person"; go: string };

const PAGES: [string, string][] = [["", "Dashboard"], ["/today", "Today"], ["/pipeline", "Pipeline"], ["/network", "Network"], ["/profile", "Profile Studio"], ["/studio-content", "Content Studio"], ["/studio", "Comment Studio"], ["/comments", "Engagement"], ["/templates", "Templates"], ["/citations", "AI citations"], ["/strategy", "Strategy"], ["/notes", "Notes"], ["/settings", "Settings"]];

/** Cmd+K: jump to any page or person. */
export function CommandMenu() {
  const { ws } = useWorkspace();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const [people, setPeople] = useState<{ id: string; name: string; company: string; stage: string }[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    const o = () => setOpen(true);
    window.addEventListener("keydown", k); window.addEventListener("prax:cmdk", o);
    return () => { window.removeEventListener("keydown", k); window.removeEventListener("prax:cmdk", o); };
  }, []);
  useEffect(() => {
    if (!open) return;
    setQ(""); setI(0); setTimeout(() => input.current?.focus(), 10);
    supabase().from("prospects").select("id,name,company,stage").eq("workspace_id", ws.id).then(({ data }: { data: any }) => setPeople(data ?? []));
  }, [open, ws.id]);

  const items: Item[] = useMemo(() => {
    const s = q.toLowerCase();
    const pages = PAGES.filter(([, l]) => l.toLowerCase().includes(s)).map(([h, l]) => ({ id: "p" + h, label: l, hint: "Go to", icon: "page" as const, go: `/w/${ws.slug}${h}` }));
    const ppl = s ? people.filter((p) => `${p.name} ${p.company}`.toLowerCase().includes(s)).slice(0, 6).map((p) => ({ id: p.id, label: p.name, hint: `${p.company} · ${p.stage}`, icon: "person" as const, go: `/w/${ws.slug}/pipeline?p=${p.id}` })) : [];
    return [...ppl, ...pages];
  }, [q, people, ws.slug]);

  if (!open) return null;
  const run = (it?: Item) => { if (!it) return; setOpen(false); router.push(it.go); };
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/30 px-4 pt-[14vh]" onMouseDown={() => setOpen(false)}>
      <div className="anim-rise w-full max-w-[560px] overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-lg)]" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Command menu">
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={16} className="text-faint" />
          <input ref={input} id="cmdk" value={q} onChange={(e) => { setQ(e.target.value); setI(0); }} placeholder="Jump to a page or person"
            onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(x + 1, items.length - 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(x - 1, 0)); } if (e.key === "Enter") run(items[i]); }}
            className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint" />
          <span className="kbd">esc</span>
        </div>
        <ul className="max-h-[360px] overflow-auto p-1.5">
          {items.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted">No matches</li>}
          {items.map((it, k) => (
            <li key={it.id}>
              <button onMouseEnter={() => setI(k)} onClick={() => run(it)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] ${k === i ? "bg-surface-2" : ""}`}>
                {it.icon === "person" ? <User size={15} className="text-muted" /> : <ArrowRight size={15} className="text-muted" />}
                <span className="font-medium">{it.label}</span>
                <span className="truncate text-muted">{it.hint}</span>
                {k === i && <CornerDownLeft size={14} className="ml-auto text-faint" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
