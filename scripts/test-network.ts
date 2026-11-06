// Checks the export reader, rules and warm paths against a fake LinkedIn export with LinkedIn's real file layout.
// Run: node scripts/test-network.ts [path/to/write/fake-export.zip]
import { zipSync, strToU8 } from "fflate";
import { writeFileSync } from "node:fs";
import { readExport, segmentFor, seniority, topicsFor, warmPaths, indexPeople, normCompany, normName, toDay, DEFAULT_SEGMENTS, defaultTopics, mutualOf, mutualLine, targetNews, topicPeople, topicExplainPrompt, parseTopicExplain, type Person, type SegRule, type TopicRule } from "../src/lib/network.ts";

// Fixtures: the first profile's own segment rules and pillar topics (db/016 writes them into its network_settings).
const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const SEGS: SegRule[] = [
  { seg: "D", roles: [], companies: list("africa, african, nigeria, nigerian, lagos, abuja, kenya, kenyan, nairobi, ghana, accra, south africa, johannesburg, cape town, egypt, egyptian, cairo, morocco, casablanca, rwanda, kigali, uganda, kampala, tanzania, ethiopia, senegal, ivory coast, zambia, mpesa, m pesa, flutterwave, paystack, chipper, onafriq, yellow card, nomba, moniepoint, opay, palmpay, mfs africa") },
  { seg: "B", roles: [], companies: list("emirates, emirati, uae, dubai, abu dhabi, sharjah, ajman, ras al khaimah, rak, saudi, ksa, riyadh, riyad, jeddah, qatar, qatari, doha, bahrain, manama, kuwait, kuwaiti, oman, muscat, gulf, gcc, mena, adgm, difc, india, indian, mumbai, bengaluru, bangalore, delhi, hyderabad, chennai, pune, gurugram, gurgaon, noida, rakbank, mashreq, adcb, adib, fab, first abu dhabi, enbd, emirates nbd, dib, cbd, wio, al rajhi, alinma, snb, sab, anb, bsf, qnb, nbk, kfh, hdfc, icici, axis bank, kotak, sbi, yes bank, indusind, paytm, razorpay, phonepe") },
  ...DEFAULT_SEGMENTS.filter((r) => r.seg === "C"),
  { seg: "A", roles: list("payments, treasury"), companies: list("pay, payments, payment, stablecoin, stablecoins, remittance, remit, fintech, fx, money, wallet, card, cards, card issuing, cross border, banking as a service, baas, circle, ripple, stripe, wise, checkout, adyen, airwallex, rapyd, nium, thunes, conduit, rain, bvnk, paxos, zepz, toku") },
  ...DEFAULT_SEGMENTS.filter((r) => r.seg === "E"),
];
const TOPICS: TopicRule[] = [
  { name: "Money That Moves Itself", words: list("stablecoin, stablecoins, payment, payments, remittance, remittances, cross border, treasury, tokenised deposit, tokenized deposit, tokenised deposits, tokenized deposits, deposit token, deposit tokens, settlement, rails, usdc, usdt, cbdc, liquidity, fx, correspondent banking") },
  { name: "The Liquid Balance Sheet", words: list("tokenisation, tokenization, tokenised, tokenized, rwa, rwas, real world asset, real world assets, fund, funds, private credit, real estate, bond, bonds, treasuries, asset management, asset manager, asset managers, securities") },
  { name: "Regulation-to-Architecture", words: list("regulation, regulations, regulator, regulators, regulatory, compliance, genius act, mica, vara, mas, rbi, cbuae, sama, sec, occ, fca, licence, license, licensing, aml, kyc, travel rule, policy, rulebook, sandbox") },
  { name: "Production-Grade or Nothing", words: list("security, custody, custodian, custodians, key management, mpc, audit, auditor, resilience, hack, hacked, breach, exploit, incident, soc 2, iso 27001, post quantum, quantum, cryptographic, infrastructure, production") },
  { name: "Agentic Finance", words: list("ai agent, ai agents, agentic, agent, agents, autonomous, know your intent, kyi, abstraxn, machine payments, agent payments, llm, ai") },
  { name: "Build, Buy or Partner", words: list("tco, total cost, build vs buy, build or buy, vendor, vendors, procurement, time to value, cost, costs, roi, business case, outsourcing") },
];

const connections = `Notes:
"When exporting your connection data, you may notice that some of the email addresses are missing. You will only see email addresses for connections who have allowed their connections to see or download their email address using this setting https://www.linkedin.com/psettings/privacy/email. You can learn more about this here: https://www.linkedin.com/help/linkedin/answer/261"

First Name,Last Name,URL,Email Address,Company,Position,Connected On
Kenneth,O’Friel,https://www.linkedin.com/in/kofriel,,Toku,CEO and Founder,12 Mar 2025
Asha,Rao,https://www.linkedin.com/in/asharao/,,RAKBANK,"Head of Digital Assets, Treasury",01 Oct 2026
Omar,Haddad,https://www.linkedin.com/in/omarh,,RAKBANK,Relationship Manager,03 Jan 2024
Tunde,Bello,https://www.linkedin.com/in/tbello,,Moniepoint Inc.,VP Payments,20 Jun 2026
Priya,Nair,https://www.linkedin.com/in/pnair,,Fintech Business Weekly,Editor,02 Feb 2023
Lena,Fischer,https://www.linkedin.com/in/lfischer,,BNB Chain,Head of Partnerships,10 Sep 2026
Sam,Lee,https://www.linkedin.com/in/samlee,,Acme Payments Ltd,Software Engineer,15 Jul 2022
Jo,Park,https://www.linkedin.com/in/jopark,,Some Logistics,Driver,15 Jul 2022
`;
const messages = `CONVERSATION ID,CONVERSATION TITLE,FROM,SENDER PROFILE URL,TO,RECIPIENT PROFILE URLS,DATE,SUBJECT,CONTENT,FOLDER
c1,,Shashi Pal,https://www.linkedin.com/in/shashipal,Kenneth O'Friel,https://www.linkedin.com/in/kofriel,2026-10-01 10:00:00 UTC,,"Hi Kenneth, thanks for connecting",INBOX
c1,,Kenneth O'Friel,https://www.linkedin.com/in/kofriel,Shashi Pal,https://www.linkedin.com/in/shashipal,2026-10-03 09:00:00 UTC,,"Likewise, let us talk
next week",INBOX
c2,,Shashi Pal,https://www.linkedin.com/in/shashipal,Asha Rao,https://www.linkedin.com/in/asharao,2026-10-20 12:00:00 UTC,,Quick question,INBOX
c3,Group,Shashi Pal,https://www.linkedin.com/in/shashipal,"Asha Rao, Omar Haddad","https://www.linkedin.com/in/asharao, https://www.linkedin.com/in/omarh",2026-10-21 12:00:00 UTC,,Group hello,INBOX
`;
const invitations = `From,To,Sent At,Message,Direction,inviterProfileUrl,inviteeProfileUrl
Shashi Pal,Mariam Khan,"11/2/26, 5:10 PM",,OUTGOING,https://www.linkedin.com/in/shashipal,https://www.linkedin.com/in/mariamk
`;
const shares = `Date,ShareLink,ShareCommentary,SharedUrl,MediaUrl,Visibility
2026-10-21 08:01:12,https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A1,"Stablecoin settlement is only half the story; reconciliation is the other half.",,,MEMBER_NETWORK
2026-09-02 08:01:12,https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A2,"What post-quantum migration does to a tokenised asset's proof of ownership",,,MEMBER_NETWORK
`;
const comments = `Date,Link,Message
2026-10-25 11:00:00,https://www.linkedin.com/feed/update/urn:li:activity:9,"In my view, VARA rules will shape how banks hold custody."
`;

const zip = zipSync({
  "Connections.csv": strToU8(connections), "messages.csv": strToU8(messages), "Invitations.csv": strToU8(invitations),
  "Shares.csv": strToU8(shares), "Comments.csv": strToU8(comments), "Profile.csv": strToU8("First Name,Last Name\nShashi,Pal\n"),
});
if (process.argv[2]) { writeFileSync(process.argv[2], zip); console.log("wrote", process.argv[2]); }

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

const x = readExport(zip, "Basic_LinkedInDataExport_11-05-2026.zip", "2026-11-05");
eq("export date from file name", x.exportDate, "2026-11-05");
eq("files found", x.files, ["connections.csv", "messages.csv", "invitations.csv", "shares.csv", "comments.csv"]);
eq("counts", x.counts, { connections: 8, messaged: 2, invites: 1, posts: 2, comments: 1 });
const k = x.people.find((p) => p.key === "linkedin.com/in/kofriel")!;
eq("Kenneth messages (1:1 only)", [k.msg_count, k.msg_last, k.msg_last_from], [2, "2026-10-03", "them"]);
const a = x.people.find((p) => p.key === "linkedin.com/in/asharao")!;
eq("Asha: group thread ignored, waiting on them", [a.msg_count, a.msg_last_from], [1, "us"]);
eq("owner of the export not stored", x.people.some((p) => p.key.includes("shashipal")), false);
eq("pending invite", x.people.find((p) => p.key === "linkedin.com/in/mariamk")?.invite, "sent");
eq("multi-line message parsed", x.people.length, 9);

eq("dates", [toDay("05 Nov 2026"), toDay("11/2/26, 5:10 PM"), toDay("2026-10-21 08:01:12 UTC")], ["2026-11-05", "2026-11-02", "2026-10-21"]);
eq("company norm", [normCompany("Moniepoint Inc."), normCompany("Jeel (Riyad Bank innovation arm)"), normCompany("Acme Payments Ltd")], ["moniepoint", "jeel", "acmepayments"]);
eq("name norm", [normName("Kenneth O’Friel"), normName("Dr. Kenneth O'Friel, CFA")], ["kenneth ofriel", "kenneth ofriel"]);

const pc = new Map([[normCompany("Toku"), "A"]]);
const seg = (c: string, r: string) => segmentFor(c, r, SEGS, pc);
eq("segments", [seg("Toku", "CEO"), seg("RAKBANK", "Head of Digital Assets"), seg("Moniepoint Inc.", "VP Payments"), seg("BNB Chain", "Head of Partnerships"), seg("Acme Payments Ltd", "Engineer"), seg("Fintech Business Weekly", "Editor"), seg("Some Logistics", "Driver")], ["A", "B", "D", "C", "A", "A", ""]);
eq("seniority", ["CEO and Founder", "Head of Digital Assets", "Relationship Manager", "Software Engineer", "Head of Partnerships"].map(seniority), [0, 1, 2, 3, 1]);
eq("topics", [topicsFor(x.posts[0].text, TOPICS), topicsFor(x.posts[2].text, TOPICS)], [["Money That Moves Itself"], ["Regulation-to-Architecture", "Production-Grade or Nothing"]]);
// A new profile starts clean: only the generic role rules segment anyone, and its pillars have no words yet.
const fresh = (c: string, r: string) => segmentFor(c, r, DEFAULT_SEGMENTS, new Map());
eq("new profile: no region or buyer guesses", [fresh("RAKBANK", "Head of Digital Assets"), fresh("Acme Payments Ltd", "Engineer"), fresh("BNB Chain", "Head of Partnerships"), fresh("Fintech Business Weekly", "Editor")], ["", "", "C", "E"]);
eq("new profile: pillars become empty topic rules", [defaultTopics(["Ops", "Hiring"]), topicsFor(x.posts[0].text, defaultTopics(["Ops"]))], [[{ name: "Ops", words: [] }, { name: "Hiring", words: [] }], []]);

const people: Person[] = x.people.map((p) => ({ ...p, segment_manual: "", prospect_id: null, not_prospects: [], first_export: x.exportDate, last_export: x.exportDate }));
const idx = indexPeople(people);
const kp = { id: "p1", name: "Kenneth O'Friel", company: "Toku", role: "CEO", stage: "Connected", segment: "A", linkedin: "" };
const w1 = warmPaths(kp, people, idx, [{ author: "Kenneth O'Friel", reply: true, day: "2026-10-10" }]);
eq("name+company match suggested, not linked", [!!w1.linked, w1.suggest.length, w1.suggest[0]?.strong, w1.level], [false, 1, true, 2]);
const w2 = warmPaths({ ...kp, linkedin: "https://linkedin.com/in/kofriel/?trk=x" }, people, idx, []);
eq("URL match links directly", [w2.linked?.key, w2.level, w2.msgs?.count], ["linkedin.com/in/kofriel", 1, 2]);
const rp = { id: "p2", name: "Rania Saleh", company: "RAKBANK", role: "Group CEO", stage: "Target", segment: "B", linkedin: "" };
const w3 = warmPaths(rp, people, idx, []);
eq("colleagues ranked by seniority", [w3.level, w3.colleagues.map((c) => c.name)], [3, ["Asha Rao", "Omar Haddad"]]);
people.find((p) => p.key === "linkedin.com/in/kofriel")!.not_prospects = ["p1"];
eq("'not them' hides the suggestion", warmPaths(kp, people, indexPeople(people), []).suggest.length, 0);

// ---------- mutual connections and location read by the extension (N11, N12) ----------
eq("no mutual line without a profile read", w3.mutual, undefined);
const w4 = warmPaths({ ...rp, mutual_count: 14, mutual_names: ["Priya Nair", "Tom Becker"], profile_read_at: "2026-11-06T10:00:00Z" }, people, idx, []);
eq("mutual connections on the prospect, level unchanged", [w4.mutual?.count, w4.level], [14, 3]);
eq("the newest read wins", mutualOf({ mutual_count: 2, mutual_names: ["A", "B"], profile_read_at: "2026-11-01" }, { mutual_count: 5, mutual_names: [], profile_read_at: "2026-11-05" })?.count, 5);
eq("mutual line with others", mutualLine({ count: 14, names: ["Priya Nair", "Tom Becker"], at: null }), "14 mutual connections, including Priya Nair and Tom Becker");
eq("mutual line, all named", mutualLine({ count: 1, names: ["Kim Park"], at: null }), "1 mutual connection: Kim Park");
eq("mutual line, count only", mutualLine({ count: 1204, names: [], at: null }), "1,204 mutual connections");
const geo: SegRule[] = [{ seg: "D", companies: ["emirates nbd"], roles: [], places: ["dubai", "abu dhabi"] }, { seg: "C", companies: [], roles: ["partnerships"] }];
eq("location rule puts a Dubai person in D", segmentFor("Northbank", "Treasurer", geo, new Map(), "Dubai, United Arab Emirates"), "D");
eq("no location, no location match", segmentFor("Northbank", "Treasurer", geo, new Map()), "");
eq("older rules without places still work", segmentFor("Acme", "Head of Partnerships", [{ seg: "C", companies: [], roles: ["partnerships"] }], new Map(), "Dubai"), "C");

// ---------- target accounts in the news (DS16), same matching as db/024 ----------
const nf = (id: string, title: string, orgs: string[] = [], extra = {}) => ({ id, url: `https://n.example/${id}`, title, orgs, status: "new", found_at: `2026-11-0${id.length}T00:00:00Z`, ...extra });
const tp = [{ id: "a", name: "Omar", company: "Gulf Union Bank PJSC", stage: "Target" }, { id: "b", name: "Lena", company: "Northbank", stage: "Warming" }, { id: "c", name: "Pat", company: "Parkbank", stage: "Parked" }, { id: "d", name: "Al", company: "ABC", stage: "Target" }];
const hits = (f: ReturnType<typeof nf>[]) => targetNews(f, tp).map((x) => `${x.finding.id}:${x.prospect.id}`);
eq("organisation named, legal suffix ignored", hits([nf("1", "Pilots in the Gulf", ["Gulf Union Bank"])]), ["1:a"]);
eq("company in the title, whole words only", hits([nf("2", "Why Northbank moved treasury"), nf("3", "Northbankers club")]), ["2:b"]);
eq("Parked, short names in titles, dismissed and profiles are skipped", hits([nf("4", "Parkbank news", ["Parkbank"]), nf("5", "ABC of stablecoins"), nf("6", "Northbank", [], { status: "dismissed" }), nf("7", "Lena: CFO at Northbank", ["Northbank"], { found: { linkedin: { kind: "profile" } } })]), []);
eq("short company names still match as an organisation", hits([nf("8", "A deal", ["ABC"])]), ["8:d"]);

// ---------- Explain with AI on a topic (N10) ----------
const tpeople = topicPeople({ name: "Stablecoins", words: ["stablecoin", "treasury"] }, [
  { ...people[0], key: "k1", name: "Zed Treasurer", position: "Head of Treasury and Stablecoin", company: "X", is_connection: true },
  { ...people[0], key: "k2", name: "Amy Ceo", position: "CEO", company: "Stablecoin Labs", is_connection: true },
  { ...people[0], key: "k3", name: "No Match", position: "Designer", company: "Y", is_connection: true },
  { ...people[0], key: "k4", name: "Not Connected", position: "Treasury", company: "Z", is_connection: false },
]);
eq("topic people: matches only, most matches first, connections only", tpeople.map((p) => p.name), ["Zed Treasurer", "Amy Ceo"]);
eq("topic people: a topic with no words uses its name", topicPeople({ name: "Tokenisation", words: [] }, [{ ...people[0], key: "t", name: "Tia", position: "Tokenisation lead", company: "", is_connection: true }]).length, 1);
const ask = topicExplainPrompt({ topic: "Stablecoins", words: ["stablecoin"], who: "Shashi Pal, COO at Antier", pillars: ["Stablecoins"], posts: [{ kind: "post", day: "2026-10-01", text: "On stablecoins" }], people: tpeople });
eq("prompt numbers the people and asks for JSON", [/1\. Zed Treasurer/.test(ask), /Return only JSON/.test(ask)], [true, true]);
const ex = parseTopicExplain({ meaning: "It matters.", next: "Call Zed.", talk: [{ n: 1, why: "Runs treasury." }, { n: 1, why: "again" }, { n: 9, why: "invented" }, { n: 2, why: "Builds it." }] }, tpeople);
eq("explain keeps listed people once and drops invented ones", ex?.talk.map((t) => [t.name, t.why]), [["Zed Treasurer", "Runs treasury."], ["Amy Ceo", "Builds it."]]);
eq("explain without meaning is rejected", parseTopicExplain({ talk: [] }, tpeople), null);

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
