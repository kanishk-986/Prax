"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, Plus, X, Copy, Bookmark, Trash2, Download, ChevronDown, Wand2, Star } from "lucide-react";
import { unzipSync, strFromU8 } from "fflate";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useWorkspace, fmtDay, ymd, today, weekStart, addDays } from "@/lib/workspace";
import { Section, KpiTiles, DarkCard, StartCards, type TourStep } from "@/components/shell";
import { useToast, haptic } from "@/components/toaster";
import { askExtension, parseJSON } from "@/lib/bridge";
import {
  mergeStudio, humanScore, LENGTHS, DEFAULT_STYLES, DEFAULT_PLAYBOOKS, DEFAULT_TUNING, DEFAULT_SAFETY,
  type Studio, type Style, type Playbook, type Tuning, type Safety, type Fingerprint,
} from "@/lib/studio";

const TABS = ["Home", "Voice Lab", "Styles", "Playbooks", "Tuning", "Rewrite Lab", "Library", "Safety"] as const;
type Tab = (typeof TABS)[number];
type Field = keyof Studio;
type Save = <K extends Field>(field: K, value: Studio[K], msg?: string) => Promise<boolean>;
const STUDIO_TOUR: TourStep[] = [
  { target: "header", title: "How every draft is written", body: "Comment Studio holds the voice, the styles, the rules per kind of post and the limits. The extension reads them each time LinkedIn loads.", tab: "Home" },
  { target: "kpis", title: "This week at a glance", body: "Drafts written this week, the average Human and Impact scores over 30 days, and how many drafts are saved.", tab: "Home" },
  { target: "voice", title: "Voice status", body: "Whether a voice fingerprint is in use. Without one, drafts follow the comment rules only.", tab: "Home" },
  { target: "styles", title: "Top styles", body: "The styles used most in the last 30 days. Turn styles on or off in the Styles tab.", tab: "Home" },
  { target: "start", title: "Start something", body: "Build or refresh the voice, test a draft in Rewrite Lab, or open the saved drafts.", tab: "Home" },
  { target: "header", title: "Everything else lives in the tabs", body: "Playbooks set rules per kind of post, Tuning sets length and scoring, Safety sets the limits. Press Guide to see this again.", tab: "Home" },
];

type U = { at: string; kind: string; style: string; human: number | null; impact: number | null };

export default function StudioPage() {
  const { ws } = useWorkspace();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("Home");
  const [studio, setStudio] = useState<Studio | null>(null);

  useEffect(() => {
    supabase().from("studio_settings").select("*").eq("workspace_id", ws.id).maybeSingle()
      .then(({ data }: { data: Partial<Studio> | null }) => setStudio(mergeStudio(data)));
  }, [ws.id]);

  // Saves one part of the settings; the extension picks it up the next time it loads LinkedIn.
  const save: Save = useCallback(async (field, value, msg = "Saved") => {
    const { error } = await supabase().from("studio_settings").upsert({ workspace_id: ws.id, [field]: value, updated_at: new Date().toISOString() });
    if (error) { toast(error.message); return false; }
    setStudio((s) => (s ? { ...s, [field]: value } : s)); haptic(); toast(msg);
    return true;
  }, [ws.id, toast]);

  const d30 = addDays(today(), -30), wk = weekStart(today());
  const use = useLive<U>("ext_usage", ws.id, { filter: (q) => q.gte("at", d30) });
  const saved = useLive<{ id: string }>("saved_drafts", ws.id, {});
  const stats = useMemo(() => {
    const drafts = use.rows.filter((u) => ["comment", "reply", "note"].includes(u.kind));
    const scored = use.rows.filter((u) => u.kind === "scores");
    const avg = (k: "human" | "impact") => { const v = scored.map((x) => x[k]).filter((x): x is number => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
    const styles = Object.entries(scored.reduce((m: Record<string, number>, x) => { if (x.style) m[x.style] = (m[x.style] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { week: drafts.filter((u) => u.at.slice(0, 10) >= wk).length, human: avg("human"), impact: avg("impact"), styles };
  }, [use.rows, wk]);
  const fp = studio?.voice_profile;
  const on = studio?.styles.filter((s) => s.on).length ?? 0;

  return (
    <Section id="studio" title="Comment Studio" status="How every Prax draft is written for this profile: the voice, the styles, the rules per kind of post, and the limits."
      entryStatus={`${stats.week} drafts this week. ${fp?.summary ? "Voice fingerprint in use." : "No voice fingerprint yet."}`}
      tabs={TABS.map((t) => ({ id: t, label: t, count: t === "Library" ? saved.rows.length : undefined }))} tab={tab} onTab={(t) => setTab(t as Tab)} steps={STUDIO_TOUR}>
      {!studio ? <div className="card h-64 animate-pulse bg-surface-2" />
        : tab === "Home" ? (
          <div className="flex flex-col gap-4">
            <KpiTiles tour="kpis" items={[
              { label: "Drafts this week", value: stats.week, sub: "written with the extension", tone: "dark" },
              { label: "Average Human", value: stats.human ?? "None", sub: stats.human == null ? "no scored drafts yet" : "last 30 days" },
              { label: "Average Impact", value: stats.impact ?? "None", sub: stats.impact == null ? "no scored drafts yet" : "last 30 days" },
              { label: "Saved drafts", value: saved.rows.length, sub: "in the Library", onClick: () => setTab("Library") },
            ]} />
            <div className="grid gap-4 md:grid-cols-2">
              <DarkCard tour="voice" kicker="Voice">
                <p className="text-[15px] leading-relaxed">{fp?.summary ? fp.summary : "No voice fingerprint yet. Drafts follow the comment rules in Settings until one is built in Voice Lab."}</p>
                <p className="text-[12px] text-[#cfcfcf]">{on} of {studio.styles.length} styles on</p>
              </DarkCard>
              <section data-tour="styles" className="rounded-2xl border border-line bg-surface p-[18px]">
                <div className="mb-3 font-semibold">Top styles, 30 days</div>
                {stats.styles.length === 0 ? <p className="text-[13px] text-muted">No scored drafts yet. Styles show here once the extension has written a few.</p> : stats.styles.map(([k, n]) => (
                  <div key={k} className="mb-2"><div className="flex justify-between text-[13px]"><span className="truncate">{k}</span><span className="num text-muted">{n}</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((n / stats.styles[0][1]) * 100)}%` }} /></div></div>
                ))}
              </section>
            </div>
            <StartCards tour="start" items={[
              { title: fp?.summary ? "Refresh the voice" : "Build the voice", sub: "Add posts and comments he wrote; Prax learns how he sounds.", icon: Wand2, primary: !fp?.summary, onClick: () => setTab("Voice Lab") },
              { title: "Test a rewrite", sub: "Paste a draft and see it rewritten and scored.", icon: Star, onClick: () => setTab("Rewrite Lab") },
              { title: "Open saved drafts", sub: "Copy or export what is kept in the Library.", icon: Bookmark, onClick: () => setTab("Library") },
            ]} />
          </div>
        )
        : tab === "Voice Lab" ? <VoiceLab studio={studio} save={save} />
        : tab === "Styles" ? <Styles studio={studio} save={save} />
        : tab === "Playbooks" ? <Playbooks studio={studio} save={save} />
        : tab === "Tuning" ? <TuningTab studio={studio} save={save} />
        : tab === "Rewrite Lab" ? <RewriteLab studio={studio} />
        : tab === "Library" ? <Library />
        : <SafetyTab studio={studio} save={save} />}
    </Section>
  );
}

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const Hint = ({ children }: { children: React.ReactNode }) => <p className="text-[12px] leading-relaxed text-muted">{children}</p>;

function Seg<T extends string>({ value, options, onChange, disabled }: { value: T; options: { v: T; label: string; sub?: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="flex rounded-lg border border-line-strong bg-surface p-0.5">
      {options.map((o) => (
        <button key={o.v} type="button" disabled={disabled} onClick={() => onChange(o.v)} className={`flex-1 rounded-md px-2 py-1.5 text-center text-[13px] transition-colors ${value === o.v ? "bg-surface-2 font-semibold" : "text-muted hover:text-ink"}`}>
          {o.label}{o.sub && <span className="block text-[11px] font-normal text-faint">{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange, label, sub, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: string; disabled?: boolean }) {
  return (
    <label className="flex items-start justify-between gap-4 border-b border-line py-3 last:border-0">
      <span><span className="block text-[13px] font-medium">{label}</span>{sub && <span className="block text-[12px] text-muted">{sub}</span>}</span>
      <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-line-strong"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}

// ---------------- Voice Lab ----------------
async function fileText(f: File): Promise<string> {
  const n = f.name.toLowerCase();
  if (n.endsWith(".pdf")) {
    const fd = new FormData(); fd.append("file", f);
    const r = await fetch("/api/parse-pdf", { method: "POST", body: fd });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "Could not read the PDF");
    return j.text;
  }
  if (n.endsWith(".docx")) {
    const files = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (x) => x.name === "word/document.xml" });
    const xml = strFromU8(files["word/document.xml"] ?? new Uint8Array());
    return xml.replace(/<\/w:p>/g, "\n").replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  }
  return f.text();
}

type Version = { id: string; source_name: string; source_chars: number; fingerprint: Fingerprint; created_at: string };

function VoiceLab({ studio, save }: { studio: Studio; save: Save }) {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const editable = can("editor");
  const versions = useLive<Version>("voice_versions", ws.id, { order: "created_at", asc: false });
  const [text, setText] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const fp = studio.voice_profile;

  async function add(files: FileList | File[]) {
    for (const f of Array.from(files)) {
      setBusy(`Reading ${f.name}`);
      try { const t = (await fileText(f)).trim(); if (t) { setText((x) => (x ? x + "\n\n" : "") + t); setNames((n) => [...n, f.name]); } }
      catch (e) { toast((e as Error).message); }
    }
    setBusy("");
  }

  async function build() {
    setBusy("Building the voice fingerprint");
    try {
      const out = await askExtension<string>("ai", { plain: true, kind: "voice", rules: "You study how one senior professional writes and describe it precisely, so another writer can match it. Report only what the text shows.", user: `TEXT WRITTEN BY THE PERSON:\n${text.slice(0, 30000)}\n\nDescribe how they write. Return only JSON: {"summary": "two sentences on the voice", "tone": ["3 to 5 words"], "sentences": "sentence length and rhythm in one line", "vocabulary": ["words and terms they favour, up to 12"], "phrases": ["short phrases they actually use, up to 8"], "avoid": ["things they never do, up to 6"], "sample": "a 50-word LinkedIn comment in this voice on a stablecoin settlement post"}` });
      const f = parseJSON<Fingerprint>(out);
      if (!f?.summary) throw new Error("The model did not return a fingerprint. Try again.");
      const { error } = await supabase().from("voice_versions").insert({ workspace_id: ws.id, source_name: names.join(", ") || "Pasted text", source_chars: text.length, fingerprint: f });
      if (error) throw error;
      await save("voice_profile", f, "Voice fingerprint built and in use");
      setText(""); setNames([]);
    } catch (e) { toast((e as Error).message); }
    setBusy("");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-4">
        <div className="mb-3 text-[13px] font-semibold">Source material</div>
        {editable ? (
          <>
            <button type="button" disabled={!!busy} onClick={() => input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
              className={`grid w-full place-items-center gap-1.5 rounded-xl border border-dashed px-4 py-7 text-center transition-colors ${drag ? "border-accent bg-accent-soft" : "border-line-strong hover:bg-surface-2"}`}>
              <Upload size={18} className="text-muted" />
              <span className="text-[13px] font-medium">{busy.startsWith("Reading") ? busy : "Drop a CV, profile PDF, TXT or DOCX"}</span>
              <span className="text-[12px] text-muted">or click to choose. Several files add up.</span>
            </button>
            <input ref={input} type="file" multiple accept=".pdf,.txt,.docx,.md" className="hidden" onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
            {names.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{names.map((n) => <span key={n} className="chip">{n}</span>)}</div>}
            <textarea className="field mt-3 min-h-[220px] py-2 text-[12px] leading-relaxed" value={text} onChange={(e) => setText(e.target.value)}
              placeholder={"Paste anything Shashi wrote himself: his LinkedIn About section, past comments and posts, CV sections, emails.\n\nThe more of his own writing, the closer the match. 2,000 characters or more works best."} />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button className="btn btn-primary" disabled={text.trim().length < 400 || !!busy} onClick={build}><Wand2 size={14} /> {busy.startsWith("Building") ? "Building" : "Build voice fingerprint"}</button>
              <span className={`num text-[12px] ${text.length >= 2000 ? "text-good" : "text-muted"}`}>{text.length.toLocaleString()} characters</span>
            </div>
            <div className="mt-3"><Hint>The analysis runs through the Prax extension with your own AI key. The source text is not stored; only the fingerprint is.</Hint></div>
          </>
        ) : <Hint>Editors build the voice here.</Hint>}
      </div>

      <div className="flex flex-col gap-4">
        <div className="card p-4">
          <div className="mb-3 text-[13px] font-semibold">Voice fingerprint {fp.summary && <span className="chip ml-1 text-good">In use</span>}</div>
          {fp.summary ? <FingerprintView f={fp as Fingerprint} /> : <div className="grid min-h-[160px] place-items-center text-center text-[13px] text-muted">No fingerprint yet. Add source material and build it.</div>}
        </div>
        <div className="card p-4">
          <div className="label mb-1.5">Locked rules for this profile</div>
          <Hint>Every draft also follows the comment rules in <Link href={`/w/${ws.slug}/settings`} className="underline">Settings</Link> (C-suite and B2B voice, no contractions, no dashes, never against a regulator). The fingerprint shapes how it sounds; it cannot override them.</Hint>
        </div>
        {versions.rows.length > 0 && (
          <div className="card p-2">
            <div className="label px-2 pb-1.5 pt-1">Earlier fingerprints</div>
            {versions.rows.map((v) => (
              <div key={v.id} className="flex items-center gap-3 rounded-lg px-2 py-2 text-[13px] hover:bg-surface-2/60">
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{v.source_name || "Pasted text"}</div><div className="text-[11px] text-muted">{fmtDay(ymd(new Date(v.created_at)), { day: "numeric", month: "short", year: "numeric" })} · {v.source_chars.toLocaleString()} characters</div></div>
                {fp.summary === v.fingerprint.summary ? <span className="chip text-good">In use</span> : editable && <button className="btn h-7 px-2 text-[12px]" onClick={() => save("voice_profile", v.fingerprint, "Switched to this fingerprint")}>Use this one</button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FingerprintView({ f }: { f: Fingerprint }) {
  const Row = ({ k, v }: { k: string; v?: string | string[] }) => (v && v.length ? <div className="mb-2.5"><div className="label mb-1">{k}</div>{Array.isArray(v) ? <div className="flex flex-wrap gap-1.5">{v.map((x) => <span key={x} className="chip">{x}</span>)}</div> : <p className="text-[13px] leading-relaxed text-ink-2">{v}</p>}</div> : null);
  return (
    <div className="anim-rise">
      <Row k="Summary" v={f.summary} /><Row k="Tone" v={f.tone} /><Row k="Sentences" v={f.sentences} /><Row k="Favoured terms" v={f.vocabulary} /><Row k="Phrases" v={f.phrases} /><Row k="Never" v={f.avoid} />
      {f.sample && <div className="mt-3 rounded-lg bg-surface-2 p-3 text-[13px] leading-relaxed text-ink-2"><div className="label mb-1">Sample comment</div>{f.sample}</div>}
    </div>
  );
}

// ---------------- Styles ----------------
function Styles({ studio, save }: { studio: Studio; save: Save }) {
  const { can } = useWorkspace();
  const editable = can("editor");
  const [list, setList] = useState<Style[]>(studio.styles);
  const [open, setOpen] = useState<string | null>(null);
  const dirty = JSON.stringify(list) !== JSON.stringify(studio.styles);
  const set = (id: string, v: Partial<Style>) => setList(list.map((s) => (s.id === id ? { ...s, ...v } : s)));
  async function toggle(id: string) {
    const next = list.map((s) => (s.id === id ? { ...s, on: !s.on } : s));
    if (!next.some((s) => s.on)) return;
    setList(next); await save("styles", next, next.find((s) => s.id === id)!.on ? "Style on" : "Style off");
  }
  function addCustom() {
    const id = "custom-" + Date.now().toString(36);
    setList([...list, { id, name: "New style", desc: "", rules: "", on: true, custom: true }]); setOpen(id);
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Hint>Styles that are on appear as chips under every post. Each is a different angle on the same post; the locked rules apply to all of them.</Hint>
        {editable && <div className="flex gap-2">{dirty && <button className="btn btn-primary" onClick={() => save("styles", list, "Styles saved")}>Save styles</button>}<button className="btn" onClick={addCustom}><Plus size={14} /> Custom style</button></div>}
      </div>
      {list.map((s) => (
        <div key={s.id} className="card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1"><div className="text-[14px] font-semibold">{s.name || "Untitled style"}{s.custom && <span className="chip ml-2">Custom</span>}</div><div className="text-[12px] text-muted">{s.desc}</div></div>
            {editable && <button className="btn h-7 px-2.5 text-[12px]" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? "Done" : "Tweak"}</button>}
            <button type="button" role="switch" aria-checked={s.on} aria-label={`${s.name} on`} disabled={!editable} onClick={() => toggle(s.id)} className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${s.on ? "bg-accent" : "bg-line-strong"}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${s.on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
            </button>
          </div>
          {open === s.id ? (
            <div className="anim-rise mt-3 grid gap-2 md:grid-cols-[1fr_1fr]">
              <input className="field" value={s.name} onChange={(e) => set(s.id, { name: e.target.value })} aria-label="Style name" />
              <input className="field" value={s.desc} onChange={(e) => set(s.id, { desc: e.target.value })} placeholder="One-line description" aria-label="Description" />
              <textarea rows={3} className="field h-auto py-2 text-[12px] md:col-span-2" value={s.rules} onChange={(e) => set(s.id, { rules: e.target.value })} placeholder="What this style does, in plain instructions" aria-label="Rules" />
              {s.custom && <button className="btn btn-ghost w-fit hover:text-bad" onClick={() => setList(list.filter((x) => x.id !== s.id))}><Trash2 size={13} /> Remove</button>}
            </div>
          ) : <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-ink-2">{s.rules || "No instructions yet."}</div>}
        </div>
      ))}
      {editable && <button className="btn btn-ghost w-fit" onClick={() => { setList(DEFAULT_STYLES); save("styles", DEFAULT_STYLES, "Styles reset"); }}>Reset to the default styles</button>}
    </div>
  );
}

// ---------------- Playbooks ----------------
function Playbooks({ studio, save }: { studio: Studio; save: Save }) {
  const { can } = useWorkspace();
  const toast = useToast();
  const editable = can("editor");
  const [list, setList] = useState<Playbook[]>(studio.playbooks);
  const [edit, setEdit] = useState<string | null>(null);
  const [post, setPost] = useState("");
  const [res, setRes] = useState<{ type: string; why: string; angle: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (type: string, v: Partial<Playbook>) => setList(list.map((b) => (b.type === type ? { ...b, ...v } : b)));

  async function classify() {
    setBusy(true); setRes(null);
    try {
      const out = await askExtension<string>("ai", { kind: "studio", user: `POST:\n${post.slice(0, 6000)}\n\nClassify this LinkedIn post as exactly one of: ${list.map((b) => b.type).join(", ")}. Return only JSON: {"type": "...", "why": "one sentence", "angle": "the angle a comment should take, following that type's playbook, in one sentence"}` });
      const j = parseJSON<{ type: string; why: string; angle: string }>(out);
      if (!j?.type) throw new Error("No answer from the model. Try again.");
      setRes(j);
      setTimeout(() => document.getElementById(`pb-${j.type}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    } catch (e) { toast((e as Error).message); }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-4">
        <div className="mb-1 text-[13px] font-semibold">Try it on a real post</div>
        <Hint>Paste a LinkedIn post to see which kind of post Prax thinks it is and which playbook it would follow.</Hint>
        <textarea className="field mt-3 min-h-[110px] py-2 text-[13px]" value={post} onChange={(e) => setPost(e.target.value)} placeholder="Paste a LinkedIn post here" />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" disabled={post.trim().length < 40 || busy} onClick={classify}>{busy ? "Reading" : "Classify"}</button>
          {res && <span className="anim-rise text-[13px]"><span className="chip text-accent">{res.type}</span> <span className="text-ink-2">{res.why}</span> <span className="block pt-1 text-muted">Angle: {res.angle}</span></span>}
        </div>
      </div>
      {editable && JSON.stringify(list) !== JSON.stringify(studio.playbooks) && <button className="btn btn-primary w-fit" onClick={() => save("playbooks", list, "Playbooks saved")}>Save playbooks</button>}
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((b) => (
          <div key={b.type} id={`pb-${b.type}`} className={`card p-4 ${res?.type === b.type ? "ring-2 ring-accent" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div><div className="text-[14px] font-semibold">{b.type}</div><div className="text-[13px] text-ink-2">{b.aim}</div></div>
              {editable && <button className="btn btn-ghost h-7 px-2 text-[12px]" onClick={() => setEdit(edit === b.type ? null : b.type)}>{edit === b.type ? "Done" : "Edit"}</button>}
            </div>
            {edit === b.type ? (
              <div className="anim-rise mt-3 grid gap-2">
                <input className="field" value={b.aim} onChange={(e) => set(b.type, { aim: e.target.value })} aria-label="Aim" />
                <label className="flex flex-col gap-1"><span className="label text-good">What works, one per line</span><textarea rows={4} className="field h-auto py-1.5 text-[12px]" value={b.works.join("\n")} onChange={(e) => set(b.type, { works: lines(e.target.value) })} /></label>
                <label className="flex flex-col gap-1"><span className="label text-bad">What reads as filler, one per line</span><textarea rows={3} className="field h-auto py-1.5 text-[12px]" value={b.filler.join("\n")} onChange={(e) => set(b.type, { filler: lines(e.target.value) })} /></label>
                <label className="flex flex-col gap-1"><span className="label">Calibration examples, one per line</span><textarea rows={3} className="field h-auto py-1.5 text-[12px]" value={b.examples.join("\n")} onChange={(e) => set(b.type, { examples: lines(e.target.value) })} placeholder="A comment that got it right" /></label>
              </div>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div><div className="label mb-1 text-good">What works</div>{b.works.map((w) => <p key={w} className="mb-1 text-[12px] leading-relaxed text-ink-2">{w}</p>)}</div>
                <div><div className="label mb-1 text-bad">Reads as filler</div>{b.filler.map((w) => <p key={w} className="mb-1 text-[12px] leading-relaxed text-ink-2">{w}</p>)}</div>
                {b.examples.length > 0 && <details className="sm:col-span-2"><summary className="cursor-pointer text-[12px] text-muted">Calibration examples ({b.examples.length})</summary>{b.examples.map((x) => <p key={x} className="mt-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-[12px] text-ink-2">{x}</p>)}</details>}
              </div>
            )}
          </div>
        ))}
      </div>
      {editable && <button className="btn btn-ghost w-fit" onClick={() => { setList(DEFAULT_PLAYBOOKS); save("playbooks", DEFAULT_PLAYBOOKS, "Playbooks reset"); }}>Reset to the default playbooks</button>}
    </div>
  );
}

// ---------------- Tuning ----------------
function TuningTab({ studio, save }: { studio: Studio; save: Save }) {
  const { can } = useWorkspace();
  const ed = can("editor");
  const [t, setT] = useState<Tuning>(studio.tuning);
  const s = (v: Partial<Tuning>) => setT({ ...t, ...v });
  const slider = (label: string, value: number, min: number, max: number, step: number, left: string, right: string, k: keyof Tuning, fmt?: (n: number) => string) => (
    <div className="mb-4">
      <div className="flex justify-between text-[13px]"><span className="font-medium">{label}</span><span className="num">{fmt ? fmt(value) : value}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} disabled={!ed} onChange={(e) => s({ [k]: Number(e.target.value) } as Partial<Tuning>)} className="mt-2 w-full accent-[var(--accent)]" aria-label={label} />
      <div className="flex justify-between text-[11px] text-faint"><span>{left}</span><span>{right}</span></div>
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card flex flex-col gap-4 p-4">
          <div className="text-[13px] font-semibold">Output shape</div>
          <div><div className="label mb-1.5">Comment length</div><Seg disabled={!ed} value={t.length} onChange={(v) => s({ length: v })} options={(Object.keys(LENGTHS) as Tuning["length"][]).map((k) => ({ v: k, label: LENGTHS[k].label, sub: LENGTHS[k].sub }))} /></div>
          <div><div className="label mb-1.5">Tone</div><Seg disabled={!ed} value={t.tone} onChange={(v) => s({ tone: v })} options={[{ v: "formal", label: "Formal" }, { v: "balanced", label: "Balanced" }, { v: "warm", label: "Warm" }]} /></div>
          <div><div className="label mb-1.5">Emoji</div><Seg disabled={!ed} value={t.emoji} onChange={(v) => s({ emoji: v })} options={[{ v: "none", label: "None" }, { v: "minimal", label: "Minimal" }]} /></div>
          <div><div className="label mb-1.5">End with a question</div><Seg disabled={!ed} value={t.question} onChange={(v) => s({ question: v })} options={[{ v: "never", label: "Never" }, { v: "sometimes", label: "Sometimes" }, { v: "always", label: "Always" }]} /></div>
          <label className="flex flex-col gap-1.5"><span className="label">Language</span>
            <select className="field" disabled={!ed} value={t.language} onChange={(e) => s({ language: e.target.value })}>
              {[["auto", "Match the post"], ["English", "English"], ["Arabic", "Arabic"], ["Hindi", "Hindi"], ["French", "French"], ["German", "German"], ["Spanish", "Spanish"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <Hint>C-suite readers expect calm, specific comments: Medium, Balanced and no emoji are the defaults for this reason.</Hint>
        </div>
        <div className="card p-4">
          <div className="mb-3 text-[13px] font-semibold">Quality checks</div>
          {slider("Creativity", t.creativity, 0, 1, 0.05, "Direct", "Unexpected", "creativity", (n) => n.toFixed(2))}
          {slider("Minimum Human score", t.minHuman, 50, 100, 5, "Lenient", "Strict", "minHuman")}
          {slider("Drafts per click", t.drafts, 1, 5, 1, "1", "5", "drafts")}
          <Toggle disabled={!ed} on={t.humanize} onChange={(v) => s({ humanize: v })} label="Auto-humanize" sub="Rewrites drafts that score under the minimum, in one extra call" />
          <Toggle disabled={!ed} on={t.readComments} onChange={(v) => s({ readComments: v })} label="Read existing comments" sub="Avoids angles others already took. Reads only comments already on screen" />
          <Toggle disabled={!ed} on={t.repair} onChange={(v) => s({ repair: v })} label="Guardrail repair" sub="Fixes banned words, dashes and contractions before you see the draft" />
          <Toggle disabled={!ed} on={t.smartOrder} onChange={(v) => s({ smartOrder: v })} label="Smart style choice" sub="Write with Prax picks the style that fits the post type" />
          <label className="flex flex-col gap-1.5 pt-3"><span className="text-[13px] font-medium">Sign-off line</span><span className="text-[12px] text-muted">Added to connection notes when it fits in 300 characters. Never added to comments.</span>
            <input className="field" disabled={!ed} value={t.signature} onChange={(e) => s({ signature: e.target.value })} placeholder="Optional, for example: Shashi, Antier" />
          </label>
        </div>
      </div>
      {ed && <div className="flex gap-2"><button className="btn btn-primary" disabled={JSON.stringify(t) === JSON.stringify(studio.tuning)} onClick={() => save("tuning", t, "Tuning saved")}>Save tuning</button><button className="btn btn-ghost" onClick={() => { setT(DEFAULT_TUNING); save("tuning", DEFAULT_TUNING, "Tuning reset"); }}>Reset</button></div>}
    </div>
  );
}

// ---------------- Rewrite Lab ----------------
function RewriteLab({ studio }: { studio: Studio }) {
  const { ws } = useWorkspace();
  const toast = useToast();
  const [input, setInput] = useState("");
  const [post, setPost] = useState("");
  const [showPost, setShowPost] = useState(false);
  const [out, setOut] = useState("");
  const [impact, setImpact] = useState<{ score: number; why: string } | null>(null);
  const [busy, setBusy] = useState("");
  const range = LENGTHS[studio.tuning.length];
  const h = useMemo(() => humanScore(out || input, range), [out, input, range]);

  async function run(kind: "voice" | "strip" | "score") {
    setBusy(kind); setImpact(null);
    const ctx = post.trim() ? `THE POST IT REPLIES TO:\n${post.slice(0, 6000)}\n\n` : "";
    const ask = kind === "voice" ? `${ctx}DRAFT:\n${input}\n\nRewrite the draft in this profile's voice, following every rule. Keep the meaning and any facts; add nothing new.`
      : kind === "strip" ? `DRAFT:\n${input}\n\nRemove what reads as machine-written: dashes, contractions, banned words, rule-of-three lists, stock openers and closers, empty praise. Change as little else as possible.`
      : `${ctx}DRAFT:\n${input}\n\nDo not rewrite it.`;
    const tail = post.trim() ? ` Also score impact (1 to 10: how likely the post's author is to reply to it) with one sentence why.` : "";
    try {
      const raw = await askExtension<string>("ai", { kind: "studio", user: `${ask}${tail}\nReturn only JSON: {${kind === "score" ? "" : `"text": "...", `}"impact": 7, "why": "..."}` });
      const j = parseJSON<{ text?: string; impact?: number; why?: string }>(raw);
      if (!j) throw new Error("No answer from the model. Try again.");
      if (kind !== "score") setOut(j.text || "");
      if (post.trim() && j.impact) setImpact({ score: j.impact * 10, why: j.why || "" });
    } catch (e) { toast((e as Error).message); }
    setBusy("");
  }
  async function saveIt() {
    const { error } = await supabase().from("saved_drafts").insert({ workspace_id: ws.id, kind: "comment", text: out || input, style: "Rewrite Lab", human: h.score, impact: impact?.score ?? null, source: "rewrite" });
    if (error) toast(error.message); else { haptic(); toast("Saved to the library"); }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-4">
        <div className="mb-2 text-[13px] font-semibold">Input</div>
        <textarea className="field min-h-[220px] py-2 text-[13px] leading-relaxed" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste a draft comment, post or message" />
        <button className="mt-2 flex items-center gap-1 text-[12px] text-muted hover:text-ink" onClick={() => setShowPost(!showPost)}><ChevronDown size={13} className={showPost ? "rotate-180" : ""} /> Add the post it replies to, for the Impact score</button>
        {showPost && <textarea className="field anim-rise mt-2 min-h-[100px] py-2 text-[12px]" value={post} onChange={(e) => setPost(e.target.value)} placeholder="Paste the LinkedIn post" />}
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={!input.trim() || !!busy} onClick={() => run("voice")}>{busy === "voice" ? "Rewriting" : "Rewrite in Shashi's voice"}</button>
          <button className="btn" disabled={!input.trim() || !!busy} onClick={() => run("strip")}>{busy === "strip" ? "Cleaning" : "Strip AI tells"}</button>
          <button className="btn" disabled={!input.trim() || !!busy || !post.trim()} title={post.trim() ? "" : "Add the post first"} onClick={() => run("score")}>{busy === "score" ? "Scoring" : "Score only"}</button>
        </div>
        <div className="mt-3"><Hint>The Human score is checked here against the locked rules; the AI parts run through the extension with your own key.</Hint></div>
      </div>
      <div className="card p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px] font-semibold">Result
          {(out || input) && <span className={`chip ${h.score >= studio.tuning.minHuman ? "text-good" : "text-bad"}`}>Human {h.score}</span>}
          {impact && <span className={`chip ${impact.score >= 70 ? "text-good" : "text-bad"}`}>Impact {impact.score}</span>}
        </div>
        <textarea className="field min-h-[220px] py-2 text-[13px] leading-relaxed" value={out} onChange={(e) => setOut(e.target.value)} placeholder="The result appears here" />
        {h.flags.length > 0 && <p className="mt-2 text-[12px] text-warn">{h.flags.join(" · ")}</p>}
        {impact?.why && <p className="mt-1 text-[12px] text-muted">{impact.why}</p>}
        <div className="mt-3 flex gap-2">
          <button className="btn" disabled={!out} onClick={async () => { await navigator.clipboard.writeText(out); haptic(); toast("Copied"); }}><Copy size={13} /> Copy</button>
          <button className="btn" disabled={!(out || input)} onClick={saveIt}><Bookmark size={13} /> Save</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Library ----------------
type Saved = { id: string; kind: string; text: string; author: string; post_url: string; style: string; post_type: string; human: number | null; impact: number | null; source: string; created_at: string };
type Hist = { at: string; kind: string; text: string; author: string; url: string; style: string; post_type: string; human: number; impact: number | null };

function Library() {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const saved = useLive<Saved>("saved_drafts", ws.id, { order: "created_at", asc: false });
  const [view, setView] = useState<"saved" | "history">("saved");
  const [hist, setHist] = useState<Hist[] | null>(null);
  const [histErr, setHistErr] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => { if (view === "history" && !hist) askExtension<Hist[]>("history", {}, 3000).then(setHist, (e) => setHistErr(e.message)); }, [view, hist]);
  const match = (x: { text: string; author?: string; style?: string }) => !q || `${x.text} ${x.author} ${x.style}`.toLowerCase().includes(q.toLowerCase());

  function exportJSON() {
    const blob = new Blob([JSON.stringify({ profile: ws.name, exported: new Date().toISOString(), saved: saved.rows, history: hist ?? [] }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `prax-library-${ws.slug}.json`; a.click(); URL.revokeObjectURL(a.href);
  }
  async function del(s: Saved) {
    const { error } = await supabase().from("saved_drafts").delete().eq("id", s.id);
    if (error) { toast(error.message); return; }
    haptic(); toast("Removed", async () => { const { id: _id, ...rest } = s; void _id; await supabase().from("saved_drafts").insert({ ...rest, workspace_id: ws.id }); });
  }
  const Card = ({ text, meta, actions }: { text: string; meta: React.ReactNode; actions?: React.ReactNode }) => (
    <div className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-0">
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">{text}</p>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">{meta}<span className="ml-auto flex gap-1">
        <button className="btn btn-ghost h-6 px-2 text-[12px]" onClick={async () => { await navigator.clipboard.writeText(text); haptic(); toast("Copied"); }}><Copy size={12} /> Copy</button>{actions}</span></div>
    </div>
  );
  const chips = (x: { style?: string; post_type?: string; human?: number | null; impact?: number | null; author?: string }) => (
    <>{x.author && <span className="font-medium text-ink-2">{x.author}</span>}{x.style && <span className="chip">{x.style}</span>}{x.post_type && <span className="chip">{x.post_type}</span>}{x.human != null && <span className="num">Human {x.human}</span>}{x.impact != null && <span className="num">Impact {x.impact}</span>}</>
  );
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <div className="flex rounded-lg border border-line-strong p-0.5">
          {(["saved", "history"] as const).map((v) => <button key={v} className={`btn h-7 border-0 ${view === v ? "bg-surface-2" : "bg-transparent"}`} onClick={() => setView(v)}>{v === "saved" ? `Saved ${saved.rows.length}` : "History"}</button>)}
        </div>
        <input className="field h-8 w-full sm:ml-auto sm:w-64" placeholder="Search comments, authors, styles" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={exportJSON}><Download size={13} /> Export JSON</button>
        {view === "history" && hist && hist.length > 0 && <button className="btn btn-ghost hover:text-bad" onClick={async () => { await askExtension("clearHistory", {}, 3000); setHist([]); haptic(); toast("History cleared in this browser"); }}>Clear history</button>}
      </div>
      {view === "saved" ? (
        saved.loading ? <div className="h-32 animate-pulse bg-surface-2" /> : saved.rows.filter(match).length === 0
          ? <p className="p-8 text-center text-[13px] text-muted">Nothing saved yet. Press Save on any Prax draft, on LinkedIn or in Rewrite Lab.</p>
          : saved.rows.filter(match).map((s) => <Card key={s.id} text={s.text} meta={<>{chips(s)}<span>{fmtDay(ymd(new Date(s.created_at)), { day: "numeric", month: "short" })}</span>{s.post_url && <a href={s.post_url} target="_blank" rel="noopener" className="underline">post</a>}</>} actions={can("editor") && <button className="btn btn-ghost h-6 px-2 text-[12px] hover:text-bad" onClick={() => del(s)}><Trash2 size={12} /></button>} />)
      ) : histErr ? <p className="p-8 text-center text-[13px] text-muted">{histErr}</p>
        : !hist ? <div className="h-32 animate-pulse bg-surface-2" />
        : hist.filter(match).length === 0 ? <p className="p-8 text-center text-[13px] text-muted">No drafts in this browser yet. History keeps the last 200 drafts here, never on the Prax server.</p>
        : hist.filter(match).map((h, i) => <Card key={h.at + i} text={h.text} meta={<>{chips(h)}<span>{fmtDay(ymd(new Date(h.at)), { day: "numeric", month: "short" })}</span></>} />)}
    </div>
  );
}

// ---------------- Safety ----------------
function SafetyTab({ studio, save }: { studio: Studio; save: Save }) {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const ed = can("editor");
  const [s, setS] = useState<Safety>(studio.safety);
  const [v, setV] = useState("");
  const [reset, setReset] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const addVip = () => { const n = v.trim(); if (n && !s.vips.includes(n)) { const next = { ...s, vips: [...s.vips, n] }; setS(next); save("safety", next, `${n} is a VIP`); } setV(""); };

  function exportAll() {
    const blob = new Blob([JSON.stringify({ profile: ws.name, exported: new Date().toISOString(), studio }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `prax-studio-${ws.slug}.json`; a.click(); URL.revokeObjectURL(a.href);
  }
  async function importFile(f: File) {
    try {
      const j = JSON.parse(await f.text()); const st = mergeStudio(j.studio ?? j);
      const { error } = await supabase().from("studio_settings").upsert({ workspace_id: ws.id, ...st, updated_at: new Date().toISOString() });
      if (error) throw error;
      haptic(); toast("Settings imported. Reloading"); setTimeout(() => location.reload(), 800);
    } catch (e) { toast("Could not import: " + (e as Error).message); }
  }
  async function resetAll() {
    const { error } = await supabase().from("studio_settings").delete().eq("workspace_id", ws.id);
    if (error) { toast(error.message); return; }
    haptic(); toast("Studio reset to the defaults. Reloading"); setTimeout(() => location.reload(), 800);
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <div className="mb-3 text-[13px] font-semibold">Daily draft limit</div>
          <div className="flex justify-between text-[13px]"><span>Drafts per day, per browser</span><span className="num font-semibold">{s.dailyCap || "No limit"}</span></div>
          <input type="range" min={0} max={200} step={5} value={s.dailyCap} disabled={!ed} onChange={(e) => setS({ ...s, dailyCap: Number(e.target.value) })} onMouseUp={() => save("safety", s, "Limit saved")} onTouchEnd={() => save("safety", s, "Limit saved")} onKeyUp={() => save("safety", s, "Limit saved")} className="mt-2 w-full accent-[var(--accent)]" aria-label="Daily draft limit" />
          <div className="flex justify-between text-[11px] text-faint"><span>No limit</span><span>200 a day</span></div>
          <div className="mt-3 rounded-lg border-l-2 border-accent bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-ink-2"><b>Why this matters:</b> LinkedIn restricts accounts that comment at inhuman rates. 20 to 40 a day keeps activity natural. Prax never posts for you either way.</div>
        </div>
        <div className="card p-4">
          <div className="mb-1 text-[13px] font-semibold">VIP authors</div>
          <Hint>Posts from these people get a highlighted Prax bar so they are never missed.</Hint>
          {ed && <input className="field mt-3" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addVip(); }} placeholder="Add a name and press Enter" />}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {s.vips.map((n) => <span key={n} className="chip anim-pop gap-1"><Star size={11} className="text-accent" />{n}{ed && <button aria-label={`Remove ${n}`} className="text-faint hover:text-bad" onClick={() => { const next = { ...s, vips: s.vips.filter((x) => x !== n) }; setS(next); save("safety", next, "Removed"); }}><X size={11} /></button>}</span>)}
            {!s.vips.length && <span className="text-[12px] text-muted">No names added.</span>}
          </div>
          <Toggle disabled={!ed} on={s.vipProspects} onChange={(x) => { const next = { ...s, vipProspects: x }; setS(next); save("safety", next, x ? "Pipeline prospects are VIPs" : "Only the names above are VIPs"); }} label="Everyone in the pipeline is a VIP" sub="Open prospects, matched by name" />
        </div>
      </div>
      <div className="card p-4">
        <div className="mb-1 text-[13px] font-semibold">Your data</div>
        <Hint>Studio settings and saved drafts live in Prax for this profile. Unsaved draft history stays in each browser. AI calls go from the extension straight to your AI provider with your own key.</Hint>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn" onClick={exportAll}><Download size={13} /> Export settings</button>
          {ed && <><button className="btn" onClick={() => file.current?.click()}><Upload size={13} /> Import settings</button><input ref={file} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} /></>}
          {can("owner") && (reset ? <span className="flex items-center gap-2 text-[13px] text-bad">Reset voice, styles, playbooks, tuning and safety? <button className="btn" onClick={resetAll}>Reset</button><button className="btn btn-ghost" onClick={() => setReset(false)}>Keep</button></span>
            : <button className="btn btn-ghost hover:text-bad" onClick={() => setReset(true)}>Reset to defaults</button>)}
        </div>
        <p className="mt-2 text-[11px] text-faint">Defaults: {DEFAULT_SAFETY.dailyCap} drafts a day, pipeline prospects as VIPs.</p>
      </div>
    </div>
  );
}
