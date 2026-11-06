// End-to-end check of the Prax extension in a real Chromium, with no traffic to LinkedIn or Prax:
// every https://www.linkedin.com/ page is served from scripts/fixtures/linkedin, and the extension's
// calls to Prax and the AI provider are answered by a stub inside its service worker.
// It only does what a user does: opens pages and presses the Prax bar's and side panel's own buttons.
//
// Needs playwright-core and its Chromium (not a Prax dependency):
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core node scripts/e2e-extension.mjs [extension dir] [--baseline]
// --baseline only counts bars, for comparing an older extension build.
import { createRequire } from "node:module";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const baseline = args.includes("--baseline");
const EXT = path.resolve(args.find((a) => !a.startsWith("--")) || path.join(here, "../extension"));
const fx = (f) => readFileSync(path.join(here, "fixtures/linkedin", f), "utf8");
const inner = (html) => html.match(/<main[^>]*>([\s\S]*)<\/main>/)[1];
const FEED = fx("feed-classic.html").replace("</main>", inner(fx("feed-new.html")) + "</main>"); // 7 posts
const SINGLE_MAIN = inner(fx("single-post.html"));

let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " " + extra}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// SHOTS=<folder> also saves screenshots of the humanization card on the LinkedIn bar.
const SHOTS = process.env.SHOTS || "";
const shoot = (loc, name) => (SHOTS ? loc.screenshot({ path: path.join(SHOTS, name) }).catch(() => {}) : null);

const ctx = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), "prax-e2e-")), {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

// Nothing leaves the machine: LinkedIn pages come from fixtures, everything else LinkedIn would load is dropped.
await ctx.route(/^https:\/\/([\w-]+\.)?(linkedin|licdn)\.com\//, (route) => {
  const req = route.request();
  if (req.resourceType() !== "document") return route.abort();
  const p = new URL(req.url()).pathname;
  const html = p.startsWith("/messaging/") ? fx("messaging-thread.html") : p.startsWith("/notifications/") ? fx("notifications.html") : p.startsWith("/feed/update/urn:li:activity:7390000000000000031/") ? fx("post-replies.html") : p.startsWith("/feed/update/") ? fx("single-post.html") : p.startsWith("/in/omar-saleh") ? fx("profile-classic.html") : p.startsWith("/in/") ? fx("profile.html")
    : p.startsWith("/analytics/post-summary/") ? fx("post-analytics.html") : p.includes("analytics") ? fx("analytics.html") : p.startsWith("/search/") ? fx("activity-and-search.html") : FEED;
  return route.fulfill({ status: 200, contentType: "text/html", body: html });
});
await ctx.route(/^https:\/\/prax-gamma\.vercel\.app\//, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Prax</title><main>Prax stub</main>" }));

// The service worker's fetch is replaced: Prax and the AI provider answer with fixed replies.
async function stub(sw) {
  await sw.evaluate(() => {
    self.__calls = [];
    const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
    self.fetch = async (url, init) => {
      url = String(url); const b = init?.body ? JSON.parse(init.body) : {};
      self.__calls.push({ url, b, h: init?.headers || {} });
      // Humanization (db/031): Prax's plan and record, and Pangram's documented /models, POST /task and GET /task/{id}.
      if (url.includes("api.anthropic.com") && /flagged these sentences/.test(b.messages?.[0]?.content || "")) return J({ stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: "text", text: JSON.stringify({ changes: [{ before: "A bank has to show its board who can move collateral, when, and with what audit trail.", after: "The board will ask one thing: who can move collateral, and where is the record." }] }) }] });
      if (url.endsWith("/api/ext/humanize")) {
        if (b.op === "plan") return J({ decision: { action: "check", words: 40, cost: 0.02 }, level: 70, results: (b.texts || []).map(() => null), used: { pangram: 0, walter: 0 }, caps: { pangram: 10000, walter: 0 }, rate: 0.05 });
        const w = b.raw?.windows || [];
        return J({ result: { score: Math.round((b.raw?.fraction_human ?? 1) * 100), words: 40, flagged: w.filter((x) => !/^Human/.test(x.label)).map((x) => ({ text: x.text, label: x.label })), prediction: "", headline: "", version: "4.0" }, used: 40 });
      }
      if (url.startsWith("https://text.external-api.pangram.com/models")) return J({ models: ["default", "pangram-4"] });
      if (url === "https://text.external-api.pangram.com/task") return J({ task_id: "t" + (self.__pg = (self.__pg || 0) + 1) });
      if (url.startsWith("https://text.external-api.pangram.com/task/")) return J(self.__pg === 1
        ? { stage: "STAGE_SUCCESS", fraction_human: 0.6, windows: [{ text: "A bank has to show its board who can move collateral, when, and with what audit trail.", label: "AI-Generated", word_count: 17 }, { text: "In my view the hard part is the controls.", label: "Human Written", word_count: 9 }] }
        : { stage: "STAGE_SUCCESS", fraction_human: 0.96, windows: [] });
      if (url.includes("api.anthropic.com")) return J({ stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: "text", text: JSON.stringify({ post_type: "Opinion or hot take", mode: "Agree and add", drafts: [{ text: "In my view the hard part is the controls. A bank has to show its board who can move collateral, when, and with what audit trail. I think the pilot will be judged on that first, well before anyone asks about speed or cost.", angle: "controls first", value: 8, impact: 7 }] }) }] });
      if (url.endsWith("/api/ext/me")) return J({ workspace: "Shashi Pal", studio: null, rules: null, topics: [], prospects: [] });
      if (url.endsWith("/api/ext/discovery")) return self.__failDiscovery ? J({ error: "Discovery is not set up yet." }, 400) : J({ id: "d1" });
      if (url.endsWith("/api/ext/capture")) return J({ name: "Lena Fischer", score: 72, created: true });
      if (url.endsWith("/api/ext/profile")) return J({ prospect: "Omar Saleh", prospect_id: "p1", person: true });
      if (url.endsWith("/api/ext/inbox")) return J({ id: "m1", prospect: "Omar Saleh" });
      if (url.endsWith("/api/ext/replies")) return J({ added: (b.replies || []).length, known: 0, skipped: 0, comments: 1, posts: 1, tasks: 1, leads: ["Priya Nair"] });
      if (url.endsWith("/api/ext/post_results")) return J({ post: self.__noPost ? null : "post-1" });
      if (url.endsWith("/api/ext/snapshot")) return J({ saved: Object.keys(b.metrics || {}).length });
      return J({ ok: true });
    };
  });
}
async function worker() {
  for (let i = 0; i < 50; i++) { const sw = ctx.serviceWorkers().find((w) => w.url().includes("background.js")); if (sw) return sw; await wait(100); }
  return ctx.waitForEvent("serviceworker");
}

let sw = await worker();
const extId = new URL(sw.url()).host;
await stub(sw);
await sw.evaluate(() => chrome.storage.local.set({ cfg: { praxUrl: "https://prax-gamma.vercel.app", praxToken: "prx_" + "a".repeat(48), apiKey: "sk-test", provider: "claude" } }));

const page = await ctx.newPage();
const bars = () => page.evaluate(() => document.querySelectorAll(".prx-bar").length);
const doubled = () => page.evaluate(() => [...document.querySelectorAll(".prx-bar")].some((b) => b.parentElement.querySelectorAll(":scope > .prx-bar").length > 1));
const tabStatus = () => sw.evaluate(async () => { const [t] = await chrome.tabs.query({ url: "https://www.linkedin.com/*" }); return (await chrome.tabs.sendMessage(t.id, { type: "prax:status" }))?.data; });

await page.goto("https://www.linkedin.com/feed/");
await wait(1500);
check("feed: a bar on all 7 posts (old and new layout, Repost off, no urn)", (await bars()) === 7, `got ${await bars()}`);

// LinkedIn's feed never stops changing. A post added during constant changes must still get a bar.
await page.evaluate(() => {
  const c = document.querySelector(".social-details-social-counts button");
  window.__storm = setInterval(() => { c.textContent = String(Math.random()); }, 40);
  setTimeout(() => document.querySelector(".x9f2a").insertAdjacentHTML("beforeend", `<div data-view-name="feed-full-update"><a href="/in/late/"><span>Late Poster</span></a><div data-view-name="feed-commentary"><span>Loaded after scrolling, while the feed keeps changing.</span></div><a href="/feed/update/urn:li:activity:7390000000000000077/">1m</a><div><button>Like</button><button>Comment</button><button>Repost</button></div></div>`), 300);
});
await wait(1800);
check("late post added while the page keeps changing gets a bar", (await bars()) === 8, `got ${await bars()}`);
await page.evaluate(() => clearInterval(window.__storm));

if (baseline) { await ctx.close(); console.log(fails ? `\n${fails} failed` : "\nall passed"); process.exit(fails ? 1 : 0); }

let s = await tabStatus();
check("status: posts seen and bars attached", s?.seen === 8 && s?.attached === 8, JSON.stringify(s));
check("status: connected to Prax", s?.connected === true && s?.workspace === "Shashi Pal", JSON.stringify(s));

// LinkedIn re-renders: our bar wiped, and a row replaced by a new element.
await page.evaluate(() => document.querySelector(".prx-bar").remove());
await wait(700);
check("a bar wiped by a re-render comes back", (await bars()) === 8, `got ${await bars()}`);
await page.evaluate(() => { const r = document.querySelectorAll(".r5t6")[0]; r.replaceWith(r.cloneNode(true)); });
await wait(700);
check("a replaced row gets one fresh bar, no duplicates", (await bars()) === 8 && !(await doubled()), `got ${await bars()}`);

// One click on Write with Prax opens the panel with drafts.
await page.locator(".prx-write").first().click();
await page.locator(".prx-host .d").first().waitFor({ timeout: 8000 }).catch(() => {});
check("Write with Prax: drafts after one click", (await page.locator(".prx-host .d").count()) === 1);
check("Write with Prax: Human score shown", /Human \d+/.test(await page.locator(".prx-host .meta").first().innerText().catch(() => "")));

// Send to Discovery, and a clear message when Prax refuses.
await page.locator(".prx-disc").nth(0).click();
await page.waitForFunction(() => document.querySelector(".prx-disc")?.textContent === "Sent to Discovery", null, { timeout: 5000 }).catch(() => {});
const calls = await sw.evaluate(() => self.__calls.filter((c) => c.url.endsWith("/api/ext/discovery")).map((c) => c.b));
check("Send to Discovery sends the post on screen", calls.length === 1 && /Tokenised deposits/.test(calls[0].text) && /7390000000000000001/.test(calls[0].url), JSON.stringify(calls));
await sw.evaluate(() => { self.__failDiscovery = true; });
await page.locator(".prx-disc").nth(1).click();
await page.waitForFunction(() => /not set up/.test(document.getElementById("prx-toast")?.textContent || ""), null, { timeout: 5000 }).catch(() => {});
check("a failed Send to Discovery tells the user why", /Discovery is not set up yet/.test(await page.evaluate(() => document.getElementById("prx-toast")?.textContent || "")));

// Single-page navigation: LinkedIn swaps the page without a reload.
await page.evaluate((html) => { history.pushState({}, "", "/feed/update/urn:li:activity:7390000000000000021/"); document.querySelector("main").innerHTML = html; }, SINGLE_MAIN);
await wait(900);
check("after SPA navigation: one bar on the single post, none on comments or the comment box", (await bars()) === 1, `got ${await bars()}`);
s = await tabStatus();
check("status follows the navigation", s?.seen === 1 && /7390000000000000021/.test(s?.url || ""), JSON.stringify(s));

// Side panel, opened as a page; its active tab is pointed at the LinkedIn tab.
const panel = await ctx.newPage();
await panel.goto(`chrome-extension://${extId}/panel.html`);
await panel.evaluate(() => { window.activeTab = async () => (await chrome.tabs.query({ url: "https://www.linkedin.com/*" }))[0]; });
await panel.click("#bs-refresh"); await wait(800);
const st = await panel.locator("#bs-list").innerText();
check("panel status: bars, Prax connection and key", /Bars attached\s+1 of 1/.test(st) && /Connected to Shashi Pal/.test(st) && /Saved in this browser/.test(st), st.replace(/\n/g, " | "));
await panel.click("[data-tab='draft']"); await panel.click("#read"); await wait(600);
const postTxt = await panel.locator("#post").innerText().catch(() => ""); check("panel: Read this post finds the post", /Shashi Pal/i.test(postTxt) && /Most banks/.test(postTxt), postTxt + " toast: " + await panel.locator("#toast").innerText().catch(() => ""));

await page.goto("https://www.linkedin.com/in/lena-fischer/"); await wait(500);
await panel.click("[data-tab='capture']"); await panel.click("#capprofile");
await panel.waitForFunction(() => /scored/.test(document.getElementById("toast").textContent), null, { timeout: 5000 }).catch(() => {});
check("panel: Capture this profile", /Lena Fischer scored 72\/100 · added to pipeline/.test(await panel.locator("#toast").innerText()));
const cap = await sw.evaluate(() => self.__calls.filter((c) => c.url.endsWith("/api/ext/capture")).map((c) => c.b)[0]);
check("capture sends the profile text on screen", /Northbank/.test(cap?.raw || "") && cap?.url === "https://www.linkedin.com/in/lena-fischer/");

// The profile bar (0.9.3): mutual connections and location (N11, N12) and Send to Discovery from a profile (DS15).
await page.goto("https://www.linkedin.com/in/omar-saleh/?trk=x"); await wait(1200);
check("profile: one Prax profile bar under the top card", (await page.locator(".prx-profile").count()) === 1 && await page.evaluate(() => document.querySelector(".prx-profile").previousElementSibling.classList.contains("pv-top-card")));
check("profile: nothing is sent before a click", (await sw.evaluate(() => self.__calls.filter((c) => /\/api\/ext\/profile$/.test(c.url)).length)) === 0);
await page.locator(".prx-profile [data-act='save']").click();
await page.waitForFunction(() => /Saved to Omar/.test(document.getElementById("prx-toast")?.textContent || ""), null, { timeout: 5000 }).catch(() => {});
const prof = await sw.evaluate(() => self.__calls.filter((c) => c.url.endsWith("/api/ext/profile")).map((c) => c.b));
check("profile: Save sends the count, names and location shown", prof.length === 1 && prof[0].mutual_count === 14 && prof[0].mutual_names.join("|") === "Priya Nair|Tom Becker" && prof[0].location === "Dubai, United Arab Emirates" && prof[0].url === "https://www.linkedin.com/in/omar-saleh/", JSON.stringify(prof));
check("profile: the toast says where it was saved", /Saved to Omar Saleh in Pipeline and Network: 14 mutual connections and location Dubai, United Arab Emirates/.test(await page.evaluate(() => document.getElementById("prx-toast")?.textContent || "")));
await sw.evaluate(() => { self.__failDiscovery = false; });
await page.locator(".prx-profile [data-act='disc']").click();
await page.waitForFunction(() => document.querySelector(".prx-profile [data-act='disc']")?.textContent === "Sent to Discovery", null, { timeout: 5000 }).catch(() => {});
const pd = await sw.evaluate(() => self.__calls.filter((c) => c.url.endsWith("/api/ext/discovery")).map((c) => c.b).pop());
check("profile: Send to Discovery sends the person, headline and visible activity", pd?.kind === "profile" && pd.title === "Omar Saleh: Head of Digital Assets at Gulf Union Bank | Custody, tokenisation and settlement" && pd.company === "Gulf Union Bank" && /Recent activity/.test(pd.text) && /CBUAE guidance/.test(pd.text), JSON.stringify(pd));
check("profile: the button confirms it was sent", (await page.locator(".prx-profile [data-act='disc']").innerText()) === "Sent to Discovery");
check("profile: Prax opened nothing on LinkedIn", page.url().startsWith("https://www.linkedin.com/in/omar-saleh/"), page.url());

// Send to Prax Inbox on the open messaging thread (X7): the button shows only there, and reads only on the click.
await page.goto("https://www.linkedin.com/messaging/"); await wait(1000);
check("inbox: no button outside a thread", (await page.locator(".prx-thread").count()) === 0);
await page.goto("https://www.linkedin.com/messaging/thread/2-abc123/"); await wait(1200);
check("inbox: one button under the thread's title bar", (await page.locator(".prx-thread").count()) === 1 && await page.evaluate(() => document.querySelector(".prx-thread").previousElementSibling.classList.contains("msg-title-bar")));
check("inbox: nothing is sent before a click", (await sw.evaluate(() => self.__calls.filter((c) => c.url.endsWith("/api/ext/inbox")).length)) === 0);
await page.locator(".prx-thread [data-act='inbox']").click();
await page.waitForFunction(() => /Prax Inbox/.test(document.getElementById("prx-toast")?.textContent || ""), null, { timeout: 5000 }).catch(() => {});
const ib = await sw.evaluate(() => self.__calls.filter((c) => c.url.endsWith("/api/ext/inbox")).map((c) => c.b));
check("inbox: sends the person, thread and their last message shown", ib.length === 1 && ib[0].name === "Omar Saleh" && ib[0].company === "Gulf Union Bank" && ib[0].url === "https://www.linkedin.com/in/omar-saleh/" && ib[0].thread_url === "https://www.linkedin.com/messaging/thread/2-abc123/" && /Are you in Dubai/.test(ib[0].text) && ib[0].received_at === "2026-11-05T08:10:00Z", JSON.stringify(ib));
check("inbox: the toast names the lead", /Sent to Prax Inbox: Omar Saleh, matched to Omar Saleh in Pipeline/.test(await page.evaluate(() => document.getElementById("prx-toast")?.textContent || "")));
check("inbox: Prax opened no other thread", page.url() === "https://www.linkedin.com/messaging/thread/2-abc123/", page.url());

// Check replies (I1) on the notifications page: one button above the list, read only on the click, nothing scrolled or opened.
const repliesCalls = () => sw.evaluate(() => self.__calls.filter((c) => c.url.endsWith("/api/ext/replies")).map((c) => c.b));
await page.goto("https://www.linkedin.com/notifications/?filter=all"); await wait(1200);
check("replies: one Check replies button above the notifications", (await page.locator(".prx-notes").count()) === 1 && await page.evaluate(() => document.querySelector(".prx-notes").nextElementSibling.classList.contains("nt-card-list")));
check("replies: nothing is sent before a click", (await repliesCalls()).length === 0);
await page.locator(".prx-notes [data-act='replies']").click();
await page.waitForFunction(() => /new replies/.test(document.getElementById("prx-toast")?.textContent || ""), null, { timeout: 5000 }).catch(() => {});
const rn = await repliesCalls();
check("replies: sends the replies, comments and mentions shown, never the profile's own", rn.length === 1 && JSON.stringify(rn[0].replies.map((r) => [r.name, r.kind])) === JSON.stringify([["Priya Nair", "comment_reply"], ["Tom Becker", "post_comment"], ["Hessa Al Marri", "mention"], ["Sara Lim", "comment_reply"]]) && /^\d{4}-\d{2}-\d{2}$/.test(rn[0].day), JSON.stringify(rn));
check("replies: the toast says what was saved", /Saved 4 new replies to Prax\. 1 Reply back task on Today\./.test(await page.evaluate(() => document.getElementById("prx-toast")?.textContent || "")));
check("replies: Prax opened and scrolled nothing", page.url() === "https://www.linkedin.com/notifications/?filter=all" && (await page.evaluate(() => scrollY)) === 0, page.url());
await page.goto("https://www.linkedin.com/feed/"); await wait(800);
check("replies: no button off the notifications page", (await page.locator(".prx-notes").count()) === 0);
// The side panel's Check replies on a post the user has open.
await page.goto("https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000031/"); await wait(1000);
const rpanel = await ctx.newPage();
await rpanel.goto(`chrome-extension://${extId}/panel.html`); await wait(600);
await rpanel.evaluate(() => { window.activeTab = async () => (await chrome.tabs.query({ url: "https://www.linkedin.com/*" }))[0]; });
await rpanel.evaluate(() => document.getElementById("replies").click());
await rpanel.waitForFunction(() => /new replies|Nothing new|No /.test(document.getElementById("toast").textContent), null, { timeout: 5000 }).catch(() => {});
const rp = (await repliesCalls())[1];
check("panel: Check replies on a post sends the replies under the profile's comment and on its own post", !!rp && JSON.stringify(rp.replies.map((r) => [r.name, r.kind])) === JSON.stringify([["Priya Nair", "comment_reply"], ["Tom Becker", "comment_reply"], ["Lena Fischer", "post_comment"], ["Raj Mehta", "post_comment"]]) && /settlement layer/.test(rp.replies[0].mine), JSON.stringify(rp));
check("panel: the toast says what was saved", /Saved 4 new replies to Prax/.test(await rpanel.locator("#toast").innerText()));
await rpanel.close();

await page.goto("https://www.linkedin.com/analytics/creator/"); await wait(500);
await panel.click("#capstats"); await wait(500);
const stats = (await panel.locator("#stats").innerText().catch(() => "")).replace(/\s+/g, " ");
check("panel: Read analytics finds all four numbers", /impressions 7d: 12,480/.test(stats) && /followers: 5,912/.test(stats) && /profile views 90d: 1,200/.test(stats) && /search appearances: 318/.test(stats), stats);
await panel.click("#sendstats");
await panel.waitForFunction(() => /Saved 4/.test(document.getElementById("toast").textContent), null, { timeout: 5000 }).catch(() => {});
check("panel: Save analytics to Prax", /Saved 4 numbers/.test(await panel.locator("#toast").innerText()));

// One post's results (CS29): its analytics page, read on the click, saved to the post with the same activity id.
await page.goto("https://www.linkedin.com/analytics/post-summary/urn:li:activity:7390000000000000051/"); await wait(500);
await panel.click("#capstats"); await wait(500);
const pstats = (await panel.locator("#stats").innerText().catch(() => "")).replace(/\s+/g, " ");
check("panel: Read analytics on a post finds its four numbers", /impressions: 4,820/.test(pstats) && /reactions: 126/.test(pstats) && /comments: 18/.test(pstats) && /reposts: 7/.test(pstats), pstats);
await panel.click("#sendstats");
await panel.waitForFunction(() => /results/.test(document.getElementById("toast").textContent), null, { timeout: 5000 }).catch(() => {});
const pr = await sw.evaluate(() => self.__calls.filter((c) => c.url.endsWith("/api/ext/post_results")).map((c) => c.b));
check("panel: post results sent with the post's link", pr.length === 1 && pr[0].impressions === 4820 && pr[0].reposts === 7 && /activity:7390000000000000051/.test(pr[0].url), JSON.stringify(pr));
check("panel: saved toast", /Saved this post's results/.test(await panel.locator("#toast").innerText()));
await sw.evaluate(() => { self.__noPost = true; });
await panel.click("#capstats"); await wait(500); await panel.click("#sendstats");
await panel.waitForFunction(() => /Content Studio first/.test(document.getElementById("toast").textContent), null, { timeout: 5000 }).catch(() => {});
check("panel: a post Prax does not know says to save its link first", /Save the post's LinkedIn link in Content Studio first/.test(await panel.locator("#toast").innerText()));
await panel.goto("about:blank");
const panelErr = await ctx.newPage();
await panelErr.goto(`chrome-extension://${extId}/panel.html`);
await panelErr.evaluate(() => { window.activeTab = async () => ({ id: -1, url: "chrome://settings" }); });
await panelErr.click("#capprofile");
check("panel: Capture on a non-LinkedIn tab explains what to do", /Open a LinkedIn profile page/.test(await panelErr.locator("#toast").innerText()));
await panelErr.close(); await panel.close();

// Quiet mode hides the bars; turning it off brings them back.
await page.goto("https://www.linkedin.com/feed/"); await wait(1200);
await sw.evaluate(async () => { const { cfg } = await chrome.storage.local.get("cfg"); await chrome.storage.local.set({ cfg: { ...cfg, quiet: true } }); });
await wait(700);
check("Quiet mode removes the bars", (await bars()) === 0);
await sw.evaluate(async () => { const { cfg } = await chrome.storage.local.get("cfg"); delete cfg.quiet; await chrome.storage.local.set({ cfg }); });
await wait(900);
check("bars come back after Quiet mode", (await bars()) === 7, `got ${await bars()}`);

// An extension update: the old copy in the tab is cut off. The new one must take over without a page reload.
// A tab whose bar script is gone (as after an update or install, when Chrome leaves open tabs without
// it). Playwright cannot replay a real update: chrome.runtime.reload() unloads a command-line extension.
// So the copy in the tab is stopped directly, then the two ways back are checked.
const stopBar = () => sw.evaluate(async () => {
  const [t] = await chrome.tabs.query({ url: "https://www.linkedin.com/*" });
  await chrome.scripting.executeScript({ target: { tabId: t.id }, func: () => window.__prax.stop() });
});
await stopBar(); await wait(300);
check("stopped copy: no bars and no answer", (await bars()) === 0 && !(await tabStatus().catch(() => null)));
await page.evaluate(() => history.pushState({}, "", "/feed/?nav=1"));
await wait(2500);
check("background brings the bar back on the next page change (tabs.onUpdated)", (await bars()) === 7 && !(await doubled()), `got ${await bars()}`);
await stopBar(); await wait(300);
const fixer = await ctx.newPage();
await fixer.goto(`chrome-extension://${extId}/panel.html`);
await fixer.evaluate(() => { window.activeTab = async () => (await chrome.tabs.query({ url: "https://www.linkedin.com/*" }))[0]; });
await fixer.click("#bs-fix"); await wait(1500);
check("Fix bars on this tab brings the bar back", (await bars()) === 7 && /Bars attached\s+7 of 7/.test(await fixer.locator("#bs-list").innerText()), `got ${await bars()}`);
await fixer.close();
await page.locator(".prx-write").first().click();
await page.locator(".prx-host .d").first().waitFor({ timeout: 8000 }).catch(() => {});
check("the re-added bar works on the first click", (await page.locator(".prx-host .d").count()) === 1);
// The page itself cannot switch off a working bar with the takeover event.
await page.evaluate(() => document.dispatchEvent(new CustomEvent("prax:takeover"))); await wait(300);
check("a takeover event from the page is ignored while the bar is working", (await bars()) === 7);

// Humanization (db/031) on the LinkedIn bar: the chosen draft's Pangram verdict above its buttons, checked only on
// Save (or Copy, Use, Check), Fix it with the change accepted, the recheck, and the Pangram key never sent to Prax.
await sw.evaluate(async () => { const { cfg } = await chrome.storage.local.get("cfg"); await chrome.storage.local.set({ cfg: { ...cfg, checkers: { pangram: "pg-test-key" } } }); self.__calls = []; self.__pg = 0; });
await wait(1200);
await page.locator(".prx-write").first().click();
await page.locator(".prx-host .hz").first().waitFor({ timeout: 8000 }).catch(() => {});
const hzText = async () => (await page.locator(".prx-host .hz").first().innerText().catch(() => "")).replace(/\s+/g, " ");
await wait(500); await shoot(page.locator(".prx-host").first(), "ext-1-not-verified.png");
check("humanize: the chosen draft shows Not verified with Check with Pangram, before any paid call", /Not verified, free score only/.test(await hzText()) && /Check with Pangram/.test(await hzText()) && !(await sw.evaluate(() => self.__calls.some((c) => c.url.includes("pangram.com")))), await hzText());
await page.locator(".prx-host [data-save='0']").click();
await page.locator(".prx-host .hz.needs").waitFor({ timeout: 10000 }).catch(() => {});
check("humanize: Save checks with Pangram and shows Needs work with the score and level", /60% human/.test(await hzText()) && /your level 70%/.test(await hzText()) && /Needs work/.test(await hzText()), await hzText());
await wait(1000); await shoot(page.locator(".prx-host").first(), "ext-2-needs-work.png");
check("humanize: the flagged passage is highlighted in the draft", (await page.locator(".prx-host .t .fl").count()) === 1);
const hzCalls = await sw.evaluate(() => self.__calls.map((c) => ({ url: c.url, b: c.b, key: c.h["x-api-key"] || "" })));
const pg = hzCalls.filter((c) => c.url.includes("text.external-api.pangram.com"));
check("humanize: Pangram is called at its documented endpoints with x-api-key", pg.some((c) => c.url.endsWith("/task") && c.key === "pg-test-key" && c.b.model === "default") && pg.some((c) => /\/task\/t1$/.test(c.url)), JSON.stringify(pg.map((c) => c.url)));
check("humanize: the Pangram key never goes to Prax", !hzCalls.filter((c) => c.url.includes("prax-gamma")).some((c) => JSON.stringify(c.b).includes("pg-test-key")));
check("humanize: the check is tagged with its job and section", hzCalls.some((c) => c.url.endsWith("/api/ext/humanize") && c.b.op === "record" && c.b.job === "humanize_check" && c.b.section === "linkedin_bar"));
const saved = hzCalls.find((c) => c.url.endsWith("/api/ext/save"));
check("humanize: the saved draft carries its badge", saved?.b?.humanize?.score === 60 && saved?.b?.humanize?.service === "pangram", JSON.stringify(saved?.b?.humanize));
await page.locator(".prx-host [data-hz-fix='0']").click();
await page.locator(".prx-host .rv").waitFor({ timeout: 8000 }).catch(() => {});
await wait(500); await shoot(page.locator(".prx-host").first(), "ext-3-review.png");
check("humanize: Fix it shows before and after, nothing applied yet", (await page.locator(".prx-host .rv .ch").count()) === 1 && /audit trail/.test(await page.locator(".prx-host .t").first().innerText()));
await page.locator(".prx-host [data-hz-all='0']").click();
await page.locator(".prx-host [data-hz-apply='0']").click();
await page.locator(".prx-host .hz.passed").waitFor({ timeout: 10000 }).catch(() => {});
check("humanize: the accepted change is applied and rechecked: Passed", /96% human/.test(await hzText()) && /Passed/.test(await hzText()) && /where is the record/.test(await page.locator(".prx-host .t").first().innerText()), await hzText());
await wait(1000); await shoot(page.locator(".prx-host").first(), "ext-4-passed.png");
check("humanize: two Pangram checks in all", (await sw.evaluate(() => self.__calls.filter((c) => c.url.endsWith("text.external-api.pangram.com/task")).length)) === 2);
await page.locator(".prx-host .x").first().click();

// The Prax site's bridge answers (Extension page handshake).
const web = await ctx.newPage();
await web.goto("https://prax-gamma.vercel.app/extension"); await wait(400);
const hello = await web.evaluate(() => new Promise((res) => {
  addEventListener("message", (e) => { if (e.data?.praxExt && e.data.id === "t1") res(e.data); });
  postMessage({ praxWeb: true, id: "t1", type: "status" }, location.origin);
  setTimeout(() => res(null), 3000);
}));
const manifestVersion = JSON.parse(readFileSync(path.join(EXT, "manifest.json"), "utf8")).version;
check(`bridge: status answers with version ${manifestVersion} and connected`, hello?.data?.version === manifestVersion && hello?.data?.connected === true, JSON.stringify(hello));

await ctx.close();
console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
