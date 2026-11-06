"use client";
import { useEffect, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { Section } from "@/components/shell";
import { useLive } from "@/lib/live";
import { useWorkspace } from "@/lib/workspace";
import { supabase } from "@/lib/supabase/client";
import { repairFields } from "@/lib/text";
import { useToast, haptic } from "@/components/toaster";
import { useAuthors } from "@/components/record-list";
import { TemplateCard, AddCard, CardSkeleton, Badge, ACCENTS } from "@/components/templates/cards";
import { TemplateDialog, type Draft } from "@/components/templates/dialog";
import { STARTERS, nextSort, purposeCounts, purposeOf, visibleTemplates, type Purpose, type Template } from "@/lib/templates";

type Open = { rec: Template | null; origin: DOMRect | null; edit: boolean };

export default function Templates() {
  const { ws, can } = useWorkspace();
  const live = useLive<Template>("templates", ws.id, { order: "sort" });
  const { rows, loading, error } = live;
  const editable = can("editor");
  const toast = useToast();
  const authorOf = useAuthors();
  const [purpose, setPurpose] = useState("All");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Open | null>(null);
  // The staggered entrance runs once, on the first load; cards that appear later (filter, search, add) just show.
  const [intro, setIntro] = useState(true);
  useEffect(() => { if (!loading) { const t = setTimeout(() => setIntro(false), 900); return () => clearTimeout(t); } }, [loading]);

  const chips = purposeCounts(rows);
  const active = chips.some((c) => c.id === purpose) ? purpose : "All";
  const list = visibleTemplates(rows, active, query);
  const filtered = active !== "All" || !!query.trim();

  const start = (rec: Template | null, el: HTMLElement | null, edit = false) => setOpen({ rec, origin: el?.getBoundingClientRect() ?? null, edit });

  async function save(rec: Template | null, d: Draft) {
    const clean = repairFields({ name: d.name, kind: d.kind, body: d.body });
    const res = rec ? await supabase().from("templates").update(clean).eq("id", rec.id).select().maybeSingle()
      : await supabase().from("templates").insert({ ...clean, workspace_id: ws.id, sort: nextSort(rows) }).select().maybeSingle();
    if (res.error) { toast(res.error.message); return false; }
    haptic(); toast(rec ? "Saved" : "Template added");
    await live.reload();
    if (rec) setOpen((o) => (o ? { ...o, rec: { ...rec, ...clean } } : o));
    else setOpen(null);
    return true;
  }

  async function remove(rec: Template) {
    setOpen(null);
    live.setRows((l) => l.filter((r) => r.id !== rec.id));
    const { error } = await supabase().from("templates").delete().eq("id", rec.id);
    if (error) { toast(error.message); live.reload(); return; }
    haptic();
    toast("Template deleted", async () => {
      const { error } = await supabase().from("templates").insert(rec);
      if (error) toast(error.message); else toast("Template restored");
      live.reload();
    });
  }

  async function addStarters(items: typeof STARTERS) {
    const base = nextSort(rows);
    const { error } = await supabase().from("templates").insert(items.map((s, i) => ({ ...s, workspace_id: ws.id, sort: base + i })));
    if (error) { toast(error.message); return; }
    haptic(); toast(items.length === 1 ? "Template added" : `${items.length} templates added`);
    live.reload();
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast("Copied"); } catch { toast("Could not copy. Select the text and copy it instead."); }
  }

  const byline = (r: Template) => {
    const at = r.updated_at || r.created_at;
    if (!at && !r.created_by) return undefined;
    const who = authorOf({ created_by: r.created_by, created_at: at });
    return `${r.updated_at ? "Updated" : "Added"} ${who.at}${who.name ? ` by ${who.name}` : ""}`;
  };

  return (
    <Section id="templates" title="Templates" status="Notes, messages, replies and offers, ready to copy into LinkedIn."
      entryStatus={`${rows.length} templates ready to copy.`}
      primary={editable ? <button type="button" className="btn btn-primary h-10 px-4" onClick={(e) => start(null, e.currentTarget, true)}><Plus size={15} /> Add template</button> : undefined}>

      {!loading && !error && rows.length > 0 && (
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-1.5">
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:contents" role="group" aria-label="Filter by type">
            {chips.map((c) => (
              <button key={c.id} type="button" aria-pressed={active === c.id} onClick={() => setPurpose(c.id)} className={`pl-chip small inline-flex shrink-0 items-center gap-1.5 px-2.5! ${active === c.id ? "on" : ""}`}>
                {c.id !== "All" && <span className="tpl-dot" style={{ background: ACCENTS[c.id as Purpose].edge }} aria-hidden />}
                {c.id}<span className={`num ${active === c.id ? "text-white/70" : "text-muted"}`}>{c.count}</span>
              </button>
            ))}
          </div>
          <label className="relative block w-full md:ml-auto md:w-[240px]">
            <span className="sr-only">Search templates</span>
            <Search size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" aria-hidden />
            <input type="search" className="field h-9 pr-8 pl-8" placeholder="Search templates" value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); }} />
            {query && <button type="button" className="absolute top-1/2 right-1.5 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink" aria-label="Clear search" onClick={() => setQuery("")}><X size={14} /></button>}
          </label>
        </div>
      )}

      {loading ? (
        <div className="tpl-grid">{[0, 1, 2, 3, 4, 5].map((i) => <CardSkeleton key={i} />)}</div>
      ) : error ? (
        <div className="panel flex flex-col items-start gap-2 px-6 py-7">
          <h2 className="text-title font-semibold">Templates could not be loaded</h2>
          <p className="text-body text-muted">Check the connection and try again.</p>
          <button type="button" className="btn mt-2" onClick={() => live.reload()}>Try again</button>
        </div>
      ) : rows.length === 0 ? (
        <FirstRun editable={editable} onAdd={addStarters} onBlank={(el) => start(null, el, true)} />
      ) : list.length === 0 ? (
        <div className="panel flex flex-col items-start gap-2 px-6 py-7">
          <h2 className="text-title font-semibold">No templates match</h2>
          <p className="text-body text-muted">{query.trim() ? <>Nothing {active !== "All" ? `in ${active} ` : ""}mentions &ldquo;{query.trim()}&rdquo;.</> : "None of this type yet."}</p>
          <button type="button" className="btn mt-2" onClick={() => { setQuery(""); setPurpose("All"); }}>Show all templates</button>
        </div>
      ) : (
        <div className="tpl-grid" aria-live="polite">
          {list.map((t, i) => (
            <TemplateCard key={t.id} t={t} index={i} intro={intro} editable={editable}
              onOpen={(el) => start(t, el)} onEdit={(el) => start(t, el, true)} onDelete={() => remove(t)} />
          ))}
          {editable && !filtered && <AddCard index={list.length} intro={intro} onClick={(el) => start(null, el, true)} />}
        </div>
      )}

      {open && (
        <TemplateDialog key={open.rec?.id ?? "new"} rec={open.rec} origin={open.origin} startEditing={open.edit} editable={editable}
          byline={open.rec ? byline(open.rec) : undefined} onClose={() => setOpen(null)}
          onSave={(d) => save(open.rec, d)} onDelete={() => open.rec && remove(open.rec)} onCopy={copy} />
      )}
    </Section>
  );
}

/** First run: a calm note and the starter set, each one addable, or all at once. */
function FirstRun({ editable, onAdd, onBlank }: { editable: boolean; onAdd: (items: typeof STARTERS) => void; onBlank: (el: HTMLElement) => void }) {
  return (
    <section className="panel flex flex-col gap-5 px-6 py-7">
      <div className="flex flex-col gap-1">
        <h2 className="text-title font-semibold">No templates yet</h2>
        <p className="max-w-[620px] text-body text-muted">{editable ? "Start with the usual sequence from connection to call, then make each one your own. Variables in square brackets are filled in when you copy." : "An editor adds the templates this profile uses."}</p>
      </div>
      {editable && <>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {STARTERS.map((s) => (
            <li key={s.name} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5">
              <Badge t={s} size={32} />
              <span className="min-w-0 flex-1"><span className="block text-body font-semibold">{purposeOf(s)}</span><span className="block truncate text-meta text-muted">{s.name}</span></span>
              <button type="button" className="btn btn-quiet h-8" aria-label={`Add ${s.name}`} onClick={() => onAdd([s])}><Plus size={14} /> Add</button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn h-9" onClick={() => onAdd(STARTERS)}>Add all six</button>
          <button type="button" className="btn btn-ghost h-9" onClick={(e) => onBlank(e.currentTarget)}>Start from blank</button>
        </div>
      </>}
    </section>
  );
}
