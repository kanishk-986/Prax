"use client";
import { type Finding, hostOf } from "@/lib/discovery";
import { type Data, type List, LinkStatus, ago } from "./shared";

export type Entity = { name: string; kind: string };

/** Sources: where discovery looks. Link lists, the domains in them, watched entities and the LinkedIn inbox. */
export function SourcesTab({ d, entities, batch, openUpload, removeList, openFinding }: { d: Data; entities: Entity[]; batch: number; openUpload: () => void; removeList: (l: List) => void; openFinding: (f: Finding) => void }) {
  const domains = [...d.links.reduce((m, l) => { const h = hostOf(l.url); const s = m.get(h); if (!s || l.status === "gated" || l.status === "blocked") m.set(h, l.status); return m; }, new Map<string, string>())].sort((a, b) => a[0].localeCompare(b[0]));
  const inbox = d.findings.filter((f) => f.found_by.includes("linkedin")).slice(0, 8);
  const kinds = [...new Set(entities.map((e) => e.kind))];
  return (
    <div className="anim-rise flex flex-wrap items-stretch gap-4">
      <section className="flex min-w-0 flex-[3_1_560px] flex-col gap-4">
        <div data-tour="lists" className="overflow-hidden rounded-2xl border border-line bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-[18px] py-3.5"><span className="min-w-0"><span className="font-semibold">Link lists</span><span className="mt-0.5 block text-meta text-muted">Excel or CSV files of links. Prax reads each page and the newest articles on list pages.</span></span>{d.editable && <button type="button" className="btn btn-primary h-9 shrink-0" onClick={openUpload}>Upload a list</button>}</div>
          {d.lists.map((l) => {
            const ls = d.links.filter((x) => x.list_id === l.id), bad = ls.filter((x) => x.status === "gated" || x.status === "blocked").length, unread = ls.filter((x) => x.status === "new").length;
            return (
              <div key={l.id} className="flex flex-wrap items-center gap-3 border-t border-[#ececec] px-[18px] py-3 hover:bg-[#fafafa]">
                <span className="flex min-w-0 flex-1 basis-[220px] flex-col gap-0.5"><span className="text-body font-semibold">{l.name}</span><span className="text-meta text-muted">{ls.length} links · uploaded {new Date(l.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}{l.file_name && l.file_name !== l.name ? ` · ${l.file_name}` : ""}</span></span>
                <LinkStatus s={unread === ls.length ? "new" : "read"} />
                {bad > 0 && <span className="text-meta text-muted">{bad} gated or blocked</span>}
                {d.editable && <button type="button" className="btn btn-ghost h-8 shrink-0" onClick={() => removeList(l)}>Remove</button>}
              </div>
            );
          })}
          {!d.lists.length && <p className="m-0 border-t border-[#ececec] px-[18px] py-4 text-body text-muted">None yet. The Research Resources List is one click away in Upload a list.</p>}
        </div>
        <div className="flex-1 overflow-hidden rounded-2xl border border-line bg-white">
          <div className="px-[18px] py-3.5"><div className="font-semibold">Domains in your lists</div><div className="mt-0.5 text-meta text-muted">Each site is read on every crawl. The AI searches cover the open web, not only these.</div></div>
          {domains.slice(0, 40).map(([h, s]) => <div key={h} className="flex items-center gap-3 border-t border-[#ececec] px-[18px] py-2.5"><span className="min-w-0 flex-1 truncate text-body font-semibold">{h}</span><LinkStatus s={s} /></div>)}
          {domains.length > 40 && <p className="m-0 border-t border-[#ececec] px-[18px] py-2.5 text-meta text-muted">And {domains.length - 40} more on the Crawl tab.</p>}
          {!domains.length && <p className="m-0 border-t border-[#ececec] px-[18px] py-4 text-body text-muted">None.</p>}
        </div>
      </section>
      <aside className="flex min-w-0 flex-[2_1_320px] flex-col gap-4">
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <div className="px-[18px] py-3.5"><div className="font-semibold">Watched entities</div><div className="mt-0.5 text-meta text-muted">Target accounts, VIPs, competitors and the Research Resources List. {batch} are searched per run, in rotation.</div></div>
          {kinds.map((k) => {
            const es = entities.filter((e) => e.kind === k);
            return (
              <div key={k} className="flex flex-col gap-1.5 border-t border-[#ececec] px-[18px] py-2.5">
                <span className="flex items-center justify-between gap-2.5 text-meta font-semibold"><span>{k}</span><span className="num text-muted">{es.length}</span></span>
                <span className="text-body leading-snug text-muted">{es.slice(0, 8).map((e) => e.name).join(", ")}{es.length > 8 ? `, and ${es.length - 8} more` : ""}</span>
              </div>
            );
          })}
        </div>
        <div data-tour="linkedin" className="panel flex flex-1 flex-col gap-2.5 p-[18px]">
          <h2 className="text-body font-semibold">LinkedIn inbox</h2>
          <span className="text-body leading-relaxed text-ink-2">Discovery never searches, scrolls or reads LinkedIn in the background. A post arrives here only when you press <b>Send to Discovery</b> on the Prax bar while viewing it yourself (extension 0.8.0).</span>
          {inbox.map((f) => <button key={f.id} type="button" onClick={() => openFinding(f)} className="flex justify-between gap-2.5 border-t border-line pt-2 text-left text-body hover:text-ink"><span className="min-w-0 truncate">{f.title}</span><span className="shrink-0 text-meta text-muted">{ago(f.found_at)}</span></button>)}
          {!inbox.length && <span className="border-t border-line pt-2 text-body text-muted">None sent yet.</span>}
        </div>
      </aside>
    </div>
  );
}
