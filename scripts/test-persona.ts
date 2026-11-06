// Checks the profile helpers every screen and prompt uses, and their neutral fallbacks. Run: node scripts/test-persona.ts
import { readFileSync } from "node:fs";
import { fullNameOf, firstNameOf, companyOf, roleOf, whoLine, possessive, cap, initialsOf, pillarsOf, regionsOf, regionText, segmentsOf, splitList, SEGMENT_BASE } from "../src/lib/persona.ts";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

const full = { name: "Maya  Rao", headline: "Co-Founder and COO at Acme | Payments", company: "Acme Labs", linkedin_url: "linkedin.com/in/mayarao" };
const bare = { name: "", headline: "", company: "" };

// Names.
eq("full name, spaces tidied", fullNameOf(full), "Maya Rao");
eq("first name", firstNameOf(full), "Maya");
eq("no name: neutral full name", fullNameOf(bare), "this profile");
eq("no name: neutral first name", firstNameOf(bare), "this profile");
eq("own fallback wins", firstNameOf(bare, ""), "");
eq("possessive", [possessive("Maya"), possessive("James"), possessive("this profile")], ["Maya's", "James'", "this profile's"]);
eq("cap starts a sentence", cap("this profile"), "This profile");
eq("initials", [initialsOf("Maya Rao"), initialsOf("Prince"), initialsOf("")], ["MR", "P", "P"]);

// Company and role.
eq("company field first", companyOf(full), "Acme Labs");
eq("company from the headline", companyOf({ headline: "Head of Growth at Northwind | Speaker" }), "Northwind");
eq("company from an @ headline", companyOf({ headline: "CTO @ Contoso" }), "Contoso");
eq("no company: neutral", companyOf(bare), "the company");
eq("role without the company", roleOf(full), "Co-Founder and COO");
eq("role with a trailing company", roleOf({ headline: "Founder, Acme", company: "Acme" }), "Founder");
eq("role, plain headline", roleOf({ headline: "Investor" }), "Investor");
eq("no role: empty", roleOf(bare), "");
eq("who line for prompts", whoLine(full), "Maya Rao, Co-Founder and COO at Acme Labs");
eq("who line, company only", whoLine({ name: "Maya Rao", company: "Acme" }), "Maya Rao, at Acme");
eq("who line, nothing known", whoLine(bare), "the profile owner");

// Per-profile strategy lists: a new profile starts clean.
eq("no pillars on a new profile", pillarsOf(bare), []);
eq("pillars cleaned and de-duplicated", pillarsOf({ pillars: [" Ops ", "Ops", "", "Hiring"] }), ["Ops", "Hiring"]);
eq("regions", regionsOf({ regions: ["UAE", " India "] }), ["UAE", "India"]);
eq("region text", [regionText({ regions: ["GCC"] }), regionText({ regions: ["GCC", "India"] }), regionText({ regions: ["UAE", "India", "Kenya"] }), regionText(bare, "any region")], ["GCC", "GCC and India", "UAE, India and Kenya", "any region"]);
eq("split a Settings field", splitList("Ops, Hiring\nPricing,, Ops"), ["Ops", "Hiring", "Pricing"]);
eq("segments: neutral names by default", Object.values(segmentsOf(bare)).map((s) => s.label), Object.values(SEGMENT_BASE).map((s) => s.label));
eq("segments: saved names win, blanks keep neutral", [segmentsOf({ segments: { A: "Banks", B: " " } }).A.label, segmentsOf({ segments: { A: "Banks", B: " " } }).B.label], ["Banks", "Priority region"]);
eq("segments keep their colours", segmentsOf({ segments: { A: "Banks" } }).A.color, SEGMENT_BASE.A.color);

// db/016 writes the first profile's old defaults onto existing profiles only, inside the step that adds pillars.
const sql = readFileSync(new URL("../db/016_profiles.sql", import.meta.url), "utf8");
const block = sql.slice(sql.indexOf("do $$"), sql.indexOf("end $$;"));
eq("016: backfill only where the pillars column is first added", /if not exists \(select 1 from information_schema\.columns[^)]*'pillars'\)/.test(block) && block.includes("update workspaces set"), true);
eq("016: the new columns default to empty", ["company text not null default ''", "regions text[] not null default '{}'", "segments jsonb not null default '{}'", "pillars text[] not null default '{}'"].every((c) => sql.includes(c)), true);
eq("016: delete is owner only, archived first, exact name", ["has_role(p_ws, 'owner')", "archived_at is not null", "name = p_name"].every((c) => sql.includes(c)), true);
eq("016: notes keep their author", sql.includes("alter table notes add column if not exists created_by uuid default auth.uid()"), true);
const segJson = JSON.parse(block.match(/select id, '(\[[^']+\])'::jsonb, '(\[[^']+\])'::jsonb/)![1]);
eq("016: the frozen segment rules are valid JSON for all five segments", segJson.map((r: { seg: string }) => r.seg).sort(), ["A", "B", "C", "D", "E"]);

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
