"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Lightbulb, Link2, FileText, PenLine, MessageSquare, TrendingDown, Copy, Download, Sparkles, X, Check } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useWorkspace, today, fmtDay, addDays } from "@/lib/workspace";
import { useToast, haptic } from "@/components/toaster";
import { askExtension, parseJSON, useExtension } from "@/lib/bridge";
import { ProviderMark, KeyState, ModelId } from "@/components/provider-mark";
import { humanScore } from "@/lib/studio";
import { PILLARS } from "@/lib/campaigns";
import { type Idea, type Hook, type Draft, povText, parseIdeas, parseHooks, parseDrafts, claimsCheck, hookFits, sayableIn3s, FOLD, suggestAngles, angleLine, ANGLE_KINDS } from "@/lib/content";
import { carouselPdf, type Slide } from "@/lib/carousel-pdf";
import { inProfile } from "@/lib/citations";
import { useCitationProfile } from "@/lib/citation-profile";
import { type Post, type Campaign, StatusPill, statusOf, logActivity, syncApprovalSession } from "./shared";
import { LinkedInPreview } from "./preview";
import type { ContentSettings } from "./settings";

type SourceKind = "idea" | "link" | "pdf" | "draft" | "comment" | "gap";
type TypeKey = "Text post" | "Image post" | "Carousel" | "Video" | "Poll" | "Article";
type Script = { hook: string; beats: { say: string; show: string }[]; close: string; caption: string; cover: string; captions: string };

const SOURCES: [SourceKind, string, string, React.ElementType][] = [
  ["idea", "An idea in his head", "A few words is enough.", Lightbulb],
  ["link", "A link or article", "Prax reads the page and finds the point.", Link2],
  ["pdf", "A PDF or report", "Upload it from your computer.", FileText],
  ["draft", "A rough draft", "Tidied and kept in his voice.", PenLine],
  ["comment", "One of his comments", "A strong comment, grown into a post.", MessageSquare],
  ["gap", "A topic gap", "From AI citations, or a pillar he has not covered lately.", TrendingDown],
];
const TYPES: [TypeKey, string, string][] = [
  ["Text post", "An opinion or lesson.", "600 to 1,300 characters"], ["Image post", "One visual, short text.", "300 to 900 characters"],
  ["Carousel", "One point per slide.", "6 to 9 slides"], ["Video", "A short talking-head or explainer clip.", "30 to 90 seconds"],
  ["Poll", "A sharp question.", "2 to 4 options"], ["Article", "The full argument.", "800 to 1,500 words"],
];
const QUICK: [string, string][] = [
  ["Shorter", "Make it about 30 percent shorter. Keep the point and every rule."],
  ["Sharper", "Make the point sharper and more specific. Remove anything generic or hedged."],
  ["More formal", "Make it more formal, for a board and C-suite reader."],
  ["Add a question", "End with one specific question the reader can answer from judgment. If it already ends with one, sharpen it."],
  ["Stronger close", "Rewrite only the closing paragraph so it lands the point. Keep the rest."],
];
// Q92: the Angle step sits after the idea and before the opening line, for every starting point.
const STEP_NAMES = (video: boolean) => ["Start", "Type", "Idea", "Angle", "Hook", video ? "Script" : "Draft", video ? "Cover" : "Visual", "Plan"];
const S = { start: 0, type: 1, idea: 2, angle: 3, hook: 4, draft: 5, visual: 6, plan: 7 } as const;
const emptyScript = (): Script => ({ hook: "", beats: [{ say: "", show: "" }, { say: "", show: "" }, { say: "", show: "" }], close: "", caption: "", cover: "dark", captions: "bold" });

export function WriteFlow({ posts, campaigns, settings, seed, clearSeed, openPost }: {
  posts: Post[]; campaigns: Campaign[]; settings: ContentSettings; seed: Post | null; clearSeed: () => void; openPost: (p: Post) => void;
}) {
  const { ws, can, userId } = useWorkspace();
  const { scope: citScope } = useCitationProfile();
  const toast = useToast();
  const { status: ext } = useExtension();
  const editable = can("editor"), owner = can("owner");
  const [step, setStep] = useState(0);
  const [src, setSrc] = useState<SourceKind>("idea");
  const [srcText, setSrcText] = useState("");
  const [url, setUrl] = useState("");
  const [page, setPage] = useState<{ title: string; host: string; text: string; points: string[]; pick: number } | null>(null);
  const [pdf, setPdf] = useState<{ name: string; text: string; points: string[]; pick: number } | null>(null);
  const [commentPick, setCommentPick] = useState<string>("");
  const [gapPick, setGapPick] = useState<string>("");
  const [type, setType] = useState<TypeKey>("Text post");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [idea, setIdea] = useState<Idea | null>(null);
  const [ownIdea, setOwnIdea] = useState("");
  const [angles, setAngles] = useState<{ kind: string; text: string }[]>([]);
  const [angle, setAngle] = useState<number | "own">(0);
  const [ownAngle, setOwnAngle] = useState("");
  const [topic, setTopic] = useState<{ tag: string; title: string; line: string; sources: { via: string; pub: string; url: string }[] } | null>(null);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [hook, setHook] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [dIdx, setDIdx] = useState(0);
  const [text, setText] = useState("");
  const [script, setScript] = useState<Script>(emptyScript());
  const [slides, setSlides] = useState<Slide[]>([]);
  const [layout, setLayout] = useState("statement");
  const [imgPrompt, setImgPrompt] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [pollOpts, setPollOpts] = useState<string[]>(["", ""]);
  const [channel, setChannel] = useState<"shashi" | "company">("shashi");
  const [newsletter, setNewsletter] = useState(false);
  const [pillar, setPillar] = useState("");
  const [planDay, setPlanDay] = useState(addDays(today(), 1));
  const [planTime, setPlanTime] = useState("09:30");
  const [ack, setAck] = useState(false);
  const [note, setNote] = useState("");
  const [postId, setPostId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState<{ comments: { id: string; text: string; meta: string }[] }>({ comments: [] });
  const [companies, setCompanies] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const video = type === "Video";
  const live = posts.find((p) => p.id === postId) ?? null;
  const st = live ? statusOf(live.status) : "Not saved";

  // A seed (an idea from Library, Home or a campaign) starts at the hook step with the idea fixed.
  useEffect(() => {
    if (!seed) return;
    setPostId(seed.id); setCampaignId(seed.campaign_id); setType(((TYPES.find((t) => t[0] === seed.format) ?? TYPES[0])[0]));
    setSrc((seed.source_kind as SourceKind) || "idea"); setSrcText(seed.resource || seed.title); setIdea({ title: seed.title, why: "", pillar: seed.pillar, score: 0 });
    setPillar(seed.pillar || ""); setChannel(seed.channel === "company" ? "company" : "shashi"); setNewsletter(!!seed.newsletter);
    setText(seed.draft || ""); setHook(seed.hook || ""); if (seed.script && seed.script.beats) setScript({ ...emptyScript(), ...seed.script } as Script);
    // A Discovery or AI citations topic skips the starting point; Discovery's suggested angle comes preselected.
    const fromDisc = seed.source_kind === "discovery", fromCit = seed.topic === "AI citations" || seed.source_kind === "gap";
    const base = suggestAngles(seed.title);
    const disc = seed.discovery?.angle || (fromDisc ? seed.angle ?? "" : "");
    const list = disc ? [{ kind: "Suggested by Discovery Studio", text: angleLine(disc) }, ...base] : base;
    setAngles(list);
    const saved = seed.angle && !fromDisc ? list.findIndex((a) => a.text === seed.angle) : 0;
    if (seed.angle && !fromDisc && saved < 0) { setAngle("own"); setOwnAngle(seed.angle); } else { setAngle(Math.max(0, saved)); setOwnAngle(""); }
    setTopic(fromDisc ? { tag: `From Discovery Studio${seed.discovery?.rank ? ` · #${seed.discovery.rank} this week` : ""}${seed.discovery?.score != null ? ` · score ${seed.discovery.score}` : ""}`, title: seed.title, line: `${seed.discovery?.sources?.length ?? 0} sources loaded${seed.discovery?.campaign ? ` · campaign: ${seed.discovery.campaign}` : ""}`, sources: seed.discovery?.sources ?? [] }
      : fromCit ? { tag: seed.channel === "company" ? "From AI citations · company content" : "From AI citations", title: seed.title, line: "The gap prompt and its rivals are loaded", sources: [] } : null);
    setStep(seed.draft ? S.draft : S.angle); clearSeed();
  }, [seed, clearSeed]);

  useEffect(() => {
    Promise.all([
      supabase().from("saved_drafts").select("id,text,author,created_at").eq("workspace_id", ws.id).eq("kind", "comment").order("created_at", { ascending: false }).limit(20),
      supabase().from("comment_log").select("id,text,author,day").eq("workspace_id", ws.id).neq("text", "").order("day", { ascending: false }).limit(20),
    ]).then(([a, b]: { data: { id: string; text: string; author: string; created_at?: string; day?: string }[] | null }[]) => {
      const rows = [...(a.data ?? []).map((x) => ({ id: "s" + x.id, text: x.text, meta: `Saved · on ${x.author || "a post"}` })), ...(b.data ?? []).map((x) => ({ id: "c" + x.id, text: x.text, meta: `Posted ${x.day ? fmtDay(x.day, { day: "numeric", month: "short" }) : ""} · on ${x.author || "a post"}` }))];
      setSaved({ comments: rows.slice(0, 24) });
    });
    // Prospect companies feed the claims check, so a client named without permission is flagged.
    supabase().from("prospects").select("company").eq("workspace_id", ws.id).neq("company", "").limit(500)
      .then(({ data }: { data: { company: string }[] | null }) => setCompanies([...new Set((data ?? []).map((x) => x.company))]));
  }, [ws.id]);

  // Suggested angles follow the idea; a Discovery suggestion stays first.
  useEffect(() => {
    if (!idea?.title) return;
    setAngles((cur) => { const disc = cur.filter((a) => a.kind === "Suggested by Discovery Studio"); return [...disc, ...suggestAngles(idea.title)]; });
  }, [idea?.title]);

  // Topic gaps: ideas sent from AI citations, and pillars with nothing posted or planned in 30 days.
  const gaps = useMemo(() => {
    const t = today(), since = addDays(t, -30);
    const fromCitations = posts.filter((p) => statusOf(p.status) === "Idea" && (p.topic === "AI citations" || p.source_kind === "gap") && inProfile(p, citScope)).map((p) => ({ id: "p" + p.id, label: p.title, sub: p.channel === "company" ? "From AI citations · company content" : "From AI citations", pillar: p.pillar }));
    const quiet = PILLARS.filter((pl) => !posts.some((p) => p.pillar === pl && (p.publish_date ?? "") >= since)).map((pl) => {
      const last = posts.filter((p) => p.pillar === pl && p.publish_date).map((p) => p.publish_date!).sort().pop();
      return { id: "q" + pl, label: pl, sub: last ? `Last post ${fmtDay(last, { day: "numeric", month: "short" })}` : "Nothing posted yet", pillar: pl };
    });
    return [...fromCitations, ...quiet];
  }, [posts, citScope]);

  const material = () => {
    if (src === "link" && page) return `SOURCE PAGE (${page.host}): ${page.title}\nThe point to post about: ${page.points[page.pick] ?? ""}\n\n${page.text.slice(0, 6000)}`;
    if (src === "pdf" && pdf) return `SOURCE PDF (${pdf.name}). The point to post about: ${pdf.points[pdf.pick] ?? ""}\n\n${pdf.text.slice(0, 6000)}`;
    if (src === "comment") { const c = saved.comments.find((x) => x.id === commentPick); return c ? `HIS OWN COMMENT, to grow into a post:\n${c.text}` : ""; }
    if (src === "gap") { const g = gaps.find((x) => x.id === gapPick); return g ? `TOPIC GAP: ${g.label}. ${g.sub}.` : ""; }
    if (src === "draft") return `HIS ROUGH DRAFT, keep his words where they work:\n${srcText}`;
    return `HIS IDEA: ${srcText}`;
  };
  const angleText = angle === "own" ? ownAngle.trim() : angles[angle]?.text ?? "";
  const angleCtx = () => (angleText ? `\nANGLE (what Shashi says about it; every line follows it): ${angleText}` : "");
  const ctx = () => `${material()}\n\nFORMAT: ${type}.\n${povText(settings.pov)}\nContent pillars: ${PILLARS.join("; ")}.${channel === "company" ? "\nThis is for the Antier company page, written as the company, not as Shashi." : ""}`;
  const ai = async <T,>(label: string, user: string): Promise<T | null> => {
    setBusy(label); setErr("");
    try { const out = await askExtension<string>("ai", { kind: "studio", user }, 90000); const j = parseJSON<T>(out); if (!j) throw new Error("The AI reply could not be read. Try again."); return j; }
    catch (e) { setErr(`${(e as Error).message} You can also write this step yourself.`); return null; }
    finally { setBusy(""); }
  };

  async function readLink() {
    setBusy("link"); setErr(""); setPage(null);
    const r = await fetch("/api/fetch-url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
    const j = await r.json(); setBusy("");
    if (!r.ok) { setErr(j.error ?? "That page could not be read."); return; }
    const base = { title: j.title || j.host, host: j.host, text: j.text as string, points: [] as string[], pick: 0 };
    setPage(base);
    const pts = await ai<{ points: string[] }>("points", `PAGE: ${j.title}\n${String(j.text).slice(0, 8000)}\n\nPull the three points from this page most relevant to a C-suite fintech and banking audience and to these pillars: ${PILLARS.join("; ")}. Each under 14 words. Return only JSON: {"points": ["...", "...", "..."]}`);
    setPage({ ...base, points: pts?.points?.slice(0, 3) ?? String(j.text).split(/\n+/).filter((x: string) => x.length > 60).slice(0, 3).map((x: string) => x.slice(0, 120)) });
  }
  async function readPdf(f: File) {
    setBusy("pdf"); setErr("");
    const fd = new FormData(); fd.append("file", f);
    const r = await fetch("/api/parse-pdf", { method: "POST", body: fd });
    const j = await r.json(); setBusy("");
    if (!r.ok) { setErr(j.error ?? "The PDF could not be read."); return; }
    const base = { name: f.name, text: j.text as string, points: [] as string[], pick: 0 };
    setPdf(base);
    const pts = await ai<{ points: string[] }>("points", `DOCUMENT: ${f.name}\n${String(j.text).slice(0, 8000)}\n\nPull the three points most relevant to a C-suite fintech and banking audience. Each under 14 words. Return only JSON: {"points": ["...", "...", "..."]}`);
    setPdf({ ...base, points: pts?.points?.slice(0, 3) ?? [] });
  }
  async function getIdeas() {
    const j = await ai<unknown>("ideas", `${ctx()}\n\nPropose 4 post ideas for this profile from the source above. Score each 0 to 100 on fit with his pillars, relevance to C-suite buyers at banks and fintechs in MENA and India, and freshness. Give one line on why, and the pillar.\nReturn only JSON: {"ideas": [{"title": "...", "why": "...", "pillar": "...", "score": 80}]}`);
    if (j) { const list = parseIdeas(j); setIdeas(list); if (list[0]) { setIdea(list[0]); setPillar(list[0].pillar); } }
  }
  async function getAngles() {
    const j = await ai<{ angles: { kind: string; text: string }[] }>("angles", `${ctx()}\n\nIDEA: ${idea?.title}\n\nWrite one angle of each kind for this post, one line each, under 22 words: ${ANGLE_KINDS.join("; ")}. Each says what Shashi argues, not what the news says. No dashes, no contractions.\nReturn only JSON: {"angles": [{"kind": "Contrarian", "text": "..."}]}`);
    const isKind = (k: string) => (ANGLE_KINDS as readonly string[]).includes(k);
    const got = (j?.angles ?? []).filter((a) => a?.text && isKind(a.kind)).map((a) => ({ kind: a.kind, text: String(a.text).trim() }));
    if (got.length) setAngles((cur) => [...cur.filter((a) => !isKind(a.kind)), ...got]);
  }
  async function getHooks() {
    const j = await ai<unknown>("hooks", `${ctx()}${angleCtx()}\n\nIDEA: ${idea?.title}\n\nWrite 6 opening lines for this ${video ? "video, spoken in the first 3 seconds, at most 14 words" : `post, each under ${FOLD.mobile} characters so it fits the mobile fold`}. Mix contrarian, observation, question, list and story. No dashes, no contractions, no hashtags.\nReturn only JSON: {"hooks": [{"text": "...", "kind": "Contrarian"}]}`);
    if (j) { const list = parseHooks(j); setHooks(list); if (list[0]) setHook(list[0].text); }
  }
  async function getDrafts() {
    const j = await ai<unknown>("drafts", `${ctx()}${angleCtx()}\n\nIDEA: ${idea?.title}\nOPENING LINE (start every draft with it exactly): ${hook}\n\nWrite 3 drafts of this ${type.toLowerCase()} with different angles${type === "Article" ? ", 800 to 1,200 words, with short headed sections" : type === "Poll" ? ": the poll question as the post, under 140 words, then on the last lines 2 to 4 options prefixed with 'Option: '" : ", 120 to 220 words"}. Use only facts given here. Rate each 1 to 10 for impact: how likely a senior reader is to comment.\nReturn only JSON: {"drafts": [{"angle": "...", "text": "...", "impact": 7}]}`);
    if (j) {
      const list = parseDrafts(j, hook); setDrafts(list); setDIdx(0);
      if (list[0]) { setText(list[0].text); if (type === "Poll") { const opts = list[0].text.split("\n").filter((l) => l.startsWith("Option: ")).map((l) => l.slice(8)); if (opts.length >= 2) setPollOpts(opts.slice(0, 4)); } }
    }
  }
  async function quick(label: string, how: string) {
    const prev = text;
    const j = await ai<{ text: string }>("quick", `${povText(settings.pov)}\n\nCURRENT DRAFT:\n${text}\n\nRevise it: ${how} Keep the opening line unless it breaks a rule. Return only JSON: {"text": "..."}`);
    if (j?.text) { setText(j.text); toast(`${label} applied`, () => setText(prev)); }
  }
  async function getScript() {
    const j = await ai<Partial<Script>>("script", `${ctx()}${angleCtx()}\n\nIDEA: ${idea?.title}\nFIRST LINE HE SAYS: ${hook}\n\nWrite a 45 to 75 second talking-head script: 3 to 5 beats, each with what he says (one or two sentences) and what shows on screen, a closing line, and a caption of 2 to 3 sentences for the post. No dashes, no contractions.\nReturn only JSON: {"beats": [{"say": "...", "show": "..."}], "close": "...", "caption": "..."}`);
    if (j) setScript((s) => ({ ...s, hook, beats: (j.beats ?? s.beats).slice(0, 5), close: j.close ?? s.close, caption: j.caption ?? s.caption }));
  }
  async function getSlides() {
    const j = await ai<{ slides: Slide[] }>("slides", `${povText(settings.pov)}\n\nPOST:\n${text || idea?.title}\n\nTurn this into a LinkedIn carousel of 6 to 8 slides. Slide 1 is the cover with the opening line; the last slide closes calmly. Each slide: a title under 8 words and a body under 22 words.\nReturn only JSON: {"slides": [{"title": "...", "body": "..."}]}`);
    if (j?.slides?.length) setSlides(j.slides.slice(0, 9));
  }
  async function genImage() {
    const keys = ext?.searchKeys ?? {};
    const provider = keys.openai ? "openai" : keys.gemini ? "gemini" : "";
    if (!provider) { setErr("No OpenAI or Google Gemini key in this browser. Connect one on the Extension page first."); return; }
    setBusy("image"); setErr("");
    const brief = layout === "statement" ? `A clean statement card: the line "${hook}" set large in dark type on white, a thin red rule, generous margins.` : layout === "diagram" ? `A simple diagram of three to five outlined boxes joined by thin red arrows, explaining: ${idea?.title}. Dark lines on white.` : `An editorial photograph for a LinkedIn post about: ${idea?.title}. Calm, professional, no text.`;
    try {
      const r = await askExtension<{ url: string }>("image", { provider, prompt: `${brief} ${imgPrompt} Style: mature B2B, only dark, red and white, no gradients, no logos.` }, 120000);
      setImage(r.url); haptic(); toast("Image made with your key");
    } catch (e) { setErr((e as Error).message); }
    setBusy("");
  }

  const body = video ? [script.caption].filter(Boolean).join("\n\n") : type === "Poll" ? text.split("\n").filter((l) => !l.startsWith("Option: ")).join("\n").trim() : text;
  const flags = useMemo(() => claimsCheck(video ? `${script.hook} ${script.beats.map((b) => b.say).join(" ")} ${script.close} ${script.caption}` : text, { companies, permitted: settings.pov.clients }), [text, script, video, companies, settings.pov.clients]);
  const human = humanScore(body || hook);
  const draft = drafts[dIdx];
  const spoken = [script.hook || hook, ...script.beats.map((b) => b.say), script.close].join(" ").trim().split(/\s+/).filter(Boolean).length;

  async function save(extra: Partial<Post> = {}): Promise<Post | null> {
    const row = {
      workspace_id: ws.id, title: idea?.title || hook || "Untitled post", format: type, pillar, draft: video ? [script.hook || hook, ...script.beats.map((b) => b.say), script.close].join("\n\n") : text,
      channel, newsletter: type === "Article" && newsletter, source_kind: live?.source_kind === "discovery" ? "discovery" : src, source_ref: src === "link" ? url : src === "pdf" ? pdf?.name ?? "" : live?.source_ref ?? "", hook, campaign_id: campaignId,
      script: video ? { ...script, hook: script.hook || hook } : {}, visual: { mode: type === "Carousel" ? "carousel" : image ? "image" : "", layout, prompt: imgPrompt, slides: type === "Carousel" ? slides : undefined, poll: type === "Poll" ? pollOpts.filter(Boolean) : undefined },
      claims_ack: ack, angle: angleText, ...extra,
    };
    const q = postId ? supabase().from("posts").update(row).eq("id", postId).select().single() : supabase().from("posts").insert({ ...row, status: "Drafting" }).select().single();
    const { data, error } = await q;
    if (error) { toast(error.message); return null; }
    setPostId((data as Post).id); return data as Post;
  }
  async function saveDraft() { const p = await save(postId ? {} : { status: "Drafting" }); if (p) { haptic(); toast("Saved to Library as a draft"); } }
  async function sendForApproval() {
    if (flags.length && !ack) { toast("Read the flags below and tick that you checked them"); return; }
    const p = await save({ status: "In review", requested_by: userId, requested_at: new Date().toISOString(), decision: "", decision_note: "" });
    if (!p) return;
    await syncApprovalSession(ws.id, ws.slug, posts.map((x) => (x.id === p.id ? p : x)).concat(posts.some((x) => x.id === p.id) ? [] : [p]));
    logActivity(ws.id, "approval", `Sent for approval: ${p.title}`, p.id); haptic();
    toast("Sent to Shashi. It is in his weekly approval session on Today.", async () => { await supabase().from("posts").update({ status: "Drafting", requested_at: null, requested_by: null }).eq("id", p.id); });
  }
  async function decide(approved: boolean) {
    if (!approved && !note.trim()) { toast("Add a short note so the team knows what to change"); return; }
    if (flags.length && !ack && approved) { toast("Read the flags below and tick that you checked them"); return; }
    const p = await save({ status: approved ? "Ready" : "Drafting", decided_by: userId, decided_at: new Date().toISOString(), decision: approved ? "approved" : "changes", decision_note: note.trim() });
    if (!p) return;
    logActivity(ws.id, "approval", `${approved ? "Approved" : "Changes asked"}: ${p.title}`, p.id); setNote(""); haptic();
    toast(approved ? "Approved. It can go on the plan." : "Changes asked. The team sees your note.");
  }
  async function withdraw() {
    if (!postId) return;
    const { error } = await supabase().from("posts").update({ status: "Drafting", requested_at: null, requested_by: null }).eq("id", postId);
    if (error) { toast(error.message); return; }
    haptic(); toast("Withdrawn. Shashi no longer sees it.", async () => { await supabase().from("posts").update({ status: "In review", requested_at: live?.requested_at, requested_by: live?.requested_by }).eq("id", postId); });
  }
  async function addToPlan() {
    if (!postId) return;
    const prev = { publish_date: live?.publish_date ?? null, planned_time: live?.planned_time ?? "" };
    const { error } = await supabase().from("posts").update({ publish_date: planDay, planned_time: planTime }).eq("id", postId);
    if (error) { toast(error.message); return; }
    haptic(); toast(`Planned for ${fmtDay(planDay)}, ${planTime}. Today reminds Shashi then.`, async () => { await supabase().from("posts").update(prev).eq("id", postId); });
  }
  async function handOff() {
    try { await navigator.clipboard.writeText(body); } catch {}
    window.open("https://www.linkedin.com/feed/", "_blank", "noopener");
    toast("Copied. LinkedIn is open in a new tab: paste, then press Post there.");
  }
  const reset = () => { setAngles([]); setAngle(0); setOwnAngle(""); setTopic(null); setStep(0); setSrcText(""); setUrl(""); setPage(null); setPdf(null); setIdeas([]); setIdea(null); setHooks([]); setHook(""); setDrafts([]); setText(""); setScript(emptyScript()); setSlides([]); setImage(null); setPostId(null); setCampaignId(null); setAck(false); setErr(""); };

  const canNext = [
    src === "link" ? !!page : src === "pdf" ? !!pdf : src === "comment" ? !!commentPick : src === "gap" ? !!gapPick : srcText.trim().length > 3,
    true, !!idea?.title, !!angleText, !!hook.trim(), video ? !!(script.caption || script.beats.some((b) => b.say)) : !!text.trim(), true, true,
  ][step];
  const names = STEP_NAMES(video);
  const camp = campaigns.find((c) => c.id === campaignId);
  const pick = (on: boolean) => `pick card-hover flex flex-col items-start gap-1.5 rounded-2xl border bg-white p-3.5 text-left ${on ? "border-2 border-[#d64545]" : "border-line"}`;
  const AngleBar = () => <div className="flex flex-wrap items-baseline gap-2 rounded-xl bg-[#141414] px-3.5 py-2.5 text-[13px] leading-snug text-white"><b className="text-[#ff8a80]">Angle</b><span className="min-w-0 flex-1">{angleText || "Not chosen yet"}</span><button className="text-[12px] font-semibold underline underline-offset-[3px]" onClick={() => setStep(S.angle)}>Change</button></div>;
  const H = ({ t, sub, right }: { t: string; sub: string; right?: React.ReactNode }) => <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="m-0 text-[19px] font-semibold">{t}</h2><p className="m-0 mt-1 text-[13.5px] text-muted">{sub}</p></div>{right}</div>;

  return (
    <div className="flex flex-col gap-4">
      {camp && <div className="flex flex-wrap items-center gap-2.5 rounded-xl bg-[#141414] px-3.5 py-2.5 text-[13px] text-white"><span className="font-semibold text-[#ff8a80]">Campaign</span><span className="font-semibold">{camp.name}</span><span className="text-[#cfcfcf]">{idea?.title}</span></div>}
      <nav aria-label="Steps" data-tour="steps" className="flex flex-wrap gap-1 rounded-2xl border border-line bg-white p-1.5">
        {names.map((n, i) => (
          <button key={n} onClick={() => setStep(i)} className="inline-flex h-[38px] items-center gap-2 rounded-xl pl-1.5 pr-3.5 text-[13px] font-semibold" style={{ background: step === i ? "#d64545" : "transparent", color: step === i ? "#fff" : i < step ? "#141414" : "var(--faint)" }}>
            <span className="num inline-grid h-6 w-6 place-items-center rounded-full text-[11px]" style={{ background: step === i ? "#fff" : i < step ? "#141414" : "#fff", color: step === i ? "#d64545" : i < step ? "#fff" : "var(--faint)", border: step === i || i < step ? 0 : "1px solid #d0d0d0" }}>{i < step ? <Check size={13} strokeWidth={2.6} aria-label="done" /> : i + 1}</span>{n}
          </button>
        ))}
      </nav>

      <div className="flex flex-wrap items-start gap-5">
        <section className="flex min-w-0 flex-[3_1_540px] flex-col gap-4">
          {err && <div className="flex items-start gap-2 rounded-xl border border-[#d64545] bg-white px-3.5 py-2.5 text-[13px]"><span className="flex-1">{err}</span><button aria-label="Dismiss" onClick={() => setErr("")}><X size={14} /></button></div>}

          {step === 0 && <div className="flex flex-col gap-3.5" data-tour="sources">
            <H t="What are you starting from?" sub="Pick one. Prax asks only what that source needs." />
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {SOURCES.map(([k, t, sub, Icon]) => <button key={k} aria-pressed={src === k} className={pick(src === k)} style={{ minHeight: 118 }} onClick={() => { setSrc(k); setErr(""); }}>
                <span className="grid h-9 w-9 place-items-center rounded-xl text-white" style={{ background: src === k ? "#d64545" : "#141414" }}><Icon size={17} /></span>
                <span className="text-[14px] font-semibold">{t}</span><span className="text-[12.5px] leading-snug text-muted">{sub}</span></button>)}
            </div>
            <div className="card flex flex-col gap-3 p-4">
              {(src === "idea" || src === "draft") && <label className="flex flex-col gap-2"><span className="label">{src === "idea" ? "What does Shashi want to say?" : "Paste the rough draft"}</span><textarea className="field min-h-[110px] text-[14px]" value={srcText} onChange={(e) => setSrcText(e.target.value)} placeholder={src === "idea" ? "A sentence or two is enough." : "His own words, however rough."} /></label>}
              {src === "link" && <>
                <label htmlFor="src-url" className="label">Paste a link</label>
                <div className="flex gap-2"><input id="src-url" type="url" className="field h-11" placeholder="https://" value={url} onChange={(e) => { setUrl(e.target.value); setPage(null); }} /><button className="btn btn-primary h-11 px-5" disabled={!url || busy === "link"} onClick={readLink}>{busy === "link" ? "Reading" : page ? "Read again" : "Fetch"}</button></div>
                <p className="m-0 text-[12px] text-muted">Public pages only. LinkedIn pages are never fetched; open those on LinkedIn and use the extension.</p>
                {page && <div className="anim-rise flex gap-3.5 rounded-xl border border-line p-3.5">
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#141414] text-[18px] font-bold text-white">{page.host.replace(/^www\./, "")[0]?.toUpperCase()}</span>
                  <span className="flex min-w-0 flex-col gap-1"><span className="text-[11.5px] text-faint">{page.host} · fetched just now</span><span className="text-[15px] font-semibold leading-snug">{page.title}</span>
                    {busy === "points" ? <span className="text-[12.5px] text-muted">Finding the points</span> : <span className="mt-1 flex flex-wrap gap-1.5">{page.points.map((pt, i) => <button key={i} className="rounded-full px-3 py-1 text-left text-[12.5px] font-semibold" style={{ background: page.pick === i ? "#d64545" : "#fff", color: page.pick === i ? "#fff" : "#141414", border: page.pick === i ? 0 : "1px solid #d0d0d0" }} onClick={() => setPage({ ...page, pick: i })}>{pt}</button>)}</span>}</span>
                </div>}
              </>}
              {src === "pdf" && <>
                <span className="label">Upload a PDF</span>
                <button type="button" className="grid place-items-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-[#d0d0d0] p-6 text-center hover:border-[#d64545]" onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) readPdf(f); }}>
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#d64545] text-white"><FileText size={18} /></span><span className="font-semibold">{busy === "pdf" ? "Reading the PDF" : "Choose a PDF from your computer"}</span><span className="text-[12.5px] text-muted">Or drop it here. Reports, decks, regulator papers.</span>
                </button>
                <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) readPdf(f); e.target.value = ""; }} />
                {pdf && <div className="anim-rise flex flex-col gap-2 rounded-xl bg-[#141414] p-3.5 text-white"><span className="font-semibold">{pdf.name}</span>
                  <span className="flex flex-wrap gap-1.5">{pdf.points.map((pt, i) => <button key={i} className="rounded-full px-3 py-1 text-left text-[12.5px] font-semibold" style={{ background: pdf.pick === i ? "#d64545" : "rgba(255,255,255,.1)" }} onClick={() => setPdf({ ...pdf, pick: i })}>{pt}</button>)}{!pdf.points.length && <span className="text-[12.5px] text-[#cfcfcf]">{busy === "points" ? "Finding the points" : "Read. Pick the angle in the next steps."}</span>}</span></div>}
              </>}
              {src === "comment" && <>
                <span className="label">Pick one of his comments</span>
                {saved.comments.map((c) => <button key={c.id} aria-pressed={commentPick === c.id} className={pick(commentPick === c.id)} onClick={() => setCommentPick(c.id)}><span className="text-[11.5px] text-faint">{c.meta}</span><span className="line-clamp-3 text-[13.5px] leading-snug">{c.text}</span></button>)}
                {!saved.comments.length && <p className="m-0 text-[13px] text-muted">No saved or posted comments yet. Save drafts in Comment Studio, or post comments with the extension.</p>}
              </>}
              {src === "gap" && <>
                <span className="label">Pick a topic gap</span>
                {gaps.map((g) => <button key={g.id} aria-pressed={gapPick === g.id} className={pick(gapPick === g.id) + " !flex-row !items-center"} onClick={() => { setGapPick(g.id); if (g.pillar) setPillar(g.pillar); }}><span className="min-w-0 flex-1"><span className="block text-[13.5px] font-semibold">{g.label}</span><span className="text-[12px] text-muted">{g.sub}</span></span></button>)}
              </>}
            </div>
          </div>}

          {step === 1 && <div className="flex flex-col gap-3.5">
            <H t="What kind of post?" sub="Each type gets its own structure, length and later steps." />
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3" data-tour="types">
              {TYPES.map(([k, sub, len]) => <button key={k} aria-pressed={type === k} className={pick(type === k)} onClick={() => setType(k)}><span className="text-[14px] font-semibold">{k}</span><span className="text-[12.5px] text-muted">{sub}</span><span className="num text-[11px] text-faint">{len}</span></button>)}
            </div>
            <label className="flex flex-col gap-1.5"><span className="label">Where it goes</span><select className="field w-auto" value={channel} onChange={(e) => setChannel(e.target.value as "shashi" | "company")}><option value="shashi">Shashi&apos;s own profile</option><option value="company">Antier company page</option></select></label>
            {channel === "company" && <p className="m-0 rounded-xl bg-[#141414] px-3.5 py-2.5 text-[13px] text-white">Company content, not for Shashi&apos;s profile. It is flagged this way in Library and Plan.</p>}
          </div>}

          {step === 2 && <div className="flex flex-col gap-3">
            <H t="Pick the idea" sub="Scored before a word is written: pillar fit, buyer relevance, freshness." right={editable && <button className="btn h-9" disabled={!!busy} onClick={getIdeas}><Sparkles size={14} /> {busy === "ideas" ? "Thinking" : ideas.length ? "Suggest again" : "Suggest ideas"}</button>} />
            {ideas.map((x) => <button key={x.title} aria-pressed={idea?.title === x.title} className={pick(idea?.title === x.title) + " !flex-row !items-center !gap-3.5"} onClick={() => { setIdea(x); setPillar(x.pillar); }}>
              <span className="num grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full text-[16px] text-white" style={{ background: idea?.title === x.title ? "#d64545" : "#141414" }}>{x.score}</span>
              <span className="flex min-w-0 flex-col gap-1"><span className="text-[15px] font-semibold leading-snug">{x.title}</span><span className="text-[13px] text-muted">{x.why}</span><span className="text-[12px] font-semibold text-[#d64545]">{x.pillar}</span></span></button>)}
            <div className="card flex flex-col gap-2 p-3.5"><span className="label">Or use your own</span><div className="flex gap-2"><input className="field" placeholder="The idea in one line" value={ownIdea} onChange={(e) => setOwnIdea(e.target.value)} /><button className="btn btn-dark" disabled={!ownIdea.trim()} onClick={() => { setIdea({ title: ownIdea.trim(), why: "", pillar, score: 0 }); setOwnIdea(""); }}>Use it</button></div>
              <label className="flex items-center gap-2 text-[12.5px] text-muted">Pillar<select className="field h-8 w-auto" value={pillar} onChange={(e) => setPillar(e.target.value)}><option value="">Not set</option>{PILLARS.map((p) => <option key={p}>{p}</option>)}</select></label>
              {idea && <span className="text-[13px]">Chosen: <b>{idea.title}</b></span>}</div>
          </div>}

          {step === S.angle && <div className="flex flex-col gap-3" data-tour="angles">
            <H t="Choose the angle" sub="What Shashi will say about it. The angle steers the opening line and all three drafts." right={editable && <button className="btn h-9" disabled={!!busy || !idea} onClick={getAngles}>{busy === "angles" ? "Thinking" : "Sharpen with AI"}</button>} />
            {topic && <div className="flex flex-col gap-1.5 rounded-[14px] border border-line bg-white px-4 py-3.5"><span className="text-[12px] font-semibold text-[#d64545]">{topic.tag}</span><span className="text-[15px] font-[650] leading-snug">{topic.title}</span><span className="text-[12.5px] text-muted">{topic.line}</span></div>}
            {angles.map((a, i) => <button key={a.kind + i} aria-pressed={angle === i} className={pick(angle === i)} onClick={() => setAngle(i)}>
              <span className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: a.kind === "Suggested by Discovery Studio" ? "#d64545" : "#5f5f5f" }}><span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ border: angle === i ? "4px solid #d64545" : "1.5px solid #c0c0c0" }} />{a.kind}</span>
              <span className="text-[14.5px] font-medium leading-snug">{a.text}</span></button>)}
            <div className={pick(angle === "own") + " !gap-2"}>
              <button className="flex items-center gap-2 text-[12px] font-semibold" onClick={() => setAngle("own")}><span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ border: angle === "own" ? "4px solid #d64545" : "1.5px solid #c0c0c0" }} />Your own angle</button>
              <label htmlFor="own-angle" className="sr-only">Your own angle</label>
              <textarea id="own-angle" className="field text-[14px]" rows={2} value={ownAngle} onFocus={() => setAngle("own")} onChange={(e) => { setOwnAngle(e.target.value); setAngle("own"); }} placeholder="In one line: what Shashi wants to say about it" />
            </div>
          </div>}

          {step === S.hook && <div className="flex flex-col gap-3">
            <AngleBar />
            <H t={video ? "Choose the first line he says" : "Choose the opening line"} sub={video ? "The first 3 seconds decide whether people keep watching." : `Mobile shows about ${FOLD.mobile} characters before "see more". Each line is checked against it.`} right={editable && <button className="btn h-9" disabled={!!busy || !idea} onClick={getHooks}><Sparkles size={14} /> {busy === "hooks" ? "Writing" : hooks.length ? "Write again" : "Write hooks"}</button>} />
            {hooks.map((h) => { const ok = video ? sayableIn3s(h.text) : hookFits(h.text, device); return (
              <button key={h.text} aria-pressed={hook === h.text} className={pick(hook === h.text) + " !flex-row !items-center !gap-3"} onClick={() => setHook(h.text)}>
                <span className="h-[18px] w-[18px] shrink-0 rounded-full bg-white" style={{ border: hook === h.text ? "6px solid #d64545" : "1.5px solid #d0d0d0" }} />
                <span className="min-w-0 flex-1 text-[14.5px] font-medium leading-snug">{h.text}</span>
                <span className="flex shrink-0 flex-col items-end gap-0.5"><span className="text-[12px] font-semibold">{h.kind}</span><span className="num text-[11px]" style={{ color: ok ? "#5f5f5f" : "#d64545" }}>{video ? (ok ? "Under 3 seconds" : "Too long to say") : ok ? "Fits the fold" : "Cut by the fold"}</span></span>
              </button>); })}
            <label className="card flex flex-col gap-2 p-3.5"><span className="label">Or write the opening line</span><input className="field" value={hook} onChange={(e) => setHook(e.target.value)} placeholder="One line that stands on its own" /></label>
          </div>}

          {step === S.draft && !video && <div className="flex flex-col gap-3">
            <AngleBar />
            <H t="Shape the draft" sub="Three drafts to choose from. Edit freely; every rule is checked as you type." right={<span className="text-[12.5px] text-muted">In Shashi&apos;s voice · <Link href={`/w/${ws.slug}/studio`} className="font-semibold text-ink underline underline-offset-2">Voice settings</Link></span>} />
            <div className="flex flex-wrap gap-2">
              {drafts.map((d, i) => <button key={i} aria-pressed={dIdx === i} className={pick(dIdx === i) + " !flex-1 !gap-1 !p-3"} onClick={() => { setDIdx(i); setText(d.text); }}><span className="text-[13px] font-semibold">Draft {"ABC"[i]} · {d.angle || "Angle"}</span><span className="num flex gap-3 text-[11.5px]"><span>Human {humanScore(d.text).score}</span><span style={{ color: d.impact >= 70 ? "#d64545" : "#5f5f5f" }}>Impact {d.impact || "–"}</span></span></button>)}
              {editable && <button className="btn h-auto min-h-[56px] px-4" disabled={!!busy || !hook} onClick={getDrafts}><Sparkles size={14} /> {busy === "drafts" ? "Writing" : drafts.length ? "Write three more" : "Write three drafts"}</button>}
            </div>
            <div className="card overflow-hidden" data-tour="editor">
              <label htmlFor="draft-box" className="sr-only">Draft text</label>
              <textarea id="draft-box" className="block min-h-[300px] w-full resize-y border-0 px-5 py-4 text-[14.5px] leading-relaxed outline-none" value={text} onChange={(e) => setText(e.target.value)} placeholder="The draft appears here, or write it yourself." />
              <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-3 py-2.5">
                {QUICK.map(([l, how]) => <button key={l} className="h-[30px] rounded-full border border-line bg-white px-3 text-[12.5px] hover:border-[#141414] disabled:opacity-40" disabled={!text || !!busy} onClick={() => quick(l, how)}>{busy === "quick" ? "…" : l}</button>)}
                <span className="num ml-auto text-[11.5px] text-muted">{Array.from(text).length.toLocaleString()} / {type === "Article" ? "125,000" : "3000"} · {text.trim().split(/\s+/).filter(Boolean).length} words</span>
              </div>
            </div>
            {!!human.flags.length && <p className="m-0 text-[12.5px] text-[#9e1c1c]">House rules: {human.flags.join(" · ")}</p>}
          </div>}

          {step === S.draft && video && <div className="flex flex-col gap-3">
            <AngleBar />
            <H t="Write the script" sub="What Shashi says, and what shows on screen while he says it." right={<span className="flex items-center gap-2"><span className="num rounded-full bg-[#141414] px-3 py-1 text-[12px] text-white">About {Math.round(spoken / 2.5)} seconds spoken</span>{editable && <button className="btn h-9" disabled={!!busy || !hook} onClick={getScript}><Sparkles size={14} /> {busy === "script" ? "Writing" : "Write the script"}</button>}</span>} />
            <label className="flex flex-col gap-2 rounded-2xl bg-[#141414] p-4 text-white"><span className="text-[12.5px] font-semibold text-[#ff8a80]">Hook · first 3 seconds</span><input className="h-11 rounded-xl border border-white/20 bg-white/5 px-3 text-[15px] font-semibold text-white outline-none" value={script.hook || hook} onChange={(e) => setScript({ ...script, hook: e.target.value })} /></label>
            {script.beats.map((b, i) => (
              <div key={i} className="card flex gap-3 p-3.5">
                <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#d64545] text-[12px] text-white">{i + 1}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <label className="flex flex-col gap-1"><span className="label">Say</span><input className="field" value={b.say} onChange={(e) => setScript({ ...script, beats: script.beats.map((x, j) => (j === i ? { ...x, say: e.target.value } : x)) })} /></label>
                  <label className="flex flex-col gap-1"><span className="label">Show on screen</span><input className="field border-dashed text-[13px] text-muted" value={b.show} onChange={(e) => setScript({ ...script, beats: script.beats.map((x, j) => (j === i ? { ...x, show: e.target.value } : x)) })} /></label>
                </div>
                <button className="btn h-8 w-8 p-0" aria-label="Remove beat" disabled={script.beats.length <= 3} onClick={() => setScript({ ...script, beats: script.beats.filter((_, j) => j !== i) })}><X size={14} /></button>
              </div>
            ))}
            <button className="btn w-fit border-dashed" disabled={script.beats.length >= 5} onClick={() => setScript({ ...script, beats: [...script.beats, { say: "", show: "" }] })}>Add a beat</button>
            <label className="card flex flex-col gap-1.5 p-3.5"><span className="label">Closing line</span><input className="field font-semibold" value={script.close} onChange={(e) => setScript({ ...script, close: e.target.value })} /></label>
            <label className="card flex flex-col gap-1.5 p-3.5"><span className="label">Caption posted with the video</span><textarea className="field min-h-[80px]" value={script.caption} onChange={(e) => setScript({ ...script, caption: e.target.value })} /></label>
          </div>}

          {step === S.visual && <div className="flex flex-col gap-3.5" data-tour="visual">
            {video ? <>
              <H t="Cover and captions" sub="The first frame people see in the feed, and how the words appear on screen." />
              <div className="grid grid-cols-3 gap-2.5">{[["dark", "#141414", "#fff"], ["red", "#d64545", "#fff"], ["white", "#fff", "#141414"]].map(([k, bg, fg]) => (
                <button key={k} aria-pressed={script.cover === k} className={pick(script.cover === k) + " !p-2.5"} onClick={() => setScript({ ...script, cover: k })}>
                  <span className="flex aspect-[4/5] w-full flex-col gap-2 rounded-xl p-3 text-left" style={{ background: bg, color: fg, border: k === "white" ? "1px solid #e8e8e8" : 0 }}><span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">Shashi Pal · Antier</span><span className="text-[14px] font-bold leading-snug">{script.hook || hook}</span></span>
                  <span className="text-[12.5px] font-semibold capitalize">{k} cover</span></button>))}</div>
              <div className="card flex flex-wrap items-center gap-3 p-4"><span className="min-w-[200px] flex-1"><b className="block">Burned-in captions</b><span className="text-[12.5px] text-muted">Most feed videos play muted, so the words carry the point.</span></span>
                <div className="flex rounded-lg border border-line p-0.5">{[["bold", "Bold block"], ["line", "Clean line"], ["off", "Off"]].map(([k, l]) => <button key={k} className={`h-8 rounded-md px-3 text-[13px] font-semibold ${script.captions === k ? "bg-[#d64545] text-white" : "text-muted"}`} onClick={() => setScript({ ...script, captions: k })}>{l}</button>)}</div></div>
              <p className="m-0 rounded-xl bg-[#141414] px-3.5 py-3 text-[13px] text-white">Prax writes the script and captions; Shashi records the video.</p>
            </> : type === "Carousel" ? <>
              <H t="Build the carousel" sub="Antier's template keeps the text sharp. LinkedIn takes it as a PDF document." right={<span className="flex gap-2">{editable && <button className="btn h-9" disabled={!!busy} onClick={getSlides}><Sparkles size={14} /> {busy === "slides" ? "Writing" : slides.length ? "Write again" : "Write the slides"}</button>}<button className="btn btn-primary h-9" disabled={!slides.length} onClick={() => { const b = carouselPdf(slides); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([b.buffer as ArrayBuffer], { type: "application/pdf" })); a.download = `${(idea?.title || "carousel").slice(0, 40).replace(/[^\w]+/g, "-").toLowerCase()}.pdf`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }}><Download size={14} /> Download PDF</button></span>} />
              <div className="flex gap-2.5 overflow-x-auto pb-2">{slides.map((s, i) => { const dark = i === 0 || i === slides.length - 1; return (
                <div key={i} className="flex h-[200px] w-[160px] shrink-0 flex-col gap-1.5 rounded-xl border p-3" style={{ background: dark ? "#141414" : "#fff", color: dark ? "#fff" : "#141414", borderColor: dark ? "#141414" : "#e8e8e8" }}>
                  <span className="num text-[10px] text-[#d64545]">{String(i + 1).padStart(2, "0")}</span>
                  <input className="bg-transparent text-[13px] font-semibold outline-none" value={s.title} onChange={(e) => setSlides(slides.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} aria-label={`Slide ${i + 1} title`} />
                  <textarea className="flex-1 resize-none bg-transparent text-[11px] opacity-80 outline-none" value={s.body} onChange={(e) => setSlides(slides.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} aria-label={`Slide ${i + 1} text`} />
                </div>); })}
                {!slides.length && <p className="m-0 text-[13px] text-muted">Write the slides from the draft, then edit any of them here.</p>}</div>
            </> : type === "Poll" ? <>
              <H t="Poll options" sub="Two to four options, each under 30 characters." />
              {pollOpts.map((o, i) => <div key={i} className="flex gap-2"><input className="field" maxLength={30} value={o} onChange={(e) => setPollOpts(pollOpts.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Option ${i + 1}`} /><button className="btn h-9 w-9 p-0" aria-label="Remove option" disabled={pollOpts.length <= 2} onClick={() => setPollOpts(pollOpts.filter((_, j) => j !== i))}><X size={14} /></button></div>)}
              <button className="btn w-fit" disabled={pollOpts.length >= 4} onClick={() => setPollOpts([...pollOpts, ""])}>Add an option</button>
            </> : <>
              <H t="Add a visual" sub="Optional. Plain text posts often reach further, which suits an opinion." />
              <div className="grid grid-cols-3 gap-2.5">{[["statement", "Statement card", "His key line, set large."], ["diagram", "Simple diagram", "Boxes that show a flow."], ["photo", "Photo with caption", "An editorial image."]].map(([k, t, sub]) => (
                <button key={k} aria-pressed={layout === k} className={pick(layout === k) + " !p-2.5"} onClick={() => setLayout(k)}>
                  <svg viewBox="0 0 120 80" className="w-full rounded-lg border border-[#ececec]" aria-hidden="true"><rect width="120" height="80" fill="#fff" />{k === "statement" ? <><rect x="14" y="18" width="78" height="6" fill="#141414" /><rect x="14" y="30" width="66" height="6" fill="#141414" /><rect x="14" y="42" width="40" height="6" fill="#141414" /><rect x="14" y="62" width="14" height="2" fill="#d64545" /></> : k === "diagram" ? <><rect x="10" y="30" width="26" height="20" rx="2" fill="none" stroke="#141414" /><rect x="47" y="30" width="26" height="20" rx="2" fill="none" stroke="#141414" /><rect x="84" y="30" width="26" height="20" rx="2" fill="#141414" /><path d="M37 40h9M74 40h9" stroke="#d64545" /></> : <><rect x="10" y="10" width="100" height="44" rx="2" fill="#ececec" /><rect x="10" y="62" width="62" height="4" fill="#141414" /></>}</svg>
                  <span className="text-[13px] font-semibold">{t}</span><span className="text-[12px] text-muted">{sub}</span></button>))}</div>
              <label className="flex flex-col gap-1.5"><span className="label">Anything to add to the image brief</span><input className="field" value={imgPrompt} onChange={(e) => setImgPrompt(e.target.value)} placeholder="For example: a settlement line meeting a ledger" /></label>
              {ext?.searchKeys?.openai || ext?.searchKeys?.gemini ? (
                <div className="flex flex-wrap items-center gap-2"><span className="flex basis-full flex-wrap items-center gap-x-2 gap-y-1 pb-1 text-[12.5px] text-muted">Made with <ProviderMark id={ext.searchKeys.openai ? "openai" : "gemini"} bold={false} className="text-ink" /><ModelId model={ext.searchKeys.openai ? "gpt-image-1" : "gemini-2.5-flash-image"} /><KeyState on className="text-[12.5px]" /></span><button className="btn btn-primary" disabled={busy === "image"} onClick={genImage}>{busy === "image" ? "Making the image" : image ? "Make another" : "Make the image"}</button>{image && <a className="btn" href={image} download="post-visual.png"><Download size={14} /> Download</a>}{image && <button className="btn btn-ghost" onClick={() => setImage(null)}>Remove</button>}</div>
              ) : (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3.5"><span className="flex min-w-[220px] flex-1 flex-col gap-1.5"><span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]"><ProviderMark id="openai" /><span className="text-muted">or</span><ProviderMark id="gemini" /></span><KeyState on={false} className="text-[12.5px]" /><span className="text-[12.5px] text-muted">Images use the OpenAI or Google Gemini (Nano Banana) key. It stays in this browser.</span></span><Link className="btn btn-primary" href={`/w/${ws.slug}/extension#search-keys`}>Connect</Link></div>
              )}
            </>}
          </div>}

          {step === S.plan && <div className="flex flex-col gap-3.5" data-tour="handoff">
            {angleText && <AngleBar />}
            <H t="Plan and hand off" sub="Prax never posts. It copies the post, opens LinkedIn and reminds Shashi at the planned time." right={live && <span className="flex items-center gap-2"><StatusPill s={live.status} /><button className="btn btn-ghost h-8" onClick={() => openPost(live)}>Open</button></span>} />
            {type === "Article" && settings.newsletter.name && <label className="flex items-center gap-2 rounded-xl border border-line bg-white px-3.5 py-3 text-[13.5px]"><input type="checkbox" checked={newsletter} onChange={(e) => setNewsletter(e.target.checked)} />Part of the <b>{settings.newsletter.name}</b> newsletter</label>}
            {!!flags.length && <div className="rounded-xl border-2 border-[#d64545] bg-white p-4" data-tour="claims">
              <div className="mb-2 text-[13px] font-semibold">Check before it goes to Shashi</div>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">{flags.map((f, i) => <li key={i} className="text-[13px]"><span className="font-semibold text-[#d64545]">{f.kind === "returns" ? "Returns" : f.kind === "timeline" ? "Timeline" : f.kind === "client" ? "Client named" : f.kind === "regulator" ? "Regulator" : "Confidential"}</span> · &ldquo;{f.text}&rdquo;<span className="block text-[12px] text-muted">{f.why}</span></li>)}</ul>
              <label className="mt-3 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />I checked these and they are fine to publish</label>
            </div>}
            <div className="card flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between"><span className="label">Approval</span>{live ? <StatusPill s={live.status} /> : <span className="pill border border-[#d4d4d4] bg-white text-muted">Not saved</span>}</div>
              {st === "In review" ? (owner ? <>
                <textarea className="field text-[13px]" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the team (needed when asking for changes)" />
                <div className="flex gap-2"><button className="btn btn-primary" onClick={() => decide(true)}>Approve</button><button className="btn" onClick={() => decide(false)}>Ask for changes</button></div>
              </> : <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[13px]">With Shashi. It is in his approval session on Today.</span><button className="btn" onClick={withdraw}>Withdraw</button></div>)
                : st === "Ready" || st === "Posted" ? <span className="text-[13px]">Approved. It can go on the plan.</span>
                : <>
                  {live?.decision === "changes" && live.decision_note && <p className="m-0 rounded-lg bg-surface-2 px-3 py-2 text-[13px]">Shashi asked for changes: &ldquo;{live.decision_note}&rdquo;</p>}
                  <p className="m-0 text-[13px] leading-relaxed">Shashi owns this profile, so team drafts need his yes before they are planned. He sees them in one weekly approval session on his Today list.</p>
                  {editable && <div className="flex flex-wrap gap-2"><button className="btn" onClick={saveDraft}>Save draft</button><button className="btn btn-primary" onClick={sendForApproval}>Send to Shashi for approval</button>{owner && <button className="btn btn-ghost" onClick={() => decide(true)}>Approve it myself</button>}</div>}
                </>}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex flex-col gap-1.5"><span className="label">Day</span><input type="date" className="field h-11" value={planDay} onChange={(e) => setPlanDay(e.target.value)} /></label>
              <label className="flex flex-col gap-1.5"><span className="label">Time, Dubai</span><input type="time" className="field h-11" value={planTime} onChange={(e) => setPlanTime(e.target.value)} /></label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-dark h-12 px-5" disabled={st !== "Ready"} title={st !== "Ready" ? "Shashi approves it first" : ""} onClick={addToPlan}>Add to the plan</button>
              <button className="btn btn-primary h-12 px-5" disabled={st !== "Ready" && st !== "Posted"} onClick={handOff}><Copy size={15} /> Copy and open LinkedIn</button>
              <button className="btn btn-ghost h-12" onClick={reset}>Start a new post</button>
            </div>
          </div>}

          <div className="flex items-center justify-between gap-2.5 pt-0.5">
            <button className="btn h-10 px-4" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
            <span className="num text-[12px] text-faint">Step {step + 1} of {names.length}</span>
            <button className="btn btn-primary h-10 px-5" disabled={step === S.plan || !canNext} onClick={() => { const n = step + 1; setStep(n); if (n === S.idea && !ideas.length && editable) getIdeas(); if (n === S.hook && !hooks.length && editable && idea) getHooks(); if (n === S.draft && !video && !drafts.length && !text && editable && hook) getDrafts(); }}>{step === S.plan ? "Done" : "Continue"}</button>
          </div>
        </section>

        <aside className="flex min-w-0 flex-[2_1_340px] flex-col gap-3">
          <LinkedInPreview text={body || hook} image={image} company={channel === "company"} device={device} setDevice={setDevice}
            video={video ? <div className="flex aspect-[4/5] flex-col gap-2.5 p-[18px]" style={{ background: script.cover === "red" ? "#d64545" : script.cover === "white" ? "#fff" : "#141414", color: script.cover === "white" ? "#141414" : "#fff" }}><span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">Shashi Pal · Antier</span><span className="text-[17px] font-bold leading-snug">{script.hook || hook || "The hook appears here"}</span>{script.captions !== "off" && script.beats[0]?.say && <span className="mt-auto self-center rounded-md px-2.5 py-1.5 text-center text-[13px] font-bold" style={{ background: script.captions === "bold" ? "#141414" : "transparent", color: "#fff" }}>{script.beats[0].say}</span>}</div> : undefined}
            footer={!video && <> · Human {human.score}{draft?.impact ? ` · Impact ${draft.impact}` : ""}</>} />
          {channel === "company" && <p className="m-0 text-center text-[12.5px] font-semibold">Company content, not for Shashi&apos;s profile</p>}
        </aside>
      </div>
    </div>
  );
}
