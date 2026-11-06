"use client";
// Draft a comment inside Prax: paste a LinkedIn post, pick a style, get 2 or 3 drafts in the profile's voice through
// the extension (the same AI path and rules as on LinkedIn). Copy, Save to the Library, or Log as done on Today.
// Prax never opens LinkedIn and never posts: a pasted link is only kept for the log.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { X, Copy, Bookmark, Check, CheckCheck, Link2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useWorkspace, today } from "@/lib/workspace";
import { firstNameOf, possessive } from "@/lib/persona";
import { useToast, haptic } from "@/components/toaster";
import { askExtension, parseJSON } from "@/lib/bridge";
import { isSkipped } from "@/lib/dashboard";
import { useHumanize } from "@/components/humanize/use-humanize";
import { VerdictCard, VerdictChip } from "@/components/humanize/verdict";
import type { Verdict } from "@/lib/humanize";
import { mergeStudio, humanScore, LENGTHS, LOCKED_RULES, tuningRules, commentAsk, readDrafts, panelDrafts, linkIn, onlyLink, type Studio, type Draft } from "@/lib/studio";

/** Where the panel was opened from. A Today row passes its id so Log as done ticks that row. */
export type DraftContext = { post?: string; link?: string; author?: string; itemId?: string; title?: string; prospectId?: string | null; auto?: boolean };
const EVENT = "prax:draft";
/** Opens the Draft a comment panel from anywhere in the workspace. */
export const openDraft = (ctx: DraftContext = {}) => window.dispatchEvent(new CustomEvent<DraftContext>(EVENT, { detail: ctx }));

type Row = Draft & { saved?: boolean; logged?: boolean };

/** Mounted once in the workspace layout (next to Command K); listens for openDraft. */
export function DraftPanelHost() {
  const [ctx, setCtx] = useState<DraftContext | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const on = (e: Event) => { setCtx((e as CustomEvent<DraftContext>).detail ?? {}); setN((x) => x + 1); };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return ctx ? <DraftPanel key={n} ctx={ctx} onClose={() => setCtx(null)} /> : null;
}

export function DraftPanel({ ctx, onClose }: { ctx: DraftContext; onClose: () => void }) {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const editor = can("editor");
  const first = firstNameOf(ws);
  const [studio, setStudio] = useState<Studio | null>(null);
  const pasted = linkIn(ctx.post ?? "");
  const [post, setPost] = useState((pasted ? (ctx.post ?? "").replace(pasted, "") : ctx.post ?? "").trim());
  const [link, setLink] = useState(ctx.link || pasted);
  const results = useRef<HTMLDivElement>(null);
  const [author, setAuthor] = useState(ctx.author ?? "");
  const [style, setStyle] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<{ type: string; mode: string; drafts: Row[] } | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const auto = useRef(!!ctx.auto);

  useEffect(() => {
    supabase().from("studio_settings").select("*").eq("workspace_id", ws.id).maybeSingle()
      .then(({ data }: { data: Partial<Studio> | null }) => setStudio(mergeStudio(data)), () => setStudio(mergeStudio(null)));
  }, [ws.id]);
  useEffect(() => { const t = setTimeout(() => box.current?.focus(), 60); return () => clearTimeout(t); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);

  // A pasted link is kept as the post's address; the text around it is what the drafts are written from.
  const onPost = (v: string) => { const l = linkIn(v); if (l) { setLink(l); setPost(v.replace(l, "").trim()); } else setPost(v); };
  const text = post.trim();
  const linkOnly = onlyLink(post) || (!text && !!link);
  const ready = !!studio && text.length >= 40 && !busy;
  const range = studio ? LENGTHS[studio.tuning.length] : LENGTHS.medium;

  const write = useCallback(async () => {
    if (!studio) return;
    setBusy(true); setErr(""); setRes(null);
    const n = panelDrafts(studio.tuning);
    try {
      const raw = await askExtension<string>("ai", { kind: "comment", user: commentAsk({ post: text, author, style, studio }) });
      const out = readDrafts(parseJSON(raw), n);
      if (!out) throw new Error("The model did not return drafts. Try again.");
      // Guardrail repair, as on LinkedIn: one extra call fixes drafts that break a house rule or score under the minimum.
      const t = studio.tuning;
      const bad = out.drafts.map((d, i) => ({ i, h: humanScore(d.text, range) }))
        .filter(({ h }) => (t.repair && h.flags.some((f) => !/words/.test(f))) || (t.humanize && h.score < t.minHuman));
      if (bad.length) {
        try {
          const fix = parseJSON<{ drafts?: { i: number; text: string }[] }>(await askExtension<string>("ai", { kind: "repair", user: `Rules: ${LOCKED_RULES} ${tuningRules(t)}\n\nFix these drafts. Keep each one's point and angle; change only what breaks the rules or reads as machine-written.\n${bad.map(({ i, h }) => `${i}. Problems: ${h.flags.join(", ") || "reads as AI"}\n${out.drafts[i].text}`).join("\n\n")}\n\nReturn only JSON: {"drafts": [{"i": 0, "text": "..."}]}` }));
          (fix?.drafts ?? []).forEach((d) => { if (out.drafts[d.i] && d.text?.trim()) out.drafts[d.i] = { ...out.drafts[d.i], text: d.text.trim() }; });
        } catch { /* the unrepaired drafts are still shown, with their flags */ }
      }
      setRes({ ...out, mode: style || out.mode }); setChosen(0);
      haptic();
      setTimeout(() => results.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }), 30);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }, [studio, text, author, style, range]);

  // Opened from the Home paste box: start at once.
  useEffect(() => { if (auto.current && studio && text.length >= 40) { auto.current = false; write(); } }, [studio, text, write]);

  // The draft being used is the chosen one: its Pangram verdict sits right above its buttons; the others show a chip.
  const [chosen, setChosen] = useState(0);
  const setDraft = (i: number, p: Partial<Row>) => setRes((r) => (r ? { ...r, drafts: r.drafts.map((d, k) => (k === i ? { ...d, ...p } : d)) } : r));
  const styleName = res?.mode || style || "";

  async function copy(d: Row) {
    try { await navigator.clipboard.writeText(d.text); haptic(); toast("Copied. Paste it on LinkedIn and press Post yourself."); }
    catch { toast("Could not copy. Select the text and copy it."); }
  }
  async function save(i: number, d: Row, v: Verdict | null) {
    const row = { workspace_id: ws.id, kind: "comment", text: d.text, author: author.trim(), post_url: link, style: styleName, post_type: res?.type ?? "", human: humanScore(d.text, range).score, impact: d.impact ? d.impact * 10 : null, source: "app" };
    // The badge is saved with the draft (db/031); before 031 runs the column is missing, so the draft is saved without it.
    let { data, error } = await supabase().from("saved_drafts").insert(v ? { ...row, humanize: v } : row).select("id").single();
    if (error && v && /humanize/.test(error.message)) ({ data, error } = await supabase().from("saved_drafts").insert(row).select("id").single());
    if (error) { toast(error.message); return; }
    setDraft(i, { saved: true }); haptic();
    toast("Saved to the Library", async () => { await supabase().from("saved_drafts").delete().eq("id", (data as { id: string }).id); setDraft(i, { saved: false }); });
  }
  // Log as done: the same two writes the extension makes when Post is pressed on LinkedIn. One comment_log row,
  // then the Today comment task this panel came from (or the first open one) is ticked.
  async function logDone(i: number, d: Row) {
    const sb = supabase(), day = today();
    type Item = { id: string; title: string; link: string; note: string; done: boolean; prospect_id: string | null };
    let item: Item | null = null;
    if (ctx.itemId) {
      const { data } = await sb.from("daily_items").select("id,title,link,note,done,prospect_id").eq("id", ctx.itemId).maybeSingle();
      item = data && !(data as Item).done ? (data as Item) : null;
    }
    if (!item) {
      const { data } = await sb.from("daily_items").select("id,title,link,note,done,prospect_id").eq("workspace_id", ws.id).eq("day", day).eq("kind", "comment").eq("done", false).order("idx");
      item = ((data ?? []) as Item[]).find((r) => !isSkipped(r.note)) ?? null;
    }
    const prospect = ctx.prospectId ?? item?.prospect_id ?? null;
    const { data: logged, error } = await sb.from("comment_log").insert({ workspace_id: ws.id, day, author: author.trim(), url: link, mode: styleName, text: d.text, post_text: text.slice(0, 6000), source: "app", prospect_id: prospect }).select("id").single();
    if (error) { toast(error.message); return; }
    const before = item;
    if (item) {
      const title = item.title.trim() || ctx.title?.trim() || author.trim();
      const { error: e2 } = await sb.from("daily_items").update({ done: true, link: item.link || link, ...(title ? { title } : {}), ...(prospect ? { prospect_id: prospect } : {}) }).eq("id", item.id);
      if (e2) toast("Logged, but the Today task could not be ticked. Tick it on Today.");
    }
    setDraft(i, { logged: true }); haptic(10);
    toast(item ? "Logged and ticked on Today" : "Logged. Every comment task today was already done, so this one is extra.", async () => {
      await sb.from("comment_log").delete().eq("id", (logged as { id: string }).id);
      if (before) await sb.from("daily_items").update({ done: false, title: before.title, link: before.link, prospect_id: before.prospect_id }).eq("id", before.id);
      setDraft(i, { logged: false });
    });
  }

  const styles = studio?.styles.filter((s) => s.on) ?? [];
  const extErr = /extension/i.test(err);
  return (
    <>
      <div className="fixed inset-0 z-[64] bg-[rgba(20,20,20,.22)]" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-labelledby="draft-title" className="pl-slide fixed inset-y-0 right-0 z-[65] flex w-[min(540px,100vw)] flex-col overflow-y-auto bg-white shadow-[-12px_0_30px_rgba(20,20,20,.12)]">
        <header className="flex items-start justify-between gap-3 px-[22px] pb-4 pt-[22px] max-sm:px-4">
          <span className="flex min-w-0 flex-col gap-1">
            <h2 id="draft-title" className="text-page font-semibold tracking-[-0.02em]">Draft a comment</h2>
            <span className="text-body text-muted">In {possessive(first)} voice, with the rules in Voice and rules. Prax drafts; you post it on LinkedIn.</span>
          </span>
          <button type="button" className="btn h-8 w-8 shrink-0 p-0" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </header>

        <div className="flex flex-col gap-4 border-t border-line px-[22px] py-5 max-sm:px-4">
          {ctx.itemId && <p className="text-meta text-muted">For Today: <span className="font-medium text-ink-2">{ctx.title?.trim() || "a comment task"}</span></p>}
          <label className="flex flex-col gap-1.5">
            <span className="text-meta font-semibold">The post</span>
            <textarea ref={box} value={post} onChange={(e) => onPost(e.target.value)} rows={6} placeholder="Paste the post text from LinkedIn. A link alone is kept for the log; Prax does not open LinkedIn."
              className="field h-auto min-h-[140px] py-2 text-body leading-relaxed" />
          </label>
          {link && (
            <span className="flex min-w-0 items-center gap-2 text-meta text-muted">
              <Link2 size={13} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{link.replace(/^https?:\/\/(www\.)?/, "")}</span>
              <button type="button" className="btn btn-ghost h-7 px-2 text-meta" onClick={() => setLink("")}>Remove link</button>
            </span>
          )}
          {linkOnly && <p className="text-meta text-warn">That is a link only. Paste the post text as well, so the drafts are about what it says.</p>}
          <label className="flex flex-col gap-1.5">
            <span className="text-meta font-semibold">Who wrote it <span className="font-normal text-muted">(optional)</span></span>
            <input className="field" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="For example, Maya Rao" />
          </label>
          <div className="flex flex-col gap-1.5">
            <span id="draft-style" className="text-meta font-semibold">Style</span>
            <div role="radiogroup" aria-labelledby="draft-style" className="flex flex-wrap gap-1.5">
              {[{ name: "", label: "Best fit" }, ...styles.map((s) => ({ name: s.name, label: s.name }))].map((s) => (
                <button key={s.name || "auto"} type="button" role="radio" aria-checked={(style ?? "") === s.name} onClick={() => setStyle(s.name || null)} className={`pl-chip small ${(style ?? "") === s.name ? "on" : ""}`}>{s.label}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary h-10 px-4" disabled={!ready} onClick={write}>{busy ? "Writing" : res ? "Write again" : `Write ${studio ? panelDrafts(studio.tuning) : 3} drafts`}</button>
            {!busy && text.length > 0 && text.length < 40 && <span className="text-meta text-muted">Paste a little more of the post.</span>}
          </div>
        </div>

        <div ref={results} className="flex flex-1 flex-col gap-3 border-t border-line bg-[#fafafa] px-[22px] py-5 max-sm:px-4" aria-live="polite" aria-busy={busy}>
          {err ? (
            <div className="panel flex flex-col gap-2 p-4">
              <p className="text-body text-ink-2">{err}</p>
              {extErr && <Link href={`/w/${ws.slug}/extension`} onClick={onClose} className="btn h-9 w-fit px-3">Open Extension</Link>}
            </div>
          ) : busy ? (
            [0, 1, 2].slice(0, studio ? panelDrafts(studio.tuning) : 3).map((k) => <div key={k} className="h-[132px] animate-pulse rounded-xl bg-[#ececec]" />)
          ) : res ? (<>
            <p className="text-meta text-muted">{[res.type && `Read as ${res.type}`, styleName && `Style: ${styleName}`].filter(Boolean).join(" · ")}</p>
            {res.drafts.map((d, i) => (
              <DraftCard key={i} i={i} d={d} range={range} minHuman={studio?.tuning.minHuman ?? 85} chosen={chosen === i} editor={editor}
                onText={(t) => setDraft(i, { text: t })} onChoose={() => setChosen(i)} onCopy={() => copy(d)} onSave={(v) => save(i, d, v)} onLog={() => logDone(i, d)} />
            ))}
            <p className="text-meta text-muted">Copy a draft, paste it under the post on LinkedIn and press Post yourself. Then log it here, so Today and Engagement count it.</p>
          </>) : (
            <p className="text-body text-muted">Drafts appear here with their Human and Impact scores. Each one takes a different angle; the strongest is first.</p>
          )}
        </div>
      </aside>
    </>
  );
}

/** One draft with its scores and actions. Copy, Save and Log run the Pangram check on this draft (when the plan says so);
 *  the chosen draft shows the verdict card right above the buttons, so the score is seen at the moment of using it. */
function DraftCard({ i, d, range, minHuman, chosen, editor, onText, onChoose, onCopy, onSave, onLog }: {
  i: number; d: Row; range: { lo: number; hi: number }; minHuman: number; chosen: boolean; editor: boolean;
  onText: (t: string) => void; onChoose: () => void; onCopy: () => void; onSave: (v: Verdict | null) => void; onLog: () => void;
}) {
  const hs = humanScore(d.text, range);
  const hz = useHumanize("comment", d.text, onText, { local: hs.score, section: "comment_studio" });
  const okH = hs.score >= minHuman;
  const use = (fn: () => void) => { onChoose(); fn(); };
  return (
    <article className="panel anim-rise flex flex-col gap-2.5 p-4">
      <textarea aria-label={`Draft ${i + 1}`} value={d.text} onChange={(e) => onText(e.target.value)} onFocus={onChoose} className="w-full resize-none bg-transparent text-body leading-relaxed text-ink outline-none [field-sizing:content] focus-visible:rounded-md focus-visible:bg-[#f6f6f6]" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta">
        <span className={`num whitespace-nowrap font-semibold ${okH ? "text-ink" : "text-warn"}`}>Human {hs.score}</span>
        <span className="num whitespace-nowrap font-semibold text-ink" title="How likely the author is to reply">{d.impact ? `Impact ${d.impact * 10}` : "Impact not scored"}</span>
        {!chosen && hz.level > 0 && <VerdictChip v={hz.verdict} />}
        {d.angle && <span className="min-w-0 text-muted">{d.angle}</span>}
      </div>
      {hs.flags.length > 0 && <p className="text-meta text-warn">{hs.flags.join(" · ")}</p>}
      {chosen && <VerdictCard h={hz} local={hs.score} />}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <button type="button" className="btn h-8 px-2.5 text-meta" onClick={() => use(() => { onCopy(); hz.check(); })}><Copy size={13} /> Copy</button>
        {editor && <button type="button" className="btn h-8 px-2.5 text-meta" disabled={d.saved || hz.busy === "check"} onClick={() => use(async () => onSave(await hz.check()))}>{d.saved ? <><Check size={13} /> Saved</> : <><Bookmark size={13} /> Save to Library</>}</button>}
        {editor && <button type="button" className="btn h-8 px-2.5 text-meta" disabled={d.logged} onClick={() => use(() => { onLog(); hz.check(); })}>{d.logged ? <><Check size={13} /> Logged</> : <><CheckCheck size={13} /> Log as done on Today</>}</button>}
      </div>
    </article>
  );
}
