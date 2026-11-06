"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, FileArchive, ExternalLink, Check, X, ChevronDown, Trash2, UserPlus, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useLive } from "@/lib/live";
import { useWorkspace, useSegments, fmtDay, today, ymd, SEGMENTS } from "@/lib/workspace";
import { firstNameOf, pillarsOf, possessive } from "@/lib/persona";
import { Section, KpiTiles, type TourStep } from "@/components/shell";
import { useToast, haptic } from "@/components/toaster";
import { decodeText } from "@/lib/text";
import {
  readExport, segmentFor, seniority, topicsFor, warmPaths, indexPeople, normCompany, normUrl,
  DEFAULT_SEGMENTS, defaultTopics, SENIORITY, type ParsedExport, type Person, type ProspectLite, type CommentLite, type SegRule, type TopicRule, type Warm,
} from "@/lib/network";

type Post = { kind: "post" | "comment"; key: string; day: string | null; url: string; text: string };
type Import = { id: string; file_name: string; export_date: string | null; counts: Record<string, number>; created_at: string };
type Settings = { segments: SegRule[]; topics: TopicRule[] };
const TABS = ["Home", "Segments", "Warm paths", "Topics", "Import"] as const;
type Tab = (typeof TABS)[number];
const OPEN_STAGES = ["Target", "Warming", "Requested"];
const splitWords = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

/** Loads every imported row; Supabase returns at most 1,000 per request, so it pages. */
async function loadAll<T>(table: string, wsId: string, cols = "*"): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase().from(table).select(cols).eq("workspace_id", wsId).order("key").range(from, from + 999);
    if (error || !data?.length) break;
    out.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return out;
}

const netTour = (n: string): TourStep[] => [
  { target: "known", title: `Who ${n} already knows at each target account`, body: "Network exists for one reason: a warm way in before anyone sends a cold request. Every open prospect is ranked by the warmest route: already connected, talked before, then a colleague at their company.", tab: "Home" },
  { target: "kpis", title: "How warm the pipeline is", body: `How many prospects are already connections, have talked before, or work where someone ${n} knows works.`, tab: "Home" },
  { target: "row", title: "One action per person", body: `Message them when ${n} is connected, ask a colleague for an intro, or comment on their posts first. Prax opens LinkedIn; ${n} writes and sends.`, tab: "Home" },
  { target: "freshness", title: "Keep the export fresh", body: "Connections change. Import the LinkedIn export again every month or two; Prax reminds you after 60 days.", tab: "Home" },
  { target: "header", title: "The detail behind it", body: `Segments sorts every connection into A to E, Warm paths shows each route in full, and Topics shows what ${n} has posted about.`, tab: "Home" },
  { target: "import", title: "Import", body: "The LinkedIn export zip is read in this browser. Message text and emails are never saved.", tab: "Import" },
];

export default function NetworkPage() {
  const { ws } = useWorkspace();
  const [tab, setTab] = useState<Tab>("Home");
  const [people, setPeople] = useState<Person[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [imports, setImports] = useState<Import[]>([]);
  const first = firstNameOf(ws);
  // Topic rules start as the profile's pillars until the team saves its own (empty-words rules, see src/lib/network.ts).
  const startTopics = useMemo(() => defaultTopics(pillarsOf(ws)), [ws]);
  const [settings, setSettings] = useState<Settings>({ segments: DEFAULT_SEGMENTS, topics: startTopics });
  const [loading, setLoading] = useState(true);
  const prospects = useLive<ProspectLite>("prospects", ws.id, { order: "name" });
  const comments = useLive<CommentLite>("comment_log", ws.id);

  const reload = useCallback(async () => {
    const [pp, po, im, st] = await Promise.all([
      loadAll<Person>("network_people", ws.id),
      loadAll<Post>("network_posts", ws.id),
      supabase().from("network_imports").select("*").eq("workspace_id", ws.id).order("created_at", { ascending: false }),
      supabase().from("network_settings").select("segments,topics").eq("workspace_id", ws.id).maybeSingle(),
    ]);
    setPeople(pp); setPosts(po); setImports((im.data as Import[]) ?? []);
    const s = st.data as Settings | null;
    setSettings({ segments: s?.segments?.length ? s.segments : DEFAULT_SEGMENTS, topics: s?.topics?.length ? s.topics : startTopics });
    setLoading(false);
  }, [ws.id, startTopics]);
  useEffect(() => { reload(); }, [reload]);

  // Prospect companies act as company rules for their segment.
  const prospectCompanies = useMemo(() => new Map(prospects.rows.filter((p) => p.company && p.segment).map((p) => [normCompany(p.company), p.segment])), [prospects.rows]);
  const segOf = useCallback((x: Person) => x.segment_manual || segmentFor(x.company, x.position, settings.segments, prospectCompanies), [settings.segments, prospectCompanies]);
  const idx = useMemo(() => indexPeople(people), [people]);

  const conns = people.filter((p) => p.is_connection).length;
  return (
    <Section id="network" title="Network" status={`Who ${first} already knows at each target account, so every approach starts warm.`}
      entryStatus={conns ? `${conns.toLocaleString()} connections imported. The warmest routes to your prospects are on Home.` : `Import ${possessive(first)} LinkedIn connections to find warm routes to every prospect.`}
      tabs={TABS.map((t) => ({ id: t, label: t }))} tab={tab} onTab={(t) => setTab(t as Tab)} steps={netTour(first)}
      actions={<button className="btn btn-primary h-10 px-4" onClick={() => setTab("Import")}><Upload size={14} /> Import connections</button>}>
      {loading ? <div className="card h-64 animate-pulse bg-surface-2" />
        : tab === "Home" ? <NetworkHome people={people} idx={idx} prospects={prospects.rows} comments={comments.rows} imports={imports} onImport={() => setTab("Import")} />
        : tab === "Import" ? <div data-tour="import" className="rounded-2xl"><UploadTab imports={imports} people={people} prospects={prospects.rows} onDone={reload} /></div>
        : !people.length && tab !== "Topics" ? <Empty onUpload={() => setTab("Import")} />
        : tab === "Segments" ? <SegmentsTab people={people} segOf={segOf} settings={settings} setSettings={setSettings} prospects={prospects.rows} onChange={setPeople} />
        : tab === "Warm paths" ? <WarmTab people={people} idx={idx} prospects={prospects.rows} comments={comments.rows} segOf={segOf} onChange={setPeople} />
        : <TopicsTab posts={posts} settings={settings} setSettings={setSettings} onUpload={() => setTab("Import")} />}
    </Section>
  );
}

type Camp = { id: string; name: string; status: string };

/** Home: one row per open prospect, ranked by the warmest route in, with one clear next step. */
function NetworkHome({ people, idx, prospects, comments, imports, onImport }: { people: Person[]; idx: ReturnType<typeof indexPeople>; prospects: ProspectLite[]; comments: CommentLite[]; imports: Import[]; onImport: () => void }) {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const [camps, setCamps] = useState<Camp[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => {
    supabase().from("campaigns").select("id,name,status").eq("workspace_id", ws.id).eq("template", false).neq("status", "done")
      .then(({ data, error }: { data: Camp[] | null; error: unknown }) => { if (!error && data) setCamps(data); });
  }, [ws.id]);
  const rows = useMemo(() => prospects.filter((p) => !["Won", "Parked"].includes(p.stage)).map((p) => ({ p, w: warmPaths(p, people, idx, comments) }))
    .sort((a, b) => (a.w.level || 9) - (b.w.level || 9)
      || (a.w.colleagues[0] ? seniority(a.w.colleagues[0].position) : 9) - (b.w.colleagues[0] ? seniority(b.w.colleagues[0].position) : 9)
      || a.p.name.localeCompare(b.p.name)), [prospects, people, idx, comments]);
  const last = imports[0];
  const ageDays = last ? Math.floor((Date.now() - Date.parse(last.created_at)) / 864e5) : null;
  const n = (l: number) => rows.filter((r) => r.w.level === l).length;

  if (!people.length) return (
    <section data-tour="known" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
      <h2 className="text-[19px] font-semibold">Who {firstNameOf(ws)} already knows at each target account</h2>
      <p className="max-w-[640px] text-[14px] leading-relaxed text-ink-2">A warm route converts far better than a cold request and saves LinkedIn&apos;s weekly invite limit for people he does not know yet. Import his connections once and Prax shows, for every prospect, whether he is connected, has talked before, or knows someone there.</p>
      <ol className="ml-4 list-decimal space-y-1 text-[13px] text-ink-2">
        <li>On LinkedIn: Me, Settings &amp; Privacy, Data privacy, Get a copy of your data.</li>
        <li>Choose the larger archive, or pick Connections, Messages, Invitations, Shares and Comments.</li>
        <li>LinkedIn emails a link, sometimes after up to 24 hours. Drop the zip in Import.</li>
      </ol>
      <div><button className="btn btn-primary h-10 px-4" onClick={onImport}><Upload size={14} /> Import LinkedIn connections</button></div>
    </section>
  );

  const route = (w: Warm, p: ProspectLite) => {
    if (w.linked?.is_connection) return { text: `Connected${w.linked.connected_on ? ` since ${fmtDay(w.linked.connected_on, { month: "short", year: "numeric" })}` : ""}${w.msgs ? `, ${w.msgs.count} messages` : ""}`, cta: "Message them", url: w.linked.url || p.linkedin };
    if (w.msgs || w.comments.replies) return { text: w.msgs ? `Talked before: ${w.msgs.count} messages, ${w.msgs.from === "us" ? "waiting on them" : "they wrote last"}` : `Replied to his comments ${w.comments.replies} time${w.comments.replies > 1 ? "s" : ""}`, cta: "Message them", url: w.linked?.url || p.linkedin };
    const c = w.colleagues[0];
    if (c) return { text: `Knows ${c.name}${c.position ? `, ${c.position}` : ""}, at ${p.company}${w.colleagues.length > 1 ? `, and ${w.colleagues.length - 1} more` : ""}`, cta: "Ask for an intro", url: c.url };
    return { text: "No warm route yet. Comment on their posts before any request.", cta: "Comment on their posts first", url: p.linkedin };
  };
  async function addTarget(p: ProspectLite, campId: string) {
    const { error } = await supabase().from("campaign_targets").insert({ workspace_id: ws.id, campaign_id: campId, prospect_id: p.id, name: p.name, company: p.company, linkedin: p.linkedin });
    setPick(null);
    if (error) toast(error.message); else { haptic(); toast(`${p.name} added to ${camps.find((c) => c.id === campId)?.name ?? "the campaign"}`); }
  }

  return (
    <div className="flex flex-col gap-4">
      <KpiTiles tour="kpis" items={[
        { label: "Already connected", value: n(1), of: `of ${rows.length}`, sub: "open prospects", tone: "dark" },
        { label: "Talked before", value: n(2), of: `of ${rows.length}`, sub: "messages or replies" },
        { label: "Knows someone there", value: n(3), of: `of ${rows.length}`, sub: "a colleague is a connection" },
        { label: "No route yet", value: rows.filter((r) => !r.w.level).length, of: `of ${rows.length}`, sub: "comment first", tone: "red" },
      ]} />
      <div data-tour="freshness" className={`flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-[13px] ${ageDays != null && ageDays >= 60 ? "bg-[#141414] text-white" : "border border-line bg-surface text-muted"}`}>
        <span className="flex-1">{ageDays == null ? "No import recorded yet." : ageDays >= 60 ? `Re-import due: the last export is ${ageDays} days old, so newer connections are missing.` : `Last import ${ageDays === 0 ? "today" : `${ageDays} days ago`}: ${people.filter((x) => x.is_connection).length.toLocaleString()} connections.`}</span>
        {ageDays != null && ageDays >= 60 && <button className="btn btn-primary h-8" onClick={onImport}>Import again</button>}
      </div>
      <section data-tour="known" className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-[18px] py-3.5"><span className="text-[15px] font-semibold">Who {firstNameOf(ws)} already knows at each target account</span><span className="text-[12px] text-muted">warmest route first</span></div>
        {rows.length === 0 ? <p className="border-t border-line px-[18px] py-4 text-[13px] text-muted">No open prospects yet. Add people in Pipeline, or from Segments.</p> : rows.map(({ p, w }, i) => {
          const r = route(w, p);
          return (
            <div key={p.id} data-tour={i === 0 ? "row" : undefined} className="flex flex-wrap items-center gap-3 border-t border-line px-[18px] py-3">
              <span className="flex min-w-[200px] flex-1 flex-col gap-0.5">
                <Link href={`/w/${ws.slug}/pipeline?p=${p.id}`} className="text-[14px] font-semibold hover:underline">{p.name}</Link>
                <span className="text-[12px] text-muted">{[p.role, p.company].filter(Boolean).join(" · ")} · {p.stage}</span>
              </span>
              <span className="min-w-[240px] flex-[2] text-[13px] text-ink-2">{r.text}</span>
              <span className="flex flex-wrap items-center gap-2">
                {r.url ? <a href={r.url} target="_blank" rel="noopener" className={`btn h-8 ${w.level ? "btn-primary" : "btn-dark"}`}>{r.cta} <ExternalLink size={12} /></a> : <Link href={`/w/${ws.slug}/pipeline?p=${p.id}`} className="btn h-8">{r.cta}</Link>}
                {can("editor") && camps.length > 0 && (pick === p.id
                  ? <select autoFocus className="field h-8 w-44 text-[12px]" defaultValue="" onBlur={() => setPick(null)} onChange={(e) => e.target.value && addTarget(p, e.target.value)} aria-label={`Campaign for ${p.name}`}><option value="" disabled>Pick a campaign</option>{camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                  : <button className="btn h-8" onClick={() => setPick(p.id)}><UserPlus size={13} /> Add to campaign targets</button>)}
              </span>
            </div>
          );
        })}
        <p className="border-t border-line px-[18px] py-2.5 text-[11.5px] text-faint">Prax only opens LinkedIn. {firstNameOf(ws)} writes and sends every message by hand.</p>
      </section>
    </div>
  );
}

function Empty({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="card grid min-h-[260px] place-items-center p-10 text-center">
      <div>
        <p className="text-[13px] text-muted">No export uploaded yet.</p>
        <button className="btn btn-primary mt-3" onClick={onUpload}><Upload size={14} /> Upload the LinkedIn export</button>
      </div>
    </div>
  );
}

// ---------------- Upload ----------------
function UploadTab({ imports, people, prospects, onDone }: { imports: Import[]; people: Person[]; prospects: ProspectLite[]; onDone: () => Promise<void> }) {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const [parsed, setParsed] = useState<{ x: ParsedExport; name: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState(0);
  const [drag, setDrag] = useState(false);
  const [wipe, setWipe] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function open(f: File) {
    if (!f.name.toLowerCase().endsWith(".zip")) { toast("Choose the .zip file LinkedIn emailed you"); return; }
    setBusy("Reading the zip");
    try {
      const x = readExport(new Uint8Array(await f.arrayBuffer()), f.name, today(), decodeText);
      if (!x.files.length) toast("This zip has none of the LinkedIn files Prax reads");
      else setParsed({ x, name: f.name });
    } catch { toast("This file could not be read as a zip"); }
    setBusy("");
  }

  async function importIt() {
    if (!parsed) return;
    const { x, name } = parsed;
    setBusy("Importing"); setProgress(0);
    let added = 0;
    const B = 500;
    for (let i = 0; i < x.people.length; i += B) {
      const { data, error } = await supabase().rpc("network_merge", { ws: ws.id, batch: x.people.slice(i, i + B), export_day: x.exportDate });
      if (error) { toast(error.message); setBusy(""); return; }
      added += (data as number) ?? 0;
      setProgress(Math.min(1, (i + B) / Math.max(1, x.people.length + x.posts.length)));
    }
    for (let i = 0; i < x.posts.length; i += B) {
      const { error } = await supabase().from("network_posts").upsert(x.posts.slice(i, i + B).map((p) => ({ ...p, workspace_id: ws.id })), { onConflict: "workspace_id,kind,key" });
      if (error) { toast(error.message); setBusy(""); return; }
      setProgress(Math.min(1, (x.people.length + i + B) / (x.people.length + x.posts.length)));
    }
    // A prospect whose LinkedIn URL is in the export is the same person, so link them now.
    const keys = new Set(x.people.map((p) => p.key));
    for (const p of prospects) {
      const k = p.linkedin ? normUrl(p.linkedin) : "";
      if (k && keys.has(k)) await supabase().from("network_people").update({ prospect_id: p.id }).eq("workspace_id", ws.id).eq("key", k).is("prospect_id", null);
    }
    const first = !imports.length;
    await supabase().from("network_imports").insert({ workspace_id: ws.id, file_name: name, export_date: x.exportDate, counts: { ...x.counts, added } });
    await supabase().from("activity").insert({ workspace_id: ws.id, kind: "network", label: `LinkedIn export imported, ${x.counts.connections} connections` });
    haptic(12);
    toast(first ? `${x.counts.connections} connections imported` : `Imported. ${added} new since the last export`);
    setParsed(null); setBusy("");
    await onDone();
  }

  async function removeAll() {
    const { error } = await supabase().rpc("network_wipe", { ws: ws.id });
    if (error) { toast(error.message); return; }
    setWipe(false); haptic(); toast("Network data removed");
    await onDone();
  }

  const conn = people.filter((p) => p.is_connection).length;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-4">
        {can("editor") && (
          <div className="card p-4">
            <button type="button" disabled={!!busy} onClick={() => input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) open(f); }}
              className={`grid w-full place-items-center gap-1.5 rounded-xl border border-dashed px-4 py-10 text-center transition-colors ${drag ? "border-accent bg-accent-soft" : "border-line-strong hover:bg-surface-2"}`}>
              <FileArchive size={22} className="text-muted" />
              <span className="text-[13px] font-medium">{busy && !parsed ? busy : "Drop the LinkedIn export .zip, or click to choose"}</span>
              <span className="text-[12px] text-muted">Opened in this browser. The zip itself never leaves your computer.</span>
            </button>
            <input ref={input} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) open(f); e.target.value = ""; }} />

            {parsed && (
              <div className="anim-rise mt-4 rounded-xl border border-line p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold">{parsed.name}</span>
                  <span className="chip">export of {fmtDay(parsed.x.exportDate, { day: "numeric", month: "short", year: "numeric" })}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {[["Connections", parsed.x.counts.connections], ["People messaged", parsed.x.counts.messaged], ["Pending invites", parsed.x.counts.invites], ["Posts", parsed.x.counts.posts], ["Comments", parsed.x.counts.comments]].map(([l, v]) => (
                    <div key={l as string}><div className="label">{l}</div><div className="num mt-1 text-[18px] font-semibold">{v as number}</div></div>
                  ))}
                </div>
                {parsed.x.missing.length > 0 && <p className="mt-3 text-[12px] text-warn">Not in this zip: {parsed.x.missing.join(", ")}. The rest still imports; upload the larger archive later to fill the gaps.</p>}
                <p className="mt-3 text-[12px] text-muted">Prax saves names, companies, positions, connection dates, message counts and dates, and your own posts and comments. It does not save message text or email addresses.</p>
                {busy === "Importing" && <div className="mt-3 h-1.5 rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(progress * 100)}%`, transition: "width .3s" }} /></div>}
                <div className="mt-4 flex gap-2">
                  <button className="btn btn-primary" disabled={!!busy} onClick={importIt}>{busy === "Importing" ? `Importing ${Math.round(progress * 100)}%` : "Import"}</button>
                  <button className="btn btn-ghost" disabled={!!busy} onClick={() => setParsed(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="card">
          <div className="border-b border-line px-4 py-3 text-[13px] font-semibold">Uploads <span className="num font-normal text-muted">{imports.length}</span></div>
          {imports.length === 0 ? <p className="p-6 text-center text-[13px] text-muted">Nothing uploaded yet.</p> : imports.map((im) => (
            <div key={im.id} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 text-[13px] last:border-0">
              <span className="min-w-0 flex-1 truncate font-medium">{im.file_name || "LinkedIn export"}</span>
              <span className="text-muted">{im.counts.connections ?? 0} connections</span>
              {im.counts.added != null && <span className="num text-good">+{im.counts.added} new</span>}
              <span className="text-[12px] text-faint">{fmtDay(ymd(new Date(im.created_at)), { day: "numeric", month: "short", year: "numeric" })}</span>
            </div>
          ))}
        </div>

        {can("owner") && conn > 0 && (
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div><div className="text-[13px] font-medium">Remove network data</div><div className="text-[12px] text-muted">Deletes every imported connection, message count, post and upload for this profile. Prospects stay as they are.</div></div>
            {wipe ? (
              <span className="flex items-center gap-2 text-[13px] text-bad">Remove {conn} connections? <button className="btn" onClick={removeAll}>Remove</button><button className="btn btn-ghost" onClick={() => setWipe(false)}>Keep</button></span>
            ) : <button className="btn btn-ghost hover:text-bad" onClick={() => setWipe(true)}><Trash2 size={14} /> Remove</button>}
          </div>
        )}
      </div>

      <div className="card h-fit p-4 text-[13px] leading-relaxed">
        <div className="label mb-2">Getting the export</div>
        <ol className="list-decimal space-y-1.5 pl-4 text-ink-2">
          <li>On LinkedIn, click <b>Me</b>, then <b>Settings &amp; Privacy</b>.</li>
          <li>Open <b>Data privacy</b>, then <b>Get a copy of your data</b>.</li>
          <li>Choose <b>Download larger data archive</b>, or pick Connections, Messages, Invitations, Shares and Comments.</li>
          <li>Click <b>Request archive</b>. LinkedIn emails a link, sometimes after up to 24 hours.</li>
          <li>Download the zip and drop it here. Do it again every month or two to see how the network grows.</li>
        </ol>
        <p className="mt-3 text-[12px] text-muted">Only the profile owner can request the export, from their own LinkedIn account.</p>
      </div>
    </div>
  );
}

// ---------------- Segments ----------------
function SegmentsTab({ people, segOf, settings, setSettings, prospects, onChange }: { people: Person[]; segOf: (x: Person) => string; settings: Settings; setSettings: (s: Settings) => void; prospects: ProspectLite[]; onChange: (p: Person[]) => void }) {
  const segs = useSegments();
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const editable = can("editor");
  const [seg, setSeg] = useState("all");
  const [lvl, setLvl] = useState(-1);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(50);
  const conns = useMemo(() => people.filter((p) => p.is_connection).map((p) => ({ p, seg: segOf(p), lvl: seniority(p.position) })), [people, segOf]);
  const keys = [...Object.keys(SEGMENTS), ""];
  const counts = Object.fromEntries(keys.map((k) => [k, conns.filter((c) => c.seg === k).length]));
  const max = Math.max(1, ...Object.values(counts));
  const rows = conns.filter((c) => (seg === "all" || c.seg === seg) && (lvl < 0 || c.lvl === lvl) && (!q || `${c.p.name} ${c.p.company} ${c.p.position}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.lvl - b.lvl || ((b.p.connected_on ?? "") < (a.p.connected_on ?? "") ? -1 : 1));
  const inPipe = new Set(prospects.map((p) => p.id));

  async function setManual(x: Person, v: string) {
    const prev = x.segment_manual;
    onChange(people.map((p) => (p.key === x.key ? { ...p, segment_manual: v } : p)));
    const { error } = await supabase().from("network_people").update({ segment_manual: v }).eq("workspace_id", ws.id).eq("key", x.key);
    if (error) { toast(error.message); onChange(people.map((p) => (p.key === x.key ? { ...p, segment_manual: prev } : p))); return; }
    haptic(); toast(v ? `${x.name} set to ${v}` : `${x.name} back to the rules`, async () => {
      await supabase().from("network_people").update({ segment_manual: prev }).eq("workspace_id", ws.id).eq("key", x.key);
      onChange(people.map((p) => (p.key === x.key ? { ...p, segment_manual: prev } : p)));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-[1fr_300px]">
        <div className="card p-4">
          <div className="label mb-3">Connections by segment <span className="num ml-1 normal-case tracking-normal text-faint">{conns.length}</span></div>
          {keys.map((k) => (
            <button key={k || "none"} onClick={() => { setSeg(seg === k ? "all" : k); setShown(50); }} className={`mb-1.5 block w-full rounded-md px-1.5 py-1 text-left ${seg === k ? "bg-surface-2" : "hover:bg-surface-2/60"}`}>
              <div className="flex justify-between text-[12px]"><span>{k ? `${k} · ${segs[k].label}` : "Unsegmented"}</span><span className="num text-muted">{counts[k]}</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${(counts[k] / max) * 100}%`, background: k ? SEGMENTS[k].color : "var(--faint)" }} /></div>
            </button>
          ))}
        </div>
        <div className="card p-4">
          <div className="label mb-3">Seniority{seg !== "all" && <span className="ml-1 normal-case tracking-normal text-faint">in {seg || "Unsegmented"}</span>}</div>
          {SENIORITY.map((s, i) => {
            const n = conns.filter((c) => (seg === "all" || c.seg === seg) && c.lvl === i).length;
            return (
              <button key={s} onClick={() => { setLvl(lvl === i ? -1 : i); setShown(50); }} className={`flex w-full justify-between rounded-md px-1.5 py-1.5 text-[13px] ${lvl === i ? "bg-surface-2" : "hover:bg-surface-2/60"}`}>
                <span>{s}</span><span className="num text-muted">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <span className="text-[13px] font-semibold">{seg === "all" ? "All connections" : seg ? `${seg} · ${segs[seg].label}` : "Unsegmented"}{lvl >= 0 && ` · ${SENIORITY[lvl]}`}</span>
          <span className="num text-[12px] text-muted">{rows.length}</span>
          <input className="field ml-auto h-8 w-full sm:w-64" placeholder="Search name, company, position" value={q} onChange={(e) => { setQ(e.target.value); setShown(50); }} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-line text-left">{["Name", "Position", "Company", "Segment", "Connected", ""].map((h) => <th key={h} className="label px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{rows.slice(0, shown).map(({ p, seg: s }) => (
              <tr key={p.key} className="border-b border-line last:border-0">
                <td className="px-3 py-2 font-medium">{p.url ? <a href={p.url} target="_blank" rel="noopener" className="hover:underline">{p.name}</a> : p.name}</td>
                <td className="max-w-[260px] truncate px-3 py-2 text-ink-2" title={p.position}>{p.position}</td>
                <td className="max-w-[200px] truncate px-3 py-2 text-ink-2" title={p.company}>{p.company}</td>
                <td className="px-3 py-2">
                  {editable ? (
                    <select className="field h-7 w-[92px] px-1.5 text-[12px]" value={p.segment_manual} onChange={(e) => setManual(p, e.target.value)} aria-label={`Segment for ${p.name}`}>
                      <option value="">{s ? `${s} (rules)` : "None"}</option>
                      {Object.keys(SEGMENTS).map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  ) : <span className="chip" style={{ color: SEGMENTS[s]?.color }}>{s || "None"}</span>}
                </td>
                <td className="num whitespace-nowrap px-3 py-2 text-[12px] text-muted">{p.connected_on ? fmtDay(p.connected_on, { month: "short", year: "numeric" }) : ""}</td>
                <td className="px-3 py-2 text-right">{p.prospect_id && inPipe.has(p.prospect_id) ? <span className="chip text-good">In pipeline</span> : editable && <AddToPipeline p={p} seg={s} people={people} onChange={onChange} />}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {rows.length > shown && <button className="btn btn-ghost m-2 w-[calc(100%-16px)]" onClick={() => setShown(shown + 100)}>Show more <span className="num text-muted">{rows.length - shown}</span></button>}
        {rows.length === 0 && <p className="p-6 text-center text-[13px] text-muted">No connections match.</p>}
      </div>

      {editable && <SegmentRules settings={settings} setSettings={setSettings} />}
    </div>
  );
}

function AddToPipeline({ p, seg, people, onChange }: { p: Person; seg: string; people: Person[]; onChange: (p: Person[]) => void }) {
  const { ws } = useWorkspace();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    const { data, error } = await supabase().from("prospects").insert({ workspace_id: ws.id, name: p.name, role: p.position, company: p.company, segment: seg, stage: "Connected", warmth: "warm", linkedin: p.url }).select("id").single();
    if (error) { toast(error.message); setBusy(false); return; }
    await supabase().from("network_people").update({ prospect_id: data.id }).eq("workspace_id", ws.id).eq("key", p.key);
    onChange(people.map((x) => (x.key === p.key ? { ...x, prospect_id: data.id } : x)));
    haptic(); toast(`${p.name} added to the pipeline as Connected`, async () => {
      await supabase().from("prospects").delete().eq("id", data.id);
      onChange(people.map((x) => (x.key === p.key ? { ...x, prospect_id: null } : x)));
    });
    setBusy(false);
  }
  return <button className="btn h-7 whitespace-nowrap px-2 text-[12px]" disabled={busy} onClick={add}><UserPlus size={13} /> Add to pipeline</button>;
}

function SegmentRules({ settings, setSettings }: { settings: Settings; setSettings: (s: Settings) => void }) {
  const segs = useSegments();
  const { ws } = useWorkspace();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const toDraft = (rs: SegRule[]) => rs.map((r) => ({ seg: r.seg, companies: r.companies.join(", "), roles: r.roles.join(", ") }));
  const [draft, setDraft] = useState(toDraft(settings.segments));
  useEffect(() => setDraft(toDraft(settings.segments)), [settings.segments]);
  const set = (i: number, k: "companies" | "roles", v: string) => setDraft(draft.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const fromDraft = (): SegRule[] => draft.map((r) => ({ seg: r.seg, companies: splitWords(r.companies), roles: splitWords(r.roles) }));
  async function save(next: SegRule[]) {
    const { error } = await supabase().from("network_settings").upsert({ workspace_id: ws.id, segments: next, topics: settings.topics, updated_at: new Date().toISOString() });
    if (error) { toast(error.message); return; }
    setSettings({ ...settings, segments: next }); haptic(); toast("Segment rules saved");
  }
  return (
    <div className="card">
      <button className="flex w-full items-center justify-between px-4 py-3 text-[13px] font-semibold" onClick={() => setOpen(!open)}>
        Segment rules <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="anim-rise border-t border-line p-4">
          <p className="mb-3 text-[12px] text-muted">Checked top to bottom, first match wins. Companies of prospects already in the pipeline count first, under the prospect&apos;s segment. Separate words with commas. A segment set by hand on a person always wins.</p>
          {draft.map((r, i) => (
            <div key={r.seg} className="mb-3 grid gap-2 md:grid-cols-[120px_1fr_1fr]">
              <div className="pt-1.5 text-[13px] font-medium" style={{ color: segs[r.seg]?.color }}>{r.seg} · {segs[r.seg]?.label}</div>
              <label className="flex flex-col gap-1"><span className="label">Company contains</span><textarea rows={2} className="field h-auto py-1.5 text-[12px]" value={r.companies} onChange={(e) => set(i, "companies", e.target.value)} /></label>
              <label className="flex flex-col gap-1"><span className="label">Position contains</span><textarea rows={2} className="field h-auto py-1.5 text-[12px]" value={r.roles} onChange={(e) => set(i, "roles", e.target.value)} /></label>
            </div>
          ))}
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={() => save(fromDraft())}>Save rules</button>
            <button className="btn btn-ghost" onClick={() => save(DEFAULT_SEGMENTS)}>Reset to defaults</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Warm paths ----------------
const LEVEL = ["No warm path yet", "Already connected", "Talked before", "Knows someone there"];
function WarmTab({ people, idx, prospects, comments, segOf, onChange }: { people: Person[]; idx: ReturnType<typeof indexPeople>; prospects: ProspectLite[]; comments: CommentLite[]; segOf: (x: Person) => string; onChange: (p: Person[]) => void }) {
  const [all, setAll] = useState(false);
  const list = useMemo(() => prospects.filter((p) => !["Won", "Parked"].includes(p.stage)).map((p) => ({ p, w: warmPaths(p, people, idx, comments) }))
    .sort((a, b) => (a.w.level || 9) - (b.w.level || 9) || b.w.suggest.length - a.w.suggest.length || a.p.name.localeCompare(b.p.name)), [prospects, people, idx, comments]);
  const withPath = list.filter((x) => x.w.level || x.w.suggest.length);
  const shown = all ? list : withPath;
  const n = (l: number) => list.filter((x) => x.w.level === l).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["Already connected", n(1)], ["Talked before", n(2)], ["Knows someone there", n(3)], ["To confirm", list.filter((x) => x.w.suggest.length).length]].map(([l, v]) => (
          <div key={l as string} className="card px-4 py-3"><div className="label">{l}</div><div className="num mt-1 text-[20px] font-semibold">{v as number}</div><div className="text-[11px] text-muted">of {list.length} open prospects</div></div>
        ))}
      </div>
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <span className="text-[13px] font-semibold">Prospects, warmest first</span>
          <label className="flex items-center gap-2 text-[12px] text-muted"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show prospects with no path ({list.length - withPath.length})</label>
        </div>
        {shown.length === 0 ? <p className="p-6 text-center text-[13px] text-muted">No warm paths found yet. They appear when a prospect is a connection, someone you have messaged, or works where one of your connections works.</p>
          : shown.map(({ p, w }) => <WarmRow key={p.id} p={p} w={w} people={people} segOf={segOf} onChange={onChange} />)}
      </div>
    </div>
  );
}

function WarmRow({ p, w, people, segOf, onChange }: { p: ProspectLite; w: Warm; people: Person[]; segOf: (x: Person) => string; onChange: (p: Person[]) => void }) {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const editable = can("editor");
  const patch = (key: string, v: Partial<Person>) => onChange(people.map((x) => (x.key === key ? { ...x, ...v } : x)));

  async function confirm(x: Person) {
    const { error } = await supabase().from("network_people").update({ prospect_id: p.id }).eq("workspace_id", ws.id).eq("key", x.key);
    if (error) { toast(error.message); return; }
    patch(x.key, { prospect_id: p.id });
    if (!p.linkedin && x.url) await supabase().from("prospects").update({ linkedin: x.url }).eq("id", p.id);
    haptic(); toast(`Linked ${p.name} to the connection`);
  }
  async function notThem(x: Person) {
    const next = [...(x.not_prospects ?? []), p.id];
    const { error } = await supabase().from("network_people").update({ not_prospects: next }).eq("workspace_id", ws.id).eq("key", x.key);
    if (error) { toast(error.message); return; }
    patch(x.key, { not_prospects: next }); haptic(); toast("Marked as someone else");
  }
  async function moveConnected() {
    const prev = p.stage;
    const { error } = await supabase().from("prospects").update({ stage: "Connected" }).eq("id", p.id);
    if (error) { toast(error.message); return; }
    haptic(); toast(`${p.name} moved to Connected`, () => { supabase().from("prospects").update({ stage: prev }).eq("id", p.id).then(); });
  }

  const tone = w.level === 1 ? "var(--good)" : w.level === 2 ? "var(--accent)" : w.level === 3 ? "var(--warn)" : "var(--faint)";
  return (
    <div className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-0 md:flex-row md:items-start md:gap-4">
      <div className="min-w-0 md:w-[260px] md:shrink-0">
        <Link href={`/w/${ws.slug}/pipeline?p=${p.id}`} className="text-[13px] font-medium hover:underline">{p.name}</Link>
        <div className="truncate text-[12px] text-muted">{[p.role, p.company].filter(Boolean).join(" · ")}</div>
        <div className="mt-1 flex gap-1.5"><span className="chip">{p.stage}</span><span className="chip" style={{ color: tone }}>{LEVEL[w.level]}</span></div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px] text-ink-2">
        {w.linked && (
          <div className="flex flex-wrap items-center gap-2">
            <Check size={13} className="text-good" />
            {w.linked.is_connection ? <>1st-degree connection{w.linked.connected_on && ` since ${fmtDay(w.linked.connected_on, { month: "short", year: "numeric" })}`}</> : w.linked.invite === "sent" ? "Invitation sent, not accepted yet" : "In your messages, not connected"}
            {w.linked.url && <a href={w.linked.url} target="_blank" rel="noopener" className="text-muted hover:text-ink" aria-label="Open profile"><ExternalLink size={12} /></a>}
            {editable && w.linked.is_connection && OPEN_STAGES.includes(p.stage) && <button className="btn h-6 px-2 text-[12px]" onClick={moveConnected}>Move to Connected <ArrowRight size={12} /></button>}
          </div>
        )}
        {w.msgs && <div>{w.msgs.count} message{w.msgs.count > 1 ? "s" : ""}, last on {w.msgs.last ? fmtDay(w.msgs.last, { day: "numeric", month: "short", year: "numeric" }) : "unknown date"}, {w.msgs.from === "us" ? "waiting on them" : "they wrote last"}</div>}
        {w.comments.count > 0 && <div>You commented on their posts {w.comments.count} time{w.comments.count > 1 ? "s" : ""}{w.comments.replies ? `, ${w.comments.replies} repl${w.comments.replies > 1 ? "ies" : "y"}` : ""}</div>}
        {w.suggest.map(({ person: x, strong }) => (
          <div key={x.key} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5">
            <span className="min-w-0">Possibly <b>{x.name}</b>{x.position || x.company ? `, ${[x.position, x.company].filter(Boolean).join(" at ")}` : ""} <span className="text-[12px] text-muted">({strong ? "same name and company" : "same name only"})</span></span>
            {editable && <span className="ml-auto flex gap-1"><button className="btn h-6 px-2 text-[12px]" onClick={() => confirm(x)}><Check size={12} /> Same person</button><button className="btn btn-ghost h-6 px-2 text-[12px]" onClick={() => notThem(x)}><X size={12} /> Not them</button></span>}
          </div>
        ))}
        {w.colleagues.length > 0 && (
          <div>
            <span className="text-muted">You know {w.colleagues.length} at {p.company}: </span>
            {w.colleagues.slice(0, 3).map((c, i) => (
              <span key={c.key}>{i > 0 && ", "}{c.url ? <a href={c.url} target="_blank" rel="noopener" className="font-medium hover:underline">{c.name}</a> : <b>{c.name}</b>} <span className="text-muted">({c.position || "position unknown"}{segOf(c) ? `, ${segOf(c)}` : ""})</span></span>
            ))}
            {w.colleagues.length > 3 && <span className="text-muted"> and {w.colleagues.length - 3} more</span>}
          </div>
        )}
        {!w.level && !w.suggest.length && <div className="text-muted">Nothing in the export links to them yet.</div>}
      </div>
    </div>
  );
}

// ---------------- Topics ----------------
function TopicsTab({ posts, settings, setSettings, onUpload }: { posts: Post[]; settings: Settings; setSettings: (s: Settings) => void; onUpload: () => void }) {
  const { ws, can } = useWorkspace();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const toDraft = (ts: TopicRule[]) => ts.map((t, i) => ({ id: i, name: t.name, words: t.words.join(", ") }));
  const [draft, setDraft] = useState(toDraft(settings.topics));
  useEffect(() => setDraft(toDraft(settings.topics)), [settings.topics]);
  const edit = (id: number, v: Partial<{ name: string; words: string }>) => setDraft(draft.map((x) => (x.id === id ? { ...x, ...v } : x)));
  const fromDraft = (): TopicRule[] => draft.filter((x) => x.name.trim()).map((x) => ({ name: x.name.trim(), words: splitWords(x.words) }));
  const tagged = useMemo(() => posts.map((p) => ({ p, t: topicsFor(p.text, settings.topics) })).sort((a, b) => ((b.p.day ?? "") < (a.p.day ?? "") ? -1 : 1)), [posts, settings.topics]);
  const months = useMemo(() => { const d = new Date(); return Array.from({ length: 6 }, (_, i) => { const m = new Date(d.getFullYear(), d.getMonth() - 5 + i, 1); return ymd(m).slice(0, 7); }); }, []);
  const names = [...settings.topics.map((t) => t.name), "Other"];
  const stats = names.map((n) => {
    const rows = tagged.filter((x) => (n === "Other" ? x.t.length === 0 : x.t.includes(n)));
    return { n, rows, posts: rows.filter((x) => x.p.kind === "post").length, comments: rows.filter((x) => x.p.kind === "comment").length, by: months.map((m) => rows.filter((x) => x.p.day?.startsWith(m)).length) };
  });
  const peak = Math.max(1, ...stats.flatMap((s) => s.by));

  async function save(next: TopicRule[]) {
    const { error } = await supabase().from("network_settings").upsert({ workspace_id: ws.id, segments: settings.segments, topics: next, updated_at: new Date().toISOString() });
    if (error) { toast(error.message); return; }
    setSettings({ ...settings, topics: next }); haptic(); toast("Topics saved");
  }

  if (!posts.length) return <div className="card grid min-h-[220px] place-items-center p-10 text-center"><div><p className="text-[13px] text-muted">No posts or comments in the uploaded export yet.</p><button className="btn btn-primary mt-3" onClick={onUpload}><Upload size={14} /> Upload the LinkedIn export</button></div></div>;
  return (
    <div className="flex flex-col gap-4">
      <div className="card overflow-x-auto">
        <div className="border-b border-line px-4 py-3 text-[13px] font-semibold">What you post and comment about <span className="ml-1 text-[12px] font-normal text-muted">{tagged.filter((x) => x.p.kind === "post").length} posts, {tagged.filter((x) => x.p.kind === "comment").length} comments; one item can sit in more than one topic</span></div>
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-line text-left">{["Topic", "Posts", "Comments", "Last 6 months", "Latest"].map((h) => <th key={h} className="label px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
          <tbody>{stats.map((s) => (
            <tr key={s.n} className="border-b border-line align-top last:border-0">
              <td className="px-3 py-2.5 font-medium">{s.n}</td>
              <td className="num px-3 py-2.5">{s.posts}</td>
              <td className="num px-3 py-2.5">{s.comments}</td>
              <td className="px-3 py-2.5">
                <div className="flex h-7 items-end gap-1" role="img" aria-label={`${s.n} by month: ${s.by.join(", ")}`}>
                  {s.by.map((v, i) => <div key={i} title={`${months[i]}: ${v}`} className="w-3 rounded-sm" style={{ height: `${Math.max(2, (v / peak) * 28)}px`, background: v ? "var(--accent)" : "var(--line)" }} />)}
                </div>
              </td>
              <td className="max-w-[420px] px-3 py-2.5">
                {s.rows.slice(0, 2).map(({ p }) => (
                  <div key={p.kind + p.key} className="mb-1 truncate text-[12px] text-ink-2" title={p.text}>
                    <span className="text-faint">{p.kind === "post" ? "Post" : "Comment"} · {p.day ? fmtDay(p.day, { day: "numeric", month: "short" }) : ""} · </span>
                    {p.url ? <a href={p.url} target="_blank" rel="noopener" className="hover:underline">{p.text}</a> : p.text}
                  </div>
                ))}
                {!s.rows.length && <span className="text-[12px] text-faint">Nothing yet</span>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {can("editor") && (
        <div className="card">
          <button className="flex w-full items-center justify-between px-4 py-3 text-[13px] font-semibold" onClick={() => setOpen(!open)}>
            Topic words <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <div className="anim-rise border-t border-line p-4">
              <p className="mb-3 text-[12px] text-muted">A post or comment joins a topic when it contains any of its words. Separate words with commas.</p>
              {draft.map((r) => (
                <div key={r.id} className="mb-3 grid gap-2 md:grid-cols-[220px_1fr_32px]">
                  <input className="field" value={r.name} onChange={(e) => edit(r.id, { name: e.target.value })} aria-label="Topic name" />
                  <textarea rows={2} className="field h-auto py-1.5 text-[12px]" value={r.words} onChange={(e) => edit(r.id, { words: e.target.value })} aria-label={`Words for ${r.name}`} />
                  <button className="btn btn-ghost h-8 px-0" aria-label={`Remove ${r.name}`} onClick={() => setDraft(draft.filter((x) => x.id !== r.id))}><X size={14} /></button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <button className="btn" onClick={() => setDraft([...draft, { id: Date.now(), name: "New topic", words: "" }])}>Add topic</button>
                <button className="btn btn-primary" onClick={() => save(fromDraft())}>Save topics</button>
                <button className="btn btn-ghost" onClick={() => save(defaultTopics(pillarsOf(ws)))}>Start again from the pillars</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
