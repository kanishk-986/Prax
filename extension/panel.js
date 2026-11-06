// Prax side panel: settings, capture, and the comment drafter for Quiet mode. Everything starts
// from a click. It never posts, likes, connects or browses on LinkedIn.

const $ = (id) => document.getElementById(id);

const MODES = {
  "Short": "35 to 50 words, two or three complete sentences. Still one real insight, never a one-liner.",
  "Punchy": "40 to 55 words. Firm, confident view stated plainly in the first sentence, then the reason. No slogans.",
  "Question": "50 to 70 words. Add one fact or consequence, then end on a specific question the author can answer from judgment.",
  "Agree and add": "50 to 70 words. Agree with the author's main point in one sentence, then add the layer they did not cover.",
  "Respectful disagree": "50 to 70 words. Accept what is right in the post, then offer a different view on one point with a reason. Courteous, never correcting the author, never against a regulator or government.",
  "Data point": "50 to 70 words. Build the comment around one number or fact that is in the post or source text, and what it implies.",
  "COO lens": "50 to 70 words. What this means for operations: delivery, controls, timelines, reconciliation, the work behind the headline.",
  "Board lens": "50 to 70 words. What a board or risk committee would ask about this: exposure, governance, decision timing.",
  "Partner lens": "50 to 70 words. What this means for partners and ecosystems: who needs to work with whom for this to happen.",
  "Congratulate with substance": "40 to 60 words. Congratulate in one plain sentence, then add one specific observation about why the milestone matters. No flattery.",
};
const BANNED = ["just", "must", "now", "sit", "sits", "delve", "pivotal", "crucial", "testament", "tapestry", "landscape", "underscore", "showcase", "vibrant", "fostering", "key", "vital", "leverage", "robust", "seamless", "game-changer", "great post", "thanks for sharing", "my read is"];

let cfg = {};
let me = null;
let post = null;
let sources = [];
let mode = "Agree and add";

// ---------- small helpers ----------
function toast(text) {
  const t = $("toast"); t.textContent = text; t.classList.remove("hidden");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add("hidden"), 2600);
}
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
async function activeTab() { const [t] = await chrome.tabs.query({ active: true, currentWindow: true }); return t; }
async function run(fn, args = []) {
  const tab = await activeTab();
  if (!tab?.url?.startsWith("https://www.linkedin.com/") && fn !== readPage) throw new Error("Open a LinkedIn page first.");
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fn, args });
  return res?.result;
}
const send = (msg) => new Promise((res, rej) => chrome.runtime.sendMessage(msg, (r) => (r?.ok ? res(r.data) : rej(new Error(r?.error || "Prax is not responding")))));
const prax = (action, body = {}) => (action === "me" ? send({ type: "me", fresh: true }) : send({ type: "prax", action, body }));
function busy(btn, on, label) { btn.disabled = on; if (label) btn.textContent = label; }

// ---------- page readers (run inside the LinkedIn tab) ----------
function readPost() {
  const clean = (s) => (s || "").replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  const sel = String(window.getSelection() || "").trim();
  const posts = [...document.querySelectorAll("div.feed-shared-update-v2, div[data-urn*='activity'], article[data-urn]")];
  // The post nearest the middle of the screen is the one being read.
  const mid = innerHeight / 2;
  const el = posts.sort((a, b) => {
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    return Math.abs((ra.top + ra.bottom) / 2 - mid) - Math.abs((rb.top + rb.bottom) / 2 - mid);
  })[0];
  const q = (root, s) => root?.querySelector(s);
  const author = clean(q(el, ".update-components-actor__title span[aria-hidden='true']")?.textContent || q(el, ".update-components-actor__name")?.textContent || "");
  const authorUrl = (q(el, "a.update-components-actor__meta-link") || q(el, "a.update-components-actor__image") || q(el, "a[href*='/in/']"))?.href?.split("?")[0] || "";
  const body = q(el, ".update-components-text, .feed-shared-inline-show-more-text, .feed-shared-text");
  const urn = el?.getAttribute("data-urn") || q(el, "[data-urn]")?.getAttribute("data-urn") || "";
  const url = location.pathname.startsWith("/feed/update/") || location.pathname.startsWith("/posts/")
    ? location.href.split("?")[0] : urn ? "https://www.linkedin.com/feed/update/" + urn + "/" : location.href.split("?")[0];
  const comments = [...(el || document).querySelectorAll("article.comments-comment-entity, article.comments-comment-item")].slice(0, 40).map((c) => ({
    author: clean(c.querySelector(".comments-comment-meta__description-title, .comments-post-meta__name-text")?.textContent || ""),
    text: clean(c.querySelector(".comments-comment-item__main-content, .update-components-text")?.textContent || "").slice(0, 600),
  })).filter((c) => c.text);
  const text = sel.length > 80 ? sel : clean(body?.textContent || "");
  return { author, authorUrl, url, text, comments, fromSelection: sel.length > 80 };
}

function readPage() {
  const main = document.querySelector("article, main, [role='main']") || document.body;
  return { url: location.href.split("?")[0], title: document.title, text: main.innerText.replace(/\n{3,}/g, "\n\n").trim().slice(0, 20000) };
}

function readProfile() {
  const main = document.querySelector("main") || document.body;
  return { url: location.href.split("?")[0], raw: main.innerText.trim().slice(0, 40000) };
}

function findMyReplies(name) {
  const first = name.split(/\s+/)[0].toLowerCase();
  const mine = [...document.querySelectorAll("article.comments-comment-entity, article.comments-comment-item")]
    .filter((c) => (c.querySelector(".comments-comment-meta__description-title, .comments-post-meta__name-text")?.textContent || "").toLowerCase().includes(first));
  // A reply shows as a nested comment article, or a "N replies" control under ours.
  const replied = mine.filter((c) => c.querySelector("article") || /\b\d+\s+repl(y|ies)\b/i.test(c.innerText));
  return { mine: mine.length, replied: replied.length, url: location.href.split("?")[0] };
}

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
    if (!post?.text) throw new Error("No post text found. Open the post itself, or select its text and try again.");
    sources = [];
    $("post").classList.remove("hidden");
    $("post").innerHTML = `<div class="label">${esc(post.author || "Post")}${post.fromSelection ? " · from selection" : ""}</div>
      <div class="post-text">${esc(post.text)}</div>
      <div class="meta" style="margin:8px 0 0">${post.text.split(/\s+/).length} words · ${post.comments.length} comments read · <span id="srcs">no extra source</span></div>`;
    $("modes").classList.remove("hidden"); $("go").classList.remove("hidden"); $("drafts").innerHTML = "";
  } catch (e) { toast(e.message); }
});

$("addsrc").addEventListener("click", async () => {
  if (!post) return toast("Read the post first, then open the linked page.");
  try {
    const p = await run(readPage);
    sources.push(p); $("srcs").textContent = `${sources.length} extra source${sources.length > 1 ? "s" : ""} added`;
    toast("Added " + (p.title || "page") + " as source");
  } catch (e) { toast(e.message); }
});

$("go").addEventListener("click", async () => {
  const btn = $("go");
  busy(btn, true, "Drafting…");
  $("drafts").innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
  try {
    renderDrafts(parseDrafts(await send({ type: "draft", rules: "", user: prompt() })));
  } catch (e) { $("drafts").innerHTML = ""; toast(e.message); }
  busy(btn, false, "Draft 3 comments");
});

$("drafts").addEventListener("input", (e) => { const i = e.target.dataset.i; if (i != null) document.querySelector(`[data-meta="${i}"]`).innerHTML = checks(e.target.innerText); });
$("drafts").addEventListener("click", async (e) => {
  const c = e.target.dataset.copy, l = e.target.dataset.log;
  const text = (i) => document.querySelector(`[data-i="${i}"]`).innerText.trim();
  if (c != null) { await navigator.clipboard.writeText(text(c)); toast("Copied. Paste it on LinkedIn and post it yourself."); }
  if (l != null) {
    busy(e.target, true);
    try {
      const r = await prax("log", { author: post.author, author_url: post.authorUrl, url: post.url, mode, text: text(l), post_text: post.text });
      e.target.textContent = "Logged";
      toast(["Logged in Prax", r.ticked ? "today's comment ticked" : "", r.prospect ? `${r.prospect} moved to Warming` : ""].filter(Boolean).join(" · "));
    } catch (err) { busy(e.target, false); toast(err.message); }
  }
});

$("replies").addEventListener("click", async () => {
  try {
    if (!me) me = await prax("me");
    const r = await run(findMyReplies, [me.workspace]);
    if (!r.mine) return toast(`No comment by ${me.workspace} is loaded on this page. Open the post and load its comments.`);
    if (!r.replied) return toast("No replies yet.");
    const j = await prax("replies", { url: r.url });
    toast(j.marked ? `Marked ${j.marked} logged comment${j.marked > 1 ? "s" : ""} as replied` : "Reply found, but this post was not logged in Prax.");
  } catch (e) { toast(e.message); }
});

$("capprofile").addEventListener("click", async () => {
  const btn = $("capprofile");
  try {
    const tab = await activeTab();
    if (!/linkedin\.com\/in\//.test(tab.url || "")) throw new Error("Open a LinkedIn profile page first.");
    busy(btn, true, "Capturing…");
    const p = await run(readProfile);
    const r = await prax("capture", { ...p, self: $("self").checked });
    toast(`${r.name || "Profile"} scored ${r.score}/100${r.created ? " · added to pipeline" : ""}`);
  } catch (e) { toast(e.message); }
  busy(btn, false, "Capture this profile");
});

$("capstats").addEventListener("click", async () => {
  try {
    const { text } = await run(readPage);
    const num = (label) => { const m = text.match(new RegExp("([\\d,.]+[KkMm]?)\\s*\\n?\\s*" + label, "i")); if (!m) return null;
      const v = m[1].replace(/,/g, ""); return /k$/i.test(v) ? parseFloat(v) * 1e3 : /m$/i.test(v) ? parseFloat(v) * 1e6 : Number(v); };
    const metrics = Object.fromEntries(Object.entries({
      impressions_7d: num("(?:post )?impressions"), followers: num("(?:total )?followers"),
      profile_views_90d: num("profile view"), search_appearances: num("search appearance"),
    }).filter(([, v]) => v != null && !isNaN(v)));
    if (!Object.keys(metrics).length) return toast("No analytics numbers found on this page.");
    $("stats").innerHTML = `<div class="meta" style="margin-top:10px">${Object.entries(metrics).map(([k, v]) => `${k.replace(/_/g, " ")}: <b>${v.toLocaleString()}</b>`).join(" · ")}</div>
      <button class="btn small primary" id="sendstats">Save to Prax</button>`;
    $("sendstats").onclick = async () => { try { const r = await prax("snapshot", { metrics }); toast(`Saved ${r.saved} numbers to the dashboard`); } catch (e) { toast(e.message); } };
  } catch (e) { toast(e.message); }
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

// ---------- start ----------
(async () => {
  cfg = (await chrome.storage.local.get("cfg")).cfg || {};
  renderAI();
  if (!cfg.praxToken || !cfg.apiKey) $("setup").classList.remove("hidden");
  if (cfg.praxToken) prax("me").then((m) => { me = m; $("who").textContent = m.workspace; }).catch(() => { $("setup").classList.remove("hidden"); });
})();
