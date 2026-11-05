// Parses LinkedIn profile text (Save-to-PDF export or pasted page text) and audits it
// against the signals LinkedIn's ranking reads from a profile: a clear headline, an About
// that names the topics early, a current role that proves them, and matching skills.

export type Role = { title: string; company: string; dates: string; current: boolean; description: string };
export type Parsed = {
  name: string; headline: string; location: string; about: string;
  skills: string[]; languages: string[]; certifications: string[];
  experience: Role[]; education: string[]; url: string; email: string; website: string;
};
export type Check = { id: string; area: string; label: string; pass: boolean; points: number; max: number; fix: string };
export type Audit = { score: number; areas: { area: string; points: number; max: number }[]; checks: Check[] };

const SIDE = ["Contact", "Top Skills", "Languages", "Certifications", "Honors-Awards", "Publications", "Patents"];
const MAIN = ["Summary", "About", "Experience", "Education", "Licenses & certifications", "Skills"];
const DATE = /^((January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+)?\d{4}\s*[-–]\s*(Present|((January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+)?\d{4})/i;

export function parseProfile(raw: string): Parsed {
  const lines = raw.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l && !/^Page \d+ of \d+$/i.test(l));
  const p: Parsed = { name: "", headline: "", location: "", about: "", skills: [], languages: [], certifications: [], experience: [], education: [], url: "", email: "", website: "" };
  const text = lines.join("\n");
  p.url = text.match(/(www\.)?linkedin\.com\/in\/[\w-]+/i)?.[0] ?? "";
  p.email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? "";
  p.website = lines.find((l) => /\((Company|Personal|Other|Blog|Portfolio)\)$/.test(l))?.replace(/\s*\(.*\)$/, "") ?? "";

  // Split into named sections; anything before the first main section is the header block.
  const sections: Record<string, string[]> = {};
  let cur = "_head";
  for (const l of lines) {
    const h = [...SIDE, ...MAIN].find((s) => s.toLowerCase() === l.toLowerCase());
    if (h) { cur = h === "About" ? "Summary" : h === "Licenses & certifications" ? "Certifications" : h; continue; }
    (sections[cur] ||= []).push(l);
  }
  const side = (k: string) => (sections[k] ?? []).filter((l) => l.length < 80);
  p.skills = side("Top Skills").concat(side("Skills")).slice(0, 50);
  p.languages = side("Languages");
  p.certifications = side("Certifications");

  // In the PDF the name, headline and location sit just before Summary, after the sidebar.
  const head = [...(sections["_head"] ?? []), ...(sections["Contact"] ?? []).slice(-3), ...(sections["Top Skills"] ?? []).slice(-3), ...(sections["Languages"] ?? []).slice(-3), ...(sections["Certifications"] ?? []).slice(-3)];
  const nameIdx = head.findIndex((l, i) => i < head.length - 1 && /^[A-Z][\p{L}.'-]+( [A-Z][\p{L}.'-]+){1,3}$/u.test(l) && head[i + 1].length > 15);
  if (nameIdx >= 0) {
    p.name = head[nameIdx];
    const rest = head.slice(nameIdx + 1);
    const locIdx = rest.findIndex((l) => /,/.test(l) && l.length < 60 && !/[|@]/.test(l));
    p.headline = (locIdx > 0 ? rest.slice(0, locIdx) : rest.slice(0, 1)).join(" ");
    p.location = locIdx > 0 ? rest[locIdx] : "";
  } else {
    p.name = head[0] ?? "";
    p.headline = head[1] ?? "";
  }
  const headLines = new Set([p.name, p.location, ...head.slice(Math.max(nameIdx, 0))]);
  const notHead = (l: string) => !headLines.has(l);
  p.skills = p.skills.filter(notHead);
  p.languages = p.languages.filter(notHead);
  p.certifications = p.certifications.filter(notHead);
  p.about = (sections["Summary"] ?? []).join(" ");

  // Experience: a date line closes a role header; lines before it are company and title.
  const ex = sections["Experience"] ?? [];
  let buf: string[] = [];
  let role: Role | null = null;
  for (const l of ex) {
    if (DATE.test(l)) {
      const hdr = buf.splice(-2);
      if (role) role.description = desc(buf);
      role = { company: hdr.length === 2 ? hdr[0] : (p.experience.at(-1)?.company ?? ""), title: hdr[hdr.length - 1] ?? "", dates: l, current: /present/i.test(l), description: "" };
      p.experience.push(role);
      buf = [];
    } else buf.push(l);
  }
  if (role) role.description = desc(buf);
  p.education = (sections["Education"] ?? []).filter((l) => l.length < 120).slice(0, 8);
  return p;
}

// Role text minus the location line LinkedIn prints under the dates.
const desc = (b: string[]) => (b.length && /^[\p{L} .-]+(, [\p{L} .-]+)+$/u.test(b[0]) && b[0].length < 60 ? b.slice(1) : b).join(" ").trim();

// Case-insensitive, and "stablecoin" counts for "stablecoins".
const has = (s: string, t: string) => s.toLowerCase().includes(t.toLowerCase().replace(/s$/, ""));
const hits = (s: string, topics: string[]) => topics.filter((t) => has(s, t));

export function auditProfile(p: Parsed, topics: string[]): Audit {
  const checks: Check[] = [];
  const add = (area: string, id: string, label: string, pass: boolean, max: number, fix: string) => checks.push({ id, area, label, pass, points: pass ? max : 0, max, fix });
  const tp = topics.length ? topics : ["(set topics in Profile Studio)"];
  const cur = p.experience.find((r) => r.current) ?? p.experience[0];

  const hl = p.headline;
  add("Headline", "hl-len", "Headline is 60 to 220 characters", hl.length >= 60 && hl.length <= 220, 5, `It is ${hl.length} characters. Use the space: role, the two topics you want to be known for, and who you help.`);
  add("Headline", "hl-topics", "Headline names at least two target topics", hits(hl, tp).length >= 2, 8, `Found ${hits(hl, tp).join(", ") || "none"}. Put two of: ${tp.slice(0, 5).join(", ")}.`);
  add("Headline", "hl-role", "Headline states a role or seniority", /(founder|co-founder|ceo|coo|cto|cfo|chief|head|director|vp|partner|lead|president|managing)/i.test(hl), 3, "Lead with the role a buyer recognises, e.g. Co-Founder & COO.");
  add("Headline", "hl-who", "Headline says who you help or what you build", /\b(for|helping|help|building|build|with)\b/i.test(hl), 4, "Add who it is for: \"for banks and payment firms\" reads clearer than a list of nouns.");

  const ab = p.about;
  add("About", "ab-present", "About section exists", ab.length > 0, 5, "Write an About. It is the longest text LinkedIn reads to decide what you are an authority on.");
  add("About", "ab-len", "About is 1,000 to 2,600 characters", ab.length >= 1000 && ab.length <= 2600, 5, `It is ${ab.length} characters. Aim for roughly 1,500: enough proof, still readable.`);
  add("About", "ab-early", "A target topic appears in the first 220 characters", hits(ab.slice(0, 220), tp).length > 0, 6, "Only the first lines show before \"see more\". Name the core topic there.");
  add("About", "ab-proof", "About carries numbers or named proof", /\d/.test(ab), 5, "Add counted proof: years, deployments, markets, clients, volumes.");
  add("About", "ab-cta", "About ends with a way to reach you", /(reach|contact|connect|message|dm|email|write to|talk|book|call)/i.test(ab.slice(-400)), 4, "Close with one plain line on how to start a conversation.");

  const all = `${hl} ${ab} ${p.experience.map((r) => `${r.title} ${r.description}`).join(" ")} ${p.skills.join(" ")}`;
  const share = topics.length ? hits(all, topics).length / topics.length : 0;
  add("Topics", "tp-cover", "Profile covers at least 60% of target topics", share >= 0.6, 12, `Covers ${Math.round(share * 100)}%. Missing: ${topics.filter((t) => !has(all, t)).join(", ") || "none"}.`);
  add("Topics", "tp-focus", "Headline and About agree on the same topics", hits(hl, tp).some((t) => has(ab, t)), 8, "Repeat the headline topics in the About so the profile reads as one specialism.");

  add("Experience", "ex-cur", "Current role has a description of 300+ characters", (cur?.description.length ?? 0) >= 300, 7, "Describe the current role: what you run, for whom, and results.");
  add("Experience", "ex-num", "Current role shows quantified outcomes", /\d/.test(cur?.description ?? ""), 5, "Add at least one number to the current role.");
  add("Experience", "ex-topics", "Current role mentions target topics", hits(cur?.description ?? "", tp).length > 0, 5, "Tie the current role to the topics you post about.");
  add("Experience", "ex-depth", "At least two roles listed", p.experience.length >= 2, 3, "List earlier roles; tenure is part of credibility.");

  add("Skills", "sk-present", "Skills are listed", p.skills.length >= 3, 4, "Add at least three skills (the PDF shows your top three).");
  add("Skills", "sk-topics", "Top skills match target topics", hits(p.skills.join(" "), tp).length > 0, 6, "Pin skills that match your topics as the top three.");

  add("Contact", "ct-url", "Custom profile URL", /linkedin\.com\/in\/[a-z-]+$/i.test(p.url) && !/\d{4,}/.test(p.url), 3, "Set a clean custom URL (no trailing numbers).");
  add("Contact", "ct-web", "Website or email listed", !!(p.website || p.email), 2, "Add the company site to Contact info.");

  const areas = ["Headline", "About", "Topics", "Experience", "Skills", "Contact"].map((area) => {
    const c = checks.filter((x) => x.area === area);
    return { area, points: c.reduce((s, x) => s + x.points, 0), max: c.reduce((s, x) => s + x.max, 0) };
  });
  return { score: checks.reduce((s, x) => s + x.points, 0), areas, checks };
}

// Things the PDF cannot show; ticked by hand in Profile Studio.
export const MANUAL = [
  { id: "m-banner", label: "Banner states the specialism in one line" },
  { id: "m-photo", label: "Recent, well-lit headshot" },
  { id: "m-featured", label: "Featured section holds a flagship post or resource" },
  { id: "m-creator", label: "Creator mode topics match the target topics" },
  { id: "m-services", label: "Services or company page linked" },
  { id: "m-recs", label: "At least two recent recommendations" },
];

// Where each target topic shows up, and how strongly the profile owns it.
export type TopicRow = { topic: string; headline: boolean; about: boolean; role: boolean; skills: boolean; other: boolean; strength: "strong" | "thin" | "missing" };
export function topicReport(p: Parsed, topics: string[]): TopicRow[] {
  const cur = p.experience.find((r) => r.current) ?? p.experience[0];
  const older = p.experience.filter((r) => r !== cur).map((r) => `${r.title} ${r.description}`).join(" ");
  return topics.map((t) => {
    const r = { topic: t, headline: has(p.headline, t), about: has(p.about, t), role: has(`${cur?.title ?? ""} ${cur?.description ?? ""}`, t), skills: has(p.skills.join(" "), t), other: has(older, t) };
    const n = [r.headline, r.about, r.role, r.skills, r.other].filter(Boolean).length;
    return { ...r, strength: n >= 3 && (r.headline || r.about) ? "strong" : n > 0 ? "thin" : "missing" };
  });
}

const list = (xs: string[]) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export function prosCons(p: Parsed, audit: Audit, rows: TopicRow[]) {
  const pros: string[] = [], cons: string[] = [];
  const strong = rows.filter((r) => r.strength === "strong").map((r) => r.topic);
  const thin = rows.filter((r) => r.strength === "thin").map((r) => r.topic);
  const missing = rows.filter((r) => r.strength === "missing").map((r) => r.topic);
  if (strong.length) pros.push(`${list(strong)} ${strong.length > 1 ? "appear" : "appears"} across the headline or About and the work history, so LinkedIn can read ${strong.length > 1 ? "them" : "it"} as a real specialism.`);
  if (thin.length) cons.push(`${list(thin)} ${thin.length > 1 ? "are" : "is"} mentioned only once or twice. That reads as an interest, not expertise.`);
  if (missing.length) cons.push(`${list(missing)} ${missing.length > 1 ? "are" : "is"} not on the profile at all, so there is no signal to show this person for ${missing.length > 1 ? "those topics" : "that topic"}.`);
  const byId = Object.fromEntries(audit.checks.map((c) => [c.id, c]));
  const say = (id: string, pro: string, con: string) => { const c = byId[id]; if (c) (c.pass ? pros : cons).push(c.pass ? pro : con); };
  say("hl-topics", "The headline names the target topics, which is the strongest single text signal on a profile.", "The headline does not name enough target topics; it is the first text LinkedIn and readers weigh.");
  say("ab-early", "The About opens on a target topic, so the part shown before \"see more\" does work.", "The About does not reach a target topic before the \"see more\" cut.");
  say("ab-proof", "The About carries numbers, which reads as proof rather than claims.", "The About has no numbers; claims without counts read as marketing.");
  say("ex-cur", "The current role is described in enough depth to back the headline.", "The current role is thin, so the headline has nothing underneath it.");
  say("ex-num", "The current role shows measured outcomes.", "The current role shows no measured outcomes.");
  say("sk-topics", "Top skills match the target topics.", "Top skills do not match the target topics; pin the matching ones first.");
  if (p.experience.length >= 3) pros.push(`${p.experience.length} roles listed gives the tenure that senior buyers look for.`);
  return { pros, cons };
}

export type Step = { id: string; month: 1 | 2 | 3; text: string; why: string };
export const TOP_TIER = 90;

// Three months from the profile's own gaps: fix the profile, build topic authority, convert.
export function roadmap(audit: Audit, rows: TopicRow[], manual: Record<string, boolean>): Step[] {
  const s: Step[] = [];
  const weak = rows.filter((r) => r.strength !== "strong").sort((a, b) => (a.strength === "missing" ? 0 : 1) - (b.strength === "missing" ? 0 : 1));
  audit.checks.filter((c) => !c.pass).sort((a, b) => b.max - a.max).forEach((c) => s.push({ id: `fix-${c.id}`, month: 1, text: c.label, why: `${c.fix} (+${c.max} points)` }));
  MANUAL.filter((m) => !manual[m.id]).forEach((m) => s.push({ id: `fix-${m.id}`, month: 1, text: m.label, why: "Not readable from the PDF, but readers and the feed both use it." }));
  s.push({ id: "m1-reupload", month: 1, text: "Upload a fresh PDF at the end of month 1", why: "Confirms the fixes landed and resets the baseline." });

  const focus = weak.slice(0, 3).map((r) => r.topic);
  if (focus.length) {
    s.push({ id: "m2-posts", month: 2, text: `Publish 6 posts on ${list(focus)}`, why: "Posting on a topic is how LinkedIn learns to show the profile for it; two posts per topic in four weeks." });
    s.push({ id: "m2-comments", month: 2, text: `Leave 40 substantive comments on posts about ${list(focus)}`, why: "Comments on topic posts tie the name to the topic and put it in front of buyers before any request." });
    weak.filter((r) => !r.headline && !r.about).slice(0, 2).forEach((r) => s.push({ id: `m2-place-${r.topic}`, month: 2, text: `Work "${r.topic}" into the About and the current role`, why: "A topic you post about but never claim on the profile looks borrowed." }));
  } else {
    s.push({ id: "m2-posts", month: 2, text: "Keep 3 posts a week on the strongest topics", why: "Every topic is already strong; consistency holds the position." });
  }
  s.push({ id: "m2-featured", month: 2, text: "Pin the best performing topic post to Featured", why: "Turns a one-day post into a permanent proof point on the profile." });

  s.push({ id: "m3-warm", month: 3, text: "Move 20 prospects from Target to Warming through comments", why: "Authority only pays when the right people have seen the name before a request." });
  s.push({ id: "m3-requests", month: 3, text: "Send connection notes to the warmed prospects, value first", why: "A request from a name they have already seen is easier to accept than a cold one." });
  s.push({ id: "m3-calls", month: 3, text: "Book 3 calls from conversations", why: "The commercial test of the profile and the content." });
  s.push({ id: "m3-score", month: 3, text: `Re-upload and reach ${TOP_TIER}+ with every target topic strong`, why: "The top-tier bar this roadmap aims at." });
  return s;
}
