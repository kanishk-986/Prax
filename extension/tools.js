// Prax tools (Connections, extension 0.9.7): the request and the reply mapping for every tool Prax can call with a key
// kept in this browser. Self-contained and side-effect free: background.js loads it with importScripts and does the
// fetch; scripts/test-connections.ts loads it with require and checks each mapping against replies saved from the
// vendors' own docs (scripts/fixtures/connections). Keys only ever go into the request to that vendor.
// Never used for LinkedIn: the data tools read public web pages, news and company data only.
//
// Docs each request is built from (read 6 Nov 2026):
// - OpenAI chat and models: developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create, .../models/methods/list
// - Mistral: docs.mistral.ai/api/endpoint/chat; DeepSeek: api-docs.deepseek.com/api/create-chat-completion (thinking off);
//   Groq: console.groq.com/docs/openai; xAI: docs.x.ai/developers/rest-api-reference/inference/chat-completions
// - Perplexity Agent API: docs.perplexity.ai/api-reference/agent-post (Sonar chat completions ended 27 Sep 2026)
// - Anthropic models list: platform.claude.com/docs/en/api/models/list; Gemini models: ai.google.dev/api/models
// - SerpApi account: serpapi.com/account-api; Exa: exa.ai/docs/reference/search and /get-contents;
//   Tavily: docs.tavily.com/documentation/api-reference/endpoint/search, /extract, /usage;
//   Firecrawl v2: docs.firecrawl.dev/features/scrape, /features/search, /api-reference/endpoint/credit-usage
// - GPTZero: docs.gptzero.me/openapi/public.yaml (POST /v2/predict/text, GET /v3/usage-stats)
// - Originality.ai: docs.originality.ai/scan (POST /api/v3/scan, AI only), docs.originality.ai/credit-balance-copy-1
// - Pangram models (test only): docs.pangram.com; NewsAPI: newsapi.org/docs/endpoints/everything;
//   Apify: docs.apify.com/api/v2/users-me-get; Crunchbase: data.crunchbase.com/docs/api-essentials;
//   Calendly: developer.calendly.com/api-docs/calendly-api/users/get-current-user

var PRAX_TOOLS = (() => {
  const DEFAULT_MODEL = { claude: "claude-opus-5-5", openai: "gpt-5", gemini: "gemini-2.5-pro", grok: "grok-4", perplexity: "fast", mistral: "mistral-large-4", deepseek: "deepseek-flash", groq: "openai/gpt-oss-120b" };
  // OpenAI compatible chat completions: the base URL each vendor documents.
  const OPENAI_LIKE = { openai: "https://api.openai.com/v1", grok: "https://api.x.ai/v1", mistral: "https://api.mistral.ai/v1", deepseek: "https://api.deepseek.com", groq: "https://api.groq.com/openai/v1" };
  const WRITERS = Object.keys(DEFAULT_MODEL);
  const json = (method, url, headers, body) => ({ url, init: { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) } });
  const bearer = (key) => ({ authorization: "Bearer " + key });
  const anthropic = (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" });
  const num = (x) => (typeof x === "number" && isFinite(x) ? x : 0);

  // ---------- writing ----------
  function chatRequest(tool, key, model, system, user) {
    const m = model || DEFAULT_MODEL[tool];
    if (tool === "claude") return json("POST", "https://api.anthropic.com/v1/messages", { ...anthropic(key), "anthropic-beta": "server-side-fallback-2026-07-01" },
      { model: m, max_tokens: 4000, system, messages: [{ role: "user", content: user }], output_config: { effort: "medium" }, fallbacks: "default" });
    if (tool === "gemini") return json("POST", `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, { "x-goog-api-key": key },
      { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }] });
    if (tool === "perplexity") return json("POST", "https://api.perplexity.ai/v1/agent", bearer(key), { effort: m, instructions: system, input: user });
    const base = OPENAI_LIKE[tool];
    if (!base) throw new Error(`${tool} cannot write drafts.`);
    const body = { model: m, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
    // DeepSeek turns thinking on by default; plain drafts do not need it.
    if (tool === "deepseek") body.thinking = { type: "disabled" };
    return json("POST", base + "/chat/completions", bearer(key), body);
  }
  /** { text, input_tokens, output_tokens, cost } from a chat reply. cost is set only when the vendor reports it. */
  function mapChat(tool, j) {
    j = j || {};
    if (tool === "claude") {
      if (j.stop_reason === "refusal") throw new Error("The model declined this one. Try another mode.");
      return { text: (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join(""), input_tokens: num(j.usage?.input_tokens), output_tokens: num(j.usage?.output_tokens), cost: null };
    }
    if (tool === "gemini") return { text: (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join(""), input_tokens: num(j.usageMetadata?.promptTokenCount), output_tokens: num(j.usageMetadata?.candidatesTokenCount), cost: null };
    if (tool === "perplexity") return { text: String(j.output_text || ""), input_tokens: num(j.usage?.input_tokens), output_tokens: num(j.usage?.output_tokens), cost: typeof j.usage?.cost?.total_cost === "number" ? j.usage.cost.total_cost : null };
    const ticks = j.usage?.cost_in_usd_ticks;
    return { text: String(j.choices?.[0]?.message?.content || ""), input_tokens: num(j.usage?.prompt_tokens), output_tokens: num(j.usage?.completion_tokens), cost: typeof ticks === "number" ? ticks / 1e10 : null };
  }

  // ---------- Discovery search and fetch ----------
  function searchRequest(tool, key, query, n = 8) {
    if (tool === "exa") return json("POST", "https://api.exa.ai/search", { "x-api-key": key }, { query, numResults: n, type: "auto", contents: { text: { maxCharacters: 1200 } } });
    if (tool === "tavily") return json("POST", "https://api.tavily.com/search", bearer(key), { query, search_depth: "basic", topic: "news", max_results: n, include_usage: true });
    if (tool === "firecrawl") return json("POST", "https://api.firecrawl.dev/v2/search", bearer(key), { query, limit: n, sources: ["web", "news"] });
    throw new Error(`${tool} cannot search.`);
  }
  const notLinkedIn = (u) => !/(^|\.)linkedin\.com$/i.test((() => { try { return new URL(u).hostname; } catch { return "linkedin.com"; } })());
  /** { items: [{ url, title, date, summary }], cost, units }. LinkedIn links are dropped. */
  function mapSearch(tool, j) {
    j = j || {};
    let items = [], cost = null, units = 0;
    if (tool === "exa") {
      items = (j.results || []).map((r) => ({ url: r.url, title: r.title || "", date: r.publishedDate || "", summary: String(r.text || (r.highlights || []).join(" ") || "").slice(0, 1200) }));
      cost = typeof j.costDollars?.total === "number" ? j.costDollars.total : null;
    } else if (tool === "tavily") {
      items = (j.results || []).map((r) => ({ url: r.url, title: r.title || "", date: r.published_date || "", summary: String(r.content || "").slice(0, 1200) }));
      units = num(j.usage?.credits);
    } else if (tool === "firecrawl") {
      const d = j.data || {};
      items = [...(d.web || []).map((r) => ({ url: r.url, title: r.title || "", date: "", summary: r.description || "" })), ...(d.news || []).map((r) => ({ url: r.url, title: r.title || "", date: r.date || "", summary: r.snippet || "" }))];
      units = num(j.creditsUsed);
    }
    const seen = new Set();
    items = items.filter((x) => x.url && notLinkedIn(x.url) && !seen.has(x.url) && seen.add(x.url));
    return { items, cost, units };
  }
  function fetchRequest(tool, key, url) {
    if (!notLinkedIn(url)) throw new Error("Prax never reads LinkedIn pages with a data tool.");
    if (tool === "exa") return json("POST", "https://api.exa.ai/contents", { "x-api-key": key }, { ids: [url], text: { maxCharacters: 4000 } });
    if (tool === "tavily") return json("POST", "https://api.tavily.com/extract", bearer(key), { urls: [url], extract_depth: "basic", include_usage: true });
    if (tool === "firecrawl") return json("POST", "https://api.firecrawl.dev/v2/scrape", bearer(key), { url, formats: ["markdown"], onlyMainContent: true });
    throw new Error(`${tool} cannot read pages.`);
  }
  /** { url, title, text, published, cost, units } from a page read. */
  function mapFetch(tool, j, url) {
    j = j || {};
    if (tool === "exa") {
      const r = (j.results || [])[0];
      const st = (j.statuses || [])[0];
      if (!r || (st && st.status && st.status !== "success")) throw new Error("Exa could not read that page.");
      return { url: r.url || url, title: r.title || "", text: String(r.text || (r.highlights || []).join(" ") || "").slice(0, 4000), published: r.publishedDate || "", cost: typeof j.costDollars?.total === "number" ? j.costDollars.total : null, units: 0 };
    }
    if (tool === "tavily") {
      const r = (j.results || [])[0];
      if (!r) throw new Error(j.failed_results?.[0]?.error || "Tavily could not read that page.");
      return { url: r.url || url, title: "", text: String(r.raw_content || "").slice(0, 4000), published: "", cost: null, units: num(j.usage?.credits) };
    }
    if (tool === "firecrawl") {
      if (j.success === false || !j.data) throw new Error(j.error || "Firecrawl could not read that page.");
      const m = j.data.metadata || {};
      return { url: m.sourceURL || url, title: m.title || m.ogTitle || "", text: String(j.data.markdown || "").slice(0, 4000), published: "", cost: null, units: 1 };
    }
    throw new Error(`${tool} cannot read pages.`);
  }

  // ---------- detectors (the humanization check) ----------
  function detectRequest(tool, key, text) {
    if (tool === "gptzero") return json("POST", "https://api.gptzero.me/v2/predict/text", { "x-api-key": key }, { document: text });
    if (tool === "originality") return json("POST", "https://api.originality.ai/api/v3/scan", { "X-OAI-API-KEY": key },
      { title: "Prax check", content: text, check_ai: true, check_plagiarism: false, check_facts: false, check_readability: false, check_grammar: false, check_contentOptimizer: false, storeScan: false });
    throw new Error(`${tool} is not a detector here.`);
  }
  /** Only the fields Prax maps (src/lib/humanize.ts) go on to Prax, never the text echoed back. */
  function slimDetect(tool, j) {
    j = j || {};
    if (tool === "gptzero") {
      const d = (j.documents || [])[0] || {};
      return { predicted_class: d.predicted_class, class_probabilities: d.class_probabilities, confidence_category: d.confidence_category, result_message: d.result_message, version: j.version,
        sentences: (d.sentences || []).map((s) => ({ sentence: s.sentence, generated_prob: s.generated_prob })) };
    }
    if (tool === "originality") {
      const a = j.results?.ai || {};
      return { prediction_label: a.prediction_label, ai_assisted_percent: a.ai_assisted_percent, model: a.model, credits: j.results?.credits?.used, sentences: (a.sentences || []).map((s) => ({ text: s.text, ai_score: s.ai_score, start_index: s.start_index, end_index: s.end_index })) };
    }
    return j;
  }

  // ---------- Test connection: the cheapest documented call for each tool ----------
  function testRequest(tool, key) {
    switch (tool) {
      case "claude": return json("GET", "https://api.anthropic.com/v1/models?limit=100", anthropic(key));
      case "gemini": case "gemini_images": return json("GET", "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100", { "x-goog-api-key": key });
      case "openai_images": return json("GET", OPENAI_LIKE.openai + "/models", bearer(key));
      case "perplexity": return json("POST", "https://api.perplexity.ai/v1/agent", bearer(key), { effort: "fast", input: "Reply with the word OK.", max_output_tokens: 5 });
      case "serpapi": return json("GET", "https://serpapi.com/account.json?api_key=" + encodeURIComponent(key), {});
      case "exa": return json("POST", "https://api.exa.ai/contents", { "x-api-key": key }, { ids: ["https://exa.ai"], text: { maxCharacters: 200 } });
      case "tavily": return json("GET", "https://api.tavily.com/usage", bearer(key));
      case "firecrawl": return json("GET", "https://api.firecrawl.dev/v2/team/credit-usage", bearer(key));
      case "gptzero": return json("GET", "https://api.gptzero.me/v3/usage-stats", { "x-api-key": key });
      case "originality": return json("GET", "https://api.originality.ai/api/v3/account/balance", { "X-OAI-API-KEY": key });
      case "pangram": return json("GET", "https://text.external-api.pangram.com/models", { "x-api-key": key });
      case "newsapi": return json("GET", "https://newsapi.org/v2/everything?q=bank&pageSize=1", { "X-Api-Key": key });
      case "apify": return json("GET", "https://api.apify.com/v2/users/me", bearer(key));
      case "crunchbase": return json("GET", "https://api.crunchbase.com/v4/data/entities/organizations/crunchbase?field_ids=short_description", { "X-cb-user-key": key });
      case "calendly": return json("GET", "https://api.calendly.com/users/me", bearer(key));
      default:
        if (OPENAI_LIKE[tool]) return json("GET", OPENAI_LIKE[tool] + "/models", bearer(key));
        throw new Error("This tool has no test call yet.");
    }
  }
  const n = (x) => Number(x || 0).toLocaleString("en-GB");
  /** One plain line for a passed test. Never repeats the key or any account secret (SerpApi echoes the key). */
  function mapTest(tool, j) {
    j = j || {};
    switch (tool) {
      case "claude": return `Key works. ${(j.data || []).length} models available.`;
      case "gemini": case "gemini_images": return `Key works. ${(j.models || []).length} models available.`;
      case "perplexity": return "Key works. A one word test reply came back.";
      case "serpapi": return `Key works. ${j.plan_name || "Plan"}, ${n(j.total_searches_left ?? j.plan_searches_left)} searches left this month.`;
      case "exa": return `Key works. One page read${typeof j.costDollars?.total === "number" ? ` for $${j.costDollars.total.toFixed(3)}` : ""}.`;
      case "tavily": return `Key works. ${n(j.key?.usage)} of ${j.key?.limit ? n(j.key.limit) : "unlimited"} credits used${j.account?.current_plan ? ` on ${j.account.current_plan}` : ""}.`;
      case "firecrawl": return `Key works. ${n(j.data?.remainingCredits)} credits left this period.`;
      case "gptzero": return `Key works. ${j.data?.words_left == null ? "Enterprise plan" : `${n(j.data.words_left)} words left`}${j.data?.plan ? ` on ${j.data.plan}` : ""}.`;
      case "originality": return `Key works. ${n(j.credits)} credits left.`;
      case "pangram": return "Key works. Pangram answered.";
      case "newsapi": return `Key works. ${n(j.totalResults)} articles match a test search.`;
      case "apify": return `Key works. Signed in as ${j.data?.username || "your account"}.`;
      case "crunchbase": return "Key works. Crunchbase answered.";
      case "calendly": return `Key works. Signed in as ${j.resource?.name || "your account"}.`;
      default: return `Key works. ${(j.data || []).length} models available.`;
    }
  }
  /** The vendor's own error words, cut short, never with the key. */
  function errorOf(tool, status, j) {
    const raw = (j && (j.error?.message || (typeof j.error === "string" ? j.error : "") || j.message || j.detail || j.errors?.[0]?.message)) || "";
    const msg = String(typeof raw === "string" ? raw : JSON.stringify(raw)).slice(0, 240);
    const words = { 401: "did not accept the key", 403: "refused this key", 402: "has no credits left", 429: "is rate limiting this key" }[status];
    return msg ? `${msg}` : words ? `The service ${words}.` : `The service returned ${status}.`;
  }

  // ---------- routes ----------
  const KEYLESS = ["prax_reader", "prax_rewrite"];
  /** Same rule as resolveRoute in src/lib/connections.ts: primary if it has a key and is under its cap, else fallback. */
  function resolve(route, ready, blocked) {
    const order = [route && route.primary, route && route.fallback].filter((t, i, a) => !!t && a.indexOf(t) === i);
    for (const t of order) if ((KEYLESS.includes(t) || ready(t)) && !(blocked && blocked(t))) return { tool: t, usedFallback: t !== route.primary, reason: "", order };
    if (!order.length) return { tool: null, usedFallback: false, reason: "none", order };
    return { tool: null, usedFallback: false, reason: order.some((t) => KEYLESS.includes(t) || ready(t)) ? "cap" : "no-key", order };
  }
  /** The key a tool uses: a separate key for this job (Advanced), the tool's own, then the older slots (main key, checkers). */
  const SHARES = { openai_images: "openai", gemini_images: "gemini" };
  function keyOf(c, tool, job) {
    const t = SHARES[tool] || tool;
    if (job && c.jobKeys && c.jobKeys[job] && c.jobKeys[job].tool === t && c.jobKeys[job].key) return c.jobKeys[job].key;
    if (t === "pangram" || t === "walter") return (c.checkers && c.checkers[t]) || "";
    return (c.keys && c.keys[t]) || ((c.provider || "claude") === t ? c.apiKey || "" : "") || "";
  }

  return { DEFAULT_MODEL, WRITERS, OPENAI_LIKE, chatRequest, mapChat, searchRequest, mapSearch, fetchRequest, mapFetch, detectRequest, slimDetect, testRequest, mapTest, errorOf, resolve, keyOf, notLinkedIn };
})();
if (typeof module !== "undefined") module.exports = PRAX_TOOLS;
