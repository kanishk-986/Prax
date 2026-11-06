// Network intelligence: reads the LinkedIn data export in the browser, then segments connections,
// finds warm paths to prospects and maps the profile's own posts and comments to topics.
// Pure functions only, so the same code runs in the page and in scripts/test-network.ts.
import { unzipSync, strFromU8 } from "fflate";

// ---------- CSV ----------
/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f); out.push(row); row = []; f = "";
    } else f += c;
  }
  if (f || row.length) { row.push(f); out.push(row); }
  return out;
}

/** Rows as objects keyed by header. LinkedIn puts "Notes:" lines above some headers, so the header is found by a known column. */
export function csvObjects(text: string, mustHave: string): Record<string, string>[] {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  const h = rows.findIndex((r) => r.some((c) => c.trim().toLowerCase() === mustHave.toLowerCase()));
  if (h < 0) return [];
  const head = rows[h].map((c) => c.trim().toLowerCase());
  return rows.slice(h + 1).filter((r) => r.some((c) => c.trim())).map((r) => Object.fromEntries(head.map((k, i) => [k, (r[i] ?? "").trim()])));
}

// ---------- normalising ----------
const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");
/** LinkedIn uses "05 Nov 2026", "2026-11-05 10:22:33 UTC" and "11/5/26, 5:10 PM" in different files. Returns YYYY-MM-DD or null. */
export function toDay(s: string): string | null {
  s = (s || "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -](\d{4})/);
  if (m && MON[m[2].toLowerCase()]) return `${m[3]}-${pad(MON[m[2].toLowerCase()])}-${pad(+m[1])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return `${y}-${pad(+m[1])}-${pad(+m[2])}`; }
  const d = new Date(s);
  return isNaN(+d) ? null : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Profile URL as a stable key: no protocol, www, query or trailing slash. */
export function normUrl(u: string): string {
  let s = (u || "").trim().toLowerCase();
  try { s = decodeURIComponent(s); } catch {}
  return s.replace(/^https?:\/\//, "").replace(/^([a-z]{2,3}\.)?www\./, "").replace(/^[a-z]{2}\.linkedin/, "linkedin").replace(/[?#].*$/, "").replace(/\/+$/, "");
}

/** Same as net_norm() in db/006_network.sql, with spaces removed. Keep them identical. */
export function normCompany(c: string): string {
  return (c || "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+(inc|llc|ltd|limited|plc|pjsc|psc|corp|corporation|co|gmbh|ag|sa|bv|pte|pvt|private|group|holdings)\s*$/, "").replace(/ /g, "");
}

/** "Dr. Kenneth O’Friel, CFA" and "Kenneth O'Friel" both become "kenneth ofriel" (first and last word). */
export function normName(n: string): string {
  const w = (n || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\([^)]*\)/g, " ").replace(/,.*$/, "").replace(/['’`.]/g, "").replace(/[^a-z\s-]/g, " ").replace(/-/g, "")
    .split(/\s+/).filter((x) => x && !["dr", "mr", "mrs", "ms", "prof", "sir", "eng", "h e", "he"].includes(x));
  return w.length > 1 ? `${w[0]} ${w[w.length - 1]}` : w[0] ?? "";
}

const words = (s: string) => ` ${(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
const has = (text: string, kw: string) => { const k = words(kw).trim(); return !!k && text.includes(` ${k} `); };

// ---------- rules ----------
export type SegRule = { seg: string; companies: string[]; roles: string[] };
export type TopicRule = { name: string; words: string[] };

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

/** Checked top to bottom; the first rule that matches wins. A new profile starts with the generic role rules
 *  only: the buyer and region segments (A, B, D) stay empty until this profile's own words go in on Segments.
 *  Profiles that existed before db/016 had their old rules written into network_settings, so nothing changed for them. */
export const DEFAULT_SEGMENTS: SegRule[] = [
  { seg: "D", roles: [], companies: [] },
  { seg: "B", roles: [], companies: [] },
  { seg: "C", companies: [], roles: list("partnerships, partnership, partner manager, business development, bd, bizdev, alliances, alliance, growth, chief business officer, cbo, chief revenue officer, cro, revenue, ecosystem, channel, strategic partnerships, go to market, gtm, commercial") },
  { seg: "A", roles: [], companies: [] },
  { seg: "E", companies: list("media, news, magazine, weekly, newsletter, podcast, research, consulting, advisory"), roles: list("journalist, editor, reporter, writer, author, publisher, analyst, columnist, podcast, host, commentator, researcher, professor, lecturer, speaker, influencer, creator") },
];

/** Topic rules start as this profile's pillars (Settings) with no words yet; words are added on the Topics tab. */
export const defaultTopics = (pillars: string[]): TopicRule[] => pillars.map((name) => ({ name, words: [] }));

/** Prospect companies are added as company rules for their segment, ahead of the keyword rules. */
export function segmentFor(company: string, position: string, rules: SegRule[], prospectCompanies: Map<string, string>): string {
  const cn = normCompany(company);
  if (cn && prospectCompanies.has(cn)) return prospectCompanies.get(cn)!;
  const c = words(company), p = words(position);
  for (const r of rules) if (r.companies.some((k) => has(c, k)) || r.roles.some((k) => has(p, k))) return r.seg;
  return "";
}

export const SENIORITY = ["Founder or C-level", "VP, Head or Director", "Manager or Lead", "Other"] as const;
const S1 = list("founder, co founder, cofounder, chief, ceo, cfo, coo, cto, cio, cro, cmo, cco, ciso, cpo, cbo, president, chairman, chairwoman, chair, owner, managing partner, general partner, founding partner, partner, board member, board director, executive director");
const S2 = list("vp, svp, evp, avp, vice president, head, director, managing director, md, general manager, gm, principal, country manager");
const S3 = list("manager, lead, team lead, supervisor, senior manager");
/** 0 = Founder or C-level ... 3 = Other. */
export function seniority(position: string): number {
  const p = words(position);
  if (S1.some((k) => has(p, k))) return 0;
  if (S2.some((k) => has(p, k))) return 1;
  if (S3.some((k) => has(p, k))) return 2;
  return 3;
}

export function topicsFor(text: string, rules: TopicRule[]): string[] {
  const t = words(text);
  return rules.filter((r) => r.words.some((k) => has(t, k))).map((r) => r.name);
}

// ---------- reading the export ----------
export type PersonRow = {
  key: string; url: string; name: string; company: string; position: string; is_connection: boolean; connected_on: string | null;
  msg_count: number; msg_last: string | null; msg_last_from: string; invite: string; invite_at: string | null;
};
export type PostRow = { kind: "post" | "comment"; key: string; day: string | null; url: string; text: string };
export type ParsedExport = { people: PersonRow[]; posts: PostRow[]; files: string[]; missing: string[]; exportDate: string; counts: Record<string, number> };

const keyOf = (url: string, name: string) => (url ? normUrl(url) : `name:${normName(name)}`);
const WANTED = ["connections.csv", "messages.csv", "invitations.csv", "shares.csv", "comments.csv"];

/** Opens the zip in memory. Only the five files Prax uses are decompressed; everything else is skipped.
 *  The page passes decodeText (lib/text) so a byte order mark, UTF-16 or an old Excel save never turns names into mojibake. */
export function readExport(zip: Uint8Array, fileName = "", todayYmd = "", decode: (b: Uint8Array) => string = strFromU8): ParsedExport {
  const all = unzipSync(zip, { filter: (f) => WANTED.includes(f.name.split("/").pop()!.toLowerCase()) });
  const byName: Record<string, string> = {};
  for (const [path, data] of Object.entries(all)) byName[path.split("/").pop()!.toLowerCase()] = decode(data);
  return parseExportFiles(byName, fileName, todayYmd);
}

export function parseExportFiles(byName: Record<string, string>, fileName = "", todayYmd = ""): ParsedExport {
  const people = new Map<string, PersonRow>();
  const get = (url: string, name: string): PersonRow => {
    const key = keyOf(url, name);
    let p = people.get(key);
    if (!p) { p = { key, url: url ? `https://www.${normUrl(url)}` : "", name, company: "", position: "", is_connection: false, connected_on: null, msg_count: 0, msg_last: null, msg_last_from: "", invite: "", invite_at: null }; people.set(key, p); }
    if (!p.name && name) p.name = name;
    return p;
  };

  // Connections
  for (const r of byName["connections.csv"] ? csvObjects(byName["connections.csv"], "first name") : []) {
    const name = `${r["first name"] ?? ""} ${r["last name"] ?? ""}`.trim();
    if (!name && !r.url) continue;
    const p = get(r.url ?? "", name);
    p.is_connection = true; p.company = r.company ?? ""; p.position = r.position ?? ""; p.connected_on = toDay(r["connected on"] ?? "");
  }

  // Messages: counts and dates per person. The owner of the export is the one person in every conversation.
  const msgs = byName["messages.csv"] ? csvObjects(byName["messages.csv"], "conversation id") : [];
  const convs = new Map<string, Set<string>>();
  for (const m of msgs) {
    const id = m["conversation id"];
    const s = convs.get(id) ?? new Set<string>();
    [m["sender profile url"], ...(m["recipient profile urls"] ?? "").split(/[,;]\s*/)].filter(Boolean).forEach((u) => s.add(normUrl(u)));
    convs.set(id, s);
  }
  const seen = new Map<string, number>();
  convs.forEach((s) => s.forEach((u) => seen.set(u, (seen.get(u) ?? 0) + 1)));
  const me = [...seen.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  // Only one-to-one threads count as a relationship; group threads and sponsored InMail do not.
  const ordered = [...msgs].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const m of ordered) {
    const s = convs.get(m["conversation id"]);
    if (!s || s.size !== 2 || (m.folder ?? "").toLowerCase().includes("spam") || (m.folder ?? "").toLowerCase().includes("sponsored")) continue;
    const other = [...s].find((u) => u !== me);
    if (!other) continue;
    const fromMe = normUrl(m["sender profile url"] ?? "") === me;
    const otherName = fromMe ? (m.to ?? "") : (m.from ?? "");
    const p = get(`https://www.${other}`, otherName);
    p.msg_count++;
    const d = toDay(m.date ?? "");
    if (d && (!p.msg_last || d >= p.msg_last)) { p.msg_last = d; p.msg_last_from = fromMe ? "us" : "them"; }
  }

  // Pending invitations, both directions.
  for (const r of byName["invitations.csv"] ? csvObjects(byName["invitations.csv"], "direction") : []) {
    const out = (r.direction ?? "").toUpperCase().startsWith("OUT");
    const url = out ? r.inviteeprofileurl : r.inviterprofileurl;
    const p = get(url ?? "", (out ? r.to : r.from) ?? "");
    p.invite = out ? "sent" : "received"; p.invite_at = toDay(r["sent at"] ?? "");
  }

  // Own posts and comments, kept for topics.
  const posts: PostRow[] = [];
  for (const r of byName["shares.csv"] ? csvObjects(byName["shares.csv"], "sharecommentary") : []) {
    const text = (r.sharecommentary ?? "").replace(/""/g, '"').trim();
    if (!text) continue;
    const day = toDay(r.date ?? "");
    posts.push({ kind: "post", key: r.sharelink || `${day}:${text.slice(0, 60)}`, day, url: r.sharelink ?? "", text });
  }
  for (const r of byName["comments.csv"] ? csvObjects(byName["comments.csv"], "message") : []) {
    const text = (r.message ?? "").trim();
    if (!text) continue;
    const day = toDay(r.date ?? "");
    posts.push({ kind: "comment", key: `${r.link ?? ""}|${day}|${text.slice(0, 40)}`, day, url: r.link ?? "", text });
  }

  people.delete(me);
  const list = [...people.values()].filter((p) => p.key && p.key !== "name:");
  const fromName = fileName.match(/(\d{2})-(\d{2})-(\d{4})/);
  const exportDate = fromName ? `${fromName[3]}-${fromName[1]}-${fromName[2]}` : todayYmd;
  return {
    people: list, posts, exportDate,
    files: WANTED.filter((f) => byName[f] != null),
    missing: WANTED.filter((f) => byName[f] == null),
    counts: { connections: list.filter((p) => p.is_connection).length, messaged: list.filter((p) => p.msg_count).length, invites: list.filter((p) => p.invite).length, posts: posts.filter((p) => p.kind === "post").length, comments: posts.filter((p) => p.kind === "comment").length },
  };
}

// ---------- warm paths ----------
export type Person = PersonRow & { segment_manual: string; prospect_id: string | null; not_prospects: string[]; first_export: string | null; last_export: string | null; company_norm_?: string };
export type ProspectLite = { id: string; name: string; company: string; role: string; stage: string; segment: string; linkedin: string };
export type CommentLite = { author: string; reply: boolean; day: string };
export type Warm = {
  linked?: Person;            // confirmed (or matched by profile URL)
  suggest: { person: Person; strong: boolean }[];
  msgs?: { count: number; last: string | null; from: string };
  comments: { count: number; replies: number; last: string };
  colleagues: Person[];       // connections at the same company, most senior and most recent first
  level: 0 | 1 | 2 | 3;       // 1 = connection, 2 = talked, 3 = colleague, 0 = none
};

export function warmPaths(p: ProspectLite, people: Person[], idx: { byKey: Map<string, Person>; byName: Map<string, Person[]>; byCompany: Map<string, Person[]>; byProspect: Map<string, Person> }, comments: CommentLite[]): Warm {
  const linked = idx.byProspect.get(p.id) ?? (p.linkedin ? idx.byKey.get(normUrl(p.linkedin)) : undefined);
  const cn = normCompany(p.company);
  const suggest = linked ? [] : (idx.byName.get(normName(p.name)) ?? [])
    .filter((x) => !x.not_prospects?.includes(p.id) && !x.prospect_id)
    .map((x) => ({ person: x, strong: !!cn && x.company_norm_ === cn }))
    .sort((a, b) => Number(b.strong) - Number(a.strong));
  const nn = normName(p.name);
  const mine = comments.filter((c) => normName(c.author) === nn);
  const colleagues = (cn ? idx.byCompany.get(cn) ?? [] : []).filter((x) => x.is_connection && x.key !== linked?.key && normName(x.name) !== nn)
    .sort((a, b) => seniority(a.position) - seniority(b.position) || ((b.connected_on ?? "") < (a.connected_on ?? "") ? -1 : 1));
  const msgs = linked && linked.msg_count ? { count: linked.msg_count, last: linked.msg_last, from: linked.msg_last_from } : undefined;
  const talked = !!msgs || mine.some((c) => c.reply);
  const level = linked?.is_connection ? 1 : talked ? 2 : colleagues.length ? 3 : 0;
  return { linked, suggest, msgs, comments: { count: mine.length, replies: mine.filter((c) => c.reply).length, last: mine.map((c) => c.day).sort().pop() ?? "" }, colleagues, level };
}

export function indexPeople(people: Person[]) {
  const byKey = new Map<string, Person>(), byName = new Map<string, Person[]>(), byCompany = new Map<string, Person[]>(), byProspect = new Map<string, Person>();
  const add = (m: Map<string, Person[]>, k: string, x: Person) => { const a = m.get(k); if (a) a.push(x); else m.set(k, [x]); };
  for (const x of people) {
    x.company_norm_ = normCompany(x.company);
    byKey.set(x.key, x);
    const n = normName(x.name);
    if (n) add(byName, n, x);
    if (x.company_norm_) add(byCompany, x.company_norm_, x);
    if (x.prospect_id) byProspect.set(x.prospect_id, x);
  }
  return { byKey, byName, byCompany, byProspect };
}
