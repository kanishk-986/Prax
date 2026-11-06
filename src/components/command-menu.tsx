"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft, User, PenLine, type LucideIcon } from "lucide-react";
import { NAV } from "@/components/sidebar";
import { supabase } from "@/lib/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { DraftPanelHost, openDraft } from "@/app/w/[slug]/studio/draft";

type Item = { id: string; label: string; hint?: string; Icon: LucideIcon; kind: "action" | "page" | "person"; go: string };

// Every page in the sidebar, in the same order and with the same icons (Settings is the last one).
const PAGES: { href: string; label: string; icon: LucideIcon }[] = NAV;
// Things to do, listed before people and pages. "comment", "write" and "reply" find it too.
const ACTIONS = [{ id: "a-draft", label: "Draft a comment", hint: "Paste a post, get drafts", Icon: PenLine, words: "draft a comment write reply" }];

/** Cmd+K: draft a comment, or jump to any page or person. Also hosts the Draft a comment panel. */
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
    const pages = PAGES.filter((p) => p.label.toLowerCase().includes(s)).map((p) => ({ id: "p" + p.href, label: p.label, Icon: p.icon, kind: "page" as const, go: `/w/${ws.slug}${p.href}` }));
    const ppl = s ? people.filter((p) => `${p.name} ${p.company}`.toLowerCase().includes(s)).slice(0, 6).map((p) => ({ id: p.id, label: p.name, hint: `${p.company} · ${p.stage}`, Icon: User, kind: "person" as const, go: `/w/${ws.slug}/pipeline?p=${p.id}` })) : [];
    const acts = ACTIONS.filter((a) => !s || a.words.includes(s)).map((a) => ({ id: a.id, label: a.label, hint: a.hint, Icon: a.Icon, kind: "action" as const, go: "" }));
    return [...acts, ...ppl, ...pages];
  }, [q, people, ws.slug]);

  const run = (it?: Item) => { if (!it) return; setOpen(false); if (it.kind === "action") openDraft(); else router.push(it.go); };
  // The panel host always sits in the same place, so opening or closing the menu never resets an open draft.
  return (
    <><DraftPanelHost />
    {open && <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/30 px-4 pt-[14vh]" onMouseDown={() => setOpen(false)}>
      <div className="anim-rise w-full max-w-[560px] overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-lg)]" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Command menu">
        <div className="flex h-14 items-center gap-3 border-b border-line px-4">
          <Search size={16} className="shrink-0 text-muted" aria-hidden="true" />
          <input ref={input} id="cmdk" value={q} onChange={(e) => { setQ(e.target.value); setI(0); }} placeholder="Draft a comment, or jump to a page or person"
            onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(x + 1, items.length - 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(x - 1, 0)); } if (e.key === "Enter") run(items[i]); }}
            className="h-full min-w-0 flex-1 bg-transparent text-title outline-none placeholder:text-muted" />
          <span className="kbd">esc</span>
        </div>
        <ul className="max-h-[380px] overflow-auto p-1.5">
          {items.length === 0 && <li className="px-3 py-6 text-center text-body text-muted">No matches</li>}
          {items.map((it, k) => (
            <li key={it.id}>
              {(k === 0 || items[k - 1].kind !== it.kind) && <div className="px-3 pt-2 pb-1 text-meta font-medium text-muted">{it.kind === "person" ? "People" : it.kind === "action" ? "Actions" : "Pages"}</div>}
              <button onMouseEnter={() => setI(k)} onClick={() => run(it)} className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-body ${k === i ? "bg-surface-2" : ""}`}>
                <it.Icon size={16} className="shrink-0 text-muted" aria-hidden="true" />
                <span className="truncate font-medium">{it.label}</span>
                {it.hint && <span className="truncate text-meta text-muted">{it.hint}</span>}
                <CornerDownLeft size={14} className={`ml-auto shrink-0 text-muted ${k === i ? "" : "invisible"}`} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>}
    </>
  );
}
