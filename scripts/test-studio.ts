// Checks the Comment Studio defaults, merge, tuning text and Human score. Run: node scripts/test-studio.ts
import { mergeStudio, humanScore, tuningRules, voiceText, DEFAULT_STYLES, DEFAULT_PLAYBOOKS, LENGTHS } from "../src/lib/studio.ts";

let fails = 0;
const ok = (name: string, cond: boolean, got?: unknown) => { if (!cond) fails++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : `: ${JSON.stringify(got)}`}`); };

const m = mergeStudio(null);
ok("defaults when nothing saved", m.styles.length === DEFAULT_STYLES.length && m.playbooks.length === 14 && m.tuning.length === "medium" && m.safety.dailyCap === 40);
const m2 = mergeStudio({ tuning: { drafts: 2 } as never, styles: [] });
ok("saved tuning merges over defaults", m2.tuning.drafts === 2 && m2.tuning.minHuman === 85 && m2.styles.length === DEFAULT_STYLES.length, m2.tuning);
ok("every playbook has works and filler", DEFAULT_PLAYBOOKS.every((b) => b.works.length && b.filler.length));
ok("style ids unique", new Set(DEFAULT_STYLES.map((s) => s.id)).size === DEFAULT_STYLES.length);

const good = "In my view, the settlement layer is the easy part. The harder work is reconciliation, where treasury teams match on-chain transfers to ledger entries every day. I think banks that solve this first will move volume faster than those that wait for clearer rules. Which control did your team build first?";
const h = humanScore(good, LENGTHS.medium);
ok("clean B2B comment scores 100", h.score === 100, h);
const bad = humanScore("Great post — this is crucial and we're seeing it everywhere 🚀 #fintech", LENGTHS.medium);
ok("dash, contraction, banned word, emoji, hashtag, length all flagged", ["dash", "contraction", "emoji", "hashtag"].every((f) => bad.flags.some((x) => x.includes(f))) && bad.flags.some((x) => x.includes("crucial")) && bad.flags.some((x) => x.includes("words")), bad.flags);
ok("curly apostrophe contraction caught", humanScore("We’re ready").flags.includes("contraction"));

const t = tuningRules(m.tuning);
ok("tuning text has length, no emoji, language", t.includes("50 to 70 words") && t.includes("No emoji") && t.includes("language of the post"), t);
ok("voice text empty without a fingerprint", voiceText({}) === "");
ok("voice text built from fingerprint", voiceText({ summary: "Calm operator.", tone: ["measured"] }).startsWith("How this person writes: Calm operator."));

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
