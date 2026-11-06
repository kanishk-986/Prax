// Checks the Prax bar's post detection (extension/dom.js) against LinkedIn-like HTML fixtures in
// scripts/fixtures/linkedin, plus the analytics reader. Run: node scripts/test-extension.ts
// The fixtures are hand-written to match LinkedIn's old and new layouts; they are not saved LinkedIn pages.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseHTML } from "linkedom";

const require = createRequire(import.meta.url);
const D = require("../extension/dom.js");

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const load = (f: string) => parseHTML(readFileSync(new URL(`./fixtures/linkedin/${f}`, import.meta.url), "utf8")).document;
const at = (href: string) => ({ href, pathname: new URL(href).pathname });
type El = { contains: (o: unknown) => boolean };

// ---------- button labels ----------
eq("Like by aria label", D.kindOf("React Like"), "like");
eq("Like in the newer layout", D.kindOf("Reaction button state: no reaction"), "like");
eq("Comment", D.kindOf("Comment"), "comment");
eq("Comment with a name", D.kindOf("Comment on Amira's post"), "comment");
eq("a comment count is not an action", D.kindOf("14 comments"), "");
eq("Comments heading is not an action", D.kindOf("Comments"), "");
eq("Repost", D.kindOf("Repost"), "share");
eq("Send", D.kindOf("Send in a private message"), "share");
eq("Reply is not a post action", D.kindOf("Reply to Priya Nair's comment"), "");
eq("Connect is not a post action", D.kindOf("Connect"), "");

// ---------- each layout ----------
function check(file: string, loc: string, want: { rows: number; authors: string[]; urls: string[]; texts: string[] }) {
  const doc = load(file);
  const rows = D.findActionRows(doc);
  eq(`${file}: one action row per post`, rows.length, want.rows);
  const posts = rows.map((r: unknown) => D.postOf(r, rows));
  eq(`${file}: every post is a different element`, new Set(posts).size, rows.length);
  eq(`${file}: every post holds its own row and no other`, posts.every((p: El, i: number) => p.contains(rows[i]) && rows.every((r: unknown, j: number) => j === i || !p.contains(r))), true);
  const read = posts.map((p: unknown, i: number) => D.readPost(p, rows[i], at(loc)));
  eq(`${file}: authors`, read.map((r: { author: string }) => r.author), want.authors);
  eq(`${file}: post links`, read.map((r: { url: string }) => r.url), want.urls);
  eq(`${file}: post text starts`, read.map((r: { text: string }, i: number) => r.text.startsWith(want.texts[i])), want.texts.map(() => true));
  const keys = posts.map((p: unknown, i: number) => D.postKey(p, rows[i]));
  eq(`${file}: a different key per post`, new Set(keys).size, rows.length);
  eq(`${file}: keys are stable`, posts.map((p: unknown, i: number) => D.postKey(p, rows[i])), keys);
  return { doc, rows, posts, read };
}

check("feed-classic.html", "https://www.linkedin.com/feed/", {
  rows: 3,
  authors: ["Amira Haddad", "FinCorp", "Omar Saleh"],
  urls: ["https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000001/", "https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000002/", "https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000003/"],
  texts: ["Tokenised deposits", "We are hiring", "Worth reading"],
});

const fresh = check("feed-new.html", "https://www.linkedin.com/feed/", {
  rows: 4,
  authors: ["Lena Fischer", "Raj Mehta", "Sara Lim", "LedgerCo"],
  urls: ["https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000011/", "https://www.linkedin.com/posts/raj-mehta_settlement-activity-7390000000000000012-abcd", "https://www.linkedin.com/feed/", "https://www.linkedin.com/feed/"],
  texts: ["Our board asked", "Settlement finality", "", "Real-time reconciliation"],
});
eq("feed-new: a post with Repost turned off still gets found", fresh.read[1].author, "Raj Mehta");
eq("feed-new: author link without a known class", fresh.read[0].authorUrl, "https://www.linkedin.com/in/lena-fischer/");

const single = check("single-post.html", "https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000021/?commentUrn=x", {
  rows: 1,
  authors: ["Shashi Pal"],
  urls: ["https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000021/"],
  texts: ["Most banks will not build"],
});
eq("single post: comments are read, including the nested reply", single.read[0].comments.map((c: { author: string }) => c.author), ["Priya Nair", "Shashi Pal", "Tom Becker"]);
eq("single post: the comment box submit button is not a row", single.rows.some((r: { querySelector: (s: string) => unknown }) => r.querySelector("[type='submit']")), false);

check("activity-and-search.html", "https://www.linkedin.com/search/results/content/?keywords=gcc", {
  rows: 2,
  authors: ["Nadia Karim", "Nadia Karim"],
  urls: ["https://www.linkedin.com/feed/update/urn:li:share:7390000000000000031/", "https://www.linkedin.com/feed/update/urn:li:ugcPost:7390000000000000032/"],
  texts: ["Interoperability", "Second post"],
});

// ---------- late posts and re-renders ----------
{
  const doc = load("feed-new.html");
  const list = doc.querySelector(".x9f2a");
  list.insertAdjacentHTML("beforeend", `<div data-view-name="feed-full-update"><a href="/in/late/"><span>Late Poster</span></a><div data-view-name="feed-commentary"><span>Loaded after scrolling.</span></div><div><button>Like</button><button>Comment</button><button>Repost</button></div></div>`);
  eq("a post added later is found", D.findActionRows(doc).length, 5);
  // Prax's own bar has buttons too; it must never be read as a post.
  const row = D.findActionRows(doc)[0];
  row.insertAdjacentHTML("afterend", `<div class="prx-bar"><button>Write with Prax</button><button>Comment</button><button>Like</button></div>`);
  eq("Prax's own bar is not a row", D.findActionRows(doc).length, 5);
  // A recycled row that now shows another post gets a different key.
  const post = D.postOf(row, D.findActionRows(doc));
  const before = D.postKey(post, row);
  post.querySelector("a[href*='urn:li:']").setAttribute("href", "/feed/update/urn:li:activity:7390000000000000099/");
  eq("a recycled post gets a new key", D.postKey(post, row) !== before, true);
}

{
  const doc = parseHTML(`<main><div><a href="/in/kim/"><span aria-hidden="true">Kim Park</span><span class="visually-hidden">Kim Park</span></a><p>Text.</p><div><button>Like</button><button>Comment</button></div></div></main>`).document;
  const rows = D.findActionRows(doc);
  eq("a name with a hidden screen-reader copy is read once", D.authorOf(D.postOf(rows[0], rows)), "Kim Park");
}

// ---------- the post nearest the middle (side panel Read this post) ----------
eq("nearest post exists on a feed", !!D.nearestPost(load("feed-classic.html"), 400), true);
eq("no post on a page without posts", D.nearestPost(parseHTML("<main><button>Connect</button></main>").document, 400), null);

// ---------- analytics ----------
eq("analytics with numbers above labels", D.parseAnalytics("Analytics\n1,234\nPost impressions\nPast 7 days\n5,678\nTotal followers\n321\nProfile viewers\n45\nSearch appearances"),
  { impressions_7d: 1234, followers: 5678, profile_views_90d: 321, search_appearances: 45 });
eq("analytics with a percent change between", D.parseAnalytics("1,234\n12.5%\nPost impressions\n2.1K\nFollowers"), { impressions_7d: 1234, followers: 2100 });
eq("analytics written inline", D.parseAnalytics("1.2M post impressions\n980 followers"), { impressions_7d: 1200000, followers: 980 });
eq("no analytics on other text", D.parseAnalytics("Home\nMy Network\nJobs"), {});

// ---------- profile pages (Prax profile bar: mutual connections, location, Send to Discovery) ----------
eq("mutual: names and others", D.parseMutual("Priya Nair, Tom Becker and 12 other mutual connections"), { count: 14, names: ["Priya Nair", "Tom Becker"] });
eq("mutual: Oxford comma", D.parseMutual("Priya Nair, Tom Becker, and 1 other mutual connection"), { count: 3, names: ["Priya Nair", "Tom Becker"] });
eq("mutual: two names", D.parseMutual("Priya Nair and Tom Becker are mutual connections"), { count: 2, names: ["Priya Nair", "Tom Becker"] });
eq("mutual: one name", D.parseMutual("Kim Park is a mutual connection"), { count: 1, names: ["Kim Park"] });
eq("mutual: count only", D.parseMutual("1,204 mutual connections"), { count: 1204, names: [] });
eq("mutual: other text", D.parseMutual("500+ connections"), null);
eq("company from a headline", D.companyOf("Head of Digital Assets at Gulf Union Bank | Custody"), "Gulf Union Bank");
eq("no company in a headline without at", D.companyOf("Board member, investor"), "");
eq("profile path", [D.isProfilePath("/in/omar-saleh/"), D.isProfilePath("/in/omar-saleh"), D.isProfilePath("/in/omar-saleh/recent-activity/all/"), D.isProfilePath("/feed/")], [true, true, false, false]);
{
  const p = D.readProfile(load("profile-classic.html"), at("https://www.linkedin.com/in/omar-saleh/?miniProfileUrn=x"));
  eq("classic profile: url without query", p.url, "https://www.linkedin.com/in/omar-saleh/");
  eq("classic profile: name", p.name, "Omar Saleh");
  eq("classic profile: headline", p.headline, "Head of Digital Assets at Gulf Union Bank | Custody, tokenisation and settlement");
  eq("classic profile: company", p.company, "Gulf Union Bank");
  eq("classic profile: location", p.location, "Dubai, United Arab Emirates");
  eq("classic profile: mutual connections read once, not from the hidden copy", p.mutual, { count: 14, names: ["Priya Nair", "Tom Becker"] });
  eq("classic profile: recent activity on screen", p.activity.map((a: { url: string }) => a.url), ["https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000041/", "https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000042/"]);
  eq("classic profile: activity text", p.activity[0].text.startsWith("Tokenised deposits will settle"), true);
}
{
  const p = D.readProfile(load("profile-new.html"), at("https://www.linkedin.com/in/lena-fischer/"));
  eq("new profile: name", p.name, "Lena Fischer");
  eq("new profile: headline without a known class", p.headline, "CFO at Northbank | Tokenisation, treasury and payments");
  eq("new profile: location from the line before Contact info", p.location, "Frankfurt, Hesse, Germany");
  eq("new profile: one mutual connection", p.mutual, { count: 1, names: ["Kim Park"] });
  eq("new profile: no Activity section", p.activity, []);
}
{
  const p = D.readProfile(load("profile.html"), at("https://www.linkedin.com/in/lena-fischer/"));
  eq("capture fixture: no mutual line means none, not zero", p.mutual, null);
  eq("capture fixture: location from a plain span is not guessed", typeof p.location, "string");
}
{
  // The side list of "People also viewed" names mutual connections of other people: never read as this profile's.
  const doc = parseHTML(`<main><section><h1>Ana Ruiz</h1><div>Partner at Ruiz Legal</div></section><aside><section><h2>People also viewed</h2><span>Lina Haddad is a mutual connection</span></section></aside></main>`).document;
  eq("mutual line of another person in a side list is ignored", D.readProfile(doc, at("https://www.linkedin.com/in/ana-ruiz/")).mutual, null);
}

// ---------- one post's results (side panel Read analytics on a post, CS29) ----------
{
  const main = load("post-analytics.html").querySelector("main");
  eq("post analytics: the four numbers, label above or below its number", D.postResultsIn(main), { impressions: 4820, reactions: 126, comments: 18, reposts: 7 });
  const own = parseHTML(`<main><div class="post"><p>Our view on tokenised deposits.</p><div><span>1,234 impressions</span><a href="#">View analytics</a></div>
    <ul><li><button><span>56</span><span class="visually-hidden">56 reactions</span></button></li><li><button>7 comments</button></li><li><button>3 reposts</button></li></ul>
    <div><button>Like</button><button>Comment</button><button>Repost</button></div></div></main>`).document.querySelector("main");
  eq("own post page: counts written inline", D.postResultsIn(own), { impressions: 1234, comments: 7, reposts: 3 });
  eq("someone else's post (no impressions shown) gives nothing", D.postResultsIn(load("single-post.html").querySelector("main")), null);
  eq("activity id from a post page", D.activityIdOf("https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000051/"), "7390000000000000051");
  eq("activity id from an analytics page with an encoded urn", D.activityIdOf("https://www.linkedin.com/analytics/post-summary/urn%3Ali%3Aactivity%3A7390000000000000051/"), "7390000000000000051");
  eq("activity id from a /posts/ link", D.activityIdOf("https://www.linkedin.com/posts/shashi-pal_stablecoins-activity-7390000000000000051-abcd"), "7390000000000000051");
  eq("post results pages", [D.isPostResultsPage("/analytics/post-summary/urn:li:activity:1/"), D.isPostResultsPage("/feed/update/urn:li:activity:1/"), D.isPostResultsPage("/posts/x-activity-1"), D.isPostResultsPage("/analytics/creator/"), D.isPostResultsPage("/feed/")], [true, true, true, false, false]);
}

// ---------- a messaging thread the user has open (Send to Prax Inbox, X7) ----------
{
  const t = D.readThread(load("messaging-thread.html"), at("https://www.linkedin.com/messaging/thread/2-abc123/?filter=unread"));
  eq("thread: the other person", [t.name, t.url, t.company], ["Omar Saleh", "https://www.linkedin.com/in/omar-saleh/", "Gulf Union Bank"]);
  eq("thread: headline", t.headline, "Head of Digital Assets at Gulf Union Bank | Custody, tokenisation and settlement");
  eq("thread: link without query", t.thread_url, "https://www.linkedin.com/messaging/thread/2-abc123/");
  eq("thread: their last message, not ours, not another thread's", t.text, "Happy to compare notes on custody. Are you in Dubai next week?");
  eq("thread: when it was sent, from its group", t.received_at, "2026-11-05T08:10:00Z");
  eq("thread path", [D.isThreadPath("/messaging/thread/2-abc123/"), D.isThreadPath("/messaging/"), D.isThreadPath("/feed/")], [true, false, false]);
  const fresh = parseHTML(`<main><div data-view-name="message-thread"><header><a href="/in/kim-park/"><h2 data-view-name="thread-title">Kim Park</h2></a><p data-view-name="thread-headline">COO at Seoul Pay</p></header>
    <ul><li data-view-name="message-list-item"><span data-view-name="message-sender">Shashi Pal</span><div data-view-name="message-body">Good to meet you.</div></li></ul></div></main>`).document;
  const k = D.readThread(fresh, at("https://www.linkedin.com/messaging/thread/2-x/"));
  eq("newer layout: person and company", [k.name, k.company, k.url], ["Kim Park", "Seoul Pay", "https://www.linkedin.com/in/kim-park/"]);
  eq("newer layout: no message from them yet", k.text, "");
}

// ---------- Check replies (I1) ----------
{
  const NOW = Date.parse("2026-11-07T12:00:00Z");
  const ago = (ms: number) => new Date(NOW - ms).toISOString();
  const H = 36e5, Dy = 864e5;
  eq("relative times", ["2h", "45m", "1d", "3w", "2mo", "1yr", "now", "2h • Edited", "Edited", ""].map((x) => D.relTimeIso(x, NOW)),
    [ago(2 * H), ago(45 * 6e4), ago(Dy), ago(21 * Dy), ago(60 * Dy), ago(365 * Dy), ago(0), ago(2 * H), "", ""]);
  eq("the profile by name", [D.isMe("Shashi Pal", "Shashi Pal"), D.isMe("Shashi Pal Author", "Shashi Pal"), D.isMe("shashi pal • 1st", "Shashi Pal"), D.isMe("Shashi Palmer", "Shashi Pal"), D.isMe("Priya Nair", "Shashi Pal"), D.isMe("", "Shashi Pal")],
    [true, true, true, false, false, false]);
  eq("notifications path", [D.isNotificationsPath("/notifications/"), D.isNotificationsPath("/notifications/?filter=all"), D.isNotificationsPath("/feed/")], [true, true, false]);

  const n = D.readNotifications(load("notifications.html"), "Shashi Pal", NOW);
  eq("notifications: every card looked at", n.cards, 8);
  eq("notifications: only replies, comments on the post and mentions, never the profile itself", n.replies.map((r: { name: string; kind: string }) => [r.name, r.kind]),
    [["Priya Nair", "comment_reply"], ["Tom Becker", "post_comment"], ["Hessa Al Marri", "mention"], ["Sara Lim", "comment_reply"]]);
  eq("notifications: the reply text without quotes", n.replies[0].text, "In my view the settlement layer decides it, and most banks have not priced that in yet.");
  eq("notifications: profile links", n.replies.map((r: { url: string }) => r.url),
    ["https://www.linkedin.com/in/priya-nair/", "https://www.linkedin.com/in/tom-becker-123/", "https://www.linkedin.com/in/hessa-al-marri/", "https://www.linkedin.com/in/sara-lim/"]);
  eq("notifications: post links by activity id, also from /posts/ links", n.replies.map((r: { post_url: string }) => r.post_url),
    ["https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000031/", "https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000021/",
      "https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000044/", "https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000031/"]);
  eq("notifications: times", n.replies.map((r: { at: string }) => r.at), [ago(2 * H), ago(Dy), ago(21 * Dy), ago(45 * 6e4)]);
  eq("notifications: a cut-off reply keeps its text", n.replies[3].text, "Agreed, the audit trail is the product…");
  eq("notifications: none without a name to match", D.readNotifications(load("notifications.html"), "", NOW).replies.length, 5);

  const p = D.readPostReplies(load("post-replies.html"), at("https://www.linkedin.com/feed/"), "Shashi Pal", NOW);
  eq("post: both posts, the profile's comments and its own post", [p.posts, p.mine, p.own], [2, 3, 1]);
  eq("post: replies under the profile's comment, then comments on its own post", p.replies.map((r: { name: string; kind: string }) => [r.name, r.kind]),
    [["Priya Nair", "comment_reply"], ["Tom Becker", "comment_reply"], ["Lena Fischer", "post_comment"], ["Raj Mehta", "post_comment"]]);
  eq("post: reply fields", [p.replies[0].url, p.replies[0].text, p.replies[0].post_url, p.replies[0].at],
    ["https://www.linkedin.com/in/priya-nair/", "Agreed, and the reconciliation work behind it is where most of the cost sits.", "https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000031/", ago(2 * H)]);
  eq("post: the comment it answers goes along for matching", p.replies[0].mine, "In my view the settlement layer decides it, and most banks have not priced that in yet.");
  eq("post: the newer layout", [p.replies[2].url, p.replies[2].text, p.replies[2].post_url, p.replies[2].at],
    ["https://www.linkedin.com/in/lena-fischer/", "Controls are what a board signs off. The chain is a detail.", "https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000021/", ago(4 * Dy)]);
  const other = D.readPostReplies(load("post-replies.html"), at("https://www.linkedin.com/feed/"), "Kim Park", NOW);
  eq("post: someone else's view has nothing to record", [other.mine, other.own, other.replies.length], [0, 0, 0]);
  const single = D.readPostReplies(load("single-post.html"), at("https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000021/"), "Shashi Pal", NOW);
  eq("single post page: comments on the profile's own post", single.replies.map((r: { name: string }) => r.name), ["Priya Nair", "Tom Becker"]);
}

// ---------- pages ----------
eq("linkedin feed is LinkedIn", D.isLinkedIn("https://www.linkedin.com/feed/"), true);
eq("prax is not LinkedIn", D.isLinkedIn("https://prax-gamma.vercel.app/extension"), false);
eq("a look-alike host is not LinkedIn", D.isLinkedIn("https://linkedin.com.evil.example/"), false);

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
