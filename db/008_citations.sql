-- AI citations, automated: each buyer question is asked through an AI model's API with web search on, from the
-- user's browser with the user's own key. Prax stores the full answer and its sources; named, linked and ranked
-- are worked out on the page from the alias lists, so editing an alias re-scores every past run. Re-runnable.

alter table citation_questions add column if not exists language text not null default 'English';
alter table citation_questions add column if not exists status text not null default 'active';
do $$ begin
  alter table citation_questions add constraint citation_questions_status check (status in ('active','suggested','archived'));
exception when duplicate_object then null; end $$;

-- Who is tracked: this profile and its company ('self'), and a short list of competitors.
create table if not exists citation_entities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  kind text not null default 'competitor' check (kind in ('self','competitor')),
  name text not null,
  aliases text[] not null default '{}',   -- matched as whole words in the answer text
  domains text[] not null default '{}',   -- owned hosts, or host plus path (linkedin.com/in/slug)
  sort int not null default 0,
  created_at timestamptz default now()
);

-- One question asked once on one engine.
create table if not exists citation_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  question_id uuid references citation_questions(id) on delete cascade,
  engine text not null check (engine in ('claude','openai','gemini','perplexity')),
  model text not null default '',
  web_search boolean not null default true,
  status text not null check (status in ('ok','failed','no_sources')),
  error text not null default '',
  answer text not null default '',
  question_text text not null default '',  -- the exact prompt sent, region hint included
  region text not null default '',
  language text not null default '',
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  run_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists citation_runs_latest on citation_runs(workspace_id, question_id, engine, run_at desc);

create table if not exists citation_sources (
  id bigserial primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  run_id uuid references citation_runs(id) on delete cascade,
  url text not null,
  title text not null default '',
  domain text not null default '',
  cited boolean not null default false,    -- cited in the answer text, not only retrieved by the search
  sort int not null default 0
);
create index if not exists citation_sources_run on citation_sources(run_id);

do $$ declare t text; begin
  foreach t in array array['citation_entities','citation_runs','citation_sources'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists r on %I', t);
    execute format('drop policy if exists w on %I', t);
    execute format('create policy r on %I for select using (has_role(workspace_id, ''viewer''))', t);
    execute format('create policy w on %I for all using (has_role(workspace_id, ''editor'')) with check (has_role(workspace_id, ''editor''))', t);
  end loop;
end $$;

select 'ok' as status, (select count(*) from citation_questions) as questions;
