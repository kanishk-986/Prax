// Humanization with Pangram (and Walter AI as an optional second fixer), agreed 7 Nov 2026 (Q128 to Q134).
// Pure logic shared by the web app, the /api/ext/humanize route and scripts/test-humanize.ts: the Pangram response
// mapping, the paid-check decision table, the approval gate, the cache key, the monthly caps, paragraph diffing for
// articles, the badge words and the rewrite review. No React, no Supabase, no imports, so Node runs it as it is.
//
// Cost rules (docs/HANDOFF.md): the free local Human score first; a paid check only on the chosen, final text and only
// when the local score is close to or above the level; results cached by text hash so unchanged text is never checked
// twice; articles re-check only edited paragraphs; a monthly word cap per service, warning at 80% and stopping paid
// checks at 100%; at level 0 Pangram is never called; Walter only after Pangram fails and both local rounds fail.

export type Kind = "comment" | "post" | "article";
export type Service = "pangram" | "walter";
export const KINDS: Kind[] = ["comment", "post", "article"];
export const PRESETS = [20, 50, 70, 90, 100] as const;
/** Paid checks run only when the free score is at least this close to the level. */
export const NEAR = 10;
/** Pieces longer than this (and every article) show the estimated cost and check on click. */
export const LONG_WORDS = 400;
/** Local rewrite rounds before Walter may be offered. */
export const LOCAL_ROUNDS = 2;
export const WARN_AT = 0.8;
export const DEFAULT_COST_100 = { pangram: 0.05, walter: 0 } as const;

export type Settings = {
  level_comment: number; level_post: number; level_article: number;
  pangram_cap: number; walter_cap: number; pangram_cost_100: number; walter_cost_100: number;
};
/** Before db/031 runs, or for a profile that never saved: every level 0, so nothing is paid and nothing is gated. */
export const DEFAULT_SETTINGS: Settings = { level_comment: 0, level_post: 0, level_article: 0, pangram_cap: 0, walter_cap: 0, pangram_cost_100: DEFAULT_COST_100.pangram, walter_cost_100: DEFAULT_COST_100.walter };
export const levelFor = (s: Settings, k: Kind) => clampLevel(k === "comment" ? s.level_comment : k === "post" ? s.level_post : s.level_article);
export const clampLevel = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
export function mergeSettings(row: Partial<Settings> | null | undefined): Settings {
  const r = row ?? {};
  const num = (v: unknown, d: number) => (v == null || Number.isNaN(Number(v)) ? d : Math.max(0, Number(v)));
  return {
    level_comment: clampLevel(r.level_comment), level_post: clampLevel(r.level_post), level_article: clampLevel(r.level_article),
    pangram_cap: Math.round(num(r.pangram_cap, 0)), walter_cap: Math.round(num(r.walter_cap, 0)),
    pangram_cost_100: num(r.pangram_cost_100, DEFAULT_COST_100.pangram), walter_cost_100: num(r.walter_cost_100, DEFAULT_COST_100.walter),
  };
}
/** Which kind a Content Studio format is checked as. */
export const kindOfFormat = (format: string | undefined | null): Kind => (format === "Article" ? "article" : "post");

// ---------- text ----------
/** The cache key's text: whitespace collapsed and trimmed, so a stray space or line break is not a new paid check. */
export const normText = (t: string) => String(t ?? "").replace(/\s+/g, " ").trim();
export const wordCount = (t: string) => { const n = normText(t); return n ? n.split(" ").length : 0; };
/** SHA-256 of the normalised text, hex. The same in the browser and in Node (globalThis.crypto). */
export async function textHash(t: string): Promise<string> {
  const b = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(normText(t)));
  return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
}
export const costOf = (words: number, per100: number) => Math.round((Math.max(0, words) / 100) * Math.max(0, per100) * 10000) / 10000;
export const money = (n: number) => (n > 0 && n < 0.01 ? "under $0.01" : `$${n.toFixed(2)}`);

/** An article's paragraphs, the unit it is checked and cached by. A block under 8 words (a heading) joins the next. */
export function paragraphsOf(text: string): string[] {
  const blocks = String(text ?? "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const out: string[] = [];
  let carry = "";
  for (const b of blocks) {
    const cur = carry ? `${carry}\n\n${b}` : b;
    if (wordCount(b) < 8 && !carry) { carry = cur; continue; }
    if (wordCount(cur) < 8) { carry = cur; continue; }
    out.push(cur); carry = "";
  }
  if (carry) { if (out.length) out[out.length - 1] += `\n\n${carry}`; else out.push(carry); }
  return out;
}
/** Which paragraphs changed since the last check: the ones whose text is not among the checked ones. */
export function paragraphDiff(prev: string[], next: string[]): { changed: number[]; kept: number[] } {
  const pool = new Map<string, number>();
  prev.forEach((p) => pool.set(normText(p), (pool.get(normText(p)) ?? 0) + 1));
  const changed: number[] = [], kept: number[] = [];
  next.forEach((p, i) => { const k = normText(p), n = pool.get(k) ?? 0; if (n > 0) { kept.push(i); pool.set(k, n - 1); } else changed.push(i); });
  return { changed, kept };
}

// ---------- the Pangram response ----------
// Built only from the documented shape of GET https://text.external-api.pangram.com/task/{task_id}
// (docs.pangram.com/api-reference/ai-detection.md). The synchronous POST https://text.api.pangram.com/v3 is listed under
// Deprecated Endpoints and returns the same fields; both map the same way.
export type Flag = { text: string; label: string; ai: number; confidence: string; start: number; end: number };
export type Result = { score: number; words: number; flagged: Flag[]; prediction: string; headline: string; version: string };

type RawWindow = { text?: string; label?: string; ai_assistance_score?: number; ai_likelihood?: number; confidence?: string; start_index?: number; end_index?: number; word_count?: number };
type Raw = { stage?: string; text?: string; version?: string; headline?: string; prediction?: string; prediction_short?: string; fraction_human?: number; fraction_ai?: number; ai_likelihood?: number; windows?: RawWindow[] };

/** True when the task has finished (success or failure); anything else is still running. */
export const isDone = (raw: Raw | null | undefined) => raw?.stage === "STAGE_SUCCESS" || raw?.stage === "STAGE_FAILED";

/**
 * A completed Pangram result as Prax shows it.
 * - score: the overall human percentage = round(fraction_human x 100). Pangram documents fraction_human as the fraction
 *   of the text classified as human-written (0.0 to 1.0); AI-assisted text counts as not human. Only when a response
 *   carries no fraction_human (the deprecated root endpoint) is it 100 minus round(ai_likelihood x 100).
 * - flagged: every window whose label is not "Human Written" (Pangram 4 labels: "AI-Generated", "AI-Assisted",
 *   "Human Written"), with its text, label, ai_assistance_score, confidence and character offsets.
 * - words: the sum of the windows' word_count, or the words in the text when there are no windows.
 * Throws with Pangram's headline when the stage is STAGE_FAILED.
 */
export function mapPangram(raw: unknown): Result {
  const r = (raw ?? {}) as Raw;
  if (r.stage === "STAGE_FAILED") throw new Error(`Pangram could not check this text: ${r.headline || "it failed"}`);
  if (r.stage && r.stage !== "STAGE_SUCCESS") throw new Error("Pangram has not finished this check yet.");
  const fh = typeof r.fraction_human === "number" ? r.fraction_human : typeof r.ai_likelihood === "number" ? 1 - r.ai_likelihood : null;
  if (fh == null) throw new Error("Pangram's reply had no score.");
  const wins = Array.isArray(r.windows) ? r.windows : [];
  const flagged = wins.filter((w) => !/^human/i.test(String(w.label ?? "")) && String(w.text ?? "").trim())
    .map((w) => ({ text: String(w.text).trim(), label: String(w.label ?? "AI"), ai: Number(w.ai_assistance_score ?? w.ai_likelihood ?? 0), confidence: String(w.confidence ?? ""), start: Number(w.start_index ?? -1), end: Number(w.end_index ?? -1) }));
  const words = wins.reduce((s, w) => s + (Number(w.word_count) || 0), 0) || wordCount(r.text ?? "");
  return { score: Math.max(0, Math.min(100, Math.round(fh * 100))), words, flagged, prediction: String(r.prediction_short ?? ""), headline: String(r.headline ?? ""), version: String(r.version ?? "") };
}

// ---------- detectors ----------
// One small interface so GPTZero or Originality.ai can plug in beside Pangram: a detector's request lives in the
// extension (DETECTORS in extension/background.js: check(key, text) returns its raw reply), and its reply is mapped here
// into Prax's Result. check(text) through either gives a score and a verdict.
export type DetectorId = "pangram" | "gptzero" | "originality";
export type Detection = { detector: DetectorId; score: number; verdict: "human" | "mixed" | "ai"; result: Result };
export type Detector = { id: DetectorId; name: string; map: (raw: unknown) => Result };
export const DETECTORS: Partial<Record<DetectorId, Detector>> = {
  pangram: { id: "pangram", name: "Pangram", map: mapPangram },
  gptzero: { id: "gptzero", name: "GPTZero", map: mapGptzero },
  originality: { id: "originality", name: "Originality.ai", map: mapOriginality },
};

// GPTZero and Originality.ai (registered by Connections, db/032). The extension sends only the fields below
// (slimDetect in extension/tools.js); fixtures from each vendor's docs are in scripts/fixtures/connections.
type GzRaw = { predicted_class?: string; class_probabilities?: { human?: number; ai?: number; mixed?: number }; result_message?: string; version?: string; sentences?: { sentence?: string; generated_prob?: number }[] };
/**
 * GPTZero POST /v2/predict/text (docs.gptzero.me/openapi/public.yaml), documents[0]:
 * - score: round(class_probabilities.human x 100), the document's probability of being human written.
 * - flagged: sentences whose generated_prob is 0.5 or more. prediction: predicted_class (human, ai or mixed).
 */
export function mapGptzero(raw: unknown): Result {
  const r = (raw ?? {}) as GzRaw;
  const h = r.class_probabilities?.human;
  if (typeof h !== "number") throw new Error("GPTZero's reply had no score.");
  const sents = Array.isArray(r.sentences) ? r.sentences : [];
  const flagged = sents.filter((s) => Number(s.generated_prob) >= 0.5 && String(s.sentence ?? "").trim())
    .map((s) => ({ text: String(s.sentence).trim(), label: "AI-Generated", ai: Number(s.generated_prob), confidence: "", start: -1, end: -1 }));
  const words = sents.reduce((n, s) => n + wordCount(String(s.sentence ?? "")), 0);
  return { score: Math.max(0, Math.min(100, Math.round(h * 100))), words, flagged, prediction: String(r.predicted_class ?? ""), headline: String(r.result_message ?? ""), version: String(r.version ?? "") };
}
type OaRaw = { prediction_label?: string; ai_assisted_percent?: number; model?: string; credits?: number; sentences?: { text?: string; ai_score?: number; start_index?: number; end_index?: number }[] };
/**
 * Originality.ai POST /api/v3/scan with check_ai only (docs.originality.ai/scan), results.ai:
 * - score: 100 minus ai_assisted_percent. flagged: sentences whose ai_score (0 to 1) is 0.5 or more.
 * - prediction: prediction_label ("human" or "ai"). words: credits used x 100 when given (1 credit = 100 words).
 */
export function mapOriginality(raw: unknown): Result {
  const r = (raw ?? {}) as OaRaw;
  if (typeof r.ai_assisted_percent !== "number") throw new Error("Originality.ai's reply had no score.");
  const sents = Array.isArray(r.sentences) ? r.sentences : [];
  const flagged = sents.filter((s) => Number(s.ai_score) >= 0.5 && String(s.text ?? "").trim())
    .map((s) => ({ text: String(s.text).trim(), label: "AI-Generated", ai: Number(s.ai_score), confidence: "", start: Number(s.start_index ?? -1), end: Number(s.end_index ?? -1) }));
  const words = sents.reduce((n, s) => n + wordCount(String(s.text ?? "")), 0);
  return { score: Math.max(0, Math.min(100, 100 - Math.round(r.ai_assisted_percent))), words, flagged, prediction: String(r.prediction_label ?? ""), headline: "", version: String(r.model ?? "") };
}
/** The verdict word: Pangram's own short prediction when it gives one ("Human", "Mixed", "AI"), else from the score. */
export function detection(id: DetectorId, r: Result): Detection {
  const p = r.prediction.toLowerCase();
  const verdict = p === "human" || p === "ai" || p === "mixed" ? p : r.score >= 80 ? "human" : r.score >= 40 ? "mixed" : "ai";
  return { detector: id, score: r.score, verdict, result: r };
}
/** Usage tags for the Connections section: which job a paid call did, and the Prax section it came from. */
export type Job = "humanize_check" | "humanize_rewrite";
export const SECTIONS = ["comment_studio", "linkedin_bar", "content_write", "content_editor"] as const;
export type Section = (typeof SECTIONS)[number];
export const sectionOf = (s: unknown): Section | "" => ((SECTIONS as readonly string[]).includes(String(s)) ? (s as Section) : "");

/** Several checked paragraphs as one article result: the human share weighted by words, every flag kept. */
export function combine(parts: Result[]): Result | null {
  const ok = parts.filter(Boolean);
  if (!ok.length) return null;
  const words = ok.reduce((s, p) => s + p.words, 0);
  const score = words ? Math.round(ok.reduce((s, p) => s + p.score * p.words, 0) / words) : Math.round(ok.reduce((s, p) => s + p.score, 0) / ok.length);
  return { score, words, flagged: ok.flatMap((p) => p.flagged), prediction: ok.every((p) => p.prediction === ok[0].prediction) ? ok[0].prediction : "Mixed", headline: "", version: ok[0].version };
}

// ---------- caps ----------
export type Meter = { used: number; cap: number; pct: number | null; state: "none" | "ok" | "warn" | "stop" };
/** A month's use against the plan cap: no cap entered, fine, at 80% a warning, at 100% paid checks stop. */
export function meter(used: number, cap: number): Meter {
  if (!cap || cap <= 0) return { used, cap: 0, pct: null, state: "none" };
  const pct = used / cap;
  return { used, cap, pct, state: pct >= 1 ? "stop" : pct >= WARN_AT ? "warn" : "ok" };
}
/** This month's words and cost per service from usage rows (day is YYYY-MM-DD). */
export function monthUsage(rows: { service: string; words: number; cost: number | string | null; day: string }[], month: string) {
  const out = { pangram: { words: 0, cost: 0, checks: 0 }, walter: { words: 0, cost: 0, checks: 0 } };
  for (const r of rows) {
    if (String(r.day).slice(0, 7) !== month || (r.service !== "pangram" && r.service !== "walter")) continue;
    const o = out[r.service as Service];
    o.words += Number(r.words) || 0; o.cost += Number(r.cost) || 0; o.checks++;
  }
  out.pangram.cost = Math.round(out.pangram.cost * 10000) / 10000; out.walter.cost = Math.round(out.walter.cost * 10000) / 10000;
  return out;
}

// ---------- the decision table ----------
export type PlanInput = {
  kind: Kind; level: number; local: number; words: number; cached: boolean;
  hasKey: boolean; cap: number; used: number; confirmed: boolean; costPer100: number;
};
export type Decision =
  | { action: "empty" }
  | { action: "off" }
  | { action: "cached" }
  | { action: "local-low"; need: number }
  | { action: "no-key" }
  | { action: "no-cap" }
  | { action: "cap-reached"; meter: Meter }
  | { action: "confirm"; words: number; cost: number; meter: Meter }
  | { action: "check"; words: number; cost: number; meter: Meter; warn: boolean };

/**
 * Whether a paid Pangram check runs for the final text, in this order:
 * nothing to check; level 0 (never call Pangram); already checked (cache); free score too far under the level (fix it
 * first, for free); no Pangram key in this browser; no monthly cap entered; the cap would be passed; a long piece or an
 * article not yet confirmed (show the cost first); otherwise check, warning from 80% of the cap.
 * `words` is what would be sent (for an article, only the paragraphs not in the cache).
 */
export function decide(p: PlanInput): Decision {
  if (p.words <= 0 && !p.cached) return { action: "empty" };
  if (p.level <= 0) return { action: "off" };
  if (p.cached && p.words <= 0) return { action: "cached" };
  if (p.local < p.level - NEAR) return { action: "local-low", need: p.level - NEAR };
  if (!p.hasKey) return { action: "no-key" };
  if (!p.cap || p.cap <= 0) return { action: "no-cap" };
  const m = meter(p.used, p.cap);
  if (p.used + p.words > p.cap) return { action: "cap-reached", meter: m };
  const cost = costOf(p.words, p.costPer100);
  if ((p.kind === "article" || p.words > LONG_WORDS) && !p.confirmed) return { action: "confirm", words: p.words, cost, meter: m };
  return { action: "check", words: p.words, cost, meter: meter(p.used + p.words, p.cap), warn: (p.used + p.words) / p.cap >= WARN_AT };
}
/** Free-score-only outcomes: Pangram cannot be used, so the badge says "Not verified, free score only". */
export const FREE_ONLY = ["no-key", "no-cap", "cap-reached"] as const;
export const isFreeOnly = (a: Decision["action"]) => (FREE_ONLY as readonly string[]).includes(a);

/** Walter (beta): only with its key, its API confirmed, a cap with room, and only after both local rounds failed. */
export function walterAllowed(w: { hasKey: boolean; ready: boolean; cap: number; used: number; words: number; rounds: number; failing: boolean }):
  { ok: true } | { ok: false; why: "not-yet" | "passing" | "no-key" | "not-ready" | "no-cap" | "cap-reached" } {
  if (!w.failing) return { ok: false, why: "passing" };
  if (w.rounds < LOCAL_ROUNDS) return { ok: false, why: "not-yet" };
  if (!w.hasKey) return { ok: false, why: "no-key" };
  if (!w.ready) return { ok: false, why: "not-ready" };
  if (!w.cap || w.cap <= 0) return { ok: false, why: "no-cap" };
  if (w.used + w.words > w.cap) return { ok: false, why: "cap-reached" };
  return { ok: true };
}

// ---------- the verdict, the badge and the gate ----------
/** What is saved with a draft or post (posts.humanize, saved_drafts.humanize). */
export type Verdict = {
  score: number; level: number; service: "pangram" | "local"; checked_at: string; passed: boolean;
  hash?: string; words?: number; flagged?: number; reason?: string;
};
export type State = "off" | "passed" | "needs" | "free";
export function stateOf(v: Verdict | null | undefined, level: number): State {
  if (level <= 0) return "off";
  if (!v || v.service !== "pangram") return "free";
  return v.score >= level ? "passed" : "needs";
}
export function pangramVerdict(r: Result, level: number, hash: string, at = new Date().toISOString()): Verdict {
  return { score: r.score, level, service: "pangram", checked_at: at, passed: r.score >= level, hash, words: r.words, flagged: r.flagged.length };
}
export function localVerdict(local: number, level: number, hash: string, reason: string, at = new Date().toISOString()): Verdict {
  return { score: local, level, service: "local", checked_at: at, passed: level <= 0 || local >= level, hash, reason };
}
/** The badge, word for word. Pangram's number is always "per Pangram", never a promise of human writing. */
export function badgeText(v: Verdict | null | undefined, level: number): string {
  const s = stateOf(v, level);
  if (s === "off") return "Humanization off";
  if (s === "free") return "Not verified, free score only";
  return `Pangram: ${v!.score}% human · ${s === "passed" ? "passed" : "needs work"} (your level: ${level}%)`;
}
/** A short chip for lists: "Pangram 94%", "Needs work 72%", "Not checked". */
export function chipText(v: Verdict | null | undefined): string {
  if (!v || !v.checked_at) return "Not checked";
  if (v.service !== "pangram") return "Not verified";
  return `Pangram ${v.score}%`;
}
export type LibFilter = "all" | "passed" | "needs" | "unchecked";
export function libState(v: Verdict | null | undefined): Exclude<LibFilter, "all"> {
  if (!v || !v.checked_at || v.service !== "pangram") return "unchecked";
  return v.passed ? "passed" : "needs";
}

/**
 * Posts and articles go for approval only at or above the level (Q131). Comments never wait on this: they show the badge.
 * - level 0: always.
 * - a Pangram verdict for this exact text: its score against the level.
 * - Pangram cannot be used (no key, no cap, cap reached): the free score against the level, marked Not verified.
 * - otherwise (never checked, or the text changed since): check first.
 */
export function gate(kind: Kind, level: number, v: Verdict | null | undefined, hash: string): { ok: boolean; why: "" | "check" | "below" } {
  if (kind === "comment" || level <= 0) return { ok: true, why: "" };
  if (!v || (v.hash && v.hash !== hash)) return { ok: false, why: "check" };
  if (v.service === "pangram") return v.score >= level ? { ok: true, why: "" } : { ok: false, why: "below" };
  return v.reason && isFreeOnly(v.reason as Decision["action"]) && v.score >= level ? { ok: true, why: "" } : { ok: false, why: v.score >= level ? "check" : "below" };
}
export const gateLabel = (level: number) => `Fix to reach ${level}% first`;

// ---------- flagged sentences and the rewrite review ----------
export const sentencesOf = (t: string) => (String(t).match(/[^.!?\n]+[.!?]*["')\]]*\s*/g) ?? []).map((s) => s.trim()).filter(Boolean);

/** The draft split into plain and flagged pieces, for highlighting. Pangram may normalise text, so a window is found by
 *  its exact text, else sentence by sentence. Pieces join back into the draft exactly. */
export function highlight(text: string, flagged: { text: string }[]): { text: string; flagged: boolean }[] {
  const ranges: [number, number][] = [];
  const find = (needle: string) => { const n = needle.trim(); if (n.length < 3) return; const i = text.indexOf(n); if (i >= 0) ranges.push([i, i + n.length]); return i >= 0; };
  for (const f of flagged) if (!find(f.text)) sentencesOf(f.text).forEach((s) => find(s));
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) { const last = merged[merged.length - 1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push([...r]); }
  const out: { text: string; flagged: boolean }[] = [];
  let at = 0;
  for (const [s, e] of merged) { if (s > at) out.push({ text: text.slice(at, s), flagged: false }); out.push({ text: text.slice(s, e), flagged: true }); at = e; }
  if (at < text.length) out.push({ text: text.slice(at), flagged: false });
  return out;
}
/** The flagged sentences that are really in the draft, in order, without repeats. */
export const flaggedSentences = (text: string, flagged: { text: string }[]) => [...new Set(highlight(text, flagged).filter((p) => p.flagged).flatMap((p) => sentencesOf(p.text)))];

export type Change = { before: string; after: string };
/** The local rewrite request: only the flagged sentences, the house rules kept. */
export function rewriteAsk(text: string, sentences: string[], round: number): string {
  return `DRAFT:\n${text}\n\nAn AI detector flagged these sentences as machine-written:\n${sentences.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nRewrite only these sentences so they read as a senior person wrote them: plain words, varied sentence length, one concrete detail where the draft allows it, no stock phrases. Keep each one's meaning and every fact; add no new facts. No dashes, no contractions, no hashtags.${round > 1 ? " This is the second try: change the rhythm and structure more, not only the words." : ""}\nReturn only JSON: {"changes": [{"before": "the exact sentence", "after": "the rewrite"}]}`;
}
/** Changes the model returned that can really be applied: the sentence is in the draft and the rewrite differs. */
export function parseChanges(j: unknown, text: string): Change[] {
  const list = (j as { changes?: unknown[] } | null)?.changes;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  return list.map((c) => ({ before: String((c as Change)?.before ?? "").trim(), after: String((c as Change)?.after ?? "").trim() }))
    .filter((c) => c.before && c.after && c.before !== c.after && text.includes(c.before) && !seen.has(c.before) && (seen.add(c.before), true));
}
/** The draft with the accepted changes applied, each to its first place in the text. */
export function applyChanges(text: string, changes: Change[], accepted: boolean[]): string {
  return changes.reduce((t, c, i) => (accepted[i] && t.includes(c.before) ? t.replace(c.before, c.after) : t), text);
}
