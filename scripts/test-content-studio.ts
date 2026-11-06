// Checks the Content Studio logic: the fold, the formatter, the claims check, URL safety, AI reply parsing,
// the point-of-view prompt, newsletter dates and What works.
// Run: node scripts/test-content-studio.ts
import { foldCut, hookFits, sayableIn3s, plain, styled, styleRange, listLines, caseRange, markdownToLinkedIn, claimsCheck, urlProblem, isPrivateIp, readable, parseIdeas, parseHooks, parseDrafts, povText, EMPTY_POV, nextIssue, whatWorks, type ResultPost } from "../src/lib/content.ts";
import { carouselPdf } from "../src/lib/carousel-pdf.ts";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

// Fold: 140 on mobile, 210 on desktop, at most 3 lines, cut on a word.
const short = "Reconciliation decides who moves first.";
eq("short text is not folded", foldCut(short, "mobile").folded, false);
const long = "word ".repeat(40).trim(); // 199 characters
eq("199 characters fold on mobile", foldCut(long, "mobile").folded, true);
eq("199 characters fit on desktop", foldCut(long, "desktop").folded, false);
eq("mobile cut stays under 140 and ends on a word", (() => { const s = foldCut(long, "mobile").shown; return s.length <= 140 && s.endsWith("word"); })(), true);
eq("three line breaks fold even when short", foldCut("a\nb\nc\nd", "desktop").folded, true);
eq("hook of 140 fits mobile", hookFits("x".repeat(140), "mobile"), true);
eq("hook of 141 is cut on mobile", hookFits("x".repeat(141), "mobile"), false);
eq("hook of 200 fits desktop", hookFits("x".repeat(200), "desktop"), true);
eq("16 words are sayable in 3 seconds", sayableIn3s("a ".repeat(16)), true);
eq("17 words are not", sayableIn3s("a ".repeat(17)), false);

// Formatter: styles round trip to plain, lists, case, Markdown.
const text = "Settlement in 38 seconds";
for (const k of ["bold", "italic", "bolditalic", "mono", "serif", "script", "double", "underline", "strike"] as const)
  eq(`${k} round trips to plain`, plain(styled(text, k)), text);
eq("bold changes letters and digits", styled("A1", "bold") !== "A1", true);
eq("styling twice does not stack", styled(styled("abc", "bold"), "italic"), styled("abc", "italic"));
eq("styleRange styles only the selection", (() => { const r = styleRange("one two three", 4, 7, "bold")!; return [plain(r.text), r.text.startsWith("one "), r.text.endsWith(" three")]; })(), ["one two three", true, true]);
eq("styleRange with no selection is null", styleRange("abc", 1, 1, "bold"), null);
eq("bullet list", listLines("a\nb\n\nc", 0, 6, "bullet"), "• a\n• b\n\n• c");
eq("numbered list skips blank lines", listLines("a\n\nb", 0, 4, "number"), "1. a\n\n2. b");
eq("re-listing replaces the old marker", listLines("• a\n• b", 0, 7, "arrow"), "→ a\n→ b");
eq("list only touches selected lines", listLines("x\na\nb\ny", 2, 5, "check"), "x\n✓ a\n✓ b\ny");
eq("title case", caseRange("the liquid balance sheet", 0, 24, "title"), "The Liquid Balance Sheet");
eq("upper case of a styled range is plain upper", caseRange(styled("abc", "bold"), 0, styled("abc", "bold").length, "upper"), "ABC");
eq("Markdown bold", markdownToLinkedIn("**Hold**"), styled("Hold", "bold"));
eq("Markdown italic", markdownToLinkedIn("a *quiet* point"), `a ${styled("quiet", "italic")} point`);
eq("Markdown bullets", markdownToLinkedIn("- one\n- two"), "• one\n• two");
eq("Markdown strike round trips", plain(markdownToLinkedIn("~~old~~")), "old");

// Regulated claims check.
const kinds = (t: string, o = {}) => claimsCheck(t, o).map((f) => f.kind);
eq("guaranteed returns flagged", kinds("Investors get guaranteed returns."), ["returns"]);
eq("percent yield flagged", kinds("Holders earn 12% yield every year."), ["returns"]);
eq("firm launch date flagged", kinds("We will go live with the bank by Q2."), ["timeline"]);
eq("harsh words about a regulator flagged", kinds("The regulator is clueless about tokenisation."), ["regulator"]);
eq("neutral regulator mention passes", kinds("The regulator published clear rules for custody."), []);
eq("confidential details flagged", kinds("The term sheet is signed."), ["confidential"]);
eq("client named without permission flagged", kinds("We built it with Emirates NBD.", { companies: ["Emirates NBD"] }), ["client"]);
eq("permitted client passes", kinds("We built it with Emirates NBD.", { companies: ["Emirates NBD"], permitted: ["emirates nbd"] }), []);
eq("plain opinion passes", kinds("In my view reconciliation decides who moves first."), []);

// URL safety for /api/fetch-url.
eq("https allowed", urlProblem("https://www.bis.org/publ/qtrpdf.htm"), null);
eq("ftp refused", urlProblem("ftp://example.com/x") !== null, true);
eq("file refused", urlProblem("file:///etc/passwd") !== null, true);
eq("javascript refused", urlProblem("javascript:alert(1)") !== null, true);
eq("linkedin refused", urlProblem("https://www.linkedin.com/posts/x") !== null, true);
eq("lnkd.in refused", urlProblem("https://lnkd.in/abc") !== null, true);
eq("localhost refused", urlProblem("http://localhost:3000") !== null, true);
eq("private IPv4 literal refused", urlProblem("http://192.168.1.10/") !== null, true);
eq("metadata IP refused", urlProblem("http://169.254.169.254/latest") !== null, true);
eq("IPv6 loopback literal refused", urlProblem("http://[::1]/") !== null, true);
eq("not a URL refused", urlProblem("not a link") !== null, true);
for (const ip of ["10.0.0.1", "127.0.0.1", "172.16.5.4", "172.31.255.255", "192.168.0.1", "169.254.1.1", "0.0.0.0", "100.64.0.1", "::1", "fc00::1", "fe80::1", "::ffff:10.0.0.1"])
  eq(`${ip} is private`, isPrivateIp(ip), true);
for (const ip of ["8.8.8.8", "172.32.0.1", "1.1.1.1", "2606:4700::1111"]) eq(`${ip} is public`, isPrivateIp(ip), false);
// Bracketed IPv6 literals that reach private space. The URL parser rewrites ::ffff:127.0.0.1 as ::ffff:7f00:1.
for (const h of ["[::ffff:127.0.0.1]", "[::ffff:7f00:1]", "[::ffff:169.254.169.254]", "[::ffff:a9fe:a9fe]", "[64:ff9b::7f00:1]", "[::1]", "[::]", "[::7f00:1]", "[fd00::1]", "[fe80::1]", "[ff02::1]", "[2002:7f00:1::]"])
  eq(`http://${h}/ refused`, urlProblem(`http://${h}/`) !== null, true);
for (const h of ["8.8.8.8", "[2606:4700::1111]", "[2001:4860:4860::8888]", "[::ffff:8.8.8.8]"]) eq(`http://${h}/ allowed`, urlProblem(`http://${h}/`), null);
for (const ip of ["::ffff:7f00:1", "::FFFF:127.0.0.1", "0:0:0:0:0:ffff:7f00:1", "64:ff9b::a00:1", "2002::1", "fe80::1%en0", "febf::1", "fc00::", "ff00::", "0:0:0:0:0:0:0:1", "999.1.1.1"])
  eq(`${ip} is private`, isPrivateIp(ip), true);
for (const ip of ["2001:db8::1", "2a00:1450::200e", "::ffff:1.1.1.1", "64:ff9b:1::1", "example.com", "1::2::3"]) eq(`${ip} is not private`, isPrivateIp(ip), false);
eq("readable strips scripts and keeps the title", (() => { const r = readable("<html><head><title>Rates &amp; rails</title><script>evil()</script></head><body><p>Settlement moved.</p><style>p{}</style></body></html>"); return [r.title, r.text.includes("evil"), r.text.includes("Settlement moved.")]; })(), ["Rates & rails", false, true]);

// Parsing AI replies.
eq("ideas sorted by score, clamped", parseIdeas({ ideas: [{ title: "B", score: 40 }, { title: "A", score: 140 }, { title: "" }] }).map((i) => [i.title, i.score]), [["A", 100], ["B", 40]]);
eq("ideas from junk are empty", parseIdeas("nonsense"), []);
eq("hooks accept strings and objects", parseHooks({ hooks: ["One  line", { text: "Two", kind: "Question" }, { text: " " }] }), [{ text: "One line", kind: "" }, { text: "Two", kind: "Question" }]);
eq("drafts start with the hook", parseDrafts({ drafts: [{ angle: "x", text: "Body only.", impact: 7 }] }, "The hook.")[0], { angle: "x", text: "The hook.\n\nBody only.", impact: 70 });
eq("draft already starting with hook is kept", parseDrafts({ drafts: [{ text: "The hook. More.", impact: 11 }] }, "The hook.")[0], { angle: "", text: "The hook. More.", impact: 100 });
eq("at most three drafts", parseDrafts({ drafts: ["a", "b", "c", "d"] }, "").length, 3);

// Point of view: only cleared proof points go to the AI.
const pt = povText({ stances: ["Rails before rules"], proofs: [{ text: "Since 2011", cleared: true }, { text: "Secret client win", cleared: false }], numbers: [{ value: "38 seconds", context: "settlement" }], clients: [] });
eq("pov keeps cleared proof", pt.includes("Since 2011"), true);
eq("pov drops uncleared proof", pt.includes("Secret client win"), false);
eq("empty pov forbids invented numbers", povText(EMPTY_POV).includes("use no numbers"), true);

// Newsletter: next issue on the weekday, on the cadence.
eq("weekly on Tuesday from Friday 6 Nov", nextIssue({ name: "N", cadence: "weekly", weekday: 2 }, "2026-11-06"), "2026-11-10");
eq("same day counts", nextIssue({ name: "N", cadence: "weekly", weekday: 5 }, "2026-11-06"), "2026-11-06");
eq("fortnightly keeps the rhythm from its start", nextIssue({ name: "N", cadence: "fortnightly", weekday: 2, start: "2026-11-03" }, "2026-11-06"), "2026-11-17");

// What works: not enough results until five posted pieces have numbers.
const rp = (format: string, reactions: number, comments: number): ResultPost => ({ format, pillar: "Agentic Finance", publish_date: "2026-11-03", planned_time: "09:30", draft: "Short hook\nbody", status: "Posted", impressions: null, reactions, comments });
eq("four results are not enough", whatWorks([rp("Text post", 10, 1), rp("Text post", 10, 1), rp("Carousel", 10, 1), rp("Video", 1, 0)]).enough, false);
const ww = whatWorks([rp("Text post", 10, 1), rp("Text post", 20, 5), rp("Carousel", 50, 10), rp("Video", 1, 0), rp("Poll", 3, 0), { ...rp("Text post", 99, 99), status: "Drafting" }]);
eq("five results are enough, drafts ignored", [ww.enough, ww.have], [true, 5]);
eq("best format by reactions plus twice comments", ww.enough ? ww.byFormat[0] : null, { k: "Carousel", n: 1, avg: 70 });

// Carousel PDF: a real PDF with one page per slide.
const pdf = new TextDecoder("latin1").decode(carouselPdf([{ title: "One", body: "First" }, { title: "Two", body: "Second" }, { title: "Three", body: "Third" }]));
eq("carousel is a PDF", pdf.startsWith("%PDF-"), true);
eq("carousel has three pages", (pdf.match(/\/Type \/Page\b/g) ?? []).length, 3);

console.log(fails ? `\n${fails} failed` : "\nAll Content Studio checks passed");
process.exit(fails ? 1 : 0);
