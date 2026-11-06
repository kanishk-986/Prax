// Checks the section shell rules: entry moment and tour gating, and tour step maths. Run: node scripts/test-shell.ts
import { readFileSync } from "node:fs";
import { shouldPlayIntro, markIntro, shouldAutoTour, markTourSeen, moveTour, tourLabel, tourPercent, navActive, tourPlace, playbookTab, playbookHref, type Store } from "../src/lib/shell.ts";
import { writtenTable } from "../src/lib/writes.ts";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const mem = (): Store => { const m: Record<string, string> = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; };
const broken: Store = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };

const ss = mem();
const D = "2026-11-06";
eq("intro plays on the Dashboard the first time today", shouldPlayIntro(ss, "dashboard", false, D), true);
markIntro(ss, "dashboard", D);
eq("intro skipped after it played today", shouldPlayIntro(ss, "dashboard", false, D), false);
eq("intro plays again the next day", shouldPlayIntro(ss, "dashboard", false, "2026-11-07"), true);
eq("other sections never play (they fade)", shouldPlayIntro(mem(), "today", false, D), false);
eq("reduced motion never plays", shouldPlayIntro(mem(), "dashboard", true, D), false);
eq("no storage never plays", shouldPlayIntro(null, "dashboard", false, D), false);
eq("blocked storage never plays and never throws", shouldPlayIntro(broken, "dashboard", false, D), false);
const V = { width: 1280, height: 800 }, CARD = { width: 380, height: 220 };
eq("tour card sits below its target", tourPlace({ top: 100, left: 300, width: 600, height: 80 }, CARD, V), { top: 192, left: 300 });
eq("tour card goes above a target low on the screen", tourPlace({ top: 600, left: 300, width: 600, height: 120 }, CARD, V), { top: 368, left: 300 });
eq("tour card stays inside the right edge", tourPlace({ top: 100, left: 1100, width: 160, height: 40 }, CARD, V), { top: 152, left: 884 });
eq("tall target: beside it", tourPlace({ top: 40, left: 40, width: 500, height: 720 }, CARD, V), { top: 40, left: 552 });
eq("no target: bottom left", tourPlace(null, CARD, V), { top: 564, left: 16 });
eq("phone: full width card below", tourPlace({ top: 80, left: 16, width: 358, height: 60 }, { width: 358, height: 220 }, { width: 390, height: 844 }), { top: 152, left: 16 });

const ls = mem();
eq("tour auto-starts once", shouldAutoTour(ls, "today", "u1"), true);
markTourSeen(ls, "today", "u1");
eq("not again for the same person", shouldAutoTour(ls, "today", "u1"), false);
eq("another person still gets it", shouldAutoTour(ls, "today", "u2"), true);

let t = { index: 0 as number | null, done: [] as number[] };
t = moveTour(t, "next", 3); eq("next marks done", t, { index: 1, done: [0] });
t = moveTour(t, "skip", 3); eq("skip moves without marking", t, { index: 2, done: [0] });
t = moveTour(t, "back", 3); eq("back keeps done", t, { index: 1, done: [0] });
eq("label", tourLabel(t, 3), "Step 2 of 3");
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

// The Playbook (S5): Strategy and Notes are tabs of one section, and the old addresses land on the right tab.
const NAV_HREFS = [...readFileSync(new URL("../src/components/sidebar.tsx", import.meta.url), "utf8").matchAll(/\{ href: "([^"]*)"/g)].map((m) => m[1]);
eq("playbook opens on Strategy by default", playbookTab(null), "strategy");
eq("playbook ?tab=notes opens Notes", playbookTab("notes"), "notes");
eq("an unknown tab opens Strategy", playbookTab("people"), "strategy");
eq("the Strategy tab has no query", playbookHref("shashi"), "/w/shashi/playbook");
eq("the Notes tab address", playbookHref("shashi", "notes"), "/w/shashi/playbook?tab=notes");
eq("the playbook item is active on its page with a tab", navActive(`${B}/playbook`, B, "/playbook"), true);
eq("the sidebar has one Playbook item and no Strategy or Notes", [NAV_HREFS.includes("/playbook"), NAV_HREFS.includes("/strategy"), NAV_HREFS.includes("/notes")], [true, false, false]);

// Lists reload after this browser's own writes (QA 6 Nov: Add, Save and Delete looked dead until a reload).
const REST = "https://x.supabase.co/rest/v1";
eq("an insert names its table", writtenTable(`${REST}/note_items?select=id`, "POST"), "note_items");
eq("an update names its table", writtenTable(`${REST}/daily_items?id=eq.1`, "PATCH"), "daily_items");
eq("a delete names its table", writtenTable(`${REST}/saved_drafts?id=eq.1`, "DELETE"), "saved_drafts");
eq("a read is not a write", writtenTable(`${REST}/daily_items?select=*`, "GET"), "");
eq("a count is not a write", writtenTable(`${REST}/daily_items?select=*`, "HEAD"), "");
eq("an RPC is not taken as a table", writtenTable(`${REST}/rpc/strategy_activate`, "POST"), "");
eq("auth and other calls are ignored", writtenTable("https://x.supabase.co/auth/v1/token?grant_type=refresh_token", "POST"), "");
eq("no method means a read", writtenTable(`${REST}/posts`), "");
const LIVE = readFileSync(new URL("../src/lib/live.ts", import.meta.url), "utf8");
const CLIENT = readFileSync(new URL("../src/lib/supabase/client.ts", import.meta.url), "utf8");
eq("useLive reloads on the write event, and the client fires it", [LIVE.includes("addEventListener(WROTE"), CLIENT.includes("dispatchEvent(new CustomEvent(WROTE")], [true, true]);
const TODAY = readFileSync(new URL("../src/app/w/[slug]/today/page.tsx", import.meta.url), "utf8");
eq("no query is left unsent in a click handler", /onClick=\{\(\) => supabase\(\)\./.test(TODAY), false);

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
