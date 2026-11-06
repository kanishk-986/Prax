// AI citations: what an AI model says when a buyer question is asked through its API with web search on.
// The extension only fetches the raw provider response with the user's own key; everything below is pure,
// so the page and scripts/test-citations.ts share it. Detection runs on the stored answer and sources at
// display time, so editing an alias list re-scores every past run.

export type Engine = "claude" | "openai" | "gemini" | "perplexity";
// Names match PROVIDERS in src/lib/providers.ts (scripts/test-providers.ts checks it).
export const ENGINES: { id: Engine; name: string; model: string; live: boolean }[] = [
  { id: "openai", name: "OpenAI ChatGPT", model: "gpt-5", live: true },
  { id: "gemini", name: "Google Gemini", model: "gemini-3.8-flash", live: true },
  { id: "claude", name: "Anthropic Claude", model: "claude-opus-5-5", live: true },
  { id: "perplexity", name: "Perplexity", model: "sonar", live: true },
];

export type Source = { url: string; title: string; domain: string; cited: boolean };
export type Parsed = { answer: string; sources: Source[]; model: string; input_tokens: number; output_tokens: number; refused: boolean };
export type Entity = { id: string; kind: "self" | "competitor"; name: string; aliases: string[]; domains: string[]; subject?: "person" | "company"; status?: "active" | "suggested" };
export type Run = {
  id: string; question_id: string; engine: Engine; model: string; status: "ok" | "failed" | "no_sources";
  answer: string; run_at: string; sources: Source[];
  repeat_index?: number; sentiment?: string; fact_issues?: FactIssue[] | null; person_review?: string;
};
export type Question = { id: string; question: string; topic: string; region: string; language: string; status: string; set_id?: string | null; repeats?: number; campaign_id?: string | null; audience?: "expert" | "vendor" | "leadership"; keywords?: string[] };
export type FactIssue = { fact: string; said: string };

// ---------- URLs ----------
export function domainOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}
const pathOf = (url: string) => { try { return new URL(url).pathname.toLowerCase().replace(/\/+$/, ""); } catch { return ""; } };

/** An owned entry is a host ("acme.com", subdomains included) or a host with a path ("linkedin.com/in/mayarao"). */
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

/** Perplexity Chat Completions (Sonar): the answer in choices[0].message.content, sources in search_results and citations. */
export function parsePerplexity(j: J): Parsed {
  const sources: Source[] = [];
  const answer = String(j.choices?.[0]?.message?.content ?? "");
  for (const r of j.search_results ?? []) if (r.url) addSource(sources, r.url, r.title ?? "", false);
  for (const u of j.citations ?? []) if (typeof u === "string") addSource(sources, u, "", true);
  return { answer: answer.trim(), sources, model: j.model ?? "", input_tokens: j.usage?.prompt_tokens ?? 0, output_tokens: j.usage?.completion_tokens ?? 0, refused: false };
}

export function parseEngine(engine: Engine, raws: J[]): Parsed {
  if (engine === "claude") return parseClaude(raws);
  if (engine === "perplexity") return parsePerplexity(raws[raws.length - 1] ?? {});
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
/** Whole-word, case-insensitive: "Acme" matches "Acme's" but not "Acmes"; a full name never matches someone else with the same first name. */
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

/** Runs asked together (repeats of one question on one engine) count as one batch: runs within 3 hours of the latest. */
const BATCH_MS = 3 * 3600e3;
export function latestBatches(runs: Run[]) {
  const by = new Map<string, Run[]>();
  for (const r of runs) { const k = `${r.question_id}|${r.engine}`; const a = by.get(k); if (a) a.push(r); else by.set(k, [r]); }
  const out = new Map<string, { now: Run[]; prev: Run[] }>();
  by.forEach((a, k) => {
    a.sort((x, y) => (x.run_at < y.run_at ? 1 : -1));
    const t0 = Date.parse(a[0].run_at), now = a.filter((r) => t0 - Date.parse(r.run_at) <= BATCH_MS);
    const rest = a.slice(now.length), prev = rest.length ? rest.filter((r) => Date.parse(rest[0].run_at) - Date.parse(r.run_at) <= BATCH_MS) : [];
    out.set(k, { now, prev });
  });
  return out;
}

export type Agg = { named: boolean; linked: boolean | null; position: number | null; k: number; n: number; mixed: boolean };
/** One verdict per batch: named when more than half of the usable repeats name the entity; "mixed" when the repeats disagree. */
export function aggregate(batch: Run[], e: Pick<Entity, "aliases" | "domains">): Agg | null {
  const usable = batch.filter((r) => r.status !== "failed");
  if (!usable.length) return null;
  const ds = usable.map((r) => detect(r, e));
  const k = ds.filter((d) => d.named).length, n = ds.length;
  const linkedKnown = ds.filter((d) => d.linked !== null);
  const positions = ds.map((d) => d.position).filter((x): x is number => x != null);
  return { named: k * 2 > n, linked: linkedKnown.length ? linkedKnown.filter((d) => d.linked).length * 2 > linkedKnown.length : null, position: positions.length ? Math.min(...positions) : null, k, n, mixed: k > 0 && k < n };
}

/** "Named in N of M questions" for one entity on one engine (or all), latest batch per question; failed runs and branded questions excluded. */
export function shareOfVoice(runs: Run[], questions: Question[], e: Entity, self: Entity | undefined, engine?: Engine) {
  const qs = new Map(questions.filter((q) => q.status === "active" && !isBranded(q, self)).map((q) => [q.id, q]));
  let named = 0, total = 0, linked = 0;
  latestBatches(runs).forEach(({ now }, key) => {
    const [qid, eng] = key.split("|");
    if (!qs.has(qid) || (engine && eng !== engine)) return;
    const a = aggregate(now, e);
    if (!a) return;
    total++;
    if (a.named) named++;
    if (a.linked) linked++;
  });
  return { named, linked, total, pct: total ? Math.round((named / total) * 100) : null };
}

export type Change = { question_id: string; engine: Engine; kind: "dropped" | "new"; at: string };
/** Compares each question and engine with its previous usable batch. */
export function changes(runs: Run[], e: Entity): Change[] {
  const usable = runs.filter((r) => r.status !== "failed");
  const out: Change[] = [];
  latestBatches(usable).forEach(({ now, prev }) => {
    if (!prev.length) return;
    const a = aggregate(prev, e)?.named, b = aggregate(now, e)?.named;
    if (a && !b) out.push({ question_id: now[0].question_id, engine: now[0].engine, kind: "dropped", at: now[0].run_at });
    if (!a && b) out.push({ question_id: now[0].question_id, engine: now[0].engine, kind: "new", at: now[0].run_at });
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
  perplexity: { inTok: 4000, outTok: 800, usd: 0.01, note: "Sonar with search; Perplexity bills tokens and a per-request search fee" },
};

// ---------- tone and facts ----------
export type Sentiment = "positive" | "neutral" | "negative";
const POS = ["leading", "leader", "trusted", "strong", "proven", "reliable", "notable", "recommended", "experienced", "specialist", "well known", "reputable", "established"];
const NEG = ["controversy", "lawsuit", "fraud", "complaint", "complaints", "unreliable", "criticised", "criticized", "scam", "failed", "delays", "breach", "penalty", "fined", "warning"];
const sentencesOf = (t: string) => t.split(/(?<=[.!?])\s+|\n+/);
/** Quick tone read from the sentences that name the entity; the AI check (parseJudge) replaces it once it has run. */
export function sentimentOf(text: string, aliases: string[]): Sentiment | null {
  const named = sentencesOf(text).filter((x) => findMatches(x, aliases).length);
  if (!named.length) return null;
  const t = named.join(" ").toLowerCase();
  const has = (w: string) => new RegExp(`(?<![a-z])${w}(?![a-z])`).test(t);
  const p = POS.filter(has).length, n = NEG.filter(has).length;
  return n > p ? "negative" : p > n ? "positive" : "neutral";
}
/** The AI check's reply: {"sentiment": "...", "issues": [{"fact": "...", "said": "..."}]}. Anything unreadable gives null. */
export function parseJudge(text: string): { sentiment: Sentiment; issues: FactIssue[] } | null {
  const m = text.match(/\{[\s\S]*\}/);
  try {
    const j = JSON.parse(m ? m[0] : text);
    const sentiment: Sentiment = ["positive", "neutral", "negative"].includes(j.sentiment) ? j.sentiment : "neutral";
    const issues: FactIssue[] = Array.isArray(j.issues) ? j.issues.filter((x: FactIssue) => x && x.fact && x.said).map((x: FactIssue) => ({ fact: String(x.fact).slice(0, 200), said: String(x.said).slice(0, 300) })) : [];
    return { sentiment, issues };
  } catch { return null; }
}

export type Facts = { titles: string; company: string; products: string; licences: string; regions: string; founded: string; other: string };
export const EMPTY_FACTS: Facts = { titles: "", company: "", products: "", licences: "", regions: "", founded: "", other: "" };
/** The check Prax can do without AI: a wrong founding year in a sentence that names the person or the company. */
export function factIssues(answer: string, facts: Partial<Facts>, aliases: string[]): FactIssue[] {
  const out: FactIssue[] = [];
  const year = (facts.founded ?? "").match(/\d{4}/)?.[0];
  if (!year) return out;
  for (const sentence of sentencesOf(answer)) {
    if (!findMatches(sentence, aliases).length) continue;
    const m = sentence.match(/(?:founded|established|started|since)\D{0,12}((?:19|20)\d{2})/i);
    if (m && m[1] !== year) out.push({ fact: `Founded ${year}`, said: sentence.trim().slice(0, 300) });
  }
  return out;
}
export function judgePrompt(answer: string, facts: Partial<Facts>, name: string) {
  const lines = Object.entries(facts).filter(([, v]) => v && String(v).trim()).map(([k, v]) => `${k}: ${v}`).join("\n");
  return `FACTS ABOUT ${name.toUpperCase()} (true):\n${lines || "(none given)"}\n\nAN AI ANSWER:\n${answer.slice(0, 12000)}\n\nJudge how the answer speaks about ${name}: positive, neutral or negative. List any statement about ${name} that contradicts the facts, quoting it. Do not list things the facts do not cover. Return only JSON: {"sentiment": "neutral", "issues": [{"fact": "the true fact", "said": "the quoted wrong statement"}]}`;
}

/** Profile consistency: each fact should appear in the LinkedIn headline or About text, which AI tools read. */
export function profileConsistency(facts: Partial<Facts>, profileText: string) {
  const t = profileText.toLowerCase();
  const terms = (v?: string) => (v ?? "").split(",").map((x) => x.trim()).filter((x) => x.length > 1);
  const rows: { fact: string; value: string; found: boolean }[] = [];
  ([["Title", facts.titles], ["Company", facts.company], ["Products", facts.products], ["Regions", facts.regions], ["Licences", facts.licences]] as const).forEach(([fact, v]) => {
    terms(v).forEach((value) => rows.push({ fact, value, found: t.includes(value.toLowerCase()) }));
  });
  return rows;
}

// ---------- question sets, recommendations, alerts ----------
export function setRollup(questions: Question[], setId: string | null, runs: Run[], self: Entity) {
  return shareOfVoice(runs, questions.filter((q) => (q.set_id ?? null) === setId), self, self);
}

/** Lift since a recommendation was accepted: the named share on its target questions then and now. */
export function lift(baseline: { named: number; total: number } | null | undefined, now: { named: number; total: number }) {
  if (!baseline || !baseline.total || !now.total) return null;
  const before = Math.round((baseline.named / baseline.total) * 100), after = Math.round((now.named / now.total) * 100);
  return { before, after, delta: after - before };
}

export type Rec = { kind: "profile" | "elsewhere"; title: string; detail: string; question_ids: string[] };
/** Recommendations Prax can make from the data alone; the AI can add more. */
export function recommend(runs: Run[], questions: Question[], self: Entity, rivals: Entity[]): Rec[] {
  const out: Rec[] = [];
  const active = questions.filter((q) => q.status === "active" && !isBranded(q, self));
  const batches = latestBatches(runs);
  const verdicts = (qid: string) => [...batches.entries()].filter(([k]) => k.startsWith(qid + "|")).map(([, b]) => aggregate(b.now, self)).filter((a): a is Agg => !!a);
  for (const q of active) {
    const v = verdicts(q.id);
    if (!v.length) continue;
    if (v.every((a) => !a.named)) out.push({ kind: "profile", title: `Publish a LinkedIn article that answers: ${q.question}`, detail: `No AI tool names ${self.name} for this prompt. A clear, specific article gives the AI something to cite.`, question_ids: [q.id] });
    else if (v.some((a) => a.named && a.linked === false)) out.push({ kind: "profile", title: `Link a company page in posts about ${q.topic || "this topic"}`, detail: `${self.name} is named for "${q.question}", but no answer links an owned site. A post that links the right page can turn mentions into links.`, question_ids: [q.id] });
  }
  for (const g of citationGaps(runs, self, rivals).slice(0, 5)) {
    const qids = [...new Set(runs.filter((r) => r.sources.some((x) => x.domain === g.domain)).map((r) => r.question_id))];
    out.push({ kind: "elsewhere", title: `Get mentioned on ${g.domain}`, detail: `AI answers cite ${g.domain} when they name ${g.competitors.join(", ")}, and never when they name ${self.name}. A guest piece, a quote or data there would help.`, question_ids: qids });
  }
  return out;
}

export type Alert = { kind: "dropped" | "new" | "wrong_fact" | "overtook"; text: string; question_id?: string; engine?: Engine; at: string };
export function alerts(runs: Run[], questions: Question[], self: Entity, rivals: Entity[]): Alert[] {
  const qText = (id: string) => questions.find((q) => q.id === id)?.question ?? "a removed question";
  const out: Alert[] = changes(runs, self).map((c) => ({ kind: c.kind, question_id: c.question_id, engine: c.engine, at: c.at, text: `${c.kind === "new" ? "Newly named" : "Dropped out"}: ${qText(c.question_id)}` }));
  const batches = [...latestBatches(runs).values()];
  for (const b of batches) for (const r of b.now) for (const i of r.fact_issues ?? []) out.push({ kind: "wrong_fact", question_id: r.question_id, engine: r.engine, at: r.run_at, text: `Wrong fact (${i.fact}): "${i.said.slice(0, 120)}"` });
  // A competitor overtook: named on more of the same questions than you now, and not before.
  const prevRuns = batches.flatMap((b) => b.prev);
  if (prevRuns.length) {
    const nowS = shareOfVoice(runs, questions, self, self).named, prevS = shareOfVoice(prevRuns, questions, self, self).named;
    for (const c of rivals) {
      const nowC = shareOfVoice(runs, questions, c, self).named, prevC = shareOfVoice(prevRuns, questions, c, self).named;
      if (nowC > nowS && prevC <= prevS) out.push({ kind: "overtook", at: runs[0]?.run_at ?? "", text: `${c.name} is now named on more prompts than ${self.name} (${nowC} against ${nowS})` });
    }
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}

// ---------- share links ----------
export const shareValid = (row: { expires_at: string; revoked: boolean } | null | undefined, now = Date.now()) => !!row && !row.revoked && Date.parse(row.expires_at) > now;
export const expiryFrom = (days: number, now = Date.now()) => new Date(now + Math.max(1, Math.min(30, days)) * 864e5).toISOString();

// ---------- starters, campaigns, ask ----------
/** Used when no AI key is set: up to twenty buyer questions across the profile's pillars (Settings), phrased the way
 *  a buyer asks, never naming a company. region is the profile's focus regions as text; empty asks globally.
 *  No pillars gives no questions: Prax does not guess what a profile is about. */
export function starterQuestions(pillars: string[], region = "") {
  const at = region ? ` in ${region}` : "";
  const forms = [
    (p: string) => `Who are the leading experts on ${p}${at}?`,
    (p: string) => `Which companies are best at ${p}${at}?`,
    (p: string) => `What should a business know about ${p} this year?`,
    (p: string) => `Who should I listen to on ${p}?`,
    (p: string) => `How do I choose a partner for ${p}${at}?`,
  ];
  const topics = pillars.map((p) => p.trim()).filter(Boolean);
  const out: { question: string; topic: string }[] = [];
  for (const form of forms) for (const t of topics) if (out.length < 20) out.push({ question: form(t.charAt(0).toLowerCase() + t.slice(1)), topic: t });
  return out;
}

/** A campaign's AI citation change: its topic and keywords pick the questions; before and after its start date. */
export function campaignLift(runs: Run[], questions: Question[], self: Entity, c: { id: string; start: string; topic?: string; keywords?: string[] }) {
  const terms = [c.topic ?? "", ...(c.keywords ?? [])].map((x) => x.toLowerCase().trim()).filter(Boolean);
  const qs = questions.filter((q) => q.campaign_id === c.id || terms.some((t) => q.topic.toLowerCase() === t || q.question.toLowerCase().includes(t)));
  const ids = new Set(qs.map((q) => q.id));
  const mine = runs.filter((r) => ids.has(r.question_id));
  const before = mine.filter((r) => r.run_at.slice(0, 10) < c.start), after = mine.filter((r) => r.run_at.slice(0, 10) >= c.start);
  return { questions: qs.length, before: before.length ? shareOfVoice(before, qs, self, self).pct : null, after: after.length ? shareOfVoice(after, qs, self, self).pct : null };
}

/** The data the Ask panel sends: small, readable, and shown to the user. */
export function askContext(runs: Run[], questions: Question[], self: Entity, rivals: Entity[]) {
  const qText = new Map(questions.map((q) => [q.id, q.question]));
  const rows: string[] = [];
  latestBatches(runs).forEach(({ now }, key) => {
    const [qid, eng] = key.split("|"); const a = aggregate(now, self);
    if (!a || !qText.has(qid)) return;
    const rv = rivals.filter((c) => aggregate(now, c)?.named).map((c) => c.name);
    rows.push(`${qText.get(qid)} | ${eng} | ${a.named ? `named${a.position ? ` #${a.position}` : ""}${a.linked ? ", linked" : ""}` : "not named"}${rv.length ? ` | competitors: ${rv.join(", ")}` : ""} | ${now[0].run_at.slice(0, 10)}`);
  });
  const sov = shareOfVoice(runs, questions, self, self);
  const ch = changes(runs, self).slice(0, 15).map((c) => `${c.kind}: ${qText.get(c.question_id)} on ${c.engine} (${c.at.slice(0, 10)})`);
  const gaps = citationGaps(runs, self, rivals).slice(0, 10).map((g) => `${g.domain} (cites ${g.competitors.join(", ")})`);
  return `Named in ${sov.named} of ${sov.total} answers (latest batch, branded and failed excluded).\n\nLATEST PER QUESTION AND ENGINE:\n${rows.join("\n") || "(none)"}\n\nCHANGES:\n${ch.join("\n") || "(none)"}\n\nCITATION GAPS:\n${gaps.join("\n") || "(none)"}`;
}
// AI citations, person and company. The profile's person and its company are scored separately.
// A person counts as named only by a full name that sits next to context (the company, the role or one of the
// topics). A bare full name waits for a one-click review, and a first or last name alone never counts.
// Pure functions, shared by the page and scripts/test-citations.ts.

export type Audience = "expert" | "vendor" | "leadership";
const ROLE = /(?<![\p{L}])(co-?founder|coo|chief operating officer|founder)(?![\p{L}])/iu;
const paragraphs = (t: string) => t.split(/\n\s*\n|\n(?=\s*(?:\d+[.)]|[-*•])\s)/);
const fullNames = (aliases: string[]) => aliases.filter((a) => a.trim().split(/\s+/).length >= 2);

export type PersonHit = { named: boolean; review: boolean; attributed: boolean; matches: Match[] };
/** contextTerms: the topics and keywords, lower case. A stored review ("confirmed" or "rejected") overrides the rule. */
export function detectPerson(run: Pick<Run, "answer" | "person_review">, person: Pick<Entity, "aliases">, company: Pick<Entity, "aliases"> | undefined, contextTerms: string[] = []): PersonHit {
  const names = fullNames(person.aliases);
  const matches = findMatches(run.answer, names);
  if (!matches.length) return { named: false, review: false, attributed: false, matches };
  let context = false, attributed = false;
  for (const p of paragraphs(run.answer)) {
    if (!findMatches(p, names).length) continue;
    const co = company ? findMatches(p, company.aliases).length > 0 : false;
    const low = p.toLowerCase();
    if (co) attributed = true;
    if (co || ROLE.test(p) || contextTerms.some((t) => t && low.includes(t))) context = true;
  }
  if (run.person_review === "confirmed") return { named: true, review: false, attributed, matches };
  if (run.person_review === "rejected") return { named: false, review: false, attributed: false, matches };
  return { named: context, review: !context, attributed: context && attributed, matches };
}

/** Who a prompt is about when it has no audience stored. */
export function audienceOf(q: Pick<Question, "question"> & { audience?: string }): Audience {
  if (q.audience === "expert" || q.audience === "vendor" || q.audience === "leadership") return q.audience;
  if (/(who leads|who is behind|founder of|leadership)/i.test(q.question)) return "leadership";
  if (/(expert|voices?|speaker|thought leader|who writes|who should i (hear|follow)|leaders? on|people)/i.test(q.question)) return "expert";
  return "vendor";
}
export const AUDIENCE_LABEL: Record<Audience, string> = { expert: "Expert", vendor: "Vendor", leadership: "Leadership" };

export type Scored = { named: number; total: number; review: number; linked: number; pct: number | null };
/** Named on prompts of the given audiences: latest batch per prompt and engine, majority of usable repeats; prompts that name the subject are left out. */
export function subjectShare(runs: Run[], questions: Question[], subject: "person" | "company", ent: Entity | undefined, company: Entity | undefined, ctx: string[], audiences: Audience[], engine?: Engine): Scored {
  const out: Scored = { named: 0, total: 0, review: 0, linked: 0, pct: null };
  if (!ent) return out;
  const brand = [...ent.aliases, ...(company && subject === "person" ? company.aliases : [])];
  const qs = new Set(questions.filter((q) => q.status === "active" && audiences.includes(audienceOf(q)) && !findMatches(q.question, brand).length).map((q) => q.id));
  latestBatches(runs).forEach(({ now }, key) => {
    const [qid, eng] = key.split("|");
    if (!qs.has(qid) || (engine && eng !== engine)) return;
    const usable = now.filter((r) => r.status !== "failed");
    if (!usable.length) return;
    out.total++;
    if (subject === "person") {
      const hits = usable.map((r) => detectPerson(r, ent, company, ctx));
      if (hits.filter((h) => h.named).length * 2 > hits.length) out.named++;
      else if (hits.some((h) => h.review)) out.review++;
      if (usable.some((r) => r.sources.some((x) => owns(x.url, ent.domains)))) out.linked++;
    } else {
      const a = aggregate(usable, ent);
      if (a?.named) out.named++;
      if (a?.linked) out.linked++;
    }
  });
  out.pct = out.total ? Math.round((out.named / out.total) * 100) : null;
  return out;
}

/** Context words for the person rule: the company's names plus the keywords of the prompts. */
export function personContext(questions: Question[], company?: Entity) {
  const t = new Set<string>(["stablecoin", "tokenisation", "tokenization", "blockchain", "digital asset"]);
  (company?.aliases ?? []).forEach((a) => t.add(a.toLowerCase()));
  questions.forEach((q) => (q.keywords ?? []).forEach((k) => k.trim() && t.add(k.toLowerCase())));
  return [...t];
}

/** True when the prompt's subject (the person for expert and leadership, the company for vendor and leadership) is named in its latest batch on any engine. */
function namedOnPrompt(q: Question, batches: ReturnType<typeof latestBatches>, person: Entity | undefined, company: Entity | undefined, ctx: string[]) {
  const aud = audienceOf(q);
  let hit = false;
  batches.forEach(({ now }, key) => {
    if (hit || !key.startsWith(q.id + "|")) return;
    const usable = now.filter((r) => r.status !== "failed");
    if (!usable.length) return;
    if (aud !== "vendor" && person && usable.some((r) => detectPerson(r, person, company, ctx).named)) hit = true;
    if (aud !== "expert" && company && aggregate(usable, company)?.named) hit = true;
  });
  return hit;
}

/** "Named in X of Y prompts" for each keyword. */
export function keywordStats(runs: Run[], questions: Question[], person: Entity | undefined, company: Entity | undefined, ctx: string[]) {
  const batches = latestBatches(runs);
  const by = new Map<string, { prompts: number; named: number }>();
  for (const q of questions.filter((x) => x.status === "active")) {
    const hit = namedOnPrompt(q, batches, person, company, ctx);
    for (const k of q.keywords ?? []) { const key = k.trim(); if (!key) continue; const e = by.get(key) ?? { prompts: 0, named: 0 }; e.prompts++; if (hit) e.named++; by.set(key, e); }
  }
  return [...by.entries()].map(([keyword, v]) => ({ keyword, ...v })).sort((a, b) => b.prompts - a.prompts || a.keyword.localeCompare(b.keyword));
}

// ---------- suggested peer experts (AC15) ----------
// After runs, the people the AI names most often on expert and leadership prompts, and who are not tracked yet, are
// offered as Suggested peer experts. A name counts only as a full name (two or three capitalised words) set right
// beside a role: "Rina Okafor, CEO of Ledgerline", "Rina Okafor (co-founder)", "CEO Rina Okafor", "Dr Rina Okafor",
// "Rina Okafor is the head of". A first or last name alone, a name with no role beside it, and anything that reads
// like a firm or a place never counts. Prax only proposes: nothing is tracked until someone approves it.
const NAME_TOKEN = "\\p{Lu}(?:['\u2019]\\p{Lu})?\\p{Ll}+(?:\\p{Lu}\\p{Ll}+)?(?:-\\p{Lu}\\p{Ll}+)*";
const PARTICLES = ["bin", "bint", "al", "el", "van", "von", "de", "da", "del", "der", "di", "du", "le", "la"];
const NAME_RUN = new RegExp(`(?<![\\p{L}\\p{N}])${NAME_TOKEN}(?:[ \\t]+(?:(?:${PARTICLES.join("|")})[ \\t]+)?(?:\\p{Lu}\\.[ \\t]*)?${NAME_TOKEN}){1,5}(?![\\p{L}\\p{N}])`, "gu");
const ROLE_WORDS = "co-?founder|founder|ceo|cto|cfo|coo|cio|cso|cmo|cpo|chief|head|partner|director|president|chair(?:man|woman|person)?|governor|minister|professor|analyst|economist|author|researcher|vp|executive|adviser|advisor|investor|entrepreneur|strategist|officer|lead|leader|manager|commissioner|secretary|ambassador|scientist|fellow|editor|journalist|specialist|principal";
const HONORIFICS = "dr|prof|mr|mrs|ms|sir|dame|sheikh|sheikha";
const ROLE_AFTER = new RegExp(`^\\s*(?:,|\\(|[\u2013\u2014-]|:|is|was|serves as|who is|who leads|who heads|who runs)\\s*(?:(?:the|a|an|its|their|former|current)\\s+)?(?:[\\p{L}&.'\u2019-]+\\s+){0,3}?(?:${ROLE_WORDS})(?![\\p{L}])`, "iu");
const ROLE_BEFORE = new RegExp(`(?<![\\p{L}])(?:${ROLE_WORDS}|${HONORIFICS})\\.?\\s*,?\\s*$`, "iu");
const HON_SET = new Set(HONORIFICS.split("|"));
// Role words, sentence starters and words that belong to firms, bodies and places end (or open) a run of capitalised
// words, so "Standard Chartered CEO Bill Winters" yields only Bill Winters.
const NOT_NAME = new Set(("ceo cto cfo coo cio cso cmo cpo chief head founder cofounder co-founder partner director president chairman chairwoman chairperson chair governor minister professor analyst economist author researcher vp executive adviser advisor investor entrepreneur strategist officer lead leader manager commissioner secretary ambassador scientist fellow editor journalist specialist principal managing senior deputy vice general " +
  "the a an in at for of on by to from with and or but this that these those his her their our its some many most other both key top major leading notable also several according while when where which who as if after before during since under over read see note sources source why how what yes no here there then today " +
  "bank banks capital group labs lab inc ltd llc plc partners ventures holdings solutions technologies technology tech network foundation exchange authority association council institute university college school fund forum markets market finance financial digital " +
  "global regional international asia asian africa african europe european america american arabia arab emirates kingdom dubai dhabi abu saudi qatar bahrain kuwait oman india indian singapore london street coin chain pay payments protocol blockchain crypto ledger web monetary central reserve federal national royal " +
  "ministry department office agency commission board committee services service systems system platform company corporation corp media news journal times review report insights research consulting advisory union east west north south middle new united world economic trade").split(/\s+/));
const isInitial = (t: string) => /^\p{Lu}\.$/u.test(t);
const nameTokens = (n: string) => n.split(/\s+/).filter((t) => !PARTICLES.includes(t) && !isInitial(t));

/** Full names set beside a role in one answer, in the order they appear. */
export function peopleIn(answer: string): string[] {
  const text = answer.replace(/[*_#`]/g, "");
  const out: string[] = [];
  for (const m of text.matchAll(NAME_RUN)) {
    const parts = [...m[0].matchAll(/\S+/g)].map((p) => ({ t: p[0], low: p[0].toLowerCase(), at: (m.index ?? 0) + (p.index ?? 0) }));
    let i = 0, honorific = false;
    while (i < parts.length && (NOT_NAME.has(parts[i].low) || HON_SET.has(parts[i].low))) { if (HON_SET.has(parts[i].low)) honorific = true; i++; }
    let j = i;
    while (j < parts.length && !NOT_NAME.has(parts[j].low) && !HON_SET.has(parts[j].low)) j++;
    const kept = parts.slice(i, j);
    while (kept.length && (PARTICLES.includes(kept[kept.length - 1].t) || isInitial(kept[kept.length - 1].t))) kept.pop();
    const name = kept.map((p) => p.t).join(" ");
    const n = nameTokens(name).length;
    if (n < 2 || n > 3) continue;
    const start = kept[0].at, end = kept[kept.length - 1].at + kept[kept.length - 1].t.length;
    const lineStart = Math.max(text.lastIndexOf("\n", start - 1), text.lastIndexOf(". ", start - 1) + 1, 0);
    const before = text.slice(Math.max(lineStart, start - 48), start);
    const after = text.slice(end).replace(/^['\u2019]s(?![\p{L}])/u, "").split(/[\n!?]|\.(?:\s|$)/)[0].slice(0, 120);
    if (honorific || ROLE_BEFORE.test(before) || ROLE_AFTER.test(after)) out.push(name);
  }
  return out;
}

export type PeerSuggestion = { name: string; answers: number; engines: Engine[] };
/** Each prompt and AI tool counts once (its latest batch, named in more than half of the usable repeats). Names already
 *  tracked, suggested or dismissed, the profile's own person and names written into the prompt are left out. Most
 *  named first, then on more AI tools, then by name; at least `min` answers. */
export function suggestPeerExperts(runs: Run[], questions: Question[], tracked: Pick<Entity, "name" | "aliases">[], dismissed: string[] = [], opts: { min?: number; limit?: number } = {}): PeerSuggestion[] {
  const { min = 2, limit = 8 } = opts;
  const key = (x: string) => x.trim().toLowerCase().replace(/\s+/g, " ");
  const known = new Set([...tracked.flatMap((e) => [e.name, ...e.aliases]), ...dismissed].map(key).filter(Boolean));
  const qs = new Map(questions.filter((q) => q.status === "active" && audienceOf(q) !== "vendor").map((q) => [q.id, q]));
  const by = new Map<string, { name: string; answers: number; engines: Set<Engine> }>();
  latestBatches(runs).forEach(({ now }, k) => {
    const q = qs.get(k.split("|")[0]);
    if (!q) return;
    const usable = now.filter((r) => r.status !== "failed");
    if (!usable.length) return;
    const tally = new Map<string, { name: string; n: number }>();
    for (const r of usable) for (const name of new Set(peopleIn(r.answer))) { const t = tally.get(key(name)) ?? { name, n: 0 }; t.n++; tally.set(key(name), t); }
    tally.forEach(({ name, n }, id) => {
      if (n * 2 <= usable.length || known.has(id) || findMatches(q.question, [name]).length) return;
      const e = by.get(id) ?? { name, answers: 0, engines: new Set<Engine>() };
      e.answers++; e.engines.add(now[0].engine); by.set(id, e);
    });
  });
  return [...by.values()].filter((e) => e.answers >= min)
    .sort((a, b) => b.answers - a.answers || b.engines.size - a.engines.size || a.name.localeCompare(b.name))
    .slice(0, limit).map((e) => ({ name: e.name, answers: e.answers, engines: ENGINES.map((x) => x.id).filter((id) => e.engines.has(id)) }));
}

// ---------- weeks and trend ----------
/** Monday (local) of the week a date falls in, as YYYY-MM-DD. */
export function weekStartOf(d: Date | string) {
  const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
export const shiftWeek = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n * 7); return weekStartOf(d); };
/** Weeks (newest first) that hold at least one run. */
export const runWeeks = (runs: Run[]) => [...new Set(runs.map((r) => weekStartOf(r.run_at)))].sort().reverse();
export const runsInWeek = (runs: Run[], week: string) => runs.filter((r) => weekStartOf(r.run_at) === week);

export type TrendPoint = { week: string; engines: Partial<Record<Engine, number | null>>; median: number | null; person: number | null; company: number | null };
/** Eight weeks ending this week, from that week's runs only; null where nothing ran. Engine lines count prompts naming the person or the company. */
export function weeklyTrend(runs: Run[], questions: Question[], person: Entity | undefined, company: Entity | undefined, rivals: Entity[], ctx: string[], today = new Date()): TrendPoint[] {
  const last = weekStartOf(today);
  return Array.from({ length: 8 }, (_, i) => shiftWeek(last, i - 7)).map((week) => {
    const wr = runsInWeek(runs, week);
    const point: TrendPoint = { week, engines: {}, median: null, person: null, company: null };
    if (!wr.length) return point;
    const batches = latestBatches(wr);
    for (const e of ENGINES) {
      const eb = new Map([...batches.entries()].filter(([k]) => k.endsWith("|" + e.id)));
      point.engines[e.id] = eb.size ? questions.filter((q) => q.status === "active" && namedOnPrompt(q, eb, person, company, ctx)).length : null;
    }
    point.person = subjectShare(wr, questions, "person", person, company, ctx, ["expert", "leadership"]).named;
    point.company = subjectShare(wr, questions, "company", company, company, ctx, ["vendor", "leadership"]).named;
    const counts = rivals.map((c) => shareOfVoice(wr, questions, c, company).named).sort((a, b) => a - b);
    point.median = counts.length ? (counts.length % 2 ? counts[(counts.length - 1) / 2] : (counts[counts.length / 2 - 1] + counts[counts.length / 2]) / 2) : null;
    return point;
  });
}

/** Whether two series moved the same way over the window (first to last recorded point); null without enough data. */
export function sameDirection(a: (number | null)[], b: (number | null)[]) {
  const delta = (x: (number | null)[]) => { const v = x.filter((n): n is number => n != null); return v.length >= 2 ? v[v.length - 1] - v[0] : null; };
  const da = delta(a), db = delta(b);
  if (da == null || db == null) return null;
  return Math.sign(da) === Math.sign(db);
}

// ---------- prompt gaps ----------
// channel is posts.channel: "shashi" is the stored value for the profile's own posts (PROFILE_CHANNEL in src/lib/persona.ts).
export type PromptGap = { question: Question; rivals: string[]; engines: Engine[]; channel: "shashi" | "company" };
/** Prompts where a tracked rival is named and the right subject is not: experts and leadership for the person, vendors for the company. */
export function promptGaps(runs: Run[], questions: Question[], person: Entity | undefined, company: Entity | undefined, peerExperts: Entity[], peerFirms: Entity[], ctx: string[]): PromptGap[] {
  const out: PromptGap[] = [];
  const batches = latestBatches(runs);
  for (const q of questions.filter((x) => x.status === "active")) {
    const channel = audienceOf(q) === "vendor" ? "company" : "shashi";
    const pool = channel === "shashi" ? (peerExperts.length ? peerExperts : peerFirms) : peerFirms;
    const subj = channel === "shashi" ? person : company;
    if (!subj || !pool.length || findMatches(q.question, subj.aliases).length) continue;
    const rv = new Set<string>(), engines: Engine[] = [];
    batches.forEach(({ now }, key) => {
      if (!key.startsWith(q.id + "|")) return;
      const usable = now.filter((r) => r.status !== "failed");
      if (!usable.length) return;
      const mine = channel === "shashi" ? usable.some((r) => detectPerson(r, subj, company, ctx).named) : !!aggregate(usable, subj)?.named;
      if (mine) return;
      const named = pool.filter((c) => aggregate(usable, c)?.named).map((c) => c.name);
      if (named.length) { named.forEach((n) => rv.add(n)); engines.push(now[0].engine); }
    });
    if (rv.size) out.push({ question: q, rivals: [...rv], engines, channel });
  }
  return out.sort((a, b) => b.engines.length - a.engines.length || b.rivals.length - a.rivals.length);
}

/** The topic a gap becomes in Content Studio. */
export function gapTopic(g: PromptGap, first = "the profile") {
  const q = g.question.question.replace(/\?\s*$/, "");
  return g.channel === "company" ? `Company content: ${q}` : `Answer it as ${first}: ${q}`;
}

// ---------- tracked profiles (db/017) ----------
// A workspace can track several people, each with their company and LinkedIn profile. A profile holds its own
// entities, prompts, runs, facts, recommendations, prompt groups and share links. Each user picks the one they look
// at; a pick that is gone or archived falls back to the first live profile.
export type Profile = { id: string; name: string; archived_at: string | null; sort: number; created_at: string; dismissed_peers?: string[] | null };
/** Matches no row: what queries use when profiles exist but none is live, so nothing from another profile shows. */
export const NO_PROFILE = "00000000-0000-0000-0000-000000000000";

const byOrder = (a: Profile, b: Profile) => a.sort - b.sort || (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0);
export const liveProfiles = (ps: Profile[]) => ps.filter((p) => !p.archived_at).sort(byOrder);
export const archivedProfiles = (ps: Profile[]) => ps.filter((p) => !!p.archived_at).sort((a, b) => (a.archived_at! < b.archived_at! ? 1 : -1));

export function currentProfile(ps: Profile[], pick: string | null | undefined): Profile | null {
  const live = liveProfiles(ps);
  return live.find((p) => p.id === pick) ?? live[0] ?? null;
}

/** The profile queries are limited to: null before db/017 (nothing is scoped yet), NO_PROFILE when none is live. */
export const profileScope = (legacy: boolean, current: Profile | null) => (legacy ? null : current?.id ?? NO_PROFILE);
export const scoped = <Q extends { eq: (col: string, v: string) => Q }>(q: Q, scope: string | null) => (scope ? q.eq("profile_id", scope) : q);
export const withProfile = <T extends object>(row: T, scope: string | null): T & { profile_id?: string } => (scope && scope !== NO_PROFILE ? { ...row, profile_id: scope } : row);
/** The same tag on a Content Studio idea made from AI citations (posts.citation_profile_id). */
export const postProfile = (scope: string | null): { citation_profile_id?: string } => (scope && scope !== NO_PROFILE ? { citation_profile_id: scope } : {});

/** A profile is named after who it tracks; the same rule as citation_profile_name() in db/017. */
export function profileName(person: string, company: string, fallback: string) {
  return [person, company].map((x) => x.trim()).filter(Boolean).join(", ") || fallback.trim() || "Tracked profile";
}
export const NEW_PROFILE_NAME = "New tracked profile";
export const nextSort = (ps: Profile[]) => ps.reduce((m, p) => Math.max(m, p.sort), -1) + 1;
/** Delete needs the name typed out; spaces at the ends and letter case do not matter (same check as the SQL). */
export const deleteConfirmed = (typed: string, name: string) => !!name.trim() && typed.trim().toLowerCase() === name.trim().toLowerCase();

/** Gap topics in Content Studio carry the profile they came from; untagged ones (made before db/017) show everywhere. */
export const inProfile = (row: { citation_profile_id?: string | null }, scope: string | null) => !scope || !row.citation_profile_id || row.citation_profile_id === scope;

/** What db/017 does to existing rows: each row lands in its workspace's default profile, except a run, which follows
 *  its prompt. Rows that already have a profile are left alone. Mirrors the SQL so the mapping is tested offline. */
export function migrateRows<R extends { workspace_id: string; profile_id?: string | null; question_id?: string | null; id?: string }>(rows: { table: string; row: R }[], defaults: Record<string, string>) {
  const qProfile = new Map<string, string>();
  for (const { table, row } of rows) if (table === "citation_questions" && row.id) qProfile.set(row.id, row.profile_id || defaults[row.workspace_id]);
  return rows.map(({ table, row }) => {
    if (row.profile_id) return { table, row };
    const pid = (table === "citation_runs" && row.question_id && qProfile.get(row.question_id)) || defaults[row.workspace_id];
    return { table, row: { ...row, profile_id: pid } };
  });
}
