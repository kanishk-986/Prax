"use client";
import { useState } from "react";
import { type Finding, PRIORITY_FACTORS, priorityParts, priorityMinus, sourcesOf, servicesLine, replyDraft } from "@/lib/discovery";
import { type Data, type Ranked, Box, Tag, SidePanel } from "./shared";
import { useWorkspace } from "@/lib/workspace";
import { fullNameOf, firstNameOf, roleOf, companyOf, regionText } from "@/lib/persona";

export type Opp = { f: Finding; kind: "pitch" | "press" | "sales"; due: number | null };
export type DigestActions = {
  send: (ts: Ranked[]) => void; merge: (t: Ranked) => void; keep: (t: Ranked) => void; sentOf: (t: Ranked) => boolean; campaignOf: (t: Ranked) => string;
  pitch: (o: Opp) => void; salesCopy: (o: Opp) => void; replied: (o: Opp) => void; copy: (text: string, note: string) => void;
};

/** Digest: topics, not articles. Top 3 as large cards, #4 to #10 as a list, Rising, then speaking, press and sales. */
export function DigestTab({ d, week, weeks, setWeek, opps, act }: { d: Data; week: string; weeks: string[]; setWeek: (w: string) => void; opps: Opp[]; act: DigestActions }) {
  const [sel, setSel] = useState<string[]>([]);
  const [why, setWhy] = useState<Ranked | null>(null);
  const [reply, setReply] = useState<{ o: Opp; text: string } | null>(null);
  const { ws } = useWorkspace();
  const who = { name: fullNameOf(ws, ""), first: firstNameOf(ws, ""), role: roleOf(ws), company: companyOf(ws, ""), region: regionText(ws) };
  const { top, list, rising, rest, all } = d.digest;
  const ten = [...top, ...list];
  const rankOf = (t: Ranked) => ten.findIndex((x) => x.key === t.key) + 1;
  const tick = (t: Ranked) => setSel((s) => (s.includes(t.key) ? s.filter((k) => k !== t.key) : [...s, t.key]));
  const articles = all.reduce((a, t) => a + sourcesOf(t), 0);
  const text = `Discovery Studio digest, week of ${fmt(week)}\n\n${ten.map((t, i) => `${i + 1}. ${t.title} (${t.score})\n   ${reasonOf(t, d)}\n   ${t.move}: ${t.angle || "None given"}`).join("\n")}${rising.length ? `\n\nRising: ${rising.map((r) => r.title).join("; ")}` : ""}`;

  const flags = (t: Ranked, dark: boolean) => {
    const out: [string, "grey" | "dark" | "red" | "deep" | "white"][] = [];
    if (t.crowded) out.push(["Crowded: needs a different angle", "deep"]);
    if (t.posted) out.push(["Posted recently", "white"]);
    if (t.gap) out.push(["AI citations gap", dark ? "white" : "dark"]);
    if (t.due != null) out.push([`Deadline in ${t.due} days`, "red"]);
    if (t.warm >= 2) out.push([`Warm: you know ${t.warm} people here · comment first`, dark ? "white" : "dark"]);
    if (t.competitor) out.push([`Competitor move: ${t.competitor}`, "white"]);
    if (t.service) out.push([t.service, "white"]);
    return out;
  };
  const MergeLine = ({ t }: { t: Ranked }) => {
    if (!t.possibleWith) return null;
    const target = all.find((x) => x.key === t.possibleWith);
    return (
      <span className="flex flex-wrap items-center gap-2 text-[12.5px]"><span className="min-w-0">Possible merge with &ldquo;{target?.title ?? "another topic"}&rdquo;</span>
        {d.editable && <><button type="button" className="btn btn-dark h-7 whitespace-nowrap px-2.5 text-[12px]" onClick={() => act.merge(t)}>Merge</button><button type="button" className="btn h-7 whitespace-nowrap px-2.5 text-[12px]" onClick={() => act.keep(t)}>Keep separate</button></>}</span>
    );
  };
  const How = ({ t, mute }: { t: Ranked; mute: string }) => (t.competitor ? <span className="text-[12.5px] leading-snug"><b>How we see it</b> <span style={{ color: mute }}>· {act.campaignOf(t) ? `Linked to the campaign "${act.campaignOf(t)}"` : "No matching campaign. It goes in as an independent post."}</span></span> : null);

  if (!all.length) return (
    <div className="anim-rise flex flex-col gap-4">
      <div data-tour="dtop" className="rounded-2xl"><WeekBar d={d} week={week} weeks={weeks} setWeek={setWeek} head="No topics yet" sub="The Digest builds from this week's findings once AI search or Crawl has run." copy={null} /></div>
      <Opps d={d} opps={opps} act={act} openReply={(o) => setReply({ o, text: replyDraft({ service: o.f.service, title: o.f.title, ask: o.f.opp.ask ?? o.f.excerpt.slice(0, 160) }, who) })} />
      {reply && <ReplyPanel r={reply} setText={(text) => setReply({ ...reply, text })} onClose={() => setReply(null)} onCopy={() => { act.copy(reply.text, "Reply copied. Send it yourself."); act.replied(reply.o); setReply(null); }} />}
    </div>
  );

  return (
    <div className="anim-rise flex flex-col gap-4">
      <WeekBar d={d} week={week} weeks={weeks} setWeek={setWeek} head={`Top ${ten.length} topics · week of ${fmt(week)}`} sub={`${articles} articles from AI search, Crawl and LinkedIn, merged into ${all.length} topics`} services={servicesLine(ten)} copy={() => act.copy(text, "Digest copied as text")} />
      <div data-tour="dsend" className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-line bg-white px-3.5 py-2.5">
        <span className="min-w-0 flex-1 basis-[260px] text-[13px]"><b>{sel.length ? `${sel.length} selected.` : "Tick topics to send them together."}</b> <span className="text-muted">The angle and post type are decided in Content Studio. The suggested angle comes preselected.</span></span>
        {d.editable && <span className="flex flex-wrap gap-2"><button type="button" className="btn h-[34px]" onClick={() => setSel(top.filter((t) => !act.sentOf(t)).map((t) => t.key))}>Tick top 3</button>
          <button type="button" className="btn btn-primary h-[34px]" disabled={!sel.length} onClick={() => { act.send(ten.filter((t) => sel.includes(t.key) && !act.sentOf(t))); setSel([]); }}>Send selected to Content Studio</button></span>}
      </div>
      <div data-tour="dtop" className="grid gap-3.5 rounded-2xl md:grid-cols-2 xl:grid-cols-3">
        {top.map((t, i) => {
          const dark = i === 0, on = sel.includes(t.key), sent = act.sentOf(t), mute = dark ? "#cfcfcf" : "#5f5f5f", line = dark ? "rgba(255,255,255,.14)" : "#ececec";
          return (
            <article key={t.key} className="flex min-w-0 flex-col gap-2.5 rounded-2xl p-[18px]" style={{ background: dark ? "#141414" : "#fff", color: dark ? "#fff" : "#141414", border: on ? "2px solid #d64545" : dark ? "1px solid #141414" : "1px solid #e8e8e8" }}>
              <span className="flex items-center justify-between gap-2.5">
                <span className="flex items-center gap-2.5">{d.editable && <Box on={on} onClick={() => tick(t)} label={`Select ${t.title}`} />}<span className="num text-[13px]" style={{ color: dark ? "#ff8a80" : "#8c8c8c" }}>#{i + 1}</span></span>
                <span className="flex items-baseline gap-1"><span className="num text-[30px] font-semibold tracking-[-.02em]" style={{ color: dark ? "#fff" : "#d64545" }}>{t.score}</span><span className="text-[11.5px]" style={{ color: mute }}>/ 100</span></span>
              </span>
              <span className="text-[16px] font-[650] leading-snug">{t.title}</span>
              <span className="text-[12.5px] leading-relaxed" style={{ color: mute }}>{reasonOf(t, d)}</span>
              <span className="flex flex-wrap gap-1.5">{flags(t, dark).map(([l, tone]) => <Tag key={l} tone={tone}>{l}</Tag>)}</span>
              <span className="grid grid-cols-3 gap-1.5 py-2.5" style={{ borderTop: `1px solid ${line}`, borderBottom: `1px solid ${line}` }}>
                {([[t.ai, "AI search"], [t.crawl, "Crawl"], [t.li, "LinkedIn"]] as const).map(([n, l]) => <span key={l} className="flex flex-col gap-0.5"><span className="num text-[17px] font-semibold">{n}</span><span className="text-[11.5px]" style={{ color: mute }}>{l}</span></span>)}
              </span>
              <span className="text-[12.5px] leading-snug"><b>{t.move}</b> <span style={{ color: mute }}>· Suggested angle: {t.angle || "None given"}</span></span>
              <How t={t} mute={mute} /><MergeLine t={t} />
              <span className="mt-auto flex flex-wrap gap-2"><button type="button" className="btn h-9 shrink-0 whitespace-nowrap px-3" style={dark ? { background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,.3)" } : undefined} onClick={() => setWhy(t)}>Why it ranks</button>
                {d.editable && <button type="button" className="btn btn-primary h-9 flex-1 basis-[170px] whitespace-nowrap" disabled={sent} onClick={() => act.send([t])}>{sent ? "Sent" : "Send to Content Studio"}</button>}</span>
            </article>
          );
        })}
      </div>
      <aside data-tour="rising" className="grid gap-x-6 gap-y-2.5 rounded-2xl border-2 border-[#d64545] bg-white px-[18px] py-4 md:grid-cols-[minmax(200px,1fr)_minmax(0,3fr)] md:items-start">
        <span className="flex flex-col gap-1"><span className="font-[650]">Rising this week</span><span className="text-[12.5px] leading-snug text-muted">Small topics growing fast in the last 3 days. Crowded topics stay too, marked for a different angle.</span></span>
        <span className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {rising.map((r) => <button key={r.key} type="button" onClick={() => setWhy(r)} className="flex min-w-0 flex-col items-start gap-0.5 rounded-[10px] border border-[#ececec] bg-white px-3 py-2.5 text-left hover:border-ink"><span className="text-[13.5px] font-semibold leading-snug">{r.title}</span><span className="text-[12px] font-semibold text-[#d64545]">+{r.grow} sources in 3 days</span></button>)}
          {!rising.length && <span className="text-[13px] text-muted">None this week.</span>}
        </span>
      </aside>
      <section data-tour="dlist" className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-[18px] py-3.5"><span className="font-semibold">Ranked 4 to 10</span><span className="text-[12px] text-muted">{rest.length ? `${rest.length} more topics stay in Findings` : "The rest stay in Findings"}</span></div>
        {list.map((t, i) => {
          const sent = act.sentOf(t);
          return (
            <div key={t.key} className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 border-t border-[#ececec] px-[18px] py-3.5 hover:bg-[#fafafa] sm:grid-cols-[22px_30px_minmax(0,1fr)_40px_auto] sm:items-center">
              {d.editable ? <Box on={sel.includes(t.key)} onClick={() => tick(t)} label={`Select ${t.title}`} /> : <span />}
              <span className="num hidden text-faint sm:block">#{i + 4}</span>
              <span className="flex min-w-0 flex-col gap-1.5"><span className="text-[13.5px] font-semibold leading-snug"><span className="num mr-1.5 text-faint sm:hidden">#{i + 4}</span>{t.title}</span><span className="text-[12px] leading-snug text-muted">{reasonOf(t, d)}</span><How t={t} mute="#5f5f5f" />
                <span className="flex flex-wrap gap-1.5">{flags(t, false).map(([l, tone]) => <Tag key={l} tone={tone}>{l}</Tag>)}</span><MergeLine t={t} /></span>
              <span className="num text-right text-[18px] font-semibold">{t.score}</span>
              <span className="col-span-3 flex justify-end gap-1.5 sm:col-span-1"><button type="button" className="btn h-8" onClick={() => setWhy(t)}>Why</button>{d.editable && <button type="button" className="btn btn-primary h-8" disabled={sent} onClick={() => act.send([t])}>{sent ? "Sent" : "Send"}</button>}</span>
            </div>
          );
        })}
        {!list.length && <p className="m-0 border-t border-[#ececec] px-[18px] py-4 text-[13px] text-muted">None. Fewer than four topics this week.</p>}
      </section>
      <Opps d={d} opps={opps} act={act} openReply={(o) => setReply({ o, text: replyDraft({ service: o.f.service, title: o.f.title, ask: o.f.opp.ask ?? o.f.excerpt.slice(0, 160) }, who) })} />
      {why && <WhyPanel t={why} d={d} rank={rankOf(why)} sent={act.sentOf(why)} onSend={() => act.send([why])} onClose={() => setWhy(null)} />}
      {reply && <ReplyPanel r={reply} setText={(text) => setReply({ ...reply, text })} onClose={() => setReply(null)} onCopy={() => { act.copy(reply.text, "Reply copied. Send it yourself."); act.replied(reply.o); setReply(null); }} />}
    </div>
  );
}

const fmt = (w: string) => new Date(w + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
function reasonOf(t: Ranked, d: Data) {
  const r = [`${sourcesOf(t)} source${sourcesOf(t) === 1 ? "" : "s"} from ${t.pubs} publisher${t.pubs === 1 ? "" : "s"}`];
  if (t.quality === 5) r.push("regulator-led");
  if (t.ai && t.crawl) r.push("found by AI search and Crawl");
  if (t.gap) r.push("matches an AI citations gap");
  if (t.warm) r.push(`you know ${t.warm} ${t.warm === 1 ? "person" : "people"} there`);
  if (t.due != null) r.push(`deadline in ${t.due} days`);
  void d;
  return r.join(", ") + ".";
}

function WeekBar({ d, week, weeks, setWeek, head, sub, services, copy }: { d: Data; week: string; weeks: string[]; setWeek: (w: string) => void; head: string; sub: string; services?: string; copy: (() => void) | null }) {
  void d;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#141414] px-[18px] py-3.5 text-white">
      <span className="flex min-w-0 flex-1 basis-[300px] flex-col gap-0.5"><span className="text-[15px] font-[650]">{head}</span><span className="text-[12.5px] text-[#cfcfcf]">{sub}</span>{services != null && <span className="text-[12.5px]"><b className="text-[#ff8a80]">Services in the news</b> {services}</span>}</span>
      <span className="flex flex-wrap items-center gap-2">
        {weeks.map((w) => <button key={w} type="button" onClick={() => setWeek(w)} className="h-8 rounded-lg px-3 text-[12.5px] font-semibold text-white" style={{ background: w === week ? "#d64545" : "rgba(255,255,255,.1)" }}>Week of {fmt(w)}</button>)}
        {copy && <button type="button" onClick={copy} className="h-8 rounded-lg border border-white/25 px-3 text-[12.5px] font-semibold text-white hover:bg-white/10">Copy as text</button>}
      </span>
    </div>
  );
}

const OPMETA = { pitch: ["Speaking and pitch", "Calls for speakers, panels, awards and consultations open for comment."], press: ["Journalist and analyst requests", "People asking for expert sources on this profile's topics. Prax drafts a reply; you send it."], sales: ["For sales", "Public tenders and requests for proposals. Never turned into posts."] } as const;
function Opps({ d, opps, act, openReply }: { d: Data; opps: Opp[]; act: DigestActions; openReply: (o: Opp) => void }) {
  return (
    <div data-tour="opps" className="grid gap-3.5 rounded-2xl md:grid-cols-3">
      {(["pitch", "press", "sales"] as const).map((kind) => {
        const dark = kind === "sales", mute = dark ? "#cfcfcf" : "#5f5f5f", line = dark ? "rgba(255,255,255,.14)" : "#ececec";
        const items = opps.filter((o) => o.kind === kind);
        return (
          <section key={kind} className="flex min-w-0 flex-col gap-2.5 rounded-2xl px-[18px] py-4" style={{ background: dark ? "#141414" : "#fff", color: dark ? "#fff" : "#141414", border: `1px solid ${dark ? "#141414" : "#e8e8e8"}` }}>
            <span className="flex flex-col gap-0.5"><span className="font-[650]">{OPMETA[kind][0]}</span><span className="text-[12.5px] leading-snug" style={{ color: mute }}>{OPMETA[kind][1]}</span></span>
            {items.map((o) => {
              const done = !!(o.f.opp as { done?: boolean }).done;
              return (
                <div key={o.f.id} className="flex flex-col gap-1.5 pt-2.5" style={{ borderTop: `1px solid ${line}` }}>
                  <a href={o.f.url.startsWith("linkedin:") ? undefined : o.f.url} target="_blank" rel="noopener noreferrer" className="text-[13.5px] font-semibold leading-snug hover:underline">{o.f.title}</a>
                  <span className="text-[12px]" style={{ color: mute }}>{o.f.publisher}</span>
                  <span className="flex flex-wrap items-center gap-1.5">{o.due != null ? <Tag tone={o.due <= 10 ? "red" : "white"}>{o.due <= 3 ? "Due in" : "Closes in"} {o.due} days</Tag> : <Tag tone="white">No deadline found</Tag>}{o.f.service && <Tag tone="white">{o.f.service}</Tag>}</span>
                  {d.editable && <button type="button" disabled={done} className={`btn h-8 self-start ${kind === "sales" ? "" : "btn-primary"}`} onClick={() => (kind === "press" ? openReply(o) : kind === "sales" ? act.salesCopy(o) : act.pitch(o))}>
                    {kind === "press" ? (done ? "Reply copied" : "Draft a quick reply") : kind === "sales" ? (done ? "Copied for sales" : "Copy for the sales team") : done ? "Added to Today" : "Add pitch to Today"}</button>}
                </div>
              );
            })}
            {!items.length && <span className="pt-2.5 text-[13px]" style={{ color: mute, borderTop: `1px solid ${line}` }}>None found this week.</span>}
          </section>
        );
      })}
    </div>
  );
}

function WhyPanel({ t, d, rank, sent, onSend, onClose }: { t: Ranked; d: Data; rank: number; sent: boolean; onSend: () => void; onClose: () => void }) {
  const parts = priorityParts(t), w = d.settings.priority;
  return (
    <SidePanel width={540} kicker={`${rank > 0 ? `#${rank} this week` : "Rising"} · ${t.pillar || "No pillar"}`} title={t.title} onClose={onClose}>
      <span className="flex items-baseline gap-2"><span className="num text-[34px] font-semibold text-[#d64545]">{t.score}</span><span className="text-[12.5px] text-muted">priority, out of 100</span></span>
      <span className="label text-ink">How the score is made</span>
      {PRIORITY_FACTORS.map(([label, note], i) => (
        <div key={label} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_54px] items-center gap-2.5 text-[13px]">
          <span><b>{label} ({w[i]})</b><span className="block text-[11.5px] leading-snug text-muted">{note}</span></span>
          <span className="block h-2 overflow-hidden rounded-full bg-[#f0f0f0]"><span className="block h-full" style={{ width: `${Math.round(parts[i] * 100)}%`, background: parts[i] >= 0.7 ? "#d64545" : "#141414" }} /></span>
          <span className="num text-right">+{Math.round(parts[i] * w[i] * 10) / 10}</span>
        </div>
      ))}
      {priorityMinus(t, d.settings.penalties).map(([l, p]) => <div key={l} className="flex justify-between gap-2.5 text-[13px] text-[#9e1c1c]"><b>{l}</b><span className="num">{p}</span></div>)}
      <span className="rounded-xl bg-[#141414] px-3.5 py-3 text-[13px] leading-relaxed text-white"><b>{t.move}</b><span className="block text-[#e3e3e3]">Suggested angle: {t.angle || "None given"}</span>{t.crowded && <span className="mt-1 block text-[#ff8a80]">Crowded: take a contrarian or regional line rather than the common one.</span>}</span>
      <span className="label text-ink">{sourcesOf(t)} sources · AI search {t.ai} · Crawl {t.crawl} · LinkedIn {t.li}</span>
      {t.sources.slice(0, 12).map((s) => (
        <div key={s.url} className="flex min-w-0 items-center gap-2 rounded-[10px] border border-[#ececec] px-2.5 py-2 text-[12.5px]">
          <Tag tone={s.via === "AI" ? "dark" : s.via === "Crawl" ? "white" : "red"}>{s.via}</Tag>
          <span className="min-w-0 flex-1 truncate"><b>{s.pub}</b> {s.url.startsWith("linkedin:") ? <span className="text-muted">sent from the Prax bar</span> : <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-ink">{s.url}</a>}</span>
        </div>
      ))}
      {t.sources.length > 12 && <span className="text-[12px] text-muted">And {t.sources.length - 12} more in Findings.</span>}
      {d.editable && <button type="button" className="btn btn-primary h-10" disabled={sent} onClick={onSend}>{sent ? "Sent to Content Studio" : "Send to Content Studio"}</button>}
    </SidePanel>
  );
}

function ReplyPanel({ r, setText, onCopy, onClose }: { r: { o: Opp; text: string }; setText: (t: string) => void; onCopy: () => void; onClose: () => void }) {
  return (
    <SidePanel kicker={`Journalist and analyst request${r.o.due != null ? ` · ${r.o.due <= 3 ? "due in" : "closes in"} ${r.o.due} days` : ""}`} title={r.o.f.title} onClose={onClose}>
      {(r.o.f.opp.ask || r.o.f.excerpt) && <span className="text-[12.5px] leading-relaxed text-muted">They asked: &ldquo;{(r.o.f.opp.ask || r.o.f.excerpt).slice(0, 300)}&rdquo;</span>}
      <label className="sr-only" htmlFor="reply">Reply draft</label>
      <textarea id="reply" className="field min-h-[220px] text-[13.5px] leading-relaxed" value={r.text} onChange={(e) => setText(e.target.value)} />
      <span className="text-[12px] text-muted">Prax only copies the reply. You send it yourself, from your own email or LinkedIn.</span>
      <button type="button" className="btn btn-primary h-10" onClick={onCopy}>Copy reply</button>
    </SidePanel>
  );
}
