"use client";
import { useMemo, useRef, useState } from "react";
import { Upload, ClipboardPaste, FileText, X, ChevronDown, Check, Circle, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useWorkspace, fmtDay, ymd } from "@/lib/workspace";
import { PageHeader } from "@/components/page-header";
import { useToast, haptic } from "@/components/toaster";
import { parseProfile, auditProfile, topicReport, prosCons, roadmap, MANUAL, TOP_TIER, type Parsed, type Audit } from "@/lib/profile";

type Doc = { id: string; subject: "self" | "prospect"; prospect_id: string | null; source: string; file_name: string; raw_text: string; parsed: Parsed; audit: Audit & { manual?: Record<string, boolean>; roadmap?: Record<string, boolean> }; score: number; created_at: string };
type P = { id: string; name: string; company: string };

export default function ProfileStudio() {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const editable = can("editor");
  const { rows: docs, loading } = useLive<Doc>("profile_docs", ws.id, { order: "created_at", asc: false });
  const { rows: prospects } = useLive<P>("prospects", ws.id, { order: "name" });
  const [topics, setTopics] = useState<string[]>(ws.topics ?? []);
  const [tab, setTab] = useState<"self" | "prospect">("self");
  const [selId, setSelId] = useState<string | null>(null);
  // A new review starts from a clean slate: no report shown, no ticks carried over. Old reviews stay in History.
  const [fresh, setFresh] = useState(false);

  const mine = docs.filter((d) => d.subject === tab);
  const sel = fresh ? undefined : mine.find((d) => d.id === selId) ?? mine[0];

  async function saveTopics(next: string[]) {
    setTopics(next);
    const { error } = await supabase().from("workspaces").update({ topics: next }).eq("id", ws.id);
    if (error) toast(error.message); else haptic();
  }

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader title="Profile Studio" sub="Upload a LinkedIn profile, see how it scores for the topics you want to rank for, and fix what fails.">
        {editable && mine.length > 0 && !fresh && <button className="btn" onClick={() => { setFresh(true); setSelId(null); haptic(); }}><RotateCcw size={14} /> Start a new review</button>}
      </PageHeader>
      <TopicEditor topics={topics} editable={can("owner")} onChange={saveTopics} />

      <div className="mb-4 mt-6 flex rounded-lg border border-line-strong bg-surface p-0.5 w-fit">
        {(["self", "prospect"] as const).map((t) => (
          <button key={t} className={`btn h-7 border-0 ${tab === t ? "bg-surface-2" : "bg-transparent"}`} onClick={() => { setTab(t); setSelId(null); setFresh(false); }}>
            {t === "self" ? `${ws.name.split(" ")[0]}'s profile` : "Prospects and personas"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="flex flex-col gap-4">
          {editable && <Intake key={`${tab}${fresh}`} subject={tab} topics={topics} prospects={prospects} prev={fresh ? undefined : mine[0]} onSaved={(id) => { setSelId(id); setFresh(false); }} />}
          <History docs={mine} loading={loading} sel={sel?.id} onPick={(id) => { setSelId(id); setFresh(false); }} prospects={prospects} />
        </div>
        {sel ? <Report doc={sel} topics={topics} editable={editable} prospect={prospects.find((p) => p.id === sel.prospect_id)} />
          : fresh ? (
            <div className="card grid min-h-[320px] place-items-center p-10 text-center">
              <div className="max-w-[360px]">
                <p className="text-[13px] font-medium">Ready for a new review</p>
                <p className="mt-1 text-[13px] text-muted">Drop the new PDF or paste the profile text on the left. It is scored from scratch; earlier reviews stay in History so you can compare.</p>
                <button className="btn btn-ghost mt-3" onClick={() => setFresh(false)}>Back to the last review</button>
              </div>
            </div>
          ) : <div className="card grid min-h-[320px] place-items-center p-10 text-center text-[13px] text-muted">{loading ? "Loading" : tab === "self" ? "No profile uploaded yet. Save the profile as a PDF from LinkedIn and drop it on the left." : "No prospect profiles yet. Paste a prospect's profile text to build a persona."}</div>}
      </div>
    </div>
  );
}

function TopicEditor({ topics, editable, onChange }: { topics: string[]; editable: boolean; onChange: (t: string[]) => void }) {
  const [v, setV] = useState("");
  const add = () => { const t = v.trim(); if (t && !topics.includes(t)) onChange([...topics, t]); setV(""); };
  return (
    <div className="card p-4">
      <div className="label mb-2">Target topics: what this profile should be known for</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {topics.map((t) => (
          <span key={t} className="chip anim-pop gap-1">{t}{editable && <button aria-label={`Remove ${t}`} className="text-faint hover:text-bad" onClick={() => onChange(topics.filter((x) => x !== t))}><X size={11} /></button>}</span>
        ))}
        {editable && <input className="field h-7 w-44 text-[12px]" placeholder="Add topic, press Enter" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />}
        {!topics.length && !editable && <span className="text-[13px] text-muted">The owner has not set topics yet.</span>}
      </div>
    </div>
  );
}

function Intake({ subject, topics, prospects, prev, onSaved }: { subject: "self" | "prospect"; topics: string[]; prospects: P[]; prev?: Doc; onSaved: (id: string) => void }) {
  const { ws } = useWorkspace();
  const toast = useToast();
  const [mode, setMode] = useState<"pdf" | "paste">(subject === "self" ? "pdf" : "paste");
  const [text, setText] = useState("");
  const [pid, setPid] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function save(raw: string, source: "pdf" | "paste", file_name = "") {
    const parsed = parseProfile(raw);
    const audit = auditProfile(parsed, topics);
    // Your own profile keeps its ticked hand checks and roadmap steps across re-uploads.
    const carry = subject === "self" && prev ? { manual: prev.audit?.manual ?? {}, roadmap: prev.audit?.roadmap ?? {} } : {};
    const { data, error } = await supabase().from("profile_docs").insert({ workspace_id: ws.id, subject, prospect_id: pid || null, source, file_name, raw_text: raw, parsed, audit: { ...audit, ...carry }, score: audit.score }).select("id").single();
    if (error) { toast(error.message); return; }
    haptic(12);
    toast(`${parsed.name || "Profile"} scored ${audit.score}/100`);
    setText("");
    onSaved(data.id);
  }

  async function upload(f: File) {
    if (f.type !== "application/pdf") { toast("Choose a PDF file"); return; }
    setBusy(true);
    const fd = new FormData(); fd.append("file", f);
    const r = await fetch("/api/parse-pdf", { method: "POST", body: fd });
    const j = await r.json();
    if (!r.ok) toast(j.error ?? "Upload failed"); else await save(j.text, "pdf", f.name);
    setBusy(false);
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex gap-1">
        <button className={`btn h-7 ${mode === "pdf" ? "bg-surface-2" : "btn-ghost"}`} onClick={() => setMode("pdf")}><Upload size={13} /> PDF</button>
        <button className={`btn h-7 ${mode === "paste" ? "bg-surface-2" : "btn-ghost"}`} onClick={() => setMode("paste")}><ClipboardPaste size={13} /> Paste text</button>
      </div>
      {subject === "prospect" && (
        <select className="field mb-3" value={pid} onChange={(e) => setPid(e.target.value)} aria-label="Link to prospect">
          <option value="">Not linked to a prospect</option>
          {prospects.map((p) => <option key={p.id} value={p.id}>{p.name}{p.company ? ` · ${p.company}` : ""}</option>)}
        </select>
      )}
      {mode === "pdf" ? (
        <>
          <button type="button" disabled={busy} onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
            className={`grid w-full place-items-center gap-1.5 rounded-xl border border-dashed px-4 py-8 text-center transition-colors ${drag ? "border-accent bg-accent-soft" : "border-line-strong hover:bg-surface-2"}`}>
            <FileText size={20} className="text-muted" />
            <span className="text-[13px] font-medium">{busy ? "Reading PDF" : "Drop the profile PDF, or click to choose"}</span>
            <span className="text-[12px] text-muted">Read once to score it. The text is saved, the file is not.</span>
          </button>
          <input ref={input} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
          <p className="mt-3 text-[12px] leading-relaxed text-muted">On LinkedIn: open the profile, click <b>Resources</b> (or <b>More</b>), then <b>Save to PDF</b>. LinkedIn allows this for your own profile only; use Paste for other people.</p>
        </>
      ) : (
        <>
          <textarea className="field min-h-[180px] py-2 text-[12px]" placeholder="Open the profile, select all the page text (Cmd+A), copy, and paste here." value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn btn-primary mt-3 w-full" disabled={text.trim().length < 80} onClick={() => save(text, "paste")}>Score this profile</button>
        </>
      )}
    </div>
  );
}

function History({ docs, loading, sel, onPick, prospects }: { docs: Doc[]; loading: boolean; sel?: string; onPick: (id: string) => void; prospects: P[] }) {
  if (loading) return <div className="card h-40 animate-pulse bg-surface-2" />;
  if (!docs.length) return null;
  return (
    <div className="card p-2">
      <div className="label px-2 pb-1.5 pt-1">History</div>
      {docs.map((d, i) => {
        const prev = docs[i + 1]?.score;
        const delta = prev == null ? null : d.score - prev;
        const who = prospects.find((p) => p.id === d.prospect_id)?.name || d.parsed?.name || "Profile";
        return (
          <button key={d.id} onClick={() => onPick(d.id)} className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${sel === d.id ? "bg-surface-2" : "hover:bg-surface-2/60"}`}>
            <ScoreBadge s={d.score} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{who}</div>
              <div className="text-[11px] text-muted">{fmtDay(ymd(new Date(d.created_at)), { day: "numeric", month: "short", year: "numeric" })} · {d.source === "pdf" ? "PDF" : "Pasted"}</div>
            </div>
            {delta != null && delta !== 0 && <span className={`num text-[12px] ${delta > 0 ? "text-good" : "text-bad"}`}>{delta > 0 ? "+" : ""}{delta}</span>}
          </button>
        );
      })}
    </div>
  );
}

const tone = (s: number) => (s >= 75 ? "var(--good)" : s >= 50 ? "var(--warn)" : "var(--bad)");
function ScoreBadge({ s }: { s: number }) {
  return <span className="num grid h-8 w-8 shrink-0 place-items-center rounded-full text-[12px] font-semibold" style={{ color: tone(s), background: `color-mix(in srgb, ${tone(s)} 12%, transparent)` }}>{s}</span>;
}

function Report({ doc, topics, editable, prospect }: { doc: Doc; topics: string[]; editable: boolean; prospect?: P }) {
  const toast = useToast();
  // Re-score against the current topics so edits to the topic list show straight away.
  const audit = useMemo(() => auditProfile(doc.parsed, topics), [doc.parsed, topics]);
  const [manual, setManual] = useState<Record<string, boolean>>(doc.audit?.manual ?? {});
  const [done, setDone] = useState<Record<string, boolean>>(doc.audit?.roadmap ?? {});
  const rows = useMemo(() => topicReport(doc.parsed, topics), [doc.parsed, topics]);
  const pc = useMemo(() => prosCons(doc.parsed, audit, rows), [doc.parsed, audit, rows]);
  const steps = useMemo(() => roadmap(audit, rows, manual), [audit, rows, manual]);
  const top = audit.score >= TOP_TIER && rows.every((r) => r.strength === "strong");
  const [open, setOpen] = useState(false);
  const fails = audit.checks.filter((c) => !c.pass).sort((a, b) => b.max - a.max);
  const passes = audit.checks.filter((c) => c.pass);
  const p = doc.parsed;
  const r = 34, C = 2 * Math.PI * r;

  async function persist(patch: Record<string, unknown>) {
    const { error } = await supabase().from("profile_docs").update({ audit: { ...doc.audit, manual, roadmap: done, ...patch } }).eq("id", doc.id);
    if (error) toast(error.message);
  }
  function tick(id: string) { const next = { ...manual, [id]: !manual[id] }; setManual(next); haptic(); persist({ manual: next }); }
  function step(id: string) { const next = { ...done, [id]: !done[id] }; setDone(next); haptic(); if (next[id]) toast("Step done"); persist({ roadmap: next }); }

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-wrap items-center gap-6 p-5">
        <svg width="84" height="84" viewBox="0 0 84 84" className="shrink-0" role="img" aria-label={`Score ${audit.score} of 100`}>
          <circle cx="42" cy="42" r={r} fill="none" stroke="var(--line)" strokeWidth="7" />
          <circle cx="42" cy="42" r={r} fill="none" stroke={tone(audit.score)} strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - audit.score / 100)} transform="rotate(-90 42 42)" style={{ transition: "stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1)" }} />
          <text x="42" y="47" textAnchor="middle" className="num" fontSize="20" fontWeight="600" fill="var(--ink)">{audit.score}</text>
        </svg>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold">{p.name || "Unnamed profile"}{prospect && <span className="ml-2 chip">{prospect.company || prospect.name}</span>}</div>
          <div className="mt-0.5 text-[13px] text-ink-2">{p.headline}</div>
          <div className="mt-0.5 text-[12px] text-muted">{p.location}{doc.file_name ? ` · ${doc.file_name}` : ""}</div>
        </div>
        <div className="grid w-full grid-cols-3 gap-x-5 gap-y-2.5 sm:w-auto sm:grid-cols-3">
          {audit.areas.map((a) => (
            <div key={a.area} className="w-[110px]">
              <div className="flex justify-between text-[11px]"><span className="text-muted">{a.area}</span><span className="num">{a.points}/{a.max}</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${(a.points / a.max) * 100}%`, background: tone((a.points / a.max) * 100), transition: "width .5s" }} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] font-semibold">Verdict</span>
          <span className={`chip ${top ? "text-good" : ""}`}>{top ? "Top tier" : `Top tier needs ${TOP_TIER}+ and every topic strong`}</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div><div className="label mb-1.5 text-good">Pros</div>{pc.pros.length ? pc.pros.map((t) => <p key={t} className="mb-1.5 text-[13px] leading-relaxed text-ink-2">{t}</p>) : <p className="text-[13px] text-muted">Nothing yet.</p>}</div>
          <div><div className="label mb-1.5 text-bad">Cons</div>{pc.cons.length ? pc.cons.map((t) => <p key={t} className="mb-1.5 text-[13px] leading-relaxed text-ink-2">{t}</p>) : <p className="text-[13px] text-muted">None found.</p>}</div>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="card overflow-x-auto">
          <div className="border-b border-line px-4 py-3 text-[13px] font-semibold">Keyword map <span className="ml-1 text-[12px] font-normal text-muted">where each target topic appears</span></div>
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-line text-left">{["Topic", "Headline", "About", "Current role", "Skills", "Earlier roles", "Strength"].map((h) => <th key={h} className="label px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.topic} className="border-b border-line last:border-0">
                <td className="px-3 py-2 font-medium">{r.topic}</td>
                {[r.headline, r.about, r.role, r.skills, r.other].map((v, i) => <td key={i} className="px-3 py-2">{v ? <Check size={13} className="text-good" /> : <span className="text-faint">·</span>}</td>)}
                <td className="px-3 py-2"><span className="chip" style={{ color: r.strength === "strong" ? "var(--good)" : r.strength === "thin" ? "var(--warn)" : "var(--bad)" }}>{r.strength}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <span className="text-[13px] font-semibold">3-month roadmap to top tier</span>
          <span className="num text-[12px] text-muted">{steps.filter((x) => done[x.id]).length}/{steps.length} done</span>
        </div>
        {([1, 2, 3] as const).map((m) => (
          <div key={m} className="border-b border-line px-4 py-3 last:border-0">
            <div className="label mb-2">Month {m} · {m === 1 ? "Fix the profile" : m === 2 ? "Build topic authority" : "Convert"}</div>
            {steps.filter((x) => x.month === m).map((x) => (
              <button key={x.id} disabled={!editable} onClick={() => step(x.id)} className="flex w-full gap-2.5 rounded-md py-1.5 text-left active:scale-[.995]">
                {done[x.id] ? <Check size={14} className="anim-pop mt-0.5 shrink-0 text-good" /> : <Circle size={14} className="mt-0.5 shrink-0 text-faint" />}
                <span className="min-w-0"><span className={`text-[13px] font-medium ${done[x.id] ? "text-muted line-through" : ""}`}>{x.text}</span><span className="block text-[12px] text-muted">{x.why}</span></span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="border-b border-line px-4 py-3 text-[13px] font-semibold">Fixes <span className="num font-normal text-muted">{fails.length}</span><span className="ml-2 text-[12px] font-normal text-muted">worth {fails.reduce((s, c) => s + c.max, 0)} points, largest first</span></div>
        {fails.length === 0 ? <div className="p-6 text-center text-[13px] text-muted">Every readable check passes.</div> : fails.map((c) => (
          <div key={c.id} className="flex gap-3 border-b border-line px-4 py-3 last:border-0">
            <span className="num mt-0.5 w-9 shrink-0 text-[12px] font-semibold text-bad">+{c.max}</span>
            <div className="min-w-0">
              <div className="text-[13px] font-medium">{c.label} <span className="ml-1 text-[11px] font-normal text-faint">{c.area}</span></div>
              <div className="mt-0.5 text-[13px] text-ink-2">{c.fix}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <div className="label mb-2">Passing</div>
          {passes.map((c) => <div key={c.id} className="flex items-center gap-2 py-1 text-[13px] text-ink-2"><Check size={13} className="text-good" />{c.label}</div>)}
        </div>
        <div className="card p-4">
          <div className="label mb-2">Check by hand (not in the PDF)</div>
          {MANUAL.map((m) => (
            <button key={m.id} disabled={!editable} onClick={() => tick(m.id)} className="flex w-full items-center gap-2 rounded-md py-1 text-left text-[13px] text-ink-2 active:scale-[.99]">
              {manual[m.id] ? <Check size={13} className="anim-pop text-good" /> : <Circle size={13} className="text-faint" />}<span className={manual[m.id] ? "text-muted line-through" : ""}>{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <button className="flex w-full items-center justify-between px-4 py-3 text-[13px] font-semibold" onClick={() => setOpen(!open)}>
          What Prax read from the profile <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="anim-rise grid gap-4 border-t border-line p-4 text-[13px]">
            <Row k="About" v={p.about || "Not found"} />
            <Row k="Skills" v={p.skills.join(", ") || "Not found"} />
            <Row k="Experience" v={p.experience.length ? p.experience.map((r) => `${r.title}${r.company ? `, ${r.company}` : ""} (${r.dates})`).join("\n") : "Not found"} />
            <Row k="Education" v={p.education.join("\n") || "Not found"} />
            <Row k="Contact" v={[p.url, p.email, p.website].filter(Boolean).join("\n") || "Not found"} />
            <p className="text-[12px] text-muted">If a section reads wrong, paste the profile text instead; the PDF layout sometimes splits columns.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div><div className="label mb-1">{k}</div><div className="whitespace-pre-line text-ink-2">{v}</div></div>;
}

