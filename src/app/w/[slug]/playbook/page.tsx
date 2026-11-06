"use client";
// Playbook (S5): Strategy and Notes in one section, as two tabs. The Strategy tab is the workflow canvas and the
// Notes tab the team's shared notes, each unchanged; ?tab=notes opens Notes, and /strategy and /notes redirect here.
import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Section, type TabDef, type TourStep } from "@/components/shell";
import { playbookTab, playbookQuery } from "@/lib/shell";
import { useStrategyTab } from "@/components/playbook/strategy-tab";
import { useNotesTab } from "@/components/playbook/notes-tab";

export default function Playbook() {
  const router = useRouter();
  const path = usePathname();
  const tab = playbookTab(useSearchParams().get("tab"));
  const strategy = useStrategyTab();
  const notes = useNotesTab();
  const onTab = useCallback((t: string) => router.replace(path + playbookQuery(playbookTab(t)), { scroll: false }), [router, path]);

  const tabs: TabDef[] = [{ id: "strategy", label: "Strategy" }, { id: "notes", label: "Notes", count: notes.count }];
  // A short tour across both tabs; the Strategy steps only when there is a canvas to show.
  const steps = useMemo<TourStep[]>(() => [
    { target: "header", title: "The plan and the notes", body: "Playbook holds the Strategy canvas that runs Prax and the notes the team shares. Switch between them with the tabs." },
    ...(strategy.hasStrategy ? [
      { target: "switcher", title: "Strategies", body: "Keep several strategies and set one active. Drafts change nothing until they are set active; then their values are written to the settings.", tab: "strategy" },
      { target: "canvas", title: "The canvas", body: "Each node is one part of the plan, and saving a settings node changes it where Prax uses it. A condition forks into Yes and No lanes. Drag to move, Ctrl or Cmd and the wheel to zoom, the plus to insert.", tab: "strategy" },
    ] : []),
    { target: "notes", title: "Notes", body: "A shared scratchpad. Each note shows who wrote it and when.", tab: "notes" },
  ], [strategy.hasStrategy]);

  const s = tab === "strategy";
  return (
    <Section id="playbook" title="Playbook" wide={s} tabs={tabs} tab={tab} onTab={onTab} steps={steps}
      status={s ? strategy.status : notes.status} entryStatus={s ? strategy.entryStatus : notes.entryStatus}
      before={s ? strategy.before : undefined} primary={s ? strategy.primary : undefined} actions={s ? undefined : notes.actions}>
      {s ? strategy.body : notes.body}
    </Section>
  );
}
