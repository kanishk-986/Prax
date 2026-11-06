"use client";
import { SwitchRow } from "@/components/switch";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Lightbulb, Link2, FileText, PenLine, MessageSquare, TrendingDown, Repeat2, Copy, Download, Sparkles, X, Check } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useWorkspace, today, fmtDay, addDays } from "@/lib/workspace";
import { useToast, haptic } from "@/components/toaster";
import { askExtension, parseJSON, useExtension } from "@/lib/bridge";
import { ProviderMark, KeyState, ModelId } from "@/components/provider-mark";
import { humanScore } from "@/lib/studio";
import { cap, fullNameOf, firstNameOf, companyOf, pillarsOf, regionText, possessive, PROFILE_CHANNEL, type Channel } from "@/lib/persona";
import { type Idea, type Hook, type Draft, povText, parseIdeas, parseHooks, parseDrafts, claimsCheck, hookFits, sayableIn3s, FOLD, suggestAngles, angleLine, ANGLE_KINDS,
  REPURPOSE_KINDS, parseRepurpose, repurposeFormat, repurposeLabel, hasResults, type RepurposeKey, type Piece } from "@/lib/content";
import { usePostImage, storePostImage, removePostImage, imageDownloadUrl } from "./media";
import { VideoPanel } from "./video";
import { carouselPdf, type Slide } from "@/lib/carousel-pdf";
import { inProfile } from "@/lib/citations";
import { useCitationProfile } from "@/lib/citation-profile";
import { type Post, type Campaign, StatusPill, statusOf, logActivity, syncApprovalSession } from "./shared";
import { LinkedInPreview } from "./preview";
import type { ContentSettings } from "./settings";
import { useActiveStrategy } from "@/components/strategy/data";
import { preferredAngle } from "@/lib/strategy";

type SourceKind = "idea" | "link" | "pdf" | "draft" | "comment" | "gap" | "repurpose";
type TypeKey = "Text post" | "Image post" | "Carousel" | "Video" | "Poll" | "Article";
type Script = { hook: string; beats: { say: string; show: string }[]; close: string; caption: string; cover: string; captions: string };

// CS34: one compact list of starting points instead of a grid of icon cards.
const SOURCES: [SourceKind, string, string, React.ElementType][] = [
  ["idea", "An idea in mind", "A few words is enough.", Lightbulb],
  ["link", "A link or article", "Prax reads the page and finds the point.", Link2],
  ["pdf", "A PDF or report", "Upload it from your computer.", FileText],
  ["draft", "A rough draft", "Tidied and kept in their voice.", PenLine],
  ["comment", "One of their comments", "A strong comment, grown into a post.", MessageSquare],
  ["gap", "A topic gap", "From AI citations, or a pillar not covered lately.", TrendingDown],
  ["repurpose", "A posted piece", "Turned into several new drafts, each saved as an idea.", Repeat2],
];
const DEFAULT_PIECES: RepurposeKey[] = ["carousel", "short", "comment", "newsletter"];
/** "Slide 2: Title. Body" lines from a repurposed carousel become editable slides. */
const slidesFrom = (text: string): Slide[] => text.split("\n").map((l) => l.match(/^Slide\s*\d+\s*:\s*(.+)$/i)?.[1]?.trim()).filter((x): x is string => !!x)
  .map((l) => { const i = l.indexOf(". "); return i > 0 ? { title: l.slice(0, i), body: l.slice(i + 2) } : { title: l, body: "" }; }).slice(0, 9);
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

export function WriteFlow({ posts, campaigns, settings, seed, clearSeed, openPost, repurpose, clearRepurpose }: {
  posts: Post[]; campaigns: Campaign[]; settings: ContentSettings; seed: Post | null; clearSeed: () => void; openPost: (p: Post) => void;
  repurpose?: Post | null; clearRepurpose?: () => void;
}) {
  const { ws, can, userId } = useWorkspace();
  const { scope: citScope } = useCitationProfile();
  // Who the posts are for, from the profile; neutral wording when a field is missing.
  const first = firstNameOf(ws), company = companyOf(ws), region = regionText(ws);
  // The active strategy's angle action (Q109) comes first in the angle step, after a Discovery suggestion.
  const strat = useActiveStrategy();
  const prefer = useMemo(() => preferredAngle(strat.nodes, today()), [strat.nodes]);
  const preferred = useMemo(() => (prefer ? [{ kind: `From strategy: ${prefer.rule}`, text: prefer.text }] : []), [prefer]);
  const pillars = useMemo(() => pillarsOf(ws), [ws]);
  const byline = [fullNameOf(ws, ""), companyOf(ws, "")].filter(Boolean).join(" · ") || "Prax";
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
  // CS6: a generated image is stored with the post (db/022); after a reload it comes back through a signed link.
  const [imgPath, setImgPath] = useState("");
  const storedImg = usePostImage(imgPath);
  const shownImg = image ?? storedImg;
  // I6: a recorded or uploaded video is stored with the post (db/029), like the image.
  const [videoPath, setVideoPath] = useState("");
  // CS30: the posted piece to repurpose, the kinds asked for, and the pieces that came back.
  const [rpId, setRpId] = useState("");
  const [rpKinds, setRpKinds] = useState<RepurposeKey[]>(DEFAULT_PIECES);
  const [pieces, setPieces] = useState<(Piece & { keep: boolean; saved?: Post })[]>([]);
  const [pollOpts, setPollOpts] = useState<string[]>(["", ""]);
  const [channel, setChannel] = useState<Channel>(PROFILE_CHANNEL);
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
    setSrc(seed.source_kind && seed.source_kind !== "repurpose" ? (seed.source_kind as SourceKind) : "idea"); setSrcText(seed.resource || seed.title); setIdea({ title: seed.title, why: "", pillar: seed.pillar, score: 0 });
    setPillar(seed.pillar || ""); setChannel(seed.channel === "company" ? "company" : PROFILE_CHANNEL); setNewsletter(!!seed.newsletter);
    setText(seed.draft || ""); setHook(seed.hook || ""); if (seed.script && seed.script.beats) setScript({ ...emptyScript(), ...seed.script } as Script);
    setImage(null); setImgPath(seed.image_path || ""); setVideoPath(seed.video_path || ""); if (seed.visual?.layout) setLayout(seed.visual.layout); if (seed.visual?.slides?.length) setSlides(seed.visual.slides);
    // A Discovery or AI citations topic skips the starting point; Discovery's suggested angle comes preselected.
    const fromDisc = seed.source_kind === "discovery", fromCit = seed.topic === "AI citations" || seed.source_kind === "gap";
    const base = suggestAngles(seed.title, region);
    const disc = seed.discovery?.angle || (fromDisc ? seed.angle ?? "" : "");
    const list = disc ? [{ kind: "Suggested by Discovery Studio", text: angleLine(disc) }, ...preferred, ...base] : [...preferred, ...base];
    setAngles(list);
    const saved = seed.angle && !fromDisc ? list.findIndex((a) => a.text === seed.angle) : 0;
    if (seed.angle && !fromDisc && saved < 0) { setAngle("own"); setOwnAngle(seed.angle); } else { setAngle(Math.max(0, saved)); setOwnAngle(""); }
    setTopic(fromDisc ? { tag: `From Discovery Studio${seed.discovery?.rank ? ` · #${seed.discovery.rank} this week` : ""}${seed.discovery?.score != null ? ` · score ${seed.discovery.score}` : ""}`, title: seed.title, line: `${seed.discovery?.sources?.length ?? 0} sources loaded${seed.discovery?.campaign ? ` · campaign: ${seed.discovery.campaign}` : ""}`, sources: seed.discovery?.sources ?? [] }
      : fromCit ? { tag: seed.channel === "company" ? "From AI citations · company content" : "From AI citations", title: seed.title, line: "The gap prompt and its rivals are loaded", sources: [] } : null);
    setStep(seed.draft ? S.draft : S.angle); clearSeed();
  }, [seed, clearSeed, region, preferred]);

  // Repurpose from a post's view opens here on that piece (CS30).
  useEffect(() => {
    if (!repurpose) return;
    setStep(0); setSrc("repurpose"); setRpId(repurpose.id); setPieces([]); setErr(""); clearRepurpose?.();
  }, [repurpose, clearRepurpose]);

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
    setAngles((cur) => { const disc = cur.filter((a) => a.kind === "Suggested by Discovery Studio"); return [...disc, ...preferred, ...suggestAngles(idea.title, region)]; });
  }, [idea?.title, region, preferred]);

  // Topic gaps: ideas sent from AI citations, and pillars with nothing posted or planned in 30 days.
  const gaps = useMemo(() => {
    const t = today(), since = addDays(t, -30);
    const fromCitations = posts.filter((p) => statusOf(p.status) === "Idea" && (p.topic === "AI citations" || p.source_kind === "gap") && inProfile(p, citScope)).map((p) => ({ id: "p" + p.id, label: p.title, sub: p.channel === "company" ? "From AI citations · company content" : "From AI citations", pillar: p.pillar }));
    const quiet = pillars.filter((pl) => !posts.some((p) => p.pillar === pl && (p.publish_date ?? "") >= since)).map((pl) => {
      const last = posts.filter((p) => p.pillar === pl && p.publish_date).map((p) => p.publish_date!).sort().pop();
      return { id: "q" + pl, label: pl, sub: last ? `Last post ${fmtDay(last, { day: "numeric", month: "short" })}` : "Nothing posted yet", pillar: pl };
    });
    return [...fromCitations, ...quiet];
  }, [posts, citScope, pillars]);

  const material = () => {
    if (src === "link" && page) return `SOURCE PAGE (${page.host}): ${page.title}\nThe point to post about: ${page.points[page.pick] ?? ""}\n\n${page.text.slice(0, 6000)}`;
    if (src === "pdf" && pdf) return `SOURCE PDF (${pdf.name}). The point to post about: ${pdf.points[pdf.pick] ?? ""}\n\n${pdf.text.slice(0, 6000)}`;
    if (src === "comment") { const c = saved.comments.find((x) => x.id === commentPick); return c ? `THEIR OWN COMMENT, to grow into a post:\n${c.text}` : ""; }
    if (src === "gap") { const g = gaps.find((x) => x.id === gapPick); return g ? `TOPIC GAP: ${g.label}. ${g.sub}.` : ""; }
    if (src === "draft") return `THEIR ROUGH DRAFT, keep their words where they work:\n${srcText}`;
    return `HIS IDEA: ${srcText}`;
  };
  const angleText = angle === "own" ? ownAngle.trim() : angles[angle]?.text ?? "";
  const angleCtx = () => (angleText ? `\nANGLE (what ${first} says about it; every line follows it): ${angleText}` : "");
  const ctx = () => `${material()}\n\nFORMAT: ${type}.\n${povText(settings.pov, first)}\n${pillars.length ? `Content pillars: ${pillars.join("; ")}.` : ""}${channel === "company" ? `\nThis is for the ${company} company page, written as the company, not as ${first}.` : ""}`;
  const ai = async <T,>(label: string, user: string): Promise<T | null> => {
    setBusy(label); setErr("");
    try { const out = await askExtension<string>("ai", { kind: "studio", user }, 90000); const j = parseJSON<T>(out); if (!j) throw new Error("The AI reply could not be read. Try again."); return j; }
    catch (e) { setErr(`${(e as Error).message} You can also write this step yourself.`); return null; }
    finally { setBusy(""); }
  };

  async function readLink() {
    setBusy("link"); setErr(""); setPage(null);
    // A timeout or an offline network returns no JSON; say so rather than leave Fetch busy for good.
    const r = await fetch("/api/fetch-url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {}; setBusy("");
    if (!r?.ok) { setErr(j.error ?? "That page could not be read. Check the link and try again."); return; }
    const base = { title: j.title || j.host, host: j.host, text: j.text as string, points: [] as string[], pick: 0 };
    setPage(base);
    const pts = await ai<{ points: string[] }>("points", `PAGE: ${j.title}\n${String(j.text).slice(0, 8000)}\n\nPull the three points from this page most relevant to this profile's senior buyers${pillars.length ? ` and to these pillars: ${pillars.join("; ")}` : ""}. Each under 14 words. Return only JSON: {"points": ["...", "...", "..."]}`);
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
    const pts = await ai<{ points: string[] }>("points", `DOCUMENT: ${f.name}\n${String(j.text).slice(0, 8000)}\n\nPull the three points most relevant to this profile's senior buyers. Each under 14 words. Return only JSON: {"points": ["...", "...", "..."]}`);
    setPdf({ ...base, points: pts?.points?.slice(0, 3) ?? [] });
  }
  async function getIdeas() {
    const j = await ai<unknown>("ideas", `${ctx()}\n\nPropose 4 post ideas for this profile from the source above. Score each 0 to 100 on fit with the pillars, relevance to the profile's senior buyers${region ? ` in ${region}` : ""}, and freshness. Give one line on why, and the pillar.\nReturn only JSON: {"ideas": [{"title": "...", "why": "...", "pillar": "...", "score": 80}]}`);
    if (j) { const list = parseIdeas(j); setIdeas(list); if (list[0]) { setIdea(list[0]); setPillar(list[0].pillar); } }
  }
  async function getAngles() {
    const j = await ai<{ angles: { kind: string; text: string }[] }>("angles", `${ctx()}\n\nIDEA: ${idea?.title}\n\nWrite one angle of each kind for this post, one line each, under 22 words: ${ANGLE_KINDS.join("; ")}. Each says what ${first} argues, not what the news says. No dashes, no contractions.\nReturn only JSON: {"angles": [{"kind": "Contrarian", "text": "..."}]}`);
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
    const j = await ai<Partial<Script>>("script", `${ctx()}${angleCtx()}\n\nIDEA: ${idea?.title}\nFIRST LINE SPOKEN: ${hook}\n\nWrite a 45 to 75 second talking-head script: 3 to 5 beats, each with what is said (one or two sentences) and what shows on screen, a closing line, and a caption of 2 to 3 sentences for the post. No dashes, no contractions.\nReturn only JSON: {"beats": [{"say": "...", "show": "..."}], "close": "...", "caption": "..."}`);
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
      setImage(r.url); haptic();
      // Keep it with the post: save the post first if it is new, then upload the image to Storage.
      if (!editable) { toast("Image made with your key"); return; }
      const p = postId ? { id: postId } : await save(postId ? {} : { status: "Drafting" });
      if (!p) return;
      const out = await storePostImage(ws.id, p.id, r.url, imgPath);
      if ("error" in out) setErr(`${out.error} Download it so it is not lost.`);
      else { setImgPath(out.path); toast("Image made and saved with the post"); }
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(""); }
  }
  async function dropImage() {
    const path = imgPath, data = image;
    setImage(null); setImgPath("");
    if (!postId || !path) return;
    const out = await removePostImage(postId, path);
    if ("error" in out) { toast(out.error); setImgPath(path); setImage(data); return; }
    toast("Image removed", async () => { await out.undo(); setImgPath(path); setImage(data); });
  }
  async function downloadImage() {
    if (image) { const a = document.createElement("a"); a.href = image; a.download = "post-visual.png"; a.click(); return; }
    const u = imgPath ? await imageDownloadUrl(imgPath) : null;
    if (u) window.location.assign(u); else toast("The image could not be fetched. Try again.");
  }

  // ---------- repurpose (CS30) ----------
  const posted = useMemo(() => posts.filter((p) => statusOf(p.status) === "Posted" && p.draft.trim()).sort((a, b) => (b.publish_date ?? "").localeCompare(a.publish_date ?? "")), [posts]);
  const rpSrc = posted.find((p) => p.id === rpId) ?? null;
  async function makePieces() {
    if (!rpSrc || !rpKinds.length) return;
    const kinds = REPURPOSE_KINDS.filter((k) => rpKinds.includes(k.key));
    const res = hasResults(rpSrc) ? `It reached ${rpSrc.impressions ?? "an unknown number of"} impressions with ${rpSrc.reactions ?? 0} reactions and ${rpSrc.comments ?? 0} comments.` : "";
    const j = await ai<unknown>("repurpose", `${povText(settings.pov, first)}\n\nPOSTED PIECE (${rpSrc.format || "Text post"}${rpSrc.publish_date ? `, ${rpSrc.publish_date}` : ""}): ${rpSrc.title}\n${rpSrc.draft.slice(0, 7000)}\n${res}\n\nRepurpose it into these new pieces for ${possessive(first)} LinkedIn, each standing on its own with a fresh opening line, not repeating the original one:\n${kinds.map((k) => `- ${k.key}: ${k.ask}`).join("\n")}\nUse only facts in the piece. No dashes, no contractions, no hashtags. Give each a working title under 10 words.\nReturn only JSON: {"pieces": [{"kind": "${kinds[0].key}", "title": "...", "text": "..."}]}`);
    if (!j) return;
    const list = parseRepurpose(j, rpKinds);
    if (!list.length) { setErr("No pieces came back. Try again, or ask for fewer kinds."); return; }
    setPieces(list.map((p) => ({ ...p, keep: true })));
  }
  async function savePieces() {
    if (!rpSrc) return;
    const keep = pieces.filter((p) => p.keep && !p.saved && p.text.trim());
    if (!keep.length) return;
    const rows = keep.map((p) => {
      const format = repurposeFormat(p.kind), s = format === "Carousel" ? slidesFrom(p.text) : [];
      return { workspace_id: ws.id, title: p.title || repurposeLabel(p.kind), format, status: "Idea", draft: p.text, pillar: rpSrc.pillar, channel: rpSrc.channel ?? PROFILE_CHANNEL,
        newsletter: p.kind === "newsletter" && !!settings.newsletter.name, source_kind: "repurpose", source_ref: p.kind, repurposed_from: rpSrc.id,
        visual: s.length ? { mode: "carousel", slides: s } : p.kind === "poll" ? { poll: p.text.split("\n").filter((l) => l.startsWith("Option: ")).map((l) => l.slice(8)).slice(0, 4) } : {} };
    });
    setBusy("rpsave");
    const { data, error } = await supabase().from("posts").insert(rows).select();
    setBusy("");
    if (error) { toast(error.message); return; }
    const made = (data ?? []) as Post[];
    setPieces((cur) => cur.map((p) => { const i = keep.indexOf(p); return i >= 0 ? { ...p, saved: made[i] } : p; }));
    logActivity(ws.id, "repurpose", `Repurposed into ${made.length} ideas: ${rpSrc.title}`, rpSrc.id); haptic();
    toast(`${made.length} ${made.length === 1 ? "idea" : "ideas"} saved to Library`, async () => {
      await supabase().from("posts").delete().in("id", made.map((m) => m.id));
      setPieces((cur) => cur.map((p) => (p.saved && made.some((m) => m.id === p.saved!.id) ? { ...p, saved: undefined } : p)));
    });
  }

  const body = video ? [script.caption].filter(Boolean).join("\n\n") : type === "Poll" ? text.split("\n").filter((l) => !l.startsWith("Option: ")).join("\n").trim() : text;
  const flags = useMemo(() => claimsCheck(video ? `${script.hook} ${script.beats.map((b) => b.say).join(" ")} ${script.close} ${script.caption}` : text, { companies, permitted: settings.pov.clients }), [text, script, video, companies, settings.pov.clients]);
  const human = humanScore(body || hook);
  const draft = drafts[dIdx];
  const spoken = [script.hook || hook, ...script.beats.map((b) => b.say), script.close].join(" ").trim().split(/\s+/).filter(Boolean).length;

  async function save(extra: Partial<Post> = {}): Promise<Post | null> {
    const row = {
      workspace_id: ws.id, title: idea?.title || hook || "Untitled post", format: type, pillar, draft: video ? [script.hook || hook, ...script.beats.map((b) => b.say), script.close].join("\n\n") : text,
      channel, newsletter: type === "Article" && newsletter, source_kind: live?.source_kind === "discovery" || live?.source_kind === "repurpose" ? live.source_kind : src, source_ref: live?.source_kind === "repurpose" ? live.source_ref ?? "" : src === "link" ? url : src === "pdf" ? pdf?.name ?? "" : live?.source_ref ?? "", hook, campaign_id: campaignId,
      script: video ? { ...script, hook: script.hook || hook } : {}, visual: { mode: type === "Carousel" ? "carousel" : image || imgPath ? "image" : "", layout, prompt: imgPrompt, slides: type === "Carousel" ? slides : undefined, poll: type === "Poll" ? pollOpts.filter(Boolean) : undefined },
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
    toast(`Sent to ${first}. It is in the weekly approval session on Today.`, async () => { await supabase().from("posts").update({ status: "Drafting", requested_at: null, requested_by: null }).eq("id", p.id); });
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
    haptic(); toast(`Withdrawn. ${first} no longer sees it.`, async () => { await supabase().from("posts").update({ status: "In review", requested_at: live?.requested_at, requested_by: live?.requested_by }).eq("id", postId); });
  }
  async function addToPlan() {
    if (!postId) return;
    const prev = { publish_date: live?.publish_date ?? null, planned_time: live?.planned_time ?? "" };
    const { error } = await supabase().from("posts").update({ publish_date: planDay, planned_time: planTime }).eq("id", postId);
    if (error) { toast(error.message); return; }
    haptic(); toast(`Planned for ${fmtDay(planDay)}, ${planTime}. Today reminds ${first} then.`, async () => { await supabase().from("posts").update(prev).eq("id", postId); });
  }
  async function handOff() {
    try { await navigator.clipboard.writeText(body); } catch {}
    window.open("https://www.linkedin.com/feed/", "_blank", "noopener");
    toast("Copied. LinkedIn is open in a new tab: paste, then press Post there.");
  }
  const reset = () => { setAngles([]); setAngle(0); setOwnAngle(""); setTopic(null); setStep(0); setSrcText(""); setUrl(""); setPage(null); setPdf(null); setIdeas([]); setIdea(null); setHooks([]); setHook(""); setDrafts([]); setText(""); setScript(emptyScript()); setSlides([]); setImage(null); setImgPath(""); setVideoPath(""); setPieces([]); setPostId(null); setCampaignId(null); setAck(false); setErr(""); };

  const canNext = [
    src === "repurpose" ? false : src === "link" ? !!page : src === "pdf" ? !!pdf : src === "comment" ? !!commentPick : src === "gap" ? !!gapPick : srcText.trim().length > 3,
    true, !!idea?.title, !!angleText, !!hook.trim(), video ? !!(script.caption || script.beats.some((b) => b.say)) : !!text.trim(), true, true,
  ][step];
  const names = STEP_NAMES(video);
  const camp = campaigns.find((c) => c.id === campaignId);
  const pick = (on: boolean) => `pick card-hover flex flex-col items-start gap-1.5 rounded-2xl border bg-white p-3.5 text-left ${on ? "border-2 border-[#d64545]" : "border-line"}`;
  const AngleBar = () => <div className="flex flex-wrap items-baseline gap-2 rounded-xl bg-surface-2 px-3.5 py-2.5 text-body leading-snug text-ink"><b className="font-semibold">Angle</b><span className="min-w-0 flex-1">{angleText || "Not chosen yet"}</span><button className="text-meta font-semibold underline underline-offset-[3px]" onClick={() => setStep(S.angle)}>Change</button></div>;
  const H = ({ t, sub, right }: { t: string; sub: string; right?: React.ReactNode }) => <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="m-0 text-page font-semibold">{t}</h2><p className="m-0 mt-1 text-body text-muted">{sub}</p></div>{right}</div>;

  return (
    <div className="flex flex-col gap-4">
      {camp && <div className="flex flex-wrap items-center gap-2.5 rounded-xl bg-surface-2 px-3.5 py-2.5 text-body text-ink"><span className="font-semibold">Campaign</span><span className="font-semibold">{camp.name}</span><span className="text-[#cfcfcf]">{idea?.title}</span></div>}
      <nav aria-label="Steps" data-tour="steps" className="flex flex-wrap gap-1 rounded-2xl border border-line bg-white p-1.5">
        {names.map((n, i) => (
          <button key={n} onClick={() => setStep(i)} className="inline-flex h-[38px] items-center gap-2 rounded-xl pl-1.5 pr-3.5 text-body font-semibold" style={{ background: step === i ? "#d64545" : "transparent", color: step === i ? "#fff" : i < step ? "#141414" : "var(--faint)" }}>
            <span className="num inline-grid h-6 w-6 place-items-center rounded-full text-meta" style={{ background: step === i ? "#fff" : i < step ? "#141414" : "#fff", color: step === i ? "#d64545" : i < step ? "#fff" : "var(--faint)", border: step === i || i < step ? 0 : "1px solid #d0d0d0" }}>{i < step ? <Check size={13} strokeWidth={2.6} aria-label="done" /> : i + 1}</span>{n}
          </button>
        ))}
      </nav>

      <div className="flex flex-wrap items-start gap-5">
        <section className="flex min-w-0 flex-[3_1_540px] flex-col gap-4">
          {err && <div className="flex items-start gap-2 rounded-xl border border-[#d64545] bg-white px-3.5 py-2.5 text-body"><span className="flex-1">{err}</span><button aria-label="Dismiss" onClick={() => setErr("")}><X size={14} /></button></div>}

          {step === 0 && <div className="flex flex-col gap-3.5" data-tour="sources">
            <H t="What are you starting from?" sub="Pick one. Prax asks only what that source needs." />
            <div className="grid items-start gap-3 md:grid-cols-[minmax(220px,250px)_minmax(0,1fr)]">
            <div role="radiogroup" aria-label="Starting point" className="panel" onKeyDown={(e) => {
              if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(e.key)) return;
              e.preventDefault();
              const i = SOURCES.findIndex(([k]) => k === src), n = SOURCES[(i + (e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : SOURCES.length - 1)) % SOURCES.length][0];
              setSrc(n); setErr(""); (e.currentTarget.querySelector(`[data-src="${n}"]`) as HTMLElement | null)?.focus();
            }}>
              {SOURCES.map(([k, t, sub, Icon], i) => { const on = src === k; return (
                <button key={k} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} data-src={k} onClick={() => { setSrc(k); setErr(""); }}
                  className={`src-row flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition-colors ${i ? "border-t border-line" : ""} ${on ? "bg-surface-2" : "hover:bg-[#fafafa]"}`}>
                  <Icon size={16} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: on ? "#d64545" : "#6b6b6b" }} />
                  <span className="min-w-0 flex-1"><span className={`block text-body leading-snug ${on ? "font-semibold text-ink" : "font-medium text-ink"}`}>{t}</span><span className={`${on ? "block" : "hidden md:block"} text-meta leading-snug text-muted`}>{sub}</span></span>
                  <span aria-hidden="true" className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full bg-white" style={{ border: on ? "4px solid #d64545" : "1.5px solid #c4c4c4" }} />
                </button>); })}
            </div>
            <div className="card flex min-w-0 flex-col gap-3 p-4">
              {(src === "idea" || src === "draft") && <label className="flex flex-col gap-2"><span className="label">{src === "idea" ? `What does ${first} want to say?` : "Paste the rough draft"}</span><textarea className="field min-h-[110px] text-body" value={srcText} onChange={(e) => setSrcText(e.target.value)} placeholder={src === "idea" ? "A sentence or two is enough." : "Their own words, however rough."} /></label>}
              {src === "link" && <>
                <label htmlFor="src-url" className="label">Paste a link</label>
                <div className="flex gap-2"><input id="src-url" type="url" className="field h-11" placeholder="https://" value={url} onChange={(e) => { setUrl(e.target.value); setPage(null); }} /><button className="btn btn-primary h-11 px-5" disabled={!url || busy === "link"} onClick={readLink}>{busy === "link" ? "Reading" : page ? "Read again" : "Fetch"}</button></div>
                <p className="m-0 text-meta text-muted">Public pages only. LinkedIn pages are never fetched; open those on LinkedIn and use the extension.</p>
                {page && <div className="anim-rise flex gap-3.5 rounded-xl border border-line p-3.5">
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#141414] text-page font-semibold text-white">{page.host.replace(/^www\./, "")[0]?.toUpperCase()}</span>
                  <span className="flex min-w-0 flex-col gap-1"><span className="text-meta text-faint">{page.host} · fetched just now</span><span className="text-title font-semibold leading-snug">{page.title}</span>
                    {busy === "points" ? <span className="text-meta text-muted">Finding the points</span> : <span className="mt-1 flex flex-wrap gap-1.5">{page.points.map((pt, i) => <button key={i} className="rounded-full px-3 py-1 text-left text-meta font-semibold" style={{ background: page.pick === i ? "#d64545" : "#fff", color: page.pick === i ? "#fff" : "#141414", border: page.pick === i ? 0 : "1px solid #d0d0d0" }} onClick={() => setPage({ ...page, pick: i })}>{pt}</button>)}</span>}</span>
                </div>}
              </>}
              {src === "pdf" && <>
                <span className="label">Upload a PDF</span>
                <button type="button" className="grid place-items-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-[#d0d0d0] p-6 text-center hover:border-[#d64545]" onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) readPdf(f); }}>
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#d64545] text-white"><FileText size={18} /></span><span className="font-semibold">{busy === "pdf" ? "Reading the PDF" : "Choose a PDF from your computer"}</span><span className="text-meta text-muted">Or drop it here. Reports, decks, regulator papers.</span>
                </button>
                <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) readPdf(f); e.target.value = ""; }} />
                {pdf && <div className="anim-rise flex flex-col gap-2 rounded-xl bg-surface-2 p-3.5 text-ink"><span className="font-semibold">{pdf.name}</span>
                  <span className="flex flex-wrap gap-1.5">{pdf.points.map((pt, i) => <button key={i} aria-pressed={pdf.pick === i} className="rounded-md border px-3 py-1 text-left text-meta font-medium" style={pdf.pick === i ? { background: "#141414", color: "#fff", borderColor: "#141414" } : { background: "#fff", color: "#141414", borderColor: "#d4d4d4" }} onClick={() => setPdf({ ...pdf, pick: i })}>{pt}</button>)}{!pdf.points.length && <span className="text-meta text-muted">{busy === "points" ? "Finding the points" : "Read. Pick the angle in the next steps."}</span>}</span></div>}
              </>}
              {src === "comment" && <>
                <span className="label">Pick one of their comments</span>
                {saved.comments.map((c) => <button key={c.id} aria-pressed={commentPick === c.id} className={pick(commentPick === c.id)} onClick={() => setCommentPick(c.id)}><span className="text-meta text-faint">{c.meta}</span><span className="line-clamp-3 text-body leading-snug">{c.text}</span></button>)}
                {!saved.comments.length && <p className="m-0 text-body text-muted">No saved or posted comments yet. Save drafts in Comment Studio, or post comments with the extension.</p>}
              </>}
              {src === "gap" && <>
                <span className="label">Pick a topic gap</span>
                {gaps.map((g) => <button key={g.id} aria-pressed={gapPick === g.id} className={pick(gapPick === g.id) + " !flex-row !items-center"} onClick={() => { setGapPick(g.id); if (g.pillar) setPillar(g.pillar); }}><span className="min-w-0 flex-1"><span className="block text-body font-semibold">{g.label}</span><span className="text-meta text-muted">{g.sub}</span></span></button>)}
                {!gaps.length && <p className="m-0 text-body text-muted">No topic gaps right now. Every pillar has a post in the last 30 days, and AI citations has sent no topics.</p>}
              </>}
              {src === "repurpose" && <>
                {!posted.length ? <p className="m-0 text-body text-muted">Nothing has been posted yet. Once a post is marked as posted, it can be turned into new pieces here.</p> : <>
                  <label className="flex flex-col gap-1.5"><span className="label">The posted piece</span>
                    <select className="field h-10" value={rpId} onChange={(e) => { setRpId(e.target.value); setPieces([]); }}>
                      <option value="">Choose a posted piece</option>
                      {posted.map((p) => <option key={p.id} value={p.id}>{p.title}{p.publish_date ? ` · ${fmtDay(p.publish_date, { day: "numeric", month: "short" })}` : ""}</option>)}
                    </select>
                  </label>
                  {rpSrc && <div className="-mt-1.5">
                    <span className="block text-meta text-muted">{rpSrc.format || "Text post"}{rpSrc.pillar ? ` · ${rpSrc.pillar}` : ""}{hasResults(rpSrc) ? ` · ${(rpSrc.impressions ?? 0).toLocaleString("en-GB")} impressions, ${rpSrc.reactions ?? 0} reactions, ${rpSrc.comments ?? 0} comments` : ""}</span>                  </div>}
                  <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                    <legend className="label mb-2">Make these</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {REPURPOSE_KINDS.map((k) => { const on = rpKinds.includes(k.key); return (
                        <button key={k.key} type="button" aria-pressed={on} className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-meta font-medium transition-colors"
                          style={on ? { background: "#141414", color: "#fff", borderColor: "#141414" } : { background: "#fff", color: "#141414", borderColor: "#d4d4d4" }}
                          onClick={() => setRpKinds((cur) => (on ? cur.filter((x) => x !== k.key) : REPURPOSE_KINDS.map((r) => r.key).filter((x) => x === k.key || cur.includes(x))))}>
                          {on && <Check size={12} strokeWidth={2.6} aria-hidden="true" />}{k.label}</button>); })}
                    </div>
                  </fieldset>
                  <div className="flex flex-wrap items-center gap-2">
                    {editable && <button className={`btn h-10 px-4 ${pieces.length ? "" : "btn-primary"}`} disabled={!rpSrc || !rpKinds.length || !!busy} onClick={makePieces}><Sparkles size={14} /> {busy === "repurpose" ? "Writing the drafts" : pieces.length ? "Write them again" : `Write ${rpKinds.length} ${rpKinds.length === 1 ? "draft" : "drafts"}`}</button>}
                    {editable && pieces.some((p) => p.keep && !p.saved) && <button className="btn btn-primary h-10 px-4" disabled={busy === "rpsave"} onClick={savePieces}>{busy === "rpsave" ? "Saving" : `Save ${pieces.filter((p) => p.keep && !p.saved).length} as ideas`}</button>}
                    <span className="text-meta text-muted">Each draft lands in Library as an idea, linked to this piece.</span>
                  </div>
                  {busy === "repurpose" && <div className="flex flex-col gap-2" aria-label="Writing the drafts">{rpKinds.map((k) => <div key={k} className="h-24 animate-pulse rounded-xl bg-surface-2" />)}</div>}
                  {!!pieces.length && busy !== "repurpose" && <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                    {pieces.map((p, i) => (
                      <li key={p.kind} className="rounded-xl border border-line bg-white p-3.5">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-meta font-semibold text-ink">{repurposeLabel(p.kind)}</span>
                          <span className="text-meta text-muted">· {repurposeFormat(p.kind)}</span>
                          <span className="ml-auto">{p.saved ? <button className="btn btn-quiet h-7 text-meta" onClick={() => openPost(p.saved!)}>Saved · Open</button>
                            : <label className="flex items-center gap-1.5 text-meta text-muted"><input type="checkbox" checked={p.keep} onChange={(e) => setPieces(pieces.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} />Keep</label>}</span>
                        </div>
                        <label className="sr-only" htmlFor={`rp-t-${p.kind}`}>Title</label>
                        <input id={`rp-t-${p.kind}`} className="field mb-2 font-semibold" value={p.title} disabled={!!p.saved} onChange={(e) => setPieces(pieces.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                        <label className="sr-only" htmlFor={`rp-x-${p.kind}`}>Draft</label>
                        <textarea id={`rp-x-${p.kind}`} className="field min-h-[110px] text-body leading-relaxed" value={p.text} disabled={!!p.saved} onChange={(e) => setPieces(pieces.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                      </li>
                    ))}
                  </ul>}
                </>}
              </>}
            </div>
            </div>
          </div>}

          {step === 1 && <div className="flex flex-col gap-3.5">
            <H t="What kind of post?" sub="Each type gets its own structure, length and later steps." />
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3" data-tour="types">
              {TYPES.map(([k, sub, len]) => <button key={k} aria-pressed={type === k} className={pick(type === k)} onClick={() => setType(k)}><span className="text-body font-semibold">{k}</span><span className="text-meta text-muted">{sub}</span><span className="num text-meta text-faint">{len}</span></button>)}
            </div>
            <label className="flex flex-col gap-1.5"><span className="label">Where it goes</span><select className="field w-auto" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}><option value={PROFILE_CHANNEL}>{possessive(first)} own profile</option><option value="company">{cap(company)} company page</option></select></label>
            {channel === "company" && <p className="m-0 rounded-xl bg-surface-2 px-3.5 py-2.5 text-body text-ink">Company content, not for {possessive(first)} profile. It is flagged this way in Library and Plan.</p>}
          </div>}

          {step === 2 && <div className="flex flex-col gap-3">
            <H t="Pick the idea" sub="Scored before a word is written: pillar fit, buyer relevance, freshness." right={editable && <button className="btn h-9" disabled={!!busy} onClick={getIdeas}><Sparkles size={14} /> {busy === "ideas" ? "Thinking" : ideas.length ? "Suggest again" : "Suggest ideas"}</button>} />
            {ideas.map((x) => <button key={x.title} aria-pressed={idea?.title === x.title} className={pick(idea?.title === x.title) + " !flex-row !items-center !gap-3.5"} onClick={() => { setIdea(x); setPillar(x.pillar); }}>
              <span className="num grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full text-title text-white" style={{ background: idea?.title === x.title ? "#d64545" : "#141414" }}>{x.score}</span>
              <span className="flex min-w-0 flex-col gap-1"><span className="text-title font-semibold leading-snug">{x.title}</span><span className="text-body text-muted">{x.why}</span><span className="text-meta font-semibold text-[#d64545]">{x.pillar}</span></span></button>)}
            <div className="card flex flex-col gap-2 p-3.5"><span className="label">Or use your own</span><div className="flex gap-2"><input className="field" placeholder="The idea in one line" value={ownIdea} onChange={(e) => setOwnIdea(e.target.value)} /><button className="btn btn-dark" disabled={!ownIdea.trim()} onClick={() => { setIdea({ title: ownIdea.trim(), why: "", pillar, score: 0 }); setOwnIdea(""); }}>Use it</button></div>
              <label className="flex items-center gap-2 text-meta text-muted">Pillar<select className="field h-8 w-auto" value={pillar} onChange={(e) => setPillar(e.target.value)}><option value="">Not set</option>{pillars.map((p) => <option key={p}>{p}</option>)}</select></label>
              {idea && <span className="text-body">Chosen: <b>{idea.title}</b></span>}</div>
          </div>}

          {step === S.angle && <div className="flex flex-col gap-3" data-tour="angles">
            <H t="Choose the angle" sub={`What ${first} will say about it. The angle steers the opening line and all three drafts.`} right={editable && <button className="btn h-9" disabled={!!busy || !idea} onClick={getAngles}>{busy === "angles" ? "Thinking" : "Sharpen with AI"}</button>} />
            {topic && <div className="flex flex-col gap-1.5 rounded-[14px] border border-line bg-white px-4 py-3.5"><span className="text-meta font-semibold text-[#d64545]">{topic.tag}</span><span className="text-title font-semibold leading-snug">{topic.title}</span><span className="text-meta text-muted">{topic.line}</span></div>}
            {angles.map((a, i) => <button key={a.kind + i} aria-pressed={angle === i} className={pick(angle === i)} onClick={() => setAngle(i)}>
              <span className="flex items-center gap-2 text-meta font-semibold" style={{ color: a.kind === "Suggested by Discovery Studio" ? "#d64545" : a.kind.startsWith("From strategy") ? "#141414" : "#5f5f5f" }}><span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ border: angle === i ? "4px solid #d64545" : "1.5px solid #c0c0c0" }} />{a.kind}</span>
              <span className="text-body font-medium leading-snug">{a.text}</span></button>)}
            <div className={pick(angle === "own") + " !gap-2"}>
              <button className="flex items-center gap-2 text-meta font-semibold" onClick={() => setAngle("own")}><span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ border: angle === "own" ? "4px solid #d64545" : "1.5px solid #c0c0c0" }} />Your own angle</button>
              <label htmlFor="own-angle" className="sr-only">Your own angle</label>
              <textarea id="own-angle" className="field text-body" rows={2} value={ownAngle} onFocus={() => setAngle("own")} onChange={(e) => { setOwnAngle(e.target.value); setAngle("own"); }} placeholder={`In one line: what ${first} wants to say about it`} />
            </div>
          </div>}

          {step === S.hook && <div className="flex flex-col gap-3">
            <AngleBar />
            <H t={video ? `Choose the first line ${first} says` : "Choose the opening line"} sub={video ? "The first 3 seconds decide whether people keep watching." : `Mobile shows about ${FOLD.mobile} characters before "see more". Each line is checked against it.`} right={editable && <button className="btn h-9" disabled={!!busy || !idea} onClick={getHooks}><Sparkles size={14} /> {busy === "hooks" ? "Writing" : hooks.length ? "Write again" : "Write hooks"}</button>} />
            {hooks.map((h) => { const ok = video ? sayableIn3s(h.text) : hookFits(h.text, device); return (
              <button key={h.text} aria-pressed={hook === h.text} className={pick(hook === h.text) + " !flex-row !items-center !gap-3"} onClick={() => setHook(h.text)}>
                <span className="h-[18px] w-[18px] shrink-0 rounded-full bg-white" style={{ border: hook === h.text ? "6px solid #d64545" : "1.5px solid #d0d0d0" }} />
                <span className="min-w-0 flex-1 text-body font-medium leading-snug">{h.text}</span>
                <span className="flex shrink-0 flex-col items-end gap-0.5"><span className="text-meta font-semibold">{h.kind}</span><span className="num text-meta" style={{ color: ok ? "#5f5f5f" : "#d64545" }}>{video ? (ok ? "Under 3 seconds" : "Too long to say") : ok ? "Fits the fold" : "Cut by the fold"}</span></span>
              </button>); })}
            <label className="card flex flex-col gap-2 p-3.5"><span className="label">Or write the opening line</span><input className="field" value={hook} onChange={(e) => setHook(e.target.value)} placeholder="One line that stands on its own" /></label>
          </div>}

          {step === S.draft && !video && <div className="flex flex-col gap-3">
            <AngleBar />
            <H t="Shape the draft" sub="Three drafts to choose from. Edit freely; every rule is checked as you type." right={<span className="text-meta text-muted">In {possessive(first)} voice · <Link href={`/w/${ws.slug}/studio`} className="font-semibold text-ink underline underline-offset-2">Voice settings</Link></span>} />
            <div className="flex flex-wrap gap-2">
              {drafts.map((d, i) => <button key={i} aria-pressed={dIdx === i} className={pick(dIdx === i) + " !flex-1 !gap-1 !p-3"} onClick={() => { setDIdx(i); setText(d.text); }}><span className="text-body font-semibold">Draft {"ABC"[i]} · {d.angle || "Angle"}</span><span className="num flex gap-3 text-meta"><span>Human {humanScore(d.text).score}</span><span style={{ color: d.impact >= 70 ? "#d64545" : "#5f5f5f" }}>{d.impact ? `Impact ${d.impact}` : "Impact not scored"}</span></span></button>)}
              {editable && <button className="btn h-auto min-h-[56px] px-4" disabled={!!busy || !hook} onClick={getDrafts}><Sparkles size={14} /> {busy === "drafts" ? "Writing" : drafts.length ? "Write three more" : "Write three drafts"}</button>}
            </div>
            <div className="card overflow-hidden" data-tour="editor">
              <label htmlFor="draft-box" className="sr-only">Draft text</label>
              <textarea id="draft-box" className="block min-h-[300px] w-full resize-y border-0 px-5 py-4 text-body leading-relaxed outline-none" value={text} onChange={(e) => setText(e.target.value)} placeholder="The draft appears here, or write it yourself." />
              <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-3 py-2.5">
                {QUICK.map(([l, how]) => <button key={l} className="h-[30px] rounded-full border border-line bg-white px-3 text-meta hover:border-[#141414] disabled:opacity-40" disabled={!text || !!busy} onClick={() => quick(l, how)}>{busy === "quick" ? "…" : l}</button>)}
                <span className="num ml-auto text-meta text-muted">{Array.from(text).length.toLocaleString()} / {type === "Article" ? "125,000" : "3000"} · {text.trim().split(/\s+/).filter(Boolean).length} words</span>
              </div>
            </div>
            {!!human.flags.length && <p className="m-0 text-meta text-[#9e1c1c]">House rules: {human.flags.join(" · ")}</p>}
          </div>}

          {step === S.draft && video && <div className="flex flex-col gap-3">
            <AngleBar />
            <H t="Write the script" sub={`What ${first} says, and what shows on screen while it is said.`} right={<span className="flex items-center gap-2"><span className="num rounded-full bg-[#141414] px-3 py-1 text-meta text-white">About {Math.round(spoken / 2.5)} seconds spoken</span>{editable && <button className="btn h-9" disabled={!!busy || !hook} onClick={getScript}><Sparkles size={14} /> {busy === "script" ? "Writing" : "Write the script"}</button>}</span>} />
            <label className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-4 text-ink"><span className="text-meta font-semibold text-ink">Hook · first 3 seconds</span><input className="field h-11 text-title font-semibold" value={script.hook || hook} onChange={(e) => setScript({ ...script, hook: e.target.value })} /></label>
            {script.beats.map((b, i) => (
              <div key={i} className="card flex gap-3 p-3.5">
                <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#d64545] text-meta text-white">{i + 1}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <label className="flex flex-col gap-1"><span className="label">Say</span><input className="field" value={b.say} onChange={(e) => setScript({ ...script, beats: script.beats.map((x, j) => (j === i ? { ...x, say: e.target.value } : x)) })} /></label>
                  <label className="flex flex-col gap-1"><span className="label">Show on screen</span><input className="field border-dashed text-body text-muted" value={b.show} onChange={(e) => setScript({ ...script, beats: script.beats.map((x, j) => (j === i ? { ...x, show: e.target.value } : x)) })} /></label>
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
                  <span className="flex aspect-[4/5] w-full flex-col gap-2 rounded-xl p-3 text-left" style={{ background: bg, color: fg, border: k === "white" ? "1px solid #e8e8e8" : 0 }}><span className="text-meta font-semibold uppercase tracking-wider opacity-80">{byline}</span><span className="text-body font-semibold leading-snug">{script.hook || hook}</span></span>
                  <span className="text-meta font-semibold capitalize">{k} cover</span></button>))}</div>
              <div className="card flex flex-wrap items-center gap-3 p-4"><span className="min-w-[200px] flex-1"><b className="block">Burned-in captions</b><span className="text-meta text-muted">Most feed videos play muted, so the words carry the point.</span></span>
                <div className="flex rounded-lg border border-line p-0.5">{[["bold", "Bold block"], ["line", "Clean line"], ["off", "Off"]].map(([k, l]) => <button key={k} className={`h-8 rounded-md px-3 text-body font-semibold ${script.captions === k ? "bg-[#d64545] text-white" : "text-muted"}`} onClick={() => setScript({ ...script, captions: k })}>{l}</button>)}</div></div>
              <VideoPanel wsId={ws.id} postId={postId} ensurePost={async () => (await save())?.id ?? null} path={videoPath} setPath={setVideoPath} script={{ ...script, hook: script.hook || hook }} title={idea?.title || hook} editable={editable} />
            </> : type === "Carousel" ? <>
              <H t="Build the carousel" sub="The house template keeps the text sharp. LinkedIn takes it as a PDF document." right={<span className="flex gap-2">{editable && <button className="btn h-9" disabled={!!busy} onClick={getSlides}><Sparkles size={14} /> {busy === "slides" ? "Writing" : slides.length ? "Write again" : "Write the slides"}</button>}<button className="btn btn-primary h-9" disabled={!slides.length} onClick={() => { const b = carouselPdf(slides, byline.replace(" · ", " - ")); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([b.buffer as ArrayBuffer], { type: "application/pdf" })); a.download = `${(idea?.title || "carousel").slice(0, 40).replace(/[^\w]+/g, "-").toLowerCase()}.pdf`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }}><Download size={14} /> Download PDF</button></span>} />
              <div className="flex gap-2.5 overflow-x-auto pb-2">{slides.map((s, i) => { const dark = i === 0 || i === slides.length - 1; return (
                <div key={i} className="flex h-[200px] w-[160px] shrink-0 flex-col gap-1.5 rounded-xl border p-3" style={{ background: dark ? "#141414" : "#fff", color: dark ? "#fff" : "#141414", borderColor: dark ? "#141414" : "#e8e8e8" }}>
                  <span className="num text-meta text-[#d64545]">{String(i + 1).padStart(2, "0")}</span>
                  <input className="bg-transparent text-body font-semibold outline-none" value={s.title} onChange={(e) => setSlides(slides.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} aria-label={`Slide ${i + 1} title`} />
                  <textarea className="flex-1 resize-none bg-transparent text-meta opacity-80 outline-none" value={s.body} onChange={(e) => setSlides(slides.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} aria-label={`Slide ${i + 1} text`} />
                </div>); })}
                {!slides.length && <p className="m-0 text-body text-muted">Write the slides from the draft, then edit any of them here.</p>}</div>
            </> : type === "Poll" ? <>
              <H t="Poll options" sub="Two to four options, each under 30 characters." />
              {pollOpts.map((o, i) => <div key={i} className="flex gap-2"><input className="field" maxLength={30} value={o} onChange={(e) => setPollOpts(pollOpts.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Option ${i + 1}`} /><button className="btn h-9 w-9 p-0" aria-label="Remove option" disabled={pollOpts.length <= 2} onClick={() => setPollOpts(pollOpts.filter((_, j) => j !== i))}><X size={14} /></button></div>)}
              <button className="btn w-fit" disabled={pollOpts.length >= 4} onClick={() => setPollOpts([...pollOpts, ""])}>Add an option</button>
            </> : <>
              <H t="Add a visual" sub="Optional. Plain text posts often reach further, which suits an opinion." />
              <div className="grid grid-cols-3 gap-2.5">{[["statement", "Statement card", "The key line, set large."], ["diagram", "Simple diagram", "Boxes that show a flow."], ["photo", "Photo with caption", "An editorial image."]].map(([k, t, sub]) => (
                <button key={k} aria-pressed={layout === k} className={pick(layout === k) + " !p-2.5"} onClick={() => setLayout(k)}>
                  <svg viewBox="0 0 120 80" className="w-full rounded-lg border border-[#ececec]" aria-hidden="true"><rect width="120" height="80" fill="#fff" />{k === "statement" ? <><rect x="14" y="18" width="78" height="6" fill="#141414" /><rect x="14" y="30" width="66" height="6" fill="#141414" /><rect x="14" y="42" width="40" height="6" fill="#141414" /><rect x="14" y="62" width="14" height="2" fill="#d64545" /></> : k === "diagram" ? <><rect x="10" y="30" width="26" height="20" rx="2" fill="none" stroke="#141414" /><rect x="47" y="30" width="26" height="20" rx="2" fill="none" stroke="#141414" /><rect x="84" y="30" width="26" height="20" rx="2" fill="#141414" /><path d="M37 40h9M74 40h9" stroke="#d64545" /></> : <><rect x="10" y="10" width="100" height="44" rx="2" fill="#ececec" /><rect x="10" y="62" width="62" height="4" fill="#141414" /></>}</svg>
                  <span className="text-body font-semibold">{t}</span><span className="text-meta text-muted">{sub}</span></button>))}</div>
              <label className="flex flex-col gap-1.5"><span className="label">Anything to add to the image brief</span><input className="field" value={imgPrompt} onChange={(e) => setImgPrompt(e.target.value)} placeholder="For example: a settlement line meeting a ledger" /></label>
              {ext?.searchKeys?.openai || ext?.searchKeys?.gemini ? (
                <div className="flex flex-wrap items-center gap-2"><span className="flex basis-full flex-wrap items-center gap-x-2 gap-y-1 pb-1 text-meta text-muted">Made with <ProviderMark id={ext.searchKeys.openai ? "openai" : "gemini"} bold={false} className="text-ink" /><ModelId model={ext.searchKeys.openai ? "gpt-image-1" : "gemini-2.5-flash-image"} /><KeyState on className="text-meta" /></span><button className="btn btn-primary" disabled={busy === "image"} onClick={genImage}>{busy === "image" ? "Making the image" : shownImg || imgPath ? "Make another" : "Make the image"}</button>{(image || imgPath) && <button className="btn" onClick={downloadImage}><Download size={14} /> Download</button>}{(image || imgPath) && <button className="btn btn-ghost" onClick={dropImage}>Remove</button>}{imgPath && <span className="basis-full text-meta text-muted">Saved with the post. It stays here after a reload.</span>}</div>
              ) : (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3.5"><span className="flex min-w-[220px] flex-1 flex-col gap-1.5"><span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body"><ProviderMark id="openai" /><span className="text-muted">or</span><ProviderMark id="gemini" /></span><KeyState on={false} className="text-meta" /><span className="text-meta text-muted">Images use the OpenAI or Google Gemini (Nano Banana) key. It stays in this browser.</span></span><Link className="btn btn-primary" href={`/w/${ws.slug}/extension#search-keys`}>Connect</Link></div>
              )}
            </>}
          </div>}

          {step === S.plan && <div className="flex flex-col gap-3.5" data-tour="handoff">
            {angleText && <AngleBar />}
            <H t="Plan and hand off" sub={`Prax never posts. It copies the post, opens LinkedIn and reminds ${first} at the planned time.`} right={live && <span className="flex items-center gap-2"><StatusPill s={live.status} /><button className="btn btn-ghost h-8" onClick={() => openPost(live)}>Open</button></span>} />
            {type === "Article" && settings.newsletter.name && <SwitchRow className="rounded-xl border border-line bg-white px-3.5 py-3" on={newsletter} onChange={setNewsletter} label={<>Part of the <b className="font-semibold">{settings.newsletter.name}</b> newsletter</>} />}
            {!!flags.length && <div className="rounded-xl border-2 border-[#d64545] bg-white p-4" data-tour="claims">
              <div className="mb-2 text-body font-semibold">Check before it goes to {first}</div>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">{flags.map((f, i) => <li key={i} className="text-body"><span className="font-semibold text-[#d64545]">{f.kind === "returns" ? "Returns" : f.kind === "timeline" ? "Timeline" : f.kind === "client" ? "Client named" : f.kind === "regulator" ? "Regulator" : "Confidential"}</span> · &ldquo;{f.text}&rdquo;<span className="block text-meta text-muted">{f.why}</span></li>)}</ul>
              <label className="mt-3 flex items-center gap-2 text-body"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />I checked these and they are fine to publish</label>
            </div>}
            <div className="card flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between"><span className="label">Approval</span>{live ? <StatusPill s={live.status} /> : <span className="pill border border-[#d4d4d4] bg-white text-muted">Not saved</span>}</div>
              {st === "In review" ? (owner ? <>
                <textarea className="field text-body" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the team (needed when asking for changes)" />
                <div className="flex gap-2"><button className="btn btn-primary" onClick={() => decide(true)}>Approve</button><button className="btn" onClick={() => decide(false)}>Ask for changes</button></div>
              </> : <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-body">With {first}. It is in the approval session on Today.</span><button className="btn" onClick={withdraw}>Withdraw</button></div>)
                : st === "Ready" || st === "Posted" ? <span className="text-body">Approved. It can go on the plan.</span>
                : <>
                  {live?.decision === "changes" && live.decision_note && <p className="m-0 rounded-lg bg-surface-2 px-3 py-2 text-body">{first} asked for changes: &ldquo;{live.decision_note}&rdquo;</p>}
                  <p className="m-0 text-body leading-relaxed">{cap(first)} owns this profile, so team drafts need a yes before they are planned. They arrive in one weekly approval session on Today.</p>
                  {editable && <div className="flex flex-wrap gap-2"><button className="btn" onClick={saveDraft}>Save draft</button><button className="btn btn-primary" onClick={sendForApproval}>Send to {first} for approval</button>{owner && <button className="btn btn-ghost" onClick={() => decide(true)}>Approve it myself</button>}</div>}
                </>}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex flex-col gap-1.5"><span className="label">Day</span><input type="date" className="field h-11" value={planDay} onChange={(e) => setPlanDay(e.target.value)} /></label>
              <label className="flex flex-col gap-1.5"><span className="label">Time, Dubai</span><input type="time" className="field h-11" value={planTime} onChange={(e) => setPlanTime(e.target.value)} /></label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-dark h-12 px-5" disabled={st !== "Ready"} title={st !== "Ready" ? `${cap(first)} approves it first` : ""} onClick={addToPlan}>Add to the plan</button>
              <button className="btn btn-primary h-12 px-5" disabled={st !== "Ready" && st !== "Posted"} onClick={handOff}><Copy size={15} /> Copy and open LinkedIn</button>
              <button className="btn btn-ghost h-12" onClick={reset}>Start a new post</button>
            </div>
          </div>}

          {!(step === 0 && src === "repurpose") && <div className="flex items-center justify-between gap-2.5 pt-0.5">
            <button className="btn h-10 px-4" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
            <span className="num text-meta text-faint">Step {step + 1} of {names.length}</span>
            <button className="btn btn-primary h-10 px-5" disabled={step === S.plan || !canNext} onClick={() => { const n = step + 1; setStep(n); if (n === S.idea && !ideas.length && editable) getIdeas(); if (n === S.hook && !hooks.length && editable && idea) getHooks(); if (n === S.draft && !video && !drafts.length && !text && editable && hook) getDrafts(); }}>{step === S.plan ? "Done" : "Continue"}</button>
          </div>}
        </section>

        <aside className="flex min-w-0 flex-[2_1_340px] flex-col gap-3">
          <LinkedInPreview text={step === 0 && src === "repurpose" ? rpSrc?.draft ?? "" : body || hook} image={step === 0 && src === "repurpose" ? null : shownImg} company={step === 0 && src === "repurpose" ? rpSrc?.channel === "company" : channel === "company"} device={device} setDevice={setDevice}
            video={video ? <div className="flex aspect-[4/5] flex-col gap-2.5 p-[18px]" style={{ background: script.cover === "red" ? "#d64545" : script.cover === "white" ? "#fff" : "#141414", color: script.cover === "white" ? "#141414" : "#fff" }}><span className="text-meta font-semibold uppercase tracking-wider opacity-80">{byline}</span><span className="text-title font-semibold leading-snug">{script.hook || hook || "The hook appears here"}</span>{script.captions !== "off" && script.beats[0]?.say && <span className="mt-auto self-center rounded-md px-2.5 py-1.5 text-center text-body font-semibold" style={{ background: script.captions === "bold" ? "#141414" : "transparent", color: "#fff" }}>{script.beats[0].say}</span>}</div> : undefined}
            footer={!video && <>{(body || hook).trim() ? ` · Human ${human.score}` : ""}{draft?.impact ? ` · Impact ${draft.impact}` : ""}</>} />
          {channel === "company" && <p className="m-0 text-center text-meta font-semibold">Company content, not for {possessive(first)} profile</p>}
        </aside>
      </div>
    </div>
  );
}
