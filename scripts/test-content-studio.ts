// Checks the Content Studio logic: the fold, the formatter, the claims check, URL safety, AI reply parsing,
// the point-of-view prompt, newsletter dates and What works.
// Run: node scripts/test-content-studio.ts
import { foldCut, hookFits, sayableIn3s, plain, styled, styleRange, listLines, caseRange, markdownToLinkedIn, claimsCheck, urlProblem, isPrivateIp, readable, parseIdeas, parseHooks, parseDrafts, povText, EMPTY_POV, nextIssue, whatWorks, type ResultPost,
  parseCount, hasResults, engagementScore, engagementRate, resultsSummary, activityId, needsResults, parseRepurpose, repurposeFormat, repurposeLabel, linksOut, firstLink, parsePrep, imagePath, dataUrlBytes } from "../src/lib/content.ts";
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

eq("reposts count three times in What works", (() => { const w = whatWorks([rp("Text post", 10, 0), rp("Text post", 10, 0), rp("Text post", 10, 0), rp("Text post", 10, 0), { ...rp("Poll", 10, 0), reposts: 5 }]); return w.enough ? w.byFormat[0] : null; })(), { k: "Poll", n: 1, avg: 25 });
eq("a post with only reposts counts as having results", whatWorks([0, 1, 2, 3].map(() => rp("Text post", 1, 0)).concat([{ ...rp("Video", 0, 0), reactions: null, comments: null, reposts: 2 }])).have, 5);

// Results per post (CS29): typed numbers, the maths, the summary and the activity id.
eq("counts as typed", ["1,234", "2.1K", "1.2m", " 980 ", "", "abc", "-5", "3.5"].map(parseCount), [1234, 2100, 1200000, 980, null, null, null, 4]);
eq("has results with any one number", [hasResults({ impressions: null, reactions: null, comments: null }), hasResults({ impressions: null, reactions: 0, comments: null })], [false, true]);
eq("engagement score", engagementScore({ impressions: 1000, reactions: 10, comments: 3, reposts: 2 }), 22);
eq("engagement rate per 100 impressions", engagementRate({ impressions: 2000, reactions: 40, comments: 6, reposts: 2 }), 2.4);
eq("no rate without impressions", [engagementRate({ impressions: null, reactions: 4, comments: 1 }), engagementRate({ impressions: 0, reactions: 4, comments: 1 })], [null, null]);
const sum = resultsSummary([
  { id: "a", title: "A", impressions: 1000, reactions: 20, comments: 5, reposts: 0 },
  { id: "b", title: "B", impressions: 3000, reactions: 30, comments: 10, reposts: 5 },
  { id: "c", title: "C", impressions: null, reactions: 50, comments: 0, reposts: null },
  { id: "d", title: "D", impressions: null, reactions: null, comments: null },
]);
eq("summary totals skip posts without numbers", [sum.measured, sum.impressions, sum.reactions, sum.comments, sum.reposts], [3, 4000, 100, 15, 5]);
eq("summary rate only over posts with impressions", sum.rate, 1.8);
eq("summary average impressions", sum.avgImpressions, 2000);
eq("summary best post by engagement", sum.best, { id: "b", title: "B", score: 65 });
eq("empty summary", resultsSummary([]), { measured: 0, impressions: 0, reactions: 0, comments: 0, reposts: 0, avgImpressions: null, rate: null, best: null });
eq("activity id from a post link", activityId("https://www.linkedin.com/feed/update/urn:li:activity:7254321098765432101/"), "7254321098765432101");
eq("activity id from the analytics page", activityId("https://www.linkedin.com/analytics/post-summary/urn:li:activity:7254321098765432101/?x=1"), "7254321098765432101");
eq("activity id from a share link and an encoded urn", [activityId("https://www.linkedin.com/posts/name_topic-activity-7254321098765432101-AbCd"), activityId("https://x.com/?u=urn%3Ali%3Aactivity%3A7254321098765432101")], ["7254321098765432101", "7254321098765432101"]);
eq("no activity id", activityId("https://example.com/post/1"), null);
const pr = (status: string, publish_date: string | null, reactions: number | null = null) => ({ status, publish_date, impressions: null, reactions, comments: null });
eq("needs results two days after posting", [needsResults(pr("Posted", "2026-11-04"), "2026-11-06"), needsResults(pr("Posted", "2026-11-05"), "2026-11-06")], [true, false]);
eq("no nudge once numbers are in, or before posting", [needsResults(pr("Posted", "2026-11-01", 4), "2026-11-06"), needsResults(pr("Ready", "2026-11-01"), "2026-11-06"), needsResults(pr("Posted", null), "2026-11-06")], [false, false, false]);

// Repurpose (CS30): one piece per kind asked for, in the order asked, titles from the first line.
const rpj = { pieces: [
  { kind: "Short text post", title: "", text: "Settlement is a trust problem.\n\nMore lines." },
  { kind: "carousel", title: "Five controls", text: "Slide 1: Five controls. Before the pilot\nSlide 2: Custody. Who holds the key" },
  { kind: "carousel", title: "Second carousel", text: "dropped" },
  { kind: "comment", title: "Not asked", text: "dropped too" },
  { kind: "Newsletter section", title: "  The quiet rail  ", text: "## The quiet rail\nBody" },
  { kind: "tweet", title: "x", text: "unknown kind" },
  { kind: "poll", title: "Empty", text: "   " },
] };
const pieces = parseRepurpose(rpj, ["carousel", "short", "newsletter", "poll"]);
eq("repurpose keeps the asked order and one per kind", pieces.map((p) => p.kind), ["carousel", "short", "newsletter"]);
eq("repurpose title from the first line when missing", pieces[1].title, "Settlement is a trust problem.");
eq("repurpose title trimmed", pieces[2].title, "The quiet rail");
eq("repurpose formats", (["carousel", "short", "comment", "newsletter", "poll", "video"] as const).map(repurposeFormat), ["Carousel", "Text post", "Text post", "Article", "Poll", "Video"]);
eq("repurpose of nothing", [parseRepurpose(null, ["short"]), parseRepurpose({ pieces: "no" }, ["short"])], [[], []]);
eq("repurpose label for a stored kind", [repurposeLabel("comment"), repurposeLabel("other")], ["Comment angle", "Repurposed"]);

// First comment and reply prep (CS31).
eq("links out", [linksOut("Read it at https://example.com/report."), linksOut("See www.example.com"), linksOut("No link here.")], [true, true, false]);
eq("first link without trailing punctuation", firstLink("Read it at https://example.com/report. Then think."), "https://example.com/report");
const prepJ = { first: "\"Worth ten minutes for any bank team.\"", replies: [{ q: "Is this real?", a: "In my view it is." }, { question: "What about cost?", answer: "I think cost falls." }, { q: "No answer" }, { q: "Q4", a: "A4" }, { q: "Q5", a: "A5" }] };
const prep = parsePrep(prepJ, "https://example.com/report");
eq("first comment unquoted and carries the link", prep.first, "Worth ten minutes for any bank team. https://example.com/report");
eq("three replies with answers", prep.replies, [{ q: "Is this real?", a: "In my view it is." }, { q: "What about cost?", a: "I think cost falls." }, { q: "Q4", a: "A4" }]);
eq("no first comment when the post does not link out", parsePrep(prepJ, "").first, "");
eq("a first comment that already has the link is kept", parsePrep({ first: "Here: https://example.com/report", replies: [] }, "https://example.com/report").first, "Here: https://example.com/report");

// Generated images (CS6): workspace-first paths and data URLs.
eq("image path starts with the workspace", imagePath("ws-1", "post-2", "image/jpeg", 123), "ws-1/post-2/123.jpg");
eq("unknown image type stored as png", imagePath("w", "p", "image/gif", 1), "w/p/1.png");
eq("data URL bytes", (() => { const d = dataUrlBytes("data:image/png;base64,iVBORw0K"); return d && [d.mime, Array.from(d.bytes.slice(0, 4))]; })(), ["image/png", [0x89, 0x50, 0x4e, 0x47]]);
eq("other URLs are not data URLs", [dataUrlBytes("https://example.com/a.png"), dataUrlBytes("data:image/gif;base64,R0lG")], [null, null]);

// Carousel PDF: a real PDF with one page per slide.
const pdf = new TextDecoder("latin1").decode(carouselPdf([{ title: "One", body: "First" }, { title: "Two", body: "Second" }, { title: "Three", body: "Third" }]));
eq("carousel is a PDF", pdf.startsWith("%PDF-"), true);
eq("carousel has three pages", (pdf.match(/\/Type \/Page\b/g) ?? []).length, 3);

console.log(fails ? `\n${fails} failed` : "\nAll Content Studio checks passed");
process.exit(fails ? 1 : 0);
