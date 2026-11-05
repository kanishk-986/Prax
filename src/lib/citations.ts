// AI citations: what an AI model says when a buyer question is asked through its API with web search on.
// The extension only fetches the raw provider response with the user's own key; everything below is pure,
// so the page and scripts/test-citations.ts share it. Detection runs on the stored answer and sources at
// display time, so editing an alias list re-scores every past run.

export type Engine = "claude" | "openai" | "gemini" | "perplexity";
export const ENGINES: { id: Engine; name: string; model: string; live: boolean }[] = [
  { id: "openai", name: "ChatGPT (OpenAI)", model: "gpt-5", live: true },
  { id: "gemini", name: "Gemini", model: "gemini-3.8-flash", live: true },
  { id: "claude", name: "Claude", model: "claude-opus-5-5", live: true },
  { id: "perplexity", name: "Perplexity", model: "", live: false }, // needs a Sonar key; not connected yet
];

export type Source = { url: string; title: string; domain: string; cited: boolean };
export type Parsed = { answer: string; sources: Source[]; model: string; input_tokens: number; output_tokens: number; refused: boolean };
export type Entity = { id: string; kind: "self" | "competitor"; name: string; aliases: string[]; domains: string[] };
export type Run = {
  id: string; question_id: string; engine: Engine; model: string; status: "ok" | "failed" | "no_sources";
  answer: string; run_at: string; sources: Source[];
};
export type Question = { id: string; question: string; topic: string; region: string; language: string; status: string };

// ---------- URLs ----------
export function domainOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}
const pathOf = (url: string) => { try { return new URL(url).pathname.toLowerCase().replace(/\/+$/, ""); } catch { return ""; } };

/** An owned entry is a host ("antiersolutions.com", subdomains included) or a host with a path ("linkedin.com/in/shashipal"). */
export function owns(url: string, domains: string[]): boolean {
  const host = domainOf(url), path = pathOf(url);
  if (!host) return false;
  return domains.some((d) => {
    const [h, ...rest] = d.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "").split("/");
    if (!h || !(host === h || host.endsWith("." + h))) return false;
    if (!rest.length) return true;
    const p = "/" + rest.join("/");
    return path === p || path.startsWith(p + "/") || path.startsWith(p + "_") || path.startsWith(p + "-");
  });
}

/** Links written into the answer text itself (markdown links and bare URLs). */
export function linksIn(text: string): string[] {
  return [...new Set((text.match(/https?:\/\/[^\s)\]>"']+/g) ?? []).map((u) => u.replace(/[.,;:]+$/, "")))];
}

// ---------- provider responses ----------
// Provider JSON is read defensively, field by field.
type J = { [k: string]: any };

function addSource(list: Source[], url: string, title: string, cited: boolean) {
  if (!url) return;
  // Gemini's older grounding links are redirects; the title then carries the real domain.
  const redirect = /vertexaisearch\.cloud\.google\.com/.test(url);
  const domain = redirect && title ? title.toLowerCase().replace(/^www\./, "") : domainOf(url);
  const have = list.find((s) => s.url === url);
  if (have) { have.cited ||= cited; if (!have.title && title) have.title = title; return; }
  list.push({ url, title: title || "", domain, cited });
}

/** Claude Messages API with the web_search tool. `raws` holds every response of a turn (pause_turn continuations included). */
export function parseClaude(raws: J[]): Parsed {
  const sources: Source[] = []; let answer = "", inT = 0, outT = 0, model = "", refused = false;
  for (const j of raws) {
    model = j.model || model; inT += j.usage?.input_tokens ?? 0; outT += j.usage?.output_tokens ?? 0;
    if (j.stop_reason === "refusal") refused = true;
    for (const b of j.content ?? []) {
      if (b.type === "text") {
        answer += b.text ?? "";
        for (const c of b.citations ?? []) if (c.url) addSource(sources, c.url, c.title ?? "", true);
      } else if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content) if (r.type === "web_search_result") addSource(sources, r.url, r.title ?? "", false);
      }
    }
  }
  return { answer: answer.trim(), sources, model, input_tokens: inT, output_tokens: outT, refused };
}

/** OpenAI Responses API with the web_search tool: message items carry output_text with url_citation annotations. */
export function parseOpenAI(j: J): Parsed {
  const sources: Source[] = []; let answer = "";
  for (const item of j.output ?? []) {
    if (item.type === "message") for (const c of item.content ?? []) {
      if (c.type === "output_text") {
        answer += c.text ?? "";
        for (const a of c.annotations ?? []) if (a.type === "url_citation") addSource(sources, a.url, a.title ?? "", true);
      }
      if (c.type === "refusal") return { answer: c.refusal ?? "", sources, model: j.model ?? "", input_tokens: j.usage?.input_tokens ?? 0, output_tokens: j.usage?.output_tokens ?? 0, refused: true };
    }
    if (item.type === "web_search_call") for (const s of item.action?.sources ?? []) if (s.url) addSource(sources, s.url, s.title ?? "", false);
  }
  return { answer: answer.trim(), sources, model: j.model ?? "", input_tokens: j.usage?.input_tokens ?? 0, output_tokens: j.usage?.output_tokens ?? 0, refused: false };
}

/** Gemini Interactions API with google_search (model_output text with url_citation annotations); also reads the older generateContent groundingMetadata shape. */
export function parseGemini(j: J): Parsed {
  const sources: Source[] = []; let answer = "";
  for (const st of j.steps ?? []) if (st.type === "model_output") for (const c of st.content ?? []) if (c.type === "text") {
    answer += c.text ?? "";
    for (const a of c.annotations ?? []) if (a.type === "url_citation") addSource(sources, a.url, a.title ?? "", true);
  }
  for (const cand of j.candidates ?? []) {
    answer += (cand.content?.parts ?? []).map((p: J) => p.text ?? "").join("");
    for (const ch of cand.groundingMetadata?.groundingChunks ?? []) if (ch.web?.uri) addSource(sources, ch.web.uri, ch.web.title ?? "", true);
  }
  const u = j.usage ?? {}, um = j.usageMetadata ?? {};
  return { answer: answer.trim(), sources, model: j.model ?? j.modelVersion ?? "", input_tokens: u.input_tokens ?? u.total_input_tokens ?? um.promptTokenCount ?? 0, output_tokens: u.output_tokens ?? u.total_output_tokens ?? um.candidatesTokenCount ?? 0, refused: j.candidates?.[0]?.finishReason === "SAFETY" };
}

export function parseEngine(engine: Engine, raws: J[]): Parsed {
  if (engine === "claude") return parseClaude(raws);
  if (engine === "openai") return parseOpenAI(raws[raws.length - 1] ?? {});
  return parseGemini(raws[raws.length - 1] ?? {});
}

/** Run status: failed when nothing usable came back; no_sources when the answer cites nothing (then "linked" is unknown, not false). */
export function statusOf(p: Parsed): Run["status"] {
  if (p.refused || !p.answer) return "failed";
  return p.sources.length ? "ok" : "no_sources";
}

// ---------- detection ----------
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole-word, case-insensitive: "Antier" matches "Antier's" but not "Antiers"; "Shashi Pal" never matches another Shashi. */
export function aliasRegex(alias: string): RegExp {
  const a = alias.trim().replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}_])${a.split("\\s+").map(esc).join("\\s+")}(?![\\p{L}\\p{N}_])`, "giu");
}
export type Match = { alias: string; index: number; text: string };
export function findMatches(text: string, aliases: string[]): Match[] {
  const out: Match[] = [];
  for (const al of aliases) {
    if (!al.trim()) continue;
    for (const m of text.matchAll(aliasRegex(al))) out.push({ alias: al, index: m.index ?? 0, text: m[0] });
  }
  return out.sort((a, b) => a.index - b.index || b.text.length - a.text.length).filter((m, i, arr) => !arr.slice(0, i).some((p) => m.index < p.index + p.text.length));
}

/** Rank of the first list item that names the entity, in any numbered or bulleted list of the answer. */
export function positionOf(text: string, aliases: string[]): number | null {
  let best: number | null = null, rank = 0, inList = false;
  for (const line of text.split(/\r?\n/)) {
    const item = line.match(/^\s*(?:(\d+)[.)]|[-*•])\s+(.*)$/);
    if (!item) { if (line.trim()) { inList = false; rank = 0; } continue; }
    rank = inList ? rank + 1 : 1; inList = true;
    const n = item[1] ? Number(item[1]) : rank;
    if (findMatches(item[2], aliases).length && (best == null || n < best)) best = n;
  }
  return best;
}

export type Detection = { named: boolean; linked: boolean | null; position: number | null; matches: Match[]; ownedSources: Source[] };
export function detect(run: Pick<Run, "answer" | "sources" | "status">, e: Pick<Entity, "aliases" | "domains">): Detection {
  const matches = findMatches(run.answer, e.aliases);
  const ownedSources = run.sources.filter((s) => owns(s.url, e.domains));
  const ownedInText = linksIn(run.answer).some((u) => owns(u, e.domains));
  const linked = ownedSources.length || ownedInText ? true : run.status === "no_sources" ? null : false;
  return { named: matches.length > 0, linked, position: matches.length ? positionOf(run.answer, e.aliases) : null, matches, ownedSources };
}

/** A question that already contains the brand would inflate the score, so share of voice leaves it out. */
export const isBranded = (q: Pick<Question, "question">, self: Pick<Entity, "aliases"> | undefined) => !!self && findMatches(q.question, self.aliases).length > 0;

// ---------- maths ----------
/** The latest run per question and engine, plus the one before it. */
export function latestPairs(runs: Run[]) {
  const by = new Map<string, Run[]>();
  for (const r of runs) { const k = `${r.question_id}|${r.engine}`; const a = by.get(k); if (a) a.push(r); else by.set(k, [r]); }
  const out = new Map<string, { now: Run; prev?: Run }>();
  by.forEach((a, k) => { a.sort((x, y) => (x.run_at < y.run_at ? 1 : -1)); out.set(k, { now: a[0], prev: a[1] }); });
  return out;
}

/** "Named in N of M questions" for one entity on one engine (or all), latest run per question; failed runs and branded questions excluded. */
export function shareOfVoice(runs: Run[], questions: Question[], e: Entity, self: Entity | undefined, engine?: Engine) {
  const qs = new Map(questions.filter((q) => q.status === "active" && !isBranded(q, self)).map((q) => [q.id, q]));
  let named = 0, total = 0, linked = 0;
  latestPairs(runs).forEach(({ now }) => {
    if (!qs.has(now.question_id) || now.status === "failed" || (engine && now.engine !== engine)) return;
    total++;
    const d = detect(now, e);
    if (d.named) named++;
    if (d.linked) linked++;
  });
  return { named, linked, total, pct: total ? Math.round((named / total) * 100) : null };
}

export type Change = { question_id: string; engine: Engine; kind: "dropped" | "new"; at: string };
/** Compares each question and engine with its previous usable run. */
export function changes(runs: Run[], e: Entity): Change[] {
  const usable = runs.filter((r) => r.status !== "failed");
  const out: Change[] = [];
  latestPairs(usable).forEach(({ now, prev }) => {
    if (!prev) return;
    const a = detect(prev, e).named, b = detect(now, e).named;
    if (a && !b) out.push({ question_id: now.question_id, engine: now.engine, kind: "dropped", at: now.run_at });
    if (!a && b) out.push({ question_id: now.question_id, engine: now.engine, kind: "new", at: now.run_at });
  });
  return out.sort((x, y) => (x.at < y.at ? 1 : -1));
}

/** Domains cited in answers that name a competitor and never in answers that name you: places to earn a mention. */
export function citationGaps(runs: Run[], self: Entity, competitors: Entity[]) {
  const mine = new Set<string>(), theirs = new Map<string, { runs: number; names: Set<string> }>();
  const ownedHosts = [...self.domains, ...competitors.flatMap((c) => c.domains)];
  for (const r of runs) {
    if (r.status === "failed") continue;
    const selfNamed = detect(r, self).named;
    const rivals = competitors.filter((c) => detect(r, c).named).map((c) => c.name);
    for (const s of r.sources) {
      if (!s.domain || owns(s.url, ownedHosts)) continue;
      if (selfNamed) mine.add(s.domain);
      if (rivals.length) { const t = theirs.get(s.domain) ?? { runs: 0, names: new Set<string>() }; t.runs++; rivals.forEach((n) => t.names.add(n)); theirs.set(s.domain, t); }
    }
  }
  return [...theirs.entries()].filter(([d]) => !mine.has(d)).map(([domain, t]) => ({ domain, runs: t.runs, competitors: [...t.names] })).sort((a, b) => b.runs - a.runs);
}

/** Sources on LinkedIn that belong to the profile (posts, articles, the profile itself). */
export function linkedinCited(runs: Run[], self: Entity) {
  const li = self.domains.filter((d) => /linkedin\.com\//i.test(d));
  return runs.flatMap((r) => r.sources.filter((s) => s.domain.endsWith("linkedin.com") && (owns(s.url, li) || li.some((d) => pathOf(s.url).includes(d.split("/").pop()!.toLowerCase())))).map((s) => ({ run: r, source: s })));
}

// ---------- requests ----------
export const COUNTRY: Record<string, string> = { "": "", Global: "", UAE: "AE", "Saudi Arabia": "SA", Qatar: "QA", Bahrain: "BH", Kuwait: "KW", Oman: "OM", India: "IN", US: "US", UK: "GB", Singapore: "SG", "Hong Kong": "HK", Nigeria: "NG", Kenya: "KE", "South Africa": "ZA", EU: "" };
export const LANGUAGES = ["English", "Arabic", "Hindi"];

/** What is sent: the question exactly as written. Only Gemini, which takes no location, gets the region as a hint. */
export function promptFor(q: Pick<Question, "question" | "region">, engine: Engine) {
  if (engine === "gemini" && q.region && q.region !== "Global") return `${q.question}\n\n(I am based in ${q.region}.)`;
  return q.question;
}

/** Rough per-run cost on list prices. Web search pulls in result pages, so input dwarfs output. */
export const ESTIMATE: Record<Engine, { inTok: number; outTok: number; usd: number; note: string }> = {
  claude: { inTok: 20000, outTok: 1200, usd: 0.12, note: "Opus 5.5 at $4/$20 per million tokens plus web search at $10 per 1,000 searches" },
  openai: { inTok: 9000, outTok: 1000, usd: 0.05, note: "depends on your model; web search calls are billed per call" },
  gemini: { inTok: 6000, outTok: 900, usd: 0.04, note: "depends on your model; grounded searches are billed per query" },
  perplexity: { inTok: 0, outTok: 0, usd: 0, note: "" },
};
