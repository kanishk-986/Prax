// Comment Studio: styles, playbooks, tuning and safety for a profile, plus the rules every draft follows.
// The defaults are written for C-suite and B2B readers. Saved settings replace them field by field.
// The extension gets the merged settings from /api/ext/me, so this file is the single source of defaults.

export type Style = { id: string; name: string; desc: string; rules: string; on: boolean; custom?: boolean };
export type Playbook = { type: string; aim: string; works: string[]; filler: string[]; examples: string[] };
export type Tuning = {
  length: "short" | "medium" | "long"; tone: "formal" | "balanced" | "warm"; emoji: "none" | "minimal";
  question: "never" | "sometimes" | "always"; language: string; creativity: number; minHuman: number; drafts: number;
  humanize: boolean; readComments: boolean; repair: boolean; smartOrder: boolean; signature: string;
};
export type Safety = { dailyCap: number; vips: string[]; vipProspects: boolean };
export type Fingerprint = { summary: string; tone: string[]; sentences: string; vocabulary: string[]; phrases: string[]; avoid: string[]; sample: string };
export type Studio = { styles: Style[]; playbooks: Playbook[]; tuning: Tuning; safety: Safety; voice_profile: Partial<Fingerprint> };

export const LENGTHS = { short: { lo: 35, hi: 50, label: "Short", sub: "35 to 50 words" }, medium: { lo: 50, hi: 70, label: "Medium", sub: "50 to 70 words" }, long: { lo: 70, hi: 90, label: "Long", sub: "70 to 90 words" } } as const;

export const DEFAULT_STYLES: Style[] = [
  { id: "agree-add", name: "Agree and add", desc: "The layer the author left out", on: true, rules: "Agree with the main point in one sentence, then add the layer the author did not cover: a consequence, a dependency or a second-order effect." },
  { id: "coo", name: "Operator lens", desc: "The operations behind the headline", on: true, rules: "What this means for operations: delivery, controls, timelines, reconciliation, the work behind the headline. Speak from having run it." },
  { id: "board", name: "Board lens", desc: "What a board would ask", on: true, rules: "What a board or risk committee would ask about this: exposure, governance, decision timing, who owns the risk." },
  { id: "question", name: "Question", desc: "Earns a reply from the author", on: true, rules: "Add one fact or consequence, then end on one specific question the author can answer from judgment. Never a generic question." },
  { id: "data", name: "Data point", desc: "One number and what it implies", on: true, rules: "Build around one number or fact that is in the post or its source, and what it implies. Never invent a figure." },
  { id: "partner", name: "Partner lens", desc: "Who has to work with whom", on: true, rules: "What this means for partners and the ecosystem: who needs to work with whom for this to happen, and where that usually stalls." },
  { id: "disagree", name: "Respectful disagree", desc: "A reasoned different view", on: true, rules: "Accept what is right, then offer a different view on one point with a reason. Courteous, never correcting the author, never against a regulator or government." },
  { id: "congrats", name: "Congratulate with substance", desc: "One line of credit, one of substance", on: true, rules: "Congratulate in one plain sentence, then one specific observation about why the milestone matters to the market. No flattery." },
  { id: "short", name: "Short", desc: "Two or three tight sentences", on: false, rules: "35 to 50 words, overriding the length setting. Two or three complete sentences. Still one real insight, never a one-liner." },
  { id: "punchy", name: "Punchy", desc: "A firm view, then the reason", on: false, rules: "40 to 55 words, overriding the length setting. A firm view stated plainly in the first sentence, then the reason. No slogans." },
];

const pb = (type: string, aim: string, works: string[], filler: string[]): Playbook => ({ type, aim, works, filler, examples: [] });
export const DEFAULT_PLAYBOOKS: Playbook[] = [
  pb("Announcement or win", "Credit the work, then name what it changes for the market.", ["Name the hard part of what they did", "Say who else it changes things for", "One line of credit, then one line of substance"], ["Congratulations with nothing after it", "Making the comment about your own company", "Turning it into a critique"]),
  pb("New role or milestone", "Wish them well and say what the role will face first.", ["Name the first problem the role will meet", "Connect it to a shift in their market", "Keep it short and warm"], ["Generic 'well deserved'", "Pitching services to the new hire", "Listing their career back to them"]),
  pb("Opinion or hot take", "Take a position. Agreement without addition is noise.", ["Agree, then push the claim one step further", "Name the case where the view breaks down", "Bring evidence from operating experience"], ["Fence-sitting", "Restating their take in other words", "Disagreeing with the person, not the idea"]),
  pb("Data or report", "Interrogate the number or say what it implies.", ["Question the sample or the method, specifically", "Name the second-order effect the data implies", "Say what the chart cannot show"], ["Repeating the headline figure", "Inventing a competing statistic", "'Numbers do not lie' filler"]),
  pb("Regulation or policy", "Translate rule text into what institutions must now build or change.", ["Name the control or system the rule touches", "Say what a bank or fintech does first", "Note the timeline that matters"], ["Criticising the regulator or government", "Vague 'clarity is welcome'", "Legal advice or certainty you cannot have"]),
  pb("Product or launch", "Engage with how it works and who it is for. Or say nothing.", ["Ask how one part actually works", "Name the buyer it is right for", "Share the problem it solves, from experience"], ["Empty enthusiasm", "A competing pitch in their comments", "Praise that reads like a paid testimonial"]),
  pb("Partnership or deal", "Say what the partnership makes possible that neither could do alone.", ["Name the capability each side brings", "Say where integration usually stalls", "Ask about the first live use case"], ["'Exciting times ahead'", "Guessing at deal terms", "Congratulating both logos with nothing else"]),
  pb("Funding", "Credit the raise, then name what the money must prove.", ["Name the milestone the round has to reach", "Say what investors are betting on", "One line of credit, one line of substance"], ["Valuation talk", "Asking about hiring or pitching", "Hype about the amount"]),
  pb("Event or speaking", "Add to the session's argument, not the logistics.", ["Pick one point from the talk and extend it", "Ask the question the audience did not get to", "Say what the room should take back to work"], ["'Great event' with nothing else", "Asking for the slides only", "Name-dropping who was there"]),
  pb("Industry news", "Say what it means for people doing the work.", ["Translate the news into a concrete consequence", "Name who wins and who has more work", "Connect it to a pattern seen before"], ["Repeating the headline with an adjective", "Vague future-gazing", "Hot-take posturing with no reasoning"]),
  pb("Question to the audience", "Answer it directly in the first sentence, then justify.", ["Give the actual answer before any context", "Ground it in one thing seen in practice", "Push back on the framing if it hides an assumption"], ["Answering an easier question", "Listing every option without choosing", "Answering with another question"]),
  pb("How-to or lesson", "Add the step they left out, or where the advice fails.", ["Name the failure mode: 'this works until'", "Add the missing step and why it matters", "Say which item does most of the work"], ["A longer list of your own", "Praising it without testing it", "'Saving this for later' energy"]),
  pb("Hiring", "Be useful to the hire or the hirer. Everything else is spam.", ["Say what kind of person thrives in the role", "Ask a question a candidate would want answered"], ["Commenting for reach", "'Interested' with nothing else", "Pitching your own company"]),
  pb("Other", "Find the one point worth extending and extend it.", ["Pick the single most useful claim", "Add one specific consequence or question"], ["Summarising the post", "Generic agreement", "Off-topic promotion"]),
];

export const DEFAULT_TUNING: Tuning = { length: "medium", tone: "balanced", emoji: "none", question: "sometimes", language: "auto", creativity: 0.5, minHuman: 85, drafts: 3, humanize: true, readComments: true, repair: true, smartOrder: true, signature: "" };
export const DEFAULT_SAFETY: Safety = { dailyCap: 40, vips: [], vipProspects: true };

/** Saved settings over the defaults. Empty saved lists fall back to the defaults. */
export function mergeStudio(saved: Partial<Studio> | null | undefined): Studio {
  const s = saved ?? {};
  return {
    styles: s.styles?.length ? s.styles : DEFAULT_STYLES,
    playbooks: s.playbooks?.length ? s.playbooks : DEFAULT_PLAYBOOKS,
    tuning: { ...DEFAULT_TUNING, ...(s.tuning ?? {}) },
    safety: { ...DEFAULT_SAFETY, ...(s.safety ?? {}) },
    voice_profile: s.voice_profile ?? {},
  };
}

// ---------- the locked B2B rules ----------
export const BANNED = ["just", "must", "now", "sit", "sits", "delve", "pivotal", "crucial", "testament", "tapestry", "landscape", "underscore", "showcase", "vibrant", "fostering", "key", "vital", "leverage", "robust", "seamless", "game-changer", "great post", "thanks for sharing", "my read is", "what stands out", "the part that"];

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
/** House-rule check: 100 means nothing tripped. Same rules as the extension. */
export function humanScore(t: string, range?: { lo: number; hi: number } | null) {
  let s = 100; const flags: string[] = [];
  if (/[—–]/.test(t)) { s -= 25; flags.push("dash"); }
  if (/\b\w+(n't|'re|'ve|'ll|'d)\b/i.test(t.replace(/’/g, "'"))) { s -= 15; flags.push("contraction"); }
  const hit = BANNED.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(t));
  if (hit.length) { s -= 15 * hit.length; flags.push(hit.join(", ")); }
  if ((t.match(/\?/g) || []).length > 1) { s -= 10; flags.push("two questions"); }
  if (/#\w/.test(t)) { s -= 10; flags.push("hashtag"); }
  if (/\p{Extended_Pictographic}/u.test(t)) { s -= 10; flags.push("emoji"); }
  if (range) { const n = words(t); if (n < range.lo || n > range.hi) { s -= 15; flags.push(`${n} words`); } }
  return { score: Math.max(0, s), flags };
}

/** The tuning as plain instructions, appended to every comment request. */
export function tuningRules(t: Tuning): string {
  const L = LENGTHS[t.length];
  return [
    `Length: ${L.lo} to ${L.hi} words.`,
    t.tone === "formal" ? "Tone: formal and measured, board-room register." : t.tone === "warm" ? "Tone: warm and personal toward the author, still professional." : "Tone: balanced, plain and senior.",
    t.emoji === "none" ? "No emoji." : "At most one emoji, only if it fits; usually none.",
    t.question === "never" ? "Do not end with a question." : t.question === "always" ? "End with one specific question." : "End with a question only when it earns a reply.",
    t.language === "auto" ? "Write in the language of the post." : `Write in ${t.language}.`,
    t.creativity < 0.35 ? "Take the most direct, expected angle." : t.creativity > 0.7 ? "Take a less obvious angle the other comments missed, still grounded in the post." : "Take a clear angle with one fresh observation.",
  ].join(" ");
}

export const LOCKED_RULES = "Always: no em or en dashes, no contractions, no hashtags, never criticise a regulator or government, no sales pitch or proof points in comments, use only facts present in the post or the voice profile, never invent numbers. Avoid these words: " + BANNED.join(", ") + ".";

// ---------- Draft a comment in the app (the same request the extension sends from LinkedIn) ----------
export type Draft = { text: string; angle?: string; value?: number; impact?: number };
export type DraftAsk = { post: string; author?: string; style?: string | null; studio: Studio };

/** The playbooks as one block of rules, as the extension sends them. */
export const playbookText = (pbs: Playbook[]) => pbs.map((b) => `${b.type}: ${b.aim} Works: ${b.works.join("; ")}. Reads as filler: ${b.filler.join("; ")}.${b.examples?.length ? ` Examples: ${b.examples.join(" | ")}` : ""}`).join("\n");

/** How many drafts the panel asks for: the tuning's number, kept to 2 or 3. */
export const panelDrafts = (t: Tuning) => Math.max(2, Math.min(3, t.drafts || 3));

/** A pasted LinkedIn address, if the text holds one. Prax never opens it; it is kept as the post's link. */
export function linkIn(text: string): string {
  const m = text.match(/https?:\/\/(?:[\w-]+\.)*linkedin\.com\/[^\s<>"')]+/i);
  return m ? m[0].replace(/[.,;]+$/, "") : "";
}
/** True when the paste is only a link, with no post text to write about. */
export const onlyLink = (text: string) => { const l = linkIn(text); return !!l && text.replace(l, "").trim().length < 20; };

/** What Playbooks' "Try it" can classify: the post text without its link, and why it cannot yet ("" when it can).
 *  Prax never opens LinkedIn, so a link alone has nothing to read; under 40 characters is too little to tell. */
export function classifyInput(paste: string): { text: string; problem: "" | "link" | "short" } {
  const l = linkIn(paste);
  const text = (l ? paste.replace(l, "") : paste).trim();
  if (l && text.length < 20) return { text, problem: "link" };
  if (text.length < 40) return { text, problem: "short" };
  return { text, problem: "" };
}

/** The user message for 2 or 3 comment drafts. The voice, the voice fingerprint and the locked rules are added
 *  by the extension (kind "comment"), so this carries the post, the playbooks, the style and the tuning. */
export function commentAsk({ post, author, style, studio }: DraftAsk): string {
  const n = panelDrafts(studio.tuning);
  const on = studio.styles.filter((s) => s.on);
  const chosen = style ? studio.styles.find((s) => s.name === style) : null;
  const pick = chosen ? `Use the style ${chosen.name}. Rules for this draft: ${chosen.rules}`
    : `Choose the best style for this post type from: ${on.map((x) => x.name).join(", ")}. Style rules: ${JSON.stringify(Object.fromEntries(on.map((x) => [x.name, x.rules])))}.`;
  const types = studio.playbooks.map((b) => b.type).join(", ");
  return `POST${author?.trim() ? ` BY ${author.trim()}` : ""}:\n${post.trim().slice(0, 6000)}

First classify the post as one of: ${types}. Apply the playbook for that type:
${playbookText(studio.playbooks) || "(no playbooks)"}

${pick}
${tuningRules(studio.tuning)}
Write ${n} different drafts, each taking a different angle, ranked strongest first. Use only facts present in the text above. Score each for value (1 to 10: does it add something the post does not already say) and impact (1 to 10: how likely the author is to reply to it).
Return only JSON: {"post_type": "...", "mode": "...", "drafts": [{"text": "...", "angle": "five words on the angle", "value": 8, "impact": 7}]}`;
}

/** The model's reply as drafts: at most n, empty texts dropped, scores kept only when they are 1 to 10. */
export function readDrafts(j: { post_type?: unknown; mode?: unknown; drafts?: unknown } | null, n: number): { type: string; mode: string; drafts: Draft[] } | null {
  if (!j || !Array.isArray(j.drafts)) return null;
  const sc = (v: unknown) => (typeof v === "number" && v >= 1 && v <= 10 ? Math.round(v) : undefined);
  const drafts = (j.drafts as unknown[]).map((d): Draft | null => {
    if (typeof d === "string") return d.trim() ? { text: d.trim() } : null;
    const o = (d ?? {}) as Record<string, unknown>;
    const text = typeof o.text === "string" ? o.text.trim() : "";
    return text ? { text, angle: typeof o.angle === "string" ? o.angle : undefined, value: sc(o.value), impact: sc(o.impact) } : null;
  }).filter((d): d is Draft => !!d).slice(0, n);
  return drafts.length ? { type: typeof j.post_type === "string" ? j.post_type : "", mode: typeof j.mode === "string" ? j.mode : "", drafts } : null;
}

export function voiceText(f: Partial<Fingerprint>): string {
  if (!f.summary) return "";
  return `How this person writes: ${f.summary}${f.tone?.length ? ` Tone: ${f.tone.join(", ")}.` : ""}${f.sentences ? ` Sentences: ${f.sentences}` : ""}${f.phrases?.length ? ` Phrases they use: ${f.phrases.join("; ")}.` : ""}${f.avoid?.length ? ` They never: ${f.avoid.join("; ")}.` : ""}`;
}
