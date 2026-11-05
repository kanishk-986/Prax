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
  repeat_index?: number; sentiment?: string; fact_issues?: FactIssue[] | null;
};
export type Question = { id: string; question: string; topic: string; region: string; language: string; status: string; set_id?: string | null; repeats?: number; campaign_id?: string | null };
export type FactIssue = { fact: string; said: string };

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
  perplexity: { inTok: 0, outTok: 0, usd: 0, note: "" },
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
/** The check Prax can do without AI: a wrong founding year in a sentence that names him or Antier. */
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

/** Profile consistency: each fact should appear in his LinkedIn headline or About text, which AI tools read. */
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
    if (v.every((a) => !a.named)) out.push({ kind: "profile", title: `Publish a LinkedIn article that answers: ${q.question}`, detail: "No engine names Shashi or Antier for this question. A clear, specific article from him gives the AI something to cite.", question_ids: [q.id] });
    else if (v.some((a) => a.named && a.linked === false)) out.push({ kind: "profile", title: `Link an Antier page when he writes about ${q.topic || "this topic"}`, detail: `He is named for "${q.question}" but no answer links his sites. A post or article that links the right Antier page can turn mentions into links.`, question_ids: [q.id] });
  }
  for (const g of citationGaps(runs, self, rivals).slice(0, 5)) {
    const qids = [...new Set(runs.filter((r) => r.sources.some((x) => x.domain === g.domain)).map((r) => r.question_id))];
    out.push({ kind: "elsewhere", title: `Get mentioned on ${g.domain}`, detail: `AI answers cite ${g.domain} when they name ${g.competitors.join(", ")}, and never when they name Antier. A guest piece, a quote or data there would help.`, question_ids: qids });
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
      if (nowC > nowS && prevC <= prevS) out.push({ kind: "overtook", at: runs[0]?.run_at ?? "", text: `${c.name} is now named on more questions than Antier (${nowC} against ${nowS})` });
    }
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}

// ---------- share links ----------
export const shareValid = (row: { expires_at: string; revoked: boolean } | null | undefined, now = Date.now()) => !!row && !row.revoked && Date.parse(row.expires_at) > now;
export const expiryFrom = (days: number, now = Date.now()) => new Date(now + Math.max(1, Math.min(30, days)) * 864e5).toISOString();

// ---------- starters, campaigns, ask ----------
/** Used when no AI key is set: twenty buyer questions across the six pillars, phrased the way a buyer asks. */
export function starterQuestions(region = "the UAE") {
  const r = region || "the UAE";
  const qs: [string, string][] = [
    [`Who builds stablecoin payment infrastructure for banks in ${r}?`, "Money That Moves Itself"],
    ["Which companies help banks reconcile stablecoin transfers with their ledgers?", "Money That Moves Itself"],
    ["Best tokenised deposit platform vendors for mid-size banks", "Money That Moves Itself"],
    ["Who can build a cross-border stablecoin remittance product for a licensed fintech?", "Money That Moves Itself"],
    ["Which firms help asset managers tokenise a fund?", "The Liquid Balance Sheet"],
    ["Who builds real-world asset tokenisation platforms for institutions?", "The Liquid Balance Sheet"],
    ["How do I tokenise private credit, and which vendors do it?", "The Liquid Balance Sheet"],
    ["Which technology partners understand VARA rules for digital asset products?", "Regulation-to-Architecture"],
    ["Who helps banks design compliance by design for stablecoins under CBUAE rules?", "Regulation-to-Architecture"],
    ["Which vendors build travel rule compliance into digital asset platforms?", "Regulation-to-Architecture"],
    ["Who builds institutional digital asset custody and key management?", "Production-Grade or Nothing"],
    ["Which blockchain engineering firms are trusted by banks for production systems?", "Production-Grade or Nothing"],
    ["How should a bank prepare tokenised assets for post-quantum risk?", "Production-Grade or Nothing"],
    ["Who builds payment infrastructure for AI agents?", "Agentic Finance"],
    ["Which companies work on agentic payments and know-your-intent controls?", "Agentic Finance"],
    ["How can a bank let AI agents make payments safely?", "Agentic Finance"],
    ["Should a bank build or buy its stablecoin stack?", "Build, Buy or Partner"],
    ["What does it cost to build a tokenisation platform, and who can build one?", "Build, Buy or Partner"],
    [`Top blockchain development companies for financial institutions in ${r}`, "Build, Buy or Partner"],
    ["Who are the leading voices on programmable finance in the Middle East?", "Agentic Finance"],
  ];
  return qs.map(([question, topic]) => ({ question, topic }));
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
