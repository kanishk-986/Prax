"use client";
import { useRef, useState } from "react";
import { Copy } from "lucide-react";
import { useToast, haptic } from "@/components/toaster";
import { styled, styleRange, listLines, caseRange, plain, markdownToLinkedIn, KEEP_BLANK, DIVIDER, type Style } from "@/lib/content";
import { LinkedInPreview } from "./preview";

/** The LinkedIn formatter for any text: styles, lists, spacing, case, Markdown, shortcuts, a 3,000 counter and the live preview. */
export function Formatter({ initial = "" }: { initial?: string }) {
  const toast = useToast();
  const [v, setV] = useState(initial);
  const [hist, setHist] = useState<string[]>([]);
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const ref = useRef<HTMLTextAreaElement>(null);
  const sel = () => { const el = ref.current; return el ? [el.selectionStart, el.selectionEnd] : [0, 0]; };
  const commit = (next: string | null, caret?: number) => {
    if (next == null || next === v) { if (next == null) toast("Select some text first"); return; }
    setHist((h) => [...h, v].slice(-60)); setV(next);
    if (caret != null) requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(caret, caret); });
  };
  const style = (k: Style) => { const [a, b] = sel(); const r = styleRange(v, a, b, k); commit(r ? r.text : null, r?.end); };
  const lines = (k: "bullet" | "number" | "arrow" | "check") => { const [a, b] = sel(); commit(listLines(v, a, b, k)); };
  const insert = (t: string) => { const [a, b] = sel(); commit(v.slice(0, a) + t + v.slice(b), a + t.length); };
  const kase = (k: "upper" | "title") => { const [a, b] = sel(); commit(caseRange(v, a, b, k)); };
  const clear = () => { const [a, b] = sel(); commit(a === b ? plain(v) : v.slice(0, a) + plain(v.slice(a, b)) + v.slice(b)); };
  const undo = () => { if (!hist.length) return; setV(hist[hist.length - 1]); setHist((h) => h.slice(0, -1)); };
  const keys = (e: React.KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    const run = k === "b" ? () => style("bold") : k === "i" ? () => style("italic") : k === "u" ? () => style("underline") : k === "x" && e.shiftKey ? () => style("strike") : k === "z" && !e.shiftKey ? undo : null;
    if (run) { e.preventDefault(); run(); }
  };
  const count = Array.from(v).length;
  const T = ({ face, label, run, kbd }: { face: string; label: string; run: () => void; kbd?: string }) => (
    <button type="button" className="inline-flex h-[34px] min-w-[34px] items-center justify-center rounded-lg px-2 text-body text-ink hover:bg-[#141414] hover:text-white" title={kbd ? `${label} (${kbd})` : label} aria-label={label} onMouseDown={(e) => e.preventDefault()} onClick={run}>{face}</button>
  );
  const sep = <span className="mx-1 h-6 w-px bg-line" />;
  return (
    <div className="flex flex-wrap items-start gap-5">
      <section className="card min-w-0 flex-[3_1_540px] overflow-hidden" data-tour="formatter">
        <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b border-line px-2.5 py-2">
          <T face={styled("B", "bold")} label="Bold" kbd="Cmd+B" run={() => style("bold")} />
          <T face={styled("I", "italic")} label="Italic" kbd="Cmd+I" run={() => style("italic")} />
          <T face={styled("BI", "bolditalic")} label="Bold italic" run={() => style("bolditalic")} />
          <T face={"U̲"} label="Underline" kbd="Cmd+U" run={() => style("underline")} />
          <T face={"S̶"} label="Strikethrough" kbd="Cmd+Shift+X" run={() => style("strike")} />
          {sep}
          <T face={styled("Aa", "serif")} label="Serif bold" run={() => style("serif")} />
          <T face={styled("Aa", "mono")} label="Monospace" run={() => style("mono")} />
          <T face={styled("Aa", "script")} label="Script" run={() => style("script")} />
          <T face={styled("Aa", "double")} label="Outline" run={() => style("double")} />
          {sep}
          <T face="•" label="Bullet list" run={() => lines("bullet")} />
          <T face="1." label="Numbered list" run={() => lines("number")} />
          <T face="→" label="Arrow list" run={() => lines("arrow")} />
          <T face="✓" label="Check list" run={() => lines("check")} />
          {sep}
          <T face="¶" label="Keep a blank line" run={() => insert(KEEP_BLANK)} />
          <T face="―" label="Divider" run={() => insert(DIVIDER)} />
          <T face="AB" label="Upper case" run={() => kase("upper")} />
          <T face="Ab" label="Title case" run={() => kase("title")} />
          {sep}
          <T face="↺" label="Undo" kbd="Cmd+Z" run={undo} />
          <T face="Tx" label="Clear formatting" run={clear} />
        </div>
        <label htmlFor="fmt" className="sr-only">Post text</label>
        <textarea id="fmt" ref={ref} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={keys} placeholder="Paste any post here, from Prax or anywhere else. Select words and press a style."
          className="block min-h-[360px] w-full resize-y border-0 bg-white px-5 py-4 text-title leading-relaxed text-ink outline-none" />
        <div className="flex flex-wrap items-center gap-2 border-t border-line p-3">
          <button className="btn btn-primary h-10" onClick={async () => { try { await navigator.clipboard.writeText(v); } catch {} haptic(); toast("Copied for LinkedIn"); }} disabled={!v}><Copy size={14} /> Copy for LinkedIn</button>
          <button className="btn btn-dark h-10" onClick={() => commit(markdownToLinkedIn(v))} disabled={!v}>Convert Markdown</button>
          <span className="num ml-auto text-meta" style={{ color: count > 3000 ? "#d64545" : "#5f5f5f" }}>{count.toLocaleString()} / 3000</span>
        </div>
      </section>
      <aside className="flex min-w-0 flex-[2_1_340px] flex-col gap-3">
        <LinkedInPreview text={v} device={device} setDevice={setDevice} />
        <p className="m-0 text-center text-meta text-muted">Styled letters are read poorly by screen readers and search, so style only a few words.</p>
      </aside>
    </div>
  );
}
