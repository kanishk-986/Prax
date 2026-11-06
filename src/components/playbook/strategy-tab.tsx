"use client";
// The Strategy tab of the Playbook (S5; Q108, Q109): an open canvas of nodes that drive the rest of Prax. Several strategies per profile, one
// active. Settings nodes in the active strategy show and write the real settings; Goal, Condition, Action and Note
// live here and the sections that use them read the active strategy (src/components/strategy/data.ts).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Check } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useWorkspace, useSegments } from "@/lib/workspace";
import { NotStarted } from "@/components/shell";
import { RecordList } from "@/components/record-list";
import { useToast, haptic } from "@/components/toaster";
import { Canvas, type CardView } from "@/components/strategy/canvas";
import { ViewPanel, EditPanel, NewStrategyPanel, RenameDialog, ConfirmDialog } from "@/components/strategy/panels";
import { useLiveSettings, writeSettings } from "@/components/strategy/data";
import {
  NODE_META, laneOf, descendants, insertSort, cleanConfig, readFromSettings, valuesOf, writesFor, subtitleOf, affectsOf, affectsLine, hiddenFor,
  templateNodes, flatten, copyNodes, strategyName, type Strategy, type StrategyNode, type NodeType, type Plus as PlusPt, type Write,
} from "@/lib/strategy";

const NONE = "00000000-0000-0000-0000-000000000000";
const uuid = () => crypto.randomUUID();
type Note = { id: string; title: string; body: string; sort: number; created_at: string };
const DEFAULTS: Partial<Record<NodeType, Record<string, unknown>>> = {
  condition: { fact: "segment", op: "is", value: "A" }, action: { kind: "comments", count: 2 }, goal: { text: "" }, note: { text: "" },
};

/** Everything the Strategy tab puts in the Playbook's one Section: the header parts and the body. A hook, so the
 *  Playbook keeps one Section (one tour across both tabs) while this keeps its state and behaviour as they were. */
export function useStrategyTab() {
  const { ws, can } = useWorkspace();
  const editor = can("editor"), owner = can("owner");
  const router = useRouter();
  const toast = useToast();
  const segs = useSegments();
  const segNames = useMemo(() => Object.fromEntries(Object.entries(segs).map(([k, v]) => [k, v.label])), [segs]);
  const strategies = useLive<Strategy>("strategies", ws.id, { order: "sort" });
  const notes = useLive<Note>("notes", ws.id, { filter: (q) => q.eq("kind", "strategy"), order: "sort" });
  const templates = useLive<{ id: string; name: string }>("templates", ws.id, { order: "sort" });
  const { s: live, reload: reloadLive } = useLiveSettings();

  const open = strategies.rows.filter((s) => s.status !== "archived");
  const archived = strategies.rows.filter((s) => s.status === "archived");
  const activeS = open.find((s) => s.status === "active") ?? null;
  const [selId, setSelId] = useState<string | null>(null);
  const current = strategies.rows.find((s) => s.id === selId) ?? activeS ?? open[0] ?? null;
  const isActive = current?.status === "active";
  const nodesQ = useLive<StrategyNode>("strategy_nodes", ws.id, { filter: (q) => q.eq("strategy_id", current?.id ?? NONE), key: current?.id ?? "none", skip: !current });
  const all = useMemo(() => nodesQ.rows.filter((n) => n.strategy_id === current?.id), [nodesQ.rows, current?.id]);
  const visible = useMemo(() => all.filter((n) => !hiddenFor(n, editor)), [all, editor]);
  const cards = useMemo(() => new Map<string, CardView>(visible.map((n) => [n.id, {
    id: n.id, type: n.type, title: n.title || NODE_META[n.type].title, subtitle: subtitleOf(n.type, valuesOf(n, isActive, live), segNames), affects: affectsLine(affectsOf(n, all)), editorOnly: n.editor_only,
  }])), [visible, all, isActive, live, segNames]);

  const [sel, setSel] = useState<string | null>(null);
  const [panel, setPanel] = useState<{ kind: "view" | "edit"; id: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"new" | "rename" | null>(null);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [addAt, setAddAt] = useState(0);
  const flashT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulse = (id: string) => { setFlash(null); requestAnimationFrame(() => setFlash(id)); if (flashT.current) clearTimeout(flashT.current); flashT.current = setTimeout(() => setFlash(null), 1700); };
  useEffect(() => { setSel(null); setPanel(null); }, [current?.id]);

  const fail = (m: string) => { toast(m); return false; };
  const refreshSettings = useCallback(() => { reloadLive(); router.refresh(); }, [reloadLive, router]);
  const nodesOf = useCallback(async (sid: string): Promise<StrategyNode[]> => {
    if (sid === current?.id) return all;
    const { data } = await supabase().from("strategy_nodes").select("*").eq("workspace_id", ws.id).eq("strategy_id", sid);
    return (data ?? []) as StrategyNode[];
  }, [all, current?.id, ws.id]);
  const settingsWrites = (ns: StrategyNode[]): Write[] => (live ? ns.filter((n) => NODE_META[n.type].settings).flatMap((n) => writesFor(n.type, n.config, live)) : []);
  const ownerOnly = (ws_: Write[]) => ws_.some((w) => w.table === "workspaces") && !owner;

  // ---------- nodes ----------
  async function addNode(p: PlusPt, type: NodeType) {
    if (!current) return;
    const lane = laneOf(all, p.parent, p.branch);
    const { sort, renumber } = insertSort(lane.map((n) => n.sort), p.index);
    if (renumber) await Promise.all(lane.map((n, i) => supabase().from("strategy_nodes").update({ sort: renumber[i] }).eq("id", n.id)));
    const row: StrategyNode = {
      id: uuid(), workspace_id: ws.id, strategy_id: current.id, type, title: NODE_META[type].title, parent_id: p.parent, branch: p.parent ? p.branch : "", sort,
      config: NODE_META[type].settings && live ? readFromSettings(type, live)! : cleanConfig(type, DEFAULTS[type] ?? {}), editor_only: false,
    };
    const { error } = await supabase().from("strategy_nodes").insert(row);
    if (error) { toast(error.message); return; }
    haptic();
    nodesQ.setRows((rs) => [...rs.map((r) => { const i = lane.findIndex((n) => n.id === r.id); return renumber && i >= 0 ? { ...r, sort: renumber[i] } : r; }), row]);
    setSel(row.id); setPanel({ kind: "edit", id: row.id });
    toast(`${NODE_META[type].label} added`, async () => { await supabase().from("strategy_nodes").delete().eq("id", row.id); nodesQ.setRows((rs) => rs.filter((r) => r.id !== row.id)); setPanel(null); });
  }

  async function saveNode(n: StrategyNode, p: { title: string; config: Record<string, any>; editor_only: boolean }) {
    const before = { title: n.title, config: n.config, editor_only: n.editor_only };
    const shown = valuesOf(n, isActive, live);
    const writes = isActive && live && NODE_META[n.type].settings ? writesFor(n.type, p.config, live) : [];
    if (ownerOnly(writes)) return fail("Only an owner can change profile settings.");
    const { error } = await supabase().from("strategy_nodes").update({ ...p, updated_at: new Date().toISOString() }).eq("id", n.id);
    if (error) return fail(error.message);
    if (writes.length) { const e = await writeSettings(ws.id, writes); if (e) return fail(e); refreshSettings(); }
    nodesQ.setRows((rs) => rs.map((r) => (r.id === n.id ? { ...r, ...p } : r)));
    haptic(); if (writes.length) pulse(n.id);
    const aff = affectsOf({ ...n, config: p.config }, all);
    toast(writes.length ? `Saved. ${aff.join(", ")} updated` : "Saved", async () => {
      await supabase().from("strategy_nodes").update(before).eq("id", n.id);
      if (writes.length && live) { await writeSettings(ws.id, writesFor(n.type, shown, live)); refreshSettings(); }
      nodesQ.setRows((rs) => rs.map((r) => (r.id === n.id ? { ...r, ...before } : r)));
    });
    return true;
  }

  async function deleteNode(id: string) {
    const n = all.find((x) => x.id === id);
    setConfirm(null);
    if (!n) return;
    const gone = [n, ...descendants(n.id, all)];
    const { error } = await supabase().from("strategy_nodes").delete().eq("id", n.id);
    if (error) { toast(error.message); return; }
    haptic();
    nodesQ.setRows((rs) => rs.filter((r) => !gone.some((g) => g.id === r.id)));
    setPanel(null); setSel(null);
    toast(`${n.title || NODE_META[n.type].title} deleted`, async () => {
      const { error: e } = await supabase().from("strategy_nodes").insert(gone.map(({ created_at: _c, ...r }) => r)); // eslint-disable-line @typescript-eslint/no-unused-vars
      if (e) { toast(e.message); return; }
      nodesQ.setRows((rs) => [...rs, ...gone]);
    });
  }

  // ---------- strategies ----------
  async function create(key: string, name: string) {
    if (!live) return;
    setBusy(true);
    const firstRun = strategies.rows.length === 0;
    const sid = uuid();
    const makeActive = !activeS && (key === "current" || key === "blank");
    const noteRows = (firstRun || key === "current" ? notes.rows : []).map((x) => ({ title: x.title, body: x.body }));
    const { error } = await supabase().from("strategies").insert({ id: sid, workspace_id: ws.id, name: strategyName(name, strategies.rows.map((s) => s.name)), template: key, status: makeActive ? "active" : "draft", sort: Math.max(0, ...strategies.rows.map((s) => s.sort)) + 1 });
    if (error) { setBusy(false); toast(error.message); return; }
    const rows = flatten(templateNodes(key, live, noteRows), sid, uuid).map((r) => ({ ...r, workspace_id: ws.id }));
    const { error: e2 } = await supabase().from("strategy_nodes").insert(rows);
    setBusy(false); setDialog(null);
    if (e2) { toast(e2.message); return; }
    await strategies.reload(); setSelId(sid); haptic();
    toast(makeActive ? `${name} is active` : `${name} created as a draft`, async () => { await supabase().from("strategies").delete().eq("id", sid); setSelId(null); strategies.reload(); });
  }
  async function duplicate(s: Strategy) {
    setMenu(false);
    const ns = await nodesOf(s.id);
    const sid = uuid(), name = strategyName(`${s.name} copy`, strategies.rows.map((x) => x.name));
    const { error } = await supabase().from("strategies").insert({ id: sid, workspace_id: ws.id, name, template: s.template, status: "draft", sort: Math.max(0, ...strategies.rows.map((x) => x.sort)) + 1 });
    if (error) { toast(error.message); return; }
    // Settings nodes of the active strategy copy the live values, so the copy starts from what the app does today.
    const src = s.status === "active" && live ? ns.map((n) => (NODE_META[n.type].settings ? { ...n, config: readFromSettings(n.type, live)! } : n)) : ns;
    const { error: e2 } = await supabase().from("strategy_nodes").insert(copyNodes(src, sid, uuid).map(({ created_at: _c, ...r }) => ({ ...r, workspace_id: ws.id }))); // eslint-disable-line @typescript-eslint/no-unused-vars
    if (e2) { toast(e2.message); return; }
    await strategies.reload(); setSelId(sid); haptic();
    toast(`${name} created as a draft`, async () => { await supabase().from("strategies").delete().eq("id", sid); setSelId(s.id); strategies.reload(); });
  }
  async function rename(s: Strategy, name: string) {
    setDialog(null);
    const { error } = await supabase().from("strategies").update({ name, updated_at: new Date().toISOString() }).eq("id", s.id);
    if (error) { toast(error.message); return; }
    strategies.reload(); haptic();
    toast("Renamed", async () => { await supabase().from("strategies").update({ name: s.name }).eq("id", s.id); strategies.reload(); });
  }
  async function setActive(s: Strategy) {
    setMenu(false);
    if (!live) return;
    const ns = await nodesOf(s.id);
    const writes = settingsWrites(ns);
    if (ownerOnly(writes)) { toast("Only an owner can set this strategy active, as it changes profile settings."); return; }
    const before = live, prev = activeS;
    // The strategy that was active keeps what the settings are now, so setting it active again brings them back.
    if (prev) {
      const pn = await nodesOf(prev.id);
      await Promise.all(pn.filter((n) => NODE_META[n.type].settings).map((n) => supabase().from("strategy_nodes").update({ config: readFromSettings(n.type, before) }).eq("id", n.id)));
    }
    const { error } = await supabase().rpc("strategy_activate", { p_id: s.id });
    if (error) { toast(error.message); return; }
    const e = await writeSettings(ws.id, writes);
    if (e) toast(e);
    refreshSettings(); await strategies.reload(); setSelId(s.id); haptic();
    const areas = [...new Set(ns.flatMap((n) => affectsOf(n, ns)))];
    const restore = [...new Set(ns.filter((n) => NODE_META[n.type].settings).map((n) => n.type))].flatMap((t) => writesFor(t, readFromSettings(t, before)!, before));
    toast(`${s.name} is active${areas.length ? `. ${areas.slice(0, 3).join(", ")}${areas.length > 3 ? " and more" : ""} follow it` : ""}`, async () => {
      if (prev) await supabase().rpc("strategy_activate", { p_id: prev.id }); else await supabase().from("strategies").update({ status: "draft" }).eq("id", s.id);
      await writeSettings(ws.id, restore); refreshSettings(); strategies.reload();
    });
  }
  async function setStatus(s: Strategy, status: Strategy["status"], label: string) {
    setMenu(false);
    const { error } = await supabase().from("strategies").update({ status, updated_at: new Date().toISOString() }).eq("id", s.id);
    if (error) { toast(error.message); return; }
    await strategies.reload(); haptic();
    if (status === "archived" && selId === s.id) setSelId(null);
    toast(label + (s.status === "active" && status === "archived" ? ". No strategy is active now; the settings stay as they are" : ""), async () => { await supabase().from("strategies").update({ status: s.status }).eq("id", s.id); strategies.reload(); });
  }

  // Close the switcher on Escape or a click outside it.
  useEffect(() => {
    if (!menu) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    const c = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest("[data-switcher]")) setMenu(false); };
    window.addEventListener("keydown", k); window.addEventListener("mousedown", c);
    return () => { window.removeEventListener("keydown", k); window.removeEventListener("mousedown", c); };
  }, [menu]);

  const loading = strategies.loading || !live;
  const missing = strategies.error;
  const pNode = panel ? all.find((n) => n.id === panel.id) ?? null : null;
  const cNode = confirm ? all.find((n) => n.id === confirm) ?? null : null;
  const notesShown = notes.rows.filter((n) => !hiddenFor({ editor_only: false, title: n.title }, editor));

  const switcher = current && (
    <div data-switcher data-tour="switcher" className="relative">
      <button type="button" className="btn h-10 max-w-[260px] px-3.5" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
        <span className="truncate font-medium">{current.name}</span>
        <span className={`text-meta ${isActive ? "font-semibold text-ink" : "text-muted"}`}>{isActive ? "Active" : current.status === "archived" ? "Archived" : "Draft"}</span>
        <ChevronDown size={14} className="text-muted" />
      </button>
      {menu && (
        <div role="menu" aria-label="Strategies" className="pl-pop absolute right-0 top-[calc(100%+6px)] z-[56] w-[290px] rounded-xl border border-line bg-white p-1 shadow-[var(--shadow-lg)] max-sm:left-0 max-sm:right-auto">
          <span className="block px-2.5 pb-1 pt-1.5 text-meta font-medium text-muted">Strategies</span>
          {open.map((s) => (
            <button key={s.id} type="button" role="menuitemradio" aria-checked={s.id === current.id} onClick={() => { setSelId(s.id); setMenu(false); }} className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-body hover:bg-surface-2">
              <span className="w-4 shrink-0">{s.id === current.id && <Check size={14} />}</span><span className="min-w-0 flex-1 truncate">{s.name}</span>{s.status === "active" && <span className="text-meta font-semibold">Active</span>}
            </button>
          ))}
          {editor && <>
            <span className="my-1 block h-px bg-line" />
            <MItem onClick={() => { setMenu(false); setDialog("new"); }}>New from a template</MItem>
            <MItem onClick={() => duplicate(current)}>Duplicate</MItem>
            <MItem onClick={() => { setMenu(false); setDialog("rename"); }}>Rename</MItem>
            {!isActive && current.status !== "archived" && <MItem onClick={() => setActive(current)}>Set active</MItem>}
            {current.status !== "archived" ? <MItem onClick={() => setStatus(current, "archived", `${current.name} archived`)}>Archive</MItem> : <MItem onClick={() => setStatus(current, "draft", `${current.name} restored as a draft`)}>Restore</MItem>}
          </>}
          {archived.length > 0 && <>
            <span className="my-1 block h-px bg-line" />
            <span className="block px-2.5 pb-1 pt-1 text-meta font-medium text-muted">Archived</span>
            {archived.map((s) => <button key={s.id} type="button" onClick={() => { setSelId(s.id); setMenu(false); }} className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-body text-muted hover:bg-surface-2 hover:text-ink"><span className="w-4 shrink-0">{s.id === current.id && <Check size={14} />}</span><span className="truncate">{s.name}</span></button>)}
          </>}
        </div>
      )}
    </div>
  );

  const status = !current ? "The plan for this profile, as a flow that drives Today, Pipeline, Discovery and the studios."
    : isActive ? `${visible.length} ${visible.length === 1 ? "node" : "nodes"}. Active: saving a node updates what it affects.`
    : `${visible.length} ${visible.length === 1 ? "node" : "nodes"}. ${current.status === "archived" ? "Archived" : "Draft"}: nothing in the app follows it until it is set active.`;

  const primary = editor && current && current.status !== "archived" ? <button type="button" className="btn btn-primary h-10 px-4" onClick={() => setAddAt((n) => n + 1)}><Plus size={14} /> Add node</button>
    : editor && !current && !missing && !loading ? <button type="button" className="btn btn-primary h-10 px-4" onClick={() => setDialog("new")}>Start from a template</button> : undefined;

  const body = (<>
      {missing ? (<>
        <NotStarted compact title="The canvas is waiting for its database step" body="Run db/021_strategy_canvas.sql in the Supabase SQL editor. Until then the strategy sections below stay as they are." />
        <RecordList table="notes" order="sort" filter={(q) => q.eq("kind", "strategy")} hide={editor ? undefined : (r) => /^who does what/i.test(String(r.title ?? "").trim())} defaults={{ kind: "strategy", sort: 0 }} empty="No strategy sections yet." author
          cols={[{ key: "title", label: "Section", className: "font-medium w-[240px]" }, { key: "body", label: "", className: "text-ink-2 whitespace-pre-line", render: (r) => <span className="line-clamp-4">{r.body}</span> }]}
          fields={[{ key: "title", label: "Section title", wide: true }, { key: "sort", label: "Order", type: "number" }, { key: "body", label: "Text", type: "textarea" }]} />
      </>) : loading ? (
        <div className="h-[calc(100dvh-230px)] min-h-[460px] animate-pulse rounded-xl bg-[#ececec]" aria-busy="true" />
      ) : !current ? (
        <div className="flex flex-col gap-4">
          <NotStarted title="No strategy yet" body={editor ? "Start from a template: Authority builder, Outreach sprint, Event push, today's settings or a blank canvas. Templates begin as drafts, so nothing changes until you set one active. Today's settings, or a blank canvas, start active, as they change nothing." : "An editor starts the strategy here. Until then Prax runs on the profile's settings."}
 />
          {notesShown.length > 0 && (
            <section className="panel">
              <div className="panel-head flex-wrap gap-y-0.5 py-3"><span>Strategy notes</span><span className="text-meta font-normal text-muted">{editor ? "They come along as notes in the first strategy" : `${notesShown.length} ${notesShown.length === 1 ? "note" : "notes"}`}</span></div>
              <ul className="m-0 list-none divide-y divide-line border-t border-line p-0">{notesShown.map((n) => (
                <li key={n.id} className="grid gap-1 px-[18px] py-3 sm:grid-cols-[220px_1fr] sm:gap-4"><span className="text-body font-semibold">{n.title || "Note"}</span><span className="line-clamp-4 whitespace-pre-line text-body text-ink-2">{n.body}</span></li>
              ))}</ul>
            </section>
          )}
        </div>
      ) : (
        <div data-tour="canvas" className="flex flex-col gap-3 rounded-xl">
          {!isActive && (
            <div className="panel flex flex-wrap items-center gap-3 px-[18px] py-3">
              <span className="min-w-0 flex-1 text-body text-ink-2">{current.status === "archived" ? "This strategy is archived. Restore it to work on it again." : `${current.name} is a draft. ${activeS ? `${activeS.name} is the active strategy.` : "No strategy is active, so Prax runs on the profile's settings."}`}</span>
              {editor && current.status !== "archived" && <button type="button" className="btn h-9 px-3.5" onClick={() => setActive(current)}>Set active</button>}
              {editor && current.status === "archived" && <button type="button" className="btn h-9 px-3.5" onClick={() => setStatus(current, "draft", `${current.name} restored as a draft`)}>Restore</button>}
              {activeS && <button type="button" className="btn btn-ghost h-9 px-3" onClick={() => setSelId(activeS.id)}>View {activeS.name}</button>}
            </div>
          )}
          <Canvas nodes={visible} cards={cards} editable={editor && current.status !== "archived"} selected={sel} onSelect={setSel} strategyId={current.id} flash={flash} addAt={addAt}
            onView={(id) => setPanel({ kind: "view", id })} onEdit={(id) => setPanel({ kind: "edit", id })} onDelete={(id) => setConfirm(id)} onAdd={addNode} />
        </div>
      )}

      {pNode && panel?.kind === "view" && <ViewPanel node={pNode} values={valuesOf(pNode, isActive, live)} nodes={all} active={isActive} segNames={segNames} editable={editor && current?.status !== "archived"} onEdit={() => setPanel({ kind: "edit", id: pNode.id })} onClose={() => setPanel(null)} />}
      {pNode && panel?.kind === "edit" && <EditPanel key={pNode.id} node={pNode} nodes={all} values={valuesOf(pNode, isActive, live)} active={isActive} ownerNeeded={isActive && NODE_META[pNode.type].owner && !owner} templates={templates.rows.map((t) => t.name)} segNames={segNames}
        onSave={(p) => saveNode(pNode, p)} onClose={() => setPanel(null)} />}
      {cNode && <ConfirmDialog title={`Delete ${cNode.title || NODE_META[cNode.type].title}?`} confirm="Delete" onClose={() => setConfirm(null)} onConfirm={() => deleteNode(cNode.id)}
        body={<>{cNode.type === "condition" && descendants(cNode.id, all).length ? `Its Yes and No lanes go with it (${descendants(cNode.id, all).length} ${descendants(cNode.id, all).length === 1 ? "node" : "nodes"}). ` : ""}{NODE_META[cNode.type].settings && isActive ? "The settings it shows stay as they are. " : ""}You can undo this from the message that follows.</>} />}
      {dialog === "new" && <NewStrategyPanel busy={busy} onCreate={create} onClose={() => setDialog(null)} />}
      {dialog === "rename" && current && <RenameDialog name={current.name} onSave={(n) => rename(current, n)} onClose={() => setDialog(null)} />}
  </>);

  return { status, before: switcher || undefined, primary, entryStatus: current ? `${current.name}, ${isActive ? "active" : "draft"}.` : "No strategy yet.", hasStrategy: !!current, body };
}

function MItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button type="button" role="menuitem" onClick={onClick} className="flex h-9 w-full items-center rounded-lg px-2.5 pl-[34px] text-left text-body hover:bg-surface-2">{children}</button>;
}
