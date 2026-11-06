"use client";
// The one key form in Prax (Q138): connect, test, replace and delete a tool's key. It sits on the tool page and in a
// side sheet that any section opens in place ("Using Claude · change"), so nobody leaves their work to add a key.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X, ExternalLink, Check, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import { useToast, haptic } from "@/components/toaster";
import { LATEST_EXT } from "@/lib/bridge";
import { SAVED_KEY } from "@/lib/providers";
import { toolOf, jobOf, toolName, keyTool, BUILT_IN, type JobId } from "@/lib/connections";
import { useConnections, type Conn } from "./use-connections";
import { useKeyActions, testTool, oldExtension, type TestResult } from "./keys";
import { LogoTile, ToolInline, Dot, cx } from "./ui";

/** Connect, Test connection, Replace and Delete for one tool, in this browser. */
export function KeyPanel({ tool, conn, onDone, openSignal = 0, onTested }: { tool: string; conn: Conn; onDone?: () => void; openSignal?: number; onTested?: (r: TestResult) => void }) {
  const t = toolOf(tool)!;
  const { slug } = useWorkspace().ws;
  const toast = useToast();
  const keys = useKeyActions(conn.send, toast);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "test">("");
  const [test, setTest] = useState<TestResult | null>(null);
  const [confirm, setConfirm] = useState(false);
  const status = conn.status;
  const removing = keys.removing.includes(keyTool(tool)) || keys.removing.includes(tool);
  const on = conn.connected(tool) && !removing;
  const old = oldExtension(status);
  const shared = t.sharesKey ? toolOf(t.sharesKey) : null;
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { if (openSignal) { setOpen(true); setConfirm(false); } }, [openSignal]);

  if (t.coming) return <p className="text-body text-muted">Nothing to connect yet. Prax MCP is coming later; this page says what it will do.</p>;
  if (status === null) return <div className="cx-skel h-[92px]" aria-label="Checking this browser" />;
  if (!status.installed) return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-4">
      <span className="text-body font-semibold">Prax for Chrome is not installed in this browser</span>
      <span className="text-meta text-muted">Keys live only inside the extension, so it is needed to connect {t.name}.</span>
      <Link href={`/w/${slug}/connections?tab=chrome`} className="btn h-9 w-fit" onClick={onDone}>Set up Prax for Chrome</Link>
    </div>
  );

  async function save() {
    if (!key.trim()) return;
    setBusy("save");
    try { await keys.save(keyTool(tool), key, on); haptic(); setKey(""); setOpen(false); setTest(null); onDone?.(); }
    catch (e) { toast((e as Error).message); }
    setBusy("");
  }
  async function runTest() {
    setBusy("test"); setTest(null);
    const r = await testTool(keyTool(tool), key);
    setTest(r); setBusy(""); onTested?.(r);
    if (r.ok) haptic();
  }

  const testable = !!t.test && !old;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-2 text-body font-medium"><Dot on={on} />{on ? "Connected in this browser" : "No key in this browser"}</span>
        {on && <code className="font-mono text-meta text-muted">{SAVED_KEY}</code>}
        {shared && <span className="text-meta text-muted">Uses the {shared.name} key</span>}
      </div>
      {old && <p className="rounded-lg bg-surface-2 px-3 py-2 text-meta text-ink">This browser has Prax for Chrome {status.version}. Update to {LATEST_EXT} to test keys and use {t.name}. <Link className="font-medium underline underline-offset-2" href={`/w/${slug}/connections?tab=chrome`} onClick={onDone}>How to update</Link></p>}
      {open ? (
        <form className="anim-rise flex flex-col gap-2.5" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label htmlFor={`cx-key-${tool}`} className="label">{shared ? shared.name : t.name} key</label>
          <input ref={input} id={`cx-key-${tool}`} type="password" autoComplete="off" spellCheck={false} className="field h-10 font-mono text-meta"
            placeholder={on ? `${SAVED_KEY}  Paste a new key` : t.keyHint ? `Paste a key, it starts ${t.keyHint}` : `Paste your ${shared?.name ?? t.name} key`} value={key} onChange={(e) => { setKey(e.target.value); setTest(null); }} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="btn btn-primary h-9" disabled={!key.trim() || !!busy}>{busy === "save" ? "Saving" : on ? "Save new key" : "Save to this browser"}</button>
            {testable && <button type="button" className="btn h-9" disabled={!key.trim() || !!busy} onClick={runTest}>{busy === "test" ? <><Loader2 size={14} className="animate-spin" /> Testing</> : "Test this key"}</button>}
            <button type="button" className="btn btn-ghost h-9" onClick={() => { setOpen(false); setKey(""); setTest(null); }}>Cancel</button>
          </div>
          <span className="text-meta text-muted">Saved only inside Prax for Chrome in this browser and sent only to {shared?.name ?? t.name}. Prax never sees it.{t.console && <> <a className="inline-flex items-center gap-0.5 font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink" href={t.console} target="_blank" rel="noreferrer">Get a key <ExternalLink size={11} /></a></>}</span>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={cx("btn h-9", !on && "btn-primary")} onClick={() => { setOpen(true); setConfirm(false); }}>{on ? "Replace key" : `Connect ${t.short}`}</button>
          {on && testable && <button type="button" className="btn h-9" disabled={!!busy} onClick={runTest}>{busy === "test" ? <><Loader2 size={14} className="animate-spin" /> Testing</> : "Test connection"}</button>}
          {on && !confirm && <button type="button" className="btn btn-ghost h-9 hover:text-bad" onClick={() => setConfirm(true)}>Delete key</button>}
          {on && confirm && (
            <span className="tpl-confirm inline-flex items-center gap-2 rounded-lg border border-line px-2.5 py-1">
              <span className="text-meta">Delete the {shared?.name ?? t.name} key from this browser?</span>
              <button type="button" className="btn h-7 px-2.5 text-meta hover:text-bad" onClick={() => { keys.remove(keyTool(tool)); setConfirm(false); setTest(null); haptic(); }}>Delete</button>
              <button type="button" className="btn btn-ghost h-7 px-2 text-meta" onClick={() => setConfirm(false)}>Keep</button>
            </span>
          )}
        </div>
      )}
      {!t.test && <span className="text-meta text-muted">{t.id === "walter" ? "Walter is in early access, so there is no test call yet." : "No test call for this tool."}</span>}
      {test && (
        <p role="status" className={cx("anim-rise flex items-start gap-2 rounded-lg px-3 py-2 text-meta", test.ok ? "bg-surface-2 text-ink" : "bg-accent-soft text-dark-red")}>
          {test.ok ? <Check size={14} className="mt-px shrink-0" /> : <AlertCircle size={14} className="mt-px shrink-0" />}<span>{test.line}</span>
        </p>
      )}
    </div>
  );
}

/** A side sheet over the current page, for one tool or for one job's tool choice. Escape and the veil close it. */
export function ToolSheet({ tool, job, onClose }: { tool?: string; job?: JobId; onClose: () => void }) {
  const conn = useConnections({ usage: false });
  const { ws } = useWorkspace();
  const toast = useToast();
  const j = job ? jobOf(job) : null;
  const route = job ? conn.route(job) : null;
  const [pick, setPick] = useState<string>(tool || route?.primary || "");
  const panel = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLElement | null>(null);
  useEffect(() => {
    back.current = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled])");
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); back.current?.focus?.(); };
  }, [onClose]);
  useEffect(() => { if (!pick && route?.primary) setPick(route.primary); }, [route?.primary, pick]);

  async function choose(t: string) {
    setPick(t);
    if (!job || !route || !j?.routed || t === route.primary) return;
    try {
      const prev = await conn.save({ routes: { ...conn.settings.routes, [job]: { primary: t, fallback: route.fallback === t ? route.primary : route.fallback } } });
      // Writing jobs also set the drafting model here, so the extension follows even before db/032 runs.
      if (job === "comment") await conn.send("settings", { provider: t }).catch(() => {});
      haptic();
      toast(`${j!.name} now use ${toolName(t)}`, async () => { await conn.save({ routes: prev.routes }); if (job === "comment") await conn.send("settings", { provider: route.primary }).catch(() => {}); });
    } catch (e) { toast((e as Error).message); setPick(route.primary); }
  }

  const current = pick || tool || "";
  const ct = toolOf(current);
  return (
    <>
      <div className="cx-veil fixed inset-0 z-[54] bg-[rgba(20,20,20,.28)]" onClick={onClose} />
      <aside ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={j ? `${j.name}: choose a tool` : `${toolName(current)} connection`}
        className="cx-sheet fixed inset-y-0 right-0 z-[55] flex flex-col overflow-y-auto bg-white shadow-[-16px_0_40px_rgba(20,20,20,.14)] outline-none" style={{ width: "min(480px, 100vw)" }}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <span className="text-meta font-medium text-muted">{j ? `${j.name} · ${j.where}` : "Connections"}</span>
            <h2 className="mt-0.5 text-title font-semibold leading-snug">{j ? "Choose the tool for this job" : toolName(current)}</h2>
          </div>
          <button type="button" className="btn h-8 w-8 shrink-0 p-0" aria-label="Close" onClick={onClose}><X size={15} /></button>
        </div>
        {j && (
          <div role="radiogroup" aria-label={`Tool for ${j.name}`} className="flex flex-col gap-1.5 border-b border-line px-5 py-4">
            {j.tools.map((t) => {
              const on = t.startsWith("prax_") || conn.connected(t), sel = current === t;
              return (
                <button key={t} type="button" role="radio" aria-checked={sel} disabled={!conn.editor || conn.missing}
                  onClick={() => choose(t)}
                  className={cx("flex h-11 items-center justify-between gap-3 rounded-lg border px-3 text-left text-body transition-colors", sel ? "border-ink shadow-[inset_0_0_0_1px_#141414]" : "border-line hover:border-stroke")}>
                  <ToolInline id={t} className="font-medium" />
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-meta text-muted"><Dot on={on} />{t.startsWith("prax_") ? "Built in" : on ? "Connected" : "No key"}{route?.primary === t && <span className="cx-chip ink ml-1">In use</span>}{route?.fallback === t && <span className="cx-chip ml-1">Fallback</span>}</span>
                </button>
              );
            })}
            {conn.missing && <p className="text-meta text-muted">Run <code className="kbd">db/032_connections.sql</code> in Supabase to change routes. Until then each job uses its default.</p>}
            {!conn.editor && <p className="text-meta text-muted">Editors and owners change routes.</p>}
          </div>
        )}
        {ct && !current.startsWith("prax_") && (
          <div className="flex flex-col gap-4 px-5 py-5">
            <div className="flex items-center gap-3">
              <LogoTile id={current} />
              <div className="min-w-0"><div className="text-body font-semibold">{ct.name}{ct.beta && <span className="cx-chip ml-2">Beta</span>}</div><div className="text-meta text-muted">{ct.purpose}</div></div>
            </div>
            <KeyPanel tool={current} conn={conn} />
          </div>
        )}
        {current.startsWith("prax_") && <p className="px-5 py-5 text-body text-muted">{BUILT_IN[current]?.sub}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-line px-5 py-3.5">
          <Link href={`/w/${ws.slug}/connections/${current && !current.startsWith("prax_") ? current : ""}`} className="inline-flex items-center gap-1 text-meta font-medium text-ink hover:underline">{current && !current.startsWith("prax_") ? `Open ${toolName(current, true)} in Connections` : "Open Connections"} <ArrowRight size={12} /></Link>
          <button type="button" className="btn h-9" onClick={onClose}>Done</button>
        </div>
      </aside>
    </>
  );
}

/** "Using Claude · change" for a section, or Connect when the job has no tool with a key. Opens the sheet in place. */
export function UsingLine({ job, label, className, tool }: { job: JobId; label?: string; className?: string; tool?: string }) {
  const conn = useConnections({ usage: false });
  const [open, setOpen] = useState(false);
  const route = conn.route(job);
  const t = tool || route.primary;
  const on = t.startsWith("prax_") || conn.connected(t);
  const fb = route.fallback && (route.fallback.startsWith("prax_") || conn.connected(route.fallback)) ? route.fallback : "";
  const using = on ? t : fb;
  return (
    <span className={cx("inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-meta", className)}>
      {conn.status === null ? <span className="cx-skel inline-block h-4 w-40" /> : using ? (
        <>
          <span className="text-muted">{label ?? "Using"}</span><ToolInline id={using} className="font-semibold text-ink" />
          {using === fb && <span className="text-muted">(fallback)</span>}
          <span aria-hidden="true" className="text-muted">·</span>
          <button type="button" className="font-medium text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink" onClick={() => setOpen(true)}>change</button>
        </>
      ) : (
        <>
          <span className="text-muted">{conn.status?.installed ? `No ${toolName(t, true)} key in this browser` : "Prax for Chrome is not installed"}</span>
          <button type="button" className="btn h-8" onClick={() => setOpen(true)}>Connect</button>
        </>
      )}
      {open && <ToolSheet job={tool ? undefined : job} tool={tool} onClose={() => setOpen(false)} />}
    </span>
  );
}

/** A Connect button that opens the Connections panel in place: for one tool, or for a job's choice of tools. */
export function ConnectButton({ tool, job, label = "Connect", className }: { tool?: string; job?: JobId; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={cx("btn h-8", className)} onClick={() => setOpen(true)}>{label}</button>
      {open && <ToolSheet tool={tool} job={job} onClose={() => setOpen(false)} />}
    </>
  );
}
