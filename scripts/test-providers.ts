// Checks the shared AI provider list: names, the logo copies in the web app and the extension, the usage maths and
// that no key is ever part of what is shown. Run: node scripts/test-providers.ts
import { readFileSync } from "node:fs";
import { MARKS, PROVIDERS, KEY_STATE, SAVED_KEY, providerOf, providerName, usageFor, usageLine, lastUsedLabel, type UsageRow } from "../src/lib/providers.ts";
import { ENGINES } from "../src/lib/citations.ts";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

// ---------- names ----------
eq("full names", Object.values(PROVIDERS).map((p) => p.name), ["Anthropic Claude", "OpenAI ChatGPT", "Google Gemini", "Perplexity", "xAI Grok", "Google AI answers", "Microsoft Copilot"]);
eq("short names", Object.values(PROVIDERS).map((p) => p.short), ["Claude", "ChatGPT", "Gemini", "Perplexity", "Grok", "Google AI", "Copilot"]);
eq("citation engines use the full names", ENGINES.map((e) => e.name), ENGINES.map((e) => PROVIDERS[e.id].name));
eq("older stored names still resolve", ["ChatGPT (OpenAI)", "Gemini", "Claude", "Perplexity", "Gemini (Google)", "openai"].map((n) => providerOf(n)?.id), ["openai", "gemini", "claude", "perplexity", "gemini", "openai"]);
eq("unknown names stay as they are", providerName("mistral"), "mistral");
eq("short name by id", providerName("openai", true), "ChatGPT");

// ---------- logos ----------
eq("every provider but Grok and Copilot has a mark (neither has a CC0 or downloadable official mark)", Object.entries(MARKS).filter(([, m]) => m).map(([k]) => k), ["claude", "openai", "gemini", "perplexity", "google_ai"]);
eq("no drawn stand-in for Grok or Copilot, in the app or the extension", [MARKS.grok, MARKS.copilot, /grok: \{[^}]*path: ""/.test(readFileSync(new URL("../extension/marks.js", import.meta.url), "utf8")), /copilot: \{[^}]*path: ""/.test(readFileSync(new URL("../extension/marks.js", import.meta.url), "utf8"))], [null, null, true, true]);
eq("Google AI answers uses the simple-icons Google G", MARKS.google_ai?.source, "simple-icons 16.36.0 google (CC0)");
eq("SerpApi engines name SerpApi as where the key goes", [PROVIDERS.google_ai.via, PROVIDERS.copilot.via, PROVIDERS.google_ai.keyHint], ["SerpApi", "SerpApi", ""]);
eq("every mark names its source", Object.values(MARKS).every((m) => !m || /simple-icons \d+\.\d+\.\d+ \w+ \(CC0\)/.test(m.source)), true);
eq("every path is a 24 by 24 path", Object.values(MARKS).every((m) => !m || /^[Mm][\d.\s,a-zA-Z-]+$/.test(m.path)), true);
const ext = readFileSync(new URL("../extension/marks.js", import.meta.url), "utf8");
for (const [id, m] of Object.entries(MARKS)) {
  if (!m) continue;
  eq(`extension copy of ${id} matches`, ext.includes(`color: "${m.color}", path: "${m.path}"`), true);
  eq(`extension name of ${id} matches`, ext.includes(`name: "${PROVIDERS[id as keyof typeof PROVIDERS].name}"`), true);
}

// ---------- key display ----------
eq("key states in plain words", [KEY_STATE.on, KEY_STATE.off], ["Connected in this browser", "No key in this browser"]);
eq("a saved key shows no characters of it", /[A-Za-z0-9]{2,}$/.test(SAVED_KEY.replace("Saved", "")), false);
const bridge = readFileSync(new URL("../extension/bridge.js", import.meta.url), "utf8");
eq("the bridge status reports booleans, never a key", /apiKey:\s*c\.apiKey|keys:\s*c\.keys/.test(bridge.slice(bridge.indexOf("async function status"), bridge.indexOf("const ASK"))), false);

// ---------- usage ----------
const rows: UsageRow[] = [
  { at: "2026-11-05T10:00:00Z", kind: "comment", provider: "claude", model: "claude-opus-5-5", input_tokens: 100000, output_tokens: 10000 },
  { at: "2026-11-04T10:00:00Z", kind: "scores", provider: "claude", model: "", input_tokens: 0, output_tokens: 0 },
  { at: "2026-11-06T09:00:00Z", kind: "scores", provider: "claude", model: "", input_tokens: 0, output_tokens: 0 },
  { at: "2026-10-30T10:00:00Z", kind: "citation", provider: "claude", model: "claude-opus-5-5", input_tokens: 20000, output_tokens: 1000 },
  { at: "2026-11-02T10:00:00Z", kind: "citation", provider: "openai", model: "gpt-5", input_tokens: 900, output_tokens: 100 },
];
const c = usageFor(rows, "claude", "2026-11");
eq("last use skips score reports", c.last, "2026-11-05T10:00:00Z");
eq("this month only, score reports left out", [c.calls, c.tokens], [1, 110000]);
eq("cost on list prices", c.cost?.toFixed(2), "0.60");
eq("claude line", usageLine(c), "1 call · 110k tokens · about $0.60");
const o = usageFor(rows, "openai", "2026-11");
eq("no list price means no cost", [o.cost, usageLine(o)], [null, "1 call · 1.0k tokens"]);
eq("SerpApi usage is a search count, never tokens or cost", usageLine(usageFor([{ at: "2026-11-05T10:00:00Z", kind: "citation", provider: "copilot", model: "bing_copilot", input_tokens: 0, output_tokens: 0 }, { at: "2026-11-05T11:00:00Z", kind: "citation", provider: "copilot", model: "bing_copilot", input_tokens: 0, output_tokens: 0 }], "copilot", "2026-11"), true), "2 searches");
eq("nothing used shows None", usageLine(usageFor(rows, "perplexity", "2026-11")), "None");
eq("last model", o.lastModel, "gpt-5");
const now = new Date("2026-11-06T12:00:00");
eq("never used", lastUsedLabel(null, now), "None");
eq("used yesterday", lastUsedLabel("2026-11-05T12:00:00", now), "Yesterday");
eq("used earlier", lastUsedLabel("2026-11-02T12:00:00", now), "2 Nov");
eq("used today shows the time", /^Today \d\d:\d\d$/.test(lastUsedLabel("2026-11-06T08:30:00", now)), true);

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
