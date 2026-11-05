"use client";
import { useRef, useState } from "react";
import { type ParsedList, type LinkRow, type Finding, parseLinkFile, researchResourceRows, LINK_COLS, hostOf } from "@/lib/discovery";
import { Modal } from "@/components/content/shared";
import { type Data, type Link, type Run, LinkStatus, SidePanel, ago } from "./shared";
import { FoundRow } from "./search";

/** Crawl: every link in the uploaded lists, read from the server, with what each one gave. */
export function CrawlTab({ d, running, progress, status, onCrawl, onStop, openUpload, lastCrawl, findingsFor }: {
  d: Data; running: boolean; progress: { done: number; total: number }; status: Record<string, string>; onCrawl: () => void; onStop: () => void; openUpload: () => void; lastCrawl: Run | null; findingsFor: (l: Link) => Finding[];
}) {
  const [open, setOpen] = useState<Link | null>(null);
  const listName = (id: string) => d.lists.find((l) => l.id === id)?.name ?? "";
  const st = (l: Link) => status[l.id] ?? l.status;
  const n = (s: string) => d.links.filter((l) => st(l) === s).length;
  const stats: [string, number, boolean][] = [["Links", d.links.length, true], ["Read", n("read") + n("list"), false], ["Articles taken", d.links.reduce((a, l) => a + (l.articles || 0), 0), false], ["Gated", n("gated"), false], ["Blocked", n("blocked"), false]];
  const cols = "grid-cols-[minmax(0,1.6fr)_minmax(0,2fr)_minmax(0,.9fr)_minmax(0,.7fr)_minmax(0,.8fr)]";
  return (
    <div className="anim-rise flex flex-col gap-4">
      <div data-tour="crawl" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white px-5 py-[18px]">
        <span className="flex min-w-0 max-w-[640px] flex-col gap-1"><span className="text-[16px] font-[650]">Crawl your link lists</span><span className="text-[13px] leading-relaxed text-muted">Prax opens every link in your uploaded lists, from its server, and again every {d.settings.run_day}. On a list page it takes the 5 newest articles. Dates are confirmed from each page. LinkedIn links are never opened.</span></span>
        {d.editable && <span className="flex flex-wrap gap-2"><button type="button" className="btn h-10 px-3.5" onClick={openUpload}>Upload a list</button>
          {running ? <button type="button" className="btn btn-dark h-10 px-4" onClick={onStop}>Stop · {progress.done} of {progress.total}</button> : <button type="button" className="btn btn-primary h-10 px-[18px]" disabled={!d.links.length} onClick={onCrawl}>Crawl now</button>}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(([label, v, dark]) => <div key={label} className={`tile${dark ? " dark col-span-2 sm:col-span-1" : ""}`}><span className="text-[11.5px] font-semibold uppercase tracking-[.05em] opacity-80">{label}</span><span className="num text-[24px] leading-tight">{v}</span></div>)}
      </div>
      {running && <span className="h-1.5 overflow-hidden rounded-full bg-[#ececec]"><span className="block h-full bg-[#d64545] transition-[width] duration-200" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} /></span>}
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        {d.links.length ? (
          <div className="overflow-x-auto"><div className="min-w-[800px]">
            <div className={`grid ${cols} gap-2.5 bg-[#141414] px-[18px] py-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-white`}><span>Source</span><span>Link</span><span>Status</span><span>Articles</span><span>Last read</span></div>
            {d.links.map((l) => (
              <button key={l.id} type="button" onClick={() => setOpen(l)} className={`grid w-full ${cols} items-center gap-2.5 border-t border-[#ececec] px-[18px] py-2.5 text-left text-[13px] hover:bg-[#fafafa]`}>
                <span className="flex min-w-0 flex-col"><b className="truncate">{l.name || hostOf(l.url)}</b><span className="truncate text-[11.5px] text-faint">{listName(l.list_id)}</span></span>
                <span className="truncate text-muted">{l.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
                <span><LinkStatus s={st(l)} /></span>
                <span className="num">{st(l) === "read" || st(l) === "list" ? l.articles : "None"}</span>
                <span className="text-[12px] text-muted">{status[l.id] === "reading" ? "Reading now" : ago(l.last_read)}</span>
              </button>
            ))}
          </div></div>
        ) : <p className="m-0 px-[18px] py-5 text-[13px] text-muted">No lists yet. Upload an Excel or CSV of links, or add the Research Resources List, and Prax reads every link on the server.</p>}
      </div>
      {lastCrawl && <p className="m-0 text-[12.5px] text-muted">Last crawl {ago(lastCrawl.started_at)}{lastCrawl.trigger === "cron" ? ", on the server" : ""}: {lastCrawl.stats.links ?? 0} links, {lastCrawl.stats.articles ?? 0} articles, {lastCrawl.stats.gated ?? 0} gated, {lastCrawl.stats.blocked ?? 0} blocked.</p>}
      {open && (() => {
        const rows = findingsFor(open), s = st(open);
        return (
          <SidePanel kicker={`Crawled from ${listName(open.list_id) || "a list"}`} title={open.name || hostOf(open.url)} onClose={() => setOpen(null)}>
            <a href={open.url} target="_blank" rel="noopener noreferrer" className="truncate text-[12.5px] text-muted hover:text-ink">{open.url}</a>
            <span className="text-[12.5px] leading-relaxed text-muted">{s === "gated" ? "This site needs a login or a subscription, so it was not read. It stays listed as Gated, never as empty." : s === "blocked" ? "The site refused the request. It stays listed as Blocked." : s === "list" ? `A list page: the ${open.articles} newest articles were taken and read.` : s === "read" ? "The page was read and its date checked." : s === "failed" ? `It could not be read: ${open.error || "no readable text"}.` : "Not read yet. It is read on the next crawl."}</span>
            {(open.access || open.region || open.notes) && <span className="text-[12.5px]">{[open.access && `Access: ${open.access}`, open.region && `Region: ${open.region}`, open.notes].filter(Boolean).join(" · ")}</span>}
            <span className="label text-ink">What it found</span>
            {rows.map((f) => <FoundRow key={f.id} f={f} d={d} />)}
            {!rows.length && <span className="text-[13px] text-muted">None.</span>}
          </SidePanel>
        );
      })()}
    </div>
  );
}

/** Upload a link list: Excel or CSV, parsed in the browser, previewed, then imported as one list. */
export function UploadModal({ onClose, onImport }: { onClose: () => void; onImport: (name: string, fileName: string, rows: LinkRow[]) => void }) {
  const [parsed, setParsed] = useState<ParsedList | null>(null);
  const [file, setFile] = useState("");
  const [name, setName] = useState("");
  const input = useRef<HTMLInputElement>(null);
  async function pick(f: File) {
    setFile(f.name); setName(f.name.replace(/\.(xlsx|csv)$/i, "").replace(/\s*\(\d+\)$/, ""));
    setParsed(parseLinkFile(f.name, new Uint8Array(await f.arrayBuffer())));
  }
  const ready = !!parsed?.rows.length;
  return (
    <Modal wide title="Upload a link list" onClose={onClose} footer={<><button type="button" className="btn h-10 px-4" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary h-10 px-[18px]" disabled={!ready || !name.trim()} onClick={() => parsed && onImport(name.trim(), file, parsed.rows)}>Import {parsed?.rows.length ?? ""} links</button></>}>
      <div className="flex flex-col gap-3.5">
        <p className="m-0 text-[12.5px] text-muted">Excel (.xlsx) or CSV. Columns: url (required), name, type, priority, access, region, notes. Hyperlinks hidden behind cell text are kept. LinkedIn links are left out; they are never opened.</p>
        <button type="button" className="flex flex-col items-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-[#d0d0d0] p-6 text-center hover:border-[#d64545]" onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) pick(f); }}>
          <span className="font-semibold">{file || "Choose a file from your computer"}</span><span className="text-[12.5px] text-muted">Or drop it here.</span>
        </button>
        <input ref={input} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }} />
        <button type="button" className="btn h-[34px] self-start" onClick={() => { setFile("Research Resources List"); setName("Research Resources List"); setParsed({ rows: researchResourceRows(), dupes: 0, invalid: 0, linkedin: 0 }); }}>Use the Research Resources List</button>
        {parsed?.error && <p className="m-0 rounded-xl border border-[#d64545] px-3.5 py-2.5 text-[13px]">{parsed.error}</p>}
        {ready && <>
          <label className="flex flex-col gap-1.5"><span className="label">List name</span><input className="field h-10" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <div className="overflow-hidden rounded-xl border border-[#ececec]"><div className="overflow-x-auto">
            <div className="grid min-w-[640px] grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_repeat(4,minmax(0,.7fr))_minmax(0,1fr)] text-[12px]">
              {LINK_COLS.map((h) => <span key={h} className="bg-[#141414] px-2.5 py-1.5 font-semibold text-white">{h}</span>)}
              {parsed!.rows.slice(0, 6).flatMap((r, i) => LINK_COLS.map((k) => <span key={`${i}${k}`} className="truncate border-b border-[#ececec] px-2.5 py-1.5" title={r[k]}>{r[k] || "None"}</span>))}
            </div>
          </div></div>
          <span className="text-[12.5px] text-muted">{parsed!.rows.length} links ready{parsed!.dupes ? `, ${parsed!.dupes} duplicates removed` : ""}{parsed!.invalid ? `, ${parsed!.invalid} rows without a link skipped` : ""}{parsed!.linkedin ? `, ${parsed!.linkedin} LinkedIn links left out` : ""}. Gated or blocked sites are marked when read, never faked.</span>
        </>}
      </div>
    </Modal>
  );
}
