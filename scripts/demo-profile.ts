// The demo profile (Q120): a fictional COO, Layla Haddad of Northgate Payments, with about four weeks of history in
// every section, for showing Prax to prospects instead of a real executive's data.
// This file is the source of db/019_demo_profile.sql. Every row is built here; every date is written relative to
// now() or current_date, so the demo always looks current whenever the SQL is run.
// Regenerate the SQL after a change: node scripts/demo-profile.ts
// Checked by node scripts/test-demo.ts (same rows, evaluated at several dates, plus the app's own maths).
// People, firms and sites are invented. Every link uses an example.com host.
import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseProfile, auditProfile } from "../src/lib/profile.ts";
import { promptFor, type Engine } from "../src/lib/citations.ts";
import { buildTopics, selectDigest, topicPost, DEFAULT_WEIGHTS, DEFAULT_BANDS, type Finding } from "../src/lib/discovery.ts";
import { normCompany } from "../src/lib/network.ts";

// ---------- values: time, owner, jsonb ----------
const MS = 864e5;
export type Time = { time: "ts" | "date"; sql: string; js: (now: Date) => string };
export type Raw = { raw: string; js: string };
export type Json = { json: unknown };
export type Val = string | number | boolean | null | Time | Raw | Json | string[];
export type Row = Record<string, Val>;
export type Table = { name: string; rows: Row[]; note: string };

const ymdUTC = (d: Date) => d.toISOString().slice(0, 10);
const sgn = (n: number) => (n < 0 ? `- ${-n}` : `+ ${n}`);
/** A calendar day n days from today (current_date, the database's day). */
export const day = (n: number): Time => ({ time: "date", sql: n === 0 ? "current_date" : `current_date ${sgn(n)}`, js: (now) => ymdUTC(new Date(now.getTime() + n * MS)) });
/** A moment on day n at hh:mm. On today it never passes now(). */
export const at = (n: number, hm: string): Time => ({
  time: "ts",
  sql: n === 0 ? `least(now(), current_date + time '${hm}')` : `current_date ${sgn(n)} + time '${hm}'`,
  js: (now) => {
    const [h, m] = hm.split(":").map(Number);
    const d0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + n, h, m));
    return (n === 0 && d0 > now ? now : d0).toISOString();
  },
});
/** A moment the given minutes before now(). */
export const ago = (mins: number): Time => ({ time: "ts", sql: `now() - interval '${mins} minutes'`, js: (now) => new Date(now.getTime() - mins * 60e3).toISOString() });
/** Monday of this week (the digest week). */
export const thisMonday: Time = { time: "date", sql: "date_trunc('week', current_date)::date", js: (now) => { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return ymdUTC(d); } };
/** Whoever runs the seed (set at the top of the SQL). */
const OWNER: Raw = { raw: "pg_temp.demo_owner()", js: "00000000-0000-4000-8000-0000000000aa" };
const OWNER_EMAIL: Raw = { raw: "current_setting('prax.demo_owner_email')", js: "owner@example.com" };
const J = (json: unknown): Json => ({ json });

const isTime = (v: unknown): v is Time => !!v && typeof v === "object" && "time" in v;
const isRaw = (v: unknown): v is Raw => !!v && typeof v === "object" && "raw" in v;
const isJson = (v: unknown): v is Json => !!v && typeof v === "object" && "json" in v;

/** Rows with times, the owner and jsonb turned into plain values, as the app would read them on `now`. */
export function evaluate(rows: Row[], now: Date): Record<string, unknown>[] {
  return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, isTime(v) ? v.js(now) : isRaw(v) ? v.js : isJson(v) ? v.json : v])));
}

// ---------- ids ----------
const hex = (n: number, w: number) => n.toString(16).padStart(w, "0");
const T = { ws: 0, pipe: 1, prospect: 2, move: 3, item: 4, comment: 5, post: 6, template: 7, note: 8, netImport: 9, citProfile: 10, entity: 11, question: 12, run: 13, rec: 14, list: 15, link: 16, discRun: 17, finding: 18, topic: 19, doc: 20, thread: 21, draft: 22, reason: 23 };
export const id = (table: number, n: number) => `0de3${hex(table, 4)}-0000-4000-8000-${hex(n, 12)}`;
export const WS = id(T.ws, 1);
export const SLUG = "demo-layla-haddad";
const PIPE = id(T.pipe, 1);
const CIT = id(T.citProfile, 1);

// A small deterministic pseudo-random sequence, so the SQL is the same on every generation.
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
const pick = <X>(r: () => number, xs: X[]) => xs[Math.floor(r() * xs.length)];
const hm = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, "");
const li = (name: string) => `https://linkedin.example.com/in/${slugOf(name)}`;

// ---------- who the profile is ----------
export const PERSON = "Layla Haddad";
export const COMPANY = "Northgate Payments";
const HEADLINE = "Chief Operating Officer at Northgate Payments | Instant settlement and cross-border payments for GCC merchants and banks";
export const PILLARS = ["Instant settlement", "Cross-border corridors", "Payments operations", "Regulation in practice", "Agentic commerce"];
export const REGIONS = ["GCC", "UK"];
const SEGMENTS = { A: "Banks and PSPs", B: "GCC institutions", C: "Partnerships & growth", D: "UK and Europe", E: "Industry voices" };
export const TOPICS = ["instant payments", "settlement", "cross-border payments", "payment operations", "merchant acquiring", "open banking", "treasury", "compliance", "GCC", "stablecoins"];
export const QUOTAS = { comment: 5, request: 3, dm: 2, inmail: 1, reply: 1 };
const VOICE = `You write LinkedIn comments as Layla Haddad, Chief Operating Officer of Northgate Payments, for people who run payments at banks, payment firms and large merchants in the GCC and the UK.

Rules:
- 50 to 70 words, 3 or 4 sentences of varied length.
- Add one thing the post left out: an operational consequence, a cost, a timing issue or a control.
- Speak from running payments operations, in plain words. No pitching Northgate Payments.
- Only state facts that appear in the post. Do not invent numbers, dates or names.
- End with one specific question when it can start a conversation.
- No praise openers, no em or en dashes, no contractions.`;

// ---------- pipeline ----------
export const STAGES = ["Target", "Warming", "Requested", "Connected", "In conversation", "Resource sent", "Call booked", "Won", "Parked"];
const ACTION: Record<string, string> = {
  Target: "Comment on their next post",
  Warming: "Send a connection request with a short note",
  Requested: "Check the request; comment once more if it is still pending",
  Connected: "Send the first message on settlement timing",
  "In conversation": "Reply with the same-day settlement numbers",
  "Resource sent": "Ask what they made of the settlement guide",
  "Call booked": "Prepare the call: corridors, volumes and current acquirer",
  Won: "",
  Parked: "Check in at the start of next quarter",
};
const WHY: Record<string, string> = {
  A: "Runs payments at a PSP or bank that settles merchants in the region",
  B: "Owns settlement or treasury at a GCC institution",
  C: "Partnership lead at a firm that could refer merchants",
  D: "UK or European side of the UK to GCC corridor",
  E: "Writes about payments; a voice worth being seen next to",
};
// name, role, company, segment, region, stage
const PEOPLE: [string, string, string, string, string, string][] = [
  ["Rania Khoury", "Head of Payments", "Qasr Digital Bank", "B", "UAE", "Call booked"],
  ["Daniel Okafor", "Chief Operating Officer", "Harbourline Bank", "D", "UK", "In conversation"],
  ["Mariam Al Suwaidi", "VP Treasury Operations", "Sandgate Capital", "B", "UAE", "Resource sent"],
  ["Tom Ashworth", "Director of Merchant Services", "Meadowpay", "A", "UK", "Connected"],
  ["Hessa Al Marri", "Chief Digital Officer", "Corniche Commerce Bank", "B", "Qatar", "In conversation"],
  ["Arjun Mehta", "Head of Cross-Border Payments", "Kestrel Remit", "A", "UAE", "Won"],
  ["Lucy Brennan", "Payments Product Lead", "Larkspur Retail Group", "D", "UK", "Requested"],
  ["Faisal Al Harthy", "Chief Financial Officer", "Wadi Logistics", "B", "Oman", "Warming"],
  ["Sofia Marchetti", "Head of Partnerships", "Brightwater Insurance", "C", "EU", "Connected"],
  ["Khalid Bin Rashed", "Head of Transaction Banking", "Tamrah Bank", "B", "Saudi Arabia", "Call booked"],
  ["Emma Lindqvist", "Payments Analyst", "Northlight Research", "E", "EU", "Warming"],
  ["Yousef Haddadin", "Group Treasurer", "Dunecrest Telecom", "B", "Jordan", "Requested"],
  ["Grace Mwangi", "VP Operations", "Falcon Ridge Payments", "A", "UAE", "In conversation"],
  ["Oliver Grant", "Managing Director", "Ironbridge Treasury Partners", "D", "UK", "Parked"],
  ["Noura Al Qasimi", "Head of Retail Payments", "Qasr Digital Bank", "B", "UAE", "Target"],
  ["Samir Nassar", "Chief Operating Officer", "Oasis Point Hospitality", "B", "UAE", "Warming"],
  ["Hannah Clarke", "Editor", "Payments Weekly Review", "E", "UK", "Connected"],
  ["Rashid Al Mansoori", "Director of Settlement", "Gulfline Clearing", "B", "UAE", "Resource sent"],
  ["Priya Raman", "Finance Director", "Saffron Lane Foods", "B", "UAE", "Target"],
  ["James Whitfield", "Head of Payments Strategy", "Harbourline Bank", "D", "UK", "Requested"],
  ["Leila Farouk", "Partnerships Director", "Meadowpay", "C", "UK", "Target"],
  ["Ahmed Al Zaabi", "Head of Digital Channels", "Tamrah Bank", "B", "Saudi Arabia", "Warming"],
  ["Clara Dumont", "Head of Treasury", "Larkspur Retail Group", "D", "EU", "Target"],
  ["Bilal Qureshi", "Chief Technology Officer", "Falcon Ridge Payments", "A", "UAE", "Connected"],
  ["Aisha Rahman", "Head of Compliance", "Kestrel Remit", "A", "UAE", "Warming"],
  ["Marcus Hale", "Chief Revenue Officer", "Pinecrest Software", "C", "UK", "Requested"],
  ["Dana Al Khalifa", "Director of Payments Policy", "Manama Payments Forum", "E", "Bahrain", "Connected"],
  ["Victor Hu", "Head of Asia Corridors", "Kestrel Remit", "A", "Singapore", "Target"],
  ["Salma Youssef", "Head of Operations", "Corniche Commerce Bank", "B", "Qatar", "Requested"],
  ["Ben Carter", "Product Director", "Meadowpay", "A", "UK", "Warming"],
  ["Latifa Al Nuaimi", "VP Merchant Payments", "Gulfline Clearing", "B", "UAE", "Target"],
  ["George Petrou", "Head of Finance Operations", "Oasis Point Hospitality", "B", "UAE", "Connected"],
  ["Mei Tanaka", "Research Lead", "Northlight Research", "E", "EU", "Target"],
  ["Hamad Al Shamsi", "Head of Innovation", "Sandgate Capital", "B", "UAE", "In conversation"],
  ["Rachel Stone", "Chief Operating Officer", "Brightwater Insurance", "D", "UK", "Warming"],
  ["Imran Sheikh", "Head of Treasury", "Wadi Logistics", "B", "Oman", "Requested"],
  ["Nadia Barakat", "Head of eCommerce", "Larkspur Retail Group", "B", "UAE", "Warming"],
  ["Peter Novak", "Director of Partnerships", "Pinecrest Software", "C", "EU", "Target"],
  ["Zainab Al Lawati", "Chief Digital Officer", "Dunecrest Telecom", "B", "Oman", "Warming"],
  ["Chris Doyle", "Head of Payments Operations", "Ironbridge Treasury Partners", "D", "UK", "Target"],
];

export type Move = { prospect: number; from: string; to: string; dayOff: number; time: string };

function buildPipeline() {
  const r = rng(7);
  const prospects: Row[] = [], moves: Row[] = [], plan: Move[] = [];
  const meta: { name: string; company: string; stage: string; segment: string; created: number; moveDays: Record<string, number>; i: number }[] = [];
  PEOPLE.forEach(([name, role, company, segment, region, stage], i) => {
    // The path through the stages: Parked leaves after Connected.
    const path = stage === "Parked" ? ["Target", "Warming", "Requested", "Connected", "Parked"] : STAGES.slice(0, STAGES.indexOf(stage) + 1);
    const steps = path.length - 1;
    // Added between 27 and 4 days ago; later stages started earlier.
    const created = Math.min(27, Math.max(steps * 3 + 2, 4 + ((i * 7) % 18)));
    const moveDays: Record<string, number> = { Target: -created };
    // Moves spread from the day after it was added to one or two days ago (the last move may be today).
    const lastDay = -((i % 3));
    for (let k = 1; k <= steps; k++) {
      const d = Math.round(-created + ((lastDay + created) * k) / steps);
      moveDays[path[k]] = Math.max(d, moveDays[path[k - 1]] + 1 > 0 ? 0 : moveDays[path[k - 1]] + 1);
    }
    const pid = id(T.prospect, i + 1);
    const nextOff = stage === "Won" ? null : stage === "Parked" ? 75 : ((i * 5) % 12) - 3;
    const lastMove = path[steps];
    const moveTime = (k: number) => hm(9 + ((i + k) % 8), (i * 11 + k * 17) % 60);
    const lastAt = steps ? at(moveDays[lastMove], moveTime(steps)) : at(-created, hm(8 + (i % 5), (i * 7) % 60));
    prospects.push({
      id: pid, workspace_id: WS, name, role, company, segment, region, stage,
      warmth: STAGES.indexOf(stage) >= 3 ? "warm" : "cold", value: 0,
      next_action: ACTION[stage], next_date: nextOff == null ? null : day(nextOff),
      linkedin: li(name), why: WHY[segment],
      notes: stage === "Parked" ? "Liked the idea; budget for a new acquirer is set for next year." : stage === "Won" ? "Signed for same-day settlement on the UAE corridor." : "",
      stage_changed_at: lastAt, created_at: at(-created, hm(8 + (i % 5), (i * 7) % 60)),
      pipeline_id: PIPE, lost_reason: stage === "Parked" ? "Timing: budget next year" : "", owner: OWNER,
    });
    for (let k = 1; k <= steps; k++) {
      const from = path[k - 1], to = path[k];
      const time = moveTime(k);
      plan.push({ prospect: i, from, to, dayOff: moveDays[to], time });
      moves.push({
        id: id(T.move, moves.length + 1), workspace_id: WS, prospect_id: pid, pipeline_id: PIPE, kind: "move", from_stage: from, to_stage: to,
        prev_action: ACTION[from], next_action: ACTION[to], next_date: to === "Won" ? null : k === steps ? (nextOff == null ? null : day(nextOff)) : day(moveDays[path[k + 1]]),
        reason: to === "Parked" ? "Timing: budget next year" : "", actor: OWNER, at: at(moveDays[to], time),
      });
    }
    meta.push({ name, company, stage, segment, created, moveDays, i });
    void r;
  });
  return { prospects, moves, plan, meta };
}

// ---------- Today, comments, activity ----------
const STYLES = ["Agree and add", "Operator lens", "Question", "Data point", "Board lens", "Partner lens"];
const COMMENT_TEXTS = [
  "I think the settlement window is the part most merchants feel first. A hotel group paid two days later is funding its own card volume, and that cost rarely shows up in the pricing talk. How are you measuring the working capital effect on your side?",
  "In my view the hard part is reconciliation, not speed. Instant payouts help only when the remittance data arrives with the money. Which reference fields are you asking acquirers to carry through?",
  "Agree on the corridor point. The cost on UK to GCC transfers is mostly in the FX spread and the correspondent hop, not the fee on the invoice. Are you seeing banks quote the spread separately yet?",
  "This matches what operations teams run into. Real-time rails move the cut-off problem to exception handling, so the team on call at 2am matters more than the batch job did. Who owns exceptions in your setup?",
  "The consultation reads as a push toward common scheme rules, which should lower onboarding effort for smaller merchants. The open question is dispute timing on instant payments. Do you expect a separate window for those?",
  "Good point on treasury. Once settlement is daily, the forecast moves from weekly buckets to daily ones, and most treasury tools are not set up for that. What are you using for the daily view?",
  "I think partners decide how fast this spreads. Merchants rarely switch acquirer for speed alone, but they do when their platform offers it by default. Which platforms are moving first in your market?",
  "In my perspective the controls story is what boards will ask about. Faster money means less time to stop a bad payout, so limits and holds need to be designed in early. How are you setting the first limits?",
  "One number worth adding: if card sales settle in one day instead of three, a merchant doing a steady volume frees roughly two days of sales in cash. That is the part finance directors understand quickly.",
  "Agree with the direction. The schemes that work tend to publish clear service levels for participants, so merchants can see who is slow. Do you think participants here will publish theirs?",
];
const VOICES = ["Karim Saleh", "Joanna Wells", "Mohammed Al Amri", "Sara Lindholm", "Vikram Desai", "Lina Mourad", "Paul Mercer", "Huda Al Rais"];
const POST_TEXTS = [
  "Card settlement still takes two to three days for most merchants in the region. We looked at what that costs a mid-size retailer.",
  "Our first quarter on instant payments: volumes, exceptions and what we changed in operations.",
  "The new consultation on instant payment scheme rules is out. Here is what participants are asked to comment on.",
  "Cross-border payments between the UK and the Gulf are getting cheaper, but not evenly. A short thread on where the cost sits.",
  "Treasury teams are rethinking daily liquidity now that payouts arrive the same day.",
];

function buildDaily(pipe: ReturnType<typeof buildPipeline>) {
  const r = rng(11);
  const items: Row[] = [], comments: Row[] = [], acts: Row[] = [], usage: Row[] = [];
  const P = pipe.meta;
  const eligible = (d: number) => P.filter((p) => p.moveDays.Warming != null && p.moveDays.Warming <= d && p.stage !== "Target");
  let ci = 0;
  for (let d = -27; d <= 0; d++) {
    const today = d === 0;
    // Comments: the people who warmed up that day first, then anyone already warm, then other voices.
    const doneComments = today ? 2 : 5 - (((d + 40) % 6 === 0) ? 1 : 0) - (((d + 40) % 9 === 0) ? 1 : 0);
    const firsts = P.filter((p) => p.moveDays.Warming === d);
    const authors: ({ p: (typeof P)[number] } | { v: string })[] = firsts.map((p) => ({ p }));
    while (authors.length < doneComments) {
      const pool = eligible(d);
      if (pool.length && r() < 0.7) authors.push({ p: pick(r, pool) }); else authors.push({ v: pick(r, VOICES) });
    }
    if (authors.length > QUOTAS.comment) throw new Error(`Too many first comments on day ${d}`);
    const kinds: [keyof typeof QUOTAS, number][] = [["comment", QUOTAS.comment], ["request", QUOTAS.request], ["dm", QUOTAS.dm], ["inmail", QUOTAS.inmail], ["reply", QUOTAS.reply]];
    for (const [kind, quota] of kinds) {
      for (let idx = 1; idx <= quota; idx++) {
        const iid = id(T.item, items.length + 1);
        let done = false, note = "", link = "", prospect: string | null = null;
        const t = hm(8 + idx + (kind === "comment" ? 0 : 3), (idx * 17 + (d + 30) * 7) % 60);
        if (kind === "comment") {
          const a = authors[idx - 1];
          if (a) {
            done = true;
            const name = "p" in a ? a.p.name : a.v;
            const pro = "p" in a ? a.p : null;
            prospect = pro ? id(T.prospect, pro.i + 1) : null;
            ci++;
            const url = `https://linkedin.example.com/feed/update/demo-${1000 + ci}`;
            note = name; link = url;
            const style = STYLES[ci % STYLES.length];
            // Replies: people further along reply more often; nothing from today has a reply yet.
            const stageIdx = pro ? STAGES.indexOf(pro.stage) : 0;
            const reply = !today && d < -1 && (pro ? (stageIdx >= 3 ? ci % 2 === 0 : ci % 4 === 0) : ci % 5 === 0);
            comments.push({
              id: id(T.comment, ci), workspace_id: WS, day: day(d), author: name, segment: pro ? pro.segment : pick(r, ["A", "B", "E", "C"]),
              url, mode: style, text: COMMENT_TEXTS[ci % COMMENT_TEXTS.length], reply, source: "extension", created_at: at(d, t),
              prospect_id: prospect, author_url: pro ? li(pro.name) : li(name), post_text: POST_TEXTS[ci % POST_TEXTS.length],
            });
            usage.push({ workspace_id: WS, user_id: OWNER, at: at(d, t), kind: "comment", provider: "claude", model: "claude-opus-5-5", input_tokens: 1800 + (ci * 37) % 600, output_tokens: 420 + (ci * 23) % 200, style: "", post_type: "", human: null, impact: null });
            usage.push({ workspace_id: WS, user_id: OWNER, at: at(d, t), kind: "scores", provider: "claude", model: "claude-opus-5-5", input_tokens: 0, output_tokens: 0, style, post_type: pick(r, ["Opinion", "Announcement", "Data post", "Question"]), human: 78 + (ci * 7) % 17, impact: 70 + (ci * 11) % 21 });
            if (pro) acts.push({ workspace_id: WS, at: at(d, t), actor: OWNER, kind: "comment", label: `Commented on ${name}`, ref_id: prospect });
            if (reply && pro) acts.push({ workspace_id: WS, at: at(Math.min(0, d + 1), hm(10, (ci * 3) % 60)), actor: OWNER, kind: "reply", label: `${name} replied`, ref_id: prospect });
          }
        } else {
          const rate = today ? (kind === "request" && idx === 1 ? 1 : 0) : kind === "inmail" ? 0.6 : kind === "reply" ? 0.85 : 0.8;
          done = today ? rate === 1 : r() < rate;
          if (done && kind === "request") {
            const who = P.find((p) => p.moveDays.Requested === d && !items.some((x) => x.note === p.name && x.kind === "request"));
            note = who ? who.name : pick(r, VOICES); prospect = who ? id(T.prospect, who.i + 1) : null;
          } else if (done && (kind === "dm" || kind === "inmail")) {
            const pool = P.filter((p) => (p.moveDays.Connected ?? 99) <= d);
            const who = pool.length ? pick(r, pool) : null;
            note = who ? who.name : ""; prospect = who ? id(T.prospect, who.i + 1) : null;
          } else if (done && kind === "reply") note = "Replied to comments on the latest post";
          if (!done && !today && r() < 0.25) note = "skip:";
        }
        const doneAt = done ? at(d, t) : null;
        items.push({ id: iid, workspace_id: WS, day: day(d), kind, idx, title: "", done, link, note, prospect_id: prospect, done_by: done ? OWNER : null, done_at: doneAt, created_at: at(d, "07:30") });
        if (done) acts.push({ workspace_id: WS, at: doneAt!, actor: OWNER, kind, label: kind, ref_id: iid });
      }
    }
  }
  // Today's own tasks.
  const custom: [number, string, string, boolean][] = [
    [1001, "Send Rania the settlement checklist before Thursday's call", "", false],
    [1002, "Approve the hospitality post for tomorrow", "", true],
    [5201, "Pitch: comment on the instant payment scheme consultation", "https://gulf-payments-authority.example.com/consultations/instant-payment-scheme", false],
  ];
  for (const [idx, title, link, done] of custom) {
    const iid = id(T.item, items.length + 1);
    items.push({ id: iid, workspace_id: WS, day: day(0), kind: "custom", idx, title, done, link, note: idx >= 5200 ? "discovery:pitch" : "", prospect_id: idx === 1001 ? id(T.prospect, 1) : null, done_by: done ? OWNER : null, done_at: done ? at(0, "09:40") : null, created_at: at(0, "07:30") });
    if (done) acts.push({ workspace_id: WS, at: at(0, "09:40"), actor: OWNER, kind: "custom", label: title, ref_id: iid });
  }
  for (const m of pipe.plan) {
    const p = P[m.prospect];
    acts.push({ workspace_id: WS, at: at(m.dayOff, m.time), actor: OWNER, kind: "stage", label: `${p.name} → ${m.to}`, ref_id: id(T.prospect, p.i + 1) });
  }
  return { items, comments, acts, usage };
}

// ---------- posts ----------
// [days from today, title, format, status, pillar, impressions, reactions, comments, time]
const POSTS: [number | null, string, string, string, string, number | null, number | null, number | null, string][] = [
  [-26, "Why two-day settlement is a cash-flow tax on GCC merchants", "Text post", "Posted", "Instant settlement", 4200, 96, 21, "08:30"],
  [-23, "Five numbers from our first year of same-day settlement", "Carousel", "Posted", "Instant settlement", 6900, 154, 38, "09:00"],
  [-20, "What hotel finance teams told me about card settlement", "Text post", "Posted", "Payments operations", 3100, 71, 17, "12:30"],
  [-16, "The UK to GCC corridor: where the cost actually sits", "Article", "Posted", "Cross-border corridors", 2500, 48, 12, "08:00"],
  [-13, "Instant payments will not fix reconciliation on their own", "Text post", "Posted", "Payments operations", 5400, 132, 29, "08:30"],
  [-9, "A checklist for moving a bank to real-time settlement", "Carousel", "Posted", "Instant settlement", 8100, 201, 44, "09:00"],
  [-6, "Agentic checkout needs rules that operations teams can run", "Text post", "Posted", "Agentic commerce", 4700, 109, 26, "13:00"],
  [-3, "What the instant payment consultation means for merchants", "Text post", "Posted", "Regulation in practice", 6200, 148, 35, "08:30"],
  [-1, "Three questions to ask before you switch acquirers", "Image post", "Posted", "Payments operations", 3900, 88, 19, "09:00"],
  [1, "Settlement speed is a hospitality problem first", "Text post", "In review", "Instant settlement", null, null, null, "08:30"],
  [2, "Our operations playbook for peak season volumes", "Carousel", "Ready", "Payments operations", null, null, null, "09:00"],
  [3, "Treasury teams and the end of the batch window", "Article", "In review", "Instant settlement", null, null, null, "08:00"],
  [6, "Open banking in the GCC: what changes for acquirers", "Text post", "Drafting", "Regulation in practice", null, null, null, "08:30"],
  [9, "How a same-day payout actually moves, in 60 seconds", "Video", "Drafting", "Payments operations", null, null, null, "12:30"],
  [null, "The real cost of a failed payout", "Text post", "Idea", "Payments operations", null, null, null, ""],
  [null, "What merchants should ask about agent-initiated payments", "Text post", "Idea", "Agentic commerce", null, null, null, ""],
];
const DRAFT = (title: string) => `${title}\n\nMost merchants in the region still wait two or three days for card money. That gap is paid for by someone, usually the merchant's own working capital.\n\nThree things we have learned running same-day settlement:\n1. Speed is only useful when the payout carries the data finance needs to reconcile it.\n2. Exceptions, not volumes, decide how many people operations needs.\n3. Limits and holds have to be designed before launch, not after the first incident.\n\nWhat would change in your finance team if settlement arrived the next morning?`;

function buildPosts() {
  return POSTS.map(([d, title, format, status, pillar, imp, rea, com, time], i): Row => ({
    id: id(T.post, i + 1), workspace_id: WS, title, format, publish_date: d == null ? null : day(d), status, topic: pillar, resource: "",
    draft: status === "Idea" ? "" : DRAFT(title), url: status === "Posted" ? `https://linkedin.example.com/posts/laylahaddad-demo-${i + 1}` : "",
    impressions: imp, reactions: rea, comments: com, created_at: at(Math.min(-1, (d ?? -4) - 5), "10:00"),
    pillar, planned_time: time, channel: "shashi", hook: status === "Idea" ? "" : title,
    requested_by: status === "In review" ? OWNER : null, requested_at: status === "In review" ? at(-1, "16:00") : null,
    decided_by: status === "Ready" || status === "Posted" ? OWNER : null, decided_at: status === "Ready" || status === "Posted" ? at(Math.min(-1, (d ?? 0) - 1), "18:00") : null,
    decision: status === "Ready" || status === "Posted" ? "approved" : "", angle: "", source_kind: "idea", discovery: J({}),
  }));
}

// ---------- network ----------
function buildNetwork(pipe: ReturnType<typeof buildPipeline>) {
  const people: Row[] = [];
  const add = (name: string, company: string, position: string, o: { conn?: number | null; msgs?: number; last?: number; from?: string; invite?: number; prospect?: string | null }) => {
    people.push({
      workspace_id: WS, key: li(name).replace(/^https:\/\//, ""), url: li(name), name, company, position, is_connection: o.conn != null,
      connected_on: o.conn != null ? day(o.conn) : null, msg_count: o.msgs ?? 0, msg_last: o.msgs ? day(o.last ?? -5) : null, msg_last_from: o.msgs ? o.from ?? "them" : "",
      invite: o.invite != null ? "sent" : "", invite_at: o.invite != null ? day(o.invite) : null, segment_manual: "", prospect_id: o.prospect ?? null, not_prospects: [],
      first_export: day(-12), last_export: day(-12),
    });
  };
  // Prospects who accepted are connections; the ones in conversation have messages.
  for (const p of pipe.meta) {
    const conn = p.moveDays.Connected;
    const pid = id(T.prospect, p.i + 1);
    const [, role] = PEOPLE[p.i];
    if (conn != null && conn <= -12) add(p.name, p.company, role, { conn, msgs: p.moveDays["In conversation"] != null ? 3 + (p.i % 6) : 0, last: Math.max(-12, (p.moveDays["In conversation"] ?? -14) + 1), from: p.i % 2 ? "them" : "us", prospect: pid });
    else if (p.moveDays.Requested != null && p.moveDays.Requested <= -12) add(p.name, p.company, role, { invite: p.moveDays.Requested });
  }
  // Colleagues at prospect companies: the warm paths in.
  const colleagues: [string, string, string, number][] = [
    ["Omar Haidar", "Qasr Digital Bank", "Head of Cards", -400], ["Nicola Barnes", "Harbourline Bank", "Head of Operations", -900], ["Tariq Mansour", "Corniche Commerce Bank", "VP Payments", -750], ["Deepa Krishnan", "Kestrel Remit", "Head of Treasury", -210], ["Adel Haroun", "Tamrah Bank", "Head of Cash Management", -1100], ["Yara Daoud", "Oasis Point Hospitality", "Group Financial Controller", -540], ["Kamal Aziz", "Gulfline Clearing", "Operations Manager", -700], ["Elena Ruiz", "Pinecrest Software", "VP Business Development", -150], ["Jonas Berg", "Northlight Research", "Senior Analyst", -420],
  ];
  colleagues.forEach(([n, c, pos, conn], i) => add(n, c, pos, { conn, msgs: i % 4 === 0 ? 2 + (i % 3) : 0, last: -40 - i * 9, from: "us" }));
  // The rest of the network.
  const others: [string, string, string][] = [
    ["Karim Saleh", "Atlas Merchant Services", "Founder"], ["Joanna Wells", "Payments Weekly Review", "Reporter"], ["Mohammed Al Amri", "Muscat Card Centre", "General Manager"],
    ["Sara Lindholm", "Fjordline Bank", "Head of Instant Payments"], ["Vikram Desai", "Indigo Corridor Pay", "Chief Executive Officer"], ["Lina Mourad", "Levant Ventures", "Partner"],
    ["Paul Mercer", "Mercer Advisory", "Payments Consultant"], ["Huda Al Rais", "Gulf Fintech Review", "Editor"], ["Anders Holm", "Nordwind Payments", "VP Operations"],
    ["Reem Al Falasi", "Dune Ventures", "Investment Director"], ["Tom Becker", "Rhine Clearing", "Head of Settlement"], ["Samira Bennani", "Atlas Merchant Services", "Head of Product"],
    ["Ian Fletcher", "Westbridge University", "Lecturer in Finance"], ["Noor Al Hashimi", "Falaj Pay", "Chief Operating Officer"], ["Ravi Shankar", "Indigo Corridor Pay", "Head of Compliance"],
    ["Claire Moreau", "Seine Payments", "Head of Partnerships"], ["Bader Al Otaibi", "Najd Retail", "Chief Financial Officer"], ["Lucas Silva", "Porto Acquiring", "Product Manager"],
  ];
  others.forEach(([n, c, pos], i) => add(n, c, pos, { conn: -100 - i * 37, msgs: i % 5 === 0 ? 1 + (i % 4) : 0, last: -20 - i * 3, from: i % 2 ? "them" : "us" }));
  const posts: Row[] = POSTS.filter((p) => p[3] === "Posted" && (p[0] as number) <= -12).map((p, i) => ({ workspace_id: WS, kind: "post", key: `https://linkedin.example.com/posts/laylahaddad-demo-${POSTS.indexOf(p) + 1}`, day: day(p[0] as number), url: `https://linkedin.example.com/posts/laylahaddad-demo-${POSTS.indexOf(p) + 1}`, text: `${p[1]}. ${POST_TEXTS[i % POST_TEXTS.length]}` }));
  ["Settlement speed matters most for hospitality and travel merchants.", "Reconciliation data is the real bottleneck for instant payouts.", "UK to GCC corridors: the spread is where the cost sits."].forEach((t, i) =>
    posts.push({ workspace_id: WS, kind: "comment", key: `https://linkedin.example.com/feed/update/demo-c${i + 1}|${i}`, day: day(-14 - i * 3), url: `https://linkedin.example.com/feed/update/demo-c${i + 1}`, text: t }));
  const counts = { connections: people.filter((p) => p.is_connection).length, messaged: people.filter((p) => (p.msg_count as number) > 0).length, invites: people.filter((p) => p.invite).length, posts: posts.filter((p) => p.kind === "post").length, comments: posts.filter((p) => p.kind === "comment").length };
  const imports: Row[] = [{ id: id(T.netImport, 1), workspace_id: WS, file_name: "Basic_LinkedInDataExport_demo.zip", export_date: day(-12), counts: J(counts), created_by: OWNER, created_at: at(-12, "11:20") }];
  const rules = {
    segments: [
      { seg: "C", companies: [], roles: ["partnerships", "partnership", "business development", "alliances", "growth", "chief revenue officer", "commercial"] },
      { seg: "E", companies: ["review", "research", "advisory", "university", "forum", "media"], roles: ["editor", "reporter", "analyst", "researcher", "lecturer", "consultant"] },
      { seg: "B", companies: ["qasr", "corniche", "tamrah", "gulfline", "sandgate", "wadi", "dunecrest", "oasis", "falaj", "najd", "muscat", "saffron"], roles: [] },
      { seg: "D", companies: ["harbourline", "ironbridge", "larkspur", "brightwater", "fjordline", "rhine", "seine", "porto", "nordwind"], roles: [] },
      { seg: "A", companies: ["pay", "payments", "remit", "acquiring", "merchant services", "clearing"], roles: ["payments", "treasury", "settlement"] },
    ],
    topics: [
      { name: "Instant settlement", words: ["settlement", "same-day", "instant", "payout"] },
      { name: "Cross-border corridors", words: ["corridor", "cross-border", "remittance", "fx", "spread"] },
      { name: "Payments operations", words: ["reconciliation", "operations", "exceptions", "acquirer"] },
      { name: "Regulation in practice", words: ["consultation", "scheme rules", "regulation", "compliance"] },
      { name: "Agentic commerce", words: ["agentic", "agent", "checkout"] },
    ],
  };
  return { people, posts, imports, settings: [{ workspace_id: WS, segments: J(rules.segments), topics: J(rules.topics) }] as Row[] };
}

/** network_warm_count(): open prospects linked to a connection, or with a connection at their company. */
export function warmCount(prospects: { id: string; company: string; stage: string }[], people: { prospect_id: string | null; is_connection: boolean; company: string }[]) {
  return prospects.filter((p) => !["Won", "Parked"].includes(p.stage) && people.some((n) => n.prospect_id === p.id || (n.is_connection && normCompany(n.company) !== "" && normCompany(n.company) === normCompany(p.company)))).length;
}

// ---------- AI citations ----------
export const ENGINES_USED: Engine[] = ["openai", "gemini", "claude"];
const MODEL: Record<string, string> = { openai: "gpt-5", gemini: "gemini-3.8-flash", claude: "claude-opus-5-5" };
const RIVAL_PEOPLE: [string, string, string][] = [["Omar Faris", "Meridian Rails", "meridianrails.example.com"], ["Priya Nandakumar", "Corvane Pay", "corvanepay.example.com"]];
const RIVAL_FIRMS: [string, string][] = [["Meridian Rails", "meridianrails.example.com"], ["Corvane Pay", "corvanepay.example.com"], ["Halvorsen Digital", "halvorsen.example.com"]];
// question, audience, topic, region, keywords
const QUESTIONS: [string, "expert" | "vendor" | "leadership", string, string, string[]][] = [
  ["Who are the leading voices on instant settlement for merchants in the GCC?", "expert", "Instant settlement", "UAE", ["instant settlement", "merchant"]],
  ["Which payments operations leaders should I follow for cross-border corridors?", "expert", "Cross-border corridors", "", ["corridor", "cross-border"]],
  ["Who are the experts on payment operations at fintechs in the Middle East?", "expert", "Payments operations", "", ["payment operations"]],
  ["Which thought leaders write about agentic commerce and payments?", "expert", "Agentic commerce", "", ["agentic"]],
  ["Who leads the fastest-growing payment companies in the UAE?", "leadership", "Instant settlement", "UAE", ["payments"]],
  ["Who is behind the main merchant settlement platforms in the GCC?", "leadership", "Instant settlement", "", ["settlement"]],
  ["Which payment providers offer same-day settlement for merchants in Saudi Arabia?", "vendor", "Instant settlement", "Saudi Arabia", ["same-day settlement"]],
  ["What are the best cross-border payment providers for GCC to UK corridors?", "vendor", "Cross-border corridors", "UK", ["corridor"]],
  ["Which companies help banks launch instant payments in the GCC?", "vendor", "Regulation in practice", "", ["instant payments"]],
  ["Which payment processors are recommended for hospitality groups in the UAE?", "vendor", "Payments operations", "UAE", ["hospitality"]],
];
// How many of the 18 person batches (expert and leadership prompts on three engines) and 18 company batches
// (vendor and leadership) name her, four weeks ago to this week. Strictly rising.
export const PERSON_NAMED = [3, 6, 9, 12];
export const COMPANY_NAMED = [5, 8, 11, 13];
const MEDIA: [string, string][] = [
  ["https://paymentsweekly.example.com/analysis/gcc-settlement-times", "Settlement times in the GCC, compared"],
  ["https://gulffintech.example.com/reports/merchant-payments-2026", "Merchant payments report 2026"],
  ["https://northlight.example.com/research/instant-payments-middle-east", "Instant payments in the Middle East"],
  ["https://paymentsweekly.example.com/news/uk-gulf-corridor-costs", "UK to Gulf corridor costs fall"],
];

function personLine(week: number) {
  return [
    `${PERSON}, Chief Operating Officer of ${COMPANY}, writes about what slow card settlement costs merchants and how operations teams run same-day payouts.`,
    `${PERSON} (COO, ${COMPANY}) is often quoted on settlement operations, reconciliation and exception handling for GCC merchants.`,
    `${PERSON}, COO at ${COMPANY}, publishes practical checklists on moving banks and merchants to real-time settlement.`,
    `${PERSON} leads operations at ${COMPANY} and is one of the clearest voices on instant settlement and the UK to GCC corridor.`,
  ][week];
}

function buildCitations() {
  const profiles: Row[] = [{ id: CIT, workspace_id: WS, name: `${PERSON}, ${COMPANY}`, sort: 0, created_by: OWNER, created_at: at(-28, "10:00") }];
  const picks: Row[] = [{ workspace_id: WS, user_id: OWNER, profile_id: CIT }];
  const ent = (n: number, kind: string, subject: string, name: string, aliases: string[], domains: string[]): Row => ({ id: id(T.entity, n), workspace_id: WS, kind, subject, status: "active", name, aliases, domains, sort: n, profile_id: CIT, created_at: at(-28, "10:05") });
  const entities: Row[] = [
    ent(1, "self", "person", PERSON, [PERSON], ["linkedin.example.com/in/laylahaddad"]),
    ent(2, "self", "company", COMPANY, [COMPANY, "Northgate"], ["northgate-payments.example.com"]),
    ...RIVAL_PEOPLE.map(([n, , d], i) => ent(3 + i, "competitor", "person", n, [n], [`${d}/team`])),
    ...RIVAL_FIRMS.map(([n, d], i) => ent(5 + i, "competitor", "company", n, [n], [d])),
  ];
  const questions: Row[] = QUESTIONS.map(([q, audience, topic, region, keywords], i) => ({
    id: id(T.question, i + 1), workspace_id: WS, question: q, topic, region, sort: i, language: "English", status: "active", repeats: 1, source: "starter",
    audience, keywords, profile_id: CIT,
  }));
  const runs: Row[] = [], sources: Row[] = [];
  const personQs = QUESTIONS.map((q, i) => [q, i] as const).filter(([q]) => q[1] !== "vendor").map(([, i]) => i);
  const companyQs = QUESTIONS.map((q, i) => [q, i] as const).filter(([q]) => q[1] !== "expert").map(([, i]) => i);
  // A fixed order of batches; week w names the first N of them, so a name once won stays (newly named, never dropped).
  const order = (qs: number[]) => qs.flatMap((q) => ENGINES_USED.map((e) => `${q}|${e}`)).sort((a, b) => hashStr(a) - hashStr(b));
  const pOrder = order(personQs), cOrder = order(companyQs);
  let rn = 0;
  for (let w = 0; w < 4; w++) {
    const weeksAgo = 3 - w;
    const namedP = new Set(pOrder.slice(0, PERSON_NAMED[w])), namedC = new Set(cOrder.slice(0, COMPANY_NAMED[w]));
    QUESTIONS.forEach(([q, audience, , region], qi) => {
      ENGINES_USED.forEach((engine, ei) => {
        rn++;
        const key = `${qi}|${engine}`;
        const person = audience !== "vendor" && namedP.has(key);
        const company = audience !== "expert" && namedC.has(key);
        const rid = id(T.run, rn);
        const mins = weeksAgo * 7 * 1440 + 120 - qi * 4 - ei; // the weekly batch, the latest about two hours ago
        const answer = answerFor(q, audience, w, qi, ei, person, company);
        runs.push({
          id: rid, workspace_id: WS, question_id: id(T.question, qi + 1), engine, model: MODEL[engine], web_search: true, status: "ok", error: "",
          answer, question_text: promptFor({ question: q, region }, engine), region, language: "English",
          input_tokens: 1400 + ((qi * 97 + ei * 31) % 700), output_tokens: 520 + ((qi * 53 + ei * 17 + w * 11) % 300), run_at: ago(mins), created_by: OWNER,
          repeat_index: 0, sentiment: person || company ? (w >= 2 ? "positive" : "neutral") : "", fact_issues: J([]), judged_at: person || company ? ago(mins - 10) : null,
          person_review: "", profile_id: CIT,
        });
        const src: [string, string, boolean][] = [];
        src.push([MEDIA[(qi + ei) % MEDIA.length][0], MEDIA[(qi + ei) % MEDIA.length][1], true]);
        src.push([`https://${RIVAL_FIRMS[(qi + w) % 3][1]}/settlement`, `${RIVAL_FIRMS[(qi + w) % 3][0]}: settlement`, true]);
        src.push([MEDIA[(qi + ei + 2) % MEDIA.length][0], MEDIA[(qi + ei + 2) % MEDIA.length][1], false]);
        if (company) src.push([`https://northgate-payments.example.com/${w >= 2 ? "insights/same-day-settlement" : "merchants"}`, `${COMPANY}: ${w >= 2 ? "Same-day settlement explained" : "For merchants"}`, true]);
        if (person && w >= 2) src.push(["https://linkedin.example.com/in/laylahaddad", `${PERSON} | LinkedIn`, true]);
        if (person && w < 2) src.push(["https://paymentsweekly.example.com/interviews/layla-haddad", `Interview: ${PERSON} on settlement operations`, true]);
        src.forEach(([url, title, cited], si) => sources.push({ workspace_id: WS, run_id: rid, url, title, domain: new URL(url).hostname, cited, sort: si }));
      });
    });
  }
  const facts: Row[] = [{ workspace_id: WS, profile_id: CIT, facts: J({ titles: "Chief Operating Officer", company: COMPANY, products: "Same-day merchant settlement; UK to GCC payouts", licences: "Payment service provider licence (fictional demo)", regions: "GCC, UK", founded: "2017", other: "Demo profile: every fact here is invented." }) }];
  const recs: Row[] = [
    { id: id(T.rec, 1), workspace_id: WS, profile_id: CIT, kind: "profile", title: "Name the corridors in the LinkedIn headline", detail: "Answers on cross-border prompts name rivals who list their corridors. Add 'UK to GCC' to the headline.", question_ids: [id(T.question, 2), id(T.question, 8)], status: "open", baseline: null, accepted_at: null, post_id: null, created_at: at(-2, "10:00") },
    { id: id(T.rec, 2), workspace_id: WS, profile_id: CIT, kind: "elsewhere", title: "Publish a settlement-times explainer on the company site", detail: "Engines cite rival explainers on same-day settlement. A plain explainer page gives them a source to cite.", question_ids: [id(T.question, 7), id(T.question, 9)], status: "accepted", baseline: J({ named: 2, total: 6 }), accepted_at: at(-15, "11:00"), post_id: null, created_at: at(-16, "10:00") },
  ];
  return { profiles, picks, entities, questions, runs, sources, facts, recs };
}

function hashStr(s: string) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; }

function answerFor(q: string, audience: string, w: number, qi: number, ei: number, person: boolean, company: boolean) {
  const intro = ["Here are the names that come up most often:", "Based on recent coverage, these stand out:", "A few names appear repeatedly in recent reporting:"][ei];
  const lines: string[] = [];
  if (audience === "vendor") {
    const firms = [
      `**Meridian Rails** offers next-day settlement for card merchants and publishes its settlement calendar.`,
      `**Corvane Pay** focuses on cross-border payouts and quotes FX spreads separately.`,
      `**Halvorsen Digital** provides instant payment connectivity for banks joining new schemes.`,
    ];
    if (company) firms.splice(Math.max(0, 2 - w), 0, `**${COMPANY}** settles card sales the same day for merchants in the UAE and Saudi Arabia and covers the UK to GCC corridor.`);
    firms.forEach((f, i) => lines.push(`${i + 1}. ${f}`));
  } else {
    const experts = [
      `**Omar Faris** (Meridian Rails) writes about merchant settlement times in the Gulf.`,
      `**Priya Nandakumar** of Corvane Pay comments on corridor pricing and FX spreads.`,
      `**Independent analysts** at regional research houses cover scheme rules and participant service levels.`,
    ];
    if (person) experts.splice(Math.max(0, 2 - w), 0, personLine(w));
    else if (company) experts.splice(2, 0, `**${COMPANY}** is often mentioned for same-day settlement, though its leadership is quoted less often.`);
    experts.forEach((x, i) => lines.push(`${i + 1}. ${x}`));
  }
  const close = (qi + ei) % 2 ? "Coverage changes quickly, so check recent interviews and company pages." : "These are based on recent articles and public profiles.";
  return `${intro}\n\n${lines.join("\n")}\n\n${close}`;
}

// ---------- Discovery ----------
// [title, publisher, host path, source type, days since published, found by, minutes ago found, scores, pillar, geo, service, kind, orgs, status, extra]
type F = { title: string; publisher: string; url: string; type: string; pub: number; by: string[]; found: number; scores: number[]; pillar: string; geo: string; service: string; kind: string; orgs: string[]; status: string; competitor?: string; opp?: Record<string, unknown>; gap?: boolean; comment?: boolean; why: string; angle: string; dismiss?: string; author?: string; run: number };
const FINDINGS: F[] = [
  // This week: the AI search two hours ago, the crawl yesterday, two LinkedIn posts sent from the Prax bar.
  { title: "Gulf Payments Authority opens consultation on instant payment scheme rules for merchants", publisher: "Gulf Payments Authority", url: "https://gulf-payments-authority.example.com/consultations/instant-payment-scheme", type: "Regulator", pub: -2, by: ["ai", "crawl"], found: 110, scores: [5, 5, 5, 4, 5, 5, 4], pillar: "Regulation in practice", geo: "GCC", service: "Payments and settlement", kind: "Fact", orgs: ["Gulf Payments Authority"], status: "new", opp: { kind: "pitch", due: 21, ask: "Comments from participants and merchants" }, why: "Scheme rules decide settlement windows for every acquirer in the region.", angle: "Operator view: what the dispute window means for same-day settlement.", run: 4 },
  { title: "Instant payment scheme rules consultation: what acquirers must change", publisher: "Payments Weekly Review", url: "https://paymentsweekly.example.com/news/instant-payment-scheme-consultation", type: "Publication", pub: -2, by: ["ai"], found: 105, scores: [5, 5, 5, 4, 5, 4, 4], pillar: "Regulation in practice", geo: "GCC", service: "Payments and settlement", kind: "Analysis", orgs: ["Gulf Payments Authority"], status: "new", why: "Explains the acquirer obligations in the consultation.", angle: "", run: 4 },
  { title: "Merchants welcome instant payment scheme consultation", publisher: "Gulf Fintech Review", url: "https://gulffintech.example.com/news/merchants-instant-payment-consultation", type: "Publication", pub: -1, by: ["crawl"], found: 1400, scores: [4, 5, 5, 4, 5, 4, 3], pillar: "Regulation in practice", geo: "GCC", service: "Payments and settlement", kind: "Signal", orgs: ["Gulf Payments Authority"], status: "new", why: "Merchant reaction to the consultation.", angle: "", run: 5 },
  { title: "Meridian Rails raises Series C to expand GCC merchant settlement", publisher: "Gulf Fintech Review", url: "https://gulffintech.example.com/news/meridian-rails-series-c", type: "Publication", pub: -3, by: ["ai"], found: 100, scores: [4, 4, 5, 4, 4, 4, 3], pillar: "Instant settlement", geo: "GCC", service: "Payments and settlement", kind: "Fact", orgs: ["Meridian Rails"], status: "new", competitor: "Meridian Rails", why: "A direct competitor is funding faster settlement in the same markets.", angle: "How we see it: speed is table stakes; reconciliation data is where merchants decide.", run: 4 },
  { title: "Meridian Rails Series C: the GCC settlement race heats up", publisher: "Payments Weekly Review", url: "https://paymentsweekly.example.com/news/meridian-rails-series-c-analysis", type: "Publication", pub: -2, by: ["crawl"], found: 1390, scores: [4, 4, 5, 4, 4, 3, 3], pillar: "Instant settlement", geo: "GCC", service: "Payments and settlement", kind: "Analysis", orgs: ["Meridian Rails"], status: "new", competitor: "Meridian Rails", why: "Analysis of the round and what it funds.", angle: "", run: 5 },
  { title: "Hospitality groups push acquirers for same-day card settlement", publisher: "Northlight Research", url: "https://northlight.example.com/research/hospitality-settlement", type: "Research", pub: -4, by: ["ai"], found: 95, scores: [5, 5, 4, 5, 4, 4, 5], pillar: "Instant settlement", geo: "GCC", service: "Payments and settlement", kind: "Analysis", orgs: ["Oasis Point Hospitality", "Northlight Research"], status: "new", gap: true, why: "Hotel groups are the merchants who feel settlement delays most.", angle: "Operator view: what a hotel group's finance team gains from next-morning money.", run: 4 },
  { title: "Same-day settlement for hotels: a finance director's view", publisher: "LinkedIn, sent from the Prax bar", url: "https://linkedin.example.com/feed/update/demo-li-201", type: "LinkedIn", pub: -1, by: ["linkedin"], found: 1300, scores: [5, 4, 4, 4, 5, 3, 5], pillar: "Instant settlement", geo: "GCC", service: "Payments and settlement", kind: "Signal", orgs: ["Oasis Point Hospitality"], status: "new", comment: true, author: "Samir Nassar", why: "A target account wrote about the exact problem.", angle: "", run: 0 },
  { title: "UK to GCC remittance costs fall as banks quote FX spreads separately", publisher: "Payments Weekly Review", url: "https://paymentsweekly.example.com/news/uk-gulf-corridor-costs", type: "Publication", pub: -4, by: ["ai"], found: 90, scores: [4, 5, 4, 4, 4, 4, 4], pillar: "Cross-border corridors", geo: "UK", service: "Payments and settlement", kind: "Fact", orgs: ["Harbourline Bank"], status: "new", why: "Corridor pricing is moving toward the model Northgate already uses.", angle: "", run: 4 },
  { title: "Gulf retailers pilot agent-initiated checkout with spending mandates", publisher: "Gulf Fintech Review", url: "https://gulffintech.example.com/news/agentic-checkout-pilots", type: "Publication", pub: -1, by: ["ai"], found: 85, scores: [3, 5, 4, 3, 5, 3, 3], pillar: "Agentic commerce", geo: "GCC", service: "Agentic payments", kind: "Signal", orgs: ["Larkspur Retail Group"], status: "new", why: "Early agentic commerce pilots at retailers in the region.", angle: "", run: 4 },
  { title: "Tender: payment gateway and settlement services for a regional retail group", publisher: "Gulf Tenders Portal", url: "https://tenders.example.com/notices/retail-payment-gateway", type: "Company", pub: -2, by: ["crawl"], found: 1380, scores: [5, 4, 5, 5, 4, 3, 2], pillar: "Payments operations", geo: "GCC", service: "Payments and settlement", kind: "Fact", orgs: ["Najd Retail"], status: "new", opp: { kind: "sales", due: 12, ask: "Gateway and settlement services, three-year term" }, why: "A live tender for exactly what Northgate sells. For sales, never a post.", angle: "", run: 5 },
  { title: "Opinion: crypto prices and what they mean for payments", publisher: "Example Blog", url: "https://blog.example.com/crypto-prices-payments", type: "Blog", pub: -3, by: ["ai"], found: 80, scores: [1, 2, 1, 1, 3, 1, 1], pillar: "", geo: "Other", service: "", kind: "Speculation", orgs: [], status: "dismissed", dismiss: "Off topic", why: "", angle: "", run: 4 },
  // Earlier weeks.
  { title: "Central bank data shows card settlement still averages two days in the region", publisher: "Northlight Research", url: "https://northlight.example.com/research/settlement-days-2026", type: "Research", pub: -22, by: ["ai"], found: 22 * 1440, scores: [5, 5, 5, 4, 2, 4, 5], pillar: "Instant settlement", geo: "GCC", service: "Payments and settlement", kind: "Fact", orgs: ["Northlight Research"], status: "sent", why: "The number behind the first post.", angle: "Numbers and prediction: two days of sales funded by the merchant.", run: 1 },
  { title: "Hotels count the cost of slow payouts", publisher: "Gulf Fintech Review", url: "https://gulffintech.example.com/news/hotels-slow-payouts", type: "Publication", pub: -21, by: ["crawl"], found: 21 * 1440, scores: [4, 4, 4, 4, 2, 3, 4], pillar: "Payments operations", geo: "GCC", service: "Payments and settlement", kind: "Signal", orgs: ["Oasis Point Hospitality"], status: "sent", why: "Led to the hotel finance post.", angle: "", run: 1 },
  { title: "Banks prepare for real-time settlement deadlines", publisher: "Payments Weekly Review", url: "https://paymentsweekly.example.com/news/banks-real-time-deadlines", type: "Publication", pub: -14, by: ["ai"], found: 14 * 1440, scores: [5, 4, 4, 4, 2, 4, 4], pillar: "Instant settlement", geo: "GCC", service: "Payments and settlement", kind: "Analysis", orgs: ["Qasr Digital Bank"], status: "sent", why: "Became the real-time checklist carousel.", angle: "", run: 2 },
  { title: "Reconciliation gaps slow instant payout adoption", publisher: "Northlight Research", url: "https://northlight.example.com/research/reconciliation-gaps", type: "Research", pub: -15, by: ["crawl"], found: 15 * 1440, scores: [4, 5, 3, 4, 2, 4, 5], pillar: "Payments operations", geo: "GCC", service: "Payments and settlement", kind: "Analysis", orgs: ["Northlight Research"], status: "sent", why: "Backed the reconciliation post.", angle: "", run: 2 },
  { title: "UK fintech partners eye Gulf corridors", publisher: "Payments Weekly Review", url: "https://paymentsweekly.example.com/news/uk-fintech-gulf-corridors", type: "Publication", pub: -16, by: ["ai"], found: 16 * 1440, scores: [3, 4, 3, 3, 2, 3, 3], pillar: "Cross-border corridors", geo: "UK", service: "Payments and settlement", kind: "Signal", orgs: ["Pinecrest Software"], status: "watched", why: "Partnership signal worth watching.", angle: "", run: 2 },
  { title: "Agentic payments: the mandate question", publisher: "Gulf Fintech Review", url: "https://gulffintech.example.com/analysis/agentic-mandates", type: "Publication", pub: -8, by: ["ai"], found: 8 * 1440, scores: [4, 5, 3, 3, 3, 3, 4], pillar: "Agentic commerce", geo: "GCC", service: "Agentic payments", kind: "Analysis", orgs: [], status: "sent", why: "Became the agentic checkout post.", angle: "", run: 3 },
  { title: "Corvane Pay launches UK to UAE payouts for marketplaces", publisher: "Corvane Pay newsroom", url: "https://corvanepay.example.com/news/uk-uae-payouts", type: "Company", pub: -9, by: ["crawl"], found: 9 * 1440, scores: [4, 4, 4, 4, 3, 2, 3], pillar: "Cross-border corridors", geo: "GCC", service: "Payments and settlement", kind: "Fact", orgs: ["Corvane Pay"], status: "watched", competitor: "Corvane Pay", why: "Competitor launch on our corridor.", angle: "", run: 3 },
  { title: "Old news: a 2019 review of card schemes", publisher: "Example Blog", url: "https://blog.example.com/2019-card-schemes", type: "Blog", pub: -400, by: ["crawl"], found: 9 * 1440 + 30, scores: [2, 3, 2, 2, 0, 2, 1], pillar: "", geo: "Other", service: "", kind: "Analysis", orgs: [], status: "dismissed", dismiss: "Old news", why: "", angle: "", run: 3 },
];
const DISC_RUNS: { kind: "ai" | "crawl"; mins: number; searches?: number; links?: number }[] = [
  { kind: "ai", mins: 22 * 1440 + 60, searches: 24 }, { kind: "ai", mins: 15 * 1440 + 60, searches: 24 }, { kind: "ai", mins: 8 * 1440 + 60, searches: 26 },
  { kind: "ai", mins: 120, searches: 26 }, { kind: "crawl", mins: 1440 + 30, links: 6 },
];
const LINKS: [string, string, string][] = [
  ["https://gulf-payments-authority.example.com/consultations", "Gulf Payments Authority consultations", "Regulator"],
  ["https://paymentsweekly.example.com/news", "Payments Weekly Review news", "Publication"],
  ["https://gulffintech.example.com/news", "Gulf Fintech Review", "Publication"],
  ["https://northlight.example.com/research", "Northlight Research", "Research"],
  ["https://corvanepay.example.com/news", "Corvane Pay newsroom", "Company"],
  ["https://tenders.example.com/notices", "Gulf Tenders Portal", "Company"],
];

/** Fixed reference used only to rank this week's topics; every input is relative, so the ranking holds on any day. */
export const REF_NOW = new Date("2026-11-05T12:00:00Z");

function buildDiscovery(posts: Row[], people: Row[]) {
  const settings: Row[] = [{ workspace_id: WS, settings: J({ run_day: "Monday", geo: ["GCC", "UK", "Other emerging markets"] }) }];
  const lists: Row[] = [{ id: id(T.list, 1), workspace_id: WS, name: "Payments sources", file_name: "payments-sources.xlsx", created_at: at(-27, "09:00"), created_by: OWNER }];
  const links: Row[] = LINKS.map(([url, name, type], i) => ({ id: id(T.link, i + 1), workspace_id: WS, list_id: id(T.list, 1), url, name, type, priority: i < 3 ? "High" : "Medium", access: "Open", region: "GCC", notes: "", status: "list", articles: 5 - (i % 3), error: "", last_read: ago(1440 + 30), created_at: at(-27, "09:00") }));
  const runs: Row[] = DISC_RUNS.map((r, i) => {
    const mine = FINDINGS.filter((f) => f.run === i + 1);
    const stats = r.kind === "ai"
      ? { searches: r.searches, results: r.searches! * 6, cited: r.searches! * 2, confirmed: mine.length + 6, added: mine.length, failed: 0 }
      : { links: r.links, read: r.links, list: r.links, gated: 0, blocked: 0, failed: 0, articles: 22, added: mine.length };
    const log = r.kind === "ai"
      ? ["instant settlement GCC merchants", "instant payment scheme consultation", "cross-border corridor UK GCC fees", "agentic checkout retailers Gulf"].map((q, k) => ({ id: `demo-${i}-${k}`, q, pack: k === 3 ? "pillar" : k === 1 ? "event" : "pillar", engine: ENGINES_USED[k % 3], returned: 6, cited: 2, confirmed: 2 }))
      : LINKS.map(([url, name]) => ({ link: url, name, status: "list", articles: 4 }));
    return { id: id(T.discRun, i + 1), workspace_id: WS, kind: r.kind, trigger: r.kind === "crawl" ? "cron" : i === 3 ? "auto" : "manual", status: "done", window_days: 7, stats: J(stats), log: J(log), started_at: ago(r.mins), finished_at: ago(r.mins - 6), created_by: r.kind === "crawl" ? null : OWNER };
  });
  const findings: Row[] = FINDINGS.map((f, i) => ({
    id: id(T.finding, i + 1), workspace_id: WS, run_id: f.run ? id(T.discRun, f.run) : null, url: f.url, title: f.title, publisher: f.publisher, source_type: f.type,
    published: day(f.pub), confirmed: true, excerpt: `${f.title}. ${f.why}`, found_by: f.by,
    found: J(f.by.includes("linkedin") ? { linkedin: { author: f.author ?? "", author_url: li(f.author ?? "") } } : f.by.includes("ai") ? { ai: { engine: "openai", pack: "pillar", query: "instant settlement GCC merchants" } } : { crawl: { list: "Payments sources", link: LINKS[0][0] } }),
    scores: f.scores.map(String), scored_by: "ai", pillar: f.pillar, geo: f.geo, service: f.service, kind: f.kind, why: f.why, angle: f.angle, orgs: f.orgs,
    target: !!f.author, competitor: f.competitor ?? "", opp: J(f.opp ?? {}), gap: !!f.gap, status: f.status, dismiss_reason: f.dismiss ?? "", comment_target: !!f.comment,
    post_id: null, found_at: ago(f.found),
  }));

  // This week's Digest, ranked with the app's own maths, and the top topic sent to Content Studio as an idea.
  const evalF = evaluate(findings, REF_NOW).map((f) => ({ ...f, scores: (f.scores as string[]).map(Number) })) as unknown as Finding[];
  const evalPosts = evaluate(posts, REF_NOW) as { title: string; status: string; publish_date: string | null }[];
  const evalPeople = evaluate(people, REF_NOW) as { is_connection: boolean; company: string }[];
  const warm = (orgs: string[]) => orgs.reduce((a, o) => a + evalPeople.filter((p) => p.is_connection && normCompany(p.company) !== "" && normCompany(p.company) === normCompany(o)).length, 0);
  const ctx = { weights: DEFAULT_WEIGHTS, bands: DEFAULT_BANDS, today: ymdUTC(REF_NOW), warm, posts: evalPosts };
  const digest = selectDigest(buildTopics(evalF, ctx));
  const ten = [...digest.top, ...digest.list];
  const topics: Row[] = [], extraPosts: Row[] = [];
  ten.forEach((t, i) => {
    const tid = id(T.topic, i + 1);
    const sent = i === 0;
    const pid = id(T.post, POSTS.length + 1);
    topics.push({ id: tid, workspace_id: WS, week: thisMonday, key: t.key, title: t.title.slice(0, 300), finding_ids: t.ids, score: t.score, rank: i + 1, rising: false, parts: J({ ...t, sources: undefined }), merge_state: "", campaign_id: null, post_id: sent ? pid : null, sent_at: sent ? ago(60) : null, created_at: ago(100) });
    if (sent) {
      const p = topicPost(t, { workspace_id: WS, topic_id: tid, rank: 1, score: t.score });
      extraPosts.push({
        id: pid, workspace_id: WS, title: p.title, format: p.format, publish_date: null, status: p.status, topic: p.topic, resource: p.resource, draft: "", url: "",
        impressions: null, reactions: null, comments: null, created_at: ago(60), pillar: p.pillar, planned_time: "", channel: p.channel, hook: "",
        requested_by: null, requested_at: null, decided_by: null, decided_at: null, decision: "", angle: p.angle, source_kind: p.source_kind, discovery: J(p.discovery),
      });
      for (const fid of t.ids) { const f = findings.find((x) => x.id === fid)!; if (f.status === "new") { f.status = "sent"; f.post_id = pid; } }
    }
  });
  return { settings, lists, links, runs, findings, topics, extraPosts, digest };
}

// ---------- Profile Studio ----------
const PROFILE_V1 = `Contact
layla.haddad@northgate-payments.example.com
northgate-payments.example.com (Company)
Top Skills
Operations management
Payments
Team leadership
Languages
Arabic (Native or Bilingual)
English (Full Professional)
Layla Haddad
Chief Operating Officer at Northgate Payments
Dubai, United Arab Emirates
Summary
Operations leader with 15 years in payments. I run settlement and payment operations at Northgate Payments and before that I worked in card services. Interested in fintech, treasury and operations.
Experience
Northgate Payments
Chief Operating Officer
March 2021 - Present (5 years 8 months)
Dubai, United Arab Emirates
Running operations, risk and merchant support.
Crescent Card Services
Head of Payment Operations
June 2016 - February 2021 (4 years 9 months)
Dubai, United Arab Emirates
Settlement and reconciliation.
Education
Westbridge University
MSc, Finance`;

const PROFILE_V2 = `Contact
layla.haddad@northgate-payments.example.com
northgate-payments.example.com (Company)
Top Skills
Payment operations
Instant payments
Settlement
Languages
Arabic (Native or Bilingual)
English (Full Professional)
Layla Haddad
Chief Operating Officer at Northgate Payments | Instant payments and settlement for merchants
Dubai, United Arab Emirates
Summary
I run payment operations at Northgate Payments, where we settle card sales for merchants the same day. Over 15 years I have worked on settlement, merchant acquiring and cross-border payments across the GCC and the UK. At Northgate I lead operations, risk and merchant support for more than 4,000 merchants in three countries. Before Northgate I spent five years at Crescent Card Services running settlement and reconciliation for a regional acquirer. I write about what slow settlement costs merchants and how operations teams can run instant payments without losing control of exceptions.
Experience
Northgate Payments
Chief Operating Officer
March 2021 - Present (5 years 8 months)
Dubai, United Arab Emirates
I lead operations, risk and merchant support. We moved settlement from two days to same day for card merchants in the UAE and Saudi Arabia and cut reconciliation breaks by 40 percent. I run a team of 60 across Dubai, Riyadh and London.
Crescent Card Services
Head of Payment Operations
June 2016 - February 2021 (4 years 9 months)
Dubai, United Arab Emirates
Settlement and reconciliation for a regional acquirer.
Education
Westbridge University
MSc, Finance`;

const PROFILE_V3 = `Contact
layla.haddad@northgate-payments.example.com
northgate-payments.example.com (Company)
Top Skills
Instant payments
Settlement
Cross-border payments
Languages
Arabic (Native or Bilingual)
English (Full Professional)
Layla Haddad
${HEADLINE}
Dubai, United Arab Emirates
Summary
I help merchants and banks in the GCC get paid the same day. As Chief Operating Officer of Northgate Payments I run settlement, payment operations and merchant acquiring for more than 4,000 merchants in the UAE, Saudi Arabia and the UK, including the UK to GCC corridor for cross-border payments.
Over 15 years in payments I have learned that instant payments only work when operations, treasury and compliance are designed together. At Northgate we moved card settlement from two days to same day, cut reconciliation breaks by 40 percent and opened open banking payouts for marketplace merchants.
Before Northgate I spent five years at Crescent Card Services as Head of Payment Operations, running settlement and reconciliation for a regional acquirer, and three years in treasury operations at a UK bank.
I write every week about settlement speed, cross-border corridors, payment operations and how regulation turns into day-to-day controls. Stablecoins and agentic payments come up too, always from the operator's side.
If you run payments at a bank, PSP or large merchant in the GCC or the UK, send me a message. I am always happy to compare notes on settlement.
Experience
Northgate Payments
Chief Operating Officer
March 2021 - Present (5 years 8 months)
Dubai, United Arab Emirates
I lead payment operations, risk, compliance and merchant support. We moved settlement from two days to same day for card merchants in the UAE and Saudi Arabia, launched the UK to GCC payout corridor in 2024 and cut reconciliation breaks by 40 percent. I run a team of 60 across Dubai, Riyadh and London and own the treasury and liquidity model behind same-day payouts.
Crescent Card Services
Head of Payment Operations
June 2016 - February 2021 (4 years 9 months)
Dubai, United Arab Emirates
Ran settlement and reconciliation for a regional acquirer with 12,000 merchants. Built the exceptions team and the first daily settlement report for merchant acquiring.
Harbour Street Bank
Treasury Operations Manager
September 2013 - May 2016 (2 years 9 months)
London, United Kingdom
Treasury operations and cross-border payments for corporate clients.
Education
Westbridge University
MSc, Finance`;

function buildProfileDocs() {
  const docs: [string, string, number, string, Record<string, boolean>][] = [
    [PROFILE_V1, "Profile-Layla-Haddad.pdf", -26, "pdf", {}],
    [PROFILE_V2, "Profile-Layla-Haddad.pdf", -12, "pdf", { "m1-headline": true }],
    [PROFILE_V3, "Profile-Layla-Haddad.pdf", -2, "pdf", { "m1-headline": true, "m1-about": true, "m1-skills": true }],
  ];
  return docs.map(([raw, file, d, source, roadmapTicks], i): Row => {
    const parsed = parseProfile(raw);
    const audit = auditProfile(parsed, TOPICS);
    return { id: id(T.doc, i + 1), workspace_id: WS, subject: "self", prospect_id: null, source, file_name: file, raw_text: raw, parsed: J(parsed), audit: J({ ...audit, manual: {}, roadmap: roadmapTicks }), score: audit.score, created_by: OWNER, created_at: at(d, "15:10") };
  });
}

// ---------- the rest: templates, strategy, notes, threads, drafts, snapshots ----------
function buildRest() {
  const templates: Row[] = [
    ["Connection note after two comments", "note", "Hi {first}, I have enjoyed your posts on {topic}. I run operations at Northgate Payments and write about settlement in the GCC. Would be good to connect."],
    ["Connection note for a corridor contact", "note", "Hi {first}, I work on the UK to GCC corridor at Northgate Payments and saw your note on FX spreads. Happy to connect and compare notes."],
    ["First message after accepting", "message", "Thanks for connecting, {first}. Out of interest, how long does card settlement take for your merchants today? We see a wide range across the region."],
    ["Follow-up on settlement timing", "message", "Hi {first}, following up on settlement timing. I put together a short checklist we use when a merchant moves to same-day settlement. Would it be useful?"],
    ["Resource reply: settlement checklist", "resource", "Here is the checklist, {first}. Sections 2 and 3 cover reconciliation data and exception handling, which is where most of the work is."],
    ["Call offer after the resource", "call", "If it helps, I am happy to walk your team through how we run same-day payouts. Twenty minutes next week?"],
    ["Reply to a comment on my post", "reply", "Thank you, {first}. On your point about {point}: in our experience the exceptions team decides it, more than the rails do."],
  ].map(([name, kind, body], i) => ({ id: id(T.template, i + 1), workspace_id: WS, name, kind, body, sort: i }));
  const strategy: [string, string][] = [
    ["Goal for the quarter", "Be the operator people quote on same-day settlement in the GCC. Ten target accounts in conversation and three calls booked by the end of the quarter."],
    ["Who we target", "Heads of payments, settlement and treasury at GCC banks and PSPs; finance directors at hospitality and retail groups; the UK side of the UK to GCC corridor."],
    ["What Layla posts about", "Instant settlement, cross-border corridors, payments operations, regulation in practice and agentic commerce. Two to three posts a week, one carousel."],
    ["How we engage", "Five thoughtful comments a day on target accounts and industry voices. Request after two comments; first message on settlement timing; offer the checklist, then a call."],
  ];
  const notes: Row[] = [
    ...strategy.map(([title, body], i) => ({ id: id(T.note, i + 1), workspace_id: WS, kind: "strategy", title, body, sort: i, created_at: at(-27, hm(10, i * 5)), created_by: OWNER })),
    { id: id(T.note, 10), workspace_id: WS, kind: "note", title: "Call prep: Qasr Digital Bank", body: "Rania asked about dispute windows on instant payments and how we staff exceptions overnight. Bring the reconciliation numbers.", sort: 0, created_at: at(-1, "17:20"), created_by: OWNER },
    { id: id(T.note, 11), workspace_id: WS, kind: "note", title: "Post ideas from the hotel finance calls", body: "Finance teams care about next-morning money more than same-hour money. Peak season volumes break batch processes first.", sort: 0, created_at: at(-8, "12:05"), created_by: OWNER },
  ];
  const threads: Row[] = [
    { id: id(T.thread, 1), workspace_id: WS, ref_table: "prospects", ref_id: id(T.prospect, 1), author: OWNER, author_email: OWNER_EMAIL, body: "Call booked for Thursday. She wants to see the reconciliation report format.", created_at: at(-1, "16:45") },
    { id: id(T.thread, 2), workspace_id: WS, ref_table: "prospects", ref_id: id(T.prospect, 2), author: OWNER, author_email: OWNER_EMAIL, body: "Harbourline is reviewing its Gulf corridor partner next year. Keep the conversation on FX spreads.", created_at: at(-4, "11:10") },
    { id: id(T.thread, 3), workspace_id: WS, ref_table: "prospects", ref_id: id(T.prospect, 6), author: OWNER, author_email: OWNER_EMAIL, body: "Signed. Kick-off with their operations team is being scheduled.", created_at: at(-2, "14:30") },
  ];
  const drafts: Row[] = [
    [COMMENT_TEXTS[0], "Samir Nassar", "Operator lens", "Opinion", 88, 82],
    [COMMENT_TEXTS[4], "Dana Al Khalifa", "Question", "Announcement", 84, 86],
    [COMMENT_TEXTS[8], "Grace Mwangi", "Data point", "Data post", 81, 79],
  ].map(([text, author, style, type, human, impact], i) => ({ id: id(T.draft, i + 1), workspace_id: WS, kind: "comment", text: text as string, author: author as string, post_url: `https://linkedin.example.com/feed/update/demo-d${i + 1}`, style: style as string, post_type: type as string, human: human as number, impact: impact as number, source: "extension", created_by: OWNER, created_at: at(-1 - i * 2, "10:15") }));
  const series: Record<string, number[]> = { followers: [4120, 4210, 4335, 4460, 4580], impressions_7d: [9800, 12400, 15100, 17900, 19600], profile_views_90d: [1480, 1620, 1790, 1950, 2110], search_appearances: [210, 245, 290, 330, 365] };
  const snapshots: Row[] = [];
  [27, 20, 13, 6, 0].forEach((d, k) => Object.entries(series).forEach(([metric, v]) => snapshots.push({ workspace_id: WS, captured_at: d ? at(-d, "18:00") : ago(150), metric, value: v[k], period: "", source: "extension" })));
  const pov = J({ stances: ["Settlement speed is a merchant cash-flow issue before it is a technology issue.", "Instant payments need operations, treasury and compliance designed together."], proofs: [{ text: "Moved card settlement from two days to same day for UAE and Saudi merchants (demo figure)", cleared: true }], numbers: [{ value: "4,000 merchants", context: "Northgate Payments merchants (demo figure)" }], clients: [] });
  const content: Row[] = [{ workspace_id: WS, pov, newsletter: J({ name: "Settled", cadence: "fortnightly", weekday: 2 }) }];
  const reasons: Row[] = ["Timing: budget next year", "No need right now", "Chose another vendor", "No reply after three touches", "Not the decision maker"].map((label, i) => ({ id: id(T.reason, i + 1), workspace_id: WS, label, sort: i + 1 }));
  return { templates, notes, threads, drafts, snapshots, content, reasons };
}

// ---------- everything ----------
export function buildDemo() {
  const workspace: Row = {
    id: WS, slug: SLUG, name: PERSON, headline: HEADLINE, linkedin_url: "https://linkedin.example.com/in/laylahaddad", start_date: day(-28),
    quotas: J(QUOTAS), created_by: OWNER, created_at: at(-28, "09:00"), topics: TOPICS, voice: VOICE, company: COMPANY, pillars: PILLARS, regions: REGIONS,
    segments: J(SEGMENTS), is_demo: true,
  };
  const pipeline: Row = { id: PIPE, workspace_id: WS, name: "Outreach", template: "outreach", stages: STAGES, won_stage: "Won", lost_stage: "Parked", sort: 0 };
  const pipe = buildPipeline();
  const daily = buildDaily(pipe);
  const posts = buildPosts();
  const net = buildNetwork(pipe);
  const cit = buildCitations();
  const disc = buildDiscovery(posts, net.people);
  const docs = buildProfileDocs();
  const rest = buildRest();
  const tables: Table[] = [
    { name: "workspaces", rows: [workspace], note: "The profile. The owner membership comes from the workspace trigger (created_by)." },
    { name: "pipelines", rows: [pipeline], note: "Pipeline" },
    { name: "lost_reasons", rows: rest.reasons, note: "" },
    { name: "prospects", rows: pipe.prospects, note: `${pipe.prospects.length} prospects across every stage` },
    { name: "stage_moves", rows: pipe.moves, note: "Stage history" },
    { name: "daily_items", rows: daily.items, note: "Today: the last 27 days and today" },
    { name: "comment_log", rows: daily.comments, note: "Engagement: one logged comment per finished comment task" },
    { name: "activity", rows: daily.acts, note: "Activity feed" },
    { name: "ext_usage", rows: daily.usage, note: "Drafting stats" },
    { name: "saved_drafts", rows: rest.drafts, note: "" },
    { name: "posts", rows: [...posts, ...disc.extraPosts], note: "Content Studio" },
    { name: "templates", rows: rest.templates, note: "" },
    { name: "notes", rows: rest.notes, note: "Strategy and notes" },
    { name: "threads", rows: rest.threads, note: "Notes on leads" },
    { name: "content_settings", rows: rest.content, note: "" },
    { name: "network_imports", rows: net.imports, note: "Network" },
    { name: "network_settings", rows: net.settings, note: "" },
    { name: "network_people", rows: net.people, note: "" },
    { name: "network_posts", rows: net.posts, note: "" },
    { name: "citation_profiles", rows: cit.profiles, note: "AI citations" },
    { name: "citation_profile_picks", rows: cit.picks, note: "" },
    { name: "citation_entities", rows: cit.entities, note: "" },
    { name: "citation_questions", rows: cit.questions, note: "" },
    { name: "citation_runs", rows: cit.runs, note: "Four weekly batches, the latest about two hours ago" },
    { name: "citation_sources", rows: cit.sources, note: "" },
    { name: "citation_facts", rows: cit.facts, note: "" },
    { name: "citation_recs", rows: cit.recs, note: "" },
    { name: "discovery_settings", rows: disc.settings, note: "Discovery Studio" },
    { name: "discovery_lists", rows: disc.lists, note: "" },
    { name: "discovery_links", rows: disc.links, note: "" },
    { name: "discovery_runs", rows: disc.runs, note: "" },
    { name: "discovery_findings", rows: disc.findings, note: "" },
    { name: "discovery_topics", rows: disc.topics, note: "This week's Digest as Discovery ranks it" },
    { name: "profile_docs", rows: docs, note: "Profile Studio: three reviews" },
    { name: "snapshots", rows: rest.snapshots, note: "LinkedIn reach" },
  ];
  return { tables, sql: toSql(tables), digest: disc.digest };
}

// ---------- SQL ----------
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
function lit(v: Val): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return q(v);
  if (isTime(v)) return v.sql;
  if (isRaw(v)) return v.raw;
  if (isJson(v)) return q(JSON.stringify(v.json));
  if (Array.isArray(v)) return q(`{${v.map((x) => `"${String(x).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`);
  throw new Error(`Unknown value ${JSON.stringify(v)}`);
}

function insert(t: Table): string {
  if (!t.rows.length) return "";
  const cols = Object.keys(t.rows[0]);
  for (const r of t.rows) if (Object.keys(r).join() !== cols.join()) throw new Error(`${t.name}: rows have different columns`);
  const out: string[] = [];
  for (let i = 0; i < t.rows.length; i += 200) {
    const chunk = t.rows.slice(i, i + 200);
    out.push(`insert into ${t.name} (${cols.join(", ")}) values\n${chunk.map((r) => `  (${cols.map((c) => lit(r[c])).join(", ")})`).join(",\n")};`);
  }
  return `-- ${t.name}${t.note ? `: ${t.note}` : ""}\n${out.join("\n")}`;
}

const HEADER = `-- Demo profile (Q120): Layla Haddad, Chief Operating Officer of Northgate Payments. Both are invented, as are every
-- person, firm and site in this file (all links use example.com hosts). About four weeks of history in every section,
-- for showing Prax to prospects instead of a real executive's data. The profile is marked is_demo and shows a Demo tag.
--
-- GENERATED by scripts/demo-profile.ts. Do not edit by hand: change the script, then run node scripts/demo-profile.ts.
-- node scripts/test-demo.ts checks the data agrees across sections (and that this file matches the script).
--
-- How to run (after db/017; it uses the columns from 002 to 017 and adds workspaces.is_demo):
--   1. Put the email you sign in to Prax with on the line marked OWNER EMAIL below. That user becomes the demo's owner.
--      Left as owner@example.com, the seed uses auth.uid() instead (only set when run as a signed-in user), else stops.
--   2. Run the whole file in the Supabase SQL editor. It is one transaction, and re-runnable: each run deletes the
--      previous demo profile (fixed id, or slug demo-layla-haddad with is_demo) and writes it again with dates
--      relative to today, so run it again before a demo to bring the history up to date.
--   3. Open Prax: the profile "Layla Haddad" carries a Demo tag. Nothing else is touched.
-- How to remove it: the commented delete block at the bottom, or Settings > Archive, then Delete permanently.
-- Dates use the database's day (UTC). Comment triggers are paused while the rows go in, so the history keeps its own times.

begin;

alter table workspaces add column if not exists is_demo boolean not null default false;

select set_config('prax.demo_owner_email', 'owner@example.com', false);  -- OWNER EMAIL: put your sign-in email here

do $$ declare u uuid; e text := current_setting('prax.demo_owner_email');
begin
  select id into u from auth.users where lower(email) = lower(e) and e <> 'owner@example.com' limit 1;
  u := coalesce(u, auth.uid());
  if u is null then
    raise exception 'Demo profile: no Prax user with the email %. Set OWNER EMAIL at the top of db/019_demo_profile.sql.', e;
  end if;
  perform set_config('prax.demo_owner', u::text, false);
  perform set_config('prax.demo_owner_email', coalesce((select email from auth.users where id = u), e), false);
end $$;

-- The previous demo copy, if any. Every table cascades from workspaces.
delete from workspaces where id = '${WS}' or (slug = '${SLUG}' and is_demo);

-- Shorthand for the owner in the rows below (lives only for this session).
create or replace function pg_temp.demo_owner() returns uuid language sql stable as $f$ select current_setting('prax.demo_owner')::uuid $f$;

alter table comment_log disable trigger comment_logged;
`;

const FOOTER = `
alter table comment_log enable trigger comment_logged;

-- InMail tasks exist on weekdays only (as Today builds them), so weekend ones go, with their feed rows.
delete from activity where workspace_id = '${WS}' and kind = 'inmail' and extract(isodow from at) > 5;
delete from daily_items where workspace_id = '${WS}' and kind = 'inmail' and extract(isodow from day) > 5;

commit;

select 'ok' as status, (select name from workspaces where id = '${WS}') as profile,
  (select count(*) from prospects where workspace_id = '${WS}') as prospects,
  (select u.email from members m join auth.users u on u.id = m.user_id where m.workspace_id = '${WS}' and m.role = 'owner' limit 1) as owner;

-- ---------- remove the demo profile ----------
-- Removes the demo workspace and everything in it (every table cascades from workspaces). Uncomment and run.
-- delete from workspaces where id = '${WS}' and is_demo;
`;

export function toSql(tables: Table[]) {
  return `${HEADER}\n${tables.map(insert).filter(Boolean).join("\n\n")}\n${FOOTER}`;
}

export const SQL_PATH = fileURLToPath(new URL("../db/019_demo_profile.sql", import.meta.url));

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { sql, tables } = buildDemo();
  writeFileSync(SQL_PATH, sql);
  console.log(`Wrote ${SQL_PATH}: ${tables.reduce((a, t) => a + t.rows.length, 0)} rows in ${tables.length} tables, ${Math.round(sql.length / 1024)} KB`);
}
