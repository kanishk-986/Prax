"use client";
// The full lead page, opened from "Full view" in the lead panel. Data and actions are the Pipeline screen's own.
import { use } from "react";
import { LeadPage } from "@/components/pipeline/lead-page";
import { usePipeline } from "@/components/pipeline/use-pipeline";

export default function LeadRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, api } = usePipeline();
  return <LeadPage id={id} data={data} api={api} />;
}
