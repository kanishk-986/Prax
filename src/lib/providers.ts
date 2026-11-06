// AI providers: one place for their real names, logos, default models and the facts shown about each key.
// Pure data and maths, so the pages, the PDF and scripts/test-providers.ts share it. extension/marks.js holds
// the same logos for the extension's own pages; the test checks the two copies match.
//
// Display rules, used everywhere:
// - Name: the full name ("Anthropic Claude", "OpenAI ChatGPT", "Google Gemini", "Perplexity") in rows, pickers
//   and key windows; the short name ("Claude", "ChatGPT", "Gemini", "Perplexity") in dense cells, logs and legends.
// - Logo: the unaltered mark in its brand colour on light surfaces, in white on dark surfaces. 16px beside a row
//   name, 14px inline in tables and logs. The PDF report draws the same paths beside the names (src/lib/pdf.ts).
// - Key state in plain words with a dot: "Connected in this browser" or "No key in this browser". A key is never
//   shown back; at most "Saved ····".
// - Google AI answers and Microsoft Copilot are read through SerpApi (`via`), one SerpApi key for both. Their usage is a
//   search count only: SerpApi publishes monthly plans, not a per-search price.

export type ProviderId = "claude" | "openai" | "gemini" | "perplexity" | "grok" | "google_ai" | "copilot";

export type Mark = { path: string; color: string; source: string };

/** Logos as single 24 by 24 paths, exactly as published. */
export const MARKS: Record<ProviderId, Mark | null> = {
  // simple-icons 16.36.0, "claude" (CC0). Brand colour from simple-icons.
  claude: { color: "#D97757", source: "simple-icons 16.36.0 claude (CC0)", path: "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" },
  // simple-icons 15.22.0, "openai" (CC0); the last release that carries it. OpenAI's brand guidelines set the mark
  // in black or white only, so black is used instead of simple-icons' older #412991.
  openai: { color: "#000000", source: "simple-icons 15.22.0 openai (CC0), colour per openai.com/brand", path: "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" },
  // simple-icons 16.36.0, "googlegemini" (CC0). Brand colour from simple-icons.
  gemini: { color: "#8E75B2", source: "simple-icons 16.36.0 googlegemini (CC0)", path: "M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81" },
  // simple-icons 16.36.0, "perplexity" (CC0). Brand colour from simple-icons.
  perplexity: { color: "#1FB8CD", source: "simple-icons 16.36.0 perplexity (CC0)", path: "M22.3977 7.0896h-2.3106V.0676l-7.5094 6.3542V.1577h-1.1554v6.1966L4.4904 0v7.0896H1.6023v10.3976h2.8882V24l6.932-6.3591v6.2005h1.1554v-6.0469l6.9318 6.1807v-6.4879h2.8882V7.0896zm-3.4657-4.531v4.531h-5.355l5.355-4.531zm-13.2862.0676 4.8691 4.4634H5.6458V2.6262zM2.7576 16.332V8.245h7.8476l-6.1149 6.1147v1.9723H2.7576zm2.8882 5.0404v-3.8852h.0001v-2.6488l5.7763-5.7764v7.0111l-5.7764 5.2993zm12.7086.0248-5.7766-5.1509V9.0618l5.7766 5.7766v6.5588zm2.8882-5.0652h-1.733v-1.9723L13.3948 8.245h7.8478v8.087z" },
  // No CC0 xAI or Grok mark exists: simple-icons declined it (PR 13518, "permission denied", because xAI's terms allow
  // its logo files only unaltered), and x.ai's brand page refuses automated downloads. Grok shows its name only.
  grok: null,
  // simple-icons 16.36.0, "google" (CC0), the Google G. Brand colour from simple-icons.
  google_ai: { color: "#4285F4", source: "simple-icons 16.36.0 google (CC0)", path: "M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" },
  // No CC0 Copilot mark exists: simple-icons never carried one and removed every Microsoft icon at Microsoft's request
  // (issue 11236). Copilot shows its name only.
  copilot: null,
};

export type Provider = { id: ProviderId; name: string; short: string; model: string; console: string; keyHint: string; via?: string };

/** Default models match DEFAULT_MODEL and SEARCH_MODEL in extension/background.js. */
export const PROVIDERS: Record<ProviderId, Provider> = {
  claude: { id: "claude", name: "Anthropic Claude", short: "Claude", model: "claude-opus-5-5", console: "https://console.anthropic.com", keyHint: "sk-ant-" },
  openai: { id: "openai", name: "OpenAI ChatGPT", short: "ChatGPT", model: "gpt-5", console: "https://platform.openai.com/usage", keyHint: "sk-" },
  gemini: { id: "gemini", name: "Google Gemini", short: "Gemini", model: "gemini-2.5-pro", console: "https://aistudio.google.com", keyHint: "AIza" },
  perplexity: { id: "perplexity", name: "Perplexity", short: "Perplexity", model: "sonar", console: "https://www.perplexity.ai/account/api", keyHint: "pplx-" },
  grok: { id: "grok", name: "xAI Grok", short: "Grok", model: "grok-4", console: "https://console.x.ai", keyHint: "xai-" },
  // Search engines whose AI answer is read through SerpApi; the key is the SerpApi key (no fixed prefix).
  google_ai: { id: "google_ai", name: "Google AI answers", short: "Google AI", model: "google_ai_overview", console: "https://serpapi.com/manage-api-key", keyHint: "", via: "SerpApi" },
  copilot: { id: "copilot", name: "Microsoft Copilot", short: "Copilot", model: "bing_copilot", console: "https://serpapi.com/manage-api-key", keyHint: "", via: "SerpApi" },
};

/** Drafting providers (the main key) in the order the Extension page lists them. */
export const DRAFT_PROVIDERS: ProviderId[] = ["claude", "openai", "gemini", "grok"];

const isProvider = (id: string): id is ProviderId => id in PROVIDERS;

/** The provider for an id or a stored name, including the older labels ("ChatGPT (OpenAI)", "Gemini (Google)"). */
export function providerOf(idOrName: string): Provider | null {
  const k = (idOrName || "").toLowerCase();
  if (isProvider(k)) return PROVIDERS[k];
  const hit = (Object.values(PROVIDERS) as Provider[]).find((p) => k.includes(p.short.toLowerCase()) || k.includes(p.id) || k === p.name.toLowerCase());
  return hit ?? null;
}
export const providerName = (id: string, short = false) => { const p = providerOf(id); return p ? (short ? p.short : p.name) : id; };

// ---------- AI writing checkers (humanization, db/031) ----------
// Pangram judges drafts; Walter AI is an optional second fixer in early access. Their marks are the companies' own
// files, unaltered: Pangram's favicon SVG from https://www.pangram.com/favicon.svg (fetched 6 Nov 2026), and Walter's
// site icon PNG from https://walterwrites.ai/wp-content/uploads/2024/12/cropped-Walter-Alterated-Logo_Icon_gradient-192x192.png
// (fetched 6 Nov 2026, scaled to 64px, served from public/brand/walter.png). Walter publishes no SVG mark.
// extension/marks.js holds the same Pangram paths; scripts/test-humanize.ts checks the copies match.
export type CheckerId = "pangram" | "walter";
export type CheckerMark = { viewBox: string; paths: { d: string; fill: string; evenodd?: boolean }[]; source: string } | { image: string; source: string };
export type Checker = { id: CheckerId; name: string; label: string; console: string; keyHint: string; beta?: boolean; ready?: boolean; mark: CheckerMark };
export const CHECKERS: Record<CheckerId, Checker> = {
  pangram: {
    id: "pangram", name: "Pangram", label: "Pangram", console: "https://www.pangram.com/dashboard", keyHint: "",
    mark: { viewBox: "116 116 488 488", source: "https://www.pangram.com/favicon.svg", paths: [
      { d: "M359.983 575.114V575.131L165.343 385.77V144.852L359.983 575.114Z", fill: "#FECAB9", evenodd: true },
      { d: "M554.623 144.852V385.77L360.034 575.098L360 575.114L359.983 575.131V575.114L360 575.081L554.623 144.852Z", fill: "#FECAB9" },
      { d: "M554.657 144.852L360 575.081L359.983 575.114L165.343 144.852L360 256.258L554.657 144.852Z", fill: "#FF6106" },
      { d: "M360 575.081V575.148L359.983 575.131V575.114L360 575.081Z", fill: "#FF6106" },
    ] },
  },
  walter: {
    // ready mirrors WALTER.confirmed in extension/walter.js (scripts/test-humanize.ts checks they agree).
    id: "walter", name: "Walter AI", label: "Walter (beta)", console: "https://walterwrites.ai/api/", keyHint: "", beta: true, ready: false,
    mark: { image: "/brand/walter.png", source: "https://walterwrites.ai/wp-content/uploads/2024/12/cropped-Walter-Alterated-Logo_Icon_gradient-192x192.png" },
  },
};

// Checker keys live in the extension (chrome.storage, cfg.checkers.<id>), set through extension/bridge.js and used only
// by extension/background.js. A page sees only whether one is saved (ExtStatus.checkerKeys). These three are the whole
// key interface, so the Connections section can show and change them without knowing the storage.
export const checkerConnected = (status: { checkerKeys?: Partial<Record<CheckerId, boolean>> } | null | undefined, id: CheckerId) => !!status?.checkerKeys?.[id];
export const saveCheckerKey = (id: CheckerId, key: string) => ({ checkerKey: { service: id, key: key.trim() } });
export const removeCheckerKey = (id: CheckerId) => ({ clearCheckerKey: id });

export const KEY_STATE = { on: "Connected in this browser", off: "No key in this browser" } as const;
/** All a page may show of a saved key. */
export const SAVED_KEY = "Saved ····";

// ---------- usage ----------
// List prices per million tokens (input, output). Only models with a known list price get a cost.
export const PRICE: Record<string, [number, number]> = { "claude-opus-5-5": [4, 20], "claude-sonnet-5-5": [2, 10], "claude-haiku-5-5": [0.1, 0.5], "claude-fable-5-1": [10, 50] };

export type UsageRow = { at: string; kind: string; provider: string; model: string; input_tokens: number; output_tokens: number };
export type ProviderUsage = { last: string | null; lastModel: string; calls: number; tokens: number; cost: number | null };

/** Last use (any time in the rows) and this month's calls, tokens and cost for one provider. Score reports carry no call. */
export function usageFor(rows: UsageRow[], id: string, month: string): ProviderUsage {
  const mine = rows.filter((r) => r.provider === id && r.kind !== "scores").sort((a, b) => b.at.localeCompare(a.at));
  const m = mine.filter((r) => r.at.slice(0, 7) === month);
  let cost: number | null = null;
  for (const r of m) {
    const p = PRICE[r.model];
    if (p) cost = (cost ?? 0) + (r.input_tokens * p[0] + r.output_tokens * p[1]) / 1e6;
  }
  return { last: mine[0]?.at ?? null, lastModel: mine.find((r) => r.model)?.model ?? "", calls: m.length, tokens: m.reduce((s, r) => s + (r.input_tokens || 0) + (r.output_tokens || 0), 0), cost };
}

/** "12 calls · 48.2k tokens · about $0.31", or "None". The cost appears only when every priced call has a list price.
 * `searches` counts SerpApi requests instead of calls ("3 searches"). */
export function usageLine(u: ProviderUsage, searches = false): string {
  if (!u.calls) return "None";
  if (searches) return `${u.calls} ${u.calls === 1 ? "search" : "searches"}`;
  const parts = [`${u.calls} ${u.calls === 1 ? "call" : "calls"}`];
  if (u.tokens) parts.push(`${u.tokens >= 1000 ? `${(u.tokens / 1000).toFixed(u.tokens >= 100000 ? 0 : 1)}k` : u.tokens} tokens`);
  if (u.cost != null) parts.push(`about $${u.cost.toFixed(2)}`);
  return parts.join(" · ");
}

/** "Today 14:05", "Yesterday", "3 Nov", or "None". */
export function lastUsedLabel(iso: string | null, now = new Date()): string {
  if (!iso) return "None";
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString("en-CA");
  if (day(d) === day(now)) return `Today ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (day(d) === day(y)) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}
