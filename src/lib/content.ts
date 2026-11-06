// Content Studio logic with no React and no network: the LinkedIn fold, the formatter, the regulated-claims
// check, the point-of-view bank, parsing AI replies, What works, and the URL safety rules for /api/fetch-url.
// Checked by scripts/test-content-studio.ts.

// ---------- the "see more" fold ----------
/** LinkedIn shows about 140 characters on mobile and 210 on desktop, and never more than 3 lines, before "see more". */
export const FOLD = { mobile: 140, desktop: 210 } as const;
export const FOLD_LINES = 3;

export function foldCut(text: string, device: keyof typeof FOLD) {
  const chars = Array.from(text);
  const limit = FOLD[device];
  let cut = chars.length, lines = 0;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === "\n" && ++lines >= FOLD_LINES) { cut = i; break; }
    if (i >= limit) { cut = i; break; }
  }
  if (cut >= chars.length) return { shown: text, folded: false, firstLine: chars.length };
  let shown = chars.slice(0, cut).join("").replace(/\s+\S*$/, "").trimEnd();
  if (!shown) shown = chars.slice(0, cut).join("");
  return { shown, folded: true, firstLine: Array.from(text.split("\n")[0]).length };
}
/** Does the opening line fit above the fold on this device? */
export const hookFits = (hook: string, device: keyof typeof FOLD) => Array.from(hook.trim()).length <= FOLD[device] && !hook.includes("\n");
/** Spoken hook for a video: about 3 seconds is 8 words; 16 is the outer limit. */
export const sayableIn3s = (hook: string) => hook.trim().split(/\s+/).filter(Boolean).length <= 16;

// ---------- the LinkedIn formatter ----------
// LinkedIn has no rich text, so styles use Unicode letters; underline and strike use combining marks.
export type Style = "bold" | "italic" | "bolditalic" | "mono" | "serif" | "script" | "double" | "underline" | "strike";
const BASES: Record<string, [number, number, number | null]> = {
  bold: [0x1d5d4, 0x1d5ee, 0x1d7ec], italic: [0x1d608, 0x1d622, null], bolditalic: [0x1d63c, 0x1d656, null],
  mono: [0x1d670, 0x1d68a, 0x1d7f6], serif: [0x1d400, 0x1d41a, 0x1d7ce], script: [0x1d4d0, 0x1d4ea, null], double: [0x1d538, 0x1d552, 0x1d7d8],
};
const HOLES: Record<string, number> = { C: 0x2102, H: 0x210d, N: 0x2115, P: 0x2119, Q: 0x211a, R: 0x211d, Z: 0x2124 };
function mapChar(kind: string, ch: string) {
  const b = BASES[kind], c = ch.charCodeAt(0);
  if (kind === "double" && HOLES[ch]) return String.fromCodePoint(HOLES[ch]);
  if (c >= 65 && c <= 90) return String.fromCodePoint(b[0] + c - 65);
  if (c >= 97 && c <= 122) return String.fromCodePoint(b[1] + c - 97);
  if (c >= 48 && c <= 57 && b[2]) return String.fromCodePoint(b[2] + c - 48);
  return ch;
}
let BACK: Record<string, string> | null = null;
/** Back to plain letters: every styled letter and every combining mark removed. */
export function plain(s: string) {
  if (!BACK) {
    BACK = {};
    for (const k of Object.keys(BASES)) for (let c = 32; c < 127; c++) { const ch = String.fromCharCode(c), o = mapChar(k, ch); if (o !== ch) BACK[o] = ch; }
  }
  const b = BACK;
  return Array.from(s.replace(/[̶̲]/g, "")).map((ch) => b[ch] ?? ch).join("");
}
export function styled(s: string, kind: Style) {
  const p = plain(s);
  if (kind === "underline") return Array.from(p).map((ch) => (ch === "\n" ? ch : ch + "̲")).join("");
  if (kind === "strike") return Array.from(p).map((ch) => (ch === "\n" ? ch : ch + "̶")).join("");
  return Array.from(p).map((ch) => mapChar(kind, ch)).join("");
}
/** Apply a style to the selection [a, b) of v. Returns the new text and the new selection end. */
export function styleRange(v: string, a: number, b: number, kind: Style) {
  if (a === b) return null;
  const mid = styled(v.slice(a, b), kind);
  return { text: v.slice(0, a) + mid + v.slice(b), end: a + mid.length };
}
const LIST_PREFIX = /^(\d+\.\s|[•▪→✓]\s)/;
/** Turn the lines touched by the selection into a list (bullets, numbers, arrows or checks). */
export function listLines(v: string, a: number, b: number, kind: "bullet" | "number" | "arrow" | "check") {
  const s = v.lastIndexOf("\n", a - 1) + 1;
  let e = v.indexOf("\n", b); if (e < 0) e = v.length;
  let n = 0;
  const mark = (i: number) => (kind === "number" ? `${i}. ` : kind === "arrow" ? "→ " : kind === "check" ? "✓ " : "• ");
  const block = v.slice(s, e).split("\n").map((l) => (l.trim() ? mark(++n) + l.replace(LIST_PREFIX, "") : l)).join("\n");
  return v.slice(0, s) + block + v.slice(e);
}
export function caseRange(v: string, a: number, b: number, kind: "upper" | "title") {
  if (a === b) return null;
  const p = plain(v.slice(a, b));
  const t = kind === "upper" ? p.toUpperCase() : p.toLowerCase().replace(/\b[a-z]/g, (m) => m.toUpperCase());
  return v.slice(0, a) + t + v.slice(b);
}
/** A blank line LinkedIn keeps (it drops empty lines on paste) and a quiet divider. */
export const KEEP_BLANK = "\n⠀\n";
export const DIVIDER = "\n▬▬▬▬▬▬▬▬\n";
/** **bold**, *italic*, ~~strike~~ and "- " bullets become LinkedIn-ready text. */
export function markdownToLinkedIn(v: string) {
  return v
    .replace(/\*\*(.+?)\*\*/g, (_m, x: string) => styled(x, "bold"))
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, (_m, p: string, x: string) => p + styled(x, "italic"))
    .replace(/~~(.+?)~~/g, (_m, x: string) => styled(x, "strike"))
    .replace(/^[-*]\s/gm, "• ");
}

// ---------- regulated-claims check (Q64) ----------
export type ClaimFlag = { kind: "returns" | "timeline" | "client" | "regulator" | "confidential"; text: string; why: string };
const REGULATORS = ["vara", "cbuae", "sama", "rbi", "sebi", "sec", "occ", "fca", "mas", "esma", "dfsa", "fsra", "adgm", "regulator", "regulators", "central bank", "government", "ministry"];
const HARSH = ["incompetent", "clueless", "useless", "failed", "failing", "fails", "wrong", "backward", "outdated", "stifle", "stifles", "stifling", "kill", "killing", "blocking", "careless", "lazy", "ridiculous", "absurd", "hostile", "asleep"];
/**
 * Flags lines that can hurt a regulated buyer's trust: promised returns or timelines, clients named without
 * permission, harsh words about a regulator, and confidential deal details. Advisory: the human decides.
 */
export function claimsCheck(text: string, opts: { companies?: string[]; permitted?: string[] } = {}): ClaimFlag[] {
  const flags: ClaimFlag[] = [];
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const low = (s: string) => s.toLowerCase();
  for (const s of sentences) {
    const l = low(s);
    if (/\b(guarantee[ds]?|risk[- ]free|assured returns?|no risk|cannot lose|sure profit)\b/.test(l) || /\b\d+(\.\d+)?\s?%\s*(returns?|yield|apy|apr|profit|gain)/.test(l) || /\b(returns?|yield)s? of \d/.test(l))
      flags.push({ kind: "returns", text: s, why: "Promises returns or no risk. Regulated buyers read this as a financial promotion." });
    if (/\b(will|shall)\b[^.]{0,40}\b(by|before|within)\s+(q[1-4]|\d{4}|january|february|march|april|may|june|july|august|september|october|november|december|\d+\s+(days|weeks|months))\b/.test(l) || /\b(launch(es|ing)?|go(es)? live|live)\s+(by|in|on)\s+(q[1-4]|\d{4}|\d+\s+(days|weeks|months))\b/.test(l))
      flags.push({ kind: "timeline", text: s, why: "Commits to a date. Use it only if the date is public and certain." });
    const hasReg = REGULATORS.some((r) => new RegExp(`\\b${r}\\b`).test(l));
    if (hasReg && HARSH.some((h) => new RegExp(`\\b${h}\\b`).test(l)))
      flags.push({ kind: "regulator", text: s, why: "Reads as criticism of a regulator or government. Frame rules as a design input." });
    if (/\b(confidential|under nda|nda|not public|term sheet|under wraps|stealth|internal only)\b/.test(l) || /\b(deal|contract|mandate)\s+(worth|size|value)\b/.test(l))
      flags.push({ kind: "confidential", text: s, why: "Mentions confidential deal details." });
  }
  const permitted = (opts.permitted ?? []).map(low);
  for (const c of opts.companies ?? []) {
    const name = c.trim(); if (name.length < 3) continue;
    if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text) && !permitted.includes(low(name)))
      flags.push({ kind: "client", text: name, why: "A client or prospect is named. Name them only with their permission (add them to the point-of-view bank)." });
  }
  return flags;
}

// ---------- point-of-view bank (Q61) ----------
export type Pov = { stances: string[]; proofs: { text: string; cleared: boolean }[]; numbers: { value: string; context: string }[]; clients: string[] };
export const EMPTY_POV: Pov = { stances: [], proofs: [], numbers: [], clients: [] };
export const mergePov = (p?: Partial<Pov> | null): Pov => ({ stances: p?.stances ?? [], proofs: p?.proofs ?? [], numbers: p?.numbers ?? [], clients: p?.clients ?? [] });
/** The bank as prompt text. Only cleared proof points and allowed numbers are given to the AI. first: the profile's first name. */
export function povText(p: Pov, first = "The profile owner") {
  const parts: string[] = [];
  if (p.stances.length) parts.push(`${first}${/s$/i.test(first) ? "'" : "'s"} stances: ${p.stances.map((s) => `"${s}"`).join("; ")}.`);
  const proofs = p.proofs.filter((x) => x.cleared).map((x) => x.text);
  if (proofs.length) parts.push(`Cleared proof points (use only these): ${proofs.join("; ")}.`);
  if (p.numbers.length) parts.push(`Numbers allowed (use only these, exactly): ${p.numbers.map((n) => `${n.value} (${n.context})`).join("; ")}.`);
  if (p.clients.length) parts.push(`Clients that may be named: ${p.clients.join(", ")}. Name no other client.`);
  return parts.length ? parts.join(" ") + " Use no other numbers, proof points or client names." : "No point-of-view bank yet: use no numbers, proof points or client names that are not in the source.";
}

// ---------- newsletter (Q66) ----------
export type Newsletter = { name: string; cadence: "weekly" | "fortnightly" | "monthly"; weekday: number; start?: string };
export const DEFAULT_NEWSLETTER: Newsletter = { name: "", cadence: "fortnightly", weekday: 2 };
/** The next issue day on or after `from` (YYYY-MM-DD). Weekday: 1 Monday to 7 Sunday. */
export function nextIssue(n: Newsletter, from: string) {
  const d = new Date(from + "T12:00:00");
  const dow = ((d.getDay() + 6) % 7) + 1;
  d.setDate(d.getDate() + ((n.weekday - dow + 7) % 7));
  if (n.start && n.cadence !== "weekly") {
    const s = new Date(n.start + "T12:00:00");
    const step = n.cadence === "fortnightly" ? 14 : 28;
    while (Math.round((d.getTime() - s.getTime()) / 864e5) % step !== 0 && d > s) d.setDate(d.getDate() + 7);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------- parsing AI replies ----------
export type Idea = { title: string; why: string; pillar: string; score: number };
export type Hook = { text: string; kind: string };
export type Draft = { angle: string; text: string; impact: number };
const asArr = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
const num = (x: unknown, lo: number, hi: number) => { const n = Math.round(Number(x)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; };
export function parseIdeas(j: unknown): Idea[] {
  const o = (j ?? {}) as { ideas?: unknown };
  return asArr<Record<string, unknown>>(o.ideas).map((x) => ({ title: String(x.title ?? "").trim(), why: String(x.why ?? "").trim(), pillar: String(x.pillar ?? "").trim(), score: num(x.score, 0, 100) }))
    .filter((x) => x.title).sort((a, b) => b.score - a.score).slice(0, 6);
}
export function parseHooks(j: unknown): Hook[] {
  const o = (j ?? {}) as { hooks?: unknown };
  return asArr<Record<string, unknown> | string>(o.hooks).map((x) => (typeof x === "string" ? { text: x, kind: "" } : { text: String(x.text ?? ""), kind: String(x.kind ?? "") }))
    .map((h) => ({ ...h, text: h.text.replace(/\s+/g, " ").trim() })).filter((h) => h.text).slice(0, 8);
}
export function parseDrafts(j: unknown, hook: string): Draft[] {
  const o = (j ?? {}) as { drafts?: unknown };
  return asArr<Record<string, unknown> | string>(o.drafts).map((x) => (typeof x === "string" ? { angle: "", text: x, impact: 0 } : { angle: String(x.angle ?? ""), text: String(x.text ?? ""), impact: num(x.impact, 0, 10) * 10 }))
    .map((d) => ({ ...d, text: d.text.trim() })).filter((d) => d.text)
    // Every draft opens with the chosen hook, so the fold check stays true.
    .map((d) => (hook && !d.text.startsWith(hook) ? { ...d, text: `${hook}\n\n${d.text.replace(new RegExp(`^${hook.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`), "")}` } : d)).slice(0, 3);
}

// ---------- What works (Q67) ----------
export type ResultPost = { format: string; pillar: string; publish_date: string | null; planned_time: string; draft: string; status: string; impressions: number | null; reactions: number | null; comments: number | null };
export const MIN_RESULTS = 5;
/** Engagement per post: comments weigh double, as they start conversations. */
const score = (p: ResultPost) => (p.reactions ?? 0) + 2 * (p.comments ?? 0);
export function whatWorks(posts: ResultPost[]) {
  const done = posts.filter((p) => (p.status === "Posted" || p.status === "Published") && (p.impressions != null || p.reactions != null || p.comments != null));
  if (done.length < MIN_RESULTS) return { enough: false as const, have: done.length, need: MIN_RESULTS };
  const group = (key: (p: ResultPost) => string) => {
    const m = new Map<string, { n: number; total: number }>();
    for (const p of done) { const k = key(p) || "Not set"; const e = m.get(k) ?? { n: 0, total: 0 }; e.n++; e.total += score(p); m.set(k, e); }
    return [...m.entries()].map(([k, e]) => ({ k, n: e.n, avg: Math.round(e.total / e.n) })).sort((a, b) => b.avg - a.avg);
  };
  const day = (p: ResultPost) => (p.publish_date ? new Date(p.publish_date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long" }) : "");
  const slot = (p: ResultPost) => { const h = Number((p.planned_time || "").slice(0, 2)); return Number.isFinite(h) && p.planned_time ? (h < 11 ? "Morning" : h < 15 ? "Midday" : "Afternoon") : ""; };
  const hookLen = (p: ResultPost) => { const n = Array.from((p.draft || "").split("\n")[0]).length; return n ? (n <= 80 ? "Short opening, under 80 characters" : n <= 140 ? "Opening that fits the mobile fold" : "Long opening, cut on mobile") : ""; };
  return { enough: true as const, have: done.length, byFormat: group((p) => p.format), byPillar: group((p) => p.pillar), byDay: group(day), bySlot: group(slot), byHook: group(hookLen) };
}

// ---------- the angle step (Q92) ----------
export const ANGLE_KINDS = ["Contrarian", "Regional lens", "Operator view", "Numbers and prediction"] as const;
/** Four suggested angles built from the topic, for every starting point. The AI can rewrite them; these work without a key.
 *  region: the profile's focus regions as text (regionText in src/lib/persona.ts), empty when none are set. */
export function suggestAngles(topic: string, region = ""): { kind: string; text: string }[] {
  const t = topic.trim().replace(/[.!?]+$/, "") ? `"${topic.trim().replace(/[.!?]+$/, "")}"` : "this";
  return [
    { kind: "Contrarian", text: `What most coverage of ${t} misses, and why it matters to the people who have to act on it` },
    { kind: "Regional lens", text: region ? `What ${t} means for buyers in ${region}` : `What ${t} means close to home, for the buyers this profile serves` },
    { kind: "Operator view", text: `How to actually build for ${t}: the controls and decisions that come first` },
    { kind: "Numbers and prediction", text: `The numbers behind ${t}, and where they will be in 12 months` },
  ];
}
/** A Discovery angle often starts with its kind ("How we see it: ..."); the step shows only the line. */
export const angleLine = (a: string) => { const t = a.replace(/^(How we see it|Contrarian|Regional lens|GCC and India lens|Operator view|Numbers and prediction)\s*:\s*/i, "").trim(); return t.charAt(0).toUpperCase() + t.slice(1); };

// ---------- where a post came from (Library Source filter, Q93) ----------
export type PostSource = "discovery" | "citations" | "campaign" | "here";
export function postSource(p: { source_kind?: string; topic?: string; campaign_id?: string | null }): PostSource {
  if (p.source_kind === "discovery") return "discovery";
  if (p.topic === "AI citations" || p.source_kind === "gap") return "citations";
  if (p.campaign_id) return "campaign";
  return "here";
}

// ---------- URL safety for /api/fetch-url ----------
/** Only http and https, never LinkedIn (rule 1), never a bare IP in a private or local range. */
export function urlProblem(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return "That is not a valid web address."; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "Only http and https links can be read.";
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "linkedin.com" || h.endsWith(".linkedin.com") || h === "lnkd.in") return "LinkedIn pages are never fetched. Open the post and use the extension instead.";
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return "Local addresses cannot be read.";
  if (isPrivateIp(h)) return "Private network addresses cannot be read.";
  return null;
}
/** True for loopback, private, link-local, carrier-grade NAT, multicast and unspecified addresses (IPv4 and IPv6). */
export function isPrivateIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const l = ip.toLowerCase();
  if (!l.includes(":")) return false;
  if (l === "::" || l === "::1") return true;
  const mapped = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]);
  return /^(fc|fd)/.test(l) || /^fe[89ab]/.test(l) || l.startsWith("ff");
}
/** Readable text from HTML: scripts, styles and tags removed, entities decoded, whitespace collapsed. */
export function readable(html: string) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  const body = html.replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])>/gi, "\n").replace(/<[^>]+>/g, " ");
  const dec = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)));
  return { title: dec(title).replace(/\s+/g, " "), text: dec(body).replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim() };
}
