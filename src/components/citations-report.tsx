"use client";
// The AI citations report: plain language, printable, and the same view a share link shows.
// It renders a snapshot only, so a share link never reaches live data or anything else in Prax.
import { ProviderMark } from "@/components/provider-mark";
import { providerOf } from "@/lib/providers";

export type ReportSnapshot = {
  generated_at: string;
  name: string;
  headline: { named: number; linked: number; total: number };
  engines: { name: string; named: number; total: number }[];
  linkedin: number;
  changes: string[];
  alerts: string[];
  gaps: { domain: string; competitors: string[] }[];
  leaderboard: { name: string; named: number; total: number; you: boolean }[];
  recs: { kind: string; title: string; status: string; lift: string }[];
  profile?: string;
};

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} percent` : "no usable answers");

export function ReportView({ r, expires }: { r: ReportSnapshot; expires?: string }) {
  const day = new Date(r.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const top = r.leaderboard[0];
  // Who the report is about: the tracked self row's name in the snapshot, else the profile name.
  const you = r.leaderboard.find((x) => x.you)?.name || r.name;
  return (
    <article className="mx-auto max-w-[760px] bg-white px-6 py-8 text-[14px] leading-relaxed text-[#141414]" style={{ fontFamily: "var(--font-sans, system-ui)" }}>
      <h1 className="text-[26px] font-semibold tracking-tight">{r.name}</h1>
      <p className="text-[13px] text-[#5f5f5f]"><b className="font-semibold text-[#141414]">AI citations report</b>, {day}. Every answer comes from each model&apos;s API with web search on: close to, not the same as, what someone sees in the app.{expires ? ` This view-only link expires ${new Date(expires).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.` : ""}</p>

      <h2 className="mt-6 text-[16px] font-semibold">Where things stand</h2>
      <p>AI tools named {you} in <b>{r.headline.named} of {r.headline.total}</b> answers ({pct(r.headline.named, r.headline.total)}), and linked to owned sites in {r.headline.linked}. Questions that already name {you} and runs that failed are left out. The LinkedIn profile was cited {r.linkedin} time{r.linkedin === 1 ? "" : "s"}.</p>
      <table className="mt-3 w-full border-collapse text-[13px]">
        <thead><tr className="bg-[#141414] text-left text-[12px] text-white"><th className="px-3 py-2">Engine</th><th className="px-3 py-2">Named</th></tr></thead>
        <tbody>{r.engines.map((e) => <tr key={e.name} className="border-t border-[#ececec]"><td className="px-3 py-2 font-medium">{providerOf(e.name) ? <ProviderMark id={providerOf(e.name)!.id} /> : e.name}</td><td className="px-3 py-2">{e.total ? `${e.named} of ${e.total}` : "Not run"}</td></tr>)}</tbody>
      </table>

      {r.leaderboard.length > 1 && <>
        <h2 className="mt-6 text-[16px] font-semibold">Against competitors</h2>
        <p>{top?.you ? `${you} is named most often on these questions.` : top ? `${top.name} is named most often (${top.named} of ${top.total}).` : ""}</p>
        <ul className="mt-2 grid gap-1">{r.leaderboard.map((x) => <li key={x.name}><b>{x.name}</b>{x.you ? " (you)" : ""}: {x.named} of {x.total}</li>)}</ul>
      </>}

      {(r.changes.length > 0 || r.alerts.length > 0) && <>
        <h2 className="mt-6 text-[16px] font-semibold">What changed</h2>
        <ul className="mt-2 grid list-disc gap-1 pl-5">{[...r.alerts, ...r.changes].slice(0, 12).map((x, i) => <li key={i}>{x}</li>)}</ul>
      </>}

      {r.gaps.length > 0 && <>
        <h2 className="mt-6 text-[16px] font-semibold">Where competitors get cited and {you} does not</h2>
        <ul className="mt-2 grid list-disc gap-1 pl-5">{r.gaps.slice(0, 8).map((g) => <li key={g.domain}><b>{g.domain}</b>, cited with {g.competitors.join(", ")}</li>)}</ul>
      </>}

      {r.recs.length > 0 && <>
        <h2 className="mt-6 text-[16px] font-semibold">What we are doing about it</h2>
        <ul className="mt-2 grid gap-1.5">{r.recs.slice(0, 10).map((x, i) => <li key={i}><b>{x.kind === "profile" ? "On the profile" : "Elsewhere"}:</b> {x.title} <span className="text-[#5f5f5f]">({x.status}{x.lift ? `, ${x.lift}` : ""})</span></li>)}</ul>
      </>}

      {r.profile && <><h2 className="mt-6 text-[16px] font-semibold">The LinkedIn profile</h2><p>{r.profile}</p></>}
    </article>
  );
}
