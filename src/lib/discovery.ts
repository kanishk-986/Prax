// Discovery Studio logic with no React and no network: the seven-dimension rubric and bands, the rules scorer,
// link lists (CSV and Excel, hyperlinks hidden behind cell text kept), list pages and page dates, the AI search
// plan and its replies, merging articles into topics, topic priority (Q85) and the Digest selection.
// Based on the Antier discovery agent (passes by theme, entity, event word) and its Research Resources List.
// Checked by scripts/test-discovery.ts.
import { unzipSync, strFromU8 } from "fflate";

// ---------- the rubric ----------
export const DIMENSIONS = [
  ["Buyer fit", "Does a bank, fintech, PSP or asset manager now face a decision?"],
  ["Pillar fit", "Does it fit one of the six pillars?"],
  ["Geography", "MENA or India highest"],
  ["Antier service", "Matches a top service"],
  ["Freshness", "72 hours scores 5"],
  ["Evidence", "Primary or two independent sources"],
  ["Shashi angle", "A COO can speak from operations"],
] as const;
export const DEFAULT_WEIGHTS = [25, 20, 15, 15, 10, 10, 5];
export const DEFAULT_BANDS = { post: 70, comment: 55, watch: 35, target: 40 };
export type Bands = typeof DEFAULT_BANDS;
export type Band = "Post-worthy" | "Comment-worthy" | "Watch" | "Dropped";
export const BANDS: Band[] = ["Post-worthy", "Comment-worthy", "Watch", "Dropped"];

export const total = (xs: number[]) => xs.reduce((a, b) => a + (Number(b) || 0), 0);
/** Weights must be seven whole numbers of 0 or more that add up to exactly 100. */
export const weightsOk = (w: number[], n = 7) => w.length === n && w.every((x) => Number.isInteger(x) && x >= 0) && total(w) === 100;

/** 0 to 100: each dimension scored 0 to 5, times its weight. */
export function totalScore(scores: number[], weights = DEFAULT_WEIGHTS) {
  return Math.round(weights.reduce((a, w, i) => a + (Math.max(0, Math.min(5, scores[i] ?? 0)) / 5) * w, 0));
}

export type Scorable = { scores: number[]; confirmed: boolean; source_type?: string; target?: boolean };
/**
 * Post 70+ (also fresh within 7 days and evidence 3+), Comment 55+ for LinkedIn items (or 40+ when a target
 * account wrote it), Watch 35 to 69, Dropped under 35. An unconfirmed date is capped at Watch.
 */
export function bandOf(f: Scorable, weights = DEFAULT_WEIGHTS, b: Bands = DEFAULT_BANDS): Band {
  const t = totalScore(f.scores, weights);
  if (t < b.watch) return "Dropped";
  if (!f.confirmed) return "Watch";
  if (f.source_type === "LinkedIn" && (t >= b.comment || (f.target && t >= b.target))) return "Comment-worthy";
  if (t >= b.post && (f.scores[4] ?? 0) >= 4 && (f.scores[5] ?? 0) >= 3) return "Post-worthy";
  return "Watch";
}

// ---------- the vocabulary the rules scorer uses ----------
/** Same six pillars as src/lib/campaigns.ts (checked by the test). */
export const PILLAR_WORDS: Record<string, string[]> = {
  "Money That Moves Itself": ["stablecoin", "settlement", "remittance", "cross-border", "payment", "payments", "tokenised deposit", "tokenized deposit", "cbdc", "digital rupee", "e-rupee", "digital dirham", "wallet"],
  "The Liquid Balance Sheet": ["tokenised fund", "tokenized fund", "private credit", "rwa", "real world asset", "real-world asset", "tokenisation", "tokenization", "bond", "money market", "treasury", "fund"],
  "Regulation-to-Architecture": ["regulator", "regulation", "consultation", "circular", "framework", "licence", "license", "rules", "guidance", "vara", "cbuae", "sama", "rbi", "sebi", "adgm", "dfsa", "fsra", "mica", "compliance"],
  "Production-Grade or Nothing": ["custody", "key management", "audit", "incident", "outage", "hack", "security", "reconciliation", "production", "resilience", "controls"],
  "Agentic Finance": ["agentic", "ai agent", "agents", "agent payments", "mandate", "know your intent", "autonomous", "machine payments"],
  "Build, Buy or Partner": ["build or buy", "vendor", "partnership", "partners with", "selects", "acquires", "acquisition", "outsourc", "total cost", "procurement"],
};
export const SERVICES = ["Stablecoin infrastructure", "Tokenisation", "Payments and settlement", "Custody", "Agentic payments", "CBDC and digital currency", "Exchange and trading", "Compliance and RegTech"];
const SERVICE_WORDS: Record<string, string[]> = {
  "Stablecoin infrastructure": ["stablecoin", "payment token", "reserve", "issuer", "usdc", "usdt", "aed-backed", "dirham-backed"],
  Tokenisation: ["tokenis", "tokeniz", "rwa", "real world asset", "real-world asset", "tokenised fund", "tokenized fund", "security token"],
  "Payments and settlement": ["settlement", "payments", "remittance", "cross-border", "upi", "real-time payment", "open banking", "psp"],
  Custody: ["custody", "custodian", "key management", "wallet infrastructure", "safekeeping"],
  "Agentic payments": ["agentic", "ai agent", "agent payments", "mandate", "machine payments"],
  "CBDC and digital currency": ["cbdc", "digital rupee", "e-rupee", "digital dirham", "central bank digital"],
  "Exchange and trading": ["exchange", "trading platform", "brokerage", "market maker", "liquidity"],
  "Compliance and RegTech": ["aml", "kyc", "travel rule", "sanctions", "regtech", "compliance"],
};
export const GEOS = ["MENA", "India", "Other emerging markets", "US and EU with a regional implication"];
const MENA = ["uae", "dubai", "abu dhabi", "saudi", "ksa", "riyadh", "qatar", "doha", "bahrain", "kuwait", "oman", "gcc", "gulf", "mena", "middle east", "vara", "cbuae", "sama", "adgm", "difc", "dfsa", "fsra", "emirates", "dirham"];
const INDIA = ["india", "indian", "rbi", "sebi", "npci", "upi", "mumbai", "bengaluru", "rupee", "gift city", "ifsca"];
const EM = ["singapore", "hong kong", "africa", "nigeria", "kenya", "egypt", "turkey", "brazil", "indonesia", "pakistan", "asia", "latam", "latin america", "vietnam", "thailand", "malaysia", "philippines"];
const WEST = ["us ", "u.s.", "united states", "europe", "eu ", "european", "uk ", "britain", "sec ", "fed ", "ecb", "esma", "mica"];
const BUYER = ["bank", "banks", "fintech", "psp", "payment firm", "asset manager", "fund manager", "exchange", "insurer", "central bank", "regulator", "lender"];
const DECISION = ["consultation", "circular", "rule", "rules", "licence", "license", "pilot", "launch", "launches", "goes live", "deadline", "tender", "rfp", "mandate", "approves", "approved", "framework", "partnership", "acquires", "selects", "rolls out", "requires"];
const OPERATOR = ["reconciliation", "settlement", "custody", "controls", "production", "operations", "integration", "compliance", "architecture", "infrastructure", "implementation", "key management", "reporting", "audit", "core banking", "ledger"];
/** Event words for the third pass: decisions, not commentary. */
export const EVENT_WORDS = ["launch", "pilot", "partnership", "acquisition", "licence granted", "consultation", "goes live"];

const hits = (text: string, words: string[]) => words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
const best = (text: string, map: Record<string, string[]>) => {
  let top = "", n = 0;
  for (const [k, ws] of Object.entries(map)) { const h = hits(text, ws); if (h > n) { top = k; n = h; } }
  return { top, n };
};

// ---------- source types ----------
const REGULATOR_HOSTS = ["vara.ae", "centralbank.ae", "sama.gov.sa", "rbi.org.in", "sebi.gov.in", "adgm.com", "dfsa.ae", "difc.ae", "ifsca.gov.in", "npci.org.in", "cbb.gov.bh", "qcb.gov.qa", "cbk.gov.kw", "cbo.gov.om", "bis.org", "imf.org", "fsb.org", "fatf-gafi.org", "worldbank.org", "treasury.gov", "newyorkfed.org", "richmondfed.org", "federalreserve.gov", "esma.europa.eu", "ecb.europa.eu", "sec.gov", "fca.org.uk", "mas.gov.sg"];
const MAJOR_MEDIA = ["reuters.com", "bloomberg.com", "ft.com", "wsj.com", "cnbc.com", "americanbanker.com", "paymentsdive.com", "finextra.com", "thenationalnews.com", "gulfnews.com", "khaleejtimes.com", "arabianbusiness.com", "zawya.com", "economictimes.indiatimes.com", "livemint.com", "business-standard.com", "moneycontrol.com", "thehindubusinessline.com", "coindesk.com", "theblock.co", "agbi.com", "fintechfutures.com"];
const RESEARCH = ["mckinsey.com", "bcg.com", "bain.com", "deloitte.com", "pwc.com", "kpmg.com", "ey.com", "kearney.com", "accenture.com", "messari.io", "blockworksresearch.com", "gartner.com", "forrester.com", "cbinsights.com", "spglobal.com", "weforum.org", "dci.mit.edu", "cfainstitute.org", "delphidigital.io", "celent.com", "21shares.com"];
const BLOGS = ["medium.com", "substack.com", "blogspot.com", "wordpress.com", "mirror.xyz", "hashnode.dev"];
export function hostOf(url: string) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}
const onHost = (h: string, list: string[]) => list.some((d) => h === d || h.endsWith("." + d));
export function sourceTypeOf(url: string): string {
  const h = hostOf(url);
  if (!h) return url.startsWith("linkedin:") ? "LinkedIn" : "Publication";
  if (h === "linkedin.com" || h.endsWith(".linkedin.com")) return "LinkedIn";
  if (onHost(h, REGULATOR_HOSTS) || /\.gov(\.[a-z]{2})?$/.test(h) || h.endsWith(".gob") || h.endsWith(".gouv.fr")) return "Regulator";
  if (onHost(h, MAJOR_MEDIA)) return "Major media";
  if (onHost(h, RESEARCH)) return "Research";
  if (onHost(h, BLOGS)) return "Blog";
  if (/\/(press|newsroom|press-releases?|media-centre|media-center)(\/|$)/.test((() => { try { return new URL(url).pathname.toLowerCase(); } catch { return ""; } })())) return "Company";
  return "Publication";
}
/** Source quality 1 to 5: regulator or primary first, then major media and research, then trade press, company, blogs. */
export const QUALITY: Record<string, number> = { Regulator: 5, "Major media": 4, Research: 4, Publication: 3, LinkedIn: 3, Company: 2, Blog: 1 };

// ---------- freshness ----------
const days = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
export const daysBetween = days;
/** 5 within 3 days (72 hours), 4 within 7, 3 within 14, 2 within 30, 1 within 90, else 0. Unknown dates score 2. */
export function freshness(published: string | null, todayYmd: string) {
  if (!published) return 2;
  const d = days(published, todayYmd);
  return d < 0 ? 4 : d <= 3 ? 5 : d <= 7 ? 4 : d <= 14 ? 3 : d <= 30 ? 2 : d <= 90 ? 1 : 0;
}

// ---------- the rules scorer ----------
export type Article = { url: string; title: string; excerpt?: string; publisher?: string; published: string | null; confirmed: boolean; source_type?: string };
export type RuleScore = { scores: number[]; pillar: string; geo: string; service: string; kind: string; source_type: string };
/**
 * A first score from the words on the page, so a crawl with no AI key still sorts itself. The AI check in the
 * browser refines it later (scored_by "ai").
 */
export function ruleScore(a: Article, todayYmd: string): RuleScore {
  const text = ` ${a.title} ${a.excerpt ?? ""} `.toLowerCase().replace(/\s+/g, " ");
  const st = a.source_type || sourceTypeOf(a.url);
  const buyer = hits(text, BUYER) > 0, decision = hits(text, DECISION) > 0;
  const pil = best(text, PILLAR_WORDS), svc = best(text, SERVICE_WORDS);
  const geoScore = hits(text, MENA) ? 5 : hits(text, INDIA) ? 5 : hits(text, EM) ? 3 : hits(text, WEST) ? 2 : 1;
  const geo = hits(text, MENA) ? "MENA" : hits(text, INDIA) ? "India" : hits(text, EM) ? "Other emerging markets" : hits(text, WEST) ? "US and EU with a regional implication" : "";
  const op = hits(text, OPERATOR);
  const scores = [
    buyer && decision ? 5 : decision ? 4 : buyer ? 3 : 1,
    pil.n >= 3 ? 5 : pil.n === 2 ? 4 : pil.n === 1 ? 3 : 1,
    geoScore,
    svc.n >= 2 ? 5 : svc.n === 1 ? 4 : 1,
    freshness(a.published, todayYmd),
    QUALITY[st] ?? 3,
    op >= 2 ? 5 : op === 1 ? 3 : 1,
  ];
  const kind = /\b(could|may|might|rumou?r|reportedly|said to)\b/.test(text) ? "Speculation"
    : /\b(report|analysis|research|framework|outlook|survey|study)\b/.test(text) ? "Analysis"
    : st === "LinkedIn" || /\b(plans|exploring|considering|says)\b/.test(text) ? "Signal" : "Fact";
  return { scores, pillar: pil.top, geo, service: svc.top, kind, source_type: st };
}

// ---------- opportunities: speaking and pitch, press requests, sales (Q80 to Q82) ----------
export type Opp = { kind: "pitch" | "press" | "sales"; due: number | null };
export function opportunityOf(title: string, text: string, todayYmd: string): Opp | null {
  const t = `${title} ${text}`.toLowerCase();
  const kind = /\b(tender|request for proposals?|rfp|rfq|expression of interest|invitation to bid|bid invitation)\b/.test(t) ? "sales"
    : /\b(journalist|reporter|seeks? (experts?|sources|comment)|looking for (experts?|operators|sources)|request for briefings?|analyst briefings?)\b/.test(t) ? "press"
    : /\b(call for (speakers|papers|proposals|nominations|entries)|speaker applications|nominations (are )?open|open for (comment|feedback)|request for comments?|consultation paper|public consultation)\b/.test(t) ? "pitch" : null;
  return kind ? { kind, due: deadlineIn(t, todayYmd) } : null;
}
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
/** Days until a deadline written as "closes on 12 December 2026", "deadline: 2026-12-01" or "by 30 November". */
export function deadlineIn(text: string, todayYmd: string): number | null {
  const t = text.toLowerCase();
  const near = t.match(/(?:deadline|closes?|closing|due|by|until|before|submit by|open until)[^0-9a-z]{0,12}(?:on\s+)?(\d{4}-\d{2}-\d{2}|\d{1,2}\s+[a-z]+(?:\s+\d{4})?|[a-z]+\s+\d{1,2}(?:,?\s+\d{4})?)/);
  if (!near) return null;
  const s = near[1];
  let y = Number(todayYmd.slice(0, 4)), m = -1, d = 0;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) { y = +iso[1]; m = +iso[2] - 1; d = +iso[3]; }
  else {
    const a = s.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/), b = s.match(/^([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);
    const mo = (w: string) => MONTHS.findIndex((x) => x.startsWith(w.slice(0, 3)));
    if (a && mo(a[2]) >= 0) { d = +a[1]; m = mo(a[2]); if (a[3]) y = +a[3]; }
    else if (b && mo(b[1]) >= 0) { d = +b[2]; m = mo(b[1]); if (b[3]) y = +b[3]; }
  }
  if (m < 0 || d < 1 || d > 31) return null;
  const when = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  let n = days(todayYmd, when);
  if (n < 0 && !/\d{4}/.test(s)) n = days(todayYmd, `${y + 1}${when.slice(4)}`);
  return n >= 0 && n <= 365 ? n : null;
}

// ---------- link lists: CSV and Excel ----------
export type LinkRow = { url: string; name: string; type: string; priority: string; access: string; region: string; notes: string };
export const LINK_COLS = ["url", "name", "type", "priority", "access", "region", "notes"] as const;
const ALIASES: Record<(typeof LINK_COLS)[number], string[]> = {
  url: ["url", "link", "links", "website", "web", "site", "address", "href", "source url", "homepage"],
  name: ["name", "company / entity name", "company", "entity", "source", "source name", "title", "publication", "organisation", "organization"],
  type: ["type", "category", "kind", "source type"],
  priority: ["priority", "tier", "rank"],
  access: ["access", "price/month", "price", "paywall", "cost", "pricing"],
  region: ["region", "geo", "geography", "country", "market"],
  notes: ["notes", "note", "strategic focus", "focus", "comment", "comments", "description"],
};
/** A link as Prax stores it: https added to a bare domain, host lowercased, fragment dropped. Null when not a web link. */
export function normalizeLink(raw: string): string | null {
  let s = String(raw ?? "").trim().replace(/^<|>$/g, "");
  if (!s || /\s/.test(s)) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) { if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$|\?)/i.test(s)) return null; s = "https://" + s; }
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  return u.toString();
}
export const linkKey = (url: string) => url.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
export const isLinkedIn = (url: string) => { const h = hostOf(url); return h === "linkedin.com" || h.endsWith(".linkedin.com") || h === "lnkd.in"; };

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], f = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export type Sheet = { name: string; rows: string[][]; links: Record<string, string> };
const colIndex = (ref: string) => { const m = ref.match(/^([A-Z]+)(\d+)$/); if (!m) return null; let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; return { c: c - 1, r: Number(m[2]) - 1 }; };
const xmlText = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? "";
/** Every sheet of an .xlsx: cell text, plus the hyperlink behind any cell (relationship links and HYPERLINK formulas). */
export function readXlsx(bytes: Uint8Array): Sheet[] {
  const files = unzipSync(bytes);
  const read = (p: string) => (files[p] ? strFromU8(files[p]) : "");
  const strings = [...read("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => xmlText(t[1])).join(""));
  const rels = (p: string) => Object.fromEntries([...read(p).matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], "Id"), attr(m[0], "Target")]));
  const wbRels = rels("xl/_rels/workbook.xml.rels");
  const sheets: Sheet[] = [];
  for (const m of read("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)) {
    const target = wbRels[attr(m[0], "r:id")] ?? "";
    const path = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
    const xml = read(path);
    if (!xml) continue;
    const rows: string[][] = [], links: Record<string, string> = {};
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const pos = colIndex(attr(c[1], "r")); if (!pos) continue;
      const t = attr(c[1], "t"), body = c[2] ?? "";
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1], f = body.match(/<f[^>]*>([\s\S]*?)<\/f>/)?.[1];
      let text = t === "s" ? strings[Number(v)] ?? "" : t === "inlineStr" ? [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => xmlText(x[1])).join("") : v != null ? xmlText(v) : "";
      if (f) {
        const h = xmlText(f).match(/^HYPERLINK\(\s*"([^"]+)"\s*(?:,\s*"([^"]*)")?/i);
        if (h) { links[`${pos.r},${pos.c}`] = h[1]; if (!text) text = h[2] ?? h[1]; }
      }
      (rows[pos.r] ??= [])[pos.c] = text;
    }
    const relPath = path.replace(/([^/]+)$/, "_rels/$1.rels");
    const sheetRels = rels(relPath);
    for (const h of xml.matchAll(/<hyperlink\b[^>]*>/g)) {
      const ref = attr(h[0], "ref").split(":")[0], to = sheetRels[attr(h[0], "r:id")];
      const pos = colIndex(ref);
      if (pos && to) links[`${pos.r},${pos.c}`] = to;
    }
    sheets.push({ name: attr(m[0], "name"), rows: Array.from(rows, (r) => Array.from(r ?? [], (x) => x ?? "")), links });
  }
  return sheets;
}

export type ParsedList = { rows: LinkRow[]; dupes: number; invalid: number; linkedin: number; error?: string };
/**
 * Rows of one sheet or CSV to links. The url column is found by its header (url, link, website...) or, when the
 * header says nothing, by the column whose cells look like links. A hyperlink hidden behind a cell (for example
 * the name) gives the url when the url cell is empty or is not a link itself.
 */
export function linkRows(rows: string[][], links: Record<string, string> = {}): ParsedList {
  const out: LinkRow[] = []; let dupes = 0, invalid = 0, linkedin = 0;
  const data = rows.map((r) => r.map((c) => String(c ?? "").trim()));
  if (!data.length) return { rows: [], dupes, invalid, linkedin, error: "The file is empty." };
  const head = data[0].map((h) => h.toLowerCase());
  const find = (k: (typeof LINK_COLS)[number]) => head.findIndex((h) => ALIASES[k].includes(h));
  const idx = Object.fromEntries(LINK_COLS.map((k) => [k, find(k)])) as Record<(typeof LINK_COLS)[number], number>;
  const width = Math.max(...data.map((r) => r.length));
  if (idx.url < 0) {
    // No header for the links: pick the column where most cells are links (by text or hidden hyperlink).
    let bestCol = -1, bestN = 0;
    for (let c = 0; c < width; c++) {
      const n = data.slice(1).filter((r, i) => normalizeLink(r[c] ?? "") || links[`${i + 1},${c}`]).length;
      if (n > bestN) { bestN = n; bestCol = c; }
    }
    if (bestCol < 0 && !Object.keys(links).length) return { rows: [], dupes, invalid, linkedin, error: "No url column found, and no cell holds a link." };
    idx.url = bestCol;
  }
  if (idx.name < 0) idx.name = [...Array(width).keys()].find((c) => c !== idx.url && data.slice(1).some((r) => r[c] && !normalizeLink(r[c]) && !/^\d+$/.test(r[c]))) ?? -1;
  const seen = new Set<string>();
  data.slice(1).forEach((r, i) => {
    const ri = i + 1;
    const cellLink = (c: number) => (c >= 0 ? links[`${ri},${c}`] : undefined);
    const anyLink = Object.entries(links).find(([k]) => k.startsWith(`${ri},`))?.[1];
    const url = normalizeLink(r[idx.url] ?? "") ?? normalizeLink(cellLink(idx.url) ?? "") ?? normalizeLink(cellLink(idx.name) ?? "") ?? normalizeLink(anyLink ?? "");
    if (!r.some(Boolean) && !anyLink) return;
    if (!url) { invalid++; return; }
    if (isLinkedIn(url)) { linkedin++; return; }
    const key = linkKey(url);
    if (seen.has(key)) { dupes++; return; }
    seen.add(key);
    const get = (k: (typeof LINK_COLS)[number]) => (idx[k] >= 0 && k !== "url" ? r[idx[k]] ?? "" : "");
    out.push({ url, name: get("name") || hostOf(url), type: get("type"), priority: get("priority"), access: get("access"), region: get("region"), notes: get("notes") });
  });
  return { rows: out, dupes, invalid, linkedin };
}
/** A whole file: CSV text, or every sheet of a workbook joined, duplicates across sheets removed. */
export function parseLinkFile(name: string, bytes: Uint8Array): ParsedList {
  if (/\.xlsx$/i.test(name)) {
    let sheets: Sheet[];
    try { sheets = readXlsx(bytes); } catch { return { rows: [], dupes: 0, invalid: 0, linkedin: 0, error: "That Excel file could not be opened. Save it as .xlsx or CSV and try again." }; }
    const all: ParsedList = { rows: [], dupes: 0, invalid: 0, linkedin: 0 };
    const seen = new Set<string>();
    for (const s of sheets) {
      const p = linkRows(s.rows, s.links);
      all.invalid += p.invalid; all.linkedin += p.linkedin; all.dupes += p.dupes;
      for (const r of p.rows) { const k = linkKey(r.url); if (seen.has(k)) { all.dupes++; continue; } seen.add(k); all.rows.push(r); }
    }
    if (!all.rows.length) all.error = "No links found in any sheet.";
    return all;
  }
  return linkRows(parseCsv(strFromU8(bytes)));
}

// The standing source list: the Research Resources List (12 Aug 2026), Generic and Specific Websites sheets.
// Prax offers it as a ready list on the Crawl and Sources tabs; its entities also feed the entity pass.
export const RESEARCH_RESOURCES: [string, string, string][] = [
  ["McKinsey & Company", "mckinsey.com", "Bespoke Consulting"], ["Boston Consulting Group (BCG)", "bcg.com", "Bespoke Consulting"], ["Bain & Company", "bain.com", "Bespoke Consulting"], ["Deloitte", "deloitte.com", "Bespoke Consulting"], ["PwC", "pwc.com", "Bespoke Consulting"], ["KPMG", "kpmg.com", "Bespoke Consulting"], ["Ernst & Young (EY)", "ey.com", "Bespoke Consulting"], ["Kearney", "kearney.com", "Bespoke Consulting"], ["Accenture", "accenture.com", "Bespoke Consulting"], ["Simon-Kucher", "simon-kucher.com", "Bespoke Consulting"],
  ["J.P. Morgan (Onyx)", "jpmorgan.com", "Institutional Access"], ["Citi Bank (Citi GPS/Institute)", "citi.com", "Free / Gated"], ["BlackRock", "blackrock.com", "Investment Fees"], ["Franklin Templeton (Institute)", "franklintempleton.com", "Investment Fees"], ["Deutsche Bank Research", "dbresearch.com", "Institutional Access"], ["State Street", "statestreet.com", "Institutional Access"],
  ["Circle", "circle.com", "Corporate / APIs vary"], ["Tether", "tether.to", "Corporate / APIs vary"], ["Paxos", "paxos.com", "Enterprise License"], ["Stripe / Bridge", "stripe.com", "Transaction-based"], ["Visa", "visa.com", "Enterprise / Network"], ["Mastercard", "mastercard.com", "Enterprise / Network"],
  ["DTCC", "dtcc.com", "Member Fees"], ["LSEG Digital Settlement House", "lseg.com", "Enterprise/Member"], ["Euroclear", "euroclear.com", "Member Fees"], ["Clearstream", "clearstream.com", "Member Fees"], ["SWIFT", "swift.com", "Member Fees"], ["Digital Asset / Canton Network", "digitalasset.com", "Enterprise License"],
  ["Fireblocks", "fireblocks.com", "Enterprise Sub"], ["Anchorage Digital", "anchorage.com", "Institutional Access"], ["BitGo", "bitgo.com", "Enterprise Sub"], ["Securitize", "securitize.io", "Platform/Tx Fees"], ["Ondo Finance", "ondo.finance", "Platform Fees"], ["Superstate", "superstate.co", "Platform Fees"], ["Centrifuge", "centrifuge.io", "Platform Fees"], ["Chainlink", "chain.link", "Usage-based (LINK)"],
  ["International Monetary Fund", "imf.org", "Public Entity / Free"], ["World Bank", "worldbank.org", "Public Entity / Free"], ["Bank for Intl. Settlements (BIS)", "bis.org", "Public Entity / Free"], ["Financial Stability Board (FSB)", "fsb.org", "Public Entity / Free"], ["Financial Action Task Force", "fatf-gafi.org", "Public Entity / Free"], ["U.S. Treasury", "treasury.gov", "Public Entity / Free"], ["New York Fed", "newyorkfed.org", "Public Entity / Free"], ["Richmond Fed", "richmondfed.org", "Public Entity / Free"], ["European Union (ESMA)", "esma.europa.eu", "Public Entity / Free"], ["World Economic Forum (WEF)", "weforum.org", "Free / Membership"],
  ["CB Insights", "cbinsights.com", "Enterprise Quote"], ["Emergen Research", "emergenresearch.com", "~$5450/report"], ["S&P Global Market Intelligence", "spglobal.com", "Enterprise Sub"], ["Messari", "messari.io", "~$1200/yr (Pro)"], ["Blockworks Research", "blockworksresearch.com", "~$2500/yr (Pro)"], ["Gartner", "gartner.com", "Enterprise Sub"], ["Forrester", "forrester.com", "Enterprise Sub"], ["NielsenIQ", "nielseniq.com", "Enterprise Sub"], ["Kantar", "kantar.com", "Enterprise Sub"], ["Redseer", "redseer.com", "Custom / Enterprise"], ["F6S", "f6s.com", "Freemium / Pro"], ["BeInCrypto Institutional 100", "awards.beincrypto.com", "~$3k App / Custom"],
  ["MIT Digital Currency Initiative", "dci.mit.edu", "Free / Open Source"], ["Tokenized Economies Institute", "tokenizedeconomies.org", "Free / Open Access"], ["CFA Institute", "cfainstitute.org", "Free (Arts) / Member"], ["Blockchain Research Lab", "blockchainresearchlab.org", "Free / Open Access"], ["Frontiers in Blockchain", "frontiersin.org", "Free / Open Access"], ["Stable Research / Delphi", "delphidigital.io", "~$1000+ (Pro)"], ["American Enterprise Inst. (AEI)", "aei.org", "Free / Open Access"], ["Paul Hastings", "paulhastings.com", "Hourly Retainer"], ["Cadwalader", "cadwalader.com", "Hourly Retainer"],
  ["Artemis", "https://about.artemis.ai/", ""], ["Dune", "https://dune.com/home", ""], ["Defillama", "https://defillama.com/research", ""], ["Allium", "https://www.allium.so/research-hub", ""], ["Falconx", "https://www.falconx.io/insights?category=All", ""], ["21 shares", "https://www.21shares.com/en-eu/insights", ""], ["Celent", "https://www.celent.com/en", ""],
];
export const researchResourceRows = (): LinkRow[] => RESEARCH_RESOURCES.map(([name, url, access]) => ({ url: normalizeLink(url)!, name, type: "research", priority: "", access, region: "", notes: "Research Resources List" }));

// ---------- pages: dates, gates and list pages ----------
const ymdOf = (s: string) => { const m = s.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`; const t = Date.parse(s); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null; };
/** The publication date written on the page itself: meta tags, JSON-LD datePublished, or a time element. */
export function pageDate(html: string): string | null {
  const metas = ["article:published_time", "og:published_time", "datepublished", "date", "pubdate", "publish-date", "publication_date", "dc.date", "dc.date.issued", "sailthru.date", "parsely-pub-date"];
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const k = (attr(m[0], "property") || attr(m[0], "name") || attr(m[0], "itemprop")).toLowerCase();
    if (metas.includes(k)) { const d = ymdOf(attr(m[0], "content")); if (d) return d; }
  }
  const ld = html.match(/"datePublished"\s*:\s*"([^"]+)"/);
  if (ld) { const d = ymdOf(ld[1]); if (d) return d; }
  const time = html.match(/<time\b[^>]*datetime="([^"]+)"/i);
  if (time) { const d = ymdOf(time[1]); if (d) return d; }
  return null;
}
/** A date in the link itself (/2026/11/05/), a hint only: it never counts as confirmed. */
export function urlDate(url: string): string | null {
  const m = url.match(/\/(20\d{2})[/-](\d{1,2})[/-](\d{1,2})(?:\/|-|$)/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
}
export type Gate = "gated" | "blocked" | null;
/** Blocked: the site refused (403, 429, a bot challenge). Gated: it wants a login or a subscription. */
export function gateOf(status: number, html: string): Gate {
  const h = html.slice(0, 200000).toLowerCase();
  if (status === 401 || status === 402) return "gated";
  if (status === 429 || status === 451 || /cf-chl|just a moment\.\.\.|attention required|captcha|access denied|are you a robot/.test(h)) return "blocked";
  if (status === 403) return /sign in|log in|subscribe/.test(h) ? "gated" : "blocked";
  if (status >= 400) return "blocked";
  const words = h.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  if (/subscribe to (continue|read)|sign in to (continue|read)|log in to (continue|read)|members only|this content is for subscribers|paywall|create a free account to/.test(h) && words < 1500) return "gated";
  return null;
}
const NAV = /\/(tag|tags|category|categories|author|authors|page|search|login|signin|sign-in|register|subscribe|about|about-us|contact|privacy|terms|careers|jobs|events?|cookie|cookies|sitemap|feed|rss|account|cart)(\/|$)/i;
export type ListLink = { url: string; title: string; date: string | null };
/** Links on the same site that look like articles: a slug of several words or a date, with a real headline. */
export function articleLinks(html: string, base: string): ListLink[] {
  const host = hostOf(base), out: ListLink[] = [], seen = new Set<string>([linkKey(base)]);
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attr(m[1], "href");
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    let u: URL; try { u = new URL(href, base); } catch { continue; }
    if (hostOf(u.toString()) !== host || NAV.test(u.pathname)) continue;
    u.hash = "";
    const segs = u.pathname.split("/").filter(Boolean), last = segs[segs.length - 1] ?? "";
    const slugWords = last.replace(/\.(html?|aspx?|php)$/, "").split(/[-_]/).filter((w) => /[a-z]/i.test(w)).length;
    const title = xmlText(m[2]).replace(/\s+/g, " ").trim();
    const dated = urlDate(u.toString());
    if (!(slugWords >= 3 || dated || (segs.length >= 2 && /^\d{4,}$/.test(last))) || title.length < 25) continue;
    const key = linkKey(u.toString());
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url: u.toString(), title: title.slice(0, 300), date: dated });
  }
  return out;
}
/** A list page links to many articles and has no publication date of its own. */
export const isListPage = (html: string, base: string) => !pageDate(html) && articleLinks(html, base).length >= 4;
/** The n newest articles of a list page: dated links newest first, then the rest in page order. */
export function newestArticles(links: ListLink[], n = 5): ListLink[] {
  const dated = links.filter((l) => l.date).sort((a, b) => b.date!.localeCompare(a.date!));
  return [...dated, ...links.filter((l) => !l.date)].slice(0, n);
}
export function pageTitle(html: string) {
  const og = [...html.matchAll(/<meta\b[^>]*>/gi)].find((m) => attr(m[0], "property").toLowerCase() === "og:title");
  return xmlText(og ? attr(og[0], "content") : html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
}
export function pagePublisher(html: string, url: string) {
  const og = [...html.matchAll(/<meta\b[^>]*>/gi)].find((m) => attr(m[0], "property").toLowerCase() === "og:site_name");
  return (og ? xmlText(attr(og[0], "content")).trim() : "") || hostOf(url);
}

// ---------- settings ----------
export type Settings = {
  weights: number[]; bands: Bands; priority: number[]; penalties: { posted: number; crowded: number };
  geo: string[]; excluded: string[]; run_day: string; batch: number; window_days: number;
  packs: { pillar: boolean; entity: boolean; event: boolean; gap: boolean }; queries: string[];
};
export const DEFAULT_PRIORITY = [45, 20, 10, 5, 10, 5, 5];
export const DEFAULT_PENALTIES = { posted: 15, crowded: 8 };
export const PRIORITY_FACTORS = [
  ["Fit", "The seven-measure score of its best article"],
  ["Coverage", "Separate sources and publishers, and growth in the last 3 days"],
  ["Source quality", "Regulator or primary first, then major media, then blogs"],
  ["Found both ways", "Found by AI search and by Crawl"],
  ["Gap", "Matches an AI citations gap"],
  ["Warm", "Names people or firms Shashi knows, from Network"],
  ["Timing", "A deadline is near: consultation, event or tender"],
] as const;
export const DEFAULT_SETTINGS: Settings = {
  weights: DEFAULT_WEIGHTS, bands: DEFAULT_BANDS, priority: DEFAULT_PRIORITY, penalties: DEFAULT_PENALTIES,
  geo: GEOS, excluded: [], run_day: "Monday", batch: 15, window_days: 7,
  packs: { pillar: true, entity: true, event: true, gap: true }, queries: [],
};
export function mergeSettings(s?: Partial<Settings> | null): Settings {
  const d = DEFAULT_SETTINGS, x = s ?? {};
  return {
    weights: Array.isArray(x.weights) && weightsOk(x.weights) ? x.weights : d.weights,
    bands: { ...d.bands, ...(x.bands ?? {}) }, priority: Array.isArray(x.priority) && weightsOk(x.priority) ? x.priority : d.priority,
    penalties: { ...d.penalties, ...(x.penalties ?? {}) }, geo: x.geo?.length ? x.geo : d.geo, excluded: x.excluded ?? d.excluded,
    run_day: x.run_day || d.run_day, batch: Math.max(5, Math.min(30, Number(x.batch) || d.batch)), window_days: x.window_days === 3 ? 3 : 7,
    packs: { ...d.packs, ...(x.packs ?? {}) }, queries: x.queries ?? d.queries,
  };
}
export const isExcluded = (text: string, excluded: string[]) => { const t = text.toLowerCase(); return excluded.some((x) => x.trim() && t.includes(x.trim().toLowerCase())); };

// ---------- the AI search plan (passes 1 to 3, plus gaps and the user's own) ----------
export type Pack = "pillar" | "entity" | "event" | "gap" | "custom";
export const PACK_LABEL: Record<Pack, string> = { pillar: "By pillar", entity: "By company or person", event: "By event word", gap: "AI citations gap", custom: "Your search" };
export const PILLAR_QUERIES: Record<string, string> = {
  "Money That Moves Itself": "stablecoin settlement, tokenised deposits and remittance news for banks in the UAE, Saudi Arabia and India",
  "The Liquid Balance Sheet": "tokenised funds, private credit and real-world assets at banks and asset managers in the GCC and India",
  "Regulation-to-Architecture": "VARA, CBUAE, SAMA, RBI and SEBI consultations, circulars and rules on digital assets and payments",
  "Production-Grade or Nothing": "custody, key management, audits and incidents at digital asset providers serving banks",
  "Agentic Finance": "AI agent payments, payment mandates and agentic commerce pilots at banks and card networks",
  "Build, Buy or Partner": "banks choosing blockchain and digital asset vendors: partnerships, selections and acquisitions in the GCC and India",
};
export type PlannedSearch = { id: string; pack: Pack; query: string };
/** Week number since 5 Jan 2026, so the entity batch moves on each week. */
export const weekIndex = (todayYmd: string) => Math.max(0, Math.floor(days("2026-01-05", todayYmd) / 7));
/** A batch of the entity list, rotated weekly so every name is searched in turn. */
export function rotateBatch<T>(list: T[], batch: number, week: number): T[] {
  if (!list.length) return [];
  const n = Math.min(batch, list.length), start = (week * n) % list.length;
  return Array.from({ length: n }, (_, i) => list[(start + i) % list.length]);
}
export function searchPlan(o: { packs: Settings["packs"]; entities: string[]; batch: number; todayYmd: string; gaps: string[]; queries: string[] }): PlannedSearch[] {
  const out: PlannedSearch[] = [];
  if (o.packs.pillar) Object.entries(PILLAR_QUERIES).forEach(([p, q], i) => out.push({ id: `p${i}`, pack: "pillar", query: q || p }));
  if (o.packs.entity) rotateBatch([...new Set(o.entities.filter(Boolean))], o.batch, weekIndex(o.todayYmd)).forEach((e, i) => out.push({ id: `e${i}`, pack: "entity", query: `${e}: latest announcements on digital assets, stablecoins, tokenisation or payments` }));
  if (o.packs.event) EVENT_WORDS.forEach((w, i) => out.push({ id: `v${i}`, pack: "event", query: `${w} stablecoin, tokenisation or digital asset project by a bank or regulator in the GCC or India` }));
  if (o.packs.gap) o.gaps.forEach((g, i) => out.push({ id: `g${i}`, pack: "gap", query: g }));
  o.queries.forEach((q, i) => q.trim() && out.push({ id: `c${i}`, pack: "custom", query: q.trim() }));
  return out;
}
export function searchPrompt(query: string, windowDays: number, todayYmd: string) {
  const since = new Date(Date.parse(todayYmd + "T12:00:00Z") - windowDays * 864e5).toISOString().slice(0, 10);
  return `Search the web for news and documents published since ${since} (the last ${windowDays === 3 ? "72 hours" : "7 days"}) on: ${query}.
Prefer regulators, primary sources and major business media. Banks, fintechs, payment firms, asset managers and regulators in the GCC and India come first.
List only pages you opened and cite. For each give the exact page URL, its title, the publisher, the publication date as written on the page (YYYY-MM-DD, or "" if not shown), one sentence on what happened, and the organisations named.
Return only JSON: {"items": [{"url": "...", "title": "...", "publisher": "...", "date": "YYYY-MM-DD", "summary": "...", "organisations": ["..."]}]}`;
}
export type FoundItem = { url: string; title: string; publisher: string; date: string; summary: string; orgs: string[] };
type CitedSource = { url: string; title: string; cited: boolean };
/** Keep only items the AI actually cited; with no JSON in the reply, the cited sources themselves. */
export function parseSearchItems(answer: string, sources: CitedSource[]): { returned: number; items: FoundItem[] } {
  const cited = sources.filter((s) => s.cited && normalizeLink(s.url));
  const keys = new Map(cited.map((s) => [linkKey(normalizeLink(s.url)!), s]));
  let raw: Record<string, unknown>[] = [];
  const m = answer.match(/\{[\s\S]*\}/);
  try { const j = JSON.parse(m ? m[0] : answer); if (Array.isArray(j.items)) raw = j.items; } catch { /* no JSON */ }
  const seen = new Set<string>();
  const items: FoundItem[] = [];
  for (const x of raw) {
    const url = normalizeLink(String(x.url ?? ""));
    if (!url || isLinkedIn(url)) continue;
    const k = linkKey(url);
    if (!keys.has(k) || seen.has(k)) continue;
    seen.add(k);
    items.push({ url, title: String(x.title ?? "").trim() || keys.get(k)!.title, publisher: String(x.publisher ?? "").trim() || hostOf(url), date: /^\d{4}-\d{2}-\d{2}$/.test(String(x.date ?? "")) ? String(x.date) : "", summary: String(x.summary ?? "").trim(), orgs: Array.isArray(x.organisations) ? (x.organisations as unknown[]).map(String).filter(Boolean).slice(0, 8) : [] });
  }
  if (!raw.length) for (const s of cited) { const url = normalizeLink(s.url)!, k = linkKey(url); if (seen.has(k) || isLinkedIn(url)) continue; seen.add(k); items.push({ url, title: s.title || hostOf(url), publisher: hostOf(url), date: "", summary: "", orgs: [] }); }
  return { returned: raw.length || cited.length, items };
}

// ---------- the AI check of scores ----------
export type AiScore = { scores: number[]; pillar: string; geo: string; service: string; kind: string; why: string; angle: string; orgs: string[] };
export function scorePrompt(items: { id: string; title: string; publisher: string; date: string; excerpt: string }[], pillars: string[]) {
  return `Score each item for Shashi Pal, Co-Founder and COO of Antier, which builds stablecoin, tokenisation, payments and custody infrastructure for banks and fintechs in the GCC and India.
Score 0 to 5 on: buyer (a bank, fintech, PSP or asset manager now faces a decision), pillar (fits one of: ${pillars.join("; ")}), geo (MENA or India 5, other emerging markets 3, US and EU with a regional implication 2), service (matches an Antier service: ${SERVICES.join(", ")}), freshness (72 hours 5, 7 days 4), evidence (primary or two independent sources 5, a press release alone 2), angle (a COO can speak from operations).
Challenge each one: an old story resurfacing, a vendor claim or a single weak source scores low.
For each give the pillar, geo (${GEOS.join(", ")}), service, kind (Fact, Analysis, Signal or Speculation), why it matters to his buyers in one sentence, a suggested angle in one line, and the organisations named. No dashes, no contractions.
ITEMS:
${items.map((x) => `[${x.id}] ${x.title} · ${x.publisher} · ${x.date || "date unknown"}\n${x.excerpt.slice(0, 600)}`).join("\n\n")}
Return only JSON: {"scores": [{"id": "...", "buyer": 4, "pillar_fit": 4, "geo": 5, "service": 4, "freshness": 5, "evidence": 4, "angle_fit": 3, "pillar": "...", "geo_name": "...", "service_name": "...", "kind": "Fact", "why": "...", "angle": "...", "organisations": ["..."]}]}`;
}
export function parseScores(j: unknown): Record<string, AiScore> {
  const list = ((j ?? {}) as { scores?: unknown }).scores;
  const out: Record<string, AiScore> = {};
  if (!Array.isArray(list)) return out;
  const n = (v: unknown) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.max(0, Math.min(5, x)) : 0; };
  for (const x of list as Record<string, unknown>[]) {
    const id = String(x.id ?? ""); if (!id) continue;
    out[id] = {
      scores: [n(x.buyer), n(x.pillar_fit), n(x.geo), n(x.service), n(x.freshness), n(x.evidence), n(x.angle_fit)],
      pillar: String(x.pillar ?? ""), geo: GEOS.includes(String(x.geo_name)) ? String(x.geo_name) : "", service: SERVICES.includes(String(x.service_name)) ? String(x.service_name) : "",
      kind: ["Fact", "Analysis", "Signal", "Speculation"].includes(String(x.kind)) ? String(x.kind) : "", why: String(x.why ?? "").trim(), angle: String(x.angle ?? "").trim(),
      orgs: Array.isArray(x.organisations) ? (x.organisations as unknown[]).map(String).filter(Boolean).slice(0, 8) : [],
    };
  }
  return out;
}

// ---------- topics: articles about the same story merged into one ----------
const STOP = new Set("the a an and or of for to in on at by with from as is are was were be its it this that new says said over into after about amid how why what who will can could may more than first one two three bank banks".split(" "));
const stem = (w: string) => w.replace(/(isation|ization)$/, "is").replace(/(ised|ized|ising|izing)$/, "is").replace(/(ing|ed|es|s)$/, "");
export function tokens(text: string) { return new Set(text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w)).map(stem)); }
const jaccard = (a: Set<string>, b: Set<string>) => { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); };
export type Mergeable = { id: string; title: string; orgs: string[]; published: string | null; total: number };
/** Same story: shared title words, shared organisations, and the same event within 5 days. 0 to 1. */
export function sameStory(a: Mergeable, b: Mergeable) {
  const ta = tokens(a.title), tb = tokens(b.title);
  const orgs = new Set(a.orgs.map((o) => o.toLowerCase().trim()));
  const sharedOrg = b.orgs.some((o) => orgs.has(o.toLowerCase().trim()));
  const ev = (t: Set<string>) => EVENT_WORDS.map((w) => stem(w.split(" ")[0])).filter((w) => t.has(w));
  const sharedEvent = ev(ta).some((w) => ev(tb).includes(w));
  const near = !a.published || !b.published || Math.abs(days(a.published, b.published)) <= 5;
  return Math.min(1, jaccard(ta, tb) * 0.7 + (sharedOrg ? 0.15 : 0) + (sharedEvent && near ? 0.1 : 0) - (near ? 0 : 0.2));
}
export const MERGE_AT = 0.45, POSSIBLE_AT = 0.3;
export type Cluster = { lead: string; ids: string[]; possibleWith?: string };
/**
 * Greedy clustering, best articles first: an article joins the topic it matches most at MERGE_AT or above.
 * Topic pairs between POSSIBLE_AT and MERGE_AT come back as possible merges, the smaller into the larger.
 */
export function clusterStories<T extends Mergeable>(items: T[], kept: Set<string> = new Set()): Cluster[] {
  const sorted = [...items].sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));
  const byId = new Map(items.map((x) => [x.id, x]));
  const clusters: Cluster[] = [];
  for (const it of sorted) {
    let bestC: Cluster | null = null, bestS = 0;
    for (const c of clusters) { const s = Math.max(...c.ids.map((id) => sameStory(byId.get(id)!, it))); if (s > bestS) { bestS = s; bestC = c; } }
    if (bestC && bestS >= MERGE_AT) bestC.ids.push(it.id); else clusters.push({ lead: it.id, ids: [it.id] });
  }
  for (let i = 0; i < clusters.length; i++) for (let j = 0; j < i; j++) {
    const a = clusters[j], b = clusters[i];
    if (b.possibleWith || kept.has(b.lead)) continue;
    const s = Math.max(...a.ids.flatMap((x) => b.ids.map((y) => sameStory(byId.get(x)!, byId.get(y)!))));
    if (s >= POSSIBLE_AT && s < MERGE_AT) b.possibleWith = a.lead;
  }
  return clusters;
}

// ---------- topic priority (Q85) ----------
export type TopicFacts = { ai: number; crawl: number; li: number; pubs: number; grow: number; quality: number; fit: number; gap: boolean; warm: number; due: number | null; posted: boolean; crowded: boolean };
export const sourcesOf = (t: Pick<TopicFacts, "ai" | "crawl" | "li">) => t.ai + t.crawl + t.li;
/** Each factor 0 to 1, in the order of PRIORITY_FACTORS. */
export function priorityParts(t: TopicFacts): number[] {
  const n = sourcesOf(t);
  return [
    Math.max(0, Math.min(1, t.fit / 100)),
    Math.min(1, (Math.log(1 + n) / Math.log(26)) * 0.7 + Math.min(1, t.grow / 10) * 0.3),
    Math.max(0, Math.min(1, t.quality / 5)),
    t.ai > 0 && t.crawl > 0 ? 1 : 0,
    t.gap ? 1 : 0,
    Math.min(1, t.warm / 3),
    t.due == null ? 0 : t.due <= 14 ? 1 : t.due <= 21 ? 0.6 : 0.3,
  ];
}
export function priorityMinus(t: Pick<TopicFacts, "posted" | "crowded">, pen = DEFAULT_PENALTIES): [string, number][] {
  const out: [string, number][] = [];
  if (t.posted) out.push(["Shashi posted on it recently", -pen.posted]);
  if (t.crowded) out.push(["Crowded: peers already posted", -pen.crowded]);
  return out;
}
export function priority(t: TopicFacts, w = DEFAULT_PRIORITY, pen = DEFAULT_PENALTIES) {
  const base = priorityParts(t).reduce((a, v, i) => a + v * (w[i] ?? 0), 0);
  return Math.max(0, Math.min(100, Math.round(base + priorityMinus(t, pen).reduce((a, x) => a + x[1], 0))));
}
/** Crowded: many LinkedIn voices or more than 15 publishers on it already. The topic stays, marked for a new angle. */
export const crowdedOf = (t: Pick<TopicFacts, "li" | "pubs">) => t.li >= 3 || t.pubs >= 15;
/** Rising: small (8 sources or fewer) but most of its sources arrived in the last 3 days. */
export const risingOf = (t: Pick<TopicFacts, "ai" | "crawl" | "li" | "grow">) => t.grow >= 2 && sourcesOf(t) <= 8 && t.grow / Math.max(1, sourcesOf(t)) >= 0.6;
/** Posted recently: one of his posts in the last 14 days shares most of the topic's words. */
export function postedRecently(title: string, posts: { title: string; status: string; publish_date: string | null }[], todayYmd: string) {
  const t = tokens(title);
  return posts.some((p) => (p.status === "Posted" || p.status === "Published") && p.publish_date && days(p.publish_date, todayYmd) <= 14 && days(p.publish_date, todayYmd) >= 0 && jaccard(t, tokens(p.title)) >= 0.35);
}
/** The campaign whose name, topic or keywords share the most words with the topic, if any shares two or more. */
export function matchCampaign<C extends { id: string; name: string; topic?: string; keywords?: string[] }>(title: string, campaigns: C[]): C | null {
  const t = tokens(title);
  let bestC: C | null = null, bestN = 1;
  for (const c of campaigns) { const k = tokens(`${c.name} ${c.topic ?? ""} ${(c.keywords ?? []).join(" ")}`); let n = 0; for (const x of t) if (k.has(x)) n++; if (n > bestN) { bestN = n; bestC = c; } }
  return bestC;
}

// ---------- the Digest selection (Q88, Q90) ----------
export type Ranked<T> = T & { score: number };
/** Top 3 and #4 to #10 by priority (ties go to more sources, then the title); Rising comes from the rest. */
export function selectDigest<T extends TopicFacts & { title: string }>(topics: T[], w = DEFAULT_PRIORITY, pen = DEFAULT_PENALTIES) {
  const ranked = topics.map((t) => ({ ...t, score: priority(t, w, pen) })).sort((a, b) => b.score - a.score || sourcesOf(b) - sourcesOf(a) || a.title.localeCompare(b.title));
  const after = ranked.slice(10);
  return { top: ranked.slice(0, 3), list: ranked.slice(3, 10), rising: after.filter(risingOf).sort((a, b) => b.grow - a.grow).slice(0, 4), rest: after.filter((t) => !risingOf(t)) };
}
/** Which Antier services draw the most topics in the top 10. */
export function servicesLine(top: { service: string }[]) {
  const c = new Map<string, number>();
  for (const t of top) if (t.service) c.set(t.service, (c.get(t.service) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, n]) => `${k} ${n}`).join(" · ") || "None";
}

// ---------- replies and sales notes ----------
export function replyDraft(o: { service: string; title: string; ask: string }) {
  return `Hello,\n\nShashi Pal here, Co-Founder and COO of Antier. We build ${o.service ? o.service.toLowerCase() : "digital asset infrastructure"} for banks in the GCC and India, so this is close to what we do every day.\n\nOn your question${o.ask ? ` ("${o.ask.slice(0, 160)}")` : ""}: what breaks first in a bank pilot is rarely the chain; it is reconciliation and reporting. I am happy to explain what we have seen in production.\n\nHappy to talk this week.\n\nShashi`;
}

// ---------- findings to Digest topics ----------
export type Finding = {
  id: string; url: string; title: string; publisher: string; source_type: string; published: string | null; confirmed: boolean; excerpt: string;
  found_by: string[]; found: { ai?: { engine?: string; pack?: string; query?: string }; crawl?: { list?: string; link?: string; name?: string }; linkedin?: { author?: string } };
  scores: number[]; scored_by: string; pillar: string; geo: string; service: string; kind: string; why: string; angle: string; orgs: string[];
  target: boolean; competitor: string; opp: { kind?: string; due?: number | null; ask?: string }; gap: boolean; status: string; dismiss_reason: string;
  comment_target: boolean; post_id: string | null; found_at: string; run_id: string | null;
};
export type TopicSource = { via: "AI" | "Crawl" | "LinkedIn"; pub: string; url: string };
export type Topic = TopicFacts & {
  key: string; title: string; ids: string[]; pillar: string; service: string; angle: string; why: string; move: "Post" | "Comment" | "Watch";
  competitor: string; sources: TopicSource[]; possibleWith?: string;
};
export type DigestCtx = { weights: number[]; bands: Bands; today: string; warm: (orgs: string[]) => number; posts: { title: string; status: string; publish_date: string | null }[] };
const viaOf = (f: Finding): TopicSource["via"] => (f.found_by.includes("ai") ? "AI" : f.found_by.includes("crawl") ? "Crawl" : "LinkedIn");
export function buildTopic(members: Finding[], c: DigestCtx): Topic {
  const ms = [...members].sort((a, b) => totalScore(b.scores, c.weights) - totalScore(a.scores, c.weights));
  const lead = ms[0];
  const n = (r: string) => ms.filter((m) => m.found_by.includes(r)).length;
  const pubs = new Set(ms.map((m) => (m.publisher || hostOf(m.url)).toLowerCase())).size;
  const grow = ms.filter((m) => daysBetween(m.found_at.slice(0, 10), c.today) <= 3).length;
  const dues = ms.map((m) => (m.opp?.kind !== "sales" ? m.opp?.due : null)).filter((d): d is number => typeof d === "number");
  const band = bandOf(lead, c.weights, c.bands);
  const facts: TopicFacts = {
    ai: n("ai"), crawl: n("crawl"), li: n("linkedin"), pubs, grow, quality: Math.max(...ms.map((m) => QUALITY[m.source_type] ?? 3)),
    fit: totalScore(lead.scores, c.weights), gap: ms.some((m) => m.gap), warm: c.warm([...new Set(ms.flatMap((m) => m.orgs))]),
    due: dues.length ? Math.min(...dues) : null, posted: postedRecently(lead.title, c.posts, c.today), crowded: false,
  };
  facts.crowded = crowdedOf(facts);
  return {
    ...facts, key: lead.url, title: lead.title, ids: ms.map((m) => m.id), pillar: lead.pillar, service: lead.service || ms.find((m) => m.service)?.service || "",
    angle: lead.angle, why: lead.why, move: band === "Post-worthy" ? "Post" : band === "Comment-worthy" ? "Comment" : "Watch",
    competitor: ms.find((m) => m.competitor)?.competitor ?? "", sources: ms.map((m) => ({ via: viaOf(m), pub: m.publisher || hostOf(m.url), url: m.url })),
  };
}
/** This week's findings (not dismissed, not dropped, not tenders or press requests) merged into topics. Kept: lead URLs the user kept separate. */
export function buildTopics(findings: Finding[], c: DigestCtx, kept: Set<string> = new Set(), excluded: string[] = []): Topic[] {
  const live = findings.filter((f) => f.status !== "dismissed" && f.opp?.kind !== "sales" && f.opp?.kind !== "press" && bandOf(f, c.weights, c.bands) !== "Dropped" && daysBetween(f.found_at.slice(0, 10), c.today) <= 7 && !isExcluded(`${f.title} ${f.excerpt}`, excluded));
  const byId = new Map(live.map((f) => [f.id, f]));
  const keptIds = new Set(live.filter((f) => kept.has(f.url)).map((f) => f.id));
  const clusters = clusterStories(live.map((f) => ({ id: f.id, title: f.title, orgs: f.orgs, published: f.published, total: totalScore(f.scores, c.weights) })), keptIds);
  return clusters.map((cl) => ({ ...buildTopic(cl.ids.map((id) => byId.get(id)!), c), possibleWith: cl.possibleWith ? byId.get(cl.possibleWith)!.url : undefined }));
}
/** Merge decisions from the Digest (Merge on a possible pair): the topic led by `from` joins the one led by `into`. */
export function applyMerges(topics: Topic[], findings: Finding[], merges: Map<string, string>, c: DigestCtx): Topic[] {
  if (!merges.size) return topics;
  const byKey = new Map(topics.map((t) => [t.key, t]));
  const byId = new Map(findings.map((f) => [f.id, f]));
  const out = new Map(topics.map((t) => [t.key, t]));
  for (const [from, into] of merges) {
    const a = out.get(into) ?? byKey.get(into), b = out.get(from);
    if (!a || !b || a === b) continue;
    const merged = buildTopic([...new Set([...a.ids, ...b.ids])].map((id) => byId.get(id)!).filter(Boolean), c);
    out.delete(from); out.set(into, { ...merged, key: into, possibleWith: undefined });
  }
  return [...out.values()].map((t) => (t.possibleWith && !out.has(t.possibleWith) ? { ...t, possibleWith: undefined } : t));
}

/** Weight changes learned from what was dismissed and sent. Suggestions only: nothing changes until accepted. */
export function suggestWeights(findings: Pick<Finding, "status" | "dismiss_reason" | "geo">[], w: number[]) {
  const out: { id: string; change: string; why: string; next: number[] }[] = [];
  const move = (from: number, to: number) => { const n = [...w]; if (n[from] < 5) return null; n[from] -= 5; n[to] += 5; return n; };
  const reason = (r: string) => findings.filter((f) => f.status === "dismissed" && f.dismiss_reason === r).length;
  const weak = reason("Weak source"), old = reason("Old news");
  const sent = findings.filter((f) => f.status === "sent"), local = sent.filter((f) => f.geo === "MENA" || f.geo === "India").length;
  const add = (id: string, from: number, to: number, why: string) => { const n = move(from, to); if (n) out.push({ id, change: `${DIMENSIONS[to][0]} ${w[to]} to ${n[to]}, ${DIMENSIONS[from][0]} ${w[from]} to ${n[from]}`, why, next: n }); };
  if (weak >= 3) add("evidence", 6, 5, `You dismissed ${weak} findings for weak sources.`);
  if (old >= 3) add("fresh", 3, 4, `You dismissed ${old} findings as old news.`);
  if (sent.length >= 3 && local / sent.length >= 0.7) add("geo", 1, 2, `${local} of the ${sent.length} findings you sent were MENA or India.`);
  return out;
}

/** The Content Studio idea a topic becomes (Q91): angle and post type are decided there. */
export function topicPost(t: Pick<Topic, "key" | "title" | "pillar" | "service" | "angle" | "sources" | "move">, o: { workspace_id: string; topic_id: string; rank: number | null; score: number; campaign?: { id: string; name: string } | null }) {
  const sources = t.sources.slice(0, 8);
  return {
    workspace_id: o.workspace_id, title: t.title.slice(0, 200), format: "Text post", status: "Idea", pillar: t.pillar, topic: "Discovery Studio", channel: "shashi",
    source_kind: "discovery", source_ref: o.topic_id, angle: t.angle, campaign_id: o.campaign?.id ?? null,
    resource: sources.map((s) => `${s.pub}: ${s.url}`).join("\n"),
    discovery: { topic_id: o.topic_id, key: t.key, rank: o.rank, score: o.score, sources, service: t.service, angle: t.angle, campaign: o.campaign?.name ?? "", move: t.move },
  };
}
