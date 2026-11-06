"use client";
// The humanization flow for one piece of text in the web app (db/031). The logic lives in src/lib/humanize.ts; this
// hook runs it: the free score first, then a paid Pangram check through the extension only on the final text (Copy,
// Save, Log, Send for approval, or Check with Pangram), the cache, Prax's own rewrite of the flagged sentences (at most
// two rounds, each change accepted), then Walter (beta) if allowed, then a recheck. Keys never leave the extension.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLive } from "@/lib/live";
import { useWorkspace, ymd } from "@/lib/workspace";
import { askExtension, parseJSON, useExtension, NO_EXTENSION, type ExtStatus } from "@/lib/bridge";
import {
  mergeSettings, levelFor, monthUsage, decide, isFreeOnly, textHash, wordCount, costOf, normText, paragraphsOf, paragraphDiff, combine,
  pangramVerdict, localVerdict, stateOf, gate, gateLabel, flaggedSentences, rewriteAsk, parseChanges, applyChanges, walterAllowed, LOCAL_ROUNDS,
  detection, versionAtLeast, HUMANIZE_EXT, HUMANIZE_WAIT_MS, type DetectorId, type Detection, type Kind, type Section, type Settings, type Verdict, type Result, type Decision, type Change,
} from "@/lib/humanize";

type Plan = { decision: Decision | { action: "checked" }; level: number; results: (Result | null)[]; used: { pangram: number; walter: number }; caps: { pangram: number; walter: number }; rate: number; walter?: { hasKey: boolean; ready: boolean } };

/** The profile's humanization settings and this month's use, live. Before db/031 runs: defaults (all off). */
export function useHumanizeSettings() {
  const { ws } = useWorkspace();
  const s = useLive<Partial<Settings> & { workspace_id: string }>("humanize_settings", ws.id);
  const month = ymd(new Date()).slice(0, 7);
  const u = useLive<{ service: string; words: number; cost: number; day: string }>("humanize_usage", ws.id, { filter: (q) => q.gte("day", `${month}-01`) });
  return useMemo(() => ({
    settings: mergeSettings(s.rows[0]), loading: s.loading, missing: s.error, usage: monthUsage(u.rows, month), reload: s.reload,
  }), [s.rows, s.loading, s.error, s.reload, u.rows, month]);
}

/** Prax for Chrome in this browser for humanization: "ok" at 0.9.6 or later, "old" below, "none" when not installed.
 *  While the first status is still coming (null) it counts as "ok", so nothing shows an update line by mistake; a check
 *  then fails fast (NO_EXTENSION) and falls back to the free score. */
export function extStateOf(status: ExtStatus | null): "ok" | "old" | "none" {
  if (!status) return "ok";
  if (!status.installed) return "none";
  return versionAtLeast(status.version, HUMANIZE_EXT) ? "ok" : "old";
}
const WAIT_TEXT = "Pangram is taking longer than usual. Check again in a minute: a finished check is kept and costs nothing the second time.";

// Verdicts survive the panel closing and opening again in this tab (keyed by kind and text hash).
const memo = new Map<string, { v: Verdict; r: Result | null }>();

export type Review = { src: "prax" | "walter"; changes: Change[]; acc: boolean[] };
export type Humanize = ReturnType<typeof useHumanize>;

export function useHumanize(kind: Kind, text: string, setText: (t: string) => void, opts: { local: number; section: Section; initial?: Verdict | null }) {
  const { settings, usage } = useHumanizeSettings();
  const { status } = useExtension();
  const { ws } = useWorkspace();
  const level = levelFor(settings, kind);
  // Below 0.9.6 the extension has no humanize handler: no paid check is tried and the free score decides.
  const ext = extStateOf(status);
  const extRef = useRef(ext); extRef.current = ext;
  const [hash, setHash] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(opts.initial && opts.initial.checked_at ? opts.initial : null);
  const [result, setResult] = useState<Result | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState<"" | "check" | "fix" | "walter">("");
  const [err, setErr] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [rounds, setRounds] = useState(0);
  const [glow, setGlow] = useState(0);
  // Article paragraphs already checked, with their results, so an edit re-checks only what changed.
  const paras = useRef<{ text: string; r: Result }[]>([]);
  const textRef = useRef(text); textRef.current = text;

  useEffect(() => {
    let on = true;
    textHash(text).then((h) => { if (!on) return; setHash(h); const m = memo.get(`${kind}:${h}`); if (m) { setVerdict(m.v); setResult(m.r); } });
    return () => { on = false; };
  }, [text, kind]);

  const fresh = verdict && (!verdict.hash || verdict.hash === hash) ? verdict : null;
  const state = stateOf(fresh, level);
  const words = wordCount(text);
  const hasKey = !!status?.checkerKeys?.pangram;
  // What would happen on a check now, worked out here for the card (the background decides again before paying).
  const preview = useMemo(() => {
    const changed = kind === "article" ? paragraphDiff(paras.current.map((p) => p.text), paragraphsOf(text)).changed.map((i) => paragraphsOf(text)[i]) : [text];
    const w = changed.reduce((s, t) => s + wordCount(t), 0);
    return decide({ kind, level, local: opts.local, words: w, cached: false, hasKey, cap: settings.pangram_cap, used: usage.pangram.words, confirmed: false, costPer100: settings.pangram_cost_100, ext });
  }, [kind, level, opts.local, text, hasKey, settings.pangram_cap, settings.pangram_cost_100, usage.pangram.words, ext]);

  const keep = useCallback((v: Verdict, r: Result | null) => { setVerdict(v); setResult(r); setGlow((g) => g + 1); memo.set(`${kind}:${v.hash}`, { v, r }); }, [kind]);

  /** Runs the plan and, when it says so, the paid check. Returns the verdict for the current text (or null). */
  const check = useCallback(async (confirm = false): Promise<Verdict | null> => {
    const t = textRef.current;
    if (!normText(t)) return null;
    const h = await textHash(t);
    if (level <= 0) { const v = localVerdict(opts.local, 0, h, "off"); return v; }
    const done = memo.get(`${kind}:${h}`);
    if (done) { keep(done.v, done.r); return done.v; }
    // No Prax for Chrome, or one older than 0.9.6: Pangram cannot be used, so the free score decides (Not verified).
    if (extRef.current !== "ok") { const v = localVerdict(opts.local, level, h, extRef.current === "none" ? "no-ext" : "old-ext"); setVerdict(v); setResult(null); return v; }
    const all = kind === "article" ? paragraphsOf(t) : [t];
    const diff = kind === "article" ? paragraphDiff(paras.current.map((p) => p.text), all) : { changed: [0], kept: [] as number[] };
    const prevByText = new Map(paras.current.map((p) => [normText(p.text), p.r]));
    const send = diff.changed.map((i) => all[i]);
    setBusy("check"); setErr("");
    try {
      const r = send.length ? await askExtension<Plan>("humanize", { op: "check", kind, section: opts.section, profile: ws.id, texts: send, local: opts.local, confirm }, HUMANIZE_WAIT_MS) : null;
      if (r) setPlan(r);
      const action = r ? r.decision.action : "checked";
      if (action === "checked" || action === "cached") {
        const got = new Map<string, Result>();
        send.forEach((s, k) => { const x = r?.results[k]; if (x) got.set(normText(s), x); });
        const parts = all.map((p) => got.get(normText(p)) ?? prevByText.get(normText(p)) ?? null);
        if (parts.every(Boolean)) {
          paras.current = all.map((p, i) => ({ text: p, r: parts[i]! }));
          const res = combine(parts as Result[])!;
          const v = pangramVerdict(res, r?.level ?? level, h);
          keep(v, res); return v;
        }
        return null;
      }
      if (action === "confirm" || action === "empty" || action === "off") return null;
      const v = localVerdict(opts.local, r?.level ?? level, h, action);
      setVerdict(v); setResult(null);
      return isFreeOnly(action as Decision["action"]) || action === "local-low" ? v : null;
    } catch (e) {
      const m = (e as Error).message;
      // The bridge did not answer at all: treat it as no extension, so the free score decides.
      if (m === NO_EXTENSION) { const v = localVerdict(opts.local, level, h, "no-ext"); setVerdict(v); setResult(null); return v; }
      setErr(/did not answer/.test(m) ? WAIT_TEXT : m); return null;
    }
    finally { setBusy(""); }
  }, [kind, level, opts.local, opts.section, keep, ws.id]);

  /** A fresh verdict for the text, checking when needed. Used before Send for approval. */
  // A Pangram verdict for this exact text is kept; a free-score one is planned again (free), in case a key, a cap or the
  // extension has arrived since.
  const ensure = useCallback(async () => (fresh?.service === "pangram" ? fresh : await check(false)), [fresh, check]);

  const flagged = useMemo(() => (result && state === "needs" ? flaggedSentences(text, result.flagged) : []), [result, state, text]);

  const fix = useCallback(async (walter = false) => {
    const t = textRef.current;
    const sents = result ? flaggedSentences(t, result.flagged) : [];
    if (!sents.length) { setErr("The flagged passages could not be found in the text. Edit it, then check again."); return; }
    setBusy(walter ? "walter" : "fix"); setErr("");
    try {
      let changes: Change[] = [];
      if (walter) {
        const r = await askExtension<{ texts: string[] | null; walter?: { ok: boolean; why?: string } }>("humanize", { op: "walter", kind, section: opts.section, profile: ws.id, texts: sents, rounds, failing: true }, HUMANIZE_WAIT_MS);
        if (!r.texts) throw new Error({ "no-cap": "Enter Walter's monthly words in Settings → Humanization first.", "cap-reached": "This month's Walter words are used up.", "not-ready": "Walter (beta) is waiting for its API to be confirmed.", "no-key": "Add a Walter key in Settings → Humanization." }[r.walter?.why ?? ""] ?? "Walter is not available.");
        changes = parseChanges({ changes: sents.map((b, k) => ({ before: b, after: r.texts![k] })) }, t);
      } else {
        const raw = await askExtension<string>("ai", { kind: "repair", user: rewriteAsk(t, sents, rounds + 1) }, 120000);
        changes = parseChanges(parseJSON(raw), t);
      }
      if (!changes.length) throw new Error("No usable rewrite came back. Try again, or edit the flagged passages yourself.");
      setReview({ src: walter ? "walter" : "prax", changes, acc: changes.map(() => false) });
    } catch (e) { const m = (e as Error).message; setErr(walter && /did not answer/.test(m) ? WAIT_TEXT : m); }
    setBusy("");
  }, [result, kind, rounds, opts.section, ws.id]);

  const toggle = (k: number) => setReview((r) => (r ? { ...r, acc: r.acc.map((a, i) => (i === k ? !a : a)) } : r));
  const acceptAll = () => setReview((r) => (r ? { ...r, acc: r.acc.map(() => true) } : r));
  const discard = () => setReview(null);
  const apply = useCallback(async () => {
    if (!review || !review.acc.some(Boolean)) { setErr("Accept at least one change, or Discard."); return; }
    const next = applyChanges(textRef.current, review.changes, review.acc);
    if (review.src === "prax") setRounds((n) => n + 1);
    setReview(null); setText(next); textRef.current = next;
    // The accepted text is the final text again: check it (articles: only the edited paragraphs).
    await check(true);
  }, [review, setText, check]);

  const walter = walterAllowed({ hasKey: !!status?.checkerKeys?.walter, ready: !!plan?.walter?.ready, cap: settings.walter_cap, used: usage.walter.words, words: flagged.reduce((s, x) => s + wordCount(x), 0), rounds, failing: state === "needs" });
  return {
    kind, level, ext, hash, verdict: fresh, result, state, plan, preview, busy, err, setErr, review, rounds, glow, flagged, words,
    estimate: costOf(words, settings.pangram_cost_100), canFix: state === "needs" && rounds < LOCAL_ROUNDS, walter, walterKey: !!status?.checkerKeys?.walter,
    gate: gate(kind, level, fresh, hash), check, ensure, fix, toggle, acceptAll, discard, apply,
  };
}

/** The detector interface for any page: check(text) gives a score and a verdict, through the extension (the key stays
 *  there) and the same plan, cache and caps as every other check. GPTZero or Originality.ai plug in by id. */
export function detector(id: DetectorId, kind: Kind, section: Section, profile = "") {
  return {
    id,
    async check(text: string): Promise<Detection | null> {
      const r = await askExtension<Plan>("humanize", { op: "check", detector: id, kind, section, profile, texts: [text], local: 100, confirm: true }, HUMANIZE_WAIT_MS);
      const res = r.results?.[0];
      return res ? detection(id, res) : null;
    },
  };
}

/** The approval gate, the same for Send for approval, Approve and Approve it myself (Q131). ok says whether it may go
 *  on; note is the line for the toast (why it is held back, or that only the free score decided). */
export async function passGate(h: Humanize, text: string): Promise<{ ok: boolean; v: Verdict | null; note: string }> {
  if (h.level <= 0) return { ok: true, v: null, note: "" };
  const v = await h.ensure();
  const g = gate(h.kind, h.level, v, await textHash(text));
  if (!g.ok) return { ok: false, v, note: g.why === "below" ? `${gateLabel(h.level)}. Use Fix it in the Pangram card.` : "Check it with Pangram first, in the Pangram card. Long pieces check on click." };
  return { ok: true, v, note: v?.service === "local" ? freeNote(v.reason) : "" };
}
/** "Not verified, free score only." with what to do about it. */
export const freeNote = (reason?: string) =>
  `Not verified, free score only.${reason === "no-ext" ? " Install Prax for Chrome to verify." : reason === "old-ext" ? ` Update Prax for Chrome to ${HUMANIZE_EXT} to verify.` : ""}`;
