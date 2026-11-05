// What the Pipeline screen reads and the actions it can take. The page wires these to Supabase; keeping them
// behind one interface means the screen never talks to the database directly.
import type { Person } from "@/lib/network";
import type { Pipeline, Prospect, StageMove, MoveInput } from "@/lib/pipeline";

export type LeadComment = { id: string; prospect_id: string | null; author: string; reply: boolean; day: string };
export type Member = { user_id: string; email: string };
export type DayItem = { id: string; day: string; kind: string; title: string; done: boolean; note: string; done_at: string | null; created_at: string };
export type Note = { id: string; author_email: string; body: string; created_at: string };
export type LeadDetail = { moves: StageMove[]; items: DayItem[]; notes: Note[] };

export type PipelineData = {
  /** false until db/015 has run: one Outreach pipeline, no lost reasons table, history from the activity feed. */
  ready: boolean;
  loading: boolean;
  leads: Prospect[];
  pipes: Pipeline[];
  reasons: string[];
  members: Member[];
  comments: LeadComment[];
  network: Person[];
};

export type Result<T = null> = { ok: true; value: T } | { ok: false; error: string };

export type PipelineApi = {
  /** Saves fields on one lead (optimistic). */
  update: (id: string, patch: Partial<Prospect>) => Promise<Result>;
  /** A stage move or a Done; logged in the history. Returns the undo. */
  move: (lead: Prospect, m: MoveInput, p: Pipeline) => Promise<Result<() => Promise<void>>>;
  add: (rows: Partial<Prospect>[]) => Promise<Result<string[]>>;
  remove: (ids: string[]) => Promise<Result>;
  /** Marks network people as now in the pipeline. */
  linkNetwork: (pairs: { key: string; prospectId: string }[]) => Promise<void>;
  createPipeline: (p: Omit<Pipeline, "id">) => Promise<Result<Pipeline>>;
  deletePipeline: (id: string) => Promise<Result>;
  /** Order and new stages are saved as given; renames go through rename_pipeline_stage first. */
  saveStages: (p: Pipeline, stages: string[], renames: [string, string][]) => Promise<Result>;
  addReason: (label: string) => Promise<Result>;
  detail: (lead: Prospect) => Promise<LeadDetail>;
  /** Puts one touch-plan step on Today, or ticks it there. */
  step: (lead: Prospect, key: string, title: string, done: boolean | null) => Promise<Result>;
  addNote: (lead: Prospect, body: string) => Promise<Result>;
  /** An AI draft through the extension; the key stays in the browser. */
  draft: (prompt: string) => Promise<string>;
};
