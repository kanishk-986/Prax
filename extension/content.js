// Prax on LinkedIn. Adds a ✦ Prax button to posts, to comments on your own posts and to the
// connection note box. Prax only suggests: it drafts, Use fills a box you have opened (or copies),
// and you press LinkedIn's own Post or Send. Prax never clicks, posts, likes, connects or scrolls.

(() => {
  // Already running in this extension's world (for example injected again from the side panel): rescan and stop.
  if (window.__prax?.alive?.()) { window.__prax.rescan("reinject"); return; }
  // A copy left over from before an update can no longer reach the extension. Tell it to remove its bars.
  document.dispatchEvent(new CustomEvent("prax:takeover"));
  const D = globalThis.PraxDOM;
  if (!D) { console.warn("Prax: dom.js did not load"); return; }

  const MODES = {
    "Short": "35 to 50 words, two or three complete sentences. Still one real insight, never a one-liner.",
    "Punchy": "40 to 55 words. A firm view stated plainly in the first sentence, then the reason. No slogans.",
    "Question": "50 to 70 words. Add one fact or consequence, then end on a specific question the author can answer from judgment.",
    "Agree and add": "50 to 70 words. Agree with the main point in one sentence, then add the layer the author did not cover.",
    "Respectful disagree": "50 to 70 words. Accept what is right, then offer a different view on one point with a reason. Courteous, never correcting the author, never against a regulator or government.",
    "Data point": "50 to 70 words. Build around one number or fact that is in the post or its source, and what it implies.",
    "Operator lens": "50 to 70 words. What this means for operations: delivery, controls, timelines, reconciliation, the work behind the headline.",
    "Board lens": "50 to 70 words. What a board or risk committee would ask: exposure, governance, decision timing.",
    "Partner lens": "50 to 70 words. What this means for partners: who needs to work with whom for this to happen.",
    "Congratulate with substance": "40 to 60 words. Congratulate in one plain sentence, then one specific observation about why the milestone matters. No flattery.",
  };
  const TYPES = ["Announcement or win", "New role or milestone", "Opinion or hot take", "Data or report", "Regulation or policy", "Product or launch", "Partnership or deal", "Funding", "Event or speaking", "Industry news", "Question to the audience", "How-to or lesson", "Hiring", "Other"];
  const REFINE = { "Shorter": "Make it about 30 percent shorter. Keep the insight and every rule.", "Sharper": "Make the point sharper and more specific. Remove anything generic.", "Warmer": "Make it warmer and more personal toward the author, without flattery.", "Push back": "Turn it into a courteous, reasoned push back on one point of the post." };
  const BANNED = ["just", "must", "now", "sit", "sits", "delve", "pivotal", "crucial", "testament", "tapestry", "landscape", "underscore", "showcase", "vibrant", "fostering", "key", "vital", "leverage", "robust", "seamless", "game-changer", "great post", "thanks for sharing", "my read is", "what stands out", "the part that"];
  const NOTE_RULES = "You are writing a LinkedIn connection note from this profile, 300 characters maximum including spaces. Give value first: one specific, verifiable insight relevant to the person's job or stated interest, taken only from their profile text. Then one specific question they can answer from judgment. No company pitch, no product, no flattery, no 'would value staying connected', no 'I work on', no 'keen to hear'. No dashes, no contractions. These rules override any word count given above.";
  const REPLY_RULES = "You are replying to a comment left on this profile's own post. 25 to 50 words. Answer or extend the commenter's point with something specific, use their first name where natural, and end with a question only if it moves the conversation. No 'thanks for sharing', no flattery. These rules override any word count given above.";

  // Comment Studio settings arrive with the profile (/api/ext/me). MODES above is the fallback.
  let studio = null, rules = null, vips = [];
  const styles = () => (studio?.styles?.length ? studio.styles.filter((x) => x.on) : Object.entries(MODES).map(([name, r]) => ({ name, rules: r })));
  const styleRules = (name) => (styles().find((x) => x.name === name) || studio?.styles?.find((x) => x.name === name))?.rules || MODES[name] || "";
  const tun = () => studio?.tuning || { drafts: 3, minHuman: 85, humanize: true, repair: true, readComments: true, smartOrder: true, signature: "" };
  const playbookText = () => (studio?.playbooks || []).map((b) => `${b.type}: ${b.aim} Works: ${b.works.join("; ")}. Reads as filler: ${b.filler.join("; ")}.${b.examples?.length ? ` Examples: ${b.examples.join(" | ")}` : ""}`).join("\n");
  const isVip = (name) => { const n = (name || "").toLowerCase().trim(); return !!n && vips.some((v) => n.includes(v) || v.includes(n)); };

  let cfg = {};
  const life = new AbortController(); // removes every page listener when a newer copy takes over
  let pending = null; // { kind, scope, text, ctx } waiting for the user's own Post or Send click

  // ---------- plumbing ----------
  // The background can be asleep or restarting; a message that finds no listener is retried twice.
  // After an extension update this copy is cut off, and it says so instead of failing silently.
  const alive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };
  const STALE = "Prax was updated. Reload this LinkedIn tab (Cmd+R) to use it.";
  const TRANSIENT = /receiving end does not exist|could not establish connection|message port closed|no response/i;
  function sendOnce(msg) {
    return new Promise((res, rej) => {
      if (!alive()) return rej(new Error(STALE));
      try {
        chrome.runtime.sendMessage(msg, (r) => {
          const le = chrome.runtime.lastError?.message;
          if (r?.ok) return res(r.data);
          const err = new Error(r?.error || le || "Prax is not responding. Try again.");
          err.transient = !r && TRANSIENT.test(le || "no response");
          rej(err);
        });
      } catch (e) { rej(new Error(/context invalidated/i.test(e.message) ? STALE : e.message)); }
    });
  }
  async function send(msg) {
    for (let i = 0; ; i++) {
      try { return await sendOnce(msg); }
      catch (e) { if (!e.transient || i >= 2) throw e; await new Promise((r) => setTimeout(r, 300 * (i + 1))); }
    }
  }
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
  const rangeOf = (instr) => { const m = instr.match(/(\d+) to (\d+) words/); return m ? { lo: +m[1], hi: +m[2] } : rules?.length ? { lo: rules.length.lo, hi: rules.length.hi } : null; };

  // ---------- reading the page ----------
  // Post detection and reading live in dom.js (shared with the side panel and the tests).
  const COMMENT_SEL = D.COMMENT_SEL;
  const nameIn = (root, sels) => clean(root?.querySelector(sels)?.textContent || "").split("\n")[0];
  let rowsNow = [];
  const postOf = (row) => D.postOf(row, rowsNow.length ? rowsNow : D.findActionRows(document));
  const readPost = (post, row) => D.readPost(post, row, location);

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

    const instr = () => job.kind === "note" ? NOTE_RULES + (tun().signature ? ` If it fits within 300 characters, end with: ${tun().signature}` : "") : job.kind === "reply" ? REPLY_RULES : `Style: ${state.mode}. ${styleRules(state.mode)}\n${rules?.tuning || ""}`;
    const range = () => job.kind === "note" ? { lo: 60, hi: 300, chars: true } : job.kind === "reply" ? { lo: 25, hi: 50 } : rangeOf(styleRules(state.mode));

    function render(loading) {
      const title = job.kind === "note" ? "Connection note" : job.kind === "reply" ? "Reply" : "Comment";
      p.innerHTML = `
        <div class="hd"><span class="ttl"><b>✦</b> Prax · ${title}${state.type ? ` <span class="tag">${esc(state.type)}</span>` : ""}</span><button class="x" title="Close">×</button></div>
        ${job.kind === "comment" ? `<div class="chips">${styles().map((x) => `<button class="c${x.name === state.mode ? " on" : ""}" data-m="${esc(x.name)}">${esc(x.name)}</button>`).join("")}</div>` : ""}
        ${state.err ? `<div class="err">${esc(state.err)}</div>` : ""}
        ${loading ? '<div class="sk"></div><div class="sk"></div><div class="sk"></div>' : state.drafts.map((d, i) => {
          const h = human(d.text, range());
          return `<div class="d${i === 0 ? " best" : ""}">
            <div class="t" contenteditable="true" data-i="${i}">${esc(d.text)}</div>
            <div class="meta"><span class="sc ${h.score >= tun().minHuman ? "ok" : "bad"}">Human ${h.score}</span>${d.impact ? `<span class="sc ${d.impact >= 7 ? "ok" : "bad"}" title="How likely the author is to reply">Impact ${d.impact * 10}</span>` : ""}${d.value ? `<span class="sc ${d.value >= 7 ? "ok" : "bad"}">Value ${d.value * 10}</span>` : ""}${h.flags.length ? `<span class="bad">${esc(h.flags.join(" · "))}</span>` : ""}${d.angle ? `<span class="why">${esc(d.angle)}</span>` : ""}</div>
            <div class="row"><button class="b pri" data-use="${i}">Use</button><button class="b" data-copy="${i}">Copy</button><button class="b" data-save="${i}" title="Save to the Prax library">Save</button>${Object.keys(REFINE).map((r) => `<button class="b rf" data-rf="${r}" data-i="${i}">${r}</button>`).join("")}</div>
          </div>`;
        }).join("")}`;
    }

    async function generate() {
      state.err = ""; render(true);
      const ctx = job.context();
      const comment = job.kind === "comment";
      const auto = comment && !state.mode;
      const n = Math.max(1, Math.min(5, tun().drafts || 3));
      const list = styles();
      const pick = auto && tun().smartOrder !== false
        ? `Choose the best style for this post type from: ${list.map((x) => x.name).join(", ")}. Style rules: ${JSON.stringify(Object.fromEntries(list.map((x) => [x.name, x.rules])))}.`
        : auto ? `Use the style ${list[0]?.name}: ${list[0]?.rules}` : `Rules for this draft: ${instr()}`;
      const ask = `${ctx}\n\n${comment ? `First classify the post as one of: ${TYPES.join(", ")}. Apply the playbook for that type:\n${playbookText() || "(no playbooks)"}\n\n${pick}\n${rules?.tuning || ""}` : `Rules for this draft: ${instr()}`}
Write ${n} different draft${n > 1 ? "s" : ""}, each taking a different angle, ranked strongest first. Use only facts present in the text above. Score each for value (1 to 10: does it add something the post and comments do not already say) and impact (1 to 10: how likely the author is to reply to it).
Return only JSON: {"post_type": "...", "mode": "...", "drafts": [{"text": "...", "angle": "five words on the angle", "value": 8, "impact": 7}]}`;
      try {
        const j = parseJSON(await send({ type: "draft", kind: job.kind, rules: comment ? "" : instr(), user: ask }));
        if (!j?.drafts?.length) throw new Error("The model did not return drafts. Try again.");
        if (auto) state.mode = list.some((x) => x.name === j.mode) ? j.mode : list[0]?.name || "Agree and add";
        state.type = comment ? (j.post_type || state.type) : "";
        state.drafts = j.drafts.slice(0, n).map((d) => (typeof d === "string" ? { text: d } : d));
        await repair();
        const h = human(state.drafts[0].text, range());
        send({ type: "scored", meta: { style: comment ? state.mode : job.kind, post_type: state.type, human: h.score, impact: state.drafts[0].impact ? state.drafts[0].impact * 10 : null } }).catch(() => {});
        const pc = job.logCtx(state.mode);
        send({ type: "remember", items: state.drafts.map((d) => ({ at: new Date().toISOString(), kind: job.kind, text: d.text, author: pc.author || pc.name || "", url: pc.url || "", style: comment ? state.mode : job.kind, post_type: state.type, human: human(d.text, range()).score, impact: d.impact ? d.impact * 10 : null })) }).catch(() => {});
      } catch (e) { state.err = e.message; }
      render(false);
    }

    // Guardrail repair and auto-humanize: one extra call fixes every draft that trips a house rule
    // or falls under the minimum Human score.
    async function repair() {
      const t = tun();
      const bad = state.drafts.map((d, i) => ({ i, h: human(d.text, range()) }))
        .filter(({ h }) => (t.repair && h.flags.some((f) => !/words|chars/.test(f))) || (t.humanize && h.score < (t.minHuman || 0)));
      if (!bad.length) return;
      try {
        const j = parseJSON(await send({ type: "draft", kind: "repair", rules: job.kind === "comment" ? "" : instr(), user: `Rules: ${instr()}\n\nFix these drafts. Keep each one's point and angle; change only what breaks the rules or reads as machine-written.\n${bad.map(({ i, h }) => `${i}. Problems: ${h.flags.join(", ") || "reads as AI"}\n${state.drafts[i].text}`).join("\n\n")}\n\nReturn only JSON: {"drafts": [{"i": 0, "text": "..."}]}` }));
        (j?.drafts || []).forEach((d) => { if (state.drafts[d.i] && d.text) state.drafts[d.i] = { ...state.drafts[d.i], text: d.text }; });
      } catch {}
    }

    p.addEventListener("click", async (e) => {
      const el = e.target.closest("button"); if (!el) return;
      if (el.classList.contains("x")) return host.remove();
      if (el.dataset.m) { state.mode = el.dataset.m; return generate(); }
      const text = (i) => p.querySelector(`.t[data-i="${i}"]`).innerText.trim();
      if (el.dataset.copy != null) { await navigator.clipboard.writeText(text(el.dataset.copy)); return toast("Copied"); }
      if (el.dataset.save != null) {
        const i = +el.dataset.save, d = state.drafts[i], pc = job.logCtx(state.mode);
        el.disabled = true;
        try { await send({ type: "prax", action: "save", body: { kind: job.kind, text: text(i), author: pc.author || pc.name || "", url: pc.url || "", style: job.kind === "comment" ? state.mode : job.kind, post_type: state.type, human: human(text(i), range()).score, impact: d.impact ? d.impact * 10 : null } }); el.textContent = "Saved"; toast("Saved to the Prax library"); }
        catch (err) { el.disabled = false; toast(err.message); }
        return;
      }
      if (el.dataset.rf) {
        const i = +el.dataset.i; el.disabled = true;
        try {
          const j = parseJSON(await send({ type: "draft", kind: "refine", rules: job.kind === "comment" ? "" : instr(), user: `${job.context()}\n\nRules: ${instr()}\n\nCurrent draft:\n${text(i)}\n\nRevise it: ${REFINE[el.dataset.rf]} Return only JSON: {"text": "...", "value": 8}` }));
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
  }, { capture: true, signal: life.signal });

  // ---------- buttons ----------
  function praxButton(label, onClick) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "prx-btn"; b.innerHTML = `<span>✦</span> ${label}`;
    b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); onClick(b); });
    return b;
  }

  let meName = "";
  const CHIPS = ["Short", "Question", "Agree and add", "Data point", "Operator lens", "Board lens", "Partner lens", "Respectful disagree", "Punchy", "Congratulate with substance"];

  // The always-visible Prax bar under each post's action row, like a second comment box.
  // Idempotent per post: a row keeps its bar while the bar is still on the page and the row still
  // shows the same post. If LinkedIn re-renders and drops the bar, or recycles the row for another
  // post, the next scan builds a fresh one. Nothing is remembered on LinkedIn's own elements.
  const barOf = new Map(); // row -> bar
  const ownBars = new WeakSet();
  function hasLiveBar(row, key) {
    const bar = barOf.get(row);
    if (bar && bar.isConnected && bar.parentElement === row.parentElement && bar.dataset.key === key) return true;
    if (bar) { bar.remove(); barOf.delete(row); }
    return false;
  }
  function decoratePost(row) {
    const post0 = postOf(row);
    const vip = isVip(D.authorOf(post0));
    const chipNames = studio ? styles().map((x) => x.name) : CHIPS;
    // The bar is rebuilt when the post, the profile's styles or the VIP mark change.
    const key = [D.postKey(post0, row), chipNames.join(","), vip ? "vip" : ""].join("|");
    if (hasLiveBar(row, key)) return false;
    // A bar left by an earlier copy of the script (before an update) is not ours: replace it.
    row.parentElement?.querySelectorAll(":scope > .prx-bar").forEach((b) => { if (!ownBars.has(b)) b.remove(); });
    const bar = document.createElement("div");
    bar.dataset.key = key; ownBars.add(bar); barOf.set(row, bar);
    bar.className = "prx-bar" + (vip ? " prx-vip" : "");
    bar.innerHTML = `<button type="button" class="prx-write"><span class="prx-star">✦</span> Write with Prax${vip ? ' <span class="prx-viptag">VIP</span>' : ""}</button>
      <div class="prx-chips">${chipNames.map((m) => `<button type="button" class="prx-chip" data-m="${esc(m)}">${esc(m)}</button>`).join("")}</div>
      <button type="button" class="prx-chip prx-disc" data-disc="1" title="Send this post to Discovery Studio">Send to Discovery</button>
      <span class="prx-kbd">Alt+P</span>`;
    bar.addEventListener("click", async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      // Read the post at click time: LinkedIn may have re-rendered it since the bar was added.
      const post = row.isConnected ? postOf(row) : post0;
      if (b.dataset.disc) {
        // Only when the user presses it, and only the post already on screen. Nothing else is read.
        const d = readPost(post, row);
        if (!d.text) return toast("No post text found here.");
        b.disabled = true;
        try { await send({ type: "prax", action: "discovery", body: { url: d.url, text: d.text, author: d.author, author_url: d.authorUrl } }); b.textContent = "Sent to Discovery"; toast("Sent to Discovery Studio"); }
        catch (err) { b.disabled = false; toast(err.message); }
        return;
      }
      openCommentPanel(post, row, bar, b.dataset.m || null);
    });
    row.insertAdjacentElement("afterend", bar);
    return true;
  }

  function openCommentPanel(post, row, bar, mode) {
    const d = readPost(post, row);
    if (!d.text) return toast("No post text found here.");
    openPanel(bar, {
      kind: "comment", scope: post, mode,
      context: () => {
        const s = readPost(post, row);
        const others = tun().readComments === false ? "" : `\n\nEXISTING COMMENTS (do not repeat their angles):\n${s.comments.map((c, i) => `${i + 1}. ${c.author}: ${c.text}`).join("\n") || "(none loaded)"}`;
        return `POST by ${s.author || "the author"} (${s.url}):\n${s.text}${s.media.length ? `\n\nATTACHED: ${s.media.join(" | ")}` : ""}${others}`;
      },
      use: (t) => useInPost(post, t),
      logCtx: (m) => ({ author: d.author, author_url: d.authorUrl, url: d.url, mode: m, post_text: d.text.slice(0, 6000) }),
    });
  }

  function decorateComments(post, row) {
    if (!meName) return;
    const author = D.authorOf(post).toLowerCase();
    if (!author.includes(meName.toLowerCase().split(" ")[0])) return;
    post.querySelectorAll(COMMENT_SEL).forEach((c) => {
      const who = nameIn(c, ".comments-comment-meta__description-title, .comments-post-meta__name-text");
      if (!who || who.toLowerCase().includes(meName.toLowerCase().split(" ")[0])) return;
      const row = c.querySelector(".comments-comment-social-bar, .comments-comment-item__social-actions, .comments-comment-social-bar--cr");
      // Checked against the page itself, so a re-rendered comment gets its button back.
      if (!row || row.querySelector(":scope > .prx-btn")) return;
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
    if (!box || box.previousElementSibling?.classList.contains("prx-btn")) return;
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

  // ---------- the profile bar on a profile page the user has opened ----------
  // Two buttons under the profile's top card. Each reads only what that card and the Activity section
  // already show, at the moment it is pressed. Prax never opens the mutual connections list, expands a
  // section, scrolls or clicks anything on LinkedIn.
  let profileBar = null;
  function decorateProfile() {
    if (!D.isProfilePath(location.pathname)) { if (profileBar) { profileBar.remove(); profileBar = null; } return; }
    const { h1, card } = D.topCard(document);
    if (!h1 || !card || card.tagName === "MAIN") return;
    const key = D.profileUrl(location);
    if (profileBar && profileBar.isConnected && profileBar.dataset.key === key && profileBar.previousElementSibling === card) return;
    if (profileBar) profileBar.remove();
    const bar = document.createElement("div");
    bar.className = "prx-bar prx-profile"; bar.dataset.key = key;
    bar.innerHTML = `<span class="prx-write prx-label"><span class="prx-star">✦</span> Prax</span>
      <button type="button" class="prx-chip" data-act="save" title="Read the mutual connections and location shown on this profile and save them to Prax">Save mutuals and location</button>
      <button type="button" class="prx-chip prx-disc" data-act="disc" title="Send this person, their headline and the activity shown here to Discovery Studio">Send to Discovery</button>`;
    bar.addEventListener("click", async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      const p = D.readProfile(document, location);
      if (!p.name) return toast("The profile has not loaded yet. Wait a moment and try again.");
      b.disabled = true;
      try {
        if (b.dataset.act === "save") {
          if (!p.mutual && !p.location) { b.disabled = false; return toast("No mutual connections or location are shown on this profile."); }
          const r = await send({ type: "prax", action: "profile", body: { url: p.url, name: p.name, location: p.location, mutual_count: p.mutual ? p.mutual.count : null, mutual_names: p.mutual ? p.mutual.names : [] } });
          const what = [p.mutual ? `${p.mutual.count} mutual connection${p.mutual.count === 1 ? "" : "s"}` : "", p.location ? `location ${p.location}` : ""].filter(Boolean).join(" and ");
          if (!r.prospect && !r.person) { b.disabled = false; return toast(`${p.name} is not in Pipeline or Network yet. Capture the profile from the Prax side panel first.`); }
          toast(`Saved to ${[r.prospect ? `${r.prospect} in Pipeline` : "", r.person ? "Network" : ""].filter(Boolean).join(" and ")}: ${what}`);
          b.textContent = "Saved";
        } else {
          const lines = [p.headline, p.location, ...(p.activity.length ? ["", "Recent activity on the profile:", ...p.activity.map((a) => `- ${a.text}${a.url ? ` (${a.url})` : ""}`)] : [])].filter((x) => x != null);
          await send({ type: "prax", action: "discovery", body: { kind: "profile", url: p.url, title: `${p.name}${p.headline ? `: ${p.headline}` : ""}`, text: lines.join("\n").trim() || p.name, author: p.name, author_url: p.url, company: p.company } });
          b.textContent = "Sent to Discovery"; toast("Sent to Discovery Studio");
        }
      } catch (err) { b.disabled = false; toast(err.message); }
    });
    card.insertAdjacentElement("afterend", bar);
    profileBar = bar;
  }

  // ---------- Send to Prax Inbox on the messaging thread the user has open (X7) ----------
  // One button under the thread's title bar, only on /messaging/thread/. On the click it reads the other person,
  // their headline, the thread link and their last message shown. It never opens, scrolls or reads other threads.
  let threadBar = null;
  function decorateThread() {
    if (!D.isThreadPath(location.pathname)) { if (threadBar) { threadBar.remove(); threadBar = null; } return; }
    // Placing the button reads only where the thread's title is; the messages are read on the click.
    const root = D.threadRoot(document);
    if (!root || root.tagName === "MAIN" || root === document.body) return;
    let head = root.querySelector(".msg-entity-lockup__entity-title, [data-view-name='thread-title'], .msg-title-bar h2");
    while (head && head.parentElement && head.parentElement !== root) head = head.parentElement;
    if (!head) return;
    const key = location.href.split(/[?#]/)[0];
    if (threadBar && threadBar.isConnected && threadBar.dataset.key === key && threadBar.previousElementSibling === head) return;
    if (threadBar) threadBar.remove();
    const bar = document.createElement("div");
    bar.className = "prx-bar prx-profile prx-thread"; bar.dataset.key = key;
    bar.innerHTML = `<span class="prx-write prx-label"><span class="prx-star">✦</span> Prax</span>
      <button type="button" class="prx-chip prx-disc" data-act="inbox" title="Send this person and their last message shown here to the Prax Inbox">Send to Prax Inbox</button>`;
    bar.addEventListener("click", async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      const now = D.readThread(document, location);
      if (!now.name) return toast("The conversation has not loaded yet. Wait a moment and try again.");
      if (!now.text) return toast(`No message from ${now.name} is shown in this conversation yet.`);
      b.disabled = true;
      try {
        const r = await send({ type: "prax", action: "inbox", body: { name: now.name, company: now.company, url: now.url, thread_url: now.thread_url, text: now.text, received_at: now.received_at } });
        b.textContent = "In Prax Inbox";
        toast(`Sent to Prax Inbox: ${now.name}${r && r.prospect ? `, matched to ${typeof r.prospect === "string" ? r.prospect : "their lead"} in Pipeline` : ""}`);
      } catch (err) { b.disabled = false; toast(err.message); }
    });
    head.insertAdjacentElement("afterend", bar);
    threadBar = bar;
  }

  // ---------- Check replies on the notifications page (I1) ----------
  // One button above the notifications list, only on /notifications/. On the click it reads the notifications already
  // shown that are replies, comments or mentions on the profile's comments and posts. It never scrolls, opens a
  // notification, loads more or marks anything as read.
  const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  function repliesToast(r, found) {
    const added = r?.added ?? 0, known = r?.known ?? 0, tasks = r?.tasks ?? 0;
    if (!added) return `Already in Prax: ${known || found} ${found === 1 ? "reply" : "replies"}. Nothing new.`;
    return [`Saved ${added} new ${added === 1 ? "reply" : "replies"} to Prax`, known ? `${known} already there` : "", tasks ? `${tasks} Reply back ${tasks === 1 ? "task" : "tasks"} on Today` : ""].filter(Boolean).join(". ") + ".";
  }
  let notesBar = null;
  function decorateNotifications() {
    if (!D.isNotificationsPath(location.pathname)) { if (notesBar) { notesBar.remove(); notesBar = null; } return; }
    const cards = D.notificationCards(document);
    if (!cards.length) return;
    const anchor = cards[0].closest("ul, section") || cards[0];
    if (notesBar && notesBar.isConnected && notesBar.nextElementSibling === anchor) return;
    if (notesBar) notesBar.remove();
    const bar = document.createElement("div");
    bar.className = "prx-bar prx-profile prx-notes";
    bar.innerHTML = `<span class="prx-write prx-label"><span class="prx-star">✦</span> Prax</span>
      <button type="button" class="prx-chip prx-disc" data-act="replies" title="Read the replies, comments and mentions shown in these notifications and save them to Prax">Check replies</button>`;
    bar.addEventListener("click", async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      if (!meName) { loadMe(); return toast("Prax is still connecting. Try again in a moment."); }
      const r = D.readNotifications(document, meName);
      if (!r.replies.length) return toast("No replies, comments or mentions are shown in these notifications yet.");
      b.disabled = true;
      try {
        const j = await send({ type: "prax", action: "replies", body: { replies: r.replies, day: localDay() } });
        toast(repliesToast(j, r.replies.length));
      } catch (err) { toast(err.message); }
      b.disabled = false;
    });
    anchor.insertAdjacentElement("beforebegin", bar);
    notesBar = bar;
  }

  // ---------- scanning ----------
  // What the side panel's "Prax bar status" shows for this tab.
  const VERSION = (() => { try { return chrome.runtime.getManifest().version; } catch { return "?"; } })();
  const stats = { seen: 0, attached: 0, scans: 0, lastScan: 0, connected: null, workspace: "", error: "" };
  let stopped = false;

  function scan() {
    if (stopped || cfg.quiet) return;
    if (location.href !== lastUrl) lastUrl = location.href; // SPA navigation: the rows are simply found again
    for (const [row, bar] of barOf) if (!row.isConnected) { bar.remove(); barOf.delete(row); }
    rowsNow = D.findActionRows(document);
    for (const row of rowsNow) {
      try { decoratePost(row); decorateComments(postOf(row), row); }
      catch (e) { stats.error = "Bar error: " + e.message; }
    }
    try { decorateNoteDialog(); } catch (e) { stats.error = "Note box error: " + e.message; }
    try { decorateProfile(); } catch (e) { stats.error = "Profile bar error: " + e.message; }
    try { decorateThread(); } catch (e) { stats.error = "Inbox button error: " + e.message; }
    try { decorateNotifications(); } catch (e) { stats.error = "Check replies button error: " + e.message; }
    stats.seen = rowsNow.length;
    stats.attached = rowsNow.filter((r) => barOf.get(r)?.isConnected).length;
    stats.scans++; stats.lastScan = Date.now();
  }

  // Throttle, not debounce: LinkedIn's feed changes all the time (videos, counters, lazy posts), and a
  // debounce that waits for a quiet moment can wait forever. A scan runs at most every 250 ms.
  let timer = 0, lastUrl = location.href;
  const schedule = () => { if (!timer && !stopped) timer = setTimeout(() => { timer = 0; scan(); }, 250); };
  const isOurs = (n) => n.nodeType === 1 && (n.matches?.(D.OURS) || !!n.closest?.(D.OURS));
  const obs = new MutationObserver((recs) => {
    // Skip changes made only inside Prax's own bars and panels.
    if (recs.every((r) => isOurs(r.target) || (!r.removedNodes.length && r.addedNodes.length && [...r.addedNodes].every(isOurs)))) return;
    schedule();
  });
  // LinkedIn is a single-page app. Page changes are caught here, by every scan, and by the background (tabs.onUpdated).
  const onNav = () => { if (location.href !== lastUrl) { lastUrl = location.href; schedule(); setTimeout(schedule, 1200); } };
  window.addEventListener("popstate", onNav, { signal: life.signal });
  try { window.navigation?.addEventListener("navigatesuccess", onNav, { signal: life.signal }); } catch { /* older Chrome */ }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(); }, { signal: life.signal });

  function status() {
    return { version: VERSION, url: location.href, quiet: !!cfg.quiet, seen: stats.seen, attached: stats.attached, scans: stats.scans, lastScan: stats.lastScan,
      connected: stats.connected, workspace: stats.workspace, error: stats.error, alive: alive() };
  }

  // The background (tab updates) and the side panel (status, Fix bars) talk to this copy here.
  function onMsg(msg, _sender, reply) {
    if (!msg || typeof msg.type !== "string" || !msg.type.startsWith("prax:")) return false;
    if (msg.type === "prax:nav") onNav();
    if (msg.type === "prax:rescan") { if (stats.connected !== true) loadMe(); scan(); }
    reply({ ok: true, data: status() });
    return false;
  }
  chrome.runtime.onMessage.addListener(onMsg);

  // Alt+P opens Prax on the post nearest the middle of the screen.
  document.addEventListener("keydown", (e) => {
    if (cfg.quiet || !e.altKey || e.code !== "KeyP") return;
    const mid = innerHeight / 2;
    const pick = [...barOf].filter(([r, b]) => r.isConnected && b.isConnected)
      .sort(([, a], [, b]) => Math.abs(a.getBoundingClientRect().top - mid) - Math.abs(b.getBoundingClientRect().top - mid))[0];
    if (pick) { e.preventDefault(); openCommentPanel(postOf(pick[0]), pick[0], pick[1], null); }
  }, { signal: life.signal });

  // ---------- start ----------
  function removeAll() {
    for (const [, bar] of barOf) bar.remove();
    barOf.clear();
    document.querySelectorAll(".prx-btn, .prx-host, .prx-bar").forEach((x) => x.remove());
  }
  function loadMe() {
    send({ type: "me" }).then((m) => {
      meName = m.workspace || ""; studio = m.studio || null; rules = m.rules || null;
      stats.connected = true; stats.workspace = m.workspace || ""; stats.error = "";
      const sf = studio?.safety || {};
      vips = [...(sf.vips || []), ...(sf.vipProspects === false ? [] : (m.prospects || []).map((x) => x.name))].map((x) => String(x).toLowerCase().trim()).filter((x) => x.length > 2);
      scan(); // bars whose styles or VIP mark changed are rebuilt; the rest stay
    }).catch((e) => { stats.connected = false; stats.error = e.message; });
  }
  async function start() {
    try { cfg = (await chrome.storage.local.get("cfg")).cfg || {}; }
    catch { stats.error = STALE; return; }
    if (stopped) return;
    if (cfg.quiet) { obs.disconnect(); removeAll(); return; }
    scan();
    obs.observe(document.documentElement, { childList: true, subtree: true });
    loadMe();
  }
  function onStore(ch) { if (ch.cfg && !stopped) { obs.disconnect(); removeAll(); start(); } }
  chrome.storage.onChanged.addListener(onStore);

  // A newer copy of this script (after an update) takes over the page: this one stops and clears its UI.
  function teardown() {
    stopped = true; obs.disconnect(); clearTimeout(timer); life.abort(); removeAll();
    try { chrome.runtime.onMessage.removeListener(onMsg); chrome.storage.onChanged.removeListener(onStore); } catch { /* cut off already */ }
  }
  // Only a copy that is already cut off obeys, so the page itself cannot switch off a working bar.
  document.addEventListener("prax:takeover", () => { if (!alive()) teardown(); }, { signal: life.signal });
  window.__prax = { alive: () => !stopped && alive(), rescan: () => schedule(), status, stop: teardown };
  start();
})();
