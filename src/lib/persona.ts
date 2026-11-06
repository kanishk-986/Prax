// Who a profile is, in one place: name, first name, role, company and the per-profile strategy lists
// (pillars, focus regions, segment names). Every screen, prompt and report reads these instead of a fixed person.
// A missing field falls back to neutral wording. No React, so scripts/test-persona.ts can check it.

export type Persona = {
  name?: string | null; headline?: string | null; company?: string | null; linkedin_url?: string | null;
  pillars?: string[] | null; regions?: string[] | null; segments?: Record<string, string> | null;
};

const clean = (s?: string | null) => (s ?? "").replace(/\s+/g, " ").trim();
/** First letter upper case, for a fallback that starts a sentence ("This profile"). */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "Maya" gives "Maya's", "James" gives "James'". */
export const possessive = (s: string) => (/s$/i.test(s) ? `${s}'` : `${s}'s`);

export const fullNameOf = (p: Persona, fallback = "this profile") => clean(p.name) || fallback;
export const firstNameOf = (p: Persona, fallback = "this profile") => clean(p.name).split(" ")[0] || fallback;

/** The company field, else the part after "at" in the headline ("COO at Acme | Payments" gives "Acme"). */
export function companyOf(p: Persona, fallback = "the company") {
  const c = clean(p.company);
  if (c) return c;
  const m = clean(p.headline).match(/(?:^|\s)(?:at|@)\s+([^|·•,]+)/i);
  return m ? m[1].trim() : fallback;
}

/** The role: the first part of the headline, without "at Company" ("Co-Founder and COO at Acme | ..." gives "Co-Founder and COO"). */
export function roleOf(p: Persona, fallback = "") {
  const first = clean(p.headline).split(/\s+[|·•]\s+/)[0] ?? "";
  const c = clean(p.company);
  let r = first.replace(/\s+(?:at|@)\s+.*$/i, "");
  if (c) r = r.replace(new RegExp(`\\s*[,-]\\s*${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"), "");
  return r.trim() || fallback;
}

/** One line for AI prompts: "Maya Rao, Co-Founder and COO at Acme"; only the parts that are known. */
export function whoLine(p: Persona) {
  const role = roleOf(p), company = companyOf(p, "");
  return `${fullNameOf(p, "the profile owner")}${role ? `, ${role}` : ""}${company ? `${role ? " at" : ", at"} ${company}` : ""}`;
}

/** Up to two initials for an avatar: "Maya Rao" gives "MR"; nothing known gives "P". */
export const initialsOf = (name: string) => clean(name).split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "P";

const list = (xs?: string[] | null) => [...new Set((xs ?? []).map(clean).filter(Boolean))];
/** Content pillars set in Settings. Empty for a new profile. */
export const pillarsOf = (p: Persona) => list(p.pillars);
/** Focus regions set in Settings ("GCC", "India"). Empty for a new profile. */
export const regionsOf = (p: Persona) => list(p.regions);
/** "GCC and India", "GCC, India and Africa"; the fallback when no region is set. */
export function regionText(p: Persona, fallback = "") {
  const r = regionsOf(p);
  return r.length <= 1 ? r[0] ?? fallback : `${r.slice(0, -1).join(", ")} and ${r[r.length - 1]}`;
}

// ---------- network segments: fixed letters and colours, names per profile ----------
export const SEGMENT_BASE: Record<string, { label: string; color: string }> = {
  A: { label: "Core buyers", color: "#d64545" },
  B: { label: "Priority region", color: "#a3231c" },
  C: { label: "Partnerships & growth", color: "#e8837b" },
  D: { label: "Second region", color: "#7a2e2a" },
  E: { label: "Industry voices", color: "#b9a19d" },
};
/** The five segments with this profile's names from Settings; a blank name keeps the neutral one. */
export function segmentsOf(p: Persona): Record<string, { label: string; color: string }> {
  const names = p.segments ?? {};
  return Object.fromEntries(Object.entries(SEGMENT_BASE).map(([k, v]) => [k, { ...v, label: clean(names[k]) || v.label }]));
}

/** posts.channel for the profile's own posts (the other value is "company"). The stored value predates
 *  multi-profile Prax and is kept as it is, so saved posts and filters keep working; it is never shown. */
export const PROFILE_CHANNEL = "shashi" as const;
export type Channel = typeof PROFILE_CHANNEL | "company";

/** Split a comma or line separated Settings field into a clean list. */
export const splitList = (s: string) => list(s.split(/[,\n]/));
