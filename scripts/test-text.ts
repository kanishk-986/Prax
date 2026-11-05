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

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
