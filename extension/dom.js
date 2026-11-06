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
  function parseAnalytics(text) { return readNumbers(text, METRICS); }

  // One post's results, from its own analytics page or the post page as its author sees it (CS29).
  // "Impressions 1,234", "1,234 impressions", "56 reactions", "7 comments", "3 reposts".
  const POST_METRICS = [
    ["impressions", /^(post )?impressions?\b/i],
    ["reactions", /^reactions?\b/i],
    ["comments", /^comments?\b/i],
    ["reposts", /^reposts?\b/i],
  ];
  // Read from the page itself, not its text: a label and its number sit in the same row, whichever comes first,
  // and the text alone cannot say which neighbouring number belongs to which label.
  function postResultsIn(root) {
    if (!root) return null;
    const leaves = [...root.querySelectorAll("*")].filter((e) => !e.children.length && !e.closest(OURS) && !e.closest(HIDDEN) && !/^(SCRIPT|STYLE)$/.test(e.tagName));
    const numOf = (e) => toNumber(one(e.textContent));
    const out = {};
    for (const [key, re] of POST_METRICS) {
      for (const el of leaves) {
        const t = one(el.textContent);
        if (!t) continue;
        const inline = t.match(/^([\d][\d,.]*\s*[KkMm]?)\s+(.+)$/);
        if (inline && re.test(inline[2]) && toNumber(inline[1]) != null) { out[key] = toNumber(inline[1]); break; }
        if (!re.test(t) || t.length > 40) continue;
        // The number in the same row: the nearest ancestor, two levels up at most, holding exactly one number.
        let box = el.parentElement, got = null;
        for (let k = 0; k < 2 && box && got == null; k++, box = box.parentElement) {
          const nums = [...box.querySelectorAll("*")].filter((x) => !x.children.length && !x.closest(HIDDEN) && numOf(x) != null);
          if (nums.length === 1) got = numOf(nums[0]);
          else if (nums.length > 1) break;
        }
        if (got != null) { out[key] = got; break; }
      }
    }
    // Without impressions (someone else's post, or the feed) these are not the post's own results.
    return out.impressions != null ? out : null;
  }
  // The activity id the Prax server matches posts by, from a post page, a post analytics page or a /posts/ link.
  function activityIdOf(url) {
    const s = decodeURIComponent(String(url || ""));
    const m = s.match(/urn:li:activity:(\d{6,})/) || s.match(/activity-(\d{6,})/);
    return m ? m[1] : "";
  }
  const isPostResultsPage = (path) => /^\/(analytics\/post-summary|feed\/update|posts)\//.test(String(path || ""));

  function readNumbers(text, table) {
    const lines = String(text || "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const out = {};
    lines.forEach((line, i) => {
      for (const [key, re] of table) {
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

  // ---------- profile pages ----------
  // Read only when the user presses a Prax button on a profile they have opened. Only what is on screen:
  // nothing here opens the mutual connections list, expands a section or scrolls.
  const HIDDEN = ".visually-hidden, .sr-only, .a11y-text";
  const BLOCK = /^(DIV|P|LI|UL|OL|SECTION|H1|H2|H3|H4|BR|ARTICLE|HEADER|FOOTER)$/;
  // Visible text: LinkedIn repeats names in hidden screen-reader spans, which are left out.
  function visible(el) {
    let s = "";
    for (const n of el.childNodes || []) {
      if (n.nodeType === 3) s += n.textContent;
      else if (n.nodeType === 1 && !(n.matches && n.matches(HIDDEN)) && !/^(SCRIPT|STYLE|TEMPLATE)$/.test(n.tagName)) { const t = visible(n); s += BLOCK.test(n.tagName) ? `\n${t}\n` : t; }
    }
    return s;
  }
  // Every visible text piece in page order.
  function pieces(el, out = []) {
    for (const n of el.childNodes || []) {
      if (n.nodeType === 3) { const t = one(n.textContent); if (t) out.push(t); }
      else if (n.nodeType === 1 && !(n.matches && n.matches(HIDDEN)) && !(n.matches && n.matches(OURS)) && !/^(SCRIPT|STYLE|TEMPLATE)$/.test(n.tagName)) pieces(n, out);
    }
    return out;
  }

  const isProfilePath = (path) => /^\/in\/[^/]+\/?$/.test(String(path || ""));
  function profileUrl(loc) {
    const m = String(loc?.pathname || "").match(/^\/in\/([^/]+)/);
    return m ? `https://www.linkedin.com/in/${m[1]}/` : "";
  }

  const toInt = (s) => parseInt(String(s).replace(/[,.]/g, ""), 10) || 0;
  const splitNames = (s) => one(s).replace(/^[,\s]+|[,\s]+$/g, "").split(/\s*,\s*(?:and\s+)?|\s+and\s+/).map(one).filter((x) => x && x.length < 80 && !/^\d/.test(x));
  // "Sara Khan, Omar Ali and 12 other mutual connections", "Sara Khan and Omar Ali are mutual connections",
  // "Sara Khan is a mutual connection", "15 mutual connections". Returns { count, names } or null.
  function parseMutual(text) {
    const t = one(text);
    if (!/mutual connections?/i.test(t)) return null;
    let m = t.match(/^(.*?),?\s+and\s+(\d[\d,.]*)\s+others?\s+mutual connections?\b/i);
    if (m) { const names = splitNames(m[1]); return { count: names.length + toInt(m[2]), names }; }
    m = t.match(/^(\d[\d,.]*)\s+mutual connections?\b/i);
    if (m) return { count: toInt(m[1]), names: [] };
    m = t.match(/^(.*?)\s+(?:is a|are)\s+mutual connections?\b/i);
    if (m) { const names = splitNames(m[1]); return names.length ? { count: names.length, names } : null; }
    return null;
  }

  // The top card: the largest block around the name that holds no section heading (About, Activity and
  // the "People also viewed" side lists all have one), so lines from other sections are never read.
  function topCard(doc) {
    const main = doc.querySelector("main, [role='main']") || doc.body;
    const h1 = main && main.querySelector("h1");
    if (!h1) return { main, h1: null, card: main };
    let card = h1.parentElement || main;
    while (card !== main && card.parentElement && card.parentElement !== main && !card.parentElement.querySelector("h2")) card = card.parentElement;
    if (card.querySelector("h2") && h1.closest("section")) card = h1.closest("section");
    return { main, h1, card };
  }

  function mutualOf(root) {
    const hits = [...root.querySelectorAll("a, span, div, p")].filter((e) => !e.closest(OURS) && /mutual connection/i.test(visible(e)) && visible(e).length < 400);
    // The innermost element holding the line, so nothing else on the card is read as a name.
    const inner = hits.filter((e) => !hits.some((o) => o !== e && e.contains(o)));
    for (const e of inner) { const m = parseMutual(visible(e)); if (m) return m; }
    return null;
  }

  const NOT_PLACE = /connections?|followers?|mutual|contact info|^\W+$|^\d|^(1st|2nd|3rd)$|^(he|she|they)\//i;
  function locationOf(card) {
    const el = card.querySelector(".text-body-small.inline.t-black--light.break-words, [data-testid='profile-location']");
    if (el && one(visible(el))) return one(visible(el));
    // Newer layout without classes: the line just before "Contact info".
    const ps = pieces(card);
    const i = ps.findIndex((p) => /^contact info$/i.test(p));
    for (let j = i - 1; j >= 0 && j >= i - 3; j--) if (!NOT_PLACE.test(ps[j]) && ps[j].length > 1 && ps[j].length < 90) return ps[j];
    return "";
  }

  const NOT_HEADLINE = /^[·•\s]*(\(?(he|she|they)\/\w+\)?|1st|2nd|3rd|3rd\+|contact info|connect|message|follow|more|verified)?$/i;
  function headlineOf(card, name) {
    const el = card.querySelector(".text-body-medium, [data-testid='profile-headline']");
    if (el && one(visible(el))) return one(visible(el));
    const ps = pieces(card);
    const i = ps.findIndex((p) => p === name);
    for (let j = i + 1; j > 0 && j < ps.length && j <= i + 4; j++) if (!NOT_HEADLINE.test(ps[j]) && ps[j].length > 3 && ps[j] !== name) return ps[j];
    return "";
  }

  // "CFO at Northbank | Tokenisation" gives Northbank.
  function companyOf(headline) {
    const m = String(headline || "").split(/\s[|•·]\s/)[0].match(/\b(?:at|@)\s+(.+)$/i);
    return m ? one(m[1]).replace(/[.,;]+$/, "").slice(0, 120) : "";
  }

  // The Activity section on the profile, as far as it is already shown. Up to 5 items.
  function activityOf(doc) {
    const heads = [...doc.querySelectorAll("main h2, main h3, [role='main'] h2")].filter((h) => /^activity$/i.test(one(visible(h)).split("\n")[0]));
    const sec = heads[0] && (heads[0].closest("section") || heads[0].parentElement);
    if (!sec) return [];
    let items = [...sec.querySelectorAll("li")];
    items = items.filter((li) => !items.some((o) => o !== li && o.contains(li)));
    return items.map((li) => {
      const t = one(visible(li.querySelector(TEXT_SEL) || li)).slice(0, 400);
      const a = li.querySelector("a[href*='/feed/update/'], a[href*='/posts/']");
      let url = "";
      if (a) { try { url = new URL(a.getAttribute("href"), "https://www.linkedin.com").href.split("?")[0]; } catch { /* no link */ } }
      return { text: t, url };
    }).filter((x) => x.text.length > 20).slice(0, 5);
  }

  function readProfile(doc, loc) {
    const { h1, card } = topCard(doc);
    const name = h1 ? one(visible(h1)) : "";
    const headline = headlineOf(card, name);
    return { url: profileUrl(loc), name, headline, company: companyOf(headline), location: locationOf(card), mutual: mutualOf(card), activity: activityOf(doc) };
  }

  // ---------- a messaging thread the user has open (Send to Prax Inbox, X7) ----------
  // Only the open thread, only what it shows, only on the user's click. Nothing here opens, scrolls or reads
  // other threads.
  const isThreadPath = (path) => /^\/messaging\/thread\/[^/]+/.test(String(path || ""));
  const THREAD = ".msg-convo-wrapper, .msg-thread, [data-view-name='message-thread']";
  const THREAD_NAME = ".msg-entity-lockup__entity-title, .msg-thread__link-to-profile .msg-entity-lockup__entity-title, [data-view-name='thread-title'], .msg-title-bar h2, h2";
  const THREAD_HEAD = ".msg-entity-lockup__entity-info, .msg-thread__top-card-subtitle, [data-view-name='thread-headline']";
  const MSG_ITEM = "li.msg-s-message-list__event, li[data-event-urn], [data-view-name='message-list-item']";
  const MSG_SENDER = ".msg-s-message-group__name, .msg-s-message-group__profile-link, [data-view-name='message-sender']";
  const MSG_BODY = ".msg-s-event-listitem__body, [data-view-name='message-body']";
  const slugOf = (href) => (String(href || "").match(/\/in\/([^/?#]+)/) || ["", ""])[1].toLowerCase();

  function threadRoot(doc) { return doc.querySelector(THREAD) || doc.querySelector("main, [role='main']") || doc.body; }

  function readThread(doc, loc) {
    const root = threadRoot(doc);
    const nameEl = first(root, THREAD_NAME);
    const name = nameEl ? one(visible(nameEl)) : "";
    const link = (nameEl && nameEl.closest("a[href*='/in/']")) || root.querySelector("a.msg-thread__link-to-profile, .msg-thread__top-card a[href*='/in/'], header a[href*='/in/']");
    let url = "";
    if (link) { try { url = new URL(link.getAttribute("href"), "https://www.linkedin.com").href.split("?")[0]; } catch { /* no link */ } }
    const headEl = first(root, THREAD_HEAD);
    const headline = headEl ? one(visible(headEl)) : "";
    // Each message carries its sender only at the start of a group, so the sender runs on to the next ones.
    const theirs = (who, href) => (href && slugOf(url) && slugOf(href) === slugOf(url)) || (!!who && one(who).toLowerCase() === name.toLowerCase());
    // So does the time: a message without its own time was sent in its group's minute.
    let sender = "", senderHref = "", when = "", last = null;
    for (const item of root.querySelectorAll(MSG_ITEM)) {
      const s = item.querySelector(MSG_SENDER);
      if (s) { sender = one(visible(s)); senderHref = (s.closest("a[href]") || s.querySelector("a[href]") || s).getAttribute?.("href") || ""; }
      const t = item.querySelector("time[datetime]");
      if (t) when = t.getAttribute("datetime") || "";
      const body = item.querySelector(MSG_BODY);
      const text = body ? clean(visible(body)) : "";
      if (text && theirs(sender, senderHref)) last = { text, received_at: when };
    }
    return { name, headline, company: companyOf(headline), url, thread_url: loc ? String(loc.href || "").split(/[?#]/)[0] : "", text: last ? last.text.slice(0, 4000) : "", received_at: last ? last.received_at : "" };
  }

  const api = { OURS, COMMENT_SEL, clean, label, kindOf, findActionRows, postOf, postUrn, postUrl, authorOf, authorUrlOf, textOf, commentsOf, readPost, postKey, nearestPost, parseAnalytics, isLinkedIn,
    isProfilePath, profileUrl, parseMutual, readProfile, companyOf, topCard, postResultsIn, activityIdOf, isPostResultsPage, isThreadPath, readThread, threadRoot };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  g.PraxDOM = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
