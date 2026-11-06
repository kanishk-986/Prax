// Checks text repair and decoding: Mac Roman mojibake, byte order marks, strict UTF-8, Windows-1252. Run: node scripts/test-text.ts
import { repairMojibake, decodeText, decodePage, repairFields, MAC_ROMAN_HIGH } from "../src/lib/text.ts";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const enc = (s: string) => new TextEncoder().encode(s);
// What a Mac app shows when it opens UTF-8 as Mac Roman.
const asMacRoman = (s: string) => [...enc(s)].map((b) => (b < 0x80 ? String.fromCharCode(b) : MAC_ROMAN_HIGH[b - 0x80])).join("");

eq("table has 128 characters", [...MAC_ROMAN_HIGH].length, 128);
eq("the prospect name", repairMojibake("Jimena Santill√°n"), "Jimena Santillán");
eq("the strategy middle dot", repairMojibake("A ¬∑ Fintech"), "A · Fintech");
eq("curly apostrophe (three bytes)", repairMojibake("Shashi‚Äôs view"), "Shashi’s view");
eq("em dash and euro", repairMojibake(asMacRoman("a — b €5")), "a — b €5");
eq("emoji (four bytes)", repairMojibake(asMacRoman("ok 👍")), "ok 👍");
const mixed = "Zürich, São Paulo, Kraków, Ελλάδα, 東京, Müller · Gómez";
eq("round trip on mixed scripts", repairMojibake(asMacRoman(mixed)), mixed);
eq("clean text is left alone", repairMojibake(mixed), mixed);
eq("ascii is left alone", repairMojibake("Plain text, 100% fine."), "Plain text, 100% fine.");
eq("running twice changes nothing", repairMojibake(repairMojibake("Santill√°n ¬∑ A")), "Santillán · A");
eq("a real square root sign stays", repairMojibake("√2 is irrational"), "√2 is irrational");
eq("a pair that would decode to a control character stays", repairMojibake("¬Ä"), "¬Ä");
eq("a pair that would decode to a combining mark stays", repairMojibake("Ã©"), "Ã©");
eq("empty string", repairMojibake(""), "");
eq("fix inside a sentence with real accents", repairMojibake("José met Santill√°n"), "José met Santillán");

eq("utf-8 with a byte order mark", decodeText(Uint8Array.from([0xef, 0xbb, 0xbf, ...enc("First Name\nJosé")])), "First Name\nJosé");
eq("plain utf-8", decodeText(enc("Santillán")), "Santillán");
eq("windows-1252 fallback", decodeText(Uint8Array.from([0x4a, 0x6f, 0x73, 0xe9])), "José");
eq("utf-16 little endian", decodeText(Uint8Array.from([0xff, 0xfe, 0x4a, 0, 0xe9, 0])), "Jé");
eq("mojibake saved in the file is repaired", decodeText(enc("Santill√°n")), "Santillán");
eq("page charset from the header", decodePage(Uint8Array.from([0x4a, 0x6f, 0x73, 0xe9]), "text/html; charset=ISO-8859-1"), "José");
eq("page charset from a meta tag", decodePage(Uint8Array.from([...enc('<meta charset="windows-1252"><p>Jos'), 0xe9]), "text/html"), '<meta charset="windows-1252"><p>José');
eq("utf-8 page without a label", decodePage(enc("<p>Santillán</p>"), "text/html"), "<p>Santillán</p>");
eq("unknown label falls back", decodePage(enc("Santillán"), "text/html; charset=nonsense"), "Santillán");
eq("record fields", repairFields({ name: "Santill√°n", sort: 2, done: false }), { name: "Santillán", sort: 2, done: false });

// db/018_text_repair_v2.sql: the code point table, no literal special characters, and the SQL against the same
// cases as repairMojibake. The SQL itself runs when PGLITE points at an @electric-sql/pglite package folder:
//   PGLITE=/path/to/node_modules/@electric-sql/pglite node scripts/test-text.ts
{
  const fs = await import("node:fs");
  const sql = fs.readFileSync(new URL("../db/018_text_repair_v2.sql", import.meta.url), "utf8");
  const body = /prax_mac_roman_high\(\) returns int\[\][\s\S]*?array\[([\s\S]*?)\]::int\[\]/.exec(sql)?.[1] ?? "";
  const cps = body.replace(/--[^\n]*/g, "").split(",").map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x));
  eq("018 table has 128 code points", cps.length, 128);
  eq("018 table matches MAC_ROMAN_HIGH", cps, [...MAC_ROMAN_HIGH].map((c) => c.codePointAt(0)));
  eq("018 has no non-ASCII characters", [...sql].filter((c) => c.charCodeAt(0) > 127).length, 0);
  // Known values from Python's mac_roman codec.
  eq("018 byte A1 is the degree sign, B7 is n-ary sum", [cps[0xa1 - 0x80], cps[0xb7 - 0x80]], [176, 8721]);
  eq("018 byte C2 is not sign, C3 is square root, CA is no-break space", [cps[0xc2 - 0x80], cps[0xc3 - 0x80], cps[0xca - 0x80]], [172, 8730, 160]);
  try {
    const { execFileSync } = await import("node:child_process");
    const py = JSON.parse(execFileSync("python3", ["-c", "import json;print(json.dumps([ord(bytes([b]).decode('mac_roman')) for b in range(128,256)]))"], { encoding: "utf8" }));
    eq("018 table matches Python's mac_roman codec", cps, py);
  } catch { console.log("skip python3 not available, codec comparison skipped"); }

  const cases = ["Jimena Santill√°n", "A ¬∑ Fintech", "Shashi‚Äôs view", asMacRoman("a — b €5"), asMacRoman("ok 👍"), asMacRoman(mixed), mixed,
    "Plain text, 100% fine.", "√2 is irrational", "¬Ä", "Ã©", "", "José met Santill√°n", "Santill√°n ¬∑ A ¬∑ " + asMacRoman("Zürich"), "‚Ä", "√"];
  eq("018 cases in JS: 'Santill√°n' and '¬∑'", [repairMojibake(cases[0]), repairMojibake(cases[1])], ["Jimena Santillán", "A · Fintech"]);
  const dir = process.env.PGLITE;
  if (!dir) console.log("skip set PGLITE to run db/018 in Postgres (PGlite)");
  else {
    const { PGlite } = await import(dir + "/dist/index.js");
    const db = new PGlite();
    // PART 1 only: the functions (the column list reads information_schema, which is fine but not needed here).
    await db.exec(sql.slice(sql.indexOf("create or replace function public.prax_mac_roman_high"), sql.indexOf("-- The text columns the repair looks at")));
    for (const c of cases) {
      const r = await db.query("select public.prax_repair_mojibake($1) as o", [c]);
      eq(`018 in Postgres matches JS: ${JSON.stringify(c).slice(0, 40)}`, (r.rows[0] as { o: string }).o, repairMojibake(c));
    }
    const again = await db.query("select public.prax_repair_mojibake(public.prax_repair_mojibake($1)) as o", [cases[13]]);
    eq("018 in Postgres: running twice changes nothing", (again.rows[0] as { o: string }).o, repairMojibake(cases[13]));
    const nul = await db.query("select public.prax_repair_mojibake(null) as o");
    eq("018 in Postgres: null stays null", (nul.rows[0] as { o: null }).o, null);
  }
}

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
