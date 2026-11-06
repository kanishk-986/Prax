// Templates section logic: the one word a template is for, its variables, the sample fill for the live preview,
// filtering and the starter set. Pure functions, tested in scripts/test-templates.ts.

export type Template = { id: string; workspace_id?: string; name: string; kind: string; body: string; sort: number; created_at?: string; updated_at?: string; created_by?: string | null };

/** The type column stores short words; people read these names. */
export const KIND_LABEL: Record<string, string> = { note: "Connection note", message: "Message", inmail: "InMail", reply: "Reply", post: "Post", resource: "Resource reply", call: "Call offer" };

/** What a template is for, in one word. Its order is the grid order and the filter order. */
export const PURPOSES = ["Connect", "Follow-up", "Message", "Thank you", "Resource", "Call", "InMail", "Reply", "Reshare", "Prompt", "Post"] as const;
export type Purpose = (typeof PURPOSES)[number];

/** The word from the type and the name. Resource replies and call offers were saved as messages before they had their
 *  own type, so their names place them too. */
export function purposeOf(t: { kind?: string; name?: string }): Purpose {
  const n = (t.name ?? "").toLowerCase(), k = t.kind ?? "";
  if (k === "inmail" || /\binmail\b/.test(n)) return "InMail";
  if (k === "call" || n.startsWith("call offer")) return "Call";
  if (k === "resource" || n.startsWith("resource reply")) return "Resource";
  if (k === "note") return "Connect";
  if (/reshare/.test(n)) return "Reshare";
  if (/thank/.test(n)) return "Thank you";
  if (k === "reply") return "Reply";
  if (k === "post") return /prompt/.test(n) ? "Prompt" : "Post";
  if (/follow|first message|after (they )?accept/.test(n)) return "Follow-up";
  return "Message";
}

const VAR = /\[([^\]\n]{1,90})\]|\{([A-Za-z][\w ]{0,39})\}/g;

/** Variables as written in the text, each once, in order: "[First name]" and "{first}" both count. */
export function variablesOf(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(VAR)) if (!out.includes(m[0])) out.push(m[0]);
  return out;
}

export type Piece = { text: string; variable?: string };
/** The text cut into plain runs and variables, for highlighting. */
export function piecesOf(body: string): Piece[] {
  const out: Piece[] = [];
  let at = 0;
  for (const m of body.matchAll(VAR)) {
    if (m.index! > at) out.push({ text: body.slice(at, m.index) });
    out.push({ text: m[0], variable: (m[1] ?? m[2]).trim() });
    at = m.index! + m[0].length;
  }
  if (at < body.length) out.push({ text: body.slice(at) });
  return out;
}

/** Sample values for the live preview. Keys are lower case; a variable matches when its name is a key. */
export const SAMPLE: Record<string, string> = {
  "first name": "Rania", first: "Rania", name: "Rania", "last name": "Haddad", last: "Haddad",
  company: "Qasr Digital Bank", "their company": "Qasr Digital Bank", institution: "Qasr Digital Bank", "their institution type": "digital bank",
  topic: "instant settlement", "their topic": "instant settlement", role: "payments", "their role": "payments operations",
  resource: "settlement checklist", "resource name": "settlement checklist", keyword: "CHECKLIST", point: "exception handling",
  "two specific slots": "Tuesday at 11 or Wednesday at 3", n: "2", "their market or role": "UAE payments",
};

/** The sample for one variable, or null when there is none (the preview then keeps the placeholder, marked). */
export const sampleFor = (variable: string): string | null => SAMPLE[variable.trim().toLowerCase()] ?? null;

/** Filter by purpose ("All" for every one) and a search over the word, name and text. Grid order: purpose, then sort. */
export function visibleTemplates<T extends Template>(rows: T[], purpose: string, query: string): T[] {
  const q = query.trim().toLowerCase();
  const rank = (t: T) => PURPOSES.indexOf(purposeOf(t));
  return rows
    .filter((t) => purpose === "All" || purposeOf(t) === purpose)
    .filter((t) => !q || `${purposeOf(t)} ${t.name} ${t.body}`.toLowerCase().includes(q))
    .sort((a, b) => rank(a) - rank(b) || (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name));
}

/** Filter chips: All, then each purpose present, with counts. */
export function purposeCounts(rows: Template[]): { id: string; count: number }[] {
  const m = new Map<string, number>();
  rows.forEach((t) => m.set(purposeOf(t), (m.get(purposeOf(t)) ?? 0) + 1));
  return [{ id: "All", count: rows.length }, ...PURPOSES.filter((p) => m.has(p)).map((p) => ({ id: p, count: m.get(p)! }))];
}

/** The order a new template takes: after the last one. */
export const nextSort = (rows: { sort?: number | null }[]) => rows.reduce((m, r) => Math.max(m, r.sort ?? 0), -1) + 1;

/** A calm first set for a new profile: the outreach sequence from connection to call. No dashes or contractions. */
export const STARTERS: Pick<Template, "name" | "kind" | "body">[] = [
  { name: "Connection note: value then question", kind: "note", body: "[First name], on [their recent post]: [one fact they probably have not seen], so [what it means for their job]. [One specific question]?" },
  { name: "First message after they accept", kind: "message", body: "Thanks for connecting, [First name]. Following on from [topic]: [the next layer of the same point, with one sourced fact]. In your experience, how does your team handle it?" },
  { name: "Resource reply", kind: "resource", body: "[First name], here is the [resource name] I mentioned. Page [n] is the part most [their role] teams ask about first. Happy to hear which item looks hardest from where you sit." },
  { name: "Call offer", kind: "call", body: "[First name], this is a useful thread. If it helps, I can take 20 minutes to walk through how we would approach [their problem]. Does [two specific slots] work on your side?" },
  { name: "Reply to a comment on my post", kind: "reply", body: "Thank you, [First name]. [Build on their strongest point]. From what you see in [their market or role], [one question]?" },
  { name: "InMail after two comments", kind: "inmail", body: "Subject: [topic]\n\n[First name], after your post on [topic], one point that may be useful: [fact and what it means]. I put together a one-page [resource name] on it. Would it be useful if I sent it across?" },
];
