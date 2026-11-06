// Prax page reading helpers, shared by the Prax bar (content.js), the side panel (injected on a click)
// and the logic tests (scripts/test-extension.ts). Pure DOM reads: nothing here clicks, scrolls or fetches.
// LinkedIn renames its classes often, so posts are found by their action row: the block that holds a
// Comment button next to a Like or React button. Class names are only used as extra hints.

(function (g) {
  const OURS = ".prx-bar, .prx-host, .prx-btn, #prx-toast";
  const COMMENT_SEL = "article.comments-comment-entity, article.comments-comment-item, [data-view-name='comment-container'], [data-id^='urn:li:comment']";
  const BOX = "form, .comments-comment-box, .comments-comment-texteditor, [role='dialog']";
  const POST_HINT = "[data-urn*='urn:li:activity'], [data-urn*='urn:li:share'], [data-urn*='urn:li:ugcPost'], [data-id*='urn:li:activity'], [data-id*='urn:li:share'], [data-id*='urn:li:ugcPost'], [data-view-name='feed-full-update'], div.feed-shared-update-v2";
  const TEXT_SEL = ".update-components-text, .feed-shared-inline-show-more-text, .feed-shared-text, [data-view-name='feed-commentary'], [data-testid='expandable-text-box']";
  const ACTOR_SEL = ".update-components-actor__title span[aria-hidden='true'], .update-components-actor__name, .update-components-actor__title, [data-view-name='feed-actor-name']";

  const clean = (s) => String(s || "").replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  const one = (s) => clean(s).replace(/\s+/g, " ");
  const label = (b) => one((b.getAttribute && b.getAttribute("aria-label")) || b.textContent || "");

  // What an action button is, from its label: "comment", "like", "share" or "".
  // Counts such as "12 comments" are not actions; "Reaction button state: no reaction" is LinkedIn's Like.
  function kindOf(text) {
    const t = one(text).toLowerCase();
    if (!t || /^\d/.test(t)) return "";
    if (/^comment\b/.test(t)) return "comment";
    if (/^(like|unlike|react)\b|^reaction button|^(celebrate|support|love|insightful|funny)$/.test(t)) return "like";
    if (/^(repost|share|send)\b/.test(t)) return "share";
    return "";
  }

  const buttons = (root) => [...root.querySelectorAll("button, [role='button']")];
  const kinds = (el) => new Set(buttons(el).map((b) => kindOf(label(b))).filter(Boolean));

  // Every post action row on the page. Comment buttons inside a comment box, a dialog, a comment
  // thread or Prax's own UI are skipped, so comment replies and the submit button never get a bar.
  function findActionRows(doc) {
    const found = [];
    for (const b of buttons(doc)) {
      if (kindOf(label(b)) !== "comment") continue;
      if (b.closest(OURS) || b.closest(BOX) || b.closest(COMMENT_SEL) || b.getAttribute("type") === "submit") continue;
      let el = b.parentElement;
      for (let i = 0; i < 6 && el; i++, el = el.parentElement) {
        if (el.matches && el.matches(OURS)) break;
        if (kinds(el).has("like")) { found.push(el); break; }
      }
    }
    // Keep the innermost row when one candidate contains another.
    const uniq = [...new Set(found)];
    return uniq.filter((r) => !uniq.some((o) => o !== r && r.contains(o)));
  }

  // The post that owns an action row: a known post container if it holds only this row, otherwise
  // the largest ancestor that does not reach a second row (the feed list).
  function postOf(row, rows) {
    const others = (rows || []).filter((r) => r !== row);
    const owns = (el) => !others.some((r) => el.contains(r));
    const hint = row.closest(POST_HINT);
    if (hint && owns(hint)) return hint;
    let el = row;
    for (let i = 0; i < 16 && el.parentElement; i++) {
      const up = el.parentElement;
      if (/^(BODY|MAIN|HTML)$/.test(up.tagName) || up.getAttribute("role") === "main" || !owns(up)) break;
      el = up;
    }
    return el;
  }

  const urnIn = (s) => (String(s || "").match(/urn:li:(?:activity|share|ugcPost):[\w-]+/) || [""])[0];

  function postUrn(post) {
    const own = urnIn(post.getAttribute("data-urn")) || urnIn(post.getAttribute("data-id"));
    if (own) return own;
    const inner = post.querySelector("[data-urn*='urn:li:'], [data-id*='urn:li:']");
    const fromInner = inner && (urnIn(inner.getAttribute("data-urn")) || urnIn(inner.getAttribute("data-id")));
    if (fromInner) return fromInner;
    const link = [...post.querySelectorAll("a[href*='urn:li:']")].map((a) => urnIn(decodeURIComponent(a.getAttribute("href") || ""))).find(Boolean);
    return link || "";
  }

  function postUrl(post, loc) {
    const href = loc ? String(loc.href || "").split("?")[0].split("#")[0] : "";
    const path = loc ? String(loc.pathname || "") : "";
    if (/^\/(feed\/update|posts)\//.test(path)) return href;
    const urn = postUrn(post);
    if (urn) return `https://www.linkedin.com/feed/update/${urn}/`;
    const a = post.querySelector("a[href*='/posts/'], a[href*='/feed/update/']");
    if (a) { try { return new URL(a.getAttribute("href"), "https://www.linkedin.com").href.split("?")[0]; } catch { /* fall through */ } }
    return href;
  }

  // First match by priority, not by page order (a selector list returns the outer title first,
  // which also holds LinkedIn's hidden screen-reader copy of the name).
  // The visible name only: LinkedIn often repeats it in a hidden span for screen readers.
  const shown = (el) => clean((el.querySelector("[aria-hidden='true']") || el).textContent);
  const first = (root, list) => { for (const s of list.split(/,\s*(?![^[]*\])/)) { const el = root.querySelector(s); if (el && clean(el.textContent)) return el; } return null; };

  function authorOf(post) {
    const a = first(post, ACTOR_SEL);
    if (a) return clean(a.textContent).split("\n")[0];
    const link = [...post.querySelectorAll("a[href*='/in/'], a[href*='/company/']")].find((x) => !x.closest(COMMENT_SEL) && one(x.textContent).length > 1);
    return link ? shown(link).split("\n")[0] : "";
  }

  function authorUrlOf(post) {
    const a = post.querySelector("a.update-components-actor__meta-link, a.update-components-actor__image") ||
      [...post.querySelectorAll("a[href*='/in/'], a[href*='/company/']")].find((x) => !x.closest(COMMENT_SEL));
    if (!a) return "";
    try { return new URL(a.getAttribute("href"), "https://www.linkedin.com").href.split("?")[0]; } catch { return ""; }
  }

  function textOf(post, row) {
    const t = clean(post.querySelector(TEXT_SEL)?.textContent);
    if (t) return t;
    // Fallback: everything in the post above its action row, minus Prax's own UI.
    const doc = post.ownerDocument;
    if (row && doc && doc.createRange && post.firstChild) {
      try { const r = doc.createRange(); r.setStartBefore(post.firstChild); r.setEndBefore(row); return clean(r.toString()); } catch { /* ignore */ }
    }
    return "";
  }

  function commentsOf(post) {
    return [...post.querySelectorAll(COMMENT_SEL)].slice(0, 40).map((c) => ({
      author: (() => { const a = first(c, ".comments-comment-meta__description-title, .comments-post-meta__name-text, a[href*='/in/']"); return a ? shown(a).split("\n")[0] : ""; })(),
      text: clean(c.querySelector(".comments-comment-item__main-content, .update-components-text, [data-testid='expandable-text-box']")?.textContent || c.textContent).slice(0, 500),
    })).filter((c) => c.text);
  }

  function readPost(post, row, loc) {
    const media = [...post.querySelectorAll(".update-components-article__title, .update-components-document__title, img[alt]")]
      .filter((e) => !e.closest(COMMENT_SEL)).map((e) => clean(e.getAttribute("alt") || e.textContent)).filter((t) => t && t.length > 3).slice(0, 4);
    return { author: authorOf(post), authorUrl: authorUrlOf(post), url: postUrl(post, loc), text: textOf(post, row).slice(0, 8000), media, comments: commentsOf(post) };
  }

  // A stable key per post, so a recycled row that now shows another post gets a fresh bar.
  function postKey(post, row) {
    const urn = postUrn(post);
    if (urn) return urn;
    const s = authorOf(post) + "|" + textOf(post, row).slice(0, 160);
    let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return "h" + (h >>> 0).toString(36);
  }

  // The post closest to the middle of the screen, for the side panel's Read this post.
  function nearestPost(doc, mid) {
    const rows = findActionRows(doc);
    const posts = rows.map((r) => ({ row: r, post: postOf(r, rows) }));
    const dist = (x) => { const b = x.post.getBoundingClientRect ? x.post.getBoundingClientRect() : { top: 0, bottom: 0 }; return Math.abs((b.top + b.bottom) / 2 - mid); };
    return posts.sort((a, b) => dist(a) - dist(b))[0] || null;
  }

  // Numbers from the user's own analytics page text. Tolerates "1,234", "1.2K", a percent change
  // line between the number and its label, and the label written before or after the number.
  const METRICS = [
    ["impressions_7d", /^(post )?impressions\b/i],
    ["followers", /^(total )?followers\b/i],
    ["profile_views_90d", /^profile view(er)?s?\b/i],
    ["search_appearances", /^search appearances?\b/i],
  ];
  function toNumber(s) {
    const m = String(s).trim().match(/^([\d][\d,.]*)\s*([KkMm])?$/);
    if (!m) return null;
    const v = parseFloat(m[1].replace(/,/g, ""));
    if (isNaN(v)) return null;
    return m[2] ? Math.round(v * (/k/i.test(m[2]) ? 1e3 : 1e6)) : v;
  }
  function parseAnalytics(text) {
    const lines = String(text || "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const out = {};
    lines.forEach((line, i) => {
      for (const [key, re] of METRICS) {
        if (out[key] != null) continue;
        const inline = line.match(/^([\d][\d,.]*\s*[KkMm]?)\s+(.+)$/);
        if (inline && re.test(inline[2]) && toNumber(inline[1]) != null) { out[key] = toNumber(inline[1]); continue; }
        if (!re.test(line)) continue;
        // Look up to three lines back, then one forward, skipping percent changes and dates.
        const near = [lines[i - 1], lines[i - 2], lines[i - 3], lines[i + 1]];
        for (const n of near) { const v = n != null && !/%/.test(n) ? toNumber(n) : null; if (v != null) { out[key] = v; break; } }
      }
    });
    return out;
  }

  const isLinkedIn = (url) => /^https:\/\/([\w-]+\.)?linkedin\.com\//.test(String(url || ""));

  const api = { OURS, COMMENT_SEL, clean, label, kindOf, findActionRows, postOf, postUrn, postUrl, authorOf, authorUrlOf, textOf, commentsOf, readPost, postKey, nearestPost, parseAnalytics, isLinkedIn };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  g.PraxDOM = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
