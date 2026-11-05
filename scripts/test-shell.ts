// Checks the section shell rules: entry moment and tour gating, and tour step maths. Run: node scripts/test-shell.ts
import { shouldPlayIntro, markIntro, shouldAutoTour, markTourSeen, moveTour, tourLabel, tourPercent, navActive, type Store } from "../src/lib/shell.ts";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const mem = (): Store => { const m: Record<string, string> = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };
const broken: Store = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };

const ss = mem();
eq("intro plays first time", shouldPlayIntro(ss, "today", false), true);
markIntro(ss, "today");
eq("intro skipped after it played", shouldPlayIntro(ss, "today", false), false);
eq("other sections still play", shouldPlayIntro(ss, "network", false), true);
eq("reduced motion never plays", shouldPlayIntro(mem(), "today", true), false);
eq("no storage never plays", shouldPlayIntro(null, "today", false), false);
eq("blocked storage never plays and never throws", shouldPlayIntro(broken, "today", false), false);

const ls = mem();
eq("tour auto-starts once", shouldAutoTour(ls, "today", "u1"), true);
markTourSeen(ls, "today", "u1");
eq("not again for the same person", shouldAutoTour(ls, "today", "u1"), false);
eq("another person still gets it", shouldAutoTour(ls, "today", "u2"), true);

let t = { index: 0 as number | null, done: [] as number[] };
t = moveTour(t, "next", 3); eq("next marks done", t, { index: 1, done: [0] });
t = moveTour(t, "skip", 3); eq("skip moves without marking", t, { index: 2, done: [0] });
t = moveTour(t, "back", 3); eq("back keeps done", t, { index: 1, done: [0] });
eq("label", tourLabel(t, 3), "Step 2 of 3 · 1 completed");
t = moveTour(t, "next", 3); t = moveTour(t, "next", 3); eq("past the last step closes", t, { index: null, done: [0, 1, 2] });
eq("percent", tourPercent(t, 3), 100);
eq("back at the first step stays", moveTour({ index: 0, done: [] }, "back", 3), { index: 0, done: [] });
eq("end closes at once", moveTour({ index: 1, done: [0] }, "end", 3), { index: null, done: [0] });

const B = "/w/shashi";
eq("comment studio is active on its page", navActive(`${B}/studio`, B, "/studio"), true);
eq("comment studio is not active on content studio", navActive(`${B}/studio-content`, B, "/studio"), false);
eq("content studio is active on its page", navActive(`${B}/studio-content`, B, "/studio-content"), true);
eq("a page below a section keeps it active", navActive(`${B}/pipeline/abc`, B, "/pipeline"), true);
eq("dashboard only on the root", navActive(B, B, ""), true);
eq("dashboard not on other pages", navActive(`${B}/today`, B, ""), false);
eq("dashboard with a trailing slash", navActive(`${B}/`, B, ""), true);
eq("a longer word that starts the same does not match", navActive(`${B}/notesx`, B, "/notes"), false);

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
