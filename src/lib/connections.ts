// Connections (C1, Q135 to Q141, db/032): the one catalog of tools Prax can use, the jobs they do, how a job is routed
// to a tool with a fallback, and how usage adds up by tool, job and section. Pure data and maths, shared by the
// Connections pages, the other sections' "Using X · change" lines, the extension door (src/app/api/ext) and
// scripts/test-connections.ts. extension/tools.js holds the request side of each wired tool and the same route rule.
//
// Rules:
// - Keys live only in the extension (chrome.storage). A page knows only whether one is saved (ExtStatus.tools).
// - A card says whether Prax uses the tool today, from the real routes: "Connected · used by 2 jobs",
//   "Connected · not used by any job yet" or "Not connected". Never "connected" without a key in this browser.
// - Data tools read web pages, news and company data only. Nothing in Prax reads or crawls LinkedIn.

// ---------- sections, jobs, Prax sections ----------
export type SectionId = "writing" | "citations" | "humanize" | "data" | "media" | "meetings" | "mcp";
export const SECTIONS: { id: SectionId; name: string; sub: string }[] = [
  { id: "writing", name: "AI writing models", sub: "Write comments, posts, articles and replies in the profile's voice." },
  { id: "citations", name: "AI citations engines", sub: "Where AI citations asks buyer questions. The writing models above answer with web search on." },
  { id: "humanize", name: "Humanization and detection", sub: "Judge whether a final draft reads as written by a person, and fix it." },
  { id: "data", name: "Data and discovery", sub: "Web, news and company data for Discovery Studio. Never LinkedIn." },
  { id: "media", name: "Images and video", sub: "Images for posts in Content Studio." },
  { id: "meetings", name: "Meetings", sub: "Booking calls with people from the Pipeline." },
  { id: "mcp", name: "Prax MCP", sub: "Prax itself as a tool for other AI apps." },
];

export type JobId = "comment" | "post" | "analysis" | "discovery_search" | "discovery_fetch" | "citations" | "humanize_check" | "humanize_rewrite" | "image";
export type Job = { id: JobId; name: string; sub: string; where: string; tools: string[]; primary: string; fallback: string; routed: boolean };
/** Built-in options that are not catalog cards: Prax's own page reader and Prax's own sentence rewrite. */
export const BUILT_IN: Record<string, { name: string; sub: string }> = {
  prax_reader: { name: "Prax page reader", sub: "Built in and free. Reads public pages on the Prax server." },
  prax_rewrite: { name: "Prax rewrite", sub: "Built in. Rewrites only the flagged sentences with the writing model." },
};
const WRITERS = ["claude", "openai", "gemini", "perplexity", "mistral", "deepseek", "groq", "grok"];
export const JOBS: Job[] = [
  { id: "comment", name: "Comment drafts", sub: "Comments, replies, connection notes and messages", where: "LinkedIn bar, Comment Studio, Inbox, Pipeline", tools: WRITERS, primary: "", fallback: "", routed: true },
  { id: "post", name: "Post and article drafts", sub: "Posts, articles, campaigns and first comments", where: "Content Studio", tools: WRITERS, primary: "", fallback: "", routed: true },
  { id: "analysis", name: "Scoring and analysis", sub: "Discovery scores, AI citations reviews, Network topics, voice analysis", where: "Discovery Studio, AI citations, Network, Comment Studio", tools: WRITERS, primary: "", fallback: "", routed: true },
  { id: "discovery_search", name: "Discovery search", sub: "Finds fresh news and pages for the profile's pillars", where: "Discovery Studio", tools: ["exa", "tavily", "firecrawl"], primary: "", fallback: "", routed: true },
  { id: "discovery_fetch", name: "Discovery fetch", sub: "Reads each found page to confirm its date", where: "Discovery Studio", tools: ["prax_reader", "firecrawl", "exa", "tavily"], primary: "prax_reader", fallback: "", routed: true },
  { id: "citations", name: "AI citations", sub: "Asks buyer questions on the engines ticked in AI citations", where: "AI citations", tools: ["claude", "openai", "gemini", "perplexity", "serpapi"], primary: "", fallback: "", routed: false },
  { id: "humanize_check", name: "Humanization check", sub: "Judges the final text before it goes out", where: "Comment Studio, LinkedIn bar, Content Studio", tools: ["pangram", "gptzero", "originality"], primary: "pangram", fallback: "", routed: true },
  { id: "humanize_rewrite", name: "Humanization rewrite", sub: "Fixes text that failed after Prax's own two rounds", where: "Content Studio, Comment Studio", tools: ["prax_rewrite", "walter"], primary: "prax_rewrite", fallback: "walter", routed: true },
  { id: "image", name: "Images", sub: "Images for posts from a short brief", where: "Content Studio", tools: ["openai_images", "gemini_images"], primary: "openai_images", fallback: "gemini_images", routed: true },
];
export const jobOf = (id: string) => JOBS.find((j) => j.id === id) ?? null;

/** Where in Prax a call came from. The humanize sections (db/031) are the first four. */
export const APP_SECTIONS: Record<string, string> = {
  comment_studio: "Comment Studio", linkedin_bar: "LinkedIn bar", content_write: "Content Studio, write", content_editor: "Content Studio, editor",
  content_studio: "Content Studio", discovery: "Discovery Studio", citations: "AI citations", inbox: "Inbox", pipeline: "Pipeline", network: "Network",
  side_panel: "Side panel", connections: "Connections", "": "Other",
};
export const sectionName = (s: string) => APP_SECTIONS[s] ?? APP_SECTIONS[""];
export const APP_SECTION_IDS = Object.keys(APP_SECTIONS).filter(Boolean);

// ---------- the catalog ----------
export type Unit = "tokens" | "searches" | "credits" | "words" | "images" | "calls";
export type Tool = {
  id: string; name: string; short: string; section: SectionId;
  /** One line on the card. */
  purpose: string;
  /** The tool page's opening paragraph. */
  about: string;
  /** What Prax does with it, in plain words. */
  uses: string[];
  /** Jobs it can be routed to. Empty for listed-only tools. */
  jobs: JobId[];
  /** For tools Prax cannot use yet: what they will be used for. */
  later?: string;
  /** Where the key is stored: another tool's key (OpenAI Images uses the OpenAI key). */
  sharesKey?: string;
  keyHint?: string;
  console?: string;
  docs: string;
  model?: string;
  mcp?: { url: string; auth: string; docs: string };
  /** The cheap call behind Test connection, in words; empty when there is none. */
  test: string;
  unit: Unit;
  price: string;
  priceUrl?: string;
  beta?: boolean;
  /** Not available to connect yet (Prax MCP). */
  coming?: boolean;
  /** Connected through another product's account, not an API key. */
  oauthOnly?: boolean;
};

export const TOOLS: Tool[] = [
  // AI writing models
  { id: "claude", name: "Anthropic Claude", short: "Claude", section: "writing", purpose: "Writes drafts in the profile's voice and answers buyer questions with web search.",
    about: "Anthropic's Claude models through the Messages API. Prax's default writer: comments, posts and articles follow the voice and house rules saved in Settings.",
    uses: ["Comment drafts on LinkedIn and in Comment Studio", "Posts, articles and campaign plans in Content Studio", "AI citations answers with web search on", "Discovery scoring and AI citations reviews"],
    jobs: ["comment", "post", "analysis", "citations"], keyHint: "sk-ant-", console: "https://console.anthropic.com", docs: "https://platform.claude.com/docs/en/api/overview", model: "claude-opus-5-5",
    test: "Lists the models this key can use (free).", unit: "tokens", price: "Per million tokens, from the model's list price", priceUrl: "https://www.anthropic.com/pricing" },
  { id: "openai", name: "OpenAI", short: "OpenAI", section: "writing", purpose: "GPT models for drafts, analysis and AI citations answers.",
    about: "OpenAI's GPT models through Chat Completions for drafts and the Responses API with web search for AI citations.",
    uses: ["Comment, post and article drafts", "AI citations answers with web search on", "Scoring and analysis"],
    jobs: ["comment", "post", "analysis", "citations"], keyHint: "sk-", console: "https://platform.openai.com/usage", docs: "https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create", model: "gpt-5",
    test: "Lists the models this key can use (free).", unit: "tokens", price: "Per million tokens; gpt-6-luna from $0.10 in and $0.50 out", priceUrl: "https://developers.openai.com/api/docs/pricing" },
  { id: "gemini", name: "Google Gemini", short: "Gemini", section: "writing", purpose: "Gemini models for drafts, analysis and Google-grounded answers.",
    about: "Google's Gemini models through the Gemini API (generateContent), and Google Search grounding for AI citations.",
    uses: ["Comment, post and article drafts", "AI citations answers grounded in Google Search", "Scoring and analysis"],
    jobs: ["comment", "post", "analysis", "citations"], keyHint: "AIza", console: "https://aistudio.google.com", docs: "https://ai.google.dev/api/models", model: "gemini-2.5-pro",
    test: "Lists the models this key can use (free).", unit: "tokens", price: "Per million tokens, from the model's list price", priceUrl: "https://ai.google.dev/gemini-api/docs/pricing" },
  { id: "perplexity", name: "Perplexity", short: "Perplexity", section: "writing", purpose: "Answers with live web sources; drafts through the Agent API.",
    about: "Perplexity's Agent API (POST /v1/agent) with the fast effort level for drafts, and Sonar answers with sources for AI citations. Perplexity reports the cost of each call.",
    uses: ["AI citations answers with cited sources", "Drafts and analysis when routed here"],
    jobs: ["comment", "post", "analysis", "citations"], keyHint: "pplx-", console: "https://www.perplexity.ai/account/api", docs: "https://docs.perplexity.ai/api-reference/agent-post", model: "fast",
    mcp: { url: "https://api.perplexity.ai/mcp", auth: "OAuth, or Authorization: Bearer with the API key", docs: "https://docs.perplexity.ai/docs/getting-started/integrations/mcp-server" },
    test: "Asks for a one word reply with the fast effort level (a fraction of a cent). Perplexity has no free key check.", unit: "tokens", price: "Per call, as Perplexity reports it", priceUrl: "https://docs.perplexity.ai/docs/getting-started/pricing" },
  { id: "mistral", name: "Mistral AI", short: "Mistral", section: "writing", purpose: "European models for drafts and analysis at a low price.",
    about: "Mistral AI's chat completions API. Mistral Large 4 by default; any model id from Mistral's models page can be set.",
    uses: ["Comment, post and article drafts when routed here", "Scoring and analysis at a lower cost"],
    jobs: ["comment", "post", "analysis"], console: "https://console.mistral.ai/api-keys", docs: "https://docs.mistral.ai/api/endpoint/chat", model: "mistral-large-4",
    test: "Lists the models this key can use (free).", unit: "tokens", price: "Mistral Large 4: $0.70 in and $2.10 out per million tokens", priceUrl: "https://docs.mistral.ai/inference/pricing" },
  { id: "deepseek", name: "DeepSeek", short: "DeepSeek", section: "writing", purpose: "Low cost models for drafts and analysis.",
    about: "DeepSeek's OpenAI compatible chat API with deepseek-flash, thinking turned off for plain drafts. Prices halve off peak.",
    uses: ["Scoring and analysis at the lowest cost", "Drafts when routed here"],
    jobs: ["comment", "post", "analysis"], keyHint: "sk-", console: "https://platform.deepseek.com/api_keys", docs: "https://api-docs.deepseek.com/api/create-chat-completion", model: "deepseek-flash",
    test: "Lists the models this key can use (free).", unit: "tokens", price: "deepseek-flash: $0.30 in and $1.20 out per million tokens at peak", priceUrl: "https://api-docs.deepseek.com/quick_start/pricing" },
  { id: "groq", name: "Groq", short: "Groq", section: "writing", purpose: "Very fast open models for quick drafts and scoring.",
    about: "Groq's OpenAI compatible API running open models such as gpt-oss-120b at high speed.",
    uses: ["Fast scoring and analysis", "Drafts when routed here"],
    jobs: ["comment", "post", "analysis"], keyHint: "gsk_", console: "https://console.groq.com/keys", docs: "https://console.groq.com/docs/openai", model: "openai/gpt-oss-120b",
    test: "Lists the models this key can use (free).", unit: "tokens", price: "gpt-oss-120b: $0.15 in and $0.60 out per million tokens", priceUrl: "https://console.groq.com/docs/models" },
  { id: "grok", name: "xAI Grok", short: "Grok", section: "writing", purpose: "Grok models for drafts and analysis.",
    about: "xAI's chat completions API. xAI reports the cost of each call, which Prax records.",
    uses: ["Comment, post and article drafts when routed here", "Scoring and analysis"],
    jobs: ["comment", "post", "analysis"], keyHint: "xai-", console: "https://console.x.ai", docs: "https://docs.x.ai/developers/rest-api-reference/inference/chat-completions", model: "grok-4",
    test: "Lists the models this key can use (free).", unit: "tokens", price: "Per million tokens, as xAI reports it", priceUrl: "https://docs.x.ai/docs/models" },
  // AI citations engines
  { id: "serpapi", name: "SerpApi", short: "SerpApi", section: "citations", purpose: "Reads Google AI answers and Microsoft Copilot answers for AI citations.",
    about: "Google AI Overviews and Copilot have no answer API, so Prax reads them from search results through SerpApi with your key. One key serves both engines.",
    uses: ["Google AI answers in AI citations", "Microsoft Copilot answers in AI citations"],
    jobs: ["citations"], console: "https://serpapi.com/manage-api-key", docs: "https://serpapi.com/ai-overview",
    mcp: { url: "https://mcp.serpapi.com/mcp", auth: "Authorization: Bearer with the API key", docs: "https://github.com/serpapi/serpapi-mcp" },
    test: "Reads the account's plan and searches left (free, not counted).", unit: "searches", price: "Monthly plans; the free plan has 250 searches", priceUrl: "https://serpapi.com/pricing" },
  // Humanization and detection
  { id: "pangram", name: "Pangram", short: "Pangram", section: "humanize", purpose: "Judges whether final drafts read as human. The default checker.",
    about: "Pangram's AI detection API checks only the chosen, final text: on copy, save, log or send for approval, and never the same text twice. Levels and caps are set in Settings, Humanization.",
    uses: ["The badge on comments", "The gate before posts and articles go for approval"],
    jobs: ["humanize_check"], console: "https://www.pangram.com/dashboard", docs: "https://docs.pangram.com/api-reference/introduction",
    test: "Lists the detection models (free).", unit: "words", price: "Per 100 words, from your plan (set in Settings, Humanization)", priceUrl: "https://www.pangram.com/pricing" },
  { id: "walter", name: "Walter AI", short: "Walter", section: "humanize", purpose: "Optional second fixer when Prax's own two rewrite rounds still fail.", beta: true,
    about: "Walter AI rewrites text to read as human. Prax calls it only after Pangram fails and both of Prax's own rounds fail, and only once its API is confirmed (early access).",
    uses: ["A last rewrite for posts and articles that still fail the check"],
    jobs: ["humanize_rewrite"], console: "https://walterwrites.ai/api/", docs: "https://walterwrites.ai",
    test: "", unit: "words", price: "Per 100 words, from your plan" },
  { id: "gptzero", name: "GPTZero", short: "GPTZero", section: "humanize", purpose: "An alternative AI detector to Pangram.",
    about: "GPTZero's text prediction API. Route the humanization check here instead of Pangram; Prax reads the human probability and the sentences GPTZero flags.",
    uses: ["The humanization check, when routed here"],
    jobs: ["humanize_check"], console: "https://app.gptzero.me/app/api", docs: "https://docs.gptzero.me/openapi/public.yaml",
    test: "Reads words used and words left this cycle (free).", unit: "words", price: "About $0.00046 a word over plan (GPTZero support)", priceUrl: "https://gptzero.me/pricing" },
  { id: "originality", name: "Originality.ai", short: "Originality", section: "humanize", purpose: "An alternative AI detector to Pangram (Enterprise API).",
    about: "Originality.ai's scan API with the AI check only (no plagiarism check). Its API needs the Enterprise plan; 1 credit covers 100 words.",
    uses: ["The humanization check, when routed here"],
    jobs: ["humanize_check"], console: "https://app.originality.ai/home/api", docs: "https://docs.originality.ai/scan",
    test: "Reads the credits left (free).", unit: "credits", price: "1 credit per 100 words", priceUrl: "https://originality.ai/pricing" },
  // Data and discovery
  { id: "exa", name: "Exa", short: "Exa", section: "data", purpose: "Search built for AI: fresh pages with their text and dates.",
    about: "Exa's search and contents APIs. Prax uses them for Discovery search and to read found pages. Each reply states its cost, which Prax records.",
    uses: ["Discovery search for the profile's pillars", "Reading found pages to confirm the date"],
    jobs: ["discovery_search", "discovery_fetch"], console: "https://dashboard.exa.ai/api-keys", docs: "https://exa.ai/docs/reference/search",
    mcp: { url: "https://mcp.exa.ai/mcp", auth: "x-api-key header, or OAuth", docs: "https://exa.ai/docs/get-started/exa-mcp" },
    test: "Reads one public page (about $0.001). Exa has no free key check.", unit: "calls", price: "Search $7 per 1,000; contents $1 per 1,000 pages", priceUrl: "https://exa.ai/docs/admin/pricing" },
  { id: "tavily", name: "Tavily", short: "Tavily", section: "data", purpose: "Web search and page extraction for Discovery.",
    about: "Tavily's search and extract APIs. A basic search is 1 credit; extracting 5 pages is 1 credit.",
    uses: ["Discovery search", "Reading found pages"],
    jobs: ["discovery_search", "discovery_fetch"], keyHint: "tvly-", console: "https://app.tavily.com", docs: "https://docs.tavily.com/documentation/api-reference/endpoint/search",
    mcp: { url: "https://mcp.tavily.com/mcp/", auth: "API key as the tavilyApiKey query value", docs: "https://docs.tavily.com/documentation/mcp" },
    test: "Reads the key's credit use (free).", unit: "credits", price: "$0.008 a credit pay as you go; 1,000 free a month", priceUrl: "https://docs.tavily.com/documentation/api-credits" },
  { id: "firecrawl", name: "Firecrawl", short: "Firecrawl", section: "data", purpose: "Turns any public page into clean text; also searches the web.",
    about: "Firecrawl's v2 scrape and search APIs. Scrape is 1 credit a page; search is 2 credits per 10 results.",
    uses: ["Reading found pages that block simple readers", "Discovery search"],
    jobs: ["discovery_search", "discovery_fetch"], keyHint: "fc-", console: "https://www.firecrawl.dev/app/api-keys", docs: "https://docs.firecrawl.dev/features/scrape",
    mcp: { url: "https://mcp.firecrawl.dev/v2/mcp", auth: "Authorization: Bearer with the API key, or OAuth", docs: "https://docs.firecrawl.dev/mcp-server" },
    test: "Reads the credits left this billing period (free).", unit: "credits", price: "1,000 free credits a month; Hobby $19 for 5,000", priceUrl: "https://www.firecrawl.dev/pricing" },
  { id: "newsapi", name: "NewsAPI", short: "NewsAPI", section: "data", purpose: "Headlines and articles from news sources.", jobs: [],
    about: "NewsAPI.org's article search. Its free Developer plan allows requests only from localhost, with a 24 hour delay, so the extension cannot call it on that plan.",
    later: "News for Discovery Studio's pillars, on a paid NewsAPI plan that allows browser requests.",
    uses: ["Planned: news for Discovery Studio"], console: "https://newsapi.org/account", docs: "https://newsapi.org/docs/endpoints/everything",
    test: "Asks for one headline. On the free plan NewsAPI refuses browser requests.", unit: "calls", price: "Developer $0 (localhost only); paid plans from $449 a month", priceUrl: "https://newsapi.org/pricing" },
  { id: "crunchbase", name: "Crunchbase", short: "Crunchbase", section: "data", purpose: "Company facts: funding, people and size.", jobs: [],
    about: "Crunchbase's v4 Data API. REST access is for approved developers through Crunchbase's data licensing team, and a key covers only the fields licensed.",
    later: "Company facts for Pipeline leads and Discovery targets.",
    uses: ["Planned: company facts on Pipeline leads"], console: "https://data.crunchbase.com/docs/api-essentials", docs: "https://data.crunchbase.com/docs/api-essentials",
    mcp: { url: "https://mcp.crunchbase.com", auth: "OAuth 2.1 with a Crunchbase account", docs: "https://data.crunchbase.com/docs/getting-started-with-mcp" },
    test: "Reads Crunchbase's own company record.", unit: "calls", price: "By licence, from Crunchbase" },
  { id: "apify", name: "Apify", short: "Apify", section: "data", purpose: "Ready-made web data actors for public sites.", jobs: [],
    about: "Apify runs ready-made scrapers (actors) for public websites. Prax will only ever run actors for news and company sites, never for LinkedIn.",
    later: "Scheduled reads of public news and regulator pages that have no feed.",
    uses: ["Planned: public news and regulator pages for Discovery"], console: "https://console.apify.com/settings/integrations", docs: "https://docs.apify.com/api/v2",
    mcp: { url: "https://mcp.apify.com", auth: "OAuth, or Authorization: Bearer with the API token", docs: "https://docs.apify.com/platform/integrations/mcp" },
    test: "Reads the account (free).", unit: "calls", price: "Free plan with $5 of use a month", priceUrl: "https://apify.com/pricing" },
  // Images and video
  { id: "openai_images", name: "OpenAI Images", short: "OpenAI Images", section: "media", purpose: "Images for posts from a short brief.", sharesKey: "openai",
    about: "OpenAI's image generation API. Uses the same OpenAI key as the writing model; the image comes back to the page and is not stored by Prax until you save it.",
    uses: ["Post images in Content Studio, Write a post"], jobs: ["image"], docs: "https://developers.openai.com/api/reference/resources/images/methods/generate", model: "gpt-image-2.5-flare",
    test: "Lists the models this key can use (free).", unit: "images", price: "Per image, from the model's list price", priceUrl: "https://developers.openai.com/api/docs/pricing" },
  { id: "gemini_images", name: "Gemini Images", short: "Gemini Images", section: "media", purpose: "Images for posts with Gemini's image model.", sharesKey: "gemini",
    about: "Gemini's image model through generateContent. Uses the same Google key as the Gemini writing model.",
    uses: ["Post images in Content Studio, Write a post"], jobs: ["image"], docs: "https://ai.google.dev/gemini-api/docs/image-generation", model: "gemini-2.5-flash-image",
    test: "Lists the models this key can use (free).", unit: "images", price: "About $0.039 an image", priceUrl: "https://ai.google.dev/gemini-api/docs/pricing" },
  // Meetings
  { id: "calendly", name: "Calendly", short: "Calendly", section: "meetings", purpose: "Booking links and booked calls.", jobs: [],
    about: "Calendly's API with a personal access token. Prax will read booked calls; it never books or sends anything for you.",
    later: "Show booked calls on Pipeline leads and move a lead to Call booked when a call is booked.",
    uses: ["Planned: booked calls on Pipeline leads"], console: "https://calendly.com/integrations/api_webhooks", docs: "https://developer.calendly.com/docs/authentication/how-to-authenticate-with-personal-access-tokens",
    mcp: { url: "https://mcp.calendly.com", auth: "OAuth 2.1 with PKCE (no key)", docs: "https://developer.calendly.com/docs/mcp/calendly-mcp-server" },
    test: "Reads the token's own user (free).", unit: "calls", price: "Included in Calendly plans" },
  // Prax MCP
  { id: "prax_mcp", name: "Prax MCP", short: "Prax MCP", section: "mcp", purpose: "Use Prax from Claude, ChatGPT or any MCP app.", jobs: [], coming: true,
    about: "A Model Context Protocol server for Prax, so an AI app you already use can read this profile's plan, drafts and Pipeline and save drafts back for your approval. It will never post, comment or send on LinkedIn.",
    later: "Read the plan, Today and the Pipeline; draft posts and comments into Prax for approval; never act on LinkedIn.",
    uses: ["Coming later: ask Claude for this week's plan", "Coming later: save a draft from ChatGPT into Content Studio for approval"],
    docs: "https://modelcontextprotocol.io/specification/latest/basic/transports",
    mcp: { url: "Coming later", auth: "OAuth 2.1, per the MCP authorization spec", docs: "https://modelcontextprotocol.io/specification/latest/basic/authorization" },
    test: "", unit: "calls", price: "Free" },
];
export const toolOf = (id: string) => TOOLS.find((t) => t.id === id) ?? null;
export const toolName = (id: string, short = false) => { const t = toolOf(id); if (t) return short ? t.short : t.name; return BUILT_IN[id]?.name ?? id; };
/** The extension key slot a tool reads: its own, or the tool it shares a key with. */
export const keyTool = (id: string) => toolOf(id)?.sharesKey ?? id;
/** Tools that can be connected with a key (everything but Prax MCP). */
export const connectable = (t: Tool) => !t.coming;

// ---------- routes ----------
export type Route = { primary: string; fallback: string };
export type Routes = Partial<Record<JobId, Route>>;
export type Settings = { routes: Routes; caps: Caps; advanced: Partial<Record<JobId, boolean>> };
export const EMPTY_SETTINGS: Settings = { routes: {}, caps: {}, advanced: {} };
/** A connection_settings row (db/032) cleaned: only known jobs and tools, a fallback never equal to its primary, caps > 0. */
export function mergeConnSettings(row: { routes?: unknown; caps?: unknown; advanced?: unknown } | null | undefined): Settings {
  const routes: Routes = {}, caps: Caps = {}, advanced: Settings["advanced"] = {};
  const r = (row?.routes ?? {}) as Record<string, { primary?: unknown; fallback?: unknown }>;
  for (const j of JOBS) {
    const x = r[j.id];
    if (!x || typeof x !== "object") continue;
    const p = String(x.primary ?? ""), f = String(x.fallback ?? "");
    if (!j.tools.includes(p)) continue;
    routes[j.id] = { primary: p, fallback: j.tools.includes(f) && f !== p ? f : "" };
  }
  const c = (row?.caps ?? {}) as Record<string, { limit?: unknown; unit?: unknown }>;
  for (const [id, x] of Object.entries(c)) {
    const limit = Number(x?.limit);
    if (!toolOf(id) || !(limit > 0)) continue;
    caps[id] = { limit, unit: x?.unit === "calls" ? "calls" : x?.unit === "words" ? "words" : "usd" };
  }
  const a = (row?.advanced ?? {}) as Record<string, unknown>;
  for (const j of JOBS) if (a[j.id] === true) advanced[j.id] = true;
  return { routes, caps, advanced };
}
/** Tools that need no key in the extension. */
export const KEYLESS = new Set(["prax_reader", "prax_rewrite"]);

/** The saved route, or the job's default. Writing jobs default to the drafting model already chosen in this browser. */
export function routeFor(job: JobId, routes: Routes, legacyWriter = "claude"): Route {
  const j = jobOf(job)!;
  const r = routes[job];
  const ok = (t: string | undefined) => !!t && j.tools.includes(t);
  const primary = ok(r?.primary) ? r!.primary : j.primary || (j.tools.includes(legacyWriter) ? legacyWriter : j.tools[0]);
  const fallback = ok(r?.fallback) && r!.fallback !== primary ? r!.fallback : r ? "" : j.fallback !== primary ? j.fallback : "";
  return { primary, fallback };
}

export type Resolved = { tool: string | null; usedFallback: boolean; reason: "" | "no-key" | "cap" | "none"; order: string[] };
/**
 * Which tool runs the job now: the primary when it has a key and is under its cap, else the fallback, else none.
 * extension/tools.js resolve() is the same rule (scripts/test-connections.ts runs both on the same cases).
 */
export function resolveRoute(route: Route, ready: (t: string) => boolean, blocked: (t: string) => boolean = () => false): Resolved {
  const order = [route.primary, route.fallback].filter((t, i, a) => !!t && a.indexOf(t) === i);
  for (const t of order) if ((KEYLESS.has(t) || ready(t)) && !blocked(t)) return { tool: t, usedFallback: t !== route.primary, reason: "", order };
  if (!order.length) return { tool: null, usedFallback: false, reason: "none", order };
  return { tool: null, usedFallback: false, reason: order.some((t) => KEYLESS.has(t) || ready(t)) ? "cap" : "no-key", order };
}

/** Jobs a tool is the primary or the fallback for, in the saved routes (with defaults). */
export function jobsUsing(tool: string, routes: Routes, legacyWriter = "claude", citationEngines: string[] = []): JobId[] {
  return JOBS.filter((j) => {
    if (!j.routed) return citationEngines.includes(tool) || (tool === "serpapi" && citationEngines.some((e) => e === "google_ai" || e === "copilot"));
    const r = routeFor(j.id, routes, legacyWriter);
    return r.primary === tool || r.fallback === tool;
  }).map((j) => j.id);
}

export type CardState = { connected: boolean; jobs: JobId[]; line: string };
/** The honest status line on a card. */
export function cardState(t: Tool, connected: boolean, jobs: JobId[]): CardState {
  if (t.coming) return { connected: false, jobs: [], line: "Coming later" };
  if (!connected) return { connected, jobs, line: "Not connected" };
  if (!jobs.length) return { connected, jobs, line: "Connected · not used by any job yet" };
  return { connected, jobs, line: `Connected · used by ${jobs.length} ${jobs.length === 1 ? "job" : "jobs"}` };
}

// ---------- usage ----------
export type ExtUsageRow = { id?: number | string; at: string; kind: string; provider: string; model: string; input_tokens: number; output_tokens: number; job?: string | null; section?: string | null; units?: number | null; cost?: number | string | null; ok?: boolean | null; ms?: number | null; user_id?: string };
export type HumanizeRow = { id?: string; created_at?: string; day: string; service: string; words: number; cost: number | string | null; job?: string | null; section?: string | null; result?: string; user_id?: string };
export type UsageEvent = { id: string; at: string; tool: string; job: JobId | "test" | ""; section: string; model: string; tokens: number; units: number; cost: number | null; ok: boolean; ms: number | null; kind: string };

const LEGACY_JOB: Record<string, JobId> = { comment: "comment", reply: "comment", note: "comment", repair: "comment", refine: "comment", draft: "comment", pipeline: "comment", studio: "post", voice: "analysis", citation: "citations", image: "image" };
const LEGACY_SECTION: Record<string, string> = { reply: "linkedin_bar", note: "linkedin_bar", refine: "linkedin_bar", draft: "side_panel", pipeline: "pipeline", voice: "comment_studio", citation: "citations", image: "content_write" };
const JOB_IDS = new Set<string>([...JOBS.map((j) => j.id), "test"]);

/** List-price cost for a token row, or null when the model has no known price. */
export function tokenCost(model: string, inTok: number, outTok: number): number | null {
  const p = PRICES[model];
  return p ? (inTok * p[0] + outTok * p[1]) / 1e6 : null;
}
/** Per million tokens (input, output): the Claude prices of PRICE in providers.ts (the test checks they match), the rest from each vendor's pricing page (6 Nov 2026). */
export const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20], "claude-sonnet-5-5": [2, 10], "claude-haiku-5-5": [0.1, 0.5], "claude-fable-5-1": [10, 50],
  "gpt-6-astra": [10, 50], "gpt-6.1-sol": [2, 10], "gpt-6-luna": [0.1, 0.5],
  "mistral-large-4": [0.7, 2.1], "mistral-small-4": [0.15, 0.6],
  "deepseek-flash": [0.3, 1.2], "deepseek-v4-pro": [1.32, 3.96],
  "openai/gpt-oss-120b": [0.15, 0.6], "openai/gpt-oss-20b": [0.075, 0.3],
  "grok-4.7": [2, 6],
};

/** One usage row from either table, as one event with its tool, job and section. Score reports carry no call. */
export function eventsOf(ext: ExtUsageRow[], hum: HumanizeRow[]): UsageEvent[] {
  const out: UsageEvent[] = [];
  for (const r of ext) {
    if (r.kind === "scores") continue;
    const tool = r.provider === "google_ai" || r.provider === "copilot" ? "serpapi" : r.kind === "image" ? (r.provider === "gemini" ? "gemini_images" : "openai_images") : r.provider;
    const job = r.job && JOB_IDS.has(r.job) ? (r.job as JobId | "test") : LEGACY_JOB[r.kind] ?? "";
    const reported = r.cost == null || r.cost === "" ? null : Number(r.cost);
    const cost = reported != null && reported > 0 ? reported : tokenCost(r.model, r.input_tokens || 0, r.output_tokens || 0) ?? (reported === 0 && r.job ? 0 : null);
    out.push({ id: `e${r.id ?? out.length}`, at: r.at, tool, job, section: r.section || LEGACY_SECTION[r.kind] || "", model: r.model, tokens: (r.input_tokens || 0) + (r.output_tokens || 0),
      units: Number(r.units) || (tool === "serpapi" ? 1 : 0), cost, ok: r.ok !== false, ms: r.ms ?? null, kind: r.kind });
  }
  for (const r of hum) {
    out.push({ id: `h${r.id ?? out.length}`, at: r.created_at || `${r.day}T12:00:00Z`, tool: r.service, job: (r.job === "humanize_rewrite" ? "humanize_rewrite" : "humanize_check"), section: r.section || "",
      model: "", tokens: 0, units: Number(r.words) || 0, cost: r.cost == null ? null : Number(r.cost), ok: r.result !== "failed", ms: null, kind: "humanize" });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

export type Totals = { calls: number; tokens: number; units: number; cost: number; priced: number; failed: number };
const zero = (): Totals => ({ calls: 0, tokens: 0, units: 0, cost: 0, priced: 0, failed: 0 });
const add = (t: Totals, e: UsageEvent) => { t.calls++; t.tokens += e.tokens; t.units += e.units; if (e.cost != null) { t.cost += e.cost; t.priced++; } if (!e.ok) t.failed++; };
export const monthOf = (iso: string) => iso.slice(0, 7);
export type UsageFilter = { month?: string; tool?: string; job?: string; section?: string; days?: number; now?: Date };

/** Events kept by a filter: a calendar month ("2026-11"), or the last N days, plus tool, job and section. */
export function filterEvents(ev: UsageEvent[], f: UsageFilter): UsageEvent[] {
  const since = f.days ? new Date((f.now ?? new Date()).getTime() - f.days * 864e5).toISOString() : "";
  return ev.filter((e) => (!f.month || monthOf(e.at) === f.month) && (!since || e.at >= since) && (!f.tool || e.tool === f.tool) && (!f.job || e.job === f.job) && (f.section == null || f.section === "*" || e.section === f.section));
}
/** Sums by a key (tool, job or section), biggest first, each with its share of the calls. */
export function breakdown(ev: UsageEvent[], by: "tool" | "job" | "section"): { key: string; totals: Totals; share: number }[] {
  const m = new Map<string, Totals>();
  for (const e of ev) { const k = String(e[by] ?? ""); if (!m.has(k)) m.set(k, zero()); add(m.get(k)!, e); }
  const n = ev.length || 1;
  return [...m.entries()].map(([key, totals]) => ({ key, totals, share: totals.calls / n })).sort((a, b) => b.totals.calls - a.totals.calls || a.key.localeCompare(b.key));
}
export function totalsOf(ev: UsageEvent[]): Totals { const t = zero(); ev.forEach((e) => add(t, e)); return t; }
/** Calls per day over the last N days, oldest first, for the sparkline. */
export function daily(ev: UsageEvent[], days: number, now = new Date()): { day: string; calls: number; cost: number }[] {
  const out: { day: string; calls: number; cost: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 864e5).toISOString().slice(0, 10);
    const hit = ev.filter((e) => e.at.slice(0, 10) === d);
    out.push({ day: d, calls: hit.length, cost: hit.reduce((s, e) => s + (e.cost ?? 0), 0) });
  }
  return out;
}

// ---------- caps ----------
export type CapUnit = "usd" | "calls" | "words";
export type Cap = { limit: number; unit: CapUnit };
export type Caps = Partial<Record<string, Cap>>;
export const WARN_AT = 0.8;
export type CapState = { used: number; limit: number; unit: CapUnit; pct: number | null; state: "none" | "ok" | "warn" | "stop" };
/** Where a tool stands against its monthly cap. No cap: "none" (no limit). 80%: "warn". 100%: "stop". */
export function capState(cap: Cap | undefined, month: Totals): CapState {
  const unit = cap?.unit ?? "usd";
  const used = unit === "usd" ? month.cost : unit === "calls" ? month.calls : month.units;
  if (!cap || !(cap.limit > 0)) return { used, limit: 0, unit, pct: null, state: "none" };
  const pct = used / cap.limit;
  return { used, limit: cap.limit, unit, pct, state: pct >= 1 ? "stop" : pct >= WARN_AT ? "warn" : "ok" };
}
export function capLine(c: CapState): string {
  if (c.state === "none") return "No monthly cap";
  const v = (n: number) => (c.unit === "usd" ? `$${n.toFixed(2)}` : `${Math.round(n).toLocaleString("en-GB")} ${c.unit}`);
  const p = Math.round((c.pct ?? 0) * 100);
  if (c.state === "stop") return `Cap reached: ${v(c.used)} of ${v(c.limit)}. Paid calls stopped until next month.`;
  if (c.state === "warn") return `${p}% of the cap used: ${v(c.used)} of ${v(c.limit)}. Paid calls stop at 100%.`;
  return `${p}% of the cap used: ${v(c.used)} of ${v(c.limit)}.`;
}
/** The tools at 100% of their cap this month, for the extension door (paid calls stop there). */
export function blockedTools(caps: Caps, ev: UsageEvent[], month: string): string[] {
  return Object.keys(caps).filter((t) => capState(caps[t], totalsOf(filterEvents(ev, { month, tool: t }))).state === "stop");
}

// ---------- copy ----------
export const money = (n: number) => (n > 0 && n < 0.01 ? "under $0.01" : `$${n.toFixed(2)}`);
/** "12 calls · 48.2k tokens · $0.31" for a tool's month; "None this month" when it has no calls. */
export function usageLine(t: Totals, unit: Unit = "tokens"): string {
  if (!t.calls) return "None this month";
  const parts = [`${t.calls.toLocaleString("en-GB")} ${t.calls === 1 ? "call" : "calls"}`];
  if (unit === "tokens" && t.tokens) parts.push(`${t.tokens >= 1000 ? `${(t.tokens / 1000).toFixed(t.tokens >= 100000 ? 0 : 1)}k` : t.tokens} tokens`);
  if ((unit === "words" || unit === "credits") && t.units) parts.push(`${t.units.toLocaleString("en-GB")} ${unit}`);
  if (t.priced) parts.push(money(t.cost));
  return parts.join(" · ");
}
/** The month's spend in words: "$1.24", "None this month", or "Not priced" when no call had a price. */
export function spendLine(t: Totals): string {
  if (!t.calls) return "None this month";
  return t.priced ? money(t.cost) : "Not priced";
}

/** The tools a filter keeps on the catalog. */
export type CatalogFilter = { q: string; section: SectionId | ""; status: "" | "connected" | "not" | "used" ; job: JobId | "" };
export function filterCatalog(tools: Tool[], f: CatalogFilter, connected: (id: string) => boolean, used: (id: string) => JobId[]): Tool[] {
  const q = f.q.trim().toLowerCase();
  return tools.filter((t) => (!f.section || t.section === f.section)
    && (!f.job || t.jobs.includes(f.job))
    && (!f.status || (f.status === "connected" ? connected(t.id) : f.status === "not" ? !connected(t.id) && !t.coming : connected(t.id) && used(t.id).length > 0))
    && (!q || `${t.name} ${t.short} ${t.purpose} ${t.uses.join(" ")}`.toLowerCase().includes(q)));
}
/** Previous and next tool in catalog order, wrapping at the ends. */
export function neighbours(id: string, list: Tool[] = TOOLS): { prev: Tool; next: Tool } {
  const i = Math.max(0, list.findIndex((t) => t.id === id));
  return { prev: list[(i - 1 + list.length) % list.length], next: list[(i + 1) % list.length] };
}
