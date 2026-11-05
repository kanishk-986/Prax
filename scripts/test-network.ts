// Checks the export reader, rules and warm paths against a fake LinkedIn export with LinkedIn's real file layout.
// Run: node scripts/test-network.ts [path/to/write/fake-export.zip]
import { zipSync, strToU8 } from "fflate";
import { writeFileSync } from "node:fs";
import { readExport, segmentFor, seniority, topicsFor, warmPaths, indexPeople, normCompany, normName, toDay, DEFAULT_SEGMENTS, DEFAULT_TOPICS, type Person } from "../src/lib/network.ts";

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
const seg = (c: string, r: string) => segmentFor(c, r, DEFAULT_SEGMENTS, pc);
eq("segments", [seg("Toku", "CEO"), seg("RAKBANK", "Head of Digital Assets"), seg("Moniepoint Inc.", "VP Payments"), seg("BNB Chain", "Head of Partnerships"), seg("Acme Payments Ltd", "Engineer"), seg("Fintech Business Weekly", "Editor"), seg("Some Logistics", "Driver")], ["A", "B", "D", "C", "A", "A", ""]);
eq("seniority", ["CEO and Founder", "Head of Digital Assets", "Relationship Manager", "Software Engineer", "Head of Partnerships"].map(seniority), [0, 1, 2, 3, 1]);
eq("topics", [topicsFor(x.posts[0].text, DEFAULT_TOPICS), topicsFor(x.posts[2].text, DEFAULT_TOPICS)], [["Money That Moves Itself"], ["Regulation-to-Architecture", "Production-Grade or Nothing"]]);

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

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
