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

const ctx = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), "prax-e2e-")), {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

// Nothing leaves the machine: LinkedIn pages come from fixtures, everything else LinkedIn would load is dropped.
await ctx.route(/^https:\/\/([\w-]+\.)?(linkedin|licdn)\.com\//, (route) => {
  const req = route.request();
  if (req.resourceType() !== "document") return route.abort();
  const p = new URL(req.url()).pathname;
  const html = p.startsWith("/feed/update/") ? fx("single-post.html") : p.startsWith("/in/") ? fx("profile.html")
    : p.includes("analytics") ? fx("analytics.html") : p.startsWith("/search/") ? fx("activity-and-search.html") : FEED;
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
      self.__calls.push({ url, b });
      if (url.includes("api.anthropic.com")) return J({ stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: "text", text: JSON.stringify({ post_type: "Opinion or hot take", mode: "Agree and add", drafts: [{ text: "In my view the hard part is the controls. A bank has to show its board who can move collateral, when, and with what audit trail. I think the pilot will be judged on that first, well before anyone asks about speed or cost.", angle: "controls first", value: 8, impact: 7 }] }) }] });
      if (url.endsWith("/api/ext/me")) return J({ workspace: "Shashi Pal", studio: null, rules: null, topics: [], prospects: [] });
      if (url.endsWith("/api/ext/discovery")) return self.__failDiscovery ? J({ error: "Discovery is not set up yet." }, 400) : J({ id: "d1" });
      if (url.endsWith("/api/ext/capture")) return J({ name: "Lena Fischer", score: 72, created: true });
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

await page.goto("https://www.linkedin.com/analytics/creator/"); await wait(500);
await panel.click("#capstats"); await wait(500);
const stats = (await panel.locator("#stats").innerText().catch(() => "")).replace(/\s+/g, " ");
check("panel: Read analytics finds all four numbers", /impressions 7d: 12,480/.test(stats) && /followers: 5,912/.test(stats) && /profile views 90d: 1,200/.test(stats) && /search appearances: 318/.test(stats), stats);
await panel.click("#sendstats");
await panel.waitForFunction(() => /Saved 4/.test(document.getElementById("toast").textContent), null, { timeout: 5000 }).catch(() => {});
check("panel: Save analytics to Prax", /Saved 4 numbers/.test(await panel.locator("#toast").innerText()));
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

// The Prax site's bridge answers (Extension page handshake).
const web = await ctx.newPage();
await web.goto("https://prax-gamma.vercel.app/extension"); await wait(400);
const hello = await web.evaluate(() => new Promise((res) => {
  addEventListener("message", (e) => { if (e.data?.praxExt && e.data.id === "t1") res(e.data); });
  postMessage({ praxWeb: true, id: "t1", type: "status" }, location.origin);
  setTimeout(() => res(null), 3000);
}));
check("bridge: status answers with version 0.9.0 and connected", hello?.data?.version === "0.9.0" && hello?.data?.connected === true, JSON.stringify(hello));

await ctx.close();
console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
