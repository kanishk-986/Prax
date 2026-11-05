// Prax on LinkedIn. Adds a ✦ Prax button to posts, to comments on your own posts and to the
// connection note box. Prax only suggests: it drafts, Use fills a box you have opened (or copies),
// and you press LinkedIn's own Post or Send. Prax never clicks, posts, likes, connects or scrolls.

(() => {
  if (window.__prax) return;
  window.__prax = true;

  const MODES = {
    "Short": "35 to 50 words, two or three complete sentences. Still one real insight, never a one-liner.",
    "Punchy": "40 to 55 words. A firm view stated plainly in the first sentence, then the reason. No slogans.",
    "Question": "50 to 70 words. Add one fact or consequence, then end on a specific question the author can answer from judgment.",
    "Agree and add": "50 to 70 words. Agree with the main point in one sentence, then add the layer the author did not cover.",
    "Respectful disagree": "50 to 70 words. Accept what is right, then offer a different view on one point with a reason. Courteous, never correcting the author, never against a regulator or government.",
    "Data point": "50 to 70 words. Build around one number or fact that is in the post or its source, and what it implies.",
    "COO lens": "50 to 70 words. What this means for operations: delivery, controls, timelines, reconciliation, the work behind the headline.",
    "Board lens": "50 to 70 words. What a board or risk committee would ask: exposure, governance, decision timing.",
    "Partner lens": "50 to 70 words. What this means for partners: who needs to work with whom for this to happen.",
    "Congratulate with substance": "40 to 60 words. Congratulate in one plain sentence, then one specific observation about why the milestone matters. No flattery.",
  };
  const TYPES = ["Announcement or win", "New role or milestone", "Opinion or hot take", "Data or report", "Regulation or policy", "Product or launch", "Partnership or deal", "Funding", "Event or speaking", "Industry news", "Question to the audience", "How-to or lesson", "Hiring", "Other"];
  const REFINE = { "Shorter": "Make it about 30 percent shorter. Keep the insight and every rule.", "Sharper": "Make the point sharper and more specific. Remove anything generic.", "Warmer": "Make it warmer and more personal toward the author, without flattery.", "Push back": "Turn it into a courteous, reasoned push back on one point of the post." };
  const BANNED = ["just", "must", "now", "sit", "sits", "delve", "pivotal", "crucial", "testament", "tapestry", "landscape", "underscore", "showcase", "vibrant", "fostering", "key", "vital", "leverage", "robust", "seamless", "game-changer", "great post", "thanks for sharing", "my read is", "what stands out", "the part that"];
  const NOTE_RULES = "You are writing a LinkedIn connection note from this profile, 300 characters maximum including spaces. Give value first: one specific, verifiable insight relevant to the person's job or stated interest, taken only from their profile text. Then one specific question they can answer from judgment. No company pitch, no product, no flattery, no 'would value staying connected', no 'I work on', no 'keen to hear'. No dashes, no contractions. These rules override any word count given above.";
  const REPLY_RULES = "You are replying to a comment left on this profile's own post. 25 to 50 words. Answer or extend the commenter's point with something specific, use their first name where natural, and end with a question only if it moves the conversation. No 'thanks for sharing', no flattery. These rules override any word count given above.";

  let cfg = {};
  let pending = null; // { kind, scope, text, ctx } waiting for the user's own Post or Send click

  // ---------- plumbing ----------
  const send = (msg) => new Promise((res, rej) => chrome.runtime.sendMessage(msg, (r) => (r?.ok ? res(r.data) : rej(new Error(r?.error || chrome.runtime.lastError?.message || "Prax is not responding")))));
  const clean = (s) => (s || "").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  const words = (t) => t.trim().split(/\s+/).filter(Boolean).length;
  const dark = () => document.documentElement.classList.contains("theme--dark") || document.body.classList.contains("theme--dark");

  function toast(text) {
    let t = document.getElementById("prx-toast");
    if (!t) { t = document.createElement("div"); t.id = "prx-toast"; document.body.appendChild(t); }
    t.textContent = text; t.className = "prx-toast prx-show";
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = "prx-toast"), 3200);
  }

  function parseJSON(text) {
    const m = text.match(/\{[\s\S]*\}/);
    try { return JSON.parse(m ? m[0] : text); } catch { return null; }
  }

  // House-rule check shown on every draft: 100 means nothing tripped.
  function human(t, range) {
    let s = 100; const flags = [];
    if (/[—–]/.test(t)) { s -= 25; flags.push("dash"); }
    if (/\b\w+(n't|'re|'ve|'ll|'d)\b/i.test(t)) { s -= 15; flags.push("contraction"); }
    const hit = BANNED.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(t));
    if (hit.length) { s -= 15 * hit.length; flags.push(hit.join(", ")); }
    if ((t.match(/\?/g) || []).length > 1) { s -= 10; flags.push("two questions"); }
    if (/#\w/.test(t)) { s -= 10; flags.push("hashtag"); }
    if (range) { const n = range.chars ? t.length : words(t); if (n < range.lo || n > range.hi) { s -= 15; flags.push(range.chars ? `${n}/300 chars` : `${n} words`); } }
    return { score: Math.max(0, s), flags };
  }
  const rangeOf = (instr) => { const m = instr.match(/(\d+) to (\d+) words/); return m ? { lo: +m[1], hi: +m[2] } : null; };

  // ---------- reading the page ----------
    const COMMENT_SEL = "article.comments-comment-entity, article.comments-comment-item";
  const nameIn = (root, sels) => clean(root?.querySelector(sels)?.textContent || "").split("\n")[0];

  const label = (b) => (b.getAttribute("aria-label") || b.innerText || "").trim();

  // LinkedIn's class names change often, so posts are found by their action row: the one
  // block that holds Like or React, Comment and Repost buttons together.
  function actionRows() {
    const rows = new Set();
    document.querySelectorAll("button").forEach((b) => {
      if (!/repost/i.test(label(b)) || b.closest(".prx-host, .prx-bar")) return;
      let el = b.parentElement;
      for (let i = 0; i < 6 && el; i++, el = el.parentElement) {
        const ls = [...el.querySelectorAll("button")].map(label);
        if (ls.some((t) => /^comment/i.test(t)) && ls.some((t) => /like|react/i.test(t))) { rows.add(el); break; }
      }
    });
    return [...rows];
  }

  function postOf(row) {
    const urn = row.closest("[data-urn*='urn:li:'], [data-id*='urn:li:']");
    if (urn) return urn;
    let el = row;
    for (let i = 0; i < 14 && el.parentElement; i++) {
      const up = el.parentElement;
      if ([...up.querySelectorAll("button")].filter((b) => /repost/i.test(label(b))).length > 1) break; // reached the feed list
      el = up;
    }
    return el;
  }

  function readPost(post, row) {
    const author = nameIn(post, ".update-components-actor__title span[aria-hidden='true'], .update-components-actor__name, .update-components-actor__title") ||
      clean([...post.querySelectorAll("a[href*='/in/'], a[href*='/company/']")].map((a) => a.innerText).find((t) => t && t.trim().length > 1) || "").split("\n")[0];
    const authorUrl = (post.querySelector("a.update-components-actor__meta-link, a.update-components-actor__image, a[href*='/in/'], a[href*='/company/']")?.href || "").split("?")[0];
    let text = clean(post.querySelector(".update-components-text, .feed-shared-inline-show-more-text, .feed-shared-text")?.textContent || "");
    if (!text && row) { const r = document.createRange(); r.setStartBefore(post.firstChild || post); r.setEndBefore(row); text = clean(r.toString()); }
    const urn = post.getAttribute("data-urn") || post.getAttribute("data-id") || post.querySelector("[data-urn]")?.getAttribute("data-urn") || "";
    const onPost = /^\/(feed\/update|posts)\//.test(location.pathname);
    const url = onPost ? location.href.split("?")[0] : /urn:li:/.test(urn) ? `https://www.linkedin.com/feed/update/${urn}/` : location.href.split("?")[0];
    const media = [...post.querySelectorAll(".update-components-article__title, .update-components-document__title, img[alt]")].map((e) => clean(e.getAttribute?.("alt") || e.textContent)).filter((t) => t && t.length > 3).slice(0, 4);
    const comments = [...post.querySelectorAll(COMMENT_SEL + ", article")].slice(0, 40).map((c) => ({
      author: nameIn(c, ".comments-comment-meta__description-title, .comments-post-meta__name-text, a[href*='/in/']"),
      text: clean(c.querySelector(".comments-comment-item__main-content, .update-components-text")?.textContent || c.innerText || "").slice(0, 500),
    })).filter((c) => c.text);
    return { author, authorUrl, url, text: text.slice(0, 8000), media, comments };
  }

  // ---------- inline panel (shadow DOM so LinkedIn styles do not leak in) ----------
  const CSS = `
    :host { all: initial; display: block; margin: 8px 12px 12px; font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .p { --bg:#fff; --bg2:#f3f4f7; --ln:#e3e6eb; --ink:#0d1424; --ink2:#3a4558; --mut:#667085; --acc:#d64545; --good:#12805c; --warn:#b54708;
         background: var(--bg); color: var(--ink); border: 1px solid var(--ln); border-radius: 12px; padding: 12px; box-shadow: 0 6px 24px rgba(16,24,40,.08); animation: rise .2s ease both; }
    .p.dark { --bg:#1b1f23; --bg2:#262b31; --ln:#38404a; --ink:#eef1f5; --ink2:#c7ced8; --mut:#8e98a8; --acc:#ff8a80; }
    .hd { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
    .ttl { font-weight:600; display:flex; gap:6px; align-items:center; } .ttl b { color: var(--acc); }
    .tag { font-size:11px; color: var(--mut); background: var(--bg2); border-radius:999px; padding:2px 8px; }
    .x { border:0; background:transparent; color: var(--mut); font-size:16px; cursor:pointer; }
    .chips { display:flex; flex-wrap:wrap; gap:5px; margin: 4px 0 10px; }
    .c { height:26px; padding:0 9px; border:1px solid var(--ln); border-radius:999px; background: var(--bg); color: var(--ink2); font: inherit; font-size:12px; cursor:pointer; transition: transform .08s; }
    .c:active { transform: scale(.96); } .c.on { background: var(--acc); color: #fff; border-color: var(--acc); }
    .d { border:1px solid var(--ln); border-radius:10px; padding:10px; margin-bottom:8px; animation: rise .22s ease both; }
    .d.best { border-color: var(--acc); }
    .t { white-space: pre-wrap; outline: none; color: var(--ink); margin-bottom:8px; }
    .meta { display:flex; flex-wrap:wrap; gap:8px; align-items:center; font-size:11px; color: var(--mut); margin-bottom:8px; }
    .sc { font-weight:600; } .ok { color: var(--good); } .bad { color: var(--warn); }
    .row { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
    .b { height:28px; padding:0 11px; border:1px solid var(--ln); border-radius:8px; background: var(--bg); color: var(--ink); font: inherit; font-size:12px; font-weight:500; cursor:pointer; transition: transform .08s, filter .12s; }
    .b:active { transform: translateY(1px) scale(.985); } .b:disabled { opacity:.5; }
    .b.pri { background: var(--acc); border-color: var(--acc); color:#fff; }
    .rf { height:24px; padding:0 8px; font-size:11px; color: var(--mut); }
    .sk { height:70px; border-radius:10px; background: var(--bg2); margin-bottom:8px; animation: pulse 1.1s ease-in-out infinite; }
    .err { color: var(--warn); font-size:12px; margin: 4px 0 8px; }
    .why { font-size:11px; color: var(--mut); }
    @keyframes rise { from { opacity:0; transform: translateY(4px); } to { opacity:1; transform:none; } }
    @keyframes pulse { 50% { opacity:.5; } }`;

  function mount(after, host, toggle) {
    const old = after.parentElement?.querySelector(":scope > .prx-host"); if (old) { old.remove(); if (toggle) return null; } // a second plain click closes it
    host.className = "prx-host";
    after.insertAdjacentElement("afterend", host);
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style><div class="p${dark() ? " dark" : ""}"></div>`;
    return root.querySelector(".p");
  }

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // One panel for posts, comment replies and connection notes; `job` says which.
  function openPanel(anchor, job) {
    const host = document.createElement("div");
    const p = mount(anchor, host, !job.mode); if (!p) return;
    const state = { mode: job.kind === "comment" ? (job.mode || null) : job.kind, type: "", drafts: [], err: "" };

    const instr = () => job.kind === "note" ? NOTE_RULES : job.kind === "reply" ? REPLY_RULES : `Mode: ${state.mode}. ${MODES[state.mode]}`;
    const range = () => job.kind === "note" ? { lo: 60, hi: 300, chars: true } : job.kind === "reply" ? { lo: 25, hi: 50 } : rangeOf(MODES[state.mode] || "");

    function render(loading) {
      const title = job.kind === "note" ? "Connection note" : job.kind === "reply" ? "Reply" : "Comment";
      p.innerHTML = `
        <div class="hd"><span class="ttl"><b>✦</b> Prax · ${title}${state.type ? ` <span class="tag">${esc(state.type)}</span>` : ""}</span><button class="x" title="Close">×</button></div>
        ${job.kind === "comment" ? `<div class="chips">${Object.keys(MODES).map((m) => `<button class="c${m === state.mode ? " on" : ""}" data-m="${m}">${m}</button>`).join("")}</div>` : ""}
        ${state.err ? `<div class="err">${esc(state.err)}</div>` : ""}
        ${loading ? '<div class="sk"></div><div class="sk"></div><div class="sk"></div>' : state.drafts.map((d, i) => {
          const h = human(d.text, range());
          return `<div class="d${i === 0 ? " best" : ""}">
            <div class="t" contenteditable="true" data-i="${i}">${esc(d.text)}</div>
            <div class="meta"><span class="sc ${h.score >= 85 ? "ok" : "bad"}">Human ${h.score}</span>${d.value ? `<span class="sc ${d.value >= 7 ? "ok" : "bad"}">Value ${d.value * 10}</span>` : ""}${h.flags.length ? `<span class="bad">${esc(h.flags.join(" · "))}</span>` : ""}${d.angle ? `<span class="why">${esc(d.angle)}</span>` : ""}</div>
            <div class="row"><button class="b pri" data-use="${i}">Use</button><button class="b" data-copy="${i}">Copy</button>${Object.keys(REFINE).map((r) => `<button class="b rf" data-rf="${r}" data-i="${i}">${r}</button>`).join("")}</div>
          </div>`;
        }).join("")}`;
    }

    async function generate() {
      state.err = ""; render(true);
      const ctx = job.context();
      const auto = job.kind === "comment" && !state.mode;
      const ask = `${ctx}\n\n${auto ? `First classify the post as one of: ${TYPES.join(", ")}. Then choose the best mode from: ${Object.keys(MODES).join(", ")}, using that mode's rules: ${JSON.stringify(MODES)}.` : `Rules for this draft: ${instr()}`}
Write 3 different drafts, each taking a different angle, ranked strongest first. Use only facts present in the text above. Score each for value (1 to 10: does it add something the post and comments do not already say).
Return only JSON: {"post_type": "...", "mode": "...", "drafts": [{"text": "...", "angle": "five words on the angle", "value": 8}]}`;
      try {
        const j = parseJSON(await send({ type: "draft", rules: job.kind === "comment" ? "" : instr(), user: ask }));
        if (!j?.drafts?.length) throw new Error("The model did not return drafts. Try again.");
        if (auto) state.mode = MODES[j.mode] ? j.mode : "Agree and add";
        state.type = job.kind === "comment" ? (j.post_type || state.type) : "";
        state.drafts = j.drafts.slice(0, 3).map((d) => (typeof d === "string" ? { text: d } : d));
      } catch (e) { state.err = e.message; }
      render(false);
    }

    p.addEventListener("click", async (e) => {
      const el = e.target.closest("button"); if (!el) return;
      if (el.classList.contains("x")) return host.remove();
      if (el.dataset.m) { state.mode = el.dataset.m; return generate(); }
      const text = (i) => p.querySelector(`.t[data-i="${i}"]`).innerText.trim();
      if (el.dataset.copy != null) { await navigator.clipboard.writeText(text(el.dataset.copy)); return toast("Copied"); }
      if (el.dataset.rf) {
        const i = +el.dataset.i; el.disabled = true;
        try {
          const j = parseJSON(await send({ type: "draft", rules: job.kind === "comment" ? "" : instr(), user: `${job.context()}\n\nRules: ${instr()}\n\nCurrent draft:\n${text(i)}\n\nRevise it: ${REFINE[el.dataset.rf]} Return only JSON: {"text": "...", "value": 8}` }));
          if (j?.text) { state.drafts[i] = { ...state.drafts[i], text: j.text, value: j.value ?? state.drafts[i].value }; render(false); }
        } catch (err) { toast(err.message); el.disabled = false; }
        return;
      }
      if (el.dataset.use != null) {
        const t = text(el.dataset.use);
        try { await job.use(t); pending = { kind: job.kind, scope: job.scope, text: t, ctx: job.logCtx(state.mode) }; host.remove(); toast(job.kind === "note" ? "Note filled. Review it and press Send." : "Filled in. Review it and press Post."); }
        catch (err) { await navigator.clipboard.writeText(t); pending = { kind: job.kind, scope: job.scope, text: t, ctx: job.logCtx(state.mode) }; host.remove(); toast("Copied. " + err.message); }
      }
    });
    p.addEventListener("input", (e) => { const i = e.target.dataset?.i; if (i != null) { state.drafts[i].text = e.target.innerText; } });
    generate();
  }

  // ---------- filling LinkedIn's own boxes (never submitting them) ----------
  function fillEditor(ed, text) {
    ed.focus();
    const sel = getSelection(); const r = document.createRange(); r.selectNodeContents(ed); sel.removeAllRanges(); sel.addRange(r);
    document.execCommand("insertText", false, text);
  }
  const EDITOR = ".ql-editor[contenteditable='true'], div[role='textbox'][contenteditable='true']";
  const buttonByText = (root, re) => [...root.querySelectorAll("button")].find((b) => re.test((b.getAttribute("aria-label") || b.innerText || "").trim()));

  // Prax never clicks LinkedIn's buttons. If the box is open it fills it; otherwise you open it and paste.
  async function useInPost(post, text) {
    const ed = post.querySelector(EDITOR);
    if (!ed) throw new Error("Click Comment on the post, then paste (Cmd+V).");
    fillEditor(ed, text);
  }
  async function useInComment(comment, text) {
    const ed = comment.querySelector(EDITOR);
    if (!ed) throw new Error("Click Reply on the comment, then paste (Cmd+V).");
    fillEditor(ed, text);
  }

  // ---------- auto-log when YOU press Post, Reply or Send ----------
  document.addEventListener("click", async (e) => {
    if (!pending) return;
    const b = e.target.closest?.("button"); if (!b || b.closest(".prx-host")) return;
    const label = (b.getAttribute("aria-label") || b.innerText || "").trim();
    const isSubmit = /comments-comment-box__submit-button|comments-comment-box__submit/.test(b.className) || /^(post|comment|reply|send|send now|send invitation)$/i.test(label);
    // Only the submit button of the comment or reply box counts, not the Comment button in the action bar.
    const inBox = b.closest("form, .comments-comment-box, .comments-comment-texteditor") || b.parentElement?.parentElement?.querySelector(EDITOR);
    if (!isSubmit || !pending.scope.contains(b) || (pending.kind !== "note" && !inBox)) return;
    const job = pending; pending = null;
    const ed = job.scope.querySelector(EDITOR) || job.scope.querySelector("textarea");
    const finalText = clean(ed?.innerText || ed?.value || job.text) || job.text;
    try {
      if (job.kind === "note") {
        const r = await send({ type: "prax", action: "request", body: { ...job.ctx, note: finalText } });
        toast(`Logged in Prax · ${r.prospect || "request"} → Requested${r.ticked ? " · today's request ticked" : ""}`);
      } else {
        const r = await send({ type: "prax", action: "log", body: { ...job.ctx, text: finalText } });
        toast(["Logged in Prax", r.ticked ? "today's comment ticked" : "", r.prospect ? `${r.prospect} → Warming` : ""].filter(Boolean).join(" · "));
      }
    } catch (err) { toast("Posted, but not logged: " + err.message); }
  }, true);

  // ---------- buttons ----------
  function praxButton(label, onClick) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "prx-btn"; b.innerHTML = `<span>✦</span> ${label}`;
    b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); onClick(b); });
    return b;
  }

  let meName = "";
  const CHIPS = ["Short", "Question", "Agree and add", "Data point", "COO lens", "Board lens", "Partner lens", "Respectful disagree", "Punchy", "Congratulate with substance"];

  // The always-visible Prax bar under each post's action row, like a second comment box.
  function decoratePost(row) {
    if (row.dataset.prx || row.nextElementSibling?.classList.contains("prx-bar")) return;
    row.dataset.prx = "1";
    const post = postOf(row);
    const bar = document.createElement("div");
    bar.className = "prx-bar";
    bar.innerHTML = `<button type="button" class="prx-write"><span class="prx-star">✦</span> Write with Prax</button>
      <div class="prx-chips">${CHIPS.map((m) => `<button type="button" class="prx-chip" data-m="${m}">${m}</button>`).join("")}</div>
      <span class="prx-kbd">Alt+P</span>`;
    bar.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      openCommentPanel(post, row, bar, b.dataset.m || null);
    });
    row.insertAdjacentElement("afterend", bar);
  }

  function openCommentPanel(post, row, bar, mode) {
    const d = readPost(post, row);
    if (!d.text) return toast("No post text found here.");
    openPanel(bar, {
      kind: "comment", scope: post, mode,
      context: () => {
        const s = readPost(post, row);
        return `POST by ${s.author || "the author"} (${s.url}):\n${s.text}${s.media.length ? `\n\nATTACHED: ${s.media.join(" | ")}` : ""}\n\nEXISTING COMMENTS (do not repeat their angles):\n${s.comments.map((c, i) => `${i + 1}. ${c.author}: ${c.text}`).join("\n") || "(none loaded)"}`;
      },
      use: (t) => useInPost(post, t),
      logCtx: (m) => ({ author: d.author, author_url: d.authorUrl, url: d.url, mode: m, post_text: d.text.slice(0, 6000) }),
    });
  }

  function decorateComments(post, row) {
    if (!meName) return;
    const author = readPost(post, row).author.toLowerCase();
    if (!author.includes(meName.toLowerCase().split(" ")[0])) return;
    post.querySelectorAll(COMMENT_SEL).forEach((c) => {
      if (c.dataset.prx) return;
      const who = nameIn(c, ".comments-comment-meta__description-title, .comments-post-meta__name-text");
      if (!who || who.toLowerCase().includes(meName.toLowerCase().split(" ")[0])) return;
      const row = c.querySelector(".comments-comment-social-bar, .comments-comment-item__social-actions, .comments-comment-social-bar--cr");
      if (!row) return;
      c.dataset.prx = "1";
      row.appendChild(praxButton("Reply", () => {
        const d = readPost(post);
        const text = clean(c.querySelector(".comments-comment-item__main-content, .update-components-text")?.textContent || "");
        openPanel(row, {
          kind: "reply", scope: c,
          context: () => `YOUR POST:\n${d.text}\n\nCOMMENT by ${who}:\n${text}`,
          use: (t) => useInComment(c, t),
          logCtx: () => ({ author: who, url: d.url, mode: "Reply on own post", post_text: text }),
        });
      }));
    });
  }

  function decorateNoteDialog() {
    const box = document.querySelector("div[role='dialog'] textarea[name='message'], div[role='dialog'] textarea#custom-message");
    if (!box || box.dataset.prx) return;
    box.dataset.prx = "1";
    const dialog = box.closest("div[role='dialog']");
    const name = clean(document.querySelector("main h1")?.textContent || "");
    const url = location.pathname.startsWith("/in/") ? location.href.split("?")[0] : "";
    const btn = praxButton("Prax note", () => openPanel(btn, {
      kind: "note", scope: dialog,
      context: () => `PERSON: ${name}\nPROFILE (as shown on the page):\n${clean(document.querySelector("main")?.innerText || "").slice(0, 7000)}`,
      use: async (t) => { const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(box, t.slice(0, 300)); box.dispatchEvent(new Event("input", { bubbles: true })); box.focus(); },
      logCtx: () => ({ name, url, headline: clean(document.querySelector("main .text-body-medium")?.textContent || "") }),
    }));
    btn.classList.add("prx-inline");
    box.insertAdjacentElement("beforebegin", btn);
  }

  function scan() {
    if (cfg.quiet) return;
    actionRows().forEach((row) => { decoratePost(row); decorateComments(postOf(row), row); });
    decorateNoteDialog();
  }

  // Alt+P opens Prax on the post nearest the middle of the screen.
  document.addEventListener("keydown", (e) => {
    if (cfg.quiet || !e.altKey || e.code !== "KeyP") return;
    const mid = innerHeight / 2;
    const bar = [...document.querySelectorAll(".prx-bar")].sort((a, b) => Math.abs(a.getBoundingClientRect().top - mid) - Math.abs(b.getBoundingClientRect().top - mid))[0];
    const row = bar?.previousElementSibling;
    if (bar && row) { e.preventDefault(); openCommentPanel(postOf(row), row, bar, null); }
  });

  // ---------- start ----------
  let timer;
  const obs = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(scan, 400); });
  async function start() {
    cfg = (await chrome.storage.local.get("cfg")).cfg || {};
    if (cfg.quiet) { document.querySelectorAll(".prx-btn, .prx-host, .prx-bar").forEach((x) => x.remove()); return; }
    send({ type: "me" }).then((m) => { meName = m.workspace || ""; scan(); }).catch(() => {});
    scan();
    obs.observe(document.body, { childList: true, subtree: true });
  }
  chrome.storage.onChanged.addListener((ch) => { if (ch.cfg) { obs.disconnect(); document.querySelectorAll("[data-prx]").forEach((x) => delete x.dataset.prx); document.querySelectorAll(".prx-btn, .prx-host, .prx-bar").forEach((x) => x.remove()); start(); } });
  start();
})();
