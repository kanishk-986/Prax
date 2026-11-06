"use client";
// The humanization verdict, everywhere it shows (db/031): the card (the hero of the feature), the chip for lists and
// other drafts, the read-only badge for approvers, and the before and after review of a rewrite. One look: Pangram's
// own mark and name, the big score "per Pangram", the profile's level, and the state. The glow is the feature's one
// accent: ink when passed, red when it needs work, a dashed border when not verified. It breathes in once per result.
import Link from "next/link";
import { Check, ShieldCheck, Wand2 } from "lucide-react";
import { CheckerLogo, CheckerName } from "@/components/provider-mark";
import { useWorkspace } from "@/lib/workspace";
import { badgeText, chipText, stateOf, money, gateLabel, highlight, type Verdict, type State } from "@/lib/humanize";
import type { Humanize } from "./use-humanize";

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");
const STATE_WORD: Record<State, string> = { passed: "Passed", needs: "Needs work", free: "Not verified, free score only", off: "Humanization off" };

/** The big number and the level line, shared by the live card and the saved badge. */
function Score({ v, level, local }: { v: Verdict | null; level: number; local?: number }) {
  const pangram = v?.service === "pangram";
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
      <span className="num text-page font-semibold tracking-[-0.02em] text-ink">{pangram ? `${v!.score}% human` : `Human ${local ?? v?.score ?? 0}`}</span>
      <span className="num text-meta text-muted">{pangram ? "per Pangram" : "free score"} · your level {level}%</span>
    </div>
  );
}

function Head({ state }: { state: State }) {
  return (
    <div className="flex items-center gap-2">
      <CheckerName id="pangram" className="text-body" />
      <span className={cx("ml-auto inline-flex items-center gap-1 whitespace-nowrap text-meta font-semibold", state === "needs" ? "text-dark-red" : state === "passed" ? "text-ink" : "text-muted")}>
        {state === "passed" && <ShieldCheck size={13} aria-hidden="true" />}{STATE_WORD[state]}
      </span>
    </div>
  );
}

/** The live card for one text: check, fix, review, recheck. `gateKind` adds the approval line for posts and articles. */
export function VerdictCard({ h, local, className, sticky }: { h: Humanize; local: number; className?: string; sticky?: boolean }) {
  const { ws } = useWorkspace();
  if (h.level <= 0) return null;
  const v = h.verdict, s = h.state, p = h.plan?.decision, pv = h.preview;
  const confirm = p?.action === "confirm" ? p : null;
  const busy = h.busy === "check" ? "Checking with Pangram" : h.busy === "fix" ? "Rewriting the flagged sentences" : h.busy === "walter" ? "Walter (beta) is rewriting" : "";
  const why = v?.service === "local" ? v.reason : pv.action;
  const reason: Record<string, React.ReactNode> = {
    "local-low": <>Fix the house rules first. Pangram checks from a free score of {h.level - 10}.</>,
    "no-key": <>Add a Pangram key on the <Link className="font-semibold text-ink underline underline-offset-2" href={`/w/${ws.slug}/settings#humanization`}>Settings, Humanization</Link> to verify.</>,
    "no-cap": <>Enter your Pangram plan&apos;s monthly words in <Link className="font-semibold text-ink underline underline-offset-2" href={`/w/${ws.slug}/settings#humanization`}>Settings</Link> to verify.</>,
    "cap-reached": <>This month&apos;s Pangram words are used up. Paid checks stop until next month.</>,
  };
  const est = confirm ? confirm.cost : pv.action === "check" || pv.action === "confirm" ? pv.cost : h.estimate;
  const estWords = confirm ? confirm.words : pv.action === "check" || pv.action === "confirm" ? pv.words : h.words;
  return (
    <section aria-label="Pangram verdict" aria-live="polite" key={h.glow} className={cx("hz-card flex flex-col gap-2.5 p-3.5", `hz-${s}`, h.glow > 0 && "hz-in", sticky && "sticky top-3 z-[1]", className)}>
      <Head state={s} />
      <Score v={v} level={h.level} local={local} />
      {s === "passed" && <p className="m-0 text-meta text-muted">Checked {new Date(v!.checked_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. A detector&apos;s estimate, not a guarantee.</p>}
      {s === "needs" && <>
        {!!h.flagged.length && <ul className="m-0 flex list-none flex-col gap-1 p-0">{h.flagged.slice(0, 4).map((f) => <li key={f} className="text-meta leading-snug text-ink-2"><span className="hz-flag">{f}</span></li>)}</ul>}
        {h.result && <p className="m-0 text-meta text-muted">{h.flagged.length} flagged {h.flagged.length === 1 ? "sentence" : "sentences"}{h.flagged.length > 4 ? ", the first four shown" : ""}.</p>}
        {!h.review && !busy && (!h.result
          ? <div className="flex flex-wrap items-center gap-2"><button type="button" className="btn h-8 px-3 text-meta" onClick={() => h.check(true)}>Show the flagged sentences</button><span className="text-meta text-muted">Free when the text is unchanged since the check.</span></div>
          : h.canFix
          ? <div className="flex flex-wrap items-center gap-2"><button type="button" className="btn btn-dark h-8 px-3 text-meta" onClick={() => h.fix(false)}><Wand2 size={13} /> Fix it</button><span className="num text-meta text-muted">Round {h.rounds + 1} of 2 · Prax rewrites only these sentences</span></div>
          : h.walter.ok
            ? <div className="flex flex-wrap items-center gap-2"><button type="button" className="btn h-8 px-3 text-meta" onClick={() => h.fix(true)}><CheckerLogo id="walter" size={14} /> Try Walter (beta)</button><span className="text-meta text-muted">Two Prax rewrites did not pass.</span></div>
            : <p className="m-0 text-meta text-muted">Two Prax rewrites did not pass. Rewrite the flagged sentences in your own words, then check again.{h.walterKey && h.walter.why === "not-ready" ? " Walter (beta) is waiting for its API to be confirmed." : ""}</p>)}
      </>}
      {s === "free" && (why && reason[why] ? <p className="m-0 text-meta leading-snug text-muted">{reason[why]}</p> : !busy && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn h-8 px-3 text-meta" onClick={() => h.check(!!confirm)}>{confirm ? `Check ${estWords.toLocaleString()} words with Pangram` : "Check with Pangram"}</button>
          <span className="num text-meta text-muted">about {money(est)}{confirm ? " · long pieces check on click" : " · runs on copy, save or send"}</span>
        </div>))}
      {busy && <p className="m-0 flex items-center gap-2 text-meta text-muted"><span className="h-3 w-3 animate-spin rounded-full border-2 border-line-strong border-t-ink" aria-hidden="true" />{busy}</p>}
      {h.err && <p className="m-0 text-meta text-dark-red">{h.err}</p>}
      {h.review && <RewriteReview h={h} />}
    </section>
  );
}

/** The before and after view of a rewrite, flagged sentences highlighted. Each change is accepted on its own. */
export function RewriteReview({ h }: { h: Humanize }) {
  const r = h.review!;
  const n = r.acc.filter(Boolean).length;
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2.5">
      <p className="m-0 flex items-center gap-1.5 text-meta font-semibold text-ink">{r.src === "walter" ? <><CheckerLogo id="walter" size={14} /> Walter (beta) suggests</> : "Prax suggests"} {r.changes.length} {r.changes.length === 1 ? "change" : "changes"}</p>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {r.changes.map((c, k) => (
          <li key={k} className="grid gap-2 rounded-lg border border-line bg-[#fafafa] p-2.5 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
            <span className="flex flex-col gap-0.5"><span className="text-meta text-muted">Before</span><span className="text-meta leading-snug text-ink-2"><span className="hz-flag">{c.before}</span></span></span>
            <span className="flex flex-col gap-0.5"><span className="text-meta text-muted">After</span><span className="text-meta leading-snug text-ink">{c.after}</span></span>
            <button type="button" aria-pressed={r.acc[k]} className={cx("btn h-8 w-[96px] justify-center px-2 text-meta", r.acc[k] && "border-ink bg-ink text-white hover:bg-ink")} onClick={() => h.toggle(k)}>{r.acc[k] ? <><Check size={13} /> Accepted</> : "Accept"}</button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-dark h-8 px-3 text-meta" disabled={!n} onClick={h.apply}>Apply {n} and check again</button>
        <button type="button" className="btn h-8 px-3 text-meta" onClick={h.acceptAll}>Accept all</button>
        <button type="button" className="btn btn-ghost h-8 px-3 text-meta" onClick={h.discard}>Discard</button>
      </div>
    </div>
  );
}

/** A small inline chip: the logo and "Pangram 94%", "Not verified" or "Not checked". */
export function VerdictChip({ v, className }: { v: Verdict | null | undefined; className?: string }) {
  const pangram = v?.service === "pangram" && !!v.checked_at;
  return (
    <span title={v?.checked_at ? badgeText(v, v.level) : "Not checked with Pangram"} className={cx("inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-md border px-1.5 text-meta font-semibold", pangram ? (v!.passed ? "border-ink text-ink" : "border-[#d64545] text-dark-red") : "border-line-strong text-muted", className)}>
      <CheckerLogo id="pangram" size={12} /><span className="num">{chipText(v)}</span>
    </span>
  );
}

/** The saved verdict, read only, for the approver and the post view. */
export function VerdictBadge({ v, level, className }: { v: Verdict | null | undefined; level?: number; className?: string }) {
  const lv = level ?? v?.level ?? 0;
  if (!v?.checked_at && !lv) return null;
  const s = v?.checked_at ? stateOf(v, lv) : "free";
  return (
    <section aria-label={v?.checked_at ? badgeText(v, lv) : "Pangram verdict: not checked"} data-hz="badge" className={cx("hz-card flex flex-col gap-1.5 p-3.5", `hz-${s === "off" ? "free" : s}`, className)}>
      <Head state={s === "off" ? "free" : s} />
      {v?.checked_at ? <Score v={v} level={lv} /> : <p className="m-0 text-meta text-muted">Not checked with Pangram yet.</p>}
      <p className="m-0 text-meta text-muted">{v?.checked_at ? `Checked ${new Date(v.checked_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, before it was sent. A detector's estimate, not a guarantee.` : "The team checks it before sending it for approval."}</p>
    </section>
  );
}

/** The approval button's words when the gate is closed. */
export const gateText = (h: Humanize) => (h.gate.ok ? "" : h.gate.why === "below" ? gateLabel(h.level) : `Check with Pangram first (level ${h.level}%)`);

/** Text with the flagged passages marked, read only. */
export function Flagged({ text, flagged }: { text: string; flagged: { text: string }[] }) {
  return <>{highlight(text, flagged).map((p, i) => (p.flagged ? <mark key={i} className="hz-flag text-inherit">{p.text}</mark> : <span key={i}>{p.text}</span>))}</>;
}
