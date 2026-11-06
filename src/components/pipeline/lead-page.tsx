"use client";
// The full lead page (/w/[slug]/pipeline/[id]): the lead panel's parts in the same order (next action and its
// buttons, the stage bar, then timeline, warm path, touch plan, heat, notes, message and details), all open, on a
// page of its own so it can be linked and kept open. Moves go through the same dialog as on the Pipeline screen.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { useWorkspace, today as todayYmd } from "@/lib/workspace";
import { isClosed, fmtShort, type Prospect } from "@/lib/pipeline";
import { Section } from "@/components/shell";
import { useToast, haptic } from "@/components/toaster";
import { LeadPanel } from "./lead-panel";
import { MoveDialog } from "./panels";
import { useLeadInfo } from "./screen";
import type { PipelineApi, PipelineData } from "./types";

export function LeadPage({ id, data, api }: { id: string; data: PipelineData; api: PipelineApi }) {
  const { ws, can } = useWorkspace();
  const editable = can("editor");
  const router = useRouter();
  const toast = useToast();
  const info = useLeadInfo(data, todayYmd());
  const [move, setMove] = useState<string | null>(null);
  const [logged, setLogged] = useState(0);
  const lead = data.leads.find((l) => l.id === id) ?? null;
  const pipeOf = useCallback((l: Prospect) => (data.ready ? data.pipes.find((p) => p.id === l.pipeline_id) ?? data.pipes[0] : data.pipes[0]), [data.ready, data.pipes]);
  const back = `/w/${ws.slug}/pipeline`;
  const backLink = <Link href={back} className="btn h-10 px-3.5"><ChevronLeft size={14} /> Pipeline</Link>;

  if (data.loading) return (
    <Section id="pipeline-lead" title="Lead" status="Loading" actions={backLink}>
      <div className="flex flex-col gap-3" aria-busy="true">{[120, 40, 260].map((h, i) => <div key={i} className="animate-pulse rounded-2xl bg-[#ececec]" style={{ height: h }} />)}</div>
    </Section>
  );
  if (!lead) return (
    <Section id="pipeline-lead" title="Lead not found" status="It may have been deleted, or it belongs to another profile." actions={backLink}>
      <p className="panel px-[18px] py-4 text-body text-muted">Nobody in Pipeline matches this link. <Link href={back} className="font-medium text-ink underline underline-offset-[3px]">Back to Pipeline</Link></p>
    </Section>
  );
  const pipe = pipeOf(lead);
  return (
    <Section id="pipeline-lead" title={lead.name} status={[lead.role, lead.company, `${lead.stage} in ${pipe.name}`].filter(Boolean).join(" · ")}
      actions={<>{backLink}{lead.linkedin && <a href={lead.linkedin} target="_blank" rel="noopener noreferrer" className="btn h-10 px-3.5">LinkedIn <ExternalLink size={14} /></a>}</>}>
      <div className="w-full max-w-[860px]">
        <LeadPanel page lead={lead} pipe={pipe} info={info.get(lead.id)} data={data} api={api} onMove={(to) => { if (editable) setMove(to); }}
          onClose={() => router.push(back)} dialogOpen={!!move} logged={logged} />
      </div>
      {move && <MoveDialog lead={lead} pipe={pipe} to={move} reasons={data.reasons} onCancel={() => setMove(null)}
        onConfirm={async (m) => {
          const stay = m.to === lead.stage;
          setMove(null);
          const r = await api.move(lead, m, pipe);
          if (!r.ok) { toast(r.error); return; }
          haptic(10); setLogged((n) => n + 1);
          const when = isClosed(pipe, m.to) ? `Check in on ${fmtShort(m.date)}.` : `Next action is on Today for ${fmtShort(m.date)}.`;
          toast(stay ? `Logged. ${when}` : `${lead.name} moved to ${m.to}. ${when}`, () => { r.value().then(() => setLogged((n) => n + 1)); });
        }} />}
    </Section>
  );
}
