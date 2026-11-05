// Checks Discovery Studio logic: scoring, bands, the rules scorer, topic merging, priority maths, the weights
// total, the URL guard used by the crawl, CSV and Excel lists with hidden hyperlinks, list pages and dates,
// AI search replies, the Digest selection and the post a topic becomes. Run: node scripts/test-discovery.ts
import { zipSync, strToU8 } from "fflate";
import {
  totalScore, bandOf, weightsOk, DEFAULT_WEIGHTS, DEFAULT_PRIORITY, ruleScore, freshness, sourceTypeOf, opportunityOf, deadlineIn,
  normalizeLink, parseCsv, linkRows, parseLinkFile, readXlsx, researchResourceRows, pageDate, urlDate, gateOf, articleLinks, isListPage, newestArticles,
  sameStory, clusterStories, priority, priorityParts, priorityMinus, crowdedOf, risingOf, selectDigest, servicesLine, postedRecently, matchCampaign,
  searchPlan, rotateBatch, parseSearchItems, parseScores, mergeSettings, buildTopics, applyMerges, topicPost, suggestWeights, PILLAR_WORDS, type Finding, type TopicFacts,
} from "../src/lib/discovery.ts";
import { urlProblem, isPrivateIp, suggestAngles, angleLine, postSource } from "../src/lib/content.ts";
import { PILLARS } from "../src/lib/campaigns.ts";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const T = "2026-11-06";

// ---------- scoring and bands ----------
eq("all fives score 100", totalScore([5, 5, 5, 5, 5, 5, 5]), 100);
eq("weights apply per dimension", totalScore([5, 0, 0, 0, 0, 0, 0]), 25);
eq("rounded total", totalScore([4, 4, 3, 3, 5, 2, 1]), Math.round(20 + 16 + 9 + 9 + 10 + 4 + 1));
eq("default weights total 100", weightsOk(DEFAULT_WEIGHTS), true);
eq("default priority total 100", weightsOk(DEFAULT_PRIORITY), true);
eq("99 is not ok", weightsOk([25, 20, 15, 15, 10, 10, 4]), false);
eq("negative weight is not ok", weightsOk([30, 20, 15, 15, 10, 15, -5]), false);
eq("six weights are not ok", weightsOk([30, 20, 15, 15, 10, 10]), false);
const art = (scores: number[], extra: object = {}) => ({ scores, confirmed: true, source_type: "Publication", ...extra });
eq("post-worthy at 70+, fresh and evidenced", bandOf(art([5, 5, 5, 4, 4, 4, 3])), "Post-worthy");
eq("70+ but stale stays watch", bandOf(art([5, 5, 5, 5, 2, 5, 5])), "Watch");
eq("70+ but weak evidence stays watch", bandOf(art([5, 5, 5, 5, 5, 2, 5])), "Watch");
eq("unconfirmed date capped at watch", bandOf(art([5, 5, 5, 5, 5, 5, 5], { confirmed: false })), "Watch");
eq("under 35 is dropped even unconfirmed", bandOf(art([1, 1, 1, 1, 1, 1, 1], { confirmed: false })), "Dropped");
eq("LinkedIn 55+ is comment-worthy", bandOf(art([3, 3, 3, 3, 3, 3, 3], { source_type: "LinkedIn" })), "Comment-worthy");
eq("LinkedIn 45 is watch", bandOf(art([2, 3, 2, 2, 3, 2, 2], { source_type: "LinkedIn" })), "Watch");
eq("target author 40+ is comment-worthy", bandOf(art([2, 3, 2, 2, 3, 2, 2], { source_type: "LinkedIn", target: true })), "Comment-worthy");
eq("custom bands apply", bandOf(art([3, 3, 3, 3, 3, 3, 3]), DEFAULT_WEIGHTS, { post: 50, comment: 55, watch: 35, target: 40 }), "Watch");
eq("settings fall back when weights do not total 100", mergeSettings({ weights: [50, 50, 50, 0, 0, 0, 0] }).weights, DEFAULT_WEIGHTS);
eq("same pillars as campaigns", Object.keys(PILLAR_WORDS), PILLARS);

// ---------- the rules scorer ----------
eq("freshness 72 hours", freshness("2026-11-04", T), 5);
eq("freshness 7 days", freshness("2026-10-31", T), 4);
eq("freshness old", freshness("2025-01-01", T), 0);
eq("freshness unknown", freshness(null, T), 2);
eq("regulator host", sourceTypeOf("https://www.vara.ae/en/news/x"), "Regulator");
eq("gov host", sourceTypeOf("https://www.cbo.gov.om/news"), "Regulator");
eq("major media", sourceTypeOf("https://www.reuters.com/markets/x"), "Major media");
eq("press release path", sourceTypeOf("https://example-firm.com/newsroom/launch"), "Company");
eq("blog", sourceTypeOf("https://someone.substack.com/p/x"), "Blog");
const rs = ruleScore({ url: "https://www.vara.ae/news/reserve", title: "VARA opens a consultation on reserve rules for stablecoin issuers serving UAE banks", excerpt: "Banks must design reserve reporting and reconciliation controls.", published: "2026-11-05", confirmed: true }, T);
eq("rules scorer: regulator evidence 5", rs.scores[5], 5);
eq("rules scorer: buyer and decision 5", rs.scores[0], 5);
eq("rules scorer: MENA", [rs.geo, rs.scores[2]], ["MENA", 5]);
eq("rules scorer: service", rs.service, "Stablecoin infrastructure");
eq("rules scorer: pillar", rs.pillar, "Regulation-to-Architecture");
eq("rules scorer: band", bandOf({ ...rs, confirmed: true }), "Post-worthy");
eq("opportunity: tender", opportunityOf("Central bank tender for a tokenisation sandbox", "Request for proposals closes on 24 November 2026", T), { kind: "sales", due: 18 });
eq("opportunity: speakers", opportunityOf("Call for speakers: digital assets summit", "Deadline: 2026-11-15", T), { kind: "pitch", due: 9 });
eq("opportunity: journalist", opportunityOf("A journalist seeks experts on stablecoin pilots", "", T), { kind: "press", due: null });
eq("opportunity: none", opportunityOf("Bank posts results", "", T), null);
eq("deadline month first", deadlineIn("submissions due by December 1", T), 25);
eq("deadline next year when passed", deadlineIn("closes 5 January", T), 60);

// ---------- the URL guard (crawl and AI result checks) ----------
eq("http ok", urlProblem("https://example.com/a"), null);
eq("ftp refused", urlProblem("ftp://example.com") !== null, true);
eq("file refused", urlProblem("file:///etc/passwd") !== null, true);
eq("linkedin refused", urlProblem("https://www.linkedin.com/feed/") !== null, true);
eq("lnkd.in refused", urlProblem("https://lnkd.in/abc") !== null, true);
eq("localhost refused", urlProblem("http://localhost:3000") !== null, true);
eq("loopback refused", urlProblem("http://127.0.0.1/") !== null, true);
eq("private 10/8 refused", urlProblem("http://10.1.2.3/") !== null, true);
eq("metadata address refused", urlProblem("http://169.254.169.254/latest/meta-data") !== null, true);
eq("ipv6 loopback refused", urlProblem("http://[::1]/") !== null, true);
eq("mapped ipv4 private", isPrivateIp("::ffff:192.168.1.1"), true);
eq("public ip ok", isPrivateIp("8.8.8.8"), false);
eq("internal name refused", urlProblem("http://db.internal/") !== null, true);

// ---------- link lists ----------
eq("bare domain gets https", normalizeLink("mckinsey.com"), "https://mckinsey.com/");
eq("fragment dropped", normalizeLink("https://Example.com/a#top"), "https://example.com/a");
eq("text is not a link", normalizeLink("VARA news"), null);
eq("javascript refused", normalizeLink("javascript:alert(1)"), null);
const csv = parseCsv('url,name,type,priority,access,region,notes\nhttps://vara.ae/news,VARA news,regulator,1,free,UAE,\n"https://example.com/a,b",Quoted, comma,publication,2,free,GCC,"says ""hi"""\nhttps://vara.ae/news/,Dupe,,,,,\nhttps://www.linkedin.com/company/x,LI,,,,,\nnot a link,Bad,,,,,');
eq("csv quoted cells", csv[2][0], "https://example.com/a,b");
const lr = linkRows(csv);
eq("csv rows kept", lr.rows.map((r) => r.name), ["VARA news", "Quoted"]);
eq("csv counts", [lr.dupes, lr.linkedin, lr.invalid], [1, 1, 1]);
eq("csv columns", lr.rows[0], { url: "https://vara.ae/news", name: "VARA news", type: "regulator", priority: "1", access: "free", region: "UAE", notes: "" });
eq("csv without a url column", linkRows([["a", "b"], ["x", "y"]]).error !== undefined, true);
eq("alias headers (Research Resources layout)", linkRows([["Company / Entity Name", "URL", "Strategic Focus", "Price/Month"], ["McKinsey & Company", "mckinsey.com", "Payments", "Bespoke Consulting"]]).rows[0], { url: "https://mckinsey.com/", name: "McKinsey & Company", type: "", priority: "", access: "Bespoke Consulting", region: "", notes: "Payments" });
eq("url column found by content", linkRows([["S.No.", "Where"], ["Artemis", "https://about.artemis.ai/"]]).rows[0].url, "https://about.artemis.ai/");
eq("hidden hyperlink behind a name cell", linkRows([["name", "url"], ["VARA news", ""]], { "1,0": "https://www.vara.ae/news" }).rows[0].url, "https://www.vara.ae/news");
eq("research resources list ready", researchResourceRows().length, 74);

// A real .xlsx: shared strings, an inline string, a relationship hyperlink behind cell text and a HYPERLINK formula.
const xml = (s: string) => strToU8(s);
const xlsx = zipSync({
  "[Content_Types].xml": xml('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
  "xl/workbook.xml": xml('<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Links" sheetId="1" r:id="rId1"/><sheet name="Empty" sheetId="2" r:id="rId2"/></sheets></workbook>'),
  "xl/_rels/workbook.xml.rels": xml('<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="worksheet" Target="worksheets/sheet2.xml"/></Relationships>'),
  "xl/sharedStrings.xml": xml('<sst><si><t>Name</t></si><si><t>Link</t></si><si><t>VARA news</t></si><si><r><t>RBI </t></r><r><t>press</t></r></si><si><t>Read here</t></si></sst>'),
  "xl/worksheets/sheet1.xml": xml('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>4</v></c></row><row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3" t="str"><f>HYPERLINK("https://www.rbi.org.in/press","RBI")</f><v>RBI</v></c></row><row r="4"><c r="A4" t="inlineStr"><is><t>Example &amp; Co</t></is></c><c r="B4" t="s"><v>4</v></c></row></sheetData><hyperlinks><hyperlink ref="B2" r:id="rId1"/><hyperlink ref="A4" r:id="rId2"/></hyperlinks></worksheet>'),
  "xl/worksheets/_rels/sheet1.xml.rels": xml('<Relationships><Relationship Id="rId1" Type="hyperlink" Target="https://www.vara.ae/news" TargetMode="External"/><Relationship Id="rId2" Type="hyperlink" Target="https://example.com/insights" TargetMode="External"/></Relationships>'),
  "xl/worksheets/sheet2.xml": xml("<worksheet><sheetData/></worksheet>"),
});
const sheets = readXlsx(xlsx);
eq("xlsx sheets", sheets.map((s) => s.name), ["Links", "Empty"]);
eq("xlsx rich text joined", sheets[0].rows[2][0], "RBI press");
eq("xlsx inline string decoded", sheets[0].rows[3][0], "Example & Co");
const px = parseLinkFile("list.xlsx", xlsx);
eq("xlsx hidden hyperlinks kept", px.rows.map((r) => [r.name, r.url]), [["VARA news", "https://www.vara.ae/news"], ["RBI press", "https://www.rbi.org.in/press"], ["Example & Co", "https://example.com/insights"]]);
eq("broken xlsx says so", parseLinkFile("x.xlsx", new Uint8Array([1, 2, 3])).error !== undefined, true);
eq("csv file", parseLinkFile("x.csv", strToU8("url\nhttps://a.com\n")).rows.length, 1);

// ---------- pages ----------
eq("meta date", pageDate('<meta property="article:published_time" content="2026-11-04T08:00:00Z">'), "2026-11-04");
eq("json-ld date", pageDate('<script type="application/ld+json">{"datePublished": "2026-11-03"}</script>'), "2026-11-03");
eq("time element", pageDate('<time datetime="2026-11-02">2 Nov</time>'), "2026-11-02");
eq("no date", pageDate("<p>hello</p>"), null);
eq("url date is a hint", urlDate("https://x.com/2026/11/05/story"), "2026-11-05");
eq("gated 401", gateOf(401, ""), "gated");
eq("blocked 429", gateOf(429, ""), "blocked");
eq("blocked challenge", gateOf(200, "<title>Just a moment...</title>"), "blocked");
eq("paywall gated", gateOf(200, "<p>Subscribe to continue reading</p>"), "gated");
eq("plain page ok", gateOf(200, "<p>News</p>"), null);
const list = `<a href="/about">About us and our long company history</a><a href="/news/2026/11/01/rbi-widens-the-digital-rupee-pilot">RBI widens the digital rupee pilot to cross-border settlement</a>
<a href="/news/2026/11/04/vara-reserve-rules-consultation-opens">VARA opens a consultation on reserve rules for issuers</a><a href="https://other.com/a-b-c-d">Another site entirely with a long headline</a>
<a href="/news/sama-sets-open-banking-rules-for-payment-firms">SAMA sets open banking rules for payment firms</a><a href="/news/2026/10/20/old-story-about-tokenised-funds">An older story about tokenised funds in Asia</a>
<a href="/tag/stablecoins-and-more">Stablecoins tag page with a long label here</a><a href="/news/short">Short</a>`;
const links = articleLinks(list, "https://news.example.com/news");
eq("article links: same site, real headlines, no nav", links.length, 4);
eq("list page detected", isListPage(list, "https://news.example.com/news"), true);
eq("an article is not a list page", isListPage('<meta property="article:published_time" content="2026-11-04">' + list, "https://news.example.com/news"), false);
eq("newest first, undated after", newestArticles(links, 3).map((l) => l.date), ["2026-11-04", "2026-11-01", "2026-10-20"]);

// ---------- AI search ----------
const plan = searchPlan({ packs: { pillar: true, entity: true, event: false, gap: true }, entities: ["A", "B", "C", "D", "E"], batch: 2, todayYmd: T, gaps: ["Who builds stablecoin rails for UAE banks?"], queries: ["SAMA open banking", " "] });
eq("plan: 6 pillars, 2 entities, 1 gap, 1 own", plan.map((p) => p.pack).join(","), "pillar,pillar,pillar,pillar,pillar,pillar,entity,entity,gap,custom");
eq("rotation moves weekly", [rotateBatch([1, 2, 3, 4, 5], 2, 0), rotateBatch([1, 2, 3, 4, 5], 2, 1), rotateBatch([1, 2, 3, 4, 5], 2, 3)], [[1, 2], [3, 4], [2, 3]]);
const answer = 'Here: {"items": [{"url": "https://www.vara.ae/news/reserve", "title": "VARA reserve rules", "publisher": "VARA", "date": "2026-11-05", "summary": "Opens consultation", "organisations": ["VARA"]}, {"url": "https://made-up.example.com/x", "title": "Invented", "date": "2026-11-05"}]}';
const got = parseSearchItems(answer, [{ url: "https://vara.ae/news/reserve/", title: "VARA", cited: true }, { url: "https://made-up.example.com/x", title: "x", cited: false }]);
eq("only cited items kept", got.items.map((i) => i.title), ["VARA reserve rules"]);
eq("returned counted", got.returned, 2);
eq("no JSON falls back to cited sources", parseSearchItems("plain text", [{ url: "https://a.com/x", title: "A", cited: true }, { url: "https://b.com", title: "B", cited: false }]).items.map((i) => i.url), ["https://a.com/x"]);
const sc = parseScores({ scores: [{ id: "f1", buyer: 9, pillar_fit: 4, geo: "5", service: 4, freshness: 5, evidence: -1, angle_fit: 3, geo_name: "MENA", service_name: "Custody", kind: "Fact", why: "w", angle: "a", organisations: ["VARA"] }] });
eq("AI scores clamped", sc.f1.scores, [5, 4, 5, 4, 5, 0, 3]);
eq("AI fields", [sc.f1.geo, sc.f1.service, sc.f1.orgs], ["MENA", "Custody", ["VARA"]]);

// ---------- topic merge ----------
const m = (id: string, title: string, orgs: string[] = [], published = "2026-11-04", total = 80) => ({ id, title, orgs, published, total });
eq("same story scores high", sameStory(m("a", "VARA opens consultation on stablecoin reserve rules"), m("b", "VARA consultation on reserve rules for stablecoin issuers", ["VARA"])) >= 0.45, true);
eq("different stories score low", sameStory(m("a", "VARA opens consultation on stablecoin reserve rules"), m("b", "RBI widens digital rupee pilot")) < 0.3, true);
const cl = clusterStories([
  m("a", "VARA opens consultation on stablecoin reserve rules", ["VARA"], "2026-11-04", 90),
  m("b", "VARA consultation on reserve rules for stablecoin issuers", ["VARA"], "2026-11-05", 70),
  m("c", "RBI widens digital rupee pilot to cross-border settlement", ["RBI"], "2026-11-05", 85),
  m("d", "VARA licensing guidance for stablecoin issuers", ["VARA"], "2026-11-03", 60),
]);
eq("clusters: VARA pair merged, RBI alone", cl.map((c) => c.ids), [["a", "b"], ["c"], ["d"]]);
eq("unsure pair is a possible merge", cl[2].possibleWith, "a");
eq("kept separate stays separate", clusterStories([m("a", "VARA opens consultation on stablecoin reserve rules", ["VARA"]), m("d", "VARA licensing guidance for stablecoin issuers", ["VARA"], "2026-11-03", 60)], new Set(["d"]))[1].possibleWith, undefined);

// ---------- priority maths ----------
const facts = (x: Partial<TopicFacts> = {}): TopicFacts => ({ ai: 14, crawl: 9, li: 2, pubs: 17, grow: 11, quality: 5, fit: 96, gap: false, warm: 3, due: 12, posted: false, crowded: false, ...x });
eq("parts", priorityParts(facts()).map((v) => Math.round(v * 100) / 100), [0.96, 1, 1, 1, 0, 1, 1]);
eq("priority of a strong topic", priority(facts()), Math.round(0.96 * 45 + 20 + 10 + 5 + 0 + 5 + 5));
eq("gap adds 10", priority(facts({ gap: true })) - priority(facts()), 10);
eq("posted recently takes 15", priority(facts({ posted: true })) - priority(facts()), -15);
eq("crowded takes 8", priority(facts({ crowded: true })) - priority(facts()), -8);
eq("custom penalties", priorityMinus({ posted: true, crowded: true }, { posted: 5, crowded: 2 }), [["Shashi posted on it recently", -5], ["Crowded: peers already posted", -2]]);
eq("never below 0", priority(facts({ fit: 0, ai: 0, crawl: 0, li: 0, grow: 0, quality: 0, warm: 0, due: null, posted: true, crowded: true })), 0);
eq("timing steps", [12, 18, 30, null].map((d) => priorityParts(facts({ due: d }))[6]), [1, 0.6, 0.3, 0]);
eq("found both ways needs both", priorityParts(facts({ crawl: 0 }))[3], 0);
eq("crowded when many publishers", crowdedOf({ li: 0, pubs: 16 }), true);
eq("crowded when many LinkedIn voices", crowdedOf({ li: 3, pubs: 2 }), true);
eq("rising: small and new", risingOf({ ai: 2, crawl: 1, li: 0, grow: 3 }), true);
eq("not rising: big", risingOf({ ai: 8, crawl: 4, li: 0, grow: 9 }), false);
eq("posted recently", postedRecently("VARA reserve rules for stablecoin issuers", [{ title: "My view on VARA reserve rules for stablecoin issuers", status: "Posted", publish_date: "2026-11-01" }], T), true);
eq("posted long ago does not count", postedRecently("VARA reserve rules for stablecoin issuers", [{ title: "VARA reserve rules for stablecoin issuers", status: "Posted", publish_date: "2026-09-01" }], T), false);
eq("campaign match", matchCampaign("GCC banks start tokenised deposit pilots", [{ id: "1", name: "Tokenised deposits for GCC banks" }, { id: "2", name: "Agentic payments" }])?.id, "1");

// ---------- the Digest ----------
const topics = Array.from({ length: 13 }, (_, i) => ({ ...facts({ fit: 95 - i * 5, gap: i === 5 }), title: `Topic ${i}`, service: i % 2 ? "Custody" : "Tokenisation" }));
topics.push({ ...facts({ ai: 2, crawl: 1, li: 0, pubs: 3, grow: 3, quality: 3, fit: 40, warm: 0, due: null }), title: "Rising one", service: "Custody" });
const d = selectDigest(topics);
eq("top 3, the gap topic lifted by 10", d.top.map((t) => t.title), ["Topic 0", "Topic 5", "Topic 1"]);
eq("#4 to #10", d.list.length, 7);
eq("gap lifts a topic", d.top.concat(d.list).findIndex((t) => t.title === "Topic 5") < 5, true);
eq("rising kept apart", d.rising.map((t) => t.title), ["Rising one"]);
eq("rest stays in Findings", d.rest.length, 3);
eq("services line", servicesLine([{ service: "Custody" }, { service: "Tokenisation" }, { service: "Custody" }]), "Custody 2 · Tokenisation 1");
eq("services line empty", servicesLine([]), "None");

const f = (id: string, title: string, extra: Partial<Finding> = {}): Finding => ({
  id, url: `https://x.com/${id}`, title, publisher: `Pub ${id}`, source_type: "Publication", published: "2026-11-05", confirmed: true, excerpt: "", found_by: ["ai"], found: {},
  scores: [5, 5, 5, 4, 5, 4, 3], scored_by: "rules", pillar: "Regulation-to-Architecture", geo: "MENA", service: "Stablecoin infrastructure", kind: "Fact", why: "", angle: "Operator view: what to build", orgs: ["VARA"],
  target: false, competitor: "", opp: {}, gap: false, status: "new", dismiss_reason: "", comment_target: false, post_id: null, found_at: "2026-11-05T09:00:00Z", run_id: null, ...extra,
});
const ctx = { weights: DEFAULT_WEIGHTS, bands: { post: 70, comment: 55, watch: 35, target: 40 }, today: T, warm: (o: string[]) => (o.includes("VARA") ? 2 : 0), posts: [] };
const fs = [
  f("a", "VARA opens consultation on stablecoin reserve rules"), f("b", "VARA consultation on reserve rules for stablecoin issuers", { found_by: ["crawl"], source_type: "Regulator" }),
  f("c", "RBI widens digital rupee pilot", { orgs: ["RBI"] }), f("z", "Old news", { scores: [0, 0, 0, 0, 0, 0, 0] }), f("x", "Dismissed one", { status: "dismissed" }),
  f("t", "Central bank tender", { opp: { kind: "sales", due: 18 } }), f("o", "Week-old item", { found_at: "2026-10-20T00:00:00Z" }),
];
const built = buildTopics(fs, ctx);
eq("topics built from this week's live findings", built.map((t) => t.ids), [["a", "b"], ["c"]]);
eq("topic counts both routes", [built[0].ai, built[0].crawl, built[0].quality, built[0].warm], [1, 1, 5, 2]);
eq("topic move from band", built[0].move, "Post");
const merged = applyMerges(built, fs, new Map([["https://x.com/c", "https://x.com/a"]]), ctx);
eq("merge decision combines topics", merged.map((t) => t.ids.length), [3]);
const post = topicPost(built[0], { workspace_id: "w", topic_id: "t1", rank: 1, score: 88, campaign: { id: "c1", name: "Reserves" } });
eq("post is a Discovery idea", [post.status, post.source_kind, post.angle, post.campaign_id, post.discovery.rank, post.discovery.score, post.discovery.sources.length], ["Idea", "discovery", "Operator view: what to build", "c1", 1, 88, 2]);
eq("suggest weights after weak-source dismissals", suggestWeights([1, 2, 3].map(() => ({ status: "dismissed", dismiss_reason: "Weak source", geo: "" })), DEFAULT_WEIGHTS)[0].next, [25, 20, 15, 15, 10, 15, 0]);
eq("no suggestions without outcomes", suggestWeights([], DEFAULT_WEIGHTS).length, 0);

// ---------- Content Studio: angles and sources ----------
eq("four angles from the topic", suggestAngles("VARA reserve rules").map((a) => a.kind), ["Contrarian", "GCC and India lens", "Operator view", "Numbers and prediction"]);
eq("angle uses the topic", suggestAngles("VARA reserve rules.")[1].text, "What \"VARA reserve rules\" means for mid-size banks in the GCC and India");
eq("angle line strips the kind", angleLine("How we see it: custody comes first"), "Custody comes first");
eq("source: discovery", postSource({ source_kind: "discovery", campaign_id: "x" }), "discovery");
eq("source: citations", postSource({ topic: "AI citations" }), "citations");
eq("source: campaign", postSource({ campaign_id: "x" }), "campaign");
eq("source: written here", postSource({ source_kind: "idea" }), "here");

console.log(fails ? `\n${fails} failed` : "\nall passed");
if (fails) process.exit(1);
