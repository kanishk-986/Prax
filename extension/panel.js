// Prax side panel: Prax bar status, capture, and the comment drafter for Quiet mode. Everything starts
// from a click. It never posts, likes, connects or browses on LinkedIn.

const $ = (id) => document.getElementById(id);
const D = globalThis.PraxDOM; // dom.js, loaded before this file

const MODES = {
  "Short": "35 to 50 words, two or three complete sentences. Still one real insight, never a one-liner.",
  "Punchy": "40 to 55 words. Firm, confident view stated plainly in the first sentence, then the reason. No slogans.",
  "Question": "50 to 70 words. Add one fact or consequence, then end on a specific question the author can answer from judgment.",
  "Agree and add": "50 to 70 words. Agree with the author's main point in one sentence, then add the layer they did not cover.",
  "Respectful disagree": "50 to 70 words. Accept what is right in the post, then offer a different view on one point with a reason. Courteous, never correcting the author, never against a regulator or government.",
  "Data point": "50 to 70 words. Build the comment around one number or fact that is in the post or source text, and what it implies.",
  "Operator lens": "50 to 70 words. What this means for operations: delivery, controls, timelines, reconciliation, the work behind the headline.",
  "Board lens": "50 to 70 words. What a board or risk committee would ask about this: exposure, governance, decision timing.",
  "Partner lens": "50 to 70 words. What this means for partners and ecosystems: who needs to work with whom for this to happen.",
  "Congratulate with substance": "40 to 60 words. Congratulate in one plain sentence, then add one specific observation about why the milestone matters. No flattery.",
};
const BANNED = ["just", "must", "now", "sit", "sits", "delve", "pivotal", "crucial", "testament", "tapestry", "landscape", "underscore", "showcase", "vibrant", "fostering", "key", "vital", "leverage", "robust", "seamless", "game-changer", "great post", "thanks for sharing", "my read is"];

let cfg = {};
let me = null, meErr = "";
let post = null;
let sources = [];
let mode = "Agree and add";

// ---------- small helpers ----------
// Errors stay up longer and look different, so a failed click is never missed.
function toast(text, err) {
  const t = $("toast"); t.textContent = text; t.classList.remove("hidden"); t.classList.toggle("err", !!err);
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add("hidden"), err ? 7000 : 2600);
}
const fail = (e) => toast(e?.message || String(e), true);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
async function activeTab() { const [t] = await chrome.tabs.query({ active: true, currentWindow: true }); return t; }

// Runs a reader in the active tab, only when the user pressed a button. dom.js goes in first so the
// readers share the Prax bar's post detection.
async function run(fn, args = [], { anyPage = false } = {}) {
  const tab = await activeTab();
  if (!tab) throw new Error("No tab is open in this window.");
  if (!anyPage && !D.isLinkedIn(tab.url)) throw new Error("Open a LinkedIn page in this window first.");
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["dom.js"] });
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fn, args });
    return res?.result;
  } catch (e) {
    throw new Error(/cannot access|cannot be scripted|chrome:|extensions gallery|permission/i.test(e.message) ? "Prax cannot read this page. Open a LinkedIn tab or a normal web page." : e.message);
  }
}

// The background can be asleep or restarting; a message that finds no listener is retried twice.
function sendOnce(msg) {
  return new Promise((res, rej) => chrome.runtime.sendMessage(msg, (r) => {
    const le = chrome.runtime.lastError?.message;
    if (r?.ok) return res(r.data);
    const err = new Error(r?.error || le || "Prax is not responding. Try again.");
    err.transient = !r;
    rej(err);
  }));
}
async function send(msg) {
  for (let i = 0; ; i++) {
    try { return await sendOnce(msg); }
    catch (e) { if (!e.transient || i >= 2) throw e; await new Promise((r) => setTimeout(r, 300 * (i + 1))); }
  }
}
const prax = (action, body = {}) => (action === "me" ? send({ type: "me", fresh: true }) : send({ type: "prax", action, body }));
function busy(btn, on, label) { btn.disabled = on; if (label) btn.textContent = label; }

// ---------- page readers (run inside the tab, on a click) ----------
function readPost() {
  const P = globalThis.PraxDOM;
  const sel = String(window.getSelection() || "").trim();
  // The post nearest the middle of the screen is the one being read.
  const hit = P.nearestPost(document, innerHeight / 2);
  const p = hit ? P.readPost(hit.post, hit.row, location) : { author: "", authorUrl: "", url: location.href.split("?")[0], text: "", comments: [] };
  const fromSelection = sel.length > 80;
  return { ...p, text: fromSelection ? sel : p.text, fromSelection };
}

function readPage() {
  const main = document.querySelector("main, [role='main']") || document.querySelector("article") || document.body;
  return { url: location.href.split("?")[0], title: document.title, text: main.innerText.replace(/\n{3,}/g, "\n\n").trim().slice(0, 20000) };
}

function readProfile() {
  const main = document.querySelector("main") || document.body;
  return { url: location.href.split("?")[0], raw: main.innerText.trim().slice(0, 40000) };
}

// Check replies (I1): the replies shown under the profile's own comments on this post, and the comments on the
// profile's own post. On the notifications page, the replies, comments and mentions shown there. Read on the click only.
function findReplies(name) {
  const P = globalThis.PraxDOM;
  if (P.isNotificationsPath(location.pathname)) return { page: "notifications", ...P.readNotifications(document, name) };
  return { page: "post", ...P.readPostReplies(document, location, name) };
}

// ---------- Prax bar status ----------
const ago = (t) => { if (!t) return "not yet"; const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `${s} s ago` : `${Math.round(s / 60)} min ago`; };
async function refreshStatus(rescan) {
  const rows = [["Extension", "v" + chrome.runtime.getManifest().version]];
  rows.push(["Prax", !cfg.praxToken ? ["Not connected. Open Prax, Extension, Connect this browser.", "bad"] : me ? [`Connected to ${me.workspace}`, "good"] : meErr ? [meErr, "bad"] : ["Checking…"]]);
  rows.push(["AI key", cfg.apiKey ? ["Saved in this browser", "good"] : ["Missing. Add it on the Prax Extension page.", "bad"]]);
  const tab = await activeTab().catch(() => null);
  if (!tab || !D.isLinkedIn(tab.url)) rows.push(["This tab", "Not a LinkedIn page"]);
  else {
    try {
      const s = await send({ type: "barStatus", tabId: tab.id, rescan: !!rescan });
      if (s.quiet) rows.push(["Bars", "Off (Quiet mode)"]);
      else {
        rows.push(["Posts seen", String(s.seen)]);
        rows.push(["Bars attached", [`${s.attached} of ${s.seen}`, s.attached < s.seen ? "bad" : "good"]]);
        rows.push(["Last scan", ago(s.lastScan)]);
      }
      if (s.version && s.version !== chrome.runtime.getManifest().version) rows.push(["Tab script", [`v${s.version}. Reload this tab.`, "bad"]]);
      if (s.error) rows.push(["Last error", [s.error, "bad"]]);
    } catch (e) { rows.push(["This tab", [e.message, "bad"]]); }
  }
  $("bs-list").innerHTML = rows.map(([k, v]) => { const [t, c] = Array.isArray(v) ? v : [v]; return `<dt>${esc(k)}</dt><dd${c ? ` class="${c}"` : ""}>${esc(t)}</dd>`; }).join("");
}
let statusTimer = 0;
const refreshSoon = () => { clearTimeout(statusTimer); statusTimer = setTimeout(() => refreshStatus(false), 300); };
$("bs-refresh").addEventListener("click", () => refreshStatus(false));
$("bs-fix").addEventListener("click", async () => {
  const b = $("bs-fix"); busy(b, true);
  await refreshStatus(true); toast("Checked the Prax bar on this tab");
  busy(b, false);
});

// ---------- AI drafting with the user's own key ----------
function prompt() {
  const comments = post.comments.length ? post.comments.map((c, i) => `${i + 1}. ${c.author}: ${c.text}`).join("\n") : "(no comments loaded)";
  const extra = sources.map((s) => `SOURCE (${s.title}, ${s.url}):\n${s.text}`).join("\n\n");
  return `POST by ${post.author || "the author"} (${post.url}):\n${post.text}\n\n${extra ? extra + "\n\n" : ""}EXISTING COMMENTS (do not repeat their angles):\n${comments}\n\nMODE: ${mode}. ${MODES[mode]}\n\nWrite 3 different comments in this mode, each taking a different angle. Use only facts present in the post or source text above. Return only JSON: {"drafts": ["...", "...", "..."]}`;
}


function parseDrafts(text) {
  const m = text.match(/\{[\s\S]*\}/);
  try { const d = JSON.parse(m ? m[0] : text).drafts; if (Array.isArray(d)) return d.map(String).slice(0, 3); } catch {}
  return text.split(/\n\s*\n/).map((s) => s.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean).slice(0, 3);
}

// Quick local checks against the house rules, shown under each draft.
function checks(t) {
  const words = t.trim().split(/\s+/).filter(Boolean).length;
  const out = [];
  const [lo, hi] = (MODES[mode].match(/(\d+) to (\d+) words/) || [0, 50, 70]).slice(1).map(Number);
  out.push(words >= lo && words <= hi ? `<span class="ok">${words} words</span>` : `<span class="flag">${words} words, aim ${lo} to ${hi}</span>`);
  if (/[—–]/.test(t)) out.push('<span class="flag">has a dash</span>');
  if (/\b\w+(n't|'re|'ve|'ll|'d)\b/i.test(t)) out.push('<span class="flag">contraction</span>');
  const hit = BANNED.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(t));
  if (hit.length) out.push(`<span class="flag">avoid: ${hit.join(", ")}</span>`);
  if ((t.match(/\?/g) || []).length > 1) out.push('<span class="flag">more than one question</span>');
  return out.join(" · ");
}

function renderDrafts(list) {
  $("drafts").innerHTML = list.map((d, i) => `
    <div class="card draft" style="animation-delay:${i * 60}ms">
      <p contenteditable="true" data-i="${i}">${esc(d)}</p>
      <div class="meta" data-meta="${i}">${checks(d)}</div>
      <div class="row">
        <button class="btn small" data-copy="${i}">Copy</button>
        <button class="btn small primary" data-log="${i}">I posted this</button>
      </div>
    </div>`).join("");
}

// ---------- events ----------
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
  ["draft", "capture"].forEach((t) => $("tab-" + t).classList.toggle("hidden", t !== b.dataset.tab));
}));

$("modes").innerHTML = Object.keys(MODES).map((m) => `<button class="chip${m === mode ? " on" : ""}" data-mode="${m}">${m}</button>`).join("");
$("modes").addEventListener("click", (e) => {
  const m = e.target.dataset.mode; if (!m) return;
  mode = m; document.querySelectorAll("[data-mode]").forEach((c) => c.classList.toggle("on", c.dataset.mode === m));
});

$("read").addEventListener("click", async () => {
  try {
    post = await run(readPost);
    if (!post?.text) throw new Error("No post text found. Scroll the post to the middle of the screen, or select its text, and try again.");
    sources = [];
    $("post").classList.remove("hidden");
    $("post").innerHTML = `<div class="label">${esc(post.author || "Post")}${post.fromSelection ? " · from selection" : ""}</div>
      <div class="post-text">${esc(post.text)}</div>
      <div class="meta" style="margin:8px 0 0">${post.text.split(/\s+/).length} words · ${post.comments.length} comments read · <span id="srcs">no extra source</span></div>`;
    $("modes").classList.remove("hidden"); $("go").classList.remove("hidden"); $("drafts").innerHTML = "";
  } catch (e) { fail(e); }
});

$("addsrc").addEventListener("click", async () => {
  if (!post) return toast("Read the post first, then open the linked page.", true);
  try {
    const p = await run(readPage, [], { anyPage: true });
    sources.push(p); $("srcs").textContent = `${sources.length} extra source${sources.length > 1 ? "s" : ""} added`;
    toast("Added " + (p.title || "page") + " as source");
  } catch (e) { fail(e); }
});

$("go").addEventListener("click", async () => {
  const btn = $("go");
  busy(btn, true, "Drafting…");
  $("drafts").innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
  try {
    renderDrafts(parseDrafts(await send({ type: "draft", rules: "", user: prompt() })));
  } catch (e) { $("drafts").innerHTML = ""; fail(e); }
  busy(btn, false, "Draft 3 comments");
});

$("drafts").addEventListener("input", (e) => { const i = e.target.dataset.i; if (i != null) document.querySelector(`[data-meta="${i}"]`).innerHTML = checks(e.target.innerText); });
$("drafts").addEventListener("click", async (e) => {
  const c = e.target.dataset.copy, l = e.target.dataset.log;
  const text = (i) => document.querySelector(`[data-i="${i}"]`).innerText.trim();
  if (c != null) {
    try { await navigator.clipboard.writeText(text(c)); toast("Copied. Paste it on LinkedIn and post it yourself."); }
    catch { fail(new Error("Could not copy. Select the text and press Cmd+C.")); }
  }
  if (l != null) {
    busy(e.target, true);
    try {
      const r = await prax("log", { author: post.author, author_url: post.authorUrl, url: post.url, mode, text: text(l), post_text: post.text });
      e.target.textContent = "Logged";
      toast(["Logged in Prax", r.ticked ? "today's comment ticked" : "", r.prospect ? `${r.prospect} moved to Warming` : ""].filter(Boolean).join(" · "));
    } catch (err) { busy(e.target, false); fail(err); }
  }
});

$("replies").addEventListener("click", async () => {
  try {
    if (!me) me = await prax("me");
    const r = await run(findReplies, [me.workspace]);
    if (r.page === "post" && !r.mine && !r.own) return toast(`No comment or post by ${me.workspace} is shown on this page. Open the post and show its comments.`, true);
    if (!r.replies.length) return toast(r.page === "notifications" ? "No replies, comments or mentions are shown in these notifications yet." : "No replies shown yet.");
    const d = new Date(), day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const j = await prax("replies", { replies: r.replies, day });
    const n = r.replies.length;
    toast(!j.added ? `Already in Prax: ${n} ${n === 1 ? "reply" : "replies"}. Nothing new.`
      : [`Saved ${j.added} new ${j.added === 1 ? "reply" : "replies"} to Prax`, j.known ? `${j.known} already there` : "", j.tasks ? `${j.tasks} Reply back ${j.tasks === 1 ? "task" : "tasks"} on Today` : ""].filter(Boolean).join(". ") + ".");
  } catch (e) { fail(e); }
});

$("capprofile").addEventListener("click", async () => {
  const btn = $("capprofile");
  try {
    const tab = await activeTab();
    if (!/linkedin\.com\/in\//.test(tab?.url || "")) throw new Error("Open a LinkedIn profile page (linkedin.com/in/...) first.");
    busy(btn, true, "Capturing…");
    const p = await run(readProfile);
    if (!p?.raw || p.raw.length < 40) throw new Error("The profile has not loaded yet. Wait a moment and try again.");
    const r = await prax("capture", { ...p, self: $("self").checked });
    toast(`${r.name || "Profile"} scored ${r.score}/100${r.created ? " · added to pipeline" : ""}`);
  } catch (e) { fail(e); }
  busy(btn, false, "Capture this profile");
});

// One post's results (CS29): on that post's analytics page, or the post page as its author sees it. Read on this
// click only; the Prax server matches the post by its LinkedIn activity id against the link saved in Content Studio.
function readPostNumbers() {
  const P = globalThis.PraxDOM;
  return P.postResultsIn(document.querySelector("main, [role='main']") || document.body);
}
async function readPostResults(tab) {
  const nums = await run(readPostNumbers);
  if (!nums) return toast("No impressions are shown on this page. Under your post, open View analytics and try again.", true);
  const url = String(tab.url || "").split(/[?#]/)[0];
  if (!D.activityIdOf(url)) return toast("This page has no post link Prax can match. Open the post itself, then its analytics.", true);
  const keys = ["impressions", "reactions", "comments", "reposts"];
  $("stats").innerHTML = `<div class="meta" style="margin-top:10px">This post: ${keys.filter((k) => nums[k] != null).map((k) => `${k}: <b>${nums[k].toLocaleString()}</b>`).join(" · ")}</div>
    <button class="btn small primary" id="sendstats">Save to the post in Prax</button>`;
  $("sendstats").onclick = async (ev) => {
    busy(ev.target, true);
    try {
      const r = await prax("post_results", { url, ...Object.fromEntries(keys.map((k) => [k, nums[k] ?? null])) });
      if (!r || !r.post) { busy(ev.target, false); return toast("No post in Prax has this link. Save the post's LinkedIn link in Content Studio first.", true); }
      toast("Saved this post's results in Content Studio"); ev.target.textContent = "Saved";
    } catch (e) { busy(ev.target, false); fail(e); }
  };
}

$("capstats").addEventListener("click", async () => {
  try {
    const tab = await activeTab();
    let path = ""; try { path = new URL(tab?.url || "").pathname; } catch { /* not a page */ }
    if (D.isLinkedIn(tab?.url) && D.isPostResultsPage(path)) return await readPostResults(tab);
    const { text } = await run(readPage);
    const metrics = D.parseAnalytics(text);
    if (!Object.keys(metrics).length) return toast("No analytics numbers found on this page. Open Me, then Analytics, and try again.", true);
    $("stats").innerHTML = `<div class="meta" style="margin-top:10px">${Object.entries(metrics).map(([k, v]) => `${k.replace(/_/g, " ")}: <b>${v.toLocaleString()}</b>`).join(" · ")}</div>
      <button class="btn small primary" id="sendstats">Save to Prax</button>`;
    $("sendstats").onclick = async (ev) => {
      busy(ev.target, true);
      try { const r = await prax("snapshot", { metrics }); toast(`Saved ${r.saved} numbers to the dashboard`); ev.target.textContent = "Saved"; }
      catch (e) { busy(ev.target, false); fail(e); }
    };
  } catch (e) { fail(e); }
});

// ---------- AI keys: which providers have a key here, the state in plain words and the model. Keys are never shown. ----------
const SEARCH_MODELS = { claude: "claude-opus-5-5", openai: "gpt-5", gemini: "gemini-3.8-flash", perplexity: "sonar" };
function renderAI() {
  const main = cfg.provider || "claude";
  const has = (p) => !!((cfg.keys && cfg.keys[p]) || (main === p && cfg.apiKey));
  const state = (on) => `<span class="ks${on ? " on" : ""}"><i></i>${on ? "Connected in this browser" : "No key in this browser"}</span>`;
  const row = (id, on, model, note) => `<div class="pr"><div class="pr-top">${praxMark(id)}${note ? `<span class="pr-note">${note}</span>` : ""}</div>
    <div class="pr-facts">${state(on)}${on ? `<code>${esc(model)}</code>` : ""}</div></div>`;
  $("ai-rows").innerHTML = row(main, !!cfg.apiKey, cfg.model || (PRAX_PROVIDERS[main] || {}).model || "", main in SEARCH_MODELS ? "Drafts and AI search" : "Drafts")
    + Object.keys(SEARCH_MODELS).filter((p) => p !== main).map((p) => row(p, has(p), (cfg.searchModels && cfg.searchModels[p]) || SEARCH_MODELS[p], "AI search")).join("");
}
chrome.storage.onChanged.addListener((ch) => { if (ch.cfg) { cfg = ch.cfg.newValue || {}; renderAI(); } });
$("openkeys").addEventListener("click", () => chrome.tabs.create({ url: "https://prax-gamma.vercel.app/extension#search-keys" }));

$("openprax").addEventListener("click", () => chrome.tabs.create({ url: "https://prax-gamma.vercel.app/extension" }));
$("who").addEventListener("click", () => chrome.tabs.create({ url: "https://prax-gamma.vercel.app/extension" }));

// ---------- start, and keep up with tab and setting changes while the panel stays open ----------
async function load() {
  cfg = (await chrome.storage.local.get("cfg")).cfg || {};
  $("setup").classList.toggle("hidden", !!(cfg.praxToken && cfg.apiKey));
  me = null; meErr = "";
  renderAI();
  $("who").textContent = cfg.praxToken ? "Connecting…" : "Not connected";
  refreshStatus(false);
  if (!cfg.praxToken) return;
  try { me = await prax("me"); $("who").textContent = me.workspace; }
  catch (e) { meErr = e.message; $("who").textContent = "Not connected"; $("setup").classList.remove("hidden"); }
  refreshStatus(false);
}
chrome.storage.onChanged.addListener((ch) => { if (ch.cfg) load(); });
chrome.tabs.onActivated.addListener(refreshSoon);
chrome.tabs.onUpdated.addListener((_id, info, tab) => { if (tab.active && (info.url || info.status === "complete")) refreshSoon(); });
load();
