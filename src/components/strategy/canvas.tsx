"use client";
// The Strategy canvas: a dotted grid you pan by dragging the background, zoom with the toolbar, Ctrl or Cmd and the
// wheel, or a pinch, and fit to the screen. Nodes are laid out automatically (layout in src/lib/strategy.ts),
// top to bottom or left to right; conditions fork into Yes and No lanes that rejoin. Arrow keys move between nodes,
// Enter opens one, Delete removes one (with a confirmation). No canvas library: plain transforms and one SVG.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, Maximize2, RotateCcw, ArrowDownToLine, ArrowRightToLine, EllipsisVertical, Eye, Pencil, Trash2, Lock } from "lucide-react";
import { layout, nearest, fitView, zoomAt, addable, NODE_META, CARD, type Dir, type Plus as PlusPt, type StrategyNode, type NodeType } from "@/lib/strategy";
import { NodeIcon, badgeStyle } from "./icons";

export type CardView = { id: string; type: NodeType; title: string; subtitle: string; affects: string; editorOnly: boolean };
type V = { x: number; y: number; z: number };
const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const store = { get: (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch {} } };

export function Canvas({ nodes, cards, editable, selected, onSelect, onView, onEdit, onDelete, onAdd, flash, strategyId, addAt }: {
  nodes: StrategyNode[]; cards: Map<string, CardView>; editable: boolean; selected: string | null; onSelect: (id: string | null) => void;
  onView: (id: string) => void; onEdit: (id: string) => void; onDelete: (id: string) => void; onAdd: (p: PlusPt, type: NodeType) => void;
  /** A node just saved: its Affects line pulses once. */
  flash: string | null; strategyId: string;
  /** Opens the add menu at the end of the main flow (the header's Add node). Bumped by the page. */
  addAt: number;
}) {
  const vp = useRef<HTMLDivElement>(null);
  const [dir, setDir] = useState<Dir>("down");
  useEffect(() => { const d = store.get("prax.strategy.dir"); if (d === "right") setDir("right"); }, []);
  const L = useMemo(() => layout(nodes, dir), [nodes, dir]);
  const [v, setV] = useState<V>({ x: 0, y: 0, z: 1 });
  const [anim, setAnim] = useState(false);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [adding, setAdding] = useState<{ plus: PlusPt; x: number; y: number } | null>(null);
  const placed = useMemo(() => new Map(L.nodes.map((n) => [n.id, n])), [L.nodes]);

  const size = useCallback(() => { const r = vp.current?.getBoundingClientRect(); return { width: r?.width ?? 800, height: r?.height ?? 600 }; }, []);
  const go = useCallback((next: V, animate = true) => { setAnim(animate && !reduced()); setV(next); if (animate) setTimeout(() => setAnim(false), 260); }, []);
  // The toolbar floats over the bottom, so fitting leaves room for it.
  const fitSize = useCallback(() => { const s = size(); return { width: s.width, height: s.height - 56 }; }, [size]);
  const fit = useCallback((animate = true) => go(fitView(L, fitSize()), animate), [L, go, fitSize]);
  // Reset: 100%, the start of the flow in view (centred across the flow).
  const reset = useCallback((animate = true) => {
    const s = size();
    go(dir === "down" ? { z: 1, x: (s.width - L.width) / 2, y: 16 } : { z: 1, x: 16, y: Math.max(16, (s.height - L.height) / 2) }, animate);
  }, [L, go, dir, size]);
  const zoomBy = (f: number) => { const s = size(); go(zoomAt(v, f, { x: s.width / 2, y: s.height / 2 })); };

  // A new strategy or direction opens fitted when that stays readable (75% or more), else at 100% from the start.
  const first = useRef("");
  useLayoutEffect(() => {
    const key = `${strategyId}:${dir}:${L.nodes.length > 0}`;
    if (first.current === key) return;
    first.current = key;
    const s = fitSize(), f = fitView(L, s);
    if (f.z >= 0.75) { go(f, false); return; }
    // Too long to fit readably: start at the top, as wide as the screen allows (phones see both lanes).
    const across = dir === "down" ? L.width : L.height, room = (dir === "down" ? s.width : s.height) - 32;
    const z = Math.max(0.5, Math.min(1, room / Math.max(1, across)));
    go(dir === "down" ? { z, x: (s.width - L.width * z) / 2, y: 16 } : { z, x: 16, y: Math.max(16, (s.height - L.height * z) / 2) }, false);
  }, [strategyId, dir, L, reset, go, fitSize]);

  // Wheel: Ctrl or Cmd (and trackpad pinch) zooms at the pointer; a plain wheel pans.
  useEffect(() => {
    const el = vp.current;
    if (!el) return;
    const w = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) setV((cur) => zoomAt(cur, Math.exp(-e.deltaY * 0.01), { x: e.clientX - r.left, y: e.clientY - r.top }));
      else setV((cur) => ({ ...cur, x: cur.x - e.deltaX, y: cur.y - e.deltaY }));
    };
    el.addEventListener("wheel", w, { passive: false });
    return () => el.removeEventListener("wheel", w);
  }, []);

  // Pan by dragging the background; two fingers pinch to zoom.
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; v: V; pinch?: { d: number; mid: { x: number; y: number } } } | null>(null);
  const [panning, setPanning] = useState(false);
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-node],[data-plus],[data-ui]")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setMenu(null); setAdding(null);
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      const r = vp.current!.getBoundingClientRect();
      drag.current = { x: 0, y: 0, v, pinch: { d: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top } } };
    } else { drag.current = { x: e.clientX, y: e.clientY, v }; onSelect(null); }
    setPanning(true); setAnim(false);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (d.pinch && pts.current.size >= 2) {
      const [a, b] = [...pts.current.values()];
      setV(zoomAt(d.v, Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, d.pinch.d), d.pinch.mid));
    } else if (!d.pinch) setV({ ...d.v, x: d.v.x + e.clientX - d.x, y: d.v.y + e.clientY - d.y });
  };
  const onUp = (e: React.PointerEvent) => { pts.current.delete(e.pointerId); if (!pts.current.size) { drag.current = null; setPanning(false); } };

  // Keep the selected node in view.
  const reveal = useCallback((id: string) => {
    const p = placed.get(id); if (!p) return;
    const s = size(), m = 40;
    const sx = p.x * v.z + v.x, sy = p.y * v.z + v.y, w = CARD.w * v.z, h = CARD.h * v.z;
    if (sx >= m && sy >= m && sx + w <= s.width - m && sy + h <= s.height - 90) return;
    go({ ...v, x: s.width / 2 - (p.x + CARD.w / 2) * v.z, y: s.height / 2 - (p.y + CARD.h / 2) * v.z });
  }, [placed, v, go, size]);

  const onKey = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || menu || adding) return;
    if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      const next = nearest(L.nodes, selected, e.key as "ArrowUp");
      if (next) { onSelect(next); reveal(next); document.getElementById(`node-${next}`)?.focus({ preventScroll: true }); }
    } else if (e.key === "Enter" && selected) { e.preventDefault(); onView(selected); }
    else if ((e.key === "Delete" || e.key === "Backspace") && selected && editable) { e.preventDefault(); onDelete(selected); }
    else if (e.key === "+" || e.key === "=") zoomBy(1.2);
    else if (e.key === "-") zoomBy(1 / 1.2);
    else if (e.key === "0") reset();
  };

  // The header's Add node opens the menu at the last + of the main flow.
  const lastAdd = useRef(addAt);
  useEffect(() => {
    if (addAt === lastAdd.current) return;
    lastAdd.current = addAt;
    const p = [...L.plus].filter((x) => x.parent === null).sort((a, b) => b.index - a.index)[0];
    const r = vp.current?.getBoundingClientRect();
    if (p && r) { const sx = p.x * v.z + v.x + r.left, sy = p.y * v.z + v.y + r.top; reveal(L.nodes[L.nodes.length - 1]?.id ?? ""); setAdding({ plus: p, x: Math.min(sx, window.innerWidth - 270), y: Math.min(sy + 16, window.innerHeight - 330) }); }
  }, [addAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const openMenu = (id: string, el: HTMLElement) => { const r = el.getBoundingClientRect(); setAdding(null); setMenu({ id, x: Math.min(r.right - 168, window.innerWidth - 180), y: r.bottom + 6 }); onSelect(id); };
  const openAdd = (p: PlusPt, el: HTMLElement) => { const r = el.getBoundingClientRect(); setMenu(null); setAdding({ plus: p, x: Math.max(8, Math.min(r.left + r.width / 2 - 130, window.innerWidth - 270)), y: Math.min(r.bottom + 8, window.innerHeight - 330) }); };
  useEffect(() => {
    if (!menu && !adding) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenu(null); setAdding(null); } };
    const c = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest("[data-ui]")) { setMenu(null); setAdding(null); } };
    window.addEventListener("keydown", k); window.addEventListener("mousedown", c);
    return () => { window.removeEventListener("keydown", k); window.removeEventListener("mousedown", c); };
  }, [menu, adding]);

  let grid = 22 * v.z;
  while (grid < 14) grid *= 2; // keep the dots calm when zoomed out
  return (
    <div className="relative">
      <div ref={vp} tabIndex={-1} onKeyDown={onKey} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        aria-label="Strategy canvas. Drag the background to move around, arrow keys move between nodes, Enter opens one."
        className={`strat-canvas relative h-[calc(100dvh-230px)] min-h-[460px] touch-none select-none overflow-hidden rounded-xl border border-line ${panning ? "cursor-grabbing" : "cursor-grab"}`}
        style={{ backgroundColor: "#fbfbfb", backgroundImage: "radial-gradient(circle, #cfcfcf 1px, transparent 1.3px)", backgroundSize: `${grid}px ${grid}px`, backgroundPosition: `${v.x}px ${v.y}px` }}>
        <div className="absolute left-0 top-0 origin-top-left" style={{ width: L.width, height: L.height, transform: `translate(${v.x}px, ${v.y}px) scale(${v.z})`, transition: anim ? "transform 240ms cubic-bezier(.16,1,.3,1)" : "none" }}>
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={L.width} height={L.height} aria-hidden="true">
            {L.edges.map((e) => <path key={e.key} d={round(e.points)} fill="none" stroke="#bdbdbd" strokeWidth={1.5} strokeDasharray="1 5" strokeLinecap="round" />)}
          </svg>
          {L.edges.filter((e) => e.label).map((e) => { const p = e.points[2]; return (
            <span key={e.key + "l"} className="pointer-events-none absolute whitespace-nowrap rounded-md border border-line bg-white px-1.5 text-meta font-semibold leading-5 text-ink-2"
              style={dir === "down" ? { left: p.x, top: p.y - 10, transform: `translateX(${e.label === "Yes" ? "-110%" : "10%"})` } : { left: p.x - 10, top: p.y, transform: `translate(-100%, ${e.label === "Yes" ? "-130%" : "30%"})` }}>{e.label}</span>
          ); })}
          {L.plus.map((p) => p.empty ? (
            editable ? <button key={p.key} data-plus type="button" onClick={(e) => openAdd(p, e.currentTarget)} aria-label={`Add a node to the ${p.branch === "yes" ? "Yes" : "No"} lane`}
              className="strat-empty absolute flex h-10 w-[176px] -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong bg-white/80 text-meta font-medium text-muted hover:border-ink hover:text-ink" style={{ left: p.x, top: p.y }}>
              <Plus size={13} /> Add to {p.branch === "yes" ? "Yes" : "No"}</button>
              : <span key={p.key} className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-meta text-faint" style={{ left: p.x, top: p.y }}>Nothing here</span>
          ) : editable && (
            <button key={p.key} data-plus type="button" onClick={(e) => openAdd(p, e.currentTarget)} aria-label="Add a node here"
              className="strat-plus absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-line-strong bg-white text-muted shadow-[0_1px_2px_rgba(20,20,20,.08)] hover:border-ink hover:text-ink" style={{ left: p.x, top: p.y }}>
              <Plus size={13} strokeWidth={2.2} /></button>
          ))}
          {L.nodes.map((p) => { const c = cards.get(p.id); if (!c) return null; const sel = selected === p.id; return (
            <div key={p.id} id={`node-${p.id}`} data-node role="button" tabIndex={sel || (!selected && p === L.nodes[0]) ? 0 : -1} aria-label={`${c.title}. ${c.subtitle}. ${c.affects}`}
              onClick={() => { onSelect(p.id); onView(p.id); }} onFocus={() => onSelect(p.id)}
              className={`strat-node group absolute flex cursor-pointer flex-col items-center rounded-xl border bg-white px-4 pb-3 pt-[26px] text-center transition-[border-color,box-shadow] duration-150 ${sel ? "border-ink shadow-[0_0_0_3px_rgba(214,69,69,.18),0_6px_18px_rgba(20,20,20,.08)]" : "border-line shadow-[0_1px_2px_rgba(20,20,20,.05)] hover:border-line-strong hover:shadow-[0_4px_14px_rgba(20,20,20,.07)]"}`}
              style={{ left: p.x, top: p.y, width: CARD.w, height: CARD.h }}>
              <span className="absolute -top-[18px] left-1/2 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full shadow-[0_0_0_4px_#fbfbfb]" style={badgeStyle(c.type)}><NodeIcon type={c.type} size={16} /></span>
              <button type="button" data-ui tabIndex={sel ? 0 : -1} aria-label={`Actions for ${c.title}`} aria-haspopup="menu" onClick={(e) => { e.stopPropagation(); openMenu(p.id, e.currentTarget); }}
                className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"><EllipsisVertical size={15} /></button>
              <span className="flex max-w-full items-center gap-1.5 text-body font-semibold leading-5 text-ink">{c.editorOnly && <Lock size={12} className="shrink-0 text-muted" aria-label="Editors only" />}<span className="truncate">{c.title}</span></span>
              <span className="mt-0.5 line-clamp-1 max-w-full text-meta leading-[18px] text-muted">{c.subtitle}</span>
              <span className={`mt-auto max-w-full truncate rounded-md px-1.5 text-meta leading-5 text-faint ${flash === p.id ? "strat-flash" : ""}`}>{c.affects}</span>
            </div>
          ); })}
        </div>

        <div data-ui className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-line bg-white p-1 shadow-[0_6px_20px_rgba(20,20,20,.10)]" role="toolbar" aria-label="Canvas controls">
          <Tool label="Zoom out" onClick={() => zoomBy(1 / 1.2)} disabled={v.z <= 0.26}><Minus size={15} /></Tool>
          <button type="button" className="num h-8 w-[52px] rounded-md text-meta font-medium text-ink-2 hover:bg-surface-2" onClick={() => go({ ...v, ...zoomAt(v, 1 / v.z, { x: size().width / 2, y: size().height / 2 }) })} title="Back to 100%" aria-label={`Zoom ${Math.round(v.z * 100)}%. Back to 100%`}>{Math.round(v.z * 100)}%</button>
          <Tool label="Zoom in" onClick={() => zoomBy(1.2)} disabled={v.z >= 1.59}><Plus size={15} /></Tool>
          <span className="mx-1 h-5 w-px bg-line" />
          <Tool label="Fit to screen" onClick={() => fit()}><Maximize2 size={14} /></Tool>
          <Tool label="Reset the view" onClick={() => reset()}><RotateCcw size={14} /></Tool>
          <span className="mx-1 h-5 w-px bg-line" />
          <Tool label={dir === "down" ? "Lay out left to right" : "Lay out top to bottom"} onClick={() => { const d = dir === "down" ? "right" : "down"; setDir(d); store.set("prax.strategy.dir", d); }}>
            {dir === "down" ? <ArrowRightToLine size={15} /> : <ArrowDownToLine size={15} />}</Tool>
        </div>
      </div>

      {menu && createPortal(
        <div data-ui role="menu" aria-label="Node actions" className="anim-rise fixed z-[56] w-[168px] rounded-xl border border-line bg-white p-1 shadow-[var(--shadow-lg)]" style={{ left: menu.x, top: menu.y }}>
          <Item icon={Eye} label="View" onClick={() => { setMenu(null); onView(menu.id); }} />
          {editable && <Item icon={Pencil} label="Edit" onClick={() => { setMenu(null); onEdit(menu.id); }} />}
          {editable && <Item icon={Trash2} label="Delete" danger onClick={() => { setMenu(null); onDelete(menu.id); }} />}
        </div>, document.body)}
      {adding && createPortal(
        <div data-ui role="menu" aria-label="Add a node" className="anim-rise fixed z-[56] max-h-[320px] w-[260px] overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-[var(--shadow-lg)]" style={{ left: adding.x, top: adding.y }}>
          <span className="block px-2.5 pb-1 pt-1.5 text-meta font-medium text-muted">{adding.plus.lane ? `Add to the ${adding.plus.branch === "yes" ? "Yes" : "No"} lane` : "Add a node"}</span>
          {addable(nodes, adding.plus.lane).map((t) => (
            <button key={t} type="button" role="menuitem" onClick={() => { const p = adding.plus; setAdding(null); onAdd(p, t); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full" style={badgeStyle(t)}><NodeIcon type={t} size={13} /></span>
              <span className="flex min-w-0 flex-col"><span className="text-body font-medium leading-5">{t === "condition" ? "Condition (if/else)" : NODE_META[t].title}</span><span className="truncate text-meta text-muted">{NODE_META[t].affects.join(" · ") || (t === "note" ? "Free text" : t === "action" ? "Does something" : "Splits into Yes and No")}</span></span>
            </button>
          ))}
        </div>, document.body)}
    </div>
  );
}

function Tool({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return <button type="button" className="grid h-8 w-8 place-items-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink disabled:text-faint disabled:hover:bg-transparent" aria-label={label} title={label} onClick={onClick} disabled={disabled}>{children}</button>;
}
function Item({ icon: I, label, onClick, danger }: { icon: React.ElementType; label: string; onClick: () => void; danger?: boolean }) {
  return <button type="button" role="menuitem" onClick={onClick} className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-body hover:bg-surface-2 focus-visible:bg-surface-2 ${danger ? "text-[#9e1c1c]" : "text-ink"}`}><I size={14} className={danger ? "" : "text-muted"} />{label}</button>;
}

/** An SVG path through the points with small rounded corners at each bend. */
function round(pts: { x: number; y: number }[], r = 10) {
  if (pts.length < 3) return `M${pts[0].x},${pts[0].y}` + pts.slice(1).map((p) => `L${p.x},${p.y}`).join("");
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y);
    const k = Math.min(r, l1 / 2, l2 / 2);
    if (!k) { d += `L${b.x},${b.y}`; continue; }
    const p1 = { x: b.x - ((b.x - a.x) / l1) * k, y: b.y - ((b.y - a.y) / l1) * k }, p2 = { x: b.x + ((c.x - b.x) / l2) * k, y: b.y + ((c.y - b.y) / l2) * k };
    d += `L${p1.x},${p1.y}Q${b.x},${b.y} ${p2.x},${p2.y}`;
  }
  const z = pts[pts.length - 1];
  return d + `L${z.x},${z.y}`;
}
