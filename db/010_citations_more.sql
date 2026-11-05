-- AI citations, complete: question sets, repeats, tone and fact checks, a facts sheet, recommendations with lift,
-- and expiring view-only share links. Alerts are worked out on the page from stored runs. Run after 009. Re-runnable.

create table if not exists citation_sets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  name text not null,
  sort int not null default 0,
  created_at timestamptz default now()
);

alter table citation_questions add column if not exists set_id uuid references citation_sets(id) on delete set null;
alter table citation_questions add column if not exists repeats int not null default 1;
alter table citation_questions add column if not exists source text not null default 'manual';   -- manual, starter or ai
alter table citation_questions add column if not exists campaign_id uuid references campaigns(id) on delete set null;
do $$ begin
  alter table citation_questions add constraint citation_questions_repeats check (repeats between 1 and 3);
exception when duplicate_object then null; end $$;

-- Each repeat of a question in one batch is its own run; tone and wrong facts come from the AI check when it has run.
alter table citation_runs add column if not exists repeat_index int not null default 0;
alter table citation_runs add column if not exists sentiment text not null default '';
alter table citation_runs add column if not exists fact_issues jsonb not null default '[]';
alter table citation_runs add column if not exists judged_at timestamptz;

-- The true facts AI answers are checked against: titles, company, products, licences, regions, founding year.
create table if not exists citation_facts (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  facts jsonb not null default '{}',
  updated_at timestamptz default now()
);

create table if not exists citation_recs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  kind text not null check (kind in ('profile','elsewhere')),
  title text not null,
  detail text not null default '',
  question_ids uuid[] not null default '{}',
  status text not null default 'open' check (status in ('open','accepted','done','dismissed')),
  baseline jsonb,                       -- named and total on the target questions when accepted
  accepted_at timestamptz,
  post_id uuid references posts(id) on delete set null,
  created_at timestamptz default now()
);

do $$ declare t text; begin
  foreach t in array array['citation_sets','citation_facts','citation_recs'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists r on %I', t);
    execute format('drop policy if exists w on %I', t);
    execute format('create policy r on %I for select using (has_role(workspace_id, ''viewer''))', t);
    execute format('create policy w on %I for all using (has_role(workspace_id, ''editor'')) with check (has_role(workspace_id, ''editor''))', t);
  end loop;
end $$;
do $$ begin alter publication supabase_realtime add table citation_sets; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table citation_recs; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table citation_questions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table citation_entities; exception when duplicate_object then null; end $$;

-- View-only share links. Only the sha256 of the token is stored; the report is a snapshot taken when the link is made.
create table if not exists citation_shares (
  token_hash text primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  snapshot jsonb not null default '{}',
  expires_at timestamptz not null,
  revoked boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);
alter table citation_shares enable row level security;
drop policy if exists r on citation_shares; drop policy if exists w on citation_shares;
create policy r on citation_shares for select using (has_role(workspace_id, 'editor'));
create policy w on citation_shares for all using (has_role(workspace_id, 'editor')) with check (has_role(workspace_id, 'editor'));

-- Anyone holding a live token reads that one snapshot and nothing else.
create or replace function citation_share(tok text) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select s.snapshot || jsonb_build_object('expires_at', s.expires_at, 'profile', (select name from workspaces where id = s.workspace_id))
  from citation_shares s
  where s.token_hash = encode(extensions.digest(tok, 'sha256'), 'hex') and not s.revoked and s.expires_at > now()
$$;
grant execute on function citation_share(text) to anon, authenticated;

select 'ok' as status;
