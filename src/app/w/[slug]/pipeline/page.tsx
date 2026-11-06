"use client";
// Pipeline: the screen (src/components/pipeline/screen.tsx) with its data and actions from Supabase
// (src/components/pipeline/use-pipeline.ts).
import { PipelineScreen } from "@/components/pipeline/screen";
import { usePipeline } from "@/components/pipeline/use-pipeline";

export default function PipelinePage() {
  const { data, api } = usePipeline();
  return <PipelineScreen data={data} api={api} />;
}
