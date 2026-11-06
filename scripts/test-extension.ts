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

// ---------- pages ----------
eq("linkedin feed is LinkedIn", D.isLinkedIn("https://www.linkedin.com/feed/"), true);
eq("prax is not LinkedIn", D.isLinkedIn("https://prax-gamma.vercel.app/extension"), false);
eq("a look-alike host is not LinkedIn", D.isLinkedIn("https://linkedin.com.evil.example/"), false);

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
